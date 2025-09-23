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
const { getOwnerConfigDir } = require(path.join(
  __dirname,
  "functions",
  "utils"
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

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}
function ensureFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, "", "utf8");
    }
    return true;
  } catch {
    return false;
  }
}
function isJsonlPath(p) {
  return (
    typeof p === "string" &&
    /^(?:[A-Za-z]:\\|\\\\|\/).+\.jsonl$/i.test(p.trim())
  );
}
function readJsonl(file, typeTag /* 'shop'|'other' */) {
  const out = [];
  try {
    if (!fs.existsSync(file)) return out;
    const data = fs.readFileSync(file, "utf8");
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        if (typeTag && !obj.type) obj.type = typeTag;
        out.push(obj);
      } catch {}
    }
  } catch {}
  return out;
}

function transcriptsDirFromConfig(cfg) {
  const def = path.join(getOwnerConfigDir(), "transcripts");
  const d = (cfg?.TRANSCRIPTS_DIR || "").trim();
  return d || def;
}

for (const ch of [
  "tickets:get",
  "tickets:setChannel",
  "tickets:remove",
  "tickets:publish",
  "tickets:setCategory",
  "tickets:purge",
  "tickets:getPaths",
  "tickets:setPaths",
  "tickets:ensureDefaultLogs",
  "tickets:readLogs",
  "tickets:clearLogs",
  "tickets:openLogsFolder",
  "tickets:getTranscriptsDir",
  "tickets:ensureTranscriptsDir",
]) {
  try {
    ipcMain.removeHandler(ch);
  } catch {}
}

