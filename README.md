# Captura Desk

A local Windows workflow recorder with an Electron desktop shell, React, TypeScript, and shadcn/ui.

See the [changelog](CHANGELOG.md) for recent features and fixes.

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
5. Click **Finish**. Review the captured steps and their **Before click** / **After click** screenshots, then edit the instructions. Click a screenshot to enlarge it; use **Zoom in/out**, **Actual size**, or **Fit to window**. Scroll to explore enlarged images and press **Escape** to close the viewer.
6. Choose **Export > HTML - single file** for a document with formatted Markdown and embedded screenshots that opens offline in a browser. Share just the `.html` file. **Markdown with images** remains available and writes a Markdown file plus a screenshot folder; share both together.

Recording and editing stay local. No capture runs before you start or while paused. AI generation is optional and sends only explicitly selected captures, project instructions, and the recording title/description to your chosen provider. The original sample payment guide remains clearly labeled as sample content.

The floating bar shows the recorded display, accepted clicks, and received click events. If clicks are excluded, it explains why. Captura Desk may remain open behind the application being recorded; overlapping its window does not prevent screenshots.

To delete a recording, select it in the document dropdown, open **Recording options** (the three-dot button beside the document selector), and choose **Delete recording**. Confirming permanently removes its documentation and original captures; the project and exported files remain. Finish any active recording before deleting.

Open the workspace dropdown at the top left and choose **Workspace settings** to rename or delete the current workspace. Deletion requires confirmation and removes all its projects, recordings, documentation, and original captures; exports remain. Captura Desk switches to another workspace afterward. Create a replacement before deleting your last workspace. Finish any recording before changing workspace settings.

## AI documentation

1. Open **AI providers** in the sidebar. Choose OpenAI or Anthropic (Claude), enter your own API key, save it, and use **Test connection**. Keys are encrypted with Electron safeStorage on this device; they are shared across workspaces and can be removed here.
2. Open **Workspace settings**, choose the default provider, and enter a model ID. **Load models** opens a searchable, scrollable list of models returned by your account. Choose one supporting image inputs and structured output, or enter its ID directly. Use **Browse models** to reopen the list. Save AI defaults.
3. Open a real recording and click **Generate documentation**. Preview captures, exclude sensitive ones, and confirm the provider disclosure. Select up to 200 captures per draft. Larger selections use batches of up to 20 captures and a final text-only merge; multiple requests may increase time and cost.
4. Generate and review the draft. Uncertain steps are marked for review. **Save as new document** preserves the original and creates an editable document containing the selected steps. Saved drafts can be reopened from the source recording after restart.

API requests go directly from the desktop main process to the selected provider. Provider API billing and retention policies apply. Image copies are resized for analysis; originals stay unchanged. No automatic provider fallback or retry is performed. Cancellation stops the local request but cannot undo data already sent or guarantee that the provider stops billing. Use **Annotate screenshot** in the enlarged viewer to redact sensitive regions before generation; review both before and after frames.

## Implemented

- Display selection and global mouse-down capture in a separate helper process.
- Sampled pre-click and delayed post-click screenshots with timestamps and click markers.
- Floating recording controls, pause/resume, capture review, and native export with images.
- SQLite workspace/session storage, progressive capture writes, and interrupted-session recovery.
- Typed preload methods, validated IPC, isolated renderer, and sandboxing.
- Local project instructions, editable documents, undo, and migration of prototype data.
- OpenAI/Anthropic connections, workspace AI defaults, selected-capture generation, and durable draft review.

Images and the SQLite database live in Electron's per-user application data directory. Removing a document step excludes it from the document/export but retains the original capture. Deleting its project also removes original capture files; locked files are queued for cleanup at the next launch. Individual-capture deletion controls are still planned.

Captura Desk stores its database in `%APPDATA%\captura-desk` and screenshots in `%APPDATA%\captura-desk\captures`. Older data directories and browser keys are not migrated or deleted. Development uses `CAPTURADESK_DEV_URL`; tests use `CAPTURADESK_TEST_DATA` to select isolated profiles. Previous environment-variable names are no longer supported.

This is a working local recording milestone, not a release-ready product. Individual-window capture, OCR, PDF export, signing, and automatic updates are not implemented. A local Windows x64 installer build is available; clean-machine installation and upgrade qualification are still required. Mixed-DPI configurations, elevated applications, protected content, and long-running sessions need further platform qualification. The before-frame is sampled, not guaranteed to be the exact frame immediately before the click.

## Development checks

```sh
npm run check
npm run build
npm run test:desktop
```

For an isolated AI UI test using mocked provider transport (no external calls):

