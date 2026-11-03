/* Portal arayüzü — tek sayfalık uygulama (internet gerektirmez) */
"use strict";

/* küçük resim sunucusu meşgulse birkaç kez tekrar dener; hiç yoksa resmi kaldırır */
function kucukHata(img, gizle) {
  const n = +(img.dataset.n || 0);
  if (img.src.includes("/kucuk/") && n < 6) {
    img.dataset.n = n + 1;
    setTimeout(() => { if (img.isConnected) img.src = img.src.split("?")[0] + "?d=" + (n + 1); }, 900 + n * 900 + Math.random() * 600);
    return;
  }
  if (gizle) img.style.opacity = 0; else img.remove();
}
const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const sayfa = $("#sayfa");
const DURUM = { bilgi: null, wikiVar: false };

/* ---------------- yardımcılar ---------------- */
async function api(url, secenek) {
  const r = await fetch(url, secenek);
  if (!r.ok) throw new Error(r.status + " " + url);
  return r.json();
}
const post = (url, veri) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(veri || {}) });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function sureFmt(s) {
  if (!s && s !== 0) return "";
  s = Math.round(s);
  const sa = Math.floor(s / 3600), dk = Math.floor((s % 3600) / 60), sn = s % 60;
  return (sa ? sa + ":" + String(dk).padStart(2, "0") : dk) + ":" + String(sn).padStart(2, "0");
}
function boyutFmt(b) {
  if (b == null) return "";
  const b1 = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < b1.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + " " + b1[i];
}
const tarihFmt = (ts, ops) => ts ? new Date(ts * 1000).toLocaleDateString("tr-TR", ops || { day: "numeric", month: "long", year: "numeric" }) : "";
function goreceTarih(ts) {
  if (!ts) return "";
  const fark = Date.now() / 1000 - ts;
  const birim = [[31536000, "yıl"], [2592000, "ay"], [604800, "hafta"], [86400, "gün"], [3600, "saat"], [60, "dakika"]];
  for (const [s, ad] of birim) if (fark >= s) return Math.floor(fark / s) + " " + ad + " önce";
  return "az önce";
}
function renk(metin) {
  let h = 0;
  for (const c of String(metin)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}
const wikiYol = (y) => String(y).split("/").map(encodeURIComponent).join("/");
const klasorAdi = (k) => (k || "").split("/").filter(Boolean).pop() || "Disk";
const bas = (s) => (s || "?").trim().charAt(0).toLocaleUpperCase("tr-TR");
function bildir(metin, sure = 3200, eylem) {
  const b = $("#bildirim");
  b.textContent = metin;
  if (eylem) {
    const d = document.createElement("button");
    d.className = "bildirim-eylem";
    d.textContent = eylem.metin;
    d.onclick = () => { b.hidden = true; eylem.fn(); };
    b.appendChild(d);
  }
  b.hidden = false;
  clearTimeout(bildir.z);
  bildir.z = setTimeout(() => (b.hidden = true), sure);
}
function vurgula(metin, sorgu) {
  let h = esc(metin);
  const kelimeler = (sorgu || "").toLocaleLowerCase("tr-TR").split(/\s+/).filter((k) => k.length > 2);
  for (const k of kelimeler) {
    const re = new RegExp("(" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    h = h.replace(re, "<mark>$1</mark>");
  }
  return h;
}
function sorguAyir() {
  const h = location.hash.slice(1) || "/";
  const [yol, q] = h.split("?");
  return { parcalar: yol.split("/").filter(Boolean), q: new URLSearchParams(q || "") };
}

const IKON = {
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" class="dolu"/></svg>',
  foto: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  muzik: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  belge: '<svg viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  wiki: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  klasor: '<svg viewBox="0 0 24 24" class="klasor-ikon"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  dosya: '<svg viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>',
  ara: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  karisik: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  oynat: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" class="dolu"/></svg>',
  durdur: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" class="dolu"/></svg>',
  ac: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  indir: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  geri: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
  zar: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" class="dolu"/><circle cx="15" cy="15" r="1.2" class="dolu"/><circle cx="15" cy="9" r="1.2" class="dolu"/><circle cx="9" cy="15" r="1.2" class="dolu"/></svg>',
  yenile: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  kalkan: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
};
const UZ_RENK = { pdf: "#d63c2f", doc: "#2b5bb8", docx: "#2b5bb8", xls: "#1e7a45", xlsx: "#1e7a45", csv: "#1e7a45", ppt: "#c4501e", pptx: "#c4501e", txt: "#6b6b6b", md: "#6b6b6b", epub: "#7a4bb8" };

function kucukResim(m, cls = "") {
  return `<div class="yer-tutucu">${IKON[m.tur] || IKON.dosya}</div><img class="${cls}" loading="lazy" src="/kucuk/${m.id}" alt="" onerror="kucukHata(this)" onload="if(this.naturalWidth<2)this.remove()" style="position:relative">`;
}

/* ---------------- kart şablonları ---------------- */
/* ---------------- ad değiştirme ----------------
   Diskteki dosyanın adı değişmez; Portal'da görünen ad olarak saklanır ve aramada bulunur. */
const COP = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
const KALEM = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
function adAlani(m) {
  if (!m.id) return esc(m.ad);
  return `<span class="ad-metin" data-ad-id="${m.id}" title="Değiştirmek için çift tıkla">${esc(m.ad)}</span><button type="button" class="kalem" data-ad-id="${m.id}" title="Adını değiştir" aria-label="Adını değiştir">${KALEM}</button><button type="button" class="kalem cop-btn" data-sil-id="${m.id}" title="Sil (çöp kutusuna taşı)" aria-label="Sil">${COP}</button>`;
}
function adDuzenle(id, cagiran) {
  const kaynak = cagiran.closest("h1, h3, h4, b, #ikBilgi")?.querySelector(`.ad-metin[data-ad-id="${id}"]`) || $(`.ad-metin[data-ad-id="${id}"]`);
  if (!kaynak || kaynak.dataset.duzenleniyor) return;
  kaynak.dataset.duzenleniyor = "1";
  const eski = kaynak.textContent;
  const kutu = document.createElement("input");
  kutu.className = "ad-kutu";
  kutu.value = eski;
  kutu.placeholder = "Yeni ad (boş bırakırsan dosya adı kullanılır)";
  kaynak.hidden = true;
  kaynak.after(kutu);
  kutu.focus();
  kutu.select();
  let bitti = false;
  const kapat = () => { kutu.remove(); kaynak.hidden = false; delete kaynak.dataset.duzenleniyor; };
  async function kaydet() {
    if (bitti) return;
    bitti = true;
    const yeni = kutu.value.trim();
    if (yeni === eski) return kapat();
    try {
      const m = await post("/api/ad/" + id, { ad: yeni });
      $$(`.ad-metin[data-ad-id="${id}"]`).forEach((s) => (s.textContent = m.ad));
      for (const l of [IK.liste, CALAR.liste]) l.forEach((x) => { if (x.id === +id) { x.ad = m.ad; if (x.tur === "muzik") x.baslik = m.ad; } });
      if (CALAR.liste[CALAR.i]?.id === +id) $("#calarBaslik").textContent = m.ad;
      if (location.hash.startsWith("#/izle/" + id)) document.title = m.ad + " — Portal";
      bildir(yeni ? "Ad kaydedildi. Aramada bu adla bulabilirsin." : "Özel ad kaldırıldı, dosya adı kullanılıyor.");
    } catch (e) {
      bildir("Ad kaydedilemedi.");
    }
    kapat();
  }
  kutu.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); kaydet(); }
    if (e.key === "Escape") { bitti = true; kapat(); }
  });
  kutu.addEventListener("blur", kaydet);
  ["click", "mousedown", "dblclick"].forEach((t) => kutu.addEventListener(t, (e) => { e.stopPropagation(); e.preventDefault(); }));
}
/* ---------------- etiketler ----------------
   Kendi etiketlerini oluşturup video/fotoğraflara ekleyebilirsin (ör. "Zara").
   Aramada etiket adı yazınca o etiketli dosyalar gelir. Dosyalara dokunulmaz. */
const ETK_IKON = '<svg viewBox="0 0 24 24"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6" class="dolu"/></svg>';
const etiketHref = (adlar, tur) => "#/etiket?" + [].concat(adlar).map((a) => "ad=" + encodeURIComponent(a)).join("&") + (tur ? "&tur=" + tur : "");
const MEDYA_ONBELLEK = new Map();
function medyaHatirla(m) { if (m && m.id) MEDYA_ONBELLEK.set(m.id, m); return m; }
/* Tüm etiketlerin listesi (hızlı etiketleme için hafızada tutulur) */
let ETIKETLER = [];
async function etiketleriYenile() { try { ETIKETLER = await api("/api/etiketler"); } catch (e) {} return ETIKETLER; }
/* Etiketi olmayan dosyanın altında tüm etiketler sırayla görünür; birine tıklayınca
   o etiket eklenir ve liste kaybolur. Sonradan değiştirmek için "Etiket" düğmesi. */
function hizliEtiketler(m, kucuk = false) {
  if (!ETIKETLER.length) return kucuk ? "" : `<button type="button" class="etiket-ekle" data-etk-ekle="${m.id}">+ Etiket oluştur</button>`;
  return `<span class="hizli-etiketler${kucuk ? " kucuk" : ""}">${ETIKETLER.map((e) => `<button type="button" class="hizli-etk" data-hizli-id="${m.id}" data-hizli-ad="${esc(e.ad)}">${esc(e.ad)}</button>`).join("")}${kucuk ? "" : `<button type="button" class="etiket-ekle" data-etk-ekle="${m.id}" title="Yeni etiket oluştur">+ Yeni</button>`}</span>`;
}
function etiketKucuk(m) {
  medyaHatirla(m);
  const ic = m.etiketler?.length ? m.etiketler.map((e) => `<span>#${esc(e)}</span>`).join("") : hizliEtiketler(m, true);
  return `<div class="etiket-kucuk" data-etk-kucuk="${m.id}">${ic}</div>`;
}
function etiketSatiri(m) {
  medyaHatirla(m);
  if (!m.etiketler?.length) return `<div class="etiket-satiri etiketsiz" data-etk-id="${m.id}">${ETK_IKON}${hizliEtiketler(m)}</div>`;
  return `<div class="etiket-satiri" data-etk-id="${m.id}">${ETK_IKON}
    ${m.etiketler.map((e) => `<a class="etiket-cip" href="${etiketHref(e)}">${esc(e)}<button type="button" class="etiket-cikar" data-cikar="${esc(e)}" title="Bu etiketi kaldır">×</button></a>`).join("")}
    <button type="button" class="etiket-ekle" data-etk-ekle="${m.id}">${ETK_IKON}Etiket</button></div>`;
}
async function etiketleriKaydet(id, liste) {
  const m = await post(`/api/medya/${id}/etiketler`, { etiketler: liste });
  medyaHatirla(m);
  $$(`.etiket-satiri[data-etk-id="${id}"]`).forEach((el) => (el.outerHTML = etiketSatiri(m)));
  $$(`[data-etk-kucuk="${id}"]`).forEach((el) => (el.outerHTML = etiketKucuk(m)));
  $$(`[data-foto-etk="${id}"]`).forEach((el) => (el.outerHTML = fotoEtiket(m)));
  // yeni etiket oluştuysa diğer dosyalardaki hızlı listeler de güncellensin
  const onceki = ETIKETLER.map((e) => e.ad).join("|");
  await etiketleriYenile();
  if (ETIKETLER.map((e) => e.ad).join("|") !== onceki) hizliListeleriTazele();
  for (const l of [IK.liste, CALAR.liste]) l.forEach((x) => { if (x.id === m.id) x.etiketler = m.etiketler; });
  return m;
}
function hizliListeleriTazele() {
  $$(".etiket-satiri.etiketsiz").forEach((el) => { const m = MEDYA_ONBELLEK.get(+el.dataset.etkId); if (m) el.outerHTML = etiketSatiri(m); });
  $$("[data-etk-kucuk]").forEach((el) => { const m = MEDYA_ONBELLEK.get(+el.dataset.etkKucuk); if (m && !m.etiketler?.length) el.outerHTML = etiketKucuk(m); });
  $$("[data-foto-etk]").forEach((el) => { const m = MEDYA_ONBELLEK.get(+el.dataset.fotoEtk); if (m && !m.etiketler?.length) el.outerHTML = fotoEtiket(m); });
}
function fotoEtiket(m) {
  medyaHatirla(m);
  const ic = m.etiketler?.length ? m.etiketler.map((e) => `<span>#${esc(e)}</span>`).join("") : hizliEtiketler(m, true);
  return `<span class="foto-etk${m.etiketler?.length ? " dolu" : ""}" data-foto-etk="${m.id}">${ic}</span>`;
}
async function etiketSecici(id, cagiran) {
  $(".etiket-secici")?.remove();
  let m = MEDYA_ONBELLEK.get(+id) || (await api("/api/medya/" + id));
  let tum = await api("/api/etiketler");
  const kutu = document.createElement("div");
  kutu.className = "etiket-secici";
  kutu.innerHTML = `<div class="es-ust"><input type="search" placeholder="Etiket ara ya da yeni yaz…" autocomplete="off"><button type="button" class="kucuk-btn es-tamam">Tamam</button></div>
    <div class="es-liste"></div><div class="es-alt">Birden fazla etiket seçebilirsin. Enter ile yeni etiket oluşur.</div>`;
  document.body.appendChild(kutu);
  const r = cagiran.getBoundingClientRect();
  const ust = Math.min(r.bottom + 6, innerHeight - 380);
  Object.assign(kutu.style, { top: Math.max(10, ust) + "px", left: Math.max(10, Math.min(r.left, innerWidth - 340)) + "px" });
  const ara = $("input", kutu), liste = $(".es-liste", kutu);
  const secili = () => new Set(m.etiketler || []);
  function ciz() {
    const f = ara.value.trim().toLocaleLowerCase("tr-TR");
    const s = secili();
    const gorunen = tum.filter((e) => !f || e.ad.toLocaleLowerCase("tr-TR").includes(f));
    const tamEslesme = tum.some((e) => e.ad.toLocaleLowerCase("tr-TR") === f);
    liste.innerHTML = (f && !tamEslesme ? `<button type="button" class="es-yeni">+ “${esc(ara.value.trim())}” etiketini oluştur ve ekle</button>` : "") +
      (gorunen.length ? gorunen.map((e) => `<div class="es-satir"><label><input type="checkbox" data-ad="${esc(e.ad)}" ${s.has(e.ad) ? "checked" : ""}><span>${esc(e.ad)}</span><small>${e.adet}</small></label>
        <button type="button" class="kalem es-duzenle" data-ad="${esc(e.ad)}" title="Etiketi yeniden adlandır">${KALEM}</button>
        <button type="button" class="kalem es-sil" data-ad="${esc(e.ad)}" title="Etiketi tamamen sil">${COP}</button></div>`).join("")
        : (!f ? `<div class="es-bos">Henüz etiket yok. Yukarıya bir ad yaz (ör. Zara) ve Enter'a bas.</div>` : ""));
  }
  async function degistir(ad, ekle) {
    const s = secili();
    ekle ? s.add(ad) : s.delete(ad);
    m = await etiketleriKaydet(id, [...s]);
    tum = await api("/api/etiketler");
    ciz();
  }
  async function yeni() {
    const ad = ara.value.trim();
    if (!ad) return;
    ara.value = "";
    await degistir(ad, true);
  }
  ara.addEventListener("input", ciz);
  ara.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); yeni(); } if (e.key === "Escape") kapat(); });
  liste.addEventListener("change", (e) => { const c = e.target.closest("input[type=checkbox]"); if (c) degistir(c.dataset.ad, c.checked); });
  liste.addEventListener("click", async (e) => {
    if (e.target.closest(".es-yeni")) return yeni();
    const d = e.target.closest(".es-duzenle"), sl = e.target.closest(".es-sil");
    if (d) {
      e.preventDefault(); e.stopPropagation();
      const yeniAd = prompt(`“${d.dataset.ad}” etiketinin yeni adı:`, d.dataset.ad);
      if (yeniAd && yeniAd.trim() && yeniAd.trim() !== d.dataset.ad) {
        await post("/api/etiket-duzenle", { eski: d.dataset.ad, yeni: yeniAd.trim() });
        tum = await api("/api/etiketler"); m = await api("/api/medya/" + id); await etiketleriKaydet(id, m.etiketler); ciz();
        bildir("Etiket yeniden adlandırıldı; tüm dosyalarda güncellendi.");
      }
    }
    if (sl) {
      e.preventDefault(); e.stopPropagation();
      if (confirm(`“${sl.dataset.ad}” etiketi tüm dosyalardan kaldırılıp silinsin mi? (Dosyalar silinmez.)`)) {
        await post("/api/etiket-sil", { ad: sl.dataset.ad });
        tum = await api("/api/etiketler"); m = await api("/api/medya/" + id); await etiketleriKaydet(id, m.etiketler); ciz();
      }
    }
  });
  function kapat() { kutu.remove(); document.removeEventListener("mousedown", disari, true); }
  function disari(e) { if (!kutu.contains(e.target)) kapat(); }
  $(".es-tamam", kutu).onclick = kapat;
  ["click", "dblclick", "keydown"].forEach((t) => kutu.addEventListener(t, (e) => e.stopPropagation()));
  setTimeout(() => document.addEventListener("mousedown", disari, true), 0);
  ciz();
  ara.focus();
}
document.addEventListener("click", (e) => {
  const hz = e.target.closest("[data-hizli-id]");
  if (hz) {
    e.preventDefault(); e.stopPropagation();
    const id = hz.dataset.hizliId;
    hz.closest(".hizli-etiketler")?.classList.add("gidiyor");
    etiketleriKaydet(id, [hz.dataset.hizliAd]).then((m) => bildir(`“${hz.dataset.hizliAd}” etiketi eklendi.`, 1800)).catch(() => bildir("Etiket eklenemedi."));
    return;
  }
  const ek = e.target.closest("[data-etk-ekle]");
  if (ek) { e.preventDefault(); e.stopPropagation(); etiketSecici(ek.dataset.etkEkle, ek); return; }
  const c = e.target.closest(".etiket-cikar");
  if (c) {
    e.preventDefault(); e.stopPropagation();
    const id = c.closest(".etiket-satiri").dataset.etkId;
    const m = MEDYA_ONBELLEK.get(+id);
    if (m) etiketleriKaydet(id, (m.etiketler || []).filter((x) => x !== c.dataset.cikar));
  }
}, true);

