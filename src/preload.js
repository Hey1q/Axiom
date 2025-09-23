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

  onLog: (cb) => on("log", (_e, msg) => cb?.(msg)),
  onStatusChange: (cb) => on("status-change", (_e, status) => cb?.(status)),

  getSessionInfo: () => invoke("get-session-info"),
  login: (credentials) => invoke("login", credentials),
  isOwner: (username) => invoke("is-owner-check", username),
  isDiscordOwner: (discordId) => invoke("check-discord-owner", discordId),

  startDiscordOAuth: () => invoke("start-discord-oauth"),
  onOAuthCode: (cb) => on("oauth-code", (_e, code) => cb?.(code)),

  openExternal: (url) => ipcRenderer.send("open-external-link", url),
  openWindow: (page) => invoke("open-window", page),

  saveOwnerConfig: (config) => invoke("save-owner-config", config),
  getOwnerConfig: () => invoke("get-owner-config"),
  updateOwnerConfig: (config) => invoke("update-owner-config", config),

  receive: (channel, cb) => on(channel, (_e, payload) => cb?.(payload)),

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

  ticketsGet: () => invoke("tickets:get"),
  ticketsSetChannel: (channelId) => invoke("tickets:setChannel", channelId),
  ticketsRemove: () => invoke("tickets:remove"),
  ticketsPublish: (payload) => invoke("tickets:publish", payload),

  ticketsGetStaffRole: () => invoke("tickets:getStaffRole"),
  ticketsSetStaffRole: (roleIdOrNull) =>
    invoke("tickets:setStaffRole", roleIdOrNull),

  ticketsGetCategory: () => invoke("tickets:getCategory"),
  ticketsSetCategory: (categoryIdOrNull) =>
    invoke("tickets:setCategory", categoryIdOrNull),

  ticketsGetPaths: () => invoke("tickets:getPaths"),
  ticketsSetPaths: (paths) => invoke("tickets:setPaths", paths),

  ticketsEnsureDefaultLogs: () => invoke("tickets:ensureDefaultLogs"),
  ticketsReadLogs: (query) => invoke("tickets:readLogs", query),
  ticketsClearLogs: () => invoke("tickets:clearLogs"),
  ticketsOpenLogsFolder: (which) => invoke("tickets:openLogsFolder", which),
  ticketsPurgeChannel: (opts) => invoke("tickets:purge", opts),

  giveawayListChannels: () => invoke("giveaway:listChannels"),
  giveawayChannels: () => invoke("giveaway:channels"),
  giveawayList: () => invoke("giveaway:list"),
  giveawayStart: (payload) => invoke("giveaway:start", payload),
  giveawayEdit: (payload) => invoke("giveaway:edit", payload),
  giveawayEnd: (payload) => invoke("giveaway:end", payload),
  giveawayRemove: (id) => invoke("giveaway:remove", id),
  giveawayReroll: (payload) => invoke("giveaway:reroll", payload),
  giveawayLogStart: (payload) => invoke("giveaway:logStart", payload),
  giveawayGetLogsChannel: () => invoke("giveaway:getLogsChannel"),
  giveawaySetLogsChannel: (id) => invoke("giveaway:setLogsChannel", id),
  giveawayClearLogsChannel: () => invoke("giveaway:clearLogsChannel"),

  eventsGet: () => ipcRenderer.invoke("events:get"),
  eventsSave: (p) => ipcRenderer.invoke("events:save", p),
});
