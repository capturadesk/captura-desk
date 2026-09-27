import { useState } from "react";
import { Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { WorkspaceSettings } from "@/components/workspace-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/desktop";
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onBackup,
  onRestore,
}: {
  workspaces: { id: string; name: string }[];
  activeId: string;
  disabled: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBackup: () => Promise<boolean>;
  onRestore: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = workspaces.find((w) => w.id === activeId);
  async function select(id: string) {
    try {
      await onSelect(id);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      await onCreate(name);
      setOpen(false);
      setName("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={disabled}
            aria-label="Switch workspace"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-neutral-100 disabled:opacity-50"
            title={disabled ? "Finish recording before switching workspaces" : undefined}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-white text-[10px] font-semibold">
              CD
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {current?.name ?? "Workspace"}
              </span>
              <span className="mt-0.5 block text-[10px] text-neutral-400">
                Local to this device
              </span>
            </span>
            <ChevronDown className="size-3.5 text-neutral-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => {
                if (w.id !== activeId) void select(w.id);
              }}
            >
              <span className="truncate">{w.name}</span>
              {w.id === activeId && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettings(true)}>
            <Settings2 /> Workspace settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setError("");
              setOpen(true);
            }}
          >
            <Plus />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {settings && current && (
        <WorkspaceSettings
          key={current.id}
          workspace={current}
          canDelete={workspaces.length > 1}
          disabled={disabled}
          onClose={() => setSettings(false)}
          onRename={onRename}
          onBackup={onBackup}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      )}
      {error && !open && (
        <p role="alert" className="px-2 text-[10px] text-red-600">
          {error}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              Keep a separate collection of projects, recordings, and documentation for
              each area of your work.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label htmlFor="workspace-name" className="mb-2 block text-xs font-medium">
              Workspace name
            </label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client work"
              maxLength={80}
              autoFocus
              required
            />
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-600">
                {error}
              </p>
            )}
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
