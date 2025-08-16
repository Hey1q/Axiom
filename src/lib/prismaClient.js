const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const configPath = path.resolve(__dirname, "../../config/owner-config.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to parse owner-config.json:", err.message);
    return null;
  }

  return config;
}

async function getPrismaClient() {
  const config = loadConfig();

  if (!config || !config.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL not set. PrismaClient is disabled.");
    return null;
  }

  // Αν δεν υπάρχει .prisma/client, κάνε generate
  const clientPath = path.resolve(
    __dirname,
    "../../node_modules/.prisma/client"
  );
  if (!fs.existsSync(clientPath)) {
    console.log("⚙️ Generating Prisma client...");
    try {
      execSync("npx prisma generate", { stdio: "inherit" });
      console.log("✅ Prisma client generated.");
    } catch (err) {
      console.error("❌ Prisma generate failed:", err.message);
      return null;
    }
  }

  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient({
    datasources: {
      db: { url: config.DATABASE_URL },
    },
  });
}

module.exports = { getPrismaClient };

/*const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const configPath = path.resolve(__dirname, "../../config/owner-config.json");

if (!fs.existsSync(configPath)) {
  throw new Error("❌ Config file not found: config/owner-config.json");
}

const configRaw = fs.readFileSync(configPath, "utf-8");
let config;

try {
  config = JSON.parse(configRaw);
} catch (err) {
  throw new Error("❌ Failed to parse owner-config.json: " + err.message);
}

if (!config.DATABASE_URL || typeof config.DATABASE_URL !== "string") {
  throw new Error("❌ DATABASE_URL is missing or invalid in owner-config.json");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
});

module.exports = prisma;

*/
