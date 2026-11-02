/* Portal arayüzü — tek sayfalık uygulama (internet gerektirmez) */
"use strict";

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
function bildir(metin, sure = 3200) {
  const b = $("#bildirim");
  b.textContent = metin;
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
  return `<div class="yer-tutucu">${IKON[m.tur] || IKON.dosya}</div><img class="${cls}" loading="lazy" src="/kucuk/${m.id}" alt="" onerror="this.remove()" onload="if(!this.naturalWidth)this.remove()" style="position:relative">`;
}

/* ---------------- kart şablonları ---------------- */
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
      <div><h3>${esc(m.ad)}</h3><div class="meta">${esc(kl)}<br>${boyutFmt(m.boyut)} · ${goreceTarih(m.tarih)}</div></div>
    </div></a>`;
}
function mkart(m) {
  return `<a class="mkart" href="#/izle/${m.id}"><div class="kapak">${kucukResim(m)}${m.sure ? `<span class="sure">${sureFmt(m.sure)}</span>` : ""}</div>
    <div><h4>${esc(m.ad)}</h4><div class="meta">${esc(klasorAdi(m.klasor))}<br>${boyutFmt(m.boyut)}</div></div></a>`;
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
      ${uz === "pdf" ? `<img loading="lazy" src="/kucuk/${m.id}" alt="" style="position:absolute;inset:0" onerror="this.remove()" onload="if(!this.naturalWidth)this.remove()">` : ""}</div>
    <h4>${esc(m.ad)}</h4><span>${boyutFmt(m.boyut)} · ${goreceTarih(m.tarih)}</span></div>`;
}
function fotoKucuk(m, i) {
  return `<a href="javascript:void(0)" data-i="${i}" data-id="${m.id}"><img loading="lazy" src="/kucuk/${m.id}" alt="${esc(m.ad)}" onerror="this.style.opacity=0"></a>`;
}
function bosEkran(ikon, baslik, metin) {
  return `<div class="bos">${ikon}<h3>${baslik}</h3><p>${metin}</p></div>`;
}
function klasorBilgisi(tur) {
  const ad = { video: "Videolar", foto: "Fotoğraflar", muzik: "Müzik", belge: "Belgeler" }[tur];
  const bulunan = DURUM.bilgi?.klasorler?.[tur] || [];
  if (bulunan.length) return `Klasör: ${bulunan.map((b) => `<code>${esc(b)}</code>`).join(", ")}`;
  return `Diskinin kökünde <code>${ad}</code> adında bir klasör oluşturup dosyalarını içine koy, sonra <a href="#/ayarlar" style="color:var(--vurgu)">yeniden tara</a>.`;
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
  muzik: sayfaMuzik, belgeler: sayfaBelgeler, wiki: sayfaWiki, dosyalar: sayfaDosyalar, ayarlar: sayfaAyarlar,
};
let aktifTemizle = null;
async function yonlendir() {
  const { parcalar, q } = sorguAyir();
  const ad = parcalar[0] || "";
  const f = SAYFALAR[ad] || sayfaAna;
  if (aktifTemizle) { try { aktifTemizle(); } catch (e) {} aktifTemizle = null; }
  $$(".yan a").forEach((a) => a.classList.toggle("aktif", a.dataset.sayfa === (ad || "ana") || (ad === "izle" && a.dataset.sayfa === "videolar")));
  document.body.classList.remove("yan-acik");
  if (ad !== "ara") $("#aramaKutu").value = "";
  sayfa.innerHTML = '<div class="yukleniyor"></div>';
  window.scrollTo(0, 0);
  try {
    await f(parcalar.slice(1), q);
  } catch (e) {
    console.error(e);
    sayfa.innerHTML = bosEkran(IKON.dosya, "Bir sorun oldu", esc(e.message));
  }
}
window.addEventListener("hashchange", yonlendir);

