"""Portal — harici diski çevrimdışı bir "internet" gibi gezmeni sağlayan yerel sunucu.

Çalıştırma:  python app.py
Tarayıcı:    http://localhost:8765

GÜVENLİK
- Diskteki dosyaların hiçbiri değiştirilmez, taşınmaz, silinmez. Her şey SADECE OKUNUR.
- Program yalnızca Portal/veri klasörüne yazar (indeks + küçük resimler).
- Varsayılan olarak yalnızca bu bilgisayardan (127.0.0.1) erişilebilir.
"""
import os
import sys
import json
import time
import socket
import threading
import subprocess
import webbrowser
import urllib.request

BURASI = os.path.dirname(os.path.abspath(__file__))
PORTAL = os.path.dirname(BURASI)              # .../Portal
KOK = os.path.dirname(PORTAL)                 # diskin kökü (E:\ gibi)
VERI = os.path.join(PORTAL, "veri")
os.makedirs(VERI, exist_ok=True)

# günlük dosyası (pythonw penceresiz çalıştığında hatalar burada görünür)
if sys.stdout is None or not sys.stdout.isatty():
    try:
        _gunluk = open(os.path.join(VERI, "gunluk.txt"), "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = _gunluk
    except Exception:
        pass

VARSAYILAN_AYARLAR = {
    "port": 8765,
    "agda_paylas": False,
    "tarayiciyi_ac": True,
    "uygulama_penceresi": False,
    "sadece_kategori_klasorleri": False,
    "klasorler": {
        "video": ["Videolar", "Video", "Videos", "Filmler", "Diziler", "Belgeseller"],
        "foto": ["Fotoğraflar", "Fotograflar", "Fotolar", "Resimler", "Photos", "Pictures"],
        "muzik": ["Müzik", "Muzik", "Müzikler", "Muzikler", "Music"],
        "belge": ["Belgeler", "Dokümanlar", "Dokumanlar", "Documents", "Kitaplar"],
    },
    "vikipedi_klasorleri": ["Vikipedi", "Wikipedia", "Kiwix", "ZIM"],
    "ek_klasorler": {},
    "ad": "Portal",
}


def ayarlari_oku():
    yol = os.path.join(PORTAL, "ayarlar.json")
    a = json.loads(json.dumps(VARSAYILAN_AYARLAR))
    try:
        with open(yol, encoding="utf-8-sig") as f:
            k = json.load(f)
        for anahtar, deger in k.items():
            if isinstance(deger, dict) and isinstance(a.get(anahtar), dict):
                a[anahtar].update(deger)
            else:
                a[anahtar] = deger
    except FileNotFoundError:
        pass
    except Exception as ex:
        print("ayarlar.json okunamadı, varsayılanlar kullanılıyor:", ex)
    return a


AYAR = ayarlari_oku()
PORT = int(AYAR["port"])
ADRES = "http://localhost:%d/" % PORT


def tarayici_ac():
    if not AYAR.get("tarayiciyi_ac", True):
        return
    if AYAR.get("uygulama_penceresi") and os.name == "nt":
        for edge in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                     r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"):
            if os.path.exists(edge):
                subprocess.Popen([edge, "--app=" + ADRES, "--start-maximized"])
                return
    webbrowser.open(ADRES)


def zaten_calisiyor():
    try:
        with urllib.request.urlopen(ADRES + "api/merhaba", timeout=1.5) as r:
            return b"portal" in r.read()
    except Exception:
        return False


if __name__ == "__main__" and zaten_calisiyor():
    # Portal zaten açık: sadece tarayıcıyı göster
    tarayici_ac()
    sys.exit(0)

from flask import Flask, jsonify, request, send_file, send_from_directory, Response, abort
from kutuphane import Kutuphane, UZANTILAR
from vikipedi import Vikipedi

ARAYUZ = os.path.join(BURASI, "arayuz")
app = Flask(__name__, static_folder=None)
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False

kutup = Kutuphane(KOK, VERI, AYAR)
viki = Vikipedi(KOK, AYAR.get("vikipedi_klasorleri", []))
from saglik import DiskSagligi
saglik = DiskSagligi(KOK, kutup)


BOS_GIF = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")


@app.errorhandler(Exception)
def hata_yakala(ex):
    """Beklenmeyen hataları günlüğe yazar ve arayüze anlaşılır bir mesaj döndürür."""
    from werkzeug.exceptions import HTTPException
    if isinstance(ex, HTTPException):
        return ex
    import traceback
    traceback.print_exc()
    return jsonify({"hata": "%s: %s" % (type(ex).__name__, ex)}), 500


def yerel_istek():
    return request.remote_addr in ("127.0.0.1", "::1")


# ---------------- arayüz ----------------
@app.route("/")
def ana():
    return send_from_directory(ARAYUZ, "index.html", max_age=0)


@app.route("/arayuz/<path:ad>")
def arayuz(ad):
    return send_from_directory(ARAYUZ, ad, max_age=0)


@app.route("/api/merhaba")
def merhaba():
    return "portal"


@app.route("/api/durum")
def durum():
    try:
        import shutil
        disk = shutil.disk_usage(KOK)
        disk = {"toplam": disk.total, "bos": disk.free}
    except Exception:
        disk = None
    return jsonify({
        "ad": AYAR.get("ad", "Portal"),
        "kok": KOK,
        "tarama": kutup.tarama,
        "istatistik": kutup.istatistik(),
        "vikipedi": viki.liste(),
        "disk": disk,
        "ffmpeg": bool(kutup.ffmpeg),
        "klasorler": {t: [kutup.goreli(k) for k in kutup.kategori_klasorleri(t)] for t in UZANTILAR},
    })


# ---------------- medya ----------------
@app.route("/api/medya")
def medya_liste():
    tur = request.args.get("tur", "video")
    return jsonify(kutup.liste(
        tur, request.args.get("sira", "yeni"), request.args.get("klasor") or None,
        int(request.args.get("bas", 0)), min(int(request.args.get("adet", 60)), 500),
        request.args.get("ara") or None,
        [e for e in request.args.getlist("etiket") if e],
        float(request.args["t1"]) if request.args.get("t1") else None,
        float(request.args["t2"]) if request.args.get("t2") else None))


@app.route("/api/medya/<int:mid>")
def medya_tek(mid):
    m = kutup.al(mid)
    if not m:
        abort(404)
    return jsonify(m)


@app.route("/api/klasorler")
def klasorler():
    return jsonify(kutup.klasorler(request.args.get("tur", "video")))


@app.route("/api/klasor-ozet")
def klasor_ozet():
    return jsonify(kutup.klasor_ozet(request.args.get("yol", "")))


@app.route("/api/oneriler/<int:mid>")
def oneriler(mid):
    return jsonify(kutup.oneriler(mid, int(request.args.get("adet", 20))))


@app.route("/api/ana")
def ana_sayfa_verisi():
    return jsonify({
        "devam": kutup.devam(8),
        "onerilen": kutup.onerilen("video", 12),
        "fotolar": kutup.liste("foto", "yeni", adet=12),
        "muzik": kutup.onerilen("muzik", 10),
        "belgeler": kutup.liste("belge", "eklenme", adet=6),
        "sayilar": {t: kutup.say(t) for t in UZANTILAR},
    })


@app.route("/api/izleme/<int:mid>", methods=["POST"])
def izleme(mid):
    v = request.get_json(force=True, silent=True) or {}
    kutup.izleme_kaydet(mid, float(v.get("konum") or 0), v.get("sure"), bool(v.get("bitti")))
    return jsonify({"ok": True})


@app.route("/api/ad/<int:mid>", methods=["POST"])
def ad_degistir(mid):
    """Dosyaya Portal içinde görünen bir ad verir. Diskteki dosyanın adı DEĞİŞMEZ."""
    v = request.get_json(force=True, silent=True) or {}
    m = kutup.ad_ver(mid, v.get("ad"))
    if not m:
        abort(404)
    return jsonify(m)


@app.route("/api/etiketler")
def etiketler():
    return jsonify(kutup.etiket_listesi())


@app.route("/api/etiketler", methods=["POST"])
def etiket_olustur():
    v = request.get_json(force=True, silent=True) or {}
    ad = kutup.etiket_olustur(v.get("ad"))
    if not ad:
        abort(400)
    return jsonify({"ad": ad})


@app.route("/api/etiket-duzenle", methods=["POST"])
def etiket_duzenle():
    v = request.get_json(force=True, silent=True) or {}
    return jsonify({"ok": kutup.etiket_yeniden_adlandir(v.get("eski"), v.get("yeni"))})


@app.route("/api/etiket-sil", methods=["POST"])
def etiket_sil():
    v = request.get_json(force=True, silent=True) or {}
    return jsonify({"ok": kutup.etiket_sil(v.get("ad"))})


@app.route("/api/medya/<int:mid>/etiketler", methods=["POST"])
def medya_etiket(mid):
    v = request.get_json(force=True, silent=True) or {}
    m = kutup.etiket_ata(mid, v.get("etiketler") or [])
    if not m:
        abort(404)
    return jsonify(m)


@app.route("/api/sil/<int:mid>", methods=["POST"])
def sil(mid):
    """Dosyayı çöp kutusuna (Portal\\Cop) taşır; geri alınabilir."""
    if not yerel_istek():
        abort(403)
    try:
        r = kutup.sil(mid)
    except OSError as ex:
        return jsonify({"hata": "Dosya taşınamadı: %s" % ex}), 500
    if not r:
        abort(404)
    return jsonify(r)


@app.route("/api/cop")
def cop():
    return jsonify(kutup.cop_liste())


@app.route("/api/cop/geri/<cid>", methods=["POST"])
def cop_geri(cid):
    if not yerel_istek():
        abort(403)
    r = kutup.geri_al(cid)
    if not r:
        abort(404)
    return jsonify(r)


@app.route("/api/cop/bosalt", methods=["POST"])
def cop_bosalt():
    if not yerel_istek():
        abort(403)
    v = request.get_json(force=True, silent=True) or {}
    return jsonify({"silinen": kutup.cop_bosalt(v.get("id"))})


@app.route("/kucuk/<int:mid>")
def kucuk(mid):
    y = kutup.kucuk_resim(mid, bekleme=False)
    if y == "MESGUL":
        r = Response("mesgul", status=503)
        r.headers["Retry-After"] = "2"
        return r
    if not y:
        # küçük resim yok: 1x1 saydam GIF (tarayıcı tekrar istemesin)
        r = Response(BOS_GIF, mimetype="image/gif")
        r.headers["Cache-Control"] = "public, max-age=86400"
        return r
    return send_file(y, mimetype="image/jpeg", max_age=86400 * 30)


@app.route("/dosya/<int:mid>")
def dosya(mid):
    m = kutup.al(mid)
    if not m:
        abort(404)
    tam = kutup.tam_yol(m["yol"])
    if not os.path.exists(tam):
        abort(404)
    return send_file(tam, conditional=True, max_age=3600,
                     as_attachment=request.args.get("indir") == "1",
                     download_name=os.path.basename(tam))


@app.route("/goruntu/<int:mid>")
def goruntu(mid):
    """Fotoğrafı tam boyda verir; tarayıcının açamadığı biçimleri (HEIC vb.) JPEG'e çevirir."""
    from kutuphane import TARAYICI_FOTO
    m = kutup.al(mid)
    if not m:
        abort(404)
    if m["uzanti"] in TARAYICI_FOTO:
        return send_file(kutup.tam_yol(m["yol"]), conditional=True, max_age=3600)
    try:
        y = kutup.buyuk_goruntu(mid)
    except Exception as ex:
        print("görüntü çevrilemedi", m["yol"], ex)
        abort(415)
    return send_file(y, mimetype="image/jpeg", max_age=86400)


@app.route("/api/takvim")
def takvim():
    return jsonify(kutup.takvim())


@app.route("/api/gecmiste-bugun")
def gecmiste_bugun():
    return jsonify(kutup.gecmiste_bugun(adet=min(int(request.args.get("adet", 8)), 2000)))


@app.route("/api/saglik")
def saglik_bilgi():
    return jsonify(saglik.durum(yenile=request.args.get("yenile") == "1"))


@app.route("/api/saglik/kontrol", methods=["POST"])
def saglik_kontrol():
    if not yerel_istek():
        abort(403)
    saglik.kontrol_baslat()
    return jsonify({"ok": True})


@app.route("/akis/<int:mid>")
def akis(mid):
    """Tarayıcının doğrudan oynatamadığı videolar (mkv, avi, wmv...) için anlık dönüştürme."""
    m = kutup.al(mid)
    if not m or not kutup.ffmpeg:
        abort(404)
    tam = kutup.tam_yol(m["yol"])
    bilgi = kutup.video_bilgi(tam)
    bas = float(request.args.get("t", 0) or 0)
    v_codec = ["-c:v", "copy"] if bilgi["video"] in ("h264",) else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]
    a_codec = ["-c:a", "copy"] if bilgi["ses"] in ("aac", "mp3") else ["-c:a", "aac", "-b:a", "192k", "-ac", "2"]
    komut = [kutup.ffmpeg, "-hide_banner", "-loglevel", "error"]
    if bas > 0:
        komut += ["-ss", "%.2f" % bas]
    komut += ["-i", tam, "-map", "0:v:0", "-map", "0:a:0?", *v_codec, *a_codec,
              "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"]
    p = subprocess.Popen(komut, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    def uret():
        try:
            while True:
                parca = p.stdout.read(256 * 1024)
                if not parca:
                    break
                yield parca
        finally:
            try:
                p.kill()
            except Exception:
                pass
    r = Response(uret(), mimetype="video/mp4")
    r.headers["X-Sure"] = str(bilgi["sure"] or "")
    return r


@app.route("/api/videobilgi/<int:mid>")
def videobilgi(mid):
    m = kutup.al(mid)
    if not m:
        abort(404)
    return jsonify(kutup.video_bilgi(kutup.tam_yol(m["yol"])))


@app.route("/altyazi/<int:mid>")
def altyazi(mid):
    """Videonun yanındaki .srt / .vtt dosyasını WebVTT olarak verir."""
    m = kutup.al(mid)
    if not m:
        abort(404)
    tam = kutup.tam_yol(m["yol"])
    govde = os.path.splitext(tam)[0]
    for uz in (".vtt", ".tr.srt", ".tur.srt", ".srt"):
        if os.path.exists(govde + uz):
            ham = open(govde + uz, "rb").read()
            for kod in ("utf-8-sig", "cp1254", "latin-1"):
                try:
                    metin = ham.decode(kod)
                    break
                except UnicodeDecodeError:
                    continue
            if not uz.endswith(".vtt"):
                import re
                metin = "WEBVTT\n\n" + re.sub(r"(\d\d:\d\d:\d\d),(\d\d\d)", r"\1.\2", metin.replace("\r", ""))
            return Response(metin, mimetype="text/vtt")
    return Response(status=204)


# ---------------- tüm dosyalar (salt okunur gezgin) ----------------
@app.route("/api/gez")
def gez():
    goreli = request.args.get("yol", "")
    try:
        tam = kutup.tam_yol(goreli)
    except PermissionError:
        abort(403)
    if not os.path.isdir(tam):
        abort(404)
    ogeler = []
    try:
        adlar = os.listdir(tam)
    except OSError:
        adlar = []
    for ad in adlar:
        if ad.lower() in ("system volume information", "$recycle.bin") or ad.startswith("."):
            continue
        y = os.path.join(tam, ad)
        try:
            st = os.stat(y)
        except OSError:
            continue
        ogeler.append({"ad": ad, "yol": kutup.goreli(y), "klasor": os.path.isdir(y),
                       "boyut": st.st_size, "mtime": st.st_mtime})
    ogeler.sort(key=lambda o: (not o["klasor"], o["ad"].lower()))
    # indekslenmiş dosyaların id'leri (önizleme için)
    yollar = [o["yol"] for o in ogeler if not o["klasor"]]
    if yollar:
        q = "SELECT id, yol, tur FROM medya WHERE yol IN (%s)" % ",".join("?" * len(yollar))
        eslesme = {r["yol"]: (r["id"], r["tur"]) for r in kutup.db().execute(q, yollar)}
        for o in ogeler:
            if o["yol"] in eslesme:
                o["id"], o["tur"] = eslesme[o["yol"]]
    return jsonify({"yol": kutup.goreli(tam) if goreli else "", "ogeler": ogeler})


@app.route("/ham")
def ham():
    try:
        tam = kutup.tam_yol(request.args.get("yol", ""))
    except PermissionError:
        abort(403)
    if not os.path.isfile(tam):
        abort(404)
    return send_file(tam, conditional=True, as_attachment=request.args.get("indir") == "1")


@app.route("/api/ac", methods=["POST"])
def ac():
    """Dosyayı bilgisayardaki varsayılan programla açar ya da klasörünü gösterir (sadece bu bilgisayardan)."""
    if not yerel_istek():
        abort(403)
    v = request.get_json(force=True, silent=True) or {}
    try:
        tam = kutup.tam_yol(v.get("yol", ""))
    except PermissionError:
        abort(403)
    if not os.path.exists(tam):
        abort(404)
    if os.name == "nt":
        if v.get("klasorde"):
            subprocess.Popen(["explorer", "/select,", tam])
        else:
            os.startfile(tam)  # noqa
    else:
        subprocess.Popen(["xdg-open", tam if not v.get("klasorde") else os.path.dirname(tam)])
    return jsonify({"ok": True})


# ---------------- arama ----------------
@app.route("/api/ara")
def ara():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"q": q, "vikipedi": {"toplam": 0, "sonuclar": []}, "dosyalar": {}})
    bas = int(request.args.get("bas", 0))
    t0 = time.time()
    v = viki.ara(q, bas, 10) if viki.var_mi() else {"toplam": 0, "sonuclar": []}
    d = kutup.ara(q) if bas == 0 else {}
    if bas == 0:
        from kutuphane import katla
        kq = katla(q)
        d["klasorler"] = [k for k in kutup.klasor_ozet("")["klasorler"] if kq in katla(k["ad"])][:12]
    return jsonify({"q": q, "vikipedi": v, "dosyalar": d, "sure": round(time.time() - t0, 2)})


