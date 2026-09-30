#!/usr/bin/env node
/* build-archives.js — Archives thématiques Droit & Économie (règle du 30/09/2026).
 * Extrait les chapitres « Le Droit pour les nuls » et « L'Économie pour les nuls » d'une édition
 * et les publie chacun en page autonome dans editions/archives/<domaine>/YYYY-MM-DD.html,
 * puis met à jour l'index editions/archives/<domaine>.json (remplace l'entrée si même date).
 *
 * Usage :
 *   node tools/build-archives.js <edition.html> <date> "<titre-droit>" "<titre-economie>"
 *   node tools/build-archives.js editions/2026-09-30.html 2026-09-30 "Le droit de rétractation : 14 jours pour changer d'avis" "Pétrole et taux, 340 milliards d'emprunt"
 *
 * Règles (format.md) :
 *   - titre daté et explicitement lié au contenu du chapitre du jour ;
 *   - page autonome au style de l'édition, ASCII pur (entités numériques), & bruts préservés ;
 *   - index : { "domaine": ..., "entrees": [{ date, titre, html }] } en ordre antéchronologique.
 * Codes de sortie : 0 = OK, 1 = échec bloquant, 2 = erreur d'usage.
 */
'use strict';
const fs = require('fs');

const DOMAINES = [
  { id: 'droit', emoji: '⚖️', h2: 'Le Droit pour les nuls' },
  { id: 'economie', emoji: '💰', h2: 'L\u2019Économie pour les nuls' },
];

/* Apostrophes droites ou typographiques selon le fichier source. */
const AP = "['\u2019]";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeEntities = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(parseInt(n, 10)));
/* ASCII pur : chaque caractère non-ASCII devient son entité numérique ; les & restent bruts. */
const encodeEntities = (s) => s.replace(/[^\x00-\x7F]/g, (c) => '&#' + c.codePointAt(0) + ';');

function extraireChapitre(html, nomH2) {
  const re = new RegExp('<h2>\\d+\\.\\s*[^<]*' + escapeRe(nomH2).replace(/'/g, AP) + '\\s*</h2>([\\s\\S]*?)(?=<h2>|$)');
  const m = html.match(re);
  if (!m) return null;
  const corps = m[1].replace(/<hr>\s*$/, '').trim();
  if (!corps || corps.length < 200) return null;
  return '<h2>' + nomH2 + '</h2>\n' + corps;
}

function pageArchive(dom, date, titre, chapitre, editionDate) {
  const [y, mo, d] = date.split('-');
  const dateFR = d + '/' + mo + '/' + y;
  const style = 'body{background:#0e0e12;color:#e8e8ec;font-family:Georgia,serif;max-width:820px;margin:0 auto;padding:24px;line-height:1.7}h1,h2{border-bottom:1px solid #333;padding-bottom:4px}h3{color:#aab4c8}a{color:#6ea8fe}table{border-collapse:collapse;width:100%;font-size:0.85em;margin:12px 0}th,td{border:1px solid #333;padding:6px 8px;text-align:left;vertical-align:top}th{background:#1a1a22}hr{border:none;border-top:1px solid #333}li{margin:6px 0}';
  const provenance = '<p style="font-size:0.85em;color:#aab4c8">Chapitre extrait de l\u2019édition du ' + editionDate +
    ' — archivé pour pouvoir y revenir à tout moment.</p>';
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + dom.emoji + ' ' + dom.h2 + ' — ' + dateFR + ' : ' + titre + '</title>' +
    '<style>' + style + '</style></head>\n' +
    '<h1>' + dom.emoji + ' ' + dom.h2 + '<br><span style="font-size:0.6em;color:#aab4c8">' + dateFR + ' — ' + titre + '</span></h1>' +
    provenance + '<hr>\n' + chapitre + '\n</body></html>';
}

function majIndex(dom, entree) {
  const chemin = 'editions/archives/' + dom.id + '.json';
  let idx = { domaine: dom.id, entrees: [] };
  try {
    idx = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (!Array.isArray(idx.entrees)) idx.entrees = [];
  } catch (e) { /* premier archivage */ }
  idx.domaine = dom.id;
  idx.entrees = idx.entrees.filter((e) => e.date !== entree.date); // même date → remplacée
  idx.entrees.unshift(entree);
  idx.entrees.sort((a, b) => b.date.localeCompare(a.date)); // antéchronologique
  fs.writeFileSync(chemin, JSON.stringify(idx, null, 2) + '\n');
  return chemin;
}

function main() {
  const [htmlPath, date, titreDroit, titreEco] = process.argv.slice(2);
  if (!htmlPath || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !titreDroit || !titreEco) {
    console.error('Usage: node tools/build-archives.js <edition.html> <date> "<titre-droit>" "<titre-economie>"');
    process.exit(2);
  }
  const [y, mo, d] = date.split('-');
  const editionDate = d + '/' + mo + '/' + y;

  const html = decodeEntities(fs.readFileSync(htmlPath, 'utf8'));
  if (!html.includes('Droit pour les nuls') || !html.includes('conomie pour les nuls')) {
    console.error('ÉDITION NON COMPATIBLE : chapitres Droit/Économie introuvables (format à 13 chapitres requis).');
    process.exit(1);
  }

  const titres = { droit: titreDroit, economie: titreEco };
  const ecrits = [];
  for (const dom of DOMAINES) {
    const chapitre = extraireChapitre(html, dom.h2);
    if (!chapitre) { console.error('ATTENTION : chapitre ' + dom.id + ' vide ou introuvable.'); process.exit(1); }
    const page = encodeEntities(pageArchive(dom, date, titres[dom.id], chapitre, editionDate));
    if (/[^\x00-\x7F]/.test(page)) { console.error('ATTENTION : page ' + dom.id + ' non pure ASCII.'); process.exit(1); }
    const cheminPage = 'editions/archives/' + dom.id + '/' + date + '.html';
    fs.mkdirSync(require('path').dirname(cheminPage), { recursive: true });
    fs.writeFileSync(cheminPage, page);
    if (!page.trimEnd().endsWith('</html>')) { console.error('ATTENTION : page ' + cheminPage + ' incomplète.'); process.exit(1); }
    const idxChemin = majIndex(dom, { date, titre: titres[dom.id], html: cheminPage });
    JSON.parse(fs.readFileSync(idxChemin, 'utf8')); // relecture de sûreté
    ecrits.push(cheminPage + ' (' + Buffer.byteLength(page) + ' octets) + index ' + idxChemin);
  }
  console.log('Archives thématiques écrites :');
  ecrits.forEach((e) => console.log('  ' + e));
  console.log('Archives conformes. 🌱');
}

main();
