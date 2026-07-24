// Renders assets/icon.html at 1024×1024 (transparent) via Electron's Chromium and writes icon-1024.png.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false, transparent: true,
    backgroundColor: "#00000000", useContentSize: true,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(path.join(__dirname, "assets", "icon.html"));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, "assets", "icon-1024.png"), img.toPNG());
  const size = img.getSize();
  console.log("wrote icon-1024.png", size.width + "x" + size.height);
  app.quit();
});
