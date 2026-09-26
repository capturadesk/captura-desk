import { useEffect, useState } from "react";
import { Monitor, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecording } from "@/hooks/use-recording";
export function RecorderToolbar() {
  const { state, error, busy, action } = useRecording();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = state.startedAt
    ? Math.max(0, Math.floor((now - state.startedAt) / 1000))
    : 0;
  return (
    <div className="flex h-full flex-col rounded-lg border bg-white px-4 py-3">
      <div className="titlebar flex items-center gap-3">
        <span
          className={`size-2 rounded-full ${state.status === "recording" ? "animate-pulse bg-red-500" : "bg-neutral-400"}`}
        />
        <div className="min-w-0 flex-1 text-xs">
          <strong className="font-medium">
            {state.status === "recording"
              ? "Recording"
              : state.status === "paused"
                ? "Paused"
                : "Saving…"}
          </strong>
          <span className="ml-3 font-mono text-[10px] text-neutral-400">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
          <span className="ml-3 text-[10px] text-neutral-500">{state.count} clicks</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Show workspace"
          className="size-7"
          onClick={() => action(() => window.desktop!.showWorkspace())}
        >
          <Monitor className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !["recording", "paused"].includes(state.status)}
          onClick={() =>
            action(() =>
              state.status === "paused"
                ? window.desktop!.resumeRecording()
                : window.desktop!.pauseRecording(),
            )
          }
        >
          {state.status === "paused" ? <Play /> : <Pause />}
          {state.status === "paused" ? "Resume" : "Pause"}
        </Button>
        <Button
          size="sm"
          disabled={busy || !["recording", "paused"].includes(state.status)}
          onClick={() => action(() => window.desktop!.stopRecording())}
        >
          <Square className="size-3" />
          Finish
        </Button>
      </div>
      <div
        role={error || state.error ? "alert" : undefined}
        className={`mt-2 truncate text-[10px] ${error || state.error ? "text-red-600" : "text-neutral-400"}`}
        title={error || state.error || state.hint || state.displayName || ""}
      >
        {error ||
          state.error ||
          state.hint ||
          `${state.displayName || "Selected display"} · ${state.seen} clicks received · Saved locally`}
      </div>
    </div>
  );
}
