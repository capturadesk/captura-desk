const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    backgroundColor: "#e0f2fe",
    title: "Captura Desk capture test target",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenu(null);
  win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        '<html><body style="margin:0;background:#e0f2fe;font:24px Segoe UI;height:100vh;display:grid;place-items:center"><button style="font:inherit;padding:50px" onclick="document.body.style.background=\'#dcfce7\';this.textContent=\'Action completed\'">Capture test — click here</button></body></html>',
      ),
  );
});
app.on("window-all-closed", () => app.quit());
