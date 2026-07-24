const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, Notification, shell, ipcMain, nativeTheme, session, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");

// Urizen — native macOS desk. First launch shows a local onboarding (NOT the website); after that it
// boots straight into the terminal with a splash. Frameless-inset title bar, under-window vibrancy,
// proper mac menu. Self-custodial: wallet popups open as child windows, other links go to the browser.

const APP_URL = process.env.URIZEN_URL || "https://urizenfund.com/terminal";
const flagFile = () => path.join(app.getPath("userData"), "onboarded.v1");
const isOnboarded = () => { try { return fs.existsSync(flagFile()); } catch { return false; } };
const markOnboarded = () => { try { fs.writeFileSync(flagFile(), String(Date.now())); } catch { /* */ } };

nativeTheme.themeSource = "dark";
let mainWindow = null;
let splash = null;
let tray = null;
let tickerTimer = null;
let lastAlertPct = 0;

// send the shell a view to switch to (native rail → web app)
function goView(v) { if (mainWindow) mainWindow.webContents.send("go-view", v); showMain(); }
function showMain() { if (!mainWindow) return createMain(); if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
function toggleMain() { if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide(); else showMain(); }

// tiny JSON GET
function getJSON(url) {
  return new Promise((res) => {
    https.get(url, { headers: { "user-agent": "Urizen" } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
    }).on("error", () => res(null));
  });
}

// ── the menu-bar ticker: a live price in the macOS status bar (only a native app can do this) ──
async function tickOnce(sess) {
  // BTC spot + 24h change from Coinbase (US-accessible, keyless)
  const [spot, stats] = await Promise.all([
    getJSON("https://api.coinbase.com/v2/prices/BTC-USD/spot"),
    getJSON("https://api.exchange.coinbase.com/products/BTC-USD/stats"),
  ]);
  const price = Number(spot && spot.data && spot.data.amount);
  if (!price || !tray) return;
  const open = Number(stats && stats.open);
  const chg = open ? ((price / open) - 1) * 100 : null;
  const arrow = chg == null ? "" : chg >= 0 ? "▲" : "▼";
  tray.setTitle(`  ₿ ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${arrow}${chg == null ? "" : Math.abs(chg).toFixed(1) + "%"}`);
  tray.setToolTip(`Bitcoin $${price.toLocaleString()} · ${chg == null ? "" : (chg >= 0 ? "+" : "") + chg.toFixed(2) + "% 24h"}`);
  // native alert on a big intraday move (once per 1% step, this session)
  if (chg != null && Math.abs(chg) >= 3 && Math.abs(Math.abs(chg) - lastAlertPct) >= 1 && Notification.isSupported()) {
    lastAlertPct = Math.abs(chg);
    new Notification({ title: `BTC ${chg >= 0 ? "up" : "down"} ${Math.abs(chg).toFixed(1)}% today`, body: `$${price.toLocaleString()} — open the desk to trade.`, silent: false })
      .on("click", () => goView("perps")).show();
  }
  void sess;
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
    if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.icns")).resize({ width: 16, height: 16 });
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch { try { tray = new Tray(nativeImage.createEmpty()); } catch { tray = null; } }
  if (!tray) return;
  tray.setTitle("  ₿ …");
  const menu = Menu.buildFromTemplate([
    { label: "Open Urizen", click: () => showMain() },
    { type: "separator" },
    { label: "Spot", accelerator: "Cmd+1", click: () => goView("spot") },
    { label: "Perps", accelerator: "Cmd+2", click: () => goView("perps") },
    { label: "Research", accelerator: "Cmd+3", click: () => goView("research") },
    { type: "separator" },
    { label: "Quit Urizen", role: "quit" },
  ]);
  tray.on("click", () => showMain());
  tray.setContextMenu(menu);
  tickOnce();
  tickerTimer = setInterval(tickOnce, 30000);
}

function createSplash() {
  splash = new BrowserWindow({
    width: 460, height: 300, frame: false, transparent: true, resizable: false,
    center: true, hasShadow: true, alwaysOnTop: true, backgroundColor: "#00000000",
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
}

function loadDesk() {
  if (!mainWindow) return;
  createSplash();
  // the DISTINCT app shell (native left rail + webview), not a raw mirror of the site
  mainWindow.loadFile(path.join(__dirname, "shell.html"));
}
function loadOnboarding() { if (mainWindow) mainWindow.loadFile(path.join(__dirname, "onboarding.html")); }

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    show: false, backgroundColor: "#0a0a0b",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false,
      webviewTag: true,
    },
  });

  // first launch → the welcome onboarding; afterwards boot straight into the desk
  if (isOnboarded()) loadDesk(); else loadOnboarding();

  mainWindow.webContents.setWindowOpenHandler((d) => walletOpenHandler(d));

  // Show the window as soon as it's ready — but NEVER depend on a single event. If `ready-to-show`
  // doesn't fire (the cause of the "app runs but no window appears" bug), `did-finish-load` or a hard
  // 2s fallback still brings it up. show() is idempotent, so racing these is safe.
  const reveal = () => { try { if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) { mainWindow.show(); mainWindow.focus(); } } catch { /* */ } };
  mainWindow.once("ready-to-show", reveal);
  mainWindow.webContents.once("did-finish-load", reveal);
  setTimeout(reveal, 2000);
  // when the desk finishes loading, retire the splash
  mainWindow.webContents.on("did-finish-load", () => { if (splash) { splash.close(); splash = null; } });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// onboarding "Enter the desk" → persist + boot the shell