@app.route("/api/oner")
def oner():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([])
    sonuc = [{"tur": "wiki", **o} for o in viki.oneriler(q, 7)]
    for tur, l in kutup.ara(q, 3).items():
        for m in l[:2]:
            sonuc.append({"tur": tur, "id": m["id"], "baslik": m.get("baslik") or m["ad"]})
    return jsonify(sonuc[:10])


# ---------------- vikipedi ----------------
@app.route("/api/wiki/makale")
def wiki_makale():
    z = viki.al(request.args.get("z", "0"))
    if not z:
        abort(404)
    yol = request.args.get("yol") or z.ana_sayfa_yolu()
    m = z.makale(yol)
    if not m:
        abort(404)
    return jsonify(m)


@app.route("/api/wiki/kesfet")
def wiki_kesfet():
    return jsonify(viki.rastgele(min(int(request.args.get("adet", 6)), 24)))


@app.route("/api/wiki/rastgele")
def wiki_rastgele():
    l = viki.rastgele(1)
    return jsonify(l[0] if l else None)


@app.route("/zim/<zid>/<path:yol>")
def zim_ham(zid, yol):
    z = viki.al(zid)
    if not z:
        abort(404)
    icerik, mime = z.icerik(yol)
    if icerik is None:
        abort(404)
    r = Response(icerik, mimetype=mime or "application/octet-stream")
    r.headers["Cache-Control"] = "public, max-age=2592000"
    return r


