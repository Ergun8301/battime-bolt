// `deno test --allow-read supabase/functions/_shared/export-verrou.test.ts` (npm run test:export-alerte-regles)
// Lot 18 — alerte avant l'export d'équipe qui VERROUILLE : qui est verrouillé, comptes N / M,
// quand on prévient, ce qu'on écrit. Plus quelques tests STATIQUES (lecture du source) qui gardent
// les garanties du lot : un seul endroit verrouille, après le fichier ; même filtre pour l'alerte
// et le verrou ; l'alerte n'importe ni Excel ni PDF.
import {
  alerteNecessaire, choixSansVerrou, compterVerrou, libellePeriode, memeCompte, messageFinExport,
  phraseDejaVerrouillees, phraseVerrou, STATUTS_EXPORTES, type CompteVerrou,
} from '../../../lib/export-verrou.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const L = (user_id: string, locked?: boolean | null) => ({ user_id, locked });

// ─── Comptes N (lignes) et M (salariés) ────────────────────────────────────────

Deno.test('compte : N = lignes pas encore verrouillées, M = salariés distincts de ces lignes', () => {
  eq(compterVerrou([L('a', false), L('a', false), L('b', false), L('c', false)]), { lignes: 4, salaries: 3, dejaVerrouillees: 0 }, '4 lignes, 3 salariés');
  eq(compterVerrou([L('a', false)]), { lignes: 1, salaries: 1, dejaVerrouillees: 0 }, 'une seule ligne');
  eq(compterVerrou([L('a'), L('b', null)]), { lignes: 2, salaries: 2, dejaVerrouillees: 0 }, 'locked absent ou nul = pas verrouillée');
});

Deno.test('compte : une ligne déjà verrouillée n’est pas « verrouillée par cet export » (comptée à part)', () => {
  eq(compterVerrou([L('a', true), L('a', false), L('b', true)]), { lignes: 1, salaries: 1, dejaVerrouillees: 2 }, 'a : 1 ligne à verrouiller, 2 déjà faites');
  // Un salarié dont TOUTES les lignes sont déjà verrouillées ne compte pas dans M.
  eq(compterVerrou([L('a', true), L('b', false)]).salaries, 1, 'seul b est concerné');
  eq(compterVerrou([L('a', true), L('b', true)]), { lignes: 0, salaries: 0, dejaVerrouillees: 2 }, 'tout est déjà verrouillé : rien à verrouiller');
});

Deno.test('compte : aucune ligne = zéro partout', () => {
  eq(compterVerrou([]), { lignes: 0, salaries: 0, dejaVerrouillees: 0 }, 'vide');
});

Deno.test('compte : exact sur un gros mois (1300 lignes, 30 salariés, 2 chantiers par jour)', () => {
  // u0, u10 et u20 reçoivent toutes les lignes dont le rang est multiple de 10 : toutes déjà verrouillées.
  const rows = Array.from({ length: 1300 }, (_, i) => L(`u${i % 30}`, i % 10 === 0));
  const c = compterVerrou(rows);
  eq(c.dejaVerrouillees, 130, '1 ligne sur 10 déjà verrouillée');
  eq(c.lignes, 1170, 'les autres');
  eq(c.salaries, 27, 'u0, u10 et u20 n’ont QUE des lignes déjà verrouillées : ils ne comptent pas');
});

// ─── Quand prévenir ────────────────────────────────────────────────────────────

Deno.test('alerte : dès qu’une ligne va être verrouillée, jamais pour rien', () => {
  const un: CompteVerrou = { lignes: 1, salaries: 1, dejaVerrouillees: 0 };
  const rien: CompteVerrou = { lignes: 0, salaries: 0, dejaVerrouillees: 0 };
  const toutFait: CompteVerrou = { lignes: 0, salaries: 0, dejaVerrouillees: 12 };
  ok(alerteNecessaire(un, { support: false }), '1 ligne : alerte');
  ok(!alerteNecessaire(rien, { support: false }), '0 ligne : pas d’alerte');
  ok(!alerteNecessaire(toutFait, { support: false }), 'tout est déjà verrouillé : pas d’alerte');
  ok(!alerteNecessaire(un, { support: true }), 'mode support (lecture seule) : pas d’alerte');
});

