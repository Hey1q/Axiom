const { Events, MessageFlags } = require("discord.js");
const { loadConfig } = require("../functions/setupHandler");
const { addEntry } = require("../storage/giveaways");

const cooldowns = new Map();

function getOwnerId() {
  try {
    const cfg = loadConfig() || {};
    return (cfg.OWNER_DISCORD_ID || "").trim() || null;
  } catch {
    return null;
  }
}

async function safeReply(interaction, payload) {
  const base =
    typeof payload === "string" ? { content: payload } : payload || {};
  const data = { flags: MessageFlags.Ephemeral, ...base };
  try {
    if (interaction.replied) return await interaction.followUp(data);
    if (interaction.deferred) return await interaction.editReply(data);
    return await interaction.reply(data);
  } catch {
    return null;
  }
}

function checkCooldown(interaction, command) {
  const cd = Number(command.cooldownMs || 0);
  if (!cd || !Number.isFinite(cd) || cd <= 0) return null;
  const name = command.data?.name || interaction.commandName;
  if (!cooldowns.has(name)) cooldowns.set(name, new Map());
  const perUser = cooldowns.get(name);
  const now = Date.now();
  const last = perUser.get(interaction.user.id) || 0;
  if (now - last < cd) return cd - (now - last);
  perUser.set(interaction.user.id, now);
  return null;
}

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction) {
    if (!interaction.inGuild()) return;

    if (interaction.isButton()) {
      try {
        if (interaction.customId?.startsWith("gw:enter:")) {
          const giveawayId = interaction.customId.split(":")[2];
          if (!giveawayId) {
            await safeReply(interaction, "⚠️ Invalid giveaway.");
            return;
          }
          const ok = addEntry(giveawayId, interaction.user.id);
          if (ok) {
            await safeReply(
              interaction,
              `🎉 You're in! Joined **${giveawayId}** successfully.`
            );
          } else {
            await safeReply(
              interaction,
              `ℹ️ You have already joined this giveaway.`
            );
          }
          return;
        }

        // demo/test buttons
        const map = {
          "test:primary": "Primary",
          "test:secondary": "Secondary",
          "test:success": "Success",
          "test:danger": "Danger",
        };
        const name = map[interaction.customId];
        if (name) await safeReply(interaction, `✅ You pressed **${name}**`);
        else await interaction.deferUpdate().catch(() => {});
      } catch (err) {
        console.error("🟥 button handler error:", err);
        try {
          await interaction.deferUpdate();
        } catch {}
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const cmd = interaction.client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        try {
          await cmd.autocomplete(interaction);
        } catch (err) {
          console.error("🟥 autocomplete error:", err);
          try {
            await interaction.respond([]);
          } catch {}
        }
      } else {
        try {
          await interaction.respond([]);
        } catch {}
      }
      return;
    }

    if (
      !interaction.isChatInputCommand() &&
      !interaction.isContextMenuCommand?.()
    )
      return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command || typeof command.execute !== "function") {
      return safeReply(
        interaction,
        `❌ Command '${interaction.commandName}' not found.`
      );
    }

    try {
      if (command.ownerOnly) {
        const ownerId = getOwnerId();
        if (!ownerId || interaction.user.id !== ownerId) {
          return safeReply(interaction, "🚫 Owner-only command.");
        }
      }
    } catch {}

    const waitMs = checkCooldown(interaction, command);
    if (waitMs !== null) {
      return safeReply(
        interaction,
        `⏳ Please wait ${Math.ceil(waitMs / 1000)}s before using again.`
      );
    }

    let watchdogTriggered = false;
    const watchdog = setTimeout(async () => {
      try {
        if (!interaction.deferred && !interaction.replied) {
          watchdogTriggered = true;
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
      } catch {}
    }, 2400);

    try {
      await command.execute(interaction);
      if (watchdogTriggered && interaction.deferred && !interaction.replied) {
        await safeReply(interaction, "✅ The command is being processed.");
      }
    } catch (error) {
      console.error(
        `🟥 interactionCreate error in '${interaction.commandName}':`,
        error
      );
      await safeReply(
        interaction,
        "❌ An error occurred while executing this command."
      );
    } finally {
      clearTimeout(watchdog);
    }
  },
};
