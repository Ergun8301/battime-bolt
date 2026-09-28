'use strict';
// Fake GoTrue: well-formed UNSIGNED JWTs (sub = user id), sessions valid until 2036.

const crypto = require('crypto');
const T = require('./time');
const db = require('./db');

const EXP = Date.UTC(2036, 0, 1) / 1000; // 2036-01-01T00:00:00Z
const ANON_KEY = 'demo-anon-key';

const b64url = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const stableUuid = (seed) => {
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function authUser(u) {
  const created = u.created_at || '2026-06-02T08:00:00+00:00';
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '',
    email_confirmed_at: created, confirmed_at: created, last_sign_in_at: T.clock.nowIso(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { first_name: u.first_name, last_name: u.last_name, email_verified: true },
    identities: [], created_at: created, updated_at: created, is_anonymous: false,
  };
}

function makeJwt(u) {
  const iat = Math.floor(T.clock.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT', kid: 'demo' }),
    b64url({
      iss: 'http://localhost:4600/sb/auth/v1', sub: u.id, aud: 'authenticated', exp: EXP, iat,
      email: u.email, phone: '', app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { first_name: u.first_name, last_name: u.last_name },
      role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: iat }],
      session_id: stableUuid(`session|${u.id}`), is_anonymous: false,
    }),
    b64url('demo-unsigned-signature'),
  ].join('.');
}

function sessionFor(u) {
  return {
    access_token: makeJwt(u),
    token_type: 'bearer',
    expires_in: Math.max(60, EXP - Math.floor(T.clock.now() / 1000)),
    expires_at: EXP,
    refresh_token: `demo-refresh-${u.id}`,
    user: authUser(u),
  };
}

function findUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return db.rows('users').find((u) => String(u.email || '').toLowerCase() === e) || null;
}

/** Bearer JWT -> user id (null for the anon key or anything unparsable). */
function uidFromAuthHeader(h) {
  const m = /^Bearer\s+(.+)$/i.exec(String(h || ''));
  if (!m || m[1] === ANON_KEY) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof p.sub === 'string' ? p.sub : null;
  } catch { return null; }
}

module.exports = { EXP, ANON_KEY, authUser, makeJwt, sessionFor, findUserByEmail, uidFromAuthHeader, stableUuid };
