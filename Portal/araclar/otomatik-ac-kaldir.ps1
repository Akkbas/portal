# Otomatik açılma özelliğini bu bilgisayardan kaldırır.
$kisayol = Join-Path ([Environment]::GetFolderPath("Startup")) "Portal Disk Izleyici.lnk"
Remove-Item $kisayol -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like "*Portal\izleyici.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item (Join-Path $env:LOCALAPPDATA "Portal") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Otomatik açılma kaldırıldı." -ForegroundColor Green
