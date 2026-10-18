// Rejeu des scripts navigateur du BUREAU en /admin?ui=2 (lot 1 du design du bureau : le planning v2).
//   node scripts/tests/ui2-bureau-copies.mjs                 écrit scripts/tests/ui2b-<nom>.mjs pour chaque script de la liste
//   node scripts/tests/ui2-bureau-copies.mjs planning-lot2   n'en écrit qu'un
//   node scripts/tests/ui2b-planning-lot2.mjs out <dossier-de-captures-hors-dépôt> <port>
//   node scripts/tests/ui2-bureau-copies.mjs --v1 [nom…]     écrit scripts/tests/ui1b-<nom>.mjs : l'original + `?ui=1` (la RÉFÉRENCE de l'ancien bureau)
// Les ORIGINAUX ne sont jamais modifiés : la copie est l'original mot pour mot, plus (1) l'adresse /admin devient /admin?ui=2 (le drapeau est mémorisé pour la session
// de l'onglet, `?ui=1` l'éteint ; il n'est lu que sur un aperçu ou en local) et (2) la table ADAPTATIONS : chaque ligne dit CE QUI CHANGE à l'écran avec ?ui=2 et ce que la copie attend
// à la place. Une adaptation ne cache jamais une fonction qui disparaît : elle suit un libellé, un repère ou une place qui change de forme (décision écrite dans la ligne).
// Les copies (`scripts/tests/ui2b-*.mjs`, `ui1b-*.mjs`) sont ignorées par git : on les régénère, la table fait foi.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));

/** nom → liste de [ancien texte (chaîne ou RegExp), nouveau texte, raison]. */
export const ADAPTATIONS = {
  'planning-lot2': [
    ["viewport: { width: 1440, height: 1200 }", "viewport: { width: 1440, height: 1900 }",
      'Les lignes du planning v2 sont plus hautes (bulles de 13 px, étiquettes, « + ajouter » : planche PL01) : l’écran de test est plus haut pour que chaque case visée reste à l’écran (sinon dnd-kit fait défiler la page pendant le glisser et la cible est ratée)'],
    [/const dragState = \(p\) => p\.evaluate\(\(\) => \{[\s\S]*?\n  \};\n\}\);/, `const dragState = (p) => p.evaluate(() => {
  const root = document.querySelector('.bt-pl');
  const ov = document.querySelector('[data-testid=drag-overlay]');
  const over = document.querySelector('.dzp-td[data-cible] .dzp-cible-msg');
  const shown = (sel) => { const e = over?.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
  const src = document.querySelector('[data-glisse]');
  return {
    copying: !!root?.classList.contains('bt-pl--copying'),
    badge: !!ov?.querySelector('i'),
    cursor: ov ? getComputedStyle(ov).cursor : null,
    overText: over ? over.innerText.replace(/\\s+/g, ' ').trim() : null,
    copyHere: shown('.cp'),
    dropHere: shown('.mv'),
    overlayReal: false,
    overlayHours: ov ? ov.innerText.replace(/\\s+/g, ' ') : '',
    srcOpacity: src ? getComputedStyle(src).opacity : null,
  };
});`, 'D4 : les repères visibles pendant le glisser sont ceux du planning v2 : la case visée porte .dzp-cible-msg (« Déposer ici » .mv / « Copier ici » .cp), le fantôme est [data-testid=drag-overlay] avec une pastille « + » (<i>), la bulle tenue porte data-glisse. Même information, même gestes ; le fantôme de la planche est une carte sombre (titre + horaire prévu) qui ne montre jamais les heures envoyées (overlayReal = faux)'],
  ],
  'absences-lot2': [
    ["const absLabel = async (p, first, day) => ((await cell(p, first, day).locator('.dzp-absence b').textContent({ timeout: 3000 }).catch(() => '')) || '').trim();",
      "const ABS_2A = { 'CONGÉ': 'Congé', 'INTEMPÉRIE': 'Intempérie', 'ABSENT · MALADIE': 'Arrêt maladie', 'REPOS': 'Repos' };\nconst absLabel = async (p, first, day) => { const t = ((await cell(p, first, day).locator('.dzp-absence b').textContent({ timeout: 3000 }).catch(() => '')) || '').trim(); return ABS_2A[t] || t; };",
      'Planche d’essai 2a : la case d’absence écrit son type en mono capitales (« CONGÉ », « INTEMPÉRIE », « ABSENT · MALADIE ») ; la copie relit le même libellé et le ramène au mot attendu (« Congé »…). Même absence, même type, même case'],
  ],
  'versions-lot8': [
    ["const openVersions = async (p) => {\n  await p.click('[data-testid=\"corner-versions\"]');", "const openVersions = async (p) => {\n  await ouvrirPlus(p); await p.click('[data-testid=\"corner-versions\"]');",
      'W1 : « Versions du planning » est une ligne du menu « Plus ⋯ » (plus la petite flèche du coin de la grille) : on ouvre le menu, puis on touche la ligne ; même fenêtre ensuite'],
    ["check(await p.locator('[data-testid=\"corner-versions\"]').count() === 1, 'W1 l’entrée « Versions » est dans le coin de la grille du planning');", "await ouvrirPlus(p); check(await p.locator('[data-testid=menu-plus] [data-testid=\"corner-versions\"]').count() === 1, 'W1 l’entrée « Versions du planning » est une ligne du menu « Plus ⋯ »');",
      'W1 : l’emplacement change par décision de la planche (README §1) : la ligne est dans « Plus ⋯ », plus dans le coin de la grille'],
    [/  const rects = await p\.evaluate\(\(\) => \{ const r = \(q\)[\s\S]*?'W1 nom accessible : « Versions du planning de cette semaine »'\);/, "  await p.keyboard.press('Escape'); await p.waitForTimeout(150);",
      'W1 : la géométrie du coin de la grille (le bouton ne recouvre ni « Salarié » ni « S-40 ») et son nom accessible d’avant n’ont plus d’objet : la ligne du menu « Plus ⋯ » s’appelle « Versions du planning », texte visible'],
  ],
  'traces-lot3': [
    ["(await txt(mm)) === 'Interventions supprimées ou décalées', 'menu ☰ : « Interventions supprimées ou décalées »'", "(await txt(mm)).replace(/\\s*›$/, '') === 'Interventions supprimées ou décalées', 'menu ☰ : « Interventions supprimées ou décalées »'",
      'PM03 : chaque ligne du menu ☰ v2 finit par son chevron « › » (la feuille du bas de la planche) : le libellé se lit sans lui ; même ligne, même geste'],
  ],
  'requetes-lot29': [],
};

