#!/usr/bin/env node
/* tools/etudiants.js — Relevé automatique 6 h de la chronique « Version des étudiants »
 * (onglet ✊ Lycéens 2026, sous-onglet Version des lycéens).
 * Appelé par tools/maintenance.js à chaque run (3 h, 9 h, 15 h, 21 h Paris) :
 *   1. Moissonne les flux RSS de la presse (même catalogue que lyceens.js)
 *      et ne retient que les items du mouvement lycéen/étudiant.
 *   2. Construit UN paragraphe « relevé automatique » pour les dernières 6 h :
 *      faits bruts sourcés (titres repris verbatim, troncaturés), jamais
 *      reformulés — la rédaction narrative enrichie reste le travail des
 *      éditions de la newsletter. Champ "auto": true dans le paragraphe.
 *   3. Ajoute le paragraphe au dernier chapitre de data/etudiants/chapitres/ ;
 *      si ce chapitre dépasse 28 Ko, un nouveau chapitre est créé.
 *   4. Met à jour data/etudiants/index.json (maj, compteurs, octets).
 * data/ est network-first : pas de bump de CACHE du service worker.
 * Sortie stdout : JSON { date, modifie, ajoutes, items, erreur? } pour
 * maintenance.js. Aucune dépendance : fetch natif (Node >= 18). */
'use strict';

