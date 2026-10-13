// Lot 19 — E-MAILS DU BUREAU : le journal, le plafond du jour, les désabonnements des
// nouvelles familles, rejoués POUR DE VRAI sur un Postgres jetable en mémoire (PGlite).
// Jamais sur une vraie base.
//
//   Une fois :  mkdir -p /tmp/pglite-test && cd /tmp/pglite-test && npm i @electric-sql/pglite
//   Puis :      npm run test:emails-db
//
// Ce qui est prouvé :
//   · le fichier : nom = nom d'enregistrement, en-tête (retour arrière, vérification 9 × true,
//     historique), AUCUN des mots DROP / DELETE / TRUNCATE / CASCADE / ON DELETE hors commentaires ;
//   · additif et rejouable (chargé deux fois, rien d'existant ne change) ; droits PAR DÉFAUT de
//     production (tout pour anon / authenticated sur les objets neufs) repris ;
//   · l'ancienne table `email_unsubscribes` garde ses QUATRE familles (et refuse toujours les
//     nouvelles : c'est la raison d'être de la table v2) ;
//   · plafond : jamais dépassé, ni en suites de petites demandes, ni en rafale, ni en une seule
//     grosse demande ; un refus (failed) rend sa place, un incertain la garde ; deux entreprises
//     ont chacune leur compteur ; le jour est celui de Paris ;
//   · doublon : même personne + même contenu en moins d'une minute = une seule place ;
//   · abus : un salarié, un chef d'équipe, un administrateur ARCHIVÉ, l'administrateur d'une
//     AUTRE entreprise et un anonyme ne lisent / n'écrivent / n'appellent rien qu'ils ne doivent ;
//   · le bureau lit le journal de SON entreprise, et lui seul ;
//   · retours arrière (doux, puis complet) décommentés et exécutés, puis rechargement.
// Limite honnête : PGlite n'a qu'UNE connexion. Les appels « simultanés » y sont donc mis en file
// par le moteur ; le verrou de transaction (pg_advisory_xact_lock) est ce qui tient sur un vrai
// serveur, où il se trouve dans le fichier lu ici.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mig = (f) => fs.readFileSync(path.join(here, '..', 'migrations', f), 'utf8');
const MIG_FILE = fs.readdirSync(path.join(here, '..', 'migrations')).find((f) => f.endsWith('_lot19_emails.sql'));
const SQL = mig(MIG_FILE);
const PGLITE_DIR = process.env.PGLITE_DIR || '/tmp/pglite-test';
let PGlite;
try {
  const req = createRequire(path.join(PGLITE_DIR, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`PGlite introuvable dans ${PGLITE_DIR}.\n  mkdir -p ${PGLITE_DIR} && cd ${PGLITE_DIR} && npm i @electric-sql/pglite`);
  process.exit(2);
}

export const CO = 'c0000000-0000-0000-0000-000000000001';
export const CO2 = 'c0000000-0000-0000-0000-000000000002';
export const ADMIN = 'a0000000-0000-0000-0000-00000000000a';
export const ADMIN2 = 'a0000000-0000-0000-0000-00000000000b';   // bureau d'une AUTRE entreprise
export const ARCHIVE = 'a0000000-0000-0000-0000-00000000000c';  // ancien administrateur, archivé
export const LUCAS = '10000000-0000-0000-0000-000000000001';    // salarié
export const NINA = '10000000-0000-0000-0000-000000000002';     // chef d'équipe
export const SUPPORT = '5a000000-0000-0000-0000-000000000001';  // compte support BEMEXO (aucune entreprise)

// Bouchon minimal + définitions de PRODUCTION de get_my_company_id() et is_admin() (relues le 02/10/2026).
export const STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.companies (id uuid PRIMARY KEY, name text);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role text,
  is_active boolean DEFAULT true, first_name text, last_name text, email text);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$ SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false LIMIT 1 $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
