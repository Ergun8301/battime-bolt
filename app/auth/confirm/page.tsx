'use client';

// Arrivée depuis un e-mail d'authentification (inscription, invitation, mot de
// passe oublié, changement d'e-mail, lien magique).
//
// POURQUOI CETTE PAGE. Les liens par défaut de Supabase pointent vers
// sdperbcquvneohotjono.supabase.co alors que l'e-mail vient de bemexo.com :
// ce décalage de domaine est un signal de spam fort. Les modèles d'e-mails
// (supabase/templates/) pointent désormais ici, sur bemexo.com :
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>
//
// POURQUOI UN BOUTON ET PAS UNE VÉRIFICATION AUTOMATIQUE. Les antivirus de
// messagerie (Outlook / Microsoft 365 notamment, très présents dans le BTP)
// ouvrent les liens tout seuls avant l'utilisateur. Un lien vérifié à
// l'ouverture serait « consommé » par le robot et arriverait expiré au
// patron. Le jeton n'est utilisé qu'au clic.
//
// APRÈS VÉRIFICATION, on rejoint les parcours existants, inchangés :
//   - invite / recovery → /connexion avec la session dans le fragment : le
//     gestionnaire existant de /connexion affiche « Créer / réinitialiser le
//     mot de passe » ;
//   - signup / email_change / magiclink / email → « / », qui aiguille selon
//     le rôle.
// Les anciens liens supabase.co déjà envoyés continuent de fonctionner : ils
// reviennent sur /connexion#access_token=…, géré comme avant.

import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { EmailLinkCard } from '@/components/email-link-card';

const TYPES: EmailOtpType[] = ['signup', 'invite', 'recovery', 'email_change', 'magiclink', 'email'];

const TEXTS: Record<EmailOtpType, { title: string; lead: string; cta: string }> = {
  signup: { title: 'Confirmez votre adresse', lead: 'Un clic, et votre compte BEMEXO est activé.', cta: 'Confirmer mon adresse' },
  invite: { title: 'Rejoignez votre équipe', lead: 'Votre employeur vous a invité sur BEMEXO. Il ne reste qu’à créer votre mot de passe.', cta: 'Créer mon mot de passe' },
  recovery: { title: 'Nouveau mot de passe', lead: 'Vous avez demandé à changer votre mot de passe BEMEXO.', cta: 'Choisir un nouveau mot de passe' },
  email_change: { title: 'Nouvelle adresse e-mail', lead: 'Confirmez la nouvelle adresse de votre compte BEMEXO.', cta: 'Confirmer la nouvelle adresse' },
  magiclink: { title: 'Connexion à BEMEXO', lead: 'Cliquez pour vous connecter, sans mot de passe.', cta: 'Me connecter' },
  email: { title: 'Connexion à BEMEXO', lead: 'Cliquez pour continuer.', cta: 'Continuer' },
};

function expiredHelp(type: EmailOtpType | null): { text: string; href: string; label: string } {
  switch (type) {
    case 'invite':
      return { text: 'Demandez à votre employeur de vous renvoyer l’invitation depuis BEMEXO.', href: '/connexion', label: 'Aller à la connexion' };
    case 'recovery':
      return { text: 'Demandez un nouveau lien : il arrive en une minute.', href: '/mot-de-passe-oublie', label: 'Recevoir un nouveau lien' };
    case 'signup':
      return { text: 'Connectez-vous avec votre e-mail et votre mot de passe : BEMEXO vous proposera de renvoyer l’e-mail de confirmation.', href: '/connexion', label: 'Aller à la connexion' };
    default:
      return { text: 'Reconnectez-vous pour recommencer.', href: '/connexion', label: 'Aller à la connexion' };
  }
}

type State = 'ready' | 'verifying' | 'invalid' | 'expired';

export default function AuthConfirmPage() {
  const [state, setState] = useState<State>('verifying');
  const [type, setType] = useState<EmailOtpType | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('type') as EmailOtpType | null;
    const h = q.get('token_hash');
    if (!h || !t || !TYPES.includes(t)) {
      setState('invalid');
      return;
    }
    setType(t);
    setTokenHash(h);
    setState('ready');
  }, []);

  const confirm = async () => {
    if (!tokenHash || !type) return;
    setState('verifying');
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.session) {
      setState('expired');
      return;
    }
    // Le lien ne doit pas resservir (historique, retour arrière).
    window.history.replaceState(null, '', window.location.pathname);

    if (type === 'invite' || type === 'recovery') {
      const frag = new URLSearchParams({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        type,
      });
      window.location.replace(`/connexion#${frag.toString()}`);
      return;
    }
    window.location.replace('/');
  };

  if (state === 'verifying') {
    return (
      <EmailLinkCard>
        <h1 className="el-h1">Vérification du lien…</h1>
        <div className="el-spin" aria-hidden="true" />
      </EmailLinkCard>
    );
  }

  if (state === 'invalid') {
    return (
      <EmailLinkCard>
        <h1 className="el-h1">Lien incomplet</h1>
        <p className="el-p">Ce lien est incomplet. Ouvrez de nouveau l’e-mail et utilisez le bouton qu’il contient.</p>
        <a className="el-btn" href="/connexion">Aller à la connexion</a>
      </EmailLinkCard>
    );
  }

  if (state === 'expired') {
    const help = expiredHelp(type);
    return (
      <EmailLinkCard>
        <h1 className="el-h1">Ce lien a expiré</h1>
        <div className="el-err" role="alert">Ce lien a expiré ou a déjà été utilisé.</div>
        <p className="el-p">{help.text}</p>
        <a className="el-btn" href={help.href}>{help.label}</a>
      </EmailLinkCard>
    );
  }

  const txt = TEXTS[type || 'email'];
  return (
    <EmailLinkCard>
      <h1 className="el-h1">{txt.title}</h1>
      <p className="el-p">{txt.lead}</p>
      <button type="button" className="el-btn" onClick={confirm}>{txt.cta}</button>
    </EmailLinkCard>
  );
}
