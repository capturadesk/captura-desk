import { useEffect, useState } from "react";
import { errorMessage, idleRecording } from "@/lib/desktop";
export function useRecording() {
  const [state, setState] = useState(idleRecording);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    const unsubscribe = desktop.onRecordingState(setState);
    desktop
      .recordingState()
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
    return unsubscribe;
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { state, error, busy, action };
}
