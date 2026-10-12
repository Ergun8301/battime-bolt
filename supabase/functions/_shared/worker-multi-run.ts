// Salarié, fiche « Tout confirmer » : l'EXÉCUTION, dans l'ordre et sans rien avant le clic.
//
// Pur : aucun import du navigateur, aucune API Deno. Tout ce qui touche la base ou l'écran passe par `deps`
// (lib/worker-multi.ts construit les vrais, les tests de worker-multi-run.test.ts de faux), ce qui permet de
// tester l'ordre, les dépendances et les échecs partiels sans navigateur.
//
// L'ordre est celui de la fiche : chantier (créé ou retrouvé) → heures → panier → réserve → congé → envoi.
// Un élément qui échoue ou qui est « pas fait » bloque ceux qui en dépendent (l'envoi, étape irréversible, ne part
// jamais sans ce que le salarié avait demandé dans la même phrase). Le congé est indépendant.
// RÈGLE NAVIGATEUR : aucune assertion arrière (Safari < 16.4), ni .at() ni structuredClone.
import {
  fmtMin, isWorkerRemoval, shiftMinutes, toMin,
  type DraftLine, type NewWorksite, type WorkerActionDraft, type WorkerSnapshot,
} from './worker-assistant-core.ts';
import { cleanNewWorksite, memeChantier, MULTI_AUTORISES, verifierFiche, type DejaNotee, type MultiItem } from './worker-multi.ts';

export type UndoFn = () => Promise<{ ok: boolean; message: string; partial?: boolean }>;
/** Ce que rend l'enregistrement des lignes d'heures (lib/worker-assistant.ts : makeWorkerSaver avec `undoPartiel`). */
export interface SaveOutcome {
  ok: number; queued: number; undo?: UndoFn;
  /** Lignes écrites sur le serveur (`key` = la clé stable de la ligne de la fiche). */
  created?: { key?: string; localId: string; start: string; end: string }[];
  /** Lignes gardées sur le téléphone. */
  queuedLocalIds?: string[];
  /** Parmi elles, celles mises en file faute de réseau (les autres : refus du serveur ou réseau lâché en plein envoi). */
  queuedOffline?: number;
}
export type SaveFn = (date: string, lines: DraftLine[]) => Promise<SaveOutcome>;
export interface ExecOutcome { ok: boolean; message: string; undo?: UndoFn }
export type ExecFn = (d: WorkerActionDraft) => Promise<ExecOutcome>;
export interface CreatedWorksite { id: string; nom: string; ville: string }

export interface MultiDeps {
  online: () => boolean;
  /** Aujourd'hui (Paris). */
  today: () => string;
  /** Chantiers ACTIFS de l'entreprise, relus maintenant, comparés par `memeChantier`. */
  findWorksite: (nw: NewWorksite) => Promise<CreatedWorksite | null>;
  /** Insert sous withOrigin('assistant'), champ par champ. */
  createWorksite: (nw: NewWorksite) => Promise<CreatedWorksite>;
  /** Reconstruit APRÈS la création du chantier (il doit figurer dans la liste). */
  makeSaver: (chantiers: WorkerSnapshot['chantiers']) => SaveFn;
  resolveEntryIds: (localIds: string[]) => Promise<Record<string, string>>;
  execute: ExecFn;
  /** AVALE toutes ses erreurs : jamais bloquant, jamais compté comme l'échec d'un élément. */
  journal: (action: string, summary: string) => Promise<void>;
  /** Facultatif : l'écran suit l'avancement (statut de chaque élément) et garde le chantier créé en mémoire. */
  onProgress?: (results: ItemResult[]) => void;
  onWorksite?: (itemId: string, ws: CreatedWorksite & { created: boolean }) => void;
}

export type ItemStatus = 'todo' | 'running' | 'done' | 'failed' | 'skipped' | 'ignored';
export interface ItemResult { id: string; label: string; status: ItemStatus; message: string }

