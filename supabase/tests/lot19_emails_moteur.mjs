// Lot 19 — le MOTEUR de la fonction `send-staff-email` (staff-email-run.ts, le vrai code)
// branché sur la VRAIE base SQL (la migration du lot, sur PGlite) : plafond, doublons,
// journal et statuts décidés par le SQL réel, envoi par un FAUX transport. Jamais de vrai
// e-mail, jamais de vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:emails-moteur-db     (Node 22.18+ lit les fichiers .ts tels quels)
//
// Complète lot19_emails.mjs (la base seule) et staff-email.test.ts (le moteur sur une base
// en mémoire) : ici, le moteur ET le SQL ensemble, y compris des demandes SIMULTANÉES.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STUB, DEFAULT_PRIVS } from './lot19_emails.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.join(here, '..', 'functions', '_shared');
const { handleStaffEmail, Unavailable } = await import(pathToFileURL(path.join(shared, 'staff-email-run.ts')).href);
const fake = await import(pathToFileURL(path.join(shared, 'staff-email-fake.ts')).href);
const { makeWorld, makeDeps, fakePdfBase64, CO, ADMIN, LUCAS, NINA, SARA } = fake;

const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const MIG = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot19_emails.sql'));

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
const section = (t) => console.log(`\n═══ ${t}`);

async function newDb(withMigration = true) {
  const db = new PGlite();
  await db.exec(STUB); await db.exec(DEFAULT_PRIVS);
  await db.exec(mig('20260928120000_email_desabonnements.sql'));
  if (withMigration) await db.exec(mig(MIG));
  await db.exec('SET ROLE service_role'); // la clé service, comme la fonction edge
  return db;
}
/** Les trois pièces de base, branchées sur la vraie base ; « fonction absente » devient Unavailable (comme dans index.ts). */
const sqlDeps = (db, world) => {
  const missing = (e) => ['42P01', '42883'].includes(e.code);
  const wrap = async (f) => { try { return await f(); } catch (e) { if (missing(e)) throw new Unavailable(); throw e; } };
  return makeDeps(world, {
    usedToday: (company) => wrap(async () => Number((await db.query('SELECT public.staff_email_used_today($1) AS n', [company])).rows[0].n)),
    reserve: (a) => wrap(async () => (await db.query('SELECT public.staff_email_reserve($1, $2, $3, $4, $5::jsonb) AS r', [a.companyId, a.sentBy, a.kind, a.cap, JSON.stringify(a.items)])).rows[0].r),
    finish: (a) => wrap(async () => { await db.query('SELECT public.staff_email_finish($1, $2, $3, $4)', [a.id, a.companyId, a.status, a.reason]); }),
  });
};
const MONDAY = '2026-10-19';
const planning = (ids) => ({ action: 'planning', week_start: MONDAY, items: ids.map((id) => ({ user_id: id, mime: 'application/pdf', content_base64: fakePdfBase64(id) })) });
const message = (ids, text = 'Bonjour') => ({ action: 'message', user_ids: ids, message: text });
const results = (r) => r.body.results;
const logRows = async (db) => (await db.query('SELECT * FROM public.staff_email_log ORDER BY created_at, id')).rows;
const addUsers = (world, n, prefix = 'u') => {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `10000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`;
    ids.push(id);
    world.users.push({ id, company_id: CO, role: 'worker', is_active: true, first_name: `${prefix}${i}`, email: `${prefix}${i}@example.com` });
  }
  return ids;
};

