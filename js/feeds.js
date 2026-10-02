/* feeds.js — couche de récupération des flux RSS/Atom (v16).
 * Chaîne par flux : essai direct (si le site autorise CORS) → relais JSON rss2json
 * (rapide et fiable, ~10 derniers items) → relais XML allorigins / codetabs
 * (jusqu'à 40 items, parfois lents). Chaque étape a son propre parseur :
 * le relais JSON renvoie du JSON, pas du XML — c'était la panne historique de la v14.
 * Les textes externes sont échappés au rendu (esc() dans views.js), jamais ici. */

import { state, getStore, setStore, norm } from './core.js';

const RELAIS_XML = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)
];
const RELAIS_JSON = u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u);

/* --- Parseurs --- */
export function parseXml(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const items = [...doc.querySelectorAll('item')].length
      ? [...doc.querySelectorAll('item')]
      : [...doc.querySelectorAll('entry')];
    return items.slice(0, 40).map(it => ({
      titre: it.querySelector('title')?.textContent?.trim() ?? '',
      lien: it.querySelector('link')?.textContent?.trim() || it.querySelector('link')?.getAttribute('href') || '',
      date: new Date(it.querySelector('pubDate, published, updated')?.textContent ?? Date.now()),
      extrait: (it.querySelector('description, summary, content')?.textContent ?? '')
        .replace(/<[^>]*>/g, '').trim().slice(0, 220),
      auteur: it.querySelector('author')?.textContent?.trim()
        || it.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0]?.textContent?.trim()
        || ''
    })).filter(a => a.titre && !isNaN(a.date));
  } catch (e) { return []; }
}

export function parseRss2Json(text) {
  try {
    const j = JSON.parse(text);
    if (j.status !== 'ok' || !Array.isArray(j.items)) return [];
    return j.items.map(x => ({
      titre: (x.title || '').trim(),
      lien: (x.link || '').trim(),
      date: new Date(String(x.pubDate || '').replace(' ', 'T') + 'Z'),
      extrait: (x.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 220),
      auteur: (x.author || '').trim()
    })).filter(a => a.titre && !isNaN(a.date));
  } catch (e) { return []; }
}

/* --- Back-off des relais (v29) : un relais qui répond 429 (quota épuisé) est
 * mis au repos 5 minutes — la cascade le saute au lieu d'insister et de
 * griller le budget des autres visiteurs. Map mémoire, par onglet : gratuit. --- */
const REPOS = new Map();
const REPOS_MS = 5 * 60e3;
function auRepos(url) {
  const cle = new URL(url, location.href).host;
  const jusque = REPOS.get(cle) || 0;
  return Date.now() < jusque;
}
function marquer429(url) {
  try { REPOS.set(new URL(url, location.href).host, Date.now() + REPOS_MS); } catch (e) { /* URL relative */ }
}

/* --- Fetch borné en temps : AbortController + nettoyage systématique du timer --- */
async function texteBornes(url, timeout) {
  if (auRepos(url)) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 429) { marquer429(url); return null; }
    return r.ok ? await r.text() : null;
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

async function viaDirect(url, timeout) {
  const txt = await texteBornes(url, timeout);
  if (txt && /<(rss|feed|item|entry)/i.test(txt.slice(0, 2000))) {
    const arts = parseXml(txt);
    if (arts.length) return arts;
  }
  return [];
}

async function viaRelaisJson(url, timeout) {
  const txt = await texteBornes(RELAIS_JSON(url), timeout);
  return txt ? parseRss2Json(txt) : [];
}

async function viaRelaisXml(url, timeout) {
  for (const p of RELAIS_XML) {
    const txt = await texteBornes(p(url), timeout);
    if (txt && /<(rss|feed)/i.test(txt.slice(0, 500))) {
      const arts = parseXml(txt);
      if (arts.length) return arts;
    }
  }
  return [];
}

/* --- Récupération d'un flux : direct et relais JSON partent EN PARALLÈLE,
 *     le premier qui renvoie des articles gagne, les autres sont annulés —
 *     latence ~divisée par deux, aucun octet gaspillé après la victoire.
 *     Repli relais XML (jusqu'à 40 items) seulement si les deux échouent. --- */
function premierNonVide(promesses) {
  return new Promise((garder, jeter) => {
    let restants = promesses.length;
    promesses.forEach(p => p.then(
      a => { if (a.length) garder(a); else if (--restants === 0) garder([]); },
      () => { if (--restants === 0) garder([]); }
    ));
  });
}

