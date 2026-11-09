COLLECT LOGS - for SoloPlay party mode bug reports

1. Unzip this anywhere (your Desktop is fine).
2. Double-click "Collect Logs.bat".
   - If it is not inside your bot folder it asks you to pick it: choose the folder with
     D2BotNG.exe (or D2Bot.exe), or its d2bs\kolbot folder.
3. A zip called PartyMode-Logs-<date>.zip appears on your Desktop. Send that zip.

What is in it (last 2 days): every bot log (d2bs\logs), ScriptErrorLog.txt, chicken logs,
the party state files, level/script history, PartySettings.js, the manager logs and an info.txt
with versions and profile names.

What is taken OUT of every file first: account names, passwords, CD keys, proxy logins,
game passwords, IP addresses and your Windows user / computer name.
Character names stay in (the logs are useless without them) - look the zip over before
posting it somewhere public.

More days:  powershell -ExecutionPolicy Bypass -File CollectLogs.ps1 -Days 5
Pick the folder yourself:  ... -File CollectLogs.ps1 -Folder "C:\path\to\D2BotNG"