/** La fiche TELLE QUE LE SALARIÉ L'A LAISSÉE : seuls les éléments restants, déjà édités par la carte. */
export interface MultiRunInput {
  items: MultiItem[];
  /** Jour des heures (éditable). */
  date: string;
  /** snapshot.aujourdhui de la réponse : les annexes (panier, réserve, envoi) visent ce jour-là. */
  aujourdhui: string;
  chantiers: WorkerSnapshot['chantiers'];
  dejaNotees: DejaNotee[];
  /** Panier : l'entreprise ne l'utilise pas (false) → ignoré, sans rien lire ni écrire. */
  meal: boolean | null;
  /** Chantiers déjà créés par une exécution précédente de cette carte (mémoire de carte) : réutilisés sans nouvelle recherche. */
  worksites?: Record<string, CreatedWorksite & { created: boolean }>;
}
export interface MultiRun {
  results: ItemResult[];
  worksites: Record<string, CreatedWorksite & { created: boolean }>;
  /** Vrai dès qu'un chantier a été créé, qu'une ligne a été écrite ou gardée sur le téléphone, ou qu'une annexe a été exécutée. Alors la carte est FINALE (jamais de « Réessayer » : les lignes seraient en double). */
  wrote: boolean;
  sent: boolean;
  /** Arrêt AVANT toute écriture (rien n'a été enregistré, la fiche reste modifiable). */
  stopped?: string;
  /** Message de fin, prêt à afficher. */
  message: string;
  undo?: UndoFn;
}

const NOM_ANNEXE: Record<string, string> = {
  panier_repas: 'Panier repas', signaler_reserve: 'Réserve', reserve_corrigee: 'Lever la réserve', demander_conge: 'Congé', envoyer_journee: 'Envoi de la journée',
};
const JOUR_SEUL = ['panier_repas', 'signaler_reserve', 'reserve_corrigee', 'envoyer_journee'];
const creneaux = (n: number) => `${n} créneau${n > 1 ? 'x' : ''}`;
const enregistres = (n: number) => `${creneaux(n)} enregistré${n > 1 ? 's' : ''}`;
const nonEnregistres = (n: number) => `${n} non enregistré${n > 1 ? 's' : ''}`;
const MSG_PAS_RESEAU = 'Pas de réseau : le nouveau chantier ne peut pas être créé. Rien n’a été enregistré. Réessayez quand le réseau est revenu.';
const MSG_CHANTIER_ECHEC = 'Le chantier n’a pas pu être créé. Rien n’a été enregistré. Réessayez.';
const MSG_DEPEND = 'un élément précédent n’a pas abouti : envoyez la journée depuis « Ma journée »';

/** Le message d'un envoi refusé, vouvoyé (l'exécuteur hérité tutoie). */
function envoiRefuse(message: string): string {
  if (/chevauch/.test(message)) return 'deux créneaux de la journée se chevauchent : corrigez-les dans « Ma journée », puis envoyez la journée.';
  if (/6 h/.test(message)) return 'plus de 6 h d’affilée sans pause notée : envoyez la journée depuis « Ma journée », la pause y est demandée.';
  return 'l’envoi n’a pas été fait ; vos heures restent notées. Envoyez la journée depuis « Ma journée ».';
}

/** `reutilise_id` n'est valable que si le chantier figure dans la liste ET qu'il porte encore le nom et la ville du bloc (jamais cru sur parole). */
export function reutilisable(bloc: NewWorksite, chantiers: WorkerSnapshot['chantiers']): CreatedWorksite | null {
  const c = bloc.reutilise_id ? chantiers.find((x) => x.id === bloc.reutilise_id) : undefined;
  return c && memeChantier(bloc, { nom: c.nom, ville: c.ville }) ? { id: c.id, nom: c.nom, ville: c.ville ?? '' } : null;
}

/** La ligne visée par une réserve : par CHANTIER (la dernière du chantier), ou par clé (`draft:L1`), ou une ligne déjà notée (id réel). */
function ligneVisee(d: Extract<WorkerActionDraft, { type: 'signaler_reserve' | 'reserve_corrigee' }>, cible: { chantier_id: string | null; nouveau: boolean } | undefined, lines: DraftLine[]): { key?: string; id?: string } | null {
  if (cible) {
    const du = lines.filter((l) => (cible.nouveau ? !!l.nouveau : !!cible.chantier_id && l.worksite_id === cible.chantier_id));
    const derniere = du.slice().sort((a, b) => toMin(b.start) - toMin(a.start))[0];
    return derniere?.key ? { key: derniere.key } : null;
  }
  if (d.entry_id && d.entry_id.indexOf('draft:') === 0) {
    const key = d.entry_id.slice('draft:'.length);
    return lines.some((l) => l.key === key) ? { key } : null;
  }
  return d.entry_id ? { id: d.entry_id } : null;
}

const blocDe = (i: MultiItem): NewWorksite | undefined => (i.kind === 'chantier' ? i.nouveau_chantier : i.kind === 'heures' ? i.draft.nouveau_chantier : undefined);

