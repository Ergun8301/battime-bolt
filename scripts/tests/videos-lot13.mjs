// Vidéos de formation : envoi direct (lot 13, oct. 2026), sur les VRAIES pages :
// « Formations » du bureau (/admin) et l'appli du salarié (/poseur). Une base
// simulée partagée par les navigateurs (aucune vraie base, aucun e-mail :
// send-push est simulé et compté). Horloge figée au mercredi 14 octobre 2026,
// 10:00 à Paris. Noms fictifs.
//
// Lancer : npm run build, puis
//   node scripts/tests/videos-lot13.mjs out docs/captures-videos [port]
// Captures « avant » (build de la base, captures et textes seulement) :
//   AVANT=1 node scripts/tests/videos-lot13.mjs <build d'avant> docs/captures-videos [port]
// (playwright-core doit être résoluble ; openssl sert à fabriquer un
// certificat de test jetable.)
//
// L'ENVOI EST RÉEL : le XHR part sur une vraie connexion vers un faux serveur
// de stockage local (HTTPS, certificat jetable ; le navigateur résout le nom
// du projet Supabase vers 127.0.0.1) qui lit le corps petit à petit. La barre
// de progression suit donc de vrais octets ; « Annuler » coupe un vrai envoi ;
// « réseau coupé » ferme vraiment la connexion. Le port HTTPS = port + 1.
//
// La base simulée a deux états (variable MIG) :
//   'non'  migration 20261011160000 pas appliquée : training_videos → 404
//          PGRST205, les fonctions du lot → 404 PGRST202. Tout doit être
//          EXACTEMENT comme avant (comparé aux textes du build d'avant).
//   'oui'  migration appliquée : règles du SQL rejouées ici
//          (supabase/tests/lot13_videos_envoi_direct.mjs les prouve sur un vrai Postgres).
//
//   V0 sans migration : pas d'option vidéo, textes identiques au build d'avant ; une seule lecture en échec
//   V1 la liste mélange liens, documents et vidéos envoyées (« Vidéo · 2 min 10 · 38 Mo »)
//   V2 formulaire simplifié : rangée « Filmer · Fichier · Lien · Document » (≥ 44 px), aucun texte d'aide, jauge cachée sous 80 %, jamais de « Filmer » natif sur PC
//   V3 refus clairs AVANT tout envoi : > 50 Mo, PDF ; aucune écriture
//   V4 fichier choisi : aperçu, durée, taille ; réserver → URL signée → XHR → publier ; notification
//   V5 barre de progression réelle ; « Annuler l'envoi » ; la même place est reprise
//   V6 réseau coupé : message clair, rien de publié ; « Ajouter » de nouveau : ça part
//   V7 la base refuse le quota même si l'écran l'a laissé passer (garde serveur)
//   V8 quota plein : message « Plus assez de place », rien ne s'ouvre ; le lien YouTube reste possible
//   V9 « Regarder » (bureau) ; « Retirer » (le fichier est gardé) ; « Remettre »
//   W1 salarié : la vidéo dans la liste ; rien n'est signé avant « Regarder »
//   W2 « Regarder » : lecteur intégré <video controls preload="metadata">, lien signé à l'ouverture
//   W3 lien expiré : re-signé une fois et la lecture reprend ; sinon message clair
//   W4 « Vue » : set_training_video_seen (jamais set_training_seen) ; « Annuler »
//   R  animations réduites : aucune transition sur les barres
//   X1 un envoi arrivé mais jamais publié : montré au bureau (« Envoi non terminé »), gardé, compté
//   X2 au plus 3 nouvelles places par tranche de 3 h : message clair, rien n'est envoyé
//   T  téléphone de 360 px : bureau (envoi non terminé, aperçu) et salarié, sans défilement horizontal
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process'; import crypto from 'node:crypto';
import { ouvrirMenuCompte } from './navigation-salarie.mjs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-videos', PORT = '48200'] = process.argv;
const HTTPS_PORT = Number(PORT) + 1;
const AVANT = process.env.AVANT === '1';
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'videos-lot13-'));
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));

// ─── Horloge figée : mercredi 14 octobre 2026, 10:00 (Paris) ──────────────────
const NOW = new Date('2026-10-14T10:00:00+02:00');
const TODAY = '2026-10-14';
const MO = 1024 * 1024;
const MAXB = 50 * MO, QUOTA = 100 * MO;
const MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const ADMIN = 'u-admin', SAM = 'u-sam', ALEX = 'u-alex', CHLOE = 'u-chloe', DINA = 'u-dina';
const TEAM = [ALEX, CHLOE, DINA, SAM];
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: 'Fenêtres', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true };
const WS = { w1: W1, w2: W2 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [u(ADMIN, 'Admin', 'Test', 'admin'), u(ALEX, 'Alex', 'Exemple'), u(CHLOE, 'Chloé', 'Démo', 'lead'), u(DINA, 'Dina', 'Essai'), u(SAM, 'Sam', 'Test'),
  u('u-ancien', 'Ancien', 'Test', 'worker', { is_active: false }), u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 })];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const slot = (id, user_id, date, w, start, end) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: ADMIN, created_at: '2026-10-01T06:00:00Z' });
const PLANNING = [slot('p-s3', SAM, TODAY, W1, '08:00:00', '12:00:00'), slot('p-a3', ALEX, TODAY, W2, '13:30:00', '17:00:00')];
const DOCS = [{ id: 'd-livret', company_id: CO, worksite_id: 'w1', uploaded_by: ADMIN, label: 'Livret sécurité', file_path: `${CO}/w1/d-livret.bin`, file_name: 'livret.pdf', mime_type: 'application/pdf', size_bytes: 1000, created_at: '2026-10-09T09:00:00Z', work_date: null, time_entry_id: null, photo_no: null, category: null }];
const tr = (id, title, extra = {}) => ({ id, company_id: CO, title, kind: 'video', video_url: null, document_id: null, all_team: true, assignee_ids: [], created_by: ADMIN, created_at: '2026-10-10T08:00:00Z', archived_at: null, ...extra });
const TRAININGS = [
  tr('t-gestes', 'Gestes et postures', { video_url: 'https://vimeo.com/123456', created_at: '2026-10-12T08:00:00Z' }),
  tr('t-livret', 'Livret sécurité chantier', { kind: 'document', document_id: 'd-livret', created_at: '2026-10-09T08:00:00Z' }),
];
const VID_PATH = `${CO}/0f0e0d0c-0b0a-4909-8807-060504030201`;
const vid = (id, title, extra = {}) => ({ id, company_id: CO, title, all_team: true, assignee_ids: [], file_path: `${CO}/${id}`, mime_type: 'video/webm', declared_bytes: 38 * MO, size_bytes: 38 * MO,
  duration_s: 130, created_by: ADMIN, created_at: '2026-10-13T07:50:00Z', reserved_at: '2026-10-13T07:50:00Z', published_at: '2026-10-13T08:00:00Z', archived_at: null, archived_by: null, ...extra });
const VIDEOS = [vid('0f0e0d0c-0b0a-4909-8807-060504030201', 'Montage de l’échafaudage')];
let MIG = 'oui';
let pushSent = 1;
let UP_MODE = 'normal'; // 'normal' | 'hold' | 'cut'
let holdRelease = null;
let MEDIA_FAIL = 0; // les N prochaines lectures du fichier échouent (lien expiré)
let PUBLISH_FAIL = 0; // les N prochaines publications échouent (réseau coupé après l'arrivée du fichier)
let LIMITS_LIE = null; // la jauge affiche moins que la vérité (pour prouver la garde de la base)
let limitsReads = 0; let lastLimits = null; // lectures de la jauge servies, et la dernière réponse (la jauge n'est visible qu'à partir de 80 %)
let VIDEO_BYTES = Buffer.alloc(0); // une vraie petite vidéo WebM (fabriquée au début)
const D = {};
const OBJ = new Map(); // stockage « formations » : chemin → { size, mime, bytes }
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: PLANNING.map((x) => ({ ...x })), time_entries: [], active_sessions: [], documents: DOCS.map((x) => ({ ...x })),
    trainings: TRAININGS.map((x) => ({ ...x, assignee_ids: [...x.assignee_ids] })), training_views: [{ training_id: 't-gestes', user_id: ALEX, company_id: CO, seen_at: '2026-10-12T12:32:00Z' }],
    training_videos: VIDEOS.map((x) => ({ ...x, assignee_ids: [...x.assignee_ids] })),
    training_video_views: [{ video_id: VIDEOS[0].id, user_id: ALEX, company_id: CO, seen_at: '2026-10-13T12:00:00Z', undone_at: null }],
    user_payroll: [], invitations: [], month_closures: [], user_closures: [], leave_requests: [], push_subscriptions: [], kiosks: [],
    day_tasks: [], task_templates: [], meetings: [], meeting_participants: [],
  });
  OBJ.clear();
  OBJ.set(VID_PATH, { size: 38 * MO, mime: 'video/webm', bytes: null });
  UP_MODE = 'normal'; MEDIA_FAIL = 0; LIMITS_LIE = null; PUBLISH_FAIL = 0;
};
freshDb();
const LOT13_TABLES = new Set(['training_videos', 'training_video_views']);
const LOT13_FNS = new Set(['my_training_videos', 'set_training_video_seen', 'training_video_limits', 'start_training_video', 'publish_training_video', 'set_training_video_archived', 'training_video_leftovers']);
const EMAIL_FNS = ['invite-worker', 'weekly-digest', 'send-payroll-export', 'cert-expiry-alerts', 'send-email', 'send-reminder-email'];
const userOf = (id) => D.users.find((x) => x.id === id);
const isAdmin = (uid) => userOf(uid)?.role === 'admin' && userOf(uid)?.is_active !== false;
const teamMember = (id) => { const x = userOf(id); return !!x && x.company_id === CO && x.is_active !== false && ['worker', 'lead'].includes(x.role); };

