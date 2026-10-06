/* meteo.js — v98 : météo du jour dans l'onglet Édition (Open-Meteo).
 * API publique gratuite, sans clé : https://open-meteo.com
 *  - géocodage : https://geocoding-api.open-meteo.com/v1/search (language=fr)
 *  - prévision : https://api.open-meteo.com/v1/forecast (current + daily)
 * La ville choisie vit dans nl.meteo { nom, region, pays, lat, lon } —
 * envoyerPrefs synchronise TOUTES les clés nl.* avec le profil : la ville
 * suit donc l'utilisateur sur ses appareils sans code supplémentaire.
 * Cache : nl.meteoCache (30 min) pour ne pas marteler l'API à chaque rendu. */
import { state, getStore, setStore } from './core.js';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PREVISION = 'https://api.open-meteo.com/v1/forecast';

/* Codes temps WMO -> [emoji, description courte] (langue : français) */
const CODES_WMO = {
  0: ['☀️', 'ciel clair'],
  1: ['🌤️', 'globalement clair'],
  2: ['⛅', 'partiellement nuageux'],
  3: ['☁️', 'couvert'],
  45: ['🌫️', 'brouillard'],
  48: ['🌫️', 'brouillard givrant'],
  51: ['🌦️', 'bruine légère'],
  53: ['🌦️', 'bruine'],
  55: ['🌦️', 'bruine dense'],
  61: ['🌦️', 'pluie légère'],
  63: ['🌧️', 'pluie'],
  65: ['🌧️', 'pluie forte'],
  66: ['🌧️', 'pluie verglaçante'],
  67: ['🌧️', 'pluie verglaçante forte'],
  71: ['🌨️', 'neige légère'],
  73: ['🌨️', 'neige'],
  75: ['❄️', 'neige forte'],
  77: ['🌨️', 'grésil'],
  80: ['🌦️', 'averses légères'],
  81: ['🌧️', 'averses'],
  82: ['🌧️', 'averses fortes'],
  85: ['🌨️', 'averses de neige'],
  86: ['❄️', 'fortes averses de neige'],
  95: ['⛈️', 'orage'],
  96: ['⛈️', 'orage avec grêle'],
  99: ['⛈️', 'orage violent avec grêle']
};

export function villeMeteo() {
  return getStore('meteo', null);
}

/* Chercher des villes par nom (jusqu'à 8 résultats, libellés français). */
export async function chercherVilles(q) {
  const nom = String(q || '').trim();
  if (nom.length < 2) return [];
  try {
    const r = await fetch(GEO + '?name=' + encodeURIComponent(nom) + '&count=8&language=fr&format=json');
    const j = await r.json();
    return (j.results || []).map(v => ({
      nom: v.name, region: v.admin1 || '', pays: v.country || '', lat: v.latitude, lon: v.longitude
    }));
  } catch (e) { return []; }
}

/* Tendance de la journée : l'emoji dominant de chaque moment (matin 6-12 h,
 * après-midi 12-18 h, soirée 18-24 h) d'après les codes horaires — ex.
 * « ☀️ matin · ⛅ après-midi · 🌧️ soirée ». Renvoie '' si pas d'heures. */
function tendanceJournee(j) {
  const h = j.hourly || {};
  const heures = h.time || [], codes = h.weather_code || [];
  if (!heures.length || codes.length !== heures.length) return '';
  const segments = [
    { nom: 'matin', debut: 6, fin: 12 },
    { nom: 'après-midi', debut: 12, fin: 18 },
    { nom: 'soirée', debut: 18, fin: 24 }
  ];
  const morceaux = [];
  for (const s of segments) {
    /* code dominant du segment (le plus fréquent ; à égalité, le premier gagne) */
    const compte = new Map();
    for (let i = 0; i < heures.length; i++) {
      const heur = parseInt(String(heures[i]).slice(11, 13), 10);
      if (heur >= s.debut && heur < s.fin) {
        const c = codes[i];
        compte.set(c, (compte.get(c) || 0) + 1);
      }
    }
    if (!compte.size) continue;
    let code = 0, max = -1;
    for (const [c, n] of compte) if (n > max) { max = n; code = c; }
    morceaux.push((CODES_WMO[code] || ['🌡️'])[0] + ' ' + s.nom);
  }
  return morceaux.join(' · ');
}

/* Charger la météo de la ville choisie (cache 30 min dans nl.meteoCache).
 * Renvoie null si aucune ville n'est choisie ou si l'API échoue. */
export async function chargerMeteo() {
  const v = villeMeteo();
  if (!v) { state.meteo = null; return null; }
  const cache = getStore('meteoCache', null);
  const maintenant = Date.now();
  if (cache && cache.ville && cache.ville.nom === v.nom && maintenant - (cache.time || 0) < 30 * 60e3) {
    state.meteo = cache.donnees;
    return cache.donnees;
  }
  try {
    const r = await fetch(PREVISION +
      '?latitude=' + v.lat + '&longitude=' + v.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m' +
      '&hourly=weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1');
    const j = await r.json();
    const c = j.current || {}, d = j.daily || {};
    const [emoji, desc] = CODES_WMO[c.weather_code] || ['🌡️', 'temps indéterminé'];
    const donnees = {
      ville: v.nom,
      temp: Math.round(c.temperature_2m),
      emoji, desc,
      min: Math.round(d.temperature_2m_min?.[0]),
      max: Math.round(d.temperature_2m_max?.[0]),
      vent: Math.round(c.wind_speed_10m),
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      tendance: tendanceJournee(j)
    };
    state.meteo = donnees;
    setStore('meteoCache', { ville: v, time: maintenant, donnees });
    return donnees;
  } catch (e) { /* réseau indisponible : on affiche l'ancien cache si présent */
    state.meteo = (cache && cache.donnees) || null;
    return state.meteo;
  }
}

/* Choisir une ville depuis Réglages : persiste nl.meteo et vide le cache. */
export function choisirVille(v) {
  setStore('meteo', v);
  setStore('meteoCache', null);
}
