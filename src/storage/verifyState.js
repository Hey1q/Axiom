const path = require("node:path");
const { saveOwnerConfig, loadConfig } = require(path.join(
  __dirname,
  "..",
  "functions",
  "setupHandler"
));

function createVerifyStateStore(/* baseDir unused */) {
  return {
    async get(guildId) {
      const cfg = loadConfig() || {};
      if (!cfg.GUILD_ID || String(cfg.GUILD_ID) !== String(guildId)) {
      }
      if (!cfg.VERIFY_CHANNEL_ID || !cfg.VERIFY_MESSAGE_ID) return null;
      return {
        guildId: cfg.GUILD_ID || guildId || null,
        channelId: cfg.VERIFY_CHANNEL_ID,
        messageId: cfg.VERIFY_MESSAGE_ID,
        createdAt: cfg.VERIFY_CREATED_AT || null,
        updatedAt: cfg.VERIFY_UPDATED_AT || null,
      };
    },

    async set(guildId, state) {
      const cfg = loadConfig() || {};
      const now = new Date().toISOString();
      cfg.VERIFY_CHANNEL_ID = String(state.channelId || "");
      cfg.VERIFY_MESSAGE_ID = String(state.messageId || "");
      cfg.VERIFY_CREATED_AT = cfg.VERIFY_CREATED_AT || state.createdAt || now;
      cfg.VERIFY_UPDATED_AT = now;
      await saveOwnerConfig(cfg);
      return {
        guildId: cfg.GUILD_ID || guildId || null,
        channelId: cfg.VERIFY_CHANNEL_ID,
        messageId: cfg.VERIFY_MESSAGE_ID,
        createdAt: cfg.VERIFY_CREATED_AT,
        updatedAt: cfg.VERIFY_UPDATED_AT,
      };
    },

    async clear(/* guildId */) {
      const cfg = loadConfig() || {};
      delete cfg.VERIFY_CHANNEL_ID;
      delete cfg.VERIFY_MESSAGE_ID;
      delete cfg.VERIFY_CREATED_AT;
      delete cfg.VERIFY_UPDATED_AT;
      await saveOwnerConfig(cfg);
      return true;
    },
  };
}

module.exports = { createVerifyStateStore };