// ─── Les règles du SQL, rejouées ──────────────────────────────────────────────
class Refus extends Error { constructor(message, code = 'P0001', status = 400) { super(message); this.code = code; this.status = status; } }
let idSeq = 0;
const stamp = () => new Date(NOW.getTime() + (++idSeq) * 1000).toISOString();
const nowSim = () => new Date(NOW.getTime() + idSeq * 1000);
/** Le temps passe : toutes les places ont été réservées il y a `ms` de plus. */
const ageAll = (ms) => { for (const v of D.training_videos) v.reserved_at = new Date(Date.parse(v.reserved_at) - ms).toISOString(); };
const WINDOW_MS = 3 * 3600 * 1000;
const inWindow = (v) => v.reserved_at > new Date(nowSim().getTime() - WINDOW_MS).toISOString();
const visible = (t, uid, rows) => {
  if (t === 'trainings' || t === 'training_videos') return rows.filter((x) => x.company_id === CO && isAdmin(uid));
  if (t === 'training_views' || t === 'training_video_views') return rows.filter((x) => x.company_id === CO && (isAdmin(uid) || x.user_id === uid));
  if (t === 'documents') return rows.filter((x) => x.company_id === CO);
  return rows;
};
const docOf = (t) => (t.document_id ? D.documents.find((d) => d.id === t.document_id && d.company_id === t.company_id) || null : null);
function myTrainings(uid) {
  const me = userOf(uid);
  if (!me || me.company_id !== CO || !['worker', 'lead'].includes(me.role)) return [];
  return D.trainings.filter((t) => !t.archived_at && (t.all_team || t.assignee_ids.includes(uid)) && (t.kind === 'video' || docOf(t))).map((t) => {
    const d = docOf(t); const v = D.training_views.find((x) => x.training_id === t.id && x.user_id === uid);
    return { id: t.id, title: t.title, kind: t.kind, video_url: t.video_url, document_name: d ? (d.label || d.file_name) : null, document_path: d?.file_path ?? null, document_mime: d?.mime_type ?? null, created_at: t.created_at, seen_at: v?.seen_at ?? null };
  });
}
const usage = (except = null) => {
  let stored = 0; for (const [p, o] of OBJ) if (p.startsWith(`${CO}/`)) stored += o.size;
  const reserved = D.training_videos.filter((v) => v.id !== except && !v.published_at && inWindow(v) && !OBJ.has(v.file_path)).reduce((a, v) => a + v.declared_bytes, 0);
  return { stored, reserved };
};
function limitsOf(uid) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  const x = usage();
  if (LIMITS_LIE != null) return [{ max_file_bytes: MAXB, quota_bytes: QUOTA, used_bytes: LIMITS_LIE, reserved_bytes: 0 }];
  return [{ max_file_bytes: MAXB, quota_bytes: QUOTA, used_bytes: x.stored, reserved_bytes: x.reserved }];
}
function startVideo(uid, b) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  const title = String(b.p_title || '').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > 120) throw new Refus('Titre : 2 à 120 caractères.', '22023');
  if (!MIMES.includes(b.p_mime)) throw new Refus('Format refusé : une vidéo MP4, MOV ou WebM.', '22023');
  if (!(b.p_size > 0)) throw new Refus('Ce fichier est vide.', '22023');
  if (b.p_size > MAXB) throw new Refus('Vidéo trop lourde : 50 Mo maximum.', '22023');
  let ids = [];
  if (b.p_all_team === false) {
    ids = Array.from(new Set((b.p_assignee_ids || []).filter(Boolean))).sort();
    if (!ids.length) throw new Refus('Choisissez au moins un salarié.', '22023');
    if (ids.some((id) => !teamMember(id))) throw new Refus('Salarié introuvable dans votre entreprise.', '42501');
  }
  if (D.training_videos.some((v) => v.created_by !== uid && !v.published_at && inWindow(v) && !OBJ.has(v.file_path))) throw new Refus('Une autre vidéo est en cours d\'envoi dans votre entreprise. Réessayez dans quelques minutes.');
  let slot = D.training_videos.find((v) => v.created_by === uid && !v.published_at && !v.archived_at);
  const fields = { title, all_team: b.p_all_team !== false, assignee_ids: ids, mime_type: b.p_mime, declared_bytes: b.p_size, duration_s: b.p_duration ?? null, reserved_at: stamp() };
  let closing = null; // fermée seulement si la suite passe (en SQL, un refus annule tout)
  if (slot && OBJ.has(slot.file_path)) {
    if (OBJ.get(slot.file_path).size === b.p_size) { Object.assign(slot, fields); return [{ video_id: slot.id, video_path: slot.file_path, uploaded: true }]; }
    closing = slot; slot = null;
  }
  const x = usage(slot?.id ?? null);
  if (x.stored + x.reserved + b.p_size > QUOTA) throw new Refus(`Plus assez de place pour cette vidéo : ${Math.round((x.stored + x.reserved) / MO)} Mo utilisés sur 100 Mo.`);
  if (slot) { Object.assign(slot, fields); return [{ video_id: slot.id, video_path: slot.file_path, uploaded: false }]; }
  // Au plus 3 nouvelles places par tranche de 3 h et par entreprise.
  const recent = D.training_videos.filter((v) => v.company_id === CO && inWindow(v)).sort((a, z) => z.reserved_at.localeCompare(a.reserved_at)).slice(0, 3);
  if (recent.length >= 3) {
    const mins = Math.max(1, Math.ceil((Date.parse(recent[recent.length - 1].reserved_at) + WINDOW_MS - nowSim().getTime()) / 60000));
    const wait = mins < 60 ? `${mins} min` : mins % 60 === 0 ? `${mins / 60} h` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
    throw new Refus(`Déjà trois envois de vidéo préparés ces 3 dernières heures dans votre entreprise. Réessayez dans environ ${wait}.`);
  }
  if (closing) { closing.archived_at = stamp(); closing.archived_by = uid; }
  const id = crypto.randomUUID();
  const row = { id, company_id: CO, file_path: `${CO}/${id}`, created_by: uid, created_at: stamp(), published_at: null, archived_at: null, archived_by: null, size_bytes: null, ...fields };
  D.training_videos.push(row);
  return [{ video_id: id, video_path: row.file_path, uploaded: false }];
}
function publishVideo(uid, { p_id }) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  const v = D.training_videos.find((x) => x.id === p_id && x.company_id === CO);
  if (!v) throw new Refus('Cette vidéo est introuvable.', 'P0002', 404);
  if (v.published_at) return [{ video_id: v.id, real_bytes: v.size_bytes }];
  if (v.archived_at) throw new Refus('Cet envoi a été abandonné : recommencez.');
  const o = OBJ.get(v.file_path);
  if (!o) throw new Refus('La vidéo n\'est pas arrivée : relancez l\'envoi.');
  Object.assign(v, { size_bytes: o.size, mime_type: MIMES.includes(o.mime) ? o.mime : v.mime_type, published_at: stamp() });
  return [{ video_id: v.id, real_bytes: o.size }];
}
function archiveVideo(uid, { p_id, p_archived }) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  const v = D.training_videos.find((x) => x.id === p_id && x.company_id === CO && x.published_at);
  if (!v) throw new Refus('Cette vidéo est introuvable.', 'P0002', 404);
  if (p_archived !== false) { if (!v.archived_at) { v.archived_at = stamp(); v.archived_by = uid; } } else { v.archived_at = null; v.archived_by = null; }
  return v.archived_at;
}
function leftovers(uid) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  return D.training_videos.filter((v) => v.company_id === CO && !v.published_at && OBJ.has(v.file_path))
    .sort((a, z) => z.reserved_at.localeCompare(a.reserved_at))
    .map((v) => ({ id: v.id, title: v.title, file_path: v.file_path, real_bytes: OBJ.get(v.file_path).size, reserved_at: v.reserved_at, archived_at: v.archived_at }));
}
const destined = (v, uid) => v.company_id === CO && v.published_at && !v.archived_at && (v.all_team || v.assignee_ids.includes(uid));
function myVideos(uid) {
  if (!teamMember(uid)) return [];
  return D.training_videos.filter((v) => destined(v, uid)).map((v) => {
    const w = D.training_video_views.find((x) => x.video_id === v.id && x.user_id === uid && !x.undone_at);
    return { id: v.id, title: v.title, file_path: v.file_path, mime_type: v.mime_type, size_bytes: v.size_bytes, duration_s: v.duration_s, created_at: v.published_at, seen_at: w?.seen_at ?? null };
  });
}
function setVideoSeen(uid, { p_video, p_seen }) {
  if (!teamMember(uid)) throw new Refus('Réservé aux salariés.', '42501', 403);
  const v = D.training_videos.find((x) => x.id === p_video && destined(x, uid));
  if (!v) throw new Refus('Cette formation n\'existe pas, ou ne vous est pas destinée.', 'P0002', 404);
  const cur = D.training_video_views.find((x) => x.video_id === v.id && x.user_id === uid);
  if (p_seen !== false) {
    if (cur && !cur.undone_at) return cur.seen_at;
    if (cur) { cur.seen_at = NOW.toISOString(); cur.undone_at = null; return cur.seen_at; }
    D.training_video_views.push({ video_id: v.id, user_id: uid, company_id: CO, seen_at: NOW.toISOString(), undone_at: null });
    return NOW.toISOString();
  }
  if (cur && !cur.undone_at) cur.undone_at = NOW.toISOString(); // « Annuler » : daté, jamais effacé
  return null;
}
const readable = (uid, p) => p.startsWith(`${CO}/`) && (isAdmin(uid) || D.training_videos.some((v) => v.file_path === p && teamMember(uid) && destined(v, uid)));
const uploadable = (uid, p) => isAdmin(uid) && !OBJ.has(p) && D.training_videos.some((v) => v.file_path === p && v.created_by === uid && !v.published_at && !v.archived_at);

