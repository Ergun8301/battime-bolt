// Lot 19 — e-mails du bureau : règles pures, moteur (faux transport, faux monde),
// envoi Resend (faux fetch) et désabonnements des nouvelles familles.
//   npm run test:emails          (deno test --allow-env --allow-read)
//
// AUCUN vrai e-mail : le transport est factice, `fetch` est remplacé quand on teste
// l'envoi Resend, aucune clé réelle n'est lue (clé factice posée par le test), toutes
// les adresses sont en @example.com.
import {
  DAILY_EMAIL_CAP, MAX_MESSAGE_CHARS, MAX_PDF_BYTES, MAX_RECIPIENTS_PER_CALL, SEND_BUDGET_MS, STAFF_EMAIL_KINDS,
  checkPdf, classifyHttp, cleanLine, cleanMessage, decodeBase64, escapeHtml, isContactable, isPlausibleEmail, isStaffKind, limitMessage,
  maskEmail, messageLength, messageParts, normalizeEmail, partsToHtml, pickRecipients, planningFileName, planningParts, previewText,
  reasonText, recipientHash, weekFromMonday,
} from './staff-email-core.ts';
import { handleStaffEmail } from './staff-email-run.ts';
import {
  ADMIN, ADMIN2, ARCHIVE, CO, CO2, KEVIN, LUCAS, NINA, OLD, OTHER, SARA, SUPPORT,
  fakePdfBase64, makeDeps, makeWorld, type World,
} from './staff-email-fake.ts';
import {
  ALL_EMAIL_KINDS, EMAIL_KINDS, REPLY_TO, FROM_NOTIFICATIONS, decodeEmail, encodeEmail, htmlToText, loadUnsubscribed, sendResend,
  sendResendOutcome, sendToEach, unsubscribePageUrl, unsubscribeTable, unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken,
} from './email.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }

const MONDAY = '2026-10-19';
const planningBody = (ids: string[], extra: Record<string, unknown> = {}) => ({
  action: 'planning', week_start: MONDAY,
  items: ids.map((id) => ({ user_id: id, mime: 'application/pdf', content_base64: fakePdfBase64(id) })), ...extra,
});
const messageBody = (ids: string[], message = 'Réunion demain à 7 h 30 au dépôt.', extra: Record<string, unknown> = {}) =>
  ({ action: 'message', user_ids: ids, message, ...extra });
const call = (w: World, caller: string, body: unknown) => handleStaffEmail(makeDeps(w), caller, body);
const results = (r: { body: Record<string, unknown> }) => r.body.results as { user_id: string; outcome: string; reason?: string; message: string }[];

// ═══════════════════════════════════════════════════════════════════════════
// Règles pures
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('Plafond et limites : une constante chacune, message exact', () => {
  eq(DAILY_EMAIL_CAP, 50, 'plafond par défaut : 50 par jour et par entreprise');
  eq(limitMessage(), 'Limite quotidienne atteinte (50). Réessayez demain.', 'message du plafond, mot pour mot');
  eq(limitMessage(7), 'Limite quotidienne atteinte (7). Réessayez demain.', 'le nombre suit le plafond');
  eq(MAX_MESSAGE_CHARS, 500, 'message : 500 caractères');
  eq(MAX_RECIPIENTS_PER_CALL, DAILY_EMAIL_CAP, 'jamais plus de destinataires par demande que le plafond du jour');
  eq(STAFF_EMAIL_KINDS, ['planning-hebdo', 'message-bureau'], 'deux nouvelles familles');
  ok(isStaffKind('planning-hebdo') && isStaffKind('message-bureau') && !isStaffKind('weekly-digest') && !isStaffKind(undefined), 'isStaffKind');
  // La constante n'est copiée nulle part ailleurs dans le code de la fonction.
  const files = ['staff-email-run.ts', '../send-staff-email/index.ts'].map((f) => Deno.readTextFileSync(new URL(f, import.meta.url)));
  for (const src of files) ok(!/\b50\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'aucun « 50 » en dur dans le moteur ni dans la fonction (tout vient de DAILY_EMAIL_CAP)');
});

Deno.test('Message libre : nettoyage, bornes, retours à la ligne', () => {
  const r = cleanMessage('  Bonjour\r\n\r\n\r\n\r\nDemain 7 h.​‮  \n  ');
  ok(r.ok, 'accepté');
  if (r.ok) eq(r.text, 'Bonjour\n\nDemain 7 h.', 'CRLF → LF, trois sauts de ligne ou plus → deux, caractères cachés et inversion de sens retirés, espaces rognés');
  ok(!cleanMessage('').ok && !cleanMessage('   \n  ').ok && !cleanMessage(undefined).ok && !cleanMessage(42).ok && !cleanMessage(null).ok, 'vide, blanc ou pas du texte : refusé');
  ok(cleanMessage('a'.repeat(500)).ok, '500 caractères : accepté');
  const long = cleanMessage('a'.repeat(501));
  ok(!long.ok, '501 caractères : refusé');
  if (!long.ok) eq(long.error, 'Message trop long (500 caractères au plus).', 'message d’erreur clair');
  ok(cleanMessage('😀'.repeat(500)).ok && !cleanMessage('😀'.repeat(501)).ok, 'un emoji compte pour UN caractère');
  eq(messageLength('é😀a'), 3, 'longueur en caractères, pas en octets');
  const nul = cleanMessage('a\u0000b\u0007c\u0085d\u007Fe');
  if (nul.ok) eq(nul.text, 'abcde', 'caractères de contrôle retirés'); else throw new Error('refusé');
  const tab = cleanMessage('a\tb');
  if (tab.ok) eq(tab.text, 'a\tb', 'la tabulation reste'); else throw new Error('refusé');
});

