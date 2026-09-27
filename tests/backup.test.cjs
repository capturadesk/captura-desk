const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Storage } = require("../electron/storage.cjs");
const { AIService } = require("../electron/ai/service.cjs");
const { createBackup, restoreBackup } = require("../electron/backup.cjs");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
);
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "captura-backup-"));
  const s = new Storage(root);
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  s.initialize([
    { id: "p", name: "Project", description: "", instructions: "Concise", documents: [] },
  ]);
  const session = s.createSession(
    { projectId: "p", name: "Workflow", context: "" },
    { id: "1", name: "Display 1" },
  );
  const id = s.addCapture(session.id, 1, {
    clickedAt: Date.now(),
    button: 1,
    point: { x: 0.5, y: 0.5 },
    application: "Notepad",
  });
  await s.saveFrame(id, "before", { png, capturedAt: Date.now(), width: 1, height: 1 });
  s.sessionStatus(session.id, "complete");
  s.loadWorkspace();
  s.saveAnnotations({
    id,
    frame: "before",
    boxes: [{ kind: "redact", x: 0, y: 0, width: 1, height: 1 }],
  });
  s.db
    .prepare("INSERT INTO ai_credentials VALUES(?,?)")
    .run("openai", "SECRET-NEVER-BACK-UP");
  s.db
    .prepare("INSERT INTO ai_workspace VALUES(?,?,?)")
    .run("personal", "openai", "fixture");
  const guide = s.loadWorkspace()[0].documents[0];
  const output = {
    title: "Draft",
    description: "Summary",
    steps: [
      { captureId: id, title: "Click", description: "Details", needsReview: false },
    ],
    revisionLabel: "AI draft",
  };
  const draft = require("node:crypto").randomUUID();
  s.db
    .prepare("INSERT INTO ai_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      draft,
      "personal",
      "p",
      guide.id,
      session.id,
      "openai",
      "fixture",
      Date.now(),
      JSON.stringify(guide),
      JSON.stringify(output),
      "v2-capture-slots",
    );
  const ai = new AIService(s, {}, () => {});
  const revision = ai.apply({ workspaceId: "personal", draftId: draft });
  s.deleteDocument("personal", "p", revision.guideId); // Highest number must survive deletion.
  return { s, id, session, draft };
}
test("backup restores screenshots, annotations, drafts and revision counters without credentials or overwriting data", async (t) => {
  const { s, id, session } = await fixture(t);
  const original = s.loadWorkspace();
  const bytes = createBackup(s, "personal");
  assert.ok(!bytes.includes("SECRET-NEVER-BACK-UP"));
  const restored = restoreBackup(s, bytes);
  assert.notEqual(restored.catalog.activeId, "personal");
  assert.deepEqual(s.loadWorkspace("personal"), original);
  const guide = restored.projects[0].documents[0];
  assert.notEqual(guide.sessionId, session.id);
  assert.notEqual(guide.steps[0].captureId, id);
  const image = await s.image(guide.steps[0].captureId, "before", true);
  assert.deepEqual(Buffer.from(image.dataUrl.split(",")[1], "base64"), png);
  assert.equal(image.metadata.annotations.before[0].kind, "redact");
  const ai = new AIService(s, {}, () => {});
  assert.equal(ai.defaults(restored.catalog.activeId).model, "fixture");
  const drafts = ai.list({
    workspaceId: restored.catalog.activeId,
    projectId: "p",
    guideId: guide.id,
  });
  assert.equal(drafts.length, 1);
  const saved = ai.apply({
    workspaceId: restored.catalog.activeId,
    draftId: drafts[0].id,
  });
  assert.equal(saved.projects[0].documents.at(-1).revision, 2);
  const again = restoreBackup(s, bytes);
  assert.notEqual(again.catalog.activeId, restored.catalog.activeId);
  assert.equal(new Set(s.catalog().workspaces.map((w) => w.name)).size, 3);
  const reopened = new Storage(s.root);
  try {
    assert.equal(
      reopened.loadWorkspace(restored.catalog.activeId)[0].documents.length,
      2,
    );
  } finally {
    reopened.close();
  }
});
test("corrupt images, foreign references and future backup versions are rejected before writes", async (t) => {
  const { s } = await fixture(t);
  const backup = JSON.parse(createBackup(s, "personal"));
  const catalog = s.catalog();
  const files = fs.readdirSync(s.images);
  for (const change of [
    (b) => (b.version = 999),
    (b) => (b.captures[0].before.hash = "0".repeat(64)),
    (b) =>
      (b.projects[0].documents[0].steps[0].captureId =
        require("node:crypto").randomUUID()),
    (b) =>
      (b.captures[0].metadata = JSON.stringify({
        annotations: { before: [{ kind: "redact", x: -1, y: 0, width: 1, height: 1 }] },
      })),
  ]) {
    const bad = structuredClone(backup);
    change(bad);
    assert.throws(() => restoreBackup(s, Buffer.from(JSON.stringify(bad))));
    assert.deepEqual(s.catalog(), catalog);
    assert.deepEqual(fs.readdirSync(s.images), files);
  }
});
test("failed restore rolls back workspace rows and copied images", async (t) => {
  const { s } = await fixture(t);
  const bytes = createBackup(s, "personal"),
    catalog = s.catalog(),
    files = fs.readdirSync(s.images);
  const save = s.saveWorkspace;
  s.saveWorkspace = () => {
    throw Error("Simulated save failure");
  };
  try {
    assert.throws(() => restoreBackup(s, bytes), /Simulated/);
  } finally {
    s.saveWorkspace = save;
  }
  assert.deepEqual(s.catalog(), catalog);
  assert.deepEqual(fs.readdirSync(s.images), files);
});
