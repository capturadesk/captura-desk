const { contextBridge, ipcRenderer } = require("electron");
const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
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
  deleteRecording: (workspaceId, projectId, guideId) =>
    ipcRenderer.invoke("recording:delete", { workspaceId, projectId, guideId }),
  identifyDisplays: () => ipcRenderer.invoke("recording:identify"),
  recordingState: () => ipcRenderer.invoke("recording:state"),
  startRecording: (input) => ipcRenderer.invoke("recording:start", input),
  pauseRecording: () => ipcRenderer.invoke("recording:pause"),
  resumeRecording: () => ipcRenderer.invoke("recording:resume"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  showWorkspace: () => ipcRenderer.invoke("recording:show"),
  onRecordingState: (callback) => subscribe("recording:state", callback),
  onRecordingFinished: (callback) => subscribe("recording:finished", callback),
  captureImage: (id, frame) => ipcRenderer.invoke("capture:image", { id, frame }),
  exportMarkdown: (input) => ipcRenderer.invoke("export-markdown", input),
});
