'use client';

// Réglages → Heures & paie → « Indemnités BTP » (petits déplacements). ÉTEINT par défaut : un restaurant n'en
// a pas l'usage. Allumé : la zone de chaque jour (ouvriers seulement) apparaît dans la feuille d'heures et dans
// l'export de paie. Rien à saisir : les adresses (entreprise, chantiers) sont placées automatiquement.
//
// Son propre geste et sa propre écriture (table btp_settings), comme la caisse de congés : le bouton
// « Enregistrer » du bas n'est pas touché. Tant que la migration n'est pas passée, la lecture échoue → rien
// ne s'affiche.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MapPin } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';
import {
  amountsFrom, limitsFrom, loadBtpContext, readBtpSettings, saveBtpSettings,
  BTP_MENTION, BTP_ZONES, DEFAULT_LIMITS_KM, type BtpAmounts, type BtpSettings,
} from '@/lib/btp-zones';

const txt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
type Saisie = { trajet: Record<string, string>; transport: Record<string, string>; panier: string };
const saisieDe = (a: BtpAmounts): Saisie => ({
  trajet: Object.fromEntries(BTP_ZONES.map((z) => [z, txt(a.trajet[z])])),
  transport: Object.fromEntries(BTP_ZONES.map((z) => [z, txt(a.transport[z])])),
  panier: txt(a.panier),
});

