const DISCORD_EPOCH_MS = 1420070400000n;

function _toBigInt(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return BigInt(String(v).trim());
}

function isSnowflake(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{17,20}$/.test(s)) return false;
  try {
    const id = _toBigInt(s);
    const timestampMs = (id >> 22n) + DISCORD_EPOCH_MS;
    const now = BigInt(Date.now());
    const max = now + 24n * 60n * 60n * 1000n;
    return timestampMs >= DISCORD_EPOCH_MS && timestampMs <= max;
  } catch {
    return false;
  }
}

function assertSnowflake(value, label = "Discord ID") {
  const s = String(value ?? "").trim();
  if (s === "") return;
  if (!/^\d+$/.test(s))
    throw new Error(`${label} must be numeric (17–20 digits).`);
  if (s.length < 17)
    throw new Error(`${label} is too short; expected 17–20 digits.`);
  if (s.length > 20)
    throw new Error(`${label} is too long; expected 17–20 digits.`);
  if (!isSnowflake(s))
    throw new Error(`${label} is not a valid Discord snowflake.`);
}

function snowflakeToDate(value) {
  const id = _toBigInt(value);
  const timestampMs = (id >> 22n) + DISCORD_EPOCH_MS;
  return new Date(Number(timestampMs));
}

module.exports = {
  DISCORD_EPOCH_MS,
  isSnowflake,
  assertSnowflake,
  snowflakeToDate,
};
