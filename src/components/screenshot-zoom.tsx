import { useEffect, useRef, useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut, Maximize, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ScreenshotZoom({
  src,
  label,
  point,
  children,
}: {
  src: string;
  label: string;
  point?: { x: number; y: number };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Dialog content mounts after the open render. Observe its actual scroll area,
    // so fit-to-window also follows desktop window resizing.
    const frame = requestAnimationFrame(() => {
      const element = viewport.current;
      if (!element) return;
      const measure = () =>
        setSize({ width: element.clientWidth, height: element.clientHeight });
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(element);
    });
    let observer: ResizeObserver | undefined;
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [open]);
  const fit = Math.max(
    0.01,
    Math.min(1, (size.width - 32) / natural.width, (size.height - 32) / natural.height),
  );
  const scale = zoom ?? fit;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setZoom(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Enlarge screenshot: ${label}`}
          title="Click to enlarge screenshot"
          className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          {children}
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[10px] text-neutral-600 shadow-sm"
          >
            <ZoomIn className="size-3" />
            Enlarge
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-3 p-4 sm:max-w-[95vw]">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>Screenshot preview</DialogTitle>
          <DialogDescription className="truncate">{label}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            disabled={scale <= 0.1}
            onClick={() => setZoom(Math.max(0.1, scale / 1.25))}
          >
            <ZoomOut />
          </Button>
          <output
            aria-label="Zoom level"
            className="min-w-12 text-center text-xs tabular-nums"
          >
            {Math.round(scale * 100)}%
          </output>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            disabled={scale >= 4}
            onClick={() => setZoom(Math.min(4, scale * 1.25))}
          >
            <ZoomIn />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(null)}>
            <Maximize />
            Fit to window
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            <Scan />
            Actual size
          </Button>
          <span className="text-xs text-neutral-500">
            Scroll to explore when zoomed in.
          </span>
        </div>
        <div
          ref={viewport}
          role="region"
          aria-label="Zoomed screenshot"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <div
            className="grid place-items-center"
            style={{
              width: Math.max(width, size.width),
              height: Math.max(height, size.height),
            }}
          >
            <div className="relative" style={{ width, height }}>
              <img
                src={src}
                alt={label}
                draggable={false}
                className="block max-w-none"
                style={{ width, height }}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
              />
              {point && (
                <span
                  aria-label="Click location"
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500/60 shadow-[0_0_0_2px_#6366f1]"
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
