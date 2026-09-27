import { ModelPicker } from "@/components/model-picker";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, type AIDefaults, type AIProvider } from "@/lib/desktop";
export function AIWorkspaceSettings({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled: boolean;
}) {
  const [config, setConfig] = useState<AIDefaults>({ provider: "openai", model: "" });
  const [models, setModels] = useState<string[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    window.desktop
      ?.aiDefaults(workspaceId)
      .then((value) => {
        if (active) {
          setConfig(value);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  if (!window.desktop) return null;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">AI defaults</h3>
      <p className="text-xs text-neutral-500">
        Connect a key in AI providers, then choose a model supporting images and
        structured output.
      </p>
      <label htmlFor="workspace-ai-provider" className="block text-xs">
        Default provider
      </label>
      <select
        id="workspace-ai-provider"
        className="h-9 w-full rounded-md border bg-white px-3 text-sm"
        disabled={!loaded || disabled || busy}
        value={config.provider}
        onChange={(e) => {
          setConfig({ provider: e.target.value as AIProvider, model: "" });
          setModels([]);
          setModelsOpen(false);
          setMessage("");
        }}
      >
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic (Claude)</option>
      </select>
      <label htmlFor="workspace-ai-model" className="block text-xs">
        Default model ID
      </label>
      <Input
        id="workspace-ai-model"
        placeholder="Enter a model ID or load available models"
        value={config.model}
        disabled={!loaded || disabled || busy}
        onChange={(e) => {
          setConfig({ ...config, model: e.target.value });
          setMessage("");
        }}
      />
      {modelsOpen && (
        <ModelPicker
          models={models}
          value={config.model}
          disabled={!loaded || disabled || busy}
          onSelect={(model) => {
            setConfig({ ...config, model });
            setModelsOpen(false);
            setMessage("");
            document.getElementById("workspace-ai-model")?.focus();
          }}
          onClose={() => {
            setModelsOpen(false);
            document.getElementById("workspace-ai-model")?.focus();
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!loaded || disabled || busy}
          onClick={() =>
            run(async () => {
              setModels([...new Set(await window.desktop!.aiModels(config.provider))]);
              setModelsOpen(true);
              setMessage(
                "Models loaded. Choose a compatible model; account listings may include text-only models.",
              );
            })
          }
        >
          Load models
        </Button>
        {models.length > 0 && !modelsOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!loaded || disabled || busy}
            onClick={() => setModelsOpen(true)}
          >
            Browse models
          </Button>
        )}
        <Button
          size="sm"
          disabled={!loaded || disabled || busy || !config.model.trim()}
          onClick={() =>
            run(async () => {
              setConfig(await window.desktop!.aiSaveDefaults({ workspaceId, ...config }));
              setMessage("AI defaults saved");
            })
          }
        >
          Save AI defaults
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs text-neutral-500">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
