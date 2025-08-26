const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  MenuItem,
  globalShortcut,
} = require("electron");
const path = require("node:path");
const fs = require("fs");
const open = require("open");
const bot = require("./bot.js");
const { assertSnowflake } = require("./lib/validators");
const { mapDiscordError } = require("./lib/errorMap");

const { ButtonStyle } = require("discord.js");

const { createVerifyStateStore } = require("./storage/verifyState");
const verifyState = createVerifyStateStore(app.getPath("userData"));

const { saveOwnerConfig, loadConfig } = require(path.join(
  __dirname,
  "functions",
  "setupHandler"
));

let mainWindow;
const MARKER = "AXIOM_SETUP_V1";
function addMarker(embed, type) {
  const e = { ...(embed || {}) };
  const sig = `${MARKER}:${type}`;
  if (e.footer && e.footer.text) e.footer.text += ` • ${sig}`;
  else e.footer = { text: sig };
  return e;
}

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
    "embedbuilder.html",
    "donates.html",
    "about.html",
    "channels.html",
  ]);

  if (whitelist.has(page)) return path.join(pagesRoot, page);

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

function buildAppMenu() {
  const template = [
    {
      label: "View",
      submenu: [
        {
          label: "Toggle DevTools",
          accelerator: "F12",
          click: () => {
            const w = BrowserWindow.getFocusedWindow() || mainWindow;
            if (!w) return;
            const wc = w.webContents;
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools({ mode: "detach" });
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function registerDevtoolsShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!w) return;
    const wc = w.webContents;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: "detach" });
  });
}

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
    if (isValidConfig(config)) bot.start();
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

ipcMain.handle("embed:list", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing in owner-config.json.");
    const channels = await bot.listTextChannels(guildId);
    return { ok: true, channels };
  } catch (err) {
    console.error("embed:list error:", err);
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("embed:send", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing in owner-config.json.");

    const chId = String(payload?.channelId ?? "").trim();
    if (chId) assertSnowflake(chId, "Channel ID");

    const res = await bot.sendEmbed({
      guildId,
      channelId: chId,
      messageContent: payload.messageContent || "",
      embed: payload.embed || {},
      buttons: payload.buttons || [],
      mention: payload.mention || null,
      suppressEmbeds: !!payload.suppressEmbeds,
    });

    return { ok: true, messageId: res?.id || null, jumpLink: res?.url || null };
  } catch (err) {
    console.error("embed:send error:", err);
    return { ok: false, error: mapDiscordError(err) };
  }
});

ipcMain.handle("verify:getState", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) return { active: false };
    const gate = await verifyState.get(guildId);
    return gate ? { active: true, gate } : { active: false };
  } catch (e) {
    console.error("verify:getState failed:", e);
    return { active: false };
  }
});

ipcMain.handle("verify:publish", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    const chId = String(payload?.channelId ?? "").trim();
    if (chId) assertSnowflake(chId, "Verification Channel ID");

    await bot
      .deleteRecentVerifyGates({ guildId, channelId: chId, scanLimit: 50 })
      .catch(() => {});

    const msg = await bot.sendEmbed({
      guildId,
      channelId: chId,
      messageContent: "",
      embed: payload.embed || {},
      buttons:
        Array.isArray(payload.buttons) && payload.buttons.length
          ? payload.buttons
          : [
              {
                customId: "verify_accept",
                label: "✅ Accept",
                style: "Success",
              },
              {
                customId: "verify_decline",
                label: "❌ Decline",
                style: "Danger",
              },
            ],
    });

    return {
      ok: true,
      jumpLink: msg.url,
      gate: { channelId: msg.channelId, messageId: msg.id },
    };
  } catch (e) {
    console.error("verify:publish failed:", e);
    return { ok: false, error: mapDiscordError(e) };
  }
});

