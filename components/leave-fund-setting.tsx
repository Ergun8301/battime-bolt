'use client';

// Réglages → « Caisse de congés BTP » (visible si `ai_enabled`).
// Sert uniquement au coût réel : brut × taux ajouté au coût de chaque bulletin.
// Les restaurants le laissent éteint. Enregistré immédiatement.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BTP_LEAVE_DEFAULT_RATE, parseAmount, type CostSource, type LeaveFund } from '@/lib/real-cost';
import { InfoTip } from '@/components/ui/info-tip';

export default function LeaveFundSetting({ source, companyId }: { source: CostSource; companyId: string }) {
  const [fund, setFund] = useState<LeaveFund | null>(null);
  const [rate, setRate] = useState('');

  useEffect(() => {
    source.fund(companyId).then((f) => { setFund(f); setRate(String(f.rate).replace('.', ',')); });
  }, [source, companyId]);

  const save = async (next: LeaveFund) => {
    const prev = fund;
    setFund(next);
    const err = await source.saveFund(companyId, next);
    if (err) { toast.error(err); setFund(prev); }
  };
  const commitRate = () => {
    if (!fund) return;
    const n = parseAmount(rate);
    if (n == null || n > 50) { toast.error('Taux entre 0 et 50 %.'); setRate(String(fund.rate).replace('.', ',')); return; }
    if (n !== fund.rate) save({ ...fund, rate: n });
  };

  return (
    <div className="bt-set-sub bt-set-rem">
      <div className="bt-set-subtxt">
        {/* Lot 11 : une ligne courte ; le détail dans l'ⓘ, À CÔTÉ du libellé (jamais dedans). */}
        <div className="bt-set-lrow">
          <label className="bt-set-l">Caisse de congés BTP</label>
          <InfoTip
            label="Plus d’infos : Caisse de congés BTP" testId="set-tip-caisse"
            text={<>Cotisation congés payés sur le brut, ajoutée au coût réel de chaque bulletin. Ne change pas la paie.</>}
          />
        </div>
        <p className="bt-set-substate">Ajoutée au coût réel. À laisser éteint hors BTP.</p>
      </div>
      <div className="bt-set-remctl">
        <label className="bt-set-switch">
          <input type="checkbox" disabled={!fund} checked={!!fund?.enabled}
            onChange={(e) => fund && save({ ...fund, enabled: e.target.checked })} />
          {fund?.enabled ? 'Activée' : 'Éteinte'}
        </label>
        <input
          className="bt-set-hour" style={{ width: 84 }} inputMode="decimal" aria-label="Taux de cotisation (%)"
          disabled={!fund?.enabled} value={rate} placeholder={String(BTP_LEAVE_DEFAULT_RATE).replace('.', ',')}
          onChange={(e) => setRate(e.target.value)} onBlur={commitRate}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span style={{ fontWeight: 800, fontSize: 13 }}>%</span>
      </div>
    </div>
  );
}
