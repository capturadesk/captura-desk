const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Storage } = require("../electron/storage.cjs");
const { AIService } = require("../electron/ai/service.cjs");
const { Providers } = require("../electron/ai/providers.cjs");
const contracts = require("../electron/ai/contracts.cjs");
const secure = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from("encrypted:" + Buffer.from(s).toString("base64")),
  decryptString: (b) => Buffer.from(b.toString().slice(10), "base64").toString(),
};
const outputFor = (captures) => ({
  title: "Generated task",
  description: "A grounded draft",
  steps: captures.map((c) => ({
    captureId: c.id,
    title: "Select the action",
    description: "Verify the resulting screen.",
    needsReview: true,
  })),
});
async function fixture(t, providers) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capturadesk-ai-"));
  const storage = new Storage(root);
  t.after(() => {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  storage.initialize([
    {
      id: "p",
      name: "Project",
      description: "",
      instructions: "Use concise numbered steps",
      documents: [],
    },
  ]);
  const session = storage.createSession(
    { projectId: "p", name: "Task", context: "Task context" },
    { name: "Display", id: "1" },
  );
  const captures = [];
  for (let i = 0; i < 2; i++) {
    const id = storage.addCapture(session.id, i + 1, {
      clickedAt: Date.now(),
      button: 1,
      point: { x: 0.5, y: 0.5 },
    });
    await storage.saveFrame(id, "before", {
      png: Buffer.from("fixture"),
      capturedAt: Date.now(),
      width: 10,
      height: 10,
    });
    captures.push(id);
  }
  storage.sessionStatus(session.id, "complete");
  const ai = new AIService(
    storage,
    secure,
    () => "anBlZw==",
    providers || {
      generate: async ({ captures }) => outputFor(captures),
      models: async () => ["fixture-model"],
    },
  );
  ai.saveKey("openai", "test-only-key");
  const input = {
    workspaceId: "personal",
    projectId: "p",
    guideId: session.id,
    provider: "openai",
    model: "fixture-model",
    captureIds: [captures[0]],
  };
  return { storage, ai, input, captures, session, root };
}

test("credentials never leave service as plaintext; unavailable encryption fails closed", async (t) => {
  const { ai, storage } = await fixture(t);
  assert.equal(ai.connections().providers[0].connected, true);
  assert.ok(!JSON.stringify(ai.connections()).includes("test-only-key"));
  assert.ok(
    !storage.db
      .prepare("SELECT encrypted FROM ai_credentials")
      .get()
      .encrypted.includes("test-only-key"),
  );
  assert.equal(ai.key("openai"), "test-only-key");
  const unavailable = new AIService(
    storage,
    { isEncryptionAvailable: () => false },
    () => "",
  );
  assert.throws(() => unavailable.saveKey("anthropic", "test-only-key"), /unavailable/);
  const plaintext = new AIService(
    storage,
    { ...secure, getSelectedStorageBackend: () => "basic_text" },
    () => "",
  );
  assert.throws(() => plaintext.saveKey("anthropic", "test-only-key"), /unavailable/);
  ai.removeKey("openai");
  assert.throws(() => ai.key("openai"), /Connect/);
});

test("only selected captures are sent; draft survives restart and saves a separate document", async (t) => {
  let sent;
  const f = await fixture(t, {
    generate: async (input) => {
      sent = input;
      return outputFor(input.captures);
    },
  });
  const original = f.storage.loadWorkspace()[0].documents[0];
  const draft = await f.ai.generate(f.input);
  assert.deepEqual(
    sent.captures.map((c) => c.id),
    [f.captures[0]],
  );
  assert.equal(sent.context.projectInstructions, "Use concise numbered steps");
  assert.deepEqual(f.storage.loadWorkspace()[0].documents, [original]);
  f.ai.saveDefaults({
    workspaceId: "personal",
    provider: "openai",
    model: "fixture-model",
  });
  const reopened = new Storage(f.root);
  try {
    const ai = new AIService(reopened, secure, () => "");
    assert.equal(ai.defaults("personal").model, "fixture-model");
    assert.equal(ai.list(f.input)[0].id, draft.id);
    const result = ai.apply({ workspaceId: "personal", draftId: draft.id });
    assert.equal(result.projects[0].documents.length, 2);
    assert.deepEqual(result.projects[0].documents[0], original);
    assert.equal(result.projects[0].documents[1].steps.length, 1);
    assert.equal(result.projects[0].documents[1].steps[0].captureId, f.captures[0]);
    assert.match(result.projects[0].documents[1].steps[0].description, /Review needed/);
  } finally {
    reopened.close();
  }
});

test("rejects duplicate/foreign captures and stale drafts without changing documents", async (t) => {
  const { ai, input, storage } = await fixture(t);
  await assert.rejects(
    ai.generate({ ...input, captureIds: [randomUUID()] }),
    /belonging/,
  );
  await assert.rejects(
    ai.generate({ ...input, captureIds: [...input.captureIds, ...input.captureIds] }),
    /unique/,
  );
  const draft = await ai.generate(input);
  const projects = storage.loadWorkspace();
  projects[0].documents[0].title = "Manual edit";
  storage.saveWorkspace(projects);
  assert.throws(
    () => ai.apply({ workspaceId: "personal", draftId: draft.id }),
    /changed/,
  );
  assert.equal(storage.loadWorkspace()[0].documents.length, 1);
  storage.createWorkspace("Other");
  assert.throws(() => ai.list(input), /Switch/);
});

test("cancel aborts an in-flight request and leaves no draft", async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const f = await fixture(t, {
    generate: ({ signal }) =>
      new Promise((resolve, reject) => {
        started();
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  });
  const pending = f.ai.generate(f.input);
  await ready;
  await assert.rejects(f.ai.generate(f.input), /already running/);
  f.ai.cancel();
  await assert.rejects(pending, /canceled/);
  assert.equal(f.ai.busy, false);
  assert.equal(f.ai.list(f.input).length, 0);
  assert.equal(f.storage.loadWorkspace()[0].documents.length, 1);
});

test("deletion cascades AI drafts and workspace defaults while preserving global credentials", async (t) => {
  const f = await fixture(t);
  await f.ai.generate(f.input);
  f.ai.saveDefaults({
    workspaceId: "personal",
    provider: "openai",
    model: "fixture-model",
  });
  await f.storage.deleteRecording("personal", "p", f.session.id);
  assert.equal(f.storage.db.prepare("SELECT COUNT(*) AS n FROM ai_drafts").get().n, 0);
  f.storage.createWorkspace("Other");
  await f.storage.deleteWorkspace("personal");
  assert.equal(f.storage.db.prepare("SELECT COUNT(*) AS n FROM ai_workspace").get().n, 0);
  assert.equal(f.ai.connections().providers[0].connected, true);
});

for (const provider of ["openai", "anthropic"]) {
  test(`${provider}: structured vision request, no tools, validated evidence IDs`, async () => {
    const id = randomUUID();
    let request;
    const adapter = new Providers(async (url, options) => {
      request = { url, ...options, payload: JSON.parse(options.body) };
      const text = JSON.stringify({
        title: "Task",
        description: "Draft",
        steps: {
          capture_1: {
            title: "Select the action",
            description: "Check the screen",
            needsReview: true,
          },
        },
      });
      return {
        ok: true,
        json: async () =>
          provider === "openai"
            ? {
                status: "completed",
                output: [{ content: [{ type: "output_text", text }] }],
              }
            : { stop_reason: "end_turn", content: [{ type: "text", text }] },
      };
    });
    const result = await adapter.generate({
      provider,
      key: "fake",
      model: "fixture-model",
      context: { task: "Task" },
      captures: [{ id, frames: [{ kind: "before", data: "anBlZw==" }] }],
    });
    assert.equal(result.steps[0].captureId, id);
    assert.equal(request.redirect, "error");
    assert.equal(request.payload.tools, undefined);
    if (provider === "openai") {
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      assert.equal(request.payload.store, false);
      assert.equal(request.payload.text.format.strict, true);
      assert.ok(request.payload.input[0].content.some((p) => p.type === "input_image"));
    } else {
      assert.equal(request.url, "https://api.anthropic.com/v1/messages");
      assert.equal(request.headers["anthropic-version"], "2023-06-01");
      assert.equal(request.payload.output_config.format.type, "json_schema");
      assert.ok(request.payload.messages[0].content.some((p) => p.type === "image"));
    }
  });
}

test("provider errors are sanitized; invalid and mismatched results are rejected", async () => {
  const captures = [{ id: randomUUID(), frames: [] }];
  const input = {
    provider: "openai",
    key: "secret",
    model: "test",
    context: {},
    captures,
  };
  const bad = new Providers(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "secret private content" }),
  }));
  await assert.rejects(
    bad.generate(input),
    (error) =>
      /API key was rejected/.test(error.message) && !/secret|private/.test(error.message),
  );
  for (const text of [
    "invalid json",
    JSON.stringify(outputFor([{ id: randomUUID() }])),
  ]) {
    const adapter = new Providers(async () => ({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [{ content: [{ type: "output_text", text }] }],
      }),
    }));
    await assert.rejects(adapter.generate(input), /invalid draft/);
  }
  assert.throws(() => contracts.generate.parse({ ...input, captureIds: [] }));
});

