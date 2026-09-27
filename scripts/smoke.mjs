import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const env = {
  ...process.env,
  CAPTURADESK_TEST_DATA: path.resolve(".electron-test", `run-${Date.now()}`),
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("heading", { name: "Operations playbook", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => Boolean(window.desktop)),
    true,
    "Native bridge exists",
  );
  assert.equal(
    await page.evaluate(() => typeof window.require),
    "undefined",
    "Node is isolated",
  );
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/desktop-editor.png" });

  const mdEditor = page.getByRole("region", {
    name: "Step description editor",
    exact: true,
  });
  const description = page.getByRole("textbox", {
    name: "Step description",
    exact: true,
  });
  const editDescription = page.getByRole("button", {
    name: "Edit step description",
    exact: true,
  });
  const markdown =
    "## Findings\n\n**Important** and *useful*.\n\n| Region | Total |\n| --- | --- |\n| West | 12 |\n\n- [x] Reviewed\n\n<script>window.markdownExecuted = true</script>\n\n![remote](https://example.com/tracker.png)";
  await editDescription.click();
  await description.fill(markdown);
  await expect(description).toBeFocused();
  await expect(description).toHaveValue(markdown);
  await page.getByRole("textbox", { name: "Step title", exact: true }).click();
  await expect(description).toHaveCount(0);
  await expect(
    mdEditor.getByRole("heading", { name: "Findings", exact: true }),
  ).toBeVisible();
  await expect(mdEditor.getByRole("cell", { name: "12", exact: true })).toBeVisible();
  await expect(mdEditor.locator("strong")).toHaveText("Important");
  await expect(mdEditor.getByRole("checkbox")).toBeChecked();
  await expect(mdEditor.getByRole("img")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.markdownExecuted), undefined);
  await page.reload();
  await expect(
    mdEditor.getByRole("heading", { name: "Findings", exact: true }),
  ).toBeVisible();
  // Keyboard focus enters source editing too; opening and closing preserves exact source.
  await editDescription.focus();
  await expect(description).toBeFocused();
  await expect(description).toHaveValue(markdown);
  await description.press("Tab");
  await expect(description).toHaveCount(0);
  const saved = await page.evaluate(() => window.desktop.loadWorkspace());
  assert.equal(saved[0].documents[0].steps[0].description, markdown);
  await editDescription.click();
  await description.fill("A revised instruction that must survive a restart.");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(mdEditor).toHaveCount(1);
  await expect(editDescription).toHaveText(
    "Select the Failed tab, then open the payment you want to investigate.",
  );
  await editDescription.click();
  await description.fill("");
  await page.getByRole("textbox", { name: "Step title", exact: true }).click();
  await expect(editDescription).toHaveText("Click to add a description...");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(mdEditor).toHaveCount(1);
  await expect(editDescription).toHaveText(
    "Review the recorded failure reason and the payment amount.",
  );
  await page.getByRole("button", { name: "Previous step", exact: true }).click();
  await expect(mdEditor).toHaveCount(1);
  await editDescription.click();
  await expect(description).toHaveValue("");
  await description.fill(
    "Select the Failed tab, then open the payment you want to investigate.",
  );
  await page.getByRole("button", { name: "Step options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove step" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo change" }).click();
  assert.equal(await page.locator('.inspector button[aria-current="step"]').count(), 1);

  await page.getByRole("button", { name: "Manage steps", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "Manage steps", exact: true });
  const rows = manager
    .getByRole("list", { name: "Editable workflow steps" })
    .locator("li");
  const order = await rows.evaluateAll((items) =>
    items.map((item) => item.dataset.stepId),
  );
  await manager.getByRole("button", { name: "Move step 1 down", exact: true }).click();
  assert.equal(await rows.first().getAttribute("data-step-id"), order[1]);
  await manager.getByRole("button", { name: "Undo step change", exact: true }).click();
  await rows.first().locator("[draggable]").dragTo(rows.nth(2));
  assert.equal(await rows.nth(2).getAttribute("data-step-id"), order[0]);
  await manager.getByRole("button", { name: "Undo step change", exact: true }).click();
  await manager.getByRole("checkbox", { name: "Select step 1", exact: true }).check();
  await manager.getByRole("checkbox", { name: "Select step 3", exact: true }).check();
  await manager.getByRole("button", { name: "Remove selected", exact: true }).click();
  await manager.getByRole("button", { name: "Cancel removal", exact: true }).click();
  await expect(rows).toHaveCount(order.length);
  await manager.getByRole("button", { name: "Remove selected", exact: true }).click();
  await manager.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(rows).toHaveCount(order.length - 2);
  await manager.getByRole("button", { name: "Undo step change", exact: true }).click();
  assert.deepEqual(
    await rows.evaluateAll((items) => items.map((item) => item.dataset.stepId)),
    order,
  );
  await manager.getByRole("checkbox", { name: "Select all steps", exact: true }).check();
  await manager.getByRole("button", { name: "Remove selected", exact: true }).click();
  await manager.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await manager.getByRole("button", { name: "Undo step change", exact: true }).click();
  await expect(rows).toHaveCount(order.length);
  await manager.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await page
    .getByLabel("How should we document your work?")
    .fill("Write a concise operations checklist.");
  await page.getByRole("button", { name: "Save instructions" }).click();
  await page.reload();
  await page
    .getByText("Write a concise operations checklist.", { exact: true })
    .waitFor();

  await page
    .getByRole("textbox", { name: "Refine document", exact: true })
    .fill("Turn into a checklist");
  await page.getByRole("button", { name: "Apply refinement" }).click();
  assert.match(
    await page.getByRole("textbox", { name: "Step title", exact: true }).inputValue(),
    /^☐ /,
  );
  await page.getByRole("button", { name: "Undo change" }).click();

  await page.getByRole("button", { name: "All projects" }).click();
  await page.getByRole("heading", { name: "Your projects" }).waitFor();
  await page.getByRole("button", { name: "New project", exact: true }).last().click();
  await page.getByLabel("Project name", { exact: true }).fill("QA workflow");
  await page.getByLabel("How should we document your work?").fill("Use numbered steps.");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("heading", { name: "Your first workflow starts here" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "QA workflow", exact: true }).click();
  await page.getByRole("heading", { name: "Your first workflow starts here" }).waitFor();
  await page.getByRole("button", { name: "Operations playbook", exact: true }).click();

  // Exercise native IPC with a controlled save destination instead of an interactive dialog.
  const exportPath = path.resolve("artifacts/export-smoke.md");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, exportPath);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Markdown with images", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Document exported" }).waitFor();
  assert.match(await fs.readFile(exportPath, "utf8"), /^# Resolve a failed payment/);
  const htmlPath = path.join(env.CAPTURADESK_TEST_DATA, "shared.html");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, htmlPath);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "HTML - single file", exact: true }).click();
  await expect
    .poll(async () => fs.readFile(htmlPath, "utf8").catch(() => ""))
    .toContain("<!doctype html>");
  assert.match(await fs.readFile(htmlPath, "utf8"), /Resolve a failed payment/);

  await page.reload();
  await page.getByRole("button", { name: "QA workflow", exact: true }).click();
  await page.getByRole("heading", { name: "Your first workflow starts here" }).waitFor();
  assert.equal(await app.evaluate(({ app }) => app.getName()), "Captura Desk");
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "New workspace", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Client work");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page
    .getByText("This workspace is empty. Create your first project to get started.")
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Operations playbook", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "New project", exact: true }).last().click();
  await page.getByLabel("Project name", { exact: true }).fill("Client project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("heading", { name: "Client project", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Client project", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Project options for Client project", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("heading", { name: "Client project", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Project options for Client project", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page
    .getByText("This workspace is empty. Create your first project to get started.")
    .waitFor();
  await page.reload();
  await page
    .getByText("This workspace is empty. Create your first project to get started.")
    .waitFor();
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workspace settings", exact: true }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("Client operations");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Workspace name saved" }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch workspace", exact: true }),
  ).toContainText("Client operations");
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workspace settings", exact: true }).click();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("heading", { name: "Workspace settings", exact: true }).waitFor();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Switch workspace", exact: true }),
  ).toContainText("Personal workspace");
  await page.reload();
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Client operations", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Workspace settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete workspace", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Operations playbook", exact: true }).click();
  await page.getByRole("textbox", { name: "Document title", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Edit step description", exact: true })
      .textContent(),
    "A revised instruction that must survive a restart.",
  );
  await page.getByRole("button", { name: "QA workflow", exact: true }).click();
  const backupPath = path.join(env.CAPTURADESK_TEST_DATA, "workspace.captura-backup");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  }, backupPath);
  const beforeBackup = await page.evaluate(() => window.desktop.loadWorkspace());
  await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
  await page.getByRole("menuitem", { name: "Workspace settings", exact: true }).click();
  await page.getByRole("button", { name: "Back up workspace", exact: true }).click();
  await expect(page.getByText("Workspace backup saved.", { exact: true })).toBeVisible();
  assert.equal(
    JSON.parse(await fs.readFile(backupPath, "utf8")).format,
    "captura-desk-workspace",
  );
  await page.getByRole("button", { name: "Restore backup", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, backupPath);
  await page.getByRole("button", { name: "Restore backup", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Switch workspace", exact: true }),
  ).toContainText("Personal workspace (restored)");
  assert.deepEqual(
    await page.evaluate(() => window.desktop.loadWorkspace()),
    beforeBackup,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch workspace", exact: true }),
  ).toContainText("Personal workspace (restored)");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Electron isolation, persistence, editing, undo, export, Captura Desk branding, workspace creation/isolation/rename/deletion/cancel/reload, last workspace protection, project deletion/cancel, and empty states.",
  );
} finally {
  await app.close();
}
