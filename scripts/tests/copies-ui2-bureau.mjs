// Rejeu des scripts navigateur du BUREAU en /admin?ui=2 (design bureau, lot 2 « Heures et paie »).
//   node scripts/tests/copies-ui2-bureau.mjs                 écrit scripts/tests/ui2b-<nom>.mjs pour chaque script de la liste
//   node scripts/tests/copies-ui2-bureau.mjs export-lot11    n'en écrit qu'un
//   node scripts/tests/ui2b-export-lot11.mjs out <dossier-de-captures-hors-dépôt> <port>
// Les ORIGINAUX ne sont jamais modifiés. La copie est l'original mot pour mot, plus (1) chaque navigation `goto(.../admin)` devient `/admin?ui=2` (le drapeau
// est mémorisé pour la session de l'onglet, sur un hôte d'aperçu ou en local seulement) et (2) la table ADAPTATIONS ci-dessous : chaque ligne dit CE QUI CHANGE à l'écran
// avec ?ui=2 et ce que la copie attend à la place. Une adaptation ne cache jamais une fonction qui disparaît : elle suit un libellé, un repère ou un geste
// dont la FORME change (un menu devient trois pastilles, une fenêtre devient une page…). Sans le drapeau, les originaux tournent tels quels.
// Les copies `ui2b-*.mjs` sont ignorées par git : on les régénère, la table fait foi.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));