Deno.test('alerte : deux comptes identiques seulement s’ils disent la même chose', () => {
  const a: CompteVerrou = { lignes: 4, salaries: 3, dejaVerrouillees: 1 };
  ok(memeCompte(a, { ...a }), 'identiques');
  ok(!memeCompte(a, { ...a, lignes: 5 }), 'une ligne de plus');
  ok(!memeCompte(a, { ...a, salaries: 4 }), 'un salarié de plus');
  ok(!memeCompte(a, { ...a, dejaVerrouillees: 0 }), 'une ligne de moins déjà verrouillée');
});

Deno.test('« sans verrouiller » : pour un fichier téléchargé, jamais pour l’envoi au comptable', () => {
  for (const k of ['excel', 'pdf', 'csv'] as const) ok(choixSansVerrou(k), `${k} : export de contrôle possible`);
  ok(!choixSansVerrou('comptable'), 'comptable : l’envoi écrit en base et part par e-mail, pas un contrôle');
});

Deno.test('seules les heures envoyées ou validées sont exportées (donc verrouillées)', () => {
  eq([...STATUTS_EXPORTES], ['submitted', 'validated'], 'ni brouillon, ni intervention retirée');
});

// ─── Les mots ──────────────────────────────────────────────────────────────────

Deno.test('période : « du … au … » ou « le … », en jj/MM/aaaa', () => {
  eq(libellePeriode('2026-10-01', '2026-10-31'), 'du 01/10/2026 au 31/10/2026', 'un mois');
  eq(libellePeriode('2026-10-13', '2026-10-13'), 'le 13/10/2026', 'un jour');
  eq(libellePeriode('2026-12-28', '2027-01-03'), 'du 28/12/2026 au 03/01/2027', 'à cheval sur l’année');
});

Deno.test('phrase : « Cet export va verrouiller N lignes d’heures de M salariés (période …). Ils ne pourront plus les modifier. »', () => {
  const p = 'du 01/10/2026 au 31/10/2026';
  eq(phraseVerrou({ lignes: 42, salaries: 6, dejaVerrouillees: 0 }, p),
    'Cet export va verrouiller 42 lignes d’heures de 6 salariés (période du 01/10/2026 au 31/10/2026). Ils ne pourront plus les modifier.', 'pluriel');
  eq(phraseVerrou({ lignes: 5, salaries: 1, dejaVerrouillees: 0 }, p),
    'Cet export va verrouiller 5 lignes d’heures de 1 salarié (période du 01/10/2026 au 31/10/2026). Il ne pourra plus les modifier.', 'un salarié, plusieurs lignes');
  eq(phraseVerrou({ lignes: 1, salaries: 1, dejaVerrouillees: 0 }, 'le 13/10/2026'),
    'Cet export va verrouiller 1 ligne d’heures de 1 salarié (période le 13/10/2026). Il ne pourra plus la modifier.', 'une ligne');
});

Deno.test('lignes déjà verrouillées : dites seulement s’il y en a, au singulier comme au pluriel', () => {
  eq(phraseDejaVerrouillees({ lignes: 3, salaries: 2, dejaVerrouillees: 0 }), '', 'aucune : rien à dire');
  eq(phraseDejaVerrouillees({ lignes: 3, salaries: 2, dejaVerrouillees: 1 }), '1 autre ligne de la période est déjà verrouillée : elle le reste.', 'une');
  eq(phraseDejaVerrouillees({ lignes: 3, salaries: 2, dejaVerrouillees: 4 }), '4 autres lignes de la période sont déjà verrouillées : elles le restent.', 'plusieurs');
});

