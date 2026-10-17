// Scanner de l'interface (livraison 3a-1) : chaque type de clé de surface (§2.3) est éprouvé sur des sources de poche
// (cas positif, cas négatif, cas piégeux : commentaire qui cite « .rpc('x') », chaîne, import de type, fichier de
// test), puis le scanner est lancé sur le dépôt RÉEL et ses comptes sont comparés aux mesures du 15/10 (§0.2) et à
// la fonction `anchors()` d'admin-tours.test.ts. Chaque écart avec le §0.2 est expliqué à l'endroit où il est testé.
//   npm run test:registre   (npx -y deno@2 test --allow-env --allow-read supabase/functions/_shared/registre-surfaces.test.ts)
import { comptes, estFichierDeTest, grouperParCle, masquer, routeDe, scannerSurfaces, TYPES_CLE, type ResultatScan, type TypeCle } from './registre-surfaces.ts';
import { formaterJson, formaterTexte, lireSources } from './registre-surfaces-cli.ts';

// ── Petits outils ───────────────────────────────────────────────────────────

const src = (...lignes: string[]) => lignes.join('\n');
const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const cles = (res: ResultatScan, type: TypeCle): string[] => Array.from(new Set(res.occurrences.filter((o) => o.type === type).map((o) => o.cle))).sort();
const lieux = (res: ResultatScan, cle: string): string[] => res.occurrences.filter((o) => o.cle === cle).map((o) => `${o.fichier}:${o.ligne}`);
const scan = (sources: Record<string, string>) => scannerSurfaces(sources);

// ── fenetre:<module> ────────────────────────────────────────────────────────

Deno.test('fenetre : lazyWindow, dynamic et dynamic(chargeur) ; ni import de type, ni import nu, ni commentaire, ni chaîne', () => {
  const res = scan({
    'app/poseur/page.tsx': src(
      "import { lazyWindow } from '@/lib/lazy-window';",                                                    // 1
      "import dynamic from 'next/dynamic';",                                                               // 2
      "import type { Props } from '@/components/type-seulement';",                                         // 3 import de type
      "type Feuille = typeof import('@/components/feuille-imprimee');",                                    // 4 type d'un import
      "const A = lazyWindow<Props>(() => import('@/components/fenetre-a'), { isOpen: () => true });",      // 5 générique
      "const B = dynamic(() => import('@/components/fenetre-b'), { ssr: false });",                        // 6
      "const chargeurC = () => import('@/components/fenetre-c');",                                         // 7 pas une fenêtre à lui seul…
      "const C = dynamic(chargeurC, { ssr: false });",                                                     // 8 …c'est dynamic(chargeur) qui en fait une
      "const D = lazyWindow(async () => import('@/components/fenetre-d'), { isOpen: () => true });",       // 9
      "const paresseux = () => import('@/components/pas-une-fenetre');",                                   // 10 jamais enveloppé
      "// const E = lazyWindow(() => import('@/components/fantome-commentaire'));",                        // 11
      "const s = \"dynamic(() => import('@/components/fantome-chaine'))\";",                               // 12
      "export const F = dynamic(proprieteInconnue, { ssr: false });",                                      // 13 chargeur illisible : fenetre:?
      "const G = lazyWindow(() => { return import('@/components/en-bloc'); }, {});",                       // 14 corps en bloc : illisible aussi
      "const H = config.dynamic(parametre);",                                                              // 15 .dynamic d'un autre objet
    ),
    'components/autre.tsx': "const A2 = dynamic(() => import('@/components/fenetre-a'), { ssr: false });",   // même module, un autre fichier
    'lib/lazy-window.tsx': 'export function lazyWindow<P extends object>(loader: () => Promise<{ default: P }>, o: unknown) { return loader; }',
  });
  egal(cles(res, 'fenetre'), ['fenetre:?', 'fenetre:fenetre-a', 'fenetre:fenetre-b', 'fenetre:fenetre-c', 'fenetre:fenetre-d'], 'les quatre fenêtres, et fenetre:? pour un chargeur illisible');
  egal(lieux(res, 'fenetre:?'), ['app/poseur/page.tsx:13', 'app/poseur/page.tsx:14'], 'jamais d\'oubli silencieux (ni la définition de lazyWindow, ni config.dynamic)');
  egal(lieux(res, 'fenetre:fenetre-a'), ['app/poseur/page.tsx:5', 'components/autre.tsx:1'], 'un module chargé de deux endroits : une clé, deux lieux');
  egal(lieux(res, 'fenetre:fenetre-c'), ['app/poseur/page.tsx:8'], 'la ligne de dynamic(…), pas celle du chargeur');
  const via = (c: string) => res.occurrences.filter((o) => o.cle === c).map((o) => o.via);
  egal([via('fenetre:fenetre-a'), via('fenetre:fenetre-b'), via('fenetre:fenetre-d')], [['lazyWindow', 'dynamic'], ['dynamic'], ['lazyWindow']], 'le chargeur est noté (22 lazyWindow + dynamic, §0.2)');
});

// ── dialogue:<fichier>#<expr> ───────────────────────────────────────────────

