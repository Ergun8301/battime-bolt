// « Filmer dans BEMEXO », alerte HEVC et fichiers à vérifier (lot 14, oct. 2026), sur
// la VRAIE page « Formations » du bureau (/admin). Copié du décor du lot 13
// (scripts/tests/videos-lot13.mjs, qui n'est pas modifié) : base simulée partagée
// par les navigateurs, faux stockage HTTPS qui reçoit de vrais octets, règles du SQL
// rejouées. Aucune vraie base, aucun e-mail. Horloge figée au mercredi 14 octobre
// 2026, 10:00 à Paris (donc le minuteur de l'enregistreur utilise performance.now()).
// Noms fictifs.
//
// Chromium est lancé avec la caméra et le micro FACTICES (--use-fake-device-for-media-stream,
// --use-fake-ui-for-media-stream) : les enregistrements sont de vrais WebM produits par
// le vrai MediaRecorder, à partir d'une image de test. Des espions (addInitScript)
// notent les contraintes de getUserMedia, les options du MediaRecorder, les demandes de
// Wake Lock et les pistes ouvertes.
//
// Lancer : npm run build, puis
//   node scripts/tests/enregistreur-lot14.mjs out docs/captures-enregistreur [port]
// (port par défaut 42110 ; le faux stockage HTTPS = port + 1 ; plage 42100-42199.
// playwright-core doit être résoluble ; openssl sert à fabriquer un certificat jetable.)
//
//   R0  sans la migration du lot 14 : une lecture de video_files_audit (404 PGRST202), aucune section, le lot 13 intact
//   R1  présence du bouton « Filmer dans BEMEXO » (et ses absences) ; « Filmer » et « Choisir un fichier » intacts
//   R2  prise complète : contraintes, options, aperçu, durée, envoi par le chemin du lot 13
//   R3  arrêt automatique par la taille, avec compte à rebours
//   R4  autorisations refusées : messages exacts, repli sur « Choisir un fichier »
//   R5  caméra coupée en cours de prise : la prise est gardée ; aucun octet : échec clair
//   R6  nettoyage : fermeture, changement d'onglet, « Annuler », « Abandonner », caméra lente
//   R7  écran allumé (Wake Lock) : au clic, redemandé, relâché ; refus et API absente sans bruit
//   R8  minuteur sous horloge figée
//   R9  alerte HEVC : fixtures binaires fabriquées ici
//   R10 fichiers à vérifier : lecture seule
//   R11 captures à 390 px (zones de toucher de 44 px)
//   R12 une prise refusée ne laisse pas son message d’arrêt au fichier suivant
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process'; import crypto from 'node:crypto';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-enregistreur', PORT = '42110'] = process.argv;
const HTTPS_PORT = Number(PORT) + 1;
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'enregistreur-lot14-'));
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
let MAXB = 50 * MO;
const QUOTA = 100 * MO;
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
let AUDIT = 'oui'; // 'non' : migration du lot 14 pas appliquée (video_files_audit → 404 PGRST202)
const auditCalls = []; // chaque lecture de video_files_audit et la réponse donnée
const auditDelays = []; // délais (ms) imposés aux prochaines réponses : une lecture lente qui arrive après une plus récente
let pushSent = 1;
let UP_MODE = 'normal'; // 'normal' | 'hold' | 'cut'
let holdRelease = null;
let MEDIA_FAIL = 0; // les N prochaines lectures du fichier échouent (lien expiré)
let PUBLISH_FAIL = 0; // les N prochaines publications échouent (réseau coupé après l'arrivée du fichier)
let LIMITS_LIE = null; // la jauge affiche moins que la vérité (pour prouver la garde de la base)
let VIDEO_BYTES = Buffer.alloc(0); // une vraie petite vidéo WebM (fabriquée au début)
const D = {};
const OBJ = new Map(); // stockage « formations » : chemin → { size, mime, bytes }
const OBJ_AT = new Map(); // chemin → date d'arrivée du fichier (ISO)
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
  UP_MODE = 'normal'; MEDIA_FAIL = 0; LIMITS_LIE = null; PUBLISH_FAIL = 0; MAXB = 50 * MO; OBJ_AT.clear();
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
/** video_files_audit : les règles du SQL rejouées (supabase/tests/videos_fichiers_audit.mjs les prouve sur un vrai Postgres). */
function auditRows(uid) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau de l\'entreprise.', '42501', 403);
  const orph = [...OBJ].filter(([p]) => p.startsWith(`${CO}/`) && !p.endsWith('/.emptyFolderPlaceholder') && !D.training_videos.some((v) => v.file_path === p))
    .map(([p, o]) => ({ p, size: o.size, at: OBJ_AT.get(p) || NOW.toISOString() })).sort((a, z) => z.at.localeCompare(a.at));
  const sum = orph.reduce((s, o) => s + o.size, 0);
  const miss = D.training_videos.filter((v) => v.company_id === CO && v.published_at && !OBJ.has(v.file_path)).sort((a, z) => z.published_at.localeCompare(a.published_at));
  return [
    ...orph.slice(0, 100).map((o) => ({ kind: 'fichier_sans_formation', video_id: null, title: null, file_path: o.p, real_bytes: o.size, occurred_at: o.at, archived: null, total_n: orph.length, total_bytes: sum })),
    ...miss.slice(0, 100).map((v) => ({ kind: 'formation_sans_fichier', video_id: v.id, title: v.title, file_path: v.file_path, real_bytes: v.size_bytes ?? 0, occurred_at: v.published_at, archived: !!v.archived_at, total_n: miss.length, total_bytes: 0 })),
  ];
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
  args: [`--host-resolver-rules=MAP sdperbcquvneohotjono.supabase.co 127.0.0.1:${HTTPS_PORT}`, '--ignore-certificate-errors', '--no-proxy-server',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], // caméra et micro factices de Chromium
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
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'], ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...extra });
  const session = sessionFor(uid);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.addInitScript(() => {
    // Espions du lot 14 : contraintes de la caméra, options du MediaRecorder, Wake Lock, pistes ouvertes.
    const R = window.__rec = { gum: [], mr: [], wake: [], sentinels: [], tracks: [], recorders: [], fail: null, delay: 0, noData: false, inflate: 0, wakeMode: 'ok', sawCountdown: false, counts: new Set(), announces: new Set(), finished: 0 };
    R.reset = () => { R.gum.length = 0; R.mr.length = 0; R.wake.length = 0; R.sentinels.length = 0; R.tracks.length = 0; R.recorders.length = 0; R.fail = null; R.delay = 0; R.noData = false; R.inflate = 0; R.wakeMode = 'ok'; R.sawCountdown = false; R.counts.clear(); R.announces.clear(); };
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const real = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        R.gum.push(JSON.parse(JSON.stringify(c)));
        if (R.delay) await new Promise((r) => setTimeout(r, R.delay));
        if (R.fail) throw new DOMException('refus simulé', R.fail);
        const s = await real(c);
        s.getTracks().forEach((t) => R.tracks.push(t));
        return s;
      };
    }
    const Orig = window.MediaRecorder;
    if (Orig) {
      window.MediaRecorder = class extends Orig {
        constructor(s, o) { super(s, o); R.mr.push(o ? JSON.parse(JSON.stringify(o)) : null); R.recorders.push(this); }
        set ondataavailable(f) { super.ondataavailable = R.noData ? (e) => f({ data: new Blob([]) }) : R.inflate ? (e) => f({ data: new Blob([e.data, new Uint8Array(R.inflate)]) }) : f; }
        get ondataavailable() { return super.ondataavailable; }
      };
    }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, get() {
      if (R.wakeMode === 'absent') return undefined;
      return { request: async (t) => {
        R.wake.push(t);
        if (R.wakeMode === 'deny') throw new DOMException('refusé', 'NotAllowedError');
        const s = { type: t, released: false, release: async () => { s.released = true; } };
        R.sentinels.push(s);
        return s;
      } };
    } });
    // Les textes sont relevés DANS la page à chaque changement du DOM : le test ne dépend plus de la cadence d'interrogation (machine chargée).
    new MutationObserver(() => {
      const c = document.querySelector('[data-testid=tr-rec-countdown]');
      if (c) { R.sawCountdown = true; R.counts.add((c.textContent || '').trim()); }
      const a = (document.querySelector('[data-testid=tr-rec-announce]')?.textContent || '').trim();
      if (a) R.announces.add(a);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
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
      if (fn === 'video_files_audit') {
        if (AUDIT !== 'oui') { auditCalls.push({ by: uid, answer: 'PGRST202' }); return r.fulfill(MISSING_FN(fn)); }
        try {
          const rows = auditRows(uid); auditCalls.push({ by: uid, answer: 'ok', n: rows.length });
          const wait = auditDelays.shift() || 0; if (wait) await new Promise((res) => setTimeout(res, wait)); // réponse calculée maintenant, livrée plus tard
          return r.fulfill({ json: rows });
        } catch (e) { auditCalls.push({ by: uid, answer: e.code }); return fail(e); }
      }
      if (fn === 'my_trainings') return r.fulfill({ json: myTrainings(uid) });
      if (fn === 'set_training_seen') return r.fulfill({ json: NOW.toISOString() });
      if (LOT13_FNS.has(fn)) {
        if (MIG !== 'oui') return r.fulfill(MISSING_FN(fn));
        try {
          if (fn === 'training_video_limits') return r.fulfill({ json: limitsOf(uid) });
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
const check = (c, m) => { if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => { console.log(`\n═══ ${t}`); };
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
  await p.getByRole('button', { name: 'Mon compte et menu' }).click(); await p.waitForSelector('[role=menu]'); await p.waitForTimeout(250);
  await p.click('[data-testid=menu-formations]'); await p.waitForSelector('[data-testid=trainings-list]'); await p.waitForTimeout(700);
};
const openUpload = async (p = op) => {
  await p.click('[data-testid=tr-add-open]'); await p.click('[data-testid=tr-kind-upload]');
  await p.waitForSelector('[data-testid=tr-upload]'); await waitFor(async () => !(await txt(p.locator('[data-testid=tr-quota]'))).includes('…'));
};


// ─── Outils du lot 14 ─────────────────────────────────────────────────────────
// ONLY=R2,R3 rejoue seulement ces scénarios (mise au point) ; sans ONLY, tout est rejoué.
const want = (id) => !process.env.ONLY || process.env.ONLY.split(',').includes(id);
const MSG = {
  refus: 'L’appareil photo ou le micro est refusé. Autorisez-les pour BEMEXO dans les réglages du navigateur (sur iPhone : le bouton « aA » de la barre d’adresse, puis « Réglages du site »), puis réessayez. Vous pouvez aussi toucher « Filmer » ou « Choisir un fichier ».',
  absente: 'Aucune caméra n’a été trouvée sur cet appareil. Touchez « Choisir un fichier ».',
  prise: 'La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.',
  autre: 'La caméra n’a pas pu démarrer. Touchez « Filmer » ou « Choisir un fichier ».',
  echec: 'L’enregistrement a échoué. Réessayez, ou touchez « Filmer ».',
  cut: 'L’enregistrement s’est arrêté (caméra interrompue). Ce qui a été filmé est gardé.',
  size: 'L’enregistrement s’est arrêté tout seul : la taille maximale est atteinte. La vidéo est gardée.',
  gps: 'Filmée dans BEMEXO : aucune position GPS n’est ajoutée à la vidéo.',
  hint: '« Filmer dans BEMEXO » : image 720p, jusqu’à 4 minutes, lisible partout. « Filmer » : l’appareil photo du téléphone, qualité maximale mais fichier plus lourd.',
  hevc: 'Cette vidéo est au format HEVC (le format récent des iPhone). Elle peut ne pas se lire sur certains téléphones Android ou ordinateurs.',
  hevcRec: 'Conseil : touchez « Changer de vidéo », puis « Filmer dans BEMEXO », qui produit un format lisible partout.',
  hevcNoRec: 'Conseil : sur l’iPhone, choisissez Réglages > Appareil photo > Formats > « Le plus compatible », puis filmez à nouveau.',
  hevcKeep: 'Vous pouvez quand même ajouter cette vidéo.',
};
const rec = (p) => p.evaluate(() => ({
  gum: window.__rec.gum, mr: window.__rec.mr, wake: window.__rec.wake, sentinels: window.__rec.sentinels.map((s) => s.released),
  tracks: window.__rec.tracks.map((t) => t.readyState), recorders: window.__rec.recorders.map((r) => r.state), sawCountdown: window.__rec.sawCountdown, counts: [...window.__rec.counts], announces: [...window.__rec.announces],
}));
const recReset = (p, patch = {}) => p.evaluate((x) => { window.__rec.reset(); Object.assign(window.__rec, x); }, patch);
const fits = (p) => p.evaluate(() => {
  const d = document.querySelector('[data-testid=trainings-dialog]');
  return document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1 && (!d || d.scrollWidth <= d.clientWidth + 1);
});
const noCam = (s) => s.tracks.every((x) => x === 'ended') && s.recorders.every((x) => x === 'inactive') && s.sentinels.every((x) => x === true);
const fresh = async (opts = {}) => {
  MIG = 'oui'; AUDIT = opts.audit ?? 'oui'; freshDb();
  if (opts.limitsLie != null) LIMITS_LIE = opts.limitsLie;
  if (opts.maxBytes) MAXB = opts.maxBytes;
};
const beginUpload = async (p = op, { reload = true } = {}) => {
  if (reload) await openOffice(p);
  await openTrainings(p);
  await openUpload(p);
};
const startRecording = async (p = op) => {
  await p.click('[data-testid=tr-rec-open]');
  await p.waitForSelector('[data-testid=tr-rec-start]', { timeout: 10000 });
  await p.click('[data-testid=tr-rec-start]');
  await p.waitForSelector('[data-testid=tr-rec-stop]');
};
/** « Abandonner » : après quelques secondes de prise, la question « Jeter cette prise ? » demande une confirmation. */
const abandon = async (p = op) => {
  await p.click('[data-testid=tr-rec-abort]');
  if (await waitFor(async () => (await p.locator('[data-testid=tr-rec-abort-yes]').count()) > 0, 400)) await p.click('[data-testid=tr-rec-abort-yes]');
};
const focusId = (p = op) => p.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
const heightOf = (loc) => loc.evaluate((e) => (e.closest('label') || e).getBoundingClientRect().height);
const uuid = () => crypto.randomUUID();
/** Un fichier arrivé dans le dossier de l'entreprise, sans formation. */
const orphan = (size, at, co = CO) => { const p = `${co}/${uuid()}`; OBJ.set(p, { size, mime: 'video/webm', bytes: null }); OBJ_AT.set(p, at); return p; };

// ─── Fixtures binaires (HEVC / H.264) ────────────────────────────────────────
const u32 = (n) => { const x = Buffer.alloc(4); x.writeUInt32BE(n >>> 0); return x; };
const bx = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
const entry = (fmt) => Buffer.concat([u32(86), Buffer.from(fmt, 'latin1'), Buffer.alloc(78)]);
const stsd = (...fmts) => bx('stsd', u32(0), u32(fmts.length), ...fmts.map(entry));
const moovOf = (...tables) => bx('moov', bx('mvhd', Buffer.alloc(100)), ...tables.map((f) => bx('trak', bx('tkhd', Buffer.alloc(84)), bx('mdia', bx('minf', bx('stbl', stsd(...f)))))));
const ftyp = (brand) => bx('ftyp', Buffer.from(brand, 'latin1'), u32(0), Buffer.from(brand, 'latin1'));
const mdat = (n) => bx('mdat', Buffer.alloc(n, 0x2a));
const FIX = {
  movFin: path.join(TMP, 'IMG_0001.MOV'), movDebut: path.join(TMP, 'IMG_0002.MOV'), mp4Hevc: path.join(TMP, 'android-hevc.mp4'),
  movH264: path.join(TMP, 'IMG_0003.MOV'), octets: path.join(TMP, 'IMG_0004.MOV'), court: path.join(TMP, 'IMG_0005.MOV'),
};
fs.writeFileSync(FIX.movFin, Buffer.concat([ftyp('qt  '), mdat(2 * MO), moovOf(['hvc1'], ['mp4a'])]));
fs.writeFileSync(FIX.movDebut, Buffer.concat([ftyp('qt  '), moovOf(['mp4a'], ['hvc1']), mdat(2 * MO)]));
fs.writeFileSync(FIX.mp4Hevc, Buffer.concat([ftyp('isom'), moovOf(['hev1']), mdat(50000)]));
fs.writeFileSync(FIX.movH264, Buffer.concat([ftyp('qt  '), mdat(2 * MO), moovOf(['avc1'], ['mp4a'])]));
fs.writeFileSync(FIX.octets, Buffer.alloc(5000, 7));
fs.writeFileSync(FIX.court, Buffer.from([1, 2, 3]));

// ═══ R0 · la migration du lot 14 n'est pas appliquée ═════════════════════════
section('R0 · sans la migration du lot 14 : une lecture en échec, aucune section, aucun message, le lot 13 intact');
if (want('R0')) {
  await fresh({ audit: 'non' });
  const g0 = gets.length; auditCalls.length = 0;
  await openOffice(); await openTrainings();
  await op.waitForTimeout(600);
  check(auditCalls.length === 1 && auditCalls[0].answer === 'PGRST202', `une seule lecture de video_files_audit à l’ouverture, réponse 404 PGRST202 (${JSON.stringify(auditCalls)})`);
  check(gets.slice(g0).filter((g) => g.t === 'rpc/video_files_audit').every((g) => !g.missing), 'le lot 13 n’est pas déclaré absent (missing non posé)');
  check(await op.locator('[data-testid=tr-audit-toggle]').count() === 0, 'aucune section « Fichiers vidéo à vérifier »');
  const text = await txt(dlg());
  const bad = text.match(/PGRST|Could not find|Impossible|erreur|à vérifier/i);
  const alerts = await dlg().locator('[role=alert]').evaluateAll((els) => els.map((e) => `${e.tagName}:${(e.textContent || '').slice(0, 60)}`));
  check(!bad && alerts.length === 0, `aucun texte d’erreur dans la fenêtre${alerts.length ? ` (role=alert : ${alerts.join(' ; ')})` : ''}${bad ? ` (« ${bad[0]} » dans « ${text.slice(Math.max(0, bad.index - 40), bad.index + 60)} »)` : ''}`);
  const titles = await op.locator('[data-testid=tr-item] [data-testid=tr-title-text]').allInnerTexts();
  check(titles.join('|') === 'Montage de l’échafaudage|Gestes et postures|Livret sécurité chantier', `la liste du lot 13 est là (${titles.join(' · ')})`);
  await op.click('[data-testid=tr-add-open]');
  check((await op.locator('[data-testid=tr-kind-upload]').count()) === 1, 'l’option « Vidéo (téléphone ou fichier) » existe toujours');
  await closeDlg();
  const t0 = gets.filter((g) => g.t === 'training_videos').length;
  await openTrainings();
  await op.waitForTimeout(500);
  check(gets.filter((g) => g.t === 'training_videos').length > t0, 'rouvrir : training_videos est relue (le lot 13 continue de fonctionner)');
  check(auditCalls.length === 1, 'rouvrir : video_files_audit n’est pas redemandée (absence connue le temps de la page)');
  await closeDlg();
}

// ═══ R1 · le bouton ═════════════════════════════════════════════════════════
section('R1 · « Filmer dans BEMEXO » : présent, et absent quand il ne peut pas marcher');
if (want('R1')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload();
  check(await op.locator('[data-testid=tr-rec-open]').isVisible(), 'bouton visible');
  check((await txt(op.locator('[data-testid=tr-rec-open]'))) === 'Filmer dans BEMEXO', 'libellé « Filmer dans BEMEXO »');
  check((await txt(op.locator('[data-testid=tr-rec-hint]'))) === MSG.hint, 'explication sous les boutons');
  const order = await op.locator('.bt-fo-pick > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') || e.querySelector('[data-testid]')?.getAttribute('data-testid')));
  check(order.join('|') === 'tr-rec-open|tr-film|tr-file', `ordre : Filmer dans BEMEXO, Filmer, Choisir un fichier (${order.join(' | ')})`);
  const film = await op.locator('[data-testid=tr-film]').evaluate((e) => ({ accept: e.accept, capture: e.getAttribute('capture'), label: e.closest('label').innerText.trim() }));
  check(film.accept === 'video/*' && film.capture === 'environment' && film.label === 'Filmer', `« Filmer » inchangé (${JSON.stringify(film)})`);
  check((await op.locator('[data-testid=tr-file]').getAttribute('accept')).includes('video/mp4') && !(await op.locator('[data-testid=tr-file]').getAttribute('capture')), '« Choisir un fichier » inchangé');
  check((await txt(op.locator('[data-testid=tr-upload]'))).includes('MP4, MOV ou WebM · 50 Mo maximum'), 'le rappel « MP4, MOV ou WebM · 50 Mo maximum » reste');
  await op.click('[data-testid=tr-cancel]'); await closeDlg();

  const absent = async (nom, prepare, opts = {}) => {
    await fresh(opts);
    await openOffice(); await openTrainings();
    await prepare();
    await op.click('[data-testid=tr-add-open]'); await op.click('[data-testid=tr-kind-upload]');
    await op.waitForSelector('[data-testid=tr-upload]'); await waitFor(async () => !(await txt(op.locator('[data-testid=tr-quota]'))).includes('…'));
    await op.waitForTimeout(250);
    check(await op.locator('[data-testid=tr-rec-open]').count() === 0 && await op.locator('[data-testid=tr-rec-hint]').count() === 0, `${nom} : ni bouton ni explication`);
    check(await op.locator('[data-testid=tr-film]').count() === 1 && await op.locator('[data-testid=tr-file]').count() === 1, `${nom} : « Filmer » et « Choisir un fichier » restent`);
    await op.click('[data-testid=tr-cancel]'); await closeDlg();
  };
  await absent('MediaRecorder absent', () => op.evaluate(() => { delete window.MediaRecorder; }));
  await absent('aucun type accepté', () => op.evaluate(() => { window.MediaRecorder.isTypeSupported = () => false; }));
  await absent('« video/mp4 » seul accepté (jamais sans codec)', () => op.evaluate(() => { window.MediaRecorder.isTypeSupported = (t) => t === 'video/mp4'; }));
  await absent('contexte non sécurisé', () => op.evaluate(() => { Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }); }));
  await absent('getUserMedia absent', () => op.evaluate(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: undefined, configurable: true }); }));
  await absent('moins de 2 Mo de place', async () => { }, { limitsLie: 99 * MO });
  await recReset(op);
}

