const {
  Events,
  EmbedBuilder,
  channelMention,
  userMention,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const code = (v) =>
  v === null || v === undefined || v === "" ? "—" : "`" + String(v) + "`";

async function getReferenceInfo(msg) {
  try {
    const refMsg = await msg.fetchReference().catch(() => null);
    if (!refMsg) return null;

    const originGuild = refMsg.guild;
    const originCh = refMsg.channel;
    const originAuthor = refMsg.author;

    const originJump =
      refMsg.url ||
      `https://discord.com/channels/${originGuild?.id || "@me"}/${
        originCh?.id || msg.channelId
      }/${refMsg.id}`;

    const kind = "Reply / Forward";

    return {
      kind,
      authorText: `${userMention(originAuthor.id)}\n🆔 User: ${
        originAuthor.id
      }`,
      channelText: `${channelMention(originCh.id)} (${
        originCh.name || "unknown"
      })\n🆔 Channel: ${originCh.id}`,
      linkText: `[Open original](${originJump})`,
      contentPreview: (refMsg.content || "").slice(0, 500) || "—",
    };
  } catch {
    return null;
  }
}

module.exports = {
  name: Events.MessageCreate,
  once: false,
  /**
   * @param {import('discord.js').Message} msg
   * @param {*} bot
   */
  async execute(msg, bot) {
    try {
      if (!msg.guild || msg.author?.bot) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_NEW === false) return;

      const targets = Array.isArray(cfg.EVENTS_NEW_CHANNEL_IDS)
        ? [...new Set(cfg.EVENTS_NEW_CHANNEL_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const content = (msg.content || "").slice(0, 1000);
      const jump =
        msg.url ||
        `https://discord.com/channels/${msg.guild.id}/${msg.channelId}/${msg.id}`;

      const channelName = msg.channel?.name || "unknown";

      const refInfo = await getReferenceInfo(msg);

      const eb = new EmbedBuilder()
        .setTitle("🆕 New Message")
        .setDescription(content || "—")
        .addFields(
          {
            name: "👤 Author",
            value: `${userMention(msg.author.id)}\n🆔 User: ${msg.author.id}`,
          },
          {
            name: "📺 Channel",
            value: `${channelMention(
              msg.channelId
            )} (${channelName})\n🆔 Channel: ${msg.channelId}`,
            inline: true,
          },
          {
            name: "🔗 Link",
            value: `[Jump to message](${jump})`,
            inline: true,
          }
        )
        .setColor(0x3b82f6)
        .setTimestamp(new Date());

      if (refInfo) {
        eb.addFields({
          name: `↪️ ${refInfo.kind}`,
          value:
            `**Original Author**\n${refInfo.authorText}\n\n` +
            `**Original Channel**\n${refInfo.channelText}\n\n` +
            `**Original Content**\n${code(refInfo.contentPreview)}\n\n` +
            `**Link** ${refInfo.linkText}`,
        });
      }

      for (const id of targets) {
        const ch =
          (bot._resolveChannel &&
            (await bot._resolveChannel(msg.guild, id).catch(() => null))) ||
          msg.guild.channels.cache.get(id) ||
          (await msg.guild.channels.fetch(id).catch(() => null));
        if (ch && "send" in ch && ch.isTextBased?.()) {
          await ch
            .send({ embeds: [eb], allowedMentions: { parse: [] } })
            .catch(() => {});
        }
      }
    } catch (e) {
      bot?.log?.(`⚠️ messageCreate log failed: ${e?.message || e}`);
    }
  },
};
