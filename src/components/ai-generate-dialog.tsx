import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CaptureView } from "@/components/capture-view";
import { errorMessage, type AIDefaults, type AIDraft } from "@/lib/desktop";
import type { Guide, Project, Step } from "@/lib/workspace";
export function AIGenerateDialog({
  workspaceId,
  projectId,
  guide,
  flush,
  instruction,
  onApplied,
  onClose,
}: {
  workspaceId: string;
  projectId: string;
  guide: Guide;
  instruction?: string;
  flush: () => Promise<void>;
  onApplied: (projects: Project[], guideId: string) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<AIDefaults | null>(null);
  const [selected, setSelected] = useState<string[]>(
    guide.steps.flatMap((s) => (s.captureId ? [s.captureId] : [])).slice(0, 20),
  );
  const [drafts, setDrafts] = useState<AIDraft[]>([]);
  const [draft, setDraft] = useState<AIDraft | null>(null);
  const [preview, setPreview] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const canceled = useRef(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const target = { workspaceId, projectId, guideId: guide.id };
  useEffect(() => {
    let active = true;
    Promise.all([
      window.desktop!.aiDefaults(workspaceId),
      window.desktop!.aiDrafts(target),
      window.desktop!.aiState(),
    ])
      .then(([defaults, saved, state]) => {
        if (active) {
          setConfig(defaults);
          setDrafts(saved);
          if (state.busy) {
            setBusy(true);
            setReconnecting(true);
            setPhase(state.phase);
          }
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    const timer = setInterval(() => {
      window
        .desktop!.aiState()
        .then((state) => {
          if (active && state.busy) setPhase(state.phase);
          else if (active && reconnecting) {
            setBusy(false);
            setReconnecting(false);
            window
              .desktop!.aiDrafts(target)
              .then(setDrafts)
              .catch((e) => setError(errorMessage(e)));
          }
        })
        .catch(() => {});
    }, 500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busy, reconnecting]);
  async function generate() {
    if (!config || !consent || busy) return;
    canceled.current = false;
    setBusy(true);
    setError("");
    setPhase("Saving your edits");
    try {
      await flush();
      if (canceled.current)
        throw new Error("Generation canceled. Your document is unchanged.");
      const result = instruction
        ? await window.desktop!.aiRefine({ ...target, ...config, instruction })
        : await window.desktop!.aiGenerate({
            ...target,
            ...config,
            captureIds: selected,
          });
      setDraft(result);
      setDrafts((items) => [result, ...items]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setPhase("Saving document");
    try {
      await flush();
      const result = await window.desktop!.aiApply({ workspaceId, draftId: draft.id });
      onApplied(result.projects, result.guideId);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {draft
              ? "Review AI draft"
              : instruction
                ? "Edit with AI"
                : "Generate documentation"}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? "Check the draft against your screenshots. Saving creates a separate document and keeps the original."
              : instruction
                ? "Send your document text, project instructions and edit request. Screenshots stay on your device. Every step is preserved; edits support 1-20 steps."
                : "Review the captures to send. Generation uses your project instructions and the recording title and description."}
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <>
            <p className="text-xs text-neutral-500">
              {draft.provider} / {draft.model} /{" "}
              {new Date(draft.createdAt).toLocaleString()}
            </p>
            {instruction && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer">
                  Compare with current document
                </summary>
                <h3 className="mt-3 font-medium">{guide.title}</h3>
                <p className="whitespace-pre-wrap">{guide.description}</p>
                {guide.steps.map((step, i) => (
                  <div key={step.id} className="mt-3">
                    <h4 className="font-medium">
                      {i + 1}. {step.title}
                    </h4>
                    <p className="whitespace-pre-wrap">{step.description}</p>
                  </div>
                ))}
              </details>
            )}
            <h3 className="text-lg font-medium">{draft.output.title}</h3>
            <p className="whitespace-pre-wrap text-sm">{draft.output.description}</p>
            {draft.output.steps.map((step, index) => (
              <div key={step.captureId} className="space-y-2 rounded-md border p-3">
                <h4 className="text-sm font-medium">
                  {index + 1}. {step.title}
                </h4>
                {step.needsReview && (
                  <p className="text-xs text-amber-700">
                    Review needed: the evidence was uncertain.
                  </p>
                )}
                <p className="whitespace-pre-wrap text-xs leading-5">
                  {step.description}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPreview(
                      guide.steps.find((s) => s.captureId === step.captureId) || null,
                    )
                  }
                >
                  View evidence for step {index + 1}
                </Button>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setPreview(null);
                }}
              >
                Back
              </Button>
              <Button disabled={busy} onClick={apply}>
                Save as new document
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              Provider: {config?.provider || "Loading..."} / Model:{" "}
              {config?.model || "Not configured"}. Change these in Workspace settings.
            </p>
            {instruction ? (
              <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                <p className="mb-2 font-medium">Your request</p>
                {instruction}
              </div>
            ) : (
              <>
                <p className="text-xs">
                  Select 1-20 captures. Both available frames of each selected capture
                  will be sent; excluded captures are not uploaded.
                </p>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
                  {guide.steps
                    .filter((s) => s.captureId)
                    .map((step, index) => (
                      <div key={step.id} className="flex items-center gap-2">
                        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={selected.includes(step.captureId!)}
                            disabled={
                              busy ||
                              (!selected.includes(step.captureId!) &&
                                selected.length >= 20)
                            }
                            onChange={(e) => {
                              setConsent(false);
                              setSelected(
                                e.target.checked
                                  ? [...selected, step.captureId!]
                                  : selected.filter((id) => id !== step.captureId),
                              );
                            }}
                          />
                          <span className="truncate">
                            {index + 1}. {step.title}
                          </span>
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreview(step)}
                        >
                          Preview step {index + 1}
                        </Button>
                      </div>
                    ))}
                </div>
              </>
            )}
            <label className="flex items-start gap-2 text-xs leading-5">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                {instruction
                  ? "Send the document text, project instructions and my edit request to "
                  : `Send these ${selected.length} captures and the stated text to `}
                {config?.provider === "anthropic" ? "Anthropic" : "OpenAI"}. I have
                reviewed them for sensitive information. Provider API charges and data
                policies apply.
              </span>
            </label>
            <Button
              disabled={
                busy ||
                !consent ||
                !selected.length ||
                !config?.model ||
                (!!instruction && guide.steps.length > 20)
              }
              onClick={generate}
            >
              {instruction ? "Suggest edits" : "Generate draft"}
            </Button>
            {drafts.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">Saved drafts</p>
                {drafts.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setDraft(item);
                      setPreview(null);
                    }}
                  >
                    {new Date(item.createdAt).toLocaleString()} - {item.model}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
        {preview && (
          <section className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Source screenshot</p>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Hide preview
              </Button>
            </div>
            <CaptureView step={preview} />
          </section>
        )}
        {busy && (
          <div className="flex items-center justify-between">
            <p role="status" className="text-xs">
              {phase}...
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                canceled.current = true;
                window.desktop!.aiCancel().catch((e) => setError(errorMessage(e)));
              }}
            >
              Cancel generation
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
