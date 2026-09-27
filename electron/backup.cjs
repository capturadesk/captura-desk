const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { z } = require("zod");
const c = require("./contracts.cjs");
const ai = require("./ai/contracts.cjs");
const LIMIT = 256 * 1024 * 1024;
const text = z.string().max(200000);
const image = z
  .object({ data: z.string().max(LIMIT), hash: z.string().regex(/^[a-f0-9]{64}$/) })
  .nullable();
const schema = z
  .object({
    format: z.literal("captura-desk-workspace"),
    version: z.literal(1),
    name: z.string().min(1).max(80),
    projects: c.workspace,
    sessions: z
      .array(
        z.object({
          id: c.uuid,
          project_id: c.id,
          name: text,
          context: text,
          instructions: text,
          display: text,
          started_at: z.number(),
          status: z.enum(["complete", "interrupted"]),
          error: text.nullable(),
          counter: z.number().int().nonnegative(),
        }),
      )
      .max(10000),
    captures: z
      .array(
        z.object({
          id: c.uuid,
          session_id: c.uuid,
          sequence: z.number().int().positive(),
          metadata: text,
          error: text.nullable(),
          before: image,
          after: image,
        }),
      )
      .max(50000),
    defaults: z.object({ provider: ai.provider, model: ai.model }).nullable(),
    drafts: z
      .array(
        z.object({
          id: c.uuid,
          project_id: c.id,
          guide_id: c.id,
          session_id: c.uuid,
          provider: ai.provider,
          model: ai.model,
          created_at: z.number(),
          source: z.string().max(LIMIT),
          output: z.string().max(LIMIT),
          prompt_version: z.string().max(120),
        }),
      )
      .max(20000),
  })
  .strict();
