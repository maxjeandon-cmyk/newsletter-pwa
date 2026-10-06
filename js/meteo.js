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
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
