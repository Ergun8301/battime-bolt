'use client';

// Panneau d'abonnement (Lot 5 — Stripe). Affiche les 3 paliers lus dans la
// table subscription_plans, et lance la session de paiement Stripe via la
// fonction edge `stripe-checkout` (qui renvoie une URL de redirection).
// Aucune clé Stripe ici : tout passe par la fonction edge (secrets Supabase).

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

const SUB_CSS = `
.bt-sub{font-family:'Archivo',sans-serif}
.bt-sub *{box-sizing:border-box}
.bt-sub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.bt-sub-card{position:relative;display:flex;flex-direction:column;background:#fff;border:1.5px solid rgba(21,18,15,.16);border-radius:16px;padding:20px 18px;text-align:left}
.bt-sub-card.pop{border-color:#15120F;box-shadow:0 14px 34px -20px rgba(21,18,15,.55)}
.bt-sub-tag{position:absolute;top:-10px;left:18px;background:#FFC21A;color:#15120F;font-size:11px;font-weight:900;letter-spacing:.02em;padding:3px 9px;border-radius:999px}
.bt-sub-label{font-size:15px;font-weight:900;color:#15120F;letter-spacing:-.01em}
.bt-sub-range{font-size:12.5px;font-weight:600;color:#8a8378;margin-top:2px}
.bt-sub-price{display:flex;align-items:baseline;gap:4px;margin:14px 0 4px}
.bt-sub-amount{font-size:34px;font-weight:900;color:#15120F;line-height:1;letter-spacing:-.02em}
.bt-sub-unit{font-size:13px;font-weight:700;color:#8a8378}
.bt-sub-ht{font-size:11.5px;font-weight:600;color:#a8a195;margin-bottom:16px}
.bt-sub-btn{margin-top:auto;width:100%;background:#15120F;color:#fff;border:none;border-radius:11px;padding:12px;font-family:inherit;font-weight:800;font-size:14.5px;cursor:pointer;transition:transform .05s ease}
.bt-sub-card.pop .bt-sub-btn{background:#FFC21A;color:#15120F;box-shadow:0 4px 0 #C99300}
.bt-sub-btn:hover{transform:translateY(-1px)}
.bt-sub-btn:disabled{opacity:.55;cursor:default;transform:none;box-shadow:none}
.bt-sub-err{margin-top:12px;background:#F4D9D1;border:1px solid #E8B79E;color:#9a3b14;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:700}
.bt-sub-skel{color:#8a8378;font-size:13px;font-weight:600;padding:14px 2px}
.bt-sub-foot{margin-top:14px;font-size:11.5px;color:#a8a195;font-weight:600;text-align:center}
`;

function rangeLabel(p: Plan): string {
  if (p.min_workers && p.max_workers) return `${p.min_workers} à ${p.max_workers} salariés`;
  if (p.min_workers && !p.max_workers) return `${p.min_workers} salariés et plus`;
  if (!p.min_workers && p.max_workers) return `jusqu'à ${p.max_workers} salariés`;
  return 'Sans limite';
}

export default function SubscribePanel() {
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

  return (
    <div className="bt-sub">
      <style dangerouslySetInnerHTML={{ __html: SUB_CSS }} />
      {loading ? (
        <div className="bt-sub-skel">Chargement des offres…</div>
      ) : (
        <div className="bt-sub-grid">
          {plans.map((p, i) => {
            const pop = plans.length === 3 ? i === 1 : false;
            return (
              <div key={p.code} className={`bt-sub-card${pop ? ' pop' : ''}`}>
                {pop && <span className="bt-sub-tag">Le plus choisi</span>}
                <div className="bt-sub-label">{p.label}</div>
                <div className="bt-sub-range">{rangeLabel(p)}</div>
                <div className="bt-sub-price">
                  <span className="bt-sub-amount">{p.amount_eur}€</span>
                  <span className="bt-sub-unit">/ mois</span>
                </div>
                <div className="bt-sub-ht">HT, sans engagement</div>
                <button
                  className="bt-sub-btn"
                  disabled={busy !== null}
                  onClick={() => subscribe(p.stripe_price_id)}
                >
                  {busy === p.stripe_price_id ? 'Redirection…' : 'Choisir'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {error && <div className="bt-sub-err">{error}</div>}
      <div className="bt-sub-foot">Paiement sécurisé par Stripe · résiliable à tout moment</div>
    </div>
  );
}
