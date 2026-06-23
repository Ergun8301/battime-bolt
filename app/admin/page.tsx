'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import AdminPlanning from '@/components/admin-planning';

const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-admin{font-family:'Archivo',sans-serif;min-height:100vh;background:#15120F;padding:6px}
.bt-admin *{box-sizing:border-box}

/* ============================================================
   .bt-skin — thème CLAIR (crème + jaune + noir en accent) appliqué
   à TOUTES les fenêtres, menus déroulants et calendriers (portails
   Radix au niveau du body). On surcharge les variables shadcn :
   aucune fenêtre n'échappe à l'identité, sans réécrire chaque champ.
   ============================================================ */
.bt-skin{
  --background:40 33% 95%;
  --foreground:36 16% 7%;
  --card:0 0% 100%;
  --card-foreground:36 16% 7%;
  --popover:40 33% 96%;
  --popover-foreground:36 16% 7%;
  --primary:43 100% 55%;
  --primary-foreground:36 16% 7%;
  --secondary:40 24% 90%;
  --secondary-foreground:36 16% 12%;
  --muted:40 22% 91%;
  --muted-foreground:40 6% 42%;
  --accent:42 58% 88%;
  --accent-foreground:36 16% 12%;
  --destructive:14 72% 44%;
  --destructive-foreground:40 33% 97%;
  --border:38 16% 82%;
  --input:38 16% 80%;
  --ring:43 100% 55%;
  font-family:'Archivo',sans-serif;
}
.bt-skin .mono,.bt-skin .tabular{font-variant-numeric:tabular-nums}
/* fin liseré jaune en haut de chaque fenêtre pour l'identité */
.bt-skin[role="dialog"]{border-top:3px solid #FFC21A}
.bt-skin[role="dialog"] h2{font-weight:900;letter-spacing:-.01em}

/* Essai 30 j — bandeau (info) + blocage (preview uniquement) */
.bt-trial-banner{display:flex;align-items:center;gap:9px;background:#FFF1CC;border:1px solid #E8CE7A;color:#7a5e00;border-radius:12px;padding:9px 14px;font-size:13.5px;font-weight:700;margin-bottom:6px}
.bt-trial-banner.expired{background:#F4D9D1;border-color:#E8B79E;color:#9a3b14}
.bt-trial-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none}
.bt-trial-block{min-height:calc(100vh - 12px);display:flex;align-items:center;justify-content:center;padding:20px}
.bt-trial-card{background:#F2EDE3;border-radius:18px;padding:40px 32px;max-width:440px;text-align:center;box-shadow:0 30px 70px -28px rgba(0,0,0,.6)}
.bt-trial-emoji{font-size:44px;margin-bottom:6px}
.bt-trial-card h1{font-size:24px;font-weight:900;color:#15120F;margin:0 0 8px}
.bt-trial-card p{font-size:15px;color:#6E6A63;font-weight:500;margin:0 0 18px}
.bt-trial-btn{background:#FFC21A;color:#15120F;border:none;border-radius:12px;padding:14px 22px;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 4px 0 #C99300;font-family:inherit}
.bt-trial-btn:disabled{opacity:.6;cursor:default}
.bt-trial-note{font-size:12px;color:#9a948a;margin-top:16px}
`;

export default function AdminPage() {
  const { user } = useAuth();
  const [trial, setTrial] = useState<{ ends: string | null; status: string } | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    supabase.from('companies').select('trial_ends_at, subscription_status').eq('id', user.company_id).maybeSingle()
      .then(({ data }) => { if (data) setTrial({ ends: (data as { trial_ends_at: string | null }).trial_ends_at, status: (data as { subscription_status: string }).subscription_status }); });
  }, [user?.company_id]);

  const now = Date.now();
  const endsMs = trial?.ends ? new Date(trial.ends).getTime() : null;
  const active = trial?.status === 'active';
  // En essai = a une date de fin ET pas (encore) abonné. NULL = pas d'essai (illimité).
  const inTrial = endsMs !== null && !active;
  const expired = inTrial && now > (endsMs as number);
  const daysLeft = endsMs !== null ? Math.ceil(((endsMs as number) - now) / 86400000) : null;

  // VIGILANCE n°2 : le blocage ne s'active QUE sur les previews (deploy-preview-*),
  // JAMAIS en production, tant que Stripe n'est pas branché.
  const isPreview = typeof window !== 'undefined' && window.location.hostname.startsWith('deploy-preview-');
  const blocked = expired && isPreview;

  return (
    <div className="bt-admin">
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      {blocked ? (
        <div className="bt-trial-block">
          <div className="bt-trial-card">
            <div className="bt-trial-emoji">⏳</div>
            <h1>Votre essai gratuit est terminé</h1>
            <p>Pour continuer à utiliser Battime, choisissez un abonnement.</p>
            <button className="bt-trial-btn" disabled>S&apos;abonner (bientôt disponible)</button>
            <p className="bt-trial-note">Aperçu : ce blocage n&apos;est actif qu&apos;en preview. En production, l&apos;accès reste ouvert tant que le paiement n&apos;est pas branché.</p>
          </div>
        </div>
      ) : (
        <>
          {inTrial && !expired && daysLeft !== null && (
            <div className="bt-trial-banner">
              <span className="bt-trial-dot" /> Essai gratuit — il reste <strong>&nbsp;{daysLeft} jour{daysLeft > 1 ? 's' : ''}</strong>.
            </div>
          )}
          {inTrial && expired && (
            <div className="bt-trial-banner expired">
              <span className="bt-trial-dot" /> Essai terminé — <strong>&nbsp;abonnement bientôt disponible</strong>, accès maintenu pour l&apos;instant.
            </div>
          )}
          <AdminPlanning />
        </>
      )}
    </div>
  );
}