test("v3 migration preserves existing recordings and adds empty AI tables", async (t) => {
  const f = await fixture(t);
  const original = f.storage.loadWorkspace();
  f.storage.db.exec(
    "DROP TABLE ai_drafts; DROP TABLE ai_workspace; DROP TABLE ai_credentials; PRAGMA user_version=3;",
  );
  const reopened = new Storage(f.root);
  try {
    assert.equal(reopened.db.prepare("PRAGMA user_version").get().user_version, 4);
    assert.deepEqual(reopened.loadWorkspace(), original);
    for (const table of ["ai_drafts", "ai_workspace", "ai_credentials"])
      assert.equal(reopened.db.prepare("SELECT COUNT(*) AS n FROM " + table).get().n, 0);
  } finally {
    reopened.close();
  }
});

test("refusal and incomplete provider responses never become drafts", async () => {
  const input = {
    key: "fake",
    model: "test",
    context: {},
    captures: [{ id: randomUUID(), frames: [] }],
  };
  for (const [provider, result] of [
    ["openai", { status: "incomplete", output: [] }],
    ["anthropic", { stop_reason: "max_tokens", content: [] }],
  ]) {
    const adapter = new Providers(async () => ({ ok: true, json: async () => result }));
    await assert.rejects(adapter.generate({ ...input, provider }), /did not finish/);
  }
  const refused = new Providers(async () => ({
    ok: true,
    json: async () => ({
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "Cannot help" }] }],
    }),
  }));
  await assert.rejects(
    refused.generate({ ...input, provider: "openai" }),
    /invalid draft/,
  );
});

