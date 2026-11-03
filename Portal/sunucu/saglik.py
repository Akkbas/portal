"""Disk sağlığı: Windows'un disk bilgileri + Portal'ın kendi okuma testi.

- Windows'tan: model, bağlantı türü, sağlık durumu ve (izin verirse) sıcaklık,
  çalışma saati, okuma/yazma hataları.
- Okunabilirlik kontrolü: diskteki tüm medya dosyalarını baştan sona okur,
  okunamayanları listeler ve okuma hızını ölçer. Hiçbir dosyaya yazmaz.
"""
import os
import json
import time
import threading
import subprocess

PS_BETIK = r"""
$ErrorActionPreference = 'SilentlyContinue'
$harf = '%s'
$p = Get-Partition -DriveLetter $harf
$d = $p | Get-Disk
$pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq [string]$d.Number }
$r = $null
if ($pd) { $r = $pd | Get-StorageReliabilityCounter }
$v = Get-Volume -DriveLetter $harf
[pscustomobject]@{
  model = $d.FriendlyName; seri = $d.SerialNumber; boyut = $d.Size; baglanti = [string]$d.BusType
  medya = [string]$pd.MediaType; saglik = [string]$pd.HealthStatus; durum = (($pd.OperationalStatus | ForEach-Object { [string]$_ }) -join ', ')
  dosya_sistemi = $v.FileSystem; birim_saglik = [string]$v.HealthStatus
  sicaklik = $r.Temperature; sicaklik_max = $r.TemperatureMax; calisma_saati = $r.PowerOnHours
  okuma_hata = $r.ReadErrorsTotal; okuma_duzeltilemeyen = $r.ReadErrorsUncorrected
  yazma_hata = $r.WriteErrorsTotal; asinma = $r.Wear; acilis_sayisi = $r.StartStopCycleCount
} | ConvertTo-Json -Compress
"""


class DiskSagligi:
    def __init__(self, kok, kutup):
        self.kok = kok
        self.kutup = kutup
        self.onbellek = None
        self.onbellek_zaman = 0
        self.kontrol = {"durum": "hic", "okunan": 0, "toplam": 0, "bayt": 0, "hatalar": [], "hiz": None,
                        "basla": None, "bitis": None}
        self._kontrol_yukle()

    # ---------- Windows disk bilgisi ----------
    def _windows_bilgi(self):
        if os.name != "nt":
            return {"desteklenmiyor": True}
        harf = os.path.splitdrive(self.kok)[0].rstrip(":")
        if not harf:
            return {"desteklenmiyor": True}
        try:
            p = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PS_BETIK % harf],
                               capture_output=True, timeout=40,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            metin = p.stdout.decode("utf-8", "ignore").strip()
            return json.loads(metin) if metin else {"hata": "Windows disk bilgisi vermedi"}
        except Exception as ex:
            return {"hata": str(ex)}

    def durum(self, yenile=False):
        if yenile or not self.onbellek or time.time() - self.onbellek_zaman > 600:
            self.onbellek = self._windows_bilgi()
            self.onbellek_zaman = time.time()
        w = self.onbellek or {}
        uyarilar = []
        s = (w.get("saglik") or "").lower()
        if s in ("warning", "uyarı"):
            uyarilar.append("Windows bu diskin sağlığı için UYARI veriyor. Hemen yedek al.")
        elif s in ("unhealthy", "sağlıksız"):
            uyarilar.append("Windows bu diski SAĞLIKSIZ olarak bildiriyor. Verilerini hemen başka bir diske kopyala.")
        if (w.get("okuma_duzeltilemeyen") or 0) > 0:
            uyarilar.append("Diskte düzeltilemeyen okuma hataları kaydedilmiş. Yedek almayı geciktirme.")
        if (w.get("sicaklik") or 0) >= 55:
            uyarilar.append("Disk sıcaklığı yüksek (%s°C). Havalandırılan bir yere koy." % w.get("sicaklik"))
        hatalar = self.kutup.okuma_hatalari + self.kontrol["hatalar"]
        if hatalar:
            uyarilar.append("%d dosya diskten okunamadı. Bu, diskin yüzeyinde bozulma belirtisi olabilir." % len(hatalar))
        try:
            import shutil
            u = shutil.disk_usage(self.kok)
            alan = {"toplam": u.total, "bos": u.free}
            if u.free / max(u.total, 1) < 0.05:
                uyarilar.append("Diskte %5'ten az boş yer kaldı.")
        except Exception:
            alan = None
        if self.kontrol["durum"] == "hic":
            oneri = "Diskindeki tüm dosyaların okunabildiğini hiç kontrol etmedin."
        elif self.kontrol["bitis"] and time.time() - self.kontrol["bitis"] > 90 * 86400:
            oneri = "Son okunabilirlik kontrolü 3 aydan eski."
        else:
            oneri = None
        return {"windows": w, "alan": alan, "uyarilar": uyarilar, "oneri": oneri,
                "okuma_hatalari": hatalar[-200:], "kontrol": {k: v for k, v in self.kontrol.items() if k != "hatalar"},
                "kontrol_hatalari": self.kontrol["hatalar"][-200:]}

    # ---------- okunabilirlik kontrolü ----------
    def _kontrol_yolu(self):
        return os.path.join(self.kutup.veri, "disk-kontrol.json")

    def _kontrol_yukle(self):
        try:
            with open(self._kontrol_yolu(), encoding="utf-8") as f:
                k = json.load(f)
            if k.get("durum") == "suruyor":
                k["durum"] = "yarida"
            self.kontrol.update(k)
        except Exception:
            pass

    def _kontrol_kaydet(self):
        try:
            with open(self._kontrol_yolu() + ".tmp", "w", encoding="utf-8") as f:
                json.dump(self.kontrol, f, ensure_ascii=False)
            os.replace(self._kontrol_yolu() + ".tmp", self._kontrol_yolu())
        except Exception:
            pass

    def kontrol_baslat(self):
        if self.kontrol["durum"] == "suruyor":
            return
        threading.Thread(target=self._kontrol, daemon=True).start()

    def _kontrol(self):
        k = self.kontrol
        k.update(durum="suruyor", okunan=0, bayt=0, hatalar=[], hiz=None, basla=time.time(), bitis=None)
        yollar = [r[0] for r in self.kutup.db().execute("SELECT yol FROM medya ORDER BY yol")]
        k["toplam"] = len(yollar)
        okuma_sure = 0.0
        for i, y in enumerate(yollar):
            try:
                tam = self.kutup.tam_yol(y)
                t0 = time.time()
                with open(tam, "rb", buffering=0) as f:
                    while True:
                        parca = f.read(4 * 1024 * 1024)
                        if not parca:
                            break
                        k["bayt"] += len(parca)
                okuma_sure += time.time() - t0
            except FileNotFoundError:
                pass
            except OSError as ex:
                k["hatalar"].append({"yol": y, "hata": str(ex), "zaman": time.time()})
            k["okunan"] = i + 1
            if okuma_sure > 0:
                k["hiz"] = k["bayt"] / okuma_sure
            if i % 200 == 0:
                self._kontrol_kaydet()
        k.update(durum="bitti", bitis=time.time())
        self._kontrol_kaydet()
