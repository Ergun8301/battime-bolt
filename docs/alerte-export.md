# Lot 18 — Alerte avant l'export d'équipe qui verrouille les heures

## Ce que ça change pour le bureau

Avant, exporter les heures de l'**équipe** (Excel, PDF, CSV, ou « Envoyer au comptable ») verrouillait les heures exportées **sans le dire** : les salariés ne pouvaient plus les modifier, et le bureau ne le savait pas toujours.

Maintenant, au clic sur le format, une alerte s'ouvre **avant** tout fichier :

> **Verrouiller les heures exportées ?**
> Cet export va verrouiller **42 lignes d'heures de 6 salariés** (période du 01/10/2026 au 31/10/2026). Ils ne pourront plus les modifier.
> 3 autres lignes de la période sont déjà verrouillées : elles le restent.

Trois choix :

| Bouton | Ce qui se passe |
|---|---|
| **Exporter et verrouiller** | Exactement l'export d'avant : le même fichier, puis le verrou. |
| **Exporter sans verrouiller** | Export de contrôle : le même fichier, **rien n'est écrit** (ni verrou, ni date d'export). Fichier Excel, PDF ou CSV seulement. |
| **Annuler** | Rien ne part, rien n'est écrit. Le focus revient sur « Exporter ». |

Les chiffres sont **exacts** : ce sont les lignes que l'export va réellement verrouiller (les heures envoyées ou validées de la période, pas les brouillons, pas les interventions retirées). Une ligne déjà verrouillée n'est pas comptée dans « N » : elle est signalée à part.

## Les cas particuliers

- **Rien à verrouiller** (aucune heure, ou tout est déjà verrouillé) : pas d'alerte, l'export part tout de suite, comme avant.
- **« Envoyer au comptable »** : l'alerte propose seulement « Envoyer et verrouiller » et « Annuler ». Pas de « sans verrouiller » : l'envoi part par e-mail et écrit lui-même dans le journal d'envoi, ce n'est pas un contrôle.
- **Mode support (lecture seule)** : pas d'alerte, pas de comptage. Le fichier sort, rien n'est verrouillé (la base le refuse de toute façon) et le message le dit : « Export téléchargé — rien n'a été verrouillé ». L'écriture est de toute façon refusée par la base ; avant, le message annonçait pourtant « N saisies verrouillées ».
- **Les chiffres ont bougé** pendant que l'alerte était ouverte (un salarié a envoyé ses heures) : au clic sur « Exporter et verrouiller », rien n'est exporté ni verrouillé, l'alerte reste et montre les chiffres à jour avec une phrase qui explique pourquoi. Un deuxième clic confirme les nouveaux chiffres.
- **Comptage impossible** (réseau) : « Impossible de vérifier les heures qui seraient verrouillées. Rien n'a été exporté ni verrouillé. Réessayez. » On ne verrouille jamais à l'aveugle.
- **Plus de 1000 lignes** : le comptage est paginé, le chiffre reste exact.
- **Export d'un seul salarié** (fiche salarié) : il **ne verrouille rien** (déjà le cas, c'est écrit dans l'écran). Il n'y a donc pas d'alerte.
- **Message final** : « Export téléchargé — 42 saisies verrouillées » reprend le chiffre de l'alerte. Si tout était déjà verrouillé, le message est celui d'avant.

## Comment tester sur téléphone (390 px)

1. Dans le bureau, menu ☰ → **Exporter**, choisissez « Cette semaine » (il faut des heures **envoyées** non verrouillées sur la période).
2. **Exporter ▾** → Excel (ou PDF, ou CSV) : l'alerte s'ouvre avec les chiffres. Rien n'est téléchargé.
3. Touchez **Annuler** : rien ne se passe. Le focus revient sur « Exporter ▾ ».
4. Recommencez et touchez **Exporter sans verrouiller** : le fichier se télécharge, le message dit « rien n'a été verrouillé ». Ouvrez la fiche d'un salarié : ses heures restent modifiables.
5. Recommencez et touchez **Exporter et verrouiller** : même fichier, puis « N saisies verrouillées ». Ouvrez maintenant l'écran du salarié : il ne peut plus modifier ces heures.
6. Avec une adresse de comptable dans les Réglages : « Envoyer à… » ouvre une alerte à deux choix.

