# Troubleshooting local recordings

Start with the floating toolbar's display name, received-event count and exclusion hint. The accepted-click count means a capture row exists; it does not guarantee that both image files are already saved. See the [recording walkthrough](codebase-map.md#walkthrough-start-a-recording-and-review-it).

| Symptom                        | Check first                                                                                                                                                                               | Code to inspect                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| No received clicks             | Confirm recording is active, not paused, and check any startup/helper error. Finish and start a new session.                                                                              | `hook-worker.cjs`, `WindowsCapture.start`, `Recorder.start`        |
| Clicks received but none saved | Read the exclusion hint. Use **Identify displays** in the next recording setup and select the monitor containing the target app. Actual Captura Desk controls are intentionally excluded. | `WindowsCapture.classify`, `window-hit-test.cjs`, `Recorder.click` |
| A frame is unavailable         | Check capture errors and whether pause/finish occurred before the delayed after-frame completed. Before-frames can be absent when the cached sample is too old.                           | `Recorder.saveClick`, `Storage.saveFrame`, `CaptureView`           |
| Recording pauses unexpectedly  | Read the toolbar error: helper failure, capture/storage failure, excessive pending jobs, sleep/lock, or display configuration changes can cause a pause.                                  | `Recorder.fail`, `main.cjs` power/display handlers                 |
| Deleted content returns        | Verify the dedicated deletion IPC was used; removing a session-backed document from JSON alone allows recovery to merge it back.                                                          | `Storage.mergeSessions`, `saveWorkspace`, deletion methods         |
| Cleanup remains pending        | Close applications holding the capture files and restart Captura Desk to retry queued cleanup.                                                                                            | `Storage.cleanupDeletedFiles`, startup in `main.cjs`               |
| Workspace changes fail         | Finish any active recording. Check duplicate names, empty names, and the last-workspace deletion rule.                                                                                    | Workspace settings, `ipc.cjs`, `Storage`                           |
| New controls are missing       | Close the running app and launch `npm start` from the source directory to rebuild and load main-process changes.                                                                          | `scripts/start.mjs`, `package.json`                                |

## Safe investigation

- Reproduce with the isolated profiles used by `npm run test:desktop` or `npm run test:recording`. The latter opens a target window and moves the mouse; use an interactive desktop without other mouse activity.
- Useful diagnostic metadata includes session status/error, selected display bounds and scale, received/accepted/excluded counts, and capture frame presence. Toolbar counters are live state; they are not all persisted in the session row.
- Avoid collecting screenshots, task text, document content or full database dumps just to diagnose a hook or display issue. User data is under `%APPDATA%\captura-desk`.
- If inspecting a real database, use a read-only SQLite connection. Constructing `Storage` performs migrations and recovery writes. Do not reset the database or delete captures as a debugging shortcut.
- Mixed-DPI layouts, negative display origins, elevated applications, protected content and remote desktops still need further platform qualification; record the relevant environment when reproducing failures.

See [development workflow](development.md) for test commands and [data model](data-model.md) for recovery and retention details.
