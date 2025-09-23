const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  MessageType,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const code = (v) =>
  v === null || v === undefined || v === "" ? "—" : "`" + String(v) + "`";

module.exports = {
  name: Events.MessageCreate,
  once: false,

  /**
   * @param {import('discord.js').Message} message
   * @param {*} bot
   */
  async execute(message, bot) {
    try {
      if (!message?.guild || message.author?.bot) return;
      const isReply =
        message.type === MessageType.Reply || !!message.reference?.messageId;

      const cfg = loadConfig() || {};
      if (!isReply || cfg.EVENTS_WATCH_REPLIES === false) return;

      const targets = Array.isArray(cfg.EVENTS_REPLY_CHANNEL_IDS)
        ? [...new Set(cfg.EVENTS_REPLY_CHANNEL_IDS.map(String))]
        : [];
      if (!targets.length) return;

      let orig = null;
      if (message.reference?.messageId) {
        try {
          const ch =
            message.channel ||
            (await message.guild.channels.fetch(message.channelId));
          orig = await ch.messages
            .fetch(message.reference.messageId)
            .catch(() => null);
        } catch {}
      }

      const eb = new EmbedBuilder()
        .setTitle("↪️ Message Reply")
        .addFields(
          {
            name: "💬 In",
            value: `<#${message.channelId}>\n🆔 ${message.channelId}`,
          },
          {
            name: "👤 Replied by",
            value: `<@${message.author.id}>\n${code(message.author.tag)}\n🆔 ${
              message.author.id
            }`,
          },
          ...(orig
            ? [
                {
                  name: "🧷 Replying to",
                  value:
                    `<@${orig.author.id}> • ${code(orig.author.tag)}\n` +
                    `Msg ID: \`${orig.id}\``,
                },
                { name: "📎 Original", value: orig.url },
              ]
            : [{ name: "🧷 Replying to", value: "—" }]),
          { name: "📝 Content", value: message.content?.slice(0, 1000) || "—" }
        )
        .setColor(0x60a5fa)
        .setTimestamp(new Date());

      for (const id of targets) {
        try {
          const ch = await bot
            ._resolveChannel(message.guild, id)
            .catch(() => null);
          if (ch)
            await ch
              .send({ embeds: [eb], allowedMentions: { parse: [] } })
              .catch(() => {});
        } catch {}
      }
    } catch (e) {
      bot?.log?.(`⚠️ messageReply log failed: ${e?.message || e}`);
    }
  },
};
