# BEMEXO — Storyboard de la vidéo de présentation

> Statut : **à valider**. Aucun rendu final ne sera lancé avant validation.

| | |
|---|---|
| **Durée** | ≈ 2 min 00 |
| **Format** | 16:9 · 1920×1080 · 30 i/s · MP4 H.264 |
| **Message final** | BEMEXO — Du chantier à la paie, sans ressaisie. |
| **Source** | Le vrai code BEMEXO (branche `main`, étape 29), lancé en local |
| **Données** | 100 % fictives. Supabase remplacé par un faux serveur local. Zéro accès à la prod, zéro e-mail, zéro push, zéro Stripe. |

---

## 1. Fil rouge

Une heure de travail qui voyage **du chantier à la paie** :

`PLANIFIER → POINTER → PROUVER → CONTRÔLER → PILOTER → PAYER`

Une entreprise fictive : **Delorme Rénovation** (8 salariés, 6 chantiers).

| Rôle | Personne fictive |
|---|---|
| Bureau | Sophie Durand |
| Salarié principal | Karim Benali |
| Chef d'équipe | Julien Morel |
| Autres | Lucas Martin, Sofia Rossi, Mehdi Haddad, Inès Garcia, Thomas Petit |

| Chantier | Ville |
|---|---|
| Villa Martin | Annecy |
| Résidence Les Cèdres | Seynod |
| Restaurant Le Central | Annecy |
| Maison Dubois | Argonay |
| École Jules-Ferry | Cran-Gevrier |
| Cabinet Lefèvre | Annecy-le-Vieux |

Horloge figée par scène : **jeudi 24 septembre 2026** (semaine S-39, 21–27 sept.), puis **mercredi 30 septembre 2026** pour la paie.

---

## 2. Identité visuelle

| Élément | Valeur (tirée du code) |
|---|---|
| Noir | `#15120F` |
| Jaune chantier | `#FFC21A` |
| Crème | `#F2EDE3` |
| Vert « envoyé » | `#2FA36B` / `#1F7A4D` |
| Rouge « à envoyer » | `#C0461F` |
| Titres | Archivo 900 |
| Chiffres, surtitres | JetBrains Mono |
| Logo | `public/bemexo-wordmark-*.svg` + le X (`favicon.svg`) |
| Motif | Ruban hachuré jaune/noir à 45° (repris de la page de connexion et de la carte « Total ») |

**Textes animés**

- Surtitre en haut à gauche, JetBrains Mono jaune : `03 · PROUVER`
- Titre en bas, Archivo 900 crème sur pastille noire, mot-clé surligné jaune
- Entrée : glissement vers le haut + fondu (12 images) · Sortie : fondu (8 images)

**Transitions**

- Entre chapitres : balayage du ruban hachuré jaune/noir (0,4 s)
- Bureau ↔ téléphone : le téléphone glisse depuis la droite, le bureau recule et s'assombrit
- Dans une scène : zoom doux (courbe ease-in-out), curseur dessiné, clic = onde jaune
- Sur le téléphone : tap = cercle jaune

**Captures**

- Bureau : fenêtre 1600×900, densité ×2 → zooms jusqu'à ×2 sans flou
- Téléphone : 390×844, densité ×3, dans un cadre de téléphone générique, sur fond crème avec un grand X en filigrane

---

## 3. Storyboard scène par scène

### Scène 0 — Intro · 0:00 → 0:09 (9 s)

| Temps | Image | Texte à l'écran |
|---|---|---|
| 0:00 | Fond noir. Le ruban hachuré traverse l'écran en diagonale. | — |
| 0:01 | Le X du logo se dessine : trait crème, puis trait jaune. Le mot BEMEXO se révèle. | `POINTAGE · PLANNING · PAIE — BTP` |
| 0:04 | Trois étiquettes mono apparaissent puis se barrent une à une. | `FEUILLES PAPIER` · `SMS` · `RESSAISIE` |
| 0:06 | Les étiquettes s'effacent. | **Une seule saisie. Tout suit.** |

Transition : ruban hachuré → bureau.

---

### Scène 1 — PLANIFIER (bureau) · 0:09 → 0:24 (15 s)

