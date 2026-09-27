const { desktopCapturer, screen, BrowserWindow, utilityProcess } = require("electron");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { createWindowHitTest, isOwnWindow } = require("./window-hit-test.cjs");

function contains(bounds, point) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}
class WindowsCapture extends EventEmitter {
  listDisplays() {
    return screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      name: `Display ${i + 1}${d.id === screen.getPrimaryDisplay().id ? " (primary)" : ""}`,
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
    }));
  }
  validateDisplay(display) {
    const current = this.listDisplays().find((d) => d.id === display.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(display))
      throw new Error(
        "Display configuration changed. Finish this session and start a new recording.",
      );
    return current;
  }
  classify(event, display) {
    const dip = screen.screenToDipPoint({ x: event.x, y: event.y });
    if (!contains(display.bounds, dip))
      return {
        point: null,
        reason: "outside-display",
        actualDisplay: this.listDisplays().find((d) => contains(d.bounds, dip))?.name,
      };
    this.hitTest ??= createWindowHitTest();
    const target = this.hitTest(event);
    if (isOwnWindow(target, BrowserWindow.getAllWindows()))
      return { point: null, reason: "app-window" };
    let application = null;
    try {
      this.applicationLookup ??=
        require("./application-name.cjs").createApplicationLookup();
      application = this.applicationLookup(target);
    } catch {
      /* Optional metadata must never interrupt recording. */
    }
    return {
      application,
      point: {
        x: (dip.x - display.bounds.x) / display.bounds.width,
        y: (dip.y - display.bounds.y) / display.bounds.height,
      },
    };
  }
  async frame(display) {
    this.validateDisplay(display);
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
      },
    });
    const source = sources.find((s) => s.display_id === display.id);
    if (!source || source.thumbnail.isEmpty())
      throw new Error("The selected display could not be captured.");
    const size = source.thumbnail.getSize();
    return {
      png: source.thumbnail.toPNG(),
      width: size.width,
      height: size.height,
      capturedAt: Date.now(),
    };
  }
  start() {
    if (process.platform !== "win32")
      return Promise.reject(
        new Error("Recording is currently supported on Windows only."),
      );
    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(path.join(__dirname, "hook-worker.cjs"), [], {
        serviceName: "Captura Desk mouse capture",
      });
      this.child = child;
      let ready = false;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Mouse capture did not start."));
      }, 5000);
      child.on("message", (message) => {
        if (this.child !== child) return;
        if (message.type === "ready") {
          ready = true;
          clearTimeout(timer);
          resolve();
        } else if (message.type === "click") this.emit("click", message);
        else if (message.type === "error") {
          clearTimeout(timer);
          if (!ready) reject(new Error(message.message));
          else this.emit("fault", new Error(message.message));
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        if (this.child === child) {
          this.child = null;
          if (!ready) reject(new Error("Mouse capture exited before starting."));
          else this.emit("fault", new Error("Mouse capture stopped unexpectedly."));
        }
      });
    });
  }
  pause() {
    this.child?.postMessage("pause");
  }
  resume() {
    if (!this.child)
      throw new Error(
        "Mouse capture is unavailable. Finish this session and start a new recording.",
      );
    this.child?.postMessage("resume");
  }
  stop() {
    const child = this.child;
    this.child = null;
    if (child) {
      child.postMessage("stop");
      setTimeout(() => child.kill(), 500).unref();
    }
  }
}
module.exports = { WindowsCapture, contains };
