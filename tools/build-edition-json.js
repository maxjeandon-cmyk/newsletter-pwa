#!/usr/bin/env node
/* build-edition-json.js — Génère le JSON d'édition depuis le HTML de la newsletter.
 * Usage : node tools/build-edition-json.js <edition.html> <date YYYY-MM-DD> [out.json]
 * Schéma du format.md : resume_executif (5 points), chapitres (ordre imposé, résumé extrait du HTML),
 * hors_chapitres (éditions du 29/09/2026 et après), sources.
 *
 * Date-aware depuis le 30/09/2026 : 13 chapitres (economie-pour-les-nuls, droit-pour-les-nuls
 * insérés après intelligence-artificielle) + section « Hors des chapitres » pour les éditions
 * datées du 29/09/2026 ou après ; 11 chapitres (format historique) avant.
 */
'use strict';
const fs = require('fs');

const FORMAT_13_A_PARTIR_DE = '2026-09-29';

// Format historique à 11 chapitres (27-28/09/2026)
const IDS11 = ['intelligence-artificielle','jeu-video-pop-culture','culture','sciences','climat','politique-francaise','etats-unis','chine','russie','geopolitique','grande-info-semaine'];
const NOMS11 = ['Intelligence artificielle','Jeu vidéo & pop culture','Culture','Sciences','Climat','Politique française','États-Unis','Chine','Russie','Géopolitique mondiale','Grande information de la semaine'];
const EMOJIS11 = ['🤖','🎮','🎭','🔬','🌍','🇫🇷','🇺🇸','🇨🇳','🇷🇺','🌐','📰'];

// Format à 13 chapitres (règle du 30/09/2026, première édition : 29/09/2026)
const IDS13 = ['intelligence-artificielle','economie-pour-les-nuls','droit-pour-les-nuls','jeu-video-pop-culture','culture','sciences','climat','politique-francaise','etats-unis','chine','russie','geopolitique','grande-info-semaine'];
const NOMS13 = ['Intelligence artificielle','L\u2019Économie pour les nuls','Le Droit pour les nuls','Jeu vidéo & pop culture','Culture','Sciences','Climat','Politique française','États-Unis','Chine','Russie','Géopolitique','Grande information de la semaine'];
const EMOJIS13 = ['🤖','💰','⚖️','🎮','🎭','🔬','🌍','🇫🇷','🇺🇸','🇨🇳','🇷🇺','🌐','📰'];

// Les apostrophes peuvent être droites (') ou typographiques (U+2019) selon le fichier source.
const AP = "['\u2019]";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resumeDeChapitre(html, nom, i) {
  const re = new RegExp('<h2>\\d+\\.\\s*[^<]*' + escapeRe(nom).replace(/'/g, AP) + '\\s*</h2>([\\s\\S]*?)(?=<hr>|<h2>|$)');
  const m = html.match(re);
  if (!m) return '';
  const bloc = m[1];
  const p = bloc.match(/<p>([\s\S]*?)<\/p>/) || bloc.match(/<li>([\s\S]*?)<\/li>/);
  if (!p) return '';
  return p[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function horsChapitres(html) {
  const m = html.match(/<h2>[^<]*Hors des chapitres[^<]*<\/h2>([\s\S]*?)(?=<hr>|<h2>|$)/);
  if (!m) return [];
  const bloc = m[1];
  return [...bloc.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((li) =>
    li[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\s*:\s*:/g, ' :').trim());
}

function build(html, date) {
  const format13 = date >= FORMAT_13_A_PARTIR_DE;
  const IDS = format13 ? IDS13 : IDS11;
  const NOMS = format13 ? NOMS13 : NOMS11;
  const EMOJIS = format13 ? EMOJIS13 : EMOJIS11;

  const reSection = html.split(/<h2>[^<]*Résumé exécutif[^<]*<\/h2>/)[1] || '';
  const corpsResume = reSection.split('<hr>')[0];
  // Résumé exécutif : liste <li><strong>Titre</strong> : texte</li> (format.md).
  const points = [...corpsResume.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((li) => {
    const sm = li[1].match(/^<strong>([\s\S]*?)<\/strong>\s*:?/);
    const titre = sm ? sm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    let texte = (sm ? li[1].slice(sm[0].length) : li[1]).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    texte = texte.replace(/^:\s*/, '');
    return (titre ? titre + ' : ' + texte : texte).replace(/\s*:\s*:/g, ' :').trim();
  });
  const sources = [...html.matchAll(/<tr><td>(.*?)<\/td><td>(\d)\/5<\/td><td>(.*?)<\/td><\/tr>/g)].map(m => {
    let label = m[1].replace(/<[^>]+>/g, '').trim();
    const urlM = label.match(/\((https?:\/\/[^)]+)\)/);
    if (urlM) label = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return { label, ref: urlM ? urlM[1] : '', fiabilite: parseInt(m[2], 10), maj: m[3] };
  });
  const chapitres = IDS.map((id, i) => ({ id, emoji: EMOJIS[i], nom: NOMS[i], resume: resumeDeChapitre(html, NOMS[i], i) }));
  const j = { date, genere_le: new Date().toISOString(), html: 'editions/' + date + '.html', resume_executif: points, chapitres, sources };
  if (format13) j.hors_chapitres = horsChapitres(html);
  return { j, format13, nb: IDS.length };
}

const [htmlPath, date, outPath] = process.argv.slice(2);
if (!htmlPath || !date) {
  console.error('Usage: node tools/build-edition-json.js <edition.html> <date> [out.json]');
  process.exit(2);
}
// Les éditions sont publiées en ASCII pur (entités numériques) depuis le 29/09/2026 :
// contourne la corruption de transport des charges non-ASCII > ~32 Ko.
const decodeEntities = (s) => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(parseInt(n, 10)));
const { j, format13, nb } = build(decodeEntities(fs.readFileSync(htmlPath, 'utf8')), date);
fs.writeFileSync(outPath || 'editions/' + date + '.json', JSON.stringify(j, null, 2));
console.log('JSON écrit : ' + (outPath || 'editions/' + date + '.json') + ' — ' + j.resume_executif.length + ' points, ' + j.chapitres.filter(c => c.resume).length + '/' + nb + ' résumés, ' + j.sources.length + ' sources.');
if (j.resume_executif.length !== 5) { console.error('ATTENTION : résumé exécutif != 5 points.'); process.exit(1); }
if (j.chapitres.some(c => !c.resume)) { console.error('ATTENTION : au moins un résumé de chapitre est vide.'); process.exit(1); }
if (format13) {
  console.log('Format 13 chapitres : hors_chapitres = ' + j.hors_chapitres.length + ' info(s).');
  if (j.hors_chapitres.length < 10 || j.hors_chapitres.length > 12) { console.error('ATTENTION : hors_chapitres doit contenir 10 à 12 infos.'); process.exit(1); }
}