/* ---------------- silme (çöp kutusuna taşıma) ---------------- */
async function dosyaSil(id, cagiran) {
  const ad = $(`.ad-metin[data-ad-id="${id}"]`)?.textContent || "Bu dosya";
  if (!confirm(`“${ad}” silinsin mi?\n\nDosya çöp kutusuna taşınır; “Çöp kutusu” sayfasından geri alabilirsin.`)) return;
  let r;
  try { r = await post("/api/sil/" + id); } catch (e) { bildir("Dosya silinemedi. Başka bir programda açık olabilir."); return; }
  id = +id;
  // ekrandan kaldır
  const kart = cagiran?.closest(".vkart, .mkart, .belge, .parca");
  if (kart) kart.remove();
  $$(`.foto-izgara [data-id="${id}"]`).forEach((x) => x.remove());
  // ışık kutusu açıksa listeden çıkar
  const ikAcik = !$("#isikKutu").hidden;
  const ikI = IK.liste.findIndex((x) => x.id === id);
  if (ikI >= 0) {
    IK.liste.splice(ikI, 1);
    if (ikAcik) { if (!IK.liste.length) isikKutuKapat(); else { IK.i = Math.min(ikI, IK.liste.length - 1); isikKutuGoster(); } }
  }
  const ci = CALAR.liste.findIndex((x) => x.id === id);
  if (ci >= 0) { const caliyor = ci === CALAR.i; CALAR.liste.splice(ci, 1); if (ci < CALAR.i) CALAR.i--; if (caliyor) { if (CALAR.liste.length) { CALAR.i %= CALAR.liste.length; calarYukle(); } else $("#calarKapat").click(); } }
  if (location.hash.startsWith("#/izle/" + id)) history.length > 1 ? history.back() : (location.hash = "#/videolar");
  bildir(`“${r.ad}” çöp kutusuna taşındı.`, 7000, { metin: "Geri al", fn: async () => { await post("/api/cop/geri/" + r.id); bildir("Geri alındı. Liste birkaç saniye içinde güncellenir."); setTimeout(yonlendir, 2500); } });
}
document.addEventListener("click", (e) => {
  const sb = e.target.closest(".cop-btn");
  if (sb) { e.preventDefault(); e.stopPropagation(); dosyaSil(sb.dataset.silId, sb); return; }
  const k = e.target.closest(".kalem");
  if (!k) return;
  e.preventDefault();
  e.stopPropagation();
  adDuzenle(k.dataset.adId, k);
}, true);
document.addEventListener("dblclick", (e) => {
  const s = e.target.closest(".ad-metin");
  if (!s) return;
  e.preventDefault();
  e.stopPropagation();
  adDuzenle(s.dataset.adId, s);
}, true);

function vkart(m) {
  const ilerleme = m.konum && m.izleme_sure ? Math.min(100, (m.konum / m.izleme_sure) * 100) : 0;
  const kl = klasorAdi(m.klasor);
  return `<a class="vkart" href="#/izle/${m.id}">
    <div class="kapak">${kucukResim(m)}
      ${m.sure ? `<span class="sure">${sureFmt(m.sure)}</span>` : ""}
      ${!m.oynatilabilir ? `<span class="etiket-sol">${esc(m.uzanti.slice(1))}</span>` : ""}
      ${ilerleme ? `<span class="ilerleme"><i style="width:${ilerleme}%"></i></span>` : ""}
    </div>
    <div class="bilgi">
      <span class="avatar" style="background:${renk(kl)}">${esc(bas(kl))}</span>
      <div><h3>${adAlani(m)}</h3><div class="meta">${esc(kl)}<br>${boyutFmt(m.boyut)} · ${goreceTarih(m.tarih)}</div>${etiketKucuk(m)}</div>
    </div></a>`;
}
function mkart(m) {
  return `<a class="mkart" href="#/izle/${m.id}"><div class="kapak">${kucukResim(m)}${m.sure ? `<span class="sure">${sureFmt(m.sure)}</span>` : ""}</div>
    <div><h4>${adAlani(m)}</h4><div class="meta">${esc(klasorAdi(m.klasor))}<br>${boyutFmt(m.boyut)}</div></div></a>`;
}
function makaleKart(o, genis = false, etiket = "Vikipedi") {
  const href = `#/wiki/${o.z}/${wikiYol(o.yol)}`;
  return `<a class="mkale ${genis ? "genis" : ""}" href="${href}">
    <div class="resim">${o.resim ? `<img loading="lazy" src="${esc(o.resim)}" alt="" onerror="this.outerHTML='<span class=harf>${esc(bas(o.baslik))}</span>'">` : `<span class="harf">${esc(bas(o.baslik))}</span>`}</div>
    <div class="ic"><div class="ust-etiket">${esc(etiket)}</div><h3>${esc(o.baslik)}</h3><p>${esc(o.ozet)}</p></div></a>`;
}
function belgeKart(m) {
  const uz = (m.uzanti || "").slice(1);
  return `<div class="belge" data-id="${m.id}" data-uz="${esc(uz)}" data-yol="${esc(m.yol)}">
    <div class="sayfa-onizleme"><span class="uz" style="background:${UZ_RENK[uz] || "#555"}">${esc(uz.toUpperCase())}</span>
      ${uz === "pdf" ? `<img loading="lazy" src="/kucuk/${m.id}" alt="" style="position:absolute;inset:0" onerror="kucukHata(this)" onload="if(this.naturalWidth<2)this.remove()">` : ""}</div>
    <h4>${adAlani(m)}</h4><span>${boyutFmt(m.boyut)} · ${goreceTarih(m.tarih)}</span></div>`;
}
function sayilarMetni(say, kisa = false) {
  const ad = { video: "video", foto: "fotoğraf", muzik: "şarkı", belge: "belge" };
  return ["video", "foto", "muzik", "belge"].filter((t) => say[t]).map((t) => `${say[t].toLocaleString("tr-TR")} ${ad[t]}`).join(kisa ? " · " : " · ");
}
const klasorHref = (yol, t) => "#/klasor?yol=" + encodeURIComponent(yol) + (t ? "&t=" + t : "");
function klasorKart(k) {
  return `<a class="kkart" href="${klasorHref(k.yol)}">
    <div class="kapak" style="--k:${renk(k.ad)}">
      <div class="yer-tutucu">${IKON.klasor}</div>
      ${k.kapak ? `<img loading="lazy" src="/kucuk/${k.kapak}" alt="" onerror="kucukHata(this)" onload="if(this.naturalWidth<2)this.remove()">` : ""}
      <div class="kkart-ust">${["video", "foto", "muzik", "belge"].filter((t) => k.sayilar[t]).map((t) => `<span>${IKON[t]}${k.sayilar[t]}</span>`).join("")}</div>
    </div>
    <h4>${esc(k.ad)}</h4><span>${sayilarMetni(k.sayilar)}</span></a>`;
}

function aniKart(m) {
  if (m.tur === "video") return `<a class="ani" href="#/izle/${m.id}"><img loading="lazy" src="/kucuk/${m.id}" alt="" onerror="kucukHata(this, true)"><span class="ani-video">${IKON.oynat}</span></a>`;
  return `<a class="ani" href="javascript:void(0)" data-ani="${m.id}"><img loading="lazy" src="/kucuk/${m.id}" alt="" onerror="kucukHata(this, true)"></a>`;
}
function fotoKucuk(m, i) {
  return `<a href="javascript:void(0)" data-i="${i}" data-id="${m.id}"><img loading="lazy" src="/kucuk/${m.id}" alt="${esc(m.ad)}" onerror="kucukHata(this, true)">${fotoEtiket(m)}</a>`;
}
function bosEkran(ikon, baslik, metin) {
  return `<div class="bos">${ikon}<h3>${baslik}</h3><p>${metin}</p></div>`;
}
function klasorBilgisi(tur) {
  const ad = { video: "Videolar", foto: "Fotoğraflar", muzik: "Müzik", belge: "Belgeler" }[tur];
  const bulunan = DURUM.bilgi?.klasorler?.[tur] || [];
  if (false) return "";
  return `Diskindeki tüm klasörler taranır. Yeni eklediğin dosyalar için <a href="#/ayarlar" style="color:var(--vurgu)">yeniden tara</a>.`;
}

/* sonsuz kaydırma */
function sonsuzListe(kap, getir, ciz, sayfaBoyu = 60) {
  let bas = 0, bitti = false, yukleniyor = false;
  const isaret = document.createElement("div");
  isaret.style.height = "1px";
  kap.after(isaret);
  async function yukle() {
    if (bitti || yukleniyor) return;
    yukleniyor = true;
    const veri = await getir(bas, sayfaBoyu);
    ciz(veri, bas);
    bas += veri.length;
    if (veri.length < sayfaBoyu) { bitti = true; gozlem.disconnect(); }
    yukleniyor = false;
  }
  const gozlem = new IntersectionObserver((g) => g[0].isIntersecting && yukle(), { rootMargin: "800px" });
  gozlem.observe(isaret);
  return yukle();
}

/* ---------------- yönlendirici ---------------- */
const SAYFALAR = {
  "": sayfaAna, ara: sayfaAra, videolar: sayfaVideolar, izle: sayfaIzle, fotograflar: sayfaFotograflar,
  muzik: sayfaMuzik, belgeler: sayfaBelgeler, klasorler: sayfaKlasorler, klasor: sayfaKlasor, cop: sayfaCop, takvim: sayfaTakvim, etiketler: sayfaEtiketler, etiket: sayfaEtiket, wiki: sayfaWiki, dosyalar: sayfaDosyalar, ayarlar: sayfaAyarlar,
};
let aktifTemizle = null;
async function yonlendir() {
  const { parcalar, q } = sorguAyir();
  const ad = parcalar[0] || "";
  const f = SAYFALAR[ad] || sayfaAna;
  if (aktifTemizle) { try { aktifTemizle(); } catch (e) {} aktifTemizle = null; }
  $$(".yan a").forEach((a) => a.classList.toggle("aktif", a.dataset.sayfa === (ad || "ana") || (ad === "izle" && a.dataset.sayfa === "videolar") || (ad === "klasor" && a.dataset.sayfa === "klasorler") || (ad === "etiket" && a.dataset.sayfa === "etiketler")));
  document.body.classList.remove("yan-acik");
  if (ad !== "ara") $("#aramaKutu").value = "";
  sayfa.innerHTML = '<div class="yukleniyor"></div>';
  window.scrollTo(0, 0);
  if (!["izle"].includes(ad)) await etiketleriYenile();
  try {
    await f(parcalar.slice(1), q);
  } catch (e) {
    console.error(e);
    sayfa.innerHTML = bosEkran(IKON.dosya, "Bir sorun oldu", esc(e.message));
  }
}
window.addEventListener("hashchange", yonlendir);
window.addEventListener("hashchange", () => { $(".etiket-secici")?.remove(); if (!$("#isikKutu").hidden) isikKutuKapat(); });

