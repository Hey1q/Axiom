const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const code = (v) =>
  v === null || v === undefined || v === "" ? "—" : "`" + String(v) + "`";
const yn = (b) => (b ? "✅ On" : "❌ Off");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const archivePretty = (mins) => {
  const m = Number(mins ?? 0);
  switch (m) {
    case 60:
      return "1 Hour";
    case 1440:
      return "24 Hours";
    case 4320:
      return "3 Days";
    case 10080:
      return "1 Week";
    default:
      return m ? `${m} min` : "—";
  }
};

async function resolveLogChannel(guild, id) {
  const ch =
    guild.channels.cache.get(id) ||
    (await guild.channels.fetch(id).catch(() => null));
  if (ch && "send" in ch && ch.isTextBased?.()) return ch;
  return null;
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

function pushDiff(list, label, oldV, newV) {
  const a = oldV ?? "—";
  const b = newV ?? "—";
  if (String(a) === String(b)) return;
  list.push(`✏️ **${label}:** ${code(a)} → ${code(b)}`);
}

function bitsToNames(bitfield) {
  if (bitfield === undefined || bitfield === null) return [];
  const bf = BigInt(bitfield);
  const names = [];
  for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
    if ((bf & BigInt(bit)) !== 0n) names.push(name);
  }
  return names;
}
function listNames(arr, limit = 6) {
  if (!arr?.length) return "—";
  if (arr.length <= limit) return arr.map((n) => "`" + n + "`").join(", ");
  return (
    arr
      .slice(0, limit)
      .map((n) => "`" + n + "`")
      .join(", ") + ` …(+${arr.length - limit})`
  );
}
function diffOverwriteBits(oldOw, newOw) {
  const oldAllow = BigInt(oldOw?.allow?.bitfield ?? 0);
  const oldDeny = BigInt(oldOw?.deny?.bitfield ?? 0);
  const newAllow = BigInt(newOw?.allow?.bitfield ?? 0);
  const newDeny = BigInt(newOw?.deny?.bitfield ?? 0);

  const plusAllow = newAllow & ~oldAllow;
  const minusAllow = oldAllow & ~newAllow;
  const plusDeny = newDeny & ~oldDeny;
  const minusDeny = oldDeny & ~newDeny;

  const parts = [];
  const pa = bitsToNames(plusAllow);
  const ma = bitsToNames(minusAllow);
  const pd = bitsToNames(plusDeny);
  const md = bitsToNames(minusDeny);

  if (pa.length) parts.push(`➕ **Allow:** ${listNames(pa)}`);
  if (ma.length) parts.push(`➖ **Allow:** ${listNames(ma)}`);
  if (pd.length) parts.push(`➕ **Deny:** ${listNames(pd)}`);
  if (md.length) parts.push(`➖ **Deny:** ${listNames(md)}`);

  return parts.length ? parts.join(" • ") : null;
}

function buildOverwritesDiff(oldCh, newCh) {
  const oldMap =
    oldCh.permissionOverwrites?.cache ?? oldCh.permissionOverwrites;
  const newMap =
    newCh.permissionOverwrites?.cache ?? newCh.permissionOverwrites;
  if (!oldMap || !newMap) return null;

  const oldById = new Map(oldMap.map((o) => [o.id, o]));
  const newById = new Map(newMap.map((o) => [o.id, o]));

  const lines = [];

  for (const [id, nw] of newById) {
    const prev = oldById.get(id);
    if (!prev) {
      const who = nw.type === 0 ? `<@&${id}>` : `<@${id}>`;
      const allow = listNames(bitsToNames(nw.allow?.bitfield ?? 0));
      const deny = listNames(bitsToNames(nw.deny?.bitfield ?? 0));
      lines.push(`🟩 **${who}** → Allow: ${allow} | Deny: ${deny}`);
    } else {
      const d = diffOverwriteBits(prev, nw);
      if (d) {
        const who = nw.type === 0 ? `<@&${id}>` : `<@${id}>`;
        lines.push(`✏️ **${who}** → ${d}`);
      }
    }
  }

  for (const [id, ow] of oldById) {
    if (!newById.has(id)) {
      const who = ow.type === 0 ? `<@&${id}>` : `<@${id}>`;
      lines.push(`🟥 **${who}** (removed overwrite)`);
    }
  }

  if (!lines.length) return null;
  const MAX = 6;
  return lines.length > MAX
    ? lines.slice(0, MAX).join("\n") + `\n…(+${lines.length - MAX} more)`
    : lines.join("\n");
}

