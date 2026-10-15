// Générateur des listes légères du registre (étape 3, livraison 3a-2) — programme Deno.
//
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts [--verifier]
//
// Lit les outils du registre (registre/outils-bureau.ts, outils-salarie.ts) et écrit, par côté, le module léger que le code et le
// navigateur lisent à la place des anciennes listes tenues à la main :
//   · supabase/functions/_shared/outils-listes-bureau.ts   (ACTION_TYPES, REMOVAL_TYPES, ATTACHMENT_ACTIONS, DOMAINES_OUTILS)
//   · supabase/functions/_shared/outils-listes-salarie.ts  (WORKER_REMOVAL_TYPES, WORKER_ATTACHMENT_ACTIONS, DOMAINES_OUTILS)
// --verifier n'écrit rien : il sort en erreur si un fichier n'est pas celui que le registre produit (le test registre-listes.test.ts
// fait la même comparaison). La logique est dans registre/listes.ts (pure, partagée avec le test).
import { OUTILS_BUREAU } from '../supabase/functions/_shared/registre/outils-bureau.ts';
import { OUTILS_SALARIE } from '../supabase/functions/_shared/registre/outils-salarie.ts';
import { texteListes } from '../supabase/functions/_shared/registre/listes.ts';

interface DenoMini {
  args: string[];
  readTextFile(chemin: URL): Promise<string>;
  writeTextFile(chemin: URL, donnees: string): Promise<void>;
  exit(code?: number): never;
}
// `globalThis` plutôt que `Deno.` : `npm run typecheck` (tsc, sans les types Deno) parcourt aussi scripts/*.ts.
const deno = (globalThis as unknown as { Deno: DenoMini }).Deno;

const DOSSIER = new URL('../supabase/functions/_shared/', import.meta.url);
const CIBLES = [
  { cote: 'bureau' as const, outils: OUTILS_BUREAU, fichier: new URL('outils-listes-bureau.ts', DOSSIER) },
  { cote: 'salarie' as const, outils: OUTILS_SALARIE, fichier: new URL('outils-listes-salarie.ts', DOSSIER) },
];

async function main() {
  const verifier = deno.args.indexOf('--verifier') >= 0;
  let ecarts = 0;
  for (const c of CIBLES) {
    const voulu = texteListes(c.cote, c.outils);
    let actuel: string | null = null;
    try { actuel = await deno.readTextFile(c.fichier); } catch { actuel = null; }
    if (actuel === voulu) { console.log(`${c.cote} : à jour`); continue; }
    if (verifier) { console.error(`${c.cote} : ${c.fichier.pathname} n'est pas celui que le registre produit (relancer sans --verifier)`); ecarts++; continue; }
    await deno.writeTextFile(c.fichier, voulu);
    console.log(`${c.cote} : écrit`);
  }
  if (ecarts) deno.exit(1);
}

// Pas d'`await` de premier niveau : `npm run typecheck` (tsc, cible es5) parcourt aussi scripts/*.ts.
if ((import.meta as unknown as { main?: boolean }).main) main().catch((e) => { console.error(e); deno.exit(1); });
