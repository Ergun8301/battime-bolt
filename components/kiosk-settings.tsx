'use client';

// Paramètres → Borne de pointage. N'apparaît que si `companies.kiosk_enabled`.
//
// Tout passe par l'Edge Function `kiosk` : les tables de la borne n'ont aucune
// policy, le navigateur ne les lit jamais en direct (en particulier la clé des QR).

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Tablet, MapPinOff } from 'lucide-react';
import { toast } from 'sonner';
import { callKiosk } from '@/lib/kiosk';

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

type Device = { id: string; name: string; worksite_id: string; paired_at: string; last_seen_at: string | null; has_position: boolean };
type Settings = { show_planning: boolean; require_gps: boolean; awake_from: string | null; awake_until: string | null };
type State = { devices: Device[]; settings: Settings; worksites: { id: string; client_name: string }[] };

const CSS = `
.kio{display:flex;flex-direction:column;gap:14px}
.kio-intro{font-size:13.5px;color:#56514a;font-weight:500;margin:0;line-height:1.5}
.kio-sec{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:14px}
.kio-l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin:0 0 10px;display:block}
.kio-dev{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(21,18,15,.08)}
.kio-dev:first-of-type{border-top:none;padding-top:0}
.kio-ico{width:38px;height:38px;border-radius:10px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;flex:none}
.kio-dn{font-weight:800;font-size:14.5px;color:#15120F;margin:0}
.kio-dm{font-size:12px;color:#6E6A63;font-weight:600;margin:2px 0 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.kio-warn{color:#9a3b14;display:inline-flex;align-items:center;gap:3px}
.kio-grow{flex:1;min-width:0}
.kio-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#fff;border-radius:9px;padding:7px 11px;font-weight:800;font-size:12.5px;color:#15120F;cursor:pointer;font-family:inherit;white-space:nowrap}
.kio-btn.danger{border-color:#C0461F;color:#C0461F}
.kio-btn.danger.armed{background:#C0461F;color:#fff}
.kio-btn.primary{background:#FFC21A;border-color:#FFC21A;box-shadow:0 3px 0 #C99300}
.kio-btn:disabled{opacity:.55}
.kio-empty{font-size:13px;color:#9a948a;font-weight:600;margin:0 0 10px}
.kio-form{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-top:10px}
.kio-i{width:100%;font-family:inherit;font-size:14px;font-weight:500;padding:8px 10px;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;background:#fff;outline:none;color:#15120F}
.kio-i:focus{border-color:#15120F}
.kio-fl{font-size:11px;font-weight:700;color:#6E6A63;margin:0 0 3px;display:block}
.kio-code{margin-top:12px;background:#15120F;color:#FBF8F2;border-radius:14px;padding:18px;text-align:center}
.kio-code b{display:block;font-size:44px;letter-spacing:.18em;font-weight:900;font-variant-numeric:tabular-nums;color:#FFC21A;line-height:1.1}
.kio-code p{margin:8px 0 0;font-size:13px;color:#bdb6aa;font-weight:600}
.kio-row{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-top:1px solid rgba(21,18,15,.08);cursor:pointer}
.kio-row:first-of-type{border-top:none;padding-top:0}
.kio-row input[type=checkbox]{width:18px;height:18px;accent-color:#15120F;margin-top:2px;flex:none;cursor:pointer}
.kio-rt{font-weight:800;font-size:14px;color:#15120F;margin:0}
.kio-rd{font-size:12.5px;color:#6E6A63;font-weight:500;margin:2px 0 0;line-height:1.4}
.kio-hours{display:flex;align-items:center;gap:8px;margin:8px 0 0 30px;font-size:13px;font-weight:700;color:#15120F}
.kio-hours input{width:auto}
.kio-hours input:disabled{opacity:.45}
@media(max-width:640px){.kio-form{grid-template-columns:1fr}}
`;