/**
 * Scripts du bureau PAS rejoués en ?ui=2 dans ce lot, avec la raison. Ce ne sont pas des échecs cachés : leurs contrôles sondent la mise en page de l'ANCIEN écran
 * (classes et géométrie du cockpit, boutons « ＋ Tâche » de chaque case, grille de salariés plus basse, lignes vides de remplissage…) que la planche a dessiné autrement
 * (README §1 et §5). Leur FONCTION est couverte en v2 par les PARCOURS de fidelite-bureau.mjs (menus, fenêtres, écritures, sélection, glisser, téléphone) ; chacun reste vert en v1.
 */
export const NON_REJOUES = {
  'planning-copier': 'sections K (« ＋ Tâche » dans chaque case, retirée : un seul accès, la fiche « Ajouter une tâche à ce créneau ») et T (astuce en bandeau fin sous la barre : c’est une carte, PL12)',
  'admin-lot9': 'cockpit : classes .bt-pl-stat / .bt-pl-cockpit-right et géométrie du bandeau sombre (remplacé par le bandeau de 5 tuiles, repliable)',
  'admin-lot10': 'cockpit : mêmes classes et géométrie (logo, essai, compte rangés dans la barre noire de 60 px)',
  'admin-lot11': 'barre : .bt-pl-bar button (« Légende des icônes » en popover, remplacée par la légende sous la grille), pastilles chiffrées du cockpit',
  'statistiques-lot5': 'cockpit : le lien « statistiques » du cockpit est l’onglet « Statistiques » de la barre noire',
  'missions-lot4': '« ＋ Tâche » dans chaque case (retiré, voir planning-copier) et « Légende des icônes »',
  'planning-lot3': 'lignes vides de remplissage (.bt-pl-ghostbody, supprimées : décision validée), légende des icônes en popover, géométrie de la barre',
  'invitations-admin': 'la ligne repliée « Invitations » sous la barre est retirée : les invitations sont dans la fenêtre « Salariés » (un seul accès) ; son contrôle est dans les PARCOURS',
  'statistiques-lot5b': '',
};
delete NON_REJOUES['statistiques-lot5b'];

/** Les scripts navigateur du bureau qui concernent le planning (lot 1) et que la table ci-dessous rejoue en ?ui=2. */
export const SCRIPTS_BUREAU = Object.keys(ADAPTATIONS);