# ---------------- yönetim ----------------
@app.route("/api/yeniden-tara", methods=["POST"])
def yeniden_tara():
    kutup.tara_arkaplanda()
    viki.havuzu_baslat()
    return jsonify({"ok": True})


@app.route("/api/kapat", methods=["POST"])
def kapat():
    """Diski güvenle çıkarabilmek için Portal'ı kapatır."""
    if not yerel_istek():
        abort(403)
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return jsonify({"ok": True})


def disk_bekcisi():
    """Disk çıkarılırsa programı kapatır."""
    while True:
        time.sleep(4)
        if not os.path.exists(os.path.join(PORTAL, "portal.kimlik")) and not os.path.exists(PORTAL):
            os._exit(0)


def baslat():
    host = "0.0.0.0" if AYAR.get("agda_paylas") else "127.0.0.1"
    kutup.tara_arkaplanda()
    threading.Thread(target=disk_bekcisi, daemon=True).start()

    def hazir_olunca_ac():
        for _ in range(60):
            try:
                with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
                    break
            except OSError:
                time.sleep(0.25)
        tarayici_ac()
    threading.Thread(target=hazir_olunca_ac, daemon=True).start()
    print("Portal çalışıyor →", ADRES, "| disk:", KOK)
    try:
        from waitress import serve
        serve(app, host=host, port=PORT, threads=32, channel_timeout=300, connection_limit=200)
    except ImportError:
        app.run(host=host, port=PORT, threaded=True)


if __name__ == "__main__":
    baslat()