function ago(iso: string | null): string {
  if (!iso) return 'jamais connectée';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return 'active à l’instant';
  if (m < 60) return `active il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `active il y a ${h} h`;
  return `active il y a ${Math.round(h / 24)} j`;
}

export default function KioskSettings({ open, onOpenChange }: Props) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('Entrée');
  const [worksite, setWorksite] = useState('');
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expires: number } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const r = await callKiosk<State>({ action: 'admin_state' });
    if (!r.ok) { setErr(r.error); return; }
    setErr(null);
    setSt(r.data);
    setWorksite((w) => w || r.data.worksites[0]?.id || '');
  }, []);

  useEffect(() => {
    if (!open) return;
    setSt(null); setPairing(null); setAdding(false); setArmed(null);
    refresh();
  }, [open, refresh]);

  // Code affiché : compte à rebours, et la liste se met à jour dès que la
  // tablette est appairée.
  useEffect(() => {
    if (!pairing) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(refresh, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [pairing, refresh]);
  const count = st?.devices.length ?? 0;
  const [countAtPairing, setCountAtPairing] = useState(0);
  useEffect(() => {
    if (pairing && count > countAtPairing) {
      setPairing(null); setAdding(false);
      toast.success('Borne associée');
    }
  }, [count, countAtPairing, pairing]);
  useEffect(() => { if (pairing && now > pairing.expires) setPairing(null); }, [now, pairing]);

  const createPairing = async () => {
    setBusy(true);
    const r = await callKiosk<{ code: string; expires_at: string }>({ action: 'create_pairing', name, worksite_id: worksite });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setCountAtPairing(count);
    setNow(Date.now());
    setPairing({ code: r.data.code, expires: Date.parse(r.data.expires_at) });
  };

  const revoke = async (id: string) => {
    if (armed !== id) { setArmed(id); return; }
    setArmed(null);
    const r = await callKiosk({ action: 'revoke', device_id: id });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Borne retirée');
    refresh();
  };

  const updateSettings = async (patch: Partial<Settings>) => {
    if (!st) return;
    const prev = st.settings;
    setSt({ ...st, settings: { ...prev, ...patch } });
    const r = await callKiosk<{ settings: Settings }>({ action: 'update_settings', ...patch });
    if (!r.ok) { toast.error(r.error); setSt((s) => (s ? { ...s, settings: prev } : s)); }
  };

  const wsName = (id: string) => st?.worksites.find((w) => w.id === id)?.client_name || '';
  const sleepOn = !!(st?.settings.awake_from && st?.settings.awake_until);
  const left = pairing ? Math.max(0, pairing.expires - now) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <style>{CSS}</style>
        <DialogHeader><DialogTitle>Borne de pointage</DialogTitle></DialogHeader>
        {!st ? (
          <div className="py-8 text-center text-sm font-semibold text-neutral-500">
            {err ?? <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          </div>
        ) : (
          <div className="kio">
            <p className="kio-intro">Une tablette à l&apos;entrée affiche un QR. Vos salariés le scannent avec leur téléphone : arrivée ou départ, c&apos;est tout.</p>

            <div className="kio-sec">
              <span className="kio-l">Bornes</span>
              {st.devices.length === 0 && !adding && <p className="kio-empty">Aucune borne pour l&apos;instant.</p>}
              {st.devices.map((d) => (
                <div className="kio-dev" key={d.id}>
                  <div className="kio-ico"><Tablet className="h-5 w-5" /></div>
                  <div className="kio-grow">
                    <p className="kio-dn">{d.name}</p>
                    <p className="kio-dm">
                      <span>{wsName(d.worksite_id)}</span><span>·</span><span>{ago(d.last_seen_at)}</span>
                      {st.settings.require_gps && !d.has_position && (
                        <span className="kio-warn"><MapPinOff className="h-3 w-3" /> position non enregistrée</span>
                      )}
                    </p>
                  </div>
                  <button type="button" className={`kio-btn danger${armed === d.id ? ' armed' : ''}`} onClick={() => revoke(d.id)}>
                    {armed === d.id ? 'Confirmer' : 'Retirer'}
                  </button>
                </div>
              ))}

              {!adding ? (
                <button type="button" className="kio-btn primary" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> Ajouter une borne
                </button>
              ) : pairing ? (
                <div className="kio-code">
                  <b>{pairing.code.slice(0, 3)} {pairing.code.slice(3)}</b>
                  <p>Sur la tablette, ouvrez <strong style={{ color: '#FBF8F2' }}>{typeof window !== 'undefined' ? window.location.host : 'bemexo.com'}/borne</strong> et saisissez ce code.</p>
                  <p>Valable encore {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}</p>
                </div>
              ) : st.worksites.length === 0 ? (
                <p className="kio-empty" style={{ marginTop: 10 }}>Créez d&apos;abord un chantier ou établissement : les arrivées y seront enregistrées.</p>
              ) : (
                <div className="kio-form">
                  <div>
                    <label className="kio-fl" htmlFor="kio-name">Nom de la borne</label>
                    <input id="kio-name" className="kio-i" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="kio-fl" htmlFor="kio-ws">Lieu</label>
                    <select id="kio-ws" className="kio-i" value={worksite} onChange={(e) => setWorksite(e.target.value)}>
                      {st.worksites.map((w) => <option key={w.id} value={w.id}>{w.client_name}</option>)}
                    </select>
                  </div>
                  <button type="button" className="kio-btn primary" disabled={busy || !worksite} onClick={createPairing}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Générer le code
                  </button>
                </div>
              )}
            </div>

            <div className="kio-sec">
              <span className="kio-l">Options</span>
              <label className="kio-row">
                <input type="checkbox" checked={st.settings.show_planning} onChange={(e) => updateSettings({ show_planning: e.target.checked })} />
                <div>
                  <p className="kio-rt">Afficher le planning du jour</p>
                  <p className="kio-rd">Prénom et horaire prévu, rien d&apos;autre. Aucune heure, paie ou coût sur la borne.</p>
                </div>
              </label>
              <label className="kio-row">
                <input type="checkbox" checked={st.settings.require_gps} onChange={(e) => updateSettings({ require_gps: e.target.checked })} />
                <div>
                  <p className="kio-rt">Vérifier que le salarié est sur place (GPS)</p>
                  <p className="kio-rd">Le téléphone doit être à moins de 200 m de la borne. La position est comparée, jamais enregistrée. Désactivé : aucune position demandée.</p>
                </div>
              </label>
              <label className="kio-row">
                <input
                  type="checkbox" checked={sleepOn}
                  onChange={(e) => updateSettings(e.target.checked ? { awake_from: '06:00', awake_until: '20:00' } : { awake_from: null, awake_until: null })}
                />
                <div>
                  <p className="kio-rt">Mise en veille hors horaires</p>
                  <p className="kio-rd">Écran noir en dehors de ces heures. Un toucher le réveille.</p>
                </div>
              </label>
              {sleepOn && (
                <div className="kio-hours">
                  Allumée de
                  <input type="time" className="kio-i" value={st.settings.awake_from ?? ''} onChange={(e) => e.target.value && updateSettings({ awake_from: e.target.value })} />
                  à
                  <input type="time" className="kio-i" value={st.settings.awake_until ?? ''} onChange={(e) => e.target.value && updateSettings({ awake_until: e.target.value })} />
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
