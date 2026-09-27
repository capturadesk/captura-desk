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
    input =
      typeof input.instruction === "string"
        ? require("./contracts.cjs").refine.parse(input)
        : require("./contracts.cjs").generate.parse(input);
    if (this.busy) throw new Error("An AI request is already running.");
    const { project, guide } = this.source(input);
    const key = this.key(input.provider);
    const refining = typeof input.instruction === "string";
    const captureIds = refining ? guide.steps.map((s) => s.captureId) : input.captureIds;
    if (refining && (captureIds.length < 1 || captureIds.length > 200))
      throw new Error("AI edits support documents with 1-200 steps.");
    const ids = new Set(captureIds);
    const evidence = [
      ...new Set(
        guide.steps.flatMap((s) => s.captureIds || (s.captureId ? [s.captureId] : [])),
      ),
    ];
    const selected = refining
      ? guide.steps
      : evidence.filter((id) => ids.has(id)).map((captureId) => ({ captureId }));
    if (!refining && (ids.size !== captureIds.length || selected.length !== ids.size))
      throw new Error("Select unique captures belonging to this recording.");
    const controller = new AbortController();
    this.job = {
      controller,
      phase: refining ? "Preparing document text" : "Preparing selected screenshots",
    };
    try {
      let captures = [],
        batchSteps = [],
        bytes = 0;
      const parts = [];
      const context = {
        task: guide.title,
        context: guide.description,
        projectInstructions: project.instructions,
        ...(refining ? { editRequest: input.instruction } : {}),
      };
      const request = async (mode, sources, extra) => {
        controller.signal.throwIfAborted();
        const contextWithBatch = { ...context, ...extra };
        if (JSON.stringify(contextWithBatch).length > 2000000)
          throw new Error(
            "Document text is too large for one draft. Select fewer captures.",
          );
        const result = await this.providers.generate({
          mode,
          provider: input.provider,
          model: input.model,
          key,
          context: contextWithBatch,
          captures: sources,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        return require("./contracts.cjs").output.parse(result);
      };
      const currentSteps = (steps) =>
        steps.map((step, index) => ({
          captureSlot: `capture_${index + 1}`,
          title: step.title,
          description: step.description,
          needsReview: step.needsReview || false,
        }));
      const flush = async () => {
        if (!captures.length) return;
        this.job.phase = `Generating batch ${parts.length + 1}`;
        parts.push(
          await request(refining ? "document-refine" : "document", captures, {
            batch: {
              number: parts.length + 1,
              captures: captures.length,
              totalSources: selected.length,
            },
            ...(refining ? { currentSteps: currentSteps(batchSteps) } : {}),
          }),
        );
        captures = [];
        batchSteps = [];
        bytes = 0;
      };
      for (const [index, step] of selected.entries()) {
        controller.signal.throwIfAborted();
        const row = this.storage.capture(step.captureId);
        if (row.session_id !== guide.sessionId)
          throw new Error("Capture does not belong to this recording.");
        if (refining) {
          for (const id of step.captureIds || [step.captureId])
            if (this.storage.capture(id).session_id !== guide.sessionId)
              throw new Error("Invalid source capture.");
          captures.push({ id: step.captureId, captureIds: step.captureIds, frames: [] });
          batchSteps.push(step);
          if (captures.length === 20) await flush();
          continue;
        }
        const frames = [];
        let captureBytes = 0;
        for (const kind of ["before", "after"]) {
          const frame = await this.storage.image(step.captureId, kind);
          if (frame.dataUrl) {
            const data = this.prepareImage(frame.dataUrl);
            captureBytes += data.length;
            if (captureBytes > 24 * 1024 * 1024)
              throw new Error(
                "A selected capture is too large to send. Exclude it and try again.",
              );
            frames.push({ kind, data });
          }
        }
        if (!frames.length)
          throw new Error(
            "A selected capture has no screenshot. Exclude that step and try again.",
          );
        if (captures.length && bytes + captureBytes > 24 * 1024 * 1024) await flush();
        bytes += captureBytes;
        this.job.phase = `Preparing capture ${index + 1} of ${selected.length}`;
        const metadata = JSON.parse(row.metadata);
        captures.push({
          id: step.captureId,
          point: metadata.point,
          button: metadata.button,
          trigger: metadata.trigger || "click",
          application: metadata.application || undefined,
          frames,
        });
        if (captures.length === 20) await flush();
      }
      await flush();
      let output = parts[0];
      if (parts.length > 1) {
        this.job.phase = "Combining batches into one document";
        const steps = parts.flatMap((part) => part.steps);
        if (steps.length > 200)
          throw new Error("Too many generated sections. Select fewer captures.");
        output = await request(
          "document-merge",
          steps.map((step) => ({
            id: step.captureId,
            captureIds: step.captureIds,
            frames: [],
          })),
          {
            currentSteps: currentSteps(steps),
            batchSummaries: parts.map((part) => ({
              title: part.title,
              description: part.description,
            })),
          },
        );
        // A synthesis must not silently lose evidence or review warnings from a batch.
        const expected = new Set(
          steps.flatMap((step) => step.captureIds || [step.captureId]),
        );
        const actual = new Set(
          output.steps.flatMap((step) => step.captureIds || [step.captureId]),
        );
        if (
          [...expected].some((id) => !actual.has(id)) ||
          [...actual].some((id) => !expected.has(id))
        )
          throw new Error(
            "The combined draft omitted source references. Nothing was applied; try again.",
          );
        const warnings = new Set(
          steps
            .filter((step) => step.needsReview)
            .flatMap((step) => step.captureIds || [step.captureId]),
        );
        output.steps = output.steps.map((step) => ({
          ...step,
          needsReview:
            step.needsReview ||
            (step.captureIds || [step.captureId]).some((id) => warnings.has(id)),
        }));
      }
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
        refining ? "v3-batched-refinement" : "v4-batched-document",
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
      format: output.format,
      title: output.title,
      description: output.description,
      steps: output.steps.map((s) => ({
        ...guide.steps.find((step) => step.captureId === s.captureId),
        id: randomUUID(),
        screen:
          guide.steps.find((step) =>
            (step.captureIds || [step.captureId]).includes(s.captureId),
          )?.screen || "Source screenshots",
        captureId: s.captureId,
        captureIds: s.captureIds,
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
