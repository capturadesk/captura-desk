export type Annotation = {
  kind: "highlight" | "redact";
  x: number;
  y: number;
  width: number;
  height: number;
};
import type { Project } from "./workspace";
export type AIProvider = "openai" | "anthropic";
export type AIDefaults = { provider: AIProvider; model: string };
export type AITarget = { workspaceId: string; projectId: string; guideId: string };
export type AIConnections = {
  encryptionAvailable: boolean;
  providers: { provider: AIProvider; connected: boolean }[];
};
export type AIDraft = AIDefaults & {
  id: string;
  createdAt: number;
  output: {
    format?: "document";
    title: string;
    description: string;
    steps: {
      captureId: string;
      captureIds?: string[];
      title: string;
      description: string;
      needsReview: boolean;
    }[];
  };
};
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
    annotations?: { before?: Annotation[]; after?: Annotation[] };
    trigger?: "manual";
    point: { x: number; y: number } | null;
    clickedAt: number;
    before: { capturedAt: number; width: number; height: number } | null;
    after: { capturedAt: number; width: number; height: number } | null;
  };
};
export interface Desktop {
  aiConnections: () => Promise<AIConnections>;
  aiSaveKey: (provider: AIProvider, key: string) => Promise<AIConnections>;
  aiRemoveKey: (provider: AIProvider) => Promise<AIConnections>;
  aiModels: (provider: AIProvider) => Promise<string[]>;
  aiDefaults: (workspaceId: string) => Promise<AIDefaults>;
  aiSaveDefaults: (input: AIDefaults & { workspaceId: string }) => Promise<AIDefaults>;
  aiDrafts: (input: AITarget) => Promise<AIDraft[]>;
  aiRefine: (input: AITarget & AIDefaults & { instruction: string }) => Promise<AIDraft>;
  aiGenerate: (
    input: AITarget & AIDefaults & { captureIds: string[] },
  ) => Promise<AIDraft>;
  aiApply: (input: {
    workspaceId: string;
    draftId: string;
  }) => Promise<{ projects: Project[]; guideId: string }>;
  aiState: () => Promise<{ busy: boolean; phase: string }>;
  aiCancel: () => Promise<void>;
  platform: string;
  backupWorkspace: (id: string) => Promise<boolean>;
  restoreWorkspace: () => Promise<WorkspaceSelection | null>;
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
  deleteDocument: (
    workspaceId: string,
    projectId: string,
    guideId: string,
  ) => Promise<{ projects: Project[] }>;
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
  captureNow: () => Promise<RecordingState>;
  pauseRecording: () => Promise<RecordingState>;
  resumeRecording: () => Promise<RecordingState>;
  stopRecording: () => Promise<RecordingResult>;
  showWorkspace: () => Promise<void>;
  onRecordingState: (callback: (state: RecordingState) => void) => () => void;
  onRecordingFinished: (callback: (result: RecordingResult) => void) => () => void;
  annotationRead: (id: string, frame: "before" | "after") => Promise<CaptureImage>;
  annotationSave: (input: {
    id: string;
    frame: "before" | "after";
    boxes: Annotation[];
  }) => Promise<void>;
  captureImage: (id: string, frame: "before" | "after") => Promise<CaptureImage>;
  exportHTML: (input: { projectId: string; guideId: string }) => Promise<boolean>;
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