Deno.test('message de fin : le texte d’avant le lot 18 quand on verrouille, « rien n’a été verrouillé » sinon', () => {
  eq(messageFinExport({ kind: 'excel', verrouille: true, saisies: 12 }), 'Export téléchargé — 12 saisies verrouillées', 'Excel');
  eq(messageFinExport({ kind: 'pdf', verrouille: true, saisies: 1 }), 'Export téléchargé — 1 saisie verrouillée', 'PDF, singulier');
  eq(messageFinExport({ kind: 'csv', verrouille: true, saisies: 7 }), 'CSV de paie téléchargé — 7 saisies verrouillées', 'CSV');
  eq(messageFinExport({ kind: 'comptable', verrouille: true, saisies: 3, envoi: 'Envoyé à c@x.fr' }), 'Envoyé à c@x.fr — 3 saisies verrouillées', 'comptable');
  eq(messageFinExport({ kind: 'csv', verrouille: false, saisies: 7 }), 'CSV de paie téléchargé — rien n’a été verrouillé', 'CSV sans verrou');
  eq(messageFinExport({ kind: 'excel', verrouille: false, saisies: 7 }), 'Export téléchargé — rien n’a été verrouillé', 'Excel sans verrou');
});

// ─── Garanties du code (lecture du source, sans commentaires) ──────────────────

