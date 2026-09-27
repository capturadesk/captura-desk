# Windows installer and release process

The installer belongs to the desktop repository. The separate website links to published GitHub Releases; it does not build or store installers.

## Build on Windows x64

Use Node.js 22.18 or newer and install dependencies with npm ci. Build:

```powershell
npm run check
npm run dist:win
npm run test:packaged
```

The version in package.json determines the filenames:

- release/CapturaDesk-Setup-<version>-x64.exe: NSIS per-user one-click installer.
- release/CapturaDesk-Setup-<version>-x64.exe.sha256: SHA-256 checksum of the installer.
- release/win-unpacked/Captura Desk.exe: packaged executable for local testing.

For faster iteration, npm run pack:win builds only the unpacked directory. Do not distribute that executable alone: it depends on its sibling resources. All generated release files are ignored by Git. Builds use --publish never and have no updater/publishing configuration.

The installer creates desktop and Start menu shortcuts, does not request elevation, and does not automatically launch the app when it finishes. App ID com.capturadesk.app is stable and must not change between releases. The executable and installer use assets/icon.ico. Branding changes require npm run icon:generate before packaging.

## Native modules and resources

The packaging allowlist includes dist, electron, the icons, package.json, and production dependencies automatically collected by electron-builder. It excludes source recordings, test profiles, exports, build scripts, and developer credentials.

uiohook-napi and koffi use prebuilt Node-API binaries. npmRebuild is disabled intentionally: these packages supply compatible prebuilds, rather than requiring a compiler on the release machine. Their files, including @koromix platform packages, are explicitly unpacked from app.asar so native loaders and the mouse-hook utility process can access them. Changing Electron, architecture, or either native module requires repeating packaged recording tests. Windows ARM64 is not a supported release target yet.

The app loads its packaged renderer and preload using paths relative to electron/main.cjs. SQLite remains Electron's built-in node:sqlite. App data stays in %APPDATA%\captura-desk, outside the installation directory. Installing a packaged copy on a development machine shares that normal data profile; tests instead use isolated CAPTURADESK_TEST_DATA profiles.

## Verify the packaged application

npm run test:packaged launches the actual executable twice against an isolated profile, checks SQLite startup, credential encryption, both native modules, and mouse-hook helper startup, then runs the existing desktop editing/export smoke suite against it. These checks do not prove installation, upgrade, or uninstall behavior on a clean machine.

For a native recording test, close other recording sessions and run on an interactive Windows desktop:

```powershell
$env:CAPTURADESK_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Captura Desk.exe').Path
node scripts/recording-smoke.mjs
Remove-Item Env:CAPTURADESK_EXECUTABLE
```

This opens a test application and generates real mouse clicks on its window. It verifies persisted before/after screenshots, pause/resume, export, deletion, and app-name lookup through the real capture path. It changes cursor position and focus, so do not interact with other applications during the test. Set CAPTURA_TEST_DISPLAY to a zero-based display index if required. CAPTURADESK_EXECUTABLE can also point to an installed copy for isolated smoke checks.

Before a public beta, test in a clean Windows VM or a separate standard-user account:

- Fresh install without Node.js, Git, or developer tools; verify the publisher, app icon, shortcuts, and no administrator requirement.
- Record clicks and manual snapshots, pause/resume, and finish in browser and desktop applications. Check multi-monitor and mixed-DPI setups.
- Save an AI key and generate with a real provider; restart and confirm the key remains usable. Mocked tests do not validate real provider access.
- Export HTML/Markdown, annotate a screenshot, and back up/restore a workspace.
- Upgrade from the previous installer to a higher version; confirm projects, recordings, screenshots, revisions, settings, and encrypted keys survive. Back up the workspace first.
- Uninstall with the app closed. Confirm shortcuts and program files are removed while %APPDATA%\captura-desk is retained; reinstall and verify that data reopens. deleteAppDataOnUninstall is false, and no custom data-deletion hook is included.

## Signing and distribution

Local builds are unsigned unless signing credentials are configured. An unsigned installer can show Unknown publisher and Windows SmartScreen warnings; it is a test artifact, not a signed public release. No certificate or publisher identity has been configured. A checksum detects file changes but does not replace a trusted publisher signature.

Before broad distribution, choose a Windows signing service/certificate and configure electron-builder's Windows signing settings through secured CI environment variables or the certificate store. Do not commit private keys, passwords, or certificate bundles. For the signed release path, require forceCodeSigning=true and verify Authenticode signatures on both the installer and installed executable. Recompute the checksum if an artifact is signed after building. Signing does not guarantee SmartScreen reputation immediately.

The manual Windows installer workflow creates unsigned downloadable Actions artifacts with a limited retention period. It never creates tags or publishes GitHub Releases. After signing and qualification, create a versioned release in capturadesk/captura-desk, attach the installer and checksum, and add release notes including supported Windows versions and known capture limitations. Use the actual repository URL: https://github.com/capturadesk/captura-desk/releases.

Updates are manual for this milestone: download the newer installer, close Captura Desk, and run it. No background updater or update-check network requests are added. Automatic updates are a later feature once signed release and upgrade testing are reliable. Update the website's availability text and download link only after the release exists.

## Starter data and existing installations

The installer packages application code and assets, not the development user profile. A fresh profile starts with Personal workspace and the three starter projects: Operations playbook, Customer onboarding, and Product walkthroughs. The packaged smoke test verifies the exact starter catalog and sample document, plus an empty capture directory, on both initial launch and restart.

Development and installed copies intentionally share `%APPDATA%\captura-desk` on the same Windows account. Existing projects therefore appear after installation or reinstallation; this does not mean they were embedded in the installer. Do not delete or overwrite that directory to prepare a release. Use an isolated test profile or a clean Windows account to verify first-run behavior.
