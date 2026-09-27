# Development workflow

Keep each change runnable and focused on one behavior. Preserve the UI conventions and use the existing shadcn/ui components.

Start with the [codebase map](codebase-map.md), [recording walkthrough](codebase-map.md#walkthrough-start-a-recording-and-review-it), and [data model](data-model.md).

## Before making a change

- Identify whether the change belongs in UI, storage, recording, or platform integration.
- Update the typed preload contract and runtime validation together when adding an IPC method.
- Keep operating-system dependencies out of React and the recorder state machine.
- Document changes to capture timing, retention, permissions, or storage format in the architecture document.

## Required checks

```sh
npm run check
npm run build
npm run test:desktop
```

`check` runs TypeScript (including unused code checks), unit tests, and Prettier checks. Unit tests use temporary databases; desktop tests use isolated profiles under `.electron-test`.

For changes to the Windows adapter, also run:

```sh
npm run test:recording
```

This opens a dedicated target application and temporarily moves the mouse to click that target. It checks window ownership before clicking and restores the pointer afterward. Run on an interactive Windows desktop, with other work paused. Screenshots and exports are written to ignored `artifacts/`; test workspace images are under ignored `.electron-test/`. Do not commit these files.

For a new recording bug, add a deterministic regression test to `tests/recorder.test.cjs` where possible. Use native integration tests for behavior that depends on Windows, not for simple editor changes.

## Dependencies and release work

- Commit `package-lock.json`; use `npm ci` in CI and clean installs.
- Keep native dependencies behind adapters and recheck them after Electron upgrades.
- Do not ship credentials, user screenshots, or captured content in logs or test fixtures.
- The current app is a development build, not an installer-ready release. Signing, installer packaging, update integrity, backup/restore, and broader retention/redaction controls need their own reviewed milestone. Workspace, project, and recording deletion are implemented; see [retention rules](data-model.md#what-deletion-means).

## Keeping documentation useful

Record notable user-facing changes in [CHANGELOG.md](../CHANGELOG.md) under **Unreleased**. Assign a version and date only when publishing that release.

- Update documentation in the same change as behavior. Capture timing and platform boundaries belong in `architecture.md`; persistence, migration and deletion rules belong in `data-model.md`; module responsibilities belong in `codebase-map.md`; user instructions belong in the README.
- Comment assumptions, ownership and failure behavior near the code that enforces them. Avoid narrating obvious statements or duplicating TypeScript signatures. Use JSDoc when a caller needs a non-obvious contract, especially side effects or error behavior.
- Link to the source and relevant regression tests instead of copying complete schemas or method listings into prose. Keep examples free of real recordings, private screenshots and credentials.
- Distinguish implemented behavior from planned work. Check relative links and run `npm run format:check` for documentation-only changes. Comments alone do not require native capture tests; use the behavior checks above when executable code changes.

## AI changes

Run `npm run test:ai` for provider settings and draft UI changes, in addition to unit tests and the build. It injects mocked transport only into its isolated Electron process; it makes no external API calls. Unit tests inject provider and encryption dependencies. Never use real user captures or API keys in fixtures.

For provider protocol changes, verify the official docs linked in [AI integration](ai.md). Live API testing requires a deliberately configured account and reviewed test captures; mocked tests do not establish live model quality or account compatibility. Record that distinction in validation results. Documentation-only edits do not require billed requests.
