/* js/feedback.js — couche Feedback (v31) : envoi des messages vers la table
 * Supabase `feedback` (insert-only, RLS) — la clé anon publique suffit, aucune
 * donnée personnelle n'est collectée. Le résumé quotidien vit dans
 * data/feedback.json, écrit par le workflow GitHub Actions (tools/feedback.js),
 * l'app ne fait que le lire. */
import { state, esc } from './core.js';

async function cfgCompte() {
  if (!state.compteCfg) {
    try { state.compteCfg = await (await fetch('data/compte.json', { cache: 'no-store' })).json(); }
    catch (e) { state.compteCfg = {}; }
  }
  return state.compteCfg || {};
}

/* Envoyer un message. Retour soft : {erreur} en cas d'échec, null si OK. */
export async function envoyerFeedback(message) {
  const cfg = await cfgCompte();
  if (!cfg.url || !cfg.anon_key) return { erreur: 'config' };
  if (!message || !message.trim() || message.trim().length < 3) return { erreur: 'court' };
  if (message.length > 2000) return { erreur: 'long' };
  try {
    const r = await fetch(cfg.url + '/rest/v1/feedback', {
      method: 'POST',
      headers: {
        'apikey': cfg.anon_key,
        'authorization': 'Bearer ' + cfg.anon_key,
        'content-type': 'application/json',
        'prefer': 'return=minimal'
      },
      body: JSON.stringify({ message: message.trim() })
    });
    if (r.status === 429) return { erreur: 'trop-de-demandes' };
    if (!r.ok) return { erreur: 'envoi' };
    return null;
  } catch (e) { return { erreur: 'reseau' }; }
}

/* Résumé quotidien des messages (data/feedback.json), null si absent. */
export async function chargerResumeFeedback() {
  try { return await (await fetch('data/feedback.json', { cache: 'no-store' })).json(); }
  catch (e) { return null; }
}
