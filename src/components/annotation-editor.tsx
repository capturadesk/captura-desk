import { useRef, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { errorMessage, type Annotation } from "@/lib/desktop";

export function AnnotationEditor({
  captureId,
  frame,
}: {
  captureId: string;
  frame: "before" | "after";
}) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [boxes, setBoxes] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [kind, setKind] = useState<Annotation["kind"]>("redact");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  async function load() {
    start.current = null;
    setOpen(true);
    setBusy(true);
    setError("");
    setSrc("");
    setDraft(null);
    try {
      const image = await window.desktop!.annotationRead(captureId, frame);
      if (!image.dataUrl) throw new Error("Screenshot unavailable");
      setSrc(image.dataUrl);
      setBoxes(image.metadata.annotations?.[frame] || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await window.desktop!.annotationSave({ id: captureId, frame, boxes });
      window.dispatchEvent(new Event("capture-edited"));
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function position(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function rectangle(end: { x: number; y: number }): Annotation {
    const origin = start.current!;
    return {
      kind,
      x: Math.min(origin.x, end.x),
      y: Math.min(origin.y, end.y),
      width: Math.abs(end.x - origin.x),
      height: Math.abs(end.y - origin.y),
    };
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={load}>
        Annotate screenshot
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[95vh] overflow-auto sm:max-w-[1000px]">
          <DialogHeader>
            <DialogTitle>Edit screenshot</DialogTitle>
            <DialogDescription>
              Drag to highlight or redact. Saved edits apply to this frame in every
              revision, AI request, and export. Originals remain on this device. Cancel
              discards unsaved changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              variant={kind === "redact" ? "default" : "outline"}
              onClick={() => setKind("redact")}
            >
              Redact
            </Button>
            <Button
              disabled={busy}
              variant={kind === "highlight" ? "default" : "outline"}
              onClick={() => setKind("highlight")}
            >
              Highlight
            </Button>
            <Button
              variant="outline"
              disabled={busy || !boxes.length}
              onClick={() => setBoxes((items) => items.slice(0, -1))}
            >
              Undo box
            </Button>
            <Button
              variant="outline"
              disabled={busy || !boxes.length}
              onClick={() => setBoxes([])}
            >
              Clear boxes
            </Button>
          </div>
          {src && (
            <div className="relative mx-auto max-w-full select-none">
              <img
                src={src}
                alt="Screenshot being edited"
                draggable={false}
                className="max-h-[60vh] max-w-full"
              />
              <svg
                aria-label="Draw screenshot annotations"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
                onPointerDown={(e) => {
                  if (busy || boxes.length >= 100 || e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  start.current = position(e);
                  setDraft(null);
                }}
                onPointerMove={(e) => {
                  if (start.current) setDraft(rectangle(position(e)));
                }}
                onPointerUp={(e) => {
                  if (!start.current) return;
                  const box = rectangle(position(e));
                  start.current = null;
                  setDraft(null);
                  if (box.width > 0.001 && box.height > 0.001)
                    setBoxes((items) => [...items, box]);
                }}
                onPointerCancel={() => {
                  start.current = null;
                  setDraft(null);
                }}
              >
                {[...boxes, ...(draft ? [draft] : [])]
                  .sort(
                    (a, b) => Number(a.kind === "redact") - Number(b.kind === "redact"),
                  )
                  .map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={b.y}
                      width={b.width}
                      height={b.height}
                      fill={b.kind === "redact" ? "black" : "none"}
                      stroke={b.kind === "redact" ? "black" : "#ffc800"}
                      strokeWidth={b.kind === "redact" ? 0 : 0.004}
                    />
                  ))}
              </svg>
            </div>
          )}
          <p className="text-xs text-neutral-500">
            {boxes.length}/100 boxes. Before and after frames are edited separately.
            Previously exported files and AI drafts are not changed.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel edits
            </Button>
            <Button disabled={busy || !src || !!draft} onClick={save}>
              {busy ? "Working..." : "Save screenshot edits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
