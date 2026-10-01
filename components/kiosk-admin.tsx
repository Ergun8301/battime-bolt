'use client';

// Réglages → Borne de pointage (lot 1). Visible SEULEMENT si l'entreprise a
// `kiosk_enabled` (voir company-settings.tsx).
//
// Trois choses, rien de plus :
//   · ajouter une borne → un code à 6 chiffres, valable 10 minutes ;
//   · la liste des bornes, avec « Retirer » (effet immédiat) ;
//   · une option (GPS) et des horaires d'ouverture facultatifs.
//
// Lot 9 : la borne affiche TOUJOURS le planning de la semaine (lecture seule) ;
// la case « Afficher le planning du jour » a disparu. `show_planning` est
// pourtant toujours LU puis RENVOYÉ tel quel à l'enregistrement : l'ancienne
// fonction, tant qu'elle tourne en production, écrirait sinon « faux » à la
// place d'un « vrai » (la nouvelle ne l'écrit plus du tout).
//
// Toutes les écritures passent par la fonction `kiosk` (qui revérifie le rôle
// admin et l'interrupteur) ; ici on ne fait que LIRE, sous RLS.

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, MonitorSmartphone, Plus, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callKiosk, type KioskSettings } from '@/lib/kiosk-client';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId: string }

interface KioskRow {
  id: string; name: string; worksite_id: string | null;
  latitude: number | null; longitude: number | null;
  created_at: string; last_seen_at: string | null;
}
interface Worksite { id: string; client_name: string }

const EMPTY_SETTINGS: KioskSettings = { show_planning: false, require_gps: false, active_from: null, active_until: null };

const CSS = `
.ka{display:flex;flex-direction:column;gap:14px;font-family:'Archivo',sans-serif}
.ka-sec{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:14px 16px}
.ka-l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin:0 0 8px;display:block}
.ka-p{font-size:13px;color:#56514a;font-weight:600;margin:0;line-height:1.45}
.ka-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid rgba(21,18,15,.08)}
.ka-row:first-of-type{border-top:0}
.ka-ico{width:38px;height:38px;border-radius:10px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;flex:none}
.ka-name{font-weight:900;font-size:15px;color:#15120F}
.ka-meta{font-size:12.5px;color:#6E6A63;font-weight:600;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ka-live{display:inline-block;width:7px;height:7px;border-radius:50%;background:#2FD584}
.ka-live.off{background:#c4bdae}
.ka-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#fff;border-radius:10px;padding:8px 12px;font-weight:800;font-size:13px;color:#15120F;cursor:pointer;font-family:inherit;white-space:nowrap}
.ka-btn.danger{border-color:rgba(192,70,31,.35);color:#C0461F}
.ka-btn.primary{background:#FFC21A;border-color:#FFC21A;box-shadow:0 3px 0 #C99300}
.ka-btn:disabled{opacity:.6;cursor:default}
.ka-i{font-family:inherit;font-size:14px;font-weight:600;padding:9px 11px;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;background:#fff;color:#15120F;outline:none;min-width:0}
.ka-i:focus{border-color:#15120F}
.ka-form{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:10px}
.ka-code{margin-top:12px;background:#15120F;color:#F2EDE3;border-radius:14px;padding:18px;text-align:center}
.ka-code b{display:block;font-family:'JetBrains Mono',monospace;font-size:44px;letter-spacing:.18em;color:#FFC21A;line-height:1.1}
.ka-code small{display:block;font-size:13px;color:#a59c86;font-weight:600;margin-top:8px;line-height:1.5}
.ka-sw{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(21,18,15,.08)}
.ka-sw:first-of-type{border-top:0;padding-top:0}
.ka-sw b{display:block;font-size:14px;color:#15120F}
.ka-sw input[type=checkbox]{width:19px;height:19px;accent-color:#15120F;flex:none;margin-top:2px}
.ka-hours{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.ka-foot{display:flex;justify-content:flex-end;margin-top:10px}
@media(max-width:640px){.ka-form{grid-template-columns:1fr}}
`;