export async function fetchFeedItems(url, timeout = 7000) {
  const direct = viaDirect(url, timeout);
  const relaisJson = viaRelaisJson(url, timeout);
  const premier = await premierNonVide([direct, relaisJson]);
  if (premier.length) return premier;
  return viaRelaisXml(url, timeout);
}

/* --- Rapprochement / filtrage --- */
export function jaccard(a, b) {
  const A = new Set(norm(a).split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const B = new Set(norm(b).split(/[^a-z0-9]+/).filter(w => w.length > 2));
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

function scoreArticle(a, ch) {
  const t = norm(a.titre + ' ' + a.extrait);
  if ((ch.motsCles || []).includes('*')) return 1;
  let s = 0;
  for (const m of ch.motsCles || []) if (t.includes(norm(m))) s++;
  for (const m of ch.exclusion || []) if (t.includes(norm(m))) return 0;
  return s;
}

/* L'AFP n'a pas d'API publique gratuite : ses dépêches sont repérées via
 * l'attribution des médias qui les republient (« 20 Minutes avec AFP », etc.). */
export function estAFP(a) {
  return a.chapitreId === 'depeches-afp'
    || /\bAFP\b/i.test((a.auteur || '') + ' ' + a.titre + ' ' + (a.extrait || ''));
}

/* --- Pool de concurrence : au plus CONCURRENCY requêtes réseau simultanées —
 *     épargne les relais gratuits (pas de pic, moins de 429) sans allonger le total. --- */
const CONCURRENCY = 6;
async function pool(taches, taille = CONCURRENCY) {
  const file = [...taches];
  const ouvriers = Array.from({ length: Math.min(taille, file.length) }, async () => {
    while (file.length) { await file.shift()(); }
  });
  await Promise.allSettled(ouvriers);
}

/* --- Dédup Jaccard en O(n) amorti : clé exacte d'abord (Set), similarité
 *     seulement entre articles du même fuseau horaire de parution. --- */
function dedupliquer(articles, limite = 200) {
  const tri = articles.slice().sort((a, b) => b.date - a.date);
  const garde = [];
  const vus = new Set();
  for (const a of tri) {
    const k = norm(a.titre).replace(/[^a-z0-9]+/g, '').slice(0, 80);
    if (vus.has(k)) continue;
    if (garde.some(x => Math.abs(x.date - a.date) < 3600e3 && jaccard(x.titre, a.titre) >= 0.7)) continue;
    vus.add(k);
    garde.push(a);
  }
  return garde.slice(0, limite);
}

/* --- Onglet Articles : flux des chapitres suivis, dédupliqués par URL --- */
let chapitresEnCours = null;
export function chargerChapitres() {
  if (chapitresEnCours) return chapitresEnCours; // un seul rafraîchissement à la fois
  chapitresEnCours = (async () => {
    try {
      const masques = getStore('masques', {});
      const visible = state.chapters.filter(c => !masques[c.id] && c.flux.length);
      // Déduplication : un flux partagé par plusieurs chapitres n'est récupéré qu'une fois
      const parUrl = new Map();
      for (const ch of visible) for (const url of ch.flux) {
        if (!parUrl.has(url)) parUrl.set(url, []);
        parUrl.get(url).push(ch);
      }
      const urls = [...parUrl.keys()];
      const brutes = new Map();
      let ok = 0;
      await pool(urls.map(u => async () => {
        const arts = await fetchFeedItems(u);
        if (!arts.length) return;
        brutes.set(u, arts);
        ok++;
      }));
      const all = [];
      urls.forEach(u => {
        const arts = brutes.get(u) || [];
        for (const ch of parUrl.get(u)) {
          for (const a of arts) {
            const fenetre = (ch.fenetreHeures ?? 24) * 3600e3;
            if (Date.now() - a.date.getTime() > fenetre) continue;
            if (scoreArticle(a, ch) < 1) continue;
            all.push({ ...a, chapitreId: ch.id, chapitreNom: ch.nom });
          }
        }
      });
      /* v30 : flux des medias affiches (onglet Medias) fusionnes dans l'onglet Articles.
         Reutilise le cache/TTL de chargerMedia — pas de double requete si l'onglet Medias charge aussi. */
      const masquesM = getStore('mediasMasques', {});
      const affichesM = getStore('mediasAffiches', {});
      const mediasVis = (state.medias || []).filter(m =>
        !masquesM[m.id] && (!m.masque || !!affichesM[m.id]) && (m.flux || []).length);
      const artsMedia = [];
      await Promise.allSettled(mediasVis.map(m => chargerMedia(m).then(d => {
        for (const a of (d?.articles || [])) artsMedia.push({ ...a, date: new Date(a.date), mediaNom: m.nom });
      }).catch(() => {})));
      state.feed = { time: Date.now(), articles: dedupliquer(all.concat(artsMedia)) };
      state.feedStats = { ok, total: urls.length, time: Date.now() };
      setStore('feed', state.feed);
      return state.feed;
    } finally { chapitresEnCours = null; }
  })();
  return chapitresEnCours;
}

/* --- Onglet Médias : flux d'un média, cache indépendant, TTL 20 min.
 *     Chargé uniquement à la demande (aucune requête tant que l'onglet n'est pas ouvert).
 *     Si aucun flux n'est joignable, on garde le dernier état connu (marqué périmé). --- */
const mediasEnCours = new Map();
export function chargerMedia(m, force = false) {
  if (mediasEnCours.has(m.id)) return mediasEnCours.get(m.id);
  const p = (async () => {
    try {
      const maintenant = Date.now();
      const TTL = 20 * 60e3;
      const cache = getStore('media:' + m.id, null);
      if (cache && Array.isArray(cache.articles)) cache.articles.forEach(a => { if (!(a.date instanceof Date)) a.date = new Date(a.date); });
      if (!force && cache && maintenant - cache.time < TTL) {
        state.mediaData[m.id] = cache;
        return cache;
      }
      const fenetre = (m.fenetreHeures ?? 24) * 3600e3;
      const urls = m.flux || [];
      const brutes = new Map();
      let ok = 0;
      await pool(urls.map(u => async () => {
        const arts = await fetchFeedItems(u);
        if (!arts.length) return;
        brutes.set(u, arts);
        ok++;
      }));
      const arts = [];
      urls.forEach(u => {
        for (const a of brutes.get(u) || []) {
          if (maintenant - a.date.getTime() > fenetre) continue;
          arts.push({ ...a, mediaNom: m.nom });
        }
      });
      let data;
      if (!ok && cache) {
        data = { ...cache, stale: true };
      } else {
        data = { time: maintenant, articles: dedupliquer(arts, 100), ok, total: urls.length };
        setStore('media:' + m.id, data);
      }
      state.mediaData[m.id] = data;
      return data;
    } finally { mediasEnCours.delete(m.id); }
  })();
  mediasEnCours.set(m.id, p);
  return p;
}

/* --- v18 : découverte automatique du flux RSS d'un site (bouton « Ajouter un média »).
 *     Ordre de dépenses : ce qui est gratuit d'abord (fetch direct, page HTML via relais),
 *     puis un budget serré de validations rss2json (les nouveaux flux y sont limités).
 *     Renvoie { trouves: [{url, articles}], erreur? } — jamais d'exception. --- */
const CHEMINS_FLUX = ['feed', 'rss', 'rss.xml', 'feed.xml', 'atom.xml', 'index.xml'];

async function texteDirect(url, timeout = 4500) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch (e) { return null; }
}

/* Page HTML d'un site via relais (lecture impossible en direct : CORS).
 * Ne consomme aucun budget rss2json — juste la patience des relais, qui vivent leur vie. */
async function pageHtmlRelais(url) {
  for (const p of RELAIS_XML) {
    const t = await texteDirect(p(url), 6000);
    if (t && t.length > 500 && /<html|<!doctype/i.test(t.slice(0, 1000))) return t;
  }
  return null;
}

/* Candidats précis : <link rel="alternate" type="application/rss+xml"> puis ancres « rss/feed/atom ». */
function extraireCandidats(html, base) {
  const res = [];
  const push = h => { try { const u = new URL(h, base); if (/^https?:$/.test(u.protocol)) res.push(u.href); } catch (e) {} };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (/rel=["']?alternate/i.test(tag) && /(rss|atom)\+xml/i.test(tag)) {
      const h = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      if (h) push(h);
    }
  }
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const h = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
    if (h && /(^|[/_.-])(rss|feed|atom)([/_.-]|$)/i.test(h)) push(h);
  }
  return [...new Set(res)]
    .filter(u => !/\.(css|js|png|jpe?g|svg|ico|webp|woff2?)([?#]|$)/i.test(u))
    .slice(0, 6);
}

/* Validation d'un flux. mode 'direct' : gratuit (fetch direct uniquement —
 * ne coûte rien quand le site ferme CORS, honnête quand il l'ouvre).
 * mode 'complet' : chaîne fetchFeedItems (budget rss2json si le flux est nouveau). */
async function validerFlux(url, mode) {
  if (mode === 'direct') {
    const t = await texteDirect(url);
    if (!t || !/<(rss|feed|item|entry)/i.test(t.slice(0, 2000))) return null;
    const arts = parseXml(t);
    return arts.length ? { url, articles: arts.length } : null;
  }
  if (mode === 'budget') {
    /* validation économique : direct court puis rss2json seul — les relais XML
     * agonisants ne font ici que ralentir sans jamais aider. */
    const t = await texteDirect(url, 3000);
    if (t && /<(rss|feed|item|entry)/i.test(t.slice(0, 2000))) {
      const arts = parseXml(t);
      if (arts.length) return { url, articles: arts.length };
    }
    const j = await texteDirect(RELAIS_JSON(url), 6000);
    if (!j) return null;
    const arts = parseRss2Json(j);
    return arts.length ? { url, articles: arts.length } : null;
  }
  const arts = await fetchFeedItems(url, 6000);
  return arts.length ? { url, articles: arts.length } : null;
}

export async function trouverFlux(saisie) {
  const entree = String(saisie || '').trim();
  if (!entree) return { trouves: [], erreur: 'adresse' };
  let url = entree;
  if (!/^https?:\/\//i.test(entree)) {
    if (!/^[\w.-]+\.[a-z]{2,}([/?#]\S*)?$/i.test(entree)) return { trouves: [], erreur: 'adresse' };
    url = 'https://' + entree;
  }
  let origine;
  try { origine = new URL(url).origin; } catch (e) { return { trouves: [], erreur: 'adresse' }; }

  /* 1) l'entrée est-elle déjà un flux ? Essai direct gratuit, puis chaîne complète
   *    seulement si elle ressemble à un flux (économise le budget rss2json sinon). */
  const ressemblance = /(rss|feed|atom|xml)/i.test(url);
  let v = await validerFlux(url, 'direct');
  if (v) return { trouves: [v] };
  if (ressemblance) {
    v = await validerFlux(url, 'complet');
    if (v) return { trouves: [v] };
  }

  /* 2) chemins usuels en essais directs gratuits, pendant que la page HTML
   *    du site est demandée aux relais en parallèle (candidats plus précis). */
  const guesses = [...new Set(CHEMINS_FLUX.map(c => origine + '/' + c))];
  const htmlPromis = pageHtmlRelais(url);
  const directs = (await Promise.all(guesses.map(g => validerFlux(g, 'direct')))).filter(Boolean);
  const trouves = [...directs];
  let restants = [];
  if (!trouves.length) {
    /* aucun chemin usuel n'a répondu en direct : on attend la page du site
     * (relais parfois lents) pour des candidats plus précis. */
    const html = await htmlPromis;
    if (html) {
      const precis = extraireCandidats(html, url)
        .filter(u => !trouves.some(t => t.url === u) && !guesses.includes(u));
      restants = precis.slice(0, 3);
    }
  }

  /* 3) budget : au plus deux validations complètes, candidats précis d'abord.
   *    On s'arrête dès qu'un flux répond — chaque miss coûte cher en quota. */
  let budget = 2;
  for (const u of restants) {
    if (budget <= 0) break;
    budget--;
    const r = await validerFlux(u, 'budget');
    if (r) { trouves.push(r); break; }
  }
  if (!trouves.length) {
    for (const g of guesses.slice(0, 2)) {
      if (budget <= 0) break;
      budget--;
      const r = await validerFlux(g, 'budget');
      if (r) { trouves.push(r); break; }
    }
  }
  trouves.sort((a, b) => b.articles - a.articles);
  return { trouves };
}

/* --- Onglet Vidéos (v50) : agrégation des flux RSS YouTube des médias
 *     sélectionnés dans l'onglet Médias (mêmes règles de visibilité).
 *     YouTube n'est pas dans la config serveur : la chaîne de chaque média
 *     est découverte automatiquement (lien youtube.com/@... sur son site,
 *     via le même budget de découverte que l'ajout d'un média) puis mise en
 *     cache localement (nl.chaine:<id>). Les flux Atom youtube.com/feeds/videos.xml
 *     passent par la même cascade direct → rss2json → relais XML.
 *     Cache agrégé TTL 20 min, clé nl.videos — jamais touché par la purge
 *     des préférences (ce n'en est pas une). --- */
export function mediasVisibles() {
  const masquesM = getStore('mediasMasques', {});
  const affichesM = getStore('mediasAffiches', {});
  return (state.medias || []).filter(m =>
    !masquesM[m.id] && (!m.masque || !!affichesM[m.id]) && (m.flux || []).length);
}

/* Découverte de la chaîne : scrutée depuis le premier flux/site du média,
 * une seule fois puis cachée pour toujours (chaîne renommée = cache mort,
 * nettoyé par « Purger le cache »). Renvoie l'ID de chaîne ou null. */
const decouvertesEnCours = new Map();
export async function decouvrirChaine(m) {
  const cache = getStore('chaine:' + m.id, null);
  if (cache !== null) return cache.chaine || null;
  if (decouvertesEnCours.has(m.id)) return decouvertesEnCours.get(m.id);
  const p = (async () => {
    /* Le lien YouTube vit sur la page d'accueil du média, pas dans son flux RSS :
     * on part de l'origine du premier flux, puis on cherche un identifiant UC… */
    let chaine = null;
    let conclude = false; /* vrai = page lue, réponse définitive (cachée) */
    try {
      let origine = '';
      try { origine = new URL(m.flux[0]).origin; } catch (e) {}
      const page = origine ? await pageHtmlRelais(origine + '/') : null;
      if (page) {
        conclude = true;
        const uc = page.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)
          || page.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/i);
        if (uc) chaine = uc[1];
        else {
          /* handle @nom : sa page YouTube révèle le vrai identifiant UC… */
          const h = page.match(/youtube\.com\/@([\w.-]+)/i);
          if (h) {
            const manche = h[1].replace(/["'?#].*$/, '');
            const pYt = await pageHtmlRelais('https://www.youtube.com/@' + manche);
            const uc2 = pYt && (pYt.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/i)
              || pYt.match(/youtube\.com\/channel\/(UC[\w-]{22})/i));
            if (uc2) chaine = uc2[1];
          }
        }
        if (chaine) {
          /* l'identifiant doit exister côté YouTube : le flux vidéo en fait foi */
          const arts = await fetchFeedItems('https://www.youtube.com/feeds/videos.xml?channel_id=' + chaine, 5000);
          if (!arts.length) chaine = null;
        }
      }
    } catch (e) { /* relais muet : rien à conclure, on réessaiera plus tard */ }
    if (conclude) setStore('chaine:' + m.id, { chaine });
    decouvertesEnCours.delete(m.id);
    return chaine;
  })();
  decouvertesEnCours.set(m.id, p);
  return p;
}

/* Flux Atom YouTube → articles au même format que le reste de l'app.
 * L'ID vidéo vit dans l'URL ; la miniature est déduite de l'ID (img.youtube.com). */
export function idVideoYoutube(lien) {
  const m = String(lien || '').match(/(?:watch\?v=|youtu\.be\/|\/v\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

let videosEnCours = null;
export function chargerVideos(force = false) {
  const cache = getStore('videos', null);
  if (cache && Array.isArray(cache.videos)) cache.videos.forEach(v => { if (!(v.date instanceof Date)) v.date = new Date(v.date); });
  if (!force && cache && Date.now() - cache.time < 20 * 60e3) {
    state.videosData = cache;
    return Promise.resolve(cache);
  }
  if (videosEnCours) return videosEnCours;
  videosEnCours = (async () => {
    try {
      const cibles = [];
      for (const m of mediasVisibles()) {
        if (/youtube\.com/i.test((m.flux || []).join(' '))) {
          /* flux RSS YouTube saisi directement dans Médias : aucune découverte nécessaire */
          const u = m.flux.find(f => /youtube\.com/i.test(f));
          cibles.push({ m, url: u });
        } else {
          const chaine = await decouvrirChaine(m);
          if (chaine) cibles.push({ m, url: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(chaine) });
        }
      }
      const videos = [];
      await pool(cibles.map(({ m, url }) => async () => {
        const arts = await fetchFeedItems(url, 7000);
        for (const a of arts) {
          const id = idVideoYoutube(a.lien) || (a.lien.match(/videos\/([\w-]{11})/) || [])[1] || null;
          if (!id) continue;
          videos.push({ ...a, mediaNom: m.nom, videoId: id });
        }
      }));
      videos.sort((a, b) => b.date - a.date);
      let ok = 0; const vus = new Set();
      const garde = [];
      for (const v of videos) {
        if (vus.has(v.videoId)) continue;
        vus.add(v.videoId);
        ok++;
        garde.push(v);
        if (garde.length >= 100) break;
      }
      const data = { time: Date.now(), videos: garde, ok, total: cibles.length };
      setStore('videos', data);
      state.videosData = data;
      return data;
    } finally { videosEnCours = null; }
  })();
  return videosEnCours;
}