const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '..', 'data', 'etudiants');
const FICHIER_INDEX = path.join(DOSSIER, 'index.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const FENETRE_HEURES = 7;   /* fenêtre de fraîcheur : les dernières ~6 h (+1 de marge) */
const MAX_OCTETS_CHAPITRE = 28000; /* au-delà, nouveau fichier chapitre */

/* Flux RSS vérifiés (catalogue data/flux-rss.json, testés le 04/10/2026). */
const SOURCES = [
  { id: '20-minutes', nom: '20 minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },
  { id: 'europe-1', nom: 'Europe 1', url: 'https://www.europe1.fr/rss.xml' },
  { id: 'public-senat', nom: 'Public Sénat', url: 'https://www.publicsenat.fr/rss' },
  { id: 'le-figaro', nom: 'Le Figaro', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
  { id: 'bfm-tv', nom: 'BFMTV', url: 'https://www.bfmtv.com/rss/news-24-7/' },
  { id: 'france-tv-info', nom: 'franceinfo', url: 'https://www.francetvinfo.fr/france.rss' },
  { id: 'france-info', nom: 'France Inter', url: 'https://radiofrance.fr/franceinfo/rss' },
  { id: 'france-24', nom: 'France 24', url: 'https://www.france24.com/fr/rss' },
  { id: 'rfi', nom: 'RFI', url: 'https://www.rfi.fr/fr/rss' },
  { id: 'ouest-france', nom: 'Ouest-France', url: 'https://www.ouest-france.fr/rss.xml' },
  { id: 'la-croix', nom: 'La Croix', url: 'https://www.la-croix.com/rss.xml' },
  { id: 'l-humanite', nom: "L'Humanité", url: 'https://www.humanite.fr/feed' },
  { id: 'mediapart', nom: 'Mediapart', url: 'https://www.mediapart.fr/articles/feed' },
  { id: 'liberation', nom: 'Libération', url: 'https://www.liberation.fr/arc/outboundfeeds/rss-all/' }
];

/* ————— Texte : entités, normalisation ————— */
const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ocirc: 'ô', ucirc: 'û',
  icirc: 'î', acirc: 'â', ugrave: 'ù', ccedil: 'ç', euml: 'ë',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  hellip: '…', mdash: '—', ndash: '–', deg: '°', euro: '€'
};
function decoder(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (ENTITES[n.toLowerCase()] !== undefined ? ENTITES[n.toLowerCase()] : m));
}
const sansCdata = s => String(s || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
const texte = s => decoder(sansCdata(String(s || '')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = s => texte(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* Signature de dédoublonnage : racines hors sujet + chiffres significatifs. */
const STOP = new Set([
  'lycee', 'lyceen', 'lyceens', 'eleve', 'eleves', 'etudiant', 'etudiants',
  'blocus', 'blocage', 'blocages', 'etablissem', 'manifesta', 'mobilisa',
  'mouvement', 'national', 'education', 'enseigna', 'professeu', 'ministre',
  'gouvernem', 'france', 'paris', 'video', 'videos', 'direct', 'actu', 'actus',
  'info', 'jeunesse', 'jeunes', 'apres', 'selon', 'contre', 'sous', 'sur',
  'dans', 'pour', 'avec', 'fait', 'faits', 'jour', 'journee', 'revolte', 'greve'
]);
const racines = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 7));
const signature = s => racines(s).slice(0, 4).sort().join('|') + '#' + (norm(s).match(/\d{3,}/g) || []).filter(n => +n < 2000 || +n > 2100).sort().join(',');

/* Filtres : sujet du mouvement, anti-bruit (sport, émissions). */
const RE_MOUVEMENT = /lyceen|lycee|blocus|blocage|parcoursup|etudiant|acte (trois|iii)/i;
const RE_BRUIT = /(football|rugby|basket|handball|volley|championnat|brevet des colleges|bac de francai)/i;
const RE_EMISSION = /(bonjour chez vous|l.heure des pros|edition speciale|grand entretien|la revue de presse|le direct|replay|podcast|l.interview)/i;
const estMouvement = (t, d) => RE_MOUVEMENT.test(t) || RE_MOUVEMENT.test(d);
const estBruit = (t, d) => RE_BRUIT.test(t) || RE_EMISSION.test(t);

async function moissonSource(src, depuis) {
  const items = [];
  try {
    const rep = await fetch(src.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    const xml = await rep.text();
    const re = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const bloc = m[1] || m[2] || '';
      const titre = texte((bloc.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
      const desc = texte((bloc.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1]);
      const lien = texte((bloc.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]);
      const dpub = (bloc.match(/<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/) || [])[2];
      const date = dpub ? new Date(dpub.trim()) : null;
      if (!titre) continue;
      if (!date || isNaN(date)) continue;
      if (date < depuis) continue;
      if (estBruit(titre, desc)) continue;
      if (!estMouvement(titre, desc)) continue;
      items.push({ titre, desc, lien: lien || '', date: date.toISOString(), source: src.nom });
    }
  } catch (e) { return { items, erreur: src.id + ' : ' + e.message }; }
  return { items, erreur: null };
}

const tronc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const dateHeureFr = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date());

async function main() {
  const aujourdhui = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());
  const depuis = new Date(Date.now() - FENETRE_HEURES * 3600 * 1000);
  const echecs = [];
  const tous = [];
  const moissons = await Promise.all(SOURCES.map(s => moissonSource(s, depuis)));
  for (const m of moissons) {
    if (m.erreur) echecs.push(m.erreur);
    tous.push(...m.items);
  }
  if (!tous.length) {
    process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, ajoutes: 0, items: 0, echecs }) + '\n');
    return;
  }
  /* Dédoublonnage par signature (même événement relayé par plusieurs flux). */
  const vus = new Map();
  for (const it of tous) {
    const sig = signature(it.titre);
    if (!vus.has(sig)) vus.set(sig, { ...it, sources: [it.source] });
    else if (!vus.get(sig).sources.includes(it.source)) vus.get(sig).sources.push(it.source);
  }
  const uniques = [...vus.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);

  /* Idempotence : si le dernier relevé (stocké dans l'index) contenait
   * exactement les mêmes items, on ne publie rien — pas de commit fantôme
   * toutes les 6 h. Les items du relevé précédent mais disparus des flux
   * (fenêtre 7 h) ne relancent pas un paragraphe. */
  const indexAvant = fs.existsSync(FICHIER_INDEX)
    ? JSON.parse(fs.readFileSync(FICHIER_INDEX, 'utf8'))
    : { releveSigs: [] };
  const sigs = uniques.map(it => signature(it.titre)).sort();
  const sigsPrecedents = (indexAvant.releveSigs || []).slice().sort();
  const identique = sigs.length === sigsPrecedents.length && sigs.every((s, i) => s === sigsPrecedents[i]);
  if (identique) {
    process.stdout.write(JSON.stringify({ date: aujourdhui, modifie: false, ajoutes: 0, items: uniques.length, echecs }) + '\n');
    return;
  }

  /* Construction du paragraphe « relevé automatique » : verbatim, « auto ». */
  const morceaux = uniques.map(it =>
    '— ' + tronc(it.titre, 160) + ' (' + it.sources.join(', ') + ')');
  const texteParagraphe = 'Relevé automatique du ' + dateHeureFr() + ' : ' +
    uniques.length + ' information(s) des dernières heures. ' + morceaux.join(' ') +
    ' Faits bruts repris des titres, non reformulés.';
  const sourcesParagraphe = [...new Set(uniques.flatMap(it => it.sources.map(s => s)))];

  /* Ajout au dernier chapitre (nouveau fichier si trop gros). */
  const fichiers = fs.readdirSync(path.join(DOSSIER, 'chapitres'))
    .filter(f => /^\d+\.json$/.test(f)).sort();
  let dernierFichier = fichiers[fichiers.length - 1];
  let chap = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'chapitres', dernierFichier), 'utf8'));
  let numero = parseInt(dernierFichier, 10);
  let nouveauChapitre = false;
  if (fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size > MAX_OCTETS_CHAPITRE) {
    numero += 1;
    dernierFichier = String(numero).padStart(2, '0') + '.json';
    chap = {
      id: 'c' + numero,
      periode: 'Relevés automatiques — à partir du ' + aujourdhui,
      titre: 'La suite — relevés automatiques',
      paragraphes: []
    };
    nouveauChapitre = true;
  }
  const idPar = chap.id + 'p' + (chap.paragraphes.length + 1);
  chap.paragraphes.push({ id: idPar, texte: texteParagraphe, sources: sourcesParagraphe, auto: true });
  fs.writeFileSync(path.join(DOSSIER, 'chapitres', dernierFichier), JSON.stringify(chap, null, 2) + '\n');

  /* Mise à jour de l'index. */
  const index = JSON.parse(fs.readFileSync(FICHIER_INDEX, 'utf8'));
  if (nouveauChapitre) {
    index.chapitres.push({
      id: chap.id, fichier: 'chapitres/' + dernierFichier,
      periode: chap.periode, titre: chap.titre,
      paragraphes: chap.paragraphes.length,
      octets: fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size
    });
  } else {
    const entree = index.chapitres.find(c => c.id === chap.id);
    if (entree) {
      entree.paragraphes = chap.paragraphes.length;
      entree.octets = fs.statSync(path.join(DOSSIER, 'chapitres', dernierFichier)).size;
    }
  }
  index.maj = aujourdhui;
  index.releveSigs = sigs;
  index.totalParagraphes = index.chapitres.reduce((a, c) => a + c.paragraphes, 0);
  fs.writeFileSync(FICHIER_INDEX, JSON.stringify(index, null, 2) + '\n');

  process.stdout.write(JSON.stringify({
    date: aujourdhui,
    modifie: true,
    ajoutes: 1,
    items: uniques.length,
    chapitre: chap.id,
    fichier: 'data/etudiants/chapitres/' + dernierFichier,
    nouveauChapitre,
    echecs
  }) + '\n');
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ date: '', modifie: false, ajoutes: 0, items: 0, erreur: e.message }) + '\n');
  process.exitCode = 1;
});
