const path = require("node:path");
const fs = require("node:fs");
const EventEmitter = require("events");
const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  ActivityType,
  Events,
} = require("discord.js");
const { loadConfig } = require("./functions/setupHandler");
const cfgPrime = loadConfig() || {};
if (cfgPrime.DATABASE_URL) process.env.DATABASE_URL = cfgPrime.DATABASE_URL;

class Bot extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.commandsToRegister = [];
    this.loggingIn = false;
    this.online = false;
  }

  log(msg) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    this.emit("log", line);
  }

  _createClient() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.commands = new Collection();

    this._wireClientEvents(this.client);
  }

  _wireClientEvents(client) {
    client.once(Events.ClientReady, async (c) => {
      this.log(`✅ Logged in as ${c.user.tag} (${c.user.id})`);
      try {
        await c.user.setPresence({
          activities: [
            { name: "Axiom dashboard", type: ActivityType.Watching },
          ],
          status: "online",
        });
      } catch {}
    });

    client.on(Events.Error, (e) =>
      this.log(`🟥 Client error: ${e?.message || e}`)
    );
    client.on(Events.Warn, (w) => this.log(`⚠️ ${w}`));
  }

  _loadCommand(absPath) {
    try {
      const cmd = require(absPath);
      if (cmd?.data && cmd?.execute) {
        this.client.commands.set(cmd.data.name, cmd);
        this.commandsToRegister.push(cmd.data.toJSON());
        this.log(`📄 Loaded: /${cmd.data.name}`);
      }
    } catch (e) {
      this.log(`❌ Failed to load command ${absPath}: ${e.message}`);
    }
  }

  handleCommands() {
    this.commandsToRegister = [];
    const commandsPath = path.join(__dirname, "commands");
    if (!fs.existsSync(commandsPath)) {
      this.log(`⚠️ Commands folder not found: ${commandsPath}`);
      return;
    }
    const entries = fs.readdirSync(commandsPath, { withFileTypes: true });

    for (const entry of entries) {
      const base = path.join(commandsPath, entry.name);
      if (entry.isDirectory()) {
        const files = fs.readdirSync(base).filter((f) => f.endsWith(".js"));
        for (const f of files) this._loadCommand(path.join(base, f));
      } else if (entry.name.endsWith(".js")) {
        this._loadCommand(base);
      }
    }
  }

  handleEvents() {
    const eventsPath = path.join(__dirname, "events");
    if (!fs.existsSync(eventsPath)) {
      this.log(`⚠️ Events folder not found: ${eventsPath}`);
      return;
    }

    const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      try {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
          this.client.once(event.name, (...args) =>
            event.execute(...args, this)
          );
        } else {
          this.client.on(event.name, (...args) => event.execute(...args, this));
        }
        this.log(`📦 Event: ${event.name}`);
      } catch (e) {
        this.log(`❌ Failed to load event ${file}: ${e.message}`);
      }
    }
  }

  async registerCommands() {
    if (!this.commandsToRegister.length) {
      this.log("ℹ️ No commands to register.");
      return;
    }

    const cfg = loadConfig() || {};
    const token = (cfg.DISCORD_BOT_TOKEN || "").trim();
    const appId = (cfg.DISCORD_CLIENT_ID || "").trim();
    const guildId = (cfg.GUILD_ID || "").trim();

    if (!token || !appId) {
      this.log(
        "⚠️ Missing DISCORD_CLIENT_ID and/or DISCORD_BOT_TOKEN for deploy."
      );
      return;
    }

    const rest = new REST().setToken(token);

    try {
      if (guildId) {
        this.log(
          `📡 Deploying ${this.commandsToRegister.length} guild commands to ${guildId}...`
        );
        await rest.put(Routes.applicationGuildCommands(appId, guildId), {
          body: this.commandsToRegister,
        });
        this.log("✅ Guild commands deployed (instant).");
      } else {
        this.log(
          `📡 Deploying ${this.commandsToRegister.length} GLOBAL commands (propagation may take up to 1 hour)...`
        );
        await rest.put(Routes.applicationCommands(appId), {
          body: this.commandsToRegister,
        });
        this.log("✅ Global commands submitted.");
      }
    } catch (err) {
      this.log(`❌ Deploy failed: ${err.message}`);
    }
  }

  async start() {
    if (this.online || this.loggingIn) {
      this.log("ℹ️ Bot is already starting or online.");
      return;
    }

    const cfg = loadConfig() || {};
    const token = (cfg.DISCORD_BOT_TOKEN || "").trim();

    if (!token) {
      this.log("❌ DISCORD_BOT_TOKEN missing in owner-config.json.");
      this.emit("statusChange", "Offline");
      return;
    }

    if (this.client) {
      try {
        this.client.destroy();
      } catch {}
      this.client = null;
    }
    this._createClient();

    this.handleCommands();
    this.handleEvents();

    this.loggingIn = true;
    this.emit("statusChange", "Connecting");
    this.log("🚀 Starting bot...");

    try {
      await this.client.login(token);
      await this.registerCommands();
      this.online = true;
      this.emit("statusChange", "Online");
    } catch (err) {
      const msg = String(err?.message || err);
      if (/401: Unauthorized/i.test(msg) || /invalid token/i.test(msg)) {
        this.log(
          "❌ Invalid bot token. Check DISCORD_BOT_TOKEN in owner-config.json."
        );
      } else if (/Disallowed.*intent/i.test(msg)) {
        this.log(
          "❌ Disallowed Intents. Enable required Privileged Gateway Intents in Discord Developer Portal → Bot, " +
            "ή αφαίρεσε MessageContent/GuildMessages από τα intents."
        );
      } else {
        this.log(`❌ Login error: ${msg}`);
      }
      this.emit("statusChange", "Offline");
    } finally {
      this.loggingIn = false;
    }
  }

  stop() {
    this.log("🛑 Stopping bot...");
    try {
      if (this.client) {
        this.client.destroy();
      }
      this.client = null;
      this.online = false;
      this.emit("statusChange", "Offline");
      this.log("Bot stopped.");
    } catch (e) {
      this.log(`❌ Stop error: ${e.message}`);
      this.emit("statusChange", "Offline");
    }
  }
}

const instance = new Bot();
module.exports = instance;

if (require.main === module) {
  instance.start();
}