/* ---------------- ANA SAYFA ---------------- */
async function sayfaAna() {
  document.title = (DURUM.bilgi?.ad || "Portal") + " — Ana sayfa";
  const [v, kesfet, kok, gecmis, saglik] = await Promise.all([api("/api/ana"), DURUM.wikiVar ? api("/api/wiki/kesfet?adet=5").catch(() => []) : [], api("/api/klasor-ozet").catch(() => ({ klasorler: [] })),
    api("/api/gecmiste-bugun").catch(() => []), api("/api/saglik").catch(() => null)]);
  const saat = new Date().getHours();
  const selam = saat < 5 ? "İyi geceler" : saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : saat < 22 ? "İyi akşamlar" : "İyi geceler";
  const s = v.sayilar;
  const zimMakale = (DURUM.bilgi?.vikipedi || []).reduce((t, z) => t + z.makale, 0);
  let h = `<div class="dar"><section class="kahraman">
    <h1 class="selam">${selam}<span>.</span></h1>
    <div class="tarih">${new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Çevrimdışı mod</div>
    <form class="kahraman-arama" id="kahramanForm">${IKON.ara}<input id="kahramanKutu" type="search" placeholder="${DURUM.wikiVar ? "Bir şey ara — Vikipedi, videolar, fotoğraflar…" : "Diskindeki dosyalarda ara…"}" autocomplete="off"></form>
    <div class="ozet-sayilar">
      ${DURUM.wikiVar ? `<a href="#/wiki">${IKON.wiki}<b>${zimMakale.toLocaleString("tr-TR")}</b> makale</a>` : ""}
      <a href="#/videolar">${IKON.video}<b>${s.video}</b> video</a>
      <a href="#/fotograflar">${IKON.foto}<b>${s.foto}</b> fotoğraf</a>
      <a href="#/muzik">${IKON.muzik}<b>${s.muzik}</b> şarkı</a>
      <a href="#/belgeler">${IKON.belge}<b>${s.belge}</b> belge</a>
    </div></section>`;
  if (saglik?.uyarilar?.length) h += `<a class="saglik-uyari" href="#/ayarlar">${IKON.kalkan}<div><b>Disk uyarısı</b><span>${esc(saglik.uyarilar[0])}</span></div></a>`;
  if (gecmis.length) {
    h += `<section class="bolum"><div class="bolum-bas"><h2>Geçmişte bugün</h2><a href="#/takvim">Takvimi aç</a></div><div class="gecmis">${gecmis.map((g) =>
      `<div class="gecmis-yil"><div class="gecmis-bas"><b>${g.once} yıl önce</b><span>${tarihFmt(g.ogeler[0].tarih, { day: "numeric", month: "long", year: "numeric" })} · ${g.ogeler.length} anı</span></div>
      <div class="yatay gecmis-seri" data-yil="${g.yil}">${g.ogeler.map((m, i) => aniKart(m, i)).join("")}</div></div>`).join("")}</div></section>`;
  }
  if (kok.klasorler.length) {
    const son = [...kok.klasorler].sort((a, b) => b.son - a.son);
    h += `<section class="bolum"><div class="bolum-bas"><h2>Klasörlerin</h2><a href="#/klasorler">Tümünü gör (${kok.klasorler.length})</a></div>
      <div class="kizgara">${son.slice(0, 12).map(klasorKart).join("")}</div></section>`;
  }
  if (v.devam.length) h += `<section class="bolum"><div class="bolum-bas"><h2>İzlemeye devam et</h2></div><div class="yatay">${v.devam.map(vkart).join("")}</div></section>`;
  if (v.onerilen.length) h += `<section class="bolum"><div class="bolum-bas"><h2>Senin için önerilen videolar</h2><a href="#/videolar">Tümünü gör</a></div><div class="izgara">${v.onerilen.slice(0, 8).map(vkart).join("")}</div></section>`;
  if (kesfet.length) h += `<section class="bolum"><div class="bolum-bas"><h2>Vikipedi'den bugün</h2><a href="#/wiki">Keşfetmeye devam et</a></div><div class="makale-izgara">${kesfet.map((o, i) => makaleKart(o, i === 0)).join("")}</div></section>`;
  if (v.fotolar.length) h += `<section class="bolum"><div class="bolum-bas"><h2>Son fotoğraflar</h2><a href="#/fotograflar">Tümünü gör</a></div><div class="yatay" id="anaFotolar">${v.fotolar.map((m, i) => `<a class="foto-izgara-tek" href="javascript:void(0)" data-i="${i}"><img loading="lazy" src="/kucuk/${m.id}" alt=""></a>`).join("")}</div></section>`;
  if (v.muzik.length) h += `<section class="bolum"><div class="bolum-bas"><h2>Müzik</h2><a href="#/muzik">Kütüphaneyi aç</a></div><div class="parca-liste" id="anaMuzik">${v.muzik.slice(0, 5).map((m, i) => parcaSatir(m, i)).join("")}</div></section>`;
  if (v.belgeler.length) h += `<section class="bolum"><div class="bolum-bas"><h2>Belgeler</h2><a href="#/belgeler">Tümünü gör</a></div><div class="belge-izgara">${v.belgeler.map(belgeKart).join("")}</div></section>`;
  if (!s.video && !s.foto && !s.muzik && !s.belge && !DURUM.wikiVar) {
    h += bosEkran(IKON.klasor, "Disk henüz boş görünüyor", "Diskinin kökünde <code>Videolar</code>, <code>Fotoğraflar</code>, <code>Müzik</code>, <code>Belgeler</code> ve <code>Vikipedi</code> klasörlerini oluşturup dosyalarını içine koy.");
  }
  sayfa.innerHTML = h + "</div>";
  $("#kahramanForm").onsubmit = (e) => { e.preventDefault(); const q = $("#kahramanKutu").value.trim(); if (q) location.hash = "#/ara?q=" + encodeURIComponent(q); };
  oneriBagla($("#kahramanKutu"));
  $$(".gecmis-seri").forEach((el) => {
    const g = gecmis.find((x) => x.yil === +el.dataset.yil);
    el.addEventListener("click", (e) => { const a = e.target.closest("[data-ani]"); if (!a) return; const fotolar = g.ogeler.filter((x) => x.tur === "foto"); isikKutuAc(fotolar, fotolar.findIndex((x) => x.id === +a.dataset.ani)); });
  });
  $("#anaFotolar")?.addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) isikKutuAc(v.fotolar, +a.dataset.i); });
  muzikListeBagla($("#anaMuzik"), v.muzik.slice(0, 5));
  belgeBagla(sayfa);
}

/* ---------------- ARAMA ---------------- */
async function sayfaAra(_, q) {
  const sorgu = q.get("q") || "";
  const sekme = q.get("t") || "hepsi";
  const basla = +(q.get("bas") || 0);
  $("#aramaKutu").value = sorgu;
  document.title = sorgu + " — Portal'da ara";
  const sekmeler = [["hepsi", "Tümü", IKON.ara], ["wiki", "Vikipedi", IKON.wiki], ["video", "Videolar", IKON.video], ["foto", "Fotoğraflar", IKON.foto], ["muzik", "Müzik", IKON.muzik], ["belge", "Belgeler", IKON.belge]];
  const sekmeH = `<nav class="sonuc-sekmeler">${sekmeler.map(([k, ad, ik]) => `<a class="${k === sekme ? "aktif" : ""}" href="#/ara?q=${encodeURIComponent(sorgu)}&t=${k}">${ik}${ad}</a>`).join("")}</nav>`;

  if (["video", "foto", "muzik", "belge"].includes(sekme)) {
    const l = await api(`/api/medya?tur=${sekme}&ara=${encodeURIComponent(sorgu)}&adet=200&sira=ad`);
    let ic = "";
    if (!l.length) ic = bosEkran(IKON.ara, "Sonuç bulunamadı", `“${esc(sorgu)}” ile eşleşen dosya yok.`);
    else if (sekme === "video") ic = `<div class="izgara">${l.map(vkart).join("")}</div>`;
    else if (sekme === "foto") ic = `<div class="foto-izgara" id="aramaFoto">${l.map(fotoKucuk).join("")}</div>`;
    else if (sekme === "muzik") ic = `<div class="parca-liste" id="aramaMuzik">${l.map(parcaSatir).join("")}</div>`;
    else ic = `<div class="belge-izgara">${l.map(belgeKart).join("")}</div>`;
    sayfa.innerHTML = `<div class="sonuc-sayfa">${sekmeH}<div class="sonuc-ozet">${l.length} dosya bulundu</div>${ic}</div>`;
    $("#aramaFoto")?.addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) isikKutuAc(l, +a.dataset.i); });
    muzikListeBagla($("#aramaMuzik"), l);
    belgeBagla(sayfa);
    return;
  }

  const [r, tumEtiket] = await Promise.all([api(`/api/ara?q=${encodeURIComponent(sorgu)}&bas=${basla}`), api("/api/etiketler").catch(() => [])]);
  const sk = sorgu.toLocaleLowerCase("tr-TR");
  const eslesenEtiketler = basla === 0 ? tumEtiket.filter((e) => e.adet && e.ad.toLocaleLowerCase("tr-TR").includes(sk)) : [];
  const w = r.vikipedi.sonuclar;
  const d = r.dosyalar || {};
  const yerelVar = sekme === "hepsi" && basla === 0 && (eslesenEtiketler.length || d.klasorler?.length || d.video?.length || d.foto?.length || d.muzik?.length || d.belge?.length);
  let sol = "";
  const yerelBlok = () => {
    let b = "";
    if (eslesenEtiketler.length) b += `<div class="yerel-sonuclar"><h4>${ETK_IKON}Etiketler</h4><div class="cipler" style="margin:0">${eslesenEtiketler.map((e) => `<a class="etiket-cip buyuk" href="${etiketHref(e.ad)}">#${esc(e.ad)} <small>${e.adet}</small></a>`).join("")}</div></div>`;
    if (d.klasorler?.length) b += `<div class="yerel-sonuclar"><h4>${IKON.klasor}Klasörler</h4><div class="yatay">${d.klasorler.map(klasorKart).join("")}</div></div>`;
    if (d.video?.length) b += `<div class="yerel-sonuclar"><h4>${IKON.video}Diskindeki videolar</h4><div class="yatay">${d.video.map(vkart).join("")}</div></div>`;
    if (d.foto?.length) b += `<div class="yerel-sonuclar"><h4>${IKON.foto}Fotoğraflar</h4><div class="foto-izgara" id="aramaFoto">${d.foto.slice(0, 8).map(fotoKucuk).join("")}</div></div>`;
    if (d.muzik?.length) b += `<div class="yerel-sonuclar"><h4>${IKON.muzik}Müzik</h4><div class="parca-liste" id="aramaMuzik">${d.muzik.slice(0, 4).map(parcaSatir).join("")}</div></div>`;
    if (d.belge?.length) b += `<div class="yerel-sonuclar"><h4>${IKON.belge}Belgeler</h4><div class="belge-izgara">${d.belge.slice(0, 4).map(belgeKart).join("")}</div></div>`;
    return b;
  };
  w.forEach((o, i) => {
    if (i === 2 && yerelVar) sol += yerelBlok();
    sol += `<div class="wsonuc"><div>
      <div class="site"><span class="fav">W</span><span><b>${esc(o.kaynak || "Vikipedi")}</b>vikipedi › ${esc(o.yol.replace(/^A\//, "").replace(/_/g, " "))}</span></div>
      <h3><a href="#/wiki/${o.z}/${wikiYol(o.yol)}">${esc(o.baslik)}</a></h3>
      <p>${vurgula(o.ozet, sorgu)}</p></div>
      ${o.resim ? `<a class="kucuk-resim" href="#/wiki/${o.z}/${wikiYol(o.yol)}"><img loading="lazy" src="${esc(o.resim)}" alt="" onerror="this.parentNode.remove()"></a>` : ""}</div>`;
  });
  if (w.length < 3 && yerelVar) sol += yerelBlok();
  if (!w.length && !yerelVar) {
    sol = bosEkran(IKON.ara, "Sonuç bulunamadı", DURUM.wikiVar ? `“${esc(sorgu)}” için Vikipedi'de ve diskinde bir şey bulunamadı. Farklı kelimeler dene.` : "Vikipedi dosyası (.zim) bulunamadı; yalnızca diskindeki dosyalarda arandı.");
  }
  // sayfalama
  const toplam = r.vikipedi.toplam;
  let sayfalama = "";
  if (toplam > 10) {
    const aktif = Math.floor(basla / 10);
    const son = Math.min(Math.ceil(toplam / 10), aktif + 6);
    for (let i = Math.max(0, aktif - 4); i < son; i++) sayfalama += `<a class="${i === aktif ? "aktif" : ""}" href="#/ara?q=${encodeURIComponent(sorgu)}&t=${sekme}&bas=${i * 10}">${i + 1}</a>`;
    if (aktif + 1 < Math.ceil(toplam / 10)) sayfalama += `<a href="#/ara?q=${encodeURIComponent(sorgu)}&t=${sekme}&bas=${(aktif + 1) * 10}">Sonraki ›</a>`;
  }
  const ilk = w.slice(0, 3).find((o) => o.baslik.toLocaleLowerCase("tr-TR") === sorgu.toLocaleLowerCase("tr-TR")) || w.slice(0, 3).find((o) => o.resim) || w[0];
  const panel = ilk && basla === 0 ? `<aside class="bilgi-panel">${ilk.resim ? `<div class="resim"><img src="${esc(ilk.resim)}" alt="" onerror="this.parentNode.remove()"></div>` : ""}
    <div class="ic"><h2>${esc(ilk.baslik)}</h2><div class="kaynak">${esc(ilk.kaynak || "Vikipedi")}</div><p>${esc(ilk.ozet)}</p>
    <a class="kucuk-btn vurgulu" href="#/wiki/${ilk.z}/${wikiYol(ilk.yol)}">Makaleyi oku</a></div></aside>` : "<div></div>";
  sayfa.innerHTML = `<div class="sonuc-sayfa">${sekmeH}
    <div class="sonuc-ozet">Yaklaşık ${toplam.toLocaleString("tr-TR")} Vikipedi sonucu (${r.sure} saniye)</div>
    <div class="sonuc-duzen"><div>${sol}<div class="sayfalama">${sayfalama}</div></div>${panel}</div></div>`;
  const fotolar = d.foto || [];
  $("#aramaFoto")?.addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) isikKutuAc(fotolar, +a.dataset.i); });
  muzikListeBagla($("#aramaMuzik"), d.muzik || []);
  belgeBagla(sayfa);
}

