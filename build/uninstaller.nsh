!macro customUnInstall
  DetailPrint "🧹 Uninstalling Axiom and cleaning app data..."

  SetShellVarContext current

  DeleteRegKey HKCU "Software\\Axiom"

  Sleep 1000

  DetailPrint "🗑️ Attempting to remove: $APPDATA\\axiom"

  nsExec::ExecToLog 'taskkill /F /IM axiom.exe'

  Sleep 1000

  RMDir /r "$APPDATA\\axiom"

  DetailPrint "✅ AppData cleanup complete."
!macroend
