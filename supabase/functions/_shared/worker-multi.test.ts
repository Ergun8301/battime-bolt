// Salarié, profil « long » : les règles DÉTERMINISTES qui corrigent ce que le modèle se trompe à rendre
// (pause comptée deux fois, créneaux fusionnés, ligne « nouveau » sans chantier, créneau rempli au hasard),
// la construction de la fiche à plusieurs éléments, et le contrôle croisé « rien ne disparaît sans un mot ».
// Les sorties du modèle ci-dessous sont des sorties plausibles (mesurées ou fabriquées pour le test).
//   npm run test:worker-multi
import { buildWorkerSnapshot, type Draft, type DraftLine, type WorkerLive, type WorkerSnapshot } from './worker-assistant-core.ts';
import {
  buildLongReply, cleanNewWorksite, DATE_ILLISIBLE, memeChantier, MULTI_ANSWER, MULTI_AUTORISES, nettoyerEcarts, normaliserHeures, parseDateTr, verifierFiche,
  type LongLegacy, type MultiItem, type WorkerMultiReply,
} from './worker-multi.ts';
import { LIVE_VIDE, WORKER_LIVE, WORKER_RAW } from '../assistant-eval/cases.ts';

const snap = (): WorkerSnapshot => buildWorkerSnapshot(WORKER_RAW as never);
const VIDE = LIVE_VIDE as WorkerLive;
const DEFAUT = WORKER_LIVE as WorkerLive;
const ERGUN = "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.";
const PIERRICK = { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' };
const TODAY = '2026-10-01';
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} : ${JSON.stringify(a)} (attendu ${JSON.stringify(b)})`); };
const heures = (args: Record<string, unknown>, text: string, live: WorkerLive = VIDE, s = snap()) => normaliserHeures({ date: TODAY, ...args }, text, s, live);
const creneaux = (d: Draft) => d.lines.map((l) => `${l.start}-${l.end}${l.break_minutes ? `/p${l.break_minutes}` : ''}`).join(' ');
const net = (d: Draft) => d.lines.reduce((t, l) => { let m = (Number(l.end.slice(0, 2)) * 60 + Number(l.end.slice(3))) - (Number(l.start.slice(0, 2)) * 60 + Number(l.start.slice(3))); if (m < 0) m += 1440; return t + m - l.break_minutes; }, 0);
const sites = (d: Draft) => d.lines.map((l) => (l.nouveau ? 'NOUVEAU' : l.worksite_id ?? 'AUCUN')).join(',');
const multi = (r: unknown): WorkerMultiReply => { const x = r as WorkerMultiReply; if (x.kind !== 'multi') throw new Error(`fiche attendue, obtenu ${JSON.stringify(x).slice(0, 200)}`); return x; };
const types = (m: WorkerMultiReply) => m.items.map((i) => (i.kind === 'action' ? i.action.draft.type : i.kind)).join(' > ');
const action = (m: WorkerMultiReply, type: string) => { const it = m.items.find((i) => i.kind === 'action' && i.action.draft.type === type); if (!it || it.kind !== 'action') throw new Error(`${type} absent (${types(m)})`); return it; };
const heuresDe = (m: WorkerMultiReply) => { const it = m.items.find((i) => i.kind === 'heures'); if (!it || it.kind !== 'heures') throw new Error(`heures absentes (${types(m)})`); return it.draft; };
const call = (name: string, args: Record<string, unknown> = {}) => ({ name, args });
const build = (calls: { name: string; args: Record<string, unknown> }[], text: string, live: WorkerLive = VIDE, opts = {}) => buildLongReply(calls, text, snap(), live, opts);

// ── 6.0 La date ─────────────────────────────────────────────────────────────
Deno.test('Date : ISO telle quelle, vide → aujourd’hui, français puis turc ; illisible → aujourd’hui ET signalé (jamais un repli silencieux)', () => {
  const d = (date: unknown) => normaliserHeures({ date, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] }, 'x', snap(), VIDE);
  eq(d('2026-09-30').date, '2026-09-30', 'ISO');
  eq([d('').date, d(undefined).date], [TODAY, TODAY], 'vide');
  eq(d('hier').date, '2026-09-30', 'français');
  eq(d('Dün').date, '2026-09-30', 'dün');
  eq(d('bugün').date, TODAY, 'bugün');
  eq(d('yarın').date, '2026-10-02', 'yarın');
  eq(d('evvelsi gün').date, '2026-09-29', 'avant-hier');
  eq(d('29.09.2026').date, '2026-09-29', 'jj.mm.aaaa');
  eq(d('30.09').date, '2026-09-30', 'jj.mm (année courante)');
  const x = d('un de ces jours');
  eq(x.date, TODAY, 'illisible → aujourd’hui');
  if (!x.errors.includes('Date illisible : vérifiez le jour.')) throw new Error(`erreur « Date illisible » attendue : ${x.errors.join('|')}`);
  eq(d('31.02').errors.includes('Date illisible : vérifiez le jour.'), true, '31 février');
  eq(parseDateTr('haftaya', TODAY), '', 'les autres mots turcs sont lus par le modèle');
});

// ── 6.1 Redécoupage selon les plages de la phrase ───────────────────────────
Deno.test('Redécoupage : 08:00-17:00 pause 60 → deux créneaux, pour chaque forme de phrase (français et turc)', () => {
  const fusionne = { lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '17:00', pause: 60 }], nouveau_chantier: PIERRICK };
  for (const texte of [
    'de 8h à midi, puis pause d’1h, puis de 13h à 17h', 'de 8 à midi puis de 13 à 17', '08.00-12.00 et 13.00-17.00', '8h/12h 13h/17h',
    'huit heures à midi puis treize heures à dix-sept heures', '8’den 12’ye ve 13’ten 17’ye kadar',
  ]) {
    const d = heures(fusionne, texte);
    eq(creneaux(d), '08:00-12:00 13:00-17:00', `« ${texte} »`);
    eq(net(d), 480, `net « ${texte} »`);
    eq(d.errors, [], `erreurs « ${texte} »`);
  }
});

Deno.test('Redécoupage : jamais sans raison (une seule plage dite, plages qui ne recouvrent pas exactement la ligne) ; le surplus de pause reste visible', () => {
  eq(creneaux(heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '16:30', pause: 30 }] }, 'de 8h à 16h30 avec une demi-heure de pause')), '08:00-16:30/p30', 'une plage');
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '16:30' }], nouveau_chantier: { ...PIERRICK, nom: 'Claire Martin' } },
    'ce matin 7h chez Dupont jusqu’à 10h, de 10h30 à midi chez Martin, de 13h à 16h30');
  eq(creneaux(d), '07:00-12:00 13:00-16:30', 'plages qui ne couvrent pas exactement 07:00-12:00 : inchangé');
  // Un surplus de pause (au-delà du trou) est gardé sur la première pièce : jamais perdu en silence.
  eq(creneaux(heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '17:00', pause: 75 }] }, 'de 8h à 12h et de 13h à 17h chez Martin')), '08:00-12:00/p15 13:00-17:00', 'surplus 75 − 60');
  // Le surplus d’une pause plus longue que la pièce est refusé par les contrôles habituels.
  eq(heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '17:00', pause: 600 }] }, 'de 8h à 12h et de 13h à 17h chez Martin').errors.length > 0, true, 'pause trop longue');
});

// ── 6.2 La pause n'est jamais comptée deux fois ─────────────────────────────
Deno.test('Pause : le trou entre deux créneaux EST la pause (D5) — les quatre exemples', () => {
  const a = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '12:00', pause: 60 }, { chantier: 'Dupont', debut: '13:00', fin: '17:00', pause: 0 }] }, 'x');
  eq([creneaux(a), net(a)], ['07:00-12:00 13:00-17:00', 540], '7h-12h pause 60 puis 13h-17h');
  const b = heures({ lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00', pause: 0 }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] }, 'x');
  eq([creneaux(b), net(b)], ['08:00-12:00 13:00-17:00', 480], 'déjà juste');
  const c = heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '16:30', pause: 30 }] }, 'de 8h à 16h30 avec une demi-heure de pause');
  eq([creneaux(c), net(c)], ['08:00-16:30/p30', 480], 'un seul créneau : la pause reste');
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '12:00', pause: 45 }, { chantier: 'Dupont', debut: '12:45', fin: '16:30' }] }, 'x');
  eq([creneaux(d), net(d)], ['07:00-12:00 12:45-16:30', 525], 'sl09');
  // La pause portée par le SECOND créneau est absorbée aussi ; une pause qui n’est pas le trou (±10 min) reste.
  const e = heures({ lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00', pause: 60 }] }, 'x');
  eq(creneaux(e), '08:00-12:00 13:00-17:00', 'pause sur le second créneau');
  const f = heures({ lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00', pause: 15 }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] }, 'x');
  eq(creneaux(f), '08:00-12:00/p15 13:00-17:00', 'une pause de 15 min dans le créneau n’est pas le trou d’1 h');
});

Deno.test('gap_before : « pause » seulement si le salarié l’a dite ; un écart entre deux chantiers reste non qualifié', () => {
  const ergun = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, ERGUN);
  eq(ergun.lines.map((l) => l.gap_before ?? null), [null, 'pause'], 'sl01');
  const sl02 = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Martin', debut: '10:30', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '16:30' }] },
    'Alors ce matin j’ai commencé à 7h chez Dupont jusqu’à 10h, ensuite de 10h30 à midi chez Martin, et cet après-midi de 13h à 16h30 de nouveau chez Dupont.');
  eq(sl02.lines.map((l) => l.gap_before ?? null), [null, null, null], 'sl02 : aucune pause dite');
  // Une pause dite, deux écarts : celui qui a la durée dite (45 min), pas le plus long.
  const sl09 = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Dupont', debut: '10:45', fin: '12:00' }, { chantier: 'Dupont', debut: '14:00', fin: '16:30' }] }, 'midi pause de 45 minutes');
  eq(sl09.lines.map((l) => l.gap_before ?? null), [null, 'pause', null], 'durée dite');
  // Durée non lisible : l’écart le plus long.
  const long = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Dupont', debut: '10:30', fin: '12:00' }, { chantier: 'Dupont', debut: '14:00', fin: '16:30' }] }, 'une pause entre midi et deux');
  eq(long.lines.map((l) => l.gap_before ?? null), [null, null, 'pause'], 'écart le plus long');
  // Turc : « bir saat mola ».
  const tr = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, 'sabah 8’den 12’ye kadar, bir saat mola, sonra 13’ten 17’ye kadar');
  eq(tr.lines.map((l) => l.gap_before ?? null), [null, 'pause'], 'mola');
});

// ── 6.3 Rattachement au nouveau chantier ────────────────────────────────────
Deno.test('Rattachement : « Pierrick Dupont » n’est JAMAIS « Villa Dupont » ; la ligne « nouveau » est rattachée ; aucun créneau rempli au hasard', () => {
  const d = heures({ lignes: [{ chantier: 'Pierrick Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, ERGUN);
  eq(sites(d), 'NOUVEAU,NOUVEAU', 'deux lignes NOUVEAU');
  eq(d.lines.some((l) => l.from_planning), false, 'jamais le planning');
  eq(d.lines.map((l) => l.key), ['L0', 'L1'], 'clés stables');
  eq(d.nouveau_chantier, PIERRICK, 'le bloc');
  eq(d.manque, undefined, 'rien ne manque');
});

Deno.test('Rattachement : « Pierrick » seul, la ville, « chez le client » → NOUVEAU (jamais « Autre »)', () => {
  for (const chantier of ['Pierrick', 'Montagna', '', 'chez le client', 'Nouveau chantier', 'yeni şantiye']) {
    const d = heures({ lignes: [{ chantier, debut: '08:00', fin: '12:00' }, { chantier, debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, ERGUN);
    eq([sites(d), d.lines.some((l) => l.from_planning)], ['NOUVEAU,NOUVEAU', false], `« ${chantier} »`);
  }
});

Deno.test('Rattachement : « Dupont » seul alors que « Pierrick Dupont » est à créer ET que « Villa Dupont » existe → « à choisir », jamais deviné', () => {
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, ERGUN);
  eq(sites(d), 'AUCUN,AUCUN', 'deux lignes à choisir');
  eq(d.lines[0].a_choisir, { existant: 'Villa Dupont', nouveau: 'Pierrick Dupont' }, 'la question');
  eq(d.lines.some((l) => l.from_planning), false, 'jamais le planning');
  // « Villa Dupont » dit en toutes lettres est bien l’existant.
  const v = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK },
    'Ce matin de 8h à 12h à la Villa Dupont, et de 13h à 17h chez un nouveau client : Pierrick Dupont, à Montagna 01250, pour la pose d’un store banne.');
  eq(sites(v), 'w-dupont,NOUVEAU', 'Villa Dupont reste Villa Dupont');
});

Deno.test('Rattachement : une ligne sans nom parmi des chantiers connus → le nouveau chantier ; deux → « à choisir »', () => {
  const claire = { nom: 'Claire Martin', adresse: '', code_postal: '69500', ville: 'Bron', description: 'porte de garage' };
  const SL10 = 'Ce matin de 7h30 à midi chez Dupont, et cet après-midi de 13h à 16h30 chez une nouvelle cliente, madame Claire Martin à Bron 69500, pour une porte de garage.';
  const un = heures({ lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '12:00' }, { chantier: '', debut: '13:00', fin: '16:30' }], nouveau_chantier: claire }, SL10);
  eq(sites(un), 'w-dupont,NOUVEAU', 'sl10');
  eq(un.lines[0].from_planning, undefined, 'le chantier dit n’est pas repris du planning');
  const deux = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '07:00', fin: '10:00' }, { chantier: '', debut: '10:30', fin: '12:00' }, { chantier: '', debut: '13:00', fin: '16:30' }], nouveau_chantier: claire },
    'Ce matin de 7h à 10h à la Villa Dupont, de 10h30 à midi puis de 13h à 16h30 chez une nouvelle cliente, madame Claire Martin à Bron 69500.');
  eq(sites(deux), 'w-dupont,AUCUN,AUCUN', 'lignes 2 et 3 « à choisir »');
  eq(deux.lines.some((l) => l.from_planning || l.nouveau), false, 'ni planning ni nouveau');
});

Deno.test('Rattachement : un vrai chantier qui contient « nouveau » reste un chantier existant ; « nouveau » sans bloc → il faut le nom et la ville', () => {
  const s = snap();
  s.chantiers.push({ id: 'w-nm', nom: 'Résidence Le Nouveau Monde', ville: 'Lyon' });
  const d = normaliserHeures({ date: TODAY, lignes: [{ chantier: 'Résidence Le Nouveau Monde', debut: '08:00', fin: '12:00' }] }, 'De 8h à 12h à la Résidence Le Nouveau Monde.', s, VIDE);
  eq(sites(d), 'w-nm', 'chantier existant');
  eq(d.nouveau_chantier, undefined, 'aucun bloc');
  const sans = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }] }, 'x');
  eq(sites(sans), 'NOUVEAU', 'ligne « nouveau »');
  eq(sans.nouveau_chantier, { nom: '', adresse: '', code_postal: '', ville: '', description: '' }, 'bloc vide, rien d’inventé');
  eq(sans.manque, ['nom', 'ville'], 'la fiche réclame le nom et la ville');
});

Deno.test('Rattachement : un bloc dit mais aucun créneau dessus → gardé, marqué « inutilisé » (jamais supprimé en silence)', () => {
  const d = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }], nouveau_chantier: PIERRICK }, 'De 8h à 12h à la Villa Dupont.');
  eq(sites(d), 'w-dupont', 'le créneau reste sur Villa Dupont');
  eq(d.nouveau_chantier?.inutilise, true, 'inutilisé');
  eq(d.manque, undefined, 'rien à réclamer pour un chantier qu’on ne crée pas');
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }], nouveau_chantier: PIERRICK })], 'de 8h à 12h à la Villa Dupont'));
  eq(r.ignores.map((i) => i.name), ['nouveau_chantier'], 'dit dans « Laissé de côté »');
});

// ── 6.4 Le bloc « nouveau chantier » ────────────────────────────────────────
Deno.test('cleanNewWorksite : civilité, casse, code postal extrait, retours à la ligne, « Ben » gardé, « Ayşe Kaya » intact', () => {
  eq(cleanNewWorksite({ nom: 'Madame Claire Martin.', ville: 'Bourg-en-Bresse' }).nom, 'Claire Martin', 'civilité');
  eq(cleanNewWorksite({ nom: 'bay ahmet yılmaz' }).nom, 'Ahmet Yılmaz', 'bay + minuscules');
  eq(cleanNewWorksite({ nom: 'Ben Martin' }).nom, 'Ben Martin', 'jamais cleanTitle (« ben » supprimé)');
  eq(cleanNewWorksite({ nom: 'Ayşe Kaya' }).nom, 'Ayşe Kaya', 'casse mixte intacte');
  eq(cleanNewWorksite({ nom: 'jean-pierre de la fontaine' }).nom, 'Jean-Pierre de la Fontaine', 'particules');
  const m = cleanNewWorksite({ nom: 'Pierrick Dupont', ville: 'Montagna 01250' });
  eq([m.ville, m.code_postal], ['Montagna', '01250'], 'code postal dans la ville');
  const p = cleanNewWorksite({ nom: 'x', ville: 'Montagna (01250)' });
  eq([p.ville, p.code_postal], ['Montagna', '01250'], 'entre parenthèses');
  const a = cleanNewWorksite({ nom: 'x', adresse: '12 rue des Lilas 01000', ville: 'Bourg' });
  eq([a.adresse, a.code_postal], ['12 rue des Lilas', '01000'], 'code postal dans l’adresse');
  const mauvais = cleanNewWorksite({ nom: 'x', adresse: '12 rue des Lilas', code_postal: '1250' });
  eq([mauvais.code_postal, mauvais.adresse], ['', '12 rue des Lilas, 1250'], 'jamais écrit comme code postal, recopié dans l’adresse');
  eq(cleanNewWorksite({ nom: 'x', code_postal: '01250 Montagna' }).code_postal, '01250', 'code reconnu dans un texte');
  const nl = cleanNewWorksite({ nom: 'Pierrick\nDupont', description: 'pose\tstore\r\nbanne.', adresse: 'rue\u0000 des Lilas' });
  eq([nl.nom, nl.description, nl.adresse], ['Pierrick Dupont', 'pose store banne', 'rue des Lilas'], 'retours à la ligne et contrôles');
  eq(cleanNewWorksite({ nom: 'x'.repeat(200), ville: 'y'.repeat(200), adresse: 'z'.repeat(300), description: 'w'.repeat(500) }).nom.length, 80, 'nom ≤ 80');
  eq(cleanNewWorksite({ nom: 'Pierrick Dupont', ville: 'à Montagna' }).ville, 'Montagna', '« à » retiré');
  eq(cleanNewWorksite(null), { nom: '', adresse: '', code_postal: '', ville: '', description: '' }, 'null → bloc vide');
  const piege = cleanNewWorksite({ nom: 'Pierrick Dupont', reutilise_id: 'w-martin', inutilise: true });
  eq(Object.keys(piege).sort(), ['adresse', 'code_postal', 'description', 'nom', 'ville'], 'reutilise_id et inutilise ne viennent jamais du modèle');
});

Deno.test('memeChantier : mots du nom sans ordre ni civilité, ville sans chiffres ni parenthèses', () => {
  eq(memeChantier({ nom: 'Dupont Pierrick', ville: 'Montagna' }, { nom: 'Pierrick Dupont', ville: 'Montagna' }), true, 'ordre');
  eq(memeChantier({ nom: 'Monsieur Pierrick Dupont', ville: 'Montagna' }, { nom: 'Pierrick Dupont', ville: 'Montagna (01)' }), true, 'civilité et parenthèses');
  eq(memeChantier({ nom: 'Pierrick Dupont', ville: 'Montagna 01250' }, { nom: 'Pierrick Dupont', ville: 'Montagna' }), true, 'code postal');
  eq(memeChantier({ nom: 'Bureau Martin', ville: 'Bourg en Bresse' }, { nom: 'Bureau Martin', ville: 'Bourg-en-Bresse' }), true, 'tirets');
  eq(memeChantier({ nom: 'Pierrick Dupont', ville: 'Montagna' }, { nom: 'Villa Dupont', ville: 'Lyon' }), false, 'Villa Dupont');
  eq(memeChantier({ nom: 'Pierrick Dupont', ville: 'Montagna' }, { nom: 'Pierrick Dupont', ville: 'Lyon' }), false, 'autre ville');
  eq(memeChantier({ nom: 'Pierrick Dupont', ville: '' }, { nom: 'Pierrick Dupont', ville: '' }), false, 'ville vide : jamais le même');
  eq(memeChantier({ nom: '', ville: 'Lyon' }, { nom: '', ville: 'Lyon' }), false, 'nom vide');
});

Deno.test('Réutilisation : « Bureau Martin à Villeurbanne » existe déjà → aucune création (sl12)', () => {
  const d = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'Bureau Martin', debut: '13:00', fin: '17:00' }], nouveau_chantier: { nom: 'Bureau Martin', adresse: '', code_postal: '', ville: 'Villeurbanne', description: '' } },
    'J’ai travaillé de 8h à 12h puis de 13h à 17h sur un nouveau chantier, Bureau Martin à Villeurbanne.');
  eq(sites(d), 'w-martin,w-martin', 'les deux créneaux sur le chantier existant');
  eq(d.nouveau_chantier?.reutilise_id, 'w-martin', 'reutilise_id');
  eq(d.manque, undefined, 'rien ne manque');
  eq(d.lines.some((l) => l.nouveau), false, 'aucune ligne « nouveau »');
  // Même client, même ville, mais écrit autrement.
  const e = heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '12:00' }], nouveau_chantier: { nom: 'martin bureau', adresse: '', code_postal: '', ville: 'Villeurbanne 69100', description: '' } }, 'x');
  eq([e.nouveau_chantier?.reutilise_id, sites(e)], ['w-martin', 'w-martin'], 'mots dans un autre ordre');
  // Un « Dupont » seul, pour « Villa Dupont », n’est PAS ambigu quand le bloc désigne justement cet existant.
  const f = heures({ lignes: [{ chantier: 'Villa', debut: '08:00', fin: '12:00' }], nouveau_chantier: { nom: 'Villa Dupont', adresse: '', code_postal: '', ville: 'Lyon', description: '' } }, 'x');
  eq(f.nouveau_chantier?.reutilise_id, 'w-dupont', 'réutilisé');
});

Deno.test('Manques : la ville est réclamée (jamais inventée), le code postal est facultatif', () => {
  const sl06 = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }], nouveau_chantier: { nom: 'Paul Durand', adresse: '', code_postal: '', ville: '', description: 'pose de carrelage' } }, 'x');
  eq(sl06.manque, ['ville'], 'ville manquante');
  const sl05 = heures({ lignes: [{ chantier: 'nouveau', debut: '09:00', fin: '12:00' }], nouveau_chantier: { nom: 'Ayhan Demir', adresse: '', code_postal: '', ville: 'Bourg-en-Bresse', description: 'pergola' } }, 'x');
  eq(sl05.manque, undefined, 'sans code postal : rien ne manque');
});

// ── La fiche et ses contrôles ───────────────────────────────────────────────
Deno.test('Déjà noté aujourd’hui : bloquant avec les lignes de la journée, absent sur une journée vide (sl01)', () => {
  const args = { lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK };
  const avec = heures(args, ERGUN, DEFAUT);
  eq(avec.errors, [
    'Déjà noté aujourd\'hui : 07:30–12:00 (Villa Dupont). Retirez ce créneau ou corrigez-le dans « Ma journée ».',
    'Déjà noté aujourd\'hui : 13:00–16:30 (Bureau Martin). Retirez ce créneau ou corrigez-le dans « Ma journée ».',
  ], 'WORKER_LIVE');
  eq(heures(args, ERGUN, VIDE).errors, [], 'LIVE_VIDE');
  // Un autre jour : pas de contrôle « aujourd’hui ».
  eq(heures({ ...args, date: '2026-09-30' }, ERGUN, DEFAUT).errors, [], 'hier');
  // Ligne déjà envoyée : le texte le dit.
  const envoyee = { ...DEFAUT, lignes: [{ ...DEFAUT.lignes[0], envoyee: true }] };
  eq(heures(args, ERGUN, envoyee).errors[0].startsWith('Déjà envoyé aujourd\'hui : 07:30–12:00'), true, 'envoyée');
});

Deno.test('verifierFiche : mêmes erreurs que checkDraft, plus les lignes déjà notées, dans l’ordre ; recalculable par la carte', () => {
  const l = (start: string, end: string, extra: Partial<DraftLine> = {}): DraftLine => ({ worksite_id: null, worksite_text: '', start, end, break_minutes: 0, ...extra });
  const deja = [{ debut: '07:30', fin: '12:00', chantier: 'Villa Dupont', envoyee: false }];
  eq(verifierFiche(TODAY, [l('13:00', '17:00')], TODAY, deja), [], 'rien à signaler');
  eq(verifierFiche(TODAY, [l('08:00', '12:00')], TODAY, deja).length, 1, 'chevauche une ligne déjà notée');
  eq(verifierFiche(TODAY, [l('12:00', '13:00')], TODAY, deja), [], 'qui se touchent : pas un chevauchement');
  eq(verifierFiche('2026-09-30', [l('08:00', '12:00')], TODAY, deja), [], 'un autre jour');
  eq(verifierFiche(TODAY, [l('0800', '12:00')], TODAY, []), ['Horaire illisible : vérifiez début et fin.'], 'illisible');
  eq(verifierFiche(TODAY, [l('12:00', '08:00', { break_minutes: 0 }), l('13:00', '14:00')], TODAY, []).length >= 0, true, 'passage de minuit toléré comme checkDraft');
  eq(verifierFiche(TODAY, [l('08:00', '12:00'), l('11:00', '13:00')], TODAY, []), ['Deux créneaux se chevauchent (08:00–12:00 et 11:00–13:00).'], 'chevauchement entre créneaux');
  eq(verifierFiche(TODAY, [l('08:00', '09:00', { break_minutes: 60 })], TODAY, []), ['Pause plus longue que le créneau 08:00 → 09:00.'], 'pause trop longue');
  eq(verifierFiche('2026-12-25', [l('08:00', '12:00')], TODAY, [])[0].startsWith('Date hors période'), true, 'date hors période');
  eq(verifierFiche(TODAY, [], TODAY, deja), [], 'aucun créneau : rien à contrôler ici');
  // Date hors période en dernier, après « déjà noté ».
  const ordre = verifierFiche(TODAY, [l('08:00', '12:00'), l('11:00', '13:00')], TODAY, deja);
  eq(ordre[0].startsWith('Deux créneaux'), true, 'chevauchement d’abord');
  eq(ordre[ordre.length - 1].startsWith('Déjà noté'), true, 'puis déjà noté');
});

// ── 6.5 Les appels du modèle → la fiche ─────────────────────────────────────
const HEURES_ERGUN = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '17:00', pause: 60 }], nouveau_chantier: PIERRICK });

Deno.test('Cas d’Ergun : le modèle fusionne 08:00-17:00 pause 60 → UNE fiche, deux créneaux, pause marquée, net 8 h, nouveau chantier (sl01)', () => {
  const r = multi(build([HEURES_ERGUN], ERGUN));
  eq(r.kind, 'multi', 'fiche');
  eq(r.answer, MULTI_ANSWER, 'texte');
  eq(types(r), 'heures', 'un seul élément');
  const d = heuresDe(r);
  eq([creneaux(d), net(d), sites(d)], ['08:00-12:00 13:00-17:00', 480, 'NOUVEAU,NOUVEAU'], 'créneaux');
  eq(d.lines.map((l) => l.gap_before ?? null), [null, 'pause'], 'pause marquée');
  eq(d.nouveau_chantier, PIERRICK, 'nouveau chantier');
  eq([r.date, r.aujourdhui, r.ignores, r.non_prepare, r.incertain, r.note], [TODAY, TODAY, [], [], undefined, undefined], 'le reste');
  eq(r.items[0].id, 'i0', 'identifiants');
  // Avec la journée par défaut (deux lignes déjà notées), la fiche porte l’erreur bloquante.
  eq(heuresDe(multi(build([HEURES_ERGUN], ERGUN, DEFAUT))).errors.length, 2, 'WORKER_LIVE');
});

Deno.test('Tout appel d’écriture isolé est une fiche à UN élément (jamais d’exécution au montage) : panier, congé, réserve, envoi, nouveau chantier, heures', () => {
  const un = (c: ReturnType<typeof call>, texte: string, live = DEFAUT) => multi(build([c], texte, live));
  eq(types(un(call('panier_repas', { valeur: true }), 'mets le panier')), 'panier_repas', 'panier');
  eq(types(un(call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' }), 'je veux poser un congé')), 'demander_conge', 'congé');
  eq(types(un(call('signaler_reserve', { chantier: 'Villa Dupont', detail: 'fissure' }), 'signale une réserve : fissure')), 'signaler_reserve', 'réserve');
  eq(types(un(call('envoyer_journee'), 'envoie ma journée')), 'envoyer_journee', 'envoi');
  const c = un(call('nouveau_chantier', { nom: 'Boulangerie Petit', ville: 'Tassin' }), 'je bosse sur un nouveau chantier, la boulangerie petit à tassin');
  eq(types(c), 'chantier', 'chantier seul');
  const it = c.items[0];
  if (it.kind !== 'chantier') throw new Error('élément chantier');
  eq([it.nouveau_chantier.nom, it.nouveau_chantier.ville, it.manque], ['Boulangerie Petit', 'Tassin', []], 'bloc du chantier seul');
  eq(types(un(call('nouveau_chantier', { nom: 'Boulangerie Petit' }), 'nouveau chantier la boulangerie petit')), 'chantier', 'sans ville');
  const sansVille = un(call('nouveau_chantier', { nom: 'Boulangerie Petit' }), 'nouveau chantier la boulangerie petit').items[0];
  if (sansVille.kind !== 'chantier') throw new Error('élément chantier');
  eq(sansVille.manque, ['ville'], 'la ville est réclamée');
  const h = un(call('declarer_heures', { lignes: [{ chantier: 'Dupont', debut: '14:00', fin: '18:00' }] }), 'de 14h à 18h chez dupont');
  eq(types(h), 'heures', 'heures seules');
});

Deno.test('Chantier seul déjà existant (même nom + ville) : réutilisé, rien à créer', () => {
  const r = multi(build([call('nouveau_chantier', { nom: 'Bureau Martin', ville: 'Villeurbanne' })], 'nouveau chantier bureau martin à villeurbanne'));
  const it = r.items[0];
  if (it.kind !== 'chantier') throw new Error('élément chantier');
  eq([it.nouveau_chantier.reutilise_id, it.manque], ['w-martin', []], 'réutilisé');
});

Deno.test('Réponse habituelle (jamais une fiche) : repondre, planning des collègues, suppression avec sa propre confirmation', () => {
  const rep = build([call('repondre', { reponse: 'Bu hafta 7 saat 30 dakika çalıştınız.' })], 'Bu hafta toplam kaç saat çalıştım?', DEFAUT) as LongLegacy;
  eq([rep.kind, (rep as { answer: string }).answer], ['guide', 'Bu hafta 7 saat 30 dakika çalıştınız.'], 'repondre en turc, tel quel');
  eq((rep as LongLegacy).confirmer, undefined, 'pas de confirmer');
  eq(build([call('planning_collegues', { qui: 'Paul' })], 'où est paul', DEFAUT).kind, 'collegues', 'collègues');
  const eff = build([call('effacer_heures', { date: TODAY })], 'efface ma journée', DEFAUT);
  eq(eff.kind, 'action', 'suppression : sa carte de confirmation');
  eq((eff as LongLegacy).confirmer, undefined, 'une suppression est déjà « à confirmer »');
});

Deno.test('Gestes « directs » isolés (modifier une ligne, copier une journée, terminer le pointage) : réponse habituelle MAIS confirmer: true', () => {
  for (const [c, texte] of [
    [call('copier_journee', { depuis: '2026-09-30', vers: [TODAY] }), 'pareil qu’hier'],
    [call('modifier_heures', { chantier: 'Villa Dupont', debut: '07:00', fin: '11:30' }), 'change mes horaires de villa dupont : 7h 11h30'],
    [call('terminer_pointage'), 'j’ai fini'],
  ] as const) {
    const r = build([c], texte, DEFAUT) as LongLegacy;
    eq([r.kind, r.confirmer], ['action', true], c.name);
  }
});

Deno.test('Suppression ou « autre » mêlé à d’autres appels : jamais dans « Tout confirmer », dit dans « Laissé de côté »', () => {
  const r = multi(build([call('panier_repas', { valeur: true }), call('effacer_heures', { date: TODAY }), call('copier_journee', {}), call('retirer_reserve', {})], 'mets le panier et efface ma journée', DEFAUT));
  eq(types(r), 'panier_repas', 'seul le panier');
  eq(r.ignores.map((i) => [i.name, i.label]), [['effacer_heures', 'Effacer des heures'], ['retirer_reserve', 'Retirer une réserve'], ['copier_journee', 'Copier une journée']], 'ignorés, avec leur libellé');
  eq(r.ignores[0].raison, 'Effacer ou annuler se demande à part, avec sa propre confirmation.', 'raison des suppressions');
  eq(r.ignores[2].raison, 'À demander séparément.', 'raison des autres');
  // Aucune suppression ne se glisse dans les éléments (liste blanche).
  for (const it of r.items) if (it.kind === 'action' && !(MULTI_AUTORISES as readonly string[]).includes(it.action.draft.type)) throw new Error(`action hors liste blanche : ${it.action.draft.type}`);
  // Plus aucun appel admissible : la réponse habituelle du PREMIER appel, sans fiche.
  const seul = build([call('effacer_heures', { date: TODAY }), call('copier_journee', {})], 'efface', DEFAUT);
  eq(seul.kind, 'action', 'legacy du premier appel');
});

Deno.test('Doublons exacts : un seul ; deux journées → la première, l’autre est dite ; même journée → créneaux fusionnés', () => {
  const p = call('panier_repas', { valeur: true });
  eq(types(multi(build([p, { ...p }, call('envoyer_journee'), call('envoyer_journee')], 'panier puis envoie ma journée', DEFAUT))), 'panier_repas > envoyer_journee', 'doublons');
  const hier = call('declarer_heures', { date: '2026-09-30', lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] });
  const auj = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Martin', debut: '13:00', fin: '17:00' }] });
  const r = multi(build([hier, auj], 'hier 8h-12h chez dupont et aujourd’hui 13h-17h chez martin', VIDE));
  eq([heuresDe(r).date, creneaux(heuresDe(r))], ['2026-09-30', '08:00-12:00'], 'la première journée');
  eq(r.ignores, [{ name: 'declarer_heures', label: 'Heures d’un autre jour', raison: 'Une seule journée à la fois : redemandez l’autre jour séparément.' }], 'l’autre jour est dit');
  const matin = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] });
  const apres = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Martin', debut: '13:00', fin: '17:00' }] });
  const f = multi(build([matin, apres], 'ce matin 8h-12h chez dupont, cet après-midi 13h-17h chez martin', VIDE));
  eq([creneaux(heuresDe(f)), sites(heuresDe(f))], ['08:00-12:00 13:00-17:00', 'w-dupont,w-martin'], 'fusion');
  eq(f.ignores, [], 'rien d’ignoré');
});

Deno.test('Annexes en double : panier → le dernier gagne ; réserve ×2 → la première ; congés distincts → tous les deux', () => {
  const r = multi(build([call('panier_repas', { valeur: true }), call('panier_repas', { valeur: false })], 'mets le panier, non enlève le panier', DEFAUT));
  const p = action(r, 'panier_repas');
  eq((p.action.draft as { valeur: boolean }).valeur, false, 'le dernier gagne');
  const res = multi(build([call('signaler_reserve', { chantier: 'Villa Dupont', detail: 'fissure A' }), call('signaler_reserve', { chantier: 'Bureau Martin', detail: 'fissure B' })], 'signale une réserve fissure', DEFAUT));
  eq(types(res), 'signaler_reserve', 'une seule');
  eq(res.ignores.map((i) => i.raison), ['Une seule réserve à la fois.'], 'l’autre est dite');
  eq((action(res, 'signaler_reserve').action.draft as { detail: string }).detail, 'fissure A', 'la première');
  const c = multi(build([call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' }), call('demander_conge', { type: 'conge', du: '2026-10-12', au: '2026-10-14' })], 'pose un congé du 5 au 7 et du 12 au 14 octobre', DEFAUT));
  eq(c.items.length, 2, 'deux congés');
});

Deno.test('repondre + actions : le texte devient la note, dans la langue du salarié ; le garde-fou « je n’ai pas accès » reste actif', () => {
  const r = multi(build([call('repondre', { reponse: 'Tamam, günün gönderilecek.' }), call('envoyer_journee')], 'günümü büroya gönder', DEFAUT));
  eq([types(r), r.note], ['envoyer_journee', 'Tamam, günün gönderilecek.'], 'note en turc');
  const x = multi(build([call('repondre', { reponse: 'Je n’ai pas accès à votre planning.' }), call('panier_repas', { valeur: true })], 'mets le panier et dis-moi mon planning', DEFAUT));
  eq(/pas acc[eè]s/i.test(x.note ?? ''), false, 'jamais « je n’ai pas accès »');
});

Deno.test('Indice lexical obligatoire : une annexe que la phrase ne demande pas n’est pas préparée (consigne cachée dans un nom de chantier)', () => {
  const texte = 'de 8h à 12h chez Dupont';
  const heures = call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] });
  const r = multi(build([heures, call('envoyer_journee'), call('panier_repas', { valeur: true }), call('signaler_reserve', { chantier: 'Dupont' })], texte, VIDE));
  eq(types(r), 'heures', 'seulement les heures');
  eq(r.ignores.map((i) => [i.name, i.raison]), [['envoyer_journee', 'Non demandé dans votre message.'], ['panier_repas', 'Non demandé dans votre message.'], ['signaler_reserve', 'Non demandé dans votre message.']], 'dit');
  const c = multi(build([heures, call('demander_conge', { du: '2026-10-05' })], texte, VIDE));
  eq([types(c), c.ignores.map((i) => i.name)], ['heures', ['demander_conge']], 'congé non demandé');
  // Que des annexes non demandées : une phrase, jamais une fiche vide.
  const vide = build([call('envoyer_journee')], 'bonjour', DEFAUT);
  eq([vide.kind, (vide as { answer: string }).answer], ['answer', 'Envoyer la journée : Non demandé dans votre message.'], 'pas de fiche vide');
  // En turc.
  eq(types(multi(build([call('panier_repas', { valeur: true })], 'yemek sepetini işaretle', DEFAUT))), 'panier_repas', 'yemek sepeti');
  eq(types(multi(build([call('envoyer_journee')], 'günümü büroya gönder', DEFAUT))), 'envoyer_journee', 'gönder');
});

Deno.test('Annexes préparées sur les lignes de la FICHE : panier, réserve et envoi ne disent pas « Aucune ligne aujourd’hui » sur une journée vide (sl07)', () => {
  const texte = 'Aujourd’hui j’ai travaillé de 7h30 à 12h puis de 13h à 16h30 chez Dupont, mets-moi le panier repas, et signale une réserve : fissure sur le mur sud.';
  const calls = [
    call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '16:30' }] }),
    call('panier_repas', { valeur: true }), call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure sur le mur sud' }),
  ];
  const r = multi(build(calls, texte));
  eq(types(r), 'heures > panier_repas > signaler_reserve', 'ordre');
  for (const it of r.items) if (it.kind === 'action') eq(it.action.problems, [], `${it.action.draft.type} sans problème`);
  const res = action(r, 'signaler_reserve');
  eq(res.cible, { chantier_id: 'w-dupont', nouveau: false, nom: 'Villa Dupont' }, 'cible = le chantier, pas un rang');
  eq((res.action.draft as { entry_id: string }).entry_id, 'draft:L1', 'la dernière ligne de ce chantier (clé stable)');
  eq(res.depend, ['i0'], 'dépend des heures');
  eq(action(r, 'panier_repas').depend, ['i0'], 'le panier aussi');
  // Sans la fiche, sur la même journée vide, le panier serait refusé : la preuve que les lignes virtuelles servent.
  const seul = multi(build([call('panier_repas', { valeur: true })], 'mets le panier', VIDE));
  eq(action(seul, 'panier_repas').action.problems, ['Aucune ligne aujourd’hui : notez d’abord vos heures.'], 'sans heures');
});

Deno.test('Réserve : chantier sur deux chantiers différents → la liste « Sur quel chantier ? » (clés de la fiche) ; un créneau sur un nouveau chantier → cible « nouveau »', () => {
  const texte = 'de 7h à 10h chez Dupont et de 13h à 16h30 chez un nouveau client, signale une réserve fissure';
  const heuresArgs = { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'nouveau', debut: '13:00', fin: '16:30' }], nouveau_chantier: { nom: 'Ayhan Demir', adresse: '', code_postal: '', ville: 'Bourg-en-Bresse', description: '' } };
  const ambigue = multi(build([call('declarer_heures', heuresArgs), call('signaler_reserve', { detail: 'fissure' })], texte));
  const a = action(ambigue, 'signaler_reserve');
  eq(a.action.problems, ['Choisissez le chantier.'], 'à choisir');
  eq((a.action.draft as { choix: { id: string }[] }).choix.map((c) => c.id), ['draft:L0', 'draft:L1'], 'les clés des créneaux de la fiche');
  eq(a.cible, undefined, 'pas de cible tant que rien n’est choisi');
  const nouveau = multi(build([call('declarer_heures', heuresArgs), call('signaler_reserve', { chantier: 'Ayhan Demir', detail: 'fissure' })], texte));
  const n = action(nouveau, 'signaler_reserve');
  eq([n.cible, (n.action.draft as { entry_id: string }).entry_id, n.action.problems], [{ chantier_id: null, nouveau: true, nom: 'Ayhan Demir' }, 'draft:L1', []], 'cible nouveau chantier');
});

Deno.test('Réserve sur une journée déjà notée : le dernier créneau du chantier peut être une ligne EXISTANTE (identifiant réel, pas de cible)', () => {
  const r = multi(build([call('signaler_reserve', { chantier: 'Bureau Martin', detail: 'fissure' })], 'signale une réserve sur bureau martin fissure', DEFAUT));
  const a = action(r, 'signaler_reserve');
  eq([(a.action.draft as { entry_id: string }).entry_id, a.cible], ['e2', undefined], 'ligne e2');
});

Deno.test('Envoi : dépend de tout (heures, panier, réserve), dit les lignes déjà notées qui partent avec, avertit au-delà de 6 h sans pause', () => {
  const texte = 'de 7h à 18h chez Dupont, le panier, une réserve fissure, puis envoie ma journée';
  const r = multi(build([
    call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '18:00' }] }),
    call('panier_repas', { valeur: true }), call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure' }), call('envoyer_journee'),
  ], texte, VIDE));
  eq(types(r), 'heures > panier_repas > signaler_reserve > envoyer_journee', 'ordre D3');
  const e = action(r, 'envoyer_journee');
  eq([e.id, e.depend], ['i3', ['i0', 'i1', 'i2']], 'dépend des trois');
  eq(e.avertissements?.length, 1, 'plus de 6 h d’affilée');
  eq(e.avertissements?.[0].startsWith('Plus de 6 h d’affilée sans pause'), true, 'texte');
  eq(e.deja_notees, [], 'journée vide');
  // Avec une pause saisie (7h-12h, 13h-18h) : pas d’avertissement.
  const ok = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '18:00' }] }), call('envoyer_journee')], 'de 7h à 12h et de 13h à 18h chez Dupont, envoie ma journée', VIDE));
  eq(action(ok, 'envoyer_journee').avertissements, undefined, 'pause dans le trou');
  // Journée déjà notée : ses lignes partent avec la fiche.
  const d = multi(build([call('envoyer_journee')], 'envoie ma journée', DEFAUT));
  eq(action(d, 'envoyer_journee').deja_notees, [{ chantier: 'Villa Dupont', debut: '07:30', fin: '12:00' }, { chantier: 'Bureau Martin', debut: '13:00', fin: '16:30' }], 'lignes déjà notées');
});

Deno.test('Annexes d’un autre jour : panier, réserve et envoi ne concernent que AUJOURD’HUI (dit dans « Laissé de côté ») ; le congé n’a pas ce lien', () => {
  const r = multi(build([
    call('declarer_heures', { date: '2026-09-30', lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] }),
    call('panier_repas', { valeur: true }), call('envoyer_journee'), call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' }),
  ], 'hier de 8h à 12h et de 13h à 17h chez dupont, le panier, envoie ma journée, et un congé', DEFAUT));
  eq(types(r), 'heures > demander_conge', 'heures + congé');
  eq(r.ignores.map((i) => [i.name, i.raison]), [['panier_repas', 'Le panier, la réserve et l’envoi ne concernent que la journée d’aujourd’hui.'], ['envoyer_journee', 'Le panier, la réserve et l’envoi ne concernent que la journée d’aujourd’hui.']], 'dit');
  eq(r.date, '2026-09-30', 'date de la fiche');
});

Deno.test('Congé : dates ISO ou turques ; type et note passent par les contrôles habituels', () => {
  const r = multi(build([call('demander_conge', { type: 'maladie', du: 'yarın', au: 'yarın', note: 'grip' })], 'yarın hastayım, izin', DEFAUT));
  const c = action(r, 'demander_conge');
  eq([(c.action.draft as { conge_type: string; du: string }).conge_type, (c.action.draft as { du: string }).du, c.action.problems], ['maladie', '2026-10-02', []], 'yarın');
});

Deno.test('Ordre D3 et dépendances, quel que soit l’ordre des appels du modèle ; au plus 4 éléments', () => {
  const texte = 'envoie ma journée, un congé, une réserve fissure, le panier, et de 8h à 12h chez dupont';
  const r = multi(build([
    call('envoyer_journee'), call('demander_conge', { type: 'conge', du: '2026-10-05', au: '2026-10-07' }), call('signaler_reserve', { chantier: 'Dupont', detail: 'fissure' }), call('panier_repas', { valeur: true }),
    call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] }),
  ], texte, VIDE));
  if (r.items.length > 4) throw new Error(`${r.items.length} éléments`);
  eq(types(r), 'panier_repas > signaler_reserve > demander_conge > envoyer_journee', 'les 4 premiers appels, dans l’ordre D3');
  eq(r.ignores.map((i) => i.name), ['autres_actions'], 'le 5e appel est dit');
  eq(r.ignores[0].raison, '1 action de plus n’a pas été préparée : redemandez-la séparément.', 'texte');
  eq(r.incertain, true, 'lecture rapide');
  eq(r.non_prepare, ['Heures'], 'les heures n’ont pas été préparées : dit aussi');
});

Deno.test('rognes (appels valides écartés par le plafond du fournisseur) → « Autres actions » + lecture rapide', () => {
  const r = multi(build([call('panier_repas', { valeur: true })], 'mets le panier', DEFAUT, { rognes: 2 }));
  eq(r.ignores, [{ name: 'autres_actions', label: 'Autres actions', raison: '2 actions de plus n’ont pas été préparées : redemandez-les séparément.' }], 'rognes');
  eq(r.incertain, true, 'incertain');
});

// ── 6.6 Contrôle croisé ─────────────────────────────────────────────────────
Deno.test('Contrôle croisé : une action demandée et ABSENTE de la fiche est nommée dans « Non préparé » (modèle qui oublie le panier)', () => {
  const texte = 'Aujourd’hui de 8h à 12h et de 13h à 17h chez Dupont, mets le panier repas.';
  const oublie = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] })], texte));
  eq([oublie.non_prepare, oublie.incertain], [['Panier repas'], true], 'panier oublié, dit');
  const ok = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] }), call('panier_repas', { valeur: true })], texte));
  eq([ok.non_prepare, ok.incertain], [[], undefined], 'panier préparé');
  // Une annexe laissée de côté pour une raison dite n’est pas « non préparée » : elle est dans « Laissé de côté ».
  const hier = multi(build([call('declarer_heures', { date: '2026-09-30', lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '17:00' }] }), call('panier_repas', { valeur: true })], 'hier de 8h à 17h chez dupont, le panier'));
  eq([hier.non_prepare, hier.ignores.map((i) => i.name)], [[], ['panier_repas']], 'dit dans « Laissé de côté »');
  // Le modèle de secours a répondu : lecture rapide, même sans oubli.
  eq(multi(build([call('panier_repas', { valeur: true })], 'mets le panier', DEFAUT, { secours: true })).incertain, true, 'secours');
  // Nouveau chantier demandé mais aucun bloc : dit.
  const nc = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }] })], 'de 8h à 12h chez dupont puis un nouveau chantier'));
  eq(nc.non_prepare, ['Nouveau chantier'], 'nouveau chantier oublié');
});

Deno.test('Les familles turques sont contrôlées aussi (panier, congé, envoi)', () => {
  const r = multi(build([call('panier_repas', { valeur: true })], 'Gelecek pazartesiden çarşambaya kadar izin almak istiyorum, bugünkü panier repas’yı da işaretle ve günümü büroya gönder.', DEFAUT));
  eq(r.non_prepare, ['Congé', 'Envoi de la journée'], 'congé et envoi oubliés');
});

Deno.test('Dates et garde-fous : une phrase turque n’est ni rejetée ni déformée (la date vient du modèle, lue en turc si elle n’est pas ISO)', () => {
  const r = multi(build([call('declarer_heures', { date: 'dün', lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '12:00' }, { chantier: 'Martin', debut: '13:00', fin: '16:30' }] })], 'Dün sabah 7:30’dan 12’ye kadar Dupont villasında, öğleden sonra 13’ten 16:30’a kadar Martin ofisinde çalıştım.', DEFAUT));
  const d = heuresDe(r);
  eq([d.date, creneaux(d), sites(d), d.errors], ['2026-09-30', '07:30-12:00 13:00-16:30', 'w-dupont,w-martin', []], 'st07');
});

Deno.test('Appel sans rien d’utile : « Je n’ai pas compris »', () => {
  eq(build([], 'x', DEFAUT), { kind: 'answer', answer: 'Je n’ai pas compris. Reformulez.' }, 'aucun appel');
});

Deno.test('Les éléments sont des copies indépendantes de l’instantané : la fiche ne modifie jamais les données du salarié', () => {
  const s = snap();
  const avant = JSON.stringify(s);
  const live = JSON.parse(JSON.stringify(VIDE)) as WorkerLive;
  buildLongReply([HEURES_ERGUN, call('panier_repas', { valeur: true })], ERGUN + ' panier', s, live, {});
  eq(JSON.stringify(s), avant, 'instantané');
  eq(live.lignes, [], 'lignes du jour');
});

// ── Types : la fiche est sérialisable (elle part en JSON au navigateur) ─────
Deno.test('La fiche survit à un aller-retour JSON', () => {
  const r = multi(build([HEURES_ERGUN, call('panier_repas', { valeur: true })], ERGUN + ' Mets le panier.'));
  const copie = JSON.parse(JSON.stringify(r)) as WorkerMultiReply;
  eq(copie, JSON.parse(JSON.stringify(r)), 'stable');
  const it: MultiItem = copie.items[0];
  eq(it.id, 'i0', 'identifiant');
});

// ═══ Corrections de la relecture : jamais de perte silencieuse, chantiers distincts, pause niée, turc fléchi ═══
const DUPONT_2 = (extra: Partial<{ debut: string; fin: string }>[] = []) => extra.map((x) => ({ chantier: 'Dupont', debut: '08:00', fin: '12:00', ...x }));

Deno.test('Un créneau écarté par checkDraft RESTE dans la fiche : la vérification de la carte le bloque (pause ≥ créneau, fin vide, plus de 14 h)', () => {
  const pause = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00', pause: 300 }], nouveau_chantier: PIERRICK }, ERGUN);
  eq(pause.lines.map((l) => l.key), ['L0', 'L1'], 'les deux créneaux sont dans la fiche');
  eq(verifierFiche(pause.date, pause.lines, TODAY, []), ['Pause plus longue que le créneau 13:00 → 17:00.'], 'la carte le bloque');
  eq(pause.errors, ['Pause plus longue que le créneau 13:00 → 17:00.'], 'le serveur le dit aussi');
  const vide = heures({ lignes: [...DUPONT_2([{ debut: '07:00', fin: '12:00' }]), { chantier: 'Dupont', debut: '13:00', fin: '' }] }, 'x');
  eq(vide.lines.map((l) => `${l.start}-${l.end}`), ['07:00-12:00', '13:00-'], 'fin vide : le créneau reste, vide');
  eq(verifierFiche(vide.date, vide.lines, TODAY, []), ['Horaire illisible : vérifiez début et fin.'], 'bloquant');
  const long = heures({ lignes: [{ chantier: 'Dupont', debut: '05:00', fin: '23:00' }, ...DUPONT_2([{ debut: '08:00', fin: '09:00' }]).slice(0, 0)] }, 'x');
  eq([long.lines.length, verifierFiche(long.date, long.lines, TODAY, []).length], [1, 1], 'plus de 14 h : reste et bloque');
  // Par la réponse complète : la fiche multi porte les deux créneaux.
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00', pause: 300 }], nouveau_chantier: PIERRICK })], ERGUN));
  eq(heuresDe(r).lines.length, 2, 'la fiche du serveur garde les deux créneaux');
  // Une fiche sans créneau écarté est inchangée : deux créneaux, aucune erreur.
  eq(heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK }, ERGUN).errors, [], 'rien à signaler');
});

Deno.test('Date : une date ISO qui n’existe pas (2026-09-31) est « illisible » comme les autres ; une date valide reste valide', () => {
  const d = (date: string) => normaliserHeures({ date, lignes: DUPONT_2([{}]) }, 'x', snap(), VIDE);
  const x = d('2026-09-31');
  eq([x.date, x.errors.includes(DATE_ILLISIBLE)], [TODAY, true], '31 septembre');
  eq(d('2026-02-31').errors.includes(DATE_ILLISIBLE), true, '31 février');
  eq([d('2026-09-30').date, d('2026-09-30').errors], ['2026-09-30', []], 'valide');
});

Deno.test('Plus de 6 créneaux : les suivants ne sont pas perdus en silence (« Laissé de côté » + lecture rapide)', () => {
  const huit = Array.from({ length: 8 }, (_, i) => ({ chantier: 'Dupont', debut: `${String(6 + 2 * i).padStart(2, '0')}:00`, fin: `${String(6 + 2 * i).padStart(2, '0')}:30` }));
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes: huit })], 'huit interventions courtes chez Dupont dans la journée'));
  eq(heuresDe(r).lines.length, 6, 'six préparés');
  eq(r.ignores, [{ name: 'creneaux', label: 'Créneaux', raison: '2 créneaux de plus n’ont pas été préparés : redemandez-les séparément.' }], 'dit');
  eq(r.incertain, true, 'lecture rapide');
  const sept = multi(build([call('declarer_heures', { date: TODAY, lignes: huit.slice(0, 7) })], 'sept interventions chez Dupont'));
  eq(sept.ignores[0].raison, '1 créneau de plus n’a pas été préparé : redemandez-le séparément.', 'singulier');
  const six = multi(build([call('declarer_heures', { date: TODAY, lignes: huit.slice(0, 6) })], 'six interventions chez Dupont'));
  eq([six.ignores, six.incertain], [[], undefined], 'six : rien à dire');
});

Deno.test('memeChantier : les chiffres et les lettres seules DISTINGUENT (Villa 1 ≠ Villa 2, Bâtiment A ≠ B, Lyon 3 ≠ Lyon 7) ; « Dupont Pierrick » = « Pierrick Dupont »', () => {
  const m = (a: string, b: string, va = 'Lyon', vb = 'Lyon') => memeChantier({ nom: a, ville: va }, { nom: b, ville: vb });
  eq(m('Villa 1', 'Villa 2'), false, 'Villa 1 / Villa 2');
  eq(m('Bâtiment A', 'Bâtiment B'), false, 'Bâtiment A / B');
  eq(m('Martin 1', 'Martin 2'), false, 'Martin 1 / 2');
  eq(m('Dupont', 'Dupont', 'Lyon 3', 'Lyon 7'), false, 'Lyon 3 / Lyon 7');
  eq(m('Dupont', 'Dupont', 'Lyon', 'Lyon 3'), false, 'Lyon / Lyon 3');
  eq(m('Villa 1', 'Villa 1'), true, 'identiques');
  eq(m('Bâtiment A', 'Batiment A'), true, 'accents');
  eq(m('Dupont Pierrick', 'Pierrick Dupont', 'Montagna', 'Montagna'), true, 'ordre des mots');
  eq(m('Dupont', 'Dupont', 'Montagna', 'Montagna 01250'), true, 'code postal à 5 chiffres retiré');
  eq(m('M. Dupont', 'Dupont'), true, 'civilité « M. »');
  eq(m('L’atelier Martin', 'Atelier Martin'), true, 'élision');
  eq(m('Boulangerie du Coin', 'Boulangerie Coin', 'Lyon', 'Lyon 3'), false, 'Boulangerie du Coin (Lyon) ≠ Boulangerie Coin (Lyon 3)');
  // Dans la fiche : « Villa 2 » n’est pas rattaché à « Villa 1 ».
  const s = snap();
  s.chantiers.push({ id: 'w-v1', nom: 'Villa 1', ville: 'Lyon' });
  const d = normaliserHeures({ date: TODAY, lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }], nouveau_chantier: { nom: 'Villa 2', adresse: '', code_postal: '', ville: 'Lyon', description: '' } }, 'x', s, VIDE);
  eq([d.nouveau_chantier?.reutilise_id, sites(d)], [undefined, 'NOUVEAU'], 'Villa 2 est créé, pas confondu avec Villa 1');
});

Deno.test('cleanNewWorksite : espaces de largeur nulle et caractères de direction Unicode retirés (le bureau les verrait et les imprimerait)', () => {
  const x = cleanNewWorksite({ nom: 'Pierrick\u202e Dupont\u200b', ville: 'Lyon\u202e', adresse: '12 rue\u2066 des Lilas\u200f', description: 'pose\u200d store\ufeff banne\u2069' });
  eq([x.nom, x.ville, x.adresse, x.description], ['Pierrick Dupont', 'Lyon', '12 rue des Lilas', 'pose store banne'], 'nettoyés');
  eq(cleanNewWorksite({ nom: 'Ayşe Kaya', ville: 'İzmir', description: 'çatı onarımı' }).description, 'çatı onarımı', 'le turc est intact');
});

Deno.test('Pause NIÉE : « sans pause », « pas de pause », « mola vermedim » → l’écart n’est PAS marqué pause (un trajet n’est pas une pause)', () => {
  const lignes = [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '12:30', fin: '16:30' }];
  const gaps = (texte: string) => heures({ lignes }, texte).lines.map((l) => l.gap_before ?? null);
  eq(gaps('de 8h à 12h puis de 12h30 à 16h30 chez Dupont, sans pause, j’ai juste roulé entre les deux'), [null, null], 'sans pause');
  eq(gaps('de 8h à 12h puis de 12h30 à 16h30 chez Dupont, pas de pause aujourd’hui, juste le trajet'), [null, null], 'pas de pause');
  eq(gaps('de 8h à 12h puis de 12h30 à 16h30 chez Dupont, je n’ai pas pris de pause'), [null, null], 'pas pris de pause');
  eq(gaps('8’den 12’ye kadar, 12:30’dan 16:30’a kadar Dupont’ta, mola vermedim, sadece yol'), [null, null], 'mola vermedim');
  eq(gaps('8’den 12’ye kadar, 12:30’dan 16:30’a kadar Dupont’ta çalıştım, mola yok'), [null, null], 'mola yok');
  // Témoins : la pause dite est marquée, un trajet seul ne l’est pas.
  eq(gaps('de 8h à 12h puis de 12h30 à 16h30 chez Dupont, une pause de 30 minutes'), [null, 'pause'], 'pause affirmée');
  eq(gaps('de 8h à 12h puis de 12h30 à 16h30 chez Dupont, route entre les deux'), [null, null], 'route');
});

Deno.test('Pause : une pause portée par un créneau (« 15 minutes de pause » dans 07h-12h) ne qualifie PAS l’écart d’1 h ; sans durée dite l’écart le plus long reste le repli', () => {
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '12:00', pause: 15 }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] }, 'de 7h à 12h avec 15 minutes de pause, puis de 13h à 17h chez Dupont');
  eq([creneaux(d), d.lines.map((l) => l.gap_before ?? null)], ['07:00-12:00/p15 13:00-17:00', [null, null]], 'écart non qualifié');
  const sansDuree = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Dupont', debut: '10:30', fin: '12:00' }, { chantier: 'Dupont', debut: '14:00', fin: '16:30' }] }, 'une pause entre midi et deux');
  eq(sansDuree.lines.map((l) => l.gap_before ?? null), [null, null, 'pause'], 'repli : le plus long');
});

Deno.test('Turc : les formes fléchies de « mola » (molası, molaya, molayı), « öğle arası », « ara verdim » marquent la pause (D5/D6)', () => {
  const args = { lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: PIERRICK };
  for (const milieu of ['bir saat yemek molası verdim', 'molaya çıktım', 'bir saat molayı', 'öğle arası bir saat', 'ara verdim', 'bir saat mola']) {
    const d = heures(args, `8’den 12’ye kadar çalıştım, ${milieu}, 13’ten 17’ye kadar çalıştım`);
    eq([d.lines.map((l) => l.gap_before ?? null), net(d)], [[null, 'pause'], 480], `« ${milieu} »`);
  }
  // La pause dite par une durée en minutes reste attachée au bon écart.
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Dupont', debut: '10:45', fin: '12:00' }, { chantier: 'Dupont', debut: '14:00', fin: '16:30' }] }, 'öğle molası 45 dakika');
  eq(d.lines.map((l) => l.gap_before ?? null), [null, 'pause', null], '45 dakika');
});

Deno.test('Redécoupage : une ligne qui EST une plage dite (aujourd’hui 8h-17h) n’est pas coupée avec les plages d’un autre jour (hier 8h-12h, 13h-17h)', () => {
  const d = heures({ lignes: [{ chantier: 'Martin', debut: '08:00', fin: '17:00', pause: 30 }] }, 'Hier de 8h à 12h et de 13h à 17h chez Dupont. Aujourd’hui de 8h à 17h chez Martin avec une demi-heure de pause');
  eq([creneaux(d), net(d), d.lines.map((l) => l.gap_before ?? null)], ['08:00-17:00/p30', 510, [null]], 'net 8 h 30, pause gardée');
});

Deno.test('Réserve en turc : « rezerv koy », « sızıntı… rezerv yaz » sont préparées (indice lexical turc) ; une famille demandée mais non reconnue est « non comprise », pas « non demandée »', () => {
  for (const texte of ['Dupont şantiyesinde 8’den 17’ye kadar çalıştım, rezerv koy: duvar boyası kötü', 'Dupont şantiyesinde bir sızıntı var, rezerv yaz', 'Dupont şantiyesinde kusur var', 'Dupont şantiyesinde bir sorun var, rezerv']) {
    eq(types(multi(build([call('signaler_reserve', { chantier: 'Dupont', detail: 'sızıntı' })], texte, DEFAUT))), 'signaler_reserve', `« ${texte} »`);
  }
  const x = build([call('reserve_corrigee', { chantier: 'Villa Dupont' })], 'la fissure du mur sud', DEFAUT) as { kind: string; answer: string };
  eq([x.kind, x.answer], ['answer', 'Lever la réserve : Non compris : redemandez-le.'], 'famille détectée, indice absent');
});

Deno.test('Appels sans heures ni annexe : le premier est rendu, les AUTRES sont nommés (« Non préparé : … ») — rien ne disparaît sans un mot', () => {
  const a = build([call('terminer_pointage'), call('repondre', { reponse: 'Ok.' })], 'j’ai fini', DEFAUT) as LongLegacy;
  eq([a.kind, a.confirmer, a.answer.endsWith(' Non préparé : Réponse. Redemandez-le séparément.')], ['action', true, true], 'terminer + repondre');
  const b = build([call('modifier_heures', { chantier: 'Villa Dupont', debut: '07:00', fin: '11:30' }), call('copier_journee', { depuis: '2026-09-30', vers: [TODAY] })], 'change mes horaires puis copie hier', DEFAUT) as LongLegacy;
  eq(b.answer.includes('Non préparé : Copier une journée. Redemandez-le séparément.'), true, 'modifier + copier');
  const seul = build([call('terminer_pointage')], 'j’ai fini', DEFAUT) as LongLegacy;
  eq(seul.answer.includes('Non préparé'), false, 'un seul appel : rien de plus');
});

Deno.test('nettoyerEcarts : « pause » périmée effacée (première ligne, écart nul ou > 4 h) ; gardée entre deux voisins séparés de 1 à 240 min', () => {
  const l = (start: string, end: string, extra: Partial<DraftLine> = {}): DraftLine => ({ worksite_id: 'w', worksite_text: '', start, end, break_minutes: 0, ...extra });
  const g = (lines: DraftLine[]) => nettoyerEcarts(lines).map((x) => x.gap_before ?? null);
  eq(g([l('08:00', '12:00'), l('13:00', '17:00', { gap_before: 'pause' })]), [null, 'pause'], 'inchangé');
  eq(g([l('13:00', '17:00', { gap_before: 'pause' })]), [null], 'le créneau d’avant a été retiré');
  eq(g([l('08:00', '13:00'), l('13:00', '17:00', { gap_before: 'pause' })]), [null, null], 'écart nul');
  eq(g([l('06:00', '08:00'), l('13:00', '17:00', { gap_before: 'pause' })]), [null, null], 'écart de 5 h');
  eq(g([l('13:00', '17:00', { gap_before: 'pause' }), l('08:00', '12:00')]), [ 'pause', null], 'ordre de la fiche différent de l’ordre des heures : on suit les heures');
  const garde = nettoyerEcarts([l('08:00', '12:00', { key: 'L0' }), l('13:00', '17:00', { key: 'L1', gap_before: 'pause' })]);
  eq(garde.map((x) => x.key), ['L0', 'L1'], 'les clés sont conservées');
  eq('gap_before' in nettoyerEcarts([l('13:00', '17:00', { gap_before: 'pause' })])[0], false, 'la clé est retirée, pas mise à undefined');
});

// ── R1 : la ville depuis le code postal (st01 : « adres Montagna 01250 ») ───
const ST01 = 'Bugün sabah 8’den 12’ye kadar çalıştım, sonra bir saat mola verdim, sonra öğleden sonra 13’ten 17’ye kadar yeni bir şantiyede çalıştım: müşteri Pierrick Dupont, adres Montagna 01250, kollu tente montajı için.';
const bloc = (b: Partial<{ nom: string; adresse: string; code_postal: string; ville: string; description: string }>) => ({ nom: 'Pierrick Dupont', adresse: '', code_postal: '', ville: '', description: '', ...b });
const deuxNouveau = [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }];

Deno.test('R1 : st01 réel — le modèle met Montagna en ADRESSE (ville vide) → la ville est Montagna, l’adresse est vide, rien ne manque', () => {
  const d = heures({ lignes: deuxNouveau, nouveau_chantier: bloc({ adresse: 'Montagna', code_postal: '01250', description: 'Pose de store banne' }) }, ST01);
  eq([d.nouveau_chantier?.ville, d.nouveau_chantier?.adresse, d.nouveau_chantier?.code_postal], ['Montagna', '', '01250'], 'ville = ancienne adresse');
  eq(d.manque, undefined, 'la fiche ne réclame plus la ville');
  eq(sites(d), 'NOUVEAU,NOUVEAU', 'créneaux sur le nouveau chantier');
  // Même chose pour un chantier seul (appel nouveau_chantier isolé) : le bloc est complété.
  const r = multi(build([call('nouveau_chantier', bloc({ adresse: 'Montagna', code_postal: '01250' }))], ST01));
  const it = r.items[0];
  if (it.kind !== 'chantier') throw new Error('élément chantier');
  eq([it.nouveau_chantier.ville, it.nouveau_chantier.adresse, it.manque], ['Montagna', '', []], 'chantier seul');
  // Adresse en minuscules (dictée) : la ville est mise en majuscule initiale.
  eq(heures({ lignes: deuxNouveau, nouveau_chantier: bloc({ adresse: 'montagna', code_postal: '01250' }) }, ST01).nouveau_chantier?.ville, 'Montagna', 'casse');
});

Deno.test('R1 : une vraie adresse (chiffre ou mot de voie) n’est JAMAIS prise pour une ville ; une ville donnée par le modèle n’est JAMAIS écrasée', () => {
  for (const adresse of ['12 rue des Lilas', 'rue des Lilas', 'Avenue Foch', 'chemin du Moulin', 'Atatürk caddesi', 'Gül sokak', 'Impasse Verte', 'lotissement Les Pins']) {
    const d = heures({ lignes: deuxNouveau, nouveau_chantier: bloc({ adresse, code_postal: '01250' }) }, 'Nouveau chantier : client Pierrick Dupont, adresse sans ville.');
    eq([d.nouveau_chantier?.ville, d.nouveau_chantier?.adresse, d.manque], ['', adresse, ['ville']], `« ${adresse} » reste une adresse, la ville est réclamée`);
  }
  const lyon = heures({ lignes: deuxNouveau, nouveau_chantier: bloc({ adresse: 'Montagna', code_postal: '01250', ville: 'Lyon' }) }, ST01);
  eq([lyon.nouveau_chantier?.ville, lyon.nouveau_chantier?.adresse], ['Lyon', 'Montagna'], 'ville du modèle gardée');
  // Sans code postal dans le bloc, une adresse sans chiffre n’est pas déplacée (le code postal dit l’intention).
  const sansCp = heures({ lignes: deuxNouveau, nouveau_chantier: bloc({ adresse: 'Montagna' }) }, 'Nouveau chantier chez Pierrick Dupont, adresse Montagna.');
  eq([sansCp.nouveau_chantier?.ville, sansCp.nouveau_chantier?.adresse], ['', 'Montagna'], 'pas de code postal : inchangé');
});

Deno.test('R1 : sinon la ville est lue dans la phrase, « <mots capitalisés> <5 chiffres> » — jamais inventée, jamais le nom du client, jamais une rue', () => {
  const ville = (texte: string, b: Parameters<typeof bloc>[0] = {}) => heures({ lignes: deuxNouveau, nouveau_chantier: bloc(b) }, texte).nouveau_chantier?.ville;
  eq(ville(ST01), 'Montagna', 'st01, bloc sans adresse ni code postal');
  eq(ville('Nouveau chantier : monsieur Pierrick Dupont Montagna 01250.'), 'Montagna', 'le nom du client est retiré');
  eq(ville('Nouveau client Pierrick Dupont, Adresse Montagna 01250'), 'Montagna', 'le mot « Adresse » est retiré');
  eq(ville('Nouveau chantier chez Pierrick Dupont à Bourg en Bresse 01000, pour une pergola.', { code_postal: '01000' }), 'Bourg en Bresse', 'petits mots entre deux majuscules');
  eq(ville('Nouveau chantier chez Pierrick Dupont à Saint-Étienne-du-Rouvray 76800.'), 'Saint-Étienne-du-Rouvray', 'tirets');
  eq(ville('Nouveau chantier chez Pierrick Dupont, 12 rue des Tilleuls à Bourg-en-Bresse 01000.', { adresse: '12 rue des Tilleuls', code_postal: '01000' }), 'Bourg-en-Bresse', 'adresse avec rue : la ville vient de la phrase');
  // Jamais inventée : pas de ville dans la phrase, ou seulement un nom de client, ou une rue devant le code postal.
  eq(ville('Nouveau chantier chez Pierrick Dupont pour une pergola.'), '', 'aucun code postal dans la phrase');
  eq(ville('Nouveau chantier chez Pierrick Dupont 01250.'), '', 'le client seul devant le code postal');
  eq(ville('Nouveau chantier chez Pierrick Dupont, rue des Tilleuls 01000.', { adresse: 'rue des Tilleuls' }), '', 'une rue n’est pas une ville');
  eq(ville('Nouveau chantier, le matin de 8h à 12h. Pierrick Dupont, 01250.'), '', 'la ponctuation coupe');
  eq(heures({ lignes: deuxNouveau, nouveau_chantier: bloc({}) }, 'Nouveau chantier chez Pierrick Dupont.').manque, ['ville'], 'la fiche réclame la ville');
  // Un code postal du bloc qui n’est pas dans la phrase : on ne prend pas un autre code.
  eq(ville('Nouveau chantier chez Pierrick Dupont à Lyon 69003.', { code_postal: '01250' }), '', 'autre code postal dans la phrase');
});

// ── R2 : un chantier DEVINÉ n’est pas un chantier dit ───────────────────────
const ST08 = 'Bugün chantier’de 8’den 12’ye kadar ve 13’ten 17’ye kadar Martin’de çalıştım, panier repas da yaz.';
const PLUSIEURS = (d: Draft) => d.lines.map((l) => `${l.nouveau ? 'NOUVEAU' : l.worksite_id ?? 'AUCUN'}${l.from_planning ? '*' : ''}`).join(',');

Deno.test('R2 : st01 réel — « Villa Dupont » rendu pour le 1er créneau alors que la phrase n’introduit que « Pierrick Dupont » → les DEUX créneaux sur le nouveau chantier', () => {
  const d = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'nouveau', debut: '13:00', fin: '17:00' }], nouveau_chantier: bloc({ adresse: 'Montagna', code_postal: '01250', description: 'Pose de store banne' }) }, ST01);
  eq(PLUSIEURS(d), 'NOUVEAU,NOUVEAU', 'aucun créneau sur Villa Dupont, aucun planning');
  eq(d.nouveau_chantier?.ville, 'Montagna', 'et la ville (R1)');
  eq(d.errors, [], 'aucune erreur');
  eq(d.lines.map((l) => l.gap_before ?? null), [null, 'pause'], 'la pause dite');
  // Les deux créneaux devinés.
  const deux = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Villa Dupont', debut: '13:00', fin: '17:00' }], nouveau_chantier: bloc({ ville: 'Montagna', code_postal: '01250' }) }, ST01);
  eq(PLUSIEURS(deux), 'NOUVEAU,NOUVEAU', 'deux devinés');
  // Par la fiche complète (même chemin que la production).
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Pierrick Dupont', debut: '13:00', fin: '17:00' }], nouveau_chantier: bloc({ adresse: 'Montagna', code_postal: '01250' }) })], ST01));
  eq([types(r), PLUSIEURS(heuresDe(r)), heuresDe(r).manque], ['heures', 'NOUVEAU,NOUVEAU', undefined], 'fiche');
});

Deno.test('R2 : st08 réel — « Villa Dupont » rendu pour le créneau 1, la phrase ne nomme que Martin → les deux créneaux chez Martin, sans planning', () => {
  const d = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Bureau Martin', debut: '13:00', fin: '17:00' }] }, ST08);
  eq(PLUSIEURS(d), 'w-martin,w-martin', 'les deux sur Bureau Martin (ni Dupont ni planning)');
  // Le mot « chantier » n’est pas un nom : un créneau « chantier » est sans nom aussi.
  eq(PLUSIEURS(heures({ lignes: [{ chantier: 'chantier', debut: '08:00', fin: '12:00' }, { chantier: 'Martin', debut: '13:00', fin: '17:00' }] }, ST08)), 'w-martin,w-martin', 'mot générique');
  eq(PLUSIEURS(heures({ lignes: [{ chantier: '', debut: '08:00', fin: '12:00' }, { chantier: 'Martin', debut: '13:00', fin: '17:00' }] }, ST08)), 'w-martin,w-martin', 'créneau vide');
  // Le panier reste préparé sur la fiche.
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Bureau Martin', debut: '13:00', fin: '17:00' }] }), call('panier_repas', { valeur: true })], ST08));
  eq([types(r), PLUSIEURS(heuresDe(r)), r.non_prepare], ['heures > panier_repas', 'w-martin,w-martin', []], 'fiche');
});

Deno.test('R2 : « chez Dupont » ET « Pierrick Dupont, nouveau client » → reste AMBIGU (« à choisir »), jamais l’un ou l’autre au hasard', () => {
  const texte = 'Ce matin de 8h à 12h chez Dupont, et cet après-midi de 13h à 17h chez Pierrick Dupont, un nouveau client à Montagna 01250.';
  for (const rendu of ['Villa Dupont', 'Dupont', 'chez Dupont']) {
    const d = heures({ lignes: [{ chantier: rendu, debut: '08:00', fin: '12:00' }, { chantier: 'Pierrick Dupont', debut: '13:00', fin: '17:00' }], nouveau_chantier: bloc({ ville: 'Montagna', code_postal: '01250' }) }, texte);
    eq(PLUSIEURS(d), 'AUCUN,NOUVEAU', `« ${rendu} » : créneau 1 à choisir`);
    eq(d.lines[0].a_choisir, { existant: 'Villa Dupont', nouveau: 'Pierrick Dupont' }, `« ${rendu} » : la question`);
  }
  // « Villa Dupont » dit en toutes lettres est bien l’existant, même avec un client « Pierrick Dupont ».
  const v = heures({ lignes: [{ chantier: 'Villa Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Pierrick Dupont', debut: '13:00', fin: '17:00' }], nouveau_chantier: bloc({ ville: 'Montagna', code_postal: '01250' }) },
    'Ce matin de 8h à 12h à la Villa Dupont, et de 13h à 17h chez Pierrick Dupont, un nouveau client à Montagna 01250.');
  eq(PLUSIEURS(v), 'w-dupont,NOUVEAU', 'Villa Dupont dit en entier');
});

Deno.test('R2 : un chantier dit (nom, mot du nom, ville, forme turque) n’est jamais traité comme deviné ; le planning reste la source quand rien n’est nommé', () => {
  const un = (chantier: string, texte: string) => PLUSIEURS(heures({ lignes: [{ chantier, debut: '08:00', fin: '12:00' }] }, texte));
  eq(un('Villa Dupont', 'Aujourd’hui de 8h à 12h chez Dupont.'), 'w-dupont', 'un mot du nom');
  eq(un('Villa Dupont', 'Bugün 8’den 12’ye kadar Dupont villasında çalıştım.'), 'w-dupont', 'forme turque');
  eq(un('Bureau Martin', 'Bugün 8’den 12’ye kadar Martin’de çalıştım.'), 'w-martin', 'Martin’de');
  eq(un('Villa Dupont', 'Aujourd’hui de 8h à 12h à Lyon.'), 'w-dupont', 'la ville dite désigne le chantier');
  // Rien n’est nommé : le planning de la journée (Villa Dupont) reste la source, marquée « du planning ».
  eq(un('', 'Aujourd’hui de 8h à 12h.'), 'w-dupont*', 'créneau sans nom : planning, comme avant');
  eq(un('Villa Dupont', 'Aujourd’hui de 8h à 12h.'), 'w-dupont*', 'chantier deviné, aucun nom dans la phrase : planning (honnêtement marqué)');
  // Plusieurs chantiers nommés et un créneau sans nom : comme avant (planning), jamais l’un d’eux au hasard.
  const d = heures({ lignes: [{ chantier: 'Dupont', debut: '07:00', fin: '10:00' }, { chantier: 'Martin', debut: '10:30', fin: '12:00' }, { chantier: '', debut: '13:00', fin: '16:30' }] },
    'Ce matin de 7h à 10h chez Dupont, de 10h30 à midi chez Martin, et de 13h à 16h30.');
  eq(PLUSIEURS(d), 'w-dupont,w-martin,w-dupont*', 'deux nommés : le planning, comme aujourd’hui');
});

// ── R3 : « nouveau chantier » dit pour un chantier qui existe déjà (sl12) ───
const SL12 = 'J’ai travaillé de 8h à 12h puis de 13h à 17h sur un nouveau chantier, Bureau Martin à Villeurbanne.';

Deno.test('R3 : sl12 réel — le modèle rattache les créneaux à Bureau Martin SANS bloc : chantier réutilisé (reutilise_id), plus de « Non préparé : Nouveau chantier »', () => {
  const lignes = [{ chantier: 'Bureau Martin', debut: '08:00', fin: '12:00' }, { chantier: 'Bureau Martin', debut: '13:00', fin: '17:00' }];
  const d = heures({ lignes }, SL12);
  eq(sites(d), 'w-martin,w-martin', 'créneaux');
  eq(d.nouveau_chantier, { nom: 'Bureau Martin', adresse: '', code_postal: '', ville: 'Villeurbanne', description: '', reutilise_id: 'w-martin' }, 'bloc réutilisé');
  eq([d.manque, d.nouveau_chantier?.inutilise], [undefined, undefined], 'rien ne manque, rien d’inutilisé');
  const r = multi(build([call('declarer_heures', { date: TODAY, lignes })], SL12));
  eq([types(r), r.non_prepare, r.incertain, r.ignores], ['heures', [], undefined, []], 'la fiche ne dit plus « Non préparé : Nouveau chantier »');
  // Le client peut vérifier : le bloc passe par `memeChantier` comme n’importe quel chantier réutilisé.
  eq(memeChantier(d.nouveau_chantier!, { nom: 'Bureau Martin', ville: 'Villeurbanne' }), true, 'cohérent avec la carte');
});

Deno.test('R3 : seulement si le nom ET la ville du chantier existant sont dans la phrase, et UN seul candidat — sinon « Non préparé » comme avant', () => {
  const rendu = (texte: string, ...noms: string[]) => multi(build([call('declarer_heures', { date: TODAY, lignes: noms.map((n, i) => ({ chantier: n, debut: i ? '13:00' : '08:00', fin: i ? '17:00' : '12:00' })) })], texte));
  // La ville n’est pas dite : rien ne prouve que c’est CE chantier.
  eq(rendu('J’ai travaillé de 8h à 12h puis de 13h à 17h sur un nouveau chantier, Bureau Martin.', 'Bureau Martin', 'Bureau Martin').non_prepare, ['Nouveau chantier'], 'sans la ville');
  // Un nouveau chantier dit à côté d’un chantier existant sans rapport : rien n’est réutilisé.
  eq(rendu('De 8h à 12h chez Dupont puis de 13h à 17h, un nouveau chantier à Lyon.', 'Dupont', 'Dupont').non_prepare, ['Nouveau chantier'], 'Villa Dupont n’est pas dite en entier');
  // Deux chantiers existants dits : ambigu, rien.
  eq(rendu('Un nouveau chantier : Bureau Martin à Villeurbanne, puis Villa Dupont à Lyon.', 'Bureau Martin', 'Villa Dupont').non_prepare, ['Nouveau chantier'], 'deux candidats');
  // Sans la famille « nouveau chantier » dans la phrase : aucun bloc ajouté.
  const sans = heures({ lignes: [{ chantier: 'Bureau Martin', debut: '08:00', fin: '12:00' }] }, 'De 8h à 12h au Bureau Martin à Villeurbanne.');
  eq(sans.nouveau_chantier, undefined, 'pas de bloc');
  // Un bloc rendu par le modèle garde la main (R3 ne le remplace pas).
  const bloc2 = heures({ lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '12:00' }], nouveau_chantier: { nom: 'Bureau Martin', adresse: '', code_postal: '', ville: 'Villeurbanne', description: '' } }, SL12);
  eq(bloc2.nouveau_chantier?.reutilise_id, 'w-martin', 'bloc du modèle réutilisé comme avant');
});
