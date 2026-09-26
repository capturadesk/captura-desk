const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Storage } = require("../electron/storage.cjs");
const { workspace } = require("../electron/contracts.cjs");
const project = {
  id: "p",
  name: "Project",
  description: "",
  instructions: "Numbered steps",
  documents: [],
};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capturadesk-test-"));
  const storage = new Storage(root);
  t.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  storage.initialize([project]);
  return storage;
}
test("SQLite schema is versioned, workspace validation rejects malformed data", (t) => {
  const s = fixture(t);
  assert.equal(s.db.prepare("PRAGMA user_version").get().user_version, 3);
  assert.throws(() => s.saveWorkspace([{ id: "../escape" }]));
  assert.throws(() => workspace.parse([project, project]));
  assert.equal(s.loadWorkspace()[0].name, "Project");
});

test("workspaces isolate projects, recordings, and delayed saves and persist selection", (t) => {
  const s = fixture(t);
  const a = s.activeWorkspaceId();
  const session = s.createSession(
    { projectId: "p", name: "Personal task", context: "" },
    { id: "1", name: "Display" },
  );
  s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  s.sessionStatus(session.id, "complete");
  const second = s.createWorkspace("Client work");
  const b = second.catalog.activeId;
  assert.deepEqual(second.projects, []);
  s.saveWorkspace([{ ...project, name: "Client project" }], b);
  s.saveWorkspace([{ ...project, name: "Personal project" }], a);
  assert.equal(s.loadWorkspace()[0].name, "Client project");
  assert.equal(s.loadWorkspace()[0].documents.length, 0);
  assert.equal(s.loadWorkspace(a)[0].documents.length, 1);
  assert.throws(() => s.createWorkspace(" client WORK "), /already exists/);
  assert.throws(() => s.selectWorkspace("missing"), /not found/);
  assert.equal(s.catalog().activeId, b);
  s.selectWorkspace(a);
  assert.equal(s.loadWorkspace()[0].name, "Personal project");
});

test("workspace settings validate names and deletion preserves other workspaces across restart", async (t) => {
  const s = fixture(t);
  const personal = s.activeWorkspaceId();
  await assert.rejects(s.deleteWorkspace(personal), /last workspace/);
  const second = s.createWorkspace("Client").catalog.activeId;
  s.renameWorkspace(second, "  Client operations  ");
  assert.equal(
    s.catalog().workspaces.find((w) => w.id === second).name,
    "Client operations",
  );
  assert.throws(() => s.renameWorkspace(second, "personal WORKSPACE"), /already exists/);
  assert.throws(() => s.renameWorkspace(second, " "));
  s.saveWorkspace([project]);
  const stale = s.loadWorkspace();
  const session = s.createSession(
    { projectId: "p", name: "Task", context: "" },
    { id: "1", name: "Display" },
  );
  const capture = s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  await s.saveFrame(capture, "before", {
    png: Buffer.from("png"),
    capturedAt: Date.now(),
    width: 10,
    height: 10,
  });
  await assert.rejects(s.deleteWorkspace(second), /Finish/);
  s.sessionStatus(session.id, "complete");
  const result = await s.deleteWorkspace(second);
  assert.equal(result.cleanupPending, false);
  assert.equal(result.catalog.activeId, personal);
  assert.equal(result.projects[0].name, project.name);
  assert.equal(fs.existsSync(path.join(s.images, `${capture}-before.png`)), false);
  assert.throws(() => s.capture(capture), /not found/);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE workspace_id=?").get(second).n,
    0,
  );
  assert.throws(() => s.saveWorkspace(stale, second), /not found/);
  const reopened = new Storage(s.root);
  try {
    assert.equal(reopened.catalog().activeId, personal);
    assert.equal(reopened.catalog().workspaces.length, 1);
    assert.equal(reopened.loadWorkspace()[0].name, project.name);
  } finally {
    reopened.close();
  }
});