for (const provider of ["openai", "anthropic"]) {
  test(`${provider}: required capture slots map shuffled response keys to original evidence`, async () => {
    for (const count of [1, 2, 20]) {
      const captures = Array.from({ length: count }, () => ({
        id: randomUUID(),
        frames: [
          { kind: "before", data: "anBlZw==" },
          { kind: "after", data: "anBlZw==" },
        ],
      }));
      const adapter = new Providers(async (url, options) => {
        const body = JSON.parse(options.body);
        const schema =
          provider === "openai"
            ? body.text.format.schema
            : body.output_config.format.schema;
        const slots = captures.map((_, i) => `capture_${i + 1}`);
        assert.equal(schema.properties.steps.type, "object");
        assert.deepEqual(schema.properties.steps.required, slots);
        assert.equal(schema.properties.steps.additionalProperties, false);
        const content =
          provider === "openai" ? body.input[0].content : body.messages[0].content;
        const metadata = content.flatMap((p) => {
          try {
            const value = JSON.parse(p.text);
            return value.captureSlot ? [value] : [];
          } catch {
            return [];
          }
        });
        assert.deepEqual(
          metadata.map((p) => p.captureSlot),
          slots,
        );
        assert.ok(
          captures.every((c) => !options.body.includes(c.id)),
          "Real UUIDs are not requested from the model",
        );
        const text = JSON.stringify({
          title: "Task",
          description: "Draft",
          steps: Object.fromEntries(
            [...slots]
              .reverse()
              .map((slot) => [
                slot,
                { title: slot, description: "Observed action", needsReview: false },
              ]),
          ),
        });
        return {
          ok: true,
          json: async () =>
            provider === "openai"
              ? {
                  status: "completed",
                  output: [{ content: [{ type: "output_text", text }] }],
                }
              : { stop_reason: "end_turn", content: [{ type: "text", text }] },
        };
      });
      const result = await adapter.generate({
        provider,
        key: "fake",
        model: "fixture",
        context: {},
        captures,
      });
      assert.deepEqual(
        result.steps.map((s) => s.captureId),
        captures.map((c) => c.id),
      );
      assert.deepEqual(
        result.steps.map((s) => s.title),
        captures.map((_, i) => `capture_${i + 1}`),
      );
    }
  });
  test(`${provider}: missing, extra and malformed slots cannot be attached to captures`, async () => {
    const step = { title: "Action", description: "Details", needsReview: false };
    for (const steps of [
      { capture_1: step },
      { capture_1: step, capture_2: step, capture_3: step },
      { capture_1: step, capture_2: { ...step, captureId: randomUUID() } },
      { capture_1: step, capture_2: { ...step, title: "" } },
      [step, step],
    ]) {
      const text = JSON.stringify({ title: "Task", description: "Draft", steps });
      const adapter = new Providers(async () => ({
        ok: true,
        json: async () =>
          provider === "openai"
            ? {
                status: "completed",
                output: [{ content: [{ type: "output_text", text }] }],
              }
            : { stop_reason: "end_turn", content: [{ type: "text", text }] },
      }));
      await assert.rejects(
        adapter.generate({
          provider,
          key: "fake",
          model: "fixture",
          context: {},
          captures: [
            { id: randomUUID(), frames: [] },
            { id: randomUUID(), frames: [] },
          ],
        }),
        /incomplete or invalid draft/,
      );
    }
  });
}

