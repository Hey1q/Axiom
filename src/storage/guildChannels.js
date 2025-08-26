// C:\Users\andre\Desktop\Axiom\src\storage\guildChannels.js
// Node v22.15.0 — Proxy store over owner-config (no extra JSON files)

const path = require("node:path");

/**
 * We use the same helpers as main.js uses for owner-config.
 * This ensures everything is saved in:
 *   C:\Users\andre\AppData\Roaming\axiom\config\owner-config
 */
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

/**
 * API compatible with your old code:
 *   - get(guildId)
 *   - setJoin(guildId, id)
 *   - setLeave(guildId, id)
 *   - clear(guildId)
 *
 * Internally it reads/writes WELCOME_CHANNEL_ID and LEAVE_CHANNEL_ID
 * inside owner-config (and nothing else).
 */
function createGuildChannelsStore(/* baseDir (ignored) */) {
  return {
    async get(guildId) {
      const cfg = loadConfig() || {};
      // optional guard: if a different guildId is passed, just return whatever we have
      if (cfg.GUILD_ID && guildId && String(cfg.GUILD_ID) !== String(guildId)) {
        // still return what's in config; app is single-guild anyway
      }
      return {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
      };
    },

    async setJoin(guildId, id) {
      const cfg = loadConfig() || {};
      const norm = normalizeSnowflake(id);
      cfg.WELCOME_CHANNEL_ID = norm; // null if invalid
      await saveOwnerConfig(cfg);
      return {
        joinChannelId: cfg.WELCOME_CHANNEL_ID || null,
        leaveChannelId: cfg.LEAVE_CHANNEL_ID || null,
      };
    },

    async setLeave(guildId, id) {
      const cfg = loadConfig() || {};
      const norm = normalizeSnowflake(id);
      cfg.LEAVE_CHANNEL_ID = norm; // null if invalid
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

      // also clear last published pointers if present (keeps OFF behavior consistent)
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