module.exports = {
  name: Events.ChannelUpdate,
  once: false,

  /**
   * @param {import('discord.js').GuildBasedChannel} oldChannel
   * @param {import('discord.js').GuildBasedChannel} newChannel
   * @param {*} bot
   */
  async execute(oldChannel, newChannel, bot) {
    try {
      const type = newChannel?.type ?? oldChannel?.type;
      if (type === ChannelType.GuildCategory) return;

      const guild = newChannel?.guild || oldChannel?.guild;
      if (!guild) return;

      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_CHANNEL_UPDATES === false) return;

      const targets = Array.isArray(cfg.EVENTS_CHANNEL_UPDATE_IDS)
        ? [...new Set(cfg.EVENTS_CHANNEL_UPDATE_IDS.map(String))]
        : [];
      if (!targets.length) return;

      const ch = newChannel ?? oldChannel;
      const chId = ch?.id || "unknown";
      const chName = ch?.name || "unknown";

      const diffs = [];
      if ("name" in oldChannel || "name" in newChannel) {
        pushDiff(diffs, "Name", oldChannel.name, newChannel.name);
      }

      const oldParent = oldChannel.parent || oldChannel.parentId;
      const newParent = newChannel.parent || newChannel.parentId;
      if ((oldParent?.id || oldParent) !== (newParent?.id || newParent)) {
        const oldCatName =
          oldChannel.parent?.name || (oldParent ? oldParent : "—");
        const newCatName =
          newChannel.parent?.name || (newParent ? newParent : "—");
        diffs.push(
          `🗂️ **Category:** ${code(oldCatName)} → ${code(newCatName)}`
        );
      }

      if (
        newChannel.type === ChannelType.GuildText ||
        newChannel.type === ChannelType.GuildAnnouncement
      ) {
        pushDiff(diffs, "Topic", oldChannel.topic, newChannel.topic);
        if (
          typeof oldChannel.nsfw === "boolean" ||
          typeof newChannel.nsfw === "boolean"
        ) {
          if (!!oldChannel.nsfw !== !!newChannel.nsfw) {
            diffs.push(
              `🔞 **NSFW:** ${yn(!!oldChannel.nsfw)} → ${yn(!!newChannel.nsfw)}`
            );
          }
        }
        if (
          (oldChannel.rateLimitPerUser ?? null) !==
          (newChannel.rateLimitPerUser ?? null)
        ) {
          pushDiff(
            diffs,
            "Slowmode (sec)",
            oldChannel.rateLimitPerUser ?? 0,
            newChannel.rateLimitPerUser ?? 0
          );
        }
        if (
          (oldChannel.defaultAutoArchiveDuration ?? null) !==
          (newChannel.defaultAutoArchiveDuration ?? null)
        ) {
          diffs.push(
            `🕒 **Hide After Inactivity:** ${code(
              archivePretty(oldChannel.defaultAutoArchiveDuration)
            )} → ${code(archivePretty(newChannel.defaultAutoArchiveDuration))}`
          );
        }
      }

      if (
        newChannel.type === ChannelType.GuildForum ||
        newChannel.type === ChannelType.GuildMedia
      ) {
        if (
          (oldChannel.defaultAutoArchiveDuration ?? null) !==
          (newChannel.defaultAutoArchiveDuration ?? null)
        ) {
          diffs.push(
            `🕒 **Hide After Inactivity:** ${code(
              archivePretty(oldChannel.defaultAutoArchiveDuration)
            )} → ${code(archivePretty(newChannel.defaultAutoArchiveDuration))}`
          );
        }
      }

      if (
        newChannel.type === ChannelType.GuildVoice ||
        newChannel.type === ChannelType.GuildStageVoice
      ) {
        pushDiff(diffs, "Bitrate", oldChannel.bitrate, newChannel.bitrate);
        pushDiff(
          diffs,
          "User Limit",
          oldChannel.userLimit,
          newChannel.userLimit
        );
      }

      const permsBlock = buildOverwritesDiff(oldChannel, newChannel);

      const actorId = await fetchActorIdWithRetry(
        guild,
        AuditLogEvent.ChannelUpdate,
        chId,
        2
      );
      const actor = await actorDisplay(guild, actorId);

      const eb = new EmbedBuilder()
        .setTitle("📝 Channel Updated")
        .addFields(
          { name: "📛 Channel", value: `${chName}\n🆔 ${chId}` },
          {
            name: "👤 Updated by",
            value: `${actor.mention}\n${code(actor.tag)}\n🆔 ${actor.id}`,
          },
          { name: "🔍 Changes", value: diffs.length ? diffs.join("\n") : "—" },
          ...(permsBlock ? [{ name: "🔑 Permissions", value: permsBlock }] : [])
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
      bot?.log?.(`⚠️ channelUpdate log failed: ${e?.message || e}`);
    }
  },
};
