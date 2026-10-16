// Rejeu des scripts navigateur de « Ma journée » en /poseur?ui=2 (étape 5 du design salarié : feuilles).
//   node scripts/tests/ui2-copies.mjs                 écrit scripts/tests/ui2-<nom>.mjs pour chaque script de la liste
//   node scripts/tests/ui2-copies.mjs pause-lot3bis   n'en écrit qu'un
//   node scripts/tests/ui2-pause-lot3bis.mjs out <dossier-de-captures-hors-dépôt> <port>
// Les ORIGINAUX ne sont jamais modifiés : la copie est l'original mot pour mot, plus (1) l'adresse /poseur devient /poseur?ui=2 (le drapeau est mémorisé
// pour la session de l'onglet, `?ui=1` l'éteint) et (2) la table ADAPTATIONS ci-dessous : chaque ligne dit CE QUI CHANGE à l'écran avec ?ui=2 et ce que la copie attend à la place.
// Une adaptation ne cache jamais une fonction qui disparaît : elle suit un libellé ou un repère qui change de forme (décision écrite dans la ligne).
// Les copies (`scripts/tests/ui2-*.mjs`) sont ignorées par git : on les régénère, la table fait foi.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));

/** nom → liste de [ancien texte (chaîne ou RegExp), nouveau texte, raison]. */
export const ADAPTATIONS = {
  'pause-lot3bis': [
    ['boxes.every((x) => x.width >= 60)', 'boxes.every((x) => x.width >= 43.5)',
      'P1 : les 8 puces de la fiche gardent 2 rangées de 4, mais ne sont plus 4 cellules égales de 60 px au moins : ce sont des puces de largeur naturelle (planche E21), 44 px au minimum (cible tactile)'],
    ["body.includes('pause 1 h 15') && !body.includes('pause 75min')", "!body.includes('pause 75min')",
      'P14 : la Semaine v2 (E25) ne liste plus les lignes une à une (7 lignes de jour), donc plus de « pause 1 h 15 » par ligne ; la pause reste dite dans la Journée (« 1:15 », contrôle P14 précédent) et l’ancien « 75min » n’apparaît nulle part'],
  ],
  'pointage-lot10': [],
  'heures-lot1': [],
  'heures-sures': [],
  'brouillons-lot2': [],
  'documents-lot24': [],
  'salarie-lot12': [],
  'chantier-termine-lot23': [
    ["await p.locator('.bt-site').count() === 0 && /Aucun chantier trouvé/", "await p.locator('.bt-site:not(.other)').count() === 0 && /Aucun chantier trouvé/",
      'G2 : « Autre chantier » reste proposé même sans résultat (planche E22b) ; le chantier terminé, lui, n’apparaît toujours pas'],
    ['/Tu es pointé depuis/i.test(lt)', '/pointage en cours · depuis/i.test(lt)',
      'G3 : la carte de pointage de la planche dit « POINTAGE EN COURS · DEPUIS hh:mm » (E05) à la place de « Tu es pointé depuis »'],
    ["wk.includes('Maison Martin') && /Terminé le/.test(wk)", "wk.includes('Maison Martin') && await p.locator('.dz-sem-jour').count() === 7",
      'G4 : la Semaine v2 (E25) est 7 lignes de jour qui nomment toujours le chantier ; « Terminé le … » se lit dans la Journée et l’Historique (contrôles G3 et G4 Historique, inchangés)'],
    ["await p.locator('div.flex.items-center.justify-between button:has(svg.lucide-chevron-left)').first().click();", "await p.locator('[aria-label=\"Semaine précédente\"]').first().click();",
      'G9 : la flèche de la Semaine v2 garde son nom (aria-label « Semaine précédente ») ; le balisage d’avant (div.flex + icône) n’existe plus'],
    ["await p.locator('p.font-semibold', { hasText: frLabel(d) }).first().click();", "await p.locator(`.dz-sem-jour[aria-label^=\"${frLabel(d)}\"]`).first().click();",
      'G9 : la ligne du jour de la Semaine v2 est repérée par son aria-label (le jour en toutes lettres), plus par un <p> gras'],
    ["  await openDay(p);\n  await p.waitForSelector('[data-testid=team-day]', { timeout: 8000 });", "  await openDay(p);\n  await p.locator('[data-testid=dz-onglet-plus]').click(); await p.getByRole('menuitem', { name: 'Mon équipe' }).click();\n  await p.waitForSelector('[data-testid=team-day]', { timeout: 8000 });",
      'G10 / E27 : « Mon équipe » (le chef) est une page rangée dans « Plus », plus une carte en haut de « Ma journée » : la copie y va par « Plus » → « Mon équipe » ; la règle testée (chantiers proposés selon le jour, chantier par défaut) est celle du même composant'],
    ["  await openDay(p);\n  await p.waitForSelector('[data-testid=team-day]', { timeout: 8000 }).catch(() => {});", "  await openDay(p);\n  await p.locator('[data-testid=dz-onglet-plus]').click(); await p.getByRole('menuitem', { name: 'Mon équipe' }).click();\n  await p.waitForSelector('[data-testid=team-day]', { timeout: 8000 }).catch(() => {});",
      'G7 / E27 : idem (« Mon équipe » par « Plus »)'],
  ],
  'fenetres-lot11': [],
  'reserves-lot11': [],
  // Étape 6 : les scripts des vues touchées (Plus, Mois, Historique, congés, formations, équipe, /pointer)
  'salarie-lot14': [
    ["const open = async () => { await p.goto(`http://localhost:${PORT}/poseur?ui=2`); await p.waitForSelector('.bt-total', { timeout: 15000 }); await p.waitForTimeout(900); };",
      "const open = async () => { await p.goto(`http://localhost:${PORT}/poseur?ui=2`); await p.waitForSelector('.bt-total', { timeout: 15000 }); await p.waitForTimeout(900); if (D.users[0].role === 'lead') { await p.locator('[data-testid=dz-onglet-plus]').click(); await p.getByRole('menuitem', { name: 'Mon équipe' }).click(); await p.waitForSelector('[data-testid=team-day]', { timeout: 15000 }); await p.waitForTimeout(700); } };",
      'E26 / E27 : « Mon équipe » n’est plus une carte en haut de « Ma journée » : c’est une page, rangée dans « Plus » (entrée « Mon équipe », étiquette « chef », chef d’équipe seulement). La copie y va par « Plus » → « Mon équipe » ; tout le reste (7 jours, salariés, Corriger, Envoyer, Ajouter des heures, OK) est le même composant, mêmes repères'],
  ],
  'traces-lot3': [
    ['linkBox.height < 30, `lien discret, pas un gros bouton (', 'linkBox.height >= 43.5 && linkBox.height < 60, `lien discret, une ligne de 44 px (cible tactile), pas un gros bouton jaune (',
      'E26 : « Interventions supprimées » reste un lien discret (contour fin, aucune couleur d’action) mais fait 44 px de haut (cible tactile ≥ 44 px, règle du dossier) au lieu de moins de 30 px'],
  ],
  'qr-fixe-lot12': [
    ['/Arrivée enregistrée/.test(', '/Arrivée enregistrée/i.test(', 'P01 : le petit mot « Arrivée enregistrée » s’écrit en capitales espacées (planche) : innerText rend les capitales ; la copie compare sans tenir compte de la casse (le texte du code est le même)'],
    ['/Départ enregistré/.test(', '/Départ enregistré/i.test(', 'P02 : idem pour « Départ enregistré »'],
    ['/Pointage non enregistré/.test(t)', '/Pointage non enregistré/i.test(t)', 'P03 : idem pour « Pointage non enregistré »'],
  ],
  'salarie-lot9': [
    ['lt2.toLowerCase().includes(`tu es pointé depuis ${parisHHmm(D.active_sessions[0].started_at)}`)', 'lt2.toLowerCase().includes(`pointage en cours · depuis ${parisHHmm(D.active_sessions[0].started_at)}`)',
      'E05 : la carte de pointage dit « POINTAGE EN COURS · DEPUIS hh:mm » à la place de « Tu es pointé depuis » (même adaptation que chantier-termine-lot23, G3) ; le chantier y est toujours'],
    ["!lt2.includes('Annuler') && !lt2.includes('POINTAGE EN COURS')", "!lt2.includes('Annuler')",
      'E05 : le petit mot « POINTAGE EN COURS » est le titre de la carte de la planche ; il n’y a toujours ni gros bloc d’avant ni bouton « Annuler »'],
    ['ltBox.height <= 130', 'ltBox.height <= 240',
      'E05 : la carte de pointage est la carte noire à grand chrono de la planche (≈ 190 px) au lieu de la petite carte compacte d’avant ; elle reste une seule carte, sans bloc de plus'],
    ["(await panier.innerText()).includes('Panier ✓')", "/^pris ✓$/i.test((await panier.locator('.bt-stat-n').innerText()).trim())",
      'E05 : la tuile Panier de la planche dit « Pris ✓ » / « Non pris » (aria-pressed inchangé) à la place de « Panier ✓ »'],
  ],
  'salarie-lot10': [
    ["m.zone === 'ailleurs' && !(m.type === 'childList'", "m.zone === 'ailleurs' && !m.target.includes('dz-frise') && m.attr !== 'data-pointage' && !(m.type === 'childList' && m.added.length === 1 && m.added[0] === 'dz-aide') && !(m.type === 'childList'",
      'E05 : la mini-frise « Ma journée » (décor lu avec l’horloge) redessine son segment « en cours » quand le pointage apparaît, la journée pose `data-pointage` sur sa zone de défilement pour masquer la ligne des deux pastilles (réserves, formations : elles restent dans « Plus »), et la barre du bas ajoute sa ligne d’aide « Le pointage en cours ne part pas » (E05) : c’est leur rôle ; tout le reste ne bouge toujours pas'],
  ],
  'site-rapide-lot5': [],
  'requetes-lot29': [
    ["e.name === 'planning' && e.select === 'work_date,absence_type'; // fetchPending (salarié)", "e.name === 'planning' && (e.select === 'work_date,absence_type' || e.select === 'work_date,absence_type,estimated_start,estimated_end'); // fetchPending (salarié)",
      'E05 : la même lecture « journées à envoyer » demande en plus les heures prévues (début et fin du planning, pour les barres des 7 jours) DANS la même requête : aucune requête de plus (le nombre au chargement reste 18, le contrôle 1 ne change pas) ; seul le repère de colonnes de la copie suit'],
    ["(e.select === 'work_date,status' || e.select.startsWith('id,work_date,observation'))", "(e.select === 'work_date,status' || e.select.startsWith('work_date,status,submitted_at') || e.select.startsWith('id,work_date,observation'))",
      'E05 : idem pour les heures saisies (état, envoi, verrou, début, fin, minutes : les barres et la bande des 7 jours) : même requête, plus de colonnes ; le nombre de lectures au retour reste 3'],
  ],
  'formations-lot6': [
    ["=== '2 2 formations à voir ›'", "=== '2 formations à voir ›'", 'la pastille chiffrée du bandeau n’est plus dite (puce de rappel de la planche, E05) ; le nombre reste dans le texte'],
    ["=== '1 1 formation à voir ›'", "=== '1 formation à voir ›'", 'idem, au singulier'],
    ["(await txt(m)) === 'Formations 2'", "(await txt(m)) === 'Formations à voir 2'", 'le menu Plus (E26) nomme l’entrée « Formations à voir », avec son compteur'],
    ["wp.url().endsWith('/poseur')", "wp.url().endsWith('/poseur?ui=2')", 'l’adresse garde son ?ui=2 (le drapeau est lu dans l’adresse au chargement)'],
  ],
};