// ═══ Le parcours normal ═════════════════════════════════════════════════════
section('Parcours : planning et message, journal réel');
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  const r = await handleStaffEmail(deps, ADMIN, planning([LUCAS, NINA, SARA]));
  check(r.status === 200 && results(r).map((x) => x.reason ?? x.outcome).join() === 'sent,sent,desabonne', 'planning à Lucas et Nina envoyé, Sara (désabonnée) écartée');
  check(w.mailbox.map((m) => m.to).join() === 'lucas@example.com,nina@example.com', 'un e-mail par destinataire, adresses de la base');
  const rows = await logRows(db);
  check(rows.length === 2 && rows.every((x) => x.status === 'sent' && x.kind === 'planning-hebdo' && x.company_id === CO), 'journal réel : 2 lignes « sent », famille planning-hebdo, entreprise de l’appelant');
  check(rows.every((x) => /^[a-z]\*\*\*@example\.com$/.test(x.recipient_mask) && /^[0-9a-f]{64}$/.test(x.recipient_hash) && /^[0-9a-f]{64}$/.test(x.content_hash)), 'destinataire masqué, empreintes de 64 caractères');
  const dump = JSON.stringify(rows);
  check(!dump.includes('lucas@') && !dump.includes('nina@') && !dump.includes('Bonjour') && !dump.includes(fakePdfBase64(LUCAS).slice(0, 20)), 'ni adresse complète, ni texte, ni pièce jointe dans le journal');
  check(r.body.used === 2 && r.body.remaining === 48, 'compteur : 2 sur 50');
  const r2 = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Réunion à 7 h'));
  check(results(r2)[0].outcome === 'sent' && (await logRows(db)).length === 3, 'message envoyé : 3e ligne du journal');
  const e = await handleStaffEmail(deps, ADMIN, { action: 'etat' });
  check(e.body.available === true && e.body.used === 3, 'état : 3 envois aujourd’hui (compté par la base)');
  await db.close();
}

// ═══ Doublons ═══════════════════════════════════════════════════════════════
section('Doublons : décidés par la base');
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  const [a, b] = await Promise.all([handleStaffEmail(deps, ADMIN, message([LUCAS], 'Même texte')), handleStaffEmail(deps, ADMIN, message([LUCAS], 'Même texte'))]);
  const kinds = [results(a)[0], results(b)[0]].map((x) => x.reason ?? x.outcome).sort();
  check(kinds.join() === 'doublon,sent' && w.mailbox.length === 1, 'deux clics SIMULTANÉS sur le même message : un seul e-mail, l’autre est un doublon');
  const c = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Autre texte'));
  check(results(c)[0].outcome === 'sent' && w.mailbox.length === 2, 'un autre texte part');
  await db.exec(`UPDATE public.staff_email_log SET created_at = now() - interval '2 minutes'`).catch(() => {}); // service : UPDATE accordé
  const d = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Même texte'));
  check(results(d)[0].outcome === 'sent', 'plus d’une minute plus tard, le même texte repart');
  await db.close();
}

