const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = (client, botInstance) => {
  const foldersPath = path.join(__dirname, "..", "commands");
  if (!fs.existsSync(foldersPath)) {
    botInstance.log("[ERROR] ❌ Commands directory not found!");
    return;
  }

  const excludedFolders = ["utils"];
  const commandFolders = fs.readdirSync(foldersPath).filter((folder) => {
    const folderPath = path.join(foldersPath, folder);
    return (
      fs.statSync(folderPath).isDirectory() && !excludedFolders.includes(folder)
    );
  });

  botInstance.log("🔄 [COMMANDS] Loading slash commands...");

  const commands = [];
  const config = loadConfig();

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        const command = require(filePath);

        if ("data" in command && "execute" in command) {
          client.commands.set(command.data.name, command);
          commands.push(command.data.toJSON());
          botInstance.log(`[COMMANDS] ✅ Loaded: /${command.data.name}`);
        } else {
          botInstance.log(
            `[WARNING] ⚠️ Skipped invalid command at ${filePath}`
          );
        }
      } catch (err) {
        botInstance.log(
          `[ERROR] ❌ Failed to load ${filePath}: ${err.message}`
        );
      }
    }
  }

  client.once("ready", async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(
        config.DISCORD_BOT_TOKEN
      );

      if (!config.CLIENT_ID) {
        botInstance.log("❌ CLIENT_ID is missing in config.json");
        return;
      }

      botInstance.log(
        `🔁 Registering ${commands.length} application commands...`
      );

      await rest.put(Routes.applicationCommands(config.CLIENT_ID), {
        body: commands,
      });

      botInstance.log("✅ Successfully registered all slash commands.");
    } catch (error) {
      botInstance.log("❌ Error registering slash commands.");
      console.error(error);
    }
  });
};