// ═══ R2 · une prise complète ════════════════════════════════════════════════
section('R2 · prise complète : contraintes, options, aperçu, durée, envoi par le chemin du lot 13');
let takeBytes = 0;
{
  await fresh();
  await openOffice(); await openTrainings(); await openUpload();
  await recReset(op);
  const W0 = writes.length;
  await op.click('[data-testid=tr-rec-open]');
  await op.waitForSelector('[data-testid=tr-rec-start]', { timeout: 10000 });
  const live = await op.locator('[data-testid=tr-rec-live]').evaluate((v) => ({ muted: v.muted, inline: v.hasAttribute('playsinline'), auto: v.autoplay, src: !!v.srcObject, label: v.getAttribute('aria-label'), w: v.getBoundingClientRect().width }));
  check(live.muted && live.inline && live.auto && live.src && live.label === 'Aperçu de la caméra', `aperçu direct muted, playsInline, autoplay (${JSON.stringify(live)})`);
  check(await focusId() === 'tr-rec-start', 'le focus est sur « Démarrer »');
  check((await txt(op.locator('[data-testid=tr-rec-cancel]'))) === 'Fermer la caméra' && (await txt(op.locator('[data-testid=tr-cancel]'))) === 'Annuler', 'deux boutons qui ne se confondent pas : « Fermer la caméra » (caméra) et « Annuler » (formulaire)');
  check((await rec(op)).wake.length === 0, 'écran allumé : rien n’est demandé à l’ouverture de la caméra');
  await op.click('[data-testid=tr-rec-start]');
  await op.waitForSelector('[data-testid=tr-rec-stop]');
  check(await focusId() === 'tr-rec-stop', 'le focus passe sur « Arrêter » quand « Démarrer » disparaît');
  check((await txt(op.locator('[data-testid=tr-upload]'))).includes('Durée maximale : 4 min') && (await txt(op.locator('[data-testid=tr-upload]'))).includes('Enregistrement en cours'), '« Enregistrement en cours » et « Durée maximale : 4 min »');
  check(await op.locator('[data-testid=tr-rec-countdown]').count() === 0, 'pas de compte à rebours au début');
  await op.waitForTimeout(3000);
  const t3 = await txt(op.locator('[data-testid=tr-rec-timer]'));
  check(/^0:0[2-4]$/.test(t3), `minuteur après ~3 s : « ${t3} »`);
  await op.click('[data-testid=tr-rec-stop]');
  await op.waitForSelector('[data-testid=tr-preview]', { timeout: 10000 });
  check(await focusId() === 'tr-file-change', 'la prise terminée : le focus passe sur « Changer de vidéo »');
  await waitFor(async () => /\d s/.test(await txt(op.locator('[data-testid=tr-file-meta]'))), 4000);
  const meta = await txt(op.locator('[data-testid=tr-file-meta]'));
  const secs = Number(/^(\d+) s/.exec(meta)?.[1]);
  check(secs >= 2 && secs <= 6, `durée mesurée par le minuteur : « ${meta} »`);
  const name = await txt(op.locator('.bt-fo-fname'));
  check(/^filmer-bemexo-20261014-1000\.webm$/.test(name), `nom du fichier : « ${name} » (heure locale, horloge figée)`);
  check((await txt(op.locator('[data-testid=tr-gps-note]'))) === MSG.gps, 'note : « Filmée dans BEMEXO : aucune position GPS n’est ajoutée à la vidéo. »');
  check(await op.locator('[data-testid=tr-hevc-alert]').count() === 0, 'aucune alerte HEVC sur une prise de l’enregistreur');
  check(await op.locator('[data-testid=tr-rec-auto]').count() === 0, 'arrêt manuel : pas de message d’arrêt automatique');
  const s = await rec(op);
  const c = s.gum[0] || {};
  check(c.video?.facingMode?.ideal === 'environment' && c.video?.width?.ideal === 1280 && c.video?.height?.ideal === 720 && c.video?.frameRate?.ideal === 30 && c.video?.frameRate?.max === 30 && c.audio?.echoCancellation === true && c.audio?.noiseSuppression === true,
    `getUserMedia : caméra arrière, 1280×720, 30 images/s, audio (${JSON.stringify(c)})`);
  check(!JSON.stringify(c).includes('"exact"'), 'jamais de contrainte « exact »');
  const o = s.mr[0] || {};
  check(o.videoBitsPerSecond === 1500000 && o.audioBitsPerSecond === 64000 && /^video\/(webm|mp4);codecs=/.test(o.mimeType || '') , `MediaRecorder : 1,5 Mbit/s vidéo, 64 kbit/s audio, type avec codec (${JSON.stringify(o)})`);
  check(s.tracks.length > 0 && s.tracks.every((x) => x === 'ended') && s.recorders.every((x) => x === 'inactive') && s.sentinels.every((x) => x === true), 'caméra, micro et écran allumé relâchés dès l’arrêt');
  check(writes.length === W0, 'rien n’a été écrit ni envoyé avant « Ajouter »');
  await shot(dlg(), 'enregistreur-apercu-apres-prise');
  // « Ajouter » : le chemin du lot 13, tel quel.
  await op.fill('[data-testid=tr-title]', 'Consigne filmée');
  const n = writes.length;
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 20000);
  const w = since(n);
  const order = w.filter((x) => ['RPC', 'SIGN-UP', 'PUT', 'FN'].includes(x.m)).map((x) => (x.m === 'RPC' || x.m === 'FN' ? x.t : x.m));
  check(order.join(' → ') === 'start_training_video → SIGN-UP → PUT → publish_training_video → send-push', `ordre des appels : ${order.join(' → ')}`);
  const st = of(w, 'RPC', 'start_training_video')[0]?.body || {};
  const put = of(w, 'PUT')[0];
  const got = uploads.find((x) => x.path === put?.path);
  takeBytes = got?.size || 0;
  check(st.p_mime === 'video/webm' && !String(st.p_mime).includes(';') && st.p_size === got?.size && Math.abs(st.p_duration - secs) <= 1,
    `start_training_video : type de base (sans « ; »), taille exacte du fichier, durée ≈ minuteur (${JSON.stringify(st)})`);
  check(got?.mime === 'video/webm' && got.size > 0, `le faux stockage a reçu le PUT (${got?.size} octets, ${got?.mime})`);
  check(D.training_videos.some((v) => v.title === 'Consigne filmée' && v.published_at && v.size_bytes === got?.size && v.duration_s === st.p_duration), 'vidéo publiée avec sa durée');
  check(w.every((x) => ['RPC', 'SIGN-UP', 'PUT', 'FN'].includes(x.m)) && !w.some((x) => x.t === 'documents' || x.t === 'planning' || x.t === 'time_entries'), 'aucune écriture hors du chemin du lot 13');
  // Débit réel de la caméra factice, à côté du nominal (195 500 octets/s).
  console.log(`   (mesure : ${got?.size} octets en ~${secs} s, soit ~${Math.round((got?.size || 0) / Math.max(1, st.p_duration || secs))} octets/s ; nominal 195 500)`);
}

