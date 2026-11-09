@echo off
rem Collect Logs - zips the party mode logs to your Desktop with accounts, passwords, CD keys and proxies removed.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CollectLogs.ps1" %*
pause