/* ---------------- VİDEOLAR ---------------- */
async function sayfaVideolar(_, q) {
  document.title = "Videolar — Portal";
  const klasor = q.get("klasor") || "";
  const sira = q.get("sira") || "yeni";
  const [klasorler, etkV] = await Promise.all([api("/api/klasorler?tur=video"), api("/api/etiketler").catch(() => [])]);
  const cipler = [`<a class="cip ${!klasor ? "aktif" : ""}" href="#/videolar?sira=${sira}">Tümü</a>`]
    .concat(klasorler.slice(0, 30).map((k) => `<a class="cip ${k.klasor === klasor ? "aktif" : ""}" href="#/videolar?klasor=${encodeURIComponent(k.klasor)}&sira=${sira}">${esc(klasorAdi(k.klasor))} <span style="opacity:.55">${k.adet}</span></a>`));
  const siralar = [["yeni", "En yeni"], ["ad", "Ada göre"], ["rastgele", "Karışık"], ["boyut", "En büyük"]];
  sayfa.innerHTML = `<div class="dar" style="max-width:1600px">
    <h1 class="sayfa-baslik">${klasor ? esc(klasorAdi(klasor)) : "Videolar"}</h1>
    <p class="sayfa-alt">${klasorBilgisi("video")}</p>
    <div class="cipler">${cipler.join("")}</div>
    ${etkV.some((e) => e.adet) ? `<div class="cipler" style="margin-top:-8px">${etkV.filter((e) => e.adet).map((e) => `<a class="etiket-cip" href="${etiketHref(e.ad, "video")}">#${esc(e.ad)}</a>`).join("")}</div>` : ""}
    <div class="cipler" style="margin-top:-8px">${siralar.map(([k, ad]) => `<a class="cip ${k === sira ? "aktif" : ""}" style="height:28px;font-size:13px" href="#/videolar?klasor=${encodeURIComponent(klasor)}&sira=${k}">${ad}</a>`).join("")}</div>
    <div class="izgara" id="vIzgara"></div></div>`;
  const kap = $("#vIzgara");
  await sonsuzListe(kap, (b, a) => api(`/api/medya?tur=video&sira=${sira}&klasor=${encodeURIComponent(klasor)}&bas=${b}&adet=${a}`),
    (l, b) => { if (!l.length && !b) kap.outerHTML = bosEkran(IKON.video, "Henüz video yok", klasorBilgisi("video")); else kap.insertAdjacentHTML("beforeend", l.map(vkart).join("")); });
}

/* ---------------- VİDEO İZLE ---------------- */
async function sayfaIzle([id]) {
  const m = await api("/api/medya/" + id);
  document.title = m.ad + " — Portal";
  const oneriler = await api("/api/oneriler/" + id);
  const kl = klasorAdi(m.klasor);
  let otomatik = true;
  try { otomatik = localStorage.getItem("otomatik") !== "0"; } catch (e) {}
  sayfa.innerHTML = `<div class="izle">
    <div>
      <div class="oynatici"><video id="video" controls autoplay playsinline preload="metadata" poster="/kucuk/${m.id}"></video><span class="uyari" id="uyari" hidden></span></div>
      <div id="akisArac" hidden style="display:flex;gap:10px;align-items:center;margin-top:8px;font-size:13px;color:var(--metin-2)">
        <span>Uyumluluk modu — ileri sar:</span><input type="range" id="akisKonum" min="0" max="1000" value="0" style="flex:1;accent-color:var(--vurgu)"><span id="akisZaman"></span></div>
      <h1>${adAlani(m)}</h1>
      ${etiketSatiri(m)}
      <div class="izle-satir">
        <div class="kanal"><span class="avatar" style="background:${renk(kl)}">${esc(bas(kl))}</span><div><b>${esc(kl)}</b><small>${esc(m.klasor)}</small></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="kucuk-btn" id="klasorGoster">${IKON.klasor}Klasörde göster</button>
          <button class="kucuk-btn" id="harictenAc">${IKON.ac}Başka oynatıcıda aç</button>
        </div>
      </div>
      <div class="izle-aciklama"><b>${boyutFmt(m.boyut)} · ${(m.uzanti || "").slice(1).toUpperCase()} · ${tarihFmt(m.tarih)}</b><br>${esc(m.yol)}</div>
    </div>
    <aside class="siradaki">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Sıradaki</h3>
      <label style="font-size:13px;display:flex;gap:6px;align-items:center;color:var(--metin-2)"><input type="checkbox" id="otomatikOynat" ${otomatik ? "checked" : ""} style="accent-color:var(--vurgu)">Otomatik oynat</label></div>
      ${oneriler.map(mkart).join("") || '<p style="color:var(--metin-2)">Başka video yok.</p>'}
    </aside></div>`;
  const v = $("#video");
  let akisModu = false, akisBaslangic = 0, akisSure = 0, sonKayit = 0;

  function akisaGec(t = 0) {
    akisModu = true;
    akisBaslangic = t;
    $("#uyari").hidden = false;
    $("#uyari").textContent = "Bu format tarayıcıda doğrudan açılamıyor; anlık dönüştürülüyor.";
    $("#akisArac").hidden = false;
    v.src = `/akis/${m.id}?t=${t}`;
    v.play().catch(() => {});
  }
  if (m.oynatilabilir) {
    v.src = "/dosya/" + m.id;
    v.addEventListener("error", () => { if (!akisModu) akisaGec(m.konum || 0); }, { once: true });
  } else {
    akisaGec(m.konum && m.konum > 15 ? m.konum : 0);
  }
  if (!m.oynatilabilir || true) {
    api("/api/videobilgi/" + m.id).then((b) => { akisSure = b.sure || 0; }).catch(() => {});
  }
  $("#akisKonum").onchange = (e) => { if (akisSure) akisaGec((e.target.value / 1000) * akisSure); };

  // altyazı
  fetch("/altyazi/" + m.id).then((r) => {
    if (r.status === 200) {
      const t = document.createElement("track");
      Object.assign(t, { kind: "subtitles", label: "Altyazı", srclang: "tr", src: "/altyazi/" + m.id, default: true });
      v.appendChild(t);
    }
  });
  v.addEventListener("loadedmetadata", () => {
    if (!akisModu && m.konum && m.konum > 15 && (!m.izleme_sure || m.konum < m.izleme_sure * 0.93)) {
      v.currentTime = m.konum;
      bildir("Kaldığın yerden devam ediliyor: " + sureFmt(m.konum));
    }
  });
  const gercekKonum = () => (akisModu ? akisBaslangic + v.currentTime : v.currentTime);
  const gercekSure = () => (akisModu ? akisSure : isFinite(v.duration) ? v.duration : null);
  function kaydet(bitti = false) {
    const k = gercekKonum();
    if (k < 1 && !bitti) return;
    post("/api/izleme/" + m.id, { konum: bitti ? 0 : k, sure: gercekSure(), bitti }).catch(() => {});
  }
  v.addEventListener("timeupdate", () => {
    if (akisModu && akisSure) {
      $("#akisKonum").value = (gercekKonum() / akisSure) * 1000;
      $("#akisZaman").textContent = sureFmt(gercekKonum()) + " / " + sureFmt(akisSure);
    }
    if (Date.now() - sonKayit > 10000) { sonKayit = Date.now(); kaydet(); }
  });
  v.addEventListener("pause", () => kaydet());
  v.addEventListener("ended", () => {
    kaydet(true);
    if ($("#otomatikOynat").checked && oneriler[0]) {
      bildir("Sıradaki video: " + oneriler[0].ad);
      setTimeout(() => (location.hash = "#/izle/" + oneriler[0].id), 1500);
    }
  });
  $("#otomatikOynat").onchange = (e) => { try { localStorage.setItem("otomatik", e.target.checked ? "1" : "0"); } catch (x) {} };
  $("#klasorGoster").onclick = () => post("/api/ac", { yol: m.yol, klasorde: true });
  $("#harictenAc").onclick = () => { v.pause(); post("/api/ac", { yol: m.yol }); };
  const tus = (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "f") { v.requestFullscreen?.(); }
    if (e.key === "k" || e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  };
  document.addEventListener("keydown", tus);
  muzikDuraklat();
  aktifTemizle = () => { kaydet(); document.removeEventListener("keydown", tus); v.pause(); v.removeAttribute("src"); v.load(); };
}

/* ---------------- FOTOĞRAFLAR ---------------- */
async function sayfaFotograflar(_, q) {
  document.title = "Fotoğraflar — Portal";
  const klasor = q.get("klasor") || "";
  const gorunum = q.get("g") || (klasor ? "hepsi" : "hepsi");
  const [klasorler, etkF] = await Promise.all([api("/api/klasorler?tur=foto"), api("/api/etiketler").catch(() => [])]);
  let h = `<div class="dar" style="max-width:1600px"><h1 class="sayfa-baslik">${klasor ? esc(klasorAdi(klasor)) : "Fotoğraflar"}</h1>
    <p class="sayfa-alt">${klasorBilgisi("foto")}</p>
    <div class="cipler"><a class="cip ${gorunum === "hepsi" ? "aktif" : ""}" href="#/fotograflar?klasor=${encodeURIComponent(klasor)}">Zaman çizelgesi</a>
    <a class="cip ${gorunum === "album" ? "aktif" : ""}" href="#/fotograflar?g=album">Albümler (${klasorler.length})</a>
    ${klasor ? `<a class="cip" href="#/fotograflar">${IKON.geri}Tüm fotoğraflar</a>` : ""}
    <button class="cip" id="slaytBaslat">${IKON.oynat}Slayt gösterisi</button></div>
    ${etkF.some((e) => e.adet) ? `<div class="cipler" style="margin-top:-8px">${etkF.filter((e) => e.adet).map((e) => `<a class="etiket-cip" href="${etiketHref(e.ad, "foto")}">#${esc(e.ad)}</a>`).join("")}</div>` : ""}`;
  if (gorunum === "album") {
    h += `<div class="albumler">${klasorler.map((k) => `<a class="album" href="#/fotograflar?klasor=${encodeURIComponent(k.klasor)}"><div class="kapak"><img loading="lazy" src="/kucuk/${k.kapak}" alt="" onerror="kucukHata(this)"></div><h4>${esc(klasorAdi(k.klasor))}</h4><span>${k.adet} fotoğraf · ${tarihFmt(k.son, { month: "long", year: "numeric" })}</span></a>`).join("")}</div></div>`;
    sayfa.innerHTML = h;
    $("#slaytBaslat").onclick = async () => { const l = await api("/api/medya?tur=foto&sira=rastgele&adet=500"); if (l.length) isikKutuAc(l, 0, true); };
    return;
  }
  sayfa.innerHTML = h + `<div id="fotoKap"></div></div>`;
  const kap = $("#fotoKap");
  const tumu = [];
  let sonGrup = null, izgara = null;
  kap.addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) isikKutuAc(tumu, +a.dataset.i); });
  $("#slaytBaslat").onclick = () => tumu.length && isikKutuAc(tumu, 0, true);
  await sonsuzListe(kap, (b, a) => api(`/api/medya?tur=foto&sira=yeni&klasor=${encodeURIComponent(klasor)}&bas=${b}&adet=${a}`), (l, b) => {
    if (!l.length && !b) { kap.innerHTML = bosEkran(IKON.foto, "Henüz fotoğraf yok", klasorBilgisi("foto")); return; }
    for (const m of l) {
      const grup = tarihFmt(m.tarih, { month: "long", year: "numeric" });
      if (grup !== sonGrup) {
        sonGrup = grup;
        kap.insertAdjacentHTML("beforeend", `<div class="foto-grup"><h3>${esc(grup)}</h3><div class="foto-izgara"></div></div>`);
        izgara = kap.lastElementChild.querySelector(".foto-izgara");
      }
      izgara.insertAdjacentHTML("beforeend", fotoKucuk(m, tumu.length));
      tumu.push(m);
    }
  }, 120);
}

/* ışık kutusu */
const IK = { liste: [], i: 0, slayt: null };
function isikKutuAc(liste, i, slayt = false) {
  IK.liste = liste; IK.i = i;
  $("#isikKutu").hidden = false;
  document.body.style.overflow = "hidden";
  isikKutuGoster();
  slaytDurum(slayt);
}
function isikKutuGoster() {
  const m = IK.liste[IK.i];
  if (!m) return;
  const img = $("#ikResim");
  img.src = "/kucuk/" + m.id;
  const tam = new Image();
  tam.onload = () => { if (IK.liste[IK.i] === m) img.src = tam.src; };
  tam.src = "/goruntu/" + m.id;
  $("#ikBilgi").innerHTML = `${IK.i + 1} / ${IK.liste.length} · ${adAlani(m)} · ${tarihFmt(m.tarih)}`;
  $("#ikEtiket").innerHTML = etiketSatiri(m);
  // sonrakini önceden yükle
  const s = IK.liste[IK.i + 1];
  if (s) new Image().src = "/goruntu/" + s.id;
}
function isikKutuKapat() { $("#isikKutu").hidden = true; document.body.style.overflow = ""; slaytDurum(false); $("#ikResim").src = ""; }
function ikGit(d) { IK.i = (IK.i + d + IK.liste.length) % IK.liste.length; isikKutuGoster(); }
function slaytDurum(ac) {
  clearInterval(IK.slayt); IK.slayt = null;
  if (ac) IK.slayt = setInterval(() => ikGit(1), 4000);
  $("#ikSlayt").textContent = ac ? "Slaytı durdur" : "Slayt gösterisi";
}
$(".ik-kapat").onclick = isikKutuKapat;
$(".ik-onceki").onclick = () => ikGit(-1);
$(".ik-sonraki").onclick = () => ikGit(1);
$("#ikSlayt").onclick = () => slaytDurum(!IK.slayt);
$("#ikKlasor").onclick = () => post("/api/ac", { yol: IK.liste[IK.i].yol, klasorde: true });
$("#isikKutu").addEventListener("click", (e) => { if (e.target.id === "isikKutu") isikKutuKapat(); });
document.addEventListener("keydown", (e) => {
  if ($("#isikKutu").hidden) return;
  if (e.key === "Escape") isikKutuKapat();
  if (e.key === "ArrowRight") ikGit(1);
  if (e.key === "ArrowLeft") ikGit(-1);
});

/* ---------------- MÜZİK ---------------- */
function parcaSatir(m, i) {
  return `<div class="parca" data-i="${i}" data-id="${m.id}"><span class="no">${i + 1}</span>
    <span class="kapakcik">${IKON.muzik}<img loading="lazy" src="/kucuk/${m.id}" alt="" style="position:absolute;width:48px;height:48px" onerror="kucukHata(this)" onload="if(this.naturalWidth<2)this.remove()"></span>
    <span><b>${adAlani({ ...m, ad: m.baslik || m.ad })}</b><small>${esc(m.sanatci || klasorAdi(m.klasor))}</small></span>
    <span class="albumad">${esc(m.album || klasorAdi(m.klasor))}</span><span class="surem">${sureFmt(m.sure)}</span></div>`;
}
function muzikListeBagla(kap, liste) {
  if (!kap) return;
  $$(".kapakcik", kap).forEach((k) => (k.style.position = "relative"));
  kap.addEventListener("click", (e) => { const p = e.target.closest(".parca"); if (p) calarBaslat(liste, +p.dataset.i); });
  calarIsaretle();
}
async function sayfaMuzik(_, q) {
  document.title = "Müzik — Portal";
  const klasor = q.get("klasor") || "";
  const [klasorler, liste] = await Promise.all([api("/api/klasorler?tur=muzik"), api(`/api/medya?tur=muzik&sira=ad&adet=2000&klasor=${encodeURIComponent(klasor)}`)]);
  const toplamSure = liste.reduce((t, m) => t + (m.sure || 0), 0);
  sayfa.innerHTML = `<div class="dar">
    <div class="muzik-kahraman"><div class="buyuk-kapak">${klasor && liste[0] ? `<img src="/kucuk/${liste[0].id}" alt="" onerror="kucukHata(this)">` : ""}${IKON.muzik}</div>
      <div><div style="font-size:12.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--vurgu)">${klasor ? "Albüm / klasör" : "Kütüphane"}</div>
      <h1>${klasor ? esc(klasorAdi(klasor)) : "Müziğin"}</h1><p>${liste.length} şarkı${toplamSure ? " · " + Math.round(toplamSure / 60) + " dakika" : ""}</p>
      <div style="display:flex;gap:8px"><button class="kucuk-btn vurgulu" id="hepsiniCal">${IKON.oynat}Çal</button><button class="kucuk-btn" id="karisikCal">${IKON.karisik}Karışık çal</button></div></div></div>
    ${!klasor && klasorler.length > 1 ? `<div class="cipler">${klasorler.map((k) => `<a class="cip" href="#/muzik?klasor=${encodeURIComponent(k.klasor)}">${esc(klasorAdi(k.klasor))} <span style="opacity:.55">${k.adet}</span></a>`).join("")}</div>` : ""}
    ${klasor ? `<div class="cipler"><a class="cip" href="#/muzik">${IKON.geri}Tüm müzikler</a></div>` : ""}
    ${liste.length ? `<div class="parca-liste" id="parcalar">${liste.map(parcaSatir).join("")}</div>` : bosEkran(IKON.muzik, "Henüz müzik yok", klasorBilgisi("muzik"))}</div>`;
  muzikListeBagla($("#parcalar"), liste);
  $("#hepsiniCal").onclick = () => liste.length && calarBaslat(liste, 0);
  $("#karisikCal").onclick = () => { const k = [...liste].sort(() => Math.random() - 0.5); k.length && calarBaslat(k, 0); };
}