test("workspace deletion rolls back metadata and cleanup queue on failure", async (t) => {
  const s = fixture(t);
  const second = s.createWorkspace("Client").catalog.activeId;
  s.saveWorkspace([project]);
  const session = s.createSession(
    { projectId: "p", name: "Task", context: "" },
    { id: "1", name: "Display" },
  );
  const capture = s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  s.sessionStatus(session.id, "complete");
  s.db.exec(
    "CREATE TRIGGER fail_delete BEFORE DELETE ON workspaces BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;",
  );
  await assert.rejects(s.deleteWorkspace(second), /simulated failure/);
  assert.equal(s.catalog().activeId, second);
  assert.equal(s.capture(capture).session_id, session.id);
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM pending_file_deletions").get().n,
    0,
  );
  assert.equal(s.loadWorkspace()[0].documents.length, 1);
});

test("deleting the last project removes original files and source rows without resurrection", async (t) => {
  const s = fixture(t);
  const old = s.loadWorkspace();
  const a = s.activeWorkspaceId();
  const session = s.createSession(
    { projectId: "p", name: "Task", context: "" },
    { id: "1", name: "Display" },
  );
  const id = s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  await s.saveFrame(id, "before", {
    png: Buffer.from("png"),
    capturedAt: Date.now(),
    width: 10,
    height: 10,
  });
  await assert.rejects(s.deleteProject(a, "p"), /Finish/);
  s.sessionStatus(session.id, "complete");
  const b = s.createWorkspace("Other").catalog.activeId;
  s.saveWorkspace([{ ...project, name: "Keep me" }], b);
  const result = await s.deleteProject(a, "p");
  assert.deepEqual(result.projects, []);
  assert.equal(result.cleanupPending, false);
  assert.equal(fs.existsSync(path.join(s.images, `${id}-before.png`)), false);
  assert.throws(() => s.capture(id), /not found/);
  s.saveWorkspace(old, a);
  assert.deepEqual(s.loadWorkspace(a), []);
  assert.equal(s.loadWorkspace(b)[0].name, "Keep me");
});

test("recording deletion removes every source capture, survives stale saves and restart, and isolates workspaces", async (t) => {
  const s = fixture(t);
  const workspaceId = s.activeWorkspaceId();
  const session = s.createSession(
    { projectId: "p", name: "Delete me", context: "" },
    { id: "1", name: "Display" },
  );
  const id = s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  await s.saveFrame(id, "before", {
    png: Buffer.from("png"),
    capturedAt: Date.now(),
    width: 10,
    height: 10,
  });
  s.sessionStatus(session.id, "complete");
  const stale = s.loadWorkspace();
  const edited = structuredClone(stale);
  edited[0].documents[0].steps = [];
  s.saveWorkspace(edited);
  const keep = s.createSession(
    { projectId: "p", name: "Keep me", context: "" },
    { id: "1", name: "Display" },
  );
  s.sessionStatus(keep.id, "complete");
  const other = s.createWorkspace("Other").catalog.activeId;
  s.saveWorkspace([
    {
      ...project,
      documents: [
        { id: session.id, title: "Unrelated", description: "", steps: [], demo: true },
      ],
    },
  ]);
  await assert.rejects(s.deleteRecording(other, "missing", session.id), /not found/);
  const result = await s.deleteRecording(workspaceId, "p", session.id);
  assert.equal(result.cleanupPending, false);
  assert.equal(fs.existsSync(path.join(s.images, `${id}-before.png`)), false);
  assert.throws(() => s.capture(id), /not found/);
  assert.equal(
    s.db.prepare("SELECT id FROM sessions WHERE id=?").get(session.id),
    undefined,
  );
  s.saveWorkspace(stale, workspaceId);
  assert.deepEqual(
    s.loadWorkspace(workspaceId)[0].documents.map((d) => d.id),
    [keep.id],
  );
  assert.equal(s.loadWorkspace(other)[0].documents.length, 1);
  const reopened = new Storage(s.root);
  try {
    assert.deepEqual(
      reopened.loadWorkspace(workspaceId)[0].documents.map((d) => d.id),
      [keep.id],
    );
  } finally {
    reopened.close();
  }
});