Deno.test('Message libre : aucun HTML injecté, aucun lien fabriqué, modèle fixe', () => {
  const evil = '<script>alert(1)</script> <img src=x onerror=alert(2)> "><a href="https://evil.example">cliquez</a> & plus\n\nhttps://evil.example/phishing';
  const c = cleanMessage(evil);
  ok(c.ok, 'accepté tel quel (le texte reste du texte)');
  if (!c.ok) return;
  eq(c.text, evil, 'rien n’est retiré en silence : le texte est gardé, c’est l’AFFICHAGE qui est échappé');
  const html = partsToHtml(messageParts({ company: 'Martin Menuiserie', firstName: 'Lucas', message: c.text, canReply: true }), 'Martin Menuiserie');
  ok(!/<script/i.test(html) && !/<img/i.test(html) && !/<a\b/i.test(html), 'aucune balise script / img / a dans le HTML produit');
  ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('&lt;img src=x onerror=alert(2)&gt;'), 'les chevrons sont échappés');
  ok(html.includes('&quot;&gt;&lt;a href=&quot;https://evil.example&quot;&gt;') && html.includes('&amp; plus'), 'guillemets et esperluette échappés');
  ok(!/href="/i.test(html), 'aucun lien actif : une adresse écrite dans le message reste du texte (pas d’URL imposée, pas d’URL fabriquée)');
  ok(html.includes('https://evil.example/phishing'), '…elle reste lisible comme texte');
  const text = htmlToText(html);
  ok(text.includes('<script>alert(1)</script>') && text.includes('& plus'), 'la version texte retrouve le texte d’origine');
  // retours à la ligne
  const multi = partsToHtml(messageParts({ company: 'X', firstName: '', message: 'Ligne 1\nLigne 2\n\nParagraphe 2', canReply: false }), 'X');
  ok(multi.includes('Ligne 1<br>Ligne 2') && /<\/p><p[^>]*>Paragraphe 2/.test(multi), 'saut simple → <br>, ligne vide → nouveau paragraphe');
  // le sujet et l'expéditeur ne dépendent JAMAIS du message
  const parts = messageParts({ company: 'Martin Menuiserie', firstName: 'Lucas', message: 'Sujet piégé\r\nBcc: tous@example.com', canReply: true });
  eq(parts.subject, '[Martin Menuiserie] Message du bureau', 'sujet fixe, indépendant du texte');
  ok(!/[\r\n]/.test(parts.subject), 'pas de saut de ligne dans le sujet');
  // le nom d'entreprise ne peut pas casser le sujet ni le HTML
  const co = planningParts({ company: 'Evil\r\nBcc: x@example.com <b>', firstName: 'Lu\ncas', weekLabel: 'du 19 au 25 octobre 2026', fileName: 'p.pdf', canReply: true });
  ok(!/[\r\n]/.test(co.subject) && !/[\r\n]/.test(co.greeting), 'un nom ou un prénom avec des sauts de ligne ne casse ni le sujet ni la salutation');
  ok(!partsToHtml(co, 'Evil <b>x</b>').includes('<b>x'), 'le nom d’entreprise est échappé dans le HTML');
  eq(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;', 'escapeHtml');
  eq(cleanLine('  a \n\t b  ', 10), 'a b', 'cleanLine');
});

Deno.test('Aperçu = e-mail : le texte montré au bureau est celui qui part', () => {
  for (const parts of [
    planningParts({ company: 'Martin Menuiserie', firstName: 'Lucas', weekLabel: 'du 19 au 25 octobre 2026', fileName: 'planning-semaine-2026-10-19.pdf', canReply: true }),
    messageParts({ company: 'Martin Menuiserie', firstName: 'Lucas', message: 'Bonjour à tous.\n\nRéunion lundi.', canReply: false }),
  ]) {
    const preview = previewText(parts);
    const sent = htmlToText(partsToHtml(parts, 'Martin Menuiserie'));
    for (const piece of preview.split('\n\n')) {
      for (const line of piece.split('\n')) ok(sent.includes(line.trim()), `la ligne de l’aperçu « ${line.slice(0, 40)} » est dans l’e-mail`);
    }
  }
  const p = planningParts({ company: 'Martin Menuiserie', firstName: 'Lucas', weekLabel: 'du 19 au 25 octobre 2026', fileName: 'planning-semaine-2026-10-19.pdf', canReply: true });
  eq(p.subject, '[Martin Menuiserie] Votre planning de la semaine du 19 au 25 octobre 2026', 'sujet du planning');
  eq(p.greeting, 'Bonjour Lucas,', 'salutation');
  ok(planningParts({ company: 'M', firstName: '', weekLabel: 'x', fileName: 'f.pdf', canReply: true }).greeting === 'Bonjour,', 'sans prénom : « Bonjour, »');
  ok(p.footer.includes('Répondez à cet e-mail') && messageParts({ company: 'M', firstName: '', message: 'x', canReply: false }).footer.includes('ne permet pas de répondre'), 'le pied dit si l’on peut répondre au bureau');
});

Deno.test('Adresses : plausible, masquée, sans injection', () => {
  for (const good of ['lucas@example.com', 'Lucas.Petit+chantier@Example.COM', 'a-b_c@sous.domaine.example.fr']) ok(isPlausibleEmail(good), `${good} : plausible`);
  for (const bad of ['', 'lucas', 'lucas@', '@example.com', 'a@b', 'a b@example.com', 'a@example.com,b@example.com', 'a@example.com;b@example.com', 'a@example.com\nBcc: x@example.com',
    '<a@example.com>', '"a"@example.com', 'a@@example.com', 'a..b@example.com', 'a@exa..mple.com', 'a@example.com ', null, undefined, 12, 'x'.repeat(250) + '@example.com']) {
    if (typeof bad === 'string' && bad === 'a@example.com ') { ok(isPlausibleEmail(bad), 'espaces autour : rognés, plausible'); continue; }
    ok(!isPlausibleEmail(bad), `${JSON.stringify(bad)?.slice(0, 40)} : refusé`);
  }
  eq(normalizeEmail('  Jean@Example.COM '), 'jean@example.com', 'minuscules, rognée');
  eq(maskEmail('jean.dupont@example.com'), 'j***@example.com', 'masque');
  eq(maskEmail('Z@example.com'), 'z***@example.com', 'masque (une lettre)');
  eq(maskEmail('pas-une-adresse'), '***', 'masque (rien à montrer)');
  ok(!maskEmail('jean.dupont@example.com').includes('dupont'), 'le nom n’apparaît pas');
});

Deno.test('Semaine : un lundi réel, libellé en français', () => {
  eq(weekFromMonday('2026-10-19'), { start: '2026-10-19', end: '2026-10-25', label: 'du 19 au 25 octobre 2026' }, 'même mois');
  eq(weekFromMonday('2026-10-26')?.label, 'du 26 octobre au 1 novembre 2026', 'à cheval sur deux mois');
  eq(weekFromMonday('2026-12-28')?.label, 'du 28 décembre 2026 au 3 janvier 2027', 'à cheval sur deux années');
  eq(weekFromMonday('2026-02-30'), null, 'date qui n’existe pas');
  eq(weekFromMonday('2026-10-20'), null, 'un mardi n’est pas un début de semaine');
  eq(weekFromMonday('19/10/2026'), null, 'mauvais format');
  eq(weekFromMonday(null), null, 'pas une date');
  eq(planningFileName('2026-10-19'), 'planning-semaine-2026-10-19.pdf', 'nom du fichier fabriqué ici');
});

Deno.test('PDF : un vrai PDF, de taille bornée, du bon type', () => {
  const good = checkPdf('application/pdf', fakePdfBase64());
  ok(good.ok, 'un PDF correct est accepté');
  ok(!checkPdf('image/png', fakePdfBase64()).ok, 'mauvais type annoncé');
  ok(!checkPdf('application/pdf', undefined).ok && !checkPdf(undefined, fakePdfBase64()).ok, 'champs absents');
  const b64 = (s: string) => btoa(s);
  ok(!checkPdf('application/pdf', b64('\x89PNG\r\n\x1a\n' + 'x'.repeat(200) + '%%EOF')).ok, 'un PNG renommé : signature absente');
  ok(!checkPdf('application/pdf', b64('MZ' + 'x'.repeat(200) + '%%EOF')).ok, 'un exécutable : refusé');
  ok(!checkPdf('application/pdf', b64('%PDF-1.4\n' + 'x'.repeat(200))).ok, 'PDF tronqué (pas de %%EOF) : refusé');
  ok(!checkPdf('application/pdf', b64('%PDF-1.4\n%%EOF' + 'x'.repeat(3000))).ok, '%%EOF trop loin de la fin : refusé');
  ok(!checkPdf('application/pdf', '').ok && !checkPdf('application/pdf', 'AAAA').ok, 'vide ou trop court');
  ok(!checkPdf('application/pdf', fakePdfBase64().slice(0, -1)).ok, 'base64 de longueur invalide');
  ok(!checkPdf('application/pdf', fakePdfBase64().replace(/./, '*')).ok, 'caractère hors base64');
  ok(!checkPdf('application/pdf', fakePdfBase64().slice(0, 8) + '\n' + fakePdfBase64().slice(8)).ok, 'retour à la ligne dans le base64 : refusé (strict)');
  ok(!checkPdf('application/pdf', 'data:application/pdf;base64,' + fakePdfBase64()).ok, 'préfixe data: refusé');
  const big = btoa('%PDF-1.4\n' + 'x'.repeat(MAX_PDF_BYTES) + '\n%%EOF\n');
  ok(!checkPdf('application/pdf', big).ok, `plus de ${MAX_PDF_BYTES} octets : refusé`);
  ok(decodeBase64('QUJD')?.length === 3 && decodeBase64('QUJD=') === null && decodeBase64('QU JD') === null, 'décodage base64 strict');
});

Deno.test('Choix des destinataires : base seule, même entreprise, actif, adresse, désabonné', () => {
  const w = makeWorld();
  const none = new Set<string>();
  const r = pickRecipients(CO, [LUCAS, NINA, KEVIN, SARA, OLD, OTHER, ADMIN, 'pas-connu', LUCAS], w.users, new Set(['sara@example.com']));
  eq(r.candidates.map((c) => c.id), [LUCAS, NINA], 'seuls Lucas et Nina peuvent recevoir (dans l’ordre demandé, sans doublon)');
  eq(Object.fromEntries(r.skipped.map((s) => [s.user_id, s.reason])), {
    [KEVIN]: 'sans-adresse', [SARA]: 'desabonne', [OLD]: 'inconnu', [OTHER]: 'inconnu', [ADMIN]: 'inconnu', 'pas-connu': 'inconnu',
  }, 'ignorés, avec la raison');
  eq(r.candidates[0], { id: LUCAS, email: 'lucas@example.com', firstName: 'Lucas' }, 'adresse et prénom viennent de la ligne de base');
  ok(isContactable(w.users[0], CO) && !isContactable(w.users[0], CO2) && !isContactable(w.users[5], CO) && !isContactable(undefined, CO), 'isContactable');
  // Deux salariés, même adresse : un seul e-mail.
  const shared = [...w.users, { id: 'x1', company_id: CO, role: 'worker', is_active: true, first_name: 'Bis', email: 'LUCAS@example.com' }];
  const s = pickRecipients(CO, [LUCAS, 'x1'], shared, none);
  eq(s.candidates.map((c) => c.id), [LUCAS], 'adresse partagée : un seul e-mail');
  eq(s.skipped, [{ user_id: 'x1', reason: 'adresse-partagee' }], '…le second est ignoré avec sa raison');
  // adresse piégée en base : jamais choisie comme destinataire
  const trap = pickRecipients(CO, [LUCAS], [{ ...w.users[0], email: 'lucas@example.com,patron@example.com' }], none);
  eq(trap.skipped[0].reason, 'sans-adresse', 'une adresse en base qui contient une virgule n’est pas utilisée');
});

Deno.test('Résultat du service d’e-mail : envoyé / refusé / incertain', () => {
  eq([200, 201, 202].map(classifyHttp), ['sent', 'sent', 'sent'], '2xx : envoyé');
  eq([400, 401, 403, 422, 429].map(classifyHttp), ['failed', 'failed', 'failed', 'failed', 'failed'], '4xx : refusé, rien n’est parti');
  eq([408, 409, 500, 502, 503, 504, 302, 0].map(classifyHttp), ['uncertain', 'uncertain', 'uncertain', 'uncertain', 'uncertain', 'uncertain', 'uncertain', 'uncertain'], '408, 409, 5xx, le reste : incertain');
  ok(reasonText('desabonne', 'message-bureau').includes('contactez-la autrement') && !reasonText('desabonne', 'planning-hebdo').includes('contactez'), 'le message dit pourquoi il est bloqué');
  ok(reasonText('incertain', 'planning-hebdo').includes('peut-être parti'), 'incertain est dit en clair');
  ok(reasonText('limite', 'planning-hebdo') === 'Limite quotidienne atteinte (50). Réessayez demain.', 'limite');
});

// ═══════════════════════════════════════════════════════════════════════════
// Le moteur (faux monde, faux transport)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('Moteur — qui peut appeler : admin actif de l’entreprise, rien d’autre', async () => {
  const w = makeWorld();
  const body = messageBody([LUCAS]);
  for (const [who, caller, status] of [['un salarié', LUCAS, 403], ['un chef d’équipe', NINA, 403], ['un administrateur archivé', ARCHIVE, 403], ['le support BEMEXO', SUPPORT, 403], ['un inconnu', 'ffffffff-0000-4000-8000-000000000000', 403]] as const) {
    const r = await call(w, caller, body);
    eq(r.status, status, `${who} : refusé`);
  }
  eq(w.sendCalls, 0, 'aucun e-mail pour tous ces refus');
  eq(w.journal.length, 0, 'aucune place prise dans le journal');
  eq((await call(w, SUPPORT, { action: 'etat' })).status, 403, 'le support ne lit même pas l’état');
  ok(String((await call(w, SUPPORT, body)).body.error).includes('lecture seule'), 'le support reçoit une explication');
  eq((await call(w, ADMIN, null)).status, 400, 'requête illisible');
  eq((await call(w, ADMIN, { action: 'supprimer' })).status, 400, 'action inconnue');
  eq((await call(w, ADMIN, [])).status, 400, 'un tableau n’est pas une requête');
});

