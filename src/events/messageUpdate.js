const { Events, EmbedBuilder } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = {
  name: Events.MessageUpdate,
  once: false,
  /**
   * @param {import('discord.js').Message|import('discord.js').PartialMessage} oldMsg
   * @param {import('discord.js').Message|import('discord.js').PartialMessage} newMsg
   * @param {*} bot
   */
  async execute(oldMsg, newMsg, bot) {
    try {
      if (newMsg.partial) await newMsg.fetch().catch(() => {});
      if (oldMsg?.partial) await oldMsg.fetch().catch(() => {});
      if (!newMsg.guild || newMsg.author?.bot) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_EDITS === false) return;

      const targets = Array.isArray(cfg.EVENTS_EDIT_CHANNEL_IDS)
        ? [...new Set(cfg.EVENTS_EDIT_CHANNEL_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const before = (oldMsg?.content || "").slice(0, 1000);
      const after = (newMsg?.content || "").slice(0, 1000);
      if (before === after) return;

      const jump =
        newMsg.url ||
        `https://discord.com/channels/${newMsg.guild.id}/${newMsg.channelId}/${newMsg.id}`;

      const channelName = newMsg.channel?.name || "unknown";

      const eb = new EmbedBuilder()
        .setTitle("✏️ Message Edited")
        .addFields(
          {
            name: "👤 Author",
            value: `${newMsg.author}\n🆔 User: ${newMsg.author.id}`,
          },
          {
            name: "📺 Channel",
            value: `<#${newMsg.channelId}> (${channelName})\n🆔 Channel: ${newMsg.channelId}`,
            inline: true,
          },
          {
            name: "🔗 Link",
            value: `[Jump to message](${jump})`,
            inline: true,
          },
          { name: "Before", value: before || "—" },
          { name: "After", value: after || "—" }
        )
        .setColor(0xf59e0b)
        .setTimestamp(new Date());

      for (const id of targets) {
        const ch = await bot
          ._resolveChannel(newMsg.guild, id)
          .catch(() => null);
        if (ch) await ch.send({ embeds: [eb] }).catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ messageUpdate log failed: ${e?.message || e}`);
    }
  },
};
