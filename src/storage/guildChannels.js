const path = require("node:path");

const { saveOwnerConfig, loadConfig } = require(path.join(
  __dirname,
  "..",
  "functions",
  "setupHandler"
));

function normalizeSnowflake(v) {
  const s = String(v || "").trim();
  return /^\d{16,20}$/.test(s) ? s : null;
}

function createGuildChannelsStore(/* baseDir (ignored) */) {
  return {
    async get(guildId) {
      const cfg = loadConfig() || {};
      if (cfg.GUILD_ID && guildId && String(cfg.GUILD_ID) !== String(guildId)) {
      }
      return {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
      };
    },

    async setJoin(guildId, id) {
      const cfg = loadConfig() || {};
      const norm = normalizeSnowflake(id);
      cfg.WELCOME_CHANNEL_ID = norm;
      await saveOwnerConfig(cfg);
      return {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
      };
    },

    async setLeave(guildId, id) {
      const cfg = loadConfig() || {};
      const norm = normalizeSnowflake(id);
      cfg.LEAVE_CHANNEL_ID = norm;
      await saveOwnerConfig(cfg);
      return {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
      };
    },

    async clear(guildId) {
      const cfg = loadConfig() || {};
      delete cfg.WELCOME_CHANNEL_ID;
      delete cfg.LEAVE_CHANNEL_ID;

      delete cfg.LAST_JOIN_CHANNEL_ID;
      delete cfg.LAST_JOIN_MESSAGE_ID;
      delete cfg.LAST_LEAVE_CHANNEL_ID;
      delete cfg.LAST_LEAVE_MESSAGE_ID;

      await saveOwnerConfig(cfg);
      return true;
    },
  };
}

module.exports = { createGuildChannelsStore };
