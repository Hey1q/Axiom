const fs = require("node:fs");
const path = require("node:path");
const { getOwnerConfigDir } = require("./utils");

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeId(id) {
  return (
    String(id ?? "")
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function safeWriteFile(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

function getGiveawayLogsDir() {
  const base = getOwnerConfigDir();
  const dir = path.join(base, "giveaways");
  ensureDir(dir);
  return dir;
}

function fileNameFor(id, d = new Date()) {
  const sid = sanitizeId(id);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_giveaway_${sid}.html`;
}

function getLogPath(giveawayId) {
  return path.join(getGiveawayLogsDir(), fileNameFor(giveawayId));
}

function initialHtml(title) {
  const t = escapeHtml(title || "Giveaway");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Giveaway Log - ${t}</title>
<style>
:root{--bg:#0b1220;--panel:#121a2b;--muted:#94a3b8;--fg:#e5e7eb;--acc:#38bdf8;--acc2:#f472b6;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0b1220;color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
header{padding:26px 22px 8px}
h1{margin:0 0 6px;font-size:22px;color:var(--acc);letter-spacing:.3px}
h2{margin:0;font-weight:600;color:var(--acc2)}
.meta{color:var(--muted);margin-top:6px}
main{max-width:980px;margin:18px auto 40px;padding:0 18px 18px}
.entry{background:linear-gradient(180deg,#0f172a 0%,var(--panel)100%);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px 16px;margin:12px 0;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.entry .row{display:flex;gap:12px;align-items:baseline;margin-bottom:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:rgba(56,189,248,.12);color:var(--acc);border:1px solid rgba(56,189,248,.35)}
.entry.start .badge{color:var(--ok);border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.08)}
.entry.update .badge{color:var(--warn);border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.08)}
.entry.end .badge{color:var(--err);border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.08)}
time{color:var(--muted);font-size:12px}
.kv span{display:inline-block;margin-right:10px}
details{margin-top:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:8px 10px;border-radius:10px}
pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0}
footer{max-width:980px;margin:0 auto 40px;color:var(--muted);padding:0 18px}
</style>
</head>
<body>
<header>
  <h1>🎁 Giveaway Log</h1>
  <h2 id="gTitle">${t}</h2>
  <p class="meta" id="gMeta"></p>
</header>
<main id="entries"></main>
<footer><small>Axiom • HTML log</small></footer>
</body>
</html>`;
}

function ensureLogFile(fp, title) {
  if (!fs.existsSync(fp)) {
    ensureDir(path.dirname(fp));
    safeWriteFile(fp, initialHtml(title));
  }
}

function createLogFile(giveawayId, meta = {}) {
  const fp = getLogPath(giveawayId);
  ensureLogFile(fp, meta.title || `Giveaway #${sanitizeId(giveawayId)}`);
  if (meta && Object.keys(meta).length) {
    appendEntry(giveawayId, "start", { text: "Giveaway started", meta });
  }
  return fp;
}

function appendEntry(giveawayId, kind, payload = {}) {
  const fp = getLogPath(giveawayId);
  ensureLogFile(fp, `Giveaway #${sanitizeId(giveawayId)}`);

  let html = fs.readFileSync(fp, "utf8");

  const ts = new Date().toISOString();
  const kindLabel = String(kind || "info").toUpperCase();
  const pieces = [];

  if (payload.text) pieces.push(escapeHtml(payload.text));

  if (payload.meta && typeof payload.meta === "object") {
    const kv = [];
    for (const [k, v] of Object.entries(payload.meta)) {
      kv.push(`<span><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</span>`);
    }
    if (kv.length) pieces.push(`<div class="kv">${kv.join(" ")}</div>`);
  }

  if (payload.embed) {
    pieces.push(
      `<details><summary>Embed</summary><pre>${escapeHtml(
        JSON.stringify(payload.embed, null, 2)
      )}</pre></details>`
    );
  }

  if (Array.isArray(payload.winners) && payload.winners.length) {
    const w = payload.winners.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    pieces.push(`<div><b>Winners:</b><ul>${w}</ul></div>`);
  }

  const block = `
<article class="entry ${escapeHtml(kind)}">
  <div class="row">
    <span class="badge">${kindLabel}</span>
    <time>${ts}</time>
  </div>
  ${pieces.join("\n  ")}
</article>`.trim();

  if (/<\/main>\s*<footer>/i.test(html)) {
    html = html.replace(/<\/main>\s*<footer>/i, `${block}\n</main>\n<footer>`);
  } else if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${block}\n</body>`);
  } else {
    html += `\n${block}\n`;
  }

  if (payload.meta && /id="gMeta"><\/p>/.test(html)) {
    const arr = [];
    for (const [k, v] of Object.entries(payload.meta)) {
      arr.push(`${escapeHtml(k)}: ${escapeHtml(v)}`);
    }
    html = html.replace(
      /<p class="meta" id="gMeta"><\/p>/,
      `<p class="meta" id="gMeta">${arr.join(" • ")}</p>`
    );
  }

  safeWriteFile(fp, html);
  return fp;
}

function finalizeLog(giveawayId, winners = [], endedBy = null) {
  return appendEntry(giveawayId, "end", {
    text: "Giveaway ended",
    winners,
    meta: endedBy ? { endedBy } : undefined,
  });
}

module.exports = {
  getGiveawayLogsDir,
  getLogPath,
  createLogFile,
  appendEntry,
  finalizeLog,
};
