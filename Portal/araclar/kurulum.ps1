# Portal kurulumu — yalnızca BİR KEZ, internet varken çalıştırılır.
# Python'u ve gerekli kütüphaneleri diskin içine (Portal\python, Portal\kutuphaneler) kurar.
# Bilgisayara hiçbir şey yüklenmez; diskteki dosyalarına dokunulmaz.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Portal = Split-Path -Parent $PSScriptRoot
$Kok = Split-Path -Parent $Portal
$PyDir = Join-Path $Portal "python"
$Kutup = Join-Path $Portal "kutuphaneler"
$Gecici = Join-Path $Portal "veri\indirilenler"
$PyVer = "3.12.10"
$PyUrl = "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip"

function Baslik($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }

Write-Host "PORTAL KURULUMU" -ForegroundColor Yellow
Write-Host "Disk: $Kok"
New-Item -ItemType Directory -Force -Path $Gecici, $Kutup | Out-Null

# 1) Python (taşınabilir sürüm)
if (-not (Test-Path (Join-Path $PyDir "pythonw.exe"))) {
    Baslik "Taşınabilir Python $PyVer indiriliyor (~11 MB)"
    $zip = Join-Path $Gecici "python.zip"
    Invoke-WebRequest -Uri $PyUrl -OutFile $zip -UseBasicParsing
    New-Item -ItemType Directory -Force -Path $PyDir | Out-Null
    Expand-Archive -Path $zip -DestinationPath $PyDir -Force
    $pth = Get-ChildItem $PyDir -Filter "python*._pth" | Select-Object -First 1
    $zipAdi = (Get-ChildItem $PyDir -Filter "python3*.zip" | Select-Object -First 1).Name
    Set-Content -Path $pth.FullName -Encoding ASCII -Value @($zipAdi, ".", "..\kutuphaneler", "..\sunucu", "import site")
} else {
    Baslik "Python zaten kurulu"
}

# 2) Kütüphaneler (PyPI'den, SHA-256 doğrulamalı)
Baslik "Kütüphaneler indiriliyor (Vikipedi okuyucu, görüntü, video araçları ~170 MB)"
$liste = Get-Content (Join-Path $PSScriptRoot "paketler.txt") | Where-Object { $_.Trim() -ne "" }
$i = 0
foreach ($satir in $liste) {
    $i++
    $parca = $satir.Split(" ")
    $url = $parca[0]; $hash = $parca[1]
    $ad = Split-Path $url -Leaf
    $hedef = Join-Path $Gecici ($ad + ".zip")
    $isaret = Join-Path $Kutup (".kuruldu-" + $ad)
    if (Test-Path $isaret) { Write-Host "  [$i/$($liste.Count)] $ad (kurulu)"; continue }
    Write-Host "  [$i/$($liste.Count)] $ad"
    Invoke-WebRequest -Uri $url -OutFile $hedef -UseBasicParsing
    $h = (Get-FileHash $hedef -Algorithm SHA256).Hash.ToLower()
    if ($h -ne $hash) { throw "Doğrulama başarısız: $ad (dosya bozuk indirildi, kurulumu tekrar çalıştır)" }
    Expand-Archive -Path $hedef -DestinationPath $Kutup -Force
    Remove-Item $hedef -Force
    New-Item -ItemType File -Force -Path $isaret | Out-Null
}
Remove-Item $Gecici -Recurse -Force -ErrorAction SilentlyContinue

# 3) İçerik klasörleri (yoksa oluştur; varsa dokunma)
Baslik "İçerik klasörleri kontrol ediliyor"
foreach ($k in @("Videolar", "Fotoğraflar", "Müzik", "Belgeler", "Vikipedi")) {
    $p = Join-Path $Kok $k
    $alternatif = @{ "Fotoğraflar" = "Fotograflar"; "Müzik" = "Muzik" }[$k]
    if ((Test-Path $p) -or ($alternatif -and (Test-Path (Join-Path $Kok $alternatif)))) { Write-Host "  $k  (var)"; continue }
    New-Item -ItemType Directory -Path $p | Out-Null
    Write-Host "  $k  (oluşturuldu)"
}
$zimler = Get-ChildItem -Path $Kok, (Join-Path $Kok "Vikipedi") -Filter *.zim -ErrorAction SilentlyContinue
if ($zimler) { $zimler | ForEach-Object { Write-Host "  Vikipedi bulundu: $($_.Name)" -ForegroundColor Green } }
else { Write-Host "  Not: .zim dosyanı 'Vikipedi' klasörüne koymayı unutma." -ForegroundColor Yellow }

# 4) Deneme
Baslik "Kurulum test ediliyor"
& (Join-Path $PyDir "python.exe") -c "import flask, waitress, libzim, PIL, bs4, mutagen, pypdfium2, imageio_ffmpeg, sqlite3; print('  Tüm bileşenler hazır.')"
if ($LASTEXITCODE -ne 0) { throw "Bileşen testi başarısız." }

Write-Host ""
Write-Host "KURULUM TAMAMLANDI." -ForegroundColor Green
Write-Host ""
$cevap = Read-Host "Disk bu bilgisayara takılınca Portal OTOMATİK açılsın mı? (E/H)"
if ($cevap -match "^[eEyY]") {
    & (Join-Path $PSScriptRoot "otomatik-ac-kur.ps1")
}
Write-Host ""
Write-Host "Portal açılıyor..."
Start-Process -FilePath (Join-Path $PyDir "pythonw.exe") -ArgumentList ('"' + (Join-Path $Portal "sunucu\app.py") + '"') -WorkingDirectory (Join-Path $Portal "sunucu")
Start-Sleep -Seconds 2