Deno.test('dialogue : Dialog / AlertDialog / Sheet / Popover / DropdownMenu avec open ; hors components/ui/ et hors modules fenêtres', () => {
  const res = scan({
    'components/ecran.tsx': src(
      'export function Ecran() {',                                                                        // 1
      '  return (<>',                                                                                      // 2
      '    <Dialog open={ouvert} onOpenChange={setOuvert}>x</Dialog>',                                    // 3
      '    <AlertDialog open={!!cible} onOpenChange={(o) => { if (!o) setCible(null); }}>x</AlertDialog>', // 4
      '    <Sheet',                                                                                        // 5 balise sur plusieurs lignes
      '      className="a"',                                                                               // 6
      '      open={ menu }',                                                                               // 7
      '      onOpenChange={setMenu}>x</Sheet>',                                                            // 8
      '    <Popover open={p}>x</Popover>',                                                                // 9
      '    <DropdownMenu open={m}>x</DropdownMenu>',                                                      // 10
      '    <Dialog open>x</Dialog>',                                                                       // 11 toujours ouverte
      '    <Dialog onOpenChange={() => <Autre open={faux} />}>x</Dialog>',                                // 12 open d'un ENFANT : pas le sien
      '    <Dialog>x</Dialog>',                                                                            // 13 sans open
      '    <DialogContent open={autre}>x</DialogContent>',                                                // 14 une autre balise
      '    <details open={detail}>x</details>',                                                            // 15
      '    <MaFenetre open={perso}>x</MaFenetre>',                                                         // 16 composant maison
      '    {/* <Dialog open={commente}> */}',                                                              // 17
      '    <p>{"<Dialog open={chaine}>"}</p>',                                                             // 18
      '  </>);',
      '}',
    ),
    'components/ui/primitive.tsx': '<Popover open={interne}>x</Popover>',                              // hors components/ui/
    'components/fenetre-x.tsx': src('<Dialog open={racine}>x</Dialog>', '<Popover open={souseEcran}>y</Popover>'),
    'app/page.tsx': "const X = lazyWindow(() => import('@/components/fenetre-x'), { isOpen: (p) => p.open });",
  });
  egal(cles(res, 'dialogue'), [
    'dialogue:components/ecran#!!cible', 'dialogue:components/ecran#m', 'dialogue:components/ecran#menu', 'dialogue:components/ecran#ouvert',
    'dialogue:components/ecran#p', 'dialogue:components/ecran#true',
  ], 'six dialogues de components/ecran.tsx');
  egal(lieux(res, 'dialogue:components/ecran#menu'), ['components/ecran.tsx:5'], 'multi-ligne : la ligne de la balise');
  egal(res.dialoguesDeFenetre.map((o) => o.cle).sort(), ['dialogue:components/fenetre-x#racine', 'dialogue:components/fenetre-x#souseEcran'],
    'les dialogues d\'un module fenêtre sont rendus à part (jamais perdus en silence)');
});

// ── rpc:<nom> ───────────────────────────────────────────────────────────────

Deno.test('rpc : appel littéral ; ni commentaire, ni chaîne, ni modèle, ni .rpcMaison ; nom calculé = rpc:? ou déclaré', () => {
  const res = scan({
    'lib/appels.ts': src(
      "const a = await supabase.rpc('set_user_role', { x: 1 });",                                          // 1
      "const b = await supabase.rpc<Role>('typee');",                                                       // 2 générique
      'const c = await client?.rpc(',                                                                       // 3
      "  'multi_ligne',",                                                                                   // 4
      '  {},',
      ');',
      "// await supabase.rpc('commente_ligne');",                                                           // 7
      "/* supabase.rpc('commente_bloc') */",                                                                // 8
      "const d = \"supabase.rpc('dans_chaine')\";",                                                         // 9
      "const e = `supabase.rpc('dans_modele')`;",                                                           // 10
      "const f = `${await supabase.rpc('dans_interpolation')}`;",                                           // 11 un VRAI appel
      "const g = supabase.rpcMaison('pas_un_rpc');",                                                        // 12
      "const h = rpc('sans_point');",                                                                       // 13
      'const i = await supabase.rpc(nomCalcule, {});',                                                     // 14 rpc:?
      '// registre:rpc=declare_a, declare_b',                                                               // 15
      'const j = await supabase.rpc(autreNom);',                                                           // 16 déclaré
    ),
    'components/ecran.test.tsx': "supabase.rpc('dans_un_test');",
  });
  egal(cles(res, 'rpc'), ['rpc:?', 'rpc:dans_interpolation', 'rpc:declare_a', 'rpc:declare_b', 'rpc:multi_ligne', 'rpc:set_user_role', 'rpc:typee'], 'les appels réels seulement');
  egal(lieux(res, 'rpc:?'), ['lib/appels.ts:14'], 'un nom calculé sans déclaration ressort en rpc:? (que T1 refuse)');
  egal(lieux(res, 'rpc:declare_b'), ['lib/appels.ts:16'], 'la déclaration juste avant s\'applique');
  egal(lieux(res, 'rpc:multi_ligne'), ['lib/appels.ts:3'], 'multi-ligne : la ligne de .rpc(');
});

// ── fn:<nom> ────────────────────────────────────────────────────────────────

Deno.test('fn : functions.invoke(\'nom\') ; ni autre .invoke, ni commentaire, ni chaîne ; nom calculé = fn:?', () => {
  const res = scan({
    'lib/appels.ts': src(
      "await supabase.functions.invoke('send-push', { body });",                                           // 1
      "const r = await supabase.functions.invoke<Rep>('kiosk', { body });",                                 // 2
      'await supabase.functions.invoke(nom, {});',                                                          // 3 fn:?
      "await commande.invoke('pas-une-fonction');",                                                         // 4
      "// supabase.functions.invoke('commente');",                                                          // 5
      "const t = \"functions.invoke('chaine')\";",                                                          // 6
      "await supabase.functions.invoke(",                                                                   // 7
      "  'send-push',",                                                                                     // 8
      ");",
    ),
  });
  egal(cles(res, 'fn'), ['fn:?', 'fn:kiosk', 'fn:send-push'], 'trois clés');
  egal(lieux(res, 'fn:send-push'), ['lib/appels.ts:1', 'lib/appels.ts:7'], 'deux appels de la même fonction');
  egal(lieux(res, 'fn:?'), ['lib/appels.ts:3'], 'nom calculé');
});

// ── table:<t>:<op> ──────────────────────────────────────────────────────────

