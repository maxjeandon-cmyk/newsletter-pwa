# Newsletter — PWA

Page web personnelle : **édition du jour** (newsletter rédigée) + **flux chaud** (articles RSS des dernières 24 h, classés par chapitre). Dark mode par défaut, installable sur l'écran d'accueil de l'iPhone.

## Structure

- `index.html`, `app.js`, `styles.css` — la page
- `sw.js`, `manifest.webmanifest`, `icon.svg` — PWA (offline + installation)
- `chapters.json` — configuration des 9 chapitres (mots-clés, flux RSS)
- `editions/<date>.json` + `editions/index.json` — l'édition du jour (mise à jour chaque matin, 9h)

## Mise à jour quotidienne

Une tâche automatisée pousse chaque matin `editions/<date>.json` et met à jour `editions/index.json` sur la branche `main`. GitHub Pages redéploie tout seul à chaque push.

## Activer GitHub Pages

Réglages du dépôt → **Pages** → Source : *Deploy from a branch* → branche `main`, dossier `/ (root)` → Save.
L'adresse du site est alors `https://maxjeandon-cmyk.github.io/newsletter-pwa/`.

## Installation sur iPhone

Ouvrir le site dans Safari → bouton **Partager** → **Sur l'écran d'accueil**. La Newsletter s'ouvre ensuite plein écran, sans barre de navigateur.

## Limites connues (honnêteté technique)

- **Pas de widget d'écran d'accueil iOS** : réservé aux apps natives.
- **Pas de notifications push** : le mail de 9h reste le réveil éditorial.
- **Flux RSS via proxys CORS publics** (allorigins, rss2json) : parfois lents ou indisponibles — d'où le cache local de 15 minutes et le mode hors-ligne sur la dernière édition.