/* müzik çalar (sayfalar arasında çalmaya devam eder) */
const CALAR = { liste: [], i: 0 };
const ses = $("#ses");
function calarBaslat(liste, i) {
  CALAR.liste = liste; CALAR.i = i;
  calarYukle();
}
function calarYukle() {
  const m = CALAR.liste[CALAR.i];
  if (!m) return;
  $("#calar").hidden = false;
  document.body.classList.add("calar-acik");
  ses.src = "/dosya/" + m.id;
  ses.play().catch(() => {});
  $("#calarBaslik").textContent = m.baslik || m.ad;
  $("#calarAlt").textContent = [m.sanatci, m.album || klasorAdi(m.klasor)].filter(Boolean).join(" · ");
  const k = $("#calarKapak");
  k.style.visibility = "hidden";
  k.onload = () => (k.style.visibility = k.naturalWidth > 1 ? "visible" : "hidden");
  k.src = "/kucuk/" + m.id;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: m.baslik || m.ad, artist: m.sanatci || "", album: m.album || klasorAdi(m.klasor), artwork: [{ src: "/kucuk/" + m.id, sizes: "480x480", type: "image/jpeg" }] });
    navigator.mediaSession.setActionHandler("previoustrack", () => calarGit(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => calarGit(1));
  }
  calarIsaretle();
}
function calarIsaretle() {
  const m = CALAR.liste[CALAR.i];
  $$(".parca").forEach((p) => p.classList.toggle("caliyor", !!m && +p.dataset.id === m.id && !$("#calar").hidden));
}
function calarGit(d) {
  if (!CALAR.liste.length) return;
  CALAR.i = (CALAR.i + d + CALAR.liste.length) % CALAR.liste.length;
  calarYukle();
}
function muzikDuraklat() { if (!ses.paused) ses.pause(); }
ses.addEventListener("play", () => ($("#calarOynat").innerHTML = IKON.durdur));
ses.addEventListener("pause", () => ($("#calarOynat").innerHTML = IKON.oynat));
ses.addEventListener("ended", () => calarGit(1));
ses.addEventListener("timeupdate", () => {
  if (!ses.duration) return;
  $("#calarKonum").value = (ses.currentTime / ses.duration) * 1000;
  $("#calarZaman").textContent = sureFmt(ses.currentTime);
  $("#calarToplam").textContent = sureFmt(ses.duration);
});
$("#calarKonum").oninput = (e) => { if (ses.duration) ses.currentTime = (e.target.value / 1000) * ses.duration; };
$("#calarOynat").onclick = () => (ses.paused ? ses.play() : ses.pause());
$("#calarOnceki").onclick = () => (ses.currentTime > 4 ? (ses.currentTime = 0) : calarGit(-1));
$("#calarSonraki").onclick = () => calarGit(1);
$("#calarKapat").onclick = () => { ses.pause(); ses.removeAttribute("src"); $("#calar").hidden = true; document.body.classList.remove("calar-acik"); calarIsaretle(); };

/* ---------------- BELGELER ---------------- */
const METIN_UZ = ["txt", "md", "csv", "json", "xml", "log"];
function belgeBagla(kap) {
  $$(".belge", kap).forEach((b) => (b.onclick = () => belgeAc({ id: +b.dataset.id, uzanti: "." + b.dataset.uz, yol: b.dataset.yol, ad: $("h4", b).textContent })));
}
async function belgeAc(m) {
  const uz = (m.uzanti || "").slice(1);
  if (!["pdf", "html", "htm", ...METIN_UZ].includes(uz)) {
    await post("/api/ac", { yol: m.yol });
    bildir("“" + m.ad + "” bilgisayardaki programla açılıyor…");
    return;
  }
  const kap = document.createElement("div");
  kap.className = "okuyucu-kap";
  kap.innerHTML = `<div class="okuyucu-bas"><button class="ikon-btn" data-kapat>${IKON.geri}</button><h2>${esc(m.ad)}</h2>
    <a class="kucuk-btn" href="/dosya/${m.id}?indir=1">${IKON.indir}İndir</a><button class="kucuk-btn" data-ac>${IKON.ac}Programla aç</button></div>`;
  if (METIN_UZ.includes(uz)) {
    const pre = document.createElement("pre");
    pre.textContent = await (await fetch("/dosya/" + m.id)).text();
    kap.appendChild(pre);
  } else {
    const f = document.createElement("iframe");
    f.src = "/dosya/" + m.id;
    if (uz !== "pdf") f.setAttribute("sandbox", "");
    kap.appendChild(f);
  }
  document.body.appendChild(kap);
  const kapat = () => { kap.remove(); window.removeEventListener("hashchange", kapat); };
  $("[data-kapat]", kap).onclick = kapat;
  $("[data-ac]", kap).onclick = () => post("/api/ac", { yol: m.yol });
  window.addEventListener("hashchange", kapat);
}
async function sayfaBelgeler(_, q) {
  document.title = "Belgeler — Portal";
  const klasor = q.get("klasor") || "";
  const klasorler = await api("/api/klasorler?tur=belge");
  sayfa.innerHTML = `<div class="dar" style="max-width:1500px"><h1 class="sayfa-baslik">${klasor ? esc(klasorAdi(klasor)) : "Belgeler"}</h1>
    <p class="sayfa-alt">${klasorBilgisi("belge")}</p>
    <div class="cipler"><a class="cip ${!klasor ? "aktif" : ""}" href="#/belgeler">Tümü</a>${klasorler.map((k) => `<a class="cip ${k.klasor === klasor ? "aktif" : ""}" href="#/belgeler?klasor=${encodeURIComponent(k.klasor)}">${esc(klasorAdi(k.klasor))} <span style="opacity:.55">${k.adet}</span></a>`).join("")}</div>
    <div class="belge-izgara" id="bIzgara"></div></div>`;
  const kap = $("#bIzgara");
  await sonsuzListe(kap, (b, a) => api(`/api/medya?tur=belge&sira=ad&klasor=${encodeURIComponent(klasor)}&bas=${b}&adet=${a}`), (l, b) => {
    if (!l.length && !b) { kap.outerHTML = bosEkran(IKON.belge, "Henüz belge yok", klasorBilgisi("belge")); return; }
    kap.insertAdjacentHTML("beforeend", l.map(belgeKart).join(""));
    belgeBagla(kap);
  });
}

/* ---------------- KLASÖRLER ---------------- */
async function sayfaKlasorler(_, q) {
  document.title = "Klasörlerim — Portal";
  const o = await api("/api/klasor-ozet");
  const sira = q.get("sira") || "ad";
  const liste = [...o.klasorler];
  if (sira === "yeni") liste.sort((a, b) => b.son - a.son);
  if (sira === "buyuk") liste.sort((a, b) => b.toplam - a.toplam);
  sayfa.innerHTML = `<div class="dar" style="max-width:1600px"><h1 class="sayfa-baslik">Klasörlerim</h1>
    <p class="sayfa-alt">${o.klasorler.length} klasör · ${sayilarMetni(o.sayilar)}</p>
    <div class="cipler"><input id="kFiltre" class="filtre-kutu" type="search" placeholder="Klasör ara…" autocomplete="off">
      ${[["ad", "Ada göre"], ["yeni", "En yeni"], ["buyuk", "En dolu"]].map(([k, a]) => `<a class="cip ${k === sira ? "aktif" : ""}" href="#/klasorler?sira=${k}">${a}</a>`).join("")}</div>
    ${liste.length ? `<div class="kizgara" id="kIzgara">${liste.map(klasorKart).join("")}</div>` : bosEkran(IKON.klasor, "Henüz klasör bulunamadı", "Tarama sürüyor olabilir; birkaç dakika sonra yenile.")}</div>`;
  $("#kFiltre")?.addEventListener("input", (e) => {
    const f = e.target.value.toLocaleLowerCase("tr-TR");
    $$("#kIzgara .kkart").forEach((k) => (k.hidden = f && !$("h4", k).textContent.toLocaleLowerCase("tr-TR").includes(f)));
  });
}

async function sayfaKlasor(_, q) {
  const yol = q.get("yol") || "";
  const sekme = q.get("t") || "hepsi";
  const o = await api("/api/klasor-ozet?yol=" + encodeURIComponent(yol));
  const ad = o.ad || "Disk";
  document.title = ad + " — Portal";
  const parca = yol.split("/").filter(Boolean);
  let yc = `<a href="#/klasorler">Klasörlerim</a>`;
  parca.forEach((p, i) => (yc += `<span style="color:var(--metin-3)">›</span><a href="${klasorHref(parca.slice(0, i + 1).join("/"))}">${esc(p)}</a>`));
  const say = o.sayilar;
  const turAd = { video: "Videolar", foto: "Fotoğraflar", muzik: "Müzik", belge: "Belgeler" };
  const sekmeler = [["hepsi", "Tümü"]].concat(Object.keys(turAd).filter((t) => say[t]).map((t) => [t, `${turAd[t]} <span style="opacity:.55">${say[t]}</span>`]));
  let h = `<div class="dar" style="max-width:1600px">
    <div class="yol-cubugu" style="margin-bottom:4px">${yc}</div>
    <div class="klasor-bas"><div class="klasor-ikon-buyuk" style="background:${renk(ad)}">${IKON.klasor}</div>
      <div style="flex:1;min-width:0"><h1 class="sayfa-baslik" style="margin:0 0 2px">${esc(ad)}</h1><p class="sayfa-alt" style="margin:0">${sayilarMetni(say) || "Bu klasörde gösterilecek dosya yok"}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${say.foto ? `<button class="kucuk-btn vurgulu" id="kSlayt">${IKON.oynat}Slayt gösterisi</button>` : ""}
      ${say.muzik ? `<button class="kucuk-btn" id="kCal">${IKON.muzik}Müzikleri çal</button>` : ""}
      ${yol ? `<button class="kucuk-btn" id="kAc">${IKON.ac}Bilgisayarda aç</button>` : ""}</div></div>
    ${o.klasorler.length ? `<h3 class="alt-baslik">Alt klasörler</h3><div class="kizgara kucuk">${o.klasorler.map(klasorKart).join("")}</div>` : ""}
    ${sekmeler.length > 2 ? `<nav class="sonuc-sekmeler" style="margin-top:22px">${sekmeler.map(([k, a]) => `<a class="${k === sekme ? "aktif" : ""}" href="${klasorHref(yol, k)}">${a}</a>`).join("")}</nav>` : ""}
    <div id="kIcerik"></div></div>`;
  sayfa.innerHTML = h;
  const kap = $("#kIcerik");
  const k = encodeURIComponent(yol);
  const fotolar = [];
  $("#kAc")?.addEventListener("click", () => post("/api/ac", { yol }));
  $("#kSlayt")?.addEventListener("click", async () => { const l = await api(`/api/medya?tur=foto&klasor=${k}&sira=eski&adet=500`); l.length && isikKutuAc(l, 0, true); });
  $("#kCal")?.addEventListener("click", async () => { const l = await api(`/api/medya?tur=muzik&klasor=${k}&sira=ad&adet=500`); l.length && calarBaslat(l, 0); });
  kap.addEventListener("click", (e) => { const a = e.target.closest(".foto-izgara [data-i]"); if (a) isikKutuAc(fotolar, +a.dataset.i); });

  if (sekme === "hepsi") {
    const [v, f, m, b] = await Promise.all(["video", "foto", "muzik", "belge"].map((t, i) => say[t] ? api(`/api/medya?tur=${t}&klasor=${k}&sira=${t === "foto" ? "eski" : "ad"}&adet=${[8, 30, 8, 8][i]}`) : []));
    let c = "";
    const bas = (t, adi) => `<div class="bolum-bas"><h2>${adi}</h2>${say[t] > [8, 30, 8, 8][["video", "foto", "muzik", "belge"].indexOf(t)] ? `<a href="${klasorHref(yol, t)}">Tümünü gör (${say[t]})</a>` : ""}</div>`;
    if (v.length) c += `<section class="bolum">${bas("video", "Videolar")}<div class="izgara">${v.map(vkart).join("")}</div></section>`;
    if (f.length) { fotolar.push(...f); c += `<section class="bolum">${bas("foto", "Fotoğraflar")}<div class="foto-izgara">${f.map(fotoKucuk).join("")}</div></section>`; }
    if (m.length) c += `<section class="bolum">${bas("muzik", "Müzik")}<div class="parca-liste" id="kMuzik">${m.map(parcaSatir).join("")}</div></section>`;
    if (b.length) c += `<section class="bolum">${bas("belge", "Belgeler")}<div class="belge-izgara">${b.map(belgeKart).join("")}</div></section>`;
    kap.innerHTML = c || (o.klasorler.length ? "" : bosEkran(IKON.klasor, "Bu klasör boş", "Burada video, fotoğraf, müzik ya da belge bulunamadı. <a href='#/dosyalar?yol=" + encodeURIComponent(yol) + "' style='color:var(--vurgu)'>Tüm dosyaları göster</a>"));
    muzikListeBagla($("#kMuzik"), m);
    belgeBagla(kap);
    return;
  }
  // tek tür: sonsuz liste
  const sablon = { video: ["izgara", vkart], foto: ["foto-izgara", null], muzik: ["parca-liste", parcaSatir], belge: ["belge-izgara", belgeKart] }[sekme];
  kap.innerHTML = `<div class="${sablon[0]}" id="kListe" style="margin-top:8px"></div>`;
  const liste = $("#kListe");
  const muzikler = [];
  if (sekme === "muzik") liste.addEventListener("click", (e) => { const p = e.target.closest(".parca"); if (p) calarBaslat(muzikler, +p.dataset.i); });
  await sonsuzListe(liste, (b, a) => api(`/api/medya?tur=${sekme}&klasor=${k}&sira=${sekme === "foto" ? "eski" : "ad"}&bas=${b}&adet=${a}`), (l) => {
    if (sekme === "foto") { liste.insertAdjacentHTML("beforeend", l.map((m) => fotoKucuk(m, fotolar.push(m) - 1)).join("")); return; }
    if (sekme === "muzik") { liste.insertAdjacentHTML("beforeend", l.map((m) => parcaSatir(m, muzikler.push(m) - 1)).join("")); calarIsaretle(); return; }
    liste.insertAdjacentHTML("beforeend", l.map(sablon[1]).join(""));
    if (sekme === "belge") belgeBagla(liste);
  }, sekme === "foto" ? 120 : 60);
}

