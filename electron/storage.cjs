const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const contracts = require("./contracts.cjs");

class Storage {
  constructor(root) {
    this.root = root;
    this.images = path.join(root, "captures");
    fs.mkdirSync(this.images, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "workspace.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (version > 4)
      throw new Error("This workspace requires a newer version of Captura Desk.");
    if (version === 0)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, context TEXT NOT NULL, instructions TEXT NOT NULL, display TEXT NOT NULL, started_at INTEGER NOT NULL, status TEXT NOT NULL, error TEXT);
      CREATE TABLE captures (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), sequence INTEGER NOT NULL, metadata TEXT NOT NULL, before_file TEXT, after_file TEXT, error TEXT, UNIQUE(session_id,sequence));
      CREATE INDEX captures_session ON captures(session_id, sequence);
      PRAGMA user_version=1; COMMIT;`);
    if (version < 2)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,data TEXT);
      INSERT INTO workspaces(id,name,data) VALUES('personal','Personal workspace',(SELECT data FROM workspace WHERE id=1));
      CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO settings VALUES('active_workspace','personal');
      ALTER TABLE sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'personal';
      CREATE TABLE deleted_projects(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(workspace_id,project_id));
      CREATE TABLE pending_file_deletions(filename TEXT PRIMARY KEY);
      DROP TABLE workspace;
      PRAGMA user_version=2; COMMIT;`);
    if (version < 3)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE deleted_recordings(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,guide_id TEXT NOT NULL,session_id TEXT,PRIMARY KEY(workspace_id,project_id,guide_id));
      PRAGMA user_version=3; COMMIT;`);
    if (version < 4)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE ai_credentials(provider TEXT PRIMARY KEY,encrypted TEXT NOT NULL);
      CREATE TABLE ai_workspace(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,provider TEXT NOT NULL,model TEXT NOT NULL);
      CREATE TABLE ai_drafts(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,project_id TEXT NOT NULL,guide_id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,provider TEXT NOT NULL,model TEXT NOT NULL,created_at INTEGER NOT NULL,source TEXT NOT NULL,output TEXT NOT NULL,prompt_version TEXT NOT NULL);
      PRAGMA user_version=4; COMMIT;`);
    this.db
      .prepare(
        "UPDATE sessions SET status='interrupted',error='Recording was interrupted. Saved captures have been recovered.' WHERE status IN ('recording','paused','starting','stopping')",
      )
      .run();
    this.db
      .prepare(
        "UPDATE captures SET error='Screenshot was not committed before the recording was interrupted.' WHERE before_file IS NULL AND after_file IS NULL AND error IS NULL AND session_id IN (SELECT id FROM sessions WHERE status='interrupted')",
      )
      .run();
    // A crash between writing an image and committing its row can leave an
    // unreferenced file. Keep it for recovery rather than deleting user data.
  }
  activeWorkspaceId() {
    return this.db
      .prepare("SELECT value FROM settings WHERE key='active_workspace'")
      .get().value;
  }
  catalog() {
    return {
      activeId: this.activeWorkspaceId(),
      workspaces: this.db.prepare("SELECT id,name FROM workspaces ORDER BY rowid").all(),
    };
  }
  requireWorkspace(id) {
    contracts.id.parse(id);
    if (!this.db.prepare("SELECT id FROM workspaces WHERE id=?").get(id))
      throw new Error("Workspace not found");
  }
  createWorkspace(name) {
    name = contracts.workspaceName.parse(name);
    if (
      this.catalog().workspaces.some((w) => w.name.toLowerCase() === name.toLowerCase())
    )
      throw new Error("A workspace with that name already exists.");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO workspaces(id,name,data) VALUES(?,?,?)")
      .run(id, name, "[]");
    return this.selectWorkspace(id);
  }
  selectWorkspace(id) {
    this.requireWorkspace(id);
    this.db.prepare("UPDATE settings SET value=? WHERE key='active_workspace'").run(id);
    return { catalog: this.catalog(), projects: this.loadWorkspace(id) ?? [] };
  }
  renameWorkspace(id, name) {
    this.requireWorkspace(id);
    name = contracts.workspaceName.parse(name);
    if (
      this.catalog().workspaces.some(
        (w) => w.id !== id && w.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("A workspace with that name already exists.");
    this.db.prepare("UPDATE workspaces SET name=? WHERE id=?").run(name, id);
    return { catalog: this.catalog(), projects: this.loadWorkspace() ?? [] };
  }
  async deleteWorkspace(id) {
    // Removing the workspace row also rejects delayed saves via requireWorkspace.
    // Keep selection changes and cleanup intents atomic with removal of its data.
    this.requireWorkspace(id);
    const remaining = this.catalog().workspaces.filter((w) => w.id !== id);
    if (!remaining.length)
      throw new Error("Create another workspace before deleting your last workspace.");
    if (
      this.db
        .prepare(
          "SELECT id FROM sessions WHERE workspace_id=? AND status IN ('recording','paused','starting','stopping')",
        )
        .get(id)
    )
      throw new Error("Finish the recording before deleting this workspace.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const queue = this.db.prepare(
        "INSERT OR IGNORE INTO pending_file_deletions(filename) VALUES(?)",
      );
      for (const capture of this.db
        .prepare(
          "SELECT c.id FROM captures c JOIN sessions s ON s.id=c.session_id WHERE s.workspace_id=?",
        )
        .all(id))
        for (const frame of ["before", "after"]) {
          queue.run(`${capture.id}-${frame}.png`);
          queue.run(`${capture.id}-${frame}.png.tmp`);
        }
      this.db
        .prepare(
          "DELETE FROM captures WHERE session_id IN (SELECT id FROM sessions WHERE workspace_id=?)",
        )
        .run(id);
      this.db.prepare("DELETE FROM sessions WHERE workspace_id=?").run(id);
      this.db.prepare("DELETE FROM deleted_projects WHERE workspace_id=?").run(id);
      this.db.prepare("DELETE FROM deleted_recordings WHERE workspace_id=?").run(id);
      this.db.prepare("DELETE FROM workspaces WHERE id=?").run(id);
      if (this.activeWorkspaceId() === id)
        this.db
          .prepare("UPDATE settings SET value=? WHERE key='active_workspace'")
          .run(remaining[0].id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const pending = await this.cleanupDeletedFiles();
    return {
      catalog: this.catalog(),
      projects: this.loadWorkspace() ?? [],
      cleanupPending: pending > 0,
    };
  }
  rawWorkspace(workspaceId = this.activeWorkspaceId()) {
    this.requireWorkspace(workspaceId);
    const row = this.db
      .prepare("SELECT data FROM workspaces WHERE id=?")
      .get(workspaceId);
    return row?.data ? contracts.workspace.parse(JSON.parse(row.data)) : null;
  }
  initialize(projects) {
    if (!this.rawWorkspace()) this.saveWorkspace(projects);
    return this.loadWorkspace();
  }
  mergeSessions(projects, workspaceId = this.activeWorkspaceId()) {
    // Only materialize missing sessions. Rebuilding existing documents from
    // captures would overwrite user edits and restore intentionally removed steps.
    for (const session of this.db
      .prepare(
        "SELECT * FROM sessions WHERE workspace_id=? AND status IN ('complete','interrupted') ORDER BY started_at",
      )
      .all(workspaceId)) {
      const project = projects.find((p) => p.id === session.project_id);
      if (!project || project.documents.some((d) => d.sessionId === session.id)) continue;
      const captures = this.db
        .prepare("SELECT * FROM captures WHERE session_id=? ORDER BY sequence")
        .all(session.id);
      project.documents.push({
        id: session.id,
        sessionId: session.id,
        title: session.name,
        description:
          session.context ||
          (captures.length
            ? "Recorded locally. Review the screenshots and add instructions for each step."
            : session.error || "No clicks were captured in this recording."),
        demo: false,
        recovered: session.status === "interrupted",
        steps: captures.map((c) => {
          const m = JSON.parse(c.metadata);
          return {
            id: c.id,
            captureId: c.id,
            title:
              m.trigger === "manual"
                ? `Screenshot of ${JSON.parse(session.display).name}`
                : `${m.button === 2 ? "Right-click" : m.button === 3 ? "Middle-click" : "Click"} on ${m.application || JSON.parse(session.display).name}`,
            description: c.error
              ? `Capture issue: ${c.error}`
              : "Describe what you did and why. This step has not been interpreted by AI.",
            screen: m.application
              ? `${m.application} - ${JSON.parse(session.display).name}`
              : JSON.parse(session.display).name,
            capturedAt: m.clickedAt,
            elapsedMs: m.clickedAt - session.started_at,
          };
        }),
      });
    }
    return projects;
  }
  nextRevision(sessionId) {
    const key = "revision_counter:" + sessionId;
    const number =
      Number(
        this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value || 0,
      ) + 1;
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, String(number));
    return number;
  }
  labelRevisions(projects) {
    for (const project of projects) {
      for (const guide of project.documents) {
        if (!guide.sessionId || !guide.revision) continue;
        const key = "revision_counter:" + guide.sessionId;
        this.db
          .prepare(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)",
          )
          .run(key, String(guide.revision));
      }
      for (const guide of project.documents) {
        if (!guide.sessionId) continue;
        if (guide.id === guide.sessionId) {
          guide.revision = 0;
          guide.createdAt ??= this.db
            .prepare("SELECT started_at FROM sessions WHERE id=?")
            .get(guide.sessionId)?.started_at;
        } else if (guide.revision === undefined) {
          guide.revision = this.nextRevision(guide.sessionId);
          guide.revisionLabel = "AI draft";
          // Historical creation time and parent are unknown; do not invent them.
        }
      }
    }
    return projects;
  }
  loadWorkspace(workspaceId = this.activeWorkspaceId()) {
    const data = this.rawWorkspace(workspaceId);
    if (!data) return null;
    const merged = this.labelRevisions(this.mergeSessions(data, workspaceId));
    this.writeWorkspace(merged, workspaceId);
    return merged;
  }
  writeWorkspace(projects, workspaceId = this.activeWorkspaceId()) {
    this.db
      .prepare("UPDATE workspaces SET data=? WHERE id=?")
      .run(JSON.stringify(projects), workspaceId);
  }
  saveWorkspace(input, workspaceId = this.activeWorkspaceId()) {
    this.requireWorkspace(workspaceId);
    const deleted = new Set(
      this.db
        .prepare("SELECT project_id FROM deleted_projects WHERE workspace_id=?")
        .all(workspaceId)
        .map((r) => r.project_id),
    );
    const projects = contracts.workspace.parse(input).filter((p) => !deleted.has(p.id));
    // Keep immutable provenance when an older renderer submits a delayed save.
    const current = this.rawWorkspace(workspaceId) || [];
    for (const p of projects)
      for (const d of p.documents) {
        const saved = current
          .find((old) => old.id === p.id)
          ?.documents.find((old) => old.id === d.id);
        if (saved)
          for (const key of ["revision", "createdAt", "basedOnRevision"]) {
            if (saved[key] !== undefined) d[key] = saved[key];
          }
        if (saved?.revisionLabel && !d.revisionLabel)
          d.revisionLabel = saved.revisionLabel;
      }
    const removed = this.db
      .prepare("SELECT * FROM deleted_recordings WHERE workspace_id=?")
      .all(workspaceId);
    // Filter deleted documents before capture validation: a delayed save may
    // still reference captures whose rows were removed by the deletion transaction.
    for (const p of projects)
      p.documents = p.documents.filter(
        (d) =>
          !removed.some(
            (r) =>
              r.project_id === p.id &&
              (r.guide_id === d.id || (r.session_id && r.session_id === d.sessionId)),
          ),
      );
    // Only reference captures belonging to the document's original session.
    for (const p of projects)
      for (const d of p.documents)
        for (const s of d.steps)
          for (const captureId of new Set([
            ...(s.captureIds || []),
            ...(s.captureId ? [s.captureId] : []),
          ])) {
            const row = this.db
              .prepare(
                "SELECT c.session_id,s.workspace_id,s.project_id FROM captures c JOIN sessions s ON s.id=c.session_id WHERE c.id=?",
              )
              .get(captureId);
            if (
              !row ||
              row.session_id !== d.sessionId ||
              row.workspace_id !== workspaceId ||
              row.project_id !== p.id
            )
              throw new Error("Invalid capture reference");
          }
    this.writeWorkspace(this.mergeSessions(projects, workspaceId), workspaceId);
  }
  async deleteProject(workspaceId, projectId) {
    this.requireWorkspace(workspaceId);
    contracts.id.parse(projectId);
    const projects = this.loadWorkspace(workspaceId) ?? [];
    if (!projects.some((p) => p.id === projectId)) throw new Error("Project not found");
    if (
      this.db
        .prepare(
          "SELECT id FROM sessions WHERE workspace_id=? AND project_id=? AND status IN ('recording','paused','starting','stopping')",
        )
        .get(workspaceId, projectId)
    )
      throw new Error("Finish the recording before deleting this project.");
    const captures = this.db
      .prepare(
        "SELECT c.id FROM captures c JOIN sessions s ON s.id=c.session_id WHERE s.workspace_id=? AND s.project_id=?",
      )
      .all(workspaceId, projectId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const queue = this.db.prepare(
        "INSERT OR IGNORE INTO pending_file_deletions(filename) VALUES(?)",
      );
      for (const c of captures)
        for (const frame of ["before", "after"]) {
          queue.run(`${c.id}-${frame}.png`);
          queue.run(`${c.id}-${frame}.png.tmp`);
        }
      this.db
        .prepare(
          "DELETE FROM captures WHERE session_id IN (SELECT id FROM sessions WHERE workspace_id=? AND project_id=?)",
        )
        .run(workspaceId, projectId);
      this.db
        .prepare("DELETE FROM sessions WHERE workspace_id=? AND project_id=?")
        .run(workspaceId, projectId);
      this.db
        .prepare("INSERT OR IGNORE INTO deleted_projects VALUES(?,?)")
        .run(workspaceId, projectId);
      this.writeWorkspace(
        projects.filter((p) => p.id !== projectId),
        workspaceId,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const pending = await this.cleanupDeletedFiles();
    return { projects: this.loadWorkspace(workspaceId), cleanupPending: pending > 0 };
  }
  deleteDocument(workspaceId, projectId, guideId) {
    contracts.deleteRecording.parse({ workspaceId, projectId, guideId });
    const projects = this.loadWorkspace(workspaceId) ?? [];
    const project = projects.find((p) => p.id === projectId);
    const guide = project?.documents.find((d) => d.id === guideId);
    if (!guide) throw new Error("Document not found");
    if (!guide.sessionId || guide.id === guide.sessionId)
      throw new Error("Use Delete recording to remove an original recording.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // A null session tombstone removes only this revision, including stale saves.
      this.db
        .prepare("INSERT OR IGNORE INTO deleted_recordings VALUES(?,?,?,?)")
        .run(workspaceId, projectId, guideId, null);
      this.db
        .prepare(
          "DELETE FROM ai_drafts WHERE workspace_id=? AND project_id=? AND guide_id=?",
        )
        .run(workspaceId, projectId, guideId);
      project.documents = project.documents.filter((d) => d.id !== guideId);
      this.writeWorkspace(projects, workspaceId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { projects: this.loadWorkspace(workspaceId) };
  }
  async deleteRecording(workspaceId, projectId, guideId) {
    contracts.deleteRecording.parse({ workspaceId, projectId, guideId });
    const projects = this.loadWorkspace(workspaceId) ?? [];
    const project = projects.find((p) => p.id === projectId);
    const guide = project?.documents.find((d) => d.id === guideId);
    if (!guide) throw new Error("Recording not found");
    const session =
      guide.sessionId &&
      this.db
        .prepare("SELECT * FROM sessions WHERE id=? AND workspace_id=? AND project_id=?")
        .get(guide.sessionId, workspaceId, projectId);
    if (guide.sessionId && !session) throw new Error("Recording session not found");
    if (session && !["complete", "interrupted"].includes(session.status))
      throw new Error("Finish the recording before deleting it.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (session) {
        const queue = this.db.prepare(
          "INSERT OR IGNORE INTO pending_file_deletions(filename) VALUES(?)",
        );
        for (const { id } of this.db
          .prepare("SELECT id FROM captures WHERE session_id=?")
          .all(session.id))
          for (const frame of ["before", "after"]) {
            queue.run(`${id}-${frame}.png`);
            queue.run(`${id}-${frame}.png.tmp`);
          }
        this.db.prepare("DELETE FROM captures WHERE session_id=?").run(session.id);
        this.db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
      }
      for (const d of project.documents.filter(
        (d) => d.id === guideId || (session && d.sessionId === session.id),
      ))
        this.db
          .prepare("INSERT OR IGNORE INTO deleted_recordings VALUES(?,?,?,?)")
          .run(workspaceId, projectId, d.id, session?.id ?? null);
      project.documents = project.documents.filter(
        (d) => d.id !== guideId && !(session && d.sessionId === session.id),
      );
      this.writeWorkspace(projects, workspaceId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const pending = await this.cleanupDeletedFiles();
    return { projects: this.loadWorkspace(workspaceId), cleanupPending: pending > 0 };
  }
  async cleanupDeletedFiles() {
    // Consume committed, exact filenames only. Leave failures queued so a
    // locked file does not roll back a successful logical deletion or get forgotten.
    for (const { filename } of this.db
      .prepare("SELECT filename FROM pending_file_deletions")
      .all()) {
      if (!/^[0-9a-f-]{36}-(before|after)\.png(\.tmp)?$/.test(filename)) continue;
      try {
        await fsp.unlink(path.join(this.images, filename));
      } catch (error) {
        if (error.code !== "ENOENT") continue;
      }
      this.db
        .prepare("DELETE FROM pending_file_deletions WHERE filename=?")
        .run(filename);
    }
    return this.db.prepare("SELECT COUNT(*) AS count FROM pending_file_deletions").get()
      .count;
  }
  createSession(input, display) {
    const project = this.rawWorkspace()?.find((p) => p.id === input.projectId);
    if (!project) throw new Error("Project does not exist");
    const session = {
      id: randomUUID(),
      ...input,
      display,
      startedAt: Date.now(),
      workspaceId: this.activeWorkspaceId(),
    };
    this.db
      .prepare(
        "INSERT INTO sessions(id,project_id,name,context,instructions,display,started_at,status,workspace_id) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        session.id,
        input.projectId,
        input.name,
        input.context,
        project.instructions,
        JSON.stringify(display),
        session.startedAt,
        "recording",
        session.workspaceId,
      );
    return session;
  }
  sessionStatus(id, status, error = null) {
    this.db
      .prepare("UPDATE sessions SET status=?,error=? WHERE id=?")
      .run(status, error, id);
  }
  addCapture(sessionId, sequence, metadata) {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO captures(id,session_id,sequence,metadata) VALUES(?,?,?,?)")
      .run(id, sessionId, sequence, JSON.stringify(metadata));
    return id;
  }
  async saveFrame(id, kind, frame) {
    contracts.uuid.parse(id);
    if (!["before", "after"].includes(kind)) throw new Error("Invalid frame");
    const filename = `${id}-${kind}.png`;
    const destination = path.join(this.images, filename);
    const handle = await fsp.open(`${destination}.tmp`, "wx");
    try {
      await handle.writeFile(frame.png);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(`${destination}.tmp`, destination);
    // Publish the filename only after the PNG exists. A crash here may leave an
    // orphan file, which startup deliberately retains for possible recovery.
    const row = this.db.prepare("SELECT metadata FROM captures WHERE id=?").get(id);
    const metadata = JSON.parse(row.metadata);
    metadata[kind] = {
      capturedAt: frame.capturedAt,
      width: frame.width,
      height: frame.height,
    };
    this.db
      .prepare(`UPDATE captures SET ${kind}_file=?,metadata=? WHERE id=?`)
      .run(filename, JSON.stringify(metadata), id);
  }
  captureError(id, message) {
    this.db.prepare("UPDATE captures SET error=? WHERE id=?").run(message, id);
  }
  capture(id) {
    contracts.uuid.parse(id);
    const row = this.db.prepare("SELECT * FROM captures WHERE id=?").get(id);
    if (!row) throw new Error("Capture not found");
    return row;
  }
  saveAnnotations(input) {
    const { id, frame, boxes } = contracts.annotationSave.parse(input);
    const row = this.capture(id);
    if (!row[frame + "_file"]) throw new Error("Screenshot not found");
    const metadata = JSON.parse(row.metadata);
    metadata.annotations = { ...metadata.annotations, [frame]: boxes };
    this.db
      .prepare("UPDATE captures SET metadata=? WHERE id=?")
      .run(JSON.stringify(metadata), id);
  }
  async image(id, kind, original = false) {
    const row = this.capture(id);
    const file = row[`${kind}_file`];
    let png = file ? await fsp.readFile(path.join(this.images, file)) : null;
    const boxes = JSON.parse(row.metadata).annotations?.[kind] || [];
    if (png && boxes.length && !original) {
      if (!this.renderAnnotations)
        throw new Error("Cannot render screenshot edits. Nothing was sent.");
      png = this.renderAnnotations(png, boxes);
    }
    return {
      dataUrl: png ? "data:image/png;base64," + png.toString("base64") : null,
      metadata: JSON.parse(row.metadata),
      error: row.error,
    };
  }
  close() {
    this.db.close();
  }
}
module.exports = { Storage };
