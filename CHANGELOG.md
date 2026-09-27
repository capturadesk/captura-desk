# Changelog

Notable user-facing changes to Captura Desk are recorded here, newest first. This is a development build; the package version alone does not indicate a published release.

## Unreleased

### Fixed

- Switching steps removes the previous description editor correctly; empty descriptions show an editing prompt.

### Added

- Single-file HTML export with formatted Markdown, embedded annotated screenshots, and selected revision metadata for offline sharing.

- Custom desktop window icon from PNG artwork, with a reproducible multi-size Windows icon conversion command.

- AI generation and refinement support up to 200 sources through sequential batches and a text-only merge, with progress and cancellation.

- Markdown editing for summaries and step descriptions: raw source while focused, formatted content when unfocused, and rendered AI drafts.

- Prompt-shaped AI documents: summaries, reports, tables, or procedures, with multiple source screenshots per section and flexible text refinement.

- Workspace backup and restore preserve recordings, original images, annotations, revisions, saved drafts, AI defaults, and revision counters without API keys. Restore validates backups and creates a separate workspace, with rollback on failure.

- Manual screenshots from the recording toolbar or Ctrl+Shift+S, saved as steps without artificial click markers.

- Application names in newly recorded step titles and AI capture context, with display-name fallback when detection is unavailable.

- Workflow step management with drag-and-drop, Move up/down controls, bulk removal with confirmation, and undo.

- Side-by-side AI draft comparison with marked text changes, changed/unchanged/excluded step status, and a changes-only filter.

- Screenshot highlights and solid redaction rectangles, with undo, clear, and save/cancel controls. Saved edits are flattened into AI inputs and exported images while original captures remain local.

- OpenAI and Anthropic (Claude) integration using your own API keys, encrypted locally with the operating system's credential protection.
- Workspace-specific provider and model defaults, connection testing, and a searchable, scrollable model picker.
- AI documentation from selected captures, with upload review, cancellation, saved drafts, and review before saving a separate document.
- Text-only AI editing requests such as "make this shorter," preserving the original document and screenshot associations.
- Screenshot enlargement with zoom controls, actual-size and fit-to-window views, scrolling, and keyboard dismissal.
- Independent deletion of generated documents while keeping the original recording, screenshots, and other revisions.
- Revision numbers, editable labels, creation dates, and source-revision details. Numbers are scoped to a recording and are not reused after deletion.
- AI integration documentation and automated tests using mocked provider responses.

### Changed

- Original recordings and generated revisions have distinct deletion actions and confirmation messages.
- Existing revisions receive labels in their stored order. Unknown historical dates and parent revisions remain blank.
- AI generation and refinement create separate documents for review; document titles and Markdown exports remain independent of revision labels.

### Fixed

- Long model lists can be scrolled, searched, and navigated with the keyboard.
- AI draft validation associates each returned step with its selected capture without requiring the model to reproduce database IDs.
- Draft source validation compares document content instead of JSON property order, avoiding false "source changed" errors.
- Deleted revisions cannot reappear through delayed workspace saves.

## Initial development baseline

Recorded in commit `7515e6f` (package version `0.2.0`); this is a development milestone, not a published release.

### Added

- Windows desktop app built with Electron, React, TypeScript, and shadcn/ui.
- Workspaces and projects with documentation instructions, workspace settings, and deletion controls.
- Click-triggered recording on a selected display, before/after screenshots, click markers, and floating pause/resume controls.
- Editable workflow steps, step removal with undo, and Markdown export with screenshot assets.
- Local SQLite persistence, interrupted-recording recovery, and capture cleanup when deleting recordings or projects.
- Developer documentation and automated storage, recording, and desktop checks.

### Changed

- Application branding and data directory standardized on Captura Desk and `captura-desk`; development and test variables use the `CAPTURADESK_` prefix.

### Fixed

- Clicks in another application are captured when that application overlaps the Captura Desk window.

## Maintaining this file

Add notable changes under **Unreleased** in the same change as the implementation. Use **Added**, **Changed**, **Fixed**, **Removed**, or **Security** as appropriate; omit empty sections. Describe the effect on users rather than individual commits. When publishing a release, move its entries under the actual version and release date (`YYYY-MM-DD`), then start a new Unreleased section. Do not list planned features as completed work.