```sh
npm run test:ai
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
- [AI integration](docs/ai.md): credentials, provider adapters, draft lifecycle, limits and tests.
- [Troubleshooting](docs/troubleshooting.md): recording diagnostics and safe investigation.

To ask AI to revise a document, type a request such as **Make this shorter** in the refinement box below it. Click the arrow, review what will be sent, then choose **Suggest edits**. Review the draft and **Save as new document** to preserve the original. Refinement sends text only and supports 1-200 steps.

Generated documents have a **Delete document** action in the three-dot menu. It removes only that revision and keeps the original recording, shared screenshots and other revisions. On the original document, **Delete recording** removes the recording and all its derived documents.

Revision labels are separate from document titles: **Original**, **Revision 1 - AI draft**, then **Revision 2 - Make this shorter**. Each saved revision shows its creation date and source revision. Use **the three-dot menu > Rename revision** to change the label. Numbers are scoped to the original recording and are not reused after deletion. Existing revisions receive numbers in their stored order; unknown historical dates and parent revisions remain blank. Exports use the document title.

## Sharing a document

HTML export uses the currently selected revision and saves any pending text edits first. Screenshots include saved highlights and redactions, with all cited sources and available before/after frames embedded. It needs no internet connection or Captura Desk installation to read. Raw HTML in descriptions is ignored and external Markdown images are placeholders. You can also print the file from a browser. Exports containing more than 128 MiB of embedded image data are rejected; use a shorter document.

## Screenshot annotations

Enlarge a screenshot and choose **Annotate screenshot**. Select **Redact** or **Highlight**, then drag a rectangle. Use **Undo box** or **Clear boxes** to revise your edits, then **Save screenshot edits**. Cancel leaves saved edits unchanged. Edits apply to that frame across all revisions sharing the capture. Before and after frames are separate.

Saved annotations are flattened into images used by the viewer, AI generation, and Markdown export. Original PNGs remain locally available in the editor. Redactions do not remove sensitive text already present in documentation or previously generated AI drafts, sent requests, or exported files.

In **Review AI draft**, expand **Compare with current document** to see the title, summary, and steps side by side. Removed passages are struck through and proposed passages are underlined. **Show only changes** hides unchanged fields and steps. Excluded steps are identified explicitly; saving still creates a separate document. Comparison works for new and reopened drafts, using the current editor document; saving a stale draft remains blocked.

Use **Manage steps** beside the workflow list to reorder with drag handles or Move up/down buttons. Select individual steps or **Select all**, then **Remove selected** and confirm. **Undo step change** restores recent changes while the manager is open; the editor also retains its latest-change Undo. Changes save automatically, affect only the current document, and preserve original screenshot files. The resulting order is used by AI generation and exports.

New recordings identify the application under each click, producing step titles such as **Click on Google Chrome**. The capture label also retains the display name. Known applications receive friendly names; others use the executable basename. If Windows cannot identify the process, the display name is used. Window titles, browser tab titles, and executable paths are not stored. Older recordings and manually edited titles remain unchanged.

While recording, choose **Capture now** on the floating toolbar or press **Ctrl+Shift+S** to capture the selected display without a mouse click. Manual steps contain one screenshot and no click marker. The shortcut is registered only while recording; if another app owns it, use the toolbar button. Pause disables manual capture too.

## Workspace backup and restore

Open **Workspace settings > Back up workspace** to save a `.captura-backup` file. It contains projects, documents and revisions, original screenshots, annotations, saved AI drafts, model defaults, and revision counters. API keys are excluded. Backups are not encrypted and include originals beneath redactions; keep them private.

Choose **Restore backup** to create and switch to a separate workspace with a unique name. Existing workspaces remain unchanged; configure provider keys separately on a new device. Restore validates the format, references, and screenshot checksums before applying data. The current format supports up to 128 MiB of screenshot files and a 256 MiB backup file. Finish recording and AI generation before either operation.

## Let your prompt shape the document

Project instructions now control the purpose and structure of generated documentation, without choosing a separate mode. For example: **Summarize the information visible on these screens. Group findings by region, preserve figures and units, and do not describe navigation.** AI can produce up to 200 sections from up to 200 selected captures using batching, combining screenshots or reusing them across sections. Use **View sources for section** in draft review and **Source 1 / Source 2** in the editor to inspect supporting images. Refinement requests can reorganize sections too, using document text without uploading images again. Exports include every cited screenshot. Older guides and drafts remain readable.

## Markdown editing

Click or tab into a document summary or step description to edit its raw Markdown. Click or tab away to see formatted headings, tables, lists, and checklists. Changes save automatically; the exact Markdown source is preserved for exports and backups. AI drafts render the same formatting. Raw HTML is ignored, remote Markdown images display as placeholders, and preview links do not navigate away from your document. Captured screenshots remain available through the source viewer.

## Application icon

The source artwork is `assets/icon.png`. After replacing it with a square PNG, run `npm run icon:generate` to regenerate the multi-size Windows icon at `assets/icon.ico`, then restart the app. The desktop windows use this icon; the custom title bar and browser preview use the source PNG. The Windows executable and installer use the same `.ico` file; the development Electron executable itself is unchanged.

## Windows installer

Run `npm run dist:win` on Windows x64 to produce the installer and SHA-256 checksum under `release/`. Run `npm run test:packaged` to verify the packaged executable. Builds are unsigned unless signing is explicitly configured, and never publish automatically. Installation is per-user; uninstall is configured to preserve workspaces and recordings. See [Windows release process](docs/windows-release.md) for native recording tests, signing, manual updates, and clean-machine qualification.
