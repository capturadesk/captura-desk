import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { _electron as electron, expect } from "@playwright/test";
const executablePath = path.resolve(
  process.env.CAPTURADESK_EXECUTABLE || "release/win-unpacked/Captura Desk.exe",
);
await fs.access(executablePath);
const profile = path.resolve(".electron-test", "packaged-" + Date.now());
const env = { ...process.env, CAPTURADESK_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.CAPTURADESK_DEV_URL;
for (let launch = 0; launch < 2; launch++) {
  const app = await electron.launch({ executablePath, args: [], env });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "Operations playbook", exact: true })
      .waitFor();
    const catalog = await page.evaluate(() => window.desktop.listWorkspaces());
    assert.deepEqual(
      catalog,
      {
        activeId: "personal",
        workspaces: [{ id: "personal", name: "Personal workspace" }],
      },
      "Fresh packaged profile contains only the starter workspace",
    );
    await expect
      .poll(async () => {
        const projects = await page.evaluate(() => window.desktop.loadWorkspace());
        return projects?.map(({ id, name, documents }) => ({
          id,
          name,
          documents: documents.map(({ id, title, demo }) => ({ id, title, demo })),
        }));
      })
      .toEqual([
        {
          id: "operations",
          name: "Operations playbook",
          documents: [{ id: "payments", title: "Resolve a failed payment", demo: true }],
        },
        { id: "onboarding", name: "Customer onboarding", documents: [] },
        { id: "product", name: "Product walkthroughs", documents: [] },
      ]);
    assert.deepEqual(
      await fs.readdir(path.join(profile, "captures")),
      [],
      "Fresh profile has no personal screenshots",
    );
    const result = await app.evaluate(async ({ app, safeStorage }) => {
      const { createRequire } = process.getBuiltinModule("node:module");
      const require = createRequire(app.getAppPath() + "/package.json");
      const koffi = require("koffi");
      const { uIOhook } = require("uiohook-napi");
      const { WindowsCapture } = require("./electron/recording/windows.cjs");
      const capture = new WindowsCapture();
      await capture.start();
      capture.stop();
      const encrypted = safeStorage.encryptString("packaging-test-only");
      return {
        packaged: app.isPackaged,
        root: app.getAppPath(),
        userData: app.getPath("userData"),
        koffi: typeof koffi.load,
        hook: typeof uIOhook.start,
        encryption: safeStorage.decryptString(encrypted),
      };
    });
    assert.equal(result.packaged, true);
    assert.ok(result.root.endsWith("app.asar"));
    assert.equal(result.userData, profile);
    assert.equal(result.koffi, "function");
    assert.equal(result.hook, "function");
    assert.equal(result.encryption, "packaging-test-only");
    await fs.access(path.join(profile, "workspace.sqlite"));
    console.log(
      "PASS: packaged startup " +
        (launch + 1) +
        ", SQLite, native modules, hook helper, isolated profile, credential encryption.",
    );
  } finally {
    await app.close();
  }
}
const child = spawnSync(process.execPath, ["scripts/smoke.mjs"], {
  stdio: "inherit",
  env: { ...env, CAPTURADESK_EXECUTABLE: executablePath },
  windowsHide: true,
});
if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status || 1);