Deno.test('Moteur — état : adresses, désabonnés, compteur', async () => {
  const w = makeWorld();
  const r = await call(w, ADMIN, { action: 'etat' });
  eq(r.status, 200, 'état lisible');
  eq(r.body.available, true, 'disponible');
  eq([r.body.cap, r.body.used, r.body.remaining], [50, 0, 50], '0 envoi sur 50');
  const ws = r.body.workers as { id: string; has_email: boolean; unsubscribed: Record<string, boolean> }[];
  eq(ws.map((x) => x.id).sort(), [KEVIN, LUCAS, NINA, SARA].sort(), 'les salariés actifs de CETTE entreprise seulement (ni l’archivé, ni l’autre entreprise, ni l’admin)');
  eq(ws.find((x) => x.id === KEVIN)?.has_email, false, 'Kevin n’a pas d’adresse');
  eq(ws.find((x) => x.id === SARA)?.unsubscribed, { 'planning-hebdo': true, 'message-bureau': true }, 'Sara est désabonnée');
  eq(ws.find((x) => x.id === LUCAS)?.unsubscribed, { 'planning-hebdo': false, 'message-bureau': false }, 'Lucas ne l’est pas');
  ok(!JSON.stringify(r.body).includes('@'), 'l’état ne renvoie AUCUNE adresse');
  // Pas encore disponible (migration absente) : une réponse normale, pas une erreur.
  w.unavailable = true;
  const off = await call(w, ADMIN, { action: 'etat' });
  eq([off.status, off.body], [200, { available: false }], 'migration absente : état « pas disponible », sans erreur');
  const send = await call(w, ADMIN, messageBody([LUCAS]));
  eq([send.status, send.body.available], [503, false], 'migration absente : l’envoi est refusé (503), rien ne part');
  eq(w.sendCalls, 0, 'aucun envoi');
});

