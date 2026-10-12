// Lot 6 — outils envoyés au modèle par DOMAINE : plus légers, sans perdre une
// action. CHAQUE phrase du jeu d'évaluation (bureau et salarié) doit garder
// l'outil attendu dans la sélection.   npm run test:ia-domaines
import { ASSISTANT_FUNCTIONS, ATTACHMENT_FUNCTIONS, buildActionContext, functionsFor, handleActionLocally, type ActionContext } from './assistant-actions-core.ts';
import { WORKER_ATTACHMENT_FUNCTIONS, WORKER_FUNCTIONS, buildWorkerSnapshot, handleWorkerLocally, workerFunctionsFor, type WorkerLive, type WorkerSnapshot } from './worker-assistant-core.ts';
import { domainTools, OFFICE_DOMAINS, WORKER_DOMAINS } from './tool-domains.ts';
import { ADMIN_RAW, CASES, LIVE_EN_COURS, ME, WORKER_LIVE, WORKER_RAW } from '../assistant-eval/cases.ts';

// L'outil attendu de chaque phrase, lu dans cases.ts (act('x'), o.type === 'x', réponse, heures, collègues).
const SRC = await Deno.readTextFile(new URL('../assistant-eval/cases.ts', import.meta.url));
function expectedTool(id: string, cote: string): string | null {
  const at = SRC.indexOf(`id: '${id}'`);
  const next = SRC.indexOf("{ id: '", at + 5);
  const chunk = SRC.slice(at, next < 0 ? undefined : next);
  const m = /check: act\('(\w+)'/.exec(chunk) ?? /o\.type === '(\w+)'/.exec(chunk);
  if (m) return m[1];
  if (/check: (answer|refus)\(/.test(chunk)) return 'repondre';
  if (/check: draft\(/.test(chunk)) return 'declarer_heures';
  if (/check: coll\(/.test(chunk)) return cote === 'salarie' ? 'planning_collegues' : null;
  return null;
}

Deno.test('Domaines : chaque outil du bureau et du salarié appartient à au moins un domaine', () => {
  const office = new Set(Object.values(OFFICE_DOMAINS).flatMap((d) => d.tools));
  const worker = new Set(Object.values(WORKER_DOMAINS).flatMap((d) => d.tools));
  const lostO = ASSISTANT_FUNCTIONS.map((f) => f.name).filter((n) => n !== 'repondre' && !office.has(n));
  const lostW = WORKER_FUNCTIONS.map((f) => f.name).filter((n) => n !== 'repondre' && !worker.has(n));
  if (lostO.length || lostW.length) throw new Error(`outils sans domaine : ${[...lostO, ...lostW].join(', ')}`);
  // Et aucun nom de domaine qui ne serait pas un vrai outil (faute de frappe).
  const real = new Set([...ASSISTANT_FUNCTIONS, ...WORKER_FUNCTIONS].map((f) => f.name));
  const typo = [...office, ...worker].filter((n) => !real.has(n));
  if (typo.length) throw new Error(`outils inconnus : ${typo.join(', ')}`);
});

Deno.test('Jeu d’évaluation : l’outil attendu reste proposé, pour CHAQUE phrase (bureau ET salarié, même celles du lecteur local)', () => {
  const lost: string[] = [];
  let total = 0, viaIa = 0, smaller = 0, sum = 0, sumAll = 0, bureau = 0, salarie = 0;
  for (const c of CASES) {
    const tool = expectedTool(c.id, c.cote);
    if (!tool) throw new Error(`${c.id} : outil attendu illisible dans cases.ts`);
    total++;
    let fns: string[], all: number, local: boolean;
    if (c.cote === 'bureau') {
      bureau++;
      const ctx = buildActionContext(ADMIN_RAW as Parameters<typeof buildActionContext>[0]) as ActionContext;
      ctx.me = ME; ctx.demande = c.phrase;
      local = !c.file && !!handleActionLocally(c.phrase, ctx);
      fns = functionsFor(!!c.file, c.phrase).map((f) => f.name);
      all = c.file ? ATTACHMENT_FUNCTIONS.length : ASSISTANT_FUNCTIONS.length;
    } else {
      salarie++;
      const snap = buildWorkerSnapshot(WORKER_RAW as never) as WorkerSnapshot;
      snap.demande = c.phrase;
      const live = { ...WORKER_LIVE, enCours: c.enCours ? LIVE_EN_COURS : null } as WorkerLive;
      local = !c.file && !!handleWorkerLocally(c.phrase, snap, live);
      fns = workerFunctionsFor(!!c.file, c.phrase).map((f) => f.name);
      all = c.file ? WORKER_ATTACHMENT_FUNCTIONS.length : WORKER_FUNCTIONS.length;
    }
    // Vérifié pour TOUTES les phrases : si le lecteur local ne la prenait plus, le modèle verrait quand même l'outil attendu.
    if (!fns.includes(tool)) lost.push(`${c.id} « ${c.phrase} » : ${tool} absent (${fns.join(',')})`);
    if (!local) { viaIa++; sum += fns.length; sumAll += all; if (fns.length < all) smaller++; }
  }
  console.log(`${total} phrases (${bureau} bureau, ${salarie} salarié) : l’outil attendu est proposé à chacune. ${viaIa} passent par le modèle ; ${smaller} reçoivent moins d’outils ; ${sum} déclarations au lieu de ${sumAll} (−${Math.round((1 - sum / Math.max(1, sumAll)) * 100)} %).`);
  if (lost.length) throw new Error(`Actions perdues :\n${lost.join('\n')}`);
  if (!viaIa || !bureau || !salarie || total !== CASES.length) throw new Error('jeu d’évaluation incomplet');
});

Deno.test('Domaines : exemples précis, et « rien reconnu » = tous les outils', () => {
  const office = (q: string) => functionsFor(false, q).map((f) => f.name);
  const a = office('ajoute une dépense de 450 euros de placo sur villa dupont');
  if (!a.includes('ajouter_depense') || a.includes('changer_role') || a.includes('modifier_reglages')) throw new Error(`dépense : ${a.join(',')}`);
  const b = office('passe kevin chef d’équipe');
  if (!b.includes('changer_role') || b.includes('ajouter_depense')) throw new Error(`rôle : ${b.join(',')}`);
  if (!office('xyz').includes('cloturer_mois') || office('xyz').length !== ASSISTANT_FUNCTIONS.length) throw new Error('aucun domaine : tout doit partir');
  if (functionsFor(false).length !== ASSISTANT_FUNCTIONS.length) throw new Error('sans phrase : tout, comme avant');
  if (domainTools('blabla', OFFICE_DOMAINS) !== null) throw new Error('rien reconnu → null');
  for (const q of ['ajoute une dépense de 450 euros', 'xyz', 'passe kevin chef']) {
    if (!office(q).includes('repondre')) throw new Error(`« repondre » toujours là (${q})`);
  }
  // Fichier joint : la liste « documents » du lot 1, jamais élargie par un domaine.
  const f = functionsFor(true, 'efface le planning de toute l’équipe').map((x) => x.name);
  if (f.includes('effacer_planning') || f.length !== ATTACHMENT_FUNCTIONS.length) throw new Error(`fichier : ${f.join(',')}`);
  const w = workerFunctionsFor(true, 'efface ma journée').map((x) => x.name);
  if (w.includes('effacer_heures') || w.length !== WORKER_ATTACHMENT_FUNCTIONS.length) throw new Error(`fichier salarié : ${w.join(',')}`);
  const c = workerFunctionsFor(false, 'où est sofiane demain').map((x) => x.name);
  if (!c.includes('planning_collegues')) throw new Error(`collègues : ${c.join(',')}`);
});
