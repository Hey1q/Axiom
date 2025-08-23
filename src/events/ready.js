const { Events, Collection, REST, Routes } = require("discord.js");
const path = require("node:path");
const fs = require("node:fs");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const commands = [];
    client.commands = new Collection();

    const cmdPath = path.join(__dirname, "..", "commands");
    for (const file of fs
      .readdirSync(cmdPath)
      .filter((f) => f.endsWith(".js"))) {
      const cmd = require(path.join(cmdPath, file));
      if (cmd?.data && typeof cmd.execute === "function") {
        client.commands.set(cmd.data.name, cmd);
        commands.push(cmd.data.toJSON());
      }
    }

    const { GUILD_ID, DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN } =
      require("../functions/setupHandler").loadConfig();

    const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

    try {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
        body: [],
      });
      console.log("🧹 Cleared GLOBAL app commands");
    } catch (e) {
      console.warn(
        "Could not clear global commands (ok to ignore):",
        e.message
      );
    }

    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(
      `⬆️  Registered ${commands.length} guild commands to ${GUILD_ID}`
    );
  },
};
