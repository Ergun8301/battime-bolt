'use client';

// Désabonnement d'un e-mail récurrent (lien « Se désabonner » en pied d'e-mail).
// La page ne désabonne qu'au CLIC : les antivirus de messagerie ouvrent les
// liens tout seuls, un désabonnement à l'ouverture couperait des e-mails que
// la personne voulait. Le clic envoie un POST signé à la fonction
// `email-unsubscribe` (voir supabase/functions/email-unsubscribe).

import { useEffect, useState } from 'react';
import { EmailLinkCard } from '@/components/email-link-card';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdperbcquvneohotjono.supabase.co';

const LABELS: Record<string, string> = {
  'weekly-digest': 'le récap hebdomadaire',
  'missing-days': 'les rappels de saisie des heures',
  'cert-expiry': 'les alertes d’habilitations',
  'budget-alerts': 'les alertes de budget chantier',
};

type State = 'loading' | 'ready' | 'sending' | 'done' | 'invalid' | 'error';

export default function DesabonnementPage() {
  const [state, setState] = useState<State>('loading');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const k = q.get('k') || '';
    if (!q.get('e') || !q.get('t') || !LABELS[k]) {
      setState('invalid');
      return;
    }
    setKind(k);
    setQuery(new URLSearchParams({ e: q.get('e')!, k, t: q.get('t')! }).toString());
    setState('ready');
  }, []);

  const unsubscribe = async () => {
    setState('sending');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/email-unsubscribe?${query}`, { method: 'POST' });
      setState(res.ok ? 'done' : res.status === 400 ? 'invalid' : 'error');
    } catch {
      setState('error');
    }
  };

  if (state === 'loading') {
    return <EmailLinkCard><div className="el-spin" aria-hidden="true" /></EmailLinkCard>;
  }
  if (state === 'invalid') {
    return (
      <EmailLinkCard>
        <h1 className="el-h1">Lien invalide</h1>
        <p className="el-p">Ce lien de désabonnement est incomplet ou n’est plus valable. Utilisez le lien du dernier e-mail reçu.</p>
        <a className="el-btn" href="/landing">Retour à BEMEXO</a>
      </EmailLinkCard>
    );
  }
  if (state === 'done') {
    return (
      <EmailLinkCard>
        <h1 className="el-h1">C’est fait</h1>
        <div className="el-ok" role="status">Vous ne recevrez plus {LABELS[kind]} par e-mail.</div>
        <p className="el-p">Les autres e-mails de BEMEXO (connexion, mot de passe) ne sont pas concernés.</p>
        <a className="el-btn" href="/landing">Retour à BEMEXO</a>
      </EmailLinkCard>
    );
  }
  return (
    <EmailLinkCard>
      <h1 className="el-h1">Se désabonner</h1>
      <p className="el-p">Vous ne recevrez plus {LABELS[kind]} par e-mail.</p>
      {state === 'error' && <div className="el-err" role="alert">Désabonnement impossible pour le moment. Réessayez dans un instant.</div>}
      <button type="button" className="el-btn" onClick={unsubscribe} disabled={state === 'sending'}>
        {state === 'sending' ? 'Patientez…' : 'Me désabonner'}
      </button>
    </EmailLinkCard>
  );
}