// ═══ Plafond ════════════════════════════════════════════════════════════════
section('Plafond : 50 par jour, y compris en rafale');
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  const crowd = addUsers(w, 60);
  // 48 envois déjà faits aujourd'hui (lignes écrites par le service, comme la fonction le ferait).
  await db.exec(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash, status)
    SELECT '${CO}', 'message-bureau', 'a***@b.fr', lpad(to_hex(g), 64, '0'), repeat('a', 64), 'sent' FROM generate_series(1, 48) g`);
  const r = await handleStaffEmail(deps, ADMIN, message([LUCAS, NINA, crowd[0], crowd[1], crowd[2]], 'Cinq personnes'));
  check(results(r).map((x) => x.outcome).join() === 'sent,sent,skipped,skipped,skipped', 'déjà 48 : deux e-mails partent, trois sont arrêtés');
  check(results(r).slice(2).every((x) => x.reason === 'limite' && x.message === 'Limite quotidienne atteinte (50). Réessayez demain.'), '…avec le message exact du plafond');
  check(w.mailbox.length === 2 && r.body.used === 50 && r.body.remaining === 0, 'compteur 50/50, 2 e-mails');
  const r2 = await handleStaffEmail(deps, ADMIN, message([crowd[3]], 'Après le plafond'));
  check(r2.status === 429 && r2.body.error === 'Limite quotidienne atteinte (50). Réessayez demain.' && w.mailbox.length === 2, 'plafond atteint : 429, message exact, rien de plus ne part');
  await db.close();
}
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  const crowd = addUsers(w, 60);
  const calls = Array.from({ length: 12 }, (_, k) => handleStaffEmail(deps, ADMIN, message(crowd.slice((k * 5) % 50, ((k * 5) % 50) + 10), `Rafale numéro ${k}`)));
  const rs = await Promise.all(calls);
  const rows = await logRows(db);
  check(w.mailbox.length === 50, `12 demandes simultanées de 10 personnes : exactement 50 e-mails partis (obtenu ${w.mailbox.length})`);
  check(rows.filter((x) => x.status !== 'failed').length === 50, 'le journal réel compte 50 lignes, pas une de plus');
  check(rs.some((r) => results(r).some((x) => x.reason === 'limite')), 'les suivants ont reçu « Limite quotidienne atteinte »');
  check(rows.every((x) => x.status === 'sent'), 'toutes les places prises ont été terminées (« sent »), aucune restée « reserved »');
  await db.close();
}

// ═══ Échecs de transport ════════════════════════════════════════════════════
section('Transport : non envoyé rend la place, incertain la garde, jamais de renvoi');
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  w.transport = () => ({ outcome: 'failed', code: 'refus-service' });
  const a = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Premier'));
  check(results(a)[0].outcome === 'failed' && a.body.used === 0 && w.sendCalls === 1, 'refus du service : « non envoyé », place rendue, un seul essai');
  let rows = await logRows(db);
  check(rows.length === 1 && rows[0].status === 'failed' && rows[0].reason === 'refus-service' && rows[0].finished_at, 'journal : failed + code court + heure de fin');
  w.transport = () => ({ outcome: 'uncertain', code: 'reseau' });
  const b = await handleStaffEmail(deps, ADMIN, message([NINA], 'Second'));
  check(results(b)[0].outcome === 'uncertain' && b.body.used === 1, 'réponse perdue : « incertain », la place est gardée');
  rows = await logRows(db);
  check(rows.map((x) => x.status).join() === 'failed,uncertain', 'journal : failed puis uncertain');
  const c = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Premier'));
  check(results(c)[0].outcome === 'uncertain' && w.sendCalls === 3, 'après un REFUS on peut recommencer tout de suite (pas un doublon) ; toujours un seul essai par demande');
  await db.close();
}

// ═══ Désabonnés ═════════════════════════════════════════════════════════════
section('Désabonnés : jamais écrits, pas de ligne au journal');
{
  const db = await newDb(); const w = makeWorld(); const deps = sqlDeps(db, w);
  const r = await handleStaffEmail(deps, ADMIN, message([SARA], 'Message important'));
  check(results(r)[0].reason === 'desabonne' && w.sendCalls === 0 && (await logRows(db)).length === 0, 'message à UNE personne désabonnée : bloqué, aucune ligne au journal, aucun envoi');
  check(results(r)[0].message.includes('contactez-la autrement'), '…avec l’explication');
  await db.close();
}

// ═══ Migration absente ══════════════════════════════════════════════════════
section('Migration pas appliquée : « pas disponible », sans erreur, rien ne part');
{
  const db = await newDb(false); const w = makeWorld(); const deps = sqlDeps(db, w);
  const e = await handleStaffEmail(deps, ADMIN, { action: 'etat' });
  check(e.status === 200 && e.body.available === false, 'état : 200 { available: false } (la vraie base répond « fonction inconnue », code 42883)');
  const s = await handleStaffEmail(deps, ADMIN, message([LUCAS], 'Bonjour'));
  check(s.status === 503 && s.body.available === false && w.sendCalls === 0, 'envoi : 503, rien ne part');
  await db.close();
}

console.log(`\n${ok} vérifications réussies, ${ko} échec(s).`);
process.exit(ko ? 1 : 0);
