import type { Project } from "./workspace";
export type DisplaySource = {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  recommended: boolean;
};
export type RecordingState = {
  status: "idle" | "starting" | "recording" | "paused" | "stopping";
  count: number;
  failed: number;
  error: string | null;
  sessionId: string | null;
  startedAt: number | null;
  projectId: string | null;
  displayName: string | null;
  seen: number;
  ignoredOwn: number;
  ignoredOutside: number;
  hint: string | null;
};
export type RecordingResult = {
  sessionId: string;
  projectId: string;
  projects: Project[];
};
export type CaptureImage = {
  dataUrl: string | null;
  error: string | null;
  metadata: {
    point: { x: number; y: number };
    clickedAt: number;
    before: { capturedAt: number; width: number; height: number } | null;
    after: { capturedAt: number; width: number; height: number } | null;
  };
};
export interface Desktop {
  platform: string;
  loadWorkspace: () => Promise<Project[] | null>;
  initializeWorkspace: (projects: Project[]) => Promise<Project[]>;
  saveWorkspace: (workspaceId: string, projects: Project[]) => Promise<boolean>;
  listWorkspaces: () => Promise<WorkspaceCatalog>;
  createWorkspace: (name: string) => Promise<WorkspaceSelection>;
  selectWorkspace: (id: string) => Promise<WorkspaceSelection>;
  renameWorkspace: (id: string, name: string) => Promise<WorkspaceSelection>;
  deleteWorkspace: (
    id: string,
  ) => Promise<WorkspaceSelection & { cleanupPending: boolean }>;
  deleteProject: (
    workspaceId: string,
    projectId: string,
  ) => Promise<{ projects: Project[]; cleanupPending: boolean }>;
  listDisplays: () => Promise<DisplaySource[]>;
  deleteRecording: (
    workspaceId: string,
    projectId: string,
    guideId: string,
  ) => Promise<{ projects: Project[]; cleanupPending: boolean }>;
  identifyDisplays: () => Promise<void>;
  recordingState: () => Promise<RecordingState>;
  startRecording: (input: {
    projectId: string;
    name: string;
    context: string;
    displayId: string;
  }) => Promise<RecordingState>;
  pauseRecording: () => Promise<RecordingState>;
  resumeRecording: () => Promise<RecordingState>;
  stopRecording: () => Promise<RecordingResult>;
  showWorkspace: () => Promise<void>;
  onRecordingState: (callback: (state: RecordingState) => void) => () => void;
  onRecordingFinished: (callback: (result: RecordingResult) => void) => () => void;
  captureImage: (id: string, frame: "before" | "after") => Promise<CaptureImage>;
  exportMarkdown: (input: { projectId: string; guideId: string }) => Promise<boolean>;
}
export type WorkspaceCatalog = {
  activeId: string;
  workspaces: { id: string; name: string }[];
};
export type WorkspaceSelection = { catalog: WorkspaceCatalog; projects: Project[] };
declare global {
  interface Window {
    desktop?: Desktop;
  }
}
export const idleRecording: RecordingState = {
  status: "idle",
  count: 0,
  failed: 0,
  error: null,
  sessionId: null,
  startedAt: null,
  projectId: null,
  displayName: null,
  seen: 0,
  ignoredOwn: 0,
  ignoredOutside: 0,
  hint: null,
};
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : "Something went wrong. Please try again.";
}
