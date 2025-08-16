const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");

module.exports = async function registerCommands(botInstance) {
  const config = loadConfig();
  const commands = [];
  const commandsBasePath = path.join(__dirname, "..", "commands");

  const entries = fs.readdirSync(commandsBasePath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folderPath = path.join(commandsBasePath, entry.name);
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
          commands.push(command.data.toJSON());
          botInstance.log(
            `📁 Registered /${command.data.name} from ${filePath}`
          );
        }
      }
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      const filePath = path.join(commandsBasePath, entry.name);
      const command = require(filePath);
      if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
        botInstance.log(`📄 Registered /${command.data.name} from ${filePath}`);
      }
    }
  }

  try {
    const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
    botInstance.log(`📡 Deploying ${commands.length} commands...`);

    await rest.put(Routes.applicationCommands(config.CLIENT_ID), {
      body: commands,
    });

    botInstance.log("✅ Slash commands registered successfully.");
  } catch (error) {
    botInstance.log(`❌ Failed to register commands: ${error.message}`);
  }
};