Deno.test('table : .from(\'t\') suivi de insert/update/delete/upsert ; lectures, storage, Array.from, Map.delete exclus ; .from(variable) = table:? ou déclaré', () => {
  const res = scan({
    'lib/ecritures.ts': src(
      "await supabase.from('worksites').update({ a: 1 }).eq('id', id);",                                    // 1
      'await supabase',                                                                                     // 2
      "  .from('planning') // une note entre les deux",                                                    // 3
      '  .insert(rows);',                                                                                   // 4
      "await supabase.from('time_entries').select('*').eq('id', 1);",                                       // 5 lecture
      'await supabase.from(`documents`).delete().eq(\'id\', 1);',                                           // 6 modèle sans ${}
      'const l = Array.from(valeurs).map(f);',                                                              // 7
      "await supabase.storage.from('bucket').upload(path, file, { upsert: true });",                        // 8 storage ; upsert est une OPTION
      "const m = new Map(); m.delete(cle); lots.delete(x); set.update(1);",                                 // 9
      "// await supabase.from('commentee').insert({});",                                                    // 10
      "const s = \"supabase.from('chaine').insert({})\";",                                                  // 11
      'await supabase.from(table).upsert(part);',                                                           // 12 table:?:upsert
      '// registre:tables=expenses, certifications',                                                        // 13
      "await supabase.from(variable).delete().eq('id', 1);",                                                // 14 déclaré : deux tables
      '// registre:tables=trop_loin',                                                                       // 15
      'await autreChose();',                                                                                // 16 un « ; » sépare : plus « juste avant »
      'await supabase.from(autre).update({});',                                                             // 17 table:?:update
      "await supabase.from('worksites').upsert(x);",                                                        // 18
      "await supabase.storage.from('bucket').update(path, file);",                                          // 19 storage.update remplace un FICHIER, pas une ligne
    ),
  });
  egal(cles(res, 'table'), [
    'table:?:update', 'table:?:upsert', 'table:certifications:delete', 'table:documents:delete', 'table:expenses:delete', 'table:planning:insert',
    'table:worksites:update', 'table:worksites:upsert',
  ], 'les écritures réelles, un nom calculé = ?');
  egal(lieux(res, 'table:planning:insert'), ['lib/ecritures.ts:3'], 'multi-ligne : la ligne de .from(');
  egal(lieux(res, 'table:?:upsert'), ['lib/ecritures.ts:12'], 'le .from(variable) sans déclaration');
  egal(lieux(res, 'table:?:update'), ['lib/ecritures.ts:17'], 'une déclaration séparée par un « ; » ne compte plus');
});

// ── ecriture:<fichier>#<fn> ─────────────────────────────────────────────────

Deno.test('ecriture : exports de lib/ dont le corps écrit ou appelle .rpc( (aide non exportée comprise) ; lectures, constantes, types, composants exclus', () => {
  const res = scan({
    'lib/ecritures.ts': src(
      "import { supabase } from '@/lib/supabase';",                                                         // 1
      'export const LIMITE = 10;',                                                                          // 2 une constante n'écrit pas…
      "const aide = async (id: string) => { await supabase.from('t').update({}).eq('id', id); };",          // 3 …même posée juste avant une aide qui écrit
      "export async function lireTout() { const { data } = await supabase.from('t').select('*'); return data; }", // 4 lecture
      'export async function enregistrer(id: string) {',                                                    // 5 écrit par l'aide
      '  await aide(id);',
      '}',
      'export const supprimer = async (id: string) => {',                                                   // 8
      "  await supabase.from('t').delete().eq('id', id);",
      '};',
      "export async function appeler() { return supabase.rpc('faire'); }",                                  // 11
      "export function compter(m: Map<string, number>) { m.delete('x'); }",                                 // 12 Map.delete
      "// export async function fantome() { await supabase.rpc('y'); }",                                    // 13
      'export type Ligne = { update: () => void };',                                                         // 14
      "export default async function () { await supabase.rpc('defaut'); }",                                 // 15
      "export function indirect() { return enregistrer('1'); }",                                           // 16 appelle un export qui écrit : écrit aussi
    ),
    'components/pas-lib.tsx': "export function Bouton() { return supabase.from('t').insert({}); }",       // pas un module de lib/
    'lib/types.ts': 'export interface Rien { update: boolean }',
  });
  egal(cles(res, 'ecriture'), [
    'ecriture:lib/ecritures#appeler', 'ecriture:lib/ecritures#default', 'ecriture:lib/ecritures#enregistrer', 'ecriture:lib/ecritures#indirect', 'ecriture:lib/ecritures#supprimer',
  ], 'quatre exports qui écrivent + un qui appelle un export qui écrit');
  egal(lieux(res, 'ecriture:lib/ecritures#enregistrer'), ['lib/ecritures.ts:5'], 'la ligne de la déclaration exportée');
});

// ── ancre:<valeur> · ancre-dynamique:<fichier>:<ligne> ──────────────────────

Deno.test('ancre : data-guide / guide= littéraux ; expressions = ancre-dynamique ; data-guide-confirm, chaînes, commentaires exclus', () => {
  const res = scan({
    'components/guides.tsx': src(
      '<button data-guide="a.simple">x</button>',                                                           // 1
      "<button data-guide={'b.accolades'}>x</button>",                                                      // 2
      "<button data-guide={ok ? 'c.vrai' : undefined}>x</button>",                                          // 3
      "<button data-guide={isOther ? 'd.autre' : 'd.chantier'}>x</button>",                                 // 4
      '<Rubrique guide="e.prop" />',                                                                        // 5 la prop guide=
      '<button data-guide={guide}>x</button>',                                                              // 6 dynamique
      '<button data-guide={MENU[t.value]}>x</button>',                                                      // 7 dynamique
      '<button data-guide={`f.${suffixe}`}>x</button>',                                                     // 8 dynamique (modèle avec ${})
      "<button data-guide={x ? 'g.mixte' : autre}>x</button>",                                              // 9 littéral ET dynamique
      "<button data-guide={cond && 'h.et'}>x</button>",                                                     // 10
      '<dialog data-guide-confirm>x</dialog>',                                                              // 11 marqueur, pas une ancre
      '<div data-guide-ui data-testid="x">x</div>',                                                         // 12
      "document.querySelector('[data-guide=\"i.chaine\"]');",                                               // 13
      '{/* <b data-guide="j.commente"> */}',                                                                // 14
      "const style = { guide: 'k.objet' };",                                                                // 15 pas un attribut
      "<b data-guide={ok ? undefined : null}>x</b>",                                                        // 16 rien du tout
      "<b data-guide={appel('l.appel')}>x</b>",                                                             // 17 dynamique
      '<Foo noguide="m.non" aria-guide="n.non" />',                                                         // 18 d\'autres attributs
    ),
  });
  egal(cles(res, 'ancre'), ['ancre:a.simple', 'ancre:b.accolades', 'ancre:c.vrai', 'ancre:d.autre', 'ancre:d.chantier', 'ancre:e.prop', 'ancre:g.mixte', 'ancre:h.et'], 'les littéraux');
  egal(cles(res, 'ancre-dynamique'), [
    'ancre-dynamique:components/guides.tsx:17', 'ancre-dynamique:components/guides.tsx:6', 'ancre-dynamique:components/guides.tsx:7',
    'ancre-dynamique:components/guides.tsx:8', 'ancre-dynamique:components/guides.tsx:9',
  ], 'les expressions que le scanner ne sait pas lire, avec fichier:ligne');
});