// ─── Le faux serveur de stockage (vrai socket, HTTPS) ─────────────────────────
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(TMP, 'k.pem'), '-out', path.join(TMP, 'c.pem'), '-days', '1', '-subj', '/CN=sdperbcquvneohotjono.supabase.co'], { stdio: 'ignore' });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT, POST, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, x-upsert, content-type, x-client-info, cache-control' };
const uploads = []; // ce que le serveur a vraiment reçu
function filePart(body, ctype) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype || ''); if (!m) return null;
  const sep = Buffer.from(`--${m[1] || m[2]}`);
  let i = body.indexOf(sep);
  while (i >= 0) {
    const next = body.indexOf(sep, i + sep.length); if (next < 0) break;
    const part = body.subarray(i + sep.length + 2, next - 2);
    const h = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, h).toString();
    if (/filename=/i.test(head)) return { bytes: part.subarray(h + 4), mime: (/content-type:\s*([^\r\n;]+)/i.exec(head) || [])[1] || '' };
    i = next;
  }
  return null;
}
const store = https.createServer({ key: fs.readFileSync(path.join(TMP, 'k.pem')), cert: fs.readFileSync(path.join(TMP, 'c.pem')) }, (q, r) => {
  if (q.method === 'OPTIONS') { r.writeHead(204, CORS); return r.end(); }
  const m = /^\/storage\/v1\/object\/upload\/sign\/formations\/(.+)$/.exec(new URL(q.url, 'https://x').pathname);
  if (q.method !== 'PUT' || !m) { r.writeHead(404, CORS); return r.end(); }
  const p = decodeURIComponent(m[1]);
  const chunks = []; let n = 0; const mode = UP_MODE; let held = false;
  const rec = { path: p, mode, received: 0, done: false, aborted: false };
  uploads.push(rec);
  // Lecture lente (le navigateur voit l'envoi avancer), comme un réseau de chantier.
  q.pause();
  const tick = setInterval(() => { if (!held) { q.resume(); setTimeout(() => { if (!rec.done) q.pause(); }, 12); } }, 90);
  q.on('data', (c) => {
    chunks.push(c); n += c.length; rec.received = n;
    if (mode === 'cut' && n > 6 * MO) { clearInterval(tick); rec.aborted = true; q.socket.destroy(); }
    if (mode === 'hold' && n > 7 * MO && !held) { held = true; q.pause(); holdRelease = () => { held = false; }; }
  });
  const gone = () => { clearInterval(tick); if (!rec.done) rec.aborted = true; };
  q.on('close', gone); q.on('aborted', gone); r.on('close', gone); q.socket.on('close', gone);
  q.on('end', () => {
    clearInterval(tick); rec.done = true;
    const f = filePart(Buffer.concat(chunks), q.headers['content-type']);
    const json = (s, o) => { r.writeHead(s, { ...CORS, 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (!f) return json(400, { statusCode: '400', error: 'invalid', message: 'no file' });
    if (f.bytes.length > MAXB) return json(413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    if (!MIMES.includes(f.mime)) return json(400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${f.mime} is not supported` });
    if (OBJ.has(p)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    OBJ.set(p, { size: f.bytes.length, mime: f.mime, bytes: Buffer.from(f.bytes) });
    rec.size = f.bytes.length; rec.mime = f.mime;
    json(200, { Key: `formations/${p}`, Id: crypto.randomUUID() });
  });
});
await new Promise((r) => store.listen(HTTPS_PORT, '127.0.0.1', r));
const b = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [`--host-resolver-rules=MAP sdperbcquvneohotjono.supabase.co 127.0.0.1:${HTTPS_PORT}`, '--ignore-certificate-errors', '--no-proxy-server'],
});

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; const gets = []; const signs = []; const media = [];
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
function filterRows(rows, params) {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val;
      else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
}
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(z[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const sessionFor = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const MISSING_TABLE = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });
const MISSING_FN = (fn) => ({ status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } });
const errors = [];
const newCtx = async (uid, viewport, extra = {}) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ignoreHTTPSErrors: true, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...extra });
  const session = sessionFor(uid);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const list = n.matches?.('[data-sonner-toast]') ? [n] : [...(n.querySelectorAll?.('[data-sonner-toast]') || [])];
        for (const t of list) setTimeout(() => window.__toasts.push((t.textContent || '').trim()), 80);
      }
    }).observe(document, { childList: true, subtree: true });
    window.__mailto = 0;
    document.addEventListener('click', (e) => { const a = e.target?.closest?.('a[href]'); if (a && /^mailto:/i.test(a.getAttribute('href') || '')) window.__mailto++; }, true);
  });
  await ctx.clock.setFixedTime(NOW);
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    const fail = (e) => r.fulfill({ status: e.status || 400, json: { code: e.code, message: e.message, details: null, hint: null } });
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    // ── Stockage « formations »
    const up = /^\/storage\/v1\/object\/upload\/sign\/formations\/(.+)$/.exec(url.pathname);
    if (up) {
      const p = decodeURIComponent(up[1]);
      if (m === 'OPTIONS') return r.continue();
      if (m === 'POST') {
        writes.push({ m: 'SIGN-UP', t: 'formations', path: p, by: uid });
        if (MIG !== 'oui' || !uploadable(uid, p)) return r.fulfill({ status: 400, json: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } });
        return r.fulfill({ json: { url: `/object/upload/sign/formations/${p}?token=up-${encodeURIComponent(p)}` } });
      }
      if (m === 'PUT') {
        writes.push({ m: 'PUT', t: 'formations', path: p, by: uid, headers: req.headers() });
        if (url.searchParams.get('token') !== `up-${p}`) return r.fulfill({ status: 400, json: { statusCode: '400', error: 'InvalidSignature', message: 'invalid signature' } });
        return r.continue(); // part VRAIMENT vers le faux serveur de stockage (barre réelle)
      }
    }
    const sg = /^\/storage\/v1\/object\/sign\/formations\/(.+)$/.exec(url.pathname);
    if (sg) {
      const p = decodeURIComponent(sg[1]);
      if (m === 'POST') {
        signs.push({ path: p, by: uid, expiresIn: body?.expiresIn });
        if (!readable(uid, p) || !OBJ.has(p)) return r.fulfill({ status: 400, json: { statusCode: '404', error: 'not_found', message: 'Object not found' } });
        return r.fulfill({ json: { signedURL: `/object/sign/formations/${p}?token=rd-${signs.length}` } });
      }
      media.push({ path: p, by: uid, token: url.searchParams.get('token') });
      if (MEDIA_FAIL > 0) { MEDIA_FAIL--; return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: '"exp" claim timestamp check failed' }) }); }
      const o = OBJ.get(p);
      return r.fulfill({ status: 200, contentType: 'video/webm', body: o?.bytes && o.mime === 'video/webm' ? o.bytes : VIDEO_BYTES });
    }
    if (url.pathname === '/storage/v1/object/sign/chantier-docs' && m === 'POST') {
      return r.fulfill({ json: (body?.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/chantier-docs/${p}?token=t-${uid}`, error: null })) });
    }
    if (url.pathname.startsWith('/storage/v1/')) { writes.push({ m, t: `storage:${url.pathname}`, by: uid }); return r.fulfill({ json: [] }); }
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: pushSent, failed: 0, purged: 0 } });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      if (m === 'GET' || m === 'HEAD') gets.push({ t: `rpc/${fn}`, by: uid, missing: LOT13_FNS.has(fn) && MIG !== 'oui' }); else writes.push({ m: 'RPC', t: fn, body, by: uid });
      if (fn === 'my_trainings') return r.fulfill({ json: myTrainings(uid) });
      if (fn === 'set_training_seen') return r.fulfill({ json: NOW.toISOString() });
      if (LOT13_FNS.has(fn)) {
        if (MIG !== 'oui') return r.fulfill(MISSING_FN(fn));
        try {
          if (fn === 'training_video_limits') { const l = limitsOf(uid); limitsReads++; lastLimits = l[0]; return r.fulfill({ json: l }); }
          if (fn === 'start_training_video') return r.fulfill({ json: startVideo(uid, body) });
          if (fn === 'publish_training_video') { if (PUBLISH_FAIL > 0) { PUBLISH_FAIL--; return r.abort('connectionfailed'); } return r.fulfill({ json: publishVideo(uid, body) }); }
          if (fn === 'training_video_leftovers') return r.fulfill({ json: leftovers(uid) });
          if (fn === 'set_training_video_archived') return r.fulfill({ json: archiveVideo(uid, body) });
          if (fn === 'my_training_videos') return r.fulfill({ json: myVideos(uid) });
          if (fn === 'set_training_video_seen') return r.fulfill({ json: setVideoSeen(uid, body) });
        } catch (e) { return fail(e); }
      }
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200, total = rows.length, off = 0) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${total}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (LOT13_TABLES.has(t) && MIG !== 'oui') { if (m === 'GET' || m === 'HEAD') gets.push({ t, by: uid, missing: true }); else writes.push({ m, t, body, by: uid }); return r.fulfill(MISSING_TABLE(t)); }
    if (m === 'GET' || m === 'HEAD') {
      gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid });
      const sel = url.searchParams.get('select') || '*';
      let rows = sortRows(filterRows(visible(t, uid, D[t] || []), url.searchParams), url.searchParams.get('order')).map((x) => {
        if (t === 'trainings') return { ...x, ...(sel.includes('document:documents') ? { document: docOf(x) ? (({ label, file_name, file_path, mime_type }) => ({ label, file_name, file_path, mime_type }))(docOf(x)) : null } : {}) };
        if (t !== 'planning' && t !== 'time_entries') return x;
        return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: userOf(x.user_id) || null } : {}) };
      });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const total = rows.length;
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows, 200, total, off);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    if (LOT13_TABLES.has(t)) return fail(new Refus(`permission denied for table ${t}`, '42501', 403));
    if (m === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((x) => ({ id: `x-${++idSeq}`, ...x })); D[t] = [...(D[t] || []), ...list]; return reply(list, 201); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => { if (!AVANT) console.log(`\n═══ ${t}`); };
const shot = async (loc, name) => {
  const page = typeof loc.page === 'function' ? loc.page() : loc;
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = 'hidden'; })).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  await loc.screenshot({ path: path.join(SH, `${name}.png`) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
  await page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = ''; })).catch(() => {});
};
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const toastsSince = async (p, k) => (await p.evaluate((k) => (window.__toasts || []).slice(k), k)).join(' | ');
const toastMark = (p) => p.evaluate(() => (window.__toasts || []).length);
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 80)); } return false; };
const pages = [];
const track = (p, who) => { p.on('pageerror', (e) => { errors.push(`${who} : ${e.message}`); console.log(`   [erreur page ${who}]`, e.message); }); pages.push(p); return p; };

