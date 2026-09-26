# Captura Desk

A local Windows workflow recorder with an Electron desktop shell, React, TypeScript, and shadcn/ui.

## Run

Requires Windows and Node.js 22.18+.

```sh
npm ci
npm start
```

`npm run dev` launches the desktop application with Vite hot reload. `npm run dev:web` is an optional browser-only UI preview; screen recording is available only in the Windows desktop app.

## Record a workflow

Use the workspace switcher at the top-left to create or switch between workspaces. Each has its own projects and recordings; the last-used workspace is restored on launch. Existing projects are migrated into **Personal workspace**.

The **⋯** menu on a project card or project header includes **Delete project**. Confirmation permanently removes its documents, sessions, and original captures. Exported files are unaffected. Finish any recording before switching workspaces or deleting a project.

1. Create or select a project and set its documentation instructions.
2. Choose **New recording**, enter the task name, and select a display. The monitor containing Captura Desk is selected initially. Use **Identify displays** to show the display names on your monitors, then select the one containing the application you want to record. The floating recording bar appears on that monitor.
3. Click **Start recording**. Captura Desk minimizes and shows a floating recording bar.
4. Perform the task. Clicks on the selected display are saved with screenshots. Use **Pause** before displaying anything you do not want captured.
5. Click **Finish**. Review the captured steps and their **Before click** / **After click** screenshots, then edit the instructions.
6. **Export** writes a Markdown file and a sibling folder containing its screenshots. Share both together.

Everything stays local. No capture runs before you start or while paused. AI generation is not connected yet; real recordings use neutral step descriptions for you to edit. The original sample payment guide remains clearly labeled as sample content.

The floating bar shows the recorded display, accepted clicks, and received click events. If clicks are excluded, it explains why. Captura Desk may remain open behind the application being recorded; overlapping its window does not prevent screenshots.

To delete a recording, select it in the document dropdown, open **Recording options** (the three-dot button beside the document selector), and choose **Delete recording**. Confirming permanently removes its documentation and original captures; the project and exported files remain. Finish any active recording before deleting.

Open the workspace dropdown at the top left and choose **Workspace settings** to rename or delete the current workspace. Deletion requires confirmation and removes all its projects, recordings, documentation, and original captures; exports remain. Captura Desk switches to another workspace afterward. Create a replacement before deleting your last workspace. Finish any recording before changing workspace settings.

## Implemented

- Display selection and global mouse-down capture in a separate helper process.
- Sampled pre-click and delayed post-click screenshots with timestamps and click markers.
- Floating recording controls, pause/resume, capture review, and native export with images.
- SQLite workspace/session storage, progressive capture writes, and interrupted-session recovery.
- Typed preload methods, validated IPC, isolated renderer, and sandboxing.
- Local project instructions, editable documents, undo, and migration of prototype data.

Images and the SQLite database live in Electron's per-user application data directory. Removing a document step excludes it from the document/export but retains the original capture. Deleting its project also removes original capture files; locked files are queued for cleanup at the next launch. Redaction and individual-capture deletion controls are still planned.

Captura Desk stores its database in `%APPDATA%\captura-desk` and screenshots in `%APPDATA%\captura-desk\captures`. Older data directories and browser keys are not migrated or deleted. Development uses `CAPTURADESK_DEV_URL`; tests use `CAPTURADESK_TEST_DATA` to select isolated profiles. Previous environment-variable names are no longer supported.

This is a working local recording milestone, not a release-ready product. Individual-window capture, AI, OCR, PDF export, an installer, signing, and automatic updates are not implemented. Mixed-DPI configurations, elevated applications, protected content, and long-running sessions need further platform qualification. The before-frame is sampled, not guaranteed to be the exact frame immediately before the click.

## Development checks

```sh
npm run check
npm run build
npm run test:desktop
```

For explicit real Windows capture verification:

```sh
npm run test:recording
```

The recording test opens a controlled target window, verifies the window at the click coordinates, and injects native clicks. It writes local screenshots into ignored test/artifact folders. Run it on an interactive desktop without other mouse activity.

See [architecture](docs/architecture.md) and [development workflow](docs/development.md). `prototype-original.html` preserves the first visual concept.

## Code documentation

- [Codebase map](docs/codebase-map.md): where to make changes, the recording flow, and extending the desktop API.
- [Data model](docs/data-model.md): editable documents versus source captures, schema history, recovery, and deletion rules.
- [Troubleshooting](docs/troubleshooting.md): recording diagnostics and safe investigation.
