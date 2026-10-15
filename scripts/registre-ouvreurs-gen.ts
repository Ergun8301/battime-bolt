// Générateur des modules LÉGERS des ouvreurs (étape 3, livraison 3b-1) — programme Deno.
//
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-ouvreurs-gen.ts [--verifier]
//
// Lit les ouvreurs du registre (registre/ouvreurs.ts) et écrit, par côté, le module léger que le navigateur lit :
//   · supabase/functions/_shared/registre/ouvreurs-leger-bureau.ts   (page /admin)
//   · supabase/functions/_shared/registre/ouvreurs-leger-salarie.ts  (page /poseur)
// --verifier n'écrit rien : il sort en erreur si un fichier n'est pas celui que le registre produit (registre-ouvreurs.test.ts fait la même
// comparaison). La logique est dans registre/ouvreurs-gen.ts (pure, partagée avec le test). Même forme que scripts/registre-listes-gen.ts.
import { OUVREURS } from '../supabase/functions/_shared/registre/ouvreurs.ts';
import { texteOuvreursLeger } from '../supabase/functions/_shared/registre/ouvreurs-gen.ts';

interface DenoMini {
  args: string[];
  readTextFile(chemin: URL): Promise<string>;
  writeTextFile(chemin: URL, donnees: string): Promise<void>;
  exit(code?: number): never;
}
// `globalThis` plutôt que `Deno.` : `npm run typecheck` (tsc, sans les types Deno) parcourt aussi scripts/*.ts.
const deno = (globalThis as unknown as { Deno: DenoMini }).Deno;

const DOSSIER = new URL('../supabase/functions/_shared/registre/', import.meta.url);
const CIBLES = [
  { cote: 'bureau' as const, fichier: new URL('ouvreurs-leger-bureau.ts', DOSSIER) },
  { cote: 'salarie' as const, fichier: new URL('ouvreurs-leger-salarie.ts', DOSSIER) },
];

async function main() {
  const verifier = deno.args.indexOf('--verifier') >= 0;
  let ecarts = 0;
  for (const c of CIBLES) {
    const voulu = texteOuvreursLeger(c.cote, OUVREURS);
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
