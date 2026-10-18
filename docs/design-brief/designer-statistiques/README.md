# Handoff : BEMEXO — Statistiques + Fiche salarié

## 1. Aperçu
Remplace l'actuel popup « Statistiques » (tableau + onglets) par :
- **Niveau 1 — Page Statistiques** (plein écran) : vue équipe.
- **Niveau 2 — Fiche salarié** (plein écran sur ordinateur, panneau plein écran sur téléphone) avec bouton « ← Retour aux statistiques ».

Règles : **lecture seule**, **2 niveaux d'écran maximum**, aucun popup dans un popup. Le seul panneau superposé est le détail d'un pilier au niveau 1 (tiroir latéral desktop / feuille du bas mobile) ; au niveau 2 le détail d'un jour se déroule dans la liste.

## 2. Fichiers
| Fichier | Rôle |
|---|---|
| `BEMEXO Statistiques - maquette autonome.html` | Maquette autonome hors-ligne (ordinateur 1280 + téléphone 360, niveau 1, fiche, états vides). Ouvrir dans un navigateur. |
| `src/BEMEXO-Statistiques.dc.html` | Source du composant (template + logique JS lisible, générateur de données factices inclus). **C'est la référence pour les calculs et le comportement.** |
| `src/Planche.dc.html` | Planche de présentation qui instancie le composant 6 fois. |

**Les fichiers HTML sont des références de design**, pas du code à copier. Il faut recréer l'écran dans la stack existante de BEMEXO (composants, routage, client API). Fidélité : **haute** (couleurs, typo, espacements, interactions finaux).

## 3. Données factices — À REMPLACER
**Tous les chiffres, noms et dates de la maquette sont factices**, générés par `gen(e, d)` (pseudo-aléatoire déterministe) dans `src/BEMEXO-Statistiques.dc.html` :

| Élément factice | Où | Valeur maquette |
|---|---|---|
| Date « aujourd'hui » | constante `TODAY` | 16 oct. 2026 (fixe) |
| « DONNÉES AU 16 OCT. · 08:42 » | en-tête | texte en dur → horodatage de dernière synchro |
| Salariés (noms, initiales, métiers) | `FIRST`, `LAST`, `ROLES` | 5 / 12 / 60 générés |
| Taux horaires | `emps()` → `rate` | 18–31 €/h inventés |
| Chantiers | `CH` | 5 noms inventés |
| Heures, sup, absences, oublis par jour | `gen()` | probabilités arbitraires (absences plus fortes en août / fin déc.) |
| Créneaux matin / pause / après-midi | fiche, ligne dépliée | inventés à partir des heures du jour |
| Motifs d'absence | `TYP` | tirés au hasard |
| Avatar « EK » | en-tête | en dur → utilisateur connecté |
| Majoration sup ×1,25 dans le coût | `costOf()` | hypothèse, à aligner sur les règles de paie réelles (25 % / 50 %) |

Rien d'autre n'est réel. Tous les totaux affichés dérivent de ces données ; avec les vraies données, seuls les **calculs** ci-dessous comptent.

## 4. Modèle de données attendu (source)
Une ligne par **salarié × jour** (déjà présente dans le pointage BEMEXO) :