// ── route:<chemin> ──────────────────────────────────────────────────────────

Deno.test('route : app/**/page.tsx ; groupes retirés, segments dynamiques gardés ; layout, page hors app/ et page de test exclus', () => {
  const vide = 'export default function P() { return null; }';
  const res = scan({
    'app/page.tsx': vide, 'app/admin/page.tsx': vide, 'app/(public)/cgu/page.tsx': vide, 'app/produit/[id]/page.tsx': vide,
    'app/admin/layout.tsx': vide, 'components/page.tsx': vide, 'app/admin/page.test.tsx': vide, 'app/robots.ts': vide,
  });
  egal(cles(res, 'route'), ['route:/', 'route:/admin', 'route:/cgu', 'route:/produit/[id]'], 'quatre pages');
  egal([routeDe('app/page.tsx'), routeDe('app/a/b/page.tsx'), routeDe('app/a/layout.tsx'), routeDe('lib/page.tsx')], ['/', '/a/b', null, null], 'routeDe');
});

// ── Gestionnaires (T10) ─────────────────────────────────────────────────────

Deno.test('clics : onClick / onSelect / onSubmit posés en JSX, par fichier ; ni type, ni commentaire, ni chaîne, ni onClickOutside', () => {
  const res = scan({
    'components/boutons.tsx': src(
      '<button onClick={a}>x</button>',                                                                     // 1
      '<li onSelect={b} />',                                                                                // 2
      '<form onSubmit={c}>',                                                                                // 3
      '// <b onClick={commente}>',                                                                          // 4
      "const s = '<b onClick={chaine}>';",                                                                  // 5
      'type P = { onClick?: () => void; onSubmit: () => void };',                                           // 6
      '<Menu onClickOutside={d} />',                                                                        // 7
      'const { onClick = noop } = props;',                                                                  // 8
      '<b onClick = {e}>y</b>',                                                                             // 9
    ),
    'components/rien.tsx': '<div>sans gestionnaire</div>',
    'components/boutons.test.tsx': '<button onClick={deTest}>x</button>',
  });
  egal(res.clics, { 'components/boutons.tsx': 4 }, 'quatre gestionnaires, un seul fichier');
});

// ── Le lexeur ───────────────────────────────────────────────────────────────

Deno.test('masquer : mêmes longueur et lignes ; regex, apostrophe de texte JSX, balises fermantes, division, modèles imbriqués', () => {
  const texte = src(
    "const re = /['\"]/g; supabase.rpc('apres_regex');",                                                    // 1
    "<p>l'écran d'accueil</p>",                                                                             // 2 deux apostrophes de TEXTE
    "supabase.rpc('apres_apostrophe');",                                                                    // 3
    "<b>x</b> <i>y</i>{supabase.rpc('entre_balises')}<u>z</u>",                                             // 4 des « </ » qui ne sont pas des regex
    "const r = a / b; supabase.rpc('apres_division'); const q = c / d;",                                    // 5
    "const t = `a${`b${supabase.rpc('imbrique')}`}`;",                                                      // 6
    "const u = \"http://exemple.fr/ // pas un commentaire\"; supabase.rpc('apres_url');",                   // 7
    "const v = '\\'' + \"\\\"\"; supabase.rpc('apres_echappements');",                                      // 8
    "if (x) { /* un commentaire */ } supabase.rpc('apres_bloc'); // et une fin de ligne",                   // 9
    "<p>l'écran {supabase.rpc('meme_ligne')} d'aujourd'hui</p>",                                            // 10 apostrophes de texte AVANT du code, sur la même ligne
  );
  const m = masquer(texte);
  egal([m.code.length, m.nu.length], [texte.length, texte.length], 'mêmes longueurs');
  egal(m.nu.split('\n').length, texte.split('\n').length, 'mêmes lignes');
  const res = scan({ 'lib/x.ts': texte });
  egal(cles(res, 'rpc'), [
    'rpc:apres_apostrophe', 'rpc:apres_bloc', 'rpc:apres_division', 'rpc:apres_echappements', 'rpc:apres_regex', 'rpc:apres_url', 'rpc:entre_balises', 'rpc:imbrique', 'rpc:meme_ligne',
  ], 'neuf appels, tous vus malgré les pièges du lexique');
  egal(m.commentaires.map((c) => c.texte), ['/* un commentaire */', '// et une fin de ligne'], 'les deux seuls commentaires');
});

Deno.test('Fins de ligne Windows : mêmes clés, mêmes numéros de ligne', () => {
  const unix = src("const a = 1;", "// supabase.rpc('commente');", "export async function f() { await supabase.rpc('r'); }", "<b data-guide=\"a.b\" onClick={f} />");
  const windows = unix.replace(/\n/g, '\r\n');
  egal(scan({ 'lib/x.ts': windows }), scan({ 'lib/x.ts': unix }), 'CRLF = LF');
  egal(lieux(scan({ 'lib/x.ts': windows }), 'rpc:r'), ['lib/x.ts:3'], 'numéro de ligne');
});

