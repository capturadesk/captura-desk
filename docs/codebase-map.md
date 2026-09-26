# Codebase map

Start with [running the app](../README.md), then use this map to locate a change. See [architecture](architecture.md) for lifecycle rules and [data model](data-model.md) for persistence and deletion.

## Where changes belong

| Area                        | Entry points                                                                                                                           | Responsibility                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Desktop lifecycle           | [main.cjs](../electron/main.cjs)                                                                                                       | Windows, trusted IPC senders, recording toolbar, sleep/lock handling, user-data path            |
| Editor                      | [App.tsx](../src/App.tsx)                                                                                                              | Project/document navigation, editing, step undo, recording setup and confirmation dialogs       |
| Workspace management        | [workspace-switcher.tsx](../src/components/workspace-switcher.tsx), [workspace-settings.tsx](../src/components/workspace-settings.tsx) | Workspace selection, creation, rename and deletion UI                                           |
| UI persistence              | [use-workspace.ts](../src/hooks/use-workspace.ts)                                                                                      | Serialized saves, explicit workspace ownership, flush before mutations, browser preview storage |
| Recording UI                | [use-recording.ts](../src/hooks/use-recording.ts), [recorder-toolbar.tsx](../src/components/recorder-toolbar.tsx)                      | State subscription, recording controls, diagnostics                                             |
| Screenshot review           | [capture-view.tsx](../src/components/capture-view.tsx)                                                                                 | Before/after images and normalized click markers                                                |
| Renderer bridge             | [desktop.ts](../src/lib/desktop.ts), [preload.cjs](../electron/preload.cjs)                                                            | TypeScript API and the narrow methods exposed as `window.desktop`                               |
| IPC                         | [ipc.cjs](../electron/ipc.cjs), [contracts.cjs](../electron/contracts.cjs)                                                             | Sender checks, runtime payload validation, idle guards, native export                           |
| Persistence                 | [storage.cjs](../electron/storage.cjs)                                                                                                 | Schema migrations, recovery, documents, captures, deletion and file cleanup                     |
| Recording engine            | [recorder.cjs](../electron/recording/recorder.cjs)                                                                                     | State transitions, sampling, click acceptance, asynchronous image writes                        |
| Windows integration         | [windows.cjs](../electron/recording/windows.cjs), [window-hit-test.cjs](../electron/recording/window-hit-test.cjs)                     | Display coordinates, screen capture, native window identity                                     |
| Hook process                | [hook-worker.cjs](../electron/recording/hook-worker.cjs)                                                                               | Forward mouse-down events from the native hook                                                  |
| Display labels              | [display-indicators.cjs](../electron/recording/display-indicators.cjs)                                                                 | Temporary monitor identification overlays                                                       |
| UI primitives               | [components/ui](../src/components/ui)                                                                                                  | Shared shadcn/ui components                                                                     |
| Editable models and samples | [workspace.ts](../src/lib/workspace.ts)                                                                                                | Project/guide types, sample data, legacy import and browser Markdown generation                 |

Keep Windows APIs and file access out of React. Keep platform-specific details out of `Recorder`, which receives storage and a platform adapter through its constructor. `App.tsx` currently contains much of the editor orchestration; extract cohesive components as that UI grows.

## Walkthrough: start a recording and review it

1. `App.tsx` requests displays through `window.desktop.listDisplays()`. IPC recommends the monitor containing the main window. The user confirms a display and enters the task/context.
2. Before starting, the editor flushes project edits through `useWorkspace`. This ensures the main process can find the project and its current instructions.
3. `desktop.startRecording(input)` invokes the fixed preload channel. `ipc.cjs` checks the sender, validates `startRecording` with Zod, removes display labels, and calls `Recorder.start`.
4. The recorder creates a session, acquires an initial screen frame, starts the hook helper, and publishes `recording`. `main.cjs` creates the toolbar on the selected display and minimizes the editor.
5. `hook-worker.cjs` forwards mouse-down events. `WindowsCapture` emits them to the recorder. Classification converts physical coordinates to display coordinates, rejects other monitors and actual Captura Desk windows, and normalizes accepted positions.
6. The recorder writes a capture row synchronously, then saves available before/after images asynchronously. The accepted-click counter indicates rows created, not that both PNGs have finished writing.
7. Finish detaches the hook, invalidates pending sampling, and drains accepted save jobs. Storage marks the session complete and merges it into the editable project document if it is not already represented.
8. The `recording:finished` event updates the editor. `CaptureView` requests images by capture ID through the bridge. Editing a step changes the document; it does not rewrite the source capture.

See [capture lifecycle](architecture.md#capture-lifecycle) for timing, pause behavior and failure cases.

## Extending the desktop API

For a new operation, update these together:

1. The `Desktop` interface in `src/lib/desktop.ts`.
2. The fixed preload method in `electron/preload.cjs`.
3. The Zod payload schema in `electron/contracts.cjs`, where an operation accepts data.
4. The handler and appropriate idle/ownership checks in `electron/ipc.cjs`.
5. The storage/recorder implementation, UI caller and relevant tests.

TypeScript types do not validate an IPC message at runtime. Never expose arbitrary channel invocation or renderer-provided filesystem paths. Toolbar access is explicitly restricted by the main-process sender check.

## Tests to consult

| Behavior                                                                           | Existing evidence                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ordering, pause/resume races, failed saves, queue pressure                         | [recorder.test.cjs](../tests/recorder.test.cjs)               |
| Schema migration, recovery, workspace ownership, deletion rollback and stale saves | [storage.test.cjs](../tests/storage.test.cjs)                 |
| Overlapping application windows must not suppress clicks                           | [window-hit-test.test.cjs](../tests/window-hit-test.test.cjs) |
| Editing, undo, export, workspace settings and project deletion                     | [smoke.mjs](../scripts/smoke.mjs)                             |
| Native clicks, display selection, actual screenshots and recording deletion        | [recording-smoke.mjs](../scripts/recording-smoke.mjs)         |

Use [development workflow](development.md) for commands and test isolation. `dist/` is generated output; edit `src/` and rebuild. `prototype-original.html` preserves the initial visual prototype and is not the desktop implementation.
