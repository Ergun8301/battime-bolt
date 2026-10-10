// Formations (lot 6, oct. 2026) : règles pures.
//   npm run test:formations
import {
  audienceOf, checkTrainingTitle, docPickable, LINK_REFUSED, NO_NETWORK, parseTrainingLink, providerOf, safeTrainingUrl, seenSummary, toSeeLabel,
  TRAINING_GONE, TRAINING_PUSH_MAX, TRAINING_URL_RE, TRAINING_URL_SQL, trainingErrorMessage, trainingPushBody, TRAININGS_DB_PENDING,
} from './trainings.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

/** La migration, trouvée par son suffixe (l'horodatage peut encore changer). */
function migration(): string {
  const dir = new URL('../../migrations/', import.meta.url);
  for (const e of Deno.readDirSync(dir)) if (e.name.endsWith('_lot6_formations.sql')) return Deno.readTextFileSync(new URL(e.name, dir));
  throw new Error('migration *_lot6_formations.sql introuvable');
}

const GOOD: [string, string, string][] = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
  ['https://www.youtube.com/watch?v=x&t=30s', 'https://www.youtube.com/watch?v=x&t=30s', 'youtube'],
  ['https://youtu.be/abc', 'https://youtu.be/abc', 'youtube'],
  ['youtu.be/abc', 'https://youtu.be/abc', 'youtube'],
  ['http://youtu.be/abc', 'https://youtu.be/abc', 'youtube'],
  ['  https://YOUTU.BE/abc  ', 'https://youtu.be/abc', 'youtube'],
  ['HTTP://WWW.YOUTUBE.COM/watch?v=AbC', 'https://www.youtube.com/watch?v=AbC', 'youtube'],
  ['https://youtube.com/shorts/x', 'https://youtube.com/shorts/x', 'youtube'],
  ['https://m.youtube.com/watch?v=x', 'https://m.youtube.com/watch?v=x', 'youtube'],
  ['https://vimeo.com/123456', 'https://vimeo.com/123456', 'vimeo'],
  ['www.vimeo.com/123', 'https://www.vimeo.com/123', 'vimeo'],
  ['https://player.vimeo.com/video/1', 'https://player.vimeo.com/video/1', 'vimeo'],
  ['https://drive.google.com/file/d/ID/view?usp=sharing', 'https://drive.google.com/file/d/ID/view?usp=sharing', 'drive'],
  ['https://docs.google.com/presentation/d/ID/edit#slide=id.p', 'https://docs.google.com/presentation/d/ID/edit#slide=id.p', 'drive'],
];
const BAD = [
  '', '   ', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'javascript://youtube.com/%0aalert(1)', 'data:text/html,<b>x</b>', 'data:text/html;base64,PHNjcmlwdD4=',
  'file:///etc/passwd', 'ftp://youtube.com/x', 'vbscript:x', 'intent://youtube.com/x', 'https:youtu.be/abc',
  'https://evil.com/watch', 'https://youtube.com.evil.com/x', 'https://evil.com/?u=https://youtube.com', 'https://drive.google.com.attacker.io/x', 'https://youtube.com./x',
  'https://user:pw@youtube.com/x', 'https://youtube.com@evil.com/x', 'youtube.com@evil.com/x', 'https://@youtube.com/x', 'https://youtube.com:444/x',
  'https://yоutube.com/x', 'https://xn--ytube-1ua.com/x', 'https://www.youtube-nocookie.com/embed/x', 'https://www.loom.com/share/x', 'https://www.dailymotion.com/video/x',
  'https://www.youtube.com/', 'https://www.youtube.com', 'youtu.be/', 'https://youtube.com/a b', 'https://youtube.com/a\tb', 'https://youtube.com/"x', 'https://youtube.com/<x>', 'https://youtube.com/a\\b',
  `https://youtu.be/${'a'.repeat(500)}`,
];