// /pointer (étape 7) : le même drapeau, devant le fragment (#f=…) ou les paramètres (?k=…), SEULEMENT dans une navigation (`goto`) : l'adresse du QR que le bureau affiche, elle, ne change pas
const g = (s) => s.replace(/\/poseur(?=`)/g, '/poseur?ui=2').replace(/\/poseur\?a=/g, '/poseur?ui=2&a=').replace(/(goto\(`[^`]*?)\/pointer#f=/g, '$1/pointer?ui=2#f=').replace(/(goto\(`[^`]*?)\/pointer\?k=/g, '$1/pointer?ui=2&k=');

const noms = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ADAPTATIONS);
for (const nom of noms) {
  if (!(nom in ADAPTATIONS)) { console.error(`inconnu : ${nom}`); process.exit(2); }
  let s = g(fs.readFileSync(path.join(DOSSIER, `${nom}.mjs`), 'utf8'));
  for (const [avant, apres, raison] of ADAPTATIONS[nom]) {
    const n = typeof avant === 'string' ? s.split(avant).length - 1 : (s.match(avant) || []).length;
    if (!n) { console.error(`${nom} : adaptation sans effet (${raison}) : ${String(avant).slice(0, 80)}`); process.exit(3); }
    s = typeof avant === 'string' ? s.split(avant).join(apres) : s.replace(avant, apres);
  }
  const entete = `// COPIE GÉNÉRÉE par scripts/tests/ui2-copies.mjs depuis ${nom}.mjs : /poseur?ui=2 + adaptations de la table ADAPTATIONS. Ne pas modifier à la main.\n`;
  fs.writeFileSync(path.join(DOSSIER, `ui2-${nom}.mjs`), entete + s);
  console.log(`ui2-${nom}.mjs (${ADAPTATIONS[nom].length} adaptation(s))`);
}
