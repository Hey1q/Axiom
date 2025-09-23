const { Events, EmbedBuilder } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = {
  name: Events.MessageDelete,
  once: false,
  async execute(msg, bot) {
    try {
      if (msg.partial) {
        try {
          await msg.fetch();
        } catch {}
      }
      if (!msg.guild) return;

      const cfg = loadConfig() || {};

      const watch = cfg.EVENTS_WATCH_DELETES;
      if (watch === false) return;

      let targets = Array.isArray(cfg.EVENTS_DELETE_CHANNEL_IDS)
        ? cfg.EVENTS_DELETE_CHANNEL_IDS
        : [];
      if (!targets.length && Array.isArray(cfg.EVENTS_EDIT_CHANNEL_IDS)) {
        targets = cfg.EVENTS_EDIT_CHANNEL_IDS;
      }
      targets = [...new Set((targets || []).map(String))];
      if (!targets.length) return;

      const content = (msg.content || "").slice(0, 1000);
      const channelName = msg.channel?.name || "unknown";

      const atts = [...(msg.attachments?.values?.() || [])];
      let attField = null;
      if (atts.length) {
        const shown = atts
          .slice(0, 4)
          .map((a) => `• [${a.name || "attachment"}](${a.url})`)
          .join("\n");
        const more = atts.length > 4 ? `\n… +${atts.length - 4} more` : "";
        attField = shown + more;
      }

      const eb = new EmbedBuilder()
        .setTitle("🗑️ Message Deleted")
        .addFields(
          {
            name: "👤 Author",
            value: msg.author
              ? `${msg.author}\n🆔 User: ${msg.author.id}`
              : "Unknown\n🆔 User: —",
          },
          {
            name: "📺 Channel",
            value: `<#${msg.channelId}> (${channelName})\n🆔 Channel: ${msg.channelId}`,
            inline: true,
          },
          ...(content ? [{ name: "Content", value: content }] : []),
          ...(attField ? [{ name: "📎 Attachments", value: attField }] : [])
        )
        .setColor(0xef4444)
        .setTimestamp(new Date());

      for (const id of targets) {
        const ch = await bot._resolveChannel(msg.guild, id).catch(() => null);
        if (ch) await ch.send({ embeds: [eb] }).catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ messageDelete log failed: ${e?.message || e}`);
    }
  },
};
