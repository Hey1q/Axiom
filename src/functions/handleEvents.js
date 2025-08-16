const fs = require("node:fs");
const path = require("node:path");

module.exports = function (client, bot) {
  const eventsPath = path.join(__dirname, "../events");
  if (!fs.existsSync(eventsPath)) return;

  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.once) {
      client.once(event.name, (...args) => {
        event.execute(...args, bot);
      });
    } else {
      client.on(event.name, (...args) => {
        event.execute(...args, bot);
      });
    }
  }
};
