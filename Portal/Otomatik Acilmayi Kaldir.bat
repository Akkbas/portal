@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0araclar\otomatik-ac-kaldir.ps1"
pause