test("text refinement preserves all steps, sends current edits, and never reads images", async (t) => {
  let sent;
  const f = await fixture(t, {
    generate: async (input) => {
      sent = input;
      return outputFor(input.captures);
    },
  });
  const projects = f.storage.loadWorkspace();
  projects[0].documents[0].steps[0].description = "My manually edited explanation";
  f.storage.saveWorkspace(projects);
  const original = f.storage.loadWorkspace()[0].documents[0];
  f.storage.image = () => {
    throw Error("Images must not be read");
  };
  f.ai.prepareImage = () => {
    throw Error("Images must not be prepared");
  };
  const draft = await f.ai.refine({ ...f.input, instruction: "Make this shorter" });
  assert.equal(sent.mode, "refine");
  assert.equal(sent.context.editRequest, "Make this shorter");
  assert.equal(
    sent.context.currentSteps[0].description,
    "My manually edited explanation",
  );
  assert.deepEqual(
    sent.captures.map((c) => c.id),
    f.captures,
  );
  assert.ok(sent.captures.every((c) => c.frames.length === 0));
  assert.deepEqual(f.storage.loadWorkspace()[0].documents, [original]);
  const result = f.ai.apply({ workspaceId: "personal", draftId: draft.id });
  assert.deepEqual(result.projects[0].documents[0], original);
  assert.deepEqual(
    result.projects[0].documents[1].steps.map((s) => s.captureId),
    f.captures,
  );
  await assert.rejects(f.ai.refine({ ...f.input, instruction: "   " }));
  await assert.rejects(f.ai.refine({ ...f.input, instruction: "x".repeat(4001) }));
});

for (const provider of ["openai", "anthropic"]) {
  test(`${provider}: refinement request contains document text and no images`, async () => {
    const id = randomUUID();
    const adapter = new Providers(async (url, options) => {
      const body = JSON.parse(options.body);
      assert.match(body.instructions || body.system, /Revise the supplied document/);
      const content =
        provider === "openai" ? body.input[0].content : body.messages[0].content;
      assert.ok(content.every((p) => p.type === "text" || p.type === "input_text"));
      assert.equal(JSON.parse(content[0].text).editRequest, "Make this shorter");
      const text = JSON.stringify({
        title: "Short task",
        description: "Shorter",
        steps: {
          capture_1: { title: "Action", description: "Details", needsReview: false },
        },
      });
      return {
        ok: true,
        json: async () =>
          provider === "openai"
            ? {
                status: "completed",
                output: [{ content: [{ type: "output_text", text }] }],
              }
            : { stop_reason: "end_turn", content: [{ type: "text", text }] },
      };
    });
    const result = await adapter.generate({
      provider,
      key: "fake",
      model: "fixture",
      mode: "refine",
      context: {
        editRequest: "Make this shorter",
        currentSteps: [
          { captureSlot: "capture_1", title: "Action", description: "Long details" },
        ],
      },
      captures: [{ id, frames: [] }],
    });
    assert.equal(result.steps[0].captureId, id);
  });
}