/* ---------------- ANA SAYFA ---------------- */
async function sayfaAna() {
  document.title = (DURUM.bilgi?.ad || "Portal") + " — Ana sayfa";
  const [v, kesfet] = await Promise.all([api("/api/ana"), DURUM.wikiVar ? api("/api/wiki/kesfet?adet=5").catch(() => []) : []]);
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

  const r = await api(`/api/ara?q=${encodeURIComponent(sorgu)}&bas=${basla}`);
  const w = r.vikipedi.sonuclar;
  const d = r.dosyalar || {};
  const yerelVar = sekme === "hepsi" && basla === 0 && (d.video?.length || d.foto?.length || d.muzik?.length || d.belge?.length);
  let sol = "";
  const yerelBlok = () => {
    let b = "";
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
  const klasorler = await api("/api/klasorler?tur=video");
  const cipler = [`<a class="cip ${!klasor ? "aktif" : ""}" href="#/videolar?sira=${sira}">Tümü</a>`]
    .concat(klasorler.slice(0, 30).map((k) => `<a class="cip ${k.klasor === klasor ? "aktif" : ""}" href="#/videolar?klasor=${encodeURIComponent(k.klasor)}&sira=${sira}">${esc(klasorAdi(k.klasor))} <span style="opacity:.55">${k.adet}</span></a>`));
  const siralar = [["yeni", "En yeni"], ["ad", "Ada göre"], ["rastgele", "Karışık"], ["boyut", "En büyük"]];
  sayfa.innerHTML = `<div class="dar" style="max-width:1600px">
    <h1 class="sayfa-baslik">${klasor ? esc(klasorAdi(klasor)) : "Videolar"}</h1>
    <p class="sayfa-alt">${klasorBilgisi("video")}</p>
    <div class="cipler">${cipler.join("")}</div>
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
      <h1>${esc(m.ad)}</h1>
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
  const klasorler = await api("/api/klasorler?tur=foto");
  let h = `<div class="dar" style="max-width:1600px"><h1 class="sayfa-baslik">${klasor ? esc(klasorAdi(klasor)) : "Fotoğraflar"}</h1>
    <p class="sayfa-alt">${klasorBilgisi("foto")}</p>
    <div class="cipler"><a class="cip ${gorunum === "hepsi" ? "aktif" : ""}" href="#/fotograflar?klasor=${encodeURIComponent(klasor)}">Zaman çizelgesi</a>
    <a class="cip ${gorunum === "album" ? "aktif" : ""}" href="#/fotograflar?g=album">Albümler (${klasorler.length})</a>
    ${klasor ? `<a class="cip" href="#/fotograflar">${IKON.geri}Tüm fotoğraflar</a>` : ""}
    <button class="cip" id="slaytBaslat">${IKON.oynat}Slayt gösterisi</button></div>`;
  if (gorunum === "album") {
    h += `<div class="albumler">${klasorler.map((k) => `<a class="album" href="#/fotograflar?klasor=${encodeURIComponent(k.klasor)}"><div class="kapak"><img loading="lazy" src="/kucuk/${k.kapak}" alt="" onerror="this.remove()"></div><h4>${esc(klasorAdi(k.klasor))}</h4><span>${k.adet} fotoğraf · ${tarihFmt(k.son, { month: "long", year: "numeric" })}</span></a>`).join("")}</div></div>`;
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
  tam.src = "/dosya/" + m.id;
  $("#ikBilgi").textContent = `${IK.i + 1} / ${IK.liste.length} · ${m.ad} · ${tarihFmt(m.tarih)}`;
  // sonrakini önceden yükle
  const s = IK.liste[IK.i + 1];
  if (s) new Image().src = "/dosya/" + s.id;
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
    <span class="kapakcik">${IKON.muzik}<img loading="lazy" src="/kucuk/${m.id}" alt="" style="position:absolute;width:48px;height:48px" onerror="this.remove()" onload="if(!this.naturalWidth)this.remove()"></span>
    <span><b>${esc(m.baslik || m.ad)}</b><small>${esc(m.sanatci || klasorAdi(m.klasor))}</small></span>
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
    <div class="muzik-kahraman"><div class="buyuk-kapak">${klasor && liste[0] ? `<img src="/kucuk/${liste[0].id}" alt="" onerror="this.remove()">` : ""}${IKON.muzik}</div>
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
  k.onload = () => (k.style.visibility = k.naturalWidth ? "visible" : "hidden");
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

/* ---------------- AYARLAR / DURUM ---------------- */
async function sayfaAyarlar() {
  document.title = "Disk ve ayarlar — Portal";
  const d = (DURUM.bilgi = await api("/api/durum"));
  const ist = d.istatistik;
  const ad = { video: "Video", foto: "Fotoğraf", muzik: "Şarkı", belge: "Belge" };
  sayfa.innerHTML = `<div class="dar" style="max-width:900px"><h1 class="sayfa-baslik">Disk ve ayarlar</h1><p class="sayfa-alt">${esc(d.kok)}</p>
    <div class="kart guvenli">${IKON.kalkan}<div><b>Verilerin güvende.</b> Portal diskindeki dosyaları yalnızca okur; hiçbirini değiştirmez, taşımaz ya da silmez. Sadece <code>Portal\\veri</code> klasörüne küçük resim ve indeks yazar — bu klasörü silsen bile dosyaların etkilenmez.</div></div>
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
