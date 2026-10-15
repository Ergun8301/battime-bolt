#!/usr/bin/env node
// Mutations du test de couverture du registre de l'assistant (étape 3, livraison 3a-1).
//
// POURQUOI : un test qui passe ne prouve rien tant qu'on ne l'a pas vu ÉCHOUER quand il le doit. Ce script prend une copie du dépôt HORS du
// dépôt, y introduit UNE erreur à la fois (un RPC ajouté sans capacité, une ancre renommée, une raison trop courte, un import interdit…), lance
// supabase/functions/_shared/registre-couverture.test.ts et exige que le BON test (T1 à T11) soit celui qui la voit. Une mutation que personne ne
// voit est un trou du filet : le script le dit et sort en erreur. Le dépôt lui-même n'est jamais modifié.
//
// Déroulement : copie du dépôt (sans node_modules, .next, out, .git) → base saine (le test doit passer, sinon aucune mutation ne prouve rien) →
// chaque mutation : appliquer, lancer le test, lire quels tests échouent, tout remettre → tableau « mutation → test qui l'a vue ».
// La date est fixée (REGISTRE_AUJOURDHUI) pour que le résultat ne dépende ni du jour ni de l'horloge.
//
// Usage : node scripts/tests/registre-mutations.mjs [--jobs 3] [--only M01,M07] [--liste] [--tmp <dossier>] [--garder]
//   --jobs N     N copies du dépôt, N mutations à la fois (défaut 3)
//   --only       seulement ces mutations (séparées par des virgules)
//   --liste      affiche les mutations sans rien lancer
//   --tmp        où fabriquer les copies (défaut : le dossier temporaire du système ; jamais dans le dépôt)
//   --garder     ne pas supprimer les copies à la fin (pour regarder une mutation à la main)
// Code de sortie : 0 si toutes les mutations sont vues par le test attendu, 1 sinon.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = 'supabase/functions/_shared/registre-couverture.test.ts';
const DATE_DE_REFERENCE = '2026-10-15';   // avant la première échéance de dette (2027-01-31) : la base est verte à n'importe quelle date réelle

// ── Arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const option = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut; };
const JOBS = Math.max(1, Number(option('--jobs', '3')) || 3);
const SEULEMENT = option('--only', '') ? option('--only', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const TMP = resolve(option('--tmp', process.env.REGISTRE_MUTATIONS_TMP || tmpdir()));
const GARDER = args.includes('--garder');
if (TMP === RACINE || TMP.startsWith(RACINE + sep)) { console.error(`--tmp ne doit pas être dans le dépôt (${TMP}) : les mutations s'appliquent à une COPIE.`); process.exit(2); }

// ── Fabrique de modifications (chacune rend un descripteur ; appliquer() les exécute) ───────────────────
const ajoute = (fichier, texte) => ({ op: 'ajoute', fichier, texte });                                // à la fin du fichier
const prefixe = (fichier, texte) => ({ op: 'prefixe', fichier, texte });                              // au début du fichier
const cree = (fichier, texte) => ({ op: 'cree', fichier, texte });                                    // un fichier neuf
const remplace = (fichier, de, vers, tout = false) => ({ op: 'remplace', fichier, de, vers, tout }); // texte ou RegExp, doit exister
const apres = (fichier, ancre, de, vers) => ({ op: 'apres', fichier, ancre, de, vers });              // la première occurrence de `de` APRÈS `ancre`
const retireEntre = (fichier, debut, fin) => ({ op: 'retireEntre', fichier, debut, fin });            // de `debut` jusqu'à `fin` (exclu)

function appliquer(racine, modifs) {
  const originaux = new Map();    // fichier → texte d'avant (null = n'existait pas)
  const dossiersCrees = [];
  const lire = (f) => { const p = join(racine, f); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
  const ecrire = (f, t) => {
    const p = join(racine, f);
    if (!originaux.has(f)) originaux.set(f, lire(f));
    for (let d = dirname(p); !existsSync(d); d = dirname(d)) dossiersCrees.push(d);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, t);
  };
  for (const m of modifs) {
    const avant = lire(m.fichier);
    if (avant === null && m.op !== 'cree') throw new Error(`mutation inapplicable : ${m.fichier} n'existe pas`);
    let apresTexte;
    if (m.op === 'ajoute') apresTexte = `${avant}${m.texte}`;
    else if (m.op === 'prefixe') apresTexte = `${m.texte}${avant}`;
    else if (m.op === 'cree') apresTexte = m.texte;
    else if (m.op === 'remplace') {
      const trouve = typeof m.de === 'string' ? avant.includes(m.de) : m.de.test(avant);
      if (!trouve) throw new Error(`mutation inapplicable : « ${String(m.de).slice(0, 70)} » introuvable dans ${m.fichier}`);
      apresTexte = typeof m.de === 'string' ? (m.tout ? avant.split(m.de).join(m.vers) : avant.replace(m.de, () => m.vers)) : avant.replace(m.de, m.vers);
    } else if (m.op === 'apres') {
      const i = avant.indexOf(m.ancre);
      if (i < 0) throw new Error(`mutation inapplicable : ancre « ${m.ancre} » introuvable dans ${m.fichier}`);
      const queue = avant.slice(i);
      const trouve = typeof m.de === 'string' ? queue.includes(m.de) : m.de.test(queue);
      if (!trouve) throw new Error(`mutation inapplicable : « ${String(m.de).slice(0, 70)} » introuvable après « ${m.ancre} » dans ${m.fichier}`);
      apresTexte = avant.slice(0, i) + (typeof m.de === 'string' ? queue.replace(m.de, () => m.vers) : queue.replace(m.de, m.vers));
    } else if (m.op === 'retireEntre') {
      const a = avant.indexOf(m.debut); const b = avant.indexOf(m.fin, a + 1);
      if (a < 0 || b < 0) throw new Error(`mutation inapplicable : bornes introuvables dans ${m.fichier}`);
      apresTexte = avant.slice(0, a) + avant.slice(b);
    } else throw new Error(`opération inconnue ${m.op}`);
    if (apresTexte === avant) throw new Error(`mutation sans effet sur ${m.fichier}`);
    ecrire(m.fichier, apresTexte);
  }
  return () => {
    for (const [f, t] of originaux) { const p = join(racine, f); if (t === null) rmSync(p, { force: true }); else writeFileSync(p, t); }
    for (const d of dossiersCrees) rmSync(d, { recursive: true, force: true });
  };
}

// ── Les mutations ────────────────────────────────────────────────────────────
// `attendu` : le test qui DOIT l'avoir vue (début de son nom : « T1 », « T3 dette échue », « Garde-fous »). `mode` : 'echec' (par défaut) ou
// 'avertit' (le test passe mais imprime « AVERTISSEMENT Tn »). Un test qui échoue en plus du test attendu n'est pas une erreur : le tableau le montre.
const AD = 'components/admin-planning.tsx';
const WD = 'components/worker-detail.tsx';
const REG = 'supabase/functions/_shared/registre';
const CAP_B = `${REG}/capacites-bureau.ts`;
const OUT_B = `${REG}/outils-bureau.ts`;
const SURF_B = `${REG}/surfaces-bureau.ts`;
const INT_B = `${REG}/interne-bureau.ts`;
const RAISON = 'Une raison de plus de trente caractères, pour que seul le point testé échoue.';   // sans apostrophe : elle est collée entre apostrophes

const MUTATIONS = [
  // ── T1 : le code a une entrée que rien ne porte ──
  { id: 'M01', attendu: 'T1', titre: 'Nouveau RPC dans un composant, sans capacité', modifs: [ajoute(WD, "\nexport const mutationRpc = () => supabase.rpc('rpc_fantome', {});\n")] },
  { id: 'M02', attendu: 'T1', titre: 'Nouvelle fonction Edge appelée (functions.invoke) sans capacité', modifs: [ajoute(WD, "\nexport const mutationFn = () => supabase.functions.invoke('fonction-fantome', { body: {} });\n")] },
  { id: 'M03', attendu: 'T1', titre: 'Nouvelle écriture de table (.from().update()) dans un composant', modifs: [ajoute(WD, "\nexport const mutationTable = () => supabase.from('table_fantome').update({ a: 1 });\n")] },
  { id: 'M04', attendu: 'T1', titre: 'Nouvelle fenêtre lazyWindow', modifs: [ajoute(AD, "\nconst MutationFenetre = lazyWindow(() => import('@/components/fenetre-fantome'), { isOpen: () => false });\n")] },
  { id: 'M05', attendu: 'T1', titre: 'Nouvelle fenêtre dynamic()', modifs: [ajoute(AD, "\nconst MutationDynamique = dynamic(() => import('@/components/dynamique-fantome'), { ssr: false });\n")] },
  { id: 'M06', attendu: 'T1', titre: 'Nouveau <Dialog open={…}> hors fenêtre', modifs: [ajoute(AD, "\nexport const MutationDialogue = () => <Dialog open={fantomeOuverte} onOpenChange={() => {}}>x</Dialog>;\n")] },
  { id: 'M07', attendu: 'T1', titre: 'Nouvelle ancre data-guide littérale', modifs: [ajoute(AD, '\nexport const MutationAncre = () => <div data-guide="fantome.ancre" />;\n')] },
  { id: 'M08', attendu: 'T1', titre: 'Nouvelle ancre data-guide construite par expression', modifs: [ajoute(AD, '\nexport const MutationAncreDynamique = (maVariable) => <div data-guide={maVariable} />;\n')] },
  { id: 'M09', attendu: 'T1', titre: 'Nouvelle page app/fantome/page.tsx', modifs: [cree('app/fantome/page.tsx', 'export default function Page() { return null; }\n')] },
  { id: 'M10', attendu: 'T1', titre: 'Nouvel export de lib/ qui appelle .rpc(', modifs: [cree('lib/fantome-writes.ts', "export async function ecrireFantome() { return supabase.rpc('set_user_role', {}); }\n")] },
  { id: 'M11', attendu: 'T1', titre: 'Nouvel .update() dans lib/', modifs: [cree('lib/fantome-update.ts', "export async function majFantome(id: string) { return supabase.from('worksites').update({ a: 1 }).eq('id', id); }\n")] },
  { id: 'M12', attendu: 'T1', titre: '.from(variable) non déclaré dans lib/ (table:?)', modifs: [cree('lib/fantome-dynamique.ts', 'export async function ecrireDyn(t: string) { return supabase.from(t).insert({}); }\n')] },
  { id: 'M13', attendu: 'T1', titre: 'Une écriture (rpc:set_user_role) rangée dans interne.ts', modifs: [remplace(INT_B, 'export const INTERNE_BUREAU: EntreeInterne[] = [', `export const INTERNE_BUREAU: EntreeInterne[] = [\n  { cle: 'rpc:set_user_role', raison: '${RAISON}' },`)] },
  { id: 'M14', attendu: 'T1', titre: "Nouvelle fiche d'aide (GUIDE) qu'aucune capacité ne nomme", modifs: [remplace('supabase/functions/_shared/assistant-actions-core.ts', 'export const GUIDE: GuideEntry[] = [', "export const GUIDE: GuideEntry[] = [\n  { id: 'fantome_guide', mots: ['fantome'], titre: 'Fantôme', etapes: ['a'], lien: 'planning' },")] },
  { id: 'M15', attendu: 'T1', titre: "Exception de départ devenue inutile : lib/erase.ts déclare enfin ses tables (le test exige de retirer l'exception)", modifs: [remplace('lib/erase.ts', 'const { data: del, error: delErr } = await supabase.from(table).delete()', "// registre:tables=worksite_expenses,certifications\n  const { data: del, error: delErr } = await supabase.from(table).delete()")] },

  // ── T2 : une clé déclarée n'existe plus ──
  { id: 'M16', attendu: 'T2', titre: 'RPC renommé dans le code (ensure_planning_slot → …_v2)', modifs: [remplace(AD, "supabase.rpc('ensure_planning_slot'", "supabase.rpc('ensure_planning_slot_v2'")] },
  { id: 'M17', attendu: 'T2', titre: 'Ancre renommée dans le code (bureau-semaine.nav)', modifs: [remplace(AD, 'bureau-semaine.nav', 'bureau-semaine.nav2', true)] },
  { id: 'M18', attendu: 'T2', titre: "Clé déclarée dans SURFACES qui n'existe pas dans le code", modifs: [apres(SURF_B, '  B1: [', "'route:/admin',", "'route:/admin',\n    'rpc:fantome_declare',")] },
  { id: 'M19', attendu: 'T2', titre: "Capacité qui nomme une fiche d'aide disparue", modifs: [apres(CAP_B, "id: 'B12'", "guides: ['", "guides: ['fiche_disparue', '")] },

  // ── T3 : forme du registre ──
  { id: 'M20', attendu: 'T3', titre: 'Id de capacité supprimé (B138)', modifs: [retireEntre(CAP_B, '  // B138 ·', '  // B139 ·')] },
  { id: 'M21', attendu: 'T3', titre: 'Id de capacité en double (B137 → B136)', modifs: [remplace(CAP_B, "id: 'B137'", "id: 'B136'")] },
  { id: 'M22', attendu: 'T3', titre: 'Id neuf hors suite (B140 → B142)', modifs: [remplace(CAP_B, "id: 'B140'", "id: 'B142'")] },
  { id: 'M23', attendu: 'T3', titre: 'Capacité humain avec une raison trop courte', modifs: [apres(CAP_B, "id: 'B63'", /raison: "[^"]*"/, 'raison: "trop court"')] },
  { id: 'M24', attendu: 'T3', titre: 'Capacité humain avec une catégorie inconnue', modifs: [apres(CAP_B, "id: 'B63'", "categorie: 'droits_acces'", "categorie: 'inconnue' as never")] },
  { id: 'M25', attendu: 'T3', titre: "dette.avant après l'horizon (2027-07-01)", modifs: [apres(CAP_B, "id: 'B2'", "avant: '2027-02-28'", "avant: '2027-07-01'")] },
  { id: 'M26', attendu: 'T3 dette échue', titre: 'dette.avant dépassée : le test rejoué au 2027-03-01 (date injectée, aucun fichier modifié)', modifs: [], env: { REGISTRE_AUJOURDHUI: '2027-03-01' } },
  { id: 'M27', attendu: 'T3', titre: 'Capacité qui ne dit plus rien (sa dette est effacée)', modifs: [apres(CAP_B, "id: 'B2'", /\n    dette: \{[\s\S]*?\n    \},/, '')] },
  { id: 'M28', attendu: 'T3', titre: 'Libellé du cahier modifié (B1)', modifs: [remplace(CAP_B, "libelle: 'Voir la semaine, salarié par jour'", "libelle: 'Voir la semaine, salarié par jour.'")] },
  { id: 'M29', attendu: 'T3', titre: 'SURFACES d\'une capacité qui n\'existe pas (B999)', modifs: [remplace(SURF_B, 'export const SURFACES_BUREAU: Record<string, string[]> = {', "export const SURFACES_BUREAU: Record<string, string[]> = {\n  B999: ['rpc:set_user_role'],")] },
  { id: 'M30', attendu: 'T3', titre: 'Outil d\'une capacité qui n\'existe pas (B7 → repondre_x)', modifs: [apres(CAP_B, "id: 'B7'", "outil: 'repondre'", "outil: 'repondre_x'")] },

  // ── T4 : niveaux ──
  { id: 'M31', attendu: 'T4', titre: 'Outil de niveau 2 sans « Annuler » (ranger_document : annuler non)', modifs: [apres(OUT_B, "id: 'ranger_document'", "annuler: 'oui'", "annuler: 'non'")] },
  { id: 'M32', attendu: 'T4', titre: 'Outil avec un champ de CHAMPS_CARTE (telephone, email) passé en niveau 2 direct (creer_chantier)', modifs: [apres(OUT_B, "id: 'creer_chantier'", "mode: 'conditionnel', modeActuel: 'conditionnel'", "mode: 'direct', modeActuel: 'direct'")] },
  { id: 'M33', attendu: 'T4', titre: 'Outil qui prévient un tiers fait sans carte (poser_absence : notifie en direct)', modifs: [apres(OUT_B, "id: 'poser_absence'", "annuler: 'oui',", "annuler: 'oui', notifie: true,")] },
  { id: 'M34', attendu: 'T4', titre: 'Capacité réservée à l\'humain (B63) dont l\'outil écrit (changer_role)', modifs: [apres(CAP_B, "id: 'B63'", "guides: ['support'],", "guides: ['support'], outil: 'changer_role',")] },

  // ── T5 : cohérence avec le code d'aujourd'hui ──
  { id: 'M35', attendu: 'T5', titre: "Outil renommé au registre (modifier_client → modifier_client_x)", modifs: [apres(OUT_B, "id: 'modifier_client'", "id: 'modifier_client'", "id: 'modifier_client_x'")] },
  { id: 'M36', attendu: 'T5', titre: 'Retrait oublié (supprimer_depense sans retrait: true)', modifs: [apres(OUT_B, "id: 'supprimer_depense'", 'retrait: true, ', '')] },
  { id: 'M37', attendu: 'T5', titre: 'Pièce jointe déclarée à tort (lever_reserve)', modifs: [apres(OUT_B, "id: 'lever_reserve'", "livraison: '3a'", "livraison: '3a', pieceJointe: true")] },
  { id: 'M38', attendu: 'T5', titre: 'NAV_ACTIONS étendu dans le code sans toucher le registre', modifs: [remplace(`${REG}/vocab.ts`, "  clients: 'Clients',\n} as const;", "  clients: 'Clients',\n  fantome: 'Fantôme',\n} as const;")] },   // 3a-2 : NAV_ACTIONS vit dans registre/vocab.ts (AC le ré-exporte)
  { id: 'M65', attendu: 'T5', titre: "3a-2 : un type d'écriture sans case dans checkAction (le case de cout_reel n'est plus un littéral dans checkAction)", modifs: [apres('supabase/functions/_shared/assistant-actions-core.ts', 'export function checkAction(', "case 'cout_reel':", "case ('cout_reel') as never:")] },
  { id: 'M66', attendu: 'T5', titre: "3a-2 : un case sans outil dans checkWorkerAction (type fantôme)", modifs: [apres('supabase/functions/_shared/worker-assistant-core.ts', 'export function checkWorkerAction(', "case 'effacer_heures':", "case 'fantome_x' as never:")] },
  { id: 'M39', attendu: 'T5', titre: 'Domaine différent de tool-domains.ts (poser_absence → heures)', modifs: [apres(OUT_B, "id: 'poser_absence'", "domaines: ['planning']", "domaines: ['heures']")] },

  // ── T6 : liaison ──
  { id: 'M40', attendu: 'T6', titre: "Exécuteur introuvable dans lib/assistant-actions.ts (archiver_client)", modifs: [apres(OUT_B, "id: 'archiver_client'", "executeur: 'archiver_client'", "executeur: 'archiver_client_absent'")] },
  { id: 'M41', attendu: 'T6', titre: "Fichier `code` inexistant (attribuer_client)", modifs: [apres(OUT_B, "id: 'attribuer_client'", "code: ['lib/admin-writes.ts']", "code: ['lib/inexistant.ts']")] },
  { id: 'M42', attendu: 'T6', titre: 'lib/registre-exec-bureau.ts sans clé ni default qui lève', modifs: [cree('lib/registre-exec-bureau.ts', "export const EXEC = (n: string) => { switch (n) { case 'poser_absence': return 1; default: return null; } };\n")] },

  // ── T7 : évaluation ──
  { id: 'M43', attendu: 'T7', titre: "Outil sans cas d'évaluation (modifier_habilitation : ses cas renommés)", modifs: [remplace('supabase/functions/assistant-eval/cases.ts', "act('modifier_habilitation'", "act('modifier_habilitation_x'", true)] },
  { id: 'M44', attendu: 'T7', titre: 'Paire d\'outils proches sans cas d\'un côté (relancer_invitation)', modifs: [remplace('supabase/functions/assistant-eval/cases.ts', "act('relancer_invitation'", "act('envoyer_rappel'", true)] },

  // ── T8 : hygiène du navigateur ──
  { id: 'M45', attendu: 'T8 hygiène :', titre: 'components/ importe registre/outils-bureau', modifs: [prefixe('components/action-done.tsx', "import { OUTILS_BUREAU } from '@/supabase/functions/_shared/registre/outils-bureau';\n")] },
  { id: 'M46', attendu: 'T8 hygiène :', titre: 'Import transitif : lib/ → _shared/pont → registre/index', modifs: [cree('supabase/functions/_shared/pont-mutation.ts', "export { CAPACITES_BUREAU } from './registre/index.ts';\n"), prefixe('lib/week.ts', "import { CAPACITES_BUREAU } from '@/supabase/functions/_shared/pont-mutation';\n")] },
  { id: 'M47', attendu: 'T8 hygiène :', titre: "/poseur importe l'exécuteur du bureau (registre-exec-bureau)", modifs: [cree('lib/registre-exec-bureau.ts', "export const EXEC = (n: string) => { switch (n) { default: throw new Error(n); } };\n"), prefixe('app/poseur/page.tsx', "import { EXEC } from '@/lib/registre-exec-bureau';\n")] },
  { id: 'M48', attendu: 'T8 hygiène (build)', titre: "Build : le chunk de /poseur contient un nom d'outil du bureau", modifs: buildFactice('x="affecter_planning"', 'x=1') },
  { id: 'M49', attendu: 'T8 hygiène (build)', titre: 'Build : window.__openLink dans le build de production', modifs: buildFactice('x=1', 'window.__openLink=function(){}') },

  // ── T9 : cliquet ──
  { id: 'M50', attendu: 'T9', titre: 'dettes.json : plafond de dettes trop bas (une dette de plus)', modifs: [remplace(`${REG}/dettes.json`, '"dette": 86', '"dette": 85')] },
  { id: 'M51', attendu: 'T9', titre: 'dettes.json : plafond d\'écarts trop haut (marge libérée non rendue)', modifs: [remplace(`${REG}/dettes.json`, '"ecart": 92', '"ecart": 93')] },
  { id: 'M52', attendu: 'T9', titre: 'Dette assignée à une livraison déjà en ligne (3a)', modifs: [apres(CAP_B, "id: 'B2'", "livraison: '3c'", "livraison: '3a'")] },
  { id: 'M53', attendu: 'T9', titre: 'Entrée interne.ts de plus que le plafond', modifs: [cree('app/fantome/page.tsx', 'export default function Page() { return null; }\n'), remplace(INT_B, 'export const INTERNE_BUREAU: EntreeInterne[] = [', `export const INTERNE_BUREAU: EntreeInterne[] = [\n  { cle: 'route:/fantome', raison: '${RAISON}' },`)] },
  { id: 'M54', attendu: 'T9', titre: 'Écriture non assistée de plus que le plafond', modifs: [remplace(INT_B, 'export const ECRITURES_NON_ASSISTEES_BUREAU: EntreeInterne[] = [];', `export const ECRITURES_NON_ASSISTEES_BUREAU: EntreeInterne[] = [\n  { cle: 'rpc:set_user_role', raison: '${RAISON}' },\n];`)] },

  // ── T10 : clics ──
  { id: 'M55', attendu: 'T10', mode: 'avertit', titre: 'Un onClick de plus dans un fichier d\'interface (avertit, ne bloque pas)', modifs: [ajoute(AD, '\nexport const MutationBouton = () => <button onClick={() => {}}>x</button>;\n')] },
  { id: 'M56', attendu: 'T10', titre: 'Le même, avec REGISTRE_CLICS=bloquer (bloque)', modifs: [ajoute(AD, '\nexport const MutationBouton = () => <button onClick={() => {}}>x</button>;\n')], env: { REGISTRE_CLICS: 'bloquer' } },

  // ── T11 : syntaxe hors cible du navigateur ──
  { id: 'M57', attendu: 'T11', titre: '.at() dans lib/openers.ts', modifs: [cree('lib/openers.ts', 'export const dernier = (l: number[]) => l.at(-1);\n')] },
  { id: 'M58', attendu: 'T11', titre: 'Assertion arrière (lookbehind) dans registre/vocab.ts', modifs: [ajoute(`${REG}/vocab.ts`, 'export const RE = /(?<=a)b/;\n')] },   // 3a-2 : vocab.ts existe, on y AJOUTE (cree l\'écraserait)
  { id: 'M59', attendu: 'T11', titre: 'replaceAll dans lib/use-seed-on-open.ts', modifs: [cree('lib/use-seed-on-open.ts', "export const net = (s: string) => s.replaceAll('a', 'b');\n")] },

  // ── Réglages (variables d'environnement du test) : chacun doit changer le verdict comme annoncé ──
  { id: 'M62', attendu: 'T2', mode: 'avertit', titre: 'Redesign en cours (SURFACES_EN_MIGRATION = true) : une clé périmée n\'est qu\'un avertissement', modifs: [remplace(`${REG}/surfaces.ts`, 'export const SURFACES_EN_MIGRATION = false;', 'export const SURFACES_EN_MIGRATION = true;'), apres(SURF_B, '  B1: [', "'route:/admin',", "'route:/admin',\n    'rpc:fantome_declare',")] },
  { id: 'M63', attendu: 'T3', mode: 'avertit', titre: 'Dette échue mais PR sans rapport (REGISTRE_DETTES_PERIMEES=avertir) : avertit sans bloquer', modifs: [], env: { REGISTRE_AUJOURDHUI: '2027-03-01', REGISTRE_DETTES_PERIMEES: 'avertir' } },
  { id: 'M64', attendu: 'T7', titre: 'À la livraison (REGISTRE_A_LA_LIVRAISON=1) : des cas jamais mesurés bloquent', modifs: [], env: { REGISTRE_A_LA_LIVRAISON: '1' } },

  // ── Garde-fous du dépôt ──
  { id: 'M60', attendu: 'Garde-fous', titre: 'Le job « deno » est retiré de la CI', modifs: [apres('.github/workflows/ci.yml', '  # Le registre de l\'assistant :', /[\s\S]*$/, '')] },
  { id: 'M61', attendu: 'Garde-fous', titre: 'Le modèle de PR perd la case clics.snapshot', modifs: [remplace('.github/pull_request_template.md', /clics\.snapshot/g, 'clics')] },
];

/** Un faux dossier out/ : une page /poseur et une page /admin, chacune avec un chunk (T8 lit le build construit, qui n'existe pas dans la copie). */
function buildFactice(chunkPoseur, chunkAdmin) {
  const page = (c) => `<html><script src="/_next/static/chunks/${c}.js"></script></html>`;
  return [
    cree('out/poseur.html', page('p')), cree('out/admin.html', page('a')),
    cree('out/_next/static/chunks/p.js', `${chunkPoseur};\n`), cree('out/_next/static/chunks/a.js', `${chunkAdmin};\n`),
  ];
}

// ── Lancement d'un test ──────────────────────────────────────────────────────
const sansCouleur = (t) => t.replace(/\x1b\[[0-9;]*m/g, '');
function lancer(racine, envSupp = {}) {
  return new Promise((ok) => {
    const env = { ...process.env, NO_COLOR: '1', REGISTRE_AUJOURDHUI: DATE_DE_REFERENCE, ...envSupp };
    for (const k of Object.keys(env)) if (k.startsWith('REGISTRE_') && !(k in envSupp) && k !== 'REGISTRE_AUJOURDHUI') delete env[k];
    const [cmd, ...pre] = process.env.DENO_BIN ? [process.env.DENO_BIN] : ['npx', '-y', 'deno@2'];
    const p = spawn(cmd, [...pre, 'test', '--allow-env', '--allow-read', TEST], { cwd: racine, env });
    let sortie = '';
    p.stdout.on('data', (d) => { sortie += d; }); p.stderr.on('data', (d) => { sortie += d; });
    const minuteur = setTimeout(() => p.kill('SIGKILL'), 240_000);
    p.on('close', (code) => { clearTimeout(minuteur); ok({ code, sortie: sansCouleur(sortie) }); });
  });
}
/** Les tests en échec (nom complet), les avertissements (« AVERTISSEMENT T10 »), et si le typage a échoué avant tout test. */
function lire(sortie) {
  const echecs = Array.from(sortie.matchAll(/^(.+?) \.\.\. FAILED/gm)).map((m) => m[1].trim());
  const avertis = Array.from(new Set(Array.from(sortie.matchAll(/^AVERTISSEMENT (T\d+)/gm)).map((m) => m[1])));
  const compilation = /error: (Type checking failed|Uncaught|Module not found)|TS\d+ \[ERROR\]/.test(sortie) && echecs.length === 0;
  const passes = /(\d+) passed/.exec(sortie)?.[1];
  return { echecs, avertis, compilation, passes };
}
/** Nom court d'un test pour le tableau : « T1 », « T3 dette échue », « T8 build », « T1 fixtures »… */
function court(nom) {
  const base = nom.split(' : ')[0];
  const m = /^(T\d+)/.exec(base);
  if (!m) return /^Garde-fous/.test(base) ? 'Garde-fous' : base.split(' ').slice(0, 2).join(' ');
  return `${m[1]}${/dette échue/.test(base) ? ' dette échue' : ''}${/\(build/.test(base) ? ' build' : ''}${/\(fixtures/.test(base) ? ' fixtures' : ''}`;
}
const correspond = (nom, attendu) => (/^T\d+$/.test(attendu) ? new RegExp(`^${attendu}(?!\\d)`).test(nom) && !/\(fixtures/.test(nom) : nom.startsWith(attendu));

// ── Programme ────────────────────────────────────────────────────────────────
function copierDepot(dest) {
  const filtre = (src) => !/(^|[\\/])(node_modules|\.next|out|\.git)([\\/]|$)/.test(src.slice(RACINE.length));
  for (const d of ['app', 'components', 'lib', 'hooks', 'supabase/functions', 'docs/ia-etape3', '.github']) {
    if (existsSync(join(RACINE, d))) cpSync(join(RACINE, d), join(dest, d), { recursive: true, filter: filtre });
  }
  mkdirSync(join(dest, 'scripts'), { recursive: true });
  for (const f of ['scripts/registre-outils-gen.ts', 'package.json']) if (existsSync(join(RACINE, f))) cpSync(join(RACINE, f), join(dest, f));
}

const aLancer = MUTATIONS.filter((m) => !SEULEMENT || SEULEMENT.includes(m.id));
if (args.includes('--liste')) {
  for (const m of MUTATIONS) console.log(`${m.id}  ${m.attendu.padEnd(18)} ${m.titre}`);
  console.log(`\n${MUTATIONS.length} mutations.`);
  process.exit(0);
}
if (!aLancer.length) { console.error('Aucune mutation ne correspond à --only.'); process.exit(2); }

const dossier = mkdtempSync(join(TMP, 'registre-mutations-'));
const copies = [];
const debut = Date.now();
try {
  console.log(`Copies du dépôt dans ${dossier} (${Math.min(JOBS, aLancer.length)} copie(s))…`);
  const nb = Math.min(JOBS, aLancer.length);
  for (let i = 0; i < nb; i++) {
    const d = join(dossier, `copie${i}`);
    if (i === 0) copierDepot(d); else cpSync(copies[0], d, { recursive: true });
    copies.push(d);
  }

  // Base saine : sans elle, « le test échoue » ne prouve rien (une copie incomplète échouerait toujours).
  const base = await lancer(copies[0]);
  const lb = lire(base.sortie);
  if (base.code !== 0) {
    console.error(`La BASE n'est pas verte (${lb.echecs.length} échec(s)${lb.compilation ? ', erreur de typage' : ''}) : aucune mutation ne prouverait rien.\n${base.sortie.slice(-3000)}`);
    process.exit(1);
  }
  console.log(`Base saine : ${lb.passes ?? '?'} tests passent, aucun n'échoue.\n`);

  // Chaque copie traite ses mutations l'une après l'autre ; plusieurs copies en parallèle.
  const resultats = new Map();
  const file = [...aLancer];
  await Promise.all(copies.map(async (copie) => {
    for (let m = file.shift(); m; m = file.shift()) {
      let defaut = null; let annuler = null; let r = null;
      try { annuler = appliquer(copie, m.modifs); r = await lancer(copie, m.env ?? {}); } catch (e) { defaut = e.message; } finally { if (annuler) annuler(); }
      if (defaut) { resultats.set(m.id, { m, ok: false, vus: [], note: `INAPPLICABLE : ${defaut}` }); continue; }
      const l = lire(r.sortie);
      const vus = Array.from(new Set(l.echecs.map(court)));
      let ok; let note = '';
      if (l.compilation) { ok = false; note = 'ERREUR DE TYPAGE avant tout test (mutation mal formée)'; }
      else if ((m.mode ?? 'echec') === 'avertit') { ok = r.code === 0 && l.avertis.includes(m.attendu); note = ok ? 'a averti sans bloquer' : `n'a pas averti (${l.avertis.join(', ') || 'aucun avertissement'}) ou a échoué`; }
      else { ok = r.code !== 0 && l.echecs.some((n) => correspond(n, m.attendu)); note = ok ? '' : r.code === 0 ? 'LE TEST PASSE : mutation non vue' : `échoue, mais pas par ${m.attendu}`; }
      resultats.set(m.id, { m, ok, vus: (m.mode ?? 'echec') === 'avertit' ? l.avertis.filter((a) => a === m.attendu).map((a) => `${a} (avertit)`) : vus, note });
      process.stdout.write(`${ok ? 'ok ' : 'KO '} ${m.id} ${m.attendu}\n`);
    }
  }));

  // Tableau : mutation → test qui l'a vue.
  const lignes = aLancer.map((m) => resultats.get(m.id));
  const larg = (f, min) => Math.max(min, ...lignes.map((l) => f(l).length));
  const cId = 4; const cTitre = Math.min(88, larg((l) => l.m.titre, 8)); const cAtt = larg((l) => l.m.attendu, 7); const cVu = Math.min(46, larg((l) => l.vus.join(', '), 6));
  const coupe = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t.padEnd(n));
  console.log(`\n${'#'.padEnd(cId)} | ${'mutation'.padEnd(cTitre)} | ${'attendu'.padEnd(cAtt)} | ${'vue par'.padEnd(cVu)} | verdict`);
  console.log(`${'-'.repeat(cId)}-+-${'-'.repeat(cTitre)}-+-${'-'.repeat(cAtt)}-+-${'-'.repeat(cVu)}-+--------`);
  for (const l of lignes) console.log(`${l.m.id.padEnd(cId)} | ${coupe(l.m.titre, cTitre)} | ${l.m.attendu.padEnd(cAtt)} | ${coupe(l.vus.join(', '), cVu)} | ${l.ok ? 'vue' : `MANQUÉE — ${l.note}`}`);
  const manquees = lignes.filter((l) => !l.ok);
  const secondes = Math.round((Date.now() - debut) / 1000);
  console.log(`\n${lignes.length - manquees.length}/${lignes.length} mutations vues par le test attendu, en ${secondes} s.`);
  if (manquees.length) { console.log(`MANQUÉES : ${manquees.map((l) => l.m.id).join(', ')}`); process.exitCode = 1; }
} finally {
  if (!GARDER) rmSync(dossier, { recursive: true, force: true }); else console.log(`Copies gardées dans ${dossier}`);
}
