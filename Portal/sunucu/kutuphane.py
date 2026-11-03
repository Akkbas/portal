"""Diskteki medya dosyalarını tarayan, indeksleyen ve küçük resim üreten katman.

GÜVENLİK: Kullanıcı dosyaları SADECE OKUNUR. Bu modül yalnızca
Portal/veri klasörüne (veritabanı ve küçük resim önbelleği) yazar.
"""
import os
import re
import time
import json
import random
import sqlite3
import hashlib
import threading
import subprocess

# iPhone fotoğrafları (HEIC/HEIF) için: pillow-heif kuruluysa Pillow bu biçimleri açabilir
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_VAR = True
except Exception:
    HEIF_VAR = False

UZANTILAR = {
    "video": {".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".wmv", ".flv", ".mpg", ".mpeg", ".ts", ".m2ts", ".3gp", ".ogv"},
    "foto": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif", ".jfif"},
    "muzik": {".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".wma", ".alac"},
    "belge": {".pdf", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
              ".odp", ".rtf", ".csv", ".epub", ".html", ".htm", ".json", ".xml"},
}
# tarayıcının doğrudan gösterebildiği fotoğraf biçimleri; diğerleri (HEIC, TIFF) JPEG'e çevrilerek gösterilir
TARAYICI_FOTO = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".jfif"}
TARAYICI_VIDEO = {".mp4", ".m4v", ".webm", ".mov", ".ogv"}
ATLA = {"portal", "windowsapps", "msocache", "$windows.~ws", "$sysreset", "system volume information", "$recycle.bin", "recycler", ".trash", ".trashes",
        ".spotlight-v100", ".fseventsd", "found.000", "$windows.~bt"}

KUCUK_GENISLIK = 480


def tur_bul(ad):
    u = os.path.splitext(ad)[1].lower()
    for t, s in UZANTILAR.items():
        if u in s:
            return t
    return None


_KATLA = str.maketrans("ıİşŞğĞüÜöÖçÇâÂîÎûÛ", "iisSgGuUoOcCaAiIuU")


def dosya_degistir(gecici, hedef):
    """os.replace; Windows'ta dosya o an başka bir program (antivirüs, dizin oluşturucu)
    tarafından açıksa birkaç kez tekrar dener."""
    for i in range(10):
        try:
            os.replace(gecici, hedef)
            return
        except PermissionError:
            if i == 9:
                raise
            time.sleep(0.2 * (i + 1))


def like_kacis(metin):
    return metin.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def katla(metin):
    """Türkçe karakter ve büyük/küçük harf duyarsız arama için metni sadeleştirir."""
    if metin is None:
        return ""
    return str(metin).translate(_KATLA).lower()


def guzel_ad(dosya_adi):
    ad = os.path.splitext(dosya_adi)[0]
    ad = re.sub(r"[._]+", " ", ad)
    ad = re.sub(r"\s+", " ", ad).strip()
    return ad or dosya_adi


class Kutuphane:
    def __init__(self, kok, veri, ayarlar):
        self.kok = os.path.abspath(kok)
        self.veri = veri
        self.ayarlar = ayarlar
        self.kucuk_dizin = os.path.join(veri, "kucukresim")
        os.makedirs(self.kucuk_dizin, exist_ok=True)
        self.db_yol = os.path.join(veri, "kutuphane.db")
        self.yerel = threading.local()
        self.tarama = {"durum": "bekliyor", "islenen": 0, "bulunan": 0, "son": None}
        self.uretim_kilit = threading.Semaphore(2)
        self.ad_kilit = threading.Lock()
        self.buyuk_kilit = threading.Semaphore(2)   # açılan fotoğraf, küçük resim kuyruğunu beklemez
        self.etk = {"liste": [], "atama": {}}
        # aynı anda en fazla 6 istek küçük resim için bekleyebilir; gerisi "sonra tekrar dene" alır.
        # Böylece sayfa istekleri küçük resim kuyruğunun arkasında kalmaz.
        self.bekleyen = threading.BoundedSemaphore(6)
        self.ffmpeg = self._ffmpeg_bul()
        self.okuma_hatalari = []
        self.hazirlik = {"durum": "bekliyor", "yapilan": 0, "toplam": 0}   # diskten okunamayan dosyalar (disk sağlığı için)
        self._sema()

    # ---------- veritabanı ----------
    def db(self):
        c = getattr(self.yerel, "c", None)
        if c is None:
            c = sqlite3.connect(self.db_yol, timeout=30, check_same_thread=False)
            c.row_factory = sqlite3.Row
            c.create_function("katla", 1, katla, deterministic=True)
            # WAL: tarama yazarken sayfalar okumaya devam edebilsin (kilitlenip beklemesin).
            # Disk aniden çıkarılırsa bozulan indeks açılışta otomatik yenilenir.
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA synchronous=NORMAL")
            c.execute("PRAGMA busy_timeout=30000")
            self.yerel.c = c
        return c

    def _bozuk_db_kurtar(self):
        """İndeks dosyası bozulduysa (ör. disk yazarken çıkarıldıysa) kenara alıp yenisini oluşturur.
        Bu dosya yalnızca Portal'ın kendi indeksidir; kullanıcı dosyalarıyla ilgisi yoktur."""
        c = getattr(self.yerel, "c", None)
        if c is not None:
            try:
                c.close()
            except Exception:
                pass
            self.yerel.c = None
        ek = time.strftime("%Y%m%d-%H%M%S")
        for uz in ("", "-wal", "-shm", "-journal"):
            y = self.db_yol + uz
            if os.path.exists(y):
                try:
                    os.replace(y, y + ".bozuk-" + ek)
                except OSError:
                    try:
                        os.remove(y)
                    except OSError:
                        pass
        # bozuk indeksle birlikte küçük resim önbelleğinin numaraları da geçersizdir
        try:
            for ad in os.listdir(self.kucuk_dizin):
                os.remove(os.path.join(self.kucuk_dizin, ad))
        except OSError:
            pass
        print("Uyarı: indeks dosyası bozuktu, yeniden oluşturuldu.")

    def _sema(self):
        try:
            c = self.db()
            c.execute("PRAGMA quick_check").fetchone()
            self._tablolar(c)
        except sqlite3.DatabaseError:
            self._bozuk_db_kurtar()
            self._tablolar(self.db())

    def _tablolar(self, c):
        c.executescript("""
        CREATE TABLE IF NOT EXISTS medya(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            yol TEXT UNIQUE NOT NULL,
            tur TEXT NOT NULL,
            ad TEXT, klasor TEXT, uzanti TEXT,
            boyut INTEGER, mtime REAL,
            sure REAL, genislik INTEGER, yukseklik INTEGER,
            tarih REAL, sanatci TEXT, album TEXT, baslik TEXT,
            eklenme REAL, gorulme REAL);
        CREATE INDEX IF NOT EXISTS ix_tur ON medya(tur);
        CREATE INDEX IF NOT EXISTS ix_klasor ON medya(tur, klasor);
        CREATE TABLE IF NOT EXISTS izleme(
            id INTEGER PRIMARY KEY, konum REAL, sure REAL, son REAL, sayi INTEGER DEFAULT 0);
        """)
        sutunlar = [r[1] for r in c.execute("PRAGMA table_info(medya)")]
        if "ozel_ad" not in sutunlar:
            c.execute("ALTER TABLE medya ADD COLUMN ozel_ad TEXT")
        # gtur: dosyanın Portal'da görüneceği bölüm. Canlı Fotoğraf videoları (2-3 sn)
        # fotoğraf bölümünde gösterilir ("foto") ya da eşinin içinde saklanır ("gizli").
        # canli: fotoğrafta eşi olan videonun id'si; videoda eşi olan fotoğrafın id'si.
        if "gtur" not in sutunlar:
            c.execute("ALTER TABLE medya ADD COLUMN gtur TEXT")
        if "canli" not in sutunlar:
            c.execute("ALTER TABLE medya ADD COLUMN canli INTEGER")
        c.execute("UPDATE medya SET gtur=tur WHERE gtur IS NULL")
        c.execute("CREATE INDEX IF NOT EXISTS ix_gtur ON medya(gtur)")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS etiket(yol TEXT NOT NULL, ad TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_etiket_ad ON etiket(ad);
        CREATE INDEX IF NOT EXISTS ix_etiket_yol ON etiket(yol);
        """)
        c.commit()
        self._ozel_adlari_uygula()
        self._etiketleri_yukle()
        self._heic_hazirla()
        self.canli_eslestir()

    def canli_eslestir(self):
        """iPhone Canlı Fotoğrafları: aynı klasörde aynı adı taşıyan fotoğraf + kısa video
        (ör. IMG_1234.HEIC + IMG_1234.MOV) tek bir canlı fotoğraf sayılır; video ayrıca
        listelenmez. Eşi bulunamayan çok kısa videolar da fotoğraflar arasında gösterilir.
        Diskteki dosyalara dokunulmaz."""
        sinir = float(self.ayarlar.get("canli_sure", 4.0))
        c = self.db()
        kisa = c.execute("SELECT id, yol, klasor FROM medya WHERE tur='video' AND sure IS NOT NULL AND sure <= ?",
                         (sinir,)).fetchall()
        fotolar = {}
        for r in c.execute("SELECT id, yol, klasor FROM medya WHERE tur='foto'"):
            govde = os.path.splitext(os.path.basename(r["yol"]))[0].lower()
            fotolar[(r["klasor"], govde)] = r["id"]
        foto_es, video_gtur = [], []
        for r in kisa:
            govde = os.path.splitext(os.path.basename(r["yol"]))[0].lower()
            es = fotolar.get((r["klasor"], govde))
            if es:
                foto_es.append((r["id"], es))
                video_gtur.append(("gizli", es, r["id"]))
            else:
                video_gtur.append(("foto", None, r["id"]))

        def yaz(c):
            c.execute("UPDATE medya SET gtur=tur, canli=NULL WHERE canli IS NOT NULL OR gtur<>tur")
            c.executemany("UPDATE medya SET canli=? WHERE id=?", foto_es)
            c.executemany("UPDATE medya SET gtur=?, canli=? WHERE id=?", video_gtur)
        self._kisa_yaz(yaz)
        return {"esli": len(foto_es), "tek": len(video_gtur) - len(foto_es)}

    def _heic_hazirla(self):
        """HEIC desteği sonradan kurulduysa, daha önce "açılamadı" diye işaretlenen
        HEIC fotoğrafların küçük resimlerini ve tarihlerini yeniden dene."""
        isaret = os.path.join(self.veri, "heic-destek")
        if not HEIF_VAR or os.path.exists(isaret):
            return
        c = self.db()
        ids = [r[0] for r in c.execute("SELECT id FROM medya WHERE uzanti IN ('.heic', '.heif')")]
        for mid in ids:
            try:
                os.remove(self._kucuk_yolu(mid) + ".yok")
            except OSError:
                pass
        c.execute("UPDATE medya SET genislik=NULL WHERE uzanti IN ('.heic', '.heif') AND genislik=0")
        c.commit()
        open(isaret, "w").close()

    # ---------- etiketler ----------
    # Etiketler Portal\veri\etiketler.json dosyasında saklanır (dosyalara dokunulmaz).
    # Biçim: {"liste": ["Zara", "Aile"], "atama": {"göreli/yol.mp4": ["Zara"]}}
    def _etiket_yolu(self):
        return os.path.join(self.veri, "etiketler.json")

    def _etiketleri_yukle(self):
        try:
            with open(self._etiket_yolu(), encoding="utf-8") as f:
                d = json.load(f)
            self.etk = {"liste": list(d.get("liste", [])), "atama": dict(d.get("atama", {}))}
        except Exception:
            self.etk = {"liste": [], "atama": {}}
        c = self.db()
        c.execute("DELETE FROM etiket")
        c.executemany("INSERT INTO etiket(yol, ad) VALUES(?, ?)",
                      [(y, e) for y, l in self.etk["atama"].items() for e in l])
        c.commit()

    def _etiket_kaydet(self):
        gecici = self._etiket_yolu() + ".tmp"
        with open(gecici, "w", encoding="utf-8") as f:
            json.dump(self.etk, f, ensure_ascii=False, indent=1)
        dosya_degistir(gecici, self._etiket_yolu())

    def _etiket_bul(self, ad):
        """Aynı etiketin farklı yazımlarını (zara / Zara / ZARA) tek etiket sayar."""
        k = katla(ad)
        return next((e for e in self.etk["liste"] if katla(e) == k), None)

    def _etiket_temiz(self, ad):
        return re.sub(r"\s+", " ", str(ad or "")).strip()[:40]

    def etiket_listesi(self):
        sayilar = {r[0]: r[1] for r in self.db().execute(
            "SELECT e.ad, COUNT(m.id) FROM etiket e JOIN medya m ON m.yol=e.yol GROUP BY e.ad")}
        l = [{"ad": e, "adet": sayilar.get(e, 0)} for e in self.etk["liste"]]
        l.sort(key=lambda o: katla(o["ad"]))
        return l

    def etiket_olustur(self, ad):
        ad = self._etiket_temiz(ad)
        if not ad:
            return None
        with self.ad_kilit:
            var = self._etiket_bul(ad)
            if var:
                return var
            self.etk["liste"].append(ad)
            self._etiket_kaydet()
        return ad

    def etiket_ata(self, mid, etiketler):
        m = self.db().execute("SELECT yol FROM medya WHERE id=?", (mid,)).fetchone()
        if not m:
            return None
        yol = m["yol"]
        with self.ad_kilit:
            temiz = []
            for e in etiketler or []:
                e = self._etiket_temiz(e)
                if not e:
                    continue
                var = self._etiket_bul(e)
                if not var:
                    self.etk["liste"].append(e)
                    var = e
                if var not in temiz:
                    temiz.append(var)
            if temiz:
                self.etk["atama"][yol] = temiz
            else:
                self.etk["atama"].pop(yol, None)
            self._etiket_kaydet()
            c = self.db()
            c.execute("DELETE FROM etiket WHERE yol=?", (yol,))
            c.executemany("INSERT INTO etiket(yol, ad) VALUES(?, ?)", [(yol, e) for e in temiz])
            c.commit()
        return self.al(mid)

    def etiket_yeniden_adlandir(self, eski, yeni):
        yeni = self._etiket_temiz(yeni)
        if not yeni:
            return False
        with self.ad_kilit:
            eski = self._etiket_bul(eski)
            if not eski:
                return False
            hedef = self._etiket_bul(yeni)
            if hedef and hedef != eski:
                yeni = hedef          # var olan bir etiketle birleştir
                self.etk["liste"].remove(eski)
            else:
                self.etk["liste"][self.etk["liste"].index(eski)] = yeni
            for y, l in self.etk["atama"].items():
                if eski in l:
                    l2 = [yeni if e == eski else e for e in l]
                    self.etk["atama"][y] = list(dict.fromkeys(l2))
            self._etiket_kaydet()
        self._etiketleri_yukle()
        return True

    def etiket_sil(self, ad):
        with self.ad_kilit:
            ad = self._etiket_bul(ad)
            if not ad:
                return False
            self.etk["liste"].remove(ad)
            for y in list(self.etk["atama"]):
                l = [e for e in self.etk["atama"][y] if e != ad]
                if l:
                    self.etk["atama"][y] = l
                else:
                    del self.etk["atama"][y]
            self._etiket_kaydet()
        self._etiketleri_yukle()
        return True

    # ---------- çöp kutusu ----------
    # "Sil" dosyayı hemen yok etmez: diskteki Portal\Cop klasörüne taşır (aynı disk, anında).
    # Oradan geri alınabilir; kalıcı silme yalnızca "Çöp kutusunu boşalt" ile olur.
    def _cop_dizin(self):
        return os.path.join(os.path.dirname(self.veri), "Cop")

    def _cop_kayit_yolu(self):
        return os.path.join(self.veri, "cop.json")

    def _cop_oku(self):
        try:
            with open(self._cop_kayit_yolu(), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _cop_yaz(self, liste):
        gecici = self._cop_kayit_yolu() + ".tmp"
        with open(gecici, "w", encoding="utf-8") as f:
            json.dump(liste, f, ensure_ascii=False, indent=1)
        dosya_degistir(gecici, self._cop_kayit_yolu())

    @staticmethod
    def _bos_ad(yol):
        if not os.path.exists(yol):
            return yol
        govde, uz = os.path.splitext(yol)
        i = 2
        while os.path.exists("%s (%d)%s" % (govde, i, uz)):
            i += 1
        return "%s (%d)%s" % (govde, i, uz)

    def sil(self, mid):
        m = self.al(mid)
        if not m:
            return None
        kaynak = self.tam_yol(m["yol"])
        if not os.path.isfile(kaynak):
            return None
        cid = "%d-%d" % (int(time.time() * 1000), mid)
        hedef_kok = os.path.join(self._cop_dizin(), cid)
        tasinan = []
        with self.ad_kilit:
            os.makedirs(hedef_kok, exist_ok=True)
            # videonun yanındaki altyazı dosyaları da birlikte taşınır
            ekler = [kaynak]
            if m["tur"] == "foto" and m.get("canli"):
                es = self.db().execute("SELECT yol FROM medya WHERE id=?", (m["canli"],)).fetchone()
                if es and os.path.isfile(self.tam_yol(es["yol"])):
                    ekler.append(self.tam_yol(es["yol"]))
            if m["tur"] == "video":
                govde = os.path.splitext(kaynak)[0]
                ekler += [govde + u for u in (".srt", ".vtt", ".tr.srt", ".tur.srt") if os.path.isfile(govde + u)]
            for y in ekler:
                h = os.path.join(hedef_kok, os.path.basename(y))
                os.replace(y, h)  # Cop klasörü aynı diskte: taşıma anında olur, veri kopyalanmaz
                tasinan.append({"asil": self.goreli(y), "cop": os.path.relpath(h, self._cop_dizin()).replace("\\", "/")})
            liste = self._cop_oku()
            liste.append({"id": cid, "ad": m["ad"], "tur": m["tur"], "boyut": m["boyut"], "yol": m["yol"],
                          "tarih": time.time(), "dosyalar": tasinan, "ozel_ad": m.get("ozel_ad")})
            self._cop_yaz(liste)
        c = self.db()
        if m["tur"] == "foto" and m.get("canli"):
            c.execute("DELETE FROM medya WHERE id=?", (m["canli"],))
            self._kucuk_sil(m["canli"])
        c.execute("DELETE FROM medya WHERE id=?", (mid,))
        c.execute("DELETE FROM izleme WHERE id=?", (mid,))
        c.commit()
        self._kucuk_sil(mid)
        return {"id": cid, "ad": m["ad"]}

    def cop_liste(self):
        return sorted(self._cop_oku(), key=lambda o: -o["tarih"])

    def geri_al(self, cid):
        with self.ad_kilit:
            liste = self._cop_oku()
            o = next((x for x in liste if x["id"] == cid), None)
            if not o:
                return None
            for d in o["dosyalar"]:
                kaynak = os.path.join(self._cop_dizin(), d["cop"])
                hedef = self._bos_ad(self.tam_yol(d["asil"]))
                os.makedirs(os.path.dirname(hedef), exist_ok=True)
                if os.path.exists(kaynak):
                    os.replace(kaynak, hedef)
            try:
                os.rmdir(os.path.join(self._cop_dizin(), cid))
            except OSError:
                pass
            liste = [x for x in liste if x["id"] != cid]
            self._cop_yaz(liste)
        self.tara_arkaplanda()
        return o

    def cop_bosalt(self, cid=None):
        """Çöp kutusundaki dosyaları KALICI olarak siler (geri alınamaz)."""
        import shutil
        with self.ad_kilit:
            liste = self._cop_oku()
            silinecek = [x for x in liste if cid is None or x["id"] == cid]
            for o in silinecek:
                shutil.rmtree(os.path.join(self._cop_dizin(), o["id"]), ignore_errors=True)
            self._cop_yaz([x for x in liste if x not in silinecek])
        return len(silinecek)

    # ---------- kullanıcının verdiği adlar ----------
    # Dosyaların kendisi yeniden adlandırılmaz. Verilen ad, Portal'ın kendi klasöründe
    # (veri/adlar.json) saklanır; indeks silinse/bozulsa bile kaybolmaz.
    def _adlar_yolu(self):
        return os.path.join(self.veri, "adlar.json")

    def _adlari_oku(self):
        try:
            with open(self._adlar_yolu(), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _ozel_adlari_uygula(self):
        adlar = self._adlari_oku()
        if not adlar:
            return
        c = self.db()
        c.executemany("UPDATE medya SET ozel_ad=? WHERE yol=?", [(v, k) for k, v in adlar.items()])
        c.commit()

    def ad_ver(self, mid, ad):
        m = self.db().execute("SELECT yol FROM medya WHERE id=?", (mid,)).fetchone()
        if not m:
            return None
        ad = (ad or "").strip()[:200] or None
        with self.ad_kilit:
            adlar = self._adlari_oku()
            if ad:
                adlar[m["yol"]] = ad
            else:
                adlar.pop(m["yol"], None)
            gecici = self._adlar_yolu() + ".tmp"
            with open(gecici, "w", encoding="utf-8") as f:
                json.dump(adlar, f, ensure_ascii=False, indent=1)
            dosya_degistir(gecici, self._adlar_yolu())
        c = self.db()
        c.execute("UPDATE medya SET ozel_ad=? WHERE id=?", (ad, mid))
        c.commit()
        return self.al(mid)

    # ---------- yardımcılar ----------
    def _ffmpeg_bul(self):
        aday = os.path.join(os.path.dirname(self.veri), "araclar", "ffmpeg.exe")
        if os.path.exists(aday):
            return aday
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
        from shutil import which
        return which("ffmpeg")

    def tam_yol(self, goreli):
        """Göreli yolu güvenli biçimde mutlak yola çevirir (diskin dışına çıkmayı engeller)."""
        goreli = (goreli or "").replace("\\", "/").lstrip("/")
        tam = os.path.abspath(os.path.join(self.kok, goreli))
        if os.path.commonpath([tam, self.kok]) != self.kok:
            raise PermissionError("Disk dışına erişim engellendi")
        return tam

    def _klasor(self, tam):
        g = self.goreli(tam)
        return "" if g == "." else g

    def goreli(self, tam):
        return os.path.relpath(tam, self.kok).replace("\\", "/")

    def kategori_klasorleri(self, tur):
        """Ayarlardaki ad listesine göre diskin kökündeki kategori klasörlerini bulur."""
        adlar = [a.lower() for a in self.ayarlar["klasorler"].get(tur, [])]
        bulunan = []
        try:
            for ad in os.listdir(self.kok):
                tam = os.path.join(self.kok, ad)
                if os.path.isdir(tam) and ad.lower() in adlar:
                    bulunan.append(tam)
        except OSError:
            pass
        for ek in self.ayarlar.get("ek_klasorler", {}).get(tur, []):
            try:
                tam = self.tam_yol(ek)
                if os.path.isdir(tam):
                    bulunan.append(tam)
            except Exception:
                pass
        return bulunan

    # ---------- tarama ----------
    def tara_arkaplanda(self):
        if self.tarama["durum"] == "taraniyor":
            return
        threading.Thread(target=self.tara, daemon=True).start()

    def tara(self):
        self.tarama.update(durum="taraniyor", islenen=0, bulunan=0)
        c = self.db()
        mevcut = {r["yol"]: (r["id"], r["mtime"], r["boyut"]) for r in c.execute("SELECT id,yol,mtime,boyut FROM medya")}
        gorulen = set()
        simdi = time.time()
        hedefler = []
        # Varsayılan: diskin tamamı taranır, dosyalar türüne göre ayrılır.
        # İstenirse sadece kategori klasörleri (Videolar, Fotoğraflar...) taranabilir.
        if not self.ayarlar.get("sadece_kategori_klasorleri"):
            hedefler.append((None, self.kok))
        else:
            for tur in UZANTILAR:
                for d in self.kategori_klasorleri(tur):
                    hedefler.append((tur, d))
        yeni = 0
        son_kayit = time.time()
        for beklenen_tur, d in hedefler:
            for kok, dizinler, dosyalar in os.walk(d):
                dizinler[:] = [x for x in dizinler if x.lower() not in ATLA and not x.startswith(".")]
                for ad in dosyalar:
                    if ad.startswith(".") or ad.startswith("~$"):
                        continue
                    tur = tur_bul(ad)
                    if tur is None:
                        continue
                    if beklenen_tur and tur != beklenen_tur:
                        # Videolar klasöründeki bir afiş resmi vb. — yine de kendi türünde göster
                        pass
                    tam = os.path.join(kok, ad)
                    g = self.goreli(tam)
                    if g in gorulen:
                        continue
                    gorulen.add(g)
                    self.tarama["islenen"] += 1
                    try:
                        st = os.stat(tam)
                    except OSError:
                        continue
                    eski = mevcut.get(g)
                    if eski and abs((eski[1] or 0) - st.st_mtime) < 1 and eski[2] == st.st_size:
                        continue
                    kayit = {
                        "yol": g, "tur": tur, "ad": guzel_ad(ad),
                        "klasor": self._klasor(kok), "uzanti": os.path.splitext(ad)[1].lower(),
                        "boyut": st.st_size, "mtime": st.st_mtime, "tarih": st.st_mtime,
                        "eklenme": simdi,
                    }
                    if tur == "muzik":
                        kayit.update(self._muzik_etiket(tam))
                    if eski:
                        c.execute("""UPDATE medya SET tur=:tur, ad=:ad, klasor=:klasor, uzanti=:uzanti,
                                     boyut=:boyut, mtime=:mtime, tarih=:tarih, sure=NULL, gtur=:tur, canli=NULL,
                                     sanatci=:sanatci, album=:album, baslik=:baslik WHERE yol=:yol""",
                                  {**{"sanatci": None, "album": None, "baslik": None}, **kayit})
                        self._kucuk_sil(eski[0])
                    else:
                        kayit.setdefault("sanatci", None)
                        kayit.setdefault("album", None)
                        kayit.setdefault("baslik", None)
                        kayit.setdefault("sure", None)
                        c.execute("""INSERT INTO medya(yol,tur,gtur,ad,klasor,uzanti,boyut,mtime,tarih,eklenme,
                                     sanatci,album,baslik,sure)
                                     VALUES(:yol,:tur,:tur,:ad,:klasor,:uzanti,:boyut,:mtime,:tarih,:eklenme,
                                     :sanatci,:album,:baslik,:sure)""", kayit)
                        yeni += 1
                    if time.time() - son_kayit > 0.4:
                        c.commit()
                        son_kayit = time.time()
        # silinmiş dosyaları indeksten çıkar (dosyaların kendisine dokunulmaz)
        silinen = [v[0] for k, v in mevcut.items() if k not in gorulen]
        for mid in silinen:
            c.execute("DELETE FROM medya WHERE id=?", (mid,))
            self._kucuk_sil(mid)
        c.commit()
        self._ozel_adlari_uygula()
        self.canli_eslestir()
        self.tarama.update(durum="tamam", bulunan=len(gorulen), son=time.time(), yeni=yeni, silinen=len(silinen))
        print("Tarama bitti: %d dosya (%d yeni, %d kaldırıldı)" % (len(gorulen), yeni, len(silinen)))
        threading.Thread(target=self._tarih_taramasi, daemon=True).start()

    def _tarih_taramasi(self):
        self._fotograf_tarihleri()
        self._video_tarihleri()
        self._kucukleri_hazirla()

    def _kucukleri_hazirla(self):
        """Boşta kalan zamanda eksik küçük resimleri önceden üretir (en yeni
        fotoğraflardan başlayarak). Böylece sayfalar daha sonra anında açılır.
        Sayfalardan istek geldiğinde o istekler önceliklidir."""
        self.hazirlik = {"durum": "suruyor", "yapilan": 0, "toplam": 0}
        satirlar = self.db().execute(
            "SELECT id FROM medya WHERE tur IN ('foto','video') AND gtur<>'gizli' ORDER BY tarih DESC").fetchall()
        eksik = [r[0] for r in satirlar if not os.path.exists(self._kucuk_yolu(r[0])) and not os.path.exists(self._kucuk_yolu(r[0]) + ".yok")]
        self.hazirlik["toplam"] = len(eksik)
        for mid in eksik:
            # sayfadan bekleyen küçük resim isteği varsa önce onlar
            while self.bekleyen._value < 6:
                time.sleep(0.3)
            try:
                self.kucuk_resim(mid)
            except Exception:
                pass
            self.hazirlik["yapilan"] += 1
        self.hazirlik["durum"] = "bitti"

    def _video_tarihleri(self):
        """Videoların gerçek çekim tarihini (telefonların yazdığı creation_time) okur.
        Takvim ve "Geçmişte bugün" için önemlidir; yoksa dosya tarihi kullanılır."""
        if not self.ffmpeg:
            return
        c = self.db()
        satirlar = c.execute("SELECT id,yol FROM medya WHERE tur='video' AND genislik IS NULL").fetchall()
        for i, r in enumerate(satirlar):
            # yavaş disk okuması (ffmpeg) yazma kilidi dışında yapılır; yazma anında bitirilir.
            # Böylece kullanıcının ad/etiket kayıtları beklemez.
            try:
                b = self.video_bilgi(self.tam_yol(r["yol"]))
            except Exception:
                b = {}
            self._kisa_yaz(lambda c: (
                c.execute("UPDATE medya SET genislik=?, yukseklik=?, sure=COALESCE(sure, ?) WHERE id=?",
                          (b.get("genislik") or -1, b.get("yukseklik") or -1, b.get("sure"), r["id"])),
                b.get("cekim") and c.execute("UPDATE medya SET tarih=? WHERE id=?", (b["cekim"], r["id"]))))
            time.sleep(0.02)
            if i % 150 == 149:
                self.canli_eslestir()
        self.canli_eslestir()

    def _fotograf_tarihleri(self):
        """Fotoğrafların EXIF çekim tarihini okur (sıralama için)."""
        try:
            from PIL import Image
        except Exception:
            return
        c = self.db()
        satirlar = c.execute("SELECT id,yol FROM medya WHERE tur='foto' AND genislik IS NULL").fetchall()
        bekleyen = []

        def yaz():
            if bekleyen:
                self._kisa_yaz(lambda c: c.executemany("UPDATE medya SET genislik=?, yukseklik=?, tarih=COALESCE(?, tarih) WHERE id=?", bekleyen))
                bekleyen.clear()
        for i, r in enumerate(satirlar):
            try:
                with Image.open(self.tam_yol(r["yol"])) as im:
                    g, y = im.size
                    tarih = None
                    exif = im.getexif()
                    ds = exif.get(36867) or exif.get(306)
                    if not ds:
                        try:
                            ds = exif.get_ifd(0x8769).get(36867)
                        except Exception:
                            ds = None
                    if ds:
                        try:
                            tarih = time.mktime(time.strptime(str(ds)[:19], "%Y:%m:%d %H:%M:%S"))
                        except Exception:
                            tarih = None
                    bekleyen.append((g, y, tarih, r["id"]))
            except Exception:
                bekleyen.append((0, 0, None, r["id"]))
            if len(bekleyen) >= 20:
                yaz()
        yaz()

    def _kisa_yaz(self, islem, deneme=5):
        """Arka plan işlerinin yazmalarını kısa tutar ve kilitlenirse tekrar dener."""
        for i in range(deneme):
            c = self.db()
            try:
                islem(c)
                c.commit()
                return
            except sqlite3.OperationalError as ex:
                c.rollback()
                if "locked" not in str(ex) and "busy" not in str(ex):
                    raise
                time.sleep(0.5 * (i + 1))

    def _muzik_etiket(self, tam):
        bilgi = {}
        try:
            import mutagen
            m = mutagen.File(tam, easy=True)
            if m is not None:
                def ilk(k):
                    v = m.get(k)
                    return str(v[0]) if v else None
                bilgi["baslik"] = ilk("title")
                bilgi["sanatci"] = ilk("artist") or ilk("albumartist")
                bilgi["album"] = ilk("album")
                if getattr(m, "info", None) and getattr(m.info, "length", None):
                    bilgi["sure"] = float(m.info.length)
        except Exception:
            pass
        return bilgi

    # ---------- sorgular ----------
    def satir(self, r):
        d = dict(r)
        d["dosya_adi"] = d["ad"]
        d["etiketler"] = self.etk["atama"].get(d["yol"], [])
        # canlı fotoğraf: fotoğrafın hareketli eşi ya da tek başına kısa video
        if d.get("tur") == "foto" and d.get("canli"):
            d["canli_video"] = d["canli"]
        elif d.get("tur") == "video" and d.get("gtur") == "foto":
            d["canli_video"] = d["id"]
        if d.get("ozel_ad"):
            d["ad"] = d["ozel_ad"]
            if d["tur"] == "muzik":
                d["baslik"] = d["ozel_ad"]
        d["oynatilabilir"] = d.get("uzanti") in TARAYICI_VIDEO if d["tur"] == "video" else True
        if d["tur"] == "foto":
            d["tarayici_gosterir"] = d.get("uzanti") in TARAYICI_FOTO
        return d

    def liste(self, tur, sira="yeni", klasor=None, bas=0, adet=60, ara=None, etiketler=None, t1=None, t2=None):
        sql = "SELECT m.*, i.konum, i.sure AS izleme_sure FROM medya m LEFT JOIN izleme i ON i.id=m.id WHERE m.gtur=?"
        p = [tur]
        if tur == "hepsi":
            sql = sql.replace("WHERE m.gtur=?", "WHERE m.gtur<>'gizli'")
            p = []
        if t1 is not None:
            sql += " AND m.tarih >= ?"
            p.append(t1)
        if t2 is not None:
            sql += " AND m.tarih < ?"
            p.append(t2)
        for e in etiketler or []:
            # birden çok etiket seçilirse hepsini taşıyanlar gelir
            sql += " AND m.yol IN (SELECT yol FROM etiket WHERE ad=?)"
            p.append(e)
        if klasor:
            sql += " AND (m.klasor=? OR m.klasor LIKE ? ESCAPE '\\')"
            p += [klasor, like_kacis(klasor) + "/%"]
        if ara:
            sql += (" AND (katla(m.ozel_ad) LIKE ? OR katla(m.ad) LIKE ? OR katla(m.baslik) LIKE ? OR katla(m.sanatci) LIKE ?"
                    " OR katla(m.album) LIKE ? OR m.yol IN (SELECT yol FROM etiket WHERE katla(ad) LIKE ?))")
            a = "%" + katla(ara) + "%"
            p += [a, a, a, a, a, a]
        sira_sql = {
            "yeni": "m.tarih DESC", "eski": "m.tarih ASC", "ad": "m.klasor, m.ad COLLATE NOCASE",
            "boyut": "m.boyut DESC", "rastgele": "RANDOM()", "eklenme": "m.eklenme DESC",
        }.get(sira, "m.tarih DESC")
        sql += " ORDER BY " + sira_sql + " LIMIT ? OFFSET ?"
        p += [adet, bas]
        return [self.satir(r) for r in self.db().execute(sql, p)]

    # ---------- takvim ve geçmişte bugün ----------
    def takvim(self):
        sql = """SELECT CAST(strftime('%Y', tarih, 'unixepoch', 'localtime') AS INTEGER) yil,
                        CAST(strftime('%m', tarih, 'unixepoch', 'localtime') AS INTEGER) ay,
                        SUM(gtur='foto') foto, SUM(gtur='video') video,
                        MAX(CASE WHEN gtur='foto' AND tur='foto' THEN id END) kapak_foto, MAX(CASE WHEN gtur='video' THEN id END) kapak_video
                 FROM medya WHERE gtur IN ('foto','video') AND tarih IS NOT NULL
                 GROUP BY yil, ay ORDER BY yil DESC, ay DESC"""
        return [{**dict(r), "kapak": r["kapak_foto"] or r["kapak_video"]} for r in self.db().execute(sql)]

    def gecmiste_bugun(self, ay=None, gun=None, adet=40):
        """Önceki yıllarda bugünün tarihinde çekilmiş fotoğraf ve videolar (yıl yıl)."""
        bugun = time.localtime()
        ay, gun = ay or bugun.tm_mon, gun or bugun.tm_mday
        sql = """SELECT * FROM medya WHERE gtur IN ('foto','video')
                 AND strftime('%m-%d', tarih, 'unixepoch', 'localtime') = ?
                 AND CAST(strftime('%Y', tarih, 'unixepoch', 'localtime') AS INTEGER) < ?
                 ORDER BY tarih DESC"""
        yillar, sayi = {}, {}
        for r in self.db().execute(sql, ("%02d-%02d" % (ay, gun), bugun.tm_year)):
            y = time.localtime(r["tarih"]).tm_year
            l = yillar.setdefault(y, [])
            sayi[y] = sayi.get(y, 0) + 1
            if len(l) < adet:
                l.append(self.satir(r))
        return [{"yil": y, "once": bugun.tm_year - y, "toplam": sayi[y], "ogeler": l} for y, l in sorted(yillar.items(), reverse=True)]

    def buyuk_goruntu(self, mid):
        """Tarayıcının açamadığı fotoğraflar (HEIC, TIFF) için ekrana uygun JPEG üretir (önbellekli)."""
        dizin = os.path.join(self.veri, "buyuk")
        os.makedirs(dizin, exist_ok=True)
        hedef = os.path.join(dizin, "%d.jpg" % mid)
        if os.path.exists(hedef):
            return hedef
        m = self.al(mid)
        if not m:
            return None
        from PIL import Image, ImageOps
        with self.buyuk_kilit:
            with Image.open(self.tam_yol(m["yol"])) as im:
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                im.thumbnail((2560, 2560))
                gecici = hedef + ".tmp"
                im.save(gecici, "JPEG", quality=88)
                os.replace(gecici, hedef)
        return hedef

    def say(self, tur):
        return self.db().execute("SELECT COUNT(*) FROM medya WHERE gtur=?", (tur,)).fetchone()[0]

    def al(self, mid):
        r = self.db().execute("SELECT m.*, i.konum, i.sure AS izleme_sure FROM medya m LEFT JOIN izleme i ON i.id=m.id WHERE m.id=?", (mid,)).fetchone()
        return self.satir(r) if r else None

    def klasorler(self, tur):
        sql = """SELECT klasor, COUNT(*) adet, MIN(id) kapak, MAX(tarih) son FROM medya WHERE gtur=?
                 GROUP BY klasor ORDER BY son DESC"""
        return [dict(r) for r in self.db().execute(sql, (tur,))]

    def klasor_ozet(self, yol=""):
        """Bir klasörün (yol="" ise diskin kökü) alt klasörlerini, her birindeki
        video/fotoğraf/müzik/belge sayılarını ve kapak resmini döndürür."""
        yol = (yol or "").strip("/")
        c = self.db()
        if yol:
            satirlar = c.execute(
                "SELECT klasor, gtur tur, COUNT(*) n, MAX(id) son_id, MAX(tarih) son FROM medya "
                "WHERE gtur<>'gizli' AND (klasor=? OR klasor LIKE ? ESCAPE '\\') GROUP BY klasor, gtur",
                (yol, like_kacis(yol) + "/%")).fetchall()
        else:
            satirlar = c.execute(
                "SELECT klasor, gtur tur, COUNT(*) n, MAX(id) son_id, MAX(tarih) son FROM medya WHERE gtur<>'gizli' GROUP BY klasor, gtur").fetchall()
        onek = yol + "/" if yol else ""
        cocuklar, toplam, burada = {}, {}, {}
        for r in satirlar:
            k = r["klasor"] or ""
            toplam[r["tur"]] = toplam.get(r["tur"], 0) + r["n"]
            if k == yol:
                burada[r["tur"]] = burada.get(r["tur"], 0) + r["n"]
                continue
            ad = k[len(onek):].split("/")[0]
            if not ad:
                continue
            o = cocuklar.setdefault(ad, {"ad": ad, "yol": onek + ad, "sayilar": {}, "kapak": {}, "son": 0})
            o["sayilar"][r["tur"]] = o["sayilar"].get(r["tur"], 0) + r["n"]
            o["kapak"][r["tur"]] = max(o["kapak"].get(r["tur"], 0), r["son_id"])
            o["son"] = max(o["son"], r["son"] or 0)
        liste = []
        for o in cocuklar.values():
            o["kapak"] = o["kapak"].get("foto") or o["kapak"].get("video") or o["kapak"].get("muzik") or o["kapak"].get("belge")
            o["toplam"] = sum(o["sayilar"].values())
            liste.append(o)
        liste.sort(key=lambda o: katla(o["ad"]))
        return {"yol": yol, "ad": yol.split("/")[-1] if yol else "", "sayilar": toplam,
                "burada": burada, "klasorler": liste}

    def oneriler(self, mid, adet=20):
        """İzleme sayfasının yanındaki liste: her açılışta rastgele."""
        m = self.al(mid)
        if not m:
            return []
        sql = "SELECT * FROM medya WHERE gtur=? AND id<>? ORDER BY RANDOM() LIMIT ?"
        return [self.satir(r) for r in self.db().execute(sql, (m["gtur"], mid, adet))]

    def devam(self, adet=12):
        sql = """SELECT m.*, i.konum, i.sure AS izleme_sure FROM izleme i JOIN medya m ON m.id=i.id
                 WHERE m.gtur='video' AND i.konum > 15 AND (i.sure IS NULL OR i.konum < i.sure*0.93)
                 ORDER BY i.son DESC LIMIT ?"""
        return [self.satir(r) for r in self.db().execute(sql, (adet,))]

    def etiketsiz_sayisi(self, tur):
        return self.db().execute(
            "SELECT COUNT(*) FROM medya WHERE gtur=? AND yol NOT IN (SELECT yol FROM etiket)", (tur,)).fetchone()[0]

    def onerilen(self, tur="video", adet=12):
        """Ana sayfa önerileri, her açılışta rastgele. Etiketlenmemiş dosya varken
        yalnızca onlar gösterilir (etiketleme kolay olsun); hepsi etiketlenince tümü."""
        sql = "SELECT * FROM medya WHERE gtur=? AND yol NOT IN (SELECT yol FROM etiket) ORDER BY RANDOM() LIMIT ?"
        l = [self.satir(r) for r in self.db().execute(sql, (tur, adet))]
        if not l:
            l = [self.satir(r) for r in self.db().execute("SELECT * FROM medya WHERE gtur=? ORDER BY RANDOM() LIMIT ?", (tur, adet))]
        return l

    def son_etiketsiz(self, tur="foto", adet=12):
        """En yeni etiketlenmemiş fotoğraflar; hepsi etiketliyse en yeniler."""
        sql = "SELECT * FROM medya WHERE gtur=? AND yol NOT IN (SELECT yol FROM etiket) ORDER BY tarih DESC LIMIT ?"
        l = [self.satir(r) for r in self.db().execute(sql, (tur, adet))]
        return l or self.liste(tur, "yeni", adet=adet)

    def izleme_kaydet(self, mid, konum, sure, bitti=False):
        c = self.db()
        c.execute("""INSERT INTO izleme(id,konum,sure,son,sayi) VALUES(?,?,?,?,1)
                     ON CONFLICT(id) DO UPDATE SET konum=excluded.konum, sure=COALESCE(excluded.sure, izleme.sure),
                     son=excluded.son, sayi=izleme.sayi + ?""",
                  (mid, konum, sure, time.time(), 1 if bitti else 0))
        if sure:
            c.execute("UPDATE medya SET sure=? WHERE id=? AND sure IS NULL", (sure, mid))
        c.commit()

    def ara(self, q, adet=12):
        k = katla(q)
        a = "%" + k + "%"
        etk = "yol IN (SELECT yol FROM etiket WHERE katla(ad) LIKE ?)"
        sql = """SELECT * FROM medya WHERE katla(ozel_ad) LIKE ? OR katla(ad) LIKE ? OR katla(baslik) LIKE ?
                 OR katla(sanatci) LIKE ? OR katla(album) LIKE ? OR katla(klasor) LIKE ? OR """ + etk + """
                 ORDER BY CASE WHEN """ + etk + """ THEN 0 WHEN katla(ozel_ad) LIKE ? THEN 1 WHEN katla(ad) LIKE ? THEN 2 ELSE 3 END,
                 tarih DESC LIMIT ?"""
        sonuc = {"video": [], "foto": [], "muzik": [], "belge": []}
        for r in self.db().execute(sql, (a, a, a, a, a, a, a, a, a, k + "%", 400)):
            if r["gtur"] == "gizli":
                continue
            l = sonuc[r["gtur"]]
            if len(l) < adet:
                l.append(self.satir(r))
        return sonuc

    def istatistik(self):
        c = self.db()
        d = {}
        for r in c.execute("SELECT gtur tur, COUNT(*) adet, COALESCE(SUM(boyut),0) boyut FROM medya WHERE gtur<>'gizli' GROUP BY gtur"):
            d[r["tur"]] = {"adet": r["adet"], "boyut": r["boyut"]}
        return d

    # ---------- küçük resimler ----------
    def _kucuk_yolu(self, mid):
        return os.path.join(self.kucuk_dizin, "%d.jpg" % mid)

    def _kucuk_sil(self, mid):
        for y in (self._kucuk_yolu(mid), self._kucuk_yolu(mid) + ".yok"):
            try:
                os.remove(y)
            except OSError:
                pass

    def kucuk_resim(self, mid, bekleme=True):
        """Küçük resim dosyasının yolunu döndürür; üretilemiyorsa None.
        Üretici meşgulse ve bekleme=False ise "MESGUL" döner."""
        hedef = self._kucuk_yolu(mid)
        if os.path.exists(hedef):
            return hedef
        if os.path.exists(hedef + ".yok"):
            return None
        if not bekleme:
            if not self.bekleyen.acquire(blocking=False):
                return "MESGUL"
            try:
                return self.kucuk_resim(mid, True)
            finally:
                self.bekleyen.release()
        m = self.al(mid)
        if not m:
            return None
        with self.uretim_kilit:
            if os.path.exists(hedef):
                return hedef
            try:
                kaynak = self.tam_yol(m["yol"])
                ok = False
                if m["tur"] == "foto":
                    ok = self._foto_kucuk(kaynak, hedef)
                elif m["tur"] == "video":
                    ok = self._video_kucuk(mid, kaynak, hedef)
                elif m["tur"] == "muzik":
                    ok = self._muzik_kapak(kaynak, hedef)
                elif m["tur"] == "belge" and m["uzanti"] == ".pdf":
                    ok = self._pdf_kucuk(kaynak, hedef)
            except Exception as ex:
                print("küçük resim hatası", m["yol"], ex)
                if isinstance(ex, OSError) and (getattr(ex, "winerror", None) in (23, 1117, 483) or getattr(ex, "errno", None) == 5):
                    self.okuma_hatalari.append({"yol": m["yol"], "hata": str(ex), "zaman": time.time()})
                ok = False
            if not ok:
                open(hedef + ".yok", "w").close()
                return None
            return hedef

    def _kaydet(self, im, hedef):
        from PIL import Image
        if im.mode not in ("RGB", "L"):
            arka = Image.new("RGB", im.size, (24, 24, 27))
            try:
                arka.paste(im, mask=im.convert("RGBA").split()[-1])
            except Exception:
                arka.paste(im.convert("RGB"))
            im = arka
        im.thumbnail((KUCUK_GENISLIK, KUCUK_GENISLIK * 2))
        gecici = hedef + ".tmp"
        im.save(gecici, "JPEG", quality=82, optimize=True)
        os.replace(gecici, hedef)
        return True

    def _foto_kucuk(self, kaynak, hedef):
        from PIL import Image, ImageOps
        if HEIF_VAR and kaynak.lower().endswith((".heic", ".heif")):
            # iPhone fotoğrafları içinde hazır bir küçük resim taşır; 12 MP'lik
            # fotoğrafın tamamını çözmek yerine onu kullanmak yavaş diskte çok daha hızlıdır.
            try:
                import pillow_heif
                h = pillow_heif.open_heif(kaynak, convert_hdr_to_8bit=True)
                birincil = h[h.primary_index] if hasattr(h, "primary_index") else h[0]
                kutular = birincil.info.get("thumbnails") or []
                if kutular:
                    th = birincil.get_thumbnail(0)
                    if th.size[0] >= 240:
                        return self._kaydet(th.to_pillow(), hedef)
            except Exception:
                pass
        with Image.open(kaynak) as im:
            im.draft("RGB", (KUCUK_GENISLIK * 2, KUCUK_GENISLIK * 2))
            im = ImageOps.exif_transpose(im)
            return self._kaydet(im, hedef)

    def video_bilgi(self, kaynak):
        """ffmpeg -i çıktısından süre ve codec bilgisini okur."""
        bilgi = {"sure": None, "video": None, "ses": None}
        if not self.ffmpeg:
            return bilgi
        try:
            p = subprocess.run([self.ffmpeg, "-hide_banner", "-i", kaynak], capture_output=True,
                               timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            cikti = p.stderr.decode("utf-8", "ignore")
            s = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", cikti)
            if s:
                bilgi["sure"] = int(s.group(1)) * 3600 + int(s.group(2)) * 60 + float(s.group(3))
            v = re.search(r"Stream #\S+.*?: Video: (\w+)", cikti)
            a = re.search(r"Stream #\S+.*?: Audio: (\w+)", cikti)
            bilgi["video"] = v.group(1) if v else None
            bilgi["ses"] = a.group(1) if a else None
            boy = re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", cikti)
            if boy:
                bilgi["genislik"], bilgi["yukseklik"] = int(boy.group(1)), int(boy.group(2))
            ct = re.search(r"creation_time\s*:\s*(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)", cikti)
            if ct:
                import calendar
                y = int(ct.group(1))
                if 1995 <= y <= time.localtime().tm_year:
                    # creation_time UTC'dir
                    bilgi["cekim"] = float(calendar.timegm(tuple(int(ct.group(k)) for k in range(1, 7)) + (0, 0, 0)))
        except Exception:
            pass
        return bilgi

    def _video_kucuk(self, mid, kaynak, hedef):
        if not self.ffmpeg:
            return False
        b = self.video_bilgi(kaynak)
        if b["sure"]:
            self.db().execute("UPDATE medya SET sure=? WHERE id=?", (b["sure"], mid))
            self.db().commit()
        an = min(max((b["sure"] or 20) * 0.12, 1), 90)
        gecici = hedef + ".tmp.jpg"
        for t in (an, 0):
            try:
                subprocess.run([self.ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", "%.2f" % t, "-i", kaynak,
                                "-frames:v", "1", "-vf", "scale=%d:-2" % KUCUK_GENISLIK, "-q:v", "4", "-y", gecici],
                               capture_output=True, timeout=60,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except Exception:
                continue
            if os.path.exists(gecici) and os.path.getsize(gecici) > 0:
                os.replace(gecici, hedef)
                return True
        return False

    def _muzik_kapak(self, kaynak, hedef):
        from io import BytesIO
        from PIL import Image
        veri = None
        try:
            import mutagen
            m = mutagen.File(kaynak)
            if m is not None:
                if hasattr(m, "pictures") and m.pictures:
                    veri = m.pictures[0].data
                elif m.tags is not None:
                    for k in list(m.tags.keys()):
                        if str(k).startswith("APIC"):
                            veri = m.tags[k].data
                            break
                        if k == "covr":
                            veri = bytes(m.tags[k][0])
                            break
        except Exception:
            veri = None
        if veri:
            with Image.open(BytesIO(veri)) as im:
                return self._kaydet(im.copy(), hedef)
        klasor = os.path.dirname(kaynak)
        for ad in ("cover.jpg", "folder.jpg", "front.jpg", "kapak.jpg", "cover.png", "folder.png", "albumart.jpg"):
            for gercek in os.listdir(klasor):
                if gercek.lower() == ad:
                    return self._foto_kucuk(os.path.join(klasor, gercek), hedef)
        return False

    def _pdf_kucuk(self, kaynak, hedef):
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(kaynak)
        try:
            sayfa = pdf[0]
            olcek = KUCUK_GENISLIK / max(sayfa.get_width(), 1)
            im = sayfa.render(scale=olcek).to_pil()
            return self._kaydet(im, hedef)
        finally:
            pdf.close()