/** nom → liste de [ancien texte (chaîne ou RegExp), nouveau texte, raison]. */
export const ADAPTATIONS = {
  'bureau-lot2': [
    ["const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\\s+/g, ' ');\n",
      "const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\\s+/g, ' ');\n// v2 : l'HISTORIQUE d'une ligne et la mention « Changé après renvoi » se lisent dans la FICHE DE LA LIGNE (on clique la ligne) ; la ligne du tableau garde l'état, les étiquettes et les chiffres.\nconst detailTxt = async (c) => { await c.click(); const d = op.locator('[data-testid=fiche-ligne-detail]'); await d.waitFor(); const t = await txt(d); const rows = await d.locator('[data-testid=edit-row]').allInnerTexts(); const after = await d.locator('[data-testid=after-return]').allInnerTexts(); const frozen = await d.locator('[data-testid=return-frozen]').allInnerTexts(); await op.keyboard.press('Escape'); await op.waitForTimeout(350); return { t, rows, after, frozen }; };\n",
      'HP03 : l’historique (corrections, renvoi, motif) est dans la fiche de la ligne, plus sous la ligne ; cette fonction ouvre la fiche, lit son texte et ses lignes d’historique, la referme'],
    ["txt.includes('Corriger les heures de cette journée')", "txt.includes('Corriger')", 'HP04 : le titre de la fenêtre de correction est le client ; « CORRIGER · SALARIÉ · jour » est son petit mot (le titre « Corriger les heures de cette journée » du panneau d’avant n’existe plus)'],
    ["(await panel.innerText()).includes('Corriger cette journée')", "(await panel.innerText()).includes('Corriger')", 'idem'],
    ["await panel.locator('[data-testid=correct-submit]').isDisabled() && await panel.locator('[data-testid=correct-return]').isDisabled(),", "await panel.locator('[data-testid=correct-submit]').isDisabled(),",
      'HP08 : « Renvoyer au salarié » n’est plus dans la fenêtre de correction : il est dans la fiche de la ligne et ouvre SA fenêtre (son motif, son bouton « Renvoyer » inactif tant que le motif est trop court) ; ici on ne contrôle que « Corriger et prévenir »'],
    ["const rows = await c2.locator('[data-testid=edit-row]').allInnerTexts();", "const rows = (await detailTxt(c2)).rows;", 'HP03 : lecture de l’historique dans la fiche de la ligne'],
    ["/« pause oubliée »/.test(rows[0]) && /par vous/.test(rows[0])", "/Motif : pause oubliée/.test(rows[0]) && /vous/.test(rows[0])", 'HP03 : la ligne d’historique dit « Motif : pause oubliée. » et « jj/mm hh:mm · vous » (même contenu, autre phrase)'],
    ["check(/pause 30 min/.test(await txt(c2)), 'A2 la ligne affiche « pause 30 min »');", "check(/0:30/.test(await txt(c2)), 'A2 la ligne affiche la pause 0:30');", 'HP01 : la pause est une colonne du tableau, en h:mm (« 0:30 »)'],
    ["const amber = (await c2.locator('.border-amber-200').allInnerTexts()).map((x) => x.replace(/\\s+/g, ' '));", "const amber = (await detailTxt(c2)).rows.map((x) => x.replace(/\\s+/g, ' '));", 'HP03 : l’historique de la ligne se lit dans sa fiche'],
    ["amber.filter((x) => /8h00–17h00 → 8h00–16h30/.test(x)).length === 1 && /parti plus tôt/.test(amber[1])", "amber.filter((x) => /8h00–17h00 → 8h00–16h30/.test(x)).length === 1 && /Motif : parti plus tôt/.test(amber[1])", 'HP03 : le motif se lit « Motif : parti plus tôt. » (le changement garde sa phrase « 8h00–17h00 → 8h00–16h30 »)'],
    ["const ma = await txt(card('Salle')); const ap = await txt(card('Atelier'));", "const mad = await detailTxt(card('Salle')); const apd = await detailTxt(card('Atelier')); const ma = (await txt(card('Salle'))) + ' ' + mad.t; const ap = (await txt(card('Atelier'))) + ' ' + apd.t;", 'HP01 / HP03 : texte de la ligne (tableau) + texte de sa fiche (historique)'],
    ["/08:00–12:00 Lyon panier/.test(ma) && /Panier ajouté — « panier pris le midi »/.test(ma)", "/08:00–12:00 4:00 Oui/.test(ma) && /Panier ajouté/.test(ma) && /Motif : panier pris le midi/.test(ma)", 'HP01 / HP03 : colonne « Panier : Oui » ; historique « Panier ajouté », « Motif : … »'],
    ["!/17:00 Lyon panier/.test(ap) && /Panier retiré — « panier pris le midi »/.test(ap)", "!/13:00–17:00 4:00 Oui/.test(ap) && /Panier retiré/.test(ap) && /Motif : panier pris le midi/.test(ap)", 'idem'],
    ["const gapLbl = (await panel.locator('label:has([data-testid=correct-gap])').innerText().catch(() => '')).replace(/\\s+/g, ' ');", "const gapLbl = (await panel.locator('[data-testid=correct-gap]').innerText().catch(() => '')).replace(/\\s+/g, ' ');", 'HP06 : « Temps entre deux chantiers » est un groupe de trois choix (légende « de 12:00 à 13:00 »), plus une liste déroulante dans une étiquette'],
    ["/Entre 12:00 et 13:00/.test(gapLbl)", "/de 12:00 à 13:00/.test(gapLbl)", 'idem'],
    ["await panel.locator('[data-testid=correct-gap]').selectOption('route');", "await panel.locator('[data-testid=correct-gap] button', { hasText: /^Route/ }).click();", 'HP06 : « Route » est un des trois boutons du groupe (« Aucun », « Route non payée », « Pause avant »), même valeur envoyée (gap_before: route)'],
    ["/route 1h00 \\(non payée\\)/.test(routeTxt)", "/1:00\\s+non payée/.test(routeTxt)", 'HP01 : la route est une colonne du tableau (« 1:00 » puis « non payée »)'],
    ["await panel.locator('[data-testid=correct-reason]').fill('il manque ta pause de l’après-midi');\n  n = writes.length;\n  await panel.locator('[data-testid=correct-return]').click();",
      "await op.keyboard.press('Escape'); await op.waitForTimeout(400);\n  await op.locator('[data-testid=correct-return]').click();\n  await op.locator('[data-testid=renvoi-motif]').fill('il manque ta pause de l’après-midi');\n  n = writes.length;\n  await op.locator('[data-testid=renvoi-confirmer]').click();",
      'HP08 : « Renvoyer au salarié » est dans la fiche de la ligne et ouvre sa propre fenêtre (motif, puis « Renvoyer ») ; mêmes appels (office_return_day), même motif'],
    ["check(await cc.getByRole('button', { name: /Corriger les heures/ }).count() === 0, `A8 ${ws_} : plus de bouton « Corriger »`);", "check(await (async () => { await cc.click(); const v = (await op.locator('[data-testid=correct-open]').count()) === 0; await op.keyboard.press('Escape'); await op.waitForTimeout(350); return v; })(), `A8 ${ws_} : plus de bouton « Corriger »`);", 'HP03 : le bouton « Corriger » est dans la fiche de la ligne : on l’ouvre pour vérifier qu’il n’y est plus'],
    ["check(/Renvoyée au salarié — « il manque ta pause de l’après-midi »/.test(await txt(cc)), `A8 ${ws_} : historique « Renvoyée au salarié »`);", "check(await (async () => { const h = (await detailTxt(cc)).t; return /Renvoyée au salarié/.test(h) && /Motif : il manque ta pause de l’après-midi/.test(h); })(), `A8 ${ws_} : historique « Renvoyée au salarié »`);", 'HP03 : historique dans la fiche de la ligne'],
    ["check(/Changé après renvoi : 8h00–17h00 → 8h00–12h00 · panier retiré/.test(await txt(c.locator('[data-testid=after-return]'))), `R2 le changement : « ${(await txt(c.locator('[data-testid=after-return]'))).trim()} »`);", "const ar = (await detailTxt(c)).after.join(' ').replace(/\\s+/g, ' ');\n  check(/Changé après renvoi : 8h00–17h00 → 8h00–12h00 · panier retiré/.test(ar), `R2 le changement : « ${ar.trim()} »`);", 'HP03 : la mention « Changé après renvoi » est dans la fiche de la ligne (même texte)'],
    ["const diff = await txt(at.locator('[data-testid=after-return]'));", "const diff = ((await detailTxt(at)).after.join(' ')).replace(/\\s+/g, ' ');", 'HP03 : « Changé après renvoi » est dans la fiche de la ligne'],
    ["const frozen = await txt(at.locator('[data-testid=return-frozen]'));", "const frozen = ((await detailTxt(at)).frozen.join(' ')).replace(/\\s+/g, ' ');", 'HP03 : « était … » (ce que le salarié avait envoyé) est dans l’historique de la fiche de la ligne'],
    ["/était 8h00–12h00 · pause 0 min · panier/.test(await txt(ma.locator('[data-testid=return-frozen]')))", "/était 8h00–12h00 · pause 0 min · panier/.test(((await detailTxt(ma)).frozen.join(' ')).replace(/\\s+/g, ' '))", 'idem'],
    ["await panel.locator('[data-testid=correct-reason]').fill('à revoir');\n  const n = writes.length;\n  await panel.locator('[data-testid=correct-return]').click();",
      "await op.keyboard.press('Escape'); await op.waitForTimeout(400);\n  await op.locator('[data-testid=correct-return]').click();\n  await op.locator('[data-testid=renvoi-motif]').fill('à revoir');\n  const n = writes.length;\n  await op.locator('[data-testid=renvoi-confirmer]').click();",
      'HP09 : le renvoi est refusé par le serveur : même message (en plus du message du bureau en haut, la fenêtre de renvoi le garde affiché)'],
  ],
  'pause-lot3bis': [
    ["check(h && h.height <= 30, `P12 variante compacte (puce de ${Math.round(h?.height || 0)} px de haut)`);", "check(h && h.height >= 43.5, `P12 puce de 44 px de haut (cible tactile du dossier, ${Math.round(h?.height || 0)} px)`);", 'HP04 : les puces de pause de la fenêtre de correction sont celles du téléphone (44 px de haut) et non plus la variante compacte (28 px) : cibles ≥ 40 px au pointeur, 44 px au toucher'],
    ["/pause 45 min/.test(await txt(card().locator('[data-testid=line-break]')))", "/0:45/.test(await txt(card().locator('[data-testid=line-break]')))", 'HP01 : la pause est une colonne du tableau en h:mm (« 0:45 »)'],
  ],
  'export-lot11': [
    ["(await dlg.locator('[data-testid=badge-exit-forgotten]').allInnerTexts()).join('|') === 'sortie oubliée'", "(await dlg.locator('[data-testid=badge-exit-forgotten]').allInnerTexts()).join('|').toLowerCase() === 'sortie oubliée'",
      'HP01 : les étiquettes d’état s’écrivent en capitales espacées (planche) ; `innerText` rend les capitales, la copie compare sans tenir compte de la casse (même texte dans le code)'],
    ["(await dlg.locator('[data-testid=badge-lead]').allInnerTexts()).join('|') === 'par le chef d’équipe'", "(await dlg.locator('[data-testid=badge-lead]').allInnerTexts()).join('|').toLowerCase() === 'par le chef d’équipe'", 'idem'],
    ["JSON.stringify(itemsFiche) === JSON.stringify(['PDF', 'Excel', 'CSV'])", "JSON.stringify(itemsFiche) === JSON.stringify(['PDF', 'Excel', 'CSV paie'])", 'HP01 / HP18 : le troisième format s’appelle « CSV paie » (planche) ; même export CSV de paie'],
    [".then((t) => /Sans verrou/.test(t)), 'A) fiche : une ligne « Sans verrou » avec ⓘ'", ".then((t) => /ne verrouille pas/.test(t)), 'A) fiche : une ligne qui dit que l’export ne verrouille pas'",
      'HP01 : « · Sans verrou ⓘ » devient une phrase d’aide sous les pastilles de période (« Cet export … ne verrouille pas les heures ») et le bouton « Exporter ce salarié (sans verrou) »'],
    ["check(await dlg.locator('[data-testid=closure-open]').isVisible(), 'A) « Clôturer jusqu’au… » à côté d’« Exporter »');\n  await dlg.locator('[data-testid=closure-open]').click();",
      "await dlg.locator('[data-testid=fiche-onglet-gerer]').click();\n  check(await dlg.locator('[data-testid=closure-open]').isVisible(), 'A) « Clôturer jusqu’au… » dans l’onglet « Gérer » (planche EQ10 : un seul accès)');\n  await dlg.locator('[data-testid=closure-open]').click();",
      'HP01 / EQ09 : « Clôturer jusqu’au… » n’est plus dans la feuille d’heures mais dans l’onglet « Gérer » (décision validée : un seul accès par fonction) ; la fonction et ses repères sont les mêmes'],
    ["const period = await dlg.getByText(/^Période :/).innerText();", "await dlg.locator('[data-testid=fiche-onglet-heures]').click(); await dlg.locator('[data-testid=fiche-total]').waitFor(); const period = await dlg.locator('.dz-hb-ligne-semaine').innerText();",
      'HP01 : on revient à l’onglet « Feuille d’heures » (la clôture se fait dans « Gérer ») ; la période se lit dans la ligne « Semaine … » du tableau, plus dans « Période : … »'],
    ["await dlg.locator('[data-testid=closure-reopen]').click();", "await dlg.locator('[data-testid=fiche-onglet-gerer]').click(); await dlg.locator('[data-testid=closure-reopen]').click();", 'idem : « Rouvrir » est dans l’onglet « Gérer »'],
    ["const teamMenu = team.locator('[data-testid=team-export-menu]');\n  check(await teamMenu.count() === 1, 'A) équipe : un seul bouton « Exporter ▾ »');\n  await teamMenu.click();\n  const itemsTeam = await menuItems(pg);",
      "const teamMenu = team.locator('[data-testid^=team-export-menu-]');\n  check(await teamMenu.count() === 3, 'A) équipe : trois pastilles de format (plus de menu)');\n  const itemsTeam = await teamMenu.allInnerTexts();",
      'HP17 / HP18 : « Exporter l’équipe » montre PDF, Excel, CSV paie en trois pastilles ; la liste de formats est la même que celle du menu de la fiche'],
    ["await dlg.locator('[data-testid=closure-open]').click();\n  await pg.locator('[data-testid=closure-calendar]').waitFor();\n  hs = await hScroll(pg);", "await dlg.locator('[data-testid=fiche-onglet-gerer]').click();\n  await dlg.locator('[data-testid=closure-open]').click();\n  await pg.locator('[data-testid=closure-calendar]').waitFor();\n  hs = await hScroll(pg);", 'idem (D : tailles d’écran) : « Clôturer jusqu’au… » dans l’onglet « Gérer »'],
  ],
  'export-alerte-lot18': [
    ["const phrase = (n, m) => `Cet export va verrouiller ${n} ligne${n > 1 ? 's' : ''} d’heures de ${m} salarié${m > 1 ? 's' : ''} (période ${PERIODE}). ${m > 1 ? 'Ils ne pourront' : 'Il ne pourra'} plus ${n > 1 ? 'les' : 'la'} modifier.`;",
      "const phrase = (n, m) => `Cet export va verrouiller ${n} ligne${n > 1 ? 's' : ''} d’heures de ${m} salarié${m > 1 ? 's' : ''}`;",
      'HP20 : le TITRE de l’alerte est « Cet export va verrouiller N lignes d’heures de M salariés » ; la période (carte « Période »), « Les salariés ne pourront plus modifier ces heures ; le bureau le pourra encore » et le fichier sont dessous, en éléments séparés'],
    ["check((await box.locator('[data-testid=export-verrou-deja]').innerText()) === '2 autres lignes de la période sont déjà verrouillées : elles le restent.',", "check((await box.locator('[data-testid=export-verrou-deja]').innerText()).includes('2 autres lignes de la période sont déjà verrouillées : elles le restent.'),",
      'HP21 : la précision sur les lignes déjà verrouillées est dans un encadré jaune, sous le titre « Une partie de cette période est déjà partie » ; la phrase du code est la même'],
    ["const buttons = await box.getByRole('button').allInnerTexts();\n  check(JSON.stringify(buttons) === JSON.stringify(['Exporter et verrouiller', 'Exporter sans verrouiller', 'Annuler'])", "const buttons = (await box.getByRole('button').allInnerTexts()).filter((x) => !/Fermer/.test(x));\n  check(JSON.stringify(buttons) === JSON.stringify(['Annuler', 'Exporter sans verrouiller', 'Exporter et verrouiller'])",
      'HP20 : l’alerte a un ✕ « Fermer » (= Annuler) en plus ; l’ordre des trois choix est celui de la planche (Annuler, sans verrouiller, puis le principal à droite)'],
    ["check(await team.locator('[data-testid=team-export-menu]').isEnabled(), 'F) … « Exporter ▾ » est de nouveau utilisable');", "check(await team.locator('[data-testid=team-export-menu-csv]').isEnabled(), 'F) … les pastilles de format sont de nouveau utilisables');", 'HP17 : il n’y a plus de bouton « Exporter ▾ » : ce sont les pastilles de format qui se réactivent'],
    [".innerText()).startsWith('1 autre ligne'), 'G) … et 1 ligne déjà verrouillée à part'", ".innerText()).includes('1 autre ligne'), 'G) … et 1 ligne déjà verrouillée à part'", 'HP21 : l’encadré jaune commence par son titre (« Une partie de cette période est déjà partie ») : la phrase du code vient dessous'],
    ["await focusId(pg) === 'team-export-menu'", "(await focusId(pg) || '').startsWith('team-export-menu-')", 'HP17 : le focus revient sur la pastille de format qui a lancé l’export (il n’y a plus de bouton « Exporter ▾ »)'],
    ["await team.getByText('Exporter verrouille les heures de la période.').count() === 1", "await team.getByText('Exporter verrouille les heures de la période', { exact: true }).count() === 1", 'HP18 : le titre de l’encadré gris n’a plus de point final (planche)'],
    ["rects.length === 3 && rects.every((r) => r.h >= 44)", "rects.length === 4 && rects.every((r) => r.h >= 44)", 'HM06 : quatre boutons dans l’alerte (le ✕ de 44 px s’ajoute aux trois choix)'],
    ["check(await box.locator('h2').innerText() === 'Envoyer et verrouiller les heures ?'", "check(await box.locator('[data-testid=export-verrou-valider]').innerText() === 'Envoyer et verrouiller'", 'HP21 : le titre de l’alerte est le même pour l’envoi (« Cet export va verrouiller… ») ; ce qui dit « envoi » est le bouton principal « Envoyer et verrouiller » et le petit mot « AVANT L’ENVOI »'],
    ["const btns = await box.getByRole('button').allInnerTexts();\n  check(JSON.stringify(btns) === JSON.stringify(['Envoyer et verrouiller', 'Annuler'])", "const btns = (await box.getByRole('button').allInnerTexts()).filter((x) => !/Fermer/.test(x));\n  check(JSON.stringify(btns) === JSON.stringify(['Annuler', 'Envoyer et verrouiller'])", 'idem : ✕ « Fermer » en plus, ordre de la planche'],
  ],
  'admin-lot11': [
    ["await ex.locator('button', { hasText: 'Envoyer à' }).count() === 1", "await ex.locator('[data-testid=send-accountant]').count() === 1", 'HP18 : « Envoyer au comptable » est une ligne (« Envoyer au comptable », l’adresse dessous) avec un bouton « Envoyer » ; son repère `send-accountant` est le même'],
    ["`5) menu « Exporter ▾ » : ${items.map((x) => x.split('\\n')[0]).join(' / ')}`);\n  await p.keyboard.press('Escape'); await p.waitForTimeout(200);", "`5) formats : ${items.map((x) => x.split('\\n')[0]).join(' / ')}`);", 'HP17 / HP18 : trois pastilles de format, pas de menu à refermer (Échap fermerait le panneau lui-même)'],
  ],
  'heures-lot1': [],
  'brouillons-lot2': [],
  'panier-lot3bis': [
    ["  const x = await sheetExport(op, 'excel');", "  await op.keyboard.press('Escape'); await op.keyboard.press('Escape'); await op.waitForTimeout(400);\n  const x = await sheetExport(op, 'excel');",
      'HP04 : la correction est une fenêtre (puis la fiche de la ligne) qui couvre la feuille d’heures : on les referme (Échap, deux fois) avant d’exporter, comme on refermerait le panneau déplié'],
  ],
  'absences-lot2': [],
  'fenetres-lot11': [],
  'statistiques-lot5': [],
  'guides-bureau-lot7': [
    ["t.tag === 'div', `A · l’anneau des congés est sur la liste", "t.tag === 'ul', `A · l’anneau des congés est sur la liste", 'HP12 : la liste des demandes de congé est une liste `<ul>` (une ligne = un `<li>`) et non plus un `<div>` ; l’ancre `bureau-conges.liste` y est posée comme avant'],
    ["'.bt-la-row'", "'.dz-hb-demande'", 'HP12 : une demande de congé est un `<li class=dz-hb-demande>`'],
    [".bt-la-row[data-guide]", ".dz-hb-demande[data-guide]", 'idem'],
  ],
};