INSERT INTO public.companies (id, name) VALUES ('${CO}', 'Martin Menuiserie'), ('${CO2}', 'Autre Société');
INSERT INTO public.users (id, company_id, role, is_active, first_name, last_name, email) VALUES
  ('${ADMIN}', '${CO}', 'admin', true, 'Paul', 'Martin', 'paul@example.com'),
  ('${ADMIN2}', '${CO2}', 'admin', true, 'Autre', 'Bureau', 'bureau@example.org'),
  ('${ARCHIVE}', '${CO}', 'admin', false, 'Ancien', 'Admin', 'ancien@example.com'),
  ('${LUCAS}', '${CO}', 'worker', true, 'Lucas', 'Petit', 'lucas@example.com'),
  ('${NINA}', '${CO}', 'lead', true, 'Nina', 'Roux', 'nina@example.com'),
  ('${SUPPORT}', NULL, NULL, true, 'Sup', 'Port', 'support@example.com');
`;
// Droits PAR DÉFAUT de la production : tout objet neuf est ouvert à anon et authenticated.
export const DEFAULT_PRIVS = `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;`;

export const H = (c) => c.repeat(64);             // un « hachage » de 64 caractères hexadécimaux
export const hex = (n) => n.toString(16).padStart(64, '0');
export const item = (n, uid = LUCAS, content = 'a') => ({ user_id: uid, mask: `u${n}***@example.com`, rhash: hex(n), chash: H(content) });

/** Les lignes SQL commentées du fichier entre deux repères (comme les tests des lots 3, 4, 6, 7, 11, 12 et 30). */
export function commentedBlock(sql, startRe, endRe = null) {
  const lines = sql.split('\n');
  let i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return null;
  const out = [];
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (endRe && endRe.test(l)) return out.join('\n');
    if (!endRe && out.length === 0 && !/^-- SELECT\b/.test(l)) continue;
    if (l === '--') out.push('');
    else if (l.startsWith('-- ')) out.push(l.slice(3));
    else return null;
    if (!endRe && /;\s*$/.test(l)) return out.join('\n');
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Le fichier lui-même
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().catch((e) => { console.error(`ERREUR : ${e.message}`); process.exit(1); });

async function main() {
  let ok = 0, ko = 0;
  const check = (c, m) => { if (c) { ok++; console.log(`ok — ${m}`); } else { ko++; console.log(`ÉCHEC — ${m}`); } };
  const section = (t) => console.log(`\n═══ ${t}`);

  section('Le fichier : nom, en-tête, mots interdits');
  const NAME = MIG_FILE.replace(/\.sql$/, '');
  check(/^\d{14}_lot19_emails\.sql$/.test(MIG_FILE) && MIG_FILE > '20261013170000', `fichier ${MIG_FILE} (après la dernière migration du dépôt)`);
  check(SQL.includes(`VALUES ('${NAME.slice(0, 14)}', '${NAME.slice(15)}')`), `l'historique à inscrire porte le nom exact du fichier (${NAME.slice(15)})`);
  check(/RETOUR ARRIÈRE/.test(SQL) && /VÉRIFICATION APRÈS APPLICATION/.test(SQL) && /HISTORIQUE/.test(SQL), 'en-tête : RETOUR ARRIÈRE, VÉRIFICATION, HISTORIQUE');
  const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/--.*$/, '')).join('\n');
  const banned = (code.match(/\b(drop|delete|truncate|cascade)\b/gi) || []).concat(code.match(/on\s+delete/gi) || []);
  check(banned.length === 0, `aucun des mots DROP, DELETE, TRUNCATE, CASCADE, ON DELETE hors commentaires${banned.length ? ` (trouvé : ${banned.join(', ')})` : ''}`);
  check(!/FOR\s+DELETE|ALTER\s+POLICY|\bTRIGGER\b/i.test(code), 'ni règle de suppression, ni ALTER POLICY, ni déclencheur');
  check((code.match(/SECURITY DEFINER/g) || []).length === 3 && (code.match(/SET search_path TO ''/g) || []).length === 3, 'les trois fonctions sont SECURITY DEFINER avec un chemin de recherche vide');
  check(/ENABLE ROW LEVEL SECURITY/.test(code) && (code.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 2, 'RLS activée sur chacune des deux tables neuves');

  const POST_SQL = commentedBlock(SQL, /^-- VÉRIFICATION APRÈS APPLICATION/);
  const ROLLBACK_SOFT = commentedBlock(SQL, /^-- ── DÉBUT DU RETOUR ARRIÈRE ──$/, /^-- ── FIN DU RETOUR ARRIÈRE ──$/);
  const ROLLBACK_FULL = commentedBlock(SQL, /^-- ── DÉBUT DU RETOUR ARRIÈRE COMPLET ──$/, /^-- ── FIN DU RETOUR ARRIÈRE COMPLET ──$/);
  check(!!POST_SQL && !!ROLLBACK_SOFT && !!ROLLBACK_FULL, 'les trois blocs commentés (vérification, retour doux, retour complet) se décommentent');

  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(DEFAULT_PRIVS);
  // Les migrations EXISTANTES dont dépend celle-ci (l'ancienne table des désabonnements), telle quelle,
  // chargée avec les droits par défaut de la production (la clé service a tout sur un objet neuf).
  await db.exec(mig('20260928120000_email_desabonnements.sql'));

  const as = async (uid, role = 'authenticated') => {
    await db.exec('RESET ROLE');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    await db.exec(`SET ROLE ${role}`);
  };
  const root = async () => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`); };
  const asService = () => as('', 'service_role');
  const asAnon = () => as('', 'anon');
  /** Code d'erreur Postgres (ou message) ; null = accepté. */
  const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.code || e.message; } };
  const errExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return `${e.code || ''} ${e.message}`.trim(); } };
  const rows = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => (await rows(sql, p))[0];
  const reserve = async (company, kind, cap, items, by = ADMIN) => (await one(`SELECT public.staff_email_reserve($1, $2, $3, $4, $5::jsonb) AS r`, [company, by, kind, cap, JSON.stringify(items)])).r;
  const used = async (company) => (await one(`SELECT public.staff_email_used_today($1) AS n`, [company])).n;
  const results = (r) => r.items.map((x) => x.result);

  // ═══ Additif et rejouable ═══════════════════════════════════════════════
  section('Migration : additive, rejouable, droits repris');
  const fingerprint = async () => JSON.stringify({
    fn: await rows(`SELECT proname, md5(pg_get_functiondef(oid)) AS d FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname NOT LIKE 'staff_email%' ORDER BY 1`),
    col: await rows(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('companies', 'users', 'email_unsubscribes') ORDER BY 1, 2`),
    con: await rows(`SELECT conrelid::regclass::text AS t, conname, md5(pg_get_constraintdef(oid)) AS d FROM pg_constraint WHERE conrelid IN ('public.companies'::regclass, 'public.users'::regclass, 'public.email_unsubscribes'::regclass) ORDER BY 1, 2`),
    priv: await rows(`SELECT c.relname, r.rolname, has_table_privilege(r.rolname, c.oid, 'SELECT') AS s, has_table_privilege(r.rolname, c.oid, 'INSERT') AS i
      FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('companies', 'users', 'email_unsubscribes') ORDER BY 1, 2`),
  });
  const before = await fingerprint();
  check(await errExec(SQL) === null, 'la migration se charge sans erreur');
  check(await errExec(SQL) === null, 'rechargée une 2e fois, sans erreur (rejouable)');
  check(await fingerprint() === before, 'rien d’existant n’a changé (fonctions, colonnes, contraintes, droits de companies / users / email_unsubscribes)');
  const post = await one(POST_SQL);
  check(Object.keys(post).length === 9 && Object.values(post).every((v) => v === true), `la vérification livrée dit 9 × true (${Object.entries(post).filter(([, v]) => v !== true).map(([k]) => k).join(', ') || 'toutes vraies'})`);
  const pol = await rows(`SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('staff_email_log', 'email_unsubscribes_v2')`);
  check(pol.length === 1 && pol[0].policyname === 'staff_email_log_admin_select' && pol[0].cmd === 'SELECT', 'une seule règle de ligne, en lecture, sur le journal');
  check(await err(`SELECT 1`) === null, 'base saine après chargement');

  // ═══ L'ancienne table garde ses quatre familles ═════════════════════════
  section('Désabonnements : l’ancienne table ne change pas, la v2 prend les nouvelles familles');
  await asService();
  for (const k of ['weekly-digest', 'missing-days', 'cert-expiry', 'budget-alerts']) {
    check(await err(`INSERT INTO public.email_unsubscribes (email, kind) VALUES ('ancien@example.com', $1) ON CONFLICT DO NOTHING`, [k]) === null, `ancienne table : « ${k} » toujours accepté`);
  }
  check(await err(`INSERT INTO public.email_unsubscribes (email, kind) VALUES ('x@example.com', 'planning-hebdo')`) === '23514', 'ancienne table : « planning-hebdo » toujours refusé (CHECK à quatre familles inchangé)');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('lucas@example.com', 'planning-hebdo')`) === null, 'table v2 : « planning-hebdo » accepté');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('lucas@example.com', 'message-bureau')`) === null, 'table v2 : « message-bureau » accepté');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('lucas@example.com', 'une-future-famille')`) === null, 'table v2 : une famille future passe sans toucher à la base (pas de liste fermée)');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('lucas@example.com', 'planning-hebdo') ON CONFLICT (email, kind) DO NOTHING`) === null
    && Number((await one(`SELECT count(*) AS n FROM public.email_unsubscribes_v2 WHERE email = 'lucas@example.com' AND kind = 'planning-hebdo'`)).n) === 1, 'table v2 : se désabonner deux fois = une ligne (comme la fonction email-unsubscribe)');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('Majuscule@Example.com', 'planning-hebdo')`) === '23514', 'table v2 : une adresse en majuscules est refusée (forme minuscule imposée)');
  check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('a@example.com', 'Pas Une Forme; DROP')`) === '23514', 'table v2 : une famille qui n’a pas la forme d’un mot est refusée');
  check(await err(`SELECT 1 FROM public.email_unsubscribes_v2 FOR UPDATE`) === null && await err(`UPDATE public.email_unsubscribes_v2 SET created_at = created_at`) === null, 'la clé service lit et met à jour');
  // Fermée au navigateur.
  for (const [who, setup] of [['salarié', () => as(LUCAS)], ['chef d’équipe', () => as(NINA)], ['administrateur', () => as(ADMIN)], ['anonyme', () => asAnon()]]) {
    await setup();
    check(await err(`SELECT * FROM public.email_unsubscribes_v2`) === '42501', `${who} : la liste des désabonnés est illisible`);
    check(await err(`INSERT INTO public.email_unsubscribes_v2 (email, kind) VALUES ('z@example.com', 'planning-hebdo')`) === '42501', `${who} : ne peut pas désabonner quelqu’un d’autre`);
  }

  // ═══ Le plafond ═════════════════════════════════════════════════════════
  section('Plafond : jamais dépassé');
  await asService();
  const r1 = await reserve(CO, 'planning-hebdo', 5, [item(1), item(2), item(3)]);
  check(JSON.stringify(results(r1)) === '["reserved","reserved","reserved"]' && r1.used_before === 0 && r1.used_after === 3, 'trois places prises sur cinq');
  check(r1.items.every((x) => /^[0-9a-f-]{36}$/.test(x.id)), 'chaque place porte l’identifiant de sa ligne du journal');
  const r2 = await reserve(CO, 'planning-hebdo', 5, [item(4), item(5), item(6), item(7)]);
  check(JSON.stringify(results(r2)) === '["reserved","reserved","cap","cap"]' && r2.used_after === 5, 'la 6e et la 7e sont arrêtées par le plafond (5)');
  check(r2.items.slice(2).every((x) => x.id === null), 'une place refusée n’a pas de ligne dans le journal');
  check(await used(CO) === 5, 'le compteur du jour dit 5');
  const r3 = await reserve(CO, 'message-bureau', 5, [item(8)]);
  check(results(r3)[0] === 'cap', 'le plafond est COMMUN aux deux familles (planning + message)');
  check(await used(CO2) === 0 && results(await reserve(CO2, 'planning-hebdo', 5, [item(1)]))[0] === 'reserved', 'une autre entreprise a son propre compteur (même destinataire, même contenu : autre entreprise = autre ligne)');
  // un refus rend la place, un incertain la garde
  const placeId = r2.items[0].id;
  check(await one(`SELECT public.staff_email_finish($1, $2, 'failed', 'refus-service') AS ok`, [placeId, CO]).then((x) => x.ok) === true, 'staff_email_finish : une place passe à « failed »');
  check(await used(CO) === 4, 'un envoi refusé (rien n’est parti) rend sa place : 4');
  const r4 = await reserve(CO, 'planning-hebdo', 5, [item(9)]);
  check(results(r4)[0] === 'reserved' && r4.used_after === 5, 'la place rendue est reprise par quelqu’un d’autre');
  const uncertainId = r4.items[0].id;
  await one(`SELECT public.staff_email_finish($1, $2, 'uncertain', 'reseau') AS ok`, [uncertainId, CO]);
  check(await used(CO) === 5 && results(await reserve(CO, 'planning-hebdo', 5, [item(10)]))[0] === 'cap', 'un envoi incertain (peut-être parti) GARDE sa place');
  // la fin d'une place ne se rejoue pas, ne sort pas de son entreprise
  check(await one(`SELECT public.staff_email_finish($1, $2, 'sent') AS ok`, [placeId, CO]).then((x) => x.ok) === false, 'une place déjà terminée ne change plus');
  check(await one(`SELECT public.staff_email_finish($1, $2, 'sent') AS ok`, [r1.items[0].id, CO2]).then((x) => x.ok) === false, 'une place ne se termine pas depuis une AUTRE entreprise');
  check(await err(`SELECT public.staff_email_finish($1, $2, 'envoye')`, [r1.items[0].id, CO]) !== null, 'un statut inconnu est refusé');
  await one(`SELECT public.staff_email_finish($1, $2, 'sent', 'Texte libre avec le contenu du message !') AS ok`, [r1.items[0].id, CO]);
  check((await one(`SELECT reason FROM public.staff_email_log WHERE id = $1`, [r1.items[0].id])).reason === null, 'un motif qui n’est pas un code court est écarté (jamais de texte libre dans le journal)');

  section('Plafond : en rafale');
  await root(); await db.exec(`UPDATE public.staff_email_log SET day = day - 1`); // repartir de zéro (hier ne compte plus)
  await asService();
  check(await used(CO) === 0, 'le jour de Paris change : les envois d’hier ne comptent plus');
  // 60 demandes d'UNE personne, lancées ensemble, plafond 50.
  const burst = await Promise.all(Array.from({ length: 60 }, (_, i) => reserve(CO, 'message-bureau', 50, [item(1000 + i, LUCAS, 'b')])));
  const got = burst.filter((r) => results(r)[0] === 'reserved').length;
  check(got === 50 && burst.filter((r) => results(r)[0] === 'cap').length === 10, `60 demandes lancées ensemble, plafond 50 : exactement 50 places (obtenu ${got})`);
  check(await used(CO) === 50 && Number((await one(`SELECT count(*) AS n FROM public.staff_email_log WHERE company_id = $1 AND day = (now() AT TIME ZONE 'Europe/Paris')::date`, [CO])).n) === 50, 'le journal compte 50 lignes du jour, pas une de plus');
  const rest = await reserve(CO, 'planning-hebdo', 50, Array.from({ length: 5 }, (_, i) => item(2000 + i)));
  check(results(rest).every((x) => x === 'cap'), 'ensuite, tout est refusé : « Limite quotidienne atteinte »');
  // une seule grosse demande (200 lignes)
  await root(); await db.exec(`UPDATE public.staff_email_log SET day = day - 1`); await asService();
  const big = await reserve(CO, 'planning-hebdo', 50, Array.from({ length: 120 }, (_, i) => item(3000 + i, LUCAS, 'c')));
  check(results(big).filter((x) => x === 'reserved').length === 50 && results(big).filter((x) => x === 'cap').length === 70, 'une demande de 120 : 50 places, 70 refus');
  // Des demandes simultanées de plusieurs lignes chacune.
  await root(); await db.exec(`UPDATE public.staff_email_log SET day = day - 1`); await asService();
  const par = await Promise.all(Array.from({ length: 12 }, (_, k) => reserve(CO, 'planning-hebdo', 50, Array.from({ length: 7 }, (_, i) => item(4000 + k * 10 + i, LUCAS, 'd')))));
  const total = par.reduce((n, r) => n + results(r).filter((x) => x === 'reserved').length, 0);
  check(total === 50 && await used(CO) === 50, `12 demandes de 7 lignes lancées ensemble : 50 places au total (obtenu ${total})`);

  section('Doublons : même personne, même contenu, moins d’une minute');
  await root(); await db.exec(`UPDATE public.staff_email_log SET day = day - 1`); await asService();
  const d1 = await reserve(CO, 'message-bureau', 50, [item(1, LUCAS, '1')]);
  const d2 = await reserve(CO, 'message-bureau', 50, [item(1, LUCAS, '1')]);
  check(results(d1)[0] === 'reserved' && results(d2)[0] === 'duplicate', 'deux clics : une seule place, le second est un doublon');
  check(results(await reserve(CO, 'message-bureau', 50, [item(1, LUCAS, '2')]))[0] === 'reserved', 'même personne, AUTRE contenu : accepté');
  check(results(await reserve(CO, 'message-bureau', 50, [item(2, LUCAS, '1')]))[0] === 'reserved', 'autre personne, même contenu : accepté');
  const d3 = await reserve(CO, 'message-bureau', 50, [item(7, LUCAS, '3'), item(7, LUCAS, '3')]);
  check(JSON.stringify(results(d3)) === '["reserved","duplicate"]', 'dans une même demande aussi : la même personne deux fois = une place');
  await root(); await db.exec(`UPDATE public.staff_email_log SET created_at = now() - interval '2 minutes' WHERE content_hash = '${H('1')}'`); await asService();
  check(results(await reserve(CO, 'message-bureau', 50, [item(1, LUCAS, '1')]))[0] === 'reserved', 'plus d’une minute plus tard : accepté de nouveau');
  const dupFail = await reserve(CO, 'message-bureau', 50, [item(55, LUCAS, 'f')]);
  await one(`SELECT public.staff_email_finish($1, $2, 'failed', 'refus-service')`, [dupFail.items[0].id, CO]);
  check(results(await reserve(CO, 'message-bureau', 50, [item(55, LUCAS, 'f')]))[0] === 'reserved', 'après un REFUS (rien n’est parti), on peut recommencer tout de suite');
  check(await one(`SELECT count(*)::int AS n FROM public.staff_email_log WHERE company_id = $1 AND recipient_hash = $2 AND content_hash = $3`, [CO2, hex(1), H('1')]).then((x) => x.n) === 0, 'les doublons ne se voient pas d’une entreprise à l’autre');

  section('Paramètres invalides : refusés sans rien écrire');
  const n0 = (await one(`SELECT count(*)::int AS n FROM public.staff_email_log`)).n;
  const bad = async (label, args) => check(await err(`SELECT public.staff_email_reserve($1, $2, $3, $4, $5::jsonb)`, args) !== null, `refusé : ${label}`);
  await bad('famille qui n’a pas la forme d’un mot', [CO, ADMIN, 'Planning; --', 5, '[]']);
  await bad('plafond nul', [CO, ADMIN, 'planning-hebdo', 0, '[]']);
  await bad('plafond démesuré', [CO, ADMIN, 'planning-hebdo', 100000, '[]']);
  await bad('liste qui n’en est pas une', [CO, ADMIN, 'planning-hebdo', 5, '{}']);
  await bad('empreinte trop courte', [CO, ADMIN, 'planning-hebdo', 5, JSON.stringify([{ user_id: LUCAS, mask: 'a***@b.fr', rhash: 'abc', chash: H('a') }])]);
  await bad('empreinte qui n’est pas en hexadécimal', [CO, ADMIN, 'planning-hebdo', 5, JSON.stringify([{ user_id: LUCAS, mask: 'a***@b.fr', rhash: 'z'.repeat(64), chash: H('a') }])]);
  await bad('destinataire masqué vide', [CO, ADMIN, 'planning-hebdo', 5, JSON.stringify([{ user_id: LUCAS, mask: '', rhash: hex(1), chash: H('a') }])]);
  await bad('identifiant de salarié qui n’en est pas un', [CO, ADMIN, 'planning-hebdo', 5, JSON.stringify([{ user_id: 'pas-un-uuid', mask: 'a***@b.fr', rhash: hex(1), chash: H('a') }])]);
  await bad('plus de 200 lignes', [CO, ADMIN, 'planning-hebdo', 5, JSON.stringify(Array.from({ length: 201 }, (_, i) => item(i)))]);
  check((await one(`SELECT count(*)::int AS n FROM public.staff_email_log`)).n === n0, 'aucune ligne écrite par ces refus (la demande est annulée en bloc)');
  check(results(await reserve(CO, 'planning-hebdo', 50, [{ ...item(88), user_id: null }]))[0] === 'reserved', 'un destinataire sans identifiant interne reste permis (user_id facultatif)');

  // ═══ Le journal : ce qu'il contient et ce qu'il ne contient pas ═════════
  section('Journal : masqué, haché, jamais le contenu');
  const cols = (await rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff_email_log' ORDER BY 1`)).map((x) => x.column_name);
  check(!cols.some((c) => /body|text|message|content$|html|subject|attachment|pdf|email$|address/i.test(c)), `aucune colonne ne peut porter un texte, un sujet, une pièce jointe ou une adresse complète (${cols.join(', ')})`);
  const sample = await one(`SELECT * FROM public.staff_email_log WHERE company_id = $1 LIMIT 1`, [CO]);
  check(!/@.*\./.test(Object.values(sample).filter((v) => typeof v === 'string' && v !== sample.recipient_mask).join(' ')) && /\*\*\*@/.test(sample.recipient_mask), 'le destinataire est masqué (« u1***@example.com ») ; le reste n’est que des empreintes et des identifiants');
  check(await err(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash, status) VALUES ($1, 'planning-hebdo', 'a***@b.fr', $2, $2, 'envoye')`, [CO, hex(9)]) === '23514', 'un statut hors liste est refusé');
  check(await err(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash, reason) VALUES ($1, 'planning-hebdo', 'a***@b.fr', $2, $2, 'Le texte du message du bureau')`, [CO, hex(9)]) === '23514', 'un motif en texte libre est refusé par la base elle-même');
  check(await err(`UPDATE public.staff_email_log SET status = 'sent'`) === null, 'la clé service met à jour le journal');
  check(await err(`DELETE FROM public.staff_email_log`) === '42501' && await err(`TRUNCATE public.staff_email_log`) === '42501', 'même la clé service ne peut ni effacer ni vider le journal');
  check(await err(`DELETE FROM public.email_unsubscribes_v2`) === '42501', 'ni la liste des désabonnés');

  // ═══ Abus ═══════════════════════════════════════════════════════════════
  section('Abus : qui lit, qui écrit, qui appelle');
  const total_co = Number((await (async () => { await root(); return one(`SELECT count(*) AS n FROM public.staff_email_log WHERE company_id = $1`, [CO]); })()).n);
  await root(); await db.exec(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash, status, sent_by) VALUES ('${CO2}', 'message-bureau', 'o***@example.org', '${hex(77)}', '${H('e')}', 'sent', '${ADMIN2}')`);
  const total_co2 = Number((await one(`SELECT count(*) AS n FROM public.staff_email_log WHERE company_id = $1`, [CO2])).n);
  check(total_co > 5 && total_co2 >= 2, `jeu d’essai : ${total_co} lignes pour l’entreprise 1, ${total_co2} pour l’entreprise 2`);
  await as(ADMIN);
  const mine = await rows(`SELECT DISTINCT company_id FROM public.staff_email_log`);
  check(mine.length === 1 && mine[0].company_id === CO, 'le bureau lit le journal de SON entreprise, et seulement celui-là');
  check(Number((await one(`SELECT count(*) AS n FROM public.staff_email_log`)).n) === total_co, `…toutes ses lignes (${total_co}), aucune de l’autre entreprise`);
  check(await err(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash) VALUES ($1, 'planning-hebdo', 'a***@b.fr', $2, $2)`, [CO, hex(5)]) === '42501', 'le bureau ne peut pas écrire dans le journal (ni inventer un envoi)');
  check(await err(`UPDATE public.staff_email_log SET status = 'failed'`) === '42501', 'ni changer un résultat pour libérer des places du plafond');
  check(await err(`SELECT public.staff_email_reserve($1, $2, 'planning-hebdo', 50, '[]')`, [CO, ADMIN]) === '42501', 'ni appeler staff_email_reserve (le plafond ne se contourne pas depuis le navigateur)');
  check(await err(`SELECT public.staff_email_finish($1, $2, 'sent')`, [uncertainId, CO]) === '42501', 'ni staff_email_finish');
  check(await err(`SELECT public.staff_email_used_today($1)`, [CO]) === '42501', 'ni staff_email_used_today');
  await as(ADMIN2);
  const other = await rows(`SELECT DISTINCT company_id FROM public.staff_email_log`);
  check(other.length === 1 && other[0].company_id === CO2, 'le bureau d’une AUTRE entreprise ne voit que le sien');
  for (const [who, uid] of [['salarié', LUCAS], ['chef d’équipe', NINA], ['administrateur ARCHIVÉ', ARCHIVE], ['compte support BEMEXO', SUPPORT]]) {
    await as(uid);
    check(await err(`SELECT 1 FROM public.staff_email_log`) === null && Number((await one(`SELECT count(*) AS n FROM public.staff_email_log`)).n) === 0, `${who} : le journal est vide pour lui (aucune ligne lisible)`);
    check(await err(`INSERT INTO public.staff_email_log (company_id, kind, recipient_mask, recipient_hash, content_hash) VALUES ($1, 'planning-hebdo', 'a***@b.fr', $2, $2)`, [CO, hex(6)]) === '42501', `${who} : ne peut pas écrire dans le journal`);
    check(await err(`SELECT public.staff_email_reserve($1, $2, 'planning-hebdo', 50, '[]')`, [CO, uid]) === '42501', `${who} : ne peut pas prendre de place du plafond`);
  }
  await asAnon();
  check(await err(`SELECT * FROM public.staff_email_log`) === '42501', 'anonyme : le journal est fermé');
  check(await err(`SELECT public.staff_email_reserve($1, $2, 'planning-hebdo', 50, '[]')`, [CO, ADMIN]) === '42501', 'anonyme : staff_email_reserve est fermée');
  check(await err(`SELECT public.staff_email_finish($1, $2, 'sent')`, [uncertainId, CO]) === '42501', 'anonyme : staff_email_finish est fermée');
  check(await err(`SELECT public.staff_email_used_today($1)`, [CO]) === '42501', 'anonyme : staff_email_used_today est fermée');
  await root();

  // ═══ Retours arrière ════════════════════════════════════════════════════
  section('Retours arrière (décommentés puis exécutés), puis rechargement');
  const nFns = async () => Number((await one(`SELECT count(*) AS n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'staff_email%'`)).n);
  const hasTable = async (t) => (await one(`SELECT to_regclass('public.${t}') IS NOT NULL AS ok`)).ok;
  const logRows = Number((await one(`SELECT count(*) AS n FROM public.staff_email_log`)).n);
  check(await errExec(ROLLBACK_SOFT) === null && await nFns() === 0, 'retour DOUX : les trois fonctions disparaissent');
  check(await hasTable('staff_email_log') && await hasTable('email_unsubscribes_v2') && Number((await one(`SELECT count(*) AS n FROM public.staff_email_log`)).n) === logRows, `…le journal (${logRows} lignes) et la liste des désabonnés sont GARDÉS`);
  check(await errExec(SQL) === null && await nFns() === 3, 'la migration rechargée remet les fonctions');
  check(Object.values(await one(POST_SQL)).every((v) => v === true), '…et la vérification redit 9 × true');
  check(Number((await one(`SELECT count(*) AS n FROM public.staff_email_log`)).n) === logRows, '…sans toucher aux lignes du journal');
  check(await errExec(ROLLBACK_FULL) === null && await nFns() === 0 && !(await hasTable('staff_email_log')) && !(await hasTable('email_unsubscribes_v2')), 'retour COMPLET : fonctions et deux tables disparaissent');
  check(await hasTable('email_unsubscribes') && Number((await one(`SELECT count(*) AS n FROM public.email_unsubscribes`)).n) === 4, 'l’ancienne table des désabonnements (quatre familles) n’est PAS touchée par le retour complet');
  check(await fingerprint() === before, 'après le retour complet : tout ce qui existait avant est identique (fonctions, colonnes, contraintes, droits)');
  check(await errExec(SQL) === null && await nFns() === 3 && Object.values(await one(POST_SQL)).every((v) => v === true), 'rechargée après le retour complet : tout est revenu, 9 × true');

  console.log(`\n${ok} vérifications réussies, ${ko} échec(s).`);
  await db.close();
  process.exit(ko ? 1 : 0);
}