Deno.test('la règle JavaScript et la contrainte de la base sont la même (migration trouvée par suffixe)', () => {
  const sql = migration();
  ok(sql.includes(`video_url ~ '${TRAINING_URL_SQL}'`), 'la migration contient TRAINING_URL_SQL mot pour mot');
  // Même motif, réécrit : \\. ↔ \. ; [:space:] ↔ \s ; \\\\ ↔ \\ (barre oblique inverse).
  const js = TRAINING_URL_SQL.replace('[:space:]', '\\s').replace('https://', 'https:\\/\\/').replace(')/[', ')\\/[');
  eq(js, TRAINING_URL_RE.source, 'TRAINING_URL_RE est le jumeau de TRAINING_URL_SQL');
});

Deno.test('liens acceptés : sortie exacte (https, hôte en minuscules) et fournisseur', () => {
  for (const [input, url, provider] of GOOD) {
    const r = parseTrainingLink(input);
    ok(r.ok && r.url === url && r.provider === provider, `${JSON.stringify(input)} → ${JSON.stringify(r)}`);
    ok(TRAINING_URL_RE.test(url) && safeTrainingUrl(url) === url, `${url} passe le dernier filet`);
    eq(providerOf(url), provider, `providerOf(${url})`);
  }
});

Deno.test('liens refusés : autre site, autre protocole, identifiant, port, sosie, page d’accueil, caractères dangereux', () => {
  for (const input of BAD) {
    const r = parseTrainingLink(input);
    ok(!r.ok, `accepté à tort : ${JSON.stringify(input)} → ${JSON.stringify(r)}`);
  }
  const msg = (s: string) => { const r = parseTrainingLink(s); return r.ok ? '' : r.error; };
  eq(msg(''), 'Collez le lien de la vidéo.', 'vide');
  eq(msg('javascript:alert(1)'), LINK_REFUSED, 'javascript:');
  eq(msg('https://evil.com/x'), LINK_REFUSED, 'autre site');
  eq(msg('https://www.youtube.com/'), 'Ce lien ne mène pas à une vidéo.', 'page d’accueil');
  eq(msg(`https://youtu.be/${'a'.repeat(500)}`), 'Lien trop long (500 caractères au plus).', 'trop long');
  eq(parseTrainingLink(null as unknown as string).ok, false, 'null');
});

Deno.test('dernier filet avant d’afficher : jamais javascript:, data:, http: ni un autre site', () => {
  for (const u of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'http://youtu.be/a', 'https://evil.com/x', 'https://youtu.be.evil.com/x', ' https://youtu.be/a', 'https://youtu.be/a b', '', null, undefined, 42]) {
    eq(safeTrainingUrl(u as string), null, `safeTrainingUrl(${JSON.stringify(u)})`);
    eq(providerOf(u as string), null, `providerOf(${JSON.stringify(u)})`);
  }
  eq(safeTrainingUrl('https://youtu.be/a'), 'https://youtu.be/a', 'lien sûr rendu tel quel');
});

Deno.test('titre : nettoyé, 2 à 120 caractères (mêmes bornes que la base)', () => {
  eq(checkTrainingTitle('  Port   du harnais '), { ok: true, title: 'Port du harnais' }, 'espaces');
  eq(checkTrainingTitle('x').ok, false, 'un caractère');
  eq(checkTrainingTitle(' x ').ok, false, 'un caractère entouré d’espaces');
  eq(checkTrainingTitle('a'.repeat(120)).ok, true, '120');
  eq(checkTrainingTitle('a'.repeat(121)).ok, false, '121');
});

