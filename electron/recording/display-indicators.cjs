const { BrowserWindow } = require("electron");

class DisplayIndicators {
  windows = [];
  timer = null;
  hide() {
    clearTimeout(this.timer);
    for (const window of this.windows) if (!window.isDestroyed()) window.destroy();
    this.windows = [];
  }
  show(displays) {
    this.hide();
    for (const display of displays) {
      const window = new BrowserWindow({
        width: 320,
        height: 120,
        x: display.bounds.x + Math.round((display.bounds.width - 320) / 2),
        y: display.bounds.y + Math.round((display.bounds.height - 120) / 2),
        frame: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      this.windows.push(window);
      window.setIgnoreMouseEvents(true);
      window.setContentProtection(true);
      window.once("ready-to-show", () => {
        if (!window.isDestroyed()) window.showInactive();
      });
      // Names are generated locally by WindowsCapture, never user-supplied.
      window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><body style="margin:0;display:grid;place-content:center;height:100vh;background:#171717;color:white;font:24px system-ui;text-align:center">${display.name}<small style="font-size:13px;margin-top:8px">Captura Desk display selection</small></body>`,
        )}`,
      );
    }
    this.timer = setTimeout(() => this.hide(), 2500);
  }
}
module.exports = { DisplayIndicators };