const TICKET_MARKER = "AXIOM_TICKETS_V1";
function addTicketMarker(embed, type) {
  const e = { ...(embed || {}) };
  const sig = `${TICKET_MARKER}:${type}`;
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
    "tickets.html",
    "giveaway.html",
    "message-router.html",
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

const TICKETS_MARKER = "AXIOM_TICKETS_V1";

function withInvisibleFooter(embed = {}) {
  const e = { ...embed };
  if (e.footer && e.footer.text) {
    e.footer = { text: e.footer.text };
  } else {
    e.footer = { text: "\u200B" };
  }
  return e;
}

ipcMain.handle("tickets:get", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const channelId = (cfg.TICKETS_CHANNEL_ID || "").trim() || null;
    const categoryId = (cfg.TICKETS_CATEGORY_ID || "").trim() || null;

    let channelName = null;
    let categoryName = null;

    if (guildId && channelId) {
      try {
        channelName = await bot.getChannelName(guildId, channelId);
      } catch {}
    }
    if (guildId && categoryId && typeof bot.getCategoryName === "function") {
      try {
        categoryName = await bot.getCategoryName(guildId, categoryId);
      } catch {}
    }

    return {
      ok: true,
      data: { channelId, channelName, categoryId, categoryName },
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:setCategory", async (_e, categoryIdRaw) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const categoryId = String(categoryIdRaw || "").trim();

    if (!guildId) return { ok: false, error: "GUILD_ID missing in config." };
    if (categoryId && !/^\d{17,20}$/.test(categoryId)) {
      return { ok: false, error: "Invalid category ID." };
    }

    let categoryName = null;
    if (categoryId && typeof bot.getCategoryName === "function") {
      categoryName = await bot
        .getCategoryName(guildId, categoryId)
        .catch(() => null);
      if (!categoryName)
        return {
          ok: false,
          error: "Provided ID is not a category in this guild.",
        };
    }

    cfg.TICKETS_CATEGORY_ID = categoryId || null;
    await saveOwnerConfig(cfg);
    return { ok: true, categoryId: cfg.TICKETS_CATEGORY_ID, categoryName };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:setChannel", async (_e, channelIdRaw) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const channelId = String(channelIdRaw || "").trim();

    if (!/^\d{17,20}$/.test(channelId)) {
      return { ok: false, error: "Invalid channel ID." };
    }
    if (!guildId) {
      return { ok: false, error: "GUILD_ID missing in config." };
    }

    let channelName = null;
    try {
      channelName = await bot.getChannelName(guildId, channelId);
    } catch {}

    cfg.TICKETS_CHANNEL_ID = channelId;
    if ("TICKETS_CHANNEL_NAME" in cfg) cfg.TICKETS_CHANNEL_NAME = null;

    await saveOwnerConfig(cfg);
    return { ok: true, channelId, channelName };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:remove", async () => {
  try {
    const cfg0 = loadConfig() || {};
    const guildId = (cfg0.GUILD_ID || "").trim();
    const channelId = (cfg0.TICKETS_CHANNEL_ID || "").trim();
    const panelMsgId = (cfg0.TICKETS_PANEL_MESSAGE_ID || "").trim();

    if (
      guildId &&
      /^\d{17,20}$/.test(channelId) &&
      /^\d{17,20}$/.test(panelMsgId)
    ) {
      try {
        await bot.deleteMessage(guildId, channelId, panelMsgId);
      } catch {}
    }
    try {
      if (guildId && /^\d{17,20}$/.test(channelId)) {
        await bot
          .deleteByFooterIncludes({
            guildId,
            channelId,
            includes: "AXIOM_TICKETS_V1:PANEL",
            limit: 30,
          })
          .catch(() => {});
      }
    } catch {}

    await saveOwnerConfig({
      TICKETS_CHANNEL_ID: undefined,
      TICKETS_PANEL_MESSAGE_ID: undefined,
      TICKETS_CHANNEL_NAME: undefined,
      TICKETS_CATEGORY_ID: undefined,
      TICKETS_SHOP_LOG_PATH: undefined,
      TICKETS_OTHER_LOG_PATH: undefined,
      TRANSCRIPTS_DIR: undefined,
    });

    let cfg = loadConfig() || {};
    const hasVal = (k) => typeof cfg[k] === "string" && cfg[k].trim() !== "";
    if (
      hasVal("TICKETS_CHANNEL_ID") ||
      hasVal("TICKETS_PANEL_MESSAGE_ID") ||
      hasVal("TICKETS_CHANNEL_NAME") ||
      hasVal("TICKETS_CATEGORY_ID") ||
      hasVal("TICKETS_SHOP_LOG_PATH") ||
      hasVal("TICKETS_OTHER_LOG_PATH") ||
      hasVal("TRANSCRIPTS_DIR")
    ) {
      await saveOwnerConfig({
        TICKETS_CHANNEL_ID: null,
        TICKETS_PANEL_MESSAGE_ID: null,
        TICKETS_CHANNEL_NAME: null,
        TICKETS_CATEGORY_ID: null,
        TICKETS_SHOP_LOG_PATH: null,
        TICKETS_OTHER_LOG_PATH: null,
        TRANSCRIPTS_DIR: null,
      });
    }

    cfg = loadConfig() || {};
    if (
      hasVal("TICKETS_CHANNEL_ID") ||
      hasVal("TICKETS_PANEL_MESSAGE_ID") ||
      hasVal("TICKETS_CHANNEL_NAME") ||
      hasVal("TICKETS_CATEGORY_ID") ||
      hasVal("TICKETS_SHOP_LOG_PATH") ||
      hasVal("TICKETS_OTHER_LOG_PATH") ||
      hasVal("TRANSCRIPTS_DIR")
    ) {
      await saveOwnerConfig({
        TICKETS_CHANNEL_ID: "",
        TICKETS_PANEL_MESSAGE_ID: "",
        TICKETS_CHANNEL_NAME: "",
        TICKETS_CATEGORY_ID: "",
        TICKETS_SHOP_LOG_PATH: "",
        TICKETS_OTHER_LOG_PATH: "",
        TRANSCRIPTS_DIR: "",
      });
    }

    return { ok: true };
  } catch (e) {
    console.error("tickets:remove failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:publish", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const channelId = (cfg.TICKETS_CHANNEL_ID || "").trim();

    if (!guildId) return { ok: false, error: "GUILD_ID missing." };
    if (!/^\d{17,20}$/.test(channelId)) {
      return { ok: false, error: "No tickets channel set." };
    }

    const { title, description, thumbnail } = payload || {};

    const oldId = (cfg.TICKETS_PANEL_MESSAGE_ID || "").trim();
    if (/^\d{17,20}$/.test(oldId)) {
      try {
        await bot.deleteMessage(guildId, channelId, oldId);
      } catch (err) {
        console.warn(
          "tickets:publish delete old panel warn:",
          err?.message || err
        );
      }
    }

    const embed = withInvisibleFooter({
      title: String(title || "Open a Ticket"),
      description: String(
        description ||
          "Please choose a category from the menu below to open a ticket."
      ),
    });

    if (thumbnail && typeof thumbnail === "string" && thumbnail.trim()) {
      embed.thumbnail = { url: thumbnail.trim() };
    }

    const components = [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "tickets:open",
            placeholder: "Choose a ticket to create",
            min_values: 1,
            max_values: 1,
            options: [
              {
                label: "Shop/Donations",
                value: "shop",
                description: "Shop, donations, subscriptions",
                emoji: { id: null, name: "🛍️" },
              },
              {
                label: "Other",
                value: "other",
                description: "General support",
                emoji: { id: null, name: "🧩" },
              },
            ],
          },
        ],
      },
    ];

    const msg = await bot.sendEmbed({
      guildId,
      channelId,
      messageContent: "",
      embed,
      buttons: [],
      components,
    });

    cfg.TICKETS_PANEL_MESSAGE_ID = msg?.id || null;
    await saveOwnerConfig(cfg);

    return { ok: true, messageId: msg?.id || null, url: msg?.url || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:getStaffRole", async () => {
  try {
    const cfg = loadConfig() || {};
    return { ok: true, roleId: cfg.TICKETS_STAFF_ROLE_ID || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:setStaffRole", async (_e, roleIdRaw) => {
  try {
    const cfg = loadConfig() || {};
    const s = String(roleIdRaw || "").trim();
    cfg.TICKETS_STAFF_ROLE_ID = /^\d{17,20}$/.test(s) ? s : null;
    await saveOwnerConfig(cfg);
    return { ok: true, roleId: cfg.TICKETS_STAFF_ROLE_ID };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:getPaths", async () => {
  try {
    const cfg = loadConfig() || {};
    return {
      ok: true,
      data: {
        shopPath: cfg.TICKETS_SHOP_LOG_PATH || null,
        otherPath: cfg.TICKETS_OTHER_LOG_PATH || null,
      },
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:setPaths", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const shop = String(payload?.shopPath || "").trim();
    const other = String(payload?.otherPath || "").trim();
    cfg.TICKETS_SHOP_LOG_PATH = shop || null;
    cfg.TICKETS_OTHER_LOG_PATH = other || null;
    await saveOwnerConfig(cfg);
    return {
      ok: true,
      data: {
        shopPath: cfg.TICKETS_SHOP_LOG_PATH,
        otherPath: cfg.TICKETS_OTHER_LOG_PATH,
      },
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:ensureDefaultLogs", async () => {
  try {
    const cfg = loadConfig() || {};
    const baseDir = path.join(getOwnerConfigDir(), "logs");
    const shop = path.join(baseDir, "tickets-shop.jsonl");
    const other = path.join(baseDir, "tickets-other.jsonl");

    ensureDir(baseDir);
    ensureFile(shop);
    ensureFile(other);

    cfg.TICKETS_SHOP_LOG_PATH = shop;
    cfg.TICKETS_OTHER_LOG_PATH = other;
    await saveOwnerConfig(cfg);

    return { ok: true, data: { shopPath: shop, otherPath: other } };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:readLogs", (_e, query = {}) => {
  try {
    const cfg = loadConfig() || {};
    const shopPath = cfg.TICKETS_SHOP_LOG_PATH || null;
    const otherPath = cfg.TICKETS_OTHER_LOG_PATH || null;

    let rows = [];
    if (shopPath) rows = rows.concat(readJsonl(shopPath, "shop"));
    if (otherPath) rows = rows.concat(readJsonl(otherPath, "other"));

    rows = rows.map((r) => ({
      ts: r.ts || r.timestamp || new Date().toISOString(),
      type: r.type || "other",
      action: r.action || "create",

      guildId: r.guildId || null,
      channelId: r.channelId || null,
      channelName: r.channelName || null,

      openerId: r.openerId || null,
      openerTag: r.openerTag || null,
      openerNickname: r.openerNickname || null,
      openerAvatar: r.openerAvatar || null,

      closedBy: r.closedBy || null,
      closedByTag: r.closedByTag || null,
      closedByNickname: r.closedByNickname || null,
      closedByAvatar: r.closedByAvatar || null,

      messagesCount: Number.isFinite(r.messagesCount) ? r.messagesCount : null,
      attachmentsCount: Number.isFinite(r.attachmentsCount)
        ? r.attachmentsCount
        : null,
      participants: Array.isArray(r.participants) ? r.participants : [],

      ticketId: r.ticketId || r.channelId || null,
      transcriptPath: r.transcriptPath || null,
    }));

    const type = (query.type || "all").toLowerCase();
    const search = (query.search || "").trim().toLowerCase();
    const sort = (query.sort || "newest").toLowerCase();
    const page = Math.max(1, parseInt(query.page || 1, 10));
    const pageSize = Math.min(
      200,
      Math.max(10, parseInt(query.pageSize || 50, 10))
    );

    if (type === "shop" || type === "other") {
      rows = rows.filter((x) => x.type === type);
    }
    if (search) {
      rows = rows.filter((x) =>
        JSON.stringify(x).toLowerCase().includes(search)
      );
    }

    rows.sort((a, b) => {
      const A = new Date(a.ts).getTime() || 0;
      const B = new Date(b.ts).getTime() || 0;
      return sort === "oldest" ? A - B : B - A;
    });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return {
      ok: true,
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:clearLogs", async () => {
  try {
    const cfg = loadConfig() || {};
    const files = [
      cfg.TICKETS_SHOP_LOG_PATH || null,
      cfg.TICKETS_OTHER_LOG_PATH || null,
    ].filter(Boolean);

    let deleted = 0;
    const errors = [];

    for (const f of files) {
      try {
        if (fs.existsSync(f)) {
          fs.rmSync(f, { force: true });
          deleted++;
        }
      } catch (e) {
        errors.push(`${f}: ${e.message}`);
      }
    }

    try {
      const tdir = transcriptsDirFromConfig(cfg);
      if (fs.existsSync(tdir))
        fs.rmSync(tdir, { recursive: true, force: true });
    } catch (e) {
      errors.push(`transcripts: ${e.message}`);
    }

    for (const f of files) {
      try {
        ensureFile(f);
      } catch {}
    }

    return { ok: true, deleted, errors };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:getTranscriptsDir", () => {
  try {
    const cfg = loadConfig() || {};
    return { ok: true, dir: transcriptsDirFromConfig(cfg) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:ensureTranscriptsDir", async () => {
  try {
    const cfg = loadConfig() || {};
    const dir = transcriptsDirFromConfig(cfg);
    ensureDir(dir);
    cfg.TRANSCRIPTS_DIR = dir;
    await saveOwnerConfig(cfg);
    return { ok: true, dir };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:openLogsFolder", async (_e, which = "base") => {
  try {
    const cfg = loadConfig() || {};
    const shop = cfg.TICKETS_SHOP_LOG_PATH || "";
    const other = cfg.TICKETS_OTHER_LOG_PATH || "";
    const baseDefault = path.join(getOwnerConfigDir(), "logs");
    const transcriptsDir = transcriptsDirFromConfig(cfg);

    const openDir = async (dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      if (err) throw new Error(err);
      return dir;
    };

    const openParentOfFile = async (filePath, fallbackDir) => {
      const dir = filePath ? path.dirname(filePath) : fallbackDir;
      return openDir(dir);
    };

    let opened = null;

    switch (String(which || "base").toLowerCase()) {
      case "shop":
        if (!shop) return { ok: false, error: "Shop log path is not set." };
        opened = await openParentOfFile(shop, baseDefault);
        break;
      case "other":
        if (!other) return { ok: false, error: "Other log path is not set." };
        opened = await openParentOfFile(other, baseDefault);
        break;
      case "transcripts":
        opened = await openDir(transcriptsDir);
        break;
      case "base":
      default: {
        const candidate =
          (shop && path.dirname(shop)) ||
          (other && path.dirname(other)) ||
          baseDefault;
        opened = await openDir(candidate);
        break;
      }
    }

    return { ok: true, opened };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("tickets:purge", async (_e, opts = {}) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const channelId = String(
      opts.channelId || cfg.TICKETS_CHANNEL_ID || ""
    ).trim();

    if (!guildId) return { ok: false, error: "GUILD_ID missing in config." };
    if (!/^\d{17,20}$/.test(channelId))
      return { ok: false, error: "No tickets channel set." };

    const result = await bot.purgeChannelMessages({
      guildId,
      channelId,
      botOnly: opts.botOnly !== false,
      max: Number.isFinite(opts.max) ? Math.max(1, opts.max) : 1000,
      deleteOlder: !!opts.deleteOlder,
    });

    return { ok: true, ...result };
  } catch (e) {
    console.error("tickets:purge error:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

for (const ch of [
  "giveaway:listChannels",
  "giveaway:channels",
  "giveaway:list",
  "giveaway:start",
  "giveaway:edit",
  "giveaway:end",
  "giveaway:remove",
  "giveaway:reroll",
  "giveaway:getLogsChannel",
  "giveaway:setLogsChannel",
  "giveaway:clearLogsChannel",
  "giveaway:logStart",
]) {
  try {
    ipcMain.removeHandler(ch);
  } catch {}
}

function toId(x) {
  if (!x) return null;
  if (typeof x === "string" && /^\d{17,20}$/.test(x)) return x;
  if (typeof x === "object" && x.id && /^\d{17,20}$/.test(String(x.id)))
    return String(x.id);
  return null;
}
function toTag(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object" && (x.tag || x.username))
    return x.tag || x.username;
  return null;
}

function winnersAsIds(arr) {
  return (arr || []).map((w) => toId(w)).filter(Boolean);
}

function winnersAsMentions(arr) {
  return (arr || []).map((w) => {
    const id = toId(w);
    if (id) return `<@${id}> (${id})`;
    const t = toTag(w) || "unknown";
    const m = typeof t === "string" && t.startsWith("uid:") ? t.slice(4) : null;
    return m && /^\d{17,20}$/.test(m) ? `<@${m}> (${m})` : t;
  });
}

function winnersAsTags(arr) {
  return (arr || []).map(
    (w) => toTag(w) || (toId(w) ? `uid:${toId(w)}` : "unknown")
  );
}

function winnersLinesMentionPlusId(arr) {
  const ids = (arr || []).map((w) => toId(w)).filter(Boolean);
  return ids.map((id) => `• <@${id}> (${id})`).join("\n");
}

function winnersInlineMentionPlusId(arr) {
  const ids = (arr || []).map((w) => toId(w)).filter(Boolean);
  return ids.map((id) => `<@${id}> (${id})`).join(", ");
}

function getLogsChannelId() {
  const cfg = loadConfig() || {};
  const s = (cfg.GIVEAWAY_LOGS_CHANNEL_ID || "").trim();
  return s || null;
}

async function sendGiveawayStartLog({
  guildId,
  giveaway,
  durationMinutes,
  channelIdOverride,
}) {
  try {
    const logChannelId = channelIdOverride || getLogsChannelId();
    if (!logChannelId) return;

    const endsUnix = giveaway.endsAt
      ? Math.floor(new Date(giveaway.endsAt).getTime() / 1000)
      : null;

    let nameOfRole = (id) => `rid:${id}`;
    try {
      const roles = await bot.listRoles(guildId);
      const map = Object.fromEntries(
        (roles || []).map((r) => [String(r.id), r.name || String(r.id)])
      );
      nameOfRole = (id) => map[String(id)] ?? `rid:${id}`;
    } catch {}

    const m = giveaway.mention || {};
    const roleIds = Array.isArray(m.roles)
      ? m.roles.map(String).filter((x) => /^\d{17,20}$/.test(x))
      : [];
    const userIds = Array.isArray(m.users)
      ? m.users.map(String).filter((x) => /^\d{17,20}$/.test(x))
      : [];
    const mentionEveryone = !!m.everyone;

    const mentionLines = [];
    if (mentionEveryone) mentionLines.push("📣 @everyone");
    if (roleIds.length) {
      const roleNames = roleIds.map((rid) => nameOfRole(rid));
      mentionLines.push("🏷️ Roles: " + roleNames.join(", "));
    }
    if (userIds.length) {
      mentionLines.push(`👥 Users: ${userIds.length}`);
    }

    const slice20 = (arr) => arr.slice(0, 20);
    const overflowText = (all, shown) =>
      all.length > shown.length ? `\n… +${all.length - shown.length} more` : "";

    const roleLinesDetailed = roleIds.length
      ? slice20(roleIds)
          .map((id) => `• <@&${id}> (${id})`)
          .join("\n") + overflowText(roleIds, slice20(roleIds))
      : null;

    const userLinesDetailed = userIds.length
      ? slice20(userIds)
          .map((id) => `• <@${id}> (${id})`)
          .join("\n") + overflowText(userIds, slice20(userIds))
      : null;

    const fields = [
      { name: "🆔 Giveaway", value: String(giveaway.id || "—"), inline: true },
      { name: "#️⃣ Channel", value: `<#${giveaway.channelId}>`, inline: true },
      ...(giveaway.messageId
        ? [
            {
              name: "🧾 Message ID",
              value: String(giveaway.messageId),
              inline: true,
            },
          ]
        : []),
      ...(Number.isFinite(durationMinutes)
        ? [{ name: "⏱️ Duration", value: `${durationMinutes}m`, inline: true }]
        : []),
      ...(Number.isFinite(giveaway.winners)
        ? [
            {
              name: "👥 Winners",
              value: String(giveaway.winners),
              inline: true,
            },
          ]
        : []),
      ...(Number.isFinite(endsUnix)
        ? [{ name: "🕒 Ends", value: `<t:${endsUnix}:F>`, inline: true }]
        : []),
      ...(mentionLines.length
        ? [{ name: "🔔 Mentions", value: mentionLines.join("\n") }]
        : []),
      ...(roleLinesDetailed
        ? [{ name: "🏷️ Mentioned Roles", value: roleLinesDetailed }]
        : []),
      ...(userLinesDetailed
        ? [{ name: "👥 Mentioned Users", value: userLinesDetailed }]
        : []),
    ];

    const embed = {
      title: "🎁 Giveaway started",
      description: giveaway.title ? `**${String(giveaway.title)}**` : undefined,
      fields,
      ...(giveaway.thumbUrl
        ? { thumbnail: { url: String(giveaway.thumbUrl) } }
        : {}),
      ...(giveaway.imageUrl
        ? { image: { url: String(giveaway.imageUrl) } }
        : {}),
      footer: { text: `GW:${giveaway.id || "?"}` },
      timestamp: new Date().toISOString(),
    };

    await bot.sendEmbed({
      guildId,
      channelId: logChannelId,
      messageContent: giveaway.url ? `🔗 Link: ${giveaway.url}` : undefined,
      embed,
      buttons: [],
      allowedMentions: { parse: [], roles: [], users: [], replied_user: false },
    });
  } catch (e) {
    console.error("sendGiveawayStartLog failed:", e?.message || e);
  }
}

const { createLogFile, appendEntry, finalizeLog } = require(path.join(
  __dirname,
  "functions",
  "giveawayLogger"
));
const GW = require(path.join(__dirname, "functions", "giveawayStore"));

const GW_TIMERS = new Map();
const GW_ENDING = new Set();

async function sendGiveawayEditLog({
  guildId,
  before = {},
  after = {},
  giveaway = {},
  channelIdOverride,
}) {
  try {
    const logChannelId = channelIdOverride || getLogsChannelId();
    if (!logChannelId) return;

    const fmt = (v) =>
      v === null || v === undefined || String(v).trim() === ""
        ? "—"
        : String(v);

    const changed = [];
    for (const key of [
      "title",
      "description",
      "winners",
      "thumbUrl",
      "imageUrl",
    ]) {
      const b = before?.[key];
      const a = after?.[key];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        changed.push({
          name: `✏️ ${key}`,
          value: `• before: ${fmt(b)}\n• after: ${fmt(a)}`,
        });
      }
    }

    const fields = [
      { name: "🆔 Giveaway", value: String(giveaway.id || "—"), inline: true },
      { name: "#️⃣ Channel", value: `<#${giveaway.channelId}>`, inline: true },
      ...(giveaway.messageId
        ? [
            {
              name: "🧾 Message ID",
              value: String(giveaway.messageId),
              inline: true,
            },
          ]
        : []),
      ...(changed.length ? changed : [{ name: "Διαφορές", value: "—" }]),
    ];

    const embed = {
      title: "✏️ Giveaway edited",
      description: giveaway.title ? `**${String(giveaway.title)}**` : undefined,
      fields,
      ...(giveaway.thumbUrl
        ? { thumbnail: { url: String(giveaway.thumbUrl) } }
        : {}),
      ...(giveaway.imageUrl
        ? { image: { url: String(giveaway.imageUrl) } }
        : {}),
      footer: { text: `GW:${giveaway.id || "?"}` },
      timestamp: new Date().toISOString(),
    };

    await bot.sendEmbed({
      guildId,
      channelId: logChannelId,
      messageContent: giveaway.url ? `🔗 Link: ${giveaway.url}` : undefined,
      embed,
      buttons: [],
      allowedMentions: { parse: [], roles: [], users: [], replied_user: false },
    });
  } catch (e) {
    console.error("sendGiveawayEditLog failed:", e?.message || e);
  }
}

function scheduleEnd(gw) {
  try {
    const id = String(gw.id || "");
    if (!id) return;
    const old = GW_TIMERS.get(id);
    if (old) clearTimeout(old);
    const endsMs = new Date(gw.endsAt).getTime() || 0;
    let delay = Math.min(Math.max(endsMs - Date.now(), 0), 0x7fffffff);
    const t = setTimeout(async () => {
      try {
        await endGiveawayById(id, "auto");
      } catch (e) {
        console.error("giveaway auto-end error:", e?.message || e);
      } finally {
        GW_TIMERS.delete(id);
      }
    }, delay);
    GW_TIMERS.set(id, t);
  } catch (e) {
    console.warn("scheduleEnd failed:", e?.message || e);
  }
}

ipcMain.handle("giveaway:listChannels", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing in config.");
    const channels = await bot.listTextChannels(guildId);
    return { ok: true, channels };
  } catch (err) {
    console.error("giveaway:listChannels error:", err);
    return { ok: false, error: String(err?.message || err) };
  }
});
ipcMain.handle("giveaway:channels", async () => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");
    const channels = await bot.listTextChannels(guildId);
    return { ok: true, channels };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
ipcMain.handle("giveaway:list", async () => {
  try {
    const list = GW.readAll().sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    return { ok: true, items: list };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:start", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    const channelId = String(payload?.channelId || "").trim();
    const title = String(payload?.title || "Giveaway").trim();
    const description = String(payload?.description || "").trim();
    const winners = Math.max(1, parseInt(payload?.winners || 1, 10));
    const durationMin = Math.max(1, parseInt(payload?.durationMin || 60, 10));
    if (!/^\d{17,20}$/.test(channelId)) throw new Error("Invalid channelId");

    const rawThumb = String(payload?.thumbUrl || "").trim();
    const rawImage = String(payload?.imageUrl || "").trim();
    const isUrl = (u) => /^https?:\/\//i.test(u) || /^data:image\//i.test(u);
    const thumbUrl = isUrl(rawThumb) ? rawThumb : "";
    const imageUrl = isUrl(rawImage) ? rawImage : "";

    const id = Date.now().toString(36);
    const endsAtMs = Date.now() + durationMin * 60000;
    const endsAtIso = new Date(endsAtMs).toISOString();
    const endsAtUnix = Math.floor(endsAtMs / 1000);

    const m = payload?.mention || {};
    const mentionEveryone = !!m.everyone;
    const roleIds = Array.isArray(m.roles)
      ? m.roles.map(String).filter((x) => /^\d{17,20}$/.test(x))
      : [];
    const userIds = Array.isArray(m.users)
      ? m.users.map(String).filter((x) => /^\d{17,20}$/.test(x))
      : [];
    const pieces = [];
    if (mentionEveryone) pieces.push("@everyone");
    if (roleIds.length) pieces.push(roleIds.map((id) => `<@&${id}>`).join(" "));
    if (userIds.length) pieces.push(userIds.map((id) => `<@${id}>`).join(" "));
    const mentionLine = pieces.length ? pieces.join(" ") + "\n" : "";
    const allowedMentions = {
      parse: mentionEveryone ? ["everyone"] : [],
      roles: roleIds,
      users: userIds,
      replied_user: false,
    };

    const headerLine = `🎁 **${title}** — ends **<t:${endsAtUnix}:R>**\nReact with 🎉 to enter!`;
    const embed = {
      title: `🎁 ${title}`,
      description: description || "React with 🎉 to enter!",
      fields: [
        { name: "🎯 Winners", value: String(winners), inline: true },
        { name: "🕒 Ends", value: `<t:${endsAtUnix}:F>`, inline: true },
      ],
      footer: { text: `🆔 Giveaway : ${id}` },
      timestamp: new Date().toISOString(),
      ...(thumbUrl ? { thumbnail: { url: thumbUrl } } : {}),
      ...(imageUrl ? { image: { url: imageUrl } } : {}),
    };

    const msg = await bot.sendEmbed({
      guildId,
      channelId,
      messageContent: mentionLine + headerLine,
      embed,
      buttons: [],
      allowedMentions,
      suppressEmbeds: false,
    });

    if (msg?.id && typeof bot.reactToMessage === "function") {
      try {
        await new Promise((r) => setTimeout(r, 500));
        await bot.reactToMessage(guildId, channelId, msg.id, "🎉");
      } catch (err) {
        appendEntry(id, "warn", {
          text: "Auto reaction failed",
          error: String(err?.message || err),
          code: String(err?.code || err?.status || err?.httpStatus || ""),
        });
      }
    }

    const rec = {
      id,
      guildId,
      channelId,
      messageId: msg?.id || null,
      url: msg?.url || null,
      title,
      winners,
      description,
      status: "active",
      createdAt: new Date().toISOString(),
      endsAt: endsAtIso,
      ...(thumbUrl ? { thumbUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      mention: {
        everyone: mentionEveryone,
        roles: roleIds,
        users: userIds,
      },
    };
    GW.upsert(rec);

    await sendGiveawayStartLog({
      guildId,
      giveaway: rec,
      durationMinutes: durationMin,
    });

    scheduleEnd(rec);

    createLogFile(id, {
      title,
      guildId,
      channelId,
      messageId: rec.messageId || "",
      winners,
      endsAt: endsAtIso,
      ...(thumbUrl ? { thumbUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    });
    appendEntry(id, "start", { text: "Giveaway created via UI", meta: rec });

    return { ok: true, giveaway: rec };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:edit", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    const id = String(payload?.id || "");
    const gw = GW.get(id);
    if (!gw) throw new Error("Giveaway not found");

    const before = {
      title: gw.title ?? null,
      description: gw.description ?? null,
      winners: gw.winners ?? null,
      thumbUrl: gw.thumbUrl ?? "",
      imageUrl: gw.imageUrl ?? "",
    };

    const patch = {};
    if (payload.title != null) patch.title = String(payload.title);
    if (payload.description != null)
      patch.description = String(payload.description);
    if (payload.winners != null) {
      const n = parseInt(payload.winners, 10);
      if (Number.isFinite(n) && n > 0) patch.winners = n;
    }

    const isUrl = (u) => /^https?:\/\//i.test(u) || /^data:image\//i.test(u);
    if (payload.thumbUrl !== undefined) {
      const t = String(payload.thumbUrl || "").trim();
      patch.thumbUrl = isUrl(t) ? t : "";
    }
    if (payload.imageUrl !== undefined) {
      const i = String(payload.imageUrl || "").trim();
      patch.imageUrl = isUrl(i) ? i : "";
    }

    const endsUnix = Math.floor(new Date(gw.endsAt).getTime() / 1000);
    const newEmbed = {
      title: `🎁 ${patch.title ?? gw.title}`,
      description:
        (patch.description != null ? patch.description : gw.description) ||
        "React with 🎉 to enter!",
      fields: [
        {
          name: "🎯 Winners",
          value: String(patch.winners ?? gw.winners),
          inline: true,
        },
        { name: "🕒 Ends", value: `<t:${endsUnix}:F>`, inline: true },
      ],
      footer: { text: `🆔 Giveaway : ${id}` },
      timestamp: new Date().toISOString(),
      ...(patch.thumbUrl !== undefined
        ? patch.thumbUrl
          ? { thumbnail: { url: patch.thumbUrl } }
          : {}
        : gw.thumbUrl
        ? { thumbnail: { url: gw.thumbUrl } }
        : {}),
      ...(patch.imageUrl !== undefined
        ? patch.imageUrl
          ? { image: { url: patch.imageUrl } }
          : {}
        : gw.imageUrl
        ? { image: { url: gw.imageUrl } }
        : {}),
    };

    let edited = false;
    if (gw.messageId && typeof bot.editMessageEmbed === "function") {
      try {
        await bot.editMessageEmbed(
          guildId,
          gw.channelId,
          gw.messageId,
          newEmbed
        );
        edited = true;
      } catch {}
    }
    if (!edited && typeof bot.sendEmbed === "function") {
      try {
        await bot.deleteMessage(guildId, gw.channelId, gw.messageId);
      } catch {}
      const msg = await bot.sendEmbed({
        guildId,
        channelId: gw.channelId,
        messageContent: "",
        embed: newEmbed,
        buttons: [],
      });
      gw.messageId = msg?.id || gw.messageId;
      gw.url = msg?.url || gw.url;
    }

    const updated = { ...gw, ...patch };
    GW.upsert(updated);

    appendEntry(id, "update", { text: "Giveaway edited", meta: patch });

    await sendGiveawayEditLog({
      guildId,
      before,
      after: {
        title: updated.title ?? null,
        description: updated.description ?? null,
        winners: updated.winners ?? null,
        thumbUrl: updated.thumbUrl ?? "",
        imageUrl: updated.imageUrl ?? "",
      },
      giveaway: updated,
    });

    return { ok: true, giveaway: updated };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:end", async (_e, payload) => {
  try {
    const id = String(payload?.id || "").trim();
    if (!id) return { ok: false, error: "Missing giveaway ID." };

    const { giveaway, winners } = await endGiveawayById(id, "UI");
    return { ok: true, giveaway, winners };
  } catch (e) {
    console.error("giveaway:end failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

async function endGiveawayById(id, endedBy = "UI") {
  id = String(id);

  const cfg = loadConfig() || {};
  const guildId = (cfg.GUILD_ID || "").trim();
  if (!guildId) throw new Error("GUILD_ID missing.");

  if (GW_ENDING.has(id)) {
    const g = GW.get(id);
    return { giveaway: g, winners: g?.winnerList || [] };
  }
  GW_ENDING.add(id);

  try {
    const t = GW_TIMERS.get(id);
    if (t) {
      clearTimeout(t);
      GW_TIMERS.delete(id);
    }

    const gw = GW.get(id);
    if (!gw) throw new Error("Giveaway not found");
    if (gw.status === "ended")
      return { giveaway: gw, winners: gw.winnerList || [] };

    let winners = [];
    if (gw.messageId && typeof bot.pickReactWinners === "function") {
      try {
        winners = await bot.pickReactWinners({
          guildId,
          channelId: gw.channelId,
          messageId: gw.messageId,
          emoji: "🎉",
          count: gw.winners,
        });
      } catch {}
    }

    const bannedIds = new Set();
    try {
      if (typeof bot.getSelfUserId === "function") {
        const selfId = await bot.getSelfUserId().catch(() => null);
        if (selfId) bannedIds.add(String(selfId));
      }
    } catch {}
    if (cfg.DISCORD_CLIENT_ID) bannedIds.add(String(cfg.DISCORD_CLIENT_ID));

    const seen = new Set();
    winners = (winners || []).filter((u) => {
      if (u && u.bot === true) return false;
      const idStr = toId(u);
      const key = idStr || toTag(u) || JSON.stringify(u);
      if (!key) return false;
      if (idStr && bannedIds.has(idStr)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const winnersBlock = winnersLinesMentionPlusId(winners);
    const winnersInline = winnersInlineMentionPlusId(winners);

    let announcedByEdit = false;
    try {
      if (gw.messageId && typeof bot.editMessageEmbed === "function") {
        await bot.editMessageEmbed(guildId, gw.channelId, gw.messageId, {
          title: `🎁 ${gw.title} — ENDED`,
          description: winners.length
            ? `Winners:\n${winnersBlock}`
            : "Ended. No winners.",
          footer: { text: `🆔 Giveaway: ${id}` },
        });
        announcedByEdit = true;
      }
    } catch {}

    if (!announcedByEdit) {
      try {
        await bot.sendEmbed({
          guildId,
          channelId: gw.channelId,
          messageContent: winners.length
            ? `🎉 **Winners**: ${winnersInline}`
            : "🎉 Giveaway ended. No winners.",
          embed: {
            title: `🎁 ${gw.title} — ENDED`,
            description: winners.length
              ? `Congratulations!\n${winnersBlock}`
              : "No winners.",
            footer: { text: `🆔 Giveaway: ${id}` },
          },
          buttons: [],
        });
      } catch (announceErr) {
        console.warn(
          "giveaway announce failed (continuing to log):",
          announceErr?.message || announceErr
        );
      }
    }

    const ended = {
      ...gw,
      status: "ended",
      endedAt: new Date().toISOString(),
      ...(winners?.length ? { winnerList: winners } : {}),
    };
    GW.upsert(ended);

    try {
      await sendGiveawayEndLog({
        guildId,
        giveaway: { ...ended },
        winners: winnersAsTags(winners),
        reason: endedBy === "auto" ? "expired" : "manual",
      });
    } catch (logErr) {
      console.error("sendGiveawayEndLog failed:", logErr?.message || logErr);
    }

    finalizeLog(
      id,
      (winners || []).map((w) => toTag(w) || String(w)),
      endedBy
    );

    return { giveaway: ended, winners: winners || [] };
  } finally {
    GW_ENDING.delete(id);
  }
}

async function sendGiveawayEndLog({
  guildId,
  giveaway,
  winners = [],
  reason = "manual", // "manual" | "expired" | "reroll"
  channelIdOverride,
}) {
  try {
    const logChannelId = channelIdOverride || getLogsChannelId();
    if (!logChannelId) return;

    const endedUnix = giveaway.endedAt
      ? Math.floor(new Date(giveaway.endedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const reasonLabel =
      reason === "expired"
        ? "⏰ Auto/Expired"
        : reason === "reroll"
        ? "🔁 Reroll"
        : "🛑 Manual";

    let idList = Array.isArray(giveaway?.winnerList)
      ? giveaway.winnerList.map((w) => toId(w)).filter(Boolean)
      : [];

    if (!idList.length && Array.isArray(winners) && winners.length) {
      const rx = /(uid:)?(\d{17,20})/;
      idList = winners
        .map((s) => {
          const m = String(s).match(rx);
          return m ? m[2] : null;
        })
        .filter(Boolean);
    }

    idList = [...new Set(idList)];

    const winnersLines =
      idList.length > 0
        ? idList.map((id) => `• <@${id}> (${id})`).join("\n")
        : (winners || [])
            .slice(0, 20)
            .map((w) => `• ${w}`)
            .join("\n");

    const totalShown = idList.length || winners.length;

    const fields = [
      { name: "🆔 Giveaway", value: String(giveaway.id || "—"), inline: true },
      { name: "#️⃣ Channel", value: `<#${giveaway.channelId}>`, inline: true },
      ...(giveaway.messageId
        ? [
            {
              name: "🧾 Message ID",
              value: String(giveaway.messageId),
              inline: true,
            },
          ]
        : []),
      { name: "📍 Reason", value: reasonLabel, inline: true },
      { name: "🕒 Ended", value: `<t:${endedUnix}:F>`, inline: true },
      {
        name: "📣 Result",
        value: totalShown ? `${totalShown} winner(s)` : "No winners",
        inline: true,
      },
      ...(totalShown ? [{ name: "🏆 Winners", value: winnersLines }] : []),
    ];

    const embed = {
      title: "🛑 Giveaway ended",
      description: giveaway.title ? `**${String(giveaway.title)}**` : undefined,
      fields,
      ...(giveaway.thumbUrl
        ? { thumbnail: { url: String(giveaway.thumbUrl) } }
        : {}),
      ...(giveaway.imageUrl
        ? { image: { url: String(giveaway.imageUrl) } }
        : {}),
      footer: { text: `GW:${giveaway.id || "?"}` },
      timestamp: new Date().toISOString(),
    };

    await bot.sendEmbed({
      guildId,
      channelId: logChannelId,
      messageContent: giveaway.url ? `🔗 Link: ${giveaway.url}` : undefined,
      embed,
      buttons: [],
      allowedMentions: { parse: [], roles: [], users: [], replied_user: false },
    });
  } catch (e) {
    console.error("sendGiveawayEndLog failed:", e?.message || e);
  }
}

ipcMain.handle("giveaway:remove", async (_e, id) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    const gw = GW.get(String(id));

    const t = GW_TIMERS.get(String(id));
    if (t) {
      clearTimeout(t);
      GW_TIMERS.delete(String(id));
    }

    if (gw && gw.messageId) {
      try {
        await bot.deleteMessage(guildId, gw.channelId, gw.messageId);
      } catch {}
    }
    GW.remove(String(id));
    appendEntry(String(id), "update", { text: "Giveaway removed from store" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:reroll", async (_e, payload) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) throw new Error("GUILD_ID missing.");

    const id = String(payload?.id || "");
    const count = Math.max(1, parseInt(payload?.count || 1, 10));
    const gw = GW.get(id);
    if (!gw) throw new Error("Giveaway not found");
    if (!gw.messageId) throw new Error("No messageId saved for this giveaway");
    if (typeof bot.pickReactWinners !== "function")
      throw new Error("Reroll not supported by bot adapter");

    let winners = await bot.pickReactWinners({
      guildId,
      channelId: gw.channelId,
      messageId: gw.messageId,
      emoji: "🎉",
      count,
    });

    const bannedIds = new Set();
    try {
      if (typeof bot.getSelfUserId === "function") {
        const selfId = await bot.getSelfUserId().catch(() => null);
        if (selfId) bannedIds.add(String(selfId));
      }
    } catch {}
    if (cfg.DISCORD_CLIENT_ID) bannedIds.add(String(cfg.DISCORD_CLIENT_ID));

    const seen = new Set();
    winners = (winners || []).filter((u) => {
      if (!u) return false;
      if (u.bot === true) return false;
      const idStr = toId(u);
      const tagStr = toTag(u);
      if (idStr && bannedIds.has(idStr)) return false;
      const key =
        (idStr && `id:${idStr}`) ||
        (tagStr && `tag:${tagStr.toLowerCase()}`) ||
        JSON.stringify(u);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const winnerIds = (winners || []).map((w) => toId(w)).filter(Boolean);
    const winnersInline = winnerIds.map((id) => `<@${id}> (${id})`).join(", ");
    const winnersLines = winnerIds.map((id) => `• <@${id}> (${id})`).join("\n");

    await bot.sendEmbed({
      guildId,
      channelId: gw.channelId,
      messageContent: winnerIds.length
        ? `🔁 **Reroll winners**: ${winnersInline}`
        : "🔁 Reroll: no winners found.",
      embed: {
        title: `🎁 ${gw.title} — REROLL`,
        description: winnerIds.length
          ? `New winners:\n${winnersLines}`
          : "No winners found.",
        footer: { text: `🆔 Giveaway : ${id}` },
      },
      buttons: [],
    });

    appendEntry(id, "update", {
      text: "Reroll executed",
      meta: { count: String(count) },
      winners: (winners || []).map((w) => toTag(w) || String(w)),
    });

    const hist = Array.isArray(gw.rerolls) ? gw.rerolls : [];
    const tagListForHistory = winnerIds.map((uid) => `uid:${uid}`);
    hist.push({
      at: new Date().toISOString(),
      count,
      winners: tagListForHistory,
    });
    GW.upsert({ ...gw, rerolls: hist });

    await sendGiveawayEndLog({
      guildId,
      giveaway: { ...gw },
      winners: tagListForHistory,
      reason: "reroll",
    });

    return { ok: true, winners: winners || [] };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:getLogsChannel", async () => {
  try {
    const cfg = loadConfig() || {};
    return { ok: true, channelId: cfg.GIVEAWAY_LOGS_CHANNEL_ID || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
ipcMain.handle("giveaway:setLogsChannel", async (_e, rawId) => {
  try {
    const s = String(rawId || "").trim();
    if (!/^\d{17,20}$/.test(s))
      return { ok: false, error: "Invalid channel ID format." };
    const cfg = loadConfig() || {};
    cfg.GIVEAWAY_LOGS_CHANNEL_ID = s;
    await saveOwnerConfig(cfg);
    return { ok: true, channelId: s };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
ipcMain.handle("giveaway:clearLogsChannel", async () => {
  try {
    const cfg = loadConfig() || {};
    cfg.GIVEAWAY_LOGS_CHANNEL_ID = null;
    await saveOwnerConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("giveaway:logStart", async (_e, payload = {}) => {
  try {
    const cfg = loadConfig() || {};
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!guildId) return { ok: false, error: "GUILD_ID missing." };

    const channelId = String(payload.channelId || "").trim();
    if (!/^\d{17,20}$/.test(channelId))
      return { ok: false, error: "Invalid channel ID." };

    const gw = payload.giveaway || {};
    await sendGiveawayStartLog({
      guildId,
      giveaway: gw,
      durationMinutes: null,
      channelIdOverride: channelId,
    });

    return { ok: true };
  } catch (e) {
    console.error("giveaway:logStart failed:", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

app.whenReady().then(() => {
  try {
    const actives = GW.readAll().filter((x) => x.status === "active");
    for (const gw of actives) scheduleEnd(gw);
  } catch (e) {
    console.warn("failed to schedule previous giveaways:", e?.message || e);
  }
});

function evIsId(id) {
  return /^\d{17,20}$/.test(String(id || "").trim());
}
function evUniq(arr) {
  return Array.from(new Set((arr || []).map(String).filter(evIsId)));
}

// ---- Axiom Events ----
function evIsId(id) {
  return /^\d{17,20}$/.test(String(id ?? "").trim());
}
function evUniq(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(arr.map((v) => String(v ?? "").trim()).filter(evIsId))
  );
}
function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

ipcMain.handle("events:get", async () => {
  try {
    const cfg = loadConfig() || {};
    return {
      ok: true,
      data: {
        editChannels: Array.isArray(cfg.EVENTS_EDIT_CHANNEL_IDS)
          ? cfg.EVENTS_EDIT_CHANNEL_IDS
          : [],
        newChannels: Array.isArray(cfg.EVENTS_NEW_CHANNEL_IDS)
          ? cfg.EVENTS_NEW_CHANNEL_IDS
          : [],
        deleteChannels: Array.isArray(cfg.EVENTS_DELETE_CHANNEL_IDS)
          ? cfg.EVENTS_DELETE_CHANNEL_IDS
          : [],
        replyChannels: Array.isArray(cfg.EVENTS_REPLY_CHANNEL_IDS)
          ? cfg.EVENTS_REPLY_CHANNEL_IDS
          : [],

        createChannels: Array.isArray(cfg.EVENTS_CREATE_CHANNEL_IDS)
          ? cfg.EVENTS_CREATE_CHANNEL_IDS
          : [],
        channelDeleteChannels: Array.isArray(cfg.EVENTS_CHANNEL_DELETE_IDS)
          ? cfg.EVENTS_CHANNEL_DELETE_IDS
          : [],
        updateChannels: Array.isArray(cfg.EVENTS_CHANNEL_UPDATE_IDS)
          ? cfg.EVENTS_CHANNEL_UPDATE_IDS
          : [],

        categoryCreateChannels: Array.isArray(cfg.EVENTS_CATEGORY_CREATE_IDS)
          ? cfg.EVENTS_CATEGORY_CREATE_IDS
          : [],
        categoryDeleteChannels: Array.isArray(cfg.EVENTS_CATEGORY_DELETE_IDS)
          ? cfg.EVENTS_CATEGORY_DELETE_IDS
          : [],
        categoryUpdateChannels: Array.isArray(cfg.EVENTS_CATEGORY_UPDATE_IDS)
          ? cfg.EVENTS_CATEGORY_UPDATE_IDS
          : [],

        threadCreateChannels: Array.isArray(cfg.EVENTS_THREAD_CREATE_IDS)
          ? cfg.EVENTS_THREAD_CREATE_IDS
          : [],
        threadUpdateChannels: Array.isArray(cfg.EVENTS_THREAD_UPDATE_IDS)
          ? cfg.EVENTS_THREAD_UPDATE_IDS
          : [],

        voiceUpdateChannels: Array.isArray(cfg.EVENTS_VOICE_UPDATE_IDS)
          ? cfg.EVENTS_VOICE_UPDATE_IDS
          : [],
        watchVoiceUpdates: cfg.EVENTS_WATCH_VOICE_UPDATES !== false,

        watchEdits: cfg.EVENTS_WATCH_EDITS !== false,
        watchNew: cfg.EVENTS_WATCH_NEW !== false,
        watchDeletes: cfg.EVENTS_WATCH_DELETES !== false,
        watchReplies: cfg.EVENTS_WATCH_REPLIES !== false,

        watchCreates: cfg.EVENTS_WATCH_CREATES !== false,
        watchChannelDeletes: cfg.EVENTS_WATCH_CHANNEL_DELETES !== false,
        watchChannelUpdates: cfg.EVENTS_WATCH_CHANNEL_UPDATES !== false,

        watchCategoryCreates: cfg.EVENTS_WATCH_CATEGORY_CREATES !== false,
        watchCategoryDeletes: cfg.EVENTS_WATCH_CATEGORY_DELETES !== false,
        watchCategoryUpdates: cfg.EVENTS_WATCH_CATEGORY_UPDATES !== false,

        watchThreadCreates: cfg.EVENTS_WATCH_THREAD_CREATES !== false,
        watchThreadUpdates: cfg.EVENTS_WATCH_THREAD_UPDATES !== false,

        onlySelected: cfg.EVENTS_ONLY_SELECTED !== false,
      },
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("events:save", async (_e, payload = {}) => {
  try {
    const cfg = loadConfig() || {};

    if (hasOwn(payload, "editChannels"))
      cfg.EVENTS_EDIT_CHANNEL_IDS = evUniq(payload.editChannels);
    if (hasOwn(payload, "newChannels"))
      cfg.EVENTS_NEW_CHANNEL_IDS = evUniq(payload.newChannels);
    if (hasOwn(payload, "deleteChannels"))
      cfg.EVENTS_DELETE_CHANNEL_IDS = evUniq(payload.deleteChannels);
    if (hasOwn(payload, "replyChannels"))
      cfg.EVENTS_REPLY_CHANNEL_IDS = evUniq(payload.replyChannels);

    if (hasOwn(payload, "createChannels"))
      cfg.EVENTS_CREATE_CHANNEL_IDS = evUniq(payload.createChannels);
    if (hasOwn(payload, "channelDeleteChannels"))
      cfg.EVENTS_CHANNEL_DELETE_IDS = evUniq(payload.channelDeleteChannels);
    if (hasOwn(payload, "updateChannels"))
      cfg.EVENTS_CHANNEL_UPDATE_IDS = evUniq(payload.updateChannels);

    if (hasOwn(payload, "categoryCreateChannels"))
      cfg.EVENTS_CATEGORY_CREATE_IDS = evUniq(payload.categoryCreateChannels);
    if (hasOwn(payload, "categoryDeleteChannels"))
      cfg.EVENTS_CATEGORY_DELETE_IDS = evUniq(payload.categoryDeleteChannels);
    if (hasOwn(payload, "categoryUpdateChannels"))
      cfg.EVENTS_CATEGORY_UPDATE_IDS = evUniq(payload.categoryUpdateChannels);

    if (hasOwn(payload, "threadCreateChannels"))
      cfg.EVENTS_THREAD_CREATE_IDS = evUniq(payload.threadCreateChannels);
    if (hasOwn(payload, "threadUpdateChannels"))
      cfg.EVENTS_THREAD_UPDATE_IDS = evUniq(payload.threadUpdateChannels);

    if (hasOwn(payload, "voiceUpdateChannels"))
      cfg.EVENTS_VOICE_UPDATE_IDS = evUniq(payload.voiceUpdateChannels);
    if (hasOwn(payload, "watchVoiceUpdates"))
      cfg.EVENTS_WATCH_VOICE_UPDATES = !!payload.watchVoiceUpdates;

    if (hasOwn(payload, "watchEdits"))
      cfg.EVENTS_WATCH_EDITS = !!payload.watchEdits;
    if (hasOwn(payload, "watchNew")) cfg.EVENTS_WATCH_NEW = !!payload.watchNew;
    if (hasOwn(payload, "watchDeletes"))
      cfg.EVENTS_WATCH_DELETES = !!payload.watchDeletes;
    if (hasOwn(payload, "watchReplies"))
      cfg.EVENTS_WATCH_REPLIES = !!payload.watchReplies;

    if (hasOwn(payload, "watchCreates"))
      cfg.EVENTS_WATCH_CREATES = !!payload.watchCreates;
    if (hasOwn(payload, "watchChannelDeletes"))
      cfg.EVENTS_WATCH_CHANNEL_DELETES = !!payload.watchChannelDeletes;
    if (hasOwn(payload, "watchChannelUpdates"))
      cfg.EVENTS_WATCH_CHANNEL_UPDATES = !!payload.watchChannelUpdates;

    if (hasOwn(payload, "watchCategoryCreates"))
      cfg.EVENTS_WATCH_CATEGORY_CREATES = !!payload.watchCategoryCreates;
    if (hasOwn(payload, "watchCategoryDeletes"))
      cfg.EVENTS_WATCH_CATEGORY_DELETES = !!payload.watchCategoryDeletes;
    if (hasOwn(payload, "watchCategoryUpdates"))
      cfg.EVENTS_WATCH_CATEGORY_UPDATES = !!payload.watchCategoryUpdates;

    if (hasOwn(payload, "watchThreadCreates"))
      cfg.EVENTS_WATCH_THREAD_CREATES = !!payload.watchThreadCreates;
    if (hasOwn(payload, "watchThreadUpdates"))
      cfg.EVENTS_WATCH_THREAD_UPDATES = !!payload.watchThreadUpdates;

    if (hasOwn(payload, "onlySelected"))
      cfg.EVENTS_ONLY_SELECTED = !!payload.onlySelected;

    await saveOwnerConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});
// ---- End Events ----

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
