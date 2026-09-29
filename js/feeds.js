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

/* --- Récupération d'un flux avec repli en cascade --- */
export async function fetchFeedItems(url, timeout = 7000) {
  // 1) essai direct (certains flux autorisent CORS — gratuit quand ça marche)
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const txt = await r.text();
      if (/<(rss|feed|item|entry)/i.test(txt.slice(0, 2000))) {
        const arts = parseXml(txt);
        if (arts.length) return arts;
      }
    }
  } catch (e) { /* CORS ou échec : on passe aux relais */ }
  // 2) relais JSON (rapide et fiable, ~10 derniers items)
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(RELAIS_JSON(url), { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const arts = parseRss2Json(await r.text());
      if (arts.length) return arts;
    }
  } catch (e) { /* relais suivant */ }
  // 3) relais XML (plus riches — jusqu'à 40 items — mais parfois lents)
  for (const p of RELAIS_XML) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(p(url), { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const txt = await r.text();
      if (/<(rss|feed)/i.test(txt.slice(0, 500))) {
        const arts = parseXml(txt);
        if (arts.length) return arts;
      }
    } catch (e) { /* relais suivant */ }
  }
  return [];
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
      const results = await Promise.allSettled(urls.map(u => fetchFeedItems(u)));
      const all = [];
      let ok = 0;
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value || !r.value.length) return;
        ok++;
        for (const ch of parUrl.get(urls[i])) {
          for (const a of r.value) {
            const fenetre = (ch.fenetreHeures ?? 24) * 3600e3;
            if (Date.now() - a.date.getTime() > fenetre) continue;
            if (scoreArticle(a, ch) < 1) continue;
            if (all.some(x => jaccard(x.titre, a.titre) >= 0.7)) continue;
            all.push({ ...a, chapitreId: ch.id, chapitreNom: ch.nom });
          }
        }
      });
      all.sort((a, b) => b.date - a.date);
      state.feed = { time: Date.now(), articles: all.slice(0, 200) };
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
      if (!force && cache && maintenant - cache.time < TTL) {
        state.mediaData[m.id] = cache;
        return cache;
      }
      const fenetre = (m.fenetreHeures ?? 24) * 3600e3;
      const urls = m.flux || [];
      const results = await Promise.allSettled(urls.map(u => fetchFeedItems(u)));
      const arts = [];
      let ok = 0;
      results.forEach(r => {
        if (r.status !== 'fulfilled' || !r.value || !r.value.length) return;
        ok++;
        for (const a of r.value) {
          if (maintenant - a.date.getTime() > fenetre) continue;
          if (arts.some(x => jaccard(x.titre, a.titre) >= 0.7)) continue;
          arts.push({ ...a, mediaNom: m.nom });
        }
      });
      let data;
      if (!ok && cache) {
        data = { ...cache, stale: true };
      } else {
        arts.sort((a, b) => b.date - a.date);
        data = { time: maintenant, articles: arts.slice(0, 100), ok, total: urls.length };
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