| Temps | Écran réel | Action / zoom | Texte |
|---|---|---|---|
| 0:09 | `/admin` — planning semaine S-39, colonne jeudi 24 surlignée | Plan large, lente poussée ×1,0 → ×1,1 | `01 · PLANIFIER` — **Toute l'équipe, toute la semaine, sur un seul écran.** |
| 0:13 | Cockpit noir : `8 salariés · 212 h pointées · 3 en attente · 46 pièces · 4 en direct` | Zoom ×1,8 sur le cockpit | **Les chiffres clés, en direct.** |
| 0:16 | Menu « Clients » ouvert → on attrape « Villa Martin » → case vendredi de Lucas en jaune « ↓ DÉPOSER ICI » | Zoom ×1,5 qui suit le curseur | **Glissez. Déposez. C'est planifié.** |
| 0:20 | Toast « Villa Martin ajouté au planning » | Retour ×1,2 | — |
| 0:22 | Ligne d'Inès hachurée 🌴 CONGÉ, ligne de Mehdi 🌧️ INTEMPÉRIE | Panoramique court | **Congés, maladie, intempéries : visibles d'un coup d'œil.** |

Transition : le téléphone glisse depuis la droite.

---

### Scène 2 — POINTER (terrain) · 0:24 → 0:46 (22 s)

| Temps | Écran réel (`/poseur`, Karim) | Action / zoom | Texte (à gauche du téléphone) |
|---|---|---|---|
| 0:24 | « Ma journée » : en-tête noir « Jeudi 24 Septembre », carte pointillée « Prévu · 08:00–12:00 — Villa Martin » | Téléphone centré | `02 · POINTER` — **Le planning est déjà dans sa poche.** |
| 0:27 | Carte « Pointer en direct » : choix du chantier, tap « Je commence » | Tap jaune, toast « Pointage démarré » | **Un geste pour commencer.** |
| 0:30 | Carte verte « Pointage en cours · Commencé à 07:30 », compteur `3:12:45` qui défile | Zoom ×2 sur le compteur | — |
| 0:33 | Phrase sous le bouton : « Ton entreprise note l'endroit au départ et à la fin du pointage — rien entre les deux, et tu peux refuser. » | Zoom ×2 sur la phrase | **Géolocalisation : 2 points, départ et fin. En option.** |
| 0:36 | Écran partagé : le cockpit du bureau affiche « ● 5 en direct » | Split 50/50, 2 s | **Le bureau voit qui pointe.** |
| 0:38 | Tap « J'ai fini » → toast « Pointage fermé — 07:30 à 12:00 » | Tap | **Un geste pour finir.** |
| 0:40 | Saut à 16:45 (surtitre `16:45`). Deux chantiers. Entre les deux : « 0:45 entre 12:00 et 12:45 — c'était quoi ? » → tap « Route » | Zoom ×1,6 sur la question | **Route ou pause ? Il répond d'un tap.** |
| 0:43 | Interrupteur « Panier repas » → la tuile « Panier ✓ » passe au jaune. Carte noire « Total aujourd'hui » (heures, chantiers, route, panier) | Zoom sur la carte noire | **Pauses, route, panier : calculés tout seuls.** |

---

### Scène 3 — PROUVER (terrain) · 0:46 → 1:02 (16 s)

| Temps | Écran réel | Action / zoom | Texte |
|---|---|---|---|
| 0:46 | Éditeur d'intervention, section « 3 · Statut du chantier » → tap « Avec réserve » | Tap, le bouton passe au rouge | `03 · PROUVER` — **Une réserve ? Il la signale sur place.** |
| 0:49 | « Détail des réserves » : « Joint silicone manquant fenêtre salon » | Frappe animée | — |
| 0:51 | « Documents » → « Photo » → la liste affiche « Photo 3 — 24/09/2026 » avec vignette, auteur, heure | Zoom ×1,5 sur la liste | **Photos rangées par chantier et par jour.** |
| 0:54 | Bandeau rouge « Hors-ligne, tout est gardé · 2 en attente », carte « ● Sur le téléphone » | Icône réseau barrée en surimpression | **Pas de réseau ? Rien n'est perdu.** |
| 0:57 | Réseau revenu → toast « 2 chantiers envoyés » | — | — |
| 0:59 | Tap « Envoyer ma journée → » → bouton vert « Journée envoyée ✓ », pastilles « ✓ Envoyé » | Zoom sur le bas de l'écran | **Journée envoyée. Rien à ressaisir.** |

Transition : le téléphone sort à droite, le bureau revient.

---

### Scène 4 — CONTRÔLER (bureau) · 1:02 → 1:20 (18 s)

