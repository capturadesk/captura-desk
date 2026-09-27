import { useState } from "react";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { Step } from "@/lib/workspace";
export function ManageSteps({
  steps,
  onChange,
  onClose,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<Step[][]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState("");
  function change(next: Step[], message: string) {
    setHistory((items) => [...items.slice(-19), steps]);
    onChange(next);
    setStatus(message);
  }
  function move(from: number, to: number) {
    if (from < 0 || to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step);
    change(next, `Moved step to position ${to + 1}.`);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Manage steps</DialogTitle>
          <DialogDescription>
            Drag a handle or use the arrow buttons to reorder. Changes save automatically
            and apply to this document. Removing steps keeps their original screenshots.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="Select all steps"
              checked={!!steps.length && selected.length === steps.length}
              disabled={!steps.length || confirm}
              onChange={(e) =>
                setSelected(e.target.checked ? steps.map((s) => s.id) : [])
              }
            />
            Select all
          </label>
          <span>{selected.length} selected</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.length || confirm}
            onClick={() => setConfirm(true)}
          >
            Remove selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!history.length || confirm}
            onClick={() => {
              onChange(history[history.length - 1]);
              setHistory((items) => items.slice(0, -1));
              setSelected([]);
              setStatus("Change undone.");
            }}
          >
            Undo step change
          </Button>
        </div>
        {confirm && (
          <div
            role="group"
            aria-label="Confirm step removal"
            className="space-y-2 rounded border p-3 text-sm"
          >
            <p>Remove {selected.length} selected steps? You can undo this change.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>
                Cancel removal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  change(
                    steps.filter((s) => !selected.includes(s.id)),
                    `${selected.length} steps removed.`,
                  );
                  setSelected([]);
                  setConfirm(false);
                }}
              >
                Confirm removal
              </Button>
            </div>
          </div>
        )}
        <ol
          className="min-h-0 space-y-2 overflow-y-auto"
          aria-label="Editable workflow steps"
        >
          {steps.map((step, index) => (
            <li
              key={step.id}
              data-step-id={step.id}
              className="flex items-center gap-2 rounded border p-2"
              onDragOver={(e) => {
                if (dragged && !confirm) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!confirm && dragged)
                  move(
                    steps.findIndex((s) => s.id === dragged),
                    index,
                  );
                setDragged(null);
              }}
            >
              <span
                draggable={!confirm}
                onDragStart={(e) => {
                  setDragged(step.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", step.id);
                }}
                onDragEnd={() => setDragged(null)}
                className="cursor-grab text-neutral-400"
                title="Drag to reorder"
              >
                <GripVertical className="size-4" />
              </span>
              <input
                type="checkbox"
                aria-label={`Select step ${index + 1}`}
                disabled={confirm}
                checked={selected.includes(step.id)}
                onChange={(e) =>
                  setSelected((items) =>
                    e.target.checked
                      ? [...items, step.id]
                      : items.filter((id) => id !== step.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 text-xs">
                <span className="text-neutral-500">{index + 1}. </span>
                {step.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move step ${index + 1} up`}
                disabled={index === 0 || confirm}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move step ${index + 1} down`}
                disabled={index === steps.length - 1 || confirm}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
        {!steps.length && (
          <p className="text-sm text-neutral-500">
            No steps remain. Undo to restore them.
          </p>
        )}
        <p role="status" className="text-xs text-neutral-500">
          {status}
        </p>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
