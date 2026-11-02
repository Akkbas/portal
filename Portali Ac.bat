@echo off
chcp 65001 >nul
rem Portal'i baslatir. Ilk seferde kurulum yapar.
set "P=%~dp0Portal"
if not exist "%P%\python\pythonw.exe" (
  echo Portal henuz kurulmamis. Kurulum basliyor - internet baglantisi gerekir, bir kez yapilir.
  call "%P%\Kurulum.bat"
  exit /b
)
start "" "%P%\python\pythonw.exe" "%P%\sunucu\app.py"
