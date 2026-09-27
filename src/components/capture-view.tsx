import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScreenshotZoom } from "./screenshot-zoom";
import { SampleScreen } from "./sample-screen";
import { errorMessage, type CaptureImage } from "@/lib/desktop";
import { sampleSteps, type Step } from "@/lib/workspace";
export function CaptureView({
  step,
  compact = false,
}: {
  step: Step;
  compact?: boolean;
}) {
  const [frame, setFrame] = useState<"before" | "after">("before");
  const [image, setImage] = useState<CaptureImage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setFrame("before");
  }, [step.id]);
  useEffect(() => {
    setImage(null);
    setError("");
    let canceled = false;
    if (step.captureId && window.desktop)
      window.desktop
        .captureImage(step.captureId, frame)
        .then(async (result) => {
          if (!result.dataUrl && compact && frame === "before")
            result = await window.desktop!.captureImage(step.captureId!, "after");
          if (!canceled) setImage(result);
        })
        .catch((e) => {
          if (!canceled) setError(errorMessage(e));
        });
    return () => {
      canceled = true;
    };
  }, [step.captureId, frame, compact]);
  if (!step.captureId)
    return (
      <SampleScreen
        step={Math.max(
          0,
          sampleSteps().findIndex((s) => s.id === step.id),
        )}
        compact={compact}
      />
    );
  const label = `${frame === "before" ? "Before" : "After"} click: ${step.title}`;
  const screenshot = image?.dataUrl && (
    <>
      <img src={image.dataUrl} alt={label} className="block h-auto w-full" />
      {frame === "before" && (
        <span
          aria-label="Click location"
          style={{
            left: `${image.metadata.point.x * 100}%`,
            top: `${image.metadata.point.y * 100}%`,
          }}
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500/60 shadow-[0_0_0_2px_#6366f1]"
        />
      )}
    </>
  );
  return (
    <div>
      {!compact && (
        <div className="mb-3 flex items-center gap-2">
          <Button
            variant={frame === "before" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => setFrame("before")}
          >
            Before click
          </Button>
          <Button
            variant={frame === "after" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => setFrame("after")}
          >
            After click
          </Button>
          <span className="ml-auto text-[9px] text-neutral-400">
            {image?.metadata[frame]
              ? `${frame === "before" ? "Sampled" : "Captured"} ${Math.abs(image.metadata[frame]!.capturedAt - image.metadata.clickedAt)} ms ${frame === "before" ? "before" : "after"} click`
              : ""}
          </span>
        </div>
      )}
      {image?.dataUrl ? (
        compact ? (
          <div className="relative overflow-hidden rounded-md border">{screenshot}</div>
        ) : (
          <ScreenshotZoom
            key={step.captureId + frame}
            src={image.dataUrl}
            label={label}
            point={frame === "before" ? image.metadata.point : undefined}
          >
            {screenshot}
          </ScreenshotZoom>
        )
      ) : (
        <div className="flex min-h-32 items-center justify-center rounded-md border bg-neutral-50 p-4 text-center text-[11px] text-neutral-500">
          {error ||
            (!image
              ? "Loading screenshot…"
              : `No ${frame}-click screenshot. ${image.error || "Capture was paused or stopped before this frame was available."}`)}
        </div>
      )}
      {!compact && image?.error && (
        <p role="alert" className="mt-2 text-[10px] text-amber-700">
          {image.error}
        </p>
      )}
    </div>
  );
}
