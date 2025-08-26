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
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const { loadConfig } = require("./functions/setupHandler");
const { registerVerifyButtons } = require("./handlers/verifyButtons");
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

    registerVerifyButtons(client, { loadConfig, log: (m) => this.log(m) });
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
        if (event.once)
          this.client.once(event.name, (...a) => event.execute(...a, this));
        else this.client.on(event.name, (...a) => event.execute(...a, this));
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
    const theAppId = (cfg.DISCORD_CLIENT_ID || "").trim();
    const guildId = (cfg.GUILD_ID || "").trim();
    if (!token || !theAppId) {
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
        await rest.put(Routes.applicationGuildCommands(theAppId, guildId), {
          body: this.commandsToRegister,
        });
        this.log("✅ Guild commands deployed (instant).");
      } else {
        this.log(
          `📡 Deploying ${this.commandsToRegister.length} GLOBAL commands...`
        );
        await rest.put(Routes.applicationCommands(theAppId), {
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
          "❌ Disallowed Intents. Enable Privileged Gateway Intents in Developer Portal → Bot," +
            " or remove MessageContent/GuildMessages from intents."
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
      if (this.client) this.client.destroy();
      this.client = null;
      this.online = false;
      this.emit("statusChange", "Offline");
      this.log("Bot stopped.");
    } catch (e) {
      this.log(`❌ Stop error: ${e.message}`);
      this.emit("statusChange", "Offline");
    }
  }

  _getEmbedFromPayload(embed) {
    const eb = new EmbedBuilder();
    if (embed.title) eb.setTitle(String(embed.title).slice(0, 256));
    if (embed.description)
      eb.setDescription(String(embed.description).slice(0, 4096));
    if (embed.url) eb.setURL(String(embed.url));
    if (embed.color) {
      const clr =
        typeof embed.color === "string"
          ? embed.color.replace("#", "")
          : embed.color;
      try {
        eb.setColor(Number.isInteger(clr) ? clr : parseInt(clr, 16));
      } catch {}
    }
    if (embed.thumbnail) eb.setThumbnail(String(embed.thumbnail));
    if (embed.image) eb.setImage(String(embed.image));

    if (
      embed.author &&
      (embed.author.name || embed.author.icon_url || embed.author.url)
    ) {
      eb.setAuthor({
        name: (embed.author.name || "").toString().slice(0, 256),
        iconURL: embed.author.icon_url || null,
        url: embed.author.url || null,
      });
    }
    if (embed.footer && (embed.footer.text || embed.footer.icon_url)) {
      eb.setFooter({
        text: (embed.footer.text || "").toString().slice(0, 2048),
        iconURL: embed.footer.icon_url || null,
      });
    }
    if (embed.addTimestamp) eb.setTimestamp(new Date());

    if (Array.isArray(embed.fields)) {
      const fields = embed.fields
        .filter((f) => f && (f.name || f.value))
        .slice(0, 25)
        .map((f) => ({
          name: String(f.name || "\u200b").slice(0, 256),
          value: String(f.value || "\u200b").slice(0, 1024),
          inline: !!f.inline,
        }));
      if (fields.length) eb.addFields(fields);
    }
    return eb;
  }

  _buildComponents(buttons) {
    if (!Array.isArray(buttons) || !buttons.length) return [];
    const rows = [];
    let current = new ActionRowBuilder();
    for (const btn of buttons.slice(0, 25)) {
      const styleKey = String(btn.style || "Primary").toLowerCase();
      const style =
        styleKey === "primary"
          ? ButtonStyle.Primary
          : styleKey === "secondary"
          ? ButtonStyle.Secondary
          : styleKey === "success"
          ? ButtonStyle.Success
          : styleKey === "danger"
          ? ButtonStyle.Danger
          : ButtonStyle.Link;

      const builder = new ButtonBuilder()
        .setLabel(String(btn.label || "Button").slice(0, 80))
        .setStyle(style);

      if (style === ButtonStyle.Link) {
        if (btn.url) builder.setURL(String(btn.url));
        else continue;
      } else {
        builder.setCustomId(
          String(
            btn.custom_id ||
              btn.customId ||
              `btn_${Math.random().toString(36).slice(2, 8)}`
          )
        );
        if (btn.emoji) builder.setEmoji(btn.emoji);
        builder.setDisabled(!!btn.disabled);
      }

      current.addComponents(builder);
      if (current.components.length === 5) {
        rows.push(current);
        current = new ActionRowBuilder();
      }
    }
    if (current.components.length) rows.push(current);
    return rows.slice(0, 5);
  }

  async _resolveChannel(guild, channelId) {
    if (!guild) return null;
    try {
      const ch = await guild.channels.fetch(channelId);
      if (!ch) return null;
      if (
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildAnnouncement
      ) {
        return ch;
      }
      return null;
    } catch {
      return null;
    }
  }

  async listTextChannels(guildId) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");
    const all = await guild.channels.fetch();
    const result = [];
    for (const [, ch] of all) {
      if (!ch) continue;
      if (
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildAnnouncement
      ) {
        result.push({
          id: ch.id,
          name: `#${ch.name}`,
          type:
            ch.type === ChannelType.GuildAnnouncement ? "announcement" : "text",
        });
      }
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  async listRoles(guildId) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");

    const roles = await guild.roles.fetch();
    const arr = [];
    for (const [, role] of roles) {
      if (!role || role.name === "@everyone") continue;
      arr.push({
        id: role.id,
        name: role.name,
        position: role.position,
        managed: role.managed,
      });
    }
    arr.sort((a, b) => b.position - a.position);
    return arr;
  }

  async deleteMessage({ guildId, channelId, messageId }) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");
    const channel = await this._resolveChannel(guild, channelId);
    if (!channel) throw new Error("Channel not found.");
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return false;
    await msg.delete().catch(() => {});
    this.log(`🗑️ Deleted message ${messageId} in #${channel.name}`);
    return true;
  }

  async deleteByFooterIncludes({
    guildId,
    channelId,
    includes,
    limit = 50,
    maxScan,
    batchSize = 100,
  }) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    if (!includes || typeof includes !== "string") return 0;

    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");

    const channel = await this._resolveChannel(guild, channelId);
    if (!channel)
      throw new Error("Channel not found or not text/announcement.");

    const totalToScan = Math.max(
      1,
      Number.isInteger(maxScan)
        ? maxScan
        : Number.isInteger(limit)
        ? limit
        : 100
    );
    const pageSize = Math.min(100, Math.max(1, batchSize));

    let deleted = 0;
    let scanned = 0;
    let before;

    while (scanned < totalToScan) {
      const fetchLimit = Math.min(pageSize, totalToScan - scanned);
      const batch = await channel.messages
        .fetch(before ? { limit: fetchLimit, before } : { limit: fetchLimit })
        .catch(() => null);

      if (!batch || !batch.size) break;

      for (const m of batch.values()) {
        scanned++;
        if (m?.author?.id !== this.client.user.id) continue;

        const hasMarker =
          Array.isArray(m.embeds) &&
          m.embeds.some((e) => {
            const t =
              (e && e.footer && e.footer.text) ||
              (e && e.data && e.data.footer && e.data.footer.text) ||
              "";
            return typeof t === "string" && t.includes(includes);
          });

        if (hasMarker) {
          await m.delete().catch(() => {});
          deleted++;
        }
      }

      const oldest = batch.last();
      if (!oldest) break;
      before = oldest.id;

      if (batch.size < fetchLimit) break;
    }

    this.log(
      `🗑️ Scanned ${scanned} msgs, deleted ${deleted} by marker "${includes}" in #${channel.name}`
    );
    return deleted;
  }

  async deleteRecentVerifyGates({ guildId, channelId, scanLimit = 50 }) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await this._resolveChannel(guild, channelId);
    if (!channel) return 0;

    let deleted = 0,
      before;
    while (deleted < 50) {
      const batch = await channel.messages
        .fetch(before ? { limit: 100, before } : { limit: 100 })
        .catch(() => null);
      if (!batch || !batch.size) break;

      for (const m of batch.values()) {
        if (m.author?.id !== this.client.user.id) continue;
        const hasAccept = m.components?.some((r) =>
          r.components?.some((c) => c.customId === "verify_accept")
        );
        const hasDecline = m.components?.some((r) =>
          r.components?.some((c) => c.customId === "verify_decline")
        );
        if (hasAccept && hasDecline) {
          await m.delete().catch(() => {});
          deleted++;
        }
        if (deleted >= scanLimit) break;
      }
      const oldest = batch.last();
      if (!oldest) break;
      before = oldest.id;
    }
    this.log(
      `🗑️ Deleted ${deleted} verify gate message(s) in #${channel?.name}`
    );
    return deleted;
  }

  async deleteRecentBotEmbeds({ guildId, channelId, max = 1, scanLimit = 50 }) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await this._resolveChannel(guild, channelId);
    if (!channel) return 0;

    let deleted = 0,
      before;
    while (deleted < max) {
      const batch = await channel.messages
        .fetch(before ? { limit: 100, before } : { limit: 100 })
        .catch(() => null);
      if (!batch || !batch.size) break;

      for (const m of batch.values()) {
        if (m.author?.id !== this.client.user.id) continue;
        if (!m.embeds?.length) continue;
        if (m.components?.length) continue;

        await m.delete().catch(() => {});
        deleted++;
        if (deleted >= max) break;
      }
      const oldest = batch.last();
      if (!oldest) break;
      before = oldest.id;
    }
    this.log(`🗑️ Deleted ${deleted} bot embed(s) in #${channel?.name}`);
    return deleted;
  }

  async deleteVerifyGatesInGuild({ guildId, perChannelScan = 50 }) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    const all = await guild.channels.fetch();
    let total = 0;
    for (const [, ch] of all) {
      if (!ch) continue;
      if (ch.type !== 0 && ch.type !== 5) continue;
      total += await this.deleteRecentVerifyGates({
        guildId,
        channelId: ch.id,
        scanLimit: perChannelScan,
      }).catch(() => 0);
    }
    this.log(`🗑️ Deleted total ${total} verify gates across guild`);
    return total;
  }

  async getChannelName(guildId, channelId) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch) return null;
    if (
      ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement
    ) {
      return `#${ch.name}`;
    }
    return null;
  }

  async sendEmbed(params) {
    if (!this.client || !this.client.isReady())
      throw new Error("Bot is offline.");
    const {
      guildId,
      channelId,
      messageContent,
      embed,
      buttons,
      mention,
      suppressEmbeds,
    } = params || {};
    if (!guildId || !channelId) throw new Error("guildId/channelId missing.");

    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw new Error("Guild not found.");

    try {
      const me = await guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.SendMessages)) {
        this.log("⚠️ Missing permission: SendMessages.");
      }
    } catch {}

    const channel = await this._resolveChannel(guild, channelId);
    if (!channel)
      throw new Error("Channel not found or not text/announcement.");

    const eb = this._getEmbedFromPayload(embed || {});
    const components = this._buildComponents(buttons || []);

    let content = messageContent ? String(messageContent) : "";
    if (mention) {
      if (mention === "everyone") content = `@everyone ${content}`;
      else if (mention === "here") content = `@here ${content}`;
      else if (/^\d{17,20}$/.test(String(mention)))
        content = `<@&${mention}> ${content}`;
    }

    const msg = await channel.send({
      content: content || undefined,
      embeds: [eb],
      components: components.length ? components : undefined,
      flags: suppressEmbeds ? 1 << 2 : undefined,
    });

    this.log(
      `📨 Embed sent to #${channel.name} (${channel.id}) -> message ${msg.id}`
    );
    return msg;
  }
}

const instance = new Bot();
module.exports = instance;

if (require.main === module) {
  instance.start();
}
