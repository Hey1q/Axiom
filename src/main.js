const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  MenuItem,
} = require("electron");
const path = require("node:path");
const fs = require("fs");
const open = require("open");
const bot = require("./bot.js");

const { saveOwnerConfig, loadConfig } = require(path.join(
  __dirname,
  "functions",
  "setupHandler"
));

let mainWindow;

function isValidConfig(config) {
  try {
    return (
      config?.DISCORD_CLIENT_ID?.trim() &&
      config?.DISCORD_CLIENT_SECRET?.trim() &&
      config?.DISCORD_BOT_TOKEN?.trim() &&
      config?.DISCORD_REDIRECT_URI?.trim() &&
      config?.GUILD_ID?.trim() &&
      config?.DATABASE_URL?.trim() &&
      config?.GUILD_INVITE_URL?.trim() &&
      config?.OWNER_DISCORD_ID?.trim()
    );
  } catch {
    return false;
  }
}

function getInitialPage() {
  try {
    const config = loadConfig();
    return isValidConfig(config)
      ? path.join(__dirname, "..", "pages", "index.html")
      : path.join(__dirname, "..", "pages", "setup.html");
  } catch {
    return path.join(__dirname, "..", "pages", "setup.html");
  }
}

function resolvePageSafe(page) {
  const pagesRoot = path.join(__dirname, "..", "pages");
  const whitelist = new Set([
    "index.html",
    "dashboard.html",
    "setup.html",
    "termsofservices.html",
    "donates.html",
    "about.html",
  ]);

  if (whitelist.has(page)) {
    return path.join(pagesRoot, page);
  }

  if (page.startsWith("cards/") && page.endsWith(".html")) {
    const target = path.join(pagesRoot, page);
    if (target.startsWith(pagesRoot)) return target;
  }

  return null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.resolve(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  //  mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.maximize();

  const initialPage = getInitialPage();
  await mainWindow.loadFile(initialPage);

  mainWindow.webContents.on("did-finish-load", async () => {
    if (initialPage.includes("index.html")) {
      try {
        bot.start();
      } catch (err) {
        console.error("❌ Bot failed to start:", err);
      }
    }
  });

  bot.on("log", (message) => {
    if (!mainWindow?.webContents) return;
    mainWindow.webContents.send("log", message);
  });

  bot.on("statusChange", (status) => {
    if (!mainWindow?.webContents) return;
    mainWindow.webContents.send("status-change", status);
  });
}

Menu.setApplicationMenu(null);

ipcMain.on("bot-start", () => bot.start());
ipcMain.on("bot-stop", () => bot.stop());

ipcMain.on("open-external-link", (_event, url) => {
  if (
    typeof url === "string" &&
    (url.startsWith("http://") || url.startsWith("https://"))
  ) {
    shell.openExternal(url);
  }
});

ipcMain.handle("open-window", async (_event, page) => {
  try {
    const target = resolvePageSafe(String(page || ""));
    if (!target) return false;
    if (!mainWindow) await createWindow();
    await mainWindow.loadFile(target);
    return true;
  } catch (err) {
    console.error("open-window failed:", err);
    return false;
  }
});

ipcMain.handle("save-owner-config", async (_event, config) => {
  const forward = (msg) => {
    try {
      mainWindow?.webContents.send("setup-log", String(msg ?? ""));
    } catch {}
  };

  try {
    await saveOwnerConfig(config, forward);

    if (isValidConfig(config)) {
      bot.start();
    }
    return true;
  } catch (err) {
    const errMsg =
      "❌ Failed to save config or start bot: " + (err?.message || err);
    console.error(errMsg);
    forward(errMsg);
    return false;
  }
});

ipcMain.handle("get-owner-config", () => {
  try {
    return loadConfig();
  } catch (err) {
    console.error("get-owner-config failed:", err);
    return null;
  }
});

ipcMain.handle("update-owner-config", async (_event, newConfig) => {
  try {
    await saveOwnerConfig(newConfig);
    return true;
  } catch (err) {
    console.error("❌ Update failed:", err);
    return false;
  }
});

ipcMain.handle("get-session-info", () => {
  const cfg = loadConfig() || {};
  return {
    username: "Owner",
    role: "owner",
    discordId: cfg.OWNER_DISCORD_ID || null,
  };
});

ipcMain.handle("get-discord-link", () => {
  const config = loadConfig();
  return { link: config?.GUILD_INVITE_URL || null };
});

ipcMain.handle("check-discord-owner", (_event, discordId) => {
  const config = loadConfig();
  return (config?.OWNER_DISCORD_ID || "") === String(discordId || "");
});

ipcMain.handle("start-discord-oauth", () => {
  const config = loadConfig();
  const clientId = config?.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(config?.DISCORD_REDIRECT_URI || "");
  const scopes = encodeURIComponent("identify");
  if (clientId && redirectUri) {
    const url = `https://discord.com/oauth2/authorize?response_type=code&client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
    shell.openExternal(url);
  }
});

app.setAsDefaultProtocolClient("axiom");

app.on("browser-window-created", (event, win) => {
  win.webContents.on("context-menu", (_e, params) => {
    const menu = new Menu();
    if (params.editFlags.canPaste) menu.append(new MenuItem({ role: "paste" }));
    if (params.editFlags.canCopy) menu.append(new MenuItem({ role: "copy" }));
    if (params.editFlags.canCut) menu.append(new MenuItem({ role: "cut" }));
    if (params.editFlags.canSelectAll)
      menu.append(new MenuItem({ role: "selectAll" }));
    if (menu.items.length > 0) menu.popup({ window: win });
  });
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (mainWindow && code) {
      mainWindow.webContents.send("oauth-code", code);
    }
  } catch (err) {
    console.error("Failed to parse open-url:", err);
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
