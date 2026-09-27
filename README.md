# Newsletter PWA

Page web personnelle : édition du jour (newsletter rédigée) + flux chaud RSS agrégé, en 9 chapitres. Dark mode par défaut, installable sur l'écran d'accueil de l'iPhone.

## Activer GitHub Pages
1. Sur GitHub : **Settings → Pages** → Source : *Deploy from a branch* → branche `main`, dossier `/ (root)`.
2. Attendez 1–2 minutes, le site est sur `https://maxjeandon-cmyk.github.io/newsletter-pwa/`.

## Installation sur iPhone
Ouvrez l'URL dans Safari → bouton Partager → « Sur l'écran d'accueil ». L'icône ouvre le site plein écran, sans barre de navigation.

## Mise à jour quotidienne
Chaque matin, la tâche programmée pousse `editions/YYYY-MM-DD.json` et met à jour `editions/latest.json` dans ce dépôt — GitHub Pages redéploie automatiquement à chaque push.

## Limites connues (honnêteté technique)
- **Flux chaud** : les flux RSS sont récupérés depuis le navigateur via des proxys CORS publics (allorigins, rss2json) — parfois lents ou indisponibles ; le cache local affiche toujours le dernier état connu.
- **Pas de notifications push ni de widget iOS** : réservés aux apps natives.
- **Icône SVG** : iOS préfère un PNG pour l'icône d'accueil ; si l'icône rend mal, remplacez `icons/icon.svg` par un PNG 180×180 nommé `apple-touch-icon.png` et référencez-le dans `index.html`.
- Sources RSS configurables dans `chapters.json` (et masquables dans les réglages de l'app).