ipcMain.on("onboarding-done", () => { markOnboarded(); loadDesk(); });
// account page "Reset onboarding" → clear the flag so the welcome shows next launch
ipcMain.on("reset-onboarding", () => { try { fs.unlinkSync(flagFile()); } catch { /* */ } });
// trading/connect happens in the real browser (wallets + WalletConnect work natively there, not in a webview)
ipcMain.on("open-external", (_e, url) => { if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {}); });

// Wallet popups must stay IN-APP as a child window that SHARES the session (so WalletConnect/RainbowKit
// state carries over); custom-scheme deep links (metamask://, wc:, ledgerlive://…) go to the OS; app-store
// / download pages open in the browser. This is what makes wallet connect work without a "page couldn't
// load" dead-end. The shared partition (persist:urizen) is essential — a fresh session breaks the pairing.
const WALLET_HOSTS = /walletconnect|reown|web3modal|metamask|coinbase|rainbow|rialto|lighter\.xyz|urizenfund\.com|phantom|trustwallet|okx|ledger|zerion|rabby|safe\.global/i;
function walletOpenHandler({ url }) {
  if (!/^https?:|^about:blank/i.test(url)) { shell.openExternal(url).catch(() => {}); return { action: "deny" }; }
  if (WALLET_HOSTS.test(url) || url.startsWith("about:blank")) {
    return { action: "allow", overrideBrowserWindowOptions: {
      width: 460, height: 780, minimizable: true, fullscreenable: false, backgroundColor: "#0a0a0b",
      webPreferences: { partition: "persist:urizen", contextIsolation: true, nodeIntegration: false },
    } };
  }
  shell.openExternal(url).catch(() => {}); return { action: "deny" };
}

app.on("web-contents-created", (_e, contents) => {
  if (contents.getType() !== "webview") return;
  contents.setWindowOpenHandler((d) => walletOpenHandler(d));
  // CRITICAL: never let the terminal webview navigate AWAY from our site. WalletConnect/wallet flows try
  // to push the top frame to a wallet URL that dead-ends ("This page couldn't load"). Keep the desk pinned
  // to urizenfund.com; any off-site nav (wallet deep link / universal link) is handed to the OS instead,
  // so the in-page WalletConnect QR keeps working while the app never shows a broken page.
  contents.on("will-navigate", (e, url) => {
    try {
      const host = new URL(url).host;
      if (host === "urizenfund.com" || host.endsWith(".urizenfund.com") || host === "localhost") return;
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    } catch { /* */ }
  });
});

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Urizen", submenu: [{ role: "about" }, { type: "separator" }, { label: "Reset onboarding", click: () => { try { fs.unlinkSync(flagFile()); } catch {} } }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Go", submenu: [
      { label: "Spot", accelerator: "Cmd+1", click: () => goView("spot") },
      { label: "Perps", accelerator: "Cmd+2", click: () => goView("perps") },
      { label: "Research", accelerator: "Cmd+3", click: () => goView("research") },
      { type: "separator" },
      { label: "Toggle Urizen", accelerator: "Cmd+Alt+U", click: () => toggleMain() },
    ] },
    { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
  ]));
}

app.whenReady().then(() => {
  createMain();
  buildMenu();
  createTray();
  // Microphone (for local speech-to-text): Electron denies media by default. Allow it on both the shell and
  // the terminal webview session. Wrapped so a failure here can NEVER stop the window from being created.
  try {
    const allowMic = (perm) => perm === "media" || perm === "audioCapture" || perm === "microphone";
    for (const s of [session.defaultSession, session.fromPartition("persist:urizen")]) {
      s.setPermissionRequestHandler((_wc, permission, cb) => cb(allowMic(permission)));
      s.setPermissionCheckHandler((_wc, permission) => allowMic(permission));
    }
    if (systemPreferences.askForMediaAccess) systemPreferences.askForMediaAccess("microphone").catch(() => {});
  } catch (e) { console.error("mic setup skipped:", e && e.message); }
  // global hotkey — summon/hide the desk from anywhere (⌘⌥U). Only a native app can do this.
  try { globalShortcut.register("CommandOrControl+Alt+U", toggleMain); } catch { /* */ }
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); else showMain(); });
});
app.on("will-quit", () => { globalShortcut.unregisterAll(); if (tickerTimer) clearInterval(tickerTimer); });
// keep running in the menu bar when the window closes (mac desk behaviour)
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// the shell can report what the user is watching (optional future ticker source)
ipcMain.on("ticker", () => {});