Deno.test('Fichiers : test, spec, __tests__, .d.ts et non-TypeScript ignorés ; résultat trié et indépendant de l\'ordre des fichiers', () => {
  const appel = "supabase.rpc('x'); supabase.from('t').insert({}); <b data-guide=\"a.b\" onClick={f} />;";
  const ignores = {
    'components/ecran.test.tsx': appel, 'lib/x.spec.ts': appel, 'lib/__tests__/a.ts': appel, 'lib/types.d.ts': appel, 'lib/notes.md': appel, 'app/globals.css': appel,
  };
  const vide = scan(ignores);
  egal([vide.occurrences.length, Object.keys(vide.clics).length, vide.dialoguesDeFenetre.length], [0, 0, 0], 'rien n\'est lu');
  egal(['a.test.ts', 'a.spec.tsx', 'x/__tests__/a.ts', 'a.d.ts', 'a.ts', 'a.tsx'].map(estFichierDeTest), [true, true, true, true, false, false], 'estFichierDeTest');
  const a = { 'lib/a.ts': "supabase.rpc('a');", 'components/b.tsx': '<b data-guide="b.c" onClick={f} />', 'app/page.tsx': 'x' };
  const b = { 'app/page.tsx': 'x', 'components/b.tsx': a['components/b.tsx'], 'lib/a.ts': a['lib/a.ts'] };
  egal(scan(a), scan(b), 'même résultat quel que soit l\'ordre');
  egal(scan(a), scan(a), 'idempotent');
  egal(scan({}), { occurrences: [], clics: {}, dialoguesDeFenetre: [] }, 'sources vides');
  const types = scan(a).occurrences.map((o) => o.type);
  egal(types.slice().sort((x, y) => TYPES_CLE.indexOf(x) - TYPES_CLE.indexOf(y)), types, 'trié dans l\'ordre de TYPES_CLE');
  egal(scan({ './lib\\a.ts': "supabase.rpc('a');" }).occurrences.map((o) => o.fichier), ['lib/a.ts'], 'chemins normalisés (./ et \\)');
});

Deno.test('Rapport : texte et JSON listent chaque clé avec ses fichier:ligne', () => {
  const res = scan({ 'lib/a.ts': "supabase.rpc('a');\nsupabase.rpc('a');", 'components/b.tsx': '<b onClick={f} data-guide="b.c" />' });
  const texte = formaterTexte(res, 2);
  for (const attendu of ['(2 fichiers lus)', 'rpc:a  lib/a.ts:1 lib/a.ts:2', 'ancre:b.c  components/b.tsx:1', '   1  components/b.tsx']) {
    if (!texte.includes(attendu)) throw new Error(`le rapport texte devrait contenir « ${attendu} » :\n${texte}`);
  }
  const json = JSON.parse(formaterJson(res));
  egal(json.cles.rpc, { 'rpc:a': ['lib/a.ts:1', 'lib/a.ts:2'] }, 'JSON : clés par type');
  egal([json.comptes.rpc, json.clics], [{ cles: 1, occurrences: 2 }, { 'components/b.tsx': 1 }], 'JSON : comptes et clics');
  egal(Array.from(grouperParCle(res.occurrences).keys()), ['rpc:a', 'ancre:b.c'], 'grouperParCle garde l\'ordre');
});

// ── Le dépôt RÉEL ───────────────────────────────────────────────────────────

// Lu à la première utilisation seulement : les tests de poche ci-dessus tournent sans permission de lecture.
let depotLu: Promise<{ sources: Record<string, string>; reel: ResultatScan; parType: ReturnType<typeof comptes> }> | null = null;
const depot = () => (depotLu ??= lireSources().then((sources) => {
  const reel = scannerSurfaces(sources);
  return { sources, reel, parType: comptes(reel.occurrences) };
}));

Deno.test('Dépôt réel : le lexeur lit les 245 fichiers sans perdre une accolade, une parenthèse ni un crochet', async () => {
  const { sources } = await depot();
  if (Object.keys(sources).length < 200) throw new Error(`${Object.keys(sources).length} fichiers lus : le dépôt est introuvable ?`);
  for (const [chemin, texte] of Object.entries(sources)) {
    const m = masquer(texte);
    if (m.nu.length !== texte.length) throw new Error(`${chemin} : longueur changée`);
    for (const [ouvre, ferme] of ['{}', '()', '[]']) {
      const ecart = m.nu.split(ouvre).length - m.nu.split(ferme).length;
      // Un déséquilibre = une chaîne, un commentaire ou une regex mal délimités (le lexeur ne comprend pas le JSX).
      if (ecart !== 0) throw new Error(`${chemin} : « ${ouvre}${ferme} » déséquilibré de ${ecart} après masquage`);
    }
  }
});

/**
 * Les mesures du §0.2 (15/10/2026), recomptées. Quand une interface change, ces nombres bougent : c'est voulu (T1 dira
 * quoi rattacher). Mettez le nombre à jour ET dites pourquoi dans la PR ; ne jamais assouplir pour faire passer.
 */
