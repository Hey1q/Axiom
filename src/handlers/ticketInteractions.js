const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { URL } = require("node:url");
const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  OverwriteType,
} = require("discord.js");

const { getOwnerConfigDir } = require(path.join(
  __dirname,
  "..",
  "functions",
  "utils"
));

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}
function ensureDirFor(filePath) {
  ensureDir(path.dirname(filePath));
}
function appendJsonl(file, obj) {
  try {
    ensureDirFor(file);
    fs.appendFileSync(file, JSON.stringify(obj) + "\n", "utf8");
  } catch {}
}
function slugifyName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}
function memberHasRole(member, roleId) {
  if (!roleId) return false;
  try {
    return Boolean(member?.roles?.cache?.has(roleId));
  } catch {
    return false;
  }
}

async function safeFollowUp(i, content) {
  try {
    await i.followUp({ content, flags: MessageFlags.Ephemeral });
  } catch {}
}

function findOpenTicket(guild, userId, kind /* 'shop'|'other'|null */) {
  for (const [, ch] of guild.channels.cache) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const name = String(ch.name || "");
    if (!name.startsWith("ticket-")) continue;
    if (kind && !name.startsWith(`ticket-${kind}-`)) continue;

    if (
      typeof ch.topic === "string" &&
      ch.topic.includes(`[opener:${userId}]`)
    ) {
      return ch;
    }
    const ow = ch.permissionOverwrites?.cache?.get?.(userId);
    const canView = ow?.allow?.has?.(PermissionFlagsBits.ViewChannel);
    if (canView) return ch;
  }
  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prettifyMentions(m) {
  let s = String(m.content || "");

  if (m.mentions?.users?.size) {
    for (const u of m.mentions.users.values()) {
      const tag = u.tag || u.username || u.id;
      const re = new RegExp(`<@!?${u.id}>`, "g");
      s = s.replace(re, `@${tag}`);
    }
  }
  if (m.mentions?.roles?.size) {
    for (const r of m.mentions.roles.values()) {
      const re = new RegExp(`<@&${r.id}>`, "g");
      s = s.replace(re, `@${r.name}`);
    }
  }
  if (m.mentions?.channels?.size) {
    for (const ch of m.mentions.channels.values()) {
      const re = new RegExp(`<#${ch.id}>`, "g");
      s = s.replace(re, `#${ch.name}`);
    }
  }
  return s;
}

async function fetchAllMessages(channel, limit = 5000) {
  const out = [];
  let lastId = undefined;
  while (out.length < limit) {
    const page = await channel.messages
      .fetch({ limit: 100, before: lastId })
      .catch(() => null);
    if (!page || page.size === 0) break;
    const arr = Array.from(page.values());
    out.push(...arr);
    lastId = arr[arr.length - 1].id;
    if (page.size < 100) break;
  }
  return out.reverse();
}

