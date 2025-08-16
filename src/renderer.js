window.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const appendLog = (el, msg) => {
    if (!el) return;
    el.value += (msg ?? "") + "\n";
    el.scrollTop = el.scrollHeight;
  };

  const hasApi = typeof window.api !== "undefined" && window.api !== null;
  const hasElectron =
    typeof window.electron !== "undefined" && window.electron !== null;

  const logArea = $("log");
  const statusLabel = $("status-label");
  const appArea = $("app");
  const startBtn = $("start-bot");
  const stopBtn = $("stop-bot");
  const setupOutput = $("setup-output");

  if (hasApi && typeof window.api.onLog === "function") {
    window.api.onLog((message) => appendLog(logArea, message));
  }

  if (hasApi && typeof window.api.onStatusChange === "function") {
    window.api.onStatusChange((status) => {
      if (statusLabel) statusLabel.textContent = status;
    });
  }

  const handleSetupLog = (log) => appendLog(setupOutput, log);
  if (hasApi && typeof window.api.receive === "function") {
    window.api.receive("setup-log", handleSetupLog);
  }
  if (hasElectron && typeof window.electron.receive === "function") {
    window.electron.receive("install-log", handleSetupLog);
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (hasApi && typeof window.api.startBot === "function") {
        window.api.startBot();
      } else {
        appendLog(logArea, "⚠️ startBot not available in this build.");
      }
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (hasApi && typeof window.api.stopBot === "function") {
        window.api.stopBot();
      } else {
        appendLog(logArea, "⚠️ stopBot not available in this build.");
      }
    });
  }

  if (appArea && getComputedStyle(appArea).display === "none") {
    appArea.style.display = "block";
  }
});
