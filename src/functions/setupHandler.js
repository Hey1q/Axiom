const fs = require("fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { getOwnerConfigPath, getOwnerConfigDir } = require("./utils");

const appRoot = path.resolve(__dirname, "..", "..");
const schemaPath = path.join(appRoot, "prisma", "schema.prisma");

const configDir = getOwnerConfigDir();
const configPath = getOwnerConfigPath();

function isPackagedBuild() {
  const d = __dirname.toLowerCase();
  return d.includes("app.asar") || d.includes("\\program files\\");
}

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function sanitizeDatabaseUrl(url) {
  if (typeof url !== "string") return "";
  return url
    .trim()
    .replace(/^DATABASE_URL=/i, "")
    .replace(/^"(.*)"$/, "$1");
}

function logWrap(log, msg) {
  (log || console.log)(msg);
}

function removeIfExists(p, log) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      logWrap(log, `🧹 Removed: ${p}`);
    }
  } catch (err) {
    logWrap(log, `⚠️ Failed to remove ${p}: ${err.message}`);
  }
}

function updateSchemaPrismaDatabaseUrl(dbUrl, log) {
  if (!fs.existsSync(schemaPath)) {
    logWrap(log, `⚠️ schema.prisma not found at: ${schemaPath}`);
    return;
  }
  try {
    let content = fs.readFileSync(schemaPath, "utf8");
    if (/url\s*=\s*".*?"/.test(content)) {
      content = content.replace(/url\s*=\s*".*?"/, `url = "${dbUrl}"`);
      fs.writeFileSync(schemaPath, content, "utf8");
      logWrap(log, "🔁 schema.prisma updated with DATABASE_URL.");
    } else {
      logWrap(
        log,
        'ℹ️ Did not find `url = "..."` in schema.prisma (left unchanged).'
      );
    }
  } catch (err) {
    logWrap(log, "❌ Failed to update schema.prisma: " + err.message);
  }
}

function runCommand(command, args, log, title, options = {}) {
  return new Promise((resolve, reject) => {
    logWrap(log, `🔧 Starting ${title}...`);
    const proc = spawn(command, args, {
      shell: true,
      cwd: options.cwd || appRoot,
      env: {
        ...process.env,
        npm_config_fund: "false",
        npm_config_audit: "false",
        ...(options.env || {}),
      },
    });
    proc.stdout.on("data", (d) => logWrap(log, d.toString().trim()));
    proc.stderr.on("data", (d) =>
      logWrap(log, ("stderr: " + d).toString().trim())
    );
    proc.on("close", (code) =>
      code === 0
        ? (logWrap(log, `✅ ${title} completed.`), resolve())
        : (logWrap(log, `❌ ${title} failed with exit code ${code}`),
          reject(new Error(`${title} failed with exit code ${code}`)))
    );
    proc.on("error", (err) => {
      logWrap(log, `❌ ${title} crashed: ${err.message}`);
      reject(err);
    });
  });
}

function isValidConfig(c) {
  return (
    c?.DISCORD_CLIENT_ID &&
    c?.DISCORD_CLIENT_SECRET &&
    c?.DISCORD_BOT_TOKEN &&
    c?.DISCORD_REDIRECT_URI &&
    c?.OWNER_DISCORD_ID &&
    c?.GUILD_ID &&
    c?.DATABASE_URL &&
    c?.GUILD_INVITE_URL
  );
}

async function saveOwnerConfig(
  {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_BOT_TOKEN,
    DISCORD_REDIRECT_URI,
    OWNER_DISCORD_ID,
    GUILD_ID,
    DATABASE_URL,
    GUILD_INVITE_URL,
  },
  log = console.log
) {
  const cleanedUrl = sanitizeDatabaseUrl(DATABASE_URL);

  const config = {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_BOT_TOKEN,
    DISCORD_REDIRECT_URI,
    OWNER_DISCORD_ID,
    GUILD_ID,
    DATABASE_URL: cleanedUrl,
    GUILD_INVITE_URL,
  };

  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    logWrap(log, `💾 Config file saved at: ${configPath}`);
  } catch (err) {
    logWrap(log, "❌ Failed to write config file: " + err.message);
    throw err;
  }

  if (!isPackagedBuild()) {
    if (
      fs.existsSync(path.join(appRoot, "prisma")) &&
      fs.existsSync(schemaPath)
    ) {
      updateSchemaPrismaDatabaseUrl(cleanedUrl, log);
    } else {
      logWrap(
        log,
        "ℹ️ prisma/schema.prisma not found; skipping schema update (dev)."
      );
    }

    const nodeModulesPath = path.join(appRoot, "node_modules");
    const packageLockPath = path.join(appRoot, "package-lock.json");
    removeIfExists(nodeModulesPath, log);
    if (process.env.AXIOM_DELETE_LOCK === "1")
      removeIfExists(packageLockPath, log);

    try {
      if (fs.existsSync(packageLockPath)) {
        await runCommand(
          npmBin(),
          ["ci"],
          log,
          "Installing dependencies (npm ci)"
        );
      } else {
        await runCommand(
          npmBin(),
          ["install"],
          log,
          "Installing dependencies (npm install)"
        );
      }
    } catch {
      throw new Error("npm install failed.");
    }

    try {
      await runCommand(
        npxBin(),
        ["prisma", "generate"],
        log,
        "Prisma generate"
      );
    } catch {
      throw new Error("Prisma generate failed.");
    }

    logWrap(log, "✅ Setup complete (dev).");
    return true;
  }

  logWrap(
    log,
    "ℹ️ Running from installed build; skipping npm install / prisma generate / schema edits."
  );
  logWrap(
    log,
    "✅ Config saved. The Prisma client must be generated during the build (electron-builder)."
  );
  return true;
}

function configExists() {
  return fs.existsSync(configPath);
}
function loadConfig() {
  if (!configExists()) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("❌ Failed to read owner-config.json:", e.message);
    return null;
  }
}

module.exports = {
  saveOwnerConfig,
  configExists,
  loadConfig,
  isValidConfig,
  __paths: { appRoot, schemaPath, configPath },
};
