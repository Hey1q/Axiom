function flattenDiscordErrors(node, path = []) {
  const out = [];
  if (!node || typeof node !== "object") return out;

  if (Array.isArray(node._errors)) {
    for (const e of node._errors) {
      out.push({
        path: path.join("."),
        code: e?.code || "UNKNOWN",
        message: e?.message || "Invalid value",
      });
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "_errors") continue;
    out.push(...flattenDiscordErrors(v, path.concat(k)));
  }
  return out;
}

function guessFieldFriendly(path) {
  const p = path.replace(/\.\d+/g, (n) => `[${n.slice(1)}]`);
  if (p.includes("embeds[0].description")) return "Embed description";
  if (p.includes("embeds[0].title")) return "Embed title";
  if (p.includes("components")) return "Components (buttons/selects)";
  if (p.includes("content")) return "Message content";
  if (p.includes("channel_id")) return "Channel ID";
  return p;
}

function mapDiscordError(err) {
  const code = Number(err?.code);
  switch (code) {
    case 50013:
      return "Missing Permissions: ensure the bot can View Channel, Send Messages, Embed Links — and for Accept: Manage Roles + Kick Members. Also put the bot’s role above the verification role.";
    case 50001:
      return "Missing Access: the bot cannot see this channel. Check channel permissions/visibility or that the ID belongs to this server.";
    case 10003:
      return "Unknown Channel: channel ID not found. Right-click the channel in Discord → Copy ID, and try again.";
    case 50035:
      break;
  }

  const raw = err?.rawError || err?.data || err;
  const topMessage = String(raw?.message || err?.message || "").trim();

  const nested = raw?.errors;
  if (nested && typeof nested === "object") {
    const flat = flattenDiscordErrors(nested);
    if (flat.length) {
      const f = flat[0];
      const field = guessFieldFriendly(f.path);
      if (f.code === "BASE_TYPE_REQUIRED")
        return `${field} is required. Please fill the field and try again.`;
      if (f.code === "STRING_TYPE_MAX")
        return `${field} is too long. Try a shorter text.`;
      if (f.code === "STRING_TYPE_MIN") return `${field} is too short.`;
      if (f.code === "NUMBER_TYPE_MAX") return `${field} is too large.`;
      return `${field}: ${f.message || "Invalid value"}`;
    }
  }

  const msg = topMessage.toLowerCase();
  if (msg.includes("invalid form body") && msg.includes("embeds"))
    return "Embed validation failed. Make sure title/description are plain text and not empty.";
  if (
    msg.includes("channel not found") ||
    msg.includes("not text/announcement")
  )
    return "Channel not found or not a Text/Announcement channel. Use a valid text channel ID.";

  return topMessage && !/^error:?$/i.test(topMessage)
    ? topMessage
    : "Operation failed. Please check IDs, permissions and form fields.";
}

module.exports = { mapDiscordError };