Deno.test('Moteur — le destinataire n’est JAMAIS pris dans la requête', async () => {
  const w = makeWorld();
  const piege = {
    to: 'pirate@example.com', email: 'pirate@example.com', recipients: ['pirate@example.com'], cc: ['pirate@example.com'], bcc: 'pirate@example.com',
    company_id: CO2, companyId: CO2, from: 'pdg@example.com', reply_to: 'pirate@example.com', subject: 'Sujet imposé',
  };
  const r1 = await call(w, ADMIN, messageBody([LUCAS], 'Bonjour', piege));
  eq(r1.status, 200, 'la demande aboutit');
  eq(w.mailbox.length, 1, 'un seul e-mail');
  eq(w.mailbox[0].to, 'lucas@example.com', 'envoyé à l’adresse de la BASE');
  ok(!JSON.stringify(w.mailbox[0]).includes('pirate'), 'rien de la requête (to, cc, bcc, from, reply_to…) ne se retrouve dans l’e-mail');
  ok(w.mailbox[0].subject !== 'Sujet imposé', 'le sujet imposé est ignoré');
  eq(w.mailbox[0].replyTo, 'bureau@martin-menuiserie.example.com', 'Reply-To = l’adresse de l’entreprise (relue en base)');
  eq(w.journal[0].company_id, CO, 'l’entreprise est celle de l’appelant, pas celle de la requête');
  // planning : mêmes pièges
  const w2 = makeWorld();
  const b = planningBody([LUCAS], piege);
  (b.items[0] as Record<string, unknown>).email = 'pirate@example.com';
  (b.items[0] as Record<string, unknown>).to = 'pirate@example.com';
  eq((await call(w2, ADMIN, b)).status, 200, 'planning : la demande aboutit');
  eq(w2.mailbox.map((m) => m.to), ['lucas@example.com'], 'planning : envoyé à l’adresse de la base');
  ok(!JSON.stringify(w2.mailbox).includes('pirate'), 'planning : rien de la requête dans l’e-mail');
  // ce que le moteur demande à la base : des identifiants, jamais des adresses
  ok(w2.askedIds.flat().every((id) => /^[0-9a-f-]{36}$/.test(id)), 'la base est interrogée par identifiant de salarié');
  // un identifiant d'une autre entreprise, d'un archivé, ou d'un administrateur : rien ne part
  const w3 = makeWorld();
  const r3 = await call(w3, ADMIN, messageBody([OTHER, OLD, ADMIN, ARCHIVE]));
  eq(results(r3).map((x) => x.reason), ['inconnu', 'inconnu', 'inconnu', 'inconnu'], 'autre entreprise, archivé, administrateur : « inconnu »');
  eq([w3.sendCalls, w3.journal.length], [0, 0], 'aucun envoi, aucune place prise');
  ok(!JSON.stringify(r3.body).includes('example.org'), 'rien ne révèle l’adresse d’un salarié d’une autre entreprise');
  // Le bureau d'une AUTRE entreprise ne peut pas écrire à Lucas.
  const w4 = makeWorld();
  const r4 = await call(w4, ADMIN2, messageBody([LUCAS]));
  eq(results(r4)[0].reason, 'inconnu', 'l’administrateur de l’entreprise 2 ne peut pas écrire à un salarié de l’entreprise 1');
  eq(w4.sendCalls, 0, 'aucun envoi');
});

Deno.test('Moteur — planning : un e-mail par salarié, PDF vérifié, nom fabriqué', async () => {
  const w = makeWorld();
  const r = await call(w, ADMIN, planningBody([LUCAS, NINA]));
  eq(r.status, 200, 'ok');
  eq(results(r).map((x) => x.outcome), ['sent', 'sent'], 'deux envoyés');
  eq(w.mailbox.map((m) => m.to), ['lucas@example.com', 'nina@example.com'], 'UN e-mail par destinataire (jamais deux adresses dans un envoi)');
  for (const m of w.mailbox) {
    eq(m.kind, 'planning-hebdo', 'famille : planning-hebdo (donc lien et en-têtes de désabonnement ajoutés par le transport)');
    eq(m.attachments?.map((a) => a.filename), ['planning-semaine-2026-10-19.pdf'], 'le nom du fichier est fabriqué ici');
    eq(m.from, FROM_NOTIFICATIONS, 'expéditeur BEMEXO');
    ok(m.subject.startsWith('[Martin Menuiserie] Votre planning de la semaine du 19 au 25 octobre 2026'), 'sujet du modèle fixe');
    ok(m.idempotencyKey.startsWith('staff-email-'), 'clé d’idempotence de la place du journal');
  }
  ok(w.mailbox[0].html.includes('Bonjour Lucas,') && w.mailbox[1].html.includes('Bonjour Nina,'), 'chacun reçoit SON prénom');
  eq(w.journal.map((j) => j.status), ['sent', 'sent'], 'journal : deux envoyés');
  eq(r.body.used, 2, 'compteur : 2');
  eq(r.body.remaining, 48, 'il reste 48');
});

Deno.test('Moteur — PDF invalide, semaine invalide, demande trop grosse : refusés', async () => {
  const w = makeWorld();
  const body = planningBody([LUCAS, NINA]);
  (body.items[0] as Record<string, unknown>).mime = 'image/png';
  (body.items[1] as Record<string, unknown>).content_base64 = btoa('\x89PNG' + 'x'.repeat(100));
  const r = await call(w, ADMIN, body);
  eq(results(r).map((x) => [x.outcome, x.reason]), [['skipped', 'pdf-invalide'], ['skipped', 'pdf-invalide']], 'les deux PDF invalides sont refusés');
  eq([w.sendCalls, w.journal.length], [0, 0], 'rien envoyé, aucune place prise');
  eq((await call(w, ADMIN, planningBody([LUCAS], { week_start: '2026-10-20' }))).status, 400, 'semaine qui ne commence pas un lundi');
  eq((await call(w, ADMIN, planningBody([LUCAS], { week_start: 'demain' }))).status, 400, 'semaine illisible');
  eq((await call(w, ADMIN, { action: 'planning', week_start: MONDAY, items: [] })).status, 400, 'aucun salarié');
  eq((await call(w, ADMIN, { action: 'planning', week_start: MONDAY, items: [{ user_id: 'x', mime: 'application/pdf', content_base64: fakePdfBase64() }] })).status, 400, 'identifiant qui n’en est pas un');
  eq((await call(w, ADMIN, { action: 'planning', week_start: MONDAY })).status, 400, 'items absent');
  const many = Array.from({ length: 51 }, (_, i) => `10000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`);
  eq((await call(w, ADMIN, planningBody(many))).status, 400, `plus de ${MAX_RECIPIENTS_PER_CALL} destinataires : refusé`);
  const fat = btoa('%PDF-1.4\n' + 'x'.repeat(900_000) + '\n%%EOF\n');
  const bigBody = { action: 'planning', week_start: MONDAY, items: Array.from({ length: 10 }, (_, i) => ({ user_id: `10000000-0000-4000-8000-${String(200 + i).padStart(12, '0')}`, mime: 'application/pdf', content_base64: fat })) };
  eq((await call(w, ADMIN, bigBody)).status, 413, 'pièces jointes trop lourdes en tout : 413 avant de décoder quoi que ce soit');
  eq(w.sendCalls, 0, 'aucun envoi');
});

