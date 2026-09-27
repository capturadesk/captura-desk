import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import path from "node:path";
const env = {
  ...process.env,
  CAPTURADESK_TEST_DATA: path.resolve(".electron-test", `ai-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Operations playbook", exact: true }).waitFor();
  // Stub the transport in this test process only. No runtime test endpoint or live key.
  await app.evaluate(async ({ app, nativeImage }) => {
    const { createRequire } = process.getBuiltinModule("module");
    const require = createRequire(process.cwd() + "/package.json");
    const { Providers } = require("./electron/ai/providers.cjs");
    globalThis.aiTest = { mode: "success", requests: [] };
    Providers.prototype.request = async function (provider, key, route, body, signal) {
      if (!body)
        return {
          data: [
            ...Array.from({ length: 150 }, (_, i) => ({
              id: provider + "-fixture-" + String(i).padStart(3, "0"),
            })),
            { id: provider + "-fixture-vision" },
          ],
        };
      globalThis.aiTest.requests.push({ provider, body });
      if (globalThis.aiTest.mode === "hold")
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      const content =
        provider === "openai" ? body.input[0].content : body.messages[0].content;
      const ids = content.flatMap((item) => {
        if (!item.text) return [];
        try {
          const value = JSON.parse(item.text);
          return value.captureSlot ? [value.captureSlot] : [];
        } catch {
          return [];
        }
      });
      const text = JSON.stringify({
        title: "AI documented workflow",
        description: "A generated draft to review.",
        steps:
          globalThis.aiTest.mode === "summary"
            ? [
                {
                  sources: ids,
                  title: "Screen findings",
                  description: "Combined screen information",
                  needsReview: false,
                },
              ]
            : ids.map((slot) => ({
                sources: [slot],
                title: "Choose the action",
                description: "Check the screen before continuing.",
                needsReview: true,
              })),
      });
      return provider === "openai"
        ? { status: "completed", output: [{ content: [{ type: "output_text", text }] }] }
        : { stop_reason: "end_turn", content: [{ type: "text", text }] };
    };
    const { Storage } = require("./electron/storage.cjs");
    const storage = new Storage(app.getPath("userData"));
    const project = storage.loadWorkspace()[0];
    const session = storage.createSession(
      { projectId: project.id, name: "AI test recording", context: "Test context" },
      { id: "1", name: "Test display" },
    );
    const png = nativeImage
      .createFromBitmap(Buffer.alloc(1920 * 1080 * 4, 255), { width: 1920, height: 1080 })
      .toPNG();
    for (let i = 0; i < 2; i++) {
      const id = storage.addCapture(session.id, i + 1, {
        clickedAt: Date.now(),
        button: 1,
        point: { x: 0.5, y: 0.5 },
      });
      await storage.saveFrame(id, "before", {
        png,
        width: 1920,
        height: 1080,
        capturedAt: Date.now(),
      });
    }
    storage.sessionStatus(session.id, "complete");
    storage.loadWorkspace();
    storage.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page.getByLabel("API key", { exact: true }).fill("test-only-openai-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.getByText("Key saved. Test the connection next.").waitFor();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Connection verified" }).waitFor();
  await page.getByLabel("Provider", { exact: true }).selectOption("anthropic");
  await page.getByLabel("API key", { exact: true }).fill("test-only-anthropic-key");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await page.getByText("Key saved. Test the connection next.").waitFor();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Connection verified" }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workspace settings", exact: true }).click();
  await page.getByRole("button", { name: "Load models", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Models loaded" }).waitFor();
  const results = page.getByRole("list", { name: "Model results", exact: true });
  await expect(results.getByRole("button")).toHaveCount(151);
  const bounds = await results.evaluate((el) => ({
    height: el.clientHeight,
    total: el.scrollHeight,
  }));
  assert.ok(
    bounds.height <= 192 && bounds.total > bounds.height,
    "Model results have bounded scrolling",
  );
  await results.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const search = page.getByRole("textbox", { name: "Search models", exact: true });
  await search.fill("no-such-model");
  await expect(
    page.getByText("No matching models. Try another search or enter a model ID above."),
  ).toBeVisible();
  await search.fill("VISION");
  await expect(results.getByRole("button")).toHaveCount(1);
  await search.press("ArrowDown");
  await expect(
    results.getByRole("button", { name: "openai-fixture-vision", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Default model ID", { exact: true })).toHaveValue(
    "openai-fixture-vision",
  );
  await expect(results).toHaveCount(0);
  await page.getByRole("button", { name: "Browse models", exact: true }).click();
  await expect(results.getByRole("button")).toHaveCount(151);
  await page.getByRole("textbox", { name: "Search models", exact: true }).press("Escape");
  await expect(
    page.getByRole("heading", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Default model ID", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Save AI defaults", exact: true }).click();
  await page.getByText("AI defaults saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Select the actual recording rather than the initial illustrative document.
  await page
    .getByRole("button", { name: "Resolve a failed payment", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^AI test recording/ }).click();
  const original = await page.evaluate(() => window.desktop.loadWorkspace());
  await page.getByRole("button", { name: "Generate documentation", exact: true }).click();
  await page
    .getByText("Provider: openai / Model: openai-fixture-vision.", { exact: false })
    .waitFor();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Generate draft", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").nth(1).uncheck();
  await dialog.getByRole("button", { name: "Preview step 1", exact: true }).click();
  await dialog.getByRole("img", { name: /Before click/ }).waitFor();
  const enlarge = dialog.getByRole("button", { name: /^Enlarge screenshot:/ });
  await enlarge.click();
  const zoomDialog = page.getByRole("dialog", {
    name: "Screenshot preview",
    exact: true,
  });
  const zoomArea = zoomDialog.getByRole("region", {
    name: "Zoomed screenshot",
    exact: true,
  });
  await expect(zoomDialog.getByRole("img", { name: /Before click/ })).toBeVisible();
  await zoomDialog
    .getByRole("button", { name: "Annotate screenshot", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit screenshot", exact: true });
  const surface = editor.getByLabel("Draw screenshot annotations", { exact: true });
  await expect(surface).toBeVisible();
  const annotationBounds = await surface.boundingBox();
  await page.mouse.move(
    annotationBounds.x + annotationBounds.width * 0.1,
    annotationBounds.y + annotationBounds.height * 0.1,
  );
  await page.mouse.down();
  await page.mouse.move(
    annotationBounds.x + annotationBounds.width * 0.4,
    annotationBounds.y + annotationBounds.height * 0.4,
  );
  await page.mouse.up();
  await expect(editor.getByText(/1\/100 boxes/)).toBeVisible();
  await editor.getByRole("button", { name: "Undo box", exact: true }).click();
  await expect(editor.getByText(/0\/100 boxes/)).toBeVisible();
  await page.mouse.move(
    annotationBounds.x + annotationBounds.width * 0.1,
    annotationBounds.y + annotationBounds.height * 0.1,
  );
  await page.mouse.down();
  await page.mouse.move(
    annotationBounds.x + annotationBounds.width * 0.4,
    annotationBounds.y + annotationBounds.height * 0.4,
  );
  await page.mouse.up();
  await editor
    .getByRole("button", { name: "Save screenshot edits", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await zoomDialog
    .getByRole("button", { name: "Annotate screenshot", exact: true })
    .click();
  await expect(editor.getByText(/1\/100 boxes/)).toBeVisible();
  await editor.getByRole("button", { name: "Clear boxes", exact: true }).click();
  await editor.getByRole("button", { name: "Cancel edits", exact: true }).click();
  const selectedCapture = original[0].documents.find(
    (d) => d.title === "AI test recording",
  ).steps[0].captureId;
  const rendered = await page.evaluate(
    (id) => window.desktop.captureImage(id, "before"),
    selectedCapture,
  );
  await app.evaluate(({ nativeImage }, url) => {
    const image = nativeImage.createFromDataURL(url);
    const { width, height } = image.getSize();
    const offset = (Math.floor(height * 0.2) * width + Math.floor(width * 0.2)) * 4;
    const bytes = image.toBitmap();
    if (
      bytes[offset] !== 0 ||
      bytes[offset + 1] !== 0 ||
      bytes[offset + 2] !== 0 ||
      bytes[offset + 3] !== 255
    )
      throw Error("Redaction was not flattened");
  }, rendered.dataUrl);
  const exportPath = path.join(env.CAPTURADESK_TEST_DATA, "redacted-export.md");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, exportPath);
  await page.evaluate(
    ({ projectId, guideId }) => window.desktop.exportMarkdown({ projectId, guideId }),
    {
      projectId: original[0].id,
      guideId: original[0].documents.find((d) => d.title === "AI test recording").id,
    },
  );
  await app.evaluate(({ nativeImage }, filePath) => {
    const fs = process.getBuiltinModule("fs"),
      path = process.getBuiltinModule("path");
    const markdown = fs.readFileSync(filePath, "utf8");
    const link = markdown.match(/!\[Before click\]\(([^)]+)\)/)[1];
    const image = nativeImage.createFromPath(
      path.join(path.dirname(filePath), decodeURIComponent(link)),
    );
    const { width, height } = image.getSize();
    const pixel = (Math.floor(height * 0.2) * width + Math.floor(width * 0.2)) * 4;
    if (
      image
        .toBitmap()
        .subarray(pixel, pixel + 3)
        .some((value) => value !== 0)
    )
      throw Error("Export leaked original pixels");
  }, exportPath);
  await zoomDialog.getByRole("button", { name: "Actual size", exact: true }).click();
  await expect(zoomDialog.getByLabel("Zoom level", { exact: true })).toHaveText("100%");
  await zoomDialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(zoomDialog.getByLabel("Zoom level", { exact: true })).toHaveText("125%");
  await expect
    .poll(() =>
      zoomArea.evaluate(
        (el) => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight,
      ),
    )
    .toBe(true);
  await zoomArea.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => zoomArea.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await zoomDialog.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(zoomDialog.getByLabel("Zoom level", { exact: true })).toHaveText("100%");
  await zoomDialog.getByRole("button", { name: "Fit to window", exact: true }).click();
  await expect
    .poll(() =>
      zoomArea.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(zoomDialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Generate documentation", exact: true }),
  ).toBeVisible();
  await expect(enlarge).toBeFocused();
  await enlarge.press("Enter");
  await zoomDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(enlarge).toBeFocused();

  await dialog.getByRole("checkbox").last().check();
  await app.evaluate(() => {
    globalThis.aiTest.mode = "hold";
  });
  await dialog.getByRole("button", { name: "Generate draft", exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.aiTest.requests.length)).toBe(1);
  await dialog.getByRole("button", { name: "Cancel generation", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "canceled" }).waitFor();
  await app.evaluate(() => {
    globalThis.aiTest.mode = "success";
  });
  await dialog.getByRole("button", { name: "Generate draft", exact: true }).click();
  await dialog.getByRole("heading", { name: "Review AI draft", exact: true }).waitFor();
  await expect(
    dialog.getByText("Review needed: the evidence was uncertain."),
  ).toBeVisible();
  await dialog.getByText("Compare with current document", { exact: true }).click();
  const comparison = dialog.getByRole("region", {
    name: "Revision comparison",
    exact: true,
  });
  await expect(comparison.getByText("Current document", { exact: true })).toBeVisible();
  await expect(comparison.getByText("Proposed document", { exact: true })).toBeVisible();
  await expect(comparison.locator("ins").first()).toBeVisible();
  await expect(comparison.locator("del").first()).toBeVisible();
  await dialog.getByText("Compare with current document", { exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.desktop.loadWorkspace()), original);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.reload();
  await page
    .getByRole("button", { name: "Resolve a failed payment", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^AI test recording/ }).click();
  await page.getByRole("button", { name: "Generate documentation", exact: true }).click();
  await dialog.getByRole("button", { name: /openai-fixture-vision/ }).click();
  await dialog.getByRole("button", { name: "Save as new document", exact: true }).click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "AI documented workflow",
  );
  await expect(page.getByRole("button", { name: /Revision 1/ })).toBeVisible();
  await page.getByRole("button", { name: "Recording options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename revision", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Revision label", exact: true })
    .fill("Concise walkthrough");
  await page.getByRole("button", { name: "Save label", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Revision 1.*Concise walkthrough/ }),
  ).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));
  const updated = await page.evaluate(() => window.desktop.loadWorkspace());
  assert.equal(updated[0].documents.length, original[0].documents.length + 1);
  assert.deepEqual(updated[0].documents.slice(0, -1), original[0].documents);
  assert.equal(updated[0].documents.at(-1).steps.length, 1);
  await page
    .getByRole("textbox", { name: "Refine document", exact: true })
    .fill("Make this shorter");
  await page.getByRole("button", { name: "Apply refinement", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit with AI", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Suggest edits", exact: true }),
  ).toBeDisabled();
  assert.equal(await app.evaluate(() => globalThis.aiTest.requests.length), 2);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Suggest edits", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Review AI draft", exact: true }),
  ).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.desktop.loadWorkspace()), updated);
  await dialog.getByText("Compare with current document", { exact: true }).click();
  await dialog.getByRole("button", { name: "Save as new document", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Revision 2.*Make this shorter/ }),
  ).toBeVisible();
  await expect(page.getByText(/Based on Revision 1/)).toBeVisible();
  const refined = await page.evaluate(() => window.desktop.loadWorkspace());
  assert.deepEqual(refined[0].documents.slice(0, -1), updated[0].documents);
  assert.deepEqual(
    refined[0].documents.at(-1).steps.map((s) => s.captureId),
    updated[0].documents.at(-1).steps.map((s) => s.captureId),
  );
  await page.getByRole("button", { name: "Recording options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete document", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delete document?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.desktop.loadWorkspace()), refined);
  await page.getByRole("button", { name: "Recording options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete document", exact: true }).click();
  await page.getByRole("button", { name: "Delete document", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delete document?", exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.desktop.loadWorkspace()), updated);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => window.desktop.loadWorkspace()), updated);
  const requests = await app.evaluate(() => globalThis.aiTest.requests);
  const editContent = requests[2].body.input[0].content;
  assert.ok(editContent.every((p) => p.type === "input_text"));
  assert.equal(JSON.parse(editContent[0].text).editRequest, "Make this shorter");

  assert.equal(
    requests[1].body.input[0].content.filter((p) => p.type === "input_image").length,
    1,
  );
  await assert.rejects(
    page.evaluate(() => window.desktop.aiSaveKey("openai", "bad\nkey")),
    /Invalid request/,
  );
  await page
    .getByRole("button", { name: "Resolve a failed payment", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^AI test recording/ }).click();
  await app.evaluate(() => {
    globalThis.aiTest.mode = "summary";
  });
  await page.getByRole("button", { name: "Generate documentation", exact: true }).click();
  await dialog.getByRole("checkbox").last().check();
  await dialog.getByRole("button", { name: "Generate draft", exact: true }).click();
  await dialog.getByRole("heading", { name: "Review AI draft", exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "View sources for section 1", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Source 2", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Source 2", exact: true }).click();
  await dialog.getByRole("button", { name: "Save as new document", exact: true }).click();
  const report = (
    await page.evaluate(() => window.desktop.loadWorkspace())
  )[0].documents.at(-1);
  assert.equal(report.steps.length, 1);
  assert.equal(report.steps[0].captureIds.length, 2);
  await expect(page.getByRole("button", { name: "Source 2", exact: true })).toBeVisible();
  await page.evaluate(
    ({ projectId, guideId }) => window.desktop.exportMarkdown({ projectId, guideId }),
    { projectId: original[0].id, guideId: report.id },
  );
  await app.evaluate((_, filePath) => {
    const fs = process.getBuiltinModule("fs"),
      path = process.getBuiltinModule("path");
    const text = fs.readFileSync(filePath, "utf8");
    const images = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
    if (images.length !== 2) throw Error("Report must export both source images");
    for (const image of images)
      if (!fs.existsSync(path.join(path.dirname(filePath), decodeURIComponent(image[1]))))
        throw Error("Missing exported evidence");
  }, exportPath);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: both provider connections, workspace defaults, capture preview/exclusion/consent, cancel, saved draft reload, non-destructive apply, and validated IPC. Provider transport mocked; no external requests.",
  );
} finally {
  await app.close();
}
