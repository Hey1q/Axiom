const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

const diffBool = (a, b) => !!a !== !!b;

const channelIsSendable = (ch) =>
  !!ch &&
  (ch.type === ChannelType.GuildText ||
    ch.type === ChannelType.GuildAnnouncement);

async function sendToChannels(client, channelIds, payload) {
  for (const id of Array.from(new Set(channelIds || []))) {
    try {
      const ch = await client.channels.fetch(id).catch(() => null);
      if (!channelIsSendable(ch)) continue;
      await ch.send({ ...payload, allowedMentions: { parse: [] } });
    } catch {}
  }
}

const buildBaseEmbed = () => new EmbedBuilder().setTimestamp();

function getUserTag(state) {
  const u = state?.member?.user || state?.client?.users?.cache?.get(state.id);
  return u?.tag || "unknown";
}

function pickColor(kind) {
  switch (kind) {
    case "join":
      return 0x3fbf3f;
    case "leave":
      return 0xbf3f3f;
    case "move":
      return 0xf59e0b;
    case "toggle":
      return 0x4b6cb7;
    case "stage":
      return 0x8b5cf6;
    default:
      return 0x5865f2;
  }
}

function channelDisplay(ch) {
  if (!ch) return "#unknown";
  const name = `#${ch.name}`;
  const mention = ch.id ? `(<#${ch.id}>)` : "";
  return [name, mention].filter(Boolean).join(" | ");
}

function collectChanges(oldState, newState) {
  const changes = [];
  const idInfo = { type: null, single: null, from: null, to: null };

  const oldCh = oldState.channel;
  const newCh = newState.channel;

  if (!oldCh && newCh) {
    changes.push({
      kind: "join",
      line: `🟢 **Joined** ${channelDisplay(newCh)}`,
    });
    idInfo.type = "single";
    idInfo.single = newCh.id;
  } else if (oldCh && !newCh) {
    changes.push({
      kind: "leave",
      line: `🔴 **Left** ${channelDisplay(oldCh)}`,
    });
    idInfo.type = "single";
    idInfo.single = oldCh.id;
  } else if (oldCh && newCh && oldCh.id !== newCh.id) {
    changes.push({
      kind: "move",
      line: `🟡 **Moved** ${channelDisplay(oldCh)} → ${channelDisplay(newCh)}`,
    });
    idInfo.type = "move";
    idInfo.from = oldCh.id;
    idInfo.to = newCh.id;
  }

  if (diffBool(oldState.selfMute, newState.selfMute))
    changes.push({
      kind: "toggle",
      line: newState.selfMute ? "🔇 **Self mute ON**" : "🔈 **Self mute OFF**",
    });
  if (diffBool(oldState.selfDeaf, newState.selfDeaf))
    changes.push({
      kind: "toggle",
      line: newState.selfDeaf ? "🙉 **Self deaf ON**" : "👂 **Self deaf OFF**",
    });
  if (diffBool(oldState.streaming, newState.streaming))
    changes.push({
      kind: "toggle",
      line: newState.streaming
        ? "📺 **Streaming STARTED**"
        : "📺 **Streaming STOPPED**",
    });
  if (diffBool(oldState.selfVideo, newState.selfVideo))
    changes.push({
      kind: "toggle",
      line: newState.selfVideo ? "📷 **Camera ON**" : "📷 **Camera OFF**",
    });

  if (diffBool(oldState.serverMute, newState.serverMute))
    changes.push({
      kind: "toggle",
      line: newState.serverMute
        ? "🛠️ **Server mute ON**"
        : "🛠️ **Server mute OFF**",
    });
  if (diffBool(oldState.serverDeaf, newState.serverDeaf))
    changes.push({
      kind: "toggle",
      line: newState.serverDeaf
        ? "🛠️ **Server deaf ON**"
        : "🛠️ **Server deaf OFF**",
    });

  if (diffBool(oldState.suppress, newState.suppress))
    changes.push({
      kind: "stage",
      line: newState.suppress
        ? "🎙️ **Stage: Suppressed**"
        : "🎙️ **Stage: Unsuppressed (can speak)**",
    });
  if (
    (oldState.requestToSpeakTimestamp || null) !==
    (newState.requestToSpeakTimestamp || null)
  )
    changes.push({
      kind: "stage",
      line: newState.requestToSpeakTimestamp
        ? "✋ **Requested to speak**"
        : "🤐 **Request to speak cleared**",
    });

  return { changes, idInfo };
}

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,
  /**
   * @param {import('discord.js').VoiceState} oldState
   * @param {import('discord.js').VoiceState} newState
   * @param {import('../bot')} bot
   */
  async execute(oldState, newState, bot) {
    try {
      const cfg = loadConfig() || {};
      if (cfg.EVENTS_WATCH_VOICE_UPDATES === false) return;

      const allowedChannels = Array.isArray(cfg.EVENTS_VOICE_UPDATE_IDS)
        ? cfg.EVENTS_VOICE_UPDATE_IDS
        : [];

      const onlySelected = cfg.EVENTS_ONLY_SELECTED !== false;
      if (onlySelected && allowedChannels.length === 0) return;

      const { changes, idInfo } = collectChanges(oldState, newState);
      if (!changes.length) return;

      const uTag = getUserTag(newState || oldState);
      const uId = newState?.id || oldState?.id || "unknown";
      const firstKind = changes[0]?.kind || "toggle";

      const bulletLines = changes.map((c) => `• ${c.line}`);

      if (idInfo.type === "single" && idInfo.single) {
        bulletLines.push(`\n🆔 **Channel:** ${idInfo.single}`);
      } else if (idInfo.type === "move") {
        if (idInfo.from)
          bulletLines.push(`\n🆔 **Channel From:** ${idInfo.from}`);
        if (idInfo.to) bulletLines.push(`🆔 **Channel To:** ${idInfo.to}`);
      }

      const eb = buildBaseEmbed()
        .setTitle("🎧 Voice Update")
        .setColor(pickColor(firstKind))
        .setDescription(
          [
            `👤 **User:** ${uTag}`,
            `🆔 **User:** ${uId}`,
            "",
            ...bulletLines,
          ].join("\n")
        );

      let targets = allowedChannels.slice();
      if (targets.length === 0 && onlySelected === false) {
        const fallback = Array.isArray(cfg.EVENTS_CHANNEL_UPDATE_IDS)
          ? cfg.EVENTS_CHANNEL_UPDATE_IDS
          : [];
        targets = fallback;
      }
      if (!targets.length) return;

      await sendToChannels(newState.client, targets, { embeds: [eb] });
      bot?.log?.(`🎧 VoiceStateUpdate logged for ${uTag}`);
    } catch (err) {
      bot?.log?.(`❌ voiceStateUpdate error: ${err?.message || err}`);
    }
  },
};
