const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  aiConnections: () => ipcRenderer.invoke("ai:connections"),
  aiSaveKey: (provider, key) => ipcRenderer.invoke("ai:key", { provider, key }),
  aiRemoveKey: (provider) => ipcRenderer.invoke("ai:remove-key", provider),
  aiModels: (provider) => ipcRenderer.invoke("ai:models", provider),
  aiDefaults: (workspaceId) => ipcRenderer.invoke("ai:defaults", workspaceId),
  aiSaveDefaults: (input) => ipcRenderer.invoke("ai:save-defaults", input),
  aiDrafts: (input) => ipcRenderer.invoke("ai:drafts", input),
  aiRefine: (input) => ipcRenderer.invoke("ai:refine", input),
  aiGenerate: (input) => ipcRenderer.invoke("ai:generate", input),
  aiApply: (input) => ipcRenderer.invoke("ai:apply", input),
  aiState: () => ipcRenderer.invoke("ai:state"),
  aiCancel: () => ipcRenderer.invoke("ai:cancel"),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  initializeWorkspace: (projects) => ipcRenderer.invoke("workspace:initialize", projects),
  saveWorkspace: (workspaceId, projects) =>
    ipcRenderer.invoke("workspace:save", { workspaceId, projects }),
  listWorkspaces: () => ipcRenderer.invoke("workspaces:list"),
  createWorkspace: (name) => ipcRenderer.invoke("workspaces:create", name),
  selectWorkspace: (id) => ipcRenderer.invoke("workspaces:select", id),
  renameWorkspace: (id, name) => ipcRenderer.invoke("workspaces:rename", { id, name }),
  deleteWorkspace: (id) => ipcRenderer.invoke("workspaces:delete", id),
  deleteProject: (workspaceId, projectId) =>
    ipcRenderer.invoke("project:delete", { workspaceId, projectId }),
  listDisplays: () => ipcRenderer.invoke("recording:displays"),
  deleteDocument: (workspaceId, projectId, guideId) =>
    ipcRenderer.invoke("document:delete", { workspaceId, projectId, guideId }),
  deleteRecording: (workspaceId, projectId, guideId) =>
    ipcRenderer.invoke("recording:delete", { workspaceId, projectId, guideId }),
  identifyDisplays: () => ipcRenderer.invoke("recording:identify"),
  recordingState: () => ipcRenderer.invoke("recording:state"),
  startRecording: (input) => ipcRenderer.invoke("recording:start", input),
  captureNow: () => ipcRenderer.invoke("recording:capture"),
  pauseRecording: () => ipcRenderer.invoke("recording:pause"),
  resumeRecording: () => ipcRenderer.invoke("recording:resume"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  showWorkspace: () => ipcRenderer.invoke("recording:show"),
  onRecordingState: (callback) => subscribe("recording:state", callback),
  onRecordingFinished: (callback) => subscribe("recording:finished", callback),
  annotationRead: (id, frame) =>
    ipcRenderer.invoke("capture:annotation-read", { id, frame }),
  annotationSave: (input) => ipcRenderer.invoke("capture:annotation-save", input),
  captureImage: (id, frame) => ipcRenderer.invoke("capture:image", { id, frame }),
  exportMarkdown: (input) => ipcRenderer.invoke("export-markdown", input),
});