// ─── Fichiers de test : une vraie petite vidéo, un fichier trop lourd, un moyen, un PDF ──
{
  const gen = await b.newContext(); const gp = await gen.newPage();
  const b64 = await gp.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let t = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${(t * 9) % 360},60%,45%)`; g.fillRect(0, 0, 320, 180); g.fillStyle = '#fff'; g.font = '26px sans-serif'; g.fillText(`Consigne ${t}`, 20, 100); t++; }, 40);
    rec.start(200); await new Promise((r) => setTimeout(r, 2400)); rec.stop(); await new Promise((r) => { rec.onstop = r; }); clearInterval(iv);
    const buf = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s);
  });
  await gen.close();
  VIDEO_BYTES = Buffer.from(b64, 'base64');
}
const F_FILM = path.join(TMP, 'consigne-harnais.webm'); fs.writeFileSync(F_FILM, VIDEO_BYTES);
const F_HEAVY = path.join(TMP, 'IMG_0420.MOV'); fs.writeFileSync(F_HEAVY, Buffer.alloc(50 * MO + 1));
const F_MID = path.join(TMP, 'pose-fenetre.mp4'); fs.writeFileSync(F_MID, Buffer.alloc(24 * MO, 7));
const F_45 = path.join(TMP, 'demontage.mp4'); fs.writeFileSync(F_45, Buffer.alloc(45 * MO, 3));
const F_PDF = path.join(TMP, 'notice.pdf'); fs.writeFileSync(F_PDF, Buffer.from('%PDF-1.4\n%%EOF\n'));

const office = await newCtx(ADMIN, { width: 1366, height: 900 });
const op = track(await office.newPage(), 'bureau');
const worker = await newCtx(SAM, { width: 390, height: 844 });
const wp = track(await worker.newPage(), 'salarié');
const openOffice = async (p = op) => { await p.goto(`http://localhost:${PORT}/admin`); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1200); };
const openTrainings = async (p = op) => {
  await p.locator('.bt-pl-segbtn', { hasText: 'Salariés' }).click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(300);
  await p.click('[data-testid=salaries-trainings]'); await p.waitForSelector('[data-testid=trainings-dialog]'); await p.waitForTimeout(800);
};
const dlg = (p = op) => p.locator('[data-testid=trainings-dialog]');
const closeDlg = async (p = op) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };
const openWorker = async (p = wp) => { await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 20000 }); await p.waitForTimeout(1200); };
const openWorkerTrainings = async (p = wp) => {
  await ouvrirMenuCompte(p, { menu: true, attente: 250 });
  await p.click('[data-testid=menu-formations]'); await p.waitForSelector('[data-testid=trainings-list]'); await p.waitForTimeout(700);
};
// Ouvre le formulaire (« + Ajouter » si la liste n'est pas vide), attend la lecture de la jauge, puis choisit « Fichier » (ou `kind`).
const openUpload = async (p = op, kind = 'file') => {
  const n = limitsReads;
  if (await p.locator('[data-testid=tr-add-open]').count()) await p.click('[data-testid=tr-add-open]');
  await p.waitForSelector('[data-testid=tr-form]');
  await waitFor(async () => limitsReads > n); await p.waitForTimeout(250);
  if (kind) await p.click(`[data-testid=tr-kind-${kind}]`);
};
const usedMo = () => Math.round((Number(lastLimits?.used_bytes || 0) + Number(lastLimits?.reserved_bytes || 0)) / MO);

// ═══ AVANT / V0 : textes de la migration absente ═════════════════════════════
const TEXTS = path.join(SH, 'avant-textes.json');
const domTexts = async () => {
  MIG = 'non'; freshDb();
  const out = {};
  await openOffice(); await openTrainings();
  out.liste = await txt(dlg());
  await op.click('[data-testid=tr-add-open]'); await op.waitForTimeout(300);
  out.formulaire = await txt(dlg());
  out.pastilles = (await op.locator('[data-testid=tr-form] [role=radiogroup][aria-label=Contenu] [role=radio]').allInnerTexts()).map((s) => s.trim());
  out.pastillesFilmer = await op.locator('[data-testid=tr-kind-record], [data-testid=tr-kind-file]').count();
  await shot(dlg(), `${AVANT ? 'avant' : 'sans-migration'}-bureau-ajouter`);
  await closeDlg();
  await openWorker(); await openWorkerTrainings();
  out.salarie = await txt(wp.locator('[data-testid=trainings-list]'));
  await shot(wp, `${AVANT ? 'avant' : 'sans-migration'}-salarie-formations`);
  return out;
};
if (AVANT) {
  const t = await domTexts();
  fs.writeFileSync(TEXTS, `${JSON.stringify(t, null, 2)}\n`);
  console.log(`Captures « avant » et textes écrits dans ${SH}`);
  await b.close(); srv.close(); store.close();
  process.exit(0);
}

section('V0 · migration pas appliquée : aucune option vidéo, tout comme avant');
{
  const W0 = writes.length;
  const sans = await domTexts();
  check(sans.pastillesFilmer === 0 && sans.pastilles.join('|') === 'Lien|Document', `formulaire : « ${sans.pastilles.join(' / ')} » seulement, ni « Filmer » ni « Fichier »`);
  check(gets.filter((g) => g.t === 'training_videos' && g.missing).length === 1, 'bureau : une seule lecture de training_videos (404 PGRST205), pas une de plus à l’ajout');
  check(gets.some((g) => g.t === 'rpc/my_training_videos' && g.missing), 'salarié : my_training_videos lue par un GET, reçoit « fonction absente » (PGRST202)');
  check(!since(W0).some((w) => LOT13_FNS.has(w.t) || LOT13_TABLES.has(w.t) || w.t === 'formations'), 'aucune écriture du lot, aucun appel de stockage « formations »');
  check(!(await wp.locator('[data-testid=training-watch]').count()), 'salarié : aucun « Regarder »');
  if (fs.existsSync(TEXTS)) {
    const avant = JSON.parse(fs.readFileSync(TEXTS, 'utf8'));
    // Le bureau a changé exprès (formations simplifiées) : seul le côté salarié doit rester identique au build d'avant.
    check(avant.salarie === sans.salarie, 'liste du salarié : même texte que le build d’avant');
  } else {
    console.log('   (pas de textes « avant » : lancer d’abord AVANT=1 sur le build d’avant)');
  }
  // Rouvrir la fenêtre : la migration absente est connue, on ne redemande pas.
  const n = gets.length;
  await openTrainings(); await closeDlg();
  check(!gets.slice(n).some((g) => g.t === 'training_videos'), 'rouvrir « Formations » : pas de nouvelle lecture en échec');
}