const hash = (b) => createHash("sha256").update(b).digest("hex");
function createBackup(storage, workspaceId) {
  storage.requireWorkspace(workspaceId);
  const projects = storage.loadWorkspace(workspaceId) || [];
  const sessions = storage.db
    .prepare("SELECT * FROM sessions WHERE workspace_id=?")
    .all(workspaceId)
    .map(({ workspace_id, ...s }) => ({
      ...s,
      counter: Number(
        storage.db
          .prepare("SELECT value FROM settings WHERE key=?")
          .get("revision_counter:" + s.id)?.value || 0,
      ),
    }));
  let bytes = 0;
  const captures = storage.db
    .prepare(
      "SELECT c.* FROM captures c JOIN sessions s ON s.id=c.session_id WHERE s.workspace_id=?",
    )
    .all(workspaceId)
    .map(({ before_file, after_file, ...row }) => {
      const read = (file) => {
        if (!file) return null;
        if (path.basename(file) !== file) throw Error("Invalid screenshot path");
        const full = path.join(storage.images, file);
        bytes += fs.statSync(full).size;
        if (bytes > LIMIT / 2)
          throw Error("Workspace exceeds the backup limit (128 MiB of screenshots).");
        const png = fs.readFileSync(full);
        return { data: png.toString("base64"), hash: hash(png) };
      };
      return { ...row, before: read(before_file), after: read(after_file) };
    });
  const backup = {
    format: "captura-desk-workspace",
    version: 1,
    name: storage.catalog().workspaces.find((w) => w.id === workspaceId).name,
    projects,
    sessions,
    captures,
    defaults:
      storage.db
        .prepare("SELECT provider,model FROM ai_workspace WHERE workspace_id=?")
        .get(workspaceId) || null,
    drafts: storage.db
      .prepare(
        "SELECT id,project_id,guide_id,session_id,provider,model,created_at,source,output,prompt_version FROM ai_drafts WHERE workspace_id=?",
      )
      .all(workspaceId),
  };
  schema.parse(backup);
  const result = Buffer.from(JSON.stringify(backup));
  if (result.length > LIMIT)
    throw Error("Workspace exceeds the backup size limit (256 MiB).");
  return result;
}
function restoreBackup(storage, buffer) {
  if (buffer.length > LIMIT) throw Error("Backup exceeds the 256 MiB limit.");
  let data;
  try {
    data = schema.parse(JSON.parse(buffer.toString("utf8")));
  } catch {
    throw Error("Invalid or unsupported Captura Desk backup.");
  }
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const captures = new Map(data.captures.map((c) => [c.id, c]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  if (sessions.size !== data.sessions.length || captures.size !== data.captures.length)
    throw Error("Duplicate backup identifiers.");
  const sequences = new Set();
  for (const session of data.sessions) {
    if (!projects.has(session.project_id)) throw Error("Invalid session project.");
    JSON.parse(session.display);
  }
  for (const capture of data.captures) {
    if (!sessions.has(capture.session_id)) throw Error("Invalid capture session.");
    const sequence = capture.session_id + ":" + capture.sequence;
    if (sequences.has(sequence)) throw Error("Duplicate capture sequence.");
    sequences.add(sequence);
    const metadata = JSON.parse(capture.metadata);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
      throw Error("Invalid capture metadata.");
    for (const frame of ["before", "after"]) {
      if (metadata.annotations?.[frame])
        c.annotationSave.parse({
          id: capture.id,
          frame,
          boxes: metadata.annotations[frame],
        });
      const image = capture[frame];
      if (image) {
        const png = Buffer.from(image.data, "base64");
        if (
          png.toString("base64") !== image.data ||
          hash(png) !== image.hash ||
          png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
        )
          throw Error("A backup screenshot is damaged.");
      }
    }
  }
  function validateGuide(guide, projectId) {
    if (guide.sessionId && sessions.get(guide.sessionId)?.project_id !== projectId)
      throw Error("Invalid document session.");
    for (const step of guide.steps)
      for (const id of new Set([
        ...(step.captureIds || []),
        ...(step.captureId ? [step.captureId] : []),
      ])) {
        if (!guide.sessionId || captures.get(id)?.session_id !== guide.sessionId)
          throw Error("Invalid document capture.");
      }
  }
  for (const project of data.projects)
    for (const guide of project.documents) validateGuide(guide, project.id);
  for (const draft of data.drafts) {
    if (sessions.get(draft.session_id)?.project_id !== draft.project_id)
      throw Error("Invalid draft session.");
    // Drafts whose source document was deleted are not restorable.
    if (!projects.get(draft.project_id)?.documents.some((g) => g.id === draft.guide_id))
      throw Error("Invalid draft source.");
    const source = c.workspace.parse([
      {
        id: "validation",
        name: "Validation",
        description: "",
        instructions: "",
        documents: [JSON.parse(draft.source)],
      },
    ])[0].documents[0];
    validateGuide(source, draft.project_id);
    if (source.id !== draft.guide_id || source.sessionId !== draft.session_id)
      throw Error("Invalid draft source identity.");
    const output = JSON.parse(draft.output);
    const { revisionLabel, ...prose } = output;
    ai.output.parse(prose);
    if (
      revisionLabel !== undefined &&
      (typeof revisionLabel !== "string" || revisionLabel.length > 120)
    )
      throw Error("Invalid revision label.");
    const evidence = new Set(
      source.steps.flatMap((step) => step.captureIds || [step.captureId]),
    );
    if (
      output.steps.some((s) =>
        [...(s.captureIds || []), s.captureId].some((id) => !evidence.has(id)),
      )
    )
      throw Error("Invalid draft captures.");
  }
  const workspaceId = randomUUID();
  const sessionIds = new Map(data.sessions.map((s) => [s.id, randomUUID()]));
  const captureIds = new Map(data.captures.map((c) => [c.id, randomUUID()]));
  function remapGuide(guide) {
    return {
      ...guide,
      id: sessionIds.get(guide.id) || guide.id,
      sessionId: guide.sessionId ? sessionIds.get(guide.sessionId) : undefined,
      steps: guide.steps.map((s) => ({
        ...s,
        id: captureIds.get(s.id) || s.id,
        captureId: s.captureId ? captureIds.get(s.captureId) : undefined,
        captureIds: s.captureIds?.map((id) => captureIds.get(id)),
      })),
    };
  }
  const restored = data.projects.map((p) => ({
    ...p,
    documents: p.documents.map(remapGuide),
  }));
  let name = data.name.slice(0, 60) + " (restored)";
  const names = new Set(storage.catalog().workspaces.map((w) => w.name.toLowerCase()));
  for (let i = 2; names.has(name.toLowerCase()); i++)
    name = data.name.slice(0, 60) + " (restored " + i + ")";
  const written = [];
  storage.db.exec("BEGIN IMMEDIATE");
  try {
    storage.db
      .prepare("INSERT INTO workspaces VALUES(?,?,?)")
      .run(workspaceId, name, JSON.stringify(restored));
    for (const s of data.sessions) {
      storage.db
        .prepare(
          "INSERT INTO sessions(id,project_id,name,context,instructions,display,started_at,status,error,workspace_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          sessionIds.get(s.id),
          s.project_id,
          s.name,
          s.context,
          s.instructions,
          s.display,
          s.started_at,
          s.status,
          s.error,
          workspaceId,
        );
      storage.db
        .prepare("INSERT INTO settings VALUES(?,?)")
        .run("revision_counter:" + sessionIds.get(s.id), String(s.counter));
    }
    for (const c of data.captures) {
      const id = captureIds.get(c.id),
        files = {};
      for (const frame of ["before", "after"]) {
        files[frame] = null;
        if (c[frame]) {
          const name = id + "-" + frame + ".png";
          const full = path.join(storage.images, name);
          const fd = fs.openSync(full, "wx");
          written.push(full);
          try {
            fs.writeFileSync(fd, Buffer.from(c[frame].data, "base64"));
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
          files[frame] = name;
        }
      }
      storage.db
        .prepare(
          "INSERT INTO captures(id,session_id,sequence,metadata,before_file,after_file,error) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          sessionIds.get(c.session_id),
          c.sequence,
          c.metadata,
          files.before,
          files.after,
          c.error,
        );
    }
    if (data.defaults)
      storage.db
        .prepare("INSERT INTO ai_workspace VALUES(?,?,?)")
        .run(workspaceId, data.defaults.provider, data.defaults.model);
    for (const d of data.drafts) {
      const output = JSON.parse(d.output);
      output.steps = output.steps.map((s) => ({
        ...s,
        captureId: captureIds.get(s.captureId),
        captureIds: s.captureIds?.map((id) => captureIds.get(id)),
      }));
      storage.db
        .prepare("INSERT INTO ai_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          workspaceId,
          d.project_id,
          sessionIds.get(d.guide_id) || d.guide_id,
          sessionIds.get(d.session_id),
          d.provider,
          d.model,
          d.created_at,
          JSON.stringify(remapGuide(JSON.parse(d.source))),
          JSON.stringify(output),
          d.prompt_version,
        );
    }
    storage.saveWorkspace(restored, workspaceId);
    storage.db.exec("COMMIT");
  } catch (error) {
    storage.db.exec("ROLLBACK");
    for (const file of written) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    throw error;
  }
  return storage.selectWorkspace(workspaceId);
}
module.exports = { createBackup, restoreBackup, LIMIT };