/* ---------------- VİKİPEDİ ---------------- */
async function sayfaWiki(parcalar) {
  if (!DURUM.wikiVar) {
    sayfa.innerHTML = bosEkran(IKON.wiki, "Vikipedi dosyası bulunamadı", "Diskinin kökünde <code>Vikipedi</code> adında bir klasör oluştur ve <code>wikipedia_tr_all_maxi_….zim</code> dosyasını içine koy. Ardından Portal'ı yeniden başlat.");
    return;
  }
  if (parcalar.length >= 2) return makaleGoster(parcalar[0], parcalar.slice(1).map(decodeURIComponent).join("/"));
  document.title = "Vikipedi — Portal";
  const zimler = DURUM.bilgi.vikipedi;
  sayfa.innerHTML = `<div class="dar">
    <div class="kahraman" style="padding-top:30px"><h1 class="selam" style="font-family:var(--okuma-yazi)">Vikipedi<span>.</span></h1>
    <div class="tarih">${zimler.map((z) => `${esc(z.baslik)} · ${z.makale.toLocaleString("tr-TR")} makale`).join(" — ")}</div>
    <form class="kahraman-arama" id="wikiForm">${IKON.ara}<input id="wikiKutu" type="search" placeholder="Vikipedi'de ara…" autocomplete="off"></form>
    <div class="ozet-sayilar"><a href="javascript:void(0)" id="rastgeleBtn">${IKON.zar}Rastgele makale</a>
    ${zimler.map((z) => z.ana ? `<a href="#/wiki/${z.id}/${wikiYol(z.ana)}">${IKON.wiki}${esc(z.baslik)} ana sayfası</a>` : "").join("")}</div></div>
    <section class="bolum"><div class="bolum-bas"><h2>Keşfet</h2><a href="javascript:void(0)" id="dahaKesfet">${IKON.yenile.replace("<svg", '<svg style="width:16px;height:16px;vertical-align:-3px"')} Yenile</a></div>
    <div class="makale-izgara" id="kesfet"><div class="yukleniyor" style="grid-column:1/-1"></div></div></section>
    <div style="text-align:center;margin:26px 0"><button class="kucuk-btn" id="dahaFazla">Daha fazla makale göster</button></div></div>`;
  $("#wikiForm").onsubmit = (e) => { e.preventDefault(); const q = $("#wikiKutu").value.trim(); if (q) location.hash = "#/ara?q=" + encodeURIComponent(q) + "&t=wiki"; };
  oneriBagla($("#wikiKutu"));
  $("#rastgeleBtn").onclick = async () => { const o = await api("/api/wiki/rastgele"); if (o) location.hash = `#/wiki/${o.z}/${wikiYol(o.yol)}`; };
  const kap = $("#kesfet");
  let ilk = true;
  async function yukle(temizle) {
    const l = await api("/api/wiki/kesfet?adet=9");
    if (temizle) kap.innerHTML = "";
    kap.insertAdjacentHTML("beforeend", l.map((o, i) => makaleKart(o, ilk && i === 0 && !!o.resim, "Keşfet")).join(""));
    ilk = false;
  }
  $("#dahaKesfet").onclick = () => { ilk = true; kap.innerHTML = '<div class="yukleniyor" style="grid-column:1/-1"></div>'; yukle(true); };
  $("#dahaFazla").onclick = () => yukle(false);
  await yukle(true);
}
/* Vikipedi HTML'inden gelip okuma sütununu daraltan her şeyi (sola kaydırılmış
   kutular, büyük sol boşluklar, içi boş yer tutucular) ekranda ölçerek temizler. */
function makaleDuzelt(yazi) {
  const sagaIzin = ".infobox, table.infobox, .thumb, .tright, .tleft, .floatright, .floatleft, figure.mw-halign-right, figure.mw-halign-left, figure[typeof*='mw:File/Thumb']";
  const genislik = yazi.clientWidth;
  for (const el of yazi.querySelectorAll("*")) {
    if (el.closest("table.infobox, .infobox") && !el.matches(".infobox, table.infobox")) continue;
    const cs = getComputedStyle(el);
    if (cs.float !== "none" && !el.matches(sagaIzin)) el.style.float = "none";
    if (!/^(UL|OL|DD|DL|BLOCKQUOTE|LI)$/.test(el.tagName)) {
      if (parseFloat(cs.marginLeft) > 40) el.style.marginLeft = "0";
      if (parseFloat(cs.paddingLeft) > 60) el.style.paddingLeft = "0";
    }
    if (cs.position === "absolute" || cs.position === "fixed") el.style.position = "static";
    // görünür içeriği olmayan ama yer kaplayan kutular
    if (!/^(IMG|BR|HR|TD|TH|TR|SUP|VIDEO|AUDIO|SVG|svg)$/.test(el.tagName) && !el.textContent.trim() && !el.querySelector("img, svg, video, audio, math")) {
      const r = el.getBoundingClientRect();
      if (r.height > 20 || r.width > 40) el.style.display = "none";
    }
  }
  // genişliği sabitlenmiş bloklar sütunu daraltmasın
  for (const el of yazi.querySelectorAll(":scope > *, :scope > section > *, :scope > div > *, :scope > details > section > *")) {
    if (el.matches(sagaIzin) || el.tagName === "TABLE") continue;
    const w = el.getBoundingClientRect().width;
    if (w && w < genislik * 0.8 && getComputedStyle(el).display === "block" && el.textContent.trim().length > 200) el.style.width = "auto", el.style.maxWidth = "none";
  }
  // yüklenemeyen resimler boş kutu bırakmasın
  yazi.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
    const kap = img.closest("figure, .thumb, .gallerybox") || img;
    kap.style.display = "none";
  }, { once: true }));
}

async function makaleGoster(z, yol) {
  const m = await api(`/api/wiki/makale?z=${z}&yol=${encodeURIComponent(yol)}`);
  if (m.yonlendir) { location.href = m.yonlendir; return; }
  document.title = m.baslik + " — Vikipedi (Portal)";
  const icindekiler = m.icindekiler.filter((b) => b.metin.length < 80).slice(0, 40);
  sayfa.innerHTML = `<div class="makale-duzen"><article>
    <header class="makale-ust"><div class="kategori">${IKON.wiki.replace("<svg", '<svg style="width:15px;height:15px"')}${esc(m.kaynak)}</div>
      <h1>${esc(m.baslik)}</h1>
      <div class="yazar"><span class="fav">W</span><div><b>Vikipedi, özgür ansiklopedi</b>${m.okuma_dk} dakikalık okuma · çevrimdışı kopya</div>
        <div class="eylemler"><button class="kucuk-btn" id="mRastgele">${IKON.zar}Rastgele</button></div></div></header>
    ${m.resim ? `<figure class="kapak-gorsel"><img src="${esc(m.resim)}" alt="" onerror="this.parentNode.remove()"></figure>` : ""}
    <div class="yazi" id="yazi">${m.html}</div>
    <div class="makale-son" id="makaleSon"></div>
  </article>
  <aside class="icindekiler">${icindekiler.length ? `<h4>Bu yazıda</h4>${icindekiler.map((b) => `<a href="javascript:void(0)" data-hedef="${esc(b.id)}" class="${b.seviye === 3 ? "alt" : ""}">${esc(b.metin)}</a>`).join("")}` : ""}</aside></div>`;
  const yazi = $("#yazi");
  // kapak olarak gösterilen resmi içerikte tekrar gösterme
  if (m.resim) {
    const ayni = $$("img", yazi).find((i) => i.getAttribute("src") === m.resim);
    if (ayni) (ayni.closest("tr") || ayni.closest("figure") || ayni.closest(".thumb") || ayni).remove();
  }
  makaleDuzelt(yazi);
  // ilk gerçek paragrafa büyük baş harf
  const ilkP = $$("p", yazi).find((p) => !p.closest("table, .hatnote, .infobox") && p.textContent.trim().length > 60);
  if (ilkP) ilkP.classList.add("ilk-paragraf");
  // kapak resmi ile içerikteki ilk resim aynıysa ikinciyi gizleme (bilgi kutusundaki kalsın)
  $$("a.dis-baglanti", yazi).forEach((a) => (a.onclick = (e) => { e.preventDefault(); bildir("Bu bir internet bağlantısı; çevrimdışı modda açılamaz."); }));
  $$("a[data-capa]", yazi).forEach((a) => a.addEventListener("click", () => {}));
  $$(".icindekiler a").forEach((a) => (a.onclick = () => document.getElementById(a.dataset.hedef)?.scrollIntoView({ behavior: "smooth" })));
  $("#mRastgele").onclick = async () => { const o = await api("/api/wiki/rastgele"); if (o) location.hash = `#/wiki/${o.z}/${wikiYol(o.yol)}`; };
  // aynı sayfadaki çapalar (#...) için yumuşak kaydırma
  yazi.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && !a.getAttribute("href").startsWith("#/")) {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  // içindekiler vurgusu
  const basliklar = icindekiler.map((b) => document.getElementById(b.id)).filter(Boolean);
  const gozlem = new IntersectionObserver((g) => {
    g.forEach((x) => { if (x.isIntersecting) $$(".icindekiler a").forEach((a) => a.classList.toggle("aktif", a.dataset.hedef === x.target.id)); });
  }, { rootMargin: "-20% 0px -70% 0px" });
  basliklar.forEach((b) => gozlem.observe(b));
  aktifTemizle = () => gozlem.disconnect();
  // yazının sonunda "ilgili okumalar" + diskteki eşleşmeler
  api(`/api/ara?q=${encodeURIComponent(m.baslik)}`).then((r) => {
    const ilgili = r.vikipedi.sonuclar.filter((o) => o.yol !== m.yol).slice(0, 3);
    const d = r.dosyalar || {};
    let h = "";
    if (ilgili.length) h += `<h3>İlgili okumalar</h3><div class="makale-izgara">${ilgili.map((o) => makaleKart(o, false, "İlgili")).join("")}</div>`;
    if (d.video?.length) h += `<h3 style="margin-top:30px">Diskindeki ilgili videolar</h3><div class="yatay">${d.video.map(vkart).join("")}</div>`;
    $("#makaleSon") && ($("#makaleSon").innerHTML = h);
  }).catch(() => {});
}

/* ---------------- TÜM DOSYALAR ---------------- */
async function sayfaDosyalar(_, q) {
  document.title = "Tüm dosyalar — Portal";
  const yol = q.get("yol") || "";
  const r = await api("/api/gez?yol=" + encodeURIComponent(yol));
  const parca = r.yol ? r.yol.split("/") : [];
  let yc = `<a href="#/dosyalar">Disk</a>`;
  parca.forEach((p, i) => (yc += `<span style="color:var(--metin-3)">›</span><a href="#/dosyalar?yol=${encodeURIComponent(parca.slice(0, i + 1).join("/"))}">${esc(p)}</a>`));
  sayfa.innerHTML = `<div class="dar"><h1 class="sayfa-baslik">Tüm dosyalar</h1>
    <p class="sayfa-alt">Diskin tamamı burada — salt okunur gösterilir, hiçbir dosya değiştirilmez.</p>
    <div class="yol-cubugu">${yc}</div>
    ${r.ogeler.length ? `<table class="dosya-tablo"><thead><tr><th>Ad</th><th style="text-align:right">Değiştirilme</th><th style="text-align:right">Boyut</th></tr></thead><tbody>
    ${r.ogeler.map((o, i) => `<tr data-i="${i}"><td><span class="ad">${o.klasor ? IKON.klasor : IKON[o.tur] || IKON.dosya}${esc(o.ad)}</span></td><td class="sag">${tarihFmt(o.mtime, { day: "numeric", month: "short", year: "numeric" })}</td><td class="sag">${o.klasor ? "—" : boyutFmt(o.boyut)}</td></tr>`).join("")}
    </tbody></table>` : bosEkran(IKON.klasor, "Bu klasör boş", "")}</div>`;
  $(".dosya-tablo tbody")?.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const o = r.ogeler[+tr.dataset.i];
    if (o.klasor) { location.hash = "#/dosyalar?yol=" + encodeURIComponent(o.yol); return; }
    if (o.id && o.tur === "video") { location.hash = "#/izle/" + o.id; return; }
    if (o.id && o.tur === "foto") {
      const fotolar = r.ogeler.filter((x) => x.tur === "foto" && x.id).map((x) => ({ ...x, ad: x.ad, tarih: x.mtime }));
      isikKutuAc(fotolar, fotolar.findIndex((x) => x.id === o.id));
      return;
    }
    if (o.id && o.tur === "muzik") {
      const l = await Promise.all(r.ogeler.filter((x) => x.tur === "muzik" && x.id).map((x) => api("/api/medya/" + x.id)));
      calarBaslat(l, l.findIndex((x) => x.id === o.id));
      return;
    }
    if (o.id && o.tur === "belge") { belgeAc({ id: o.id, uzanti: "." + o.ad.split(".").pop().toLowerCase(), yol: o.yol, ad: o.ad }); return; }
    if (o.ad.toLowerCase().endsWith(".zim")) { location.hash = "#/wiki"; return; }
    await post("/api/ac", { yol: o.yol });
    bildir("“" + o.ad + "” bilgisayardaki programla açılıyor…");
  });
}

