@echo off
rem Arrange Bots - switch Diablo II to 640x480 and keep every game window lined up on screen.
rem Close the "Arrange Bots" window to stop it.
start "Arrange Bots" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ArrangeBots.ps1" -Resolution 640
