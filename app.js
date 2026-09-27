/* Newsletter PWA — app.js */
const CLES = { theme: "nl-theme", chapitres: "nl-chapitres", cacheFlux: "nl-flux", cacheEdition: "nl-edition" };
const $ = (s) => document.querySelector(s);
const PROXYS = [
  (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  (url) => "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url),
];
let CONFIG = null;
let EDITION = null;
let ONGLET = "edition";

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 2500);
}
function sauverConfig() {
  localStorage.setItem(CLES.chapitres, JSON.stringify(CONFIG.chapitres));
}
async function chargerConfig() {
  const defaut = await (await fetch("chapters.json")).json();
  let chapitres = defaut.chapitres;
  const stocke = localStorage.getItem(CLES.chapitres);
  if (stocke) {
    try { chapitres = JSON.parse(stocke); } catch (e) { /* défaut */ }
  }
  CONFIG = { chapitres };
}
function chapitre(id) { return CONFIG.chapitres.find((c) => c.id === id); }

/* ---------- Édition du jour ---------- */
async function chargerEdition() {
  const enCache = localStorage.getItem(CLES.cacheEdition);
  let liste = [];
  try {
    const r = await fetch("editions/index.json", { cache: "no-store" });
    liste = await r.json();
  } catch (e) { /* hors ligne */ }
  let date = null, data = null;
  if (liste.length) date = liste.sort().at(-1);
  if (date) {
    try { data = await (await fetch("editions/" + date + ".json", { cache: "no-store" })).json(); } catch (e) {}
  }
  if (data) { EDITION = data; localStorage.setItem(CLES.cacheEdition, JSON.stringify(data)); }
  else if (enCache) { EDITION = JSON.parse(enCache); bandeauOffline("Édition en cache local"); }
  else { EDITION = null; }
  if (EDITION) $("#date-edition").textContent = new Date(EDITION.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function bandeauOffline(txt) { const b = $("#bandeau-Offline"); b.textContent = txt; b.hidden = false; }

function vueEdition() {
  if (!EDITION) return '<p class="vide">Aucune édition disponible pour l\'instant.</p>';
  let h = "<ol class='resume-exec'>";
  EDITION.resume_executif.forEach((p) => { h += "<li>" + p + "</li>"; });
  h += "</ol>";
  EDITION.chapitres.forEach((c) => {
    h += "<h2>" + (chapitre(c.id)?.emoji || "") + " " + c.nom + "</h2><p class='resume-chapitre'>" + c.resume + "</p>";
  });
  return h;
}

/* ---------- Flux chaud (RSS) ---------- */
function normaliser(t) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
}
function jaccard(a, b) {
  const A = new Set(normaliser(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(normaliser(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}
async function telechargerFlux(url) {
  for (const p of PROXYS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(p(url), { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const txt = await r.text();
      let items = [];
      if (txt.trim().startsWith("{")) {
        const j = JSON.parse(txt);
        (j.items || []).forEach((i) => items.push({ titre: i.title, lien: i.link, date: i.pubDate, extrait: (i.description || "").replace(/<[^>]*>/g, ""), source: new URL(url).hostname }));
      } else {
        const doc = new DOMParser().parseFromString(txt, "text/html");
        doc.querySelectorAll("item, entry").forEach((n) => {
          const titre = n.querySelector("title")?.textContent;
          let lien = n.querySelector("link")?.textContent || n.querySelector("link")?.getAttribute("href") || "";
          const dateN = n.querySelector("pubDate, published, updated, date")?.textContent;
          const extraitN = n.querySelector("description, summary, content")?.textContent || "";
          items.push({ titre, lien, date: dateN, extrait: extraitN.replace(/<[^>]*>/g, ""), source: new URL(url).hostname });
        });
      }
      return items.filter((i) => i.titre && i.lien);
    } catch (e) { /* proxy suivant */ }
  }
  return [];
}
async function collecterFlux() {
  const enCache = localStorage.getItem(CLES.cacheFlux);
  let cache = enCache ? JSON.parse(enCache) : { ts: 0, items: [] };
  const valide = Date.now() - cache.ts < 15 * 60 * 1000;
  if (!valide) {
    const urls = [...new Set(CONFIG.chapitres.filter((c) => c.visible).flatMap((c) => c.flux || []))];
    const resultats = await Promise.all(urls.map(telechargerFlux));
    let items = resultats.flat();
    items = items.filter((i) => i.date && Date.now() - new Date(i.date).getTime() < 48 * 3600e3 && !isNaN(new Date(i.date).getTime()));
    items.sort((a, b) => jaccard(a.titre, b.titre) > 0.7);
    const uniques = [];
    items.forEach((i) => { if (!uniques.some((u) => jaccard(u.titre, i.titre) >= 0.7)) uniques.push(i); });
    cache = { ts: Date.now(), items: uniques.slice(0, 400) };
    try { localStorage.setItem(CLES.cacheFlux, JSON.stringify(cache)); } catch (e) {}
  }
  return cache;
}
function articlesDuChapitre(c, cache) {
  const limite = c.id === "grande-info-semaine" ? 48 : 24;
  return cache.items
    .map((i) => {
      const texte = normaliser(i.titre + " " + i.extrait);
      let score = 0;
      if ((c.inclure || []).includes("*")) score = 1;
      else {
        (c.inclure || []).forEach((k) => { if (texte.includes(normaliser(k))) score += 2; });
        (c.exclure || []).forEach((k) => { if (texte.includes(normaliser(k))) score = -99; });
      }
      const h = (Date.now() - new Date(i.date).getTime()) / 3600e3;
      return { ...i, score, heures: h };
    })
    .filter((i) => i.score > 0 && i.heures <= limite)
    .sort((a, b) => b.score - a.score || a.heures - b.heures);
}
function vueFlux(c) {
  const cache = ETAT_FLUX;
  if (!cache.items.length) return "<p class='vide'>Aucun article récupéré — vérifiez la connexion ou réessayez dans un instant.</p>";
  const items = articlesDuChapitre(c, cache);
  if (!items.length) return "<p class='vide'>Rien dans les dernières 24 h pour ce chapitre. </p>";
  let h = "";
  items.forEach((i) => {
    h += "<article><a href='" + i.lien + "' target='_blank' rel='noopener'>" + i.titre + "</a>" +
      "<div class='meta'>" + i.source + " · il y a " + (i.heures < 1 ? Math.max(1, Math.round(i.heures * 60)) + " min" : Math.round(i.heures) + " h") + "</div>" +
      (i.extrait ? "<p class='extrait'>" + i.extrait.slice(0, 200) + "</p>" : "") + "</article>";
  });
  return h;
}

/* ---------- Rendu ---------- */
let ETAT_FLUX = { ts: 0, items: [] };
function onglets() {
  const b = $("#barre-onglets");
  b.innerHTML = "";
  const boutonEdition = document.createElement("button");
  boutonEdition.textContent = "📬 Édition";
  boutonEdition.dataset.id = "edition";
  boutonEdition.onclick = () => selectionner("edition");
  b.appendChild(boutonEdition);
  CONFIG.chapitres.filter((c) => c.visible).forEach((c) => {
    const bt = document.createElement("button");
    bt.textContent = c.emoji + " " + c.nom.split(" ")[0];
    bt.dataset.id = c.id;
    bt.onclick = () => selectionner(c.id);
    b.appendChild(bt);
  });
  b.querySelectorAll("button").forEach((bt) => bt.classList.toggle("actif", bt.dataset.id === ONGLET));
}
function selectionner(id) {
  ONGLET = id;
  onglets();
  afficher();
}
function afficher() {
  const m = $("#contenu");
  if (ONGLET === "edition") {
    m.innerHTML = "<div class='chargement'>Chargement de l'édition…</div>" + vueEdition();
  } else {
    const c = chapitre(ONGLET);
    m.innerHTML = vueFlux(c);
  }
  window.scrollTo(0, 0);
}

/* ---------- Réglages ---------- */
function reglagesOuvrir() {
  $("#sel-theme").value = localStorage.getItem(CLES.theme) || "auto";
  renduListeChapitres();
  $("#voile-reglages").hidden = false;
}
function renduListeChapitres() {
  const div = $("#liste-chapitres");
  div.innerHTML = "";
  CONFIG.chapitres.forEach((c, i) => {
    const ligne = document.createElement("div");
    ligne.className = "ligne-chapitre";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = c.visible; cb.setAttribute("aria-label", "Afficher " + c.nom);
    cb.onchange = () => { c.visible = cb.checked; sauverConfig(); onglets(); };
    const nom = document.createElement("input");
    nom.type = "text"; nom.value = c.nom;
    nom.onchange = () => { c.nom = nom.value; sauverConfig(); onglets(); };
    const haut = document.createElement("button");
    haut.className = "btn-ghost"; haut.textContent = "↑"; haut.setAttribute("aria-label", "Monter");
    haut.onclick = () => { if (i > 0) { CONFIG.chapitres.splice(i - 1, 0, CONFIG.chapitres.splice(i, 1)[0]); sauverConfig(); renduListeChapitres(); onglets(); } };
    const bas = document.createElement("button");
    bas.className = "btn-ghost"; bas.textContent = "↓"; bas.setAttribute("aria-label", "Descendre");
    bas.onclick = () => { if (i < CONFIG.chapitres.length - 1) { CONFIG.chapitres.splice(i + 1, 0, CONFIG.chapitres.splice(i, 1)[0]); sauverConfig(); renduListeChapitres(); onglets(); } };
    ligne.append(cb, nom, haut, bas);
    div.appendChild(ligne);
  });
}

/* ---------- Thème ---------- */
function appliquerTheme() {
  const pref = localStorage.getItem(CLES.theme) || "auto";
  const sombreSysteme = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const clair = pref === "clair" || (pref === "auto" && !sombreSysteme);
  document.documentElement.setAttribute("data-theme", clair ? "clair" : "sombre");
}

/* ---------- Démarrage ---------- */
async function demarrer() {
  appliquerTheme();
  await chargerConfig();
  await chargerEdition();
  ETAT_FLUX = await collecterFlux();
  onglets();
  afficher();
  setInterval(async () => {
    if (document.visibilityState === "visible") { ETAT_FLUX = await collecterFlux(); if (ONGLET !== "edition") afficher(); }
  }, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") { ETAT_FLUX = await collecterFlux(); }
  });
  $("#btn-reglages").onclick = reglagesOuvrir;
  $("#fermer-reglages").onclick = () => { $("#voile-reglages").hidden = true; };
  $("#sel-theme").onchange = (e) => { localStorage.setItem(CLES.theme, e.target.value); appliquerTheme(); };
  $("#btn-restaurer").onclick = async () => {
    localStorage.removeItem(CLES.chapitres);
    await chargerConfig(); renduListeChapitres(); onglets(); toast("Chapitres restaurés");
  };
  $("#btn-purger").onclick = () => {
    localStorage.removeItem(CLES.cacheFlux); localStorage.removeItem(CLES.cacheEdition);
    $("#etat-cache").textContent = "Cache purgé — la page se recharge…";
    setTimeout(() => location.reload(), 800);
  };
  $("#etat-cache").textContent = "Articles en cache : " + (ETAT_FLUX.items.length || 0);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
demarrer();