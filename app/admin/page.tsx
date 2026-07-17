'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import AdminPlanning from '@/components/admin-planning';
import SubscribePanel from '@/components/subscribe-panel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
/* Canvas de l'app : parchemin chaud (crème plus prononcé, vers le doré sans
   tomber dans le jaune criard) — le cockpit sombre + le planning blanc
   ressortent nettement comme une carte posée dessus. */
.bt-admin{font-family:'Archivo',sans-serif;min-height:100vh;background:#EBE0C6;padding:12px;display:flex;flex-direction:column}
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

/* Le header/essai vit désormais DANS le cockpit du planning (composant
   admin-planning) — logo + stats + pilule + compte réunis. Ici on ne garde que
   l'écran de blocage d'essai (paywall). */
.bt-pw{position:relative;min-height:calc(100vh - 24px);display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:20px;background:#17140F;padding:48px 22px}
.bt-pw-grid{position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent 0 47px,rgba(242,237,227,.028) 47px 48px),repeating-linear-gradient(90deg,transparent 0 47px,rgba(242,237,227,.028) 47px 48px);pointer-events:none}
.bt-pw-glow{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);width:880px;height:560px;max-width:120%;background:radial-gradient(ellipse at center,rgba(255,194,26,.13),rgba(255,194,26,.04) 45%,transparent 70%);pointer-events:none}
.bt-pw-inner{position:relative;width:100%;max-width:1000px}
.bt-pw-head{text-align:center;margin-bottom:32px}
.bt-pw-kicker{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#FFC21A;margin-bottom:13px}
.bt-pw-h1{font-size:clamp(25px,4vw,38px);font-weight:900;letter-spacing:-.025em;line-height:1.05;color:#fff;text-wrap:balance;margin:0}
.bt-pw-sub{font-size:15.5px;color:#c9c3b8;font-weight:500;margin:12px auto 0;max-width:46ch;line-height:1.5}
.bt-pw-sub b{color:#FFC21A}
.bt-pw-preview-note{text-align:center;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#8a8378;margin-top:22px}

/* Activation après retour de paiement Stripe (?subscribed=1) */
.bt-activating{position:fixed;inset:0;z-index:60;background:rgba(21,18,15,.72);display:flex;align-items:center;justify-content:center;padding:20px}
.bt-activating-box{background:#F2EDE3;border-radius:18px;padding:32px 28px;max-width:380px;text-align:center;box-shadow:0 30px 70px -28px rgba(0,0,0,.6)}
.bt-activating-box h2{font-size:19px;font-weight:900;color:#15120F;margin:0 0 6px}
.bt-activating-box p{font-size:13.5px;color:#6E6A63;font-weight:500;margin:0}
.bt-spin{width:30px;height:30px;border:3px solid #E3D9C4;border-top-color:#FFC21A;border-radius:50%;margin:0 auto 14px;animation:btspin .8s linear infinite}
@keyframes btspin{to{transform:rotate(360deg)}}
`;

export default function AdminPage() {
  const { user } = useAuth();
  const [trial, setTrial] = useState<{ ends: string | null; status: string } | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [workerCount, setWorkerCount] = useState(0); // salariés actifs → forfait adapté (panneau d'abonnement)

  // Nombre de salariés actifs de l'entreprise (pour recommander/verrouiller le
  // bon forfait dans le panneau d'abonnement). Lecture seule.
  useEffect(() => {
    if (!user?.company_id) return;
    let on = true;
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.company_id)
      .eq('role', 'worker')
      .eq('is_active', true)
      .then(({ count }) => { if (on) setWorkerCount(count ?? 0); });
    return () => { on = false; };
  }, [user?.company_id]);

  const loadCompany = useCallback(async () => {
    if (!user?.company_id) return null;
    const { data } = await supabase
      .from('companies')
      .select('trial_ends_at, subscription_status')
      .eq('id', user.company_id)
      .maybeSingle();
    if (data) {
      setTrial({
        ends: (data as { trial_ends_at: string | null }).trial_ends_at,
        status: (data as { subscription_status: string }).subscription_status,
      });
    }
    return data as { trial_ends_at: string | null; subscription_status: string } | null;
  }, [user?.company_id]);

  useEffect(() => { loadCompany(); }, [loadCompany]);

  // Retour de paiement Stripe : ?subscribed=1. Le webhook bascule
  // subscription_status='active' côté serveur ; on attend qu'il soit pris en
  // compte (quelques secondes max), puis on nettoie l'URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('subscribed') !== '1') return;
    if (!user?.company_id) return;
    setActivating(true);
    let tries = 0;
    let stop = false;
    const tick = async () => {
      const data = await loadCompany();
      tries += 1;
      if (stop) return;
      if ((data && data.subscription_status === 'active') || tries >= 8) {
        setActivating(false);
        window.history.replaceState({}, '', '/admin');
        return;
      }
      setTimeout(tick, 1800);
    };
    tick();
    return () => { stop = true; };
  }, [user?.company_id, loadCompany]);

  const now = Date.now();
  const endsMs = trial?.ends ? new Date(trial.ends).getTime() : null;
  const active = trial?.status === 'active';
  // En essai = a une date de fin ET pas (encore) abonné. NULL = pas d'essai (illimité).
  const inTrial = endsMs !== null && !active;
  const expired = inTrial && now > (endsMs as number);
  const daysLeft = endsMs !== null ? Math.ceil(((endsMs as number) - now) / 86400000) : null;

  // Paywall : bloque l'accès quand l'essai est EXPIRÉ — mais seulement si
  // l'enforcement est activé via l'env NEXT_PUBLIC_PAYWALL_ENFORCED='true'
  // (à poser dans Netlify, prend effet au redeploy). Les previews
  // (deploy-preview-*) forcent toujours le blocage pour pouvoir le tester avant
  // de l'activer en prod.
  // IMPORTANT : un compte SANS essai (trial_ends_at NULL — ex. le compte éditeur
  // K.HABITAT) ou déjà 'active' (client abonné) a expired=false → JAMAIS bloqué,
  // même paywall activé.
  const paywallEnforced = process.env.NEXT_PUBLIC_PAYWALL_ENFORCED === 'true';
  const isPreview = typeof window !== 'undefined' && window.location.hostname.startsWith('deploy-preview-');
  const blocked = expired && (paywallEnforced || isPreview);

  return (
    <div className="bt-admin">
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />

      {activating && (
        <div className="bt-activating">
          <div className="bt-activating-box">
            <div className="bt-spin" />
            <h2>Activation de votre abonnement…</h2>
            <p>Merci ! Nous confirmons votre paiement, un instant.</p>
          </div>
        </div>
      )}

      {blocked ? (
        <div className="bt-pw">
          <div className="bt-pw-grid" />
          <div className="bt-pw-glow" />
          <div className="bt-pw-inner">
            <div className="bt-pw-head">
              <div className="bt-pw-kicker">BEMEXO · Abonnement</div>
              <h1 className="bt-pw-h1">Votre essai gratuit est terminé.</h1>
              <p className="bt-pw-sub">
                {workerCount > 0 ? (
                  <>Vous avez <b>{workerCount} salarié{workerCount > 1 ? 's' : ''}</b> enregistré{workerCount > 1 ? 's' : ''} — voici l&apos;offre qui correspond à votre équipe.</>
                ) : (
                  <>Choisissez l&apos;offre adaptée à votre équipe pour continuer à utiliser BEMEXO.</>
                )}
              </p>
            </div>
            <SubscribePanel workerCount={workerCount} dark />
            {!paywallEnforced && (
              <p className="bt-pw-preview-note">Aperçu : ce blocage n&apos;est actif qu&apos;en preview tant que le paywall n&apos;est pas activé en production.</p>
            )}
          </div>
        </div>
      ) : (
        <AdminPlanning trial={{ inTrial, expired, daysLeft }} onSubscribe={() => setSubOpen(true)} />
      )}

      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="bt-skin max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choisissez votre abonnement</DialogTitle>
          </DialogHeader>
          <div className="pt-1">
            <SubscribePanel workerCount={workerCount} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
