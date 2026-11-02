# Portal disk izleyicisi — Windows açılışında görünmez çalışır.
# İçinde "Portal\portal.kimlik" olan bir disk takıldığında Portal'ı başlatır.
# Hiçbir dosyaya yazmaz; sadece takılan diskleri kontrol eder.
$mutex = New-Object System.Threading.Mutex($false, "Global\PortalDiskIzleyici")
if (-not $mutex.WaitOne(0)) { exit }   # zaten çalışıyor

$gorulen = @{}
$ilkTur = $true
while ($true) {
    $simdi = @{}
    foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
        try {
            if ($d.DriveType -ne "Removable" -and $d.DriveType -ne "Fixed") { continue }
            if (-not $d.IsReady) { continue }
            $kok = $d.RootDirectory.FullName
            if (-not (Test-Path -LiteralPath (Join-Path $kok "Portal\portal.kimlik"))) { continue }
            $simdi[$kok] = $true
            if (-not $gorulen.ContainsKey($kok) -and -not $ilkTur) {
                $py = Join-Path $kok "Portal\python\pythonw.exe"
                $app = Join-Path $kok "Portal\sunucu\app.py"
                if (Test-Path -LiteralPath $py) {
                    Start-Process -FilePath $py -ArgumentList ('"' + $app + '"') -WorkingDirectory (Join-Path $kok "Portal\sunucu")
                } else {
                    Start-Process -FilePath (Join-Path $kok "Portal\Kurulum.bat")
                }
            }
        } catch { }
    }
    $gorulen = $simdi
    $ilkTur = $false   # bilgisayar açılırken zaten takılı olan diskler için açılmaz
    Start-Sleep -Seconds 3
}
