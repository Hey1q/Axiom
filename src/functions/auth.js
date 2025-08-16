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

  onLog: (cb) => on("log", (_e, msg) => cb(msg)),
  onStatusChange: (cb) => on("status-change", (_e, s) => cb(s)),

  getSessionInfo: () => invoke("get-session-info"),

  startDiscordOAuth: () => invoke("start-discord-oauth"),
  onOAuthCode: (cb) => on("oauth-code", (_e, code) => cb(code)),

  openExternal: (url) => ipcRenderer.send("open-external-link", url),
  openWindow: (page) => invoke("open-window", page),

  saveOwnerConfig: (config) => invoke("save-owner-config", config),
  getOwnerConfig: () => invoke("get-owner-config"),
  updateOwnerConfig: (config) => invoke("update-owner-config", config),

  submitApplication: (data) => invoke("submit-application", data),

  receive: (channel, cb) => on(channel, (_e, data) => cb(data)),

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
