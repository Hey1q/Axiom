const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/**
 * @param {import('discord.js').Client} client
 * @param {{ id:string, title:string, description?:string, winners:number, endsAt:number, channelId:string }} gw
 * @returns {Promise<import('discord.js').Message<boolean>>}
 */
async function postGiveaway(client, gw) {
  const channel = await client.channels.fetch(gw.channelId);
  const endsUnix = Math.floor((Number(gw.endsAt) || Date.now()) / 1000);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎁 ${gw.title || "Giveaway"}`)
    .setDescription(gw.description || "—")
    .addFields(
      {
        name: "⏳ Ends",
        value: `<t:${endsUnix}:F> • <t:${endsUnix}:R>`,
        inline: true,
      },
      { name: "👥 Winners", value: String(gw.winners || 1), inline: true },
      { name: "🆔 ID", value: `\`${gw.id}\``, inline: true }
    )
    .setFooter({ text: "Press the button to join • or react 🎉" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gw:enter:${gw.id}`)
      .setLabel("Join")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  try {
    await msg.react("🎉");
  } catch {}

  gw.messageId = msg.id;
  gw.url = msg.url;
  return msg;
}

module.exports = { postGiveaway };