// ═══ V1 · la liste ═══════════════════════════════════════════════════════════
section('V1 · migration appliquée : liens, documents et vidéos envoyées dans une seule liste');
MIG = 'oui'; freshDb();
await openOffice(); await openTrainings();
{
  const titles = await op.locator('[data-testid=tr-item] [data-testid=tr-title-text]').allInnerTexts();
  check(titles.join('|') === 'Montage de l’échafaudage|Gestes et postures|Livret sécurité chantier', `plus récentes d’abord (${titles.join(' · ')})`);
  const row = op.locator('[data-testid=tr-item][data-kind=upload]');
  check((await txt(row.locator('.bt-fo-s'))) === 'Vidéo · 2 min 10 · 38 Mo · Toute l’équipe · 13/10', `vidéo envoyée : « ${await txt(row.locator('.bt-fo-s'))} »`);
  check((await txt(row.locator('[data-testid=tr-count]'))) === '1/4 vue', 'vidéo envoyée : « 1/4 vue » (Alex)');
  check(await op.locator('.bt-fo-top .bt-fo-muted').count() === 0 && await op.locator('[data-testid=tr-add-open]').count() === 1, 'plus d’explication en haut de la fenêtre : seulement « + Ajouter »');
  await shot(dlg(), 'apres-bureau-liste');
}

// ═══ V2 · l'option ═══════════════════════════════════════════════════════════
section('V2 · formulaire simplifié : Filmer · Fichier · Lien · Document, aucun texte d’aide, jauge cachée sous 80 %');
{
  const n = gets.length;
  await openUpload(op, null);
  check(gets.slice(n).some((g) => g.t === 'rpc/training_video_limits'), 'la jauge est lue à l’ouverture du formulaire (GET training_video_limits)');
  const chips = (await op.locator('[data-testid=tr-form] [role=radiogroup][aria-label=Contenu] [role=radio]').allInnerTexts()).map((x) => x.trim());
  check(chips.join('|') === 'Filmer|Fichier|Lien|Document', `une seule rangée de choix : ${chips.join(' · ')}`);
  check(await op.locator('[data-testid=tr-kind-file][aria-checked=true], [data-testid=tr-kind-record][aria-checked=true]').count() === 0, 'vidéos activées : aucun contenu pré-sélectionné');
  const hs = await op.locator('.bt-fo-chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  check(hs.length === 4 && hs.every((h) => h >= 44), `gros boutons tactiles (${hs.map((h) => Math.round(h)).join(', ')} px de haut, 44 au moins)`);
  const labels = await op.locator('.bt-fo-chip').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(labels.join('|') === 'Filmer une vidéo|Choisir un fichier vidéo|Coller un lien|Choisir un document', `libellés accessibles complets (${labels.join(' | ')})`);
  check(await op.locator('input[type=file][capture]').count() === 0 && await op.locator('[data-testid=tr-film]').count() === 0, 'ordinateur (écran non tactile) : aucun sélecteur de fichier avec « capture »');
  const file = await op.locator('[data-testid=tr-file]').evaluate((e) => ({ accept: e.accept, capture: e.getAttribute('capture') }));
  check(file.accept.includes('video/mp4') && file.accept.includes('video/webm') && !file.capture, '« Fichier » : MP4, MOV, WebM, sans caméra imposée');
  await op.click('[data-testid=tr-kind-file]');
  const t = await txt(dlg());
  check(await op.locator('[data-testid=tr-quota]').count() === 0 && usedMo() === 38, `jauge cachée à 38 % (${usedMo()} Mo sur 100 lus)`);
  check(!/MP4, MOV ou WebM|50 Mo maximum|GPS|localisation|Place disponible|720p|Collez|reste chez eux|Une vidéo filmée|Aucune formation/.test(t), 'aucun texte d’aide, de rappel de taille ni d’avertissement GPS');
  check(await op.locator('[data-testid=tr-upload]').count() === 0, 'rien sous la rangée tant qu’il ne se passe rien');
  await shot(dlg(), 'apres-bureau-option-video');
}

// ═══ V3 · refus avant envoi ══════════════════════════════════════════════════
section('V3 · refus clairs AVANT tout envoi (plus de 50 Mo, PDF)');
{
  const n = writes.length;
  await op.fill('[data-testid=tr-title]', 'Démontage');
  await op.setInputFiles('[data-testid=tr-file]', F_HEAVY); await op.waitForTimeout(400);
  const e = await txt(op.locator('[data-testid=tr-file-error]'));
  check(e.startsWith('Vidéo trop lourde : 50 Mo maximum.') && e.includes('720p') && e.includes('YouTube'), `plus de 50 Mo : « ${e} »`);
  check(await op.locator('[data-testid=tr-file-ready]').count() === 0 && await op.locator('[data-testid=tr-save]').isDisabled(), 'pas d’aperçu, « Ajouter » désactivé');
  await shot(dlg(), 'apres-bureau-refus-50-mo');
  await op.setInputFiles('[data-testid=tr-file]', F_PDF); await op.waitForTimeout(300);
  check((await txt(op.locator('[data-testid=tr-file-error]'))) === 'Format refusé : une vidéo MP4, MOV ou WebM.', 'PDF : « Format refusé »');
  check(since(n).length === 0, 'aucune requête d’écriture (ni réservation, ni envoi)');
  await op.click('[data-testid=tr-cancel]');
}

// ═══ V4 · Filmer et envoyer ══════════════════════════════════════════════════
section('V4 · fichier choisi : aperçu, durée, taille ; réserver → URL signée → envoi réel → publier');
{
  await openUpload();
  await op.fill('[data-testid=tr-title]', '  Port du   harnais ');
  await op.setInputFiles('[data-testid=tr-file]', F_FILM);
  await op.waitForSelector('[data-testid=tr-preview]');
  await waitFor(async () => /\d s/.test(await txt(op.locator('[data-testid=tr-file-meta]'))), 6000);
  const meta = await txt(op.locator('[data-testid=tr-file-meta]'));
  check(/^2 s · 0,\d Mo$/.test(meta), `aperçu : durée et taille (« ${meta} »)`);
  check(await op.locator('[data-testid=tr-preview]').evaluate((v) => v.tagName === 'VIDEO' && v.getAttribute('preload') === 'metadata' && v.src.startsWith('blob:')), 'aperçu : <video> local (blob:), rien n’est encore parti');
  check(await op.locator('[data-testid=tr-gps-note]').count() === 0 && !/GPS|position/.test(await txt(dlg())), 'aucun avertissement GPS à l’écran, même avec un fichier choisi (décision du patron)');
  await op.click('[data-testid=tr-pick]');
  await op.locator(`[data-testid=tr-person][data-id=${SAM}]`).check();
  await shot(dlg(), 'apres-bureau-filmer-apercu');
  const n = writes.length; const k = await toastMark(op);
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 15000);
  const w = since(n);
  const order = w.filter((x) => ['RPC', 'SIGN-UP', 'PUT', 'FN'].includes(x.m)).map((x) => (x.m === 'RPC' || x.m === 'FN' ? x.t : x.m));
  check(order.join(' → ') === 'start_training_video → SIGN-UP → PUT → publish_training_video → send-push', `ordre : ${order.join(' → ')}`);
  const st = of(w, 'RPC', 'start_training_video')[0]?.body || {};
  check(st.p_title === 'Port du harnais' && st.p_mime === 'video/webm' && st.p_size === VIDEO_BYTES.length && st.p_all_team === false && JSON.stringify(st.p_assignee_ids) === JSON.stringify([SAM]) && st.p_duration === 2,
    `réservation : titre nettoyé, type, taille exacte, Sam seul, durée 2 s (${JSON.stringify(st)})`);
  const put = of(w, 'PUT')[0];
  check(!!put && put.headers['x-upsert'] === 'false' && !!put.headers.apikey && /^Bearer /.test(put.headers.authorization || ''), 'envoi : PUT sur l’URL signée, sans écrasement (x-upsert: false), avec la clé publique');
  const rec = uploads.find((x) => x.path === put?.path);
  check(rec?.size === VIDEO_BYTES.length && rec?.mime === 'video/webm', `le serveur de stockage a reçu le fichier entier (${rec?.size} octets, ${rec?.mime})`);
  const v = D.training_videos.find((x) => x.title === 'Port du harnais');
  check(!!v?.published_at && v.size_bytes === VIDEO_BYTES.length && v.file_path === put?.path, 'publiée avec la vraie taille, à SA place');
  const push = of(w, 'FN', 'send-push')[0];
  check(push && JSON.stringify(push.body.user_ids) === JSON.stringify([SAM]) && push.body.body === 'Nouvelle formation : Port du harnais', 'notification à Sam seul : « Nouvelle formation : Port du harnais »');
  await waitFor(async () => (await toastsSince(op, k)).includes('Vidéo ajoutée'), 4000);
  check((await toastsSince(op, k)).includes('Vidéo ajoutée · 1 appareil prévenu'), 'message « Vidéo ajoutée · 1 appareil prévenu »');
  await waitFor(async () => (await op.locator('[data-testid=tr-item]').count()) === 4, 5000);
  const first = await txt(op.locator('[data-testid=tr-item]').first().locator('.bt-fo-s'));
  check(first.startsWith('Vidéo · 2 s · 0,1 Mo · 1 salarié · 14/10'), `la nouvelle vidéo est en tête de liste (« ${first} »)`);
  check(!w.some((x) => x.m === 'FN' && EMAIL_FNS.includes(x.t)), 'aucun e-mail');
}

