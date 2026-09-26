const { app, BrowserWindow, ipcMain, dialog, powerMonitor, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Storage } = require("./storage.cjs");
const { WindowsCapture } = require("./recording/windows.cjs");
const { Recorder } = require("./recording/recorder.cjs");
const { registerIPC } = require("./ipc.cjs");
const { DisplayIndicators } = require("./recording/display-indicators.cjs");
// Use the product's data directory; tests override it with an isolated profile.
app.setName("Captura Desk");
app.setPath(
  "userData",
  process.env.CAPTURADESK_TEST_DATA || path.join(app.getPath("appData"), "captura-desk"),
);
const devUrl = process.env.CAPTURADESK_DEV_URL;
if (devUrl && devUrl !== "http://127.0.0.1:5173")
  throw new Error("Invalid development URL");
const indexPath = path.join(__dirname, "../dist/index.html");
let mainWindow, toolbar, recorder, storage;
let quitting = false;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindow?.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app
    .whenReady()
    .then(() => {
      storage = new Storage(app.getPath("userData"));
      storage.cleanupDeletedFiles().catch(() => {});
      recorder = new Recorder(storage, new WindowsCapture());
      const baseUrl = devUrl ? `${devUrl}/` : pathToFileURL(indexPath).href;
      function trusted(event, allowToolbar = false) {
        const frame = event.senderFrame;
        const isMain = event.sender === mainWindow?.webContents;
        const isToolbar = allowToolbar && event.sender === toolbar?.webContents;
        if (
          !frame ||
          frame !== event.sender.mainFrame ||
          (!isMain && !isToolbar) ||
          frame.url.split("#")[0] !== baseUrl
        )
          throw new Error("Untrusted sender");
      }
      registerIPC({
        ipcMain,
        trusted,
        storage,
        recorder,
        mainWindow: () => mainWindow,
        indicators: new DisplayIndicators(),
      });
      function load(win, hash) {
        win.setMenu(null);
        win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        win.webContents.on("will-navigate", (event) => event.preventDefault());
        win.webContents.on("render-process-gone", () => {
          if (recorder.state.status === "recording")
            recorder.pause(
              "The application interface closed unexpectedly. Your saved captures are safe.",
            );
        });
        if (devUrl) win.loadURL(`${devUrl}/${hash ? `#${hash}` : ""}`);
        else win.loadFile(indexPath, hash ? { hash } : undefined);
      }
      const webPreferences = {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      };
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 860,
        minHeight: 650,
        title: "Captura Desk",
        backgroundColor: "#ffffff",
        show: false,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#fafafa",
          symbolColor: "#525252",
          height: 40,
        },
        webPreferences,
      });
      mainWindow.once("ready-to-show", () => mainWindow.show());
      mainWindow.on("close", (event) => {
        if (!quitting && recorder.state.status !== "idle") {
          event.preventDefault();
          const answer = dialog.showMessageBoxSync(mainWindow, {
            type: "question",
            buttons: ["Keep recording", "Finish and close"],
            defaultId: 0,
            cancelId: 0,
            message: "A recording is still open.",
            detail: "Finish it before closing to save the session for review.",
          });
          if (answer === 1)
            recorder
              .stop()
              .then(() => {
                quitting = true;
                app.quit();
              })
              .catch((error) =>
                dialog.showErrorBox("Could not finish recording", error.message),
              );
        }
      });
      load(mainWindow);
      function send(channel, data) {
        for (const win of [mainWindow, toolbar])
          if (win && !win.isDestroyed()) win.webContents.send(channel, data);
      }
      recorder.on("state", (state) => {
        if (state.status === "recording" && !toolbar) {
          const area = (
            screen
              .getAllDisplays()
              .find((display) => String(display.id) === recorder.session?.display.id) ||
            screen.getPrimaryDisplay()
          ).workArea;
          toolbar = new BrowserWindow({
            width: 540,
            height: 104,
            x: area.x + Math.round((area.width - 540) / 2),
            y: area.y + area.height - 124,
            frame: false,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            show: false,
            backgroundColor: "#ffffff",
            webPreferences,
          });
          toolbar.setContentProtection(true);
          toolbar.on("close", (event) => {
            if (!quitting && recorder.state.status !== "idle") event.preventDefault();
          });
          toolbar.once("ready-to-show", () => toolbar?.showInactive());
          load(toolbar, "recorder");
          mainWindow.minimize();
        }
        send("recording:state", state);
        if (state.status === "idle" && toolbar) {
          toolbar.destroy();
          toolbar = null;
        }
      });
      recorder.on("finished", (result) => {
        send("recording:finished", result);
        if (!quitting) {
          mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      powerMonitor.on("suspend", () =>
        recorder.pause("Recording paused because this computer went to sleep."),
      );
      powerMonitor.on("lock-screen", () =>
        recorder.pause("Recording paused because the screen was locked."),
      );
      for (const name of ["display-removed", "display-metrics-changed"])
        screen.on(name, () => {
          if (recorder.state.status === "recording")
            recorder.pause(
              "Display configuration changed. Finish this session and start a new recording.",
            );
        });
    })
    .catch((error) => {
      dialog.showErrorBox("Captura Desk could not start", error.message);
      app.quit();
    });
  app.on("before-quit", () => {
    quitting = true;
    recorder?.shutdown();
  });
  app.on("window-all-closed", () => app.quit());
}
