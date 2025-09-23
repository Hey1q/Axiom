const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = {
  name: Events.ChannelDelete,
  once: false,
  /**
   * @param {import('discord.js').CategoryChannel} channel
   * @param {*} bot
   */
  async execute(channel, bot) {
    try {
      if (!channel || channel.type !== ChannelType.GuildCategory) return;
      const guild = channel.guild;
      if (!guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_CATEGORY_DELETES === false) return;

      const targets = Array.isArray(cfg.EVENTS_CATEGORY_DELETE_IDS)
        ? [...new Set(cfg.EVENTS_CATEGORY_DELETE_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const catId = channel.id;
      const catName = channel.name || "unknown";

      let actorId = "—";
      try {
        const logs = await guild.fetchAuditLogs({
          type: AuditLogEvent.ChannelDelete,
          limit: 5,
        });
        const entry = logs.entries
          .filter((e) => e?.target?.id === catId)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .first();

        if (entry?.executor?.id) actorId = entry.executor.id;
      } catch {}

      const mention = actorId !== "—" ? `<@${actorId}>` : "—";

      const eb = new EmbedBuilder()
        .setTitle("🗑️ Category Deleted")
        .addFields(
          { name: "📛 Category", value: `${catName}\n🆔 ${catId}` },
          { name: "👤 Deleted by", value: `${mention}\n🆔 ${actorId}` }
        )
        .setColor(0xef4444)
        .setTimestamp(new Date());

      for (const id of targets) {
        const ch = await bot._resolveChannel(guild, id).catch(() => null);
        if (ch)
          await ch
            .send({ embeds: [eb], allowedMentions: { parse: [] } })
            .catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ categoryDelete log failed: ${e?.message || e}`);
    }
  },
};
