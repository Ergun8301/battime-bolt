// Edge Function : send-push
// Envoie une notification Web Push aux appareils d'un ou plusieurs utilisateurs.
//
// Pourquoi une implémentation maison plutôt que la lib `web-push` : celle-ci est
// écrite pour Node (crypto natif) et ne tourne pas sous Deno. On implémente donc
// les deux morceaux du protocole avec WebCrypto :
//   1) VAPID (RFC 8292) : un JWT ES256 signé avec la clé privée, qui prouve au
//      service de push (Google/Mozilla/Apple) que l'envoi vient bien de nous.
//   2) Chiffrement aes128gcm (RFC 8188/8291) : le contenu de la notification est
//      chiffré de bout en bout avec les clés de l'abonnement (p256dh + auth) —
//      le service de push relaie sans jamais pouvoir lire le message.
//
// Appelée uniquement de serveur à serveur (jamais depuis le navigateur) :
//   - par une autre fonction edge / pg_cron via le header x-cron-secret,
//   - ou par un admin connecté (JWT) pour les rappels « heures manquantes ».
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const VAPID_SUBJECT = 'mailto:contact@bemexo.com';

// ── utilitaires base64url ────────────────────────────────────────────────────
const b64urlToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
const bytesToB64url = (b: Uint8Array | ArrayBuffer): string => {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};
const concat = (...arrs: Uint8Array[]): Uint8Array => {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
};

// ── 1) VAPID : JWT ES256 signé avec la clé privée ────────────────────────────
async function vapidHeaders(audience: string): Promise<Record<string, string>> {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants (secrets Supabase)');

  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${payload}`;

  // La clé privée VAPID est le scalaire `d` ; on reconstruit une JWK P-256 en y
  // joignant le point public (x, y) extrait de la clé publique non compressée.
  const pubBytes = b64urlToBytes(pub); // 65 octets : 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64url(pubBytes.slice(1, 33)),
    y: bytesToB64url(pubBytes.slice(33, 65)),
    d: priv,
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));

  return {
    Authorization: `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${pub}`,
  };
}

// ── 2) Chiffrement aes128gcm (RFC 8291) ──────────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key, length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(payload: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  // Paire éphémère côté serveur : la clé publique voyage en clair dans l'en-tête,
  // le secret partagé (ECDH) sert à dériver la clé de chiffrement.
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));

  const clientKey = await crypto.subtle.importKey('raw', clientPub as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, eph.privateKey, 256));

  const enc = new TextEncoder();
  // PRK : mélange du secret ECDH et du secret `auth` de l'abonnement.
  const prk = await hkdf(
    authSecret, shared,
    concat(enc.encode('WebPush: info\0'), clientPub, ephPubRaw),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  // Le corps doit se terminer par un octet de padding 0x02 (dernier enregistrement).
  const plaintext = concat(enc.encode(payload), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource }, key, plaintext as BufferSource,
  ));

  // En-tête aes128gcm : salt(16) || recordSize(4, big-endian) || idLen(1) || clé publique éphémère(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([ephPubRaw.length]), ephPubRaw, ciphertext);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function pushToSub(sub: Sub, payload: string): Promise<{ ok: boolean; status?: number; gone?: boolean }> {
  const url = new URL(sub.endpoint);
  const headers = await vapidHeaders(`${url.protocol}//${url.host}`);
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body: body as BodyInit,
  });
  // 404/410 = abonnement mort (app désinstallée, navigateur réinitialisé) → à purger.
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// Envoie à tous les appareils des utilisateurs visés. Purge les abonnements morts.
async function sendToUsers(
  admin: ReturnType<typeof createClient>,
  userIds: string[],
  notif: { title: string; body: string; url?: string; tag?: string },
) {
  if (!userIds.length) return { sent: 0, failed: 0, purged: 0 };
  const { data } = await admin.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').in('user_id', userIds);
  const subs = (data || []) as Sub[];
  if (!subs.length) return { sent: 0, failed: 0, purged: 0 };

  const payload = JSON.stringify(notif);
  let sent = 0, failed = 0;
  const dead: string[] = [];

  for (const s of subs) {
    try {
      const r = await pushToSub(s, payload);
      if (r.ok) sent++;
      else { failed++; if (r.gone) dead.push(s.id); }
    } catch { failed++; }
  }

  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  if (sent) {
    await admin.from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', subs.filter((s) => !dead.includes(s.id)).map((s) => s.id));
  }
  return { sent, failed, purged: dead.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const payload = await req.json().catch(() => ({}));
    const { user_ids, title, body, url, tag } = payload as {
      user_ids?: string[]; title?: string; body?: string; url?: string; tag?: string;
    };
    if (!title || !body) return json({ error: 'title et body requis' }, 400);

    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret });
      if (!ok) return json({ error: 'Secret invalide' }, 401);
      const result = await sendToUsers(admin, user_ids || [], { title, body, url, tag });
      return json({ mode: 'server', ...result });
    }

    // Mode admin connecté : ne peut viser QUE des salariés de sa propre entreprise
    // (on re-filtre côté serveur, jamais confiance à la liste reçue).
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Non authentifié' }, 401);
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return json({ error: 'Session invalide' }, 401);
    const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return json({ error: "Réservé à l'administrateur" }, 403);

    const { data: allowed } = await admin.from('users')
      .select('id').eq('company_id', profile.company_id).in('id', user_ids || []);
    const allowedIds = (allowed || []).map((u: { id: string }) => u.id);
    const result = await sendToUsers(admin, allowedIds, { title, body, url, tag });
    return json({ mode: 'admin', ...result });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