export async function runMulti(input: MultiRunInput, deps: MultiDeps): Promise<MultiRun> {
  const { date, aujourdhui, chantiers, items } = input;
  const heuresItem = items.find((i): i is Extract<MultiItem, { kind: 'heures' }> => i.kind === 'heures');
  const lines = heuresItem ? heuresItem.draft.lines : [];
  const worksites: MultiRun['worksites'] = { ...(input.worksites ?? {}) };
  const undoSteps: UndoFn[] = [];
  let wrote = false, sent = false, congeEnvoye = false;

  // ── Garde-fous d'entrée : rien n'est écrit avant d'avoir tout vérifié ──────────────────────────
  // Seuls le panier, la réserve, le congé et l'envoi passent (jamais un effacement, un retrait ni une copie).
  const admis = (i: MultiItem) => i.kind !== 'action' || ((MULTI_AUTORISES as readonly string[]).includes(i.action.draft.type) && !isWorkerRemoval(i.action.draft));
  // Un bloc « nouveau chantier » est à créer si un chantier est dit seul, ou si au moins un créneau est dessus.
  const blocs = items.filter((i) => admis(i) && (i.kind === 'chantier' || (i.kind === 'heures' && !!i.draft.nouveau_chantier && i.draft.lines.some((l) => l.nouveau))))
    .map((item) => {
      const brut = blocDe(item)!;
      const bloc = cleanNewWorksite(brut);
      return { item, bloc, rid: item.kind === 'chantier' ? item.id : `${item.id}:chantier`, deja: reutilisable({ ...bloc, reutilise_id: brut.reutilise_id }, chantiers) ?? worksites[item.id] ?? null };
    });

  const results: ItemResult[] = [];
  for (const i of items) {
    const b = blocs.find((x) => x.item === i && x.rid !== i.id);
    if (b) results.push({ id: b.rid, label: 'Nouveau chantier', status: 'todo', message: '' });
    results.push({ id: i.id, label: i.kind === 'heures' ? 'Heures' : i.kind === 'chantier' ? 'Nouveau chantier' : NOM_ANNEXE[i.action.draft.type] ?? 'Action', status: 'todo', message: '' });
  }
  const res = (id: string) => results.find((r) => r.id === id)!;
  const set = (id: string, status: ItemStatus, message: string) => { const r = res(id); r.status = status; r.message = message; deps.onProgress?.(results.map((x) => ({ ...x }))); };
  const stop = (stopped: string): MultiRun => ({ results, worksites, wrote, sent, stopped, message: stopped });
  for (const i of items) if (!admis(i)) set(i.id, 'failed', 'action non autorisée dans une fiche');

  for (const b of blocs) if (!b.deja && (!b.bloc.nom || !b.bloc.ville)) return stop('Complétez le nom et la ville du chantier : rien n’a été enregistré.');
  if (blocs.some((b) => !b.deja) && !deps.online()) return stop(MSG_PAS_RESEAU);
  if (heuresItem) {
    if (!lines.length) return stop('Aucun créneau à enregistrer.');
    if (lines.some((l) => !l.nouveau && !l.worksite_id)) return stop('Choisissez le chantier de chaque créneau : rien n’a été enregistré.');
    const erreurs = verifierFiche(date, lines, aujourdhui, input.dejaNotees);
    if (erreurs.length) return stop(`${erreurs[0]} Rien n’a été enregistré.`);
  }
  // La fiche confirmée après minuit : les annexes visent « aujourd'hui » (celui de la fiche), pas celui d'après.
  const jourChange = deps.today() !== aujourdhui;

  // ── 1. Chantiers : retrouvés, sinon créés (à la confirmation seulement) ───────────────────────
  const siteOf: Record<string, CreatedWorksite> = {};
  for (const { item, bloc, rid, deja } of blocs) {
    if (deja) {
      siteOf[item.id] = deja;
      // Déjà créé par une exécution précédente de cette carte : sans nouvelle recherche, et dit « créé ».
      set(rid, 'done', 'created' in deja && deja.created ? `chantier « ${deja.nom} » créé` : `chantier « ${deja.nom} » utilisé (il existait déjà)`);
      continue;
    }
    set(rid, 'running', '');
    let w: (CreatedWorksite & { created: boolean }) | null = null;
    try { const found = await deps.findWorksite(bloc); if (found) w = { ...found, created: false }; } catch { /* la création essaiera, puis relira */ }
    if (!w) {
      try {
        w = { ...(await deps.createWorksite(bloc)), created: true };
      } catch {
        // La réponse a pu se perdre APRÈS la création : on relit une fois.
        try { const found = await deps.findWorksite(bloc); if (found) w = { ...found, created: false }; } catch { /* rien */ }
      }
    }
    if (!w) {
      if (!wrote) return stop(MSG_CHANTIER_ECHEC);
      set(rid, 'failed', 'le chantier n’a pas pu être créé');
      continue;
    }
    siteOf[item.id] = w;
    worksites[item.id] = w;
    deps.onWorksite?.(item.id, w);
    if (w.created) {
      wrote = true;
      try { await deps.journal('nouveau_chantier', `Chantier créé (${bloc.ville})`); } catch { /* le journal est une trace, jamais une étape */ }
      set(rid, 'done', `chantier « ${w.nom} » créé`);
    } else {
      set(rid, 'done', `chantier « ${w.nom} » utilisé (il existait déjà)`);
    }
  }

  // ── 2. Heures ─────────────────────────────────────────────────────────────────────────────
  let ecrites: NonNullable<SaveOutcome['created']> = [];
  let lignesFinales: DraftLine[] = lines;
  if (heuresItem && admis(heuresItem)) {
    const w = siteOf[heuresItem.id];
    if (lines.some((l) => l.nouveau) && !w) {
      set(heuresItem.id, 'skipped', 'le chantier n’est pas créé');
    } else {
      lignesFinales = lines.map((l) => (l.nouveau ? { ...l, worksite_id: w.id, worksite_text: w.nom, nouveau: undefined } : l));
      const saver = deps.makeSaver(w ? [...chantiers.filter((c) => c.id !== w.id), { id: w.id, nom: w.nom, ville: w.ville || null }] : chantiers);
      set(heuresItem.id, 'running', '');
      try {
        const r = await saver(date, lignesFinales);
        ecrites = r.created ?? [];
        if (r.ok > 0 || r.queued > 0) wrote = true;
        if (r.undo && (r.ok > 0 || r.queued > 0)) undoSteps.push(r.undo);
        const net = lignesFinales.reduce((t, l) => t + Math.max(0, shiftMinutes(l.start, l.end, Number.isFinite(l.break_minutes) ? l.break_minutes : 0) || 0), 0);
        const horsLigne = r.queued > 0 && (r.queuedOffline ?? 0) >= r.queued;
        if (r.queued === 0 && r.ok === lignesFinales.length) {
          set(heuresItem.id, 'done', `${enregistres(r.ok)} (${fmtMin(net)})`);
        } else if (r.ok === 0) {
          set(heuresItem.id, 'failed', horsLigne
            ? `pas de réseau, ${creneaux(r.queued)} gardé${r.queued > 1 ? 's' : ''} sur le téléphone. Ils partiront dès que le réseau revient`
            : `le serveur n’a pas enregistré ${creneaux(r.queued)}. Vérifiez dans « Ma journée »`);
        } else {
          // On ne promet un départ automatique que s'il n'y a eu que des mises en file faute de réseau : un refus du serveur serait réessayé sans fin.
          set(heuresItem.id, 'failed', `${enregistres(r.ok)}, ${nonEnregistres(r.queued)} : vérifiez dans « Ma journée »${horsLigne ? '. Les créneaux non enregistrés partiront dès que le réseau revient' : ''}`);
        }
      } catch {
        wrote = true; // on ne sait pas ce qui est parti : jamais de « Réessayer » qui écrirait en double
        set(heuresItem.id, 'failed', 'les heures n’ont peut-être pas été enregistrées : vérifiez dans « Ma journée » avant de recommencer');
      }
    }
  }

  // ── 3. Annexes, dans l'ordre de la fiche ──────────────────────────────────────────────────────
  const etat = (id: string) => results.find((r) => r.id === id)?.status;
  const bloque = (id: string) => etat(id) === 'failed' || etat(id) === 'skipped';
  let ids: Record<string, string> | null = null;
  for (const it of items) {
    if (it.kind !== 'action' || !admis(it)) continue;
    const d = it.action.draft;
    if (d.type === 'panier_repas' && input.meal === false) { set(it.id, 'ignored', 'votre entreprise n’utilise pas le panier repas : ignoré'); continue; }
    if (JOUR_SEUL.includes(d.type) && (jourChange || (!!heuresItem && date !== aujourdhui))) {
      set(it.id, 'skipped', jourChange ? 'la journée a changé depuis la fiche : redemandez-les' : 'ne concerne que la journée d’aujourd’hui');
      continue;
    }
    if (it.depend.some(bloque)) {
      set(it.id, 'skipped', d.type === 'envoyer_journee' ? MSG_DEPEND : heuresItem && bloque(heuresItem.id) ? 'les heures ne sont pas enregistrées' : 'un élément précédent n’a pas abouti');
      continue;
    }
    set(it.id, 'running', '');
    let draft: WorkerActionDraft = d;
    if (d.type === 'signaler_reserve' || d.type === 'reserve_corrigee') {
      // Les lignes de la fiche TELLES QUE LE SALARIÉ LES A ÉDITÉES (avec leur drapeau « nouveau »), pas celles envoyées au saver.
      const visee = ligneVisee(d, it.cible, lines);
      let entryId: string | null = visee?.id ?? null;
      const ecrite = visee?.key ? ecrites.find((x) => x.key === visee.key) : undefined;
      if (ecrite) {
        try { ids = ids ?? await deps.resolveEntryIds(ecrites.map((x) => x.localId)); entryId = ids[ecrite.localId] ?? null; } catch { entryId = null; }
      }
      if (!entryId) { set(it.id, 'failed', 'réserve non posée : la ligne n’a pas été retrouvée'); continue; }
      draft = { ...d, entry_id: entryId } as WorkerActionDraft;
    }
    let r: ExecOutcome;
    try { r = await deps.execute(draft); } catch (e) { r = { ok: false, message: (e as { message?: string } | null)?.message || 'Action impossible.' }; }
    if (!r.ok) { set(it.id, 'failed', d.type === 'envoyer_journee' ? envoiRefuse(r.message) : (r.message || 'action impossible')); continue; }
    wrote = true;
    if (d.type === 'envoyer_journee') sent = true;
    else if (d.type === 'demander_conge') congeEnvoye = true;
    else if (r.undo) undoSteps.push(r.undo);
    set(it.id, 'done', d.type === 'panier_repas' ? (d.valeur ? 'panier repas coché' : 'panier repas retiré')
      : d.type === 'signaler_reserve' ? 'réserve posée' : d.type === 'reserve_corrigee' ? 'réserve levée'
      : d.type === 'demander_conge' ? 'demande de congé envoyée' : 'journée envoyée');
  }

  const crees = Object.keys(worksites).map((k) => worksites[k]).filter((w) => w.created);
  return { results, worksites, wrote, sent, message: messageFinal(results), undo: sent ? undefined : compositeUndo(undoSteps, crees, congeEnvoye) };
}

