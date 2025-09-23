const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const code = (v) =>
  v === null || v === undefined || v === "" ? "—" : "`" + String(v) + "`";

module.exports = {
  name: Events.ThreadCreate,
  once: false,

  /**
   * @param {import('discord.js').ThreadChannel} thread
   * @param {boolean} newlyCreated
   * @param {*} bot
   */
  async execute(thread, newlyCreated, bot) {
    try {
      if (!thread?.guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_THREAD_CREATES === false) return;

      const targets = Array.isArray(cfg.EVENTS_THREAD_CREATE_IDS)
        ? [...new Set(cfg.EVENTS_THREAD_CREATE_IDS.map(String))]
        : [];
      if (!targets.length) return;

      if (newlyCreated !== true) return;

      const parent = thread.parent ?? null;
      let starterMsg = null;
      try {
        starterMsg = await thread.fetchStarterMessage().catch(() => null);
      } catch {}

      const eb = new EmbedBuilder()
        .setTitle("🧵 Thread Created")
        .addFields(
          { name: "📛 Thread", value: `${thread.name}\n🆔 ${thread.id}` },
          {
            name: "🪝 Parent",
            value: parent
              ? `${parent} • ${code(parent.name)}\n🆔 ${parent.id}`
              : "—",
          },
          {
            name: "ℹ️ Type",
            value:
              thread.type === ChannelType.PrivateThread
                ? "Private Thread"
                : thread.type === ChannelType.PublicThread
                ? "Public Thread"
                : "—",
          },
          ...(starterMsg
            ? [
                {
                  name: "📝 Starter Message",
                  value:
                    (starterMsg.content?.slice(0, 1000) || "—") +
                    `\n[Jump](${starterMsg.url}) • MsgID: \`${starterMsg.id}\``,
                },
              ]
            : [])
        )
        .setColor(0x22c55e)
        .setTimestamp(new Date());

      for (const id of targets) {
        try {
          const ch =
            thread.guild.channels.cache.get(id) ||
            (await thread.guild.channels.fetch(id).catch(() => null));
          if (ch?.isTextBased?.())
            await ch.send({ embeds: [eb], allowedMentions: { parse: [] } });
        } catch {}
      }
    } catch (e) {
      bot?.log?.(`⚠️ threadCreate log failed: ${e?.message || e}`);
    }
  },
};