// ═══ R3 · arrêt automatique par la taille ═══════════════════════════════════
section('R3 · arrêt automatique avant le plafond de taille, avec compte à rebours');
// 2,2 Mo : en dessous de 2 Mo de place, le bouton n'est pas proposé (REC_MIN_ROOM_BYTES) ; le contrat disait 400 000 octets.
const SMALL_MAX = 2 * MO + 100000;
if (want('R3')) {
  await fresh({ maxBytes: SMALL_MAX });
  await openOffice(); await openTrainings(); await openUpload(); await recReset(op);
  const t0 = Date.now();
  // 2,2 Mo de place : la durée annoncée est la vraie (10 s), pas « 4 minutes ».
  check((await txt(op.locator('[data-testid=tr-rec-hint]'))).includes('jusqu’à environ 10 s') && !(await txt(op.locator('[data-testid=tr-rec-hint]'))).includes('4 minutes'), 'aide : « jusqu’à environ 10 s » quand la place restante est petite');
  await startRecording();
  check((await txt(op.locator('[data-testid=tr-rec-max]'))) === 'Durée maximale : environ 10 s', 'pendant la prise : « Durée maximale : environ 10 s »');
  let sawTimer = false;
  const stopped = await waitFor(async () => {
    if (await op.locator('[data-testid=tr-rec-timer]').count()) sawTimer = true;
    return (await op.locator('[data-testid=tr-rec-auto]').count()) > 0;
  }, 120000);
  check(stopped && sawTimer, `la prise s’arrête toute seule (${Math.round((Date.now() - t0) / 1000)} s)`);
  check((await txt(op.locator('[data-testid=tr-rec-auto]'))) === MSG.size, 'message : « … la taille maximale est atteinte. La vidéo est gardée. »');
  check((await rec(op)).sawCountdown, 'le compte à rebours « Arrêt automatique dans N s » a été visible avant l’arrêt');
  const fin = await rec(op);
  check(fin.announces.length >= 1 && fin.announces.length <= 3 && fin.announces.length < fin.counts.length, `lecteur d’écran : ${fin.announces.length} annonce(s) seulement (30, 10, 5 s) pour ${fin.counts.length} textes affichés (${fin.announces.join(' | ')})`);
  await op.waitForSelector('[data-testid=tr-preview]');
  const size = Math.round(Number(String(await txt(op.locator('[data-testid=tr-file-meta]'))).match(/([\d,]+) Mo/)?.[1].replace(',', '.')) * MO);
  const last = uploads.length;
  check(await op.locator('[data-testid=tr-file-error]').count() === 0 && await op.locator('[data-testid=tr-file-ready]').count() === 1, 'le fichier est accepté : aucun « Vidéo trop lourde »');
  check(await op.locator('[data-testid=tr-rec-auto]').getAttribute('role') === 'status', 'message annoncé (role=status)');
  await op.fill('[data-testid=tr-title]', 'Prise courte');
  await op.click('[data-testid=tr-save]');
  await waitFor(async () => (await op.locator('[data-testid=tr-form]').count()) === 0, 20000);
  const got = uploads[last];
  check(!!got && got.size <= SMALL_MAX && got.size > 0, `le fichier reçu par le stockage fait ${got?.size} octets (≤ ${SMALL_MAX})`);
  console.log(`   (mesure : prise arrêtée à ~${Math.round(size / 1000)} Ko affichés, ${got?.size} octets reçus)`);
}