/* ---------------- TAKVİM ---------------- */
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
async function sayfaTakvim(_, q) {
  const yil = +q.get("yil") || 0, ay = +q.get("ay") || 0;
  if (yil && ay) return takvimAy(yil, ay);
  document.title = "Takvim — Portal";
  const l = await api("/api/takvim");
  const yillar = [...new Set(l.map((x) => x.yil))];
  const sec = yil || null;
  sayfa.innerHTML = `<div class="dar" style="max-width:1500px"><h1 class="sayfa-baslik">Takvim</h1>
    <p class="sayfa-alt">Fotoğraf ve videoların çekildikleri aya göre. Videolarda telefonun kaydettiği çekim tarihi, yoksa dosya tarihi kullanılır.</p>
    <div class="cipler"><a class="cip ${!sec ? "aktif" : ""}" href="#/takvim">Tüm yıllar</a>${yillar.map((y) => `<a class="cip ${y === sec ? "aktif" : ""}" href="#/takvim?yil=${y}">${y}</a>`).join("")}</div>
    ${l.length ? yillar.filter((y) => !sec || y === sec).map((y) => {
      const aylar = l.filter((x) => x.yil === y);
      const top = aylar.reduce((t, a) => t + a.foto + a.video, 0);
      return `<section class="bolum"><div class="bolum-bas"><h2>${y}</h2><span style="color:var(--metin-2);font-size:14px">${top.toLocaleString("tr-TR")} anı</span></div>
        <div class="ay-izgara">${aylar.map((a) => `<a class="ay-kart" href="#/takvim?yil=${a.yil}&ay=${a.ay}"><div class="kapak">${a.kapak ? `<img loading="lazy" src="/kucuk/${a.kapak}" alt="" onerror="kucukHata(this, true)">` : ""}<span class="ay-ad">${AYLAR[a.ay - 1]}</span></div>
          <span>${[a.foto && a.foto + " fotoğraf", a.video && a.video + " video"].filter(Boolean).join(" · ")}</span></a>`).join("")}</div></section>`;
    }).join("") : bosEkran(IKON.foto, "Henüz fotoğraf ya da video yok", "Tarama bitince burada aylara göre görünecekler.")}</div>`;
}
async function takvimAy(yil, ay) {
  document.title = AYLAR[ay - 1] + " " + yil + " — Takvim";
  const t1 = new Date(yil, ay - 1, 1).getTime() / 1000, t2 = new Date(yil, ay, 1).getTime() / 1000;
  const [fotolar, videolar] = await Promise.all(["foto", "video"].map((t) => api(`/api/medya?tur=${t}&sira=eski&adet=5000&t1=${t1}&t2=${t2}`)));
  const hepsi = [...fotolar, ...videolar].sort((a, b) => a.tarih - b.tarih);
  const onceki = ay === 1 ? [yil - 1, 12] : [yil, ay - 1], sonraki = ay === 12 ? [yil + 1, 1] : [yil, ay + 1];
  const gunler = new Map();
  for (const m of hepsi) { const g = new Date(m.tarih * 1000).getDate(); if (!gunler.has(g)) gunler.set(g, []); gunler.get(g).push(m); }
  sayfa.innerHTML = `<div class="dar" style="max-width:1600px">
    <div class="yol-cubugu" style="margin-bottom:4px"><a href="#/takvim">Takvim</a><span style="color:var(--metin-3)">›</span><a href="#/takvim?yil=${yil}">${yil}</a><span style="color:var(--metin-3)">›</span><a>${AYLAR[ay - 1]}</a></div>
    <div class="klasor-bas"><div style="flex:1"><h1 class="sayfa-baslik" style="margin:0">${AYLAR[ay - 1]} ${yil}</h1><p class="sayfa-alt" style="margin:0">${[fotolar.length && fotolar.length + " fotoğraf", videolar.length && videolar.length + " video"].filter(Boolean).join(" · ") || "Bu ay için anı yok"}</p></div>
      <a class="kucuk-btn" href="#/takvim?yil=${onceki[0]}&ay=${onceki[1]}">${IKON.geri}${AYLAR[onceki[1] - 1]}</a>
      <a class="kucuk-btn" href="#/takvim?yil=${sonraki[0]}&ay=${sonraki[1]}">${AYLAR[sonraki[1] - 1]} ›</a>
      ${fotolar.length ? `<button class="kucuk-btn vurgulu" id="aySlayt">${IKON.oynat}Slayt gösterisi</button>` : ""}</div>
    <div class="ay-takvim">${takvimIzgara(yil, ay, gunler)}</div>
    <div id="gunler">${[...gunler].map(([g, l]) => `<section class="bolum gun" id="gun-${g}"><div class="bolum-bas"><h2>${new Date(yil, ay - 1, g).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</h2><span style="color:var(--metin-2);font-size:14px">${l.length} anı</span></div>
      <div class="foto-izgara">${l.map((m) => m.tur === "video" ? `<a href="#/izle/${m.id}" class="gun-video"><img loading="lazy" src="/kucuk/${m.id}" alt="" onerror="kucukHata(this, true)"><span class="ani-video">${IKON.oynat}${m.sure ? sureFmt(m.sure) : ""}</span>${fotoEtiket(m)}</a>` : fotoKucuk(m, fotolar.indexOf(m))).join("")}</div></section>`).join("")}</div></div>`;
  $("#gunler").addEventListener("click", (e) => { const a = e.target.closest("[data-i]"); if (a) isikKutuAc(fotolar, +a.dataset.i); });
  $("#aySlayt")?.addEventListener("click", () => isikKutuAc(fotolar, 0, true));
  $$(".takvim-gun[data-gun]").forEach((g) => (g.onclick = () => document.getElementById("gun-" + g.dataset.gun)?.scrollIntoView({ behavior: "smooth" })));
}
function takvimIzgara(yil, ay, gunler) {
  const ilk = (new Date(yil, ay - 1, 1).getDay() + 6) % 7; // pazartesi başlangıçlı
  const gunSay = new Date(yil, ay, 0).getDate();
  let h = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => `<div class="takvim-baslik">${d}</div>`).join("");
  for (let i = 0; i < ilk; i++) h += `<div></div>`;
  for (let g = 1; g <= gunSay; g++) {
    const l = gunler.get(g);
    h += l ? `<button class="takvim-gun dolu" data-gun="${g}"><img loading="lazy" src="/kucuk/${(l.find((x) => x.tur === "foto") || l[0]).id}" alt="" onerror="kucukHata(this, true)"><b>${g}</b><small>${l.length}</small></button>` : `<div class="takvim-gun"><b>${g}</b></div>`;
  }
  return h;
}

/* ---------------- ETİKETLER ---------------- */
async function sayfaEtiketler() {
  document.title = "Etiketler — Portal";
  const l = await api("/api/etiketler");
  sayfa.innerHTML = `<div class="dar" style="max-width:1000px"><h1 class="sayfa-baslik">Etiketler</h1>
    <p class="sayfa-alt">Videolara ve fotoğraflara kendi etiketlerini ekle (ör. <b>Zara</b>, <b>Doğum günü</b>). Aramada etiket adını yazınca o dosyalar gelir. Bir videonun ya da fotoğrafın altındaki <b>+ Etiket ekle</b> ile ekleyebilirsin.</p>
    <form class="cipler" id="yeniEtiket"><input class="filtre-kutu" placeholder="Yeni etiket adı…" maxlength="40"><button class="kucuk-btn vurgulu">${ETK_IKON}Oluştur</button></form>
    ${l.length ? `<div class="etiket-yonetim">${l.map((e) => `<div class="ey-satir"><a href="${etiketHref(e.ad)}" class="etiket-cip buyuk">${ETK_IKON}${esc(e.ad)}</a><span class="ey-adet">${e.adet} dosya</span>
      <button class="kalem" data-yeniden="${esc(e.ad)}" title="Yeniden adlandır" style="opacity:1">${KALEM}</button><button class="kalem cop-etk" data-etksil="${esc(e.ad)}" title="Sil" style="opacity:1">${COP}</button></div>`).join("")}</div>`
      : bosEkran(ETK_IKON, "Henüz etiket yok", "Yukarıdan bir etiket oluştur ya da bir video izlerken altındaki “+ Etiket ekle”ye bas.")}
    ${l.length > 1 ? `<h3 class="alt-baslik">Birden fazla etiketle filtrele</h3><div class="cipler" id="cokluSecim">${l.map((e) => `<label class="cip"><input type="checkbox" value="${esc(e.ad)}" style="accent-color:var(--vurgu)">${esc(e.ad)}</label>`).join("")}<button class="kucuk-btn" id="cokluGit">Seçilenleri göster</button></div>` : ""}</div>`;
  $("#yeniEtiket").onsubmit = async (e) => { e.preventDefault(); const v = $("input", e.target).value.trim(); if (v) { await post("/api/etiketler", { ad: v }); sayfaEtiketler(); } };
  sayfa.querySelector(".etiket-yonetim")?.addEventListener("click", async (e) => {
    const y = e.target.closest("[data-yeniden]"), d = e.target.closest("[data-etksil]");
    if (y) { const n = prompt(`“${y.dataset.yeniden}” etiketinin yeni adı:`, y.dataset.yeniden); if (n && n.trim()) { await post("/api/etiket-duzenle", { eski: y.dataset.yeniden, yeni: n.trim() }); sayfaEtiketler(); } }
    if (d && confirm(`“${d.dataset.etksil}” etiketi tüm dosyalardan kaldırılıp silinsin mi? (Dosyalar silinmez.)`)) { await post("/api/etiket-sil", { ad: d.dataset.etksil }); sayfaEtiketler(); }
  });
  $("#cokluGit")?.addEventListener("click", () => { const s = $$("#cokluSecim input:checked").map((i) => i.value); if (s.length) location.hash = etiketHref(s); });
}