| Temps | Écran réel | Action / zoom | Texte |
|---|---|---|---|
| 1:02 | Planning, case de Karim jeudi : la bulle pointillée « prévu » devient noire « ✓ 07:30–12:00 · 4h30 » | Zoom ×2 sur la case, fondu avant/après | `04 · CONTRÔLER` — **Au bureau, tout arrive déjà rempli.** |
| 1:05 | Clic sur la bulle : « Heures déclarées : 07:30–12:00 · 4h30 réelles », « Réception avec réserve — à traiter », « Voir les photos / documents » | Zoom ×1,6 sur la fenêtre | **Prévu, réel, réserve, photos : tout au même endroit.** |
| 1:09 | Fiche de Karim, « Feuille d'heures » → « Cette semaine » : total `41h30`, pastille orange `+6h30 sup.`, ligne « Départ 07:32 · 45.899, 6.129 · ± 12 m » | Zoom sur le total puis sur la ligne de position | **Heures sup calculées à la semaine.** |
| 1:13 | « Corriger les heures » : fin 17:00 → 16:30, « était 8h00–17h00 » → « Corriger et prévenir » → toast « Heures corrigées — le salarié est prévenu » | Zoom ×1,6 | **Une correction ? Tracée, et le salarié est prévenu.** |
| 1:17 | Téléphone de Karim en incrustation : pastille « Le bureau a corrigé : 8h00–17h00 → 8h00–16h30 » | Téléphone en bas à droite | — |

---

### Scène 5 — PILOTER (bureau) · 1:20 → 1:31 (11 s)

| Temps | Écran réel | Action / zoom | Texte |
|---|---|---|---|
| 1:20 | Bouton « Réserves » (pastille rouge « 2 ») → registre « À traiter » → « Lever la réserve » → « Confirmer la levée » → toast « Réserve levée » | Zoom ×1,6 | `05 · PILOTER` — **Chaque réserve suivie jusqu'à sa levée.** |
| 1:24 | « Coût chantiers » : cartes « Main d'œuvre · Dépenses · Total » (Total en jaune), barres de budget verte / jaune / rouge | Zoom ×1,7 | **Le vrai coût de chaque chantier.** |
| 1:28 | Dépli d'un chantier : détail par salarié, « dont 1 h 20 de route », dépense « Matériaux · 640 € » | — | **Budget suivi, alerte e-mail à 70, 80 et 100 %.** |

Transition : ruban hachuré + surtitre `30 SEPTEMBRE — FIN DU MOIS`.

---

### Scène 6 — PAYER (bureau → téléphone) · 1:31 → 1:48 (17 s)

| Temps | Écran réel | Action / zoom | Texte |
|---|---|---|---|
| 1:31 | « Exporter ▾ » → « Exporter l'équipe » → « Créneau » : 1 sept. → 30 sept. 2026 | Zoom ×1,8 sur la fenêtre | `06 · PAYER` — **La paie du mois, en un clic.** |
| 1:35 | Boutons « Excel · PDF · CSV pour la paie · Envoyer à compta@cabinet-demo.fr » → clic « CSV pour la paie » → toast « CSV de paie téléchargé — 186 saisies verrouillées » | Onde de clic | **Excel, PDF ou CSV de paie.** |
| 1:37 | Le vrai CSV généré par BEMEXO, affiché en tableau : Matricule `00042`, Heures normales `35,00`, Heures sup 25% `4,50`, Heures sup 50% `0,00`, Dont route payee `1,33` | Défilement lent | **Prêt à importer : Silae, Sage, Cegid…** |
| 1:41 | Retour sur la fenêtre, le bouton « Envoyer à compta@cabinet-demo.fr » s'allume (survol) | Zoom ×2 sur le bouton | **Ou l'Excel, envoyé direct au comptable.** |
| 1:43 | « Clôture du mois » → « Clôturer Septembre 2026 ? » → toast « septembre 2026 clôturé » → « Septembre 2026 · Clos » | Zoom ×1,6 | **Mois clôturé, heures verrouillées.** |
| 1:46 | Téléphone de Karim : ses cartes passent en vert plein « ✓ Chez le comptable » | Téléphone glisse depuis la droite | **Et le salarié le sait.** |

---

### Scène 7 — ET AUSSI… · 1:48 → 1:54 (6 s)

Quatre vignettes rapides (1,5 s chacune), vrais écrans :

| Vignette | Écran réel | Texte |
|---|---|---|
| 1 | Téléphone du chef d'équipe : carte « Mon équipe aujourd'hui » | **Chef d'équipe** |
| 2 | « Mes congés » → demande « En attente », puis la ligne 🌴 sur le planning | **Congés** |
| 3 | Fiche salarié : « CACES — expire dans 6 j » en rouge | **Habilitations** |
| 4 | Import Excel : « Import terminé » | **Import Excel** |

---

### Scène 8 — Conclusion · 1:54 → 2:02 (8 s)

