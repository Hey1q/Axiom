const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trial")
    .setDescription("Button test (Primary / Secondary / Success / Danger)"),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("test:primary")
        .setLabel("Primary")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("test:secondary")
        .setLabel("Secondary")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("test:success")
        .setLabel("Success")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("test:danger")
        .setLabel("Danger")
        .setStyle(ButtonStyle.Danger)
    );

    const reply = await interaction.reply({
      content: "⚡ Press any button to test (active for 2 minutes).",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const client = interaction.client;
    const authorId = interaction.user.id;
    const messageId = (await interaction.fetchReply()).id;

    const handle = async (btnInteraction) => {
      try {
        if (!btnInteraction.isButton()) return;
        if (btnInteraction.message?.id !== messageId) return;
        if (btnInteraction.user.id !== authorId) {
          return btnInteraction.reply({
            content: "❌ This button set is visible only to you.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const id = btnInteraction.customId;
        const map = {
          "test:primary": "Primary",
          "test:secondary": "Secondary",
          "test:success": "Success",
          "test:danger": "Danger",
        };

        const name = map[id] || "Unknown";
        await btnInteraction.reply({
          content: `✅ You pressed **${name}**`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error("Button handler error:", err);
      }
    };

    client.on("interactionCreate", handle);

    setTimeout(async () => {
      client.removeListener("interactionCreate", handle);
      try {
        await interaction.editReply({
          content: "⏱️ Test window expired.",
          components: [
            new ActionRowBuilder().addComponents(
              row.components.map((b) => ButtonBuilder.from(b).setDisabled(true))
            ),
          ],
        });
      } catch (_) {}
    }, 2 * 60 * 1000);
  },
};