// ═══ R4 · autorisations refusées ═════════════════════════════════════════════
section('R4 · refus d’autorisation : messages exacts, repli sur « Choisir un fichier »');
if (want('R4')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload();
  for (const [name, msg] of [['NotAllowedError', MSG.refus], ['SecurityError', MSG.refus], ['NotFoundError', MSG.absente], ['OverconstrainedError', MSG.absente],
    ['NotReadableError', MSG.prise], ['AbortError', MSG.prise], ['TypeError', MSG.autre]]) {
    await recReset(op, { fail: name });
    await op.click('[data-testid=tr-rec-open]');
    await op.waitForSelector('[data-testid=tr-rec-error]', { timeout: 8000 });
    const e = op.locator('[data-testid=tr-rec-error]');
    check((await txt(e)) === msg && (await e.getAttribute('role')) === 'alert', `${name} : message exact, role=alert`);
    check(await op.locator('[data-testid=tr-film]').count() === 1 && await op.locator('[data-testid=tr-file]').count() === 1 && await op.locator('[data-testid=tr-rec-open]').isVisible(), `${name} : « Filmer », « Choisir un fichier » et le bouton sont de nouveau là`);
    check((await rec(op)).tracks.every((x) => x === 'ended'), `${name} : aucune piste restée ouverte`);
    check(await focusId() === 'tr-rec-open', `${name} : le focus revient sur « Filmer dans BEMEXO »`);
    if (name === 'NotAllowedError') await shot(dlg(), 'enregistreur-refus');
  }
  await recReset(op, { fail: 'NotAllowedError' });
  await op.click('[data-testid=tr-rec-open]');
  await op.waitForSelector('[data-testid=tr-rec-error]');
  await op.setInputFiles('[data-testid=tr-file]', F_FILM);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  check(await op.locator('[data-testid=tr-rec-error]').count() === 0 && await op.locator('[data-testid=tr-file-error]').count() === 0, 'après le refus, un fichier choisi passe normalement (le message disparaît)');
  await op.fill('[data-testid=tr-title]', 'Fichier choisi');
  check(!(await op.locator('[data-testid=tr-save]').isDisabled()), '« Ajouter » est actif');
  await op.click('[data-testid=tr-file-change]');
  check(await op.locator('[data-testid=tr-rec-error]').count() === 0, '« Changer de vidéo » : le message de refus n’est pas ressorti');
  // Refus de la caméra, puis un fichier REFUSÉ par le contrôle de taille : l'ancien message de la caméra ne reste pas à côté.
  await recReset(op, { fail: 'NotAllowedError' });
  await op.click('[data-testid=tr-rec-open]'); await op.waitForSelector('[data-testid=tr-rec-error]');
  await op.setInputFiles('[data-testid=tr-file]', F_HEAVY);
  await op.waitForSelector('[data-testid=tr-file-error]');
  check(await op.locator('[data-testid=tr-rec-error]').count() === 0, 'refus de la caméra puis fichier trop lourd refusé : le message de la caméra ne reste pas à côté');
  await recReset(op);
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R5 · caméra coupée ═════════════════════════════════════════════════════
section('R5 · caméra coupée pendant la prise : ce qui est filmé est gardé ; sans aucun octet : échec clair');
if (want('R5')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload(); await recReset(op);
  await startRecording();
  await op.waitForTimeout(2500);
  await op.evaluate(() => window.__rec.tracks[0].dispatchEvent(new Event('ended')));
  await op.waitForSelector('[data-testid=tr-preview]', { timeout: 8000 });
  check((await txt(op.locator('[data-testid=tr-rec-auto]'))) === MSG.cut, 'message : « … (caméra interrompue). Ce qui a été filmé est gardé. »');
  const meta = await txt(op.locator('[data-testid=tr-file-meta]'));
  check(/^\d+ s · /.test(meta), `la prise est gardée (« ${meta} »)`);
  const s = await rec(op);
  check(s.tracks.every((x) => x === 'ended') && s.recorders.every((x) => x === 'inactive'), 'caméra relâchée');
  await shot(dlg(), 'enregistreur-camera-coupee');
  await op.click('[data-testid=tr-file-change]');
  check(await op.locator('[data-testid=tr-rec-auto]').count() === 0, '« Changer de vidéo » : le message d’arrêt disparaît');
  // L'enregistreur s'arrête de lui-même AVANT que la piste n'annonce sa fin (l'ordre des événements varie selon le navigateur) : prise écourtée signalée aussi.
  await recReset(op);
  await startRecording();
  await op.waitForTimeout(2200);
  await op.evaluate(() => window.__rec.recorders[0].stop());
  await op.waitForSelector('[data-testid=tr-preview]', { timeout: 8000 });
  check((await txt(op.locator('[data-testid=tr-rec-auto]'))) === MSG.cut, 'arrêt spontané de l’enregistreur : même message « caméra interrompue, ce qui a été filmé est gardé »');
  await op.click('[data-testid=tr-file-change]');
  // Aucun octet reçu : échec clair.
  await recReset(op, { noData: true });
  await startRecording();
  await op.waitForTimeout(600);
  await op.evaluate(() => window.__rec.tracks[0].dispatchEvent(new Event('ended')));
  await op.waitForSelector('[data-testid=tr-rec-error]', { timeout: 8000 });
  check((await txt(op.locator('[data-testid=tr-rec-error]'))) === MSG.echec && await op.locator('[data-testid=tr-file-ready]').count() === 0, 'aucun octet : « L’enregistrement a échoué. Réessayez, ou touchez « Filmer ». »');
  check((await rec(op)).tracks.every((x) => x === 'ended'), 'caméra relâchée aussi');
  await recReset(op);
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R6 · nettoyage ═════════════════════════════════════════════════════════
section('R6 · la caméra ne reste jamais allumée : fermeture, changement d’onglet, « Annuler », « Abandonner », caméra lente');
if (want('R6')) {
  await fresh();
  await openOffice();
  const scenario = async (nom, leave, { recording = true } = {}) => {
    if (await op.locator('[data-testid=trainings-dialog]').count()) await closeDlg();
    await openTrainings(); await openUpload(); await recReset(op);
    if (recording) await startRecording(); else { await op.click('[data-testid=tr-rec-open]'); await op.waitForSelector('[data-testid=tr-rec-start]'); }
    await op.waitForTimeout(1200);
    const mid = await rec(op);
    check(mid.tracks.length > 0 && mid.tracks.every((x) => x === 'live'), `${nom} : la caméra est bien allumée avant de partir`);
    await leave();
    await op.waitForTimeout(500);
    const s = await rec(op);
    check(noCam(s), `${nom} : pistes arrêtées, enregistreur inactif, écran allumé relâché (${JSON.stringify({ t: s.tracks, r: s.recorders, w: s.sentinels })})`);
    check(await op.locator('[data-testid=tr-preview]').count() === 0 && await op.locator('[data-testid=tr-file-ready]').count() === 0, `${nom} : aucune prise gardée (onDone jamais appelé)`);
  };
  // Avant la prise (caméra prête) : tout ce qui quitte l'écran relâche la caméra.
  await scenario('fermer la fenêtre (Échap)', async () => { await closeDlg(); }, { recording: false });
  await scenario('changer d’onglet du formulaire', async () => { await op.click('[data-testid=tr-kind-video]'); }, { recording: false });
  await scenario('« Annuler » du formulaire', async () => { await op.click('[data-testid=tr-cancel]'); }, { recording: false });
  await scenario('« Fermer la caméra » avant la prise', async () => { await op.click('[data-testid=tr-rec-cancel]'); }, { recording: false });
  check(await op.locator('[data-testid=tr-rec-open]').isVisible() && await focusId() === 'tr-rec-open', '« Fermer la caméra » : retour aux boutons, le focus sur « Filmer dans BEMEXO »');
  // Pendant la prise : « Abandonner » dans les 3 premières secondes jette tout de suite (rien à perdre).
  await scenario('« Abandonner » dans les 3 premières secondes', async () => { await op.click('[data-testid=tr-rec-abort]'); });
  check(await op.locator('[data-testid=tr-rec-open]').isVisible() && await op.locator('[data-testid=tr-rec-error]').count() === 0, '« Abandonner » : retour aux boutons, sans message');
  // Après 3 secondes : confirmation en deux temps.
  await scenario('« Abandonner » puis « Oui, jeter »', async () => {
    await op.waitForTimeout(2200);
    await op.click('[data-testid=tr-rec-abort]');
    await op.waitForSelector('[data-testid=tr-rec-abort-yes]');
    await op.click('[data-testid=tr-rec-abort-yes]');
  });
  // Pendant la prise, ce qui la jetterait sans prévenir est verrouillé.
  await closeDlg(); await openTrainings(); await openUpload(); await recReset(op);
  await startRecording();
  await op.waitForTimeout(3300);
  const lock = await op.evaluate(() => ['tr-kind-video', 'tr-kind-document', 'tr-cancel'].map((id) => document.querySelector(`[data-testid=${id}]`).disabled));
  check(lock.every((x) => x === true), `pendant la prise : les onglets du formulaire et « Annuler » sont inactifs (${lock.join(',')})`);
  await op.keyboard.press('Escape'); await op.waitForTimeout(400);
  check(await op.locator('[data-testid=trainings-dialog]').count() === 1 && (await rec(op)).tracks.every((x) => x === 'live'), 'pendant la prise : Échap ne ferme pas la fenêtre, la prise continue');
  const gap = await op.evaluate(() => { const a = document.querySelector('[data-testid=tr-rec-stop]').getBoundingClientRect(), b = document.querySelector('[data-testid=tr-rec-abort]').getBoundingClientRect(); return { dy: b.top - a.bottom, h: b.height }; });
  check(gap.dy >= 12 && gap.h >= 44, `« Abandonner » est à part d’« Arrêter » (${Math.round(gap.dy)} px d’écart, ${Math.round(gap.h)} px de haut)`);
  await op.click('[data-testid=tr-rec-abort]');
  await op.waitForSelector('[data-testid=tr-rec-abort-yes]');
  check((await txt(op.locator('[data-testid=tr-rec]'))).includes('Jeter cette prise ?') && await focusId() === 'tr-rec-abort-no', 'après 3 s : « Jeter cette prise ? », le focus sur « Non, continuer »');
  check((await rec(op)).tracks.every((x) => x === 'live') && (await rec(op)).recorders.every((x) => x === 'recording'), 'la prise continue pendant la question');
  await op.click('[data-testid=tr-rec-abort-no]');
  check(await op.locator('[data-testid=tr-rec-stop]').isVisible() && await focusId() === 'tr-rec-stop' && (await rec(op)).tracks.every((x) => x === 'live'), '« Non, continuer » : la prise continue, le focus revient sur « Arrêter »');
  await op.click('[data-testid=tr-rec-stop]'); await op.waitForSelector('[data-testid=tr-preview]');
  const unlocked = await op.evaluate(() => ['tr-kind-video', 'tr-kind-document', 'tr-cancel'].map((id) => document.querySelector(`[data-testid=${id}]`).disabled));
  check(unlocked.every((x) => x === false), 'la prise terminée : les onglets et « Annuler » sont de nouveau actifs');
  await closeDlg();
  check(await op.locator('[data-testid=trainings-dialog]').count() === 0, 'la prise terminée : Échap ferme la fenêtre');
  // Caméra lente : « Ouverture de la caméra… » avec une sortie.
  await openTrainings(); await openUpload(); await recReset(op, { delay: 1500 });
  await op.click('[data-testid=tr-rec-open]');
  check(await op.locator('[data-testid=tr-rec-opening]').count() === 1 && await op.locator('[data-testid=tr-rec-cancel]').isVisible(), 'caméra lente : « Ouverture de la caméra… » et un bouton « Fermer la caméra »');
  await op.click('[data-testid=tr-rec-cancel]');
  check(await op.locator('[data-testid=tr-rec-open]').isVisible(), 'caméra lente : on peut en sortir sans attendre');
  await op.waitForTimeout(2200);
  const lateC = await rec(op);
  check(lateC.tracks.length > 0 && lateC.tracks.every((x) => x === 'ended'), 'caméra ouverte APRÈS la sortie : aussitôt arrêtée');
  // Caméra lente : la fenêtre se ferme avant qu'elle ne s'ouvre.
  await recReset(op, { delay: 1500 });
  await op.click('[data-testid=tr-rec-open]');
  check(await op.locator('[data-testid=tr-rec-opening]').count() === 1, 'caméra lente : « Ouverture de la caméra… »');
  await closeDlg();
  await op.waitForTimeout(2600);
  const late = await rec(op);
  check(late.tracks.length > 0 && late.tracks.every((x) => x === 'ended'), 'caméra ouverte APRÈS la fermeture de la fenêtre : aussitôt arrêtée');
  await recReset(op);
}

// ═══ R7 · écran allumé ══════════════════════════════════════════════════════
section('R7 · écran allumé : demandé au clic « Démarrer », redemandé au retour, relâché à l’arrêt ; refus et API absente sans bruit');
if (want('R7')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload(); await recReset(op);
  await op.click('[data-testid=tr-rec-open]'); await op.waitForSelector('[data-testid=tr-rec-start]');
  check((await rec(op)).wake.length === 0, 'rien à l’ouverture de la caméra');
  await op.click('[data-testid=tr-rec-start]'); await op.waitForSelector('[data-testid=tr-rec-stop]'); await op.waitForTimeout(300);
  let s = await rec(op);
  check(s.wake.join() === 'screen' && s.sentinels.join() === 'false', 'wakeLock.request(\'screen\') appelé au clic « Démarrer »');
  // Le système relâche l'écran quand la page est cachée ; au retour, il est redemandé.
  await op.evaluate(() => { window.__rec.sentinels[0].released = true; document.dispatchEvent(new Event('visibilitychange')); });
  await op.waitForTimeout(300);
  s = await rec(op);
  check(s.wake.length === 2 && s.sentinels.join() === 'true,false', 'redemandé après visibilitychange (page de nouveau visible)');
  await op.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await op.waitForTimeout(200);
  check((await rec(op)).wake.length === 2, 'pas de nouvelle demande tant que l’écran est déjà tenu');
  await op.click('[data-testid=tr-rec-stop]'); await op.waitForSelector('[data-testid=tr-preview]');
  s = await rec(op);
  check(s.sentinels.every((x) => x === true), 'relâché à l’arrêt');
  await op.click('[data-testid=tr-file-change]');
  for (const mode of ['deny', 'absent']) {
    await recReset(op, { wakeMode: mode });
    await startRecording(); await op.waitForTimeout(1500);
    check(await dlg().locator('[role=alert]').count() === 0 && await op.locator('[data-testid=tr-rec-error]').count() === 0, `écran allumé « ${mode === 'deny' ? 'refusé' : 'absent'} » : aucun message d’erreur`);
    await op.click('[data-testid=tr-rec-stop]'); await op.waitForSelector('[data-testid=tr-preview]');
    check(await op.locator('[data-testid=tr-file-ready]').count() === 1, `écran allumé « ${mode === 'deny' ? 'refusé' : 'absent'} » : la prise se fait quand même`);
    await op.click('[data-testid=tr-file-change]');
  }
  await recReset(op);
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R8 · minuteur ══════════════════════════════════════════════════════════
section('R8 · le minuteur avance même quand Date.now() est figé (il lit performance.now())');
if (want('R8')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload(); await recReset(op);
  const d1 = await op.evaluate(() => Date.now()); await op.waitForTimeout(300); const d2 = await op.evaluate(() => Date.now());
  check(d1 === d2, 'décor : Date.now() est bien figé');
  await startRecording();
  const a = await txt(op.locator('[data-testid=tr-rec-timer]'));
  await op.waitForTimeout(2400);
  const b2 = await txt(op.locator('[data-testid=tr-rec-timer]'));
  check(a === '0:00' && /^0:0[1-3]$/.test(b2), `le minuteur avance (« ${a} » puis « ${b2} »)`);
  check(await op.locator('[data-testid=tr-rec-timer]').getAttribute('aria-live') === 'off', 'minuteur muet pour les lecteurs d’écran (aria-live="off")');
  await abandon();
  await recReset(op);
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R9 · alerte HEVC ═══════════════════════════════════════════════════════
section('R9 · alerte HEVC : fichiers fabriqués ici (moov à la fin, au début, MP4 Android), jamais bloquante');
if (want('R9')) {
  await fresh();
  await openOffice(); await openTrainings(); await openUpload();
  const cases = [
    ['.mov HEVC, moov à la fin (mdat de 2 Mo)', FIX.movFin, true], ['.mov HEVC, moov au début', FIX.movDebut, true], ['.mp4 HEVC (Android)', FIX.mp4Hevc, true],
    ['.mov H.264', FIX.movH264, false], ['octets quelconques', FIX.octets, false], ['fichier de 3 octets', FIX.court, false],
  ];
  const attendu = `${MSG.hevc} ${MSG.hevcRec} ${MSG.hevcKeep}`;
  for (const [nom, f, hevc] of cases) {
    const n = writes.length;
    await op.setInputFiles('[data-testid=tr-file]', f);
    await op.waitForSelector('[data-testid=tr-file-ready]');
    await waitFor(async () => (await op.locator('[data-testid=tr-hevc-alert]').count()) > 0, hevc ? 4000 : 900);
    const a = op.locator('[data-testid=tr-hevc-alert]');
    if (hevc) {
      check((await txt(a)) === attendu && (await a.getAttribute('role')) === 'status', `${nom} : alerte, texte exact, avec le conseil « Filmer dans BEMEXO »`);
      await op.fill('[data-testid=tr-title]', 'Test HEVC');
      check(!(await op.locator('[data-testid=tr-save]').isDisabled()), `${nom} : « Ajouter » reste actif`);
      if (f === FIX.movFin) {
        const v = await a.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, icon: !!el.querySelector('svg[aria-hidden=true]'),
          constat: el.querySelector('strong').getBoundingClientRect().top, conseil: el.querySelectorAll('span')[0].getBoundingClientRect().top, garde: el.querySelectorAll('span')[1].getBoundingClientRect().top }));
        check(v.bg !== 'rgba(0, 0, 0, 0)' && v.icon && v.conseil > v.constat && v.garde > v.conseil, `alerte HEVC : fond d’avertissement, icône, constat puis conseil puis « Vous pouvez quand même… » sur des lignes séparées (${JSON.stringify(v)})`);
        await shot(dlg(), 'enregistreur-alerte-hevc');
      }
    } else {
      check(await a.count() === 0, `${nom} : aucune alerte`);
    }
    check(writes.length === n, `${nom} : aucune écriture avant « Ajouter »`);
    await op.click('[data-testid=tr-file-change]');
  }
  // « Filmer » (appli caméra du téléphone) : même contrôle.
  await op.setInputFiles('[data-testid=tr-film]', FIX.movFin);
  await op.waitForSelector('[data-testid=tr-hevc-alert]', { timeout: 4000 });
  check((await txt(op.locator('[data-testid=tr-hevc-alert]'))) === attendu, '« Filmer » (appareil du téléphone) : même alerte');
  await op.click('[data-testid=tr-file-change]');
  // Un changement de fichier ne garde pas l'alerte du précédent.
  await op.setInputFiles('[data-testid=tr-file]', FIX.movFin);
  await op.waitForSelector('[data-testid=tr-hevc-alert]');
  await op.click('[data-testid=tr-file-change]');
  await op.setInputFiles('[data-testid=tr-file]', FIX.movH264);
  await op.waitForSelector('[data-testid=tr-file-ready]'); await op.waitForTimeout(700);
  check(await op.locator('[data-testid=tr-hevc-alert]').count() === 0, 'passer d’un fichier HEVC à un fichier H.264 : l’alerte disparaît');
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
  // Sans « Filmer dans BEMEXO » : le conseil change.
  await openTrainings(); await op.evaluate(() => { delete window.MediaRecorder; });
  await op.click('[data-testid=tr-add-open]'); await op.click('[data-testid=tr-kind-upload]'); await op.waitForSelector('[data-testid=tr-upload]');
  await op.setInputFiles('[data-testid=tr-file]', FIX.movFin);
  await op.waitForSelector('[data-testid=tr-hevc-alert]', { timeout: 4000 });
  check((await txt(op.locator('[data-testid=tr-hevc-alert]'))) === `${MSG.hevc} ${MSG.hevcNoRec} ${MSG.hevcKeep}`, 'sans enregistreur : le conseil devient « Réglages > Appareil photo > Formats > Le plus compatible »');
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
  // Le navigateur sait enregistrer, mais il reste moins de 2 Mo de place : le bouton « Filmer dans BEMEXO » est absent, le conseil ne doit pas y renvoyer.
  await fresh({ limitsLie: 99 * MO });
  await openOffice(); await openTrainings(); await openUpload();
  check(await op.locator('[data-testid=tr-rec-open]').count() === 0, 'faute de place : pas de bouton « Filmer dans BEMEXO »');
  await op.setInputFiles('[data-testid=tr-file]', FIX.mp4Hevc);
  await op.waitForSelector('[data-testid=tr-hevc-alert]', { timeout: 4000 });
  check((await txt(op.locator('[data-testid=tr-hevc-alert]'))) === `${MSG.hevc} ${MSG.hevcNoRec} ${MSG.hevcKeep}`, 'faute de place : le conseil n’envoie pas vers un bouton absent (réglage de l’iPhone)');
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R10 · fichiers à vérifier ══════════════════════════════════════════════
section('R10 · fichiers à vérifier : lecture seule, textes exacts, 5 lignes puis « + N autres »');
if (want('R10')) {
  await fresh();
  await openOffice(); await openTrainings();
  check(await op.locator('[data-testid=tr-audit-toggle]').count() === 0, 'rien à signaler : aucun lien');
  await closeDlg();
  // 7 fichiers sans formation, 2 formations sans fichier (dont une retirée), un envoi non terminé, un fichier d'une autre entreprise.
  await fresh();
  const tailles = [3 * MO, 5 * MO, 1.5 * MO, 7 * MO, 2 * MO, 4 * MO, 0.5 * MO];
  const orphans = tailles.map((t, i) => orphan(Math.round(t), `2026-10-${String(5 + i).padStart(2, '0')}T09:00:00Z`));
  OBJ.set(`${CO}/.emptyFolderPlaceholder`, { size: 0, mime: 'application/octet-stream', bytes: null });
  OBJ.set(`${CO}/sous-dossier/.emptyFolderPlaceholder`, { size: 0, mime: 'application/octet-stream', bytes: null }); // dossier vide créé dans un sous-dossier : jamais signalé
  const autre = orphan(9 * MO, '2026-10-12T09:00:00Z', CO2);
  D.training_videos.push(vid('11111111-1111-4111-8111-111111111111', 'Gestes et postures (fichier manquant)', { file_path: `${CO}/11111111-1111-4111-8111-111111111111`, published_at: '2026-10-08T08:00:00Z' }));
  D.training_videos.push(vid('22222222-2222-4222-8222-222222222222', 'Ancienne consigne', { file_path: `${CO}/22222222-2222-4222-8222-222222222222`, published_at: '2026-10-06T08:00:00Z', archived_at: '2026-10-09T08:00:00Z' }));
  const encours = `${CO}/33333333-3333-4333-8333-333333333333`;
  D.training_videos.push(vid('33333333-3333-4333-8333-333333333333', 'Isolation des combles', { file_path: encours, published_at: null, size_bytes: null, declared_bytes: 6 * MO, reserved_at: '2026-10-13T07:00:00Z' }));
  OBJ.set(encours, { size: 6 * MO, mime: 'video/webm', bytes: null }); OBJ_AT.set(encours, '2026-10-13T07:30:00Z');
  auditCalls.length = 0;
  await openOffice(); await openTrainings();
  await waitFor(async () => (await op.locator('[data-testid=tr-audit-toggle]').count()) > 0, 5000);
  const tg = op.locator('[data-testid=tr-audit-toggle]');
  check((await txt(tg)) === 'Fichiers vidéo à vérifier (9)' && (await tg.getAttribute('aria-expanded')) === 'false', `lien replié : « ${await txt(tg)} »`);
  check(await op.locator('[data-testid=tr-audit]').count() === 0, 'replié par défaut');
  check(auditCalls.length === 1 && auditCalls[0].answer === 'ok', `une seule lecture de video_files_audit à l’ouverture (${auditCalls.length})`);
  await tg.click(); await op.waitForSelector('[data-testid=tr-audit]');
  const box = op.locator('[data-testid=tr-audit]');
  const t = await txt(box);
  check((await tg.getAttribute('aria-expanded')) === 'true' && (await txt(tg)) === 'Masquer les fichiers vidéo à vérifier', 'déplié : « Masquer les fichiers vidéo à vérifier »');
  check(t.includes('Rien n’est supprimé automatiquement : ces fichiers sont seulement signalés. Pour en retirer un, contactez BEMEXO.'), 'note : rien n’est supprimé automatiquement');
  check(t.includes('Fichiers sans formation (7)') && t.includes('Le fichier est dans votre dossier vidéo, mais aucune formation ne l’utilise. Il compte dans les 100 Mo.'), 'titre et note des fichiers sans formation');
  check(t.includes('Formations dont le fichier manque (2)') && t.includes('Les salariés ne peuvent pas lire ces vidéos : le fichier est introuvable.'), 'titre et note des formations sans fichier');
  const lignes = await box.locator('[data-testid=tr-audit-row]').allInnerTexts();
  check(lignes.length === 7, `5 lignes de fichiers + 2 de formations (${lignes.length})`);
  const recents = [...orphans].reverse().slice(0, 5);
  const tailleDe = (p) => OBJ.get(p).size;
  const mo = (n) => { const x = n / MO; return x > 0 && x < 10 ? `${(Math.round(x * 10) / 10).toString().replace('.', ',')} Mo` : `${Math.round(x)} Mo`; };
  const j = (p) => `${String(new Date(OBJ_AT.get(p)).getDate()).padStart(2, '0')}/10`;
  check(recents.every((p, i) => lignes[i] === `${j(p)} · ${mo(tailleDe(p))} · réf. ${p.slice(-8)}`), `lignes des fichiers : les plus récents d’abord, la date et la taille d’abord, la référence en fin de ligne (« ${lignes[0]} »)`);
  check(!lignes.some((l) => /Fichier sans formation|emptyFolder|sous-dossier/.test(l)), 'aucune ligne ne répète « Fichier sans formation » ; les dossiers vides (racine et sous-dossier) ne sont pas signalés');
  check(await tg.evaluate((e) => e.getBoundingClientRect().height) >= 44, 'le lien « Masquer les fichiers vidéo à vérifier » fait au moins 44 px de haut');
  check(lignes[5] === 'Gestes et postures (fichier manquant) · publiée le 08/10' && lignes[6] === 'Ancienne consigne · publiée le 06/10 · retirée', `lignes des formations, la retirée marquée (« ${lignes[5]} » / « ${lignes[6]} »)`);
  check(t.includes('+ 2 autres'), '« + 2 autres » pour les fichiers au-delà de 5');
  const somme = orphans.reduce((s, p) => s + tailleDe(p), 0);
  check(t.includes(`Ensemble : ${mo(somme)}`), `« Ensemble : ${mo(somme)} » (les 7 fichiers)`);
  check(!lignes.some((l) => l.includes(autre.slice(-8)) || l.includes('33333333') || l.includes(encours.slice(-8))), 'aucun fichier d’une autre entreprise, ni de l’envoi non terminé');
  check(await box.locator('button, a, input, [role=button]').count() === 0, 'aucun bouton ni lien dans la liste : lecture seule');
  // L'envoi non terminé reste là où il était.
  const arch = op.locator('[data-testid=tr-show-archived]');
  check(/^Afficher les formations retirées et les envois non terminés \(2\)$/.test(await txt(arch)), `libellé du lot 13 inchangé : « ${await txt(arch)} »`);
  await arch.click(); await op.waitForTimeout(250);
  check(await op.locator('[data-kind=leftover]').count() === 1 && (await txt(op.locator('[data-kind=leftover] [data-testid=tr-title-text]'))) === 'Isolation des combles', 'l’envoi non terminé est sous « Envoi non terminé », comme avant');
  await shot(dlg(), 'enregistreur-fichiers-a-verifier');
  // Aucun appel d'écriture, aucune suppression.
  check(!writes.some((w) => /audit/.test(w.t || '')), 'video_files_audit n’est lue que par GET');
  await closeDlg();
  // Les autres bureaux et un seul bureau : un second compte ne change rien (mêmes règles côté SQL).
  const n0 = auditCalls.length;
  await openTrainings(); await op.waitForTimeout(600);
  check(auditCalls.length === n0 + 1, 'rouvrir la fenêtre : une lecture de plus, pas deux');
  await closeDlg();
  // Deux chargements qui se croisent : la réponse la plus ancienne, arrivée en dernier, ne remplace pas la plus récente.
  await fresh();
  orphan(3 * MO, '2026-10-10T09:00:00Z');
  auditDelays.length = 0; auditDelays.push(4500); // 1re lecture : 1 fichier, livrée tard
  await openOffice(); await openTrainings();
  for (let i = 0; i < 6; i++) orphan((i + 1) * MO, `2026-10-1${i}T09:00:00Z`);
  await closeDlg(); await openTrainings(); // 2e lecture : 7 fichiers, livrée tout de suite
  check(await waitFor(async () => /\(7\)$/.test(await txt(op.locator('[data-testid=tr-audit-toggle]'))), 6000), `la lecture récente s’affiche : ${await txt(op.locator('[data-testid=tr-audit-toggle]'))}`);
  await op.waitForTimeout(4500);
  check(/\(7\)$/.test(await txt(op.locator('[data-testid=tr-audit-toggle]'))), `la lecture ancienne arrivée en retard est ignorée (« ${await txt(op.locator('[data-testid=tr-audit-toggle]'))} »)`);
  auditDelays.length = 0;
  await closeDlg();
}

// ═══ R12 · messages résiduels : une prise refusée ne laisse pas son message au fichier suivant ═════════
section('R12 · une prise arrêtée toute seule puis REFUSÉE ne laisse pas « s’est arrêté tout seul » sous un autre fichier');
if (want('R12')) {
  await fresh({ maxBytes: SMALL_MAX });
  await openOffice(); await openTrainings(); await openUpload();
  await recReset(op, { inflate: 3 * MO }); // chaque morceau reçu est gonflé : la prise dépasse le plafond et sera refusée par le contrôle de taille
  await startRecording().catch(() => {});
  await op.waitForSelector('[data-testid=tr-file-error]', { timeout: 20000 });
  check(await op.locator('[data-testid=tr-file-ready]').count() === 0 && await op.locator('[data-testid=tr-rec-auto]').count() === 0, 'prise refusée : aucun fichier, pas de message d’arrêt sous rien');
  await recReset(op);
  await op.setInputFiles('[data-testid=tr-file]', F_FILM);
  await op.waitForSelector('[data-testid=tr-file-ready]');
  check(await op.locator('[data-testid=tr-rec-auto]').count() === 0, 'le fichier choisi ensuite n’affiche pas « L’enregistrement s’est arrêté tout seul… »');
  await op.click('[data-testid=tr-file-change]');
  await op.click('[data-testid=tr-cancel]'); await closeDlg();
}

// ═══ R11 · captures à 390 px ════════════════════════════════════════════════
section('R11 · téléphone de 390 px : les écrans de l’enregistreur, sans défilement horizontal');
if (want('R11')) {
  await fresh();
  // Pour la liste à vérifier.
  orphan(3 * MO, '2026-10-10T09:00:00Z'); orphan(2 * MO, '2026-10-11T09:00:00Z');
  D.training_videos.push(vid('44444444-4444-4444-8444-444444444444', 'Gestes et postures', { file_path: `${CO}/44444444-4444-4444-8444-444444444444`, published_at: '2026-10-08T08:00:00Z' }));
  const mob = await newCtx(ADMIN, { width: 390, height: 844 });
  const mp = track(await mob.newPage(), 'bureau mobile 390');
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card, .bt-pl-m-ibtn', { timeout: 25000 }); await mp.waitForTimeout(1200);
  await mp.locator('button[aria-label="Menu"]').first().click(); await mp.waitForSelector('.bt-mm-sheet'); await mp.waitForTimeout(400);
  await mp.click('[data-testid=mm-trainings]'); await mp.waitForSelector('[data-testid=trainings-dialog]'); await mp.waitForTimeout(900);
  await openUpload(mp);
  check(await fits(mp), '390 px · panneau avec les trois boutons : pas de défilement horizontal');
  check(await mp.locator('[data-testid=tr-rec-open]').isVisible() && await mp.locator('[data-testid=tr-film]').count() === 1 && await mp.locator('[data-testid=tr-file]').count() === 1, '390 px · les trois boutons sont là');
  const hs = { rec: await heightOf(mp.locator('[data-testid=tr-rec-open]')), film: await heightOf(mp.locator('[data-testid=tr-film]')), file: await heightOf(mp.locator('[data-testid=tr-file]')) };
  check(Object.values(hs).every((h) => h >= 44), `390 px · « Filmer dans BEMEXO », « Filmer », « Choisir un fichier » : au moins 44 px de haut (${Object.entries(hs).map(([k, h]) => `${k} ${Math.round(h)}`).join(', ')})`);
  await shot(mp, 'enregistreur-390-panneau');
  await mp.click('[data-testid=tr-rec-open]'); await mp.waitForSelector('[data-testid=tr-rec-start]'); await mp.waitForTimeout(700);
  check(await fits(mp), '390 px · caméra prête : pas de défilement horizontal');
  const vb = await mp.locator('[data-testid=tr-rec-live]').evaluate((v) => { const r = v.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height, vh: window.innerHeight, fit: getComputedStyle(v).objectFit }; });
  check(vb.l >= 0 && vb.r <= 390 && vb.h <= vb.vh * 0.52 + 1 && vb.fit === 'contain', `390 px · aperçu dans l’écran, au plus 52 % de la hauteur (${JSON.stringify(vb)})`);
  const bh = await mp.locator('[data-testid=tr-rec-start]').evaluate((e) => e.getBoundingClientRect().height);
  check(bh >= 44, `bouton « Démarrer » : ${Math.round(bh)} px de haut (≥ 44)`);
  await shot(mp, 'enregistreur-390-camera-prete');
  await mp.click('[data-testid=tr-rec-start]'); await mp.waitForSelector('[data-testid=tr-rec-stop]'); await mp.waitForTimeout(1300);
  check(await fits(mp), '390 px · en cours : pas de défilement horizontal');
  const sh = await mp.locator('[data-testid=tr-rec-stop]').evaluate((e) => e.getBoundingClientRect().height);
  check(sh >= 44, `bouton « Arrêter » : ${Math.round(sh)} px de haut (≥ 44)`);
  await shot(mp, 'enregistreur-390-en-cours');
  await abandon(mp); await mp.waitForSelector('[data-testid=tr-rec-open]');
  await recReset(mp, { fail: 'NotAllowedError' });
  await mp.click('[data-testid=tr-rec-open]'); await mp.waitForSelector('[data-testid=tr-rec-error]');
  check(await fits(mp), '390 px · refus d’autorisation : pas de défilement horizontal');
  await shot(mp, 'enregistreur-390-refus');
  await recReset(mp);
  await mp.setInputFiles('[data-testid=tr-file]', FIX.movFin); await mp.waitForSelector('[data-testid=tr-hevc-alert]', { timeout: 4000 });
  check(await fits(mp), '390 px · alerte HEVC : pas de défilement horizontal');
  const hc = await heightOf(mp.locator('[data-testid=tr-file-change]'));
  check(hc >= 44, `390 px · « Changer de vidéo » : ${Math.round(hc)} px de haut (≥ 44)`);
  await mp.locator('[data-testid=tr-hevc-alert]').scrollIntoViewIfNeeded(); await mp.waitForTimeout(200);
  await shot(mp, 'enregistreur-390-alerte-hevc');
  await mp.click('[data-testid=tr-cancel]');
  await waitFor(async () => (await mp.locator('[data-testid=tr-audit-toggle]').count()) > 0, 5000);
  await mp.click('[data-testid=tr-audit-toggle]'); await mp.waitForSelector('[data-testid=tr-audit]');
  await mp.locator('[data-testid=tr-audit]').scrollIntoViewIfNeeded(); await mp.waitForTimeout(250);
  check(await fits(mp), '390 px · fichiers à vérifier dépliés : pas de défilement horizontal');
  const ha = await heightOf(mp.locator('[data-testid=tr-audit-toggle]'));
  check(ha >= 44, `390 px · le lien des fichiers à vérifier : ${Math.round(ha)} px de haut (≥ 44)`);
  await shot(mp, 'enregistreur-390-fichiers-a-verifier');
  // Le compte à rebours et l'arrêt automatique : une petite place (2,2 Mo) pour que ça arrive dans la minute.
  MAXB = SMALL_MAX;
  await mp.locator('[data-testid=trainings-dialog]').evaluate((el) => { el.scrollTop = 0; });
  await openUpload(mp);
  await mp.click('[data-testid=tr-rec-open]'); await mp.waitForSelector('[data-testid=tr-rec-start]'); await mp.click('[data-testid=tr-rec-start]');
  const vu = await waitFor(async () => (await mp.locator('[data-testid=tr-rec-countdown]').count()) > 0, 90000);
  check(vu, '390 px · le compte à rebours s’affiche');
  if (vu) {
    check((await txt(mp.locator('[data-testid=tr-rec-countdown]'))).startsWith('Arrêt automatique dans '), `compte à rebours : « ${await txt(mp.locator('[data-testid=tr-rec-countdown]'))} »`);
    check(await fits(mp), '390 px · compte à rebours : pas de défilement horizontal');
    await shot(mp, 'enregistreur-390-compte-a-rebours');
  }
  await mp.waitForSelector('[data-testid=tr-preview]', { timeout: 120000 });
  await mp.waitForTimeout(500);
  check(await fits(mp) && (await txt(mp.locator('[data-testid=tr-rec-auto]'))) === MSG.size, '390 px · aperçu après l’arrêt automatique : message d’arrêt, pas de défilement horizontal');
  await shot(mp, 'enregistreur-390-apercu');
  await mob.close();
}

// ═══ Fin ═════════════════════════════════════════════════════════════════════
section('Fin');
check(errors.length === 0, `aucune erreur de page (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' ; ')}` : ''})`);
check(!writes.some((w) => w.m === 'DELETE' || /remove/i.test(w.t || '')), 'aucun DELETE, aucune suppression de fichier de tout le test');
check(!writes.some((w) => ['planning', 'time_entries', 'active_sessions'].includes(w.t)), 'aucune écriture d’heures ni de planning');
check(!writes.some((w) => w.m === 'FN' && EMAIL_FNS.includes(w.t)), 'aucune fonction d’e-mail');
check(!writes.some((w) => w.m === 'RPC' && w.t === 'video_files_audit'), 'video_files_audit n’est jamais appelée en écriture');
{
  let m = 0; for (const p of pages) { try { m += await p.evaluate(() => window.__mailto || 0); } catch { /* fermée */ } }
  check(m === 0, 'aucun « mailto: »');
  const files = ['lib/training-videos.ts', 'components/training-video-upload.tsx', 'components/training-video-recorder.tsx', 'components/training-video-orphans.tsx',
    'supabase/functions/_shared/video-recorder.ts', 'supabase/functions/_shared/video-sniff.ts'];
  const src = files.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } });
  check(src.every((s) => s.length > 0), 'les six fichiers du lot sont lus');
  const code = src.join('\n').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!/<iframe|mailto|service_role|\.remove\(|\.delete\(/i.test(code), 'le code du lot : ni iframe, ni mailto, ni clé de service, ni suppression de fichier (.remove / .delete)');
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(`Échecs :\n - ${fails.join('\n - ')}`);
await b.close(); srv.close(); store.close();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
