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
  onStatusChange: (cb) => on("status-change", (_e, status) => cb(status)),

  getSessionInfo: () => invoke("get-session-info"),
  login: (credentials) => invoke("login", credentials),
  isOwner: (username) => invoke("is-owner-check", username),
  isDiscordOwner: (discordId) => invoke("check-discord-owner", discordId),

  startDiscordOAuth: () => invoke("start-discord-oauth"),
  onOAuthCode: (cb) => on("oauth-code", (_e, code) => cb(code)),

  openExternal: (url) => ipcRenderer.send("open-external-link", url),
  openWindow: (page) => invoke("open-window", page),

  saveOwnerConfig: (config) => invoke("save-owner-config", config),
  getOwnerConfig: () => invoke("get-owner-config"),
  updateOwnerConfig: (config) => invoke("update-owner-config", config),

  receive: (channel, cb) => on(channel, (_e, payload) => cb(payload)),

  isOnline: () => {
    try {
      return navigator.onLine;
    } catch {
      return true;
    }
  },
  onNetworkChange: (onOnline, onOffline) => {
    const a = () => onOnline && onOnline();
    const b = () => onOffline && onOffline();
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    return () => {
      window.removeEventListener("online", a);
      window.removeEventListener("offline", b);
    };
  },

  getEmbedTargets: () => invoke("embed:list"),
  sendEmbed: (payload) => invoke("embed:send", payload),

  getVerifyState: () => invoke("verify:getState"),
  publishVerify: (payload) => invoke("verify:publish", payload),
  removeVerify: () => invoke("verify:remove"),

  wlGet: () => invoke("wl:get"),
  wlSetJoinChannel: (id) => invoke("wl:setJoinChannel", id),
  wlSetLeaveChannel: (id) => invoke("wl:setLeaveChannel", id),
  wlPublishAll: (payload) => invoke("wl:publishAll", payload),
  wlRemoveAll: () => invoke("wl:removeAll"),

  listRoles: () => invoke("roles:list"),
  getVerifyRole: () => invoke("verify:getRole"),
  setVerifyRole: (roleId) => invoke("verify:setRole", roleId),

  onLog: (cb) => ipcRenderer.on("log", (_e, m) => cb(m)),
  onStatusChange: (cb) => ipcRenderer.on("status-change", (_e, s) => cb(s)),
});