| Champ | Unité | Description |
|---|---|---|
| `heures_normales` | h (décimal, pas 0,25) | heures pointées dans le contrat |
| `heures_sup` | h | au-delà du contrat (sup 25 % + sup 50 % additionnées pour l'affichage) |
| `absence_heures` | h | 7 h = 1 jour ; avec `absence_motif` (Congé payé, Maladie, Intempérie, RTT…) |
| `oubli` | booléen | jour ouvré attendu sans aucun pointage reçu |
| `contrat_heures` | h | heures prévues ce jour (35 h/sem → 7 h lun–ven, 0 sam/dim) |
| `creneaux[]` | heure début / fin | pour le détail du jour |
| `pause` | min | |
| `chantier_id` | — | chantier du pointage (heures normales + sup) |
| `taux_horaire` (salarié) | €/h | **optionnel** ; absent → coût caché |

**Jours futurs** (après aujourd'hui) : exclus de tous les totaux, y compris le contrat.

## 5. Zone par zone : donnée → calcul → unité

Notations : *P* = période sélectionnée (semaine lun–dim / mois civil / année civile), *S* = périmètre (toute l'équipe au niveau 1, un seul salarié au niveau 2), *B* = un pilier (jour en vue Semaine, semaine ISO tronquée au mois en vue Mois, mois en vue Année). Arrondi d'affichage des heures : 0,5 h, format fr-FR (`1 234,5 h`).

### 5.1 En-tête de période
| Affichage | Calcul |
|---|---|
| « Semaine 42 » + « 12 – 18 OCT. 2026 » | n° ISO de la semaine + bornes lun–dim |
| « Octobre 2026 » + « 5 SEMAINES » | mois civil + nombre de semaines ISO qui le recoupent |
| « Année 2026 » | année civile |
| Bouton Aujourd'hui | grisé (opacité 0,4) quand on est déjà sur la période courante |

### 5.2 Tuiles de chiffres clés (niveaux 1 et 2)
| Tuile | Valeur | Unité | Sous-texte | Évolution |
|---|---|---|---|---|
| Heures totales | Σ(normales + sup) sur P, S | h | « sur Σcontrat h prévues · vs … préc. » | % vs période précédente ; hausse = vert |
| Heures sup. | Σ sup | h | « sup / (normales+sup) × 100 % des heures » | % ; hausse = rouge |
| Absences | Σ absence_heures / 7, arrondi 0,5 | j | « N salariés concernés » (salariés avec absence > 0) | écart absolu en j ; hausse = rouge |
| Oublis de pointage | nombre de jours avec `oubli` | j à relancer | « chez N salariés » / « Tout est à jour » | écart absolu en j ; hausse = rouge |
| Coût main-d'œuvre (dans la tuile 1) | Σ salarié (normales × taux + sup × taux × majoration) | € arrondi 10 € | — | **seulement si coût activé** |

**Période précédente comparable** : si la période affichée est la période en cours, on la compare à la période précédente **coupée au même point d'avancement** (semaine : jusqu'à J-7 ; mois : même jour du mois précédent ; année : même date N-1). Sinon, on compare à la période précédente complète. |Δ| < 0,5 → « = stable » (gris). Toujours une flèche ▲/▼ en plus de la couleur.

**Mini-courbe** : une valeur par pilier passé de la période (même métrique que la tuile), normalisée min–max.

### 5.3 Graphique en piliers
Par pilier *B* (périmètre *S*) :
- segment bas = Σ normales (dégradé bleu-violet)
- segment milieu = Σ absence_heures (rayures menthe)
- segment haut = Σ sup (dégradé orange-rose)
- **ligne pointillée** = Σ contrat_heures des jours passés de *B* (dessinée par pilier, en paliers)
- **point rouge + nombre** sous l'étiquette = nombre de jours d'oubli dans *B*
- Pilier futur = contour pointillé à la hauteur du contrat théorique, non cliquable
- Échelle Y : max(normales+absences+sup, contrat) × 1,08, arrondi à un pas « rond » (1, 2, 2,5, 5 ×10ⁿ) × 4 graduations
- Titre : « Σ(normales+sup) h travaillées · Σcontrat h prévues »
- Infobulle (survol, desktop uniquement) : Normales, Supplémentaires, Absences (h · j), Contrat, Oublis (si > 0), Total travaillé.

### 5.4 Classement par salarié (niveau 1)
- Une ligne par salarié, triée par Σ(normales+sup) décroissant ; rang affiché.
- Barre horizontale : normales / absences / sup, largeur relative au max (normales+absences+sup) de l'équipe.
- Total = normales + sup (h) ; « +X h sup » sous le total si sup > 0.
- État : `oublis > 0` → « N j en attente » (pastille rouge) ; sinon « À jour » (point menthe).
- Coût par salarié (colonne) : seulement si coût activé.
- 8 lignes affichées (5 sur mobile) + bouton « Voir les N salariés » ; recherche par nom (filtre en direct, sans limite). **Prévu pour 50–100 salariés.**

### 5.5 Anneau « Où vont les heures » (niveaux 1 et 2)
- Σ(normales + sup) par `chantier_id` sur P, S ; part en %.
- Centre : total d'heures. Légende triée décroissante : nom, heures, %.
- **Carte masquée** si aucune heure n'est rattachée à un chantier.

### 5.6 Panneau détail d'un pilier (niveau 1)
- Titre = libellé long du pilier (« Mardi 13 octobre », « Semaine 41 · 5–11 oct. », « Mars 2026 »).
- 4 mini-tuiles : Normales (h), Supplémentaires (h), Absences (j), Oublis (j). Coût estimé si activé.
- Liste des salariés du périmètre : oublis d'abord, puis heures décroissantes ; chantier principal (heures max) ; pastilles Absence / Oubli.

### 5.7 Fiche salarié (niveau 2)
- En-tête : retour, initiales, nom, métier, état (même règle que 5.4, sur la période).
- **Bandeau rouge** si oublis > 0 : « N jours à relancer » + dates (8 dernières max) + « Relancez <prénom> depuis « Pointage » ». Pas d'action directe : lecture seule.
- Tuiles + piliers + anneau = mêmes calculs avec S = {ce salarié} ; contrat = son contrat.
- **Liste jour par jour** (Semaine / Mois), du plus récent au plus ancien, jours futurs exclus, week-ends affichés seulement s'il y a quelque chose :
  - date, pastilles (normal / sup / absence / oubli), libellé (chantier, motif d'absence, ou « Oubli de pointage · à relancer » en rouge), heures (normales+sup), « +X h sup ».
  - clic → détail déroulé (accordéon, une ligne ouverte à la fois) : Matin, Pause, Après-midi, Chantier, Heures sup., Coût (si activé) ; pour une absence : Motif, Durée ; pour un oubli : Statut, Action, Chantier prévu.
- **Vue Année** : une ligne par mois ; détail = jours travaillés, heures sup, absences (dates), oublis (dates), chantier principal, coût.
- Clic sur un pilier : filtre la liste sur ce pilier (puce « … ✕ » pour retirer le filtre) et ouvre le jour correspondant en vue Semaine.

## 6. États à gérer
| État | Déclencheur | Rendu |
|---|---|---|
| **Chargement** | chaque changement de période / vue / écran | squelettes animés (4 tuiles, graphique, 4 lignes) ; puis montée des piliers |
| **Aucune donnée** | aucune heure, absence ou oubli sur P, S (ex. période future) | tuiles « — » + « Aucune donnée sur la période » ; carte « Aucun pointage sur cette période » + bouton « Revenir à aujourd'hui » ; classement, anneau et liste masqués |
| **Erreur** *(non maquetté)* | échec API | reprendre la carte « aucune donnée » : titre « Impossible de charger les statistiques », texte court, bouton « Réessayer » ; garder les tuiles en « — ». Ne jamais afficher de chiffres partiels. |
| **Coût caché** | aucun taux horaire renseigné / option désactivée | supprimer toute trace : ligne coût de la tuile 1, colonne COÛT du classement (et son en-tête), coût du panneau et de la fiche. **Aucun message.** Ne jamais afficher 0 €. Si seuls certains salariés ont un taux : à trancher (recommandé : afficher le coût uniquement pour eux et « — » pour les autres, total = somme connue avec la mention « partiel »). |
| Oublis = 0 | — | pas de bandeau, état « À jour », sous-texte « Tout est à jour » |
| Recherche sans résultat | — | « Aucun salarié ne correspond à « … » » |

## 7. Responsive
Point de rupture mesuré sur la largeur du conteneur :
- **< 720 px (téléphone, cible 360)** : marges 16 px, tuiles 2×2, graphique 220 px de haut, lignes de classement empilées, panneau = feuille du bas (max 84 % de hauteur, coins 22 px, poignée), pas d'infobulle (le toucher ouvre directement le détail). Cibles tactiles ≥ 44 px.
- **720–1079 px** : tuiles 2×2, classement et anneau empilés.
- **≥ 1080 px** : tuiles 4 colonnes, grille bas `1fr 380px`, tiroir latéral 440 px.
- Navigation de l'en-tête visible ≥ 900 px.

## 8. Variables de design

```css
:root{
  /* Cadre BEMEXO */
  --bx-ink:#15120F;          /* en-tête, texte, boutons actifs */
  --bx-cream:#F2EDE3;        /* fond page, texte sur sombre */
  --bx-paper:#FFFDF8;        /* tuiles, carte liste */
  --bx-line:#E3DACB;         /* bordures tuiles */
  --bx-line-2:#D6CBB7;       /* bordures boutons, pointillés */
  --bx-seg-bg:#E6DDCD;       /* fond sélecteur Semaine/Mois/Année */
  --bx-muted:#5B534A;        /* texte secondaire sur clair */
  --bx-amber:#FFC21A;        /* accent, sélection, aujourd'hui */
  --bx-card-dark:#1B1713;    /* cartes graphiques */
  --bx-muted-dark:rgba(242,237,227,.62);

  /* Sémantique des données (identique partout) */
  --bx-normal:linear-gradient(180deg,#6C8DFF,#7B4DFF);
  --bx-sup:linear-gradient(180deg,#FFB547,#FF4F8B);
  --bx-abs:repeating-linear-gradient(135deg,#3DDCB0 0 4px,rgba(61,220,176,.28) 4px 8px);   /* sur sombre */
  --bx-abs-light:repeating-linear-gradient(135deg,#12A67F 0 2px,rgba(18,166,127,.3) 2px 4px); /* sur clair */
  --bx-oubli:#FF3B3B;        /* sur sombre ; #E53935 sur clair */
  --bx-contrat:rgba(242,237,227,.75); /* pointillé 2px */
  --bx-spark-total:#5B5BFF; --bx-spark-sup:#E0306F; --bx-spark-abs:#12A67F; --bx-spark-oubli:#E53935;

  /* Évolutions & états */
  --bx-good:#1B7F47; --bx-bad:#B3261E; --bx-neutral:#5B534A;
  --bx-alert-bg:#FCE4E1; --bx-alert-border:#E53935; --bx-alert-ink:#8E1B14;
  --bx-ok-bg:#E2F3EA; --bx-ok-ink:#14613A;
  --bx-sup-ink-light:#C2185B; --bx-sup-ink-dark:#FF9FBF;

  /* Chantiers (anneau) — palette ambre, distincte des couleurs d'heures */
  --bx-ch-1:#FFC21A; --bx-ch-2:#FFE9A8; --bx-ch-3:#D98E04; --bx-ch-4:#E9E3D7; --bx-ch-5:#8C7A5E;

  /* Typo */
  --bx-font:'Archivo',system-ui,sans-serif;            /* 400–900 */
  --bx-mono:'JetBrains Mono',ui-monospace,monospace;   /* étiquettes, 400/700 */
  --bx-h1:52px;  --bx-h1-m:34px;     /* 900, -0.035em */
  --bx-name:44px; --bx-name-m:28px;  /* fiche, 900 */
  --bx-kpi:40px; --bx-kpi-m:28px;    /* 900, -0.035em */
  --bx-card-title:22px; --bx-card-title-m:18px; /* 800 */
  --bx-body:14px; --bx-small:12.5px;
  --bx-label:10.5px;                  /* mono, MAJUSCULES, letter-spacing .14–.18em */

  /* Formes */
  --bx-r-card:22px; --bx-r-tile:18px; --bx-r-row:14px; --bx-r-pill:999px;
  --bx-r-pillar:10px 10px 4px 4px;
  --bx-shadow-tip:0 20px 44px rgba(0,0,0,.5);
  --bx-shadow-panel:0 0 60px rgba(0,0,0,.35);
  --bx-pad-card:28px; --bx-pad-card-m:18px;

  /* Animations */
  --bx-ease:cubic-bezier(.2,.8,.2,1);
  --bx-pillar-rise:800ms;     /* hauteur 0 → valeur, décalage 45ms × index */
  --bx-pillar-stagger:45ms;
  --bx-hover:200ms;           /* opacité autres piliers 0.38, contour ambre 2px + halo violet */
  --bx-panel:350ms;           /* translateX(105%)→0 desktop, translateY(105%)→0 mobile */
  --bx-backdrop:300ms;        /* rgba(21,18,15,.5) */
  --bx-bar:600ms;             /* barres du classement */
  --bx-skeleton:1.2s linear infinite; /* shimmer background-position */
  --bx-load-delay:480ms;      /* durée simulée du squelette dans la maquette */
}
```
Polices : Google Fonts `Archivo` + `JetBrains Mono` (déjà utilisées par BEMEXO). Aucune image ni icône externe ; les flèches et ✕ sont des caractères texte. Graphiques en CSS pur (flex + dégradés + `conic-gradient` pour l'anneau, SVG pour les mini-courbes). Aucune bibliothèque de graphiques.

## 9. Accessibilité
- La couleur n'est jamais seule : rayures pour les absences, point + nombre pour les oublis, légende partout, flèches ▲/▼ sur les évolutions, textes « À jour » / « N j en attente ».
- Contraste texte ≥ 4,5:1 (texte secondaire sombre : `rgba(242,237,227,.62)` sur `#1B1713`).
- Piliers et lignes : éléments `button` focusables avec `aria-label` récapitulatif (à ajouter en prod) ; `Échap` ferme le panneau ; respecter `prefers-reduced-motion` (supprimer montée et shimmer).

## 10. État applicatif
`vue` (semaine|mois|annee) · `offset` (0 = période courante) · `salarieId` (null = niveau 1) · `piliersurvolé` · `pilierOuvert` (niveau 1) · `pilierFiltre` + `jourOuvert` (niveau 2) · `recherche` · `afficherTous` · `chargement`. Changer de vue, de période ou d'écran remet à zéro le panneau, le filtre et le jour ouvert, puis relance chargement → montée des piliers. La fiche garde la vue et la période de la page.

API suggérée : `GET /stats?vue=&debut=&fin=&salarie=` → buckets (par pilier) + totaux par salarié + totaux par chantier + mêmes totaux pour la période précédente comparable + `cout_active: bool`.
