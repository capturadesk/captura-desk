import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { errorMessage, type AIConnections, type AIProvider } from "@/lib/desktop";
export function AIProviderSettings({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [key, setKey] = useState("");
  const [connections, setConnections] = useState<AIConnections | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    window.desktop
      ?.aiConnections()
      .then(setConnections)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const connected = connections?.providers.find(
    (p) => p.provider === provider,
  )?.connected;
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>AI providers</DialogTitle>
          <DialogDescription>
            Connect your own API account. Keys are encrypted on this device and shared
            across its workspaces. Provider API usage is billed to your account.
          </DialogDescription>
        </DialogHeader>
        {!window.desktop ? (
          <p>Open the desktop app to configure AI.</p>
        ) : (
          <>
            <label className="text-xs font-medium" htmlFor="ai-provider">
              Provider
            </label>
            <select
              id="ai-provider"
              className="h-9 rounded-md border bg-white px-3 text-sm"
              value={provider}
              disabled={busy}
              onChange={(e) => {
                setProvider(e.target.value as AIProvider);
                setKey("");
                setError("");
                setMessage("");
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
            <p className="text-xs text-neutral-500">
              {connected ? "Key saved on this device" : "No key connected"}
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  setConnections(await window.desktop!.aiSaveKey(provider, key));
                  setKey("");
                  setMessage("Key saved. Test the connection next.");
                });
              }}
            >
              <label className="text-xs font-medium" htmlFor="ai-key">
                {connected ? "Replace API key" : "API key"}
              </label>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                disabled={busy}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Paste your provider API key"
              />
              <Button
                size="sm"
                disabled={busy || !key.trim() || !connections?.encryptionAvailable}
              >
                Save key
              </Button>
            </form>
            {connections && !connections.encryptionAvailable && (
              <p role="alert" className="text-xs text-red-600">
                OS credential encryption is unavailable. Keys cannot be saved.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!connected || busy}
                onClick={() =>
                  run(async () => {
                    const models = await window.desktop!.aiModels(provider);
                    setMessage(
                      `Connection verified. ${models.length} models returned. Choose a model supporting images and structured output in workspace settings.`,
                    );
                  })
                }
              >
                Test connection
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!connected || busy}
                onClick={() =>
                  run(async () => {
                    setConnections(await window.desktop!.aiRemoveKey(provider));
                    setKey("");
                    setMessage("Key removed from this device.");
                  })
                }
              >
                Remove key
              </Button>
            </div>
          </>
        )}
        {busy && (
          <p role="status" className="text-xs">
            Working...
          </p>
        )}
        {message && (
          <p role="status" className="text-xs text-neutral-600">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
