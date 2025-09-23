const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

function typeLabel(t) {
  switch (t) {
    case ChannelType.GuildText:
      return "Text";
    case ChannelType.GuildVoice:
      return "Voice";
    case ChannelType.GuildCategory:
      return "Category";
    case ChannelType.GuildAnnouncement:
      return "Announcement";
    case ChannelType.AnnouncementThread:
      return "Announcement Thread";
    case ChannelType.PublicThread:
      return "Public Thread";
    case ChannelType.PrivateThread:
      return "Private Thread";
    case ChannelType.GuildStageVoice:
      return "Stage";
    case ChannelType.GuildDirectory:
      return "Directory";
    case ChannelType.GuildForum:
      return "Forum";
    default:
      return "Other";
  }
}

function uniqIds(arr) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map(String)
        .filter((x) => /^\d{17,20}$/.test(x))
    )
  );
}

module.exports = {
  name: Events.ChannelDelete,
  once: false,
  /**
   * @param {import('discord.js').GuildChannel | import('discord.js').ThreadChannel} channel
   * @param {*} bot
   */
  async execute(channel, bot) {
    try {
      const guild = channel?.guild;
      if (!guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_CHANNEL_DELETES === false) return;

      let targets = uniqIds(cfg.EVENTS_CHANNEL_DELETE_IDS);
      if (!targets.length) {
        const fb = uniqIds(cfg.EVENTS_CREATE_CHANNEL_IDS);
        if (fb.length) {
          targets = fb;
          bot?.log?.(
            "ℹ️ channelDelete: using CREATE targets as fallback (set Channel Deletes ID στο UI)."
          );
        }
      }
      if (!targets.length) return;

      const chName = channel?.name || "unknown";
      const chId = channel?.id || "—";
      const chType = typeLabel(channel?.type);

      let parentLine = "—";
      const parentId = channel?.parentId || null;
      if (parentId) {
        const parent = guild.channels.cache.get(parentId);
        const pName = parent?.name || "unknown";
        parentLine = `🗂️ ${pName}\n🆔 ${parentId}`;
      }

      let actorField = "—";
      try {
        const logs = await guild.fetchAuditLogs({
          type: AuditLogEvent.ChannelDelete,
          limit: 5,
        });
        const entry = [...logs.entries.values()]
          .filter((e) => e?.target?.id === chId)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

        const exec = entry?.executor;
        if (exec) {
          actorField = `${exec}\n🆔 ${exec.id}`;
        }
      } catch {}

      const mentionLine =
        channel.type === ChannelType.GuildCategory
          ? `🗂️ ${chName}\n🆔 ${chId}`
          : `#${chName}\n🆔 ${chId}`;

      const eb = new EmbedBuilder()
        .setTitle("🗑️ Channel Deleted")
        .addFields(
          { name: "📺 Channel", value: mentionLine },
          { name: "🧭 Type", value: chType, inline: true },
          { name: "📦 Category", value: parentLine, inline: true },
          { name: "👤 Deleted by", value: actorField }
        )
        .setColor(0xef4444)
        .setTimestamp(new Date());

      for (const id of targets) {
        const ch = await bot._resolveChannel(guild, id).catch(() => null);
        if (ch) await ch.send({ embeds: [eb] }).catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ channelDelete log failed: ${e?.message || e}`);
    }
  },
};
