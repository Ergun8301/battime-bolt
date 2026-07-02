# Storyboard — vidéo de démo BEMEXO

> Durée cible : **~75 s** · 30 i/s · deux formats : **16:9** (1920×1080, site/YouTube)
> et **9:16** (1080×1920, réseaux sociaux). Pas de voix off : textes à l'écran.
> Données 100 % fictives (Karim B., Villa Lupin, Toiture Pasteur…).
> Identité stricte : noir #15120F · jaune #FFC21A · crème #F2EDE3 · Archivo + JetBrains Mono.

## S1 — Le problème (0:00 → 0:11)

**Fond crème.** Des éléments « avant BEMEXO » tombent et s'empilent de travers,
avec des rotations légères (effet bazar contrôlé) :
- une feuille d'heures **papier** froissée (griffonnage manuscrit),
- une bulle **WhatsApp** « T'as fait combien d'heures lundi ? » (19:47),
- un tableau **Excel** avec des cellules rouges « #REF! » et une colonne qui déborde.

Textes (rythmés, gros, noir) :
1. « Chaque fin de mois, la même galère. »
2. « Papier perdu · Ressaisie Excel · Relances WhatsApp »

**9:16** : mêmes éléments empilés verticalement, textes plus gros.

## S2 — Transition marque (0:11 → 0:15)

Un **ruban de chantier jaune/noir** traverse l'écran en diagonale et « emporte »
le désordre (les éléments glissent hors champ). Le **X jaune** BEMEXO se pose au
centre sur fond noir, pulse une fois.

Texte : « Il y a plus simple. »

## S3 — Le poseur pointe en 3 gestes (0:15 → 0:35)

Le **téléphone** (mockup « Ma journée · Lundi 20 juin », données fictives) entre
en **perspective 3D** (incliné, comme sur la page d'inscription) puis se redresse
plein cadre. Trois gestes s'enchaînent, chacun avec sa pastille numérotée jaune :

1. **① Choisir le chantier** — tap sur « Villa Lupin — Aix » (surbrillance jaune).
2. **② Régler les heures** — la molette défile : 07:30 → 11:30, le total
   « 6:45 travaillées » s'incrémente en JetBrains Mono.
3. **③ Envoyer** — pression sur le gros bouton jaune « Envoyer ma journée → »
   (enfoncement, ombre #C99300), badge vert « ✓ Envoyé » qui claque.

Clin d'œil force du produit : mini-bandeau « **Hors-ligne ? Tout est gardé.** »

Texte principal : « Sur le chantier : **3 gestes**, montre en main. »

**9:16** : le téléphone occupe tout l'écran (format natif), textes au-dessus/en dessous.

## S4 — La secrétaire voit tout en temps réel (0:35 → 0:51)

Bascule 3D (rotation d'axe vertical) vers une **fenêtre navigateur**
`bemexo.fr/planning` : le **planning équipe** fictif (colonnes LUN 16 · MER 18 ·
JEU 19, lignes Karim B. / Julien M.). Les cases se remplissent **en cascade** :
« ✓ 7h30 » Villa Lupin (liseré orange), « ✓ 5h00 » Toiture Pasteur (liseré rose),
avec la **couleur par chantier**. Une pastille « Reçu à l'instant » ping sur la
dernière case.

Textes :
1. « Au bureau : tout arrive **en temps réel**. »
2. « Zéro ressaisie. »

**9:16** : la fenêtre planning est plus large que l'écran → **pan latéral**
lent + zoom sur les cases qui se remplissent.

## S5 — Export paie en un clic (0:51 → 1:01)

Sur la même fenêtre : clic sur « **Exporter ▾** » → menu → « Exporter l'équipe ».
Un **fichier paie** (icône tableau, nom `paie_juin_2026.xlsx`) glisse hors de la
fenêtre et se pose au premier plan. Un tampon « **Mois verrouillé 🔒** » s'applique
avec un petit impact.

Texte : « Fin du mois : **export paie en un clic**. »

## S6 — Final CTA (1:01 → 1:15)

Fond noir + texture chantier + halo jaune. Enchaînement centré :
1. **Wordmark BEMEXO** (crème + X jaune) descend en place,
2. Slogan : « **Une seule saisie.** » (crème) / « **Tout suit.** » (jaune),
3. Bouton jaune signature « **Essayer 30 jours gratuits →** »,
4. Ligne mono : « Sans carte bancaire · Prêt en 5 min · bemexo.fr ».

Ruban chantier en liseré bas. *(→ voir `out/still-cta-169.png` : c'est la
preuve de style déjà rendue.)*

---

## Notes de fabrication

- Projet **isolé** dans `video/` (package.json propre, aucun lien avec le build
  du site ; Netlify l'ignore). Rendu **hors-réseau** : polices Archivo/JetBrains
  Mono embarquées en local (`public/fonts/`), logos SVG copiés depuis la branche
  rebrand (`public/*.svg`).
- Tous les écrans d'app sont des **mockups reconstruits** (aucune donnée réelle,
  aucune connexion à Supabase).
- Rendu : headless shell Chromium préinstallé (`remotion.config.ts`).
- Étapes de validation : ① storyboard → ② stills des moments clés de chaque
  scène → ③ rendu final MP4 (16:9 + 9:16).
