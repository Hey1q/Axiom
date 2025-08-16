!macro customUnInstall
  DetailPrint "🧹 Uninstalling Axiom and cleaning app data..."

  ; Ανάκτηση του $APPDATA context (βεβαιότητα στη διαγραφή)
  SetShellVarContext current

  ; Διαγραφή registry key
  DeleteRegKey HKCU "Software\\Axiom"

  ; Μικρό delay για να κλείσουν background διεργασίες
  Sleep 1000

  ; Εμφάνιση μηνύματος για το path που πρόκειται να διαγράψει
  DetailPrint "🗑️ Attempting to remove: $APPDATA\\axiom"

  ; Προσπάθεια τερματισμού του Axiom αν τρέχει
  nsExec::ExecToLog 'taskkill /F /IM axiom.exe'

  Sleep 1000

  ; Διαγραφή config φακέλου
  RMDir /r "$APPDATA\\axiom"

  DetailPrint "✅ AppData cleanup complete."
!macroend
