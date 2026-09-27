# 📬 Newsletter — PWA personnelle

Newsletter quotidienne : **édition du jour** (rédigée, publiée chaque matin) + **flux chaud** (RSS filtrés sur les dernières 24 h), en 9 chapitres, dark mode par défaut, installable sur iPhone (« Ajouter à l'écran d'accueil »).

## Publier l'édition du jour

La tâche Vibe de 9h pousse automatiquement `editions/<YYYY-MM-DD>.json` (et met à jour `editions/latest.json`) dans ce dépôt. GitHub Pages se met à jour à chaque push.

## Activer GitHub Pages (une seule fois)

1. Ouvrir **Settings → Pages**
2. Source : **Deploy from a branch**, branche `main`, dossier `/ (root)`
3. Sauver — le site est sur `https://maxjeandon-cmyk.github.io/newsletter-pwa/`

## Installer sur iPhone

Safari → Partager ⬆️ → « Sur l'écran d'accueil ». La PWA s'ouvre plein écran, sans barre de navigateur.

## Limites connues (honnêteté)

- Le flux chaud passe par des proxys CORS publics (allorigins, rss2json) : parfois lents, d'où le cache local.
- Pas de notifications push ni de widget d'écran d'accueil iOS : réservés aux apps natives. Le mail Gmail de 9h reste le réveil éditorial.
- Le « temps réel » est un rafraîchissement périodique (réglable : 15/30 min).

## Fichiers

- `index.html`, `app.js`, `styles` (inline) — l'app
- `sw.js` — service worker (cache, hors-ligne)
- `manifest.webmanifest` — PWA
- `chapters.json` — chapitres, mots-clés, visibilité (modifiable aussi dans l'app)
- `editions/` — une édition par jour + `latest.json`