// ═══ V5 · progression réelle, Annuler ════════════════════════════════════════
section('V5 · barre de progression réelle ; « Annuler l’envoi » ; la même place est reprise');
let pathV5;
{
  await openUpload();
  await op.fill('[data-testid=tr-title]', 'Pose d’une fenêtre');
  await op.setInputFiles('[data-testid=tr-file]', F_MID);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  UP_MODE = 'hold'; holdRelease = null;
  const n = writes.length;
  await op.click('[data-testid=tr-save]');
  const seen = [];
  await waitFor(async () => { const v = Number(await op.locator('[role=progressbar]').getAttribute('aria-valuenow').catch(() => -1)); if (v >= 0) seen.push(v); return !!holdRelease && v > 0; }, 20000);
  await op.waitForTimeout(600);
  const pct = Number(await op.locator('[role=progressbar]').getAttribute('aria-valuenow'));
  const label = await txt(op.locator('[data-testid=tr-progress-text]'));
  check(pct > 0 && pct < 100, `en cours : ${pct} % (barre role="progressbar")`);
  check(/^Envoi… \d+ % \(\d+(,\d)? Mo sur 24 Mo\)$/.test(label), `texte : « ${label} »`);
  check(await op.locator('[data-testid=tr-save]').isDisabled() && await op.locator('[data-testid=tr-kind-link]').isDisabled() && await op.locator('[data-testid=tr-kind-file]').isDisabled() && await op.locator('[data-testid=tr-cancel]').isDisabled(), 'pendant l’envoi : « Ajouter », le choix du contenu et « Annuler » sont bloqués');
  await shot(dlg(), 'apres-bureau-progression');
  const rec = uploads[uploads.length - 1];
  check(rec && rec.received > 0 && rec.received < 24 * MO && !rec.done, `le serveur reçoit vraiment les octets (${(rec.received / MO).toFixed(1)} Mo sur 24)`);
  await op.click('[data-testid=tr-upload-cancel]');
  await waitFor(async () => (await op.locator('[data-testid=tr-upload-note]').count()) > 0, 5000);
  check((await txt(op.locator('[data-testid=tr-upload-note]'))) === 'Envoi annulé : rien n’est publié.', 'message : « Envoi annulé : rien n’est publié. »');
  // Le serveur reprend la lecture : si l'envoi n'était pas vraiment coupé, il irait au bout.
  const before = rec.received;
  holdRelease?.();
  await new Promise((r) => setTimeout(r, 2500));
  check(!rec.done && !OBJ.has(rec.path) && rec.received < 24 * MO, `envoi vraiment coupé : le serveur ne reçoit plus rien et n’enregistre rien (${(before / MO).toFixed(1)} → ${(rec.received / MO).toFixed(1)} Mo)`);
  check(!of(since(n), 'RPC', 'publish_training_video').length && !D.training_videos.some((x) => x.title === 'Pose d’une fenêtre' && x.published_at), 'rien n’est publié');
  pathV5 = of(since(n), 'PUT')[0]?.path;
  await shot(dlg(), 'apres-bureau-envoi-annule');
  // On recommence : même fichier, même place (jamais deux fichiers).
  UP_MODE = 'normal';
  const n2 = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 30000);
  const put2 = of(since(n2), 'PUT')[0];
  check(put2?.path === pathV5 && D.training_videos.filter((x) => x.title === 'Pose d’une fenêtre').length === 1, 'recommencer : la MÊME place est reprise');
  check(D.training_videos.find((x) => x.title === 'Pose d’une fenêtre')?.size_bytes === 24 * MO, 'publiée : 24 Mo');
  check(seen.length > 0, 'la barre a bougé pendant l’envoi');
}

// ═══ V6 · réseau coupé ═══════════════════════════════════════════════════════
section('V6 · réseau coupé pendant l’envoi : message clair, rien de publié');
{
  await openUpload();
  check(usedMo() === Math.round((38 * MO + VIDEO_BYTES.length + 24 * MO) / MO) && await op.locator('[data-testid=tr-quota]').count() === 0, `la jauge suit (${usedMo()} Mo lus, à jour) mais reste cachée sous 80 %`);
  await op.fill('[data-testid=tr-title]', 'Rangement du dépôt');
  await op.setInputFiles('[data-testid=tr-file]', F_MID);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  UP_MODE = 'cut';
  const n = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-error]').count()) > 0, 20000);
  check((await txt(op.locator('[data-testid=tr-error]'))) === 'La connexion a été coupée pendant l’envoi : rien n’est publié. Réessayez quand le réseau revient.', `message : « ${await txt(op.locator('[data-testid=tr-error]'))} »`);
  check(!of(since(n), 'RPC', 'publish_training_video').length, 'rien n’est publié');
  check(await op.locator('[data-testid=tr-file-ready]').count() === 1 && !(await op.locator('[data-testid=tr-save]').isDisabled()), 'le fichier reste choisi, « Ajouter » de nouveau possible');
  await shot(dlg(), 'apres-bureau-reseau-coupe');
  UP_MODE = 'normal';
  await op.click('[data-testid=tr-cancel]');
}

// ═══ V7 · la base garde le quota ═════════════════════════════════════════════
section('V7 · la base refuse le quota même si l’écran l’a laissé passer');
{
  LIMITS_LIE = 10 * MO; // l'écran croit qu'il reste 90 Mo
  await openUpload();
  await op.fill('[data-testid=tr-title]', 'Démontage');
  await op.setInputFiles('[data-testid=tr-file]', F_45);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  const n = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-error]').count()) > 0, 8000);
  const msg = await txt(op.locator('[data-testid=tr-error]'));
  check(/^Plus assez de place pour cette vidéo : \d+ Mo utilisés sur 100 Mo\.$/.test(msg), `refus de la base : « ${msg} »`);
  check(!of(since(n), 'PUT').length && !of(since(n), 'SIGN-UP').length, 'aucun octet envoyé');
  await shot(dlg(), 'apres-bureau-quota-refuse-par-la-base');
  LIMITS_LIE = null;
  await op.click('[data-testid=tr-cancel]');
}

// ═══ V8 · quota plein ════════════════════════════════════════════════════════
section('V8 · quota plein : le message, rien ne s’ouvre ; un lien YouTube reste possible');
{
  OBJ.set(`${CO}/00000000-0000-4000-8000-0000000000ff`, { size: 40 * MO, mime: 'video/mp4', bytes: null }); // fichier d'une vidéo retirée : compte toujours
  await openUpload();
  const q = await txt(op.locator('[data-testid=tr-quota]'));
  check(/^1\d\d Mo utilisés sur 100 Mo$/.test(q), `jauge visible (plein) : « ${q} »`);
  check(await op.locator('[data-testid=tr-preview]').count() === 0 && await op.locator('[data-testid=tr-rec]').count() === 0, 'plein : ni aperçu ni enregistreur, rien ne s’ouvre');
  check(await op.locator('[data-testid=tr-kind-record]').count() === 0 && await op.locator('[data-testid=tr-quota-full]').count() === 1, 'plein : plus de « Filmer » sur ordinateur (moins de 2 Mo de place), le message reste');
  await op.click('[data-testid=tr-kind-file]'); await op.waitForTimeout(200);
  check(await op.locator('[data-testid=tr-preview]').count() === 0 && await op.locator('[data-testid=tr-quota-full]').count() === 1, 'plein : « Fichier » n’ouvre rien de plus, le message reste');
  check((await txt(op.locator('[data-testid=tr-quota-full]'))).startsWith('Plus assez de place :') && (await txt(op.locator('[data-testid=tr-quota-full]'))).includes('lien YouTube'), 'message : plus de place, collez plutôt un lien');
  await shot(dlg(), 'apres-bureau-quota-plein');
  await op.click('[data-testid=tr-kind-link]');
  await op.fill('[data-testid=tr-title]', 'Sécurité en hauteur');
  await op.fill('[data-testid=tr-link]', 'youtu.be/abc');
  check((await txt(op.locator('[data-testid=tr-link-ok]'))) === 'YouTube ✓' && !(await op.locator('[data-testid=tr-save]').isDisabled()), 'lien YouTube : toujours possible (inchangé)');
  await op.click('[data-testid=tr-cancel]');
}

// ═══ V9 · Regarder, Retirer, Remettre (bureau) ═══════════════════════════════
section('V9 · bureau : « Regarder », « Retirer » (le fichier est gardé), « Remettre »');
{
  const row = op.locator('[data-testid=tr-item][data-kind=upload]', { hasText: 'Montage de l’échafaudage' });
  await row.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(300);
  const ns = signs.length;
  await row.locator('[data-testid=tr-watch]').click();
  await op.waitForSelector('[data-testid=video-el]');
  check(signs.length === ns + 1 && signs[ns].path === VID_PATH && signs[ns].expiresIn === 600, 'lien signé de lecture : 10 minutes (600 s), demandé à l’ouverture');
  await shot(dlg(), 'apres-bureau-regarder');
  const n = writes.length;
  await row.locator('[data-testid=tr-archive]').click();
  check((await txt(row.locator('.bt-fo-confirm'))).startsWith('Retirer cette formation ?') && !(await txt(row.locator('.bt-fo-confirm'))).includes('gardé'), 'confirmation courte : « Retirer cette formation ? » (Retirer / Annuler)');
  await shot(dlg(), 'apres-bureau-retirer-confirmation');
  await row.locator('[data-testid=tr-archive-yes]').click(); await op.waitForTimeout(900);
  const a = of(since(n), 'RPC', 'set_training_video_archived');
  check(a.length === 1 && a[0].body.p_archived === true && !!D.training_videos.find((x) => x.id === VIDEOS[0].id).archived_at, 'set_training_video_archived { p_archived: true }');
  check(OBJ.has(VID_PATH) && !since(n).some((x) => x.m === 'DELETE' || /remove|delete/i.test(x.t)), 'aucun effacement : le fichier reste, aucun DELETE');
  await op.click('[data-testid=tr-show-archived]'); await op.waitForTimeout(300);
  const arow = op.locator('[data-testid=tr-archived-item]', { hasText: 'Montage de l’échafaudage' });
  await arow.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(200);
  await arow.locator('[data-testid=tr-restore]').click(); await op.waitForTimeout(900);
  check(!D.training_videos.find((x) => x.id === VIDEOS[0].id).archived_at, '« Remettre » : de nouveau visible');
  await closeDlg();
}