ipcMain.handle("verify:remove", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    await bot.deleteVerifyGatesInGuild({ guildId, perChannelScan: 50 });
    return { ok: true, deleted: true };
  } catch (e) {
    console.error("verify:remove failed:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("roles:list", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");
    const roles = await bot.listRoles(guildId);
    return { ok: true, roles };
  } catch (e) {
    console.error("roles:list failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("verify:getRole", async () => {
  try {
    const cfg = loadConfig() || {};
    return { ok: true, roleId: cfg.VERIFY_ROLE_ID || null };
  } catch (e) {
    console.error("verify:getRole failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("verify:setRole", async (_e, roleId) => {
  try {
    const cfg = loadConfig() || {};
    const s = String(roleId || "").trim();
    cfg.VERIFY_ROLE_ID = /^\d{17,20}$/.test(s) ? s : null;
    await saveOwnerConfig(cfg);
    return { ok: true, roleId: cfg.VERIFY_ROLE_ID };
  } catch (e) {
    console.error("verify:setRole failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("wl:get", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();

    let joinName = null;
    let leaveName = null;

    if (guildId && cfg.WELCOME_CHANNEL_ID) {
      joinName = await bot.getChannelName(guildId, cfg.WELCOME_CHANNEL_ID);
    }
    if (guildId && cfg.LEAVE_CHANNEL_ID) {
      leaveName = await bot.getChannelName(guildId, cfg.LEAVE_CHANNEL_ID);
    }

    return {
      ok: true,
      data: {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
        joinChannelName: joinName,
        leaveChannelName: leaveName,
      },
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("wl:setJoinChannel", async (_e, id) => {
  try {
    const cfg = loadConfig() || {};
    const s = String(id || "").trim();
    cfg.WELCOME_CHANNEL_ID = /^\d{17,20}$/.test(s) ? s : null;
    await saveOwnerConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("wl:setLeaveChannel", async (_e, id) => {
  try {
    const cfg = loadConfig() || {};
    const s = String(id || "").trim();
    cfg.LEAVE_CHANNEL_ID = /^\d{17,20}$/.test(s) ? s : null;
    await saveOwnerConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("wl:publishAll", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    const verifyId = String(payload?.verify?.channelId ?? "").trim();
    if (verifyId) assertSnowflake(verifyId, "Verification Channel ID");

    const vDesc = String(payload?.verify?.embed?.description ?? "").trim();
    if (!vDesc)
      throw new Error(
        "Verification embed: description is required. Please fill 'Embed description'."
      );

    const w = payload?.joinEmbed,
      l = payload?.leaveEmbed;
    if (w && !String(w.description ?? "").trim())
      throw new Error("Welcome embed: description is required.");
    if (l && !String(l.description ?? "").trim())
      throw new Error("Leave embed: description is required.");

    const results = { welcome: null, leave: null, verify: null };

    if (cfg.WELCOME_CHANNEL_ID) {
      const resW = await bot.sendEmbed({
        guildId,
        channelId: cfg.WELCOME_CHANNEL_ID,
        messageContent: "",
        embed: w || {},
        buttons: [],
      });
      results.welcome = {
        channelId: cfg.WELCOME_CHANNEL_ID,
        messageId: resW?.id || null,
        url: resW?.url || null,
      };
    }

    if (cfg.LEAVE_CHANNEL_ID) {
      const resL = await bot.sendEmbed({
        guildId,
        channelId: cfg.LEAVE_CHANNEL_ID,
        messageContent: "",
        embed: l || {},
        buttons: [],
      });
      results.leave = {
        channelId: cfg.LEAVE_CHANNEL_ID,
        messageId: resL?.id || null,
        url: resL?.url || null,
      };
    }

    if (verifyId) {
      await bot
        .deleteRecentVerifyGates({
          guildId,
          channelId: verifyId,
          scanLimit: 50,
        })
        .catch(() => {});
      const msg = await bot.sendEmbed({
        guildId,
        channelId: verifyId,
        messageContent: "",
        embed: {
          title: String(payload?.verify?.embed?.title ?? "Welcome"),
          description: vDesc,
        },
        buttons:
          Array.isArray(payload?.verify?.buttons) &&
          payload.verify.buttons.length
            ? payload.verify.buttons
            : [
                {
                  customId: "verify_accept",
                  label: "✅ Accept",
                  style: "Success",
                },
                {
                  customId: "verify_decline",
                  label: "❌ Decline",
                  style: "Danger",
                },
              ],
      });
      results.verify = {
        channelId: msg.channelId,
        messageId: msg.id,
        url: msg.url || null,
      };
    }

    return { ok: true, results };
  } catch (e) {
    console.error("wl:publishAll failed:", e);
    return { ok: false, error: mapDiscordError(e) };
  }
});

ipcMain.handle("wl:removeAll", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    if (cfg.WELCOME_CHANNEL_ID) {
      await bot
        .deleteByFooterIncludes({
          guildId,
          channelId: cfg.WELCOME_CHANNEL_ID,
          includes: "AXIOM_SETUP_V1:welcome",
          limit: 50,
        })
        .catch(() => {});
    }
    if (cfg.LEAVE_CHANNEL_ID) {
      await bot
        .deleteByFooterIncludes({
          guildId,
          channelId: cfg.LEAVE_CHANNEL_ID,
          includes: "AXIOM_SETUP_V1:leave",
          limit: 50,
        })
        .catch(() => {});
    }
    if (cfg.VERIFY_CHANNEL_ID) {
      await bot
        .deleteByFooterIncludes({
          guildId,
          channelId: cfg.VERIFY_CHANNEL_ID,
          includes: "AXIOM_SETUP_V1:verify",
          limit: 50,
        })
        .catch(() => {});
    }

    try {
      const gate = await verifyState.get(guildId);
      if (gate) await verifyState.clear(guildId);
    } catch {}

    await saveOwnerConfig({
      WELCOME_CHANNEL_ID: null,
      LEAVE_CHANNEL_ID: null,
      VERIFY_ROLE_ID: null,
      VERIFY_CHANNEL_ID: null,
      LAST_JOIN_CHANNEL_ID: null,
      LAST_JOIN_MESSAGE_ID: null,
      LAST_LEAVE_CHANNEL_ID: null,
      LAST_LEAVE_MESSAGE_ID: null,
      VERIFY_MESSAGE_ID: null,
      VERIFY_CREATED_AT: null,
      VERIFY_UPDATED_AT: null,
    });

    return { ok: true };
  } catch (e) {
    console.error("wl:removeAll failed:", e);
    return { ok: false, error: e?.message || String(e) };
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
    if (mainWindow && code) mainWindow.webContents.send("oauth-code", code);
  } catch (err) {
    console.error("Failed to parse open-url:", err);
  }
});

app.whenReady().then(async () => {
  await createWindow();
  buildAppMenu();
  registerDevtoolsShortcuts();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