Deno.test('Moteur — message : nettoyé, borné, modèle fixe', async () => {
  const w = makeWorld();
  eq((await call(w, ADMIN, messageBody([LUCAS], 'x'.repeat(501)))).status, 400, '501 caractères : refusé');
  eq((await call(w, ADMIN, messageBody([LUCAS], '   '))).status, 400, 'message vide : refusé');
  eq((await call(w, ADMIN, messageBody([], 'Bonjour'))).status, 400, 'aucun salarié : refusé');
  eq((await call(w, ADMIN, { action: 'message', user_ids: LUCAS, message: 'Bonjour' })).status, 400, 'user_ids doit être une liste');
  eq((await call(w, ADMIN, messageBody(['x'], 'Bonjour'))).status, 400, 'identifiant invalide');
  eq(w.sendCalls, 0, 'rien n’est parti');
  const r = await call(w, ADMIN, messageBody([LUCAS, NINA, LUCAS], '<b>Urgent</b>\r\n\r\n\r\nRéunion à 7 h.'));
  eq(results(r).length, 2, 'le même salarié deux fois = une ligne');
  eq(w.mailbox.length, 2, 'deux e-mails (un par destinataire)');
  ok(w.mailbox[0].html.includes('&lt;b&gt;Urgent&lt;/b&gt;') && !w.mailbox[0].html.includes('<b>Urgent'), 'le HTML du message est échappé');
  eq(w.mailbox[0].subject, '[Martin Menuiserie] Message du bureau', 'sujet fixe');
  eq(w.mailbox[0].attachments, undefined, 'un message n’a pas de pièce jointe');
  eq(w.mailbox[0].kind, 'message-bureau', 'famille message-bureau (désabonnement)');
});

Deno.test('Moteur — désabonnés : jamais écrits, et le bureau est prévenu', async () => {
  const w = makeWorld();
  const r1 = await call(w, ADMIN, messageBody([SARA]));
  eq(w.sendCalls, 0, 'message à UNE salariée désabonnée : rien n’est parti');
  eq(results(r1)[0].reason, 'desabonne', 'raison : désabonnée');
  ok(results(r1)[0].message.includes('contactez-la autrement') && results(r1)[0].message.includes('ne plus recevoir'), 'avec une explication claire');
  eq(w.journal.length, 0, 'aucune place prise pour un envoi qui n’aura pas lieu');
  const r2 = await call(w, ADMIN, planningBody([SARA, LUCAS]));
  eq(w.mailbox.map((m) => m.to), ['lucas@example.com'], 'planning : Sara est ignorée, Lucas reçoit');
  eq(results(r2).map((x) => x.reason ?? x.outcome), ['desabonne', 'sent'], 'résultat par destinataire');
  // désabonnée du planning seulement : le message passe
  w.unsub = new Set(['sara@example.com|planning-hebdo']);
  const r3 = await call(w, ADMIN, messageBody([SARA]));
  eq(results(r3)[0].outcome, 'sent', 'désabonnée du planning seulement : le message (autre famille) part');
  const r4 = await call(w, ADMIN, planningBody([SARA]));
  eq(results(r4)[0].reason, 'desabonne', '…mais pas le planning');
  // liste illisible : on n'envoie PAS
  const w2 = makeWorld(); w2.unsubFails = true;
  const r5 = await call(w2, ADMIN, messageBody([LUCAS]));
  eq(r5.status, 500, 'liste des désabonnés illisible : la demande échoue');
  eq([w2.sendCalls, w2.journal.length], [0, 0], '…et rien n’est parti, aucune place prise');
  ok(String(r5.body.error).includes('Rien n’est parti'), '…avec le message « Rien n’est parti »');
  // sans adresse
  const r6 = await call(makeWorld(), ADMIN, messageBody([KEVIN]));
  eq(results(r6)[0].reason, 'sans-adresse', 'sans adresse : ignoré avec sa raison');
});

Deno.test('Moteur — plafond : respecté, y compris en rafale', async () => {
  // 48 déjà envoyés aujourd'hui, 5 destinataires : 2 places seulement.
  const w = makeWorld();
  for (let i = 0; i < 48; i++) w.journal.push({ id: `j${i}`, company_id: CO, kind: 'message-bureau', user_id: null, mask: 'a***@b.fr', rhash: String(i).padStart(64, '0'), chash: 'a'.repeat(64), day: w.day, status: 'sent', reason: null, created_ms: w.clockMs - 3_600_000 });
  const extra = ['20', '21', '22'].map((n) => `10000000-0000-4000-8000-0000000000${n}`);
  for (const [i, id] of extra.entries()) w.users.push({ id, company_id: CO, role: 'worker', is_active: true, first_name: `E${i}`, email: `e${i}@example.com` });
  const r = await call(w, ADMIN, messageBody([LUCAS, NINA, ...extra]));
  eq(r.status, 200, 'partiellement accepté');
  eq(results(r).map((x) => x.outcome), ['sent', 'sent', 'skipped', 'skipped', 'skipped'], 'deux envoyés, trois arrêtés');
  eq(results(r).slice(2).map((x) => x.message), Array(3).fill('Limite quotidienne atteinte (50). Réessayez demain.'), 'le message du plafond, mot pour mot');
  eq([w.mailbox.length, r.body.used, r.body.remaining], [2, 50, 0], '2 e-mails, compteur 50/50');
  // plafond atteint : refus net, 429, aucune place, aucun envoi
  const before = w.journal.length;
  const r2 = await call(w, ADMIN, messageBody([LUCAS], 'Autre texte'));
  eq(r2.status, 429, 'plafond atteint : 429');
  eq(r2.body.error, 'Limite quotidienne atteinte (50). Réessayez demain.', 'avec le message exact');
  eq([w.mailbox.length, w.journal.length], [2, before], 'aucun e-mail de plus, aucune ligne de plus');
  // le lendemain (jour de Paris suivant), c'est reparti
  w.day = '2026-10-15';
  const r3 = await call(w, ADMIN, messageBody([LUCAS], 'Autre texte'));
  eq(results(r3)[0].outcome, 'sent', 'le lendemain, le compteur repart de zéro');
  // RAFALE : 12 appels simultanés de 10 destinataires distincts pour une entreprise à 30 places libres.
  const w2 = makeWorld();
  const crowd: string[] = [];
  for (let i = 0; i < 40; i++) {
    const id = `10000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`;
    crowd.push(id); w2.users.push({ id, company_id: CO, role: 'worker', is_active: true, first_name: `C${i}`, email: `c${i}@example.com` });
  }
  const burst = await Promise.all(Array.from({ length: 12 }, (_, k) => call(w2, ADMIN, messageBody(crowd.slice((k * 7) % 31, ((k * 7) % 31) + 10), `Message ${k}`))));
  ok(w2.mailbox.length <= DAILY_EMAIL_CAP, `rafale : jamais plus de ${DAILY_EMAIL_CAP} e-mails (parti : ${w2.mailbox.length})`);
  eq(w2.mailbox.length, DAILY_EMAIL_CAP, 'rafale : le plafond est utilisé en entier (50), pas moins');
  eq(w2.journal.filter((j) => j.status !== 'failed').length, DAILY_EMAIL_CAP, 'rafale : 50 lignes comptées au journal');
  ok(burst.some((r) => results(r).some((x) => x.reason === 'limite')) || burst.some((r) => r.status === 429), 'rafale : certains ont reçu « Limite quotidienne atteinte »');
});

