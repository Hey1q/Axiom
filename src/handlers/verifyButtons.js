const {
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");

function hasPerm(member, perm) {
  try {
    return member?.permissions?.has(perm);
  } catch {
    return false;
  }
}

async function replyEphemeral(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch {}
}

function rolesList(member) {
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  if (!roles.size) return "—";
  const names = roles.map((r) => r.toString()).slice(0, 10);
  const extra = roles.size - names.length;
  return extra > 0 ? `${names.join(", ")} (+${extra} more)` : names.join(", ");
}

function buildLogEmbed(kind, member, bannerURL) {
  const created = Math.floor(member.user.createdTimestamp / 1000);
  const joined = member.joinedTimestamp
    ? Math.floor(member.joinedTimestamp / 1000)
    : null;

  const color = kind === "accept" ? 0x3ba55d : 0xed4245;
  const title = kind === "accept" ? "Member Verified" : "Verification Declined";
  const desc =
    kind === "accept"
      ? `${member} accepted the verification.`
      : `${member} declined the verification.`;

  const avatarURL = member.user.displayAvatarURL({ size: 1024 });

  const eb = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.user.displayAvatarURL(),
    })
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "🆔 User",
        value: `${member}\n\`${member.user.tag}\` • \`${member.id}\``,
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
      { name: "🎭 Roles", value: rolesList(member) },
      {
        name: "🖼️ Links",
        value: `[Avatar](${avatarURL})${
          bannerURL ? ` • [Banner](${bannerURL})` : ""
        }`,
      }
    )
    .setTimestamp()
    .setFooter({ text: "Axiom • Verify logs" });

  if (bannerURL) eb.setImage(bannerURL);
  return eb;
}

async function sendToChannel(client, guildId, channelId, embed) {
  if (!channelId || !/^\d{17,20}$/.test(String(channelId))) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const ch = await guild.channels.fetch(channelId);
    if (!ch) return;
    if (
      ch.type !== ChannelType.GuildText &&
      ch.type !== ChannelType.GuildAnnouncement
    )
      return;
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

async function giveRoleOrReply({ log, interaction, guild, member, role }) {
  const me = guild.members.me;
  if (!me) {
    await replyEphemeral(interaction, "Bot member not found.");
    return { ok: false };
  }

  if (!hasPerm(me, PermissionFlagsBits.ManageRoles)) {
    log("verify: missing ManageRoles");
    await replyEphemeral(interaction, "I need **Manage Roles** permission.");
    return { ok: false };
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    log(`verify: role hierarchy fail (myTop <= ${role.name})`);
    await replyEphemeral(
      interaction,
      `My highest role must be **above** the target role (**${role.name}**).\nMove my role above it in **Server Settings → Roles**.`
    );
    return { ok: false };
  }

  try {
    await member.roles.add(role, "Verification accept");
    log(`verify: added role ${role.name} to ${member.user.tag}`);
    await replyEphemeral(
      interaction,
      `✅ You have been given **${role.name}**.`
    );
    return { ok: true };
  } catch (e) {
    log("verify: add role error " + (e?.message || e));
    await replyEphemeral(
      interaction,
      `Failed to give role: ${e?.message || e}`
    );
    return { ok: false };
  }
}

async function kickOrReply({ log, interaction, guild, member }) {
  const me = guild.members.me;
  if (!me) {
    await replyEphemeral(interaction, "Bot member not found.");
    return { ok: false };
  }

  if (!hasPerm(me, PermissionFlagsBits.KickMembers)) {
    log("verify: missing KickMembers");
    await replyEphemeral(interaction, "I need **Kick Members** permission.");
    return { ok: false };
  }
  try {
    await member.kick("Verification declined");
    log(`verify: kicked ${member.user.tag}`);
    await replyEphemeral(interaction, "You have been removed from the server.");
    return { ok: true };
  } catch (e) {
    log("verify: kick error " + (e?.message || e));
    await replyEphemeral(interaction, `Failed to kick: ${e?.message || e}`);
    return { ok: false };
  }
}

function registerVerifyButtons(client, { loadConfig, log = console.log }) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isButton()) return;
      const id = interaction.customId;
      if (id !== "verify_accept" && id !== "verify_decline") return;

      const guild = interaction.guild;
      if (!guild) {
        log("verify: no guild");
        return;
      }

      const cfg = (typeof loadConfig === "function" ? loadConfig() : {}) || {};
      const member = await guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (!member) {
        log("verify: member missing");
        return replyEphemeral(interaction, "Member not found.");
      }

      let bannerURL = null;
      try {
        const u = await interaction.client.users.fetch(member.id, {
          force: true,
        });
        bannerURL = u.bannerURL({ size: 2048 });
      } catch {}

      if (id === "verify_accept") {
        const roleId = (cfg.VERIFY_ROLE_ID || "").trim();
        if (!roleId) {
          log("verify: no VERIFY_ROLE_ID set");
          return replyEphemeral(
            interaction,
            "Verification role is not configured."
          );
        }
        const role =
          guild.roles.cache.get(roleId) ||
          (await guild.roles.fetch(roleId).catch(() => null));
        if (!role) {
          log("verify: role not found");
          return replyEphemeral(
            interaction,
            "Verification role no longer exists."
          );
        }

        const res = await giveRoleOrReply({
          log,
          interaction,
          guild,
          member,
          role,
        });
        if (res.ok) {
          const embed = buildLogEmbed("accept", member, bannerURL);
          await sendToChannel(
            interaction.client,
            guild.id,
            (cfg.WELCOME_CHANNEL_ID || "").trim(),
            embed
          );
        }
        return;
      }

      if (id === "verify_decline") {
        const res = await kickOrReply({ log, interaction, guild, member });
        const embed = buildLogEmbed("decline", member, bannerURL);
        await sendToChannel(
          interaction.client,
          guild.id,
          (cfg.LEAVE_CHANNEL_ID || "").trim(),
          embed
        );
        return;
      }
    } catch (e) {
      log(`❌ verify button handler: ${e?.message || e}`);
      await replyEphemeral(interaction, "Unexpected error.");
    }
  });
}

module.exports = { registerVerifyButtons };
