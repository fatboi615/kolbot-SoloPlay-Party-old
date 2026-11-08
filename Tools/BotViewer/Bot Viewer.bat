@echo off
rem Bot Viewer - live pictures of every Diablo II window in one grid.
start "" powershell -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0BotViewer.ps1"
