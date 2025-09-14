const fs = require("node:fs");
const path = require("node:path");
const { getOwnerConfigDir } = require("./utils");

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function storePaths() {
  const base = path.join(getOwnerConfigDir(), "giveaways");
  ensureDir(base);
  const file = path.join(base, "store.json");
  return { base, file };
}

function readFileJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data || "null");
  } catch {
    return null;
  }
}

function writeFileJSONAtomic(file, obj) {
  try {
    ensureDir(path.dirname(file));
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function normalizeItem(x) {
  const o = { ...x };
  o.id = String(o.id || "").trim();
  o.status = (o.status || "active").toLowerCase(); // "active" | "ended"
  if (o.winners != null) {
    const n = parseInt(o.winners, 10);
    o.winners = Number.isFinite(n) && n > 0 ? n : 1;
  } else {
    o.winners = 1;
  }
  if (!o.createdAt) o.createdAt = new Date().toISOString();
  return o;
}

function load() {
  const { file } = storePaths();
  const obj = readFileJSON(file);
  if (!obj || typeof obj !== "object") return { items: [] };
  if (!Array.isArray(obj.items)) obj.items = [];

  const seen = new Set();
  const items = [];
  for (const it of obj.items) {
    const n = normalizeItem(it || {});
    if (!n.id || seen.has(n.id)) continue;
    seen.add(n.id);
    items.push(n);
  }
  return { items };
}

function save(db) {
  const { file } = storePaths();
  const ok = writeFileJSONAtomic(file, {
    items: Array.isArray(db.items) ? db.items : [],
  });
  if (!ok) throw new Error("Failed to write giveaways store.");
  return true;
}

function readAll() {
  return load().items;
}

function get(id) {
  const s = String(id || "").trim();
  if (!s) return null;
  return load().items.find((x) => x.id === s) || null;
}

function upsert(item) {
  const inItem = normalizeItem(item || {});
  if (!inItem.id) throw new Error("giveawayStore.upsert: missing id");

  const db = load();
  const idx = db.items.findIndex((x) => x.id === inItem.id);
  if (idx >= 0) {
    db.items[idx] = { ...db.items[idx], ...inItem };
  } else {
    db.items.push(inItem);
  }
  save(db);
  return inItem;
}

function remove(id) {
  const s = String(id || "").trim();
  if (!s) return false;
  const db = load();
  const before = db.items.length;
  db.items = db.items.filter((x) => x.id !== s);
  save(db);
  return db.items.length < before;
}

function listActive() {
  return readAll().filter((x) => x.status === "active");
}

function listEnded() {
  return readAll().filter((x) => x.status === "ended");
}

function markEnded(id, extra = {}) {
  const gw = get(id);
  if (!gw) return null;
  const ended = {
    ...gw,
    status: "ended",
    endedAt: new Date().toISOString(),
    ...extra,
  };
  return upsert(ended);
}

function findByMessageId(messageId) {
  const s = String(messageId || "").trim();
  if (!s) return null;
  return readAll().find((x) => x.messageId === s) || null;
}

module.exports = {
  load,
  save,
  readAll,
  get,
  upsert,
  remove,
  listActive,
  listEnded,
  markEnded,
  findByMessageId,
};
