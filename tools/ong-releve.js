#!/usr/bin/env node
/* tools/ong-releve.js — Relevé automatique des dernières actualités des ONG (onglet Newsletters).
 * Appelé par tools/maintenance.js à chaque run (4×/jour) ; chaque organisation
 * n'est rafraîchie qu'une fois par jour (son relevé porte la date du jour).
 * Principe de prudence : si la page d'un site ne répond pas ou si l'extraction
 * ne trouve rien, le relevé précédent est conservé tel quel — rien n'est inventé,
 * aucun titre n'est reformulé : seuls les titres affichés par le site sont relevés.
 * Écrit data/newsletters.json (network-first : effet immédiat en live, pas de bump CACHE).
 * Sortie stdout : JSON { date, modifie, rafraichis, echecs, details } pour maintenance.js.
 * Aucune dépendance : fetch natif (Node >= 18). */
'use strict';

const fs = require('fs');
const path = require('path');

const FICHIER = path.join(__dirname, '..', 'data', 'newsletters.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const MAX_POINTS = 4;

/* ————— Décodage des entités HTML (é, ’, « …) ————— */
const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ocirc: 'ô', ucirc: 'û',
  icirc: 'î', acirc: 'â', ugrave: 'ù', ccedil: 'ç', euml: 'ë', oacute: 'ó',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', mdash: '—', ndash: '–', deg: '°', euro: '€'
};
function decoder(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (ENTITES[n.toLowerCase()] !== undefined ? ENTITES[n.toLowerCase()] : m));
}
const texte = s => decoder(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/* Nettoyage des habillages de cartes : catégories en préfixe, pays + date en suffixe. */
function nettoyer(t) {
  return t
    .replace(/^\s*(communiqué de presse|urgence|note d’information|note d'information)\s*:?\s*/i, '')
    .replace(/\s+[A-ZÉÀ][\wéèêàçâîôû’'-]*\s+-\s+\d{1,2}(er)?\s+[a-zéûôà]+\s+20\d{2}\s*$/, '')
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* Nombre de segments du chemin d'une URL (filtrage nav vs article). */
function segments(href) {
  try { return new URL(href, 'https://exemple.org').pathname.split('/').filter(Boolean).length; }
  catch { return 0; }
}

/* ————— Extraction générique : scan des ancres + règles par site ————— */
const EXCLU_HREF = ['?', '#', 'page=', '/page/', 'author/', '/tag/', '/category/', 'feed', 'wp-content', 'javascript:', 'mailto:'];
const BRUIT_COMMUN = ['s’abonner', "s'abonner", 'newsletter', 'faire un don', 'voir tout', 'en savoir plus', 'lire la suite', 'tous nos', 'page ', 'show legend', 'hide legend', 'legend'];

function extraire(html, conf) {
  const titres = [];
  const vus = new Set();
  const re = /<a\s([^>]*?)>([\s\S]{0,3000}?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && titres.length < (conf.max || MAX_POINTS)) {
    const attrs = m[1];
    const href = (attrs.match(/href="([^"]*)"/) || [])[1];
    if (!href) continue;
    if (vus.has(href)) continue;
    if (conf.inclure && !conf.inclure.some(f => href.includes(f))) continue;
    if (conf.minSegments && segments(href) < conf.minSegments) continue;
    if (EXCLU_HREF.concat(conf.exclure || []).some(f => href.includes(f))) continue;

    let titre = null;
    if (conf.sousBalise) {
      const sb = m[2].match(conf.sousBalise);
      if (sb) titre = texte(sb[1]);
    }
    if (!titre && (conf.aria || attrs.includes('aria-label'))) {
      const al = (attrs.match(/aria-label="([^"]{10,250})"/) || [])[1];
      if (al) {
        titre = decoder(al);
        if (conf.ariaPrefix) titre = titre.replace(conf.ariaPrefix, '').trim();
      }
    }
    if (!titre) {
      titre = texte(m[2]);
      /* Badge d'espèce (Sea Shepherd) : accolé au texte brut des cartes,
       * jamais au titre extrait d'une sous-balise ou d'un aria-label. */
      if (conf.badge) {
        const b = (attrs.match(new RegExp(conf.badge + '="([^"]*)"')) || [])[1];
        if (b) titre = titre.replace(b, '').trim();
      }
    }
    titre = nettoyer(titre);
    if (!titre || titre.length < (conf.min || 15) || titre.length > 220) continue;
    const bas = titre.toLowerCase();
    if (bas.startsWith('page') || bas.startsWith('lire l') || BRUIT_COMMUN.concat(conf.bruit || []).some(b => bas.includes(b))) continue;
    vus.add(href);
    titres.push(titre);
  }
  return titres;
}

/* ————— Règles par organisation (URL + façon de repérer les articles) ————— */
const SITES = {
  acf: {
    url: 'https://www.actioncontrelafaim.org/actualites/',
    inclure: ['/actualites/'], minSegments: 3, exclure: ['/auteur/', 'communiques-de-presse']
  },
  greenpeace: { url: 'https://www.greenpeace.fr/actualites/', mode: 'greenpeace' },
  'croix-rouge': { url: 'https://www.croix-rouge.fr/actualite', mode: 'croix-rouge' },
  msf: {
    url: 'https://www.msf.fr/actualites',
    inclure: ['/actualites/', '/communiques-presse/'], minSegments: 2,
    exclure: ['/nos-podcasts', '/gaza-nos-reponses'], bruit: ['©']
  },
  'sea-shepherd': {
    url: 'https://seashepherd.fr/actualites',
    inclure: ['/actualites/'], minSegments: 2, badge: 'data-espece',
    exclure: ['inscription', 'media-room'],
    sousBalise: /<p[^>]*class="h3"[^>]*>([\s\S]*?)<\/p>/
  },
  wwf: {
    url: 'https://www.wwf.fr/s-informer/nos-actualites',
    inclure: ['/actualites/'], minSegments: 2, aria: true, ariaPrefix: /^Lire l’article\s*:?\s*/i
  },
  amnesty: {
    url: 'https://www.amnesty.fr/actualites/',
    inclure: ['/actualites/'], minSegments: 2, aria: true, exclure: ['/pays/', '/themes/']
  },
  oxfam: {
    url: 'https://www.oxfamfrance.org/actualite/',
    mode: 'oxfam'
  },
  hi: {
    url: 'https://www.handicap-international.fr/fr/actualites/',
    inclure: ['/fr/actualites/'], minSegments: 3, exclure: ['index'],
    bruit: ['achats solidaires', 'défi solidaire']
  },
  unicef: {
    url: 'https://www.unicef.fr/actualites/',
    inclure: ['/article/'], minSegments: 2, exclure: ['cercle-des-grands-donateurs']
  }
};

/* Modes spéciaux */
function extraireGreenpeace(html) {
  const titres = [];
  const re = /<a\s([^>]*?data-bb-position="actualité"[^>]*?)>/g;
  const vus = new Set();
  let m;
  while ((m = re.exec(html)) && titres.length < MAX_POINTS) {
    const href = (m[1].match(/href="([^"]*)"/) || [])[1];
    const label = (m[1].match(/data-bb-event-label="([^"]{15,200})"/) || [])[1];
    if (!href || !label || vus.has(href)) continue;
    vus.add(href);
    titres.push(decoder(label));
  }
  return titres;
}

function extraireCroixRouge(html) {
  const titres = [];
  const re = /<a\s([^>]*?)>([\s\S]{0,3000}?)<\/a>/g;
  const vus = new Set();
  let m;
  while ((m = re.exec(html)) && titres.length < MAX_POINTS) {
    const href = (m[1].match(/href="([^"]*)"/) || [])[1];
    if (!href || vus.has(href)) continue;
    /* Articles : /{rubrique-longue}/{slug-long} — jamais les nav courtes ni les ?page= */
    if (!/^\/[a-z0-9-]{8,}\/[a-z0-9-]{25,}$/.test(href.split('?')[0])) continue;
    if (href.includes('dossiers')) continue;
    /* Le titre vit dans <strong class="news-card__title"> ; les cartes
     * « alerte » sans strong dévoilent leur titre en texte brut. */
    const sb = m[2].match(/<strong[^>]*class="[^"]*news-card__title[^"]*"[^>]*>([\s\S]*?)<\/strong>/);
    const t = nettoyer(texte(sb ? sb[1] : m[2]));
    if (!t || t.length < 20 || t.length > 220) continue;
    vus.add(href);
    titres.push(t);
  }
  return titres;
}

function extraireOxfam(html) {
  return extraire(html, { minSegments: 2, min: 20, exclure: ['a-la-une', '/presse/', 'rester-informe', 'faire-un-don', '/emplois/'] });
}

/* ————— Récupération avec un retry patient (429 = limite de débit fréquente) ————— */
async function recup(url, essai) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml', 'accept-language': 'fr-FR,fr;q=0.9' }
    });
    if (!r.ok) {
      if ((r.status === 429 || r.status >= 500) && !essai) {
        await new Promise(res => setTimeout(res, 4000));
        return recup(url, true);
      }
      throw new Error('HTTP ' + r.status);
    }
    return await r.text();
  } finally { clearTimeout(minuteur); }
}

async function releverOrg(org, dateFr) {
  const conf = SITES[org.id];
  if (!conf) return { statut: 'aucune-règle' };
  if (org.derniere && org.derniere.releve === dateFr) return { statut: 'déjà-fait' };
  try {
    const html = await recup(conf.url);
    const titres = conf.mode === 'greenpeace' ? extraireGreenpeace(html)
      : conf.mode === 'croix-rouge' ? extraireCroixRouge(html)
      : conf.mode === 'oxfam' ? extraireOxfam(html)
      : extraire(html, conf);
    if (!titres.length) return { statut: 'échec', detail: 'aucun titre extrait' };
    org.derniere = { releve: dateFr, points: titres };
    return { statut: 'rafraîchi', titres: titres.length };
  } catch (e) {
    return { statut: 'échec', detail: String(e.message || e).slice(0, 100) };
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  const maintenant = new Date();
  /* Date française fiable quel que soit l'hébergeur du run. */
  const dateFr = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(maintenant);
  const orgs = Array.isArray(data.organisations) ? data.organisations : [];
  const resultats = {};
  for (const org of orgs) {
    resultats[org.id] = await releverOrg(org, dateFr);
  }
  const rafraichis = Object.values(resultats).filter(r => r.statut === 'rafraîchi').length;
  const echecs = Object.values(resultats).filter(r => r.statut === 'échec');
  const modifie = rafraichis > 0;
  if (modifie) {
    fs.writeFileSync(FICHIER, JSON.stringify(data, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify({
    date: dateFr, modifie, rafraichis,
    echecs: echecs.length,
    details: Object.fromEntries(Object.entries(resultats).filter(([, r]) => r.statut !== 'déjà-fait'))
  }));
}

main().catch(e => { process.stderr.write(String(e.message || e)); process.exit(1); });
