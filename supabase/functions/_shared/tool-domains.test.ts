// Lot 6 — outils envoyés au modèle par DOMAINE : plus légers, sans perdre une
// action. CHAQUE phrase du jeu d'évaluation (bureau et salarié) doit garder
// l'outil attendu dans la sélection.   npm run test:ia-domaines
import { actionPrompt, ASSISTANT_FUNCTIONS, ATTACHMENT_FUNCTIONS, buildActionContext, functionsFor, guideForPrompt, handleActionLocally, type ActionContext } from './assistant-actions-core.ts';
import { WORKER_ATTACHMENT_FUNCTIONS, WORKER_FUNCTIONS, buildWorkerSnapshot, handleWorkerLocally, workerFunctionsFor, type WorkerLive, type WorkerSnapshot } from './worker-assistant-core.ts';
import { domainTools, OFFICE_DOMAINS, WORKER_DOMAINS } from './tool-domains.ts';
import { low } from './fr-langue.ts';
import { ADMIN_RAW, CASES, LIVE_EN_COURS, ME, WORKER_LIVE, WORKER_RAW } from '../assistant-eval/cases.ts';

// L'outil attendu de chaque phrase, lu dans cases.ts (act('x'), actAvecProblemes('x'), o.type === 'x', réponse, heures, collègues).
const SRC = await Deno.readTextFile(new URL('../assistant-eval/cases.ts', import.meta.url));
function expectedTool(id: string, cote: string): string | null {
  const at = SRC.indexOf(`id: '${id}'`);
  const next = SRC.indexOf("{ id: '", at + 5);
  const chunk = SRC.slice(at, next < 0 ? undefined : next);
  const m = /check: act(?:AvecProblemes)?\('(\w+)'/.exec(chunk) ?? /o\.type === '(\w+)'/.exec(chunk);
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

// Correction « retire X du planning » : le modèle prenait effacer_planning pour supprimer_intervention (2 essais sur 3).
// On fige la FRONTIÈRE (un jour + un nom ⇒ supprimer_intervention ; période, semaine, équipe ⇒ effacer_planning), pas des exemples de date :
// un exemple « cette semaine » avait poussé le modèle vers la semaine en cours (régression de b36, mesurée sur le vrai modèle).
Deno.test('« Retire X » / « vide le planning » : la frontière est écrite dans les DEUX descriptions et dans la consigne, sans exemple de date', () => {
  const desc = (n: string) => ASSISTANT_FUNCTIONS.find((f) => f.name === n)!.description;
  const un = desc('supprimer_intervention'), tout = desc('effacer_planning');
  // supprimer_intervention : UNE case, un salarié (ou un chantier) et UN seul jour ; le reste va à l'autre outil.
  for (const m of ['UNE intervention', 'UN seul jour', 'salarié', 'chantier', 'plusieurs jours', 'semaine', 'toute l’équipe', 'effacer_planning']) {
    if (!un.includes(m)) throw new Error(`supprimer_intervention : « ${m} » manque dans la description : ${un}`);
  }
  // effacer_planning : vider (un salarié sur plusieurs jours / une période / une semaine, ou l'équipe) ; « retire X + UN seul jour » renvoie à l'autre outil.
  for (const m of ['VIDER', 'UN salarié', 'plusieurs jours', 'période', 'semaine', 'TOUTE l’équipe', 'UN seul jour', 'supprimer_intervention']) {
    if (!tout.includes(m)) throw new Error(`effacer_planning : « ${m} » manque dans la description : ${tout}`);
  }
  // La consigne de l'assistant donne la même règle.
  const ctx = buildActionContext(ADMIN_RAW as Parameters<typeof buildActionContext>[0]) as ActionContext;
  const prompt = actionPrompt(ctx, '{}', guideForPrompt(), 'x');
  const ligne = prompt.split('\n').find((l) => l.includes('→ supprimer_intervention') && l.includes('→ effacer_planning'));
  if (!ligne || !ligne.includes('UN seul jour') || !/vide \/ efface le planning/.test(ligne)) throw new Error('la consigne ne donne pas la frontière supprimer_intervention / effacer_planning');
  // Aucune date dans les exemples : ni « cette semaine » / semaine en cours dans ces textes.
  const textes = [un, tout, ligne];
  for (const t of textes) {
    if (/cette semaine|semaine en cours|semaine actuelle|aujourd/i.test(t)) throw new Error(`date relative dans un exemple : ${t}`);
  }
  for (const f of ASSISTANT_FUNCTIONS) {
    if (/cette semaine/i.test(f.description)) throw new Error(`« cette semaine » dans la description de ${f.name}`);
  }
  type Props = { properties: Record<string, { description: string }> };
  // Règle de date écrite dans les paramètres : un nom de jour seul = le PROCHAIN jour de ce nom du calendrier, jamais un jour passé
  // (le modèle prenait le lundi de la semaine en cours, déjà passé, pour « de lundi à mercredi »). PAS pour les absences : elles peuvent être rétroactives.
  const param = (outil: string, nom: string) => ((ASSISTANT_FUNCTIONS.find((f) => f.name === outil)!.parameters as unknown as Props).properties[nom]?.description ?? '');
  for (const [outil, nom] of [['effacer_planning', 'du'], ['effacer_planning', 'au'], ['supprimer_intervention', 'date']]) {
    const d = param(outil, nom);
    if (!/PROCHAIN/.test(d) || !/CALENDRIER/.test(d) || !/jamais un jour (déjà )?passé/.test(d)) throw new Error(`${outil}.${nom} : la règle « prochain jour du calendrier, jamais un jour passé » manque : « ${d} »`);
  }
  for (const f of ASSISTANT_FUNCTIONS) {
    for (const [nom, p] of Object.entries((f.parameters as unknown as Props).properties)) {
      if (/cette semaine/i.test(p.description)) throw new Error(`« cette semaine » dans ${f.name}.${nom}`);
    }
  }
  // On ne dresse pas le modèle sur le test : aucune phrase du jeu d'évaluation n'est recopiée dans ces textes.
  const norm = (x: string) => low(x).replace(/\s+/g, ' ');
  for (const c of CASES.filter((x) => x.cote === 'bureau')) {
    const phrase = norm(c.phrase);
    if (textes.some((t) => norm(t).includes(phrase))) throw new Error(`phrase du jeu d’évaluation recopiée (${c.id}) : « ${c.phrase} »`);
  }
});

Deno.test('« Retire X » / « vide le planning » : les deux outils sont TOUJOURS envoyés ensemble, jamais l’un sans l’autre', () => {
  // Dans la table des domaines : aucun domaine ne porte l'un sans l'autre.
  for (const [nom, d] of Object.entries(OFFICE_DOMAINS)) {
    if (d.tools.includes('supprimer_intervention') !== d.tools.includes('effacer_planning')) throw new Error(`domaine « ${nom} » : un seul des deux outils`);
  }
  const noms = (q: string) => functionsFor(false, q).map((f) => f.name);
  const phrases = [
    'retire karim du planning demain', 'Enlève Kevin de la Villa Dupont vendredi', 'enlève Karim de lundi', 'retire-moi du planning de jeudi', 'vire Kevin de vendredi',
    'efface le planning de karim jeudi', 'vide le planning de karim de lundi à mercredi', 'efface le planning de la semaine prochaine', 'vide la semaine', 'efface tout',
    'effacer le planning de toute l’équipe', 'supprime l’intervention de Kevin', 'supprime le planning de Karim', 'annule l’intervention de jeudi', 'retirer Sofiane du chantier Dupont',
    // et chaque phrase du jeu d'évaluation qui parle de retirer / enlever / effacer / vider
    ...CASES.filter((c) => c.cote === 'bureau' && /retir|enlev|effac|vid/i.test(c.phrase)).map((c) => c.phrase),
  ];
  for (const q of phrases) {
    const n = noms(q);
    if (!n.includes('supprimer_intervention') || !n.includes('effacer_planning')) throw new Error(`« ${q} » : ${n.includes('supprimer_intervention') ? '' : 'supprimer_intervention absent '}${n.includes('effacer_planning') ? '' : 'effacer_planning absent'}`);
  }
  // Et une phrase sans rapport avec le planning n'envoie ni l'un ni l'autre (le filtre sert toujours).
  const autre = noms('ajoute une dépense de 450 euros de placo sur villa dupont');
  if (autre.includes('supprimer_intervention') || autre.includes('effacer_planning')) throw new Error(`dépense : ${autre.join(',')}`);
});