Deno.test('Dépôt réel : comptes comparés au §0.2 (écarts expliqués)', async () => {
  const { reel, parType } = await depot();
  // 26 lazyWindow (§0.2 : 22 ; +4 depuis l'étape 1 du plan d'intégration du design salarié : « Mon équipe », le calendrier de
  // « Dupliquer », le formulaire de réserve et la liste des formations passent en chargement à l'ouverture ; les documents du chantier
  // avaient déjà leur clé côté bureau) + 8 dynamic (§0.2 : 7). L'écart : trainings-admin.tsx:48 écrit `dynamic(loadUploadPanel, …)` avec
  // `const loadUploadPanel = () => import('@/components/training-video-upload')` ; une expression régulière sur
  // `dynamic(() => import(` ne le voit pas, le scanner résout le chargeur nommé du même fichier.
  const fenetres = reel.occurrences.filter((o) => o.type === 'fenetre');
  const modulesVia = (v: string) => new Set(fenetres.filter((o) => o.via === v).map((o) => o.cle));
  egal([modulesVia('lazyWindow').size, modulesVia('dynamic').size], [26, 8], 'fenêtres : 26 lazyWindow + 8 dynamic (7 selon §0.2)');
  egal([fenetres.length, parType.fenetre.cles], [38, 34], 'fenêtres : 38 appels (27 + 11) pour 34 modules');
  if (!modulesVia('dynamic').has('fenetre:training-video-upload')) throw new Error('dynamic(loadUploadPanel) doit être résolu');

  // 55 `open={…}` JSX (§0.2) = 33 « dialogue » + 22 d'un module fenêtre (étape 1 du plan d'intégration du design salarié : 32 depuis
  // le retrait de la fenêtre morte « Sur quel chantier ? » de poseur-day.tsx) ; le 56e est `<Dialog open …>` sans accolades
  // (components/kiosk-pair-confirm.tsx:239, toujours ouverte), un `open=` que le §0.2 ne compte pas. components/ui/info-tip.tsx est hors compte.
  // Étape 6 (?ui=2) : « Mes congés » a sa feuille du bas dans le même fichier (un 2e `<Dialog open>` de leave-request-dialog.tsx, module fenêtre : +1 exclu, 23 → 24).
  // Design du bureau, lot 1 (?ui=2) : le menu ☰ v2 (components/design/bureau/menu-mobile-v2.tsx) est le MÊME menu que components/admin-mobile-menu.tsx, habillé par la planche : +1 dialogue (32 → 33), même capacité B72.
  egal([parType.dialogue.occurrences, reel.dialoguesDeFenetre.length], [33, 24], 'dialogues : 33 gardés, 24 exclus (modules fenêtres)');
  egal(parType.dialogue.cles, 33, 'dialogues : 33 clés (§0.2 : ≈ 35 sur 55 ; −1 avec la fenêtre morte de poseur-day.tsx ; +1 le menu ☰ v2 du bureau)');
  if (!reel.dialoguesDeFenetre.some((o) => o.fichier === 'components/kiosk-pair-confirm.tsx')) throw new Error('le `open` nu de kiosk-pair-confirm doit être vu');

  egal([parType.rpc.cles, parType.rpc.occurrences], [49, 65], 'RPC : 49 noms, 65 appels (§0.2 : 49)');
  // 10 fonctions Edge (§0.2) + `fn:?` : lib/assistant.ts:72 (invokeAssistant(name)) et lib/ia-formule.ts:16 (iaFormule(fn)) passent le nom en variable.
  egal([parType.fn.cles - 1, parType.fn.occurrences], [10, 22], 'fonctions Edge : 10 noms + fn:? (22 appels dont 2 de nom calculé)');
  egal(lieux(reel, 'fn:?'), ['lib/assistant.ts:72', 'lib/ia-formule.ts:16'], 'fn:? : les deux appels à nom calculé');
  // 42 couples (§0.2) sur 21 tables + `table:?` : lib/erase.ts:282 (upsert) et :291 (delete), annoncés par le §2.3.
  const couples = reel.occurrences.filter((o) => o.type === 'table' && !o.cle.startsWith('table:?'));
  egal([new Set(couples.map((o) => o.cle)).size, new Set(couples.map((o) => o.cle.split(':')[1])).size], [42, 21], 'tables : 42 couples sur 21 tables');
  egal(parType.table.occurrences - couples.length, 2, 'table:? : deux appels');
  egal([...lieux(reel, 'table:?:upsert'), ...lieux(reel, 'table:?:delete')], ['lib/erase.ts:282', 'lib/erase.ts:291'], 'table:? : lib/erase.ts:282 et :291');
  egal(parType.route.cles, 26, 'routes : 26 pages');
  egal(reel.occurrences.filter((o) => /^(rpc|fenetre):\?$/.test(o.cle)).map((o) => `${o.fichier}:${o.ligne}`), [], 'aucun rpc:? ni fenetre:? (chargeur ou nom illisible)');
  // 129 ancres (§0.2 ; comparées une à une à anchors() plus bas). Le §0.2 dit « dont 2 construites par expression
  // (menu.semaine, menu.historique) » : les 129 sont toutes littérales ; ces deux-là ne sont dans AUCUN data-guide littéral,
  // elles vivent dans la table MENU_GUIDE (app/poseur/page.tsx:65) lue par data-guide={MENU_GUIDE[t.value]} (page.tsx:599).
  // Les expressions sont 5 : celle-là + `data-guide={guide}` relayé par 4 composants (leurs valeurs sont les `guide="…"` littéraux).
  egal([parType.ancre.cles, parType.ancre.occurrences], [132, 234], 'ancres littérales : 132 valeurs, 234 occurrences (+2 à l’étape téléphone + tablette du planning 2a (planches 2b / 2c, ?ui=2) : la fiche en feuille du bas répète bureau-edit.documents, .enregistrer et .supprimer (+3, jamais montée avec le panneau), le menu ☰ reçoit bureau-nav.abonner, bureau-semaine.nav et bureau-stat.relance (+3) que l’en-tête du téléphone n’a plus (−4 : essai ×2, semaine, compteur) ; +1 : menu.historique, lien « Historique » en bas du Mois (?ui=2, Historique sort du menu du compte) ; +1 : barre.semaine, l’onglet Semaine de la barre du bas, navigation repensée d’octobre 2026 ; +3 : ✦ de l’en-tête, QR de la barre du bas, ligne de la Semaine, coque v2 ?ui=2 ; +6 à l’étape 6 : « Mes congés » en feuille et l’avatar de « Plus » répètent des repères déjà là ; +1 valeur, +50 occurrences au lot 1 du design du bureau : « Plus ⋯ » (bureau-nav.plus) et les MÊMES ancres de guide posées une 2e fois par le planning v2 (components/design/bureau), qui REMPLACE l’écran v1 sous ?ui=2, jamais les deux à la fois)');
  egal(Array.from(new Set(reel.occurrences.filter((o) => o.type === 'ancre-dynamique').map((o) => o.fichier))).sort(), [
    'app/poseur/page.tsx', 'components/admin-planning.tsx', 'components/company-settings.tsx', 'components/design/bureau/menu-mobile-v2.tsx', 'components/export-menu.tsx', 'components/leave-fund-setting.tsx',
  ], 'ancre-dynamique : 6 expressions (+ le menu ☰ v2 du bureau, qui relaie la prop `guide` de chaque ligne comme le menu ☰ d’avant)');
});

