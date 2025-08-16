const { saveOwnerConfig } = require("../functions/setupHandler");

process.on(
  "message",
  async ({ config, skipInstall = false, cleanInstall = false }) => {
    try {
      await saveOwnerConfig(
        config,
        (log) => {
          try {
            process.send?.({ type: "log", data: log });
          } catch {}
        },
        { skipInstall, cleanInstall }
      );
      try {
        process.send?.({ type: "done" });
      } catch {}
    } catch (err) {
      try {
        process.send?.({ type: "error", error: err.message });
      } catch {}
    }
  }
);
