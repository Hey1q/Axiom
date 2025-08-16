const { contextBridge, ipcRenderer } = require("electron");

function on(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => {
    try {
      ipcRenderer.removeListener(channel, handler);
    } catch {}
  };
}

async function invoke(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    console.error(`[preload] invoke(${channel}) failed:`, err);
    throw err;
  }
}

contextBridge.exposeInMainWorld("api", {
  startBot: () => ipcRenderer.send("bot-start"),
  stopBot: () => ipcRenderer.send("bot-stop"),

  onLog: (callback) => on("log", (_e, msg) => callback(msg)),
  onStatusChange: (callback) =>
    on("status-change", (_e, status) => callback(status)),

  getSessionInfo: () => invoke("get-session-info"),

  login: (credentials) => invoke("login", credentials),
  isOwner: (username) => invoke("is-owner-check", username),
  isDiscordOwner: (discordId) => invoke("check-discord-owner", discordId),

  startDiscordOAuth: () => invoke("start-discord-oauth"),
  onOAuthCode: (callback) => on("oauth-code", (_e, code) => callback(code)),

  openExternal: (url) => ipcRenderer.send("open-external-link", url),
  openWindow: (page) => invoke("open-window", page),

  saveOwnerConfig: (config) => invoke("save-owner-config", config),
  getOwnerConfig: () => invoke("get-owner-config"),
  updateOwnerConfig: (config) => invoke("update-owner-config", config),

  submitApplication: (data) => invoke("submit-application", data),

  receive: (channel, callback) => on(channel, (_event, data) => callback(data)),

  isOnline: () => {
    try {
      return navigator.onLine;
    } catch {
      return true;
    }
  },
  onNetworkChange: (onOnline, onOffline) => {
    const onFn = () => onOnline && onOnline();
    const offFn = () => onOffline && onOffline();
    window.addEventListener("online", onFn);
    window.addEventListener("offline", offFn);
    return () => {
      window.removeEventListener("online", onFn);
      window.removeEventListener("offline", offFn);
    };
  },
});
