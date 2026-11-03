"""Vikipedi / Kiwix ZIM dosyalarını okuyan katman.

ZIM dosyaları SADECE OKUNUR. Bu modül hiçbir dosyaya yazmaz.
"""
import os
import re
import random
import threading
import posixpath
from collections import OrderedDict
from urllib.parse import urljoin, urlparse, unquote, quote

from bs4 import BeautifulSoup
from libzim.reader import Archive
from libzim.search import Query, Searcher
from libzim.suggestion import SuggestionSearcher


def _tahmini(s):
    f = getattr(s, "get_estimated_matches", None) or getattr(s, "getEstimatedMatches")
    return f()


def _sonuclar(s, bas, adet):
    f = getattr(s, "get_results", None) or getattr(s, "getResults")
    return [getattr(r, "path", r) for r in f(bas, adet)]


class LRU(OrderedDict):
    def __init__(self, boyut=500):
        super().__init__()
        self.boyut = boyut
        self.kilit = threading.Lock()

    def al(self, k):
        with self.kilit:
            if k in self:
                self.move_to_end(k)
                return self[k]
        return None

    def koy(self, k, v):
        with self.kilit:
            self[k] = v
            self.move_to_end(k)
            while len(self) > self.boyut:
                self.popitem(last=False)


class ZimDosyasi:
    def __init__(self, zid, yol):
        self.id = zid
        self.yol = yol
        self.arsiv = Archive(yol)
        self.kilit = threading.Lock()
        self.ozet_onbellek = LRU(2000)
        try:
            self.baslik = self.meta("Title") or os.path.basename(yol)
        except Exception:
            self.baslik = os.path.basename(yol)
        self.dil = self.meta("Language") or ""
        self.aciklama = self.meta("Description") or ""

    def meta(self, ad):
        try:
            return bytes(self.arsiv.get_metadata(ad)).decode("utf-8", "ignore")
        except Exception:
            return None

    # ---- temel erişim ----
    def giris(self, yol):
        """Yoldaki girdiyi (yönlendirmeleri izleyerek) döndürür, yoksa None."""
        yol = yol.lstrip("/")
        aday = [yol]
        if not self.arsiv.has_new_namespace_scheme and not re.match(r"^[A-Z-]/", yol):
            aday.append("A/" + yol)
        for y in aday:
            try:
                if self.arsiv.has_entry_by_path(y):
                    e = self.arsiv.get_entry_by_path(y)
                    sayac = 0
                    while e.is_redirect and sayac < 10:
                        e = e.get_redirect_entry()
                        sayac += 1
                    return e
            except Exception:
                continue
        return None

    def icerik(self, yol):
        e = self.giris(yol)
        if e is None:
            return None, None
        it = e.get_item()
        return bytes(it.content), it.mimetype

    def ana_sayfa_yolu(self):
        try:
            e = self.arsiv.main_entry
            while e.is_redirect:
                e = e.get_redirect_entry()
            return e.path
        except Exception:
            return None

    def makale_mi(self, e):
        try:
            return e.get_item().mimetype.startswith("text/html")
        except Exception:
            return False

    # ---- arama ----
    def ara(self, sorgu, bas=0, adet=10):
        sonuc = {"toplam": 0, "yollar": []}
        if not self.arsiv.has_fulltext_index:
            # tam metin indeksi yoksa başlık önerileriyle yetin
            yollar = self.oneriler(sorgu, adet + bas, sadece_yol=True)
            sonuc["toplam"] = len(yollar)
            sonuc["yollar"] = yollar[bas:bas + adet]
            return sonuc
        with self.kilit:
            s = Searcher(self.arsiv).search(Query().set_query(sorgu))
            sonuc["toplam"] = _tahmini(s)
            sonuc["yollar"] = _sonuclar(s, bas, adet)
        return sonuc

    def oneriler(self, sorgu, adet=8, sadece_yol=False):
        with self.kilit:
            s = SuggestionSearcher(self.arsiv).suggest(sorgu)
            yollar = _sonuclar(s, 0, adet)
        if sadece_yol:
            return yollar
        cikti = []
        for y in yollar:
            try:
                cikti.append({"yol": y, "baslik": self.arsiv.get_entry_by_path(y).title})
            except Exception:
                pass
        return cikti

    def rastgele(self, adet=6):
        cikti, deneme, gorulen = [], 0, set()
        while len(cikti) < adet and deneme < adet * 6:
            deneme += 1
            try:
                with self.kilit:
                    e = self.arsiv.get_random_entry()
                while e.is_redirect:
                    e = e.get_redirect_entry()
                if e.path in gorulen or not self.makale_mi(e) or e.path == self.ana_sayfa_yolu():
                    continue
                gorulen.add(e.path)
                oz = self.ozet(e.path)
                if oz and oz["ozet"] and len(oz["ozet"]) > 80:
                    cikti.append(oz)
            except Exception:
                continue
        # resimli olanlar önce
        cikti.sort(key=lambda o: 0 if o.get("resim") else 1)
        return cikti

    # ---- özet (kart / arama sonucu için) ----
    def ozet(self, yol, terimler=None):
        anahtar = yol
        o = self.ozet_onbellek.al(anahtar)
        if o is None:
            e = self.giris(yol)
            if e is None:
                return None
            try:
                html = bytes(e.get_item().content).decode("utf-8", "ignore")
            except Exception:
                return None
            # özet için makalenin başı yeterli (büyük makalelerde aramayı hızlandırır)
            soup = BeautifulSoup(html[:90000], "html.parser")
            paragraflar = []
            for p in soup.find_all("p"):
                if p.find_parent("table"):
                    continue
                t = re.sub(r"\[\d+\]", "", p.get_text(""))
                t = re.sub(r"\s+", " ", t).strip()
                t = re.sub(r"\s+([,.;:)'’])", r"\1", t)
                if len(t) > 40:
                    paragraflar.append(t)
                if len(paragraflar) >= 6:
                    break
            resim = None
            for img in soup.find_all("img"):
                src = img.get("src") or img.get("data-src")
                if not src or src.startswith(("data:", "http:", "https:", "//")):
                    continue
                try:
                    g = int(img.get("width") or 100)
                except ValueError:
                    g = 100
                if g < 60:
                    continue
                ryol = self.coz(e.path, src)
                if not ryol or self.giris(ryol) is None:
                    continue
                resim = self.zim_url(ryol)
                break
            o = {
                "z": self.id,
                "yol": e.path,
                "baslik": e.title,
                "paragraflar": paragraflar,
                "resim": resim,
            }
            self.ozet_onbellek.koy(anahtar, o)
        ozet = o["paragraflar"][0] if o["paragraflar"] else ""
        if terimler:
            # sorgu kelimelerini içeren paragrafı tercih et
            for p in o["paragraflar"]:
                if any(t in p.lower() for t in terimler):
                    ozet = p
                    break
        if len(ozet) > 320:
            ozet = ozet[:320].rsplit(" ", 1)[0] + "…"
        return {"z": o["z"], "yol": o["yol"], "baslik": o["baslik"], "ozet": ozet,
                "resim": o["resim"], "kaynak": self.baslik}

    # ---- yol çözme ----
    @staticmethod
    def coz(taban, href):
        u = urljoin("http://z/" + quote(taban), href)
        p = urlparse(u)
        if p.netloc != "z":
            return None
        return unquote(p.path).lstrip("/")

    def zim_url(self, yol):
        if not yol:
            return None
        return "/zim/%s/%s" % (self.id, quote(yol))

    # ---- makale: blog okuyucu için temizlenmiş HTML ----
    def makale(self, yol):
        e = self.giris(yol)
        if e is None:
            return None
        it = e.get_item()
        if not it.mimetype.startswith("text/html"):
            return {"yonlendir": self.zim_url(e.path)}
        html = bytes(it.content).decode("utf-8", "ignore")
        soup = BeautifulSoup(html, "html.parser")
        for etiket in soup(["script", "style", "link", "meta", "noscript"]):
            etiket.decompose()
        for sec in ["#mw-mf-page-left", ".mw-editsection", "#footer", ".noprint",
                    ".mw-jump-link", ".navbox", ".vertical-navbox", ".metadata"]:
            for el in soup.select(sec):
                el.decompose()
        govde = soup.body or soup
        baslik_el = govde.find("h1")
        baslik = baslik_el.get_text(" ", strip=True) if baslik_el else e.title
        if baslik_el:
            baslik_el.decompose()

        for el in govde.find_all(src=True):
            s = el.get("data-src") or el["src"]
            if s.startswith("data:"):
                continue
            if s.startswith("http") or s.startswith("//"):
                # internetteki resim çevrimdışı açılamaz: boş kutu bırakmasın
                el.decompose()
                continue
            hedef_yol = self.coz(e.path, s)
            if el.name == "img" and (not hedef_yol or self.giris(hedef_yol) is None):
                el.decompose()
                continue
            el["src"] = self.zim_url(hedef_yol) or ""
            el["loading"] = "lazy"
            if el.has_attr("srcset"):
                del el["srcset"]
        for el in govde.find_all(attrs={"data-src": True}):
            del el["data-src"]
        for a in govde.find_all("a", href=True):
            h = a["href"]
            if h.startswith("#"):
                continue
            if h.startswith("http") or h.startswith("//") or h.startswith("mailto:"):
                a["class"] = (a.get("class") or []) + ["dis-baglanti"]
                a["data-dis"] = h
                a["href"] = "javascript:void(0)"
                a["title"] = "İnternet bağlantısı (çevrimdışı açılamaz)"
                continue
            hedef = self.coz(e.path, h.split("#")[0])
            capa = ("#" + h.split("#", 1)[1]) if "#" in h else ""
            if not hedef:
                continue
            g = self.giris(hedef)
            if g is not None and self.makale_mi(g):
                a["href"] = "#/wiki/%s/%s" % (self.id, quote(g.path))
                if capa:
                    a["data-capa"] = capa[1:]
            else:
                a["href"] = (self.zim_url(hedef) or "") + capa
                a["target"] = "_blank"
        # Vikipedi'nin sabit genişlik / kaydırma (float) ayarlarını temizle:
        # bunlar okuma sütununu daraltıyordu. Renk vb. diğer stiller korunur.
        yasak = re.compile(r"^\s*(float|clear|width|min-width|max-width|margin[a-z-]*|position|left|right|top)\s*:", re.I)
        for el in govde.find_all(style=True):
            temiz = [d for d in el["style"].split(";") if d.strip() and not yasak.match(d)]
            if temiz:
                el["style"] = ";".join(temiz)
            else:
                del el["style"]
        for el in govde.find_all(attrs={"align": True}):
            del el["align"]
        for el in govde.find_all(["table", "div", "td", "th"], attrs={"width": True}):
            del el["width"]
        # bölüm başlıkları (içindekiler için)
        icindekiler = []
        for i, h in enumerate(govde.find_all(["h2", "h3"])):
            metin = h.get_text(" ", strip=True)
            if not metin:
                continue
            if not h.get("id"):
                h["id"] = "bolum-%d" % i
            icindekiler.append({"id": h["id"], "metin": metin, "seviye": int(h.name[1])})
        # <details> bölümlerini açık getir
        for d in govde.find_all("details"):
            d["open"] = ""
        icerik = govde.decode_contents() if hasattr(govde, "decode_contents") else str(govde)
        oz = self.ozet(e.path)
        kelime = len(re.findall(r"\w+", govde.get_text(" ")))
        return {
            "z": self.id,
            "yol": e.path,
            "baslik": baslik,
            "html": icerik,
            "icindekiler": icindekiler,
            "resim": oz["resim"] if oz else None,
            "kaynak": self.baslik,
            "okuma_dk": max(1, round(kelime / 200)),
        }


