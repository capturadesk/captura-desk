# Local recorder architecture

Status: Windows recorder with optional OpenAI/Anthropic draft generation, September 2026. Release packaging is not implemented.

See the [codebase map](codebase-map.md) for source ownership and a recording walkthrough, and the [data model](data-model.md) for schema relationships and retention rules.

## Boundaries

```text
React + shadcn/ui
  | typed preload methods (src/lib/desktop.ts)
  v
Validated IPC (electron/ipc.cjs + contracts.cjs)
  |                     |
  v                     v
SQLite + image files    Recorder state machine
                        |
                        v
                        Windows capture adapter
                        |                  |
                        v                  v
                        desktopCapturer    isolated utility process
                                           uiohook-napi mouse events
```

- The renderer has no Node, raw filesystem, or arbitrary IPC access. Sender identity, main-frame identity, and origin are checked. The floating toolbar is authorized only for recording controls and status.
- Zod validates incoming workspace, recording, export, and image requests. Image reads use stored capture IDs, never renderer-provided paths.
- React hooks own persistence and recording subscriptions. The editor consumes stored captures through `CaptureView` and keeps demo data explicitly labeled.
- `Recorder` depends on injected storage and platform adapters. Tests can exercise its behavior without installing a hook or capturing a desktop.
- The native mouse hook runs in an Electron utility process. Only mouse-down coordinates, button, and timestamp are forwarded. Keyboard events and modifiers are not forwarded or stored. Unexpected helper exits pause recording.

