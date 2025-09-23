const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = {
  name: Events.ChannelCreate,
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
      if (cfg.EVENTS_WATCH_CATEGORY_CREATES === false) return;

      const targets = Array.isArray(cfg.EVENTS_CATEGORY_CREATE_IDS)
        ? [...new Set(cfg.EVENTS_CATEGORY_CREATE_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const catId = channel.id;
      const catName = channel.name || "unknown";

      let actorId = "—";
      try {
        const logs = await guild.fetchAuditLogs({
          type: AuditLogEvent.ChannelCreate,
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
        .setTitle("🗂️ Category Created")
        .addFields(
          { name: "📛 Category", value: `${catName}\n🆔 ${catId}` },
          { name: "👤 Created by", value: `${mention}\n🆔 ${actorId}` }
        )
        .setColor(0x22c55e)
        .setTimestamp(new Date());

      for (const id of targets) {
        const ch = await bot._resolveChannel(guild, id).catch(() => null);
        if (ch)
          await ch
            .send({ embeds: [eb], allowedMentions: { parse: [] } })
            .catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ categoryCreate log failed: ${e?.message || e}`);
    }
  },
};