export default function BtpZonesSetting({ companyId, userId }: { companyId: string; userId?: string }) {
  const [s, setS] = useState<BtpSettings | null>(null);
  const [origine, setOrigine] = useState<'siege' | 'autre'>('siege');
  const [adresse, setAdresse] = useState('');
  const [limites, setLimites] = useState<string[]>(DEFAULT_LIMITS_KM.map(String));
  const [montants, setMontants] = useState<Saisie>(saisieDe(amountsFrom({})));
  const [busy, setBusy] = useState(false);
  const [bilan, setBilan] = useState<string | null>(null);

  const remplir = (v: BtpSettings) => {
    setS(v);
    setOrigine(v.originAddress ? 'autre' : 'siege');
    setAdresse(v.originAddress || '');
    setLimites(v.limits.map((n) => txt(n)));
    setMontants(saisieDe(v.amounts));
  };
  useEffect(() => { void readBtpSettings(companyId).then((v) => { if (v) remplir(v); }); }, [companyId]);

  // Place les adresses (une fois chacune) et dit ce qui manque. Rien n'est bloqué : un jour non placé est « à vérifier ».
  const verifier = async () => {
    setBilan('Placement des adresses…');
    const ctx = await loadBtpContext(companyId);
    if (!ctx) { setBilan(null); return; }
    const places = Array.from(ctx.geo.values()).filter(Boolean).length;
    const manquent = ctx.geo.size - places;
    setBilan([
      ctx.origin ? 'Point de départ placé' : 'Point de départ introuvable : vérifiez l’adresse',
      `${places} chantier${places > 1 ? 's' : ''} placé${places > 1 ? 's' : ''}`,
      manquent ? `${manquent} sans adresse reconnue (jours « à vérifier »)` : '',
    ].filter(Boolean).join(' · '));
  };
  useEffect(() => { if (s?.enabled) void verifier(); }, [s?.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;

  const enregistrer = async (next: BtpSettings) => {
    setBusy(true);
    const { error } = await saveBtpSettings(companyId, userId, next);
    setBusy(false);
    if (error) { toast.error('Indemnités BTP : réglage non enregistré. Réessayez.'); return false; }
    const relu = await readBtpSettings(companyId);
    if (relu) remplir(relu);
    return true;
  };

  const basculer = (on: boolean) => { void enregistrer({ ...s, enabled: on }); };

  const enregistrerDetail = async () => {
    const lim = limitsFrom(limites);
    if (!lim) { toast.error('Zones : six limites en km, de la plus proche à la plus lointaine (ex. 5, 10, 20, 30, 40, 50).'); return; }
    if (origine === 'autre' && adresse.trim().length < 5) { toast.error('Indiquez l’adresse du point de départ (dépôt, agence).'); return; }
    const amounts = amountsFrom({ trajet: montants.trajet, transport: montants.transport, panier: montants.panier });
    const ok = await enregistrer({ ...s, originAddress: origine === 'autre' ? adresse.trim() : null, limits: lim, amounts });
    if (ok) { toast.success('Indemnités BTP enregistrées'); void verifier(); }
  };

  const champ = (val: string, set: (v: string) => void, label: string, w = 64) => (
    <input className="bt-set-hour" style={{ width: w, textAlign: 'right' }} inputMode="decimal" aria-label={label}
      value={val} onChange={(e) => set(e.target.value)} />
  );
  const bornes = (i: number) => `${i === 0 ? 0 : limites[i - 1] || '?'} à`;

  return (
    <div className="bt-set-sub bt-set-rem" data-testid="setting-btp" style={{ flexWrap: 'wrap' }}>
      <div className="bt-set-subtxt">
        <div className="bt-set-lrow">
          <label className="bt-set-l">Indemnités BTP (petits déplacements)</label>
          <InfoTip
            label="Plus d’infos : Indemnités BTP" testId="set-tip-btp"
            text={<>Pour les ouvriers seulement. La zone du jour se calcule à vol d’oiseau entre votre point de départ et le chantier (le plus éloigné si plusieurs). Elle s’affiche dans la feuille d’heures et l’export de paie. Le panier reste la case « Panier » du salarié.</>}
          />
        </div>
        <p className="bt-set-substate">Zone de chaque jour, calculée toute seule. À laisser éteint hors BTP.</p>
      </div>
      <div className="bt-set-remctl">
        <label className="bt-set-switch">
          <input type="checkbox" checked={s.enabled} disabled={busy} onChange={(e) => basculer(e.target.checked)} data-testid="set-btp" />
          <span>{s.enabled ? 'Activées' : 'Éteintes'}</span>
        </label>
      </div>

      {s.enabled ? (
        <div style={{ flexBasis: '100%', display: 'grid', gap: 12, marginTop: 10 }} data-testid="setting-btp-detail">
          {bilan ? <p className="bt-set-substate" data-testid="btp-bilan"><MapPin className="h-3.5 w-3.5" style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> {bilan}</p> : null}

          <fieldset style={{ display: 'grid', gap: 6 }}>
            <legend className="bt-set-l">Point de départ</legend>
            <label className="bt-set-switch"><input type="radio" name="btp-origine" checked={origine === 'siege'} onChange={() => setOrigine('siege')} /> Adresse de l’entreprise (siège)</label>
            <label className="bt-set-switch"><input type="radio" name="btp-origine" checked={origine === 'autre'} onChange={() => setOrigine('autre')} /> Autre adresse (dépôt, agence)</label>
            {origine === 'autre' ? (
              <input className="bt-field" style={{ maxWidth: 420 }} placeholder="12 rue du Dépôt 69000 Lyon" aria-label="Adresse du point de départ"
                value={adresse} onChange={(e) => setAdresse(e.target.value)} data-testid="btp-adresse" />
            ) : null}
          </fieldset>

          <fieldset style={{ display: 'grid', gap: 6 }}>
            <legend className="bt-set-l">Zones (km à vol d’oiseau)</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {BTP_ZONES.map((z, i) => (
                <label key={z} className="bt-set-switch" style={{ gap: 4 }}>
                  <b style={{ minWidth: 26 }}>{z}</b><span>{bornes(i)}</span>
                  {champ(limites[i] ?? '', (v) => setLimites((l) => l.map((x, k) => (k === i ? v : x))), `Limite de la zone ${z} (km)`, 56)}
                  <span>km</span>
                </label>
              ))}
            </div>
            <p className="bt-set-substate">Au-delà de {limites[5] || '50'} km : grand déplacement. Valeurs de départ : la grille la plus courante (1A 0-5, 1B 5-10, puis de 10 en 10 km). Votre accord départemental peut différer.</p>
          </fieldset>

          <details>
            <summary className="bt-set-l" style={{ cursor: 'pointer' }}>Montants (facultatif)</summary>
            <p className="bt-set-substate" style={{ margin: '6px 0' }}><b>{BTP_MENTION}</b> Laissez vide : l’export donne alors les jours par zone, sans montant.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><th style={{ textAlign: 'left', padding: 4 }}>Zone</th><th style={{ padding: 4 }}>Trajet (€ / jour)</th><th style={{ padding: 4 }}>Transport (€ / jour)</th></tr></thead>
                <tbody>
                  {BTP_ZONES.map((z) => (
                    <tr key={z}>
                      <td style={{ padding: 4, fontWeight: 700 }}>{z}</td>
                      <td style={{ padding: 4 }}>{champ(montants.trajet[z] ?? '', (v) => setMontants((m) => ({ ...m, trajet: { ...m.trajet, [z]: v } })), `Trajet zone ${z} (€)`, 76)}</td>
                      <td style={{ padding: 4 }}>{champ(montants.transport[z] ?? '', (v) => setMontants((m) => ({ ...m, transport: { ...m.transport, [z]: v } })), `Transport zone ${z} (€)`, 76)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="bt-set-switch" style={{ gap: 6, marginTop: 6 }}>
              <span>Panier (€ / jour coché)</span>
              {champ(montants.panier, (v) => setMontants((m) => ({ ...m, panier: v })), 'Panier (€ par jour)', 76)}
            </label>
          </details>

          <div>
            <button type="button" className="bt-set-btn" disabled={busy} onClick={() => { void enregistrerDetail(); }} data-testid="btp-enregistrer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Enregistrer les indemnités
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