/** « Fait : … Pas fait : …(raison). » à partir des résultats ; les heures d'abord, puis le chantier, puis le reste dans l'ordre de la fiche. */
export function messageFinal(results: ItemResult[]): string {
  const rang = (r: ItemResult) => (r.label === 'Heures' ? 0 : r.label === 'Nouveau chantier' ? 1 : 2);
  const ordre = results.map((r, i) => ({ r, i })).sort((a, b) => rang(a.r) - rang(b.r) || a.i - b.i).map((x) => x.r);
  const faits = ordre.filter((r) => r.status === 'done').map((r) => r.message);
  const pasFaits = ordre.filter((r) => r.status === 'failed' || r.status === 'skipped').map((r) => `${r.label.toLowerCase() === 'heures' ? 'Heures' : r.label} (${r.message})`);
  const ignores = ordre.filter((r) => r.status === 'ignored').map((r) => `${r.label} (${r.message})`);
  return [
    faits.length ? `Fait : ${faits.join(' ; ')}.` : '',
    pasFaits.length ? `Pas fait : ${pasFaits.join(' ; ')}.` : '',
    ignores.length ? `Ignoré : ${ignores.join(' ; ')}.` : '',
  ].filter(Boolean).join(' ');
}

/** « Annuler » : défait dans l'ordre inverse (réserve, panier, puis heures), chaque étape isolée. Le chantier créé et la demande de congé RESTENT, et c'est dit. */
function compositeUndo(steps: UndoFn[], crees: CreatedWorksite[], conge: boolean): UndoFn | undefined {
  if (!steps.length) return undefined;
  const faits = new Set<number>();
  const dits: string[] = [];
  return async () => {
    let ok = true, partial = false;
    const echecs: string[] = [];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (faits.has(i)) continue;
      try {
        const r = await steps[i]();
        if (r.ok) { faits.add(i); dits.push(r.message); if (r.partial) partial = true; } else { ok = false; echecs.push(r.message); }
      } catch (e) { ok = false; echecs.push((e as { message?: string } | null)?.message || 'Annulation impossible pour le moment : réessayez.'); }
    }
    const notes = [
      ...crees.map((w) => `Le chantier « ${w.nom} » reste créé (vous ne pouvez pas le supprimer ; le bureau peut l’archiver).`),
      ...(conge ? ['La demande de congé reste envoyée : annulez-la depuis « Mes congés ».'] : []),
    ];
    const uniques = Array.from(new Set(dits));
    return ok ? { ok: true, message: [...uniques, ...notes].join(' '), partial } : { ok: false, message: [...echecs, ...uniques, ...notes].join(' '), partial: partial || faits.size > 0 };
  };
}
