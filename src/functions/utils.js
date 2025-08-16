const path = require("path");
const os = require("os");

function getOwnerConfigPath() {
  return path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "axiom",
    "config",
    "owner-config.json"
  );
}

function getOwnerConfigDir() {
  return path.dirname(getOwnerConfigPath());
}

module.exports = { getOwnerConfigPath, getOwnerConfigDir };
