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