The design follows [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). Native hook support uses the [uiohook-napi API](https://github.com/SnosMe/uiohook-napi), isolated with [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process).

## Capture lifecycle

1. User chooses a display and explicitly starts recording. The selector defaults to the display containing the main window. Identify displays shows temporary, noninteractive labels; starting a recording removes them. The toolbar is placed on the recorded display. No hook or screenshot sampling runs while idle.
2. The adapter samples the display approximately every 650 ms, keeping only the latest pre-click frame in memory. Completion timestamps are approximate, not hardware presentation timestamps.
3. A mouse-down inside the selected display creates a durable capture record immediately. Coordinates are converted from Windows physical pixels to Electron display coordinates, then normalized to the selected display.
4. The latest preceding frame is saved when available and no more than two seconds old. A second frame is requested about 350 ms after the click. The timing is shown in review; it does not claim the application has finished loading.
5. Rapid clicks retain distinct event records but can share a sampled frame. At 12 pending capture jobs, the recorder pauses and reports the missed triggering click. There is no silent drop policy.
6. Pause clears the cached frame, stops scheduling screenshots, and rejects mouse events. A frame already requested may complete in memory but is not persisted as an after-frame following pause. Pre-click writes already accepted can finish.
7. Finish detaches the hook, drains accepted writes, and creates an editable document from saved evidence. No AI action descriptions are fabricated.

Clicks are excluded only when Windows `WindowFromPoint` / `GetAncestor` identifies a Captura Desk window as the actual target. These APIs are called through Koffi; overlapping bounds alone never suppress another application's clicks. The main window minimizes on start; an always-on-top toolbar provides pause, resume, finish, and return-to-workspace actions. The toolbar requests Windows capture protection. Screen locking and sleep pause the session. Display changes require finishing and selecting the display again.

The toolbar shows the chosen display and the number of hook events received, separately from accepted captures. Filtered clicks produce a specific explanation (another display or Captura Desk controls). Empty completed sessions persist a reason rather than silently appearing successful.

[Electron screen capture](https://www.electronjs.org/docs/latest/api/desktop-capturer) enumerates display thumbnails. The adapter retains and writes only the selected display's image. The API can return differently sized thumbnails; coordinate overlays use normalized positions and actual image dimensions rather than assuming the requested size was returned. See [DesktopCapturerSource](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source).

## Storage and recovery

Data lives under Electron's `app.getPath('userData')`:

- `workspace.sqlite`: schema version, editable workspace, original sessions, and capture metadata.
- `captures/<capture-id>-before.png` and `-after.png`: original image evidence.

SQLite uses WAL, full synchronous durability, foreign keys, and versioned transactional initialization. New schema changes must increment `user_version` with a migration; do not rewrite an existing migration. A newer unsupported database version blocks startup rather than resetting data.

Workspace data is currently a validated JSON document inside SQLite; sessions and captures are separate relational tables. This deliberately keeps the first milestone simple. Move project/document editing to per-record updates if workspace size makes whole-document saves measurably expensive.

Image writes use a temporary file, flush, rename, then metadata commit. The filesystem and database cannot share one atomic transaction. A crash can leave an unreferenced image or temporary file; those are retained rather than silently deleted. A future maintenance tool can reconcile them with explicit retention rules.

Sessions left active on startup become interrupted sessions. Completed capture rows become a recovered document exactly once. Missing frames remain visible as incomplete evidence. Recovery never invents screenshots. Removing a document step leaves its original capture intact so undo and source evidence remain available.

Existing prototype localStorage is imported only if no SQLite workspace exists. Local browser preview still uses localStorage and cannot record. The original localStorage data is retained during migration.

## Export

The main process loads the saved document by ID, presents the native Save dialog, writes its Markdown, and copies referenced images into a uniquely named sibling asset folder. Share both the Markdown and its asset folder. Edits are flushed before opening export. Removed steps are excluded from exports.

Single-file HTML export uses `electron/export-html.cjs` to render Markdown with React static markup and embed edited PNG data URLs. It shares `storage.image` with the viewer, so redactions are flattened. Raw HTML and remote images are excluded, and a restrictive CSP disables scripts and external resource loading. The export is written to a temporary file and renamed only after completion.

## Verification and scope

- Unit tests: state transitions, ordering, pause exclusion, pending writes, queue limits, capture/disk failures, recovery, schema validation, and source/document separation.
- Desktop smoke: Electron isolation, editing, durable reload, project instructions, project creation/deletion, undo, native export, workspace rename/deletion/cancel and last-workspace protection.
- Real recording smoke: controlled Windows window, native mouse injection guarded by window ownership at the click coordinates, real before/after screenshots, pause/resume, review, persistence, and export with images.
- CI runs type checks, formatting, unit tests, production build, and the non-recording desktop smoke. The real recording test is explicit and requires an interactive Windows desktop.

Remaining release checks: mixed-DPI monitors (125%, 150%, 200%), negative display origins, long sessions and storage pressure, UAC/elevated apps, protected content, remote desktops, installer behavior, signing, and updates. Display-source selection currently supports monitors, not individual application windows. No standalone OCR, individual capture-deletion UI, or semantic deduplication is implemented yet.

## Workspaces and deletion (schema version 4)

The v1-to-v2 transaction migrates the original workspace into `workspaces` as `personal`, assigns existing sessions to it, and persists the active workspace in `settings`. Workspace saves carry an explicit workspace ID so delayed writes cannot affect another workspace. New workspaces start empty. Workspace creation and switching are disabled during recording.

Confirmed project deletion removes its workspace entry, sessions, and capture metadata in one transaction. It also adds exact capture filenames to `pending_file_deletions`. Files are unlinked afterward, and failures remain queued for a later cleanup; the UI reports pending cleanup. A deletion tombstone prevents a stale workspace save from restoring the project. The source files for other workspaces and external exports are never included. Removing a document step continues to retain the original evidence; deleting its entire project removes that evidence.

Captura Desk uses `%APPDATA%\captura-desk` for user data. Older data directories are left untouched and are not migrated. The new directory starts fresh on first launch; `CAPTURADESK_TEST_DATA` overrides this path for isolated test profiles.

The v2-to-v3 migration adds recording tombstones. Confirmed recording deletion removes its document, session, and all original captures in a transaction, queues exact image filenames for cleanup, and blocks stale saves from restoring the recording. It preserves other recordings, the project, and external exports. Recording deletion is disabled while a recording is active.

Workspace settings rename the current workspace or delete it after confirmation. Workspace deletion atomically removes its row, sessions, captures and tombstones, queues exact filenames, and switches the active selection to a remaining workspace when needed. Deleting the last workspace is rejected. Delayed saves to a deleted workspace fail existence validation. These operations use the v3 tables without a new migration and require an idle recorder at the IPC boundary.

Optional AI generation now uses selected captures to create persistent drafts through OpenAI or Anthropic. Saving a draft creates a separate document and preserves manual edits in the original. See [AI integration](ai.md) for credential storage, request boundaries and validation. Next milestones include richer retention controls and live-provider quality evaluation.

Markdown source remains in existing document and section description fields. `markdown-editor.tsx` switches between a controlled Markdown textarea on focus and a formatted preview on blur. It preserves the exact source string without rich-text normalization. `markdown-preview.tsx` is shared with draft review. It uses [react-markdown](https://github.com/remarkjs/react-markdown) and [remark-gfm](https://github.com/remarkjs/remark-gfm) for rendering tables, lists, and other Markdown syntax. Raw HTML is skipped, Markdown image nodes render as placeholders without fetching URLs, and links cannot navigate the Electron renderer. Captured evidence images continue through the separate capture viewer. Exports preserve source Markdown without HTML conversion.