// ═══ W1-W4 · le salarié ══════════════════════════════════════════════════════
section('W1 · salarié : la vidéo dans sa liste ; rien n’est signé avant « Regarder »');
const WW = writes.length;
{
  const ns = signs.length;
  await openWorker();
  check((await txt(wp.locator('[data-testid=trainings-banner]'))).endsWith('formations à voir ›'), `bandeau : « ${await txt(wp.locator('[data-testid=trainings-banner]'))} »`);
  await openWorkerTrainings();
  const rows = (await wp.locator('[data-testid=training-row]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(rows.some((r) => r.startsWith('Montage de l’échafaudage Vidéo · 2 min 10 · 38 Mo · ajoutée le 13 oct.')), 'vidéo envoyée : « Vidéo · 2 min 10 · 38 Mo · ajoutée le 13 oct. »');
  check(rows.some((r) => r.startsWith('Port du harnais Vidéo · 2 s')) && rows.some((r) => r.startsWith('Gestes et postures Vimeo')), 'avec la vidéo de Sam seul et le lien Vimeo du lot 6');
  check(await wp.locator('[data-testid=training-watch]').count() === 3, '« ▶ Regarder » sur les 3 vidéos envoyées (lien Vimeo : « Ouvrir ↗ » inchangé)');
  check(signs.length === ns && media.filter((m) => m.by === SAM).length === 0, 'rien n’est signé ni téléchargé avant « Regarder »');
  await shot(wp, 'apres-salarie-liste');
}

section('W2 · « Regarder » : lecteur intégré, lien signé à l’ouverture');
{
  const row = wp.locator('[data-testid=training-row]', { hasText: 'Montage de l’échafaudage' });
  const ns = signs.length;
  await row.locator('[data-testid=training-watch]').click();
  await wp.waitForSelector('[data-testid=video-el]', { timeout: 8000 });
  const v = await wp.locator('[data-testid=video-el]').evaluate((e) => ({ controls: e.controls, preload: e.getAttribute('preload'), inline: e.playsInline, src: e.src }));
  check(v.controls && v.preload === 'metadata' && v.inline, '<video controls preload="metadata" playsinline>');
  check(signs.length === ns + 1 && signs[ns].by === SAM && signs[ns].path === VID_PATH && /\/storage\/v1\/object\/sign\/formations\/.+\?token=rd-/.test(v.src), 'lien signé créé à l’ouverture, pour SA vidéo');
  check(await waitFor(() => wp.locator('[data-testid=video-el]').evaluate((e) => e.readyState >= 1), 8000), 'la vidéo se charge (en-tête lue)');
  check(await wp.locator('iframe').count() === 0, 'aucune iframe');
  check((await txt(row.locator('[data-testid=training-watch]'))) === 'Fermer la vidéo', 'le bouton devient « Fermer la vidéo »');
  await shot(wp, 'apres-salarie-lecteur');
  await row.locator('[data-testid=training-watch]').click(); await wp.waitForTimeout(200);
  check(await wp.locator('[data-testid=video-player]').count() === 0, '« Fermer la vidéo » : le lecteur disparaît');
}

section('W3 · lien expiré : re-signé une fois, la lecture reprend ; sinon message clair');
{
  const row = wp.locator('[data-testid=training-row]', { hasText: 'Port du harnais' });
  MEDIA_FAIL = 1;
  const ns = signs.length;
  await row.locator('[data-testid=training-watch]').click();
  await waitFor(() => wp.locator('[data-testid=video-el]').evaluate((e) => e.readyState >= 1).catch(() => false), 10000);
  check(signs.length === ns + 2, `lecture refusée (lien expiré) → re-signé une fois (${signs.length - ns} signatures)`);
  check(await wp.locator('[data-testid=video-el]').evaluate((e) => e.readyState >= 1) && await wp.locator('[data-testid=video-failed]').count() === 0, 'la vidéo se charge après la re-signature');
  await row.locator('[data-testid=training-watch]').click(); await wp.waitForTimeout(200);
  MEDIA_FAIL = 5;
  const ns2 = signs.length;
  await row.locator('[data-testid=training-watch]').click();
  await waitFor(async () => (await wp.locator('[data-testid=video-failed]').count()) > 0, 10000);
  check((await txt(wp.locator('[data-testid=video-failed]'))) === 'Lecture impossible sur cet appareil. Réessayez plus tard, ou demandez la vidéo au bureau.' && signs.length === ns2 + 2,
    'deux échecs : message clair, pas de boucle (2 signatures)');
  await shot(wp, 'apres-salarie-lecture-impossible');
  MEDIA_FAIL = 0;
  await row.locator('[data-testid=training-watch]').click(); await wp.waitForTimeout(200);
}

section('W4 · « Vue » : set_training_video_seen ; « Annuler »');
{
  const row = wp.locator('[data-testid=training-row]', { hasText: 'Montage de l’échafaudage' });
  const n = writes.length; const k = await toastMark(wp);
  await row.locator('[data-testid=training-seen]').click(); await wp.waitForTimeout(1200);
  const rpc = of(since(n), 'RPC');
  check(rpc.length === 1 && rpc[0].t === 'set_training_video_seen' && JSON.stringify(rpc[0].body) === JSON.stringify({ p_video: VIDEOS[0].id, p_seen: true }), `RPC set_training_video_seen { p_video, p_seen: true } (${rpc.map((x) => x.t).join(', ')})`);
  check((await txt(wp.locator('[data-testid=training-row]', { hasText: 'Montage de l’échafaudage' }).locator('[data-testid=training-seen]'))) === '✓ Vue le 14/10', '« ✓ Vue le 14/10 »');
  check((await toastsSince(wp, k)).includes('Formation marquée « Vue »'), 'message avec « Annuler »');
  await shot(wp, 'apres-salarie-vue');
  const n2 = writes.length;
  await wp.locator('[data-sonner-toast] button', { hasText: 'Annuler' }).first().click(); await wp.waitForTimeout(1200);
  const undo = of(since(n2), 'RPC', 'set_training_video_seen');
  check(undo.length === 1 && undo[0].body.p_seen === false, '« Annuler » : set_training_video_seen { p_seen: false }');
  const line = D.training_video_views.find((x) => x.video_id === VIDEOS[0].id && x.user_id === SAM);
  check(!!line && !!line.undone_at, 'base : la ligne reste, datée « annulée » (rien n’est effacé)');
  check(!since(WW).some((x) => x.t === 'set_training_seen'), 'jamais set_training_seen pour une vidéo envoyée');
}

// ═══ R · animations réduites ═════════════════════════════════════════════════
section('R · animations réduites : aucune transition sur les barres');
{
  const rm = await newCtx(ADMIN, { width: 1366, height: 900 }, { reducedMotion: 'reduce' });
  const rp = track(await rm.newPage(), 'bureau (animations réduites)');
  OBJ.delete(`${CO}/00000000-0000-4000-8000-0000000000ff`);
  LIMITS_LIE = 85 * MO; // la jauge n'est visible qu'à partir de 80 %
  await openOffice(rp); await openTrainings(rp); await openUpload(rp);
  const tr = await rp.locator('.bt-fo-quota .bt-fo-bar i').evaluate((e) => getComputedStyle(e).transitionDuration);
  check(/^0s(, 0s)*$/.test(tr), `jauge sans transition (${tr})`);
  LIMITS_LIE = null;
  await rm.close();
}

// ═══ X1 · un envoi arrivé mais jamais publié ═══════════════════════════════
section('X1 · un fichier arrivé mais jamais publié : montré au bureau, gardé, compté dans la place');
let LEFT_PATH = null;
{
  ageAll(4 * 3600 * 1000); // le temps passe : l’envoi coupé de V6 est loin
  await openOffice(); await openTrainings();
  await openUpload();
  await op.fill('[data-testid=tr-title]', 'Isolation des combles');
  await op.setInputFiles('[data-testid=tr-file]', F_FILM);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  PUBLISH_FAIL = 1; // le fichier arrive, puis le réseau coupe avant la publication
  const n = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-error]').count()) > 0, 20000);
  LEFT_PATH = of(since(n), 'PUT')[0]?.path;
  check(!!LEFT_PATH && OBJ.has(LEFT_PATH) && !D.training_videos.some((v) => v.title === 'Isolation des combles' && v.published_at), 'le fichier est arrivé au stockage, la vidéo n’est pas publiée');
  check((await txt(op.locator('[data-testid=tr-error]'))).length > 0 && await op.locator('[data-testid=tr-file-ready]').count() === 1, 'message d’erreur clair, le fichier reste choisi');
  // On choisit une AUTRE vidéo (autre taille) : la place est fermée, le fichier arrivé est GARDÉ.
  await op.click('[data-testid=tr-file-change]');
  await op.fill('[data-testid=tr-title]', 'Isolation des combles (version complète)');
  await op.setInputFiles('[data-testid=tr-file]', F_MID);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  const n2 = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 30000);
  const old = D.training_videos.find((v) => v.file_path === LEFT_PATH);
  check(!!old?.archived_at && !old.published_at && OBJ.has(LEFT_PATH), 'l’ancienne place est fermée (archived_at) et son fichier est toujours là : rien n’est effacé');
  check(!since(n2).some((x) => x.m === 'DELETE') && D.training_videos.some((v) => v.title === 'Isolation des combles (version complète)' && v.size_bytes === 24 * MO && v.published_at), 'l’autre vidéo (24 Mo) est publiée normalement');
  // Le bureau VOIT le fichier gardé, avec sa taille, dans « formations retirées et envois non terminés ».
  await waitFor(async () => (await op.locator('[data-testid=tr-show-archived]').count()) > 0, 5000);
  const toggle = await txt(op.locator('[data-testid=tr-show-archived]'));
  check(toggle === 'Afficher les formations retirées et les envois non terminés (1)', `bouton : « ${toggle} »`);
  await op.click('[data-testid=tr-show-archived]'); await op.waitForTimeout(300);
  const row = op.locator('[data-kind=leftover]');
  check(await row.count() === 1 && (await txt(row.locator('[data-testid=tr-title-text]'))) === 'Isolation des combles', 'une ligne « Isolation des combles » (le titre de la place fermée)');
  const sum = await txt(row.locator('[data-testid=tr-leftover-sum]'));
  check(sum === `Envoi non terminé · ${(Math.round(VIDEO_BYTES.length / MO * 10) / 10).toString().replace('.', ',')} Mo · place fermée · fichier gardé · 14/10`, `résumé : « ${sum} »`);
  await row.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(250);
  const note = await txt(row.locator('[data-testid=tr-leftover-note]'));
  check(note === 'Ce fichier est arrivé, mais la vidéo n’a pas été publiée : les salariés ne la voient pas. Le fichier est gardé et compte dans les 100 Mo.', `explication : « ${note} »`);
  check(await row.locator('[data-testid=tr-archive], [data-testid=tr-restore]').count() === 0, 'aucun « Retirer » ni « Remettre » : il n’y a rien à retirer (pas publié) ni à effacer');
  const ns = signs.length;
  await row.locator('[data-testid=tr-watch]').click();
  await op.waitForSelector('[data-testid=video-el]');
  check(signs.length === ns + 1 && signs[ns].path === LEFT_PATH && signs[ns].expiresIn === 600 && await waitFor(() => op.locator('[data-testid=video-el]').evaluate((e) => e.readyState >= 1), 8000), '« Regarder » : le bureau peut vérifier ce que contient le fichier (lien 10 min)');
  await shot(dlg(), 'apres-bureau-envoi-non-termine');
  // Aucun salarié ne le voit.
  check(myVideos(SAM).every((v) => v.file_path !== LEFT_PATH) && !readable(SAM, LEFT_PATH), 'les salariés ne voient pas ce fichier (ni liste, ni lien de lecture)');
  // La jauge l’explique : tout ce qui est arrivé est compté.
  await op.click('[data-testid=tr-cancel]').catch(() => {});
  await closeDlg(); await openTrainings();
  await openUpload();
  const want = Math.round((38 * MO + VIDEO_BYTES.length * 2 + 24 * MO + 24 * MO) / MO);
  check(usedMo() === want, `la jauge compte le fichier gardé : ${usedMo()} Mo lus (attendu ${want})`);
  await op.click('[data-testid=tr-cancel]');
  await closeDlg();
}