/**
 * Adaptations COMMUNES à tous les scripts (appliquées là où le texte existe, sans erreur ailleurs). Même règle : un repère ou un geste qui change de FORME, jamais une fonction retirée.
 */
export const COMMUNES = [
  ["await team.locator('[data-testid=team-export-menu]').click();", '/* v2 : les trois formats sont des pastilles (PDF, Excel, CSV paie), il n’y a pas de menu à ouvrir avant de choisir */',
    'HP17 à HP20 : « Exporter l’équipe » ne montre plus un menu « Exporter ▾ » mais trois pastilles de format ; chaque pastille garde son repère `team-export-menu-<format>` et déclenche le même export'],
  ["await p.click('[data-testid=team-export-menu]'); await p.waitForTimeout(250);", 'await p.waitForTimeout(250);', 'idem : pas de menu à ouvrir'],
  ['[data-testid=export-verrou-confirm]', '[data-testid=export-verrou-valider]',
    'HP20 : le bouton principal de l’alerte de verrouillage v2 s’appelle `export-verrou-valider` : le script de l’alerte d’AVANT (export-alerte-lot18) reconnaît le chunk de l’ancienne alerte par `export-verrou-confirm` et exige UN seul fichier'],
  ["dlg.locator('.divide-y > div')", "dlg.locator('[data-testid=fiche-ligne]')",
    'HP01 : la feuille d’heures est un TABLEAU (une ligne = une ligne d’heures, repère `fiche-ligne`) et non plus une pile de cartes `.divide-y > div`'],
  ["dlg.locator('.divide-y')", "dlg.locator('.dz-hb-tableau')", 'HP01 : le conteneur des lignes est le tableau'],
  ["await c.getByRole('button', { name: /Corriger les heures/ }).click();", "await c.click(); await op.locator('[data-testid=correct-open]').click();",
    'HP03 / HP04 : « Corriger » est dans la fiche de la LIGNE (on clique la ligne, puis « Corriger »), et ouvre une fenêtre (`correct-panel`) au lieu de déplier un panneau dans la carte'],
  ["c.locator('[data-testid=correct-panel]')", "op.locator('[data-testid=correct-panel]')", 'HP04 : la correction est une FENÊTRE de la page, plus un panneau dans la carte de la ligne'],
  ["c.locator('[data-testid=correct-meal]')", "op.locator('[data-testid=correct-meal]')", 'idem (case « Panier » de la fenêtre de correction)'],
  ["[data-testid=correct-meal]').check()", "[data-testid=correct-meal]').check({ force: true })", 'HP04 : l’interrupteur « Panier » de la planche cache la case à cocher (même `input`, même repère) derrière un curseur : on coche par la case elle-même'],
  ["meal.check()", "meal.check({ force: true })", 'idem'],
  ["meal.uncheck()", "meal.uncheck({ force: true })", 'idem'],
  ["c.locator('[data-testid=correct-break]')", "op.locator('[data-testid=correct-break]')", 'idem (puces de pause de la fenêtre de correction)'],
  ["c.locator('[data-testid=correct-reason]')", "op.locator('[data-testid=correct-reason]')", 'idem (motif)'],
  ["c.locator('[data-testid=correct-submit]')", "op.locator('[data-testid=correct-submit]')", 'idem (« Corriger et prévenir »)'],
  ["dlg.locator('div:has(> span:text(\"Total de la période\")) > span').nth(1)", "dlg.locator('[data-testid=fiche-total]')",
    'HP01 : le total de la période est la carte « TOTAL ENVOYÉ » (repère `fiche-total`), en h:mm'],
];

