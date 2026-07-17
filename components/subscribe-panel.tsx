'use client';

// Panneau d'abonnement (Stripe). Affiche les 3 paliers lus dans la table
// subscription_plans et lance le paiement via la fonction edge `stripe-checkout`
// (aucune clé Stripe ici). Le forfait est CHOISI selon le nombre de salariés :
//  - un forfait plus PETIT que l'équipe réelle est désactivé (on ne peut pas
//    payer pour moins de postes qu'on en utilise) ;
//  - le plus petit forfait qui couvre l'équipe est mis en avant (« recommandé ») ;
//  - les forfaits supérieurs restent choisissables (anticiper la croissance).

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Plan {
  code: string;
  label: string;
  stripe_price_id: string;
  amount_eur: number;
  min_workers: number | null;
  max_workers: number | null;
  sort: number;
}

interface Props { workerCount?: number; dark?: boolean }

const SUB_CSS = `
.bt-sub{font-family:'Archivo',sans-serif}
.bt-sub *{box-sizing:border-box}
.bt-sub-grid{display:flex;gap:14px;align-items:stretch;justify-content:center;flex-wrap:wrap}
.bt-sub-card{position:relative;flex:1 1 200px;max-width:290px;min-width:0;display:flex;flex-direction:column;background:#FBF8F2;border:1.5px solid rgba(21,18,15,.14);border-radius:16px;padding:20px 18px;text-align:left;color:#15120F}
.bt-sub-card.reco{border-color:#FFC21A;border-width:2.5px;box-shadow:0 20px 46px -22px rgba(255,194,26,.5),0 10px 28px -18px rgba(0,0,0,.4);transform:translateY(-8px)}
.bt-sub-card.off{background:#ECE7DE;border-color:rgba(21,18,15,.1);opacity:.72}
.bt-sub-card.off .bt-sub-amount,.bt-sub-card.off .bt-sub-label{color:#8a8378}
.bt-sub-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#FFC21A;color:#15120F;font-size:11px;font-weight:900;letter-spacing:.01em;padding:4px 12px;border-radius:999px;box-shadow:0 3px 0 #C99300}
.bt-sub-label{font-size:15.5px;font-weight:900;letter-spacing:-.01em}
.bt-sub-range{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;color:#8a8378;margin-top:3px}
.bt-sub-price{display:flex;align-items:baseline;gap:4px;margin:15px 0 3px}
.bt-sub-amount{font-size:34px;font-weight:900;line-height:1;letter-spacing:-.02em}
.bt-sub-unit{font-size:12.5px;font-weight:700;color:#8a8378}
.bt-sub-ht{font-size:11.5px;font-weight:600;color:#a8a195;margin-bottom:13px}
.bt-sub-note{font-size:11.5px;font-weight:600;line-height:1.4;border-radius:9px;padding:7px 10px;margin-bottom:13px}
.bt-sub-note.warn{background:#F4E4D9;color:#9a5a2a}
.bt-sub-note.grow{background:#EAF1EA;color:#3f7355}
.bt-sub-btn{margin-top:auto;width:100%;border:none;border-radius:11px;padding:12px;font-family:inherit;font-weight:800;font-size:14.5px;cursor:pointer;transition:transform .05s ease;background:#15120F;color:#fff}
.bt-sub-card.reco .bt-sub-btn{background:#FFC21A;color:#15120F;box-shadow:0 4px 0 #C99300;font-weight:900}
.bt-sub-btn:hover:not(:disabled){transform:translateY(-1px)}
.bt-sub-btn.off{background:#DBD5CA;color:#9a948a;cursor:not-allowed}
.bt-sub-btn:disabled{cursor:not-allowed;transform:none}
.bt-sub-err{margin:14px auto 0;max-width:520px;background:#F4D9D1;border:1px solid #E8B79E;color:#9a3b14;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:700;text-align:center}
.bt-sub-skel{color:#8a8378;font-size:13px;font-weight:600;padding:14px 2px;text-align:center}
.bt-sub-contact{margin-top:20px;text-align:center;font-size:13.5px;color:#6E6A63;font-weight:500}
.bt-sub-contact a{color:#15120F;font-weight:800;text-decoration:none;border-bottom:2px solid #FFC21A}
.bt-sub-foot{margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#8a8378;font-weight:600;text-align:center}
/* variante sur fond sombre (écran de blocage anthracite) */
.bt-sub--dark .bt-sub-contact{color:#c9c3b8}
.bt-sub--dark .bt-sub-contact a{color:#FFC21A;border-bottom-color:rgba(255,194,26,.5)}
@media(max-width:720px){
  .bt-sub-grid{flex-direction:column;max-width:380px;margin:0 auto}
  .bt-sub-card{max-width:none}
  .bt-sub-card.reco{transform:none}
}
`;

