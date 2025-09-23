const {
  Events,
  EmbedBuilder,
  ChannelType,
  AuditLogEvent,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

function typeLabel(ch) {
  switch (ch.type) {
    case ChannelType.GuildText:
      return { emoji: "💬", label: "Text" };
    case ChannelType.GuildAnnouncement:
      return { emoji: "📢", label: "Announcement" };
    case ChannelType.GuildVoice:
      return { emoji: "🔊", label: "Voice" };
    case ChannelType.GuildStageVoice:
      return { emoji: "🎤", label: "Stage" };
    case ChannelType.GuildForum:
      return { emoji: "🗂️", label: "Forum" };
    case ChannelType.GuildMedia:
      return { emoji: "🖼️", label: "Media" };
    case ChannelType.GuildCategory:
      return { emoji: "📂", label: "Category" };
    default:
      return { emoji: "📦", label: "Channel" };
  }
}

async function findCreator(guild, channelId) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelCreate,
      limit: 5,
    });
    const entry = logs.entries.find((e) => e?.target?.id === channelId);
    if (!entry) return null;
    return entry.executor || null;
  } catch {
    return null;
  }
}

module.exports = {
  name: Events.ChannelCreate,
  once: false,
  /**
   * @param {import('discord.js').GuildChannel} channel
   * @param {*} bot
   */
  async execute(channel, bot) {
    try {
      const guild = channel.guild;
      if (!guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_CREATES === false) return;

      let targets = Array.isArray(cfg.EVENTS_CREATE_CHANNEL_IDS)
        ? cfg.EVENTS_CREATE_CHANNEL_IDS
        : [];

      if (!targets.length && Array.isArray(cfg.EVENTS_EDIT_CHANNEL_IDS)) {
        targets = cfg.EVENTS_EDIT_CHANNEL_IDS;
      }

      targets = [...new Set((targets || []).map(String))];
      if (!targets.length) return;

      const { emoji, label } = typeLabel(channel);
      const title =
        channel.type === ChannelType.GuildCategory
          ? `${emoji} Category Created`
          : `${emoji} Channel Created`;

      const parentId =
        channel.parentId && channel.type !== ChannelType.GuildCategory
          ? channel.parentId
          : null;
      const parentName =
        parentId && channel.parent
          ? channel.parent.name
          : parentId
          ? "unknown"
          : null;

      const creator = await findCreator(guild, channel.id);
      const creatorLine = creator ? `${creator} \n🆔 ${creator.id}` : "—";

      const isNsfw =
        "nsfw" in channel && typeof channel.nsfw === "boolean"
          ? channel.nsfw
            ? "Yes"
            : "No"
          : "—";

      const topic =
        "topic" in channel && channel.topic
          ? String(channel.topic).slice(0, 512)
          : "—";

      const eb = new EmbedBuilder()
        .setTitle(title)
        .addFields(
          channel.type === ChannelType.GuildCategory
            ? {
                name: "📂 Category",
                value: `${channel.name}\n🆔 ${channel.id}`,
              }
            : {
                name: "📺 Channel",
                value: `<#${channel.id}> (${channel.name})\n🆔 ${channel.id}`,
              },
          ...(parentId
            ? [
                {
                  name: "🗂️ Parent",
                  value: `📂 ${parentName}\n🆔 ${parentId}`,
                  inline: true,
                },
              ]
            : []),
          { name: "🧭 Type", value: label, inline: true },
          { name: "🔞 NSFW", value: isNsfw, inline: true },
          { name: "📝 Topic", value: topic }
        )
        .setColor(0x22c55e)
        .setTimestamp(new Date());

      if (creator) {
        eb.addFields({
          name: "👤 Created by",
          value: creatorLine,
          inline: false,
        });
      }

      for (const id of targets) {
        const logCh = await bot._resolveChannel(guild, id).catch(() => null);
        if (logCh) await logCh.send({ embeds: [eb] }).catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ channelCreate log failed: ${e?.message || e}`);
    }
  },
};