const flag = (s) => s.replace(/(goto\(`[^`]*?)\/admin`/g, '$1/admin?ui=2`').replace(/(goto\(`[^`]*?)\/admin\?/g, '$1/admin?ui=2&');

const demandes = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const noms = demandes.length ? demandes : Object.keys(ADAPTATIONS);
for (const nom of noms) {
  if (!(nom in ADAPTATIONS)) { console.error(`inconnu : ${nom}`); process.exit(2); }
  // Les scripts qui touchent aussi /poseur visent l'ANCIENNE interface du salarié (le salarié est en v2 par défaut depuis la bascule) : on part de leur copie
  // `ui1-<nom>.mjs` (node scripts/tests/ui2-copies.mjs --v1 <nom>), qui ajoute `?ui=1` à /poseur ; seule la partie BUREAU passe en `?ui=2`.
  const ui1 = path.join(DOSSIER, `ui1-${nom}.mjs`);
  const source = fs.existsSync(ui1) ? ui1 : path.join(DOSSIER, `${nom}.mjs`);
  let s = flag(fs.readFileSync(source, 'utf8'));
  let n_adapt = 0;
  for (const [avant, apres] of COMMUNES) { if (typeof avant === 'string' ? s.includes(avant) : avant.test(s)) { s = typeof avant === 'string' ? s.split(avant).join(apres) : s.replace(avant, apres); n_adapt++; } }
  for (const [avant, apres, raison] of ADAPTATIONS[nom]) {
    const n = typeof avant === 'string' ? s.split(avant).length - 1 : (s.match(avant) || []).length;
    if (!n) { console.error(`${nom} : adaptation sans effet (${raison}) : ${String(avant).slice(0, 80)}`); process.exit(3); }
    s = typeof avant === 'string' ? s.split(avant).join(apres) : s.replace(avant, apres);
    n_adapt++;
  }
  fs.writeFileSync(path.join(DOSSIER, `ui2b-${nom}.mjs`), `// COPIE GÉNÉRÉE par scripts/tests/copies-ui2-bureau.mjs depuis ${nom}.mjs : /admin?ui=2 + adaptations de la table ADAPTATIONS. Ne pas modifier à la main.\n${s}`);
  console.log(`ui2b-${nom}.mjs (${n_adapt} adaptation(s))`);
}