class Vikipedi:
    def __init__(self, kok, klasorler):
        self.kok = kok
        self.zimler = OrderedDict()
        bulunan = []
        aranacak = [kok] + [os.path.join(kok, k) for k in klasorler]
        for d in aranacak:
            if not os.path.isdir(d):
                continue
            for ad in sorted(os.listdir(d)):
                if ad.lower().endswith(".zim"):
                    tam = os.path.join(d, ad)
                    if tam not in bulunan:
                        bulunan.append(tam)
        for i, yol in enumerate(bulunan):
            try:
                self.zimler[str(i)] = ZimDosyasi(str(i), yol)
                print("ZIM yüklendi:", yol)
            except Exception as ex:
                print("ZIM açılamadı:", yol, ex)

    def var_mi(self):
        return bool(self.zimler)

    def al(self, zid):
        return self.zimler.get(zid)

    def liste(self):
        cikti = []
        for z in self.zimler.values():
            try:
                adet = z.arsiv.article_count
            except Exception:
                adet = 0
            cikti.append({"id": z.id, "baslik": z.baslik, "dosya": os.path.basename(z.yol),
                          "makale": adet, "aciklama": z.aciklama,
                          "ana": z.ana_sayfa_yolu(),
                          "boyut": os.path.getsize(z.yol)})
        return cikti

    def ara(self, sorgu, bas=0, adet=10):
        terimler = [t for t in re.findall(r"\w+", sorgu.lower()) if len(t) > 2]
        toplam, sonuc = 0, []
        for z in self.zimler.values():
            try:
                r = z.ara(sorgu, bas, adet)
            except Exception as ex:
                print("arama hatası", ex)
                continue
            toplam += r["toplam"]
            ana = z.ana_sayfa_yolu()
            for y in r["yollar"]:
                if y == ana:
                    continue
                oz = z.ozet(y, terimler)
                if oz:
                    sonuc.append(oz)
        # tam başlık eşleşmesini öne al
        sl = sorgu.strip().lower()
        sonuc.sort(key=lambda o: 0 if o["baslik"].lower() == sl else 1)
        return {"toplam": toplam, "sonuclar": sonuc}

    def oneriler(self, sorgu, adet=8):
        cikti = []
        for z in self.zimler.values():
            try:
                for o in z.oneriler(sorgu, adet):
                    o["z"] = z.id
                    cikti.append(o)
            except Exception:
                pass
        return cikti[:adet]

    def havuzu_baslat(self):
        """Keşfet kartları için arka planda rastgele makaleler hazırlar.
        Büyük ZIM dosyası yavaş bir diskteyken sayfaların beklememesi için."""
        import collections
        self.havuz = collections.deque(maxlen=60)
        if not self.zimler:
            return

        def doldur():
            import time
            while True:
                if len(self.havuz) < 40:
                    try:
                        z = random.choice(list(self.zimler.values()))
                        for o in z.rastgele(3):
                            self.havuz.append(o)
                    except Exception as ex:
                        print("keşfet havuzu hatası", ex)
                        time.sleep(5)
                    time.sleep(0.3)
                else:
                    time.sleep(2)
        threading.Thread(target=doldur, daemon=True).start()

    def rastgele(self, adet=6):
        if not self.zimler:
            return []
        havuz = getattr(self, "havuz", None)
        cikti = []
        while havuz and len(cikti) < adet:
            try:
                cikti.append(havuz.popleft())
            except IndexError:
                break
        if len(cikti) < min(adet, 2):
            # havuz henüz dolmadıysa az sayıda makaleyi doğrudan getir
            z = random.choice(list(self.zimler.values()))
            cikti += z.rastgele(min(adet, 3) - len(cikti))
        cikti.sort(key=lambda o: 0 if o.get("resim") else 1)
        return cikti