| Temps | Image | Texte |
|---|---|---|
| 1:54 | Mosaïque éclair des 6 chapitres, puis balayage du ruban | `PLANIFIER · POINTER · PROUVER · CONTRÔLER · PILOTER · PAYER` |
| 1:56 | Fond noir, logo BEMEXO (X jaune) | **BEMEXO — Du chantier à la paie, sans ressaisie.** |
| 1:59 | Sous le logo | `bemexo.com` · Essai gratuit 30 jours, sans engagement |

---

## 4. Ce que la vidéo ne montrera PAS (n'existe pas dans le code)

| Tentation | Réalité |
|---|---|
| Carte GPS, épingle, suivi en continu | Seulement 2 points (départ / fin), en texte, option désactivée par défaut |
| Bouton « Valider » ligne par ligne | Cette étape n'existe plus. Le cycle réel : À envoyer → Envoyé → corrigé si besoin → verrouillé à l'export → mois clôturé |
| Intégration directe Silae / Sage / Cegid | C'est un CSV à importer (format prévu pour eux) |
| Export du coût chantier ou des réserves | Écrans uniquement, sans export |
| Galerie photo en grille | Liste avec vignettes |
| Chrono qui défile côté bureau | Le bureau voit un compteur « en direct », pas le chrono |
| CSV envoyé au comptable | « Envoyer au comptable » joint l'Excel. Le CSV se télécharge. |
| Appli qui s'ouvre sans réseau | L'appli déjà ouverte garde les saisies hors réseau et les envoie au retour du réseau |
| Dupliquer une semaine côté bureau | Seul le salarié peut « Dupliquer cette journée » |

---

## 5. Points techniques

- **Données** : faux serveur local qui répond à la place de Supabase (planning, heures, photos, positions, réserves, coûts). Aucune écriture possible vers la vraie base : l'app pointe vers une adresse inexistante et tout le trafic externe est bloqué.
- **Photos de chantier** : images libres de droits ou générées, jamais de vraies photos clients.
- **Notification de correction** (scène 4) : le texte à l'écran est la vraie phrase de BEMEXO, mais la bannière du téléphone est une maquette (une vraie notification push ne se filme pas).
- **CSV** (scène 6) : fichier réellement produit par le code d'export de BEMEXO, affiché dans un tableau propre (pas une capture d'Excel).
- **Son** : pas de voix off. Pas de musique par défaut (aucune piste libre de droits fournie). Une piste peut être ajoutée au montage.
- **Livrables** : `bemexo-presentation-16x9.mp4` (1080p). Version 9:16 possible ensuite.

## 6. Fonctions réelles non retenues (peuvent remplacer une scène)

Relance automatique des heures · rappel manuel (cloche) · « Autre chantier » nommé par le salarié · « Copier la journée d'hier » · « J'ai corrigé sur place » · contrôle avant envoi (> 10 h, chevauchement) · réglage des taux 25 % / 50 % · plusieurs accès bureau · récap hebdo par e-mail · alertes d'expiration par e-mail · installation sur l'écran d'accueil (PWA) · planning bureau sur téléphone.

---

## 7. Version produite — écarts avec le storyboard

La vidéo finale (`bemexo-presentation-16x9.mp4`, ≈ 2 min 10) suit ce storyboard.
Quelques ajustements ont été faits, dictés par le vrai comportement de l'app :

| Point | Storyboard | Vidéo finale | Pourquoi |
|---|---|---|---|
| Phrase de géolocalisation | Après le démarrage | Avant « Je commence » | L'app ne l'affiche que sur la carte de départ, avant la collecte |
| Hors-ligne, route et panier | Scène 3 | Fin de scène 2 (16:30, au sous-sol) | Enchaînement plus naturel : l'après-midi est saisi hors réseau, puis la route et le panier |
| Chiffres de la fiche | 41h30, +6h30 sup | 35h30, +1h15 sup (jeudi soir) | Chiffres réellement calculés par l'app sur les données fictives |
| Correction | 8h00–17h00 → 8h00–16h30 | 12h45–16h30 → 12h45–16h00 | Correction faite en direct sur le chantier de l'après-midi |
| Envoi au comptable | Clic | Bouton mis en avant (survol) | Le CSV de paie est téléchargé à l'image. L'Excel part au comptable via le même écran. |
| « Et aussi » | Import Excel | Import Excel des clients | L'import des salariés envoie de vraies invitations : il n'est pas filmé |
| Conclusion | — | Ajout discret : « Données de démonstration fictives » | Honnêteté sur la démo |

### Défaut réel repéré pendant le tournage

Sur un téléphone de 390 px de large, dans « Documents », une photo rattachée à
« cette intervention » fait déborder la ligne (`.bt-doc-sub`). La fenêtre se
coupe alors à droite. À l'image, le cadrage rapproché le masque. L'app n'a pas
été modifiée pour la vidéo.
