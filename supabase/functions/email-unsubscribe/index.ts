// Edge Function : email-unsubscribe
// Désabonnement d'un e-mail récurrent (récap hebdo, rappels, alertes).
//
//   POST (un clic, RFC 8058) — envoyé par la messagerie depuis l'en-tête
//        List-Unsubscribe, ou par la page bemexo.com/desabonnement : inscrit
//        l'adresse dans public.email_unsubscribes pour cette famille d'e-mails.
//   GET  — quelqu'un a ouvert le lien dans un navigateur : on le renvoie vers
//        la page bemexo.com/desabonnement, qui demande de confirmer. Un GET ne
//        désabonne JAMAIS : les antivirus de messagerie ouvrent les liens tout
//        seuls, ils désabonneraient les gens à leur insu.
//
// Le lien est signé (voir ../_shared/email.ts) : on ne peut désabonner qu'une
// adresse dont on a reçu l'e-mail.
//
// À déployer SANS vérification de jeton : la messagerie qui envoie le POST
// n'est pas connectée à BEMEXO.
//   supabase functions deploy email-unsubscribe --no-verify-jwt
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { EMAIL_KINDS, type EmailKind, decodeEmail, verifyUnsubscribeToken } from '../_shared/email.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SITE_URL = 'https://bemexo.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const encoded = url.searchParams.get('e') || '';
  const kind = url.searchParams.get('k') || '';
  const token = url.searchParams.get('t') || '';

  const email = decodeEmail(encoded);
  if (!email || !EMAIL_KINDS.includes(kind as EmailKind) || !token) {
    return json({ error: 'Lien de désabonnement incomplet.' }, 400);
  }
  if (!(await verifyUnsubscribeToken(email, kind as EmailKind, token))) {
    return json({ error: 'Lien de désabonnement invalide.' }, 400);
  }

  if (req.method === 'GET') {
    return new Response(null, {
      status: 303,
      headers: { ...cors, Location: `${SITE_URL}/desabonnement?${url.searchParams.toString()}` },
    });
  }
  if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge.' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin
      .from('email_unsubscribes')
      .upsert({ email, kind }, { onConflict: 'email,kind', ignoreDuplicates: true });
    if (error) {
      console.error('[email-unsubscribe]', error);
      return json({ error: 'Désabonnement impossible pour le moment. Réessayez dans un instant.' }, 503);
    }
    return json({ success: true, kind });
  } catch (e) {
    console.error('[email-unsubscribe]', e);
    return json({ error: 'Désabonnement impossible pour le moment. Réessayez dans un instant.' }, 500);
  }
});
