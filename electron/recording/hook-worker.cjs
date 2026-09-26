// Native hooks run outside the UI/main process. Only mouse-down coordinates
// leave this helper. Keyboard events and modifiers are never forwarded.
try {
  const { uIOhook } = require("uiohook-napi");
  let enabled = true;
  uIOhook.on("mousedown", (event) => {
    if (enabled)
      process.parentPort.postMessage({
        type: "click",
        x: event.x,
        y: event.y,
        button: Number(event.button),
        clickedAt: Date.now(),
      });
  });
  process.parentPort.on("message", ({ data }) => {
    if (data === "stop") {
      enabled = false;
      uIOhook.stop();
      process.exit(0);
    }
    if (data === "pause") enabled = false;
    if (data === "resume") enabled = true;
  });
  uIOhook.start();
  process.parentPort.postMessage({ type: "ready" });
} catch (error) {
  process.parentPort.postMessage({ type: "error", message: error.message });
  process.exit(1);
}
