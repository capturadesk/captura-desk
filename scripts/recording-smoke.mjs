import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const env = {
  ...process.env,
  CAPTURADESK_TEST_DATA: path.resolve(".electron-test", `recording-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, target;
try {
  app = await electron.launch({ args: ["."], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Operations playbook", exact: true }).waitFor();
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "New workspace", exact: true }).click();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Recording regression workspace");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page
    .getByText("This workspace is empty. Create your first project to get started.")
    .waitFor();
  await page.getByRole("button", { name: "New project", exact: true }).last().click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Recording regression project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recording regression project", exact: true })
    .waitFor();
  const displays = await page.evaluate(() => window.desktop.listDisplays());
  assert.ok(displays.length);
  const selectedDisplay =
    displays[Number(process.env.CAPTURA_TEST_DISPLAY ?? displays.length - 1)];
  assert.ok(selectedDisplay, "Requested test display exists");
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setBounds({ x: bounds.x + 40, y: bounds.y + 40, width: 1200, height: 850 });
  }, selectedDisplay.bounds);
  target = await electron.launch({ args: ["scripts/fixtures/capture-target.cjs"], env });
  const targetPage = await target.firstWindow();
  await targetPage.getByRole("button").waitFor();
  const id = await target.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id,
  );
  await target.evaluate(({ BrowserWindow }, bounds) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setBounds(bounds);
    w.maximize();
    w.setAlwaysOnTop(true);
    w.show();
  }, selectedDisplay.bounds);
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.restore();
    w.show();
    w.focus();
  });
  await page.getByRole("button", { name: "New recording", exact: true }).first().click();
  await page.getByLabel("What are you demonstrating?").fill("Real Windows capture test");
  await expect(page.getByLabel("Display to record")).toHaveValue(selectedDisplay.id);
  await page.getByRole("button", { name: "Identify displays", exact: true }).click();
  await expect.poll(() => app.windows().length).toBe(displays.length + 1);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.desktop.recordingState()).then((s) => s.status),
    )
    .toBe("recording");
  await expect.poll(() => app.windows().length).toBe(2);
  const toolbarDisplay = await app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("#recorder"),
    );
    return String(screen.getDisplayMatching(w.getBounds()).id);
  });
  assert.equal(
    toolbarDisplay,
    selectedDisplay.id,
    "Toolbar follows the recorded monitor",
  );
  const control = app.windows().find((p) => p !== page);
  if (control)
    await control.getByRole("button", { name: "Finish", exact: true }).waitFor();
  // Reproduce the bounds-filter regression: Captura Desk is restored behind
  // another application. Its rectangle must not swallow the target's clicks.
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const w = BrowserWindow.getAllWindows().find((w) => w.getTitle() === "Captura Desk");
    w.restore();
    w.setBounds({
      x: bounds.x + 40,
      y: bounds.y + 40,
      width: Math.min(1440, bounds.width - 80),
      height: Math.min(960, bounds.height - 80),
    });
    w.showInactive();
  }, selectedDisplay.bounds);
  await target.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setAlwaysOnTop(true);
    w.show();
    w.focus();
  });
  async function clickTarget() {
    await target.evaluate(({ BrowserWindow }, id) => {
      const w = BrowserWindow.fromId(id);
      w.setAlwaysOnTop(true);
      w.show();
      w.focus();
    }, id);
    const button = await targetPage.getByRole("button").boundingBox();
    const point = await target.evaluate(({ BrowserWindow, screen }, p) => {
      const w = BrowserWindow.getAllWindows()[0];
      const b = w.getContentBounds();
      return {
        ...screen.dipToScreenPoint({
          x: Math.round(b.x + p.x + p.width / 2),
          y: Math.round(b.y + p.y + p.height / 2),
        }),
        handle: Number(w.getNativeWindowHandle().readBigUInt64LE()),
      };
    }, button);
    const overlaps = await app.evaluate(({ BrowserWindow, screen }, p) => {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.getTitle() === "Captura Desk",
      );
      const b = w.getBounds();
      const d = screen.screenToDipPoint(p);
      return (
        !w.isMinimized() &&
        w.isVisible() &&
        d.x >= b.x &&
        d.x < b.x + b.width &&
        d.y >= b.y &&
        d.y < b.y + b.height
      );
    }, point);
    assert.equal(
      overlaps,
      true,
      "Test click overlaps the restored Captura Desk window underneath",
    );
    await exec(
      "powershell.exe",
      [
        "-NoProfile",
        "-File",
        "scripts/fixtures/click-target.ps1",
        "-X",
        String(point.x),
        "-Y",
        String(point.y),
        "-ExpectedWindow",
        String(point.handle),
      ],
      { windowsHide: true },
    );
  }
  // Let the rolling pre-click sample refresh after the workspace minimizes.
  await new Promise((r) => setTimeout(r, 1100));
  await clickTarget();
  await expect
    .poll(() => page.evaluate(() => window.desktop.recordingState()).then((s) => s.count))
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(
      async () =>
        (await fs.readdir(path.join(env.CAPTURADESK_TEST_DATA, "captures"))).filter(
          (name) => name.endsWith("-after.png"),
        ).length,
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(1);
  await page.evaluate(() => window.desktop.pauseRecording());
  if (control)
    await expect(
      control.getByRole("button", { name: "Capture now", exact: true }),
    ).toBeDisabled();
  await assert.rejects(
    page.evaluate(() => window.desktop.captureNow()),
    /Resume/,
  );
  const pausedCount = (await page.evaluate(() => window.desktop.recordingState())).count;
  await clickTarget();
  assert.equal(
    (await page.evaluate(() => window.desktop.recordingState())).count,
    pausedCount,
  );
  await page.evaluate(() => window.desktop.resumeRecording());
  await clickTarget();
  await expect
    .poll(() => page.evaluate(() => window.desktop.recordingState()).then((s) => s.count))
    .toBeGreaterThanOrEqual(pausedCount + 1);
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Shift+S"),
    ),
    true,
  );
  if (control) {
    await control.getByRole("button", { name: "Capture now", exact: true }).click();
    await expect(
      control.getByRole("button", { name: "Capture now", exact: true }),
    ).toBeEnabled();
  }
  const result = await page.evaluate(() => window.desktop.stopRecording());
  assert.equal(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered("CommandOrControl+Shift+S"),
    ),
    false,
  );
  const guide = result.projects[0].documents.find(
    (d) => d.sessionId === result.sessionId,
  );
  assert.equal(guide.demo, false);
  assert.ok(guide.steps.length >= 2);
  const manual = guide.steps.find((step) => step.title.startsWith("Screenshot of "));
  assert.ok(manual, "Toolbar creates a manual screenshot step");
  const manualImage = await page.evaluate(
    (id) => window.desktop.captureImage(id, "before"),
    manual.captureId,
  );
  assert.equal(manualImage.metadata.trigger, "manual");
  assert.equal(manualImage.metadata.point, null);
  assert.ok(manualImage.dataUrl);
  // A developer may click elsewhere during an interactive run. Select the
  // controlled target's center click rather than assuming it is capture #1.
  let targetStep;
  for (const step of guide.steps) {
    const frame = await page.evaluate(
      (id) => window.desktop.captureImage(id, "before"),
      step.captureId,
    );
    if (
      Math.abs(frame.metadata.point?.x - 0.5) < 0.05 &&
      Math.abs(frame.metadata.point?.y - 0.5) < 0.08 &&
      frame.metadata.after &&
      frame.dataUrl
    ) {
      assert.ok(frame.metadata.application, "Native application lookup succeeded");
      assert.ok(
        step.title.endsWith(frame.metadata.application),
        "Step title identifies the clicked application",
      );
      targetStep = step;
      break;
    }
  }
  assert.ok(targetStep, "Controlled target click was recorded");
  const before = await page.evaluate(
    (id) => window.desktop.captureImage(id, "before"),
    targetStep.captureId,
  );
  const after = await page.evaluate(
    (id) => window.desktop.captureImage(id, "after"),
    targetStep.captureId,
  );
  assert.ok(before.dataUrl?.startsWith("data:image/png;base64,"));
  assert.ok(after.dataUrl);
  assert.notEqual(
    before.dataUrl,
    after.dataUrl,
    "Before and after frames differ after the target action",
  );
  assert.ok(before.metadata.point.x > 0 && before.metadata.point.x < 1);
  assert.ok(before.metadata.before.width > 1000);
  const pixel = await app.evaluate(({ nativeImage }, url) => {
    const img = nativeImage.createFromDataURL(url);
    const size = img.getSize();
    return [
      ...img
        .crop({
          x: Math.floor(size.width * 0.25),
          y: Math.floor(size.height * 0.25),
          width: 1,
          height: 1,
        })
        .toBitmap(),
    ];
  }, before.dataUrl);
  assert.ok(
    pixel[3] === 255 && pixel[1] > 220,
    "Pre-click image contains the controlled target background",
  );
  await page.getByRole("heading", { name: "Review your captures" }).waitFor();
  await page.getByRole("button").filter({ hasText: "STEP 1" }).click();
  await page.getByRole("img", { name: /Before click/ }).waitFor();
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/real-recording.png" });
  const output = path.resolve("artifacts/real-recording.md");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, output);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Document exported" }).waitFor();
  const exported = await fs.readFile(output, "utf8");
  assert.match(exported, /!\[Before click\]/);
  assert.match(exported, /!\[After click\]/);
  await page.reload();
  await page
    .getByRole("heading", { name: "Recording regression project", exact: true })
    .waitFor();
  const loaded = await page.evaluate(() => window.desktop.loadWorkspace());
  assert.ok(loaded[0].documents.some((d) => d.sessionId === guide.sessionId));
  await page.getByRole("button", { name: "Recording options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.ok(
    (await page.evaluate(() => window.desktop.loadWorkspace()))[0].documents.length,
  );
  await page.getByRole("button", { name: "Recording options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete recording", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete recording", exact: true })
    .click();
  await page.getByRole("heading", { name: "Your first workflow starts here" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Your first workflow starts here" }).waitFor();
  await assert.rejects(
    page.evaluate(
      (id) => window.desktop.captureImage(id, "before"),
      targetStep.captureId,
    ),
    /not found/,
  );
  assert.equal(
    await fs.readFile(output, "utf8"),
    exported,
    "Deleting the recording preserves its export",
  );
  await assert.rejects(
    page.evaluate(() => window.desktop.captureImage("../secret", "before")),
    /Invalid request/,
  );
  assert.deepEqual(errors, []);
  console.log(
    `${selectedDisplay.name}:`,
    "PASS: native Windows clicks, selected display screenshots, before/after images, pause exclusion, resume, review, durable reload, image export, recording deletion/cancel/reload and invalid IPC rejection.",
  );
} finally {
  if (app) {
    await app.evaluate(() => {}).catch(() => {});
    const p = app.windows()[0];
    if (p)
      await p
        .evaluate(async () => {
          const s = await window.desktop.recordingState();
          if (["recording", "paused"].includes(s.status))
            await window.desktop.stopRecording();
        })
        .catch(() => {});
    await app.close();
  }
  if (target) await target.close();
}
