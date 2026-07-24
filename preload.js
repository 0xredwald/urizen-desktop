// Secure preload — context-isolated. Exposes only a tiny bridge; the web app otherwise runs as-is.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("urizen", {
  native: true,
  platform: process.platform,
  completeOnboarding: () => ipcRenderer.send("onboarding-done"),
  resetOnboarding: () => ipcRenderer.send("reset-onboarding"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  // native → shell: the menu / global hotkey / tray asks the shell to switch view
  onGoView: (cb) => ipcRenderer.on("go-view", (_e, v) => cb(v)),
  // shell → native: report the symbol/price the user is looking at, for the menu-bar ticker
  reportTicker: (t) => ipcRenderer.send("ticker", t),
});
