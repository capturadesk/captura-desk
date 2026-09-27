const { dialog, screen } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const c = require("./contracts.cjs");
const a = require("./ai/contracts.cjs");
function registerIPC({
  ipcMain,
  trusted,
  storage,
  recorder,
  ai,
  mainWindow,
  indicators,
}) {
  let transferring = false;
  const handle = (channel, schema, fn, toolbar = false) =>
    ipcMain.handle(channel, async (event, payload) => {
      trusted(event, toolbar);
      if (transferring && !["recording:state", "ai:state"].includes(channel))
        throw new Error("Wait for the workspace backup or restore to finish.");
      const parsed = schema
        ? schema.safeParse(payload)
        : { success: true, data: payload };
      if (!parsed.success)
        throw new Error("Invalid request. Please check the entered values.");
      return fn(parsed.data);
    });
  handle("workspace:load", null, () => storage.loadWorkspace());
  handle("workspace:initialize", c.workspace, (data) => storage.initialize(data));
  handle("workspace:save", c.workspaceSave, (data) => {
    storage.saveWorkspace(data.projects, data.workspaceId);
    return true;
  });
  const requireIdle = () => {
    if (ai.busy)
      throw new Error("Finish or cancel AI generation before making this change.");
    if (recorder.state.status !== "idle")
      throw new Error(
        "Finish the current recording before changing workspaces or deleting a project.",
      );
  };
  handle("workspace:backup", c.id, async (workspaceId) => {
    requireIdle();
    transferring = true;
    let temporary;
    try {
      const result = await dialog.showSaveDialog(mainWindow(), {
        title: "Back up workspace",
        defaultPath: "workspace.captura-backup",
        filters: [{ name: "Captura Desk backup", extensions: ["captura-backup"] }],
      });
      if (result.canceled || !result.filePath) return false;
      const data = require("./backup.cjs").createBackup(storage, workspaceId);
      temporary = result.filePath + "." + randomUUID() + ".tmp";
      const file = await fs.open(temporary, "wx");
      try {
        await file.writeFile(data);
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(temporary, result.filePath);
      temporary = null;
      return true;
    } finally {
      if (temporary) await fs.unlink(temporary).catch(() => {});
      transferring = false;
    }
  });
  handle("workspace:restore", null, async () => {
    requireIdle();
    transferring = true;
    try {
      const result = await dialog.showOpenDialog(mainWindow(), {
        title: "Restore workspace",
        properties: ["openFile"],
        filters: [{ name: "Captura Desk backup", extensions: ["captura-backup"] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const backup = require("./backup.cjs");
      if ((await fs.stat(result.filePaths[0])).size > backup.LIMIT)
        throw new Error("Backup exceeds the 256 MiB limit.");
      return backup.restoreBackup(storage, await fs.readFile(result.filePaths[0]));
    } finally {
      transferring = false;
    }
  });
  handle("ai:connections", null, () => ai.connections());
  handle("ai:key", a.key, ({ provider, key }) => {
    requireIdle();
    return ai.saveKey(provider, key);
  });
  handle("ai:remove-key", a.provider, (provider) => {
    requireIdle();
    return ai.removeKey(provider);
  });
  handle("ai:models", a.provider, (provider) => ai.models(provider));
  handle("ai:defaults", c.id, (workspaceId) => ai.defaults(workspaceId));
  handle("ai:save-defaults", a.defaults, (input) => {
    requireIdle();
    return ai.saveDefaults(input);
  });
  handle("ai:drafts", a.target, (input) => ai.list(input));
  handle("ai:generate", a.generate, (input) => {
    requireIdle();
    return ai.generate(input);
  });
  handle("ai:refine", a.refine, (input) => {
    requireIdle();
    return ai.refine(input);
  });
  handle("ai:apply", a.draft, (input) => {
    requireIdle();
    return ai.apply(input);
  });
  handle("ai:state", null, () => ai.state());
  handle("ai:cancel", null, () => ai.cancel());
  handle("workspaces:list", null, () => storage.catalog());
  handle("workspaces:create", c.workspaceName, (name) => {
    requireIdle();
    return storage.createWorkspace(name);
  });
  handle("workspaces:select", c.id, (id) => {
    requireIdle();
    return storage.selectWorkspace(id);
  });
  handle("workspaces:rename", c.renameWorkspace, ({ id, name }) => {
    requireIdle();
    return storage.renameWorkspace(id, name);
  });
  handle("workspaces:delete", c.id, (id) => {
    requireIdle();
    return storage.deleteWorkspace(id);
  });
  handle("project:delete", c.deleteProject, (data) => {
    requireIdle();
    return storage.deleteProject(data.workspaceId, data.projectId);
  });
  handle("document:delete", c.deleteRecording, (data) => {
    requireIdle();
    return storage.deleteDocument(data.workspaceId, data.projectId, data.guideId);
  });
  handle("recording:delete", c.deleteRecording, (data) => {
    requireIdle();
    return storage.deleteRecording(data.workspaceId, data.projectId, data.guideId);
  });
  handle("recording:displays", null, () => {
    const current = String(screen.getDisplayMatching(mainWindow().getBounds()).id);
    return recorder.platform.listDisplays().map((display) => ({
      ...display,
      recommended: display.id === current,
    }));
  });
  handle("recording:identify", null, () => {
    requireIdle();
    indicators.show(recorder.platform.listDisplays());
  });
  handle("recording:state", null, () => recorder.snapshot(), true);
  handle("recording:start", c.startRecording, (data) => {
    requireIdle();
    indicators.hide();
    return recorder.start(data);
  });
  handle("recording:capture", null, () => recorder.captureNow(), true);
  handle("recording:pause", null, () => recorder.pause(), true);
  handle("recording:resume", null, () => recorder.resume(), true);
  handle("recording:stop", null, () => recorder.stop(), true);
  handle(
    "recording:show",
    null,
    () => {
      mainWindow().restore();
      mainWindow().show();
      mainWindow().focus();
    },
    true,
  );
  handle("capture:annotation-read", c.captureRequest, (data) =>
    storage.image(data.id, data.frame, true),
  );
  handle("capture:annotation-save", c.annotationSave, (data) => {
    requireIdle();
    storage.saveAnnotations(data);
  });
  handle("capture:image", c.captureRequest, (data) => storage.image(data.id, data.frame));
  handle("export-markdown", c.exportRequest, async ({ projectId, guideId }) => {
    const guide = storage
      .loadWorkspace()
      ?.find((p) => p.id === projectId)
      ?.documents.find((d) => d.id === guideId);
    if (!guide) throw new Error("Document not found");
    const title =
      guide.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 100) || "Untitled";
    const result = await dialog.showSaveDialog(mainWindow(), {
      title: "Export documentation",
      defaultPath: `${title}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return false;
    const assets = `${path.basename(result.filePath, ".md")}.assets-${randomUUID().slice(0, 8)}`;
    let text = `# ${guide.title}\n\n${guide.description}\n\n`;
    for (const [index, step] of guide.steps.entries()) {
      text += `## ${index + 1}. ${step.title}\n\n${step.description}\n\n`;
      for (const [evidenceIndex, captureId] of (
        step.captureIds || (step.captureId ? [step.captureId] : [])
      ).entries()) {
        const row = storage.capture(captureId);
        for (const kind of ["before", "after"])
          if (row[`${kind}_file`]) {
            const dir = path.join(path.dirname(result.filePath), assets);
            await fs.mkdir(dir, { recursive: true });
            const name = `step-${index + 1}-${evidenceIndex + 1}-${kind}.png`;
            const edited = await storage.image(captureId, kind);
            if (!edited.dataUrl) throw new Error("Screenshot unavailable");
            await fs.writeFile(
              path.join(dir, name),
              Buffer.from(edited.dataUrl.split(",")[1], "base64"),
            );
            text += `![${JSON.parse(row.metadata).trigger === "manual" ? "Manual screenshot" : kind === "before" ? "Before click" : "After click"}](${encodeURIComponent(assets)}/${name})\n\n`;
          }
      }
    }
    if (guide.demo) text += "---\nSample workflow. Screens are illustrative.\n";
    const temporary = `${result.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, text, "utf8");
    await fs.rename(temporary, result.filePath);
    return true;
  });
}
module.exports = { registerIPC };