Les trois boutons font 44 px de haut, tiennent dans l'écran sans défilement horizontal, le focus reste dans la fenêtre (Tab / Maj+Tab), **Échap** annule, et le premier focus est sur « Annuler ».

## Ce qui n'a pas changé

- Le fichier est identique, octet pour octet, avec ou sans verrou (test automatique).
- Le verrou est toujours posé **après** le fichier, par lots de 200 lignes, sur les lignes du fichier (comme avant, y compris celles qui étaient déjà verrouillées : leur date d'export est remise à jour).
- Aucune migration, aucune fonction edge, aucune suppression. Le lot ne touche pas à l'IA.
- Poids : `/admin` passe de 353 à 354 kB (budget 363). L'alerte est un fichier à part (2,7 kB compressé), chargé à l'ouverture de « Exporter l'équipe », jamais au chargement de la page. Elle n'importe ni Excel ni jsPDF (chargés par le menu « Exporter ▾ », lot 5).
- Aucune lecture de plus au chargement (lot 29) : le comptage se fait **au clic**.

## Limites

- Le comptage est lu au clic et relu au moment d'exporter : si les chiffres ont bougé, on remontre l'alerte. Entre ces deux instants il n'y a pas de verrou en base ; c'est la relecture qui garantit l'exactitude.
- « Exporter sans verrouiller » ne verrouille rien : si le bureau l'utilise pour la paie, rien n'empêche les salariés de modifier leurs heures ensuite. C'est voulu (export de contrôle).
- Une alerte n'est pas un droit d'accès : c'est la base (règle `time_entries_worker_update`, `locked = false`) qui empêche le salarié de modifier une ligne verrouillée. Ce lot ne la change pas.
- Les textes du guide pas à pas (« cela verrouille les heures ») restent vrais ; je ne les ai pas modifiés.
- Non testé sur un vrai iPhone / Android : les captures et les tests viennent d'un navigateur à 390 px.

## Pour les développeurs

| Fichier | Rôle |
|---|---|
| `lib/export-verrou.ts` | Règles pures (comptes N / M, quand alerter, phrases, message final). Testées sous Deno. |
| `lib/export-lignes.ts` | Le filtre UNIQUE des heures exportées (`lignesExportees`), partagé par le fichier, le verrou et l'alerte ; `lireCompteVerrou` (lecture paginée au clic). |
| `components/export-verrou-dialog.tsx` | L'alerte (`AlertDialog`), chargée à l'ouverture (`lazyWindow`). |
| `components/admin-planning.tsx` | `demanderExport` (compte, décide), `choisirVerrou` (les choix), `runExport(kind, { verrouiller, annonce })`. |

Tests :
- `npm run test:export-alerte-regles` (Deno) : comptes, phrases, et garde-fous du source (un seul endroit écrit `locked: true`, après le fichier, seulement si on le demande ; même filtre pour l'alerte et le verrou ; l'alerte n'importe ni Excel ni PDF ; la fiche salarié ne verrouille rien).
- `npm run test:export-alerte-ecrans` (après `npm run build`) : 77 contrôles dans un vrai navigateur à 1280 et 390 px, base simulée qui applique les écritures.

Tests existants adaptés (ils cliquent un format d'équipe et attendaient le fichier tout de suite) : `export-lot11`, `panier-lot3bis`, `site-rapide-lot5`, `statistiques-lot5`. Ils **confirment l'alerte** (« Exporter et verrouiller » = le comportement d'avant) ; leurs assertions ne changent pas.

Captures : `docs/captures-alerte-export/` (390 px).