const lire = (f: string) => Deno.readTextFile(new URL(f, import.meta.url)).then((t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'));

Deno.test('un SEUL endroit verrouille (locked: true), dans l’export d’équipe, APRÈS le fichier et seulement si on le demande', async () => {
  const dirs = ['../../../components', '../../../lib', '../../../app'];
  const hits: string[] = [];
  const walk = async (d: string) => {
    for await (const e of Deno.readDir(new URL(d + '/', import.meta.url))) {
      if (e.isDirectory) { await walk(`${d}/${e.name}`); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (/\blocked:\s*true/.test(await lire(`${d}/${e.name}`))) hits.push(`${d}/${e.name}`);
    }
  };
  for (const d of dirs) await walk(d);
  eq(hits, ['../../../components/admin-planning.tsx'], 'seul admin-planning.tsx écrit locked: true (la fiche salarié ne verrouille rien)');
  const src = await lire('../../../components/admin-planning.tsx');
  const run = src.slice(src.indexOf('const runExport = async'), src.indexOf('const demanderExport = async'));
  const verrou = run.indexOf('locked: true');
  ok(verrou > 0, 'le verrou est dans runExport');
  for (const gen of ['exportEntriesToExcel(entries', 'exportEntriesToCSV(', 'exportEntriesToPDF(entries', 'excelAsBase64(entries']) {
    ok(run.indexOf(gen) > 0 && run.indexOf(gen) < verrou, `${gen} : le fichier est fait AVANT le verrou`);
  }
  ok(/if \(verrouiller\) \{[\s\S]*?update\(\{ exported_at: stamp, locked: true \}\)/.test(run), 'le verrou n’est posé que dans « if (verrouiller) »');
  ok((run.match(/\.update\(/g) || []).length === 1, 'runExport n’écrit qu’une chose : le verrou');
  ok(/const verrouiller = \(o\.verrouiller \?\? true\) && !enModeSupport\(\)/.test(run) && /const enModeSupport = \(\) => \{ const s = readSupportSession\(\); return !!s && s\.staffId === user\?\.id; \}/.test(src), 'par défaut on verrouille (comme avant) ; en mode support, jamais');
});

Deno.test('l’alerte et le verrou partagent UN filtre (statuts, entreprise, période) : le N annoncé est le N verrouillé', async () => {
  const lignes = await lire('../../../lib/export-lignes.ts');
  ok(/\.eq\('company_id', companyId\)\s*\.in\('status', \[\.\.\.STATUTS_EXPORTES\]\)\s*\.gte\('work_date', from\)\.lte\('work_date', to\)/.test(lignes), 'le filtre est défini une fois');
  ok(/lignesExportees\(companyId, from, to, 'id, user_id, locked'\)/.test(lignes), 'le compte de l’alerte passe par ce filtre');
  const src = await lire('../../../components/admin-planning.tsx');
  const run = src.slice(src.indexOf('const runExport = async'), src.indexOf('const demanderExport = async'));
  ok(/lignesExportees\(user\.company_id, from, to,/.test(run), 'le fichier et le verrou lisent les heures par le même filtre');
  ok(!/\.in\('status', \['submitted', 'validated'\]\)\s*\.gte\('work_date', from\)/.test(run), 'plus de filtre recopié à la main pour les lignes exportées');
});

Deno.test('« Exporter » (menu) et « Envoyer au comptable » passent par l’alerte, jamais directement par runExport', async () => {
  const src = await lire('../../../components/admin-planning.tsx');
  ok(/<ExportMenu onPick=\{\(k\) => demanderExport\(k, 'team-export-menu'\)\}/.test(src), 'menu → demanderExport');
  ok(/onClick=\{\(\) => demanderExport\('comptable', 'send-accountant'\)\}/.test(src), 'comptable → demanderExport');
  ok(!/onPick=\{\(k\) => runExport|onClick=\{\(\) => runExport/.test(src), 'aucun appel direct à runExport depuis l’écran');
  ok((src.match(/runExport\(/g) || []).length === 3, 'runExport : 2 appels sans alerte (rien à verrouiller / mode support) et l’appel du choix du bureau');
});

Deno.test('la fiche d’un seul salarié ne verrouille rien (donc pas d’alerte)', async () => {
  const src = await lire('../../../components/worker-detail.tsx');
  ok(!/\blocked:\s*true|exported_at:\s*(stamp|new Date)/.test(src), 'worker-detail n’écrit ni locked ni exported_at');
  const doExport = src.slice(src.indexOf('const doExport = async'), src.indexOf('const saveWorker = async'));
  ok(!/\.update\(|\.upsert\(|\.insert\(|\.rpc\(/.test(doExport), 'doExport n’écrit rien en base');
});

Deno.test('l’alerte est légère : elle n’importe ni Excel, ni PDF, ni les outils d’export (chargés par le menu)', async () => {
  for (const f of ['../../../components/export-verrou-dialog.tsx', '../../../lib/export-verrou.ts', '../../../lib/export-lignes.ts']) {
    const src = await lire(f);
    ok(!/from\s+['"](xlsx|jspdf|jspdf-autotable|html2canvas)['"]|import\(['"](xlsx|jspdf)/.test(src), `${f} : aucune bibliothèque d’export`);
    ok(!/export-utils/.test(src), `${f} : n’importe pas lib/export-utils`);
    ok(!/\.delete\(|\.remove\(/.test(src), `${f} : aucune suppression`);
  }
  const adm = await lire('../../../components/admin-planning.tsx');
  ok(/const ExportVerrou = lazyWindow\(\(\) => import\('@\/components\/export-verrou-dialog'\)/.test(adm), 'chargée à l’ouverture (lazyWindow)');
  ok(!/import ExportVerrou|from '@\/components\/export-verrou-dialog'/.test(adm.replace(/import type \{ VerrouAsk \} from '@\/components\/export-verrou-dialog';/, '')), 'jamais importée en statique (seul le type l’est)');
});

Deno.test('l’alerte est accessible : fenêtre d’alerte, Annuler en premier focus, retour du focus, boutons de 44 px', async () => {
  const src = await lire('../../../components/export-verrou-dialog.tsx');
  ok(/AlertDialogContent/.test(src) && /AlertDialogCancel/.test(src), 'fenêtre d’alerte avec « Annuler » (focus de départ)');
  ok(/onCloseAutoFocus/.test(src) && /el\.focus\(\)/.test(src), 'le focus revient au bouton qui a lancé l’export');
  ok((src.match(/h-11 w-full/g) || []).length === 3, 'trois boutons de 44 px de haut');
  ok(/data-testid="export-verrou-confirm"/.test(src) && /data-testid="export-verrou-sans"/.test(src) && /data-testid="export-verrou-annuler"/.test(src), 'trois choix repérables');
});