export default function KioskAdmin({ open, onOpenChange, companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [kiosks, setKiosks] = useState<KioskRow[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [settings, setSettings] = useState<KioskSettings>(EMPTY_SETTINGS);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [worksiteId, setWorksiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [k, w, s] = await Promise.all([
      supabase.from('kiosks')
        .select('id, name, worksite_id, latitude, longitude, created_at, last_seen_at')
        .eq('company_id', companyId).is('revoked_at', null).order('created_at', { ascending: true }),
      supabase.from('worksites').select('id, client_name').eq('company_id', companyId).eq('is_active', true).order('client_name'),
      supabase.from('kiosk_settings').select('show_planning, require_gps, active_from, active_until').eq('company_id', companyId).maybeSingle(),
    ]);
    setKiosks((k.data || []) as KioskRow[]);
    setWorksites((w.data || []) as Worksite[]);
    const sd = s.data as KioskSettings | null;
    setSettings(sd ? { ...sd, active_from: sd.active_from?.slice(0, 5) ?? null, active_until: sd.active_until?.slice(0, 5) ?? null } : EMPTY_SETTINGS);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (open) { setLoading(true); load(); } }, [open, load]);

  // Tant qu'un code est affiché : compte à rebours, et la liste se met à jour
  // toute seule dès que la tablette est appairée.
  useEffect(() => {
    if (!pairing) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const before = kiosks.length;
      const { data } = await supabase.from('kiosks').select('id').eq('company_id', companyId).is('revoked_at', null);
      if ((data || []).length > before) { setPairing(null); load(); toast.success('Borne installée'); }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [pairing, kiosks.length, companyId, load]);

  const create = async () => {
    setBusy(true);
    const { data, error } = await callKiosk<{ code: string; expires_at: string }>({
      action: 'create_pairing', name: name.trim() || 'Borne', worksite_id: worksiteId || null,
    });
    setBusy(false);
    if (!data) { toast.error(error || 'Création impossible'); return; }
    setPairing(data); setAdding(false); setName(''); setWorksiteId('');
  };

  const revoke = async (id: string) => {
    const { data, error } = await callKiosk<{ revoked: number }>({ action: 'revoke', kiosk_id: id });
    setConfirmRevoke(null);
    if (!data) { toast.error(error || 'Retrait impossible'); return; }
    toast.success('Borne retirée : ses QR ne fonctionnent plus.');
    load();
  };

  const saveSettings = async () => {
    setSaving(true);
    const { data, error } = await callKiosk<{ settings: KioskSettings }>({ action: 'settings', ...settings });
    setSaving(false);
    if (!data) { toast.error(error || 'Enregistrement impossible'); return; }
    setSettings(data.settings);
    toast.success('Options enregistrées');
  };

  const remaining = pairing ? Math.max(0, new Date(pairing.expires_at).getTime() - now) : 0;
  const mm = Math.floor(remaining / 60000);
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  const wsName = (id: string | null) => worksites.find((w) => w.id === id)?.client_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-xl max-h-[92vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5" /> Borne de pointage</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div style={{ padding: 26, textAlign: 'center' }}><Loader2 className="h-5 w-5 animate-spin" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="ka">
            <div className="ka-sec">
              <span className="ka-l">Vos bornes</span>
              {kiosks.length === 0 && !pairing && (
                <p className="ka-p">Posez une tablette à l&apos;entrée : vos salariés scannent le QR avec leur téléphone pour pointer leur arrivée et leur départ.</p>
              )}
              {kiosks.map((k) => {
                const seen = k.last_seen_at ? new Date(k.last_seen_at).getTime() : 0;
                const live = seen && now - seen < 15 * 60 * 1000;
                return (
                  <div className="ka-row" key={k.id}>
                    <div className="ka-ico"><MonitorSmartphone className="h-5 w-5" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ka-name">{k.name}</div>
                      <div className="ka-meta">
                        <span className={`ka-live${live ? '' : ' off'}`} />
                        {k.last_seen_at ? `${live ? 'Active' : 'Vue'} ${formatDistanceToNow(new Date(k.last_seen_at), { addSuffix: true, locale: fr })}` : 'Jamais vue'}
                        {wsName(k.worksite_id) && <span>· {wsName(k.worksite_id)}</span>}
                        {k.latitude != null && <span title="Position relevée à l'installation"><MapPin className="h-3 w-3" style={{ display: 'inline' }} /> position</span>}
                      </div>
                    </div>
                    {confirmRevoke === k.id ? (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="ka-btn danger" onClick={() => revoke(k.id)}>Oui, retirer</button>
                        <button type="button" className="ka-btn" onClick={() => setConfirmRevoke(null)}>Non</button>
                      </span>
                    ) : (
                      <button type="button" className="ka-btn danger" onClick={() => setConfirmRevoke(k.id)}><Trash2 className="h-4 w-4" /> Retirer</button>
                    )}
                  </div>
                );
              })}

              {pairing ? (
                <div className="ka-code">
                  <b>{pairing.code.slice(0, 3)} {pairing.code.slice(3)}</b>
                  <small>
                    Sur la tablette, ouvrez <strong style={{ color: '#F2EDE3' }}>bemexo.com/borne</strong> et saisissez ce code.<br />
                    {remaining > 0 ? `Valable encore ${mm}:${ss}` : 'Code expiré — créez-en un nouveau.'}
                  </small>
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="ka-btn" onClick={() => { setPairing(null); load(); }}>Fermer</button>
                  </div>
                </div>
              ) : adding ? (
                <div className="ka-form">
                  <input className="ka-i" placeholder="Nom (ex. Entrée du dépôt)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                  <select className="ka-i" value={worksiteId} onChange={(e) => setWorksiteId(e.target.value)} aria-label="Lieu où l'arrivée est enregistrée">
                    <option value="">Lieu : Autre</option>
                    {worksites.map((w) => <option key={w.id} value={w.id}>{w.client_name}</option>)}
                  </select>
                  <button type="button" className="ka-btn primary" onClick={create} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer le code'}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: kiosks.length ? 10 : 12 }}>
                  <button type="button" className="ka-btn primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Ajouter une borne</button>
                </div>
              )}
            </div>

            <div className="ka-sec">
              <span className="ka-l">Options</span>
              <p className="ka-p" style={{ margin: '0 0 10px' }}>
                La borne affiche le planning de la semaine (prénom, nom, chantier, ville, horaires prévus et « en cours depuis »). Aucune heure pointée, aucun coût.
              </p>
              <label className="ka-sw">
                <span>
                  <b>Vérifier que le salarié est sur place (GPS)</b>
                  <span className="ka-p">Le téléphone doit être à moins de 200 m de la borne. La position est comparée, jamais enregistrée.</span>
                </span>
                <input type="checkbox" checked={settings.require_gps} onChange={(e) => setSettings({ ...settings, require_gps: e.target.checked })} />
              </label>
              <div className="ka-sw" style={{ display: 'block' }}>
                <b>Horaires d&apos;ouverture <span style={{ fontWeight: 600, color: '#9a948a' }}>(facultatif)</span></b>
                <span className="ka-p">En dehors, l&apos;écran est noir ; un toucher ouvre le QR pour pointer.</span>
                <div className="ka-hours">
                  <input className="ka-i" type="time" aria-label="Ouverture" value={settings.active_from || ''} onChange={(e) => setSettings({ ...settings, active_from: e.target.value || null })} />
                  <span className="ka-p">à</span>
                  <input className="ka-i" type="time" aria-label="Fermeture" value={settings.active_until || ''} onChange={(e) => setSettings({ ...settings, active_until: e.target.value || null })} />
                  {(settings.active_from || settings.active_until) && (
                    <button type="button" className="ka-btn" onClick={() => setSettings({ ...settings, active_from: null, active_until: null })}>Toujours allumée</button>
                  )}
                </div>
              </div>
              <div className="ka-foot">
                <button type="button" className="ka-btn primary" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer les options'}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