Deno.test('Dépôt réel : les ancres du scanner sont exactement celles d\'anchors() (admin-tours.test.ts:40-50)', async () => {
  const { sources, reel } = await depot();
  // Recopie de anchors() : « une valeur x.y entre guillemets sur une ligne qui parle de data-guide ou de guide= », app/ + components/.
  const reference = new Map<string, number>();
  for (const [fichier, code] of Object.entries(sources)) {
    if (!/^(app|components)\//.test(fichier) || fichier === 'components/guide-tour.tsx') continue;
    for (const ligne of code.split('\n')) {
      if (!/data-guide|\bguide=/.test(ligne) || /querySelector/.test(ligne)) continue;
      for (const m of ligne.matchAll(/["'`]([a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*)["'`]/g)) reference.set(m[1], (reference.get(m[1]) ?? 0) + 1);
    }
  }
  const scanner = new Map<string, number>();
  for (const o of reel.occurrences) if (o.type === 'ancre') scanner.set(o.cle.slice('ancre:'.length), (scanner.get(o.cle.slice('ancre:'.length)) ?? 0) + 1);
  egal([reference.size, Array.from(reference.values()).reduce((a, b) => a + b, 0)], [132, 234], 'anchors() : 132 valeurs, 234 occurrences (+2 à l’étape téléphone + tablette du planning 2a (planches 2b / 2c, ?ui=2) : la fiche en feuille du bas répète bureau-edit.documents, .enregistrer et .supprimer (+3, jamais montée avec le panneau), le menu ☰ reçoit bureau-nav.abonner, bureau-semaine.nav et bureau-stat.relance (+3) que l’en-tête du téléphone n’a plus (−4 : essai ×2, semaine, compteur) ; +1 : menu.historique, lien « Historique » en bas du Mois (?ui=2) ; +1 : barre.semaine, navigation d’octobre 2026 ; étape 6, ?ui=2 : +6 occurrences de repères DÉJÀ existants, aucune valeur nouvelle : « Mes congés » en feuille en répète quatre (conges.faire, .type, .envoyer, .annuler) et l’avatar de « Plus » le repère menu.compte ; une ligne de plus dans poseur-day pour la même raison ; +1 valeur, +50 occurrences au lot 1 du design du bureau : « Plus ⋯ » (bureau-nav.plus) et les MÊMES ancres de guide posées une 2e fois par le planning v2 (components/design/bureau), qui REMPLACE l’écran v1 sous ?ui=2, jamais les deux à la fois)');
  egal(Array.from(scanner.entries()).sort(), Array.from(reference.entries()).sort(), 'mêmes valeurs, mêmes nombres d\'occurrences');
  // Ce que anchors() ne fait pas et le scanner fait : lire l\'attribut lui-même (une ancre sans point comme « data-guide="x" » passerait), et signaler les expressions.
});

Deno.test('Dépôt réel : recomptage indépendant (lignes sans commentaires + expression régulière, sans lexeur)', async () => {
  const { sources, reel, parType } = await depot();
  // Une autre méthode que le scanner, pour qu'une dérive du lexeur se voie : même technique que bare() d'admin-tours.test.ts.
  const sansCommentaires = (code: string) => code.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const rpc = new Map<string, number>(); const fn = new Map<string, number>(); const couples = new Set<string>(); let ecrituresLib = 0;
  for (const [fichier, code] of Object.entries(sources)) {
    const nu = sansCommentaires(code);
    for (const m of nu.matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)) rpc.set(m[1], (rpc.get(m[1]) ?? 0) + 1);
    for (const m of nu.matchAll(/functions\.invoke\(\s*['"`]([a-z-]+)['"`]/g)) fn.set(m[1], (fn.get(m[1]) ?? 0) + 1);
    for (const m of nu.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)\s*\.(insert|update|delete|upsert)\(/g)) couples.add(`table:${m[1]}:${m[2]}`);
    if (fichier.startsWith('lib/') && /\.rpc\(|\.from\(\s*['"`a-z_]+['"`]?\s*\)\s*\.(insert|update|delete|upsert)\(/.test(nu)) ecrituresLib++;
  }
  egal([rpc.size, Array.from(rpc.values()).reduce((a, b) => a + b, 0)], [parType.rpc.cles, parType.rpc.occurrences], 'RPC : même compte par une autre méthode');
  egal([fn.size, Array.from(fn.values()).reduce((a, b) => a + b, 0)], [10, 20], 'fonctions Edge à nom littéral : 10 noms, 20 appels');
  egal(Array.from(couples).sort(), cles(reel, 'table').filter((c) => !c.startsWith('table:?')), 'tables : mêmes couples par une autre méthode');
  if (ecrituresLib < 25) throw new Error(`${ecrituresLib} fichiers de lib/ écrivent : trop peu`);
  const fichiersEcriture = new Set(cles(reel, 'ecriture').map((c) => c.slice('ecriture:'.length).split('#')[0]));
  egal(fichiersEcriture.size, ecrituresLib, 'ecriture : un fichier de lib/ par fichier qui écrit (regex à plat)');
});

Deno.test('Dépôt réel : ecriture — 98 exports de 30 modules de lib/ ; les cas de « tranche » mal attribuée sont bien traités', async () => {
  const { reel } = await depot();
  // §2.3 dit « tranche entre deux export ». Sur ce dépôt, la tranche littérale donnerait 95 clés dont 2 fausses
  // (lib/worker-actions#INCERTAIN, une constante, et lib/assistant-actions#bulletinFigures, une fonction pure : posées
  // juste avant une aide qui écrit) et en raterait 5 (lib/erase#undoErase, #undoMovePrep, lib/planning-versions#recordBeforeAssistant,
  // #recordAfterAssistant, lib/worker-day#sendWorkerDay : ils écrivent par une aide NON exportée posée plus haut) : 95 - 2 + 5 = 98.
  // Le scanner suit les aides du même fichier. « Appelle .rpc( » compte aussi les RPC de LECTURE (`{ get: true }`) : c'est la lettre du §2.3.
  const ecritures = cles(reel, 'ecriture');
  egal(ecritures.length, 98, 'ecriture : 98 exports');
  egal(new Set(ecritures.map((c) => c.split('#')[0])).size, 30, 'ecriture : 30 modules de lib/');
  for (const attendue of ['ecriture:lib/admin-writes#setUserRole', 'ecriture:lib/erase#undoErase', 'ecriture:lib/worker-day#sendWorkerDay', 'ecriture:lib/planning-versions#recordBeforeAssistant']) {
    if (!ecritures.includes(attendue)) throw new Error(`${attendue} manque`);
  }
  for (const fausse of ['ecriture:lib/worker-actions#INCERTAIN', 'ecriture:lib/assistant-actions#bulletinFigures']) {
    if (ecritures.includes(fausse)) throw new Error(`${fausse} : une constante ou une fonction pure ne doit pas être une écriture`);
  }
  // Les deux fichiers *-writes.ts (§0.2 : 32 fonctions exportées, lectures comprises) : seules les écritures sortent.
  const writes = ecritures.filter((c) => /^ecriture:lib\/(admin|planning)-writes#/.test(c));
  if (writes.length < 20 || writes.length > 32) throw new Error(`lib/*-writes.ts : ${writes.length} écritures sur 32 exports ?`);
});

Deno.test('Dépôt réel : les deux .from(variable) de lib/erase.ts se déclarent par « // registre:tables=… » (simulé en mémoire, rien n\'est écrit)', async () => {
  const { sources, parType } = await depot();
  const erase = sources['lib/erase.ts'].split('\n');
  const ligne = (motif: RegExp) => erase.findIndex((l) => motif.test(l));
  // restoreRows(table, rows) est appelée avec worksite_expenses, certifications, planning et time_entries ; eraseOne(table, …) avec les deux premières.
  erase.splice(ligne(/supabase\.from\(table\)\.delete\(\)/), 0, '  // registre:tables=worksite_expenses,certifications');
  erase.splice(ligne(/supabase\.from\(table\)\.upsert\(/), 0, '    // registre:tables=worksite_expenses,certifications,planning,time_entries');
  const apres = scannerSurfaces({ ...sources, 'lib/erase.ts': erase.join('\n') });
  const t = apres.occurrences.filter((o) => o.type === 'table');
  egal(t.filter((o) => o.cle.startsWith('table:?')).length, 0, 'plus aucun table:? une fois déclarés');
  egal(new Set(t.map((o) => o.cle)).size, parType.table.cles - 2 + 4, 'les deux table:? partent ; 4 couples apparaissent (…:upsert de 4 tables)');
  for (const neuf of ['table:planning:upsert', 'table:time_entries:upsert', 'table:worksite_expenses:upsert', 'table:certifications:upsert']) {
    if (!t.some((o) => o.cle === neuf)) throw new Error(`${neuf} devrait apparaître`);
  }
});

Deno.test('Dépôt réel : T10 — 764 gestionnaires onClick / onSelect / onSubmit dans 89 fichiers, tous dans app/ ou components/', async () => {
  const { reel } = await depot();
  egal([Object.keys(reel.clics).length, Object.values(reel.clics).reduce((a, b) => a + b, 0)], [89, 764], 'clics.snapshot (planning bureau, étape téléphone + tablette, planches 2b / 2c : +18 — fiche en feuille du bas +8 (fiche-v2 8 → 16 : la variante 2c a ses propres boutons, montée À LA PLACE du panneau sous 1 024 px), menu ☰ +8 (menu-mobile-v2 17 → 25 : semaine ← → et retour, recherche et son ✕, chiffres, Imprimer, Pièces jointes, S’abonner : ce que la barre et « Plus ⋯ » offrent à l’ordinateur), « Plus ⋯ » à la tablette +3 (barres-v2 37 → 40 : Clients, Salariés, Sélectionner, que la barre n’a plus la place de montrer entre 768 et 1 023 px), téléphone −1 (mobile-v2 14 → 13 : bascule Jour / Semaine et mosaïque, sans compteurs ni « + Tâche ») ; avant, planche d’essai 2a : +3 — barre unique et « Plus ⋯ » +8 (barres-v2 29 → 37 : loupe, Effacer, compteurs, Pièces jointes, Statistiques, Imprimer, Légende, plein écran, avatar, pastille), bandeau → menu des chiffres −5 (bandeau-v2 6 → 1), réunion en carte +1 (missions-v2), légende pilotée par « Plus ⋯ » −1 (planning-v2) ; avant : retouches d’arbitrage d’octobre : +1, lien « Historique » du Mois, puis +3 : le ✦ en rang au-dessus de la barre (Journée, Semaine, Mois) ; avant : lot 2 du design du bureau (heures et paie) : +5 fichiers, +40 gestionnaires, composants/design/bureau ; avant, lot 1 : +9 fichiers, +94 gestionnaires — components/design/bureau, le planning v2 qui REMPLACE l’écran v1 sous ?ui=2 ; avant : étape 1 : −3 avec le code mort de poseur-day.tsx, la liste des formations a son fichier ; puis +1 fichier, +10 gestionnaires : coque v2 shell-v2.tsx, carte-total, mini-frise, Semaine v2 ; puis +2 : entrées « Réserves à lever » et « Formations à voir » du menu Plus, ?ui=2 ; puis +1 : le ✕ de la feuille de l’éditeur, ?ui=2 ; puis +1 fichier, +13 gestionnaires (étape 6, ?ui=2) : page « Plus » page-plus.tsx (2), page.tsx (+1 : l’avatar), « Mes congés » en feuille (+5), Mois v2 (+3), Historique v2 (+2) ; puis +24 : étape 8, la variante v2 du panneau de l’assistant, components/assistant-panel.tsx 22 → 46, ?ui=2 ; puis +1 : la fiche à confirmer et la barre de saisie refaites, +trombone/micro, −rangée de langue, fiche, ?ui=2)');
  const dehors = Object.keys(reel.clics).filter((f) => !/^(app|components)\//.test(f));
  egal(dehors, [], 'aucun gestionnaire JSX hors app/ et components/');
});
