import { AIWorkspaceSettings } from "@/components/ai-workspace-settings";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/desktop";

export function WorkspaceSettings({
  workspace,
  canDelete,
  disabled,
  onClose,
  onRename,
  onDelete,
}: {
  workspace: { id: string; name: string };
  canDelete: boolean;
  disabled: boolean;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(workspace.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await onRename(workspace.id, name);
      setName(name.trim());
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(workspace.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]"
        onEscapeKeyDown={(event) => {
          // Let the model picker consume Escape before dismissing its parent dialog.
          if (
            event.target instanceof Element &&
            event.target.closest("[data-model-picker]")
          )
            event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {confirm ? "Delete workspace?" : "Workspace settings"}
          </DialogTitle>
          <DialogDescription>
            {confirm
              ? `“${workspace.name}” and all its projects, recordings, documentation, and original screenshots will be permanently deleted. Exported files remain. This cannot be undone.`
              : "Manage the name and data for this workspace. Changes are saved on this device."}
          </DialogDescription>
        </DialogHeader>
        {!confirm && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-3"
            >
              <label
                htmlFor="settings-workspace-name"
                className="block text-xs font-medium"
              >
                Workspace name
              </label>
              <Input
                id="settings-workspace-name"
                value={name}
                maxLength={80}
                required
                disabled={busy || disabled}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
              />
              <div className="flex items-center justify-end gap-3">
                {saved && (
                  <span role="status" className="text-xs text-neutral-500">
                    Workspace name saved
                  </span>
                )}
                <Button
                  size="sm"
                  disabled={
                    busy || disabled || !name.trim() || name.trim() === workspace.name
                  }
                >
                  Save changes
                </Button>
              </div>
            </form>
            <AIWorkspaceSettings workspaceId={workspace.id} disabled={busy || disabled} />
            <div className="mt-3 space-y-3 border-t pt-5">
              <h3 className="text-sm font-medium">Delete workspace</h3>
              <p className="text-xs leading-5 text-neutral-500">
                Permanently remove this workspace and everything recorded in it.
              </p>
              {!canDelete && (
                <p className="text-xs text-neutral-500">
                  Create another workspace before deleting your last workspace.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                disabled={!canDelete || busy || disabled}
                onClick={() => {
                  setError("");
                  setConfirm(true);
                }}
              >
                <Trash2 />
                Delete workspace
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <DialogFooter>
          {confirm ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy || disabled} onClick={remove}>
                {busy ? "Deleting…" : "Delete workspace"}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
