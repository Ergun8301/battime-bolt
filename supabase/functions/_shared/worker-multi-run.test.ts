// Salarié, fiche « Tout confirmer » : l'exécution (ordre, dépendances, échecs partiels, rien avant le clic), avec de FAUX accès.
// Les fiches viennent du VRAI buildLongReply (la phrase d'Ergun comprise) : on teste ce que l'écran exécute vraiment.
//   npm run test:worker-multi-run
import { buildWorkerSnapshot, type DraftLine, type WorkerActionDraft, type WorkerLive, type WorkerSnapshot } from './worker-assistant-core.ts';
import { buildLongReply, type MultiItem, type WorkerMultiReply } from './worker-multi.ts';
import { reutilisable, runMulti, type CreatedWorksite, type ExecOutcome, type ItemResult, type MultiDeps, type MultiRunInput, type SaveOutcome } from './worker-multi-run.ts';
import { LIVE_VIDE, WORKER_RAW } from '../assistant-eval/cases.ts';

const TODAY = '2026-10-01';
const snap = (): WorkerSnapshot => buildWorkerSnapshot(WORKER_RAW as never);
const VIDE = LIVE_VIDE as WorkerLive;
const ERGUN = "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.";
const PIERRICK = { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' };
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} : ${JSON.stringify(a)} (attendu ${JSON.stringify(b)})`); };
const call = (name: string, args: Record<string, unknown> = {}) => ({ name, args });
const multi = (calls: { name: string; args: Record<string, unknown> }[], text: string, live = VIDE): WorkerMultiReply => {
  const r = buildLongReply(calls, text, snap(), live) as WorkerMultiReply;
  if (r.kind !== 'multi') throw new Error(`fiche attendue : ${JSON.stringify(r).slice(0, 200)}`);
  return r;
};
const HEURES_ERGUN = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '17:00', pause: 60 }], nouveau_chantier: PIERRICK });
const ergun = () => multi([HEURES_ERGUN], ERGUN);

/** La fiche telle que l'écran l'envoie à runMulti (sans aucune édition). */
const entree = (r: WorkerMultiReply, plus: Partial<MultiRunInput> = {}): MultiRunInput => ({
  items: r.items, date: r.date, aujourdhui: r.aujourdhui, chantiers: snap().chantiers, dejaNotees: r.deja_notees, meal: true, ...plus,
});
const heuresDe = (items: MultiItem[]) => items.find((i): i is Extract<MultiItem, { kind: 'heures' }> => i.kind === 'heures')!;
const sansLignes = (items: MultiItem[], f: (lines: DraftLine[]) => DraftLine[]): MultiItem[] => items.map((i) => (i.kind === 'heures' ? { ...i, draft: { ...i.draft, lines: f(i.draft.lines) } } : i));

interface Faux {
  deps: MultiDeps; journal: string[]; appels: string[]; saved: { date: string; lines: DraftLine[]; chantiers: string[] }[]; executed: WorkerActionDraft[];
  undone: string[]; etat: { online: boolean; today: string; find: CreatedWorksite | null; createFails: boolean; findAfterFail: CreatedWorksite | null; save: Partial<SaveOutcome> | 'throw'; exec: Record<string, ExecOutcome>; journalThrows: boolean; maxParallele: number };
}
function faux(over: Partial<Faux['etat']> = {}): Faux {
  const f: Faux = {
    journal: [], appels: [], saved: [], executed: [], undone: [],
    etat: { online: true, today: TODAY, find: null, createFails: false, findAfterFail: null, save: {}, exec: {}, journalThrows: false, maxParallele: 0, ...over },
    deps: undefined as unknown as MultiDeps,
  };
  let enCours = 0;
  // Chaque accès marque son passage : deux accès en même temps feraient monter le compteur au-dessus de 1.
  const passer = async <T>(nom: string, v: () => T | Promise<T>): Promise<T> => {
    f.appels.push(nom); enCours++; f.etat.maxParallele = Math.max(f.etat.maxParallele, enCours);
    await new Promise((r) => setTimeout(r, 1));
    enCours--;
    return await v();
  };
  let creations = 0, tentatives = 0;
  f.deps = {
    online: () => f.etat.online,
    today: () => f.etat.today,
    findWorksite: () => passer('find', () => (tentatives > 0 && f.etat.createFails ? f.etat.findAfterFail : f.etat.find ?? null)),
    createWorksite: (nw) => passer('create', () => {
      tentatives++;
      if (f.etat.createFails) throw new Error('réseau');
      creations++;
      return { id: 'w-nouveau', nom: nw.nom, ville: nw.ville };
    }),
    makeSaver: (chantiers) => (date, lines) => passer('saver', async (): Promise<SaveOutcome> => {
      f.saved.push({ date, lines, chantiers: chantiers.map((c) => c.id) });
      const s = f.etat.save;
      if (s === 'throw') throw new Error('coupure');
      const created = lines.map((l, i) => ({ key: l.key, localId: `loc${i}`, start: l.start, end: l.end }));
      const base: SaveOutcome = { ok: lines.length, queued: 0, created, queuedLocalIds: [], queuedOffline: 0, undo: async () => { f.undone.push('heures'); return { ok: true, message: 'Annulé : les lignes sont retirées.' }; } };
      return { ...base, ...s };
    }),
    resolveEntryIds: (ids) => passer('ids', () => Object.fromEntries(ids.map((i) => [i, `real-${i}`]))),
    execute: (d) => passer(`exec:${d.type}`, (): ExecOutcome => {
      f.executed.push(d);
      return f.etat.exec[d.type] ?? { ok: true, message: 'ok', undo: async () => { f.undone.push(d.type); return { ok: true, message: `Annulé : ${d.type}.` }; } };
    }),
    journal: (action, summary) => passer('journal', () => { f.journal.push(`${action}|${summary}`); if (f.etat.journalThrows) throw new Error('42501'); }),
  };
  return f;
}
const statuts = (rs: ItemResult[]) => rs.map((r) => `${r.id}:${r.status}`).join(' ');

// ── Le cas d'Ergun, de bout en bout ─────────────────────────────────────────
Deno.test('Ergun : un clic → chantier créé, DEUX créneaux avec la pause, rattachés au chantier créé, journal sans le nom du particulier', async () => {
  const f = faux();
  const r = ergun();
  const out = await runMulti(entree(r), f.deps);
  eq(f.appels, ['find', 'create', 'journal', 'saver'], 'chantier retrouvé ? sinon créé, puis journal, puis heures');
  const s = f.saved[0];
  eq([s.date, s.lines.map((l) => `${l.start}-${l.end}/${l.break_minutes}/${l.worksite_id}/${l.gap_before ?? '-'}`), s.chantiers.includes('w-nouveau')], [TODAY, ['08:00-12:00/0/w-nouveau/-', '13:00-17:00/0/w-nouveau/pause'], true], 'créneaux');
  eq(out.message, 'Fait : 2 créneaux enregistrés (8 h 00) ; chantier « Pierrick Dupont » créé.', 'message');
  eq([out.wrote, out.sent, out.stopped], [true, false, undefined], 'état');
  eq(f.journal, ['nouveau_chantier|Chantier créé (Montagna)'], 'journal : la ville, JAMAIS le nom du particulier');
  eq(JSON.stringify(f.journal).includes('Pierrick') || JSON.stringify(f.journal).includes('Dupont'), false, 'aucun nom de particulier au journal');
  eq(statuts(out.results), 'i0:chantier:done i0:done', 'le chantier d’abord, puis les heures');
});

Deno.test('Un créneau retiré dans la fiche : la « pause » devenue sans objet n’est pas écrite (gap_before périmé effacé avant l’enregistrement)', async () => {
  const f = faux();
  const r = ergun();
  // Le salarié retire le créneau 08:00-12:00 : 13:00-17:00 devient la première ligne, avec son gap_before « pause ».
  const items = sansLignes(r.items, (ls) => ls.slice(1));
  eq(heuresDe(items).draft.lines[0].gap_before, 'pause', 'la fiche garde le gap_before périmé');
  await runMulti(entree(r, { items }), f.deps);
  eq(f.saved[0].lines.map((l) => `${l.start}-${l.end}/${l.gap_before ?? '-'}`), ['13:00-17:00/-'], 'écrit sans gap_before');
  // Les deux créneaux : la pause entre les deux est écrite.
  const g = faux();
  await runMulti(entree(ergun()), g.deps);
  eq(g.saved[0].lines.map((l) => l.gap_before ?? '-'), ['-', 'pause'], 'pause conservée');
});

Deno.test('Rien n’est écrit tant que runMulti n’est pas appelé (la fiche est une donnée) ; ville vide → aucune écriture ; hors ligne + nouveau chantier → aucune écriture', async () => {
  const f = faux();
  // Construire la fiche n’appelle aucun accès.
  ergun();
  eq(f.appels, [], 'rien avant le clic');
  // Ville vide.
  const r = ergun();
  const vide = r.items.map((i) => (i.kind === 'heures' ? { ...i, draft: { ...i.draft, nouveau_chantier: { ...i.draft.nouveau_chantier!, ville: '' } } } : i));
  const a = await runMulti(entree(r, { items: vide }), f.deps);
  eq([f.appels, a.wrote, a.stopped?.startsWith('Complétez le nom et la ville')], [[], false, true], 'ville vide');
  // Hors ligne.
  const g = faux({ online: false });
  const b = await runMulti(entree(ergun()), g.deps);
  eq([g.appels, b.wrote, b.stopped], [[], false, 'Pas de réseau : le nouveau chantier ne peut pas être créé. Rien n’a été enregistré. Réessayez quand le réseau est revenu.'], 'hors ligne');
});

Deno.test('Chantier : un chantier actif de même nom + ville est RÉUTILISÉ (rien n’est créé) ; la relecture après un échec de création le retrouve ; la mémoire de carte évite une nouvelle recherche', async () => {
  const f = faux({ find: { id: 'w-deja', nom: 'Pierrick Dupont', ville: 'Montagna' } });
  const out = await runMulti(entree(ergun()), f.deps);
  eq([f.appels.includes('create'), f.saved[0].lines.map((l) => l.worksite_id), f.journal], [false, ['w-deja', 'w-deja'], []], 'trouvé : pas de création, pas de journal');
  eq(out.message, 'Fait : 2 créneaux enregistrés (8 h 00) ; chantier « Pierrick Dupont » utilisé (il existait déjà).', 'message');
  // Création qui lève (réponse perdue après coup) : relue une fois, trouvée → utilisée.
  const g = faux({ createFails: true, findAfterFail: { id: 'w-perdu', nom: 'Pierrick Dupont', ville: 'Montagna' } });
  const o2 = await runMulti(entree(ergun()), g.deps);
  eq([g.appels.slice(0, 3), g.saved[0].lines[0].worksite_id, o2.worksites['i0']?.created], [['find', 'create', 'find'], 'w-perdu', false], 'relecture');
  // Création qui lève ET relecture vide : rien n’est écrit, la fiche reste modifiable.
  const h = faux({ createFails: true });
  const o3 = await runMulti(entree(ergun()), h.deps);
  eq([o3.wrote, o3.stopped, h.saved.length], [false, 'Le chantier n’a pas pu être créé. Rien n’a été enregistré. Réessayez.', 0], 'échec de création');
  // Mémoire de carte : déjà créé lors d’une exécution précédente → aucune recherche, aucune création.
  const m = faux();
  const o4 = await runMulti(entree(ergun(), { worksites: { i0: { id: 'w-memo', nom: 'Pierrick Dupont', ville: 'Montagna', created: true } } }), m.deps);
  eq([m.appels, m.saved[0].lines[0].worksite_id, o4.message], [['saver'], 'w-memo', 'Fait : 2 créneaux enregistrés (8 h 00) ; chantier « Pierrick Dupont » créé.'], 'mémoire de carte');
});

Deno.test('reutilise_id n’est cru que si le chantier est dans la liste ET porte encore le nom et la ville du bloc', () => {
  const ch = snap().chantiers;
  const martin = ch.find((c) => c.nom === 'Bureau Martin')!;
  eq(reutilisable({ nom: 'Bureau Martin', adresse: '', code_postal: '', ville: martin.ville ?? '', description: '', reutilise_id: martin.id }, ch)?.id, martin.id, 'valable');
  eq(reutilisable({ nom: 'Bureau Martin', adresse: '', code_postal: '', ville: martin.ville ?? '', description: '', reutilise_id: 'w-inconnu' }, ch), null, 'absent de la liste');
  eq(reutilisable({ nom: 'Martin Autre', adresse: '', code_postal: '', ville: martin.ville ?? '', description: '', reutilise_id: martin.id }, ch), null, 'nom modifié');
  eq(reutilisable({ nom: 'Bureau Martin', adresse: '', code_postal: '', ville: 'Paris', description: '', reutilise_id: martin.id }, ch), null, 'ville modifiée');
  eq(reutilisable({ nom: 'Bureau Martin', adresse: '', code_postal: '', ville: martin.ville ?? '', description: '' }, ch), null, 'sans identifiant');
});

// ── Ordre, dépendances, échecs partiels ─────────────────────────────────────
const TEXTE_COMPLET = "Aujourd'hui de 7h30 à 12h puis de 13h à 16h30 chez Dupont, mets le panier repas, signale une réserve fissure sur le mur, pose un congé du lundi au mercredi prochain et envoie ma journée.";
const appelsComplet = () => [
  call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '16:30' }] }),
  call('panier_repas', { valeur: true }), call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure sur le mur' }),
  call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' }), call('envoyer_journee'),
];

Deno.test('Ordre : chantier → heures → panier → réserve → congé → envoi, strictement l’un après l’autre (jamais en parallèle)', async () => {
  const f = faux();
  // 4 appels au plus par fiche : heures + panier + réserve + envoi, puis le congé seul dans une autre.
  const r = multi([appelsComplet()[0], appelsComplet()[1], appelsComplet()[2], appelsComplet()[4]], TEXTE_COMPLET);
  const out = await runMulti(entree(r), f.deps);
  eq(f.appels, ['saver', 'exec:panier_repas', 'ids', 'exec:signaler_reserve', 'exec:envoyer_journee'], 'ordre');
  eq(f.etat.maxParallele, 1, 'jamais deux accès en même temps');
  eq(out.message, 'Fait : 2 créneaux enregistrés (8 h 00) ; panier repas coché ; réserve posée ; journée envoyée.', 'message');
  eq(out.sent, true, 'envoyée');
  eq(out.undo, undefined, 'après un envoi réussi : pas d’annulation globale');
  // La réserve vise la DERNIÈRE ligne du chantier (13:00-16:30), avec le vrai identifiant résolu.
  const res = f.executed.find((d) => d.type === 'signaler_reserve') as Extract<WorkerActionDraft, { type: 'signaler_reserve' }>;
  eq([res.entry_id, res.detail], ['real-loc1', 'fissure sur le mur'], 'réserve sur la dernière ligne du chantier');
  // Le congé est indépendant et passe après la réserve.
  const c = faux();
  const rc = multi([appelsComplet()[0], appelsComplet()[3], appelsComplet()[1]], TEXTE_COMPLET);
  await runMulti(entree(rc), c.deps);
  eq(c.appels, ['saver', 'exec:panier_repas', 'exec:demander_conge'], 'panier avant congé');
});

Deno.test('Échec partiel : 1 créneau écrit, 1 gardé sur le téléphone (refus du serveur) → « Annuler » présent, dépendants « pas fait », AUCUNE promesse de départ automatique', async () => {
  const f = faux({ save: { ok: 1, queued: 1, queuedLocalIds: ['loc1'], queuedOffline: 0 } });
  const r = multi([appelsComplet()[0], appelsComplet()[1], appelsComplet()[2], appelsComplet()[4]], TEXTE_COMPLET);
  const out = await runMulti(entree(r), f.deps);
  eq(f.executed.length, 0, 'ni panier, ni réserve, ni envoi');
  eq(out.results.map((x) => x.status), ['failed', 'skipped', 'skipped', 'skipped'], 'statuts');
  eq(out.message.includes('1 créneau enregistré, 1 non enregistré : vérifiez dans « Ma journée »'), true, `message : ${out.message}`);
  eq(/partiront dès que le réseau revient/.test(out.message), false, 'aucune promesse (un refus du serveur serait réessayé sans fin)');
  eq(out.message.includes('les heures ne sont pas enregistrées'), true, 'panier / réserve : les heures ne sont pas enregistrées');
  eq(out.message.includes('un élément précédent n’a pas abouti : envoyez la journée depuis « Ma journée »'), true, 'envoi : pas fait');
  eq([out.wrote, typeof out.undo], [true, 'function'], 'la carte est finale et « Annuler » est proposé');
  await out.undo!();
  eq(f.undone, ['heures'], 'Annuler défait les heures');
  // Même partiel, mais c’est le RÉSEAU : on peut promettre le départ.
  const g = faux({ save: { ok: 1, queued: 1, queuedLocalIds: ['loc1'], queuedOffline: 1 } });
  const o2 = await runMulti(entree(multi([appelsComplet()[0]], TEXTE_COMPLET)), g.deps);
  eq(o2.message.includes('Les créneaux non enregistrés partiront dès que le réseau revient'), true, 'hors ligne : promesse');
  // Tout en file : hors ligne / refus.
  const h = faux({ save: { ok: 0, queued: 2, queuedLocalIds: ['a', 'b'], queuedOffline: 2, created: [] } });
  const o3 = await runMulti(entree(multi([appelsComplet()[0]], TEXTE_COMPLET)), h.deps);
  eq(o3.message.includes('pas de réseau, 2 créneaux gardés sur le téléphone. Ils partiront dès que le réseau revient'), true, `tout en file hors ligne : ${o3.message}`);
  eq(typeof o3.undo, 'function', '« Annuler » reste proposé (lignes gardées sur le téléphone)');
  const i = faux({ save: { ok: 0, queued: 2, queuedLocalIds: ['a', 'b'], queuedOffline: 0, created: [] } });
  const o4 = await runMulti(entree(multi([appelsComplet()[0]], TEXTE_COMPLET)), i.deps);
  eq(o4.message.includes('le serveur n’a pas enregistré 2 créneaux. Vérifiez dans « Ma journée »'), true, `tout en file, en ligne : ${o4.message}`);
  eq(/partiront dès que/.test(o4.message), false, 'aucune promesse');
});

Deno.test('Le saver LÈVE après la création du chantier : « chantier créé », heures « peut-être pas enregistrées », dépendants « pas fait », jamais de « Réessayer » (wrote)', async () => {
  const f = faux({ save: 'throw' });
  const r = multi([HEURES_ERGUN, call('panier_repas', { valeur: true })], ERGUN + ' Mets aussi le panier.');
  const out = await runMulti(entree(r), f.deps);
  eq([out.wrote, out.stopped, f.executed.length], [true, undefined, 0], 'état');
  eq(out.message.startsWith('Fait : chantier « Pierrick Dupont » créé.'), true, `chantier créé dit : ${out.message}`);
  eq(out.message.includes('les heures n’ont peut-être pas été enregistrées : vérifiez dans « Ma journée » avant de recommencer'), true, 'heures');
  eq(out.message.includes('Réessayer'), false, 'pas de Réessayer');
  eq(out.undo, undefined, 'rien de connu à défaire');
});

Deno.test('Panier refusé (journée verrouillée) → l’envoi n’est JAMAIS appelé ; panier « ignoré » (entreprise sans panier) → l’envoi part ; l’échec d’une annexe n’arrête pas le congé', async () => {
  const f = faux({ exec: { panier_repas: { ok: false, message: 'Panier non pris en compte (journée verrouillée).' } } });
  const r = multi([appelsComplet()[0], appelsComplet()[1], appelsComplet()[4]], TEXTE_COMPLET);
  const out = await runMulti(entree(r), f.deps);
  eq(f.executed.map((d) => d.type), ['panier_repas'], 'l’envoi n’est pas appelé');
  eq(out.results.map((x) => x.status), ['done', 'failed', 'skipped'], 'statuts');
  eq(out.message.includes('un élément précédent n’a pas abouti : envoyez la journée depuis « Ma journée »'), true, 'dit');
  // Entreprise sans panier : ignoré, ne bloque rien, rien n’est lu ni écrit pour lui.
  const g = faux();
  const o2 = await runMulti(entree(r, { meal: false }), g.deps);
  eq(g.executed.map((d) => d.type), ['envoyer_journee'], 'seul l’envoi (le panier est ignoré)');
  eq(o2.results.map((x) => x.status), ['done', 'ignored', 'done'], 'ignoré ne bloque pas');
  eq(o2.message.includes('Ignoré : Panier repas (votre entreprise n’utilise pas le panier repas : ignoré).'), true, 'dit');
  // Le congé est indépendant : lancé même si les heures échouent.
  const h = faux({ save: { ok: 0, queued: 2, queuedOffline: 2, queuedLocalIds: ['a', 'b'], created: [] } });
  const o3 = await runMulti(entree(multi([appelsComplet()[0], appelsComplet()[3]], TEXTE_COMPLET)), h.deps);
  eq(h.executed.map((d) => d.type), ['demander_conge'], 'congé lancé');
  eq(o3.results.map((x) => x.status), ['failed', 'done'], 'statuts');
});

Deno.test('Envoi refusé par sendWorkerDay : message vouvoyé (chevauchement, 6 h, autre) ; les heures restent notées', async () => {
  const r = multi([appelsComplet()[0], appelsComplet()[4]], TEXTE_COMPLET);
  for (const [refus, attendu] of [
    ['Deux chantiers se chevauchent (07:30–12:00 et 11:00–13:00) : corrige l’un des deux dans « Ma journée ».', 'deux créneaux de la journée se chevauchent : corrigez-les dans « Ma journée », puis envoyez la journée.'],
    ['Plus de 6 h d’affilée sans pause notée : envoie ta journée depuis « Ma journée », la pause y est demandée.', 'plus de 6 h d’affilée sans pause notée : envoyez la journée depuis « Ma journée », la pause y est demandée.'],
    ['Rien n’a été envoyé : la journée est verrouillée ou a changé.', 'l’envoi n’a pas été fait ; vos heures restent notées. Envoyez la journée depuis « Ma journée ».'],
  ]) {
    const f = faux({ exec: { envoyer_journee: { ok: false, message: refus } } });
    const out = await runMulti(entree(r), f.deps);
    eq([out.results[0].status, out.results[1].status, out.results[1].message, out.sent], ['done', 'failed', attendu, false], refus);
    eq(/tu |ta |corrige /.test(out.message), false, 'jamais de tutoiement');
  }
});

// ── Réserve : visée par chantier, clé stable ────────────────────────────────
Deno.test('Réserve : la cible est le CHANTIER, recalculée sur les lignes ÉDITÉES ; retirer le créneau 1 ne déplace pas la réserve ; plus aucun créneau sur ce chantier → « pas posée »', async () => {
  const texte = "de 7h à 10h chez Dupont et de 10h30 à 12h chez Martin, puis de 13h à 16h30 chez Dupont, signale une réserve chez Dupont : fissure";
  const calls = [
    call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Martin', debut: '10:30', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '16:30' }] }),
    call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure' }),
  ];
  const r = multi(calls, texte);
  const f = faux();
  await runMulti(entree(r), f.deps);
  eq((f.executed[0] as { entry_id: string }).entry_id, 'real-loc2', 'dernière ligne de Villa Dupont (13:00)');
  // Le salarié retire le créneau 1 : les clés restent, la réserve vise toujours le 13:00-16:30 (maintenant loc1).
  const g = faux();
  await runMulti(entree(r, { items: sansLignes(r.items, (ls) => ls.filter((l) => l.key !== 'L0')) }), g.deps);
  eq((g.executed[0] as { entry_id: string }).entry_id, 'real-loc1', 'même créneau (13:00), pas le même rang');
  eq(g.saved[0].lines.map((l) => l.key), ['L1', 'L2'], 'clés conservées');
  // Il retire TOUS les créneaux Dupont : la réserve n’est jamais reportée sur un autre chantier.
  const h = faux();
  const o = await runMulti(entree(r, { items: sansLignes(r.items, (ls) => ls.filter((l) => l.key === 'L1')) }), h.deps);
  eq(h.executed.length, 0, 'rien n’est exécuté');
  eq(o.results.map((x) => x.status), ['done', 'failed'], 'statuts');
  eq(o.results[1].message, 'réserve non posée : la ligne n’a pas été retrouvée', 'dit');
});

Deno.test('Réserve sur une ligne DÉJÀ notée : l’identifiant réel est gardé tel quel (aucune résolution)', async () => {
  const live = { ...VIDE, lignes: [{ id: 'e9', chantier: 'Villa Dupont', chantier_id: 'w-dupont', debut: '07:30', fin: '12:00', envoyee: false, panier: false, reserve: false, corrigee: false }] } as WorkerLive;
  const r = multi([call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure' })], 'signale une réserve chez dupont : fissure', live);
  const f = faux();
  await runMulti(entree(r), f.deps);
  eq([f.appels, (f.executed[0] as { entry_id: string }).entry_id], [['exec:signaler_reserve'], 'e9'], 'ligne réelle');
});

// ── Garde-fous ──────────────────────────────────────────────────────────────
Deno.test('Réponse PIÉGÉE : effacer_heures, retirer_reserve, copier_journee dans la fiche → refusés, execute JAMAIS appelé pour eux', async () => {
  const piege = (draft: WorkerActionDraft, depend: string[] = []): MultiItem => ({ id: 'ix', kind: 'action', action: { draft, problems: [] }, depend });
  const f = faux();
  const items: MultiItem[] = [
    piege({ type: 'effacer_heures', date: TODAY, entry_id: null, tout: true, choix: [] }),
    { ...piege({ type: 'retirer_reserve', entry_id: 'e1', choix: [] }), id: 'iy' },
    { ...piege({ type: 'copier_journee', depuis: '2026-09-30', vers: [TODAY] }), id: 'iz' },
    { ...piege({ type: 'annuler_conge', leave_id: 'lv1', choix: [] }), id: 'iw' },
  ];
  const out = await runMulti({ items, date: TODAY, aujourdhui: TODAY, chantiers: snap().chantiers, dejaNotees: [], meal: true }, f.deps);
  eq(f.executed, [], 'aucun accès');
  eq(out.results.map((x) => [x.status, x.message]), items.map(() => ['failed', 'action non autorisée dans une fiche']), 'tous refusés');
  eq(out.wrote, false, 'rien d’écrit');
});

Deno.test('Garde-fous d’entrée : créneau sans chantier, chevauchement avec une ligne déjà notée, date illisible → arrêt AVANT toute écriture', async () => {
  const f = faux();
  const r = ergun();
  const sansChantier = sansLignes(r.items, (ls) => ls.map((l, i) => (i === 0 ? { ...l, nouveau: undefined, worksite_id: null } : l)));
  const a = await runMulti(entree(r, { items: sansChantier }), f.deps);
  eq([a.stopped, f.appels], ['Choisissez le chantier de chaque créneau : rien n’a été enregistré.', []], 'créneau sans chantier');
  // Chevauchement avec une ligne déjà notée aujourd’hui.
  const b = await runMulti(entree(r, { dejaNotees: [{ debut: '07:30', fin: '12:00', chantier: 'Villa Dupont', envoyee: false }] }), f.deps);
  eq([b.stopped?.startsWith('Déjà noté aujourd\'hui : 07:30–12:00 (Villa Dupont).'), b.wrote, f.appels], [true, false, []], 'déjà noté');
});

Deno.test('La journée a changé depuis la fiche (confirmée après minuit) : panier, réserve et envoi « pas fait » ; les heures sont enregistrées ; autre jour que la fiche → idem', async () => {
  const r = multi([appelsComplet()[0], appelsComplet()[1], appelsComplet()[4]], TEXTE_COMPLET);
  const f = faux({ today: '2026-10-02' });
  const out = await runMulti(entree(r), f.deps);
  eq(out.results.map((x) => x.status), ['done', 'skipped', 'skipped'], 'statuts');
  eq(out.results[1].message, 'la journée a changé depuis la fiche : redemandez-les', 'dit');
  eq(f.executed, [], 'aucune annexe exécutée');
  // Le salarié change le jour de la fiche (hier) : les annexes d’aujourd’hui ne partent pas non plus.
  const g = faux();
  const o2 = await runMulti(entree(r, { date: '2026-09-30' }), g.deps);
  eq([o2.results.map((x) => x.status), o2.results[1].message], [['done', 'skipped', 'skipped'], 'ne concerne que la journée d’aujourd’hui'], 'autre jour');
});

Deno.test('Le journal qui LÈVE (assistant non activé, 42501) ne change rien : le chantier est créé, les heures écrites', async () => {
  const f = faux({ journalThrows: true });
  const out = await runMulti(entree(ergun()), f.deps);
  eq([out.message, out.stopped], ['Fait : 2 créneaux enregistrés (8 h 00) ; chantier « Pierrick Dupont » créé.', undefined], 'sans effet');
});

Deno.test('Chantier SEUL (« ajoute le chantier X ») : créé, pas d’« Annuler » ; un chantier existant n’est pas recréé', async () => {
  const r = multi([call('nouveau_chantier', { nom: 'Claire Martin', adresse: '12 rue des Lilas', code_postal: '01000', ville: 'Bourg-en-Bresse', description: 'salle de bain' })], 'ajoute un nouveau chantier : Claire Martin à Bourg-en-Bresse');
  eq(r.items.map((i) => i.kind), ['chantier'], 'élément chantier');
  const f = faux();
  const out = await runMulti(entree(r), f.deps);
  eq([f.appels, out.message, out.undo, out.wrote], [['find', 'create', 'journal'], 'Fait : chantier « Claire Martin » créé.', undefined, true], 'créé');
  const g = faux({ find: { id: 'w-x', nom: 'Claire Martin', ville: 'Bourg-en-Bresse' } });
  const o2 = await runMulti(entree(r), g.deps);
  eq([g.appels, o2.message], [['find'], 'Fait : chantier « Claire Martin » utilisé (il existait déjà).'], 'existant');
});

Deno.test('« Annuler » : défait dans l’ordre inverse (réserve, panier, heures), chaque étape isolée ; le chantier créé et le congé RESTENT et c’est dit', async () => {
  const f = faux();
  const r = multi([HEURES_ERGUN, call('panier_repas', { valeur: true }), call('signaler_reserve', { detail: 'fissure' }), call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' })],
    ERGUN + ' Mets le panier, une réserve fissure, et pose un congé du lundi au mercredi prochain.');
  const out = await runMulti(entree(r), f.deps);
  eq(out.results.map((x) => x.status).join(','), 'done,done,done,done,done', `tout est fait : ${out.message}`);
  const u = await out.undo!();
  eq(f.undone, ['signaler_reserve', 'panier_repas', 'heures'], 'ordre inverse (le congé ne s’annule pas)');
  eq(u.ok, true, 'ok');
  eq(u.message.includes('Le chantier « Pierrick Dupont » reste créé (vous ne pouvez pas le supprimer ; le bureau peut l’archiver).'), true, 'chantier reste');
  eq(u.message.includes('La demande de congé reste envoyée : annulez-la depuis « Mes congés ».'), true, 'congé reste');
});

Deno.test('« Annuler » : un échec d’une étape n’empêche pas les suivantes, et un second essai ne refait pas ce qui est déjà défait', async () => {
  const f = faux({ exec: { panier_repas: { ok: true, message: 'ok', undo: async () => { f.undone.push('panier'); return { ok: false, message: 'Journée verrouillée.' }; } } } });
  const r = multi([appelsComplet()[0], appelsComplet()[1]], TEXTE_COMPLET);
  const out = await runMulti(entree(r), f.deps);
  const u1 = await out.undo!();
  eq([u1.ok, u1.message.includes('Journée verrouillée.'), f.undone], [false, true, ['panier', 'heures']], 'le panier échoue, les heures sont défaites');
  const u2 = await out.undo!();
  eq(f.undone, ['panier', 'heures', 'panier'], 'second essai : seulement le panier');
  void u2;
});

Deno.test('Envoi avec des lignes déjà notées : elles partent avec la fiche (aucune écriture de plus) ; dépend de tout', async () => {
  const live = { ...VIDE, lignes: [{ id: 'e1', chantier: 'Villa Dupont', chantier_id: 'w-dupont', debut: '07:30', fin: '10:00', envoyee: false, panier: false, reserve: false, corrigee: false }] } as WorkerLive;
  const r = multi([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Martin', debut: '13:00', fin: '16:30' }] }), call('envoyer_journee')], 'de 13h à 16h30 chez Martin, envoie ma journée', live);
  const f = faux();
  const out = await runMulti(entree(r), f.deps);
  eq([f.appels, out.sent], [['saver', 'exec:envoyer_journee'], true], 'enregistré puis envoyé');
});

Deno.test('Les accès sont appelés strictement en séquence, même avec toute la fiche (jamais Promise.all)', async () => {
  const f = faux();
  const r = multi([HEURES_ERGUN, call('panier_repas', { valeur: true }), call('signaler_reserve', { detail: 'fissure' }), call('envoyer_journee')], ERGUN + ' Mets le panier, une réserve fissure, envoie ma journée.');
  await runMulti(entree(r), f.deps);
  eq(f.etat.maxParallele, 1, 'séquentiel');
  eq(f.appels, ['find', 'create', 'journal', 'saver', 'exec:panier_repas', 'ids', 'exec:signaler_reserve', 'exec:envoyer_journee'], 'ordre exact');
});

// Le code s'écrit pour le navigateur : pas d'API Deno ni d'assertion arrière dans le module testé.
Deno.test('worker-multi-run.ts : aucune API Deno, aucun console.*, aucune assertion arrière (Safari < 16.4)', async () => {
  const src = (await Deno.readTextFile(new URL('./worker-multi-run.ts', import.meta.url))).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  eq([/\bDeno\./.test(src), /console\./.test(src), /\(\?<[=!]/.test(src), /\.at\(/.test(src), /structuredClone/.test(src)], [false, false, false, false, false], 'statique');
});
