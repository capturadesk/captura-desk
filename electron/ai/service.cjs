const { isDeepStrictEqual } = require("node:util");
const { randomUUID } = require("node:crypto");
const { Providers } = require("./providers.cjs");

class AIService {
  constructor(storage, secureStorage, prepareImage, providers = new Providers()) {
    this.storage = storage;
    this.db = storage.db;
    this.secure = secureStorage;
    this.prepareImage = prepareImage;
    this.providers = providers;
    this.job = null;
  }
  get busy() {
    return !!this.job;
  }
  state() {
    return { busy: this.busy, phase: this.job?.phase || "idle" };
  }
  encryptionAvailable() {
    return (
      this.secure.isEncryptionAvailable() &&
      this.secure.getSelectedStorageBackend?.() !== "basic_text"
    );
  }
  connections() {
    return {
      encryptionAvailable: this.encryptionAvailable(),
      providers: ["openai", "anthropic"].map((provider) => ({
        provider,
        connected: !!this.db
          .prepare("SELECT provider FROM ai_credentials WHERE provider=?")
          .get(provider),
      })),
    };
  }
  saveKey(provider, key) {
    if (!this.encryptionAvailable())
      throw new Error("OS credential encryption is unavailable. The key was not saved.");
    const encrypted = this.secure.encryptString(key).toString("base64");
    this.db
      .prepare(
        "INSERT INTO ai_credentials VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET encrypted=excluded.encrypted",
      )
      .run(provider, encrypted);
    return this.connections();
  }
  removeKey(provider) {
    this.db.prepare("DELETE FROM ai_credentials WHERE provider=?").run(provider);
    return this.connections();
  }
  key(provider) {
    if (!this.encryptionAvailable())
      throw new Error("OS credential encryption is unavailable.");
    const row = this.db
      .prepare("SELECT encrypted FROM ai_credentials WHERE provider=?")
      .get(provider);
    if (!row) throw new Error("Connect this provider in AI providers first.");
    try {
      return this.secure.decryptString(Buffer.from(row.encrypted, "base64"));
    } catch {
      throw new Error("Could not unlock this API key. Save it again in AI providers.");
    }
  }
  models(provider) {
    return this.providers.models(provider, this.key(provider));
  }
  defaults(workspaceId) {
    this.storage.requireWorkspace(workspaceId);
    return (
      this.db
        .prepare("SELECT provider,model FROM ai_workspace WHERE workspace_id=?")
        .get(workspaceId) || { provider: "openai", model: "" }
    );
  }
  saveDefaults({ workspaceId, provider, model }) {
    this.storage.requireWorkspace(workspaceId);
    this.db
      .prepare(
        "INSERT INTO ai_workspace VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET provider=excluded.provider,model=excluded.model",
      )
      .run(workspaceId, provider, model);
    return this.defaults(workspaceId);
  }
  source({ workspaceId, projectId, guideId }) {
    if (this.storage.activeWorkspaceId() !== workspaceId)
      throw new Error("Switch to this workspace first.");
    const projects = this.storage.loadWorkspace(workspaceId) || [];
    const project = projects.find((p) => p.id === projectId);
    const guide = project?.documents.find((d) => d.id === guideId);
    if (!guide || guide.demo || !guide.sessionId)
      throw new Error("Select a saved recording with screenshots.");
    return { projects, project, guide };
  }
  list(target) {
    this.source(target);
    return this.db
      .prepare(
        "SELECT id,provider,model,created_at AS createdAt,output FROM ai_drafts WHERE workspace_id=? AND project_id=? AND guide_id=? ORDER BY created_at DESC LIMIT 20",
      )
      .all(target.workspaceId, target.projectId, target.guideId)
      .map((d) => ({ ...d, output: JSON.parse(d.output) }));
  }
  cancel() {
    this.job?.controller.abort();
  }
  async refine(input) {
    return this.generate(require("./contracts.cjs").refine.parse(input));
  }
  async generate(input) {
    if (this.busy) throw new Error("An AI request is already running.");
    const { project, guide } = this.source(input);
    const key = this.key(input.provider);
    const refining = typeof input.instruction === "string";
    const captureIds = refining ? guide.steps.map((s) => s.captureId) : input.captureIds;
    if (refining && (captureIds.length < 1 || captureIds.length > 20))
      throw new Error("AI edits support documents with 1-20 steps.");
    const ids = new Set(captureIds);
    const selected = guide.steps.filter((s) => ids.has(s.captureId));
    if (ids.size !== captureIds.length || selected.length !== ids.size)
      throw new Error("Select unique captures belonging to this recording.");
    const controller = new AbortController();
    this.job = {
      controller,
      phase: refining ? "Preparing document text" : "Preparing selected screenshots",
    };
    try {
      const captures = [];
      let bytes = 0;
      for (const step of selected) {
        controller.signal.throwIfAborted();
        const row = this.storage.capture(step.captureId);
        if (row.session_id !== guide.sessionId)
          throw new Error("Capture does not belong to this recording.");
        if (refining) {
          captures.push({ id: step.captureId, frames: [] });
          continue;
        }
        const frames = [];
        for (const kind of ["before", "after"]) {
          const frame = await this.storage.image(step.captureId, kind);
          if (frame.dataUrl) {
            const data = this.prepareImage(frame.dataUrl);
            bytes += data.length;
            if (bytes > 24 * 1024 * 1024)
              throw new Error("Selected images are too large. Select fewer captures.");
            frames.push({ kind, data });
          }
        }
        if (!frames.length)
          throw new Error(
            "A selected capture has no screenshot. Exclude that step and try again.",
          );
        const metadata = JSON.parse(row.metadata);
        captures.push({
          id: step.captureId,
          point: metadata.point,
          button: metadata.button,
          frames,
        });
      }
      controller.signal.throwIfAborted();
      this.job.phase = "Generating documentation";
      const output = await this.providers.generate({
        mode: refining ? "refine" : "generate",
        provider: input.provider,
        model: input.model,
        key,
        context: {
          task: guide.title,
          context: guide.description,
          projectInstructions: project.instructions,
          ...(refining
            ? {
                editRequest: input.instruction,
                currentSteps: selected.map((step, index) => ({
                  captureSlot: `capture_${index + 1}`,
                  title: step.title,
                  description: step.description,
                })),
              }
            : {}),
        },
        captures,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      this.source(input); // Refuse to save against removed source data.
      const id = randomUUID(),
        createdAt = Date.now();
      this.db.prepare("INSERT INTO ai_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        input.workspaceId,
        input.projectId,
        input.guideId,
        guide.sessionId,
        input.provider,
        input.model,
        createdAt,
        JSON.stringify(guide),
        JSON.stringify({
          ...output,
          revisionLabel: refining
            ? input.instruction.replace(/\s+/g, " ").slice(0, 120)
            : "AI draft",
        }),
        refining ? "v1-text-refinement" : "v2-capture-slots",
      );
      return { id, provider: input.provider, model: input.model, createdAt, output };
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("Generation canceled. Your document is unchanged.");
      throw error;
    } finally {
      this.job = null;
    }
  }
  apply({ workspaceId, draftId }) {
    const draft = this.db
      .prepare("SELECT * FROM ai_drafts WHERE id=? AND workspace_id=?")
      .get(draftId, workspaceId);
    if (!draft) throw new Error("Draft not found.");
    const { projects, project, guide } = this.source({
      workspaceId,
      projectId: draft.project_id,
      guideId: draft.guide_id,
    });
    const source = JSON.parse(draft.source);
    const comparable = { ...guide };
    // Older saved drafts predate revision metadata; compare their document content.
    if (source.revision === undefined) {
      for (const key of ["revision", "revisionLabel", "createdAt", "basedOnRevision"])
        delete comparable[key];
    }
    if (!isDeepStrictEqual(comparable, source))
      throw new Error(
        "The source document changed. Generate a new draft to preserve your latest edits.",
      );
    const output = JSON.parse(draft.output);
    const newGuide = {
      ...guide,
      id: randomUUID(),
      revision: this.storage.nextRevision(guide.sessionId),
      revisionLabel: output.revisionLabel || "AI draft",
      createdAt: Date.now(),
      basedOnRevision: guide.revision ?? 0,
      title: output.title,
      description: output.description,
      steps: output.steps.map((s) => ({
        ...guide.steps.find((step) => step.captureId === s.captureId),
        title: s.title,
        description: (s.needsReview ? "Review needed: " : "") + s.description,
      })),
    };
    project.documents.push(newGuide);
    this.storage.saveWorkspace(projects, workspaceId);
    return { projects: this.storage.loadWorkspace(workspaceId), guideId: newGuide.id };
  }
}
module.exports = { AIService };