Deno.test('Moteur — doublon : même contenu, même personne, même minute = un seul envoi', async () => {
  const w = makeWorld();
  const a = await call(w, ADMIN, messageBody([LUCAS], 'Rendez-vous demain'));
  const b = await call(w, ADMIN, messageBody([LUCAS], 'Rendez-vous demain'));
  eq(results(a)[0].outcome, 'sent', 'premier envoi');
  eq([results(b)[0].outcome, results(b)[0].reason], ['skipped', 'doublon'], 'deuxième envoi : doublon, non renvoyé');
  eq(w.mailbox.length, 1, 'un seul e-mail');
  const c = await call(w, ADMIN, messageBody([LUCAS], 'Un autre texte'));
  eq(results(c)[0].outcome, 'sent', 'autre texte : accepté');
  w.clockMs += 61_000;
  const d = await call(w, ADMIN, messageBody([LUCAS], 'Rendez-vous demain'));
  eq(results(d)[0].outcome, 'sent', 'après une minute : accepté de nouveau');
  // même planning (même PDF) deux fois de suite
  const e1 = await call(w, ADMIN, planningBody([NINA]));
  const e2 = await call(w, ADMIN, planningBody([NINA]));
  eq([results(e1)[0].outcome, results(e2)[0].reason], ['sent', 'doublon'], 'planning identique redemandé : doublon');
});

Deno.test('Moteur — transport : envoyé / non envoyé / incertain, jamais de renvoi automatique', async () => {
  const w = makeWorld();
  w.transport = () => ({ outcome: 'failed', code: 'refus-service' });
  const r1 = await call(w, ADMIN, messageBody([LUCAS], 'Premier'));
  eq(results(r1)[0].outcome, 'failed', 'refusé par le service : « non envoyé »');
  ok(results(r1)[0].message.includes('rien n’est parti'), '…et le dit');
  eq(w.sendCalls, 1, 'UN seul essai, pas de renvoi automatique');
  eq([w.journal[0].status, w.journal[0].reason], ['failed', 'refus-service'], 'journal : failed + code court');
  eq(r1.body.used, 0, 'un refus rend sa place : compteur 0');
  // incertain : la place est GARDÉE
  w.transport = () => ({ outcome: 'uncertain', code: 'reseau' });
  const r2 = await call(w, ADMIN, messageBody([NINA], 'Second'));
  eq(results(r2)[0].outcome, 'uncertain', 'réponse perdue : « incertain »');
  ok(results(r2)[0].message.includes('peut-être parti') && results(r2)[0].message.includes('Ne le renvoyez pas'), '…avec la consigne de ne pas renvoyer');
  eq(r2.body.used, 1, 'un envoi incertain garde sa place');
  eq(w.sendCalls, 2, 'toujours un essai par destinataire');
  // le transport lève une erreur : incertain, jamais une exception qui fait perdre les autres résultats
  w.transport = (_m, n) => { if (n === 3) throw new Error('boum'); return { outcome: 'sent', code: 'ok' }; };
  const r3 = await call(w, ADMIN, messageBody([LUCAS, NINA], 'Troisième'));
  eq(results(r3).map((x) => x.outcome), ['uncertain', 'sent'], 'une erreur du transport ne fait pas perdre les autres résultats');
  eq(w.journal.at(-2)?.status, 'uncertain', 'journal : incertain');
  // un code de transport farfelu n'entre pas dans le journal
  w.transport = () => ({ outcome: 'sent', code: 'Texte Libre Avec Des Espaces & le contenu' });
  await call(w, ADMIN, messageBody([LUCAS], 'Quatrième'));
  eq(w.journal.at(-1)?.reason, 'inconnu', 'un code qui n’a pas la forme d’un mot est remplacé');
});

Deno.test('Moteur — délai : au-delà du budget de temps, on cesse d’envoyer', async () => {
  const w = makeWorld();
  w.transport = () => { w.clockMs += SEND_BUDGET_MS + 1; return { outcome: 'sent', code: 'ok' }; };
  const r = await call(w, ADMIN, messageBody([LUCAS, NINA], 'Long'));
  eq(results(r).map((x) => [x.outcome, x.reason ?? null]), [['sent', null], ['failed', 'delai']], 'le premier part, le second est arrêté proprement');
  eq(w.sendCalls, 1, 'un seul appel au transport');
  eq(w.journal.map((j) => j.status), ['sent', 'failed'], 'journal cohérent');
  ok(results(r)[1].message.includes('recommencez'), 'le bureau sait quoi faire');
});

Deno.test('Moteur — rien de sensible dans le journal ni dans les logs', async () => {
  const w = makeWorld();
  const secret = 'Texte confidentiel du patron : licenciement de Kevin';
  await call(w, ADMIN, messageBody([LUCAS, NINA], secret));
  const pdf = fakePdfBase64('contenu-confidentiel');
  await call(w, ADMIN, { action: 'planning', week_start: MONDAY, items: [{ user_id: LUCAS, mime: 'application/pdf', content_base64: pdf }] });
  const dump = JSON.stringify({ journal: w.journal, logs: w.logs });
  ok(!dump.includes('licenciement') && !dump.includes('confidentiel'), 'ni le message, ni le contenu du PDF dans le journal ni dans les logs');
  ok(!dump.includes(pdf.slice(0, 30)), 'pas de pièce jointe dans le journal');
  ok(!/@example\.com/.test(dump.replace(/\*\*\*@example\.com/g, '')), 'aucune adresse complète : seulement « l***@example.com »');
  ok(w.journal.every((j) => /^[a-z]\*\*\*@example\.com$/.test(j.mask) && /^[0-9a-f]{64}$/.test(j.rhash) && /^[0-9a-f]{64}$/.test(j.chash)), 'destinataire masqué + empreintes');
  ok(w.logs.length >= 2 && w.logs.every((l) => Object.values(l.data).every((v) => typeof v === 'number' || typeof v === 'string' && v.length < 40)), 'logs : compteurs et mots courts seulement');
  eq(await recipientHash(CO, 'Lucas@Example.com'), await recipientHash(CO, 'lucas@example.com'), 'l’empreinte ne dépend pas de la casse');
  ok((await recipientHash(CO, 'lucas@example.com')) !== (await recipientHash(CO2, 'lucas@example.com')), 'l’empreinte est propre à chaque entreprise');
});

Deno.test('Moteur — Reply-To : l’entreprise si elle a une adresse, sinon BEMEXO', async () => {
  const w = makeWorld();
  await call(w, ADMIN, messageBody([LUCAS], 'Avec adresse'));
  eq(w.mailbox[0].replyTo, 'bureau@martin-menuiserie.example.com', 'adresse de l’entreprise');
  ok(w.mailbox[0].html.includes('Répondez à cet e-mail'), 'le pied invite à répondre');
  const w2 = makeWorld();
  w2.profiles[ADMIN] = { role: 'admin', company_id: CO2, is_active: true };
  w2.users.push({ id: '10000000-0000-4000-8000-0000000000aa', company_id: CO2, role: 'worker', is_active: true, first_name: 'Zoé', email: 'zoe@example.com' });
  await call(w2, ADMIN, messageBody(['10000000-0000-4000-8000-0000000000aa'], 'Sans adresse'));
  eq(w2.mailbox[0].replyTo, REPLY_TO, 'sans adresse d’entreprise : l’adresse BEMEXO habituelle');
  ok(w2.mailbox[0].html.includes('ne permet pas de répondre au bureau'), 'le pied le dit honnêtement');
  w2.companies[CO2] = { name: 'Autre', email: 'pas-une-adresse' };
  w2.journal.length = 0; w2.mailbox.length = 0;
  await call(w2, ADMIN, messageBody(['10000000-0000-4000-8000-0000000000aa'], 'Adresse bizarre'));
  eq(w2.mailbox[0].replyTo, REPLY_TO, 'adresse d’entreprise invalide : BEMEXO');
});