function rangeLabel(p: Plan): string {
  if (p.min_workers && p.max_workers) return `${p.min_workers} à ${p.max_workers} salariés`;
  if (p.min_workers && !p.max_workers) return `${p.min_workers} salariés et plus`;
  if (!p.min_workers && p.max_workers) return `jusqu'à ${p.max_workers} salariés`;
  return 'Sans limite';
}

export default function SubscribePanel({ workerCount, dark }: Props = {}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    supabase
      .from('subscription_plans')
      .select('code, label, stripe_price_id, amount_eur, min_workers, max_workers, sort')
      .eq('active', true)
      .order('sort')
      .then(({ data, error }) => {
        if (!on) return;
        if (error) setError('Impossible de charger les offres pour le moment.');
        else setPlans((data as Plan[]) ?? []);
        setLoading(false);
      });
    return () => { on = false; };
  }, []);

  const subscribe = async (priceId: string) => {
    setBusy(priceId);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { priceId } });
      if (error) throw new Error((data as { error?: string } | null)?.error || error.message);
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error((data as { error?: string } | null)?.error || 'Réponse inattendue du paiement.');
      window.location.href = url;
    } catch (e) {
      setError((e as Error)?.message || "Le paiement n'a pas pu démarrer. Réessayez.");
      setBusy(null);
    }
  };

  // Nombre de salariés → contrainte de forfait.
  const n = workerCount ?? 0;
  const tooSmall = (p: Plan) => p.max_workers != null && n > p.max_workers;
  // Recommandé = le plus PETIT forfait qui couvre l'équipe (plans triés par `sort`).
  const recommendedCode = plans.find((p) => !tooSmall(p))?.code;

  return (
    <div className={`bt-sub${dark ? ' bt-sub--dark' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: SUB_CSS }} />
      {loading ? (
        <div className="bt-sub-skel">Chargement des offres…</div>
      ) : (
        <div className="bt-sub-grid">
          {plans.map((p) => {
            const off = tooSmall(p);
            const reco = !off && p.code === recommendedCode;
            return (
              <div key={p.code} className={`bt-sub-card${reco ? ' reco' : ''}${off ? ' off' : ''}`}>
                {reco && <span className="bt-sub-badge">★ Recommandé pour votre équipe</span>}
                <div className="bt-sub-label">{p.label}</div>
                <div className="bt-sub-range">{rangeLabel(p)}</div>
                <div className="bt-sub-price">
                  <span className="bt-sub-amount">{p.amount_eur}€</span>
                  <span className="bt-sub-unit">/ mois HT</span>
                </div>
                <div className="bt-sub-ht">sans engagement</div>
                {off ? (
                  <div className="bt-sub-note warn">Vous avez {n} salariés — ce forfait couvre jusqu&apos;à {p.max_workers}.</div>
                ) : reco && n > 0 ? (
                  <div className="bt-sub-note grow">Couvre votre équipe de {n} salarié{n > 1 ? 's' : ''}.</div>
                ) : !off && n > 0 ? (
                  <div className="bt-sub-note grow">De la marge pour grandir.</div>
                ) : null}
                <button
                  className={`bt-sub-btn${off ? ' off' : ''}`}
                  disabled={off || busy !== null}
                  onClick={() => { if (!off) subscribe(p.stripe_price_id); }}
                >
                  {off ? 'Trop petit pour votre équipe' : busy === p.stripe_price_id ? 'Redirection…' : reco ? 'Choisir ce forfait →' : 'Choisir'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="bt-sub-err">{error}</div>}
      <div className="bt-sub-contact">
        Une hésitation sur le forfait adapté ?{' '}
        <a href="mailto:contact@bemexo.com?subject=Question%20sur%20les%20forfaits%20BEMEXO">Écrivez-nous</a>, on vous conseille.
      </div>
      <div className="bt-sub-foot">Paiement sécurisé par Stripe · résiliable à tout moment</div>
    </div>
  );
}
