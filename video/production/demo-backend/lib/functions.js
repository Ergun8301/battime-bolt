'use strict';
// Edge functions, canned. Nothing ever leaves this process: no mail, no push,
// no Stripe.

const db = require('./db');
const T = require('./time');
const { rows } = db;

const outbox = []; // what "would" have been sent — visible in /__demo/state?table=__outbox

function json(status, body) { return { status, body }; }

const FUNCTIONS = {
  'send-push'(body, c) {
    if (!c.uid) return json(401, { error: 'Non authentifié' });
    outbox.push({ fn: 'send-push', at: c.now, from: c.uid, body });
    if (body && body.correction_id) {
      const corr = rows('time_entry_corrections').find((x) => x.id === body.correction_id);
      if (!corr) return json(404, { error: 'Correction introuvable' });
    }
    return json(200, { sent: 1 });
  },

  'send-payroll-export'(body, c) {
    if (!c.isAdmin) return json(403, { error: "Réservé à l'administrateur de l'entreprise" });
    const co = rows('companies').find((x) => x.id === c.company);
    if (!co || !co.accountant_email) return json(400, { error: "Aucune adresse de comptable enregistrée." });
    const key = String((body && body.idempotencyKey) || '');
    const prev = rows('payroll_sends').find((x) => x.company_id === c.company && x.idempotency_key === key);
    outbox.push({ fn: 'send-payroll-export', at: c.now, to: co.accountant_email, fileName: body && body.fileName, periodLabel: body && body.periodLabel, bytes: body && body.contentBase64 ? body.contentBase64.length : 0 });
    if (prev) return json(200, { duplicate: true, alreadySentAt: prev.sent_at });
    db.insertRows('payroll_sends', [{ company_id: c.company, idempotency_key: key, period_label: body && body.periodLabel, file_name: body && body.fileName, sent_by: c.uid }], c, { rls: false });
    return json(200, {});
  },

  'invite-worker'(body, c) {
    if (!c.isAdmin) return json(403, { error: "Réservé à l'administrateur de l'entreprise" });
    const email = String((body && body.email) || '').trim().toLowerCase();
    if (!email) return json(400, { error: 'E-mail manquant' });
    if (body.action === 'revoke') {
      const invs = rows('invitations').filter((i) => i.company_id === c.company && String(i.email).toLowerCase() === email);
      db.deleteRows('invitations', invs, db.serviceCtx(c));
      const u = rows('users').find((x) => x.company_id === c.company && String(x.email).toLowerCase() === email && x.invited_at
        && !rows('time_entries').some((t) => t.user_id === x.id));
      if (u) db.deleteRows('users', [u], db.serviceCtx(c));
      outbox.push({ fn: 'invite-worker', at: c.now, action: 'revoke', email });
      return json(200, { ok: true });
    }
    let u = rows('users').find((x) => String(x.email).toLowerCase() === email);
    if (u && u.company_id !== c.company) return json(409, { error: 'Cette adresse est déjà utilisée par une autre entreprise.' });
    if (!u) {
      [u] = db.insertRows('users', [{
        company_id: c.company, first_name: body.first_name || '', last_name: body.last_name || '', email,
        phone: body.phone || null, role: 'worker', is_active: true, invited_at: c.now,
      }], c, { rls: false });
    }
    const existing = rows('invitations').find((i) => i.company_id === c.company && String(i.email).toLowerCase() === email && !i.accepted_at);
    const expires = T.iso(c.nowMs + 7 * 86400000);
    if (existing) Object.assign(existing, { expires_at: expires, created_at: c.now });
    else {
      db.insertRows('invitations', [{
        company_id: c.company, email, phone: body.phone || null, first_name: body.first_name || '', last_name: body.last_name || '',
        role: 'worker', token: db.uuid(), expires_at: expires, created_by: c.uid,
      }], c, { rls: false });
    }
    outbox.push({ fn: 'invite-worker', at: c.now, email });
    return json(200, { ok: true });
  },

  'weekly-digest'(body, c) { outbox.push({ fn: 'weekly-digest', at: c.now }); return json(200, { ok: true, sent: 1 }); },
  'cert-expiry-alerts'(body, c) { outbox.push({ fn: 'cert-expiry-alerts', at: c.now }); return json(200, { ok: true, sent: 0 }); },
  'budget-alerts'(body, c) { return json(200, { ok: true }); },
  'missing-days-reminders'(body, c) { return json(200, { ok: true }); },
  'stripe-checkout'() { return json(403, { error: 'Paiement désactivé dans la démo (aucun appel Stripe).' }); },
  'stripe-portal'() { return json(403, { error: 'Paiement désactivé dans la démo (aucun appel Stripe).' }); },
  'stripe-webhook'() { return json(403, { error: 'Paiement désactivé dans la démo (aucun appel Stripe).' }); },
};

module.exports = { FUNCTIONS, outbox };