// ═══════════════════════════════════════════════════════════════════════════
// L'envoi Resend (faux fetch) et les désabonnements
// ═══════════════════════════════════════════════════════════════════════════

type Call = { url: string; init: RequestInit };
function withFakeEnv<T>(fn: (calls: Call[], set: (s: number | Error | 'hang') => void) => Promise<T>, opts: { key?: boolean; url?: boolean } = {}) {
  return async () => {
    const saved = { fetch: globalThis.fetch, key: Deno.env.get('RESEND_API_KEY'), url: Deno.env.get('SUPABASE_URL'), sec: Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') };
    const calls: Call[] = [];
    let answer: number | Error | 'hang' = 200;
    if (opts.key !== false) Deno.env.set('RESEND_API_KEY', 'cle-factice-de-test'); else Deno.env.set('RESEND_API_KEY', ''); // vide = absent pour le code
    if (opts.url !== false) Deno.env.set('SUPABASE_URL', 'https://projet-factice.supabase.test'); else Deno.env.set('SUPABASE_URL', '');
    Deno.env.set('EMAIL_UNSUBSCRIBE_SECRET', 'secret-de-test');
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (answer === 'hang') return new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'TimeoutError'))));
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(new Response('{"message":"détail avec lucas@example.com"}', { status: answer }));
    }) as typeof fetch;
    try { await fn(calls, (s) => { answer = s; }); } finally {
      globalThis.fetch = saved.fetch;
      for (const [k, v] of [['RESEND_API_KEY', saved.key], ['SUPABASE_URL', saved.url], ['EMAIL_UNSUBSCRIBE_SECRET', saved.sec]] as const) { Deno.env.set(k, v ?? ''); }
    }
  };
}
const bodyOf = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;