Deno.test('public et « qui l’a vue » : toute l’équipe, sélection, départ, « Vue » hors public, ordre des prénoms', () => {
  const act = [{ id: 'c', first_name: 'Chloé', last_name: 'Démo' }, { id: 'a', first_name: 'alex', last_name: 'Test' }, { id: 'e', first_name: 'Élodie', last_name: 'Essai' }, { id: 'b', first_name: 'Bruno', last_name: 'Essai' }];
  const views = [{ training_id: 't', user_id: 'a', seen_at: '2026-10-10T12:32:00Z' }, { training_id: 't', user_id: 'b', seen_at: '2026-10-10T13:00:00Z' }, { training_id: 'autre', user_id: 'c', seen_at: 'x' }];
  const s = seenSummary({ id: 't', all_team: false, assignee_ids: ['a', 'parti', 'c'] }, act, views);
  eq([s.seen, s.total], [1, 2], 'sélection : le parti ne compte pas, la « Vue » de Bruno (hors public) est ignorée');
  eq(s.rows.map((r) => [r.person.id, r.seen_at]), [['a', '2026-10-10T12:32:00Z'], ['c', null]], 'lignes par prénom');
  const s2 = seenSummary({ id: 't', all_team: true, assignee_ids: [] }, act, views);
  eq([s2.seen, s2.total], [2, 4], 'toute l’équipe : chaque actif');
  eq(s2.rows.map((r) => r.person.first_name), ['alex', 'Bruno', 'Chloé', 'Élodie'], 'ordre français (accents, casse)');
  eq(audienceOf({ all_team: false, assignee_ids: null }, act), [], 'liste nulle : personne');
  eq(act.map((p) => p.id), ['c', 'a', 'e', 'b'], 'la liste d’origine n’est pas modifiée');
  eq(toSeeLabel(1), '1 formation à voir', 'singulier');
  eq(toSeeLabel(3), '3 formations à voir', 'pluriel');
});

Deno.test('documents proposés : ni photo, ni image, ni facture, ni devis', () => {
  eq(docPickable({ mime_type: 'application/pdf', category: null }), true, 'PDF');
  eq(docPickable({ mime_type: null, category: 'plan' }), true, 'plan');
  eq(docPickable({ mime_type: 'image/jpeg', category: null }), false, 'image');
  eq(docPickable({ mime_type: 'application/pdf', category: 'photo' }), false, 'photo');
  for (const c of ['facture', 'facture_payee', 'devis']) eq(docPickable({ mime_type: 'application/pdf', category: c }), false, c);
});

Deno.test('notification : « Nouvelle formation : … », 80 caractères au plus, jamais de lien', () => {
  eq(trainingPushBody('  Port   du harnais '), 'Nouvelle formation : Port du harnais', 'texte');
  const long = trainingPushBody('x'.repeat(200));
  ok(long.length === TRAINING_PUSH_MAX && long.endsWith('…'), `coupé à ${TRAINING_PUSH_MAX} (${long.length})`);
  ok(!/https?:|mailto:|@/.test(trainingPushBody('Port du harnais')), 'aucun lien, aucune adresse ajoutés');
  eq(trainingPushBody(''), 'Nouvelle formation : Formation', 'titre vide');
});

Deno.test('messages d’erreur : sur le code, jamais sur le statut HTTP', () => {
  eq(trainingErrorMessage({ code: 'PGRST205', message: 'Could not find the table' }), TRAININGS_DB_PENDING, 'table absente');
  eq(trainingErrorMessage({ code: 'PGRST202', message: 'Could not find the function' }), TRAININGS_DB_PENDING, 'fonction absente');
  eq(trainingErrorMessage({ code: '42P01' }), TRAININGS_DB_PENDING, '42P01');
  eq(trainingErrorMessage({ code: 'P0002', message: 'Cette formation n’existe pas' }), TRAINING_GONE, 'retirée (P0002, aussi un 404)');
  eq(trainingErrorMessage({ code: '23514', message: 'new row for relation "trainings" violates check constraint "trainings_video_url_check"' }), LINK_REFUSED, 'lien');
  eq(trainingErrorMessage({ code: '23514', message: 'violates check constraint "trainings_title_check"' }), 'Titre : 2 à 120 caractères.', 'titre');
  eq(trainingErrorMessage({ code: '22023', message: 'Choisissez un document.' }), 'Choisissez un document.', 'message de la garde');
  eq(trainingErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "trainings"' }), 'Réservé au bureau de l’entreprise.', 'RLS');
  eq(trainingErrorMessage({ code: '', message: 'TypeError: Failed to fetch' }), NO_NETWORK, 'réseau');
  eq(trainingErrorMessage({ code: 'XX000', message: 'boom' }, 'Repli.'), 'Repli.', 'inconnu → repli');
});
