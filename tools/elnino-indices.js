#!/usr/bin/env node
/* tools/elnino-indices.js — Automate quotidien des indices El Niño (v121).
 * Fetch les trois fichiers texte officiels NOAA CPC :
 *   - https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt (saisonnier)
 *   - https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt (mensuel)
 *   - https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
 * Parse les formats, garde les 12 dernières lignes utiles de chaque série.
 * Recalcule le classement : épisodes = saisons consécutives ≥ 0,5,
 * pic par épisode, top8Precedents hors épisode en cours.
 * Re-génère data/elnino-indices.json AU MÊME SCHÉMA.
 * Mode test : node tools/elnino-indices.js --check valide le JSON existant.
 * Node >= 18, zéro dépendance.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FICHIER_SORTIE = path.join(__dirname, '..', 'data', 'elnino-indices.json');
const FICHIER_EXISTANT = FICHIER_SORTIE;

/* URLs officielles NOAA CPC */
const URL_RONI = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt';
const URL_RNINO34 = 'https://www.cpc.ncep.noaa.gov/data/indices/Rnino34.ascii.txt';
const URL_ONI = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

/* User Agent pour éviter les blocages */
const UA = 'Mozilla/5.0 (compatible; NewsletterPWA/1.0; +https://diyeah24.fr)';

/* Format de date dd/mm/yyyy */
function fmtDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

/* Parse une ligne RONI : "SEAS YR ANOM" -> { saison, annee, valeur } */
function parseRoniLine(line) {
  const m = line.trim().match(/^(\w{3})\s+(\d{4})\s+([-+]?\d+\.?\d*)/);
  if (!m) return null;
  return { saison: m[1], annee: parseInt(m[2], 10), valeur: parseFloat(m[3]) };
}

/* Parse une ligne Rnino34 : "YR MTH ANOM" -> { annee, mois, valeur } */
function parseRnino34Line(line) {
  const m = line.trim().match(/^(\d{4})\s+(\w{3})\s+([-+]?\d+\.?\d*)/);
  if (!m) return null;
  return { annee: parseInt(m[1], 10), mois: m[2], valeur: parseFloat(m[3]) };
}

