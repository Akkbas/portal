# Bu bilgisayarda "disk takılınca Portal'ı otomatik aç" özelliğini kurar.
# Küçük bir izleyiciyi %LOCALAPPDATA%\Portal klasörüne kopyalar ve Başlangıç klasörüne ekler.
# Kaldırmak için: otomatik-ac-kaldir.ps1 (veya Portal\Otomatik Acilmayi Kaldir.bat)
$ErrorActionPreference = "Stop"
$hedefDizin = Join-Path $env:LOCALAPPDATA "Portal"
New-Item -ItemType Directory -Force -Path $hedefDizin | Out-Null
$izleyici = Join-Path $hedefDizin "izleyici.ps1"
Copy-Item (Join-Path $PSScriptRoot "izleyici.ps1") $izleyici -Force

$vbs = Join-Path $hedefDizin "izleyici-gizli.vbs"
$satir = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + $izleyici + '""", 0, False'
Set-Content -Path $vbs -Value $satir -Encoding Unicode

$baslangic = [Environment]::GetFolderPath("Startup")
$kisayol = Join-Path $baslangic "Portal Disk Izleyici.lnk"
$ws = New-Object -ComObject WScript.Shell
$k = $ws.CreateShortcut($kisayol)
$k.TargetPath = "wscript.exe"
$k.Arguments = '"' + $vbs + '"'
$k.WindowStyle = 7
$k.Description = "Portal diski takilinca otomatik acar"
$k.Save()

Start-Process wscript.exe -ArgumentList ('"' + $vbs + '"')
Write-Host "Otomatik açılma kuruldu. Diski çıkarıp yeniden taktığında Portal kendiliğinden açılacak." -ForegroundColor Green