const gDrapeau = (d) => (s) => s.replace(/(goto\(`[^`]*?\/admin)(?=`)/g, `$1?ui=${d}`);

/**
 * REPÈRES : les classes de l'ancien planning (`bt-pl-*`) ont un équivalent exact dans le planning v2 (`dzp-*`) : le même élément, au même endroit, avec le même rôle.
 * Appliquées à TOUTES les copies (jamais aux originaux), avant la table ADAPTATIONS. Une classe sans équivalent (le « + » d'une case vide, la pastille « ⋯ »…) n'est pas ici :
 * elle est traitée script par script, avec sa raison, dans ADAPTATIONS.
 */
export const REPERES = [
  ['tbody:not(.bt-pl-ghostbody)', 'tbody'], ['.bt-mm-sheet', '.dzp-mm'], ['.bt-pl-bar', '.dzp-semaine'], ['.bt-pl-table', '.dzp-table'], ['.bt-pl-add', '.dzp-vide'],
  ['img.bt-pl-acct-av-img', '.dzp-compte__btn img'],
  ['.bt-pl-gridwrap', '.dzp-defile'], ['.bt-pl-grab', '.dzp-prise'], ['td.bt-pl-cell', 'td.dzp-td'], ['.bt-pl-cell', '.dzp-td'], ['.bt-pl-namebtn', '.dzp-nom-btn'], ['.bt-pl-name', '.dzp-nom'],
  ['.bt-pl-m-card', '.dzp-m-carte'], ['.bt-pl-daypill', '.dzp-m-jour'], ['.bt-pl-m-bubbtn', '.dzp-m-bulle'], ['.bt-pl-bub', '.dzp-bulle'], ['.bt-pl-abs-lbl', '.dzp-absence b'], ['.bt-pl-abs', '.dzp-absence'],
  ['.bt-pl-cellfill', '.dzp-case'], ['.bt-pl-real-txt', '[data-etat="envoyee"] [data-testid="bubble-hours"]'], ['.bt-pl-th-name', '.dzp-th-nom'], ['.bt-pl-th', '.dzp-th-jour'], ['.bt-pl-acctmenu', '.dzp-menu-compte'],
  ['.bt-pl-acct-av-img', '.dzp-compte__btn img'], ['.bt-pl-acct-name', '.dzp-compte__btn span:nth-child(2)'], ['.bt-pl-acct', '.dzp-compte__btn'], ['.bt-pl-ddbackdrop', '.dzp-fond-menu'], ['.bt-pl-sp', '.dzp-panneau-stat'], ['.bt-pl-mobile', '.dzp-mobile'],
];
// Planche d'essai 2a : dans la grille, la bulle du lot 1 (.dzp-bulle) devient la carte compacte (.dzp-carte) ; « heures envoyées » se lit par son repère
// stable (data-etat="envoyee" + data-testid="bubble-hours"), commun à la carte de la grille et à la bulle du téléphone : même élément, même information.
const gReperes = (s) => REPERES.reduce((acc, [de, vers]) => acc.replace(new RegExp(`${de.replace(/[.\\^$*+?()[\]{}|]/g, '\\$&')}(?![\\w-])`, 'g'), vers), s);

/** Ouvre « Plus ⋯ » s'il ne l'est pas : Coût chantiers, Versions, Interventions supprimées, Formations et Envoyer par e-mail y sont des lignes (un seul accès par fonction). */
const AIDE = "const ouvrirPlus = async (pg) => { if (!(await pg.locator('[data-testid=menu-plus]').count())) { await pg.click('[data-testid=bar-plus]'); } await pg.waitForTimeout(150); };\n";

const args = process.argv.slice(2);
const mode = args.includes('--v1') ? 'v1' : 'ui2';
const demandes = args.filter((a) => !a.startsWith('--'));
const noms = demandes.length ? demandes : SCRIPTS_BUREAU;

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const nom of noms) {
    const f = path.join(DOSSIER, `${nom}.mjs`);
    if (!fs.existsSync(f)) { console.error(`inconnu : ${nom}`); process.exit(2); }
    let s = fs.readFileSync(f, 'utf8');
    if (mode === 'v1') {
      fs.writeFileSync(path.join(DOSSIER, `ui1b-${nom}.mjs`), `// COPIE GÉNÉRÉE par scripts/tests/ui2-bureau-copies.mjs --v1 depuis ${nom}.mjs : l'original + \`?ui=1\` (référence de l'ancien bureau). Ne pas modifier à la main.\n${gDrapeau(1)(s)}`);
      console.log(`ui1b-${nom}.mjs`); continue;
    }
    s = gReperes(gDrapeau(2)(s));
    let n = 0;
    for (const [avant, apres, raison] of ADAPTATIONS[nom] || []) {
      const hits = typeof avant === 'string' ? s.split(avant).length - 1 : (s.match(avant) || []).length;
      if (!hits) { console.error(`${nom} : adaptation sans effet (${raison}) : ${String(avant).slice(0, 80)}`); process.exit(3); }
      s = typeof avant === 'string' ? s.split(avant).join(apres) : s.replace(avant, apres);
      n++;
    }
    fs.writeFileSync(path.join(DOSSIER, `ui2b-${nom}.mjs`), `// COPIE GÉNÉRÉE par scripts/tests/ui2-bureau-copies.mjs depuis ${nom}.mjs : /admin?ui=2 + ${n} adaptation(s) de la table (voir le générateur). Ne pas modifier à la main.\n${AIDE}${s}`);
    console.log(`ui2b-${nom}.mjs (${n} adaptation(s))`);
  }
}
