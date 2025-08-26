const { EmbedBuilder, ChannelType } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

function rolesList(member) {
  try {
    const roles = member.roles.cache
      .filter((r) => r.id !== member.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString());
    return roles.length ? roles.join(" ") : "_No roles_";
  } catch {
    return "_No roles_";
  }
}

module.exports = {
  name: "guildMemberRemove",
  async execute(member /*, bot */) {
    try {
      const cfg = loadConfig() || {};
      const channelId = cfg.LEAVE_CHANNEL_ID;
      if (!channelId) return;

      const guild = member.guild;
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (
        !channel ||
        (channel.type !== ChannelType.GuildText &&
          channel.type !== ChannelType.GuildAnnouncement)
      ) {
        return;
      }

      const created = Math.floor(member.user.createdTimestamp / 1000);
      const joined =
        member.joinedTimestamp != null
          ? Math.floor(member.joinedTimestamp / 1000)
          : null;
      const left = Math.floor(Date.now() / 1000);

      const eb = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("👋 Member Left")
        .setDescription(`${member.user.tag} left the server.`)
        .setAuthor({
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        })
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .addFields(
          {
            name: "🆔 User",
            value: `<@${member.id}> \n\`${member.user.tag}\` • \`${member.id}\``,
            inline: true,
          },
          {
            name: "📅 Account created",
            value: `<t:${created}:F> • <t:${created}:R>`,
            inline: true,
          },
          {
            name: "📥 Joined server",
            value: joined ? `<t:${joined}:F> • <t:${joined}:R>` : "—",
            inline: true,
          },
          {
            name: "📤 Left server",
            value: `<t:${left}:F> • <t:${left}:R>`,
            inline: true,
          },
          { name: "🎭 Roles (at leave)", value: rolesList(member) }
        )
        .setTimestamp()
        .setFooter({ text: "Axiom • Leave log" });

      await channel.send({ embeds: [eb] });
    } catch (e) {
      console.error("guildMemberRemove log error:", e?.message || e);
    }
  },
};
