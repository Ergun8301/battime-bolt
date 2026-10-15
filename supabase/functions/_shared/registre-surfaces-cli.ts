// Programme de lancement du scanner de l'interface : lit app/, components/, lib/ et hooks/ du dépôt, appelle
// `scannerSurfaces` (qui, lui, ne touche jamais au disque) et imprime les clés groupées par type, chacune avec
// ses `fichier:ligne`. C'est ce que lit un développeur pour savoir « quelle ligne coller dans SURFACES » avant de
// lancer le test de couverture.
//
//   npx -y deno@2 run --allow-read supabase/functions/_shared/registre-surfaces-cli.ts            (texte)
//   npx -y deno@2 run --allow-read supabase/functions/_shared/registre-surfaces-cli.ts --json     (JSON)
//   … --racine=<dossier>   un autre dépôt que celui du fichier (par défaut : ce dépôt)
//
// Deno seulement (lecture de dossiers) : le test de couverture et le test du scanner importent `lireSources`
// d'ici ; rien ne s'exécute à l'import (le `main` ne part que lancé directement).
import { comptes, grouperParCle, scannerSurfaces, TYPES_CLE, type ResultatScan, type TypeCle } from './registre-surfaces.ts';

/** Les dossiers d'interface et de code client que parcourt T1 (§2.3 : `app/`, `components/`, `lib/`, hooks). */
export const DOSSIERS_SCANNES: readonly string[] = ['app', 'components', 'lib', 'hooks'];
const DOSSIERS_IGNORES = new Set(['node_modules', '.next', 'out', '.git']);

/** Le dépôt auquel appartient ce fichier (supabase/functions/_shared/ → trois niveaux plus haut). */
export const RACINE_DEPOT = new URL('../../../', import.meta.url);

/** { chemin relatif au dépôt: texte } de tous les .ts / .tsx des dossiers scannés. */
export async function lireSources(racine: URL | string = RACINE_DEPOT, dossiers: readonly string[] = DOSSIERS_SCANNES): Promise<Record<string, string>> {
  const base = (racine instanceof URL ? decodeURIComponent(racine.pathname) : racine).replace(/\/?$/, '/');
  const sources: Record<string, string> = {};
  const parcourir = async (relatif: string) => {
    let entrees: Deno.DirEntry[];
    try { entrees = await Array.fromAsync(Deno.readDir(base + relatif)); } catch (e) {
      if (e instanceof Deno.errors.NotFound) return;   // un dossier absent (hooks/ d'un autre dépôt) n'est pas une erreur ; une permission refusée, si
      throw e;
    }
    for (const e of entrees) {
      const chemin = `${relatif}/${e.name}`;
      if (e.isDirectory) { if (!DOSSIERS_IGNORES.has(e.name)) await parcourir(chemin); }
      else if (/\.tsx?$/.test(e.name)) sources[chemin] = await Deno.readTextFile(base + chemin);
    }
  };
  for (const d of dossiers) await parcourir(d);
  return sources;
}

const TITRES: Record<TypeCle, string> = {
  fenetre: 'fenetre   — modules chargés par lazyWindow(…) ou dynamic(…)',
  dialogue: 'dialogue  — Dialog / AlertDialog / Sheet / Popover / DropdownMenu avec open={…} (hors fenêtres et components/ui/)',
  rpc: 'rpc       — .rpc(\'nom\')',
  fn: 'fn        — functions.invoke(\'nom\')',
  table: 'table     — .from(\'t\') suivi de insert / update / delete / upsert (« ? » = nom calculé, à déclarer)',
  ecriture: 'ecriture  — exports de lib/ dont le corps (aides du fichier comprises) écrit ou appelle .rpc(',
  ancre: 'ancre     — data-guide / guide= littéraux',
  'ancre-dynamique': 'ancre-dynamique — data-guide / guide= dont la valeur est une expression',
  route: 'route     — app/**/page.tsx',
};

/** Le rapport lisible : par type, une ligne par clé avec tous ses `fichier:ligne`, puis le compteur de gestionnaires. */
export function formaterTexte(res: ResultatScan, fichiersLus?: number): string {
  const sortie: string[] = [];
  const c = comptes(res.occurrences);
  sortie.push(`Surfaces de l'interface${fichiersLus === undefined ? '' : ` (${fichiersLus} fichiers lus)`} :`);
  for (const t of TYPES_CLE) sortie.push(`  ${t.padEnd(16)} ${String(c[t].cles).padStart(4)} clés  ${String(c[t].occurrences).padStart(4)} occurrences`);
  const nbClics = Object.values(res.clics).reduce((a, b) => a + b, 0);
  sortie.push(`  ${'clics (T10)'.padEnd(16)} ${String(nbClics).padStart(4)} gestionnaires dans ${Object.keys(res.clics).length} fichiers`);
  for (const t of TYPES_CLE) {
    const dutype = res.occurrences.filter((o) => o.type === t);
    if (!dutype.length) continue;
    sortie.push('', `── ${TITRES[t]} : ${c[t].cles} clés`);
    for (const [cle, lieux] of grouperParCle(dutype)) sortie.push(`${cle}  ${lieux.map((o) => `${o.fichier}:${o.ligne}`).join(' ')}`);
  }
  sortie.push('', '── clics : gestionnaires onClick / onSelect / onSubmit par fichier');
  for (const [fichier, n] of Object.entries(res.clics).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) sortie.push(`${String(n).padStart(4)}  ${fichier}`);
  return sortie.join('\n');
}

/** Le même rapport pour une machine : { comptes, cles: {type: {clé: ["fichier:ligne"]}}, clics }. */
export function formaterJson(res: ResultatScan): string {
  const cles = {} as Record<TypeCle, Record<string, string[]>>;
  for (const t of TYPES_CLE) {
    cles[t] = {};
    for (const [cle, lieux] of grouperParCle(res.occurrences.filter((o) => o.type === t))) cles[t][cle] = lieux.map((o) => `${o.fichier}:${o.ligne}`);
  }
  return JSON.stringify({ comptes: comptes(res.occurrences), cles, clics: res.clics }, null, 2);
}

if (import.meta.main) {
  const args = Deno.args;
  const racine = args.find((a) => a.startsWith('--racine='))?.slice('--racine='.length);
  const sources = await lireSources(racine ?? RACINE_DEPOT);
  const res = scannerSurfaces(sources);
  console.log(args.includes('--json') ? formaterJson(res) : formaterTexte(res, Object.keys(sources).length));
}