// ═══ T · téléphone de 360 px ════════════════════════════════════════════════
section('T · téléphone de 360 px : le bureau et le salarié tiennent sans défilement horizontal');
{
  const mob = await newCtx(ADMIN, { width: 360, height: 780 });
  const mp = track(await mob.newPage(), 'bureau mobile');
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card, .bt-pl-m-ibtn', { timeout: 25000 }); await mp.waitForTimeout(1200);
  await mp.locator('button[aria-label="Menu"]').first().click(); await mp.waitForSelector('.bt-mm-sheet'); await mp.waitForTimeout(400);
  await mp.click('[data-testid=mm-trainings]'); await mp.waitForSelector('[data-testid=trainings-dialog]'); await mp.waitForTimeout(800);
  const fitsD = () => mp.locator('[data-testid=trainings-dialog]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  await mp.click('[data-testid=tr-show-archived]'); await mp.waitForTimeout(250);
  await mp.locator('[data-kind=leftover] [data-testid=tr-head]').click(); await mp.waitForTimeout(250);
  check(await fitsD(), 'liste avec un « envoi non terminé » ouvert : pas de défilement horizontal (360 px)');
  await mp.locator('[data-kind=leftover] [data-testid=tr-leftover-note]').scrollIntoViewIfNeeded(); await mp.waitForTimeout(200);
  await shot(mp, 'apres-bureau-telephone-envoi-non-termine');
  await openUpload(mp);
  check(await fitsD(), 'rangée de choix : pas de défilement horizontal (360 px)');
  await mp.setInputFiles('[data-testid=tr-file]', F_FILM); await mp.waitForSelector('[data-testid=tr-preview]'); await mp.waitForTimeout(600);
  check(await fitsD(), 'fenêtre d’envoi (aperçu compris) : pas de défilement horizontal (360 px)');
  await shot(mp, 'apres-bureau-telephone');
  await mob.close();

  const wm = await newCtx(SAM, { width: 360, height: 740 });
  const w3 = track(await wm.newPage(), 'salarié 360');
  await openWorker(w3); await openWorkerTrainings(w3);
  const row = w3.locator('[data-testid=training-row]', { hasText: 'Montage de l’échafaudage' });
  await row.locator('[data-testid=training-watch]').click();
  await w3.waitForSelector('[data-testid=video-el]', { timeout: 8000 }); await w3.waitForTimeout(500);
  const wfit = await w3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
  const vb = await w3.locator('[data-testid=video-el]').evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  check(wfit && vb, 'salarié (360 px) : liste et lecteur tiennent dans l’écran, sans défilement horizontal');
  await shot(w3, 'apres-salarie-telephone-360');
  await wm.close();
}

// ═══ X2 · plafond de nouvelles places ═══════════════════════════════════════
section('X2 · au plus 3 nouvelles places par tranche de 3 h : message clair, rien n’est envoyé');
{
  await openOffice(); await openTrainings();
  const send = async (titre) => {
    await openUpload();
    await op.fill('[data-testid=tr-title]', titre);
    await op.setInputFiles('[data-testid=tr-file]', F_FILM);
    await op.waitForSelector('[data-testid=tr-file-ready]');
    await op.click('[data-testid=tr-save]');
  };
  // Deux places sont déjà dans la tranche (la fermée et la publiée de X1) : une troisième passe.
  await send('Troisième envoi');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 20000);
  check(D.training_videos.some((v) => v.title === 'Troisième envoi' && v.published_at), 'la 3ᵉ place de la tranche passe');
  await send('Quatrième envoi');
  await waitFor(async () => (await op.locator('[data-testid=tr-error]').count()) > 0, 8000);
  const msg = await txt(op.locator('[data-testid=tr-error]'));
  check(/^Déjà trois envois de vidéo préparés ces 3 dernières heures dans votre entreprise\. Réessayez dans environ (\d+ min|\d+ h|\d+ h \d\d)\.$/.test(msg), `la 4ᵉ est refusée : « ${msg} »`);
  const n = writes.length;
  check(!D.training_videos.some((v) => v.title === 'Quatrième envoi') && !of(since(n), 'PUT').length, 'aucune place créée, aucun octet envoyé');
  check(await op.locator('[data-testid=tr-file-ready]').count() === 1 && !(await op.locator('[data-testid=tr-save]').isDisabled()), 'le fichier reste choisi : on pourra réessayer plus tard');
  await shot(dlg(), 'apres-bureau-trop-denvois');
  await op.click('[data-testid=tr-cancel]');
  await closeDlg();
}

// ═══ Fin ═════════════════════════════════════════════════════════════════════
section('Fin');
check(errors.length === 0, `aucune erreur de page (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' ; ')}` : ''})`);
check(!writes.some((w) => w.m === 'DELETE' || /remove/i.test(w.t || '')), 'aucun DELETE, aucune suppression de fichier de tout le test');
check(!writes.some((w) => ['planning', 'time_entries', 'active_sessions'].includes(w.t)), 'aucune écriture d’heures ni de planning');
check(!writes.some((w) => w.m === 'FN' && EMAIL_FNS.includes(w.t)), 'aucune fonction d’e-mail');
{
  let m = 0; for (const p of pages) { try { m += await p.evaluate(() => window.__mailto || 0); } catch { /* fermée */ } }
  check(m === 0, 'aucun « mailto: »');
  const src = ['lib/training-videos.ts', 'components/training-video-upload.tsx', 'components/training-video-player.tsx'].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  check(src.length > 0 && !/<iframe|mailto|service_role|\.remove\(/i.test(code), 'le code du lot : ni iframe, ni mailto, ni clé de service, ni suppression de fichier');
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(`Échecs :\n - ${fails.join('\n - ')}`);
await b.close(); srv.close(); store.close();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
