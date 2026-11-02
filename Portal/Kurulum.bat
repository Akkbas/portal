@echo off
chcp 65001 >nul
title Portal Kurulumu
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0araclar\kurulum.ps1"
if errorlevel 1 (
  echo.
  echo Kurulum sirasinda bir hata oldu. Internet baglantini kontrol edip tekrar dene.
)
pause
