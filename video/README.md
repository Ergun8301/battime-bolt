# Vidéo de présentation BEMEXO

| | |
|---|---|
| **Fichier** | `bemexo-presentation-16x9.mp4` · 1920×1080 · 30 i/s · H.264 |
| **Affiche** | `bemexo-presentation-poster.jpg` (carte de fin) |
| **Sur le site** | `public/demo-16x9.mp4` (17 Mo) et `.webm` (15 Mo, secours) : versions allégées de la même vidéo, lues dans « Comment ça marche » |
| **Durée** | ≈ 2 min 18 |
| **Conclusion** | BEMEXO — Du chantier à la paie, sans ressaisie. |
| **Coût de production** | 0 € |

## Comment elle a été faite

Tous les écrans sont le **vrai BEMEXO** (ce dépôt, branche `main`, étape 29).
L'app a été compilée telle quelle, puis filmée avec des **données fictives**.

- **Données** : faux serveur Supabase local (`production/demo-backend`) avec une
  entreprise fictive, « Delorme Rénovation ». Les adresses e-mail sont en
  `.example`, les photos de chantier sont générées et les numéros sont inventés.
- **Zéro prod** : l'app pointait vers `http://localhost:4600/sb` et tout le reste
  du réseau était bloqué. Aucun e-mail, aucun push, aucun appel Stripe.
- **Capture** : Playwright, image par image, sur une horloge figée
  (`production/capture`). Chaque animation avance de 1/30 s par image, ce qui
  rend les prises reproductibles.
- **Montage** : un petit moteur maison, en HTML piloté par Playwright et encodé
  avec ffmpeg (`production/compositor`, `production/final`).
- **Outils** : Node, Playwright (Chromium), ffmpeg et les polices Google Fonts
  (licence OFL). Tous sont gratuits. Aucun service payant, aucune IA d'image,
  de voix ou de musique.

## Refaire la vidéo

1. Faire une copie isolée de l'app. La compiler avec
   `NEXT_PUBLIC_SUPABASE_URL=http://localhost:4600/sb`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=demo-anon-key` et `next build`.
   **Ne jamais laisser ces variables vides** : l'app retomberait sur la base de production.
2. Lancer le faux serveur : `DEMO_PORT=4601 node production/demo-backend/server.js`.
3. Filmer : `node production/capture/takes.js all`.
4. Monter : `node production/compositor/render.js production/final/main.js --out bemexo.mp4`.
5. Vérifier : `node production/compositor/render.js production/final/main.js --stills $(node production/final/keyframes.js) --stills-dir stills`
   produit une image par texte à l'écran, pour relire chaque légende et chaque cadrage.

Les chemins de travail sont codés en dur dans les scripts. Il faut les adapter
(constante `SP`) avant de relancer.

## Pas de son

La vidéo n'a ni voix off ni musique. Pour ajouter une piste libre de droits :

```bash
ffmpeg -i bemexo-presentation-16x9.mp4 -i musique.m4a -c:v copy -c:a aac -shortest sortie.mp4
```
