const { Events, EmbedBuilder, AuditLogEvent } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const code = (v) =>
  v === null || v === undefined || v === "" ? "—" : "`" + String(v) + "`";
const yn = (b) => (b ? "✅ On" : "❌ Off");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveLogChannel(guild, id) {
  const ch =
    guild.channels.cache.get(id) ||
    (await guild.channels.fetch(id).catch(() => null));
  return ch && ch.isTextBased?.() ? ch : null;
}

async function fetchActorIdWithRetry(guild, type, targetId, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 });
      const entry = logs.entries
        .filter((e) => e?.target?.id === targetId)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .first();
      if (entry?.executor?.id) return entry.executor.id;
    } catch {}
    await sleep(700);
  }
  return "—";
}

async function actorDisplay(guild, userId) {
  if (!userId || userId === "—") return { mention: "—", tag: "—", id: "—" };
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user ?? null;
    const tag =
      user?.tag ||
      (user
        ? `${user.username}${
            user.discriminator && user.discriminator !== "0"
              ? "#" + user.discriminator
              : ""
          }`
        : "unknown");
    return { mention: `<@${userId}>`, tag, id: userId };
  } catch {
    return { mention: `<@${userId}>`, tag: "unknown", id: userId };
  }
}

function pushDiff(list, label, a, b) {
  const va = a ?? "—";
  const vb = b ?? "—";
  if (String(va) === String(vb)) return;
  list.push(`✏️ **${label}:** ${code(va)} → ${code(vb)}`);
}

module.exports = {
  name: Events.ThreadUpdate,
  once: false,

  /**
   * @param {import('discord.js').ThreadChannel} oldThread
   * @param {import('discord.js').ThreadChannel} newThread
   * @param {*} bot
   */
  async execute(oldThread, newThread, bot) {
    try {
      const guild = newThread?.guild || oldThread?.guild;
      if (!guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_THREAD_UPDATES === false) return;

      const targets = Array.isArray(cfg.EVENTS_THREAD_UPDATE_IDS)
        ? [...new Set(cfg.EVENTS_THREAD_UPDATE_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const diffs = [];

      pushDiff(diffs, "Title", oldThread.name, newThread.name);

      if (!!oldThread.archived !== !!newThread.archived) {
        diffs.push(
          `🗂️ **Archived:** ${yn(!!oldThread.archived)} → ${yn(
            !!newThread.archived
          )}`
        );
      }
      if (!!oldThread.locked !== !!newThread.locked) {
        diffs.push(
          `🔒 **Locked:** ${yn(!!oldThread.locked)} → ${yn(!!newThread.locked)}`
        );
      }
      if (
        (oldThread.autoArchiveDuration ?? null) !==
        (newThread.autoArchiveDuration ?? null)
      ) {
        pushDiff(
          diffs,
          "Auto-Archive (min)",
          oldThread.autoArchiveDuration,
          newThread.autoArchiveDuration
        );
      }
      if (
        (oldThread.rateLimitPerUser ?? null) !==
        (newThread.rateLimitPerUser ?? null)
      ) {
        pushDiff(
          diffs,
          "Slowmode (sec)",
          oldThread.rateLimitPerUser ?? 0,
          newThread.rateLimitPerUser ?? 0
        );
      }

      const actorId = await fetchActorIdWithRetry(
        guild,
        AuditLogEvent.ThreadUpdate,
        newThread.id,
        2
      );
      const actor = await actorDisplay(guild, actorId);

      const eb = new EmbedBuilder()
        .setTitle("📝 Thread Updated")
        .addFields(
          { name: "🧵 Thread", value: `${newThread.name}\n🆔 ${newThread.id}` },
          {
            name: "👤 Updated by",
            value: `${actor.mention}\n${code(actor.tag)}\n🆔 ${actor.id}`,
          },
          { name: "🔍 Changes", value: diffs.length ? diffs.join("\n") : "—" }
        )
        .setColor(0xf59e0b)
        .setTimestamp(new Date());

      for (const id of targets) {
        const logCh = await resolveLogChannel(guild, id);
        if (logCh)
          await logCh
            .send({ embeds: [eb], allowedMentions: { parse: [] } })
            .catch(() => {});
      }
    } catch (e) {
      bot?.log?.(`⚠️ threadUpdate log failed: ${e?.message || e}`);
    }
  },
};