/* Parse une ligne ONI : "SEAS YR TOTAL ANOM" -> { saison, annee, total, valeur } */
function parseOniLine(line) {
  const m = line.trim().match(/^(\w{3})\s+(\d{4})\s+([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)/);
  if (!m) return null;
  return { saison: m[1], annee: parseInt(m[2], 10), total: parseFloat(m[3]), valeur: parseFloat(m[4]) };
}

/* Convertir saison + annee en label "SAISON YYYY" */
function labelSaison(saison, annee) {
  return saison + ' ' + annee;
}

/* Convertir mois en numéro */
function moisNum(m) {
  const mois = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  return mois[m] || 0;
}

/* Convertir saison en période de mois */
function saisonMois(saison) {
  const saisons = {
    ASO: [8, 9, 10], SON: [9, 10, 11], OND: [10, 11, 12],
    NDJ: [11, 12, 1], DJF: [12, 1, 2], JFM: [1, 2, 3],
    FMA: [2, 3, 4], MAM: [3, 4, 5], AMJ: [4, 5, 6],
    MJJ: [5, 6, 7], JJA: [6, 7, 8], JAS: [7, 8, 9]
  };
  return saisons[saison] || [];
}

/* Trouver les épisodes El Niño (saisons consécutives ≥ 0.5) */
function trouverEpisodes(serie) {
  const episodes = [];
  let episodeActuel = null;

  for (const item of serie) {
    const v = item.valeur;
    if (v >= 0.5) {
      if (!episodeActuel) {
        episodeActuel = { saisons: [], pic: v };
      }
      episodeActuel.saisons.push({ saison: item.saison, annee: item.annee, valeur: v });
      episodeActuel.pic = Math.max(episodeActuel.pic, v);
    } else {
      if (episodeActuel) {
        episodes.push(episodeActuel);
        episodeActuel = null;
      }
    }
  }
  if (episodeActuel) {
    episodes.push(episodeActuel);
  }
  return episodes;
}

/* Générer le label d'épisode (YYYY-YY) */
function labelEpisode(episode) {
  if (!episode.saisons || episode.saisons.length === 0) return '?';
  const premiere = episode.saisons[0];
  const derniere = episode.saisons[episode.saisons.length - 1];
  const startYear = premiere.annee;
  const endYear = derniere.annee + (derniere.saison === 'DJF' ? 1 : 0);
  const shortEnd = String(endYear).slice(-2);
  return startYear + '-' + shortEnd;
}

/* Générer le classement historique */
function genererClassement(episodes, serieRoni) {
  if (!episodes || episodes.length === 0) return { top8Precedents: [], episodeEnCours: null };

  /* Trouver l'épisode en cours (le dernier) */
  const episodeEnCours = episodes[episodes.length - 1];

  /* Trouver le pic de l'épisode en cours */
  const picEnCours = episodeEnCours.pic;
  const saisonPicEnCours = episodeEnCours.saisons.find(s => s.valeur === picEnCours) || episodeEnCours.saisons[0];

  /* Tous les épisodes sauf le dernier = précédents */
  const precedents = episodes.slice(0, -1);

  /* Trier par pic décroissant */
  precedents.sort((a, b) => b.pic - a.pic);

  /* Top 8 précédents */
  const top8 = precedents.slice(0, 8).map(ep => {
    const picSaison = ep.saisons.find(s => s.valeur === ep.pic) || ep.saisons[0];
    return {
      episode: labelEpisode(ep),
      pic: ep.pic,
      saison: labelSaison(picSaison.saison, picSaison.annee)
    };
  });

  return {
    top8Precedents: top8,
    episodeEnCours: {
      episode: labelEpisode(episodeEnCours),
      pic: picEnCours,
      saison: labelSaison(saisonPicEnCours.saison, saisonPicEnCours.annee)
    }
  };
}

/* Fetch avec timeout */
async function fetchWithTimeout(url, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.text();
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/* Parser le fichier RONI */
async function parserRoni() {
  const text = await fetchWithTimeout(URL_RONI);
  const lines = text.split('\n');
  const serie = [];
  for (const line of lines) {
    const parsed = parseRoniLine(line);
    if (parsed) serie.push(parsed);
  }
  /* Garder les 12 dernières */
  return serie.slice(-12).reverse();
}

/* Parser le fichier Rnino34 */
async function parserRnino34() {
  const text = await fetchWithTimeout(URL_RNINO34);
  const lines = text.split('\n');
  const serie = [];
  for (const line of lines) {
    const parsed = parseRnino34Line(line);
    if (parsed) serie.push(parsed);
  }
  /* Garder les 12 dernières */
  return serie.slice(-12).reverse();
}

/* Parser le fichier ONI */
async function parserOni() {
  const text = await fetchWithTimeout(URL_ONI);
  const lines = text.split('\n');
  const serie = [];
  for (const line of lines) {
    const parsed = parseOniLine(line);
    if (parsed) serie.push(parsed);
  }
  /* Garder les 12 dernières */
  return serie.slice(-12).reverse();
}

/* Convertir la série Rnino34 en série mensuelle avec période "MM/YYYY" */
function convertirRnino34(serie) {
  return serie.map(item => ({
    periode: item.mois + '/' + item.annee,
    valeur: item.valeur
  }));
}

/* Convertir la série ONI en série saisonnière */
function convertirOni(serie) {
  return serie.map(item => ({
    periode: labelSaison(item.saison, item.annee),
    valeur: item.valeur
  }));
}

/* Main — génération complète */
async function generer() {
  const aujourdhui = new Date();
  const maj = fmtDate(aujourdhui);

  /* Fetch et parse */
  const [roniSerie, rnino34Serie, oniSerie] = await Promise.all([
    parserRoni().catch(e => { console.error('RONI:', e.message); return []; }),
    parserRnino34().catch(e => { console.error('Rnino34:', e.message); return []; }),
    parserOni().catch(e => { console.error('ONI:', e.message); return []; })
  ]);

  /* Trouver l'épisode en cours à partir de RONI */
  const episodes = trouverEpisodes(roniSerie.map(r => ({ saison: r.saison, annee: r.annee, valeur: r.valeur })));

  /* Dernière valeur RONI */
  const dernierRoni = roniSerie[roniSerie.length - 1] || {};

  /* Dernière valeur Rnino34 */
  const dernierRnino34 = rnino34Serie[rnino34Serie.length - 1] || {};

  /* Dernière valeur ONI */
  const dernierOni = oniSerie[oniSerie.length - 1] || {};

  /* Classement */
  const classement = genererClassement(episodes, roniSerie);

  /* Construire la sortie */
  const sortie = {
    maj: maj,
    roni: {
      periode: dernierRoni.saison ? labelSaison(dernierRoni.saison, dernierRoni.annee) : '',
      valeur: dernierRoni.valeur || 0,
      unite: 'degC',
      seuilElNino: 0.5,
      seuilTresFort: 2.0,
      serie: roniSerie.map(r => ({ periode: labelSaison(r.saison, r.annee), valeur: r.valeur })),
      source: 'NOAA CPC - RONI.ascii.txt'
    },
    nino34Relatif: {
      periode: dernierRnino34.mois ? dernierRnino34.mois + '/' + dernierRnino34.annee : '',
      valeur: dernierRnino34.valeur || 0,
      serie: convertirRnino34(rnino34Serie),
      source: 'NOAA CPC - Rnino34.ascii.txt'
    },
    oni: {
      periode: dernierOni.saison ? labelSaison(dernierOni.saison, dernierOni.annee) : '',
      valeur: dernierOni.valeur || 0,
      serie: convertirOni(oniSerie),
      source: 'NOAA CPC - oni.ascii.txt'
    },
    /* Conserver sstNino34, probabilitesForce, outlookRoni depuis l'existant si disponible */
    sstNino34: null,
    probabilitesForce: null,
    outlookRoni: null,
    classementHistorique: classement
  };

  /* Lire l'existant pour conserver les blocs non-rafraîchis */
  let existant = {};
  try {
    existant = JSON.parse(fs.readFileSync(FICHIER_EXISTANT, 'utf8'));
  } catch (e) {
    console.log('Fichier existant introuvable, creation complete.');
  }

  /* Conserver les blocs non mis à jour */
  if (existant.sstNino34) sortie.sstNino34 = existant.sstNino34;
  if (existant.probabilitesForce) sortie.probabilitesForce = existant.probabilitesForce;
  if (existant.outlookRoni) sortie.outlookRoni = existant.outlookRoni;

  /* Valider la sortie */
  JSON.stringify(sortie);

  /* Écrire */
  fs.writeFileSync(FICHIER_SORTIE, JSON.stringify(sortie, null, 2) + '\n');
  console.log('Indices El Niño : maj quotidienne RONI/ONI — ' + maj);
  return sortie;
}

/* Mode check — validation sans réseau */
async function check() {
  let existant;
  try {
    existant = JSON.parse(fs.readFileSync(FICHIER_EXISTANT, 'utf8'));
  } catch (e) {
    console.error('ERREUR: data/elnino-indices.json introuvable ou invalide');
    process.exit(1);
  }

  /* Vérifications de schéma */
  const erreurs = [];

  /* Champs requis */
  const champsRequis = ['maj', 'roni', 'nino34Relatif', 'oni', 'classementHistorique'];
  for (const champ of champsRequis) {
    if (!(champ in existant)) {
      erreurs.push('Champ manquant: ' + champ);
    }
  }

  /* Structure roni */
  if (existant.roni) {
    const roniRequis = ['periode', 'valeur', 'unite', 'seuilElNino', 'seuilTresFort', 'serie', 'source'];
    for (const champ of roniRequis) {
      if (!(champ in existant.roni)) {
        erreurs.push('roni.' + champ + ' manquant');
      }
    }
    if (Array.isArray(existant.roni.serie)) {
      for (const s of existant.roni.serie) {
        if (!('periode' in s) || !('valeur' in s)) {
          erreurs.push('roni.serie: entrée incomplète');
          break;
        }
      }
    }
  }

  /* Structure nino34Relatif */
  if (existant.nino34Relatif) {
    const n34Requis = ['periode', 'valeur', 'serie', 'source'];
    for (const champ of n34Requis) {
      if (!(champ in existant.nino34Relatif)) {
        erreurs.push('nino34Relatif.' + champ + ' manquant');
      }
    }
  }

  /* Structure oni */
  if (existant.oni) {
    const oniRequis = ['periode', 'valeur', 'serie', 'source'];
    for (const champ of oniRequis) {
      if (!(champ in existant.oni)) {
        erreurs.push('oni.' + champ + ' manquant');
      }
    }
  }

  /* Structure classementHistorique */
  if (existant.classementHistorique) {
    if (!Array.isArray(existant.classementHistorique.top8Precedents)) {
      erreurs.push('classementHistorique.top8Precedents doit être un tableau');
    }
    if (!existant.classementHistorique.episodeEnCours) {
      erreurs.push('classementHistorique.episodeEnCours manquant');
    }
  }

  /* Cohérence classement */
  if (existant.classementHistorique && existant.roni && existant.roni.serie) {
    const episodes = trouverEpisodes(existant.roni.serie.map(r => ({ saison: r.periode.split(' ')[0], annee: parseInt(r.periode.split(' ')[1]), valeur: r.valeur })));
    const classement = genererClassement(episodes, existant.roni.serie);
    if (classement.episodeEnCours && existant.classementHistorique.episodeEnCours) {
      if (classement.episodeEnCours.episode !== existant.classementHistorique.episodeEnCours.episode) {
        erreurs.push('Classement: épisode en cours incohérent');
      }
    }
  }

  if (erreurs.length > 0) {
    console.error('ERREURS de validation:');
    for (const e of erreurs) console.error('  - ' + e);
    process.exit(1);
  }

  console.log('OK: data/elnino-indices.json est valide');
  process.exit(0);
}

/* Point d'entrée */
const args = process.argv.slice(2);
const modeCheck = args.includes('--check');

if (modeCheck) {
  check().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
} else {
  generer().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
}