test("deleting a revision preserves originals, sibling revisions and captures across stale saves and restart", async (t) => {
  const f = await fixture(t);
  f.storage.saveWorkspace(f.storage.loadWorkspace());
  const draft = await f.ai.generate(f.input);
  const first = f.ai.apply({ workspaceId: "personal", draftId: draft.id });
  const second = f.ai.apply({ workspaceId: "personal", draftId: draft.id });
  const stale = f.storage.loadWorkspace();
  const childDraft = await f.ai.refine({
    ...f.input,
    guideId: first.guideId,
    instruction: "Shorten",
  });
  assert.throws(
    () => f.storage.deleteDocument("personal", "p", f.session.id),
    /original recording/,
  );
  assert.throws(
    () => f.storage.deleteDocument("personal", "missing", first.guideId),
    /not found/,
  );
  const result = f.storage.deleteDocument("personal", "p", first.guideId);
  assert.deepEqual(
    result.projects[0].documents.map((d) => d.id),
    [f.session.id, second.guideId],
  );
  assert.equal(
    f.storage.db.prepare("SELECT id FROM ai_drafts WHERE id=?").get(childDraft.id),
    undefined,
  );
  assert.equal(
    (await f.storage.image(f.captures[0], "before")).dataUrl.startsWith("data:image/"),
    true,
  );
  assert.equal(f.storage.capture(f.captures[0]).session_id, f.session.id);
  f.storage.saveWorkspace(stale);
  const reopened = new Storage(f.root);
  try {
    assert.deepEqual(reopened.loadWorkspace()[0].documents, result.projects[0].documents);
  } finally {
    reopened.close();
  }
});

test("revision numbers survive deletion and restart; refinement labels and parents stay separate from titles", async (t) => {
  const f = await fixture(t);
  const draft = await f.ai.generate(f.input);
  const first = f.ai.apply({ workspaceId: "personal", draftId: draft.id });
  const one = first.projects[0].documents.at(-1);
  assert.equal(one.revision, 1);
  assert.equal(one.revisionLabel, "AI draft");
  assert.equal(one.basedOnRevision, 0);
  assert.ok(one.createdAt > 0);
  const edit = await f.ai.refine({
    ...f.input,
    guideId: one.id,
    instruction: "Make this shorter",
  });
  const two = f.ai
    .apply({ workspaceId: "personal", draftId: edit.id })
    .projects[0].documents.at(-1);
  assert.equal(two.revision, 2);
  assert.equal(two.revisionLabel, "Make this shorter");
  assert.equal(two.basedOnRevision, 1);
  assert.equal(two.title, "Generated task");
  f.storage.deleteDocument("personal", "p", two.id);
  const reopened = new Storage(f.root);
  try {
    const ai = new AIService(reopened, secure, () => "");
    const three = ai
      .apply({ workspaceId: "personal", draftId: draft.id })
      .projects[0].documents.at(-1);
    assert.equal(three.revision, 3);
    assert.equal(three.basedOnRevision, 0);
  } finally {
    reopened.close();
  }
});

test("saved screenshot edits feed AI image preparation; rendering failure blocks upload", async (t) => {
  let uploads = 0;
  const f = await fixture(t, {
    generate: async ({ captures }) => {
      uploads++;
      return outputFor(captures);
    },
  });
  const boxes = [{ kind: "redact", x: 0, y: 0, width: 0.5, height: 0.5 }];
  f.storage.saveAnnotations({ id: f.captures[0], frame: "before", boxes });
  await assert.rejects(f.ai.generate(f.input), /Cannot render/);
  assert.equal(uploads, 0);
  f.storage.renderAnnotations = (png, received) => {
    assert.deepEqual(received, boxes);
    assert.equal(png.toString(), "fixture");
    return Buffer.from("redacted");
  };
  f.ai.prepareImage = (url) => {
    assert.equal(Buffer.from(url.split(",")[1], "base64").toString(), "redacted");
    return "anBlZw==";
  };
  await f.ai.generate(f.input);
  assert.equal(uploads, 1);
  const original = await f.storage.image(f.captures[0], "before", true);
  assert.equal(
    Buffer.from(original.dataUrl.split(",")[1], "base64").toString(),
    "fixture",
  );
  const reopened = new Storage(f.root);
  try {
    assert.deepEqual(
      JSON.parse(reopened.capture(f.captures[0]).metadata).annotations.before,
      boxes,
    );
  } finally {
    reopened.close();
  }
});