async function sayfaEtiket(_, q) {
  const adlar = q.getAll("ad");
  const sekme = q.get("tur") || "hepsi";
  document.title = adlar.join(" + ") + " — Etiket";
  const tum = await api("/api/etiketler");
  const e = adlar.map((a) => "&etiket=" + encodeURIComponent(a)).join("");
  const turler = ["video", "foto", "muzik", "belge"];
  const sonuc = await Promise.all(turler.map((t) => (sekme === "hepsi" || sekme === t) ? api(`/api/medya?tur=${t}&sira=${t === "foto" ? "eski" : "yeni"}&adet=500${e}`) : []));
  const [v, f, m, b] = sonuc;
  const ekle = tum.filter((x) => !adlar.includes(x.ad));
  sayfa.innerHTML = `<div class="dar" style="max-width:1600px">
    <div class="yol-cubugu" style="margin-bottom:4px"><a href="#/etiketler">Etiketler</a><span style="color:var(--metin-3)">›</span><a>${esc(adlar.join(" + "))}</a></div>
    <div class="klasor-bas"><div class="klasor-ikon-buyuk" style="background:var(--vurgu)">${ETK_IKON}</div>
      <div style="flex:1;min-width:0"><h1 class="sayfa-baslik" style="margin:0 0 6px">${adlar.map((a) => `<span class="etiket-baslik">#${esc(a)}${adlar.length > 1 ? `<a href="${etiketHref(adlar.filter((x) => x !== a), sekme === "hepsi" ? "" : sekme)}" title="Çıkar">×</a>` : ""}</span>`).join(" ")}</h1>
      <p class="sayfa-alt" style="margin:0">${[v.length && v.length + " video", f.length && f.length + " fotoğraf", m.length && m.length + " şarkı", b.length && b.length + " belge"].filter(Boolean).join(" · ") || "Bu etiketle dosya yok"}${adlar.length > 1 ? " — tüm seçili etiketleri taşıyanlar" : ""}</p></div>
      ${f.length ? `<button class="kucuk-btn vurgulu" id="etSlayt">${IKON.oynat}Slayt gösterisi</button>` : ""}</div>
    ${ekle.length ? `<div class="cipler"><span style="font-size:13px;color:var(--metin-2);align-self:center">Etiket ekleyerek daralt:</span>${ekle.slice(0, 20).map((x) => `<a class="cip" href="${etiketHref([...adlar, x.ad])}">+ ${esc(x.ad)}</a>`).join("")}</div>` : ""}
    <div id="etIcerik"></div></div>`;
  let c = "";
  if (v.length) c += `<section class="bolum"><div class="bolum-bas"><h2>Videolar</h2></div><div class="izgara">${v.map(vkart).join("")}</div></section>`;
  if (f.length) c += `<section class="bolum"><div class="bolum-bas"><h2>Fotoğraflar</h2></div><div class="foto-izgara" id="etFoto">${f.map(fotoKucuk).join("")}</div></section>`;
  if (m.length) c += `<section class="bolum"><div class="bolum-bas"><h2>Müzik</h2></div><div class="parca-liste" id="etMuzik">${m.map(parcaSatir).join("")}</div></section>`;
  if (b.length) c += `<section class="bolum"><div class="bolum-bas"><h2>Belgeler</h2></div><div class="belge-izgara">${b.map(belgeKart).join("")}</div></section>`;
  $("#etIcerik").innerHTML = c || bosEkran(ETK_IKON, "Bu etiketle dosya yok", "Bir video ya da fotoğrafın altındaki “+ Etiket ekle” ile bu etiketi ekleyebilirsin.");
  $("#etFoto")?.addEventListener("click", (ev) => { const a = ev.target.closest("[data-i]"); if (a) isikKutuAc(f, +a.dataset.i); });
  $("#etSlayt")?.addEventListener("click", () => isikKutuAc(f, 0, true));
  muzikListeBagla($("#etMuzik"), m);
  belgeBagla(sayfa);
}

/* ---------------- ÇÖP KUTUSU ---------------- */
async function sayfaCop() {
  document.title = "Çöp kutusu — Portal";
  const l = await api("/api/cop");
  const toplam = l.reduce((t, o) => t + (o.boyut || 0), 0);
  sayfa.innerHTML = `<div class="dar" style="max-width:900px"><h1 class="sayfa-baslik">Çöp kutusu</h1>
    <p class="sayfa-alt">Sildiğin dosyalar burada bekler (diskte <code>Portal\\Cop</code> klasöründe). Geri alabilir ya da kalıcı olarak silebilirsin.</p>
    ${l.length ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap"><span style="color:var(--metin-2);font-size:14px">${l.length} dosya · ${boyutFmt(toplam)}</span>
      <button class="kucuk-btn" id="copBosalt" style="color:#d33">${COP}Çöp kutusunu boşalt</button></div>
    <table class="dosya-tablo"><thead><tr><th>Ad</th><th>Eski yeri</th><th style="text-align:right">Silinme</th><th></th></tr></thead><tbody>
    ${l.map((o) => `<tr data-id="${esc(o.id)}"><td><span class="ad">${IKON[o.tur] || IKON.dosya}${esc(o.ad)}</span></td><td style="color:var(--metin-2);font-size:13px">${esc(o.yol)}</td>
      <td class="sag">${goreceTarih(o.tarih)}</td><td class="sag"><button class="kucuk-btn" data-geri="${esc(o.id)}">Geri al</button> <button class="kucuk-btn" data-kalici="${esc(o.id)}" title="Kalıcı sil" style="color:#d33">${COP}</button></td></tr>`).join("")}
    </tbody></table>` : bosEkran(COP, "Çöp kutusu boş", "Sildiğin dosyalar geri alınabilmeleri için burada tutulur.")}</div>`;
  sayfa.querySelector("tbody")?.addEventListener("click", async (e) => {
    const g = e.target.closest("[data-geri]"), k = e.target.closest("[data-kalici]");
    if (g) { await post("/api/cop/geri/" + g.dataset.geri); bildir("Dosya eski yerine geri taşındı."); sayfaCop(); }
    if (k && confirm("Bu dosya KALICI olarak silinecek ve geri alınamayacak. Emin misin?")) { await post("/api/cop/bosalt", { id: k.dataset.kalici }); sayfaCop(); }
  });
  $("#copBosalt")?.addEventListener("click", async () => {
    if (!confirm(`Çöp kutusundaki ${l.length} dosya KALICI olarak silinecek (${boyutFmt(toplam)}). Bu işlem geri alınamaz. Devam edilsin mi?`)) return;
    await post("/api/cop/bosalt", {});
    bildir("Çöp kutusu boşaltıldı.");
    sayfaCop();
  });
}

/* ---------------- AYARLAR / DURUM ---------------- */
async function saglikKarti(yenile) {
  const kap = $("#saglikKart");
  if (!kap) return;
  const d = await api("/api/saglik" + (yenile ? "?yenile=1" : "")).catch(() => null);
  if (!d || !$("#saglikKart")) return;
  const w = d.windows || {}, k = d.kontrol || {};
  const saglikMetin = { Healthy: "Sağlıklı", Warning: "Uyarı", Unhealthy: "Sağlıksız", Unknown: "Bilinmiyor" }[w.saglik] || w.saglik || "—";
  const iyi = w.saglik === "Healthy" && !d.uyarilar.length;
  const bilgi = (ad, v) => (v === null || v === undefined || v === "") ? "" : `<dt>${ad}</dt><dd>${v}</dd>`;
  const ilerleme = k.toplam ? Math.round((k.okunan / k.toplam) * 100) : 0;
  kap.innerHTML = `<h3 style="display:flex;justify-content:space-between;align-items:center">Disk sağlığı <button class="kucuk-btn" id="saglikYenile">${IKON.yenile}Yenile</button></h3>
    <div class="saglik-ozet ${iyi ? "iyi" : d.uyarilar.length ? "kotu" : ""}">${IKON.kalkan}<div><b>${iyi ? "Disk sağlıklı görünüyor" : d.uyarilar.length ? "Dikkat gerekiyor" : "Durum tam okunamadı"}</b>
      ${d.uyarilar.map((u) => `<div>• ${esc(u)}</div>`).join("") || (d.oneri ? `<div>${esc(d.oneri)}</div>` : "")}</div></div>
    ${w.desteklenmiyor ? "<p>Windows disk bilgisi bu sistemde okunamıyor.</p>" : `<dl class="kv">
      ${bilgi("Model", esc(w.model))}${bilgi("Bağlantı / tür", esc([w.baglanti, w.medya && w.medya !== "Unspecified" ? (w.medya === "HDD" ? "Mekanik disk (HDD)" : w.medya) : ""].filter(Boolean).join(" · ")))}
      ${bilgi("Windows sağlık durumu", esc(saglikMetin))}${bilgi("Dosya sistemi", esc(w.dosya_sistemi))}
      ${bilgi("Sıcaklık", w.sicaklik ? w.sicaklik + " °C" + (w.sicaklik_max ? " (en yüksek " + w.sicaklik_max + " °C)" : "") : null)}
      ${bilgi("Çalışma süresi", w.calisma_saati ? w.calisma_saati.toLocaleString("tr-TR") + " saat (~" + (w.calisma_saati / 24 / 365).toFixed(1) + " yıl)" : null)}
      ${bilgi("Okuma hataları", w.okuma_hata != null ? w.okuma_hata + (w.okuma_duzeltilemeyen ? " (düzeltilemeyen: " + w.okuma_duzeltilemeyen + ")" : "") : null)}
      ${bilgi("Yazma hataları", w.yazma_hata)}${bilgi("Aşınma", w.asinma != null ? "%" + w.asinma : null)}
    </dl>${w.sicaklik == null && w.calisma_saati == null ? `<p style="font-size:13px;color:var(--metin-2);margin:10px 0 0">Sıcaklık ve çalışma saati gibi ayrıntılar okunamadı. Birçok USB disk kutusu bu bilgiyi iletmez ya da Windows yönetici izni ister. Ayrıntılı rapor için ücretsiz <b>CrystalDiskInfo</b> programını kullanabilirsin.</p>` : ""}`}
    <h4 style="margin:20px 0 6px">Okunabilirlik kontrolü</h4>
    <p style="font-size:14px;color:var(--metin-2);margin:0 0 10px">Diskteki tüm fotoğraf, video, müzik ve belgeleri baştan sona okuyup açılamayan (bozulmuş) dosya var mı bakar ve okuma hızını ölçer. Hiçbir dosyayı değiştirmez. Büyük bir diskte saatler sürebilir; bu sırada Portal'ı kullanmaya devam edebilirsin.</p>
    ${k.durum === "suruyor" ? `<div class="ilerleme-cubuk"><i style="width:${ilerleme}%"></i></div><p style="font-size:13.5px">Kontrol ediliyor: ${k.okunan.toLocaleString("tr-TR")} / ${k.toplam.toLocaleString("tr-TR")} dosya (${ilerleme}%) · ${boyutFmt(k.bayt)} okundu${k.hiz ? " · " + boyutFmt(k.hiz) + "/sn" : ""}</p>` :
      `<button class="kucuk-btn vurgulu" id="kontrolBaslat">${IKON.kalkan}${k.durum === "hic" ? "Kontrolü başlat" : "Yeniden kontrol et"}</button>
      ${k.bitis ? `<p style="font-size:13.5px;margin:10px 0 0">Son kontrol ${goreceTarih(k.bitis)}: ${k.toplam.toLocaleString("tr-TR")} dosya, ${boyutFmt(k.bayt)}${k.hiz ? ", ortalama " + boyutFmt(k.hiz) + "/sn" : ""} — <b>${d.kontrol_hatalari.length ? d.kontrol_hatalari.length + " dosya okunamadı" : "tüm dosyalar okunabiliyor ✓"}</b></p>` : ""}
      ${k.durum === "yarida" ? `<p style="font-size:13.5px">Önceki kontrol yarıda kaldı (${k.okunan}/${k.toplam}).</p>` : ""}`}
    ${d.okuma_hatalari.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;color:#d33">Okunamayan dosyalar (${d.okuma_hatalari.length})</summary><ul style="font-size:13px">${d.okuma_hatalari.map((x) => `<li>${esc(x.yol)} <span style="color:var(--metin-3)">— ${esc(x.hata)}</span></li>`).join("")}</ul></details>` : ""}`;
  $("#saglikYenile").onclick = () => { kap.innerHTML = '<div class="yukleniyor"></div>'; saglikKarti(true); };
  $("#kontrolBaslat")?.addEventListener("click", async () => { await post("/api/saglik/kontrol"); saglikKarti(); });
  if (k.durum === "suruyor") setTimeout(() => saglikKarti(), 3000);
}
async function sayfaAyarlar() {
  document.title = "Disk ve ayarlar — Portal";
  const d = (DURUM.bilgi = await api("/api/durum"));
  const ist = d.istatistik;
  const ad = { video: "Video", foto: "Fotoğraf", muzik: "Şarkı", belge: "Belge" };
  sayfa.innerHTML = `<div class="dar" style="max-width:900px"><h1 class="sayfa-baslik">Disk ve ayarlar</h1><p class="sayfa-alt">${esc(d.kok)}</p>
    <div class="kart guvenli">${IKON.kalkan}<div><b>Verilerin güvende.</b> Portal diskindeki dosyaları yalnızca okur; sen silmedikçe hiçbirini değiştirmez, taşımaz ya da silmez. Verdiğin adlar ve etiketler dosyalara değil <code>Portal\\veri</code> klasörüne yazılır. Sildiğin dosyalar önce <a href="#/cop" style="color:var(--vurgu)">çöp kutusuna</a> gider.</div></div>
    <div class="kart" id="saglikKart"><h3>Disk sağlığı</h3><div class="yukleniyor"></div></div>
    <div class="kart"><h3>Kütüphane</h3><div class="istat-izgara">
      ${Object.keys(ad).map((t) => `<div class="istat"><b>${(ist[t]?.adet || 0).toLocaleString("tr-TR")}</b><span>${ad[t]} · ${boyutFmt(ist[t]?.boyut || 0)}</span></div>`).join("")}
      </div>
      <p style="font-size:14px;color:var(--metin-2);margin:14px 0 0">Tarama: <b>${d.tarama.durum === "taraniyor" ? "devam ediyor (" + d.tarama.islenen + " dosya)" : d.tarama.son ? "tamamlandı, " + goreceTarih(d.tarama.son) : "bekliyor"}</b></p>
      <div style="margin-top:12px"><button class="kucuk-btn" id="yenidenTara">${IKON.yenile}Diski yeniden tara</button></div></div>
    <div class="kart"><h3>Klasörler</h3><dl class="kv">${Object.keys(ad).map((t) => `<dt>${ad[t]}</dt><dd>${(d.klasorler[t] || []).map(esc).join(", ") || '<span style="color:var(--metin-3)">bulunamadı</span>'}</dd>`).join("")}</dl></div>
    <div class="kart"><h3>Vikipedi</h3>${d.vikipedi.length ? `<dl class="kv">${d.vikipedi.map((z) => `<dt>${esc(z.baslik)}</dt><dd>${esc(z.dosya)} · ${z.makale.toLocaleString("tr-TR")} makale · ${boyutFmt(z.boyut)}</dd>`).join("")}</dl>` : "<p>ZIM dosyası bulunamadı. <code>Vikipedi</code> klasörüne koyup Portal'ı yeniden başlat.</p>"}</div>
    ${d.disk ? `<div class="kart"><h3>Disk</h3><div class="yan-alt" style="padding:0;color:var(--metin-2)"><div class="doluluk"><i style="width:${(100 - (d.disk.bos / d.disk.toplam) * 100).toFixed(1)}%"></i></div>${boyutFmt(d.disk.bos)} boş · toplam ${boyutFmt(d.disk.toplam)}</div></div>` : ""}
    <div class="kart"><h3>Diğer</h3><dl class="kv"><dt>Video dönüştürücü (ffmpeg)</dt><dd>${d.ffmpeg ? "hazır" : "bulunamadı — video küçük resimleri ve mkv/avi oynatma çalışmaz"}</dd>
    <dt>Ayar dosyası</dt><dd><code>Portal\\ayarlar.json</code></dd></dl></div></div>`;
  saglikKarti();
  $("#yenidenTara").onclick = async () => { await post("/api/yeniden-tara"); bildir("Tarama başladı. Bitince sayfayı yenile."); setTimeout(sayfaAyarlar, 2500); };
}

/* ---------------- arama kutusu + öneriler ---------------- */
function oneriBagla(kutu) {
  if (!kutu) return;
  let liste = kutu.parentNode.querySelector(".oneri-liste");
  if (!liste) { liste = document.createElement("ul"); liste.className = "oneri-liste"; liste.hidden = true; kutu.parentNode.appendChild(liste); }
  let sonuc = [], secili = -1, zaman;
  const kapat = () => { liste.hidden = true; secili = -1; };
  const git = (o) => {
    kapat();
    if (o.tur === "wiki") location.hash = `#/wiki/${o.z}/${wikiYol(o.yol)}`;
    else if (o.tur === "video") location.hash = "#/izle/" + o.id;
    else location.hash = "#/ara?q=" + encodeURIComponent(o.baslik) + "&t=" + o.tur;
  };
  kutu.addEventListener("input", () => {
    clearTimeout(zaman);
    const q = kutu.value.trim();
    if (q.length < 2) return kapat();
    zaman = setTimeout(async () => {
      sonuc = await api("/api/oner?q=" + encodeURIComponent(q)).catch(() => []);
      if (kutu.value.trim() !== q) return;
      if (!sonuc.length) return kapat();
      const etiket = { wiki: "Vikipedi", video: "Video", foto: "Fotoğraf", muzik: "Müzik", belge: "Belge" };
      liste.innerHTML = sonuc.map((o, i) => `<li data-i="${i}">${IKON[o.tur] || IKON.ara}<span>${vurgula(o.baslik, q)}</span><span class="etiket">${etiket[o.tur] || ""}</span></li>`).join("");
      liste.hidden = false;
      secili = -1;
    }, 140);
  });
  kutu.addEventListener("keydown", (e) => {
    if (liste.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      secili = (secili + (e.key === "ArrowDown" ? 1 : -1) + sonuc.length) % sonuc.length;
      $$("li", liste).forEach((li, i) => li.classList.toggle("secili", i === secili));
    } else if (e.key === "Enter" && secili >= 0) { e.preventDefault(); git(sonuc[secili]); }
    else if (e.key === "Escape") kapat();
  });
  liste.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); git(sonuc[+li.dataset.i]); } });
  kutu.addEventListener("blur", () => setTimeout(kapat, 150));
}

/* ---------------- genel olaylar ---------------- */
$("#aramaForm").onsubmit = (e) => {
  e.preventDefault();
  const q = $("#aramaKutu").value.trim();
  $("#oneriListe").hidden = true;
  if (q) location.hash = "#/ara?q=" + encodeURIComponent(q);
};
oneriBagla($("#aramaKutu"));
$("#menuBtn").onclick = () => document.body.classList.toggle(window.innerWidth <= 900 ? "yan-acik" : "yan-kapali");
window.addEventListener("scroll", () => $(".ust").classList.toggle("golgeli", window.scrollY > 4), { passive: true });
function temaUygula(t) { if (t) document.documentElement.dataset.tema = t; else delete document.documentElement.dataset.tema; }
try { temaUygula(localStorage.getItem("tema")); } catch (e) {}
$("#temaBtn").onclick = () => {
  const koyuMu = document.documentElement.dataset.tema ? document.documentElement.dataset.tema === "koyu" : matchMedia("(prefers-color-scheme: dark)").matches;
  const yeni = koyuMu ? "acik" : "koyu";
  temaUygula(yeni);
  try { localStorage.setItem("tema", yeni); } catch (e) {}
};
$("#cikarBtn").onclick = async () => {
  if (!confirm("Portal kapatılsın mı? Kapandıktan sonra diski güvenle çıkarabilirsin.")) return;
  ses.pause();
  $$("video").forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
  await post("/api/kapat").catch(() => {});
  document.body.insertAdjacentHTML("beforeend", `<div class="cikti-ekran"><div>${IKON.kalkan}<h1>Portal kapatıldı</h1><p>Artık Windows'un “Donanımı güvenle kaldır” simgesinden diski çıkarabilirsin. Bu sekmeyi kapatabilirsin.</p></div></div>`);
};

async function basla() {
  try {
    DURUM.bilgi = await api("/api/durum");
    DURUM.wikiVar = DURUM.bilgi.vikipedi.length > 0;
    await etiketleriYenile();
    $("#logoYazi").textContent = DURUM.bilgi.ad || "Portal";
    if (!DURUM.wikiVar) $("#aramaKutu").placeholder = "Diskindeki dosyalarda ara…";
    const d = DURUM.bilgi.disk;
    if (d) $("#yanAlt").innerHTML = `Disk doluluğu<div class="doluluk"><i style="width:${(100 - (d.bos / d.toplam) * 100).toFixed(1)}%"></i></div>${boyutFmt(d.bos)} boş / ${boyutFmt(d.toplam)}`;
    // ilk tarama sürüyorsa bitince ana sayfayı tazele
    if (DURUM.bilgi.tarama.durum !== "tamam") {
      const bekle = setInterval(async () => {
        const t = (await api("/api/durum")).tarama;
        if (t.durum === "tamam") { clearInterval(bekle); DURUM.bilgi.tarama = t; if (!location.hash || location.hash === "#/") yonlendir(); }
      }, 2500);
    }
  } catch (e) {
    console.error(e);
  }
  yonlendir();
}
basla();
