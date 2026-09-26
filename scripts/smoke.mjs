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

  await page
    .getByRole("textbox", { name: "Step description", exact: true })
    .fill("A revised instruction that must survive a restart.");
  await page.reload();
  await page.getByRole("textbox", { name: "Step description", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Step description", exact: true })
      .inputValue(),
    "A revised instruction that must survive a restart.",
  );
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Step title", exact: true }).inputValue(),
    "Find the failed transaction",
  );
  await page.getByRole("button", { name: "Step options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove step" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo change" }).click();
  assert.equal(await page.locator('.inspector button[aria-current="step"]').count(), 1);

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
  await page.getByRole("status").filter({ hasText: "Document exported" }).waitFor();
  assert.match(await fs.readFile(exportPath, "utf8"), /^# Resolve a failed payment/);
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
      .getByRole("textbox", { name: "Step description", exact: true })
      .inputValue(),
    "A revised instruction that must survive a restart.",
  );
  await page.getByRole("button", { name: "QA workflow", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Electron isolation, persistence, editing, undo, export, Captura Desk branding, workspace creation/isolation/rename/deletion/cancel/reload, last workspace protection, project deletion/cancel, and empty states.",
  );
} finally {
  await app.close();
}