test("version-one migration preserves existing projects, instructions, and session ownership", (t) => {
  const { DatabaseSync } = require("node:sqlite");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "captura-migration-"));
  const db = new DatabaseSync(path.join(root, "workspace.sqlite"));
  db.exec(`CREATE TABLE workspace(id INTEGER PRIMARY KEY,data TEXT NOT NULL);
  CREATE TABLE sessions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,name TEXT NOT NULL,context TEXT NOT NULL,instructions TEXT NOT NULL,display TEXT NOT NULL,started_at INTEGER NOT NULL,status TEXT NOT NULL,error TEXT);
  CREATE TABLE captures(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),sequence INTEGER NOT NULL,metadata TEXT NOT NULL,before_file TEXT,after_file TEXT,error TEXT);
  PRAGMA user_version=1;`);
  db.prepare("INSERT INTO workspace VALUES(1,?)").run(JSON.stringify([project]));
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?)").run(
    "a190a54d-bfb2-4ed1-a51e-a2439cd5c12a",
    "p",
    "Old recording",
    "",
    "Preserve these instructions",
    '{"name":"Display"}',
    1,
    "complete",
    null,
  );
  db.close();
  const s = new Storage(root);
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  assert.equal(s.catalog().activeId, "personal");
  assert.equal(s.loadWorkspace()[0].instructions, project.instructions);
  assert.equal(
    s.db.prepare("SELECT workspace_id FROM sessions").get().workspace_id,
    "personal",
  );
  assert.equal(s.loadWorkspace()[0].documents[0].title, "Old recording");
});
test("captures persist with image metadata and recover interrupted sessions without duplicates", async (t) => {
  const s = fixture(t);
  const session = s.createSession(
    { projectId: "p", name: "Task", context: "" },
    { id: "1", name: "Display 1" },
  );
  const id = s.addCapture(session.id, 1, {
    clickedAt: Date.now(),
    button: 1,
    point: { x: 0.5, y: 0.5 },
  });
  await s.saveFrame(id, "before", {
    png: Buffer.from("png"),
    capturedAt: Date.now(),
    width: 200,
    height: 100,
  });
  s.sessionStatus(session.id, "interrupted");
  const data = s.loadWorkspace();
  assert.equal(data[0].documents.length, 1);
  assert.equal(data[0].documents[0].recovered, true);
  assert.equal(s.loadWorkspace()[0].documents.length, 1);
  assert.equal((await s.image(id, "before")).metadata.before.width, 200);
  data[0].documents[0].steps[0].description = "Edited";
  s.saveWorkspace(data);
  assert.equal(s.loadWorkspace()[0].documents[0].steps[0].description, "Edited");
  assert.throws(() => s.capture("../../secret"));
  await assert.rejects(s.saveFrame(id, "invalid", {}));
});
test("source captures remain intact after removing a document step", (t) => {
  const s = fixture(t);
  const session = s.createSession(
    { projectId: "p", name: "Task", context: "" },
    { id: "1", name: "Display" },
  );
  const id = s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  s.sessionStatus(session.id, "complete");
  const data = s.loadWorkspace();
  data[0].documents[0].steps = [];
  s.saveWorkspace(data);
  assert.equal(s.loadWorkspace()[0].documents[0].steps.length, 0);
  assert.equal(s.capture(id).session_id, session.id);
});
test("reopening database recovers pending sessions and incomplete captures", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capturadesk-recovery-"));
  let s = new Storage(root);
  s.initialize([project]);
  const session = s.createSession(
    { projectId: "p", name: "Interrupted", context: "" },
    { id: "1", name: "Display" },
  );
  s.addCapture(session.id, 1, { clickedAt: Date.now(), button: 1 });
  s.close();
  s = new Storage(root);
  t.after(() => {
    s.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const doc = s.loadWorkspace()[0].documents[0];
  assert.equal(doc.recovered, true);
  assert.equal(doc.steps.length, 1);
});