function collectParticipants(messages) {
  const map = new Map();
  for (const m of messages) {
    const id = m.author?.id || "unknown";
    if (!map.has(id)) {
      map.set(id, {
        id,
        username: m.author?.username || "unknown",
        tag: m.author?.tag || m.author?.username || "unknown",
        bot: !!m.author?.bot,
        firstAt: m.createdAt ? m.createdAt.toISOString() : null,
        lastAt: m.createdAt ? m.createdAt.toISOString() : null,
        count: 0,
        attachments: 0,
      });
    }
    const p = map.get(id);
    p.count++;
    if (m.attachments?.size) p.attachments += m.attachments.size;
    const iso = m.createdAt ? m.createdAt.toISOString() : null;
    if (iso) {
      if (!p.firstAt || iso < p.firstAt) p.firstAt = iso;
      if (!p.lastAt || iso > p.lastAt) p.lastAt = iso;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function sanitizeFileName(name) {
  return String(name || "file")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 120);
}

function downloadToFile(url, filePath) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      https
        .get(u, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(false);
          }
          ensureDirFor(filePath);
          const ws = fs.createWriteStream(filePath);
          res.pipe(ws);
          ws.on("finish", () => {
            ws.close(() => resolve(true));
          });
        })
        .on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function downloadAllAttachments(messages, baseDir, prefix) {
  const map = new Map();
  const folder = path.join(baseDir, `${prefix}_files`);
  ensureDir(folder);

  for (const m of messages) {
    if (!m.attachments?.size) continue;
    for (const att of m.attachments.values()) {
      const url = att.url;
      const name =
        sanitizeFileName(att.name) ||
        `${m.id}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = path.join(folder, name);
      const ok = await downloadToFile(url, filePath);
      if (ok) {
        map.set(url, `${prefix}_files/${name}`);
      }
    }
  }
  return map;
}

function renderTranscriptHtml(
  channel,
  messages,
  meta = {},
  localMap = new Map()
) {
  const title = `Transcript • #${channel.name}`;
  const participants = collectParticipants(messages);

  const rows = messages
    .map((m) => {
      const t = m.createdAt ? m.createdAt.toISOString() : "";
      const author = `${
        m.author?.tag || m.author?.username || m.author?.id || "unknown"
      }`;
      const content = escapeHtml(prettifyMentions(m) || "");
      const atts = m.attachments?.size
        ? Array.from(m.attachments.values())
            .map((a) => {
              const local = localMap.get(a.url);
              const href = escapeHtml(local || a.url);
              const label = escapeHtml(a.name || a.url);
              return `<div class="att"><a href="${href}" target="_blank" rel="noreferrer">${label}</a>${
                local ? " <span class='local'>(local copy)</span>" : ""
              }</div>`;
            })
            .join("")
        : "";
      return `
      <div class="msg">
        <div class="meta"><span class="time">${t}</span> — <span class="author">${escapeHtml(
        author
      )}</span></div>
        <div class="text">${content || "<i>(no content)</i>"}${atts}</div>
      </div>`;
    })
    .join("\n");

  const partTable = participants
    .map(
      (p) =>
        `<tr>
           <td>${escapeHtml(p.tag)}</td>
           <td><code>${p.id}</code></td>
           <td>${p.bot ? "bot" : "user"}</td>
           <td>${p.count}</td>
           <td>${p.attachments}</td>
         </tr>`
    )
    .join("");

  const infoList = `
    <div class="kv">
      <div><b>Channel:</b> <code>${channel.id}</code></div>
      <div><b>Opened by:</b> ${
        meta.openerTag ? escapeHtml(meta.openerTag) : "—"
      } ${meta.openerId ? `(<code>${meta.openerId}</code>)` : ""}</div>
      <div><b>Closed by:</b> ${
        meta.closedByTag ? escapeHtml(meta.closedByTag) : "—"
      } ${meta.closedBy ? `(<code>${meta.closedBy}</code>)` : ""}</div>
      <div><b>Opened at:</b> ${meta.openedAt || "—"}</div>
      <div><b>Closed at:</b> ${meta.closedAt || "—"}</div>
      <div><b>Type:</b> ${escapeHtml(meta.kind || "other")}</div>
      <div><b>Total messages:</b> ${messages.length}</div>
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  body{background:#0b0e16;color:#e5e7eb;font-family:system-ui,"Segoe UI",Roboto,Ubuntu,Arial,sans-serif;margin:20px}
  .hdr{font-size:18px;margin-bottom:6px}
  .sub{color:#9ca3af;margin-bottom:16px}
  .box{background:#0f1220;border:1px solid #1a1f2d;border-radius:10px;padding:12px;margin:10px 0}
  .grid{display:grid;grid-template-columns:1fr}
  .kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px}
  .msg{border:1px solid #1a1f2d;border-radius:8px;padding:8px 10px;margin:8px 0;background:#0f1220}
  .meta{color:#9ca3af;font-size:12px;margin-bottom:6px}
  .text{white-space:pre-wrap;word-break:break-word}
  .att{margin-top:4px}
  .local{color:#6ee7b7;font-size:12px;margin-left:6px}
  a{color:#93c5fd}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{border:1px solid #1f2434;padding:6px 8px;font-size:13px}
  th{background:#11162a;text-align:left}
  code{background:#0b0f1d;border:1px solid #1a1f2d;border-radius:4px;padding:1px 4px}
</style>
</head>
<body>
  <div class="hdr">${escapeHtml(title)}</div>
  <div class="sub">Generated: ${new Date().toLocaleString()}</div>

  <div class="box">
    ${infoList}
  </div>

  <div class="box">
    <b>Participants</b>
    <table>
      <thead><tr><th>User</th><th>ID</th><th>Type</th><th>Msgs</th><th>Files</th></tr></thead>
      <tbody>${
        partTable || "<tr><td colspan='5'>No participants</td></tr>"
      }</tbody>
    </table>
  </div>

  <div class="grid">
    ${rows || "<i>No messages</i>"}
  </div>
</body></html>`;
}

function transcriptsBaseDirFromConfig(cfg) {
  const configured = String(cfg?.TRANSCRIPTS_DIR || "").trim();
  if (configured) return configured;
  return path.join(getOwnerConfigDir(), "transcripts");
}

function userFolderName(userId, username) {
  const clean = sanitizeFileName(username || "unknown");
  return `${userId || "unknown"} - ${clean}`;
}

function registerTicketInteractions(client, { loadConfig, log } = {}) {
  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (i.isStringSelectMenu() && i.customId === "tickets:open") {
        const kind = String(i.values?.[0] || "").toLowerCase();
        if (!["shop", "other"].includes(kind)) return;

        await i.deferUpdate().catch(() => {});

        const cfg =
          (typeof loadConfig === "function" ? loadConfig() : {}) || {};
        const staffRoleId = cfg.TICKETS_STAFF_ROLE_ID || null;

        const me = await i.guild?.members?.fetchMe().catch(() => null);
        if (!me || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await safeFollowUp(
            i,
            "I need **Manage Channels** permission to create ticket channels."
          );
          return;
        }

        const already = findOpenTicket(i.guild, i.user.id, null);
        if (already) {
          await safeFollowUp(
            i,
            `You already have an open ticket: ${already.toString()}`
          );
          return;
        }

        const parentId = cfg.TICKETS_CATEGORY_ID || i.channel?.parentId || null;

        const base = slugifyName(`ticket-${kind}-${i.user.username}`);
        let name = base;
        for (let n = 2; n < 50; n++) {
          const exists = i.guild.channels.cache.find(
            (ch) =>
              ch.name === name &&
              (ch.type === ChannelType.GuildText ||
                ch.type === ChannelType.GuildAnnouncement)
          );
          if (!exists) break;
          name = `${base}-${n}`;
        }

        const everyoneId = i.guild.roles.everyone.id;
        const overwrites = [
          {
            id: everyoneId,
            type: OverwriteType.Role,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: i.user.id,
            type: OverwriteType.Member,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AddReactions,
            ],
          },
        ];

        let staffMentionOk = false;
        if (kind === "other" && staffRoleId) {
          let role = i.guild.roles.cache.get(staffRoleId);
          if (!role)
            role = await i.guild.roles.fetch(staffRoleId).catch(() => null);
          if (role) {
            overwrites.push({
              id: role.id,
              type: OverwriteType.Role,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
              ],
            });
            staffMentionOk = true;
          }
        }

        if (cfg.OWNER_DISCORD_ID) {
          overwrites.push({
            id: cfg.OWNER_DISCORD_ID,
            type: OverwriteType.Member,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }

        const ticketChannel = await i.guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: parentId ?? undefined,
          topic: `ticket:${kind} [opener:${i.user.id}] status:open`,
          permissionOverwrites: overwrites,
          reason: `Ticket ${kind} opened by ${i.user.tag} (${i.user.id})`,
        });

        const mentions = [`<@${i.user.id}>`];
        if (staffMentionOk) mentions.push(`<@&${staffRoleId}>`);
        const intro = `${mentions.join(
          " "
        )}\nWelcome! Please describe your issue. A staff member will assist you shortly.`;

        const closeRow = {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              custom_id: "ticket:close",
              label: "Close Ticket",
            },
          ],
        };
        await ticketChannel.send({ content: intro, components: [closeRow] });

        try {
          const file =
            kind === "shop"
              ? cfg.TICKETS_SHOP_LOG_PATH || null
              : cfg.TICKETS_OTHER_LOG_PATH || null;
          if (file) {
            appendJsonl(file, {
              ts: new Date().toISOString(),
              type: kind,
              action: "create",
              channelId: ticketChannel.id,
              parentId,
              opener: {
                id: i.user.id,
                username: i.user.username,
                tag: i.user.tag,
                avatar: i.user.displayAvatarURL?.() || null,
                createdAt: i.user.createdAt
                  ? i.user.createdAt.toISOString()
                  : null,
              },
              openerId: i.user.id,
              openerTag: i.user.tag,
              openedAt: new Date().toISOString(),
            });
          }
        } catch {}

        try {
          await i.message.edit({ components: i.message.components });
        } catch {}

        await safeFollowUp(
          i,
          `Created ${kind} ticket: ${ticketChannel.toString()}`
        );
        (log || console.log)(
          `🎫 Opened ticket "${name}" for ${i.user.tag} (${kind})`
        );
        return;
      }

      if (i.isButton() && i.customId === "ticket:close") {
        const ch = i.channel;
        if (
          !ch ||
          ch.type !== ChannelType.GuildText ||
          !String(ch.name).startsWith("ticket-")
        ) {
          try {
            await i.reply({
              content: "This is not a ticket channel.",
              flags: MessageFlags.Ephemeral,
            });
          } catch {}
          return;
        }

        const openerMatch =
          typeof ch.topic === "string" &&
          /\[opener:(\d{17,20})\]/.exec(ch.topic);
        const openerId = openerMatch ? openerMatch[1] : null;

        const cfg =
          (typeof loadConfig === "function" ? loadConfig() : {}) || {};
        const ownerId = cfg.OWNER_DISCORD_ID || null;
        const staffRoleId = cfg.TICKETS_STAFF_ROLE_ID || null;

        const member = await ch.guild.members
          .fetch(i.user.id)
          .catch(() => null);
        const isOpener = openerId && openerId === i.user.id;
        const canManage = member?.permissions?.has?.(
          PermissionFlagsBits.ManageChannels
        );
        const isOwner = ownerId && i.user.id === ownerId;
        const isStaff = memberHasRole(member, staffRoleId);

        if (!(isOpener || isOwner || canManage || isStaff)) {
          try {
            await i.reply({
              content: "You don't have permission to close this ticket.",
              flags: MessageFlags.Ephemeral,
            });
          } catch {}
          return;
        }

        try {
          await i.reply({
            content: "Closing ticket…",
            flags: MessageFlags.Ephemeral,
          });
        } catch {}

        let transcriptPath = null;
        try {
          const msgs = await fetchAllMessages(ch, 5000);

          const participants = collectParticipants(msgs);
          const openedAt = msgs.length
            ? msgs[0].createdAt?.toISOString() || null
            : null;

          const openerEntry = participants.find((p) => p.id === openerId);
          const openerTag = openerEntry?.tag || "unknown";
          const openerUsername = openerEntry?.username || "unknown";

          const meta = {
            kind: String(ch.name).includes("shop") ? "shop" : "other",
            openerId,
            openerTag,
            closedBy: i.user.id,
            closedByTag: i.user.tag,
            openedAt,
            closedAt: new Date().toISOString(),
          };

          const baseRoot = transcriptsBaseDirFromConfig(cfg);
          const userFolder = path.join(
            baseRoot,
            userFolderName(openerId || "unknown", openerUsername)
          );
          ensureDir(userFolder);

          const prefix = `${ch.id}-${Date.now()}`;

          const localMap = await downloadAllAttachments(
            msgs,
            userFolder,
            prefix
          );

          const html = renderTranscriptHtml(ch, msgs, meta, localMap);
          const fpath = path.join(userFolder, `${prefix}.html`);
          fs.writeFileSync(fpath, html, "utf8");
          transcriptPath = fpath;

          const kind = meta.kind;
          const file =
            kind === "shop"
              ? cfg.TICKETS_SHOP_LOG_PATH || null
              : cfg.TICKETS_OTHER_LOG_PATH || null;
          if (file) {
            appendJsonl(file, {
              ts: new Date().toISOString(),
              type: kind,
              action: "close",
              channelId: ch.id,
              openerId,
              closedBy: i.user.id,
              closedByTag: i.user.tag,
              transcriptPath,
              stats: {
                participants,
                totalMessages: participants.reduce((a, p) => a + p.count, 0),
              },
              closedAt: meta.closedAt,
            });
          }
        } catch {}

        try {
          await ch.delete(`Closed by ${i.user.tag} (${i.user.id})`);
        } catch {}
        return;
      }
    } catch (err) {
      try {
        if (i && !i.replied) {
          await i.reply({
            content: `Ticket action failed: ${String(err?.message || err)}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch {}
      (log || console.log)(
        `❌ Ticket interaction failed: ${err?.message || err}`
      );
    }
  });
}

module.exports = { registerTicketInteractions };
