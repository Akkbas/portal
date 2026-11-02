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

UZANTILAR = {
    "video": {".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi", ".wmv", ".flv", ".mpg", ".mpeg", ".ts", ".m2ts", ".3gp", ".ogv"},
    "foto": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".jfif"},
    "muzik": {".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".wma", ".alac"},
    "belge": {".pdf", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
              ".odp", ".rtf", ".csv", ".epub", ".html", ".htm", ".json", ".xml"},
}
TARAYICI_VIDEO = {".mp4", ".m4v", ".webm", ".mov", ".ogv"}
ATLA = {"portal", "system volume information", "$recycle.bin", "recycler", ".trash", ".trashes",
        ".spotlight-v100", ".fseventsd", "found.000", "$windows.~bt"}

KUCUK_GENISLIK = 480


def tur_bul(ad):
    u = os.path.splitext(ad)[1].lower()
    for t, s in UZANTILAR.items():
        if u in s:
            return t
    return None


_KATLA = str.maketrans("ıİşŞğĞüÜöÖçÇâÂîÎûÛ", "iisSgGuUoOcCaAiIuU")


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
        self.ffmpeg = self._ffmpeg_bul()
        self._sema()

    # ---------- veritabanı ----------
    def db(self):
        c = getattr(self.yerel, "c", None)
        if c is None:
            c = sqlite3.connect(self.db_yol, timeout=30, check_same_thread=False)
            c.row_factory = sqlite3.Row
            c.create_function("katla", 1, katla, deterministic=True)
            # Harici disk aniden çıkarılabileceği için WAL yerine klasik günlük + tam senkron
            c.execute("PRAGMA journal_mode=DELETE")
            c.execute("PRAGMA synchronous=FULL")
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
        c.commit()

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
        if self.ayarlar.get("tum_diski_tara"):
            hedefler.append((None, self.kok))
        else:
            for tur in UZANTILAR:
                for d in self.kategori_klasorleri(tur):
                    hedefler.append((tur, d))
        yeni = 0
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
                        "klasor": self.goreli(kok), "uzanti": os.path.splitext(ad)[1].lower(),
                        "boyut": st.st_size, "mtime": st.st_mtime, "tarih": st.st_mtime,
                        "eklenme": simdi,
                    }
                    if tur == "muzik":
                        kayit.update(self._muzik_etiket(tam))
                    if eski:
                        c.execute("""UPDATE medya SET tur=:tur, ad=:ad, klasor=:klasor, uzanti=:uzanti,
                                     boyut=:boyut, mtime=:mtime, tarih=:tarih, sure=NULL,
                                     sanatci=:sanatci, album=:album, baslik=:baslik WHERE yol=:yol""",
                                  {**{"sanatci": None, "album": None, "baslik": None}, **kayit})
                        self._kucuk_sil(eski[0])
                    else:
                        kayit.setdefault("sanatci", None)
                        kayit.setdefault("album", None)
                        kayit.setdefault("baslik", None)
                        kayit.setdefault("sure", None)
                        c.execute("""INSERT INTO medya(yol,tur,ad,klasor,uzanti,boyut,mtime,tarih,eklenme,
                                     sanatci,album,baslik,sure)
                                     VALUES(:yol,:tur,:ad,:klasor,:uzanti,:boyut,:mtime,:tarih,:eklenme,
                                     :sanatci,:album,:baslik,:sure)""", kayit)
                        yeni += 1
                    if self.tarama["islenen"] % 200 == 0:
                        c.commit()
        # silinmiş dosyaları indeksten çıkar (dosyaların kendisine dokunulmaz)
        silinen = [v[0] for k, v in mevcut.items() if k not in gorulen]
        for mid in silinen:
            c.execute("DELETE FROM medya WHERE id=?", (mid,))
            self._kucuk_sil(mid)
        c.commit()
        self.tarama.update(durum="tamam", bulunan=len(gorulen), son=time.time(), yeni=yeni, silinen=len(silinen))
        print("Tarama bitti: %d dosya (%d yeni, %d kaldırıldı)" % (len(gorulen), yeni, len(silinen)))
        threading.Thread(target=self._fotograf_tarihleri, daemon=True).start()

    def _fotograf_tarihleri(self):
        """Fotoğrafların EXIF çekim tarihini okur (sıralama için)."""
        try:
            from PIL import Image
        except Exception:
            return
        c = self.db()
        satirlar = c.execute("SELECT id,yol FROM medya WHERE tur='foto' AND genislik IS NULL").fetchall()
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
                    if tarih:
                        c.execute("UPDATE medya SET genislik=?,yukseklik=?,tarih=? WHERE id=?", (g, y, tarih, r["id"]))
                    else:
                        c.execute("UPDATE medya SET genislik=?,yukseklik=? WHERE id=?", (g, y, r["id"]))
            except Exception:
                c.execute("UPDATE medya SET genislik=0 WHERE id=?", (r["id"],))
            if i % 100 == 0:
                c.commit()
        c.commit()

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
        d["oynatilabilir"] = d.get("uzanti") in TARAYICI_VIDEO if d["tur"] == "video" else True
        return d

    def liste(self, tur, sira="yeni", klasor=None, bas=0, adet=60, ara=None):
        sql = "SELECT m.*, i.konum, i.sure AS izleme_sure FROM medya m LEFT JOIN izleme i ON i.id=m.id WHERE m.tur=?"
        p = [tur]
        if klasor:
            sql += " AND (m.klasor=? OR m.klasor LIKE ?)"
            p += [klasor, klasor + "/%"]
        if ara:
            sql += " AND (katla(m.ad) LIKE ? OR katla(m.baslik) LIKE ? OR katla(m.sanatci) LIKE ? OR katla(m.album) LIKE ?)"
            a = "%" + katla(ara) + "%"
            p += [a, a, a, a]
        sira_sql = {
            "yeni": "m.tarih DESC", "eski": "m.tarih ASC", "ad": "m.klasor, m.ad COLLATE NOCASE",
            "boyut": "m.boyut DESC", "rastgele": "RANDOM()", "eklenme": "m.eklenme DESC",
        }.get(sira, "m.tarih DESC")
        sql += " ORDER BY " + sira_sql + " LIMIT ? OFFSET ?"
        p += [adet, bas]
        return [self.satir(r) for r in self.db().execute(sql, p)]

    def say(self, tur):
        return self.db().execute("SELECT COUNT(*) FROM medya WHERE tur=?", (tur,)).fetchone()[0]

    def al(self, mid):
        r = self.db().execute("SELECT m.*, i.konum, i.sure AS izleme_sure FROM medya m LEFT JOIN izleme i ON i.id=m.id WHERE m.id=?", (mid,)).fetchone()
        return self.satir(r) if r else None

    def klasorler(self, tur):
        sql = """SELECT klasor, COUNT(*) adet, MIN(id) kapak, MAX(tarih) son FROM medya WHERE tur=?
                 GROUP BY klasor ORDER BY son DESC"""
        return [dict(r) for r in self.db().execute(sql, (tur,))]

    def oneriler(self, mid, adet=20):
        m = self.al(mid)
        if not m:
            return []
        c = self.db()
        ayni = [self.satir(r) for r in c.execute(
            "SELECT * FROM medya WHERE tur=? AND klasor=? AND id<>? ORDER BY ad COLLATE NOCASE", (m["tur"], m["klasor"], mid))]
        # aynı klasörde bu dosyadan sonrakiler önce (dizi bölümleri gibi)
        sonra = [x for x in ayni if x["ad"].lower() > m["ad"].lower()]
        once = [x for x in ayni if x["ad"].lower() <= m["ad"].lower()]
        liste = sonra + once
        if len(liste) < adet:
            for r in c.execute("SELECT * FROM medya WHERE tur=? AND klasor<>? ORDER BY RANDOM() LIMIT ?",
                               (m["tur"], m["klasor"], adet - len(liste))):
                liste.append(self.satir(r))
        return liste[:adet]

    def devam(self, adet=12):
        sql = """SELECT m.*, i.konum, i.sure AS izleme_sure FROM izleme i JOIN medya m ON m.id=i.id
                 WHERE m.tur='video' AND i.konum > 15 AND (i.sure IS NULL OR i.konum < i.sure*0.93)
                 ORDER BY i.son DESC LIMIT ?"""
        return [self.satir(r) for r in self.db().execute(sql, (adet,))]

    def onerilen(self, tur="video", adet=12):
        """Günlük değişen karışık öneri: henüz izlenmemişler + yeni eklenenler."""
        tohum = int(time.strftime("%Y%m%d"))
        c = self.db()
        tum = [r[0] for r in c.execute(
            "SELECT m.id FROM medya m LEFT JOIN izleme i ON i.id=m.id WHERE m.tur=? AND (i.sayi IS NULL OR i.sayi=0)", (tur,))]
        if len(tum) < adet:
            tum = [r[0] for r in c.execute("SELECT id FROM medya WHERE tur=?", (tur,))]
        rnd = random.Random(tohum)
        rnd.shuffle(tum)
        secilen = tum[:adet]
        return [self.al(i) for i in secilen if i]

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
        sql = """SELECT * FROM medya WHERE katla(ad) LIKE ? OR katla(baslik) LIKE ? OR katla(sanatci) LIKE ?
                 OR katla(album) LIKE ? OR katla(klasor) LIKE ?
                 ORDER BY CASE WHEN katla(ad) LIKE ? THEN 0 ELSE 1 END, tarih DESC LIMIT ?"""
        sonuc = {"video": [], "foto": [], "muzik": [], "belge": []}
        for r in self.db().execute(sql, (a, a, a, a, a, k + "%", 400)):
            l = sonuc[r["tur"]]
            if len(l) < adet:
                l.append(self.satir(r))
        return sonuc

    def istatistik(self):
        c = self.db()
        d = {}
        for r in c.execute("SELECT tur, COUNT(*) adet, COALESCE(SUM(boyut),0) boyut FROM medya GROUP BY tur"):
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

    def kucuk_resim(self, mid):
        """Küçük resim dosyasının yolunu döndürür; üretilemiyorsa None."""
        hedef = self._kucuk_yolu(mid)
        if os.path.exists(hedef):
            return hedef
        if os.path.exists(hedef + ".yok"):
            return None
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