Deno.test('Resend — les nouvelles familles portent lien et en-têtes de désabonnement', withFakeEnv(async (calls) => {
  for (const kind of ['planning-hebdo', 'message-bureau'] as const) {
    calls.length = 0;
    await sendResend({ to: 'Lucas@Example.com', subject: 'S', html: '<p>Bonjour</p>', kind, replyTo: 'bureau@example.com', attachments: [{ filename: 'p.pdf', content: 'QUJD' }] });
    const b = bodyOf(calls[0]);
    const h = b.headers as Record<string, string>;
    ok(h['List-Unsubscribe'].includes(`/functions/v1/email-unsubscribe?e=${encodeEmail('lucas@example.com')}&k=${kind}&t=`), `${kind} : List-Unsubscribe (RFC 8058) vers la fonction`);
    eq(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click', `${kind} : un clic`);
    ok(String(b.html).includes(`https://bemexo.com/desabonnement?e=${encodeEmail('lucas@example.com')}&k=${kind}&t=`) && String(b.html).includes('Se désabonner'), `${kind} : lien « Se désabonner » dans le corps`);
    ok(String(b.text).includes('Se désabonner'), `${kind} : version texte`);
    eq(b.to, ['Lucas@Example.com'], `${kind} : UN seul destinataire`);
    eq(b.reply_to, 'bureau@example.com', `${kind} : Reply-To`);
    eq(b.attachments, [{ filename: 'p.pdf', content: 'QUJD' }], `${kind} : pièce jointe`);
  }
  calls.length = 0;
  await sendResend({ to: 'a@example.com', subject: 'S', html: '<p>x</p>', kind: 'planning-hebdo' });
  ok(String(bodyOf(calls[0]).html).includes('Vous recevez le planning de la semaine du bureau par BEMEXO, à la demande de votre entreprise.'), 'phrase du pied pour le planning');
  calls.length = 0;
  await sendResend({ to: 'a@example.com', subject: 'S', html: '<p>x</p>', kind: 'budget-alerts' });
  ok(String(bodyOf(calls[0]).html).includes('Vous recevez les alertes de budget chantier de BEMEXO.'), 'les anciennes familles gardent leur phrase exacte');
}));

Deno.test('Resend — les e-mails des anciennes familles sont INCHANGÉS (octet pour octet)', withFakeEnv(async (calls) => {
  Deno.env.set('RESEND_API_KEY', 'cle-factice-de-test');
  await sendResend({ to: 'Jean@Example.com', subject: 'Sujet', html: '<p>Bonjour</p>', kind: 'weekly-digest', idempotencyKey: 'k1', cc: ['a@example.com'], attachments: [{ filename: 'f.pdf', content: 'AAAA' }] });
  await sendResend({ to: 'x@example.com', subject: 'Sans famille', html: '<p>Hi</p>' });
  await sendToEach(['b@example.com', 'c@example.com'], { subject: 'S', html: '<p>x</p>', kind: 'budget-alerts', replyTo: 'r@example.com', from: 'F <f@example.com>' }, 'dedupe-1');
  const golden = JSON.parse(Deno.readTextFileSync(new URL('../../tests/fixtures/email-resend-avant-lot19.json', import.meta.url)));
  // Le relevé a été fait avec ce projet fictif-là.
  const now = calls.map((c) => ({ url: c.url, method: c.init.method, headers: c.init.headers, body: String(c.init.body).replaceAll('projet-factice.supabase.test', 'fake.supabase.test') }));
  eq(now, golden, 'mêmes requêtes que AVANT le lot 19 (relevé fait sur l’ancien email.ts)');
}));

Deno.test('Resend — sendResendOutcome : envoyé / refusé / incertain, sans renvoi, sans fuite', withFakeEnv(async (calls, set) => {
  const mail = { to: 'lucas@example.com', subject: 'S', html: '<p>x</p>', kind: 'message-bureau' as const, idempotencyKey: 'staff-email-1' };
  const run = async (s: number | Error | 'hang', timeout = 20_000) => { calls.length = 0; set(s); return { r: await sendResendOutcome(mail, fetch, timeout), n: calls.length }; };
  eq((await run(200)).r, { outcome: 'sent', code: 'ok' }, '200 : envoyé');
  eq((await run(202)).r.outcome, 'sent', '202 : envoyé');
  for (const s of [400, 401, 403, 422, 429]) eq((await run(s)).r, { outcome: 'failed', code: 'refus-service' }, `${s} : refusé, rien n’est parti`);
  for (const s of [408, 409, 500, 502, 503]) eq((await run(s)).r, { outcome: 'uncertain', code: 'incertain-http' }, `${s} : incertain`);
  eq((await run(new TypeError('network'))).r, { outcome: 'uncertain', code: 'reseau' }, 'réseau coupé : incertain');
  eq((await run('hang', 20)).r, { outcome: 'uncertain', code: 'reseau' }, 'pas de réponse (délai) : incertain');
  for (const s of [200, 400, 500, new TypeError('x')] as const) eq((await run(s)).n, 1, 'UN seul appel par envoi, jamais de renvoi');
  await run(200);
  eq((calls[0].init.headers as Record<string, string>)['Idempotency-Key'], 'staff-email-1', 'clé d’idempotence transmise');
  const res = JSON.stringify(await run(500));
  ok(!res.includes('lucas@example.com') && !res.includes('détail'), 'le corps de la réponse (qui peut citer l’adresse) n’est jamais renvoyé');
}));

Deno.test('Resend — sans clé ou sans secret de signature : rien ne part', async () => {
  await withFakeEnv(async (calls) => {
    eq(await sendResendOutcome({ to: 'a@example.com', subject: 'S', html: 'x', kind: 'message-bureau' }), { outcome: 'failed', code: 'cle-absente' }, 'clé absente : non envoyé');
    eq(calls.length, 0, 'aucun appel réseau');
  }, { key: false })();
  await withFakeEnv(async (calls) => {
    eq(await sendResendOutcome({ to: 'a@example.com', subject: 'S', html: 'x', kind: 'message-bureau' }), { outcome: 'failed', code: 'preparation' }, 'lien de désabonnement impossible à signer : non envoyé');
    eq(calls.length, 0, 'aucun appel réseau');
  }, { url: false })();
});

Deno.test('Désabonnement — familles, tables, jetons', withFakeEnv(async () => {
  eq(EMAIL_KINDS, ['weekly-digest', 'missing-days', 'cert-expiry', 'budget-alerts'], 'les QUATRE familles de l’ancienne table ne changent pas');
  eq(ALL_EMAIL_KINDS, ['weekly-digest', 'missing-days', 'cert-expiry', 'budget-alerts', 'planning-hebdo', 'message-bureau'], 'six familles au total');
  for (const k of EMAIL_KINDS) eq(unsubscribeTable(k), 'email_unsubscribes', `${k} : ancienne table`);
  for (const k of STAFF_EMAIL_KINDS) eq(unsubscribeTable(k), 'email_unsubscribes_v2', `${k} : table v2`);
  const t = await unsubscribeToken('lucas@example.com', 'planning-hebdo');
  ok(await verifyUnsubscribeToken('Lucas@Example.com', 'planning-hebdo', t), 'le jeton se vérifie');
  ok(!(await verifyUnsubscribeToken('lucas@example.com', 'message-bureau', t)), 'un jeton « planning » ne désabonne pas des « messages »');
  ok(!(await verifyUnsubscribeToken('sara@example.com', 'planning-hebdo', t)), 'ni quelqu’un d’autre');
  ok(!(await verifyUnsubscribeToken('lucas@example.com', 'planning-hebdo', t.slice(0, -2) + 'AA')), 'ni un jeton modifié');
  eq(decodeEmail(encodeEmail('Lucas@Example.com')), 'lucas@example.com', 'adresse encodée / décodée');
  ok((await unsubscribeUrl('a@example.com', 'message-bureau')).includes('/functions/v1/email-unsubscribe?') && (await unsubscribePageUrl('a@example.com', 'message-bureau')).startsWith('https://bemexo.com/desabonnement?'), 'liens');
  // loadUnsubscribed lit la bonne table
  const asked: string[] = [];
  const db = { from: (table: string) => ({ select: () => ({ eq: () => { asked.push(table); return Promise.resolve({ data: [{ email: 'A@Example.com ' }], error: null }); } }) }) };
  eq([...(await loadUnsubscribed(db, 'weekly-digest'))], ['a@example.com'], 'ancienne famille : lue');
  await loadUnsubscribed(db, 'planning-hebdo');
  eq(asked, ['email_unsubscribes', 'email_unsubscribes_v2'], 'chaque famille lit SA table');
  // La fonction email-unsubscribe écrit dans la bonne table (relu dans le source).
  const src = Deno.readTextFileSync(new URL('../email-unsubscribe/index.ts', import.meta.url));
  ok(src.includes('ALL_EMAIL_KINDS.includes') && src.includes('.from(unsubscribeTable(kind as EmailKind))'), 'email-unsubscribe accepte les six familles et choisit la table');
  ok(src.includes('verifyUnsubscribeToken') && src.indexOf('verifyUnsubscribeToken') < src.indexOf(".from(unsubscribeTable"), 'le jeton est vérifié AVANT toute écriture');
}));

Deno.test('Resend — sendToEach et les anciennes fonctions n’ont pas bougé de comportement', withFakeEnv(async (calls, set) => {
  set(200);
  const rep = await sendToEach(['a@example.com', 'b@example.com'], { subject: 'S', html: '<p>x</p>', kind: 'cert-expiry' });
  eq([rep.sent, rep.failed], [['a@example.com', 'b@example.com'], []], 'deux envois, un par destinataire');
  eq(calls.length, 2, 'deux appels');
  set(500);
  const rep2 = await sendToEach(['a@example.com'], { subject: 'S', html: '<p>x</p>', kind: 'cert-expiry' });
  eq(rep2.failed.length, 1, 'un échec est rapporté (comportement d’origine : sendResend lève, sendToEach l’attrape)');
  ok(rep2.failed[0].error.startsWith('Resend 500'), 'avec le message d’origine « Resend 500 »');
  eq(htmlToText('<p>Bonjour&nbsp;&amp; merci</p><ul><li>a</li></ul>'), 'Bonjour & merci\n\n- a', 'htmlToText inchangé');
}));

// ═══════════════════════════════════════════════════════════════════════════
// La fonction elle-même : relue comme du texte (le test de bout en bout est dans
// staff-email-function.check.ts)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('Fonction send-staff-email — garde-fous lisibles dans le source', () => {
  const src = Deno.readTextFileSync(new URL('../send-staff-email/index.ts', import.meta.url));
  const code = src.replace(/\/\/.*$/gm, '');
  ok(!/\.(delete|remove)\(/.test(code), 'aucune suppression (.delete / .remove)');
  ok(!/body\.(to|email|recipients?|cc|bcc|company_?id)\b/i.test(code) && !/\.to\b.*req/.test(code), 'le source ne lit ni destinataire ni entreprise dans la requête');
  ok(code.includes('auth.getUser(token)') && code.includes('Session invalide'), 'jeton vérifié');
  ok(code.includes('handleStaffEmail(makeDeps(admin), caller.id, body)'), 'seul l’identifiant de l’appelant et le corps parsé passent au moteur');
  ok(code.includes('sendResendOutcome') && !code.includes('sendResend('), 'le transport rapporte son issue (pas de lancer d’erreur)');
  const consoleArgs = [...code.matchAll(/console\.\w+\(\s*(?:"[^"]*"|`[^`]*`)\s*(?:,([^)]*))?\)/g)].map((m) => m[1] ?? '');
  ok(consoleArgs.length >= 2 && consoleArgs.every((a) => !/\b(body|raw|html|message|email|req|caller)\b/.test(a)), 'aucun journal ne reçoit le corps, l’adresse ou le message (seulement des compteurs et le nom d’une erreur)');
  ok(/RESEND_API_KEY/.test(code) && !/console\.[a-z]+\([^)]*RESEND_API_KEY/.test(code) && !/json\([^)]*RESEND_API_KEY[^"]/.test(code), 'la clé n’est jamais affichée');
  ok(!/ai-provider|worker-turn|worker-multi|saisie-profil|assistant-eval/.test(code), 'rien d’IA');
  ok(!/from\(["'](time_entries|planning|worksites|payroll|user_payroll)["']\)/.test(code), 'la fonction ne lit aucune donnée de paie ou de planning');
  const run = Deno.readTextFileSync(new URL('./staff-email-run.ts', import.meta.url));
  ok(run.indexOf('deps.reserve(') < run.indexOf('deps.send('), 'le plafond (réservation) est pris AVANT le premier envoi');
  ok(run.indexOf('deps.isSupportStaff(') > 0 && run.indexOf('deps.isSupportStaff(') < run.indexOf('deps.loadProfile('), 'le support est écarté avant tout');
});
