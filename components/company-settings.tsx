'use client';

// Réglages de l'entreprise (côté admin). Tous les champs sont FACULTATIFS.
// L'écriture passe par la fonction serveur sécurisée `update_company_info`
// (n'écrit QUE les champs humains, jamais Stripe/abonnement). Le logo est stocké
// dans le bucket `company-logos` (dossier {company_id}/…), URL publique dans logo_url.

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, Trash2, Building2 } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void; }

type Form = {
  name: string; siret: string; tva_intra: string; address: string;
  postal_code: string; city: string; phone: string; email: string; logo_url: string;
};
const EMPTY: Form = { name: '', siret: '', tva_intra: '', address: '', postal_code: '', city: '', phone: '', email: '', logo_url: '' };

const SET_CSS = `
.bt-set{display:flex;flex-direction:column;gap:9px}
.bt-set-load{padding:26px;text-align:center;color:#6E6A63;font-weight:600}
.bt-set-toprow{display:flex;align-items:flex-start;gap:13px}
.bt-set-logo-prev{width:58px;height:58px;border-radius:12px;background:#fff;border:1px solid rgba(21,18,15,.14);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}
.bt-set-logo-prev img{max-width:100%;max-height:100%;object-fit:contain}
.bt-set-logo-ph{color:#c4bdae}
.bt-set-namewrap{flex:1;min-width:0}
.bt-set-rowbtns{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:6px}
.bt-set-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#fff;border-radius:9px;padding:6px 10px;font-weight:800;font-size:12.5px;color:#15120F;cursor:pointer;font-family:inherit}
.bt-set-btn.ghost{border-color:rgba(21,18,15,.2);color:#C0461F}
.bt-set-hint{font-size:11px;color:#9a948a;font-weight:600}
.bt-set-l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin:0 0 3px;display:block}
.bt-set-i{width:100%;font-family:'Archivo',sans-serif;font-size:14px;font-weight:500;padding:9px 11px;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;background:#fff;outline:none;color:#15120F}
.bt-set-i::placeholder{color:#b3aca0}
.bt-set-i:focus{border-color:#15120F}
.bt-set-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bt-set-grid-cpv{display:grid;grid-template-columns:1fr 1.6fr;gap:10px}
.bt-set-field{min-width:0}
.bt-set-err{background:#F4D9D1;border:1px solid #E8B79E;color:#9a3b14;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700}
.bt-set-foot{display:flex;align-items:center;gap:12px;margin-top:3px}
.bt-set-note{font-size:11.5px;color:#9a948a;font-weight:600;margin:0;flex:1}
.bt-set-save{flex:none;white-space:nowrap;background:#FFC21A;color:#15120F;border:none;border-radius:11px;padding:11px 22px;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 #C99300;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.bt-set-save:disabled{opacity:.6}
`;

export default function CompanySettings({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);

  useEffect(() => {
    if (!open || !user?.company_id) return;
    setLoading(true); setErr(null);
    supabase.from('companies')
      .select('name, siret, tva_intra, address, postal_code, city, phone, email, logo_url')
      .eq('id', user.company_id).maybeSingle()
      .then(({ data }) => {
        const d = (data || {}) as Partial<Form>;
        setF({
          name: d.name || '', siret: d.siret || '', tva_intra: d.tva_intra || '', address: d.address || '',
          postal_code: d.postal_code || '', city: d.city || '', phone: d.phone || '', email: d.email || '', logo_url: d.logo_url || '',
        });
        setLoading(false);
      });
  }, [open, user?.company_id]);

  const set = (k: keyof Form, v: string) => setF((p) => ({ ...p, [k]: v }));

  const onPickLogo = async (file?: File) => {
    if (!file || !user?.company_id) return;
    const okTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!okTypes.includes(file.type)) { setErr('Format accepté : PNG, JPG ou SVG.'); return; }
    if (file.size > 2 * 1024 * 1024) { setErr('Logo trop lourd (2 Mo maximum).'); return; }
    setErr(null); setUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/svg+xml' ? 'svg' : 'jpg';
      const cid = user.company_id;
      // On ne garde qu'UN seul fichier logo par entreprise (pas d'orphelin au remplacement).
      await supabase.storage.from('company-logos').remove([`${cid}/logo.png`, `${cid}/logo.jpg`, `${cid}/logo.svg`]);
      const path = `${cid}/logo.${ext}`;
      const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path);
      set('logo_url', `${pub.publicUrl}?v=${Date.now()}`);
    } catch {
      setErr("Échec de l'envoi du logo. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc('update_company_info', {
        p_name: f.name, p_siret: f.siret, p_tva_intra: f.tva_intra, p_address: f.address,
        p_postal_code: f.postal_code, p_city: f.city, p_phone: f.phone, p_email: f.email, p_logo_url: f.logo_url,
      });
      if (error) throw error;
      onSaved?.();
      onOpenChange(false);
    } catch {
      setErr("Échec de l'enregistrement. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Réglages de l&apos;entreprise</DialogTitle>
        </DialogHeader>
        <style dangerouslySetInnerHTML={{ __html: SET_CSS }} />
        {loading ? (
          <div className="bt-set-load">Chargement…</div>
        ) : (
          <div className="bt-set">
            {/* Logo + nom sur une même ligne (compact, sans scroll) */}
            <div className="bt-set-toprow">
              <div className="bt-set-logo-prev">
                {f.logo_url
                  ? <img src={f.logo_url} alt="Logo de l'entreprise" />
                  : <span className="bt-set-logo-ph"><Building2 className="h-6 w-6" /></span>}
              </div>
              <div className="bt-set-namewrap">
                <label className="bt-set-l">Nom de l&apos;entreprise</label>
                <input className="bt-set-i" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. K Habitat" />
                <div className="bt-set-rowbtns">
                  <label className="bt-set-btn">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {f.logo_url ? 'Remplacer le logo' : 'Ajouter un logo'}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => onPickLogo(e.target.files?.[0])} />
                  </label>
                  {f.logo_url && (
                    <button type="button" className="bt-set-btn ghost" onClick={() => set('logo_url', '')}>
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  )}
                  <span className="bt-set-hint">PNG, JPG ou SVG · 2 Mo max</span>
                </div>
              </div>
            </div>

            <div className="bt-set-grid2">
              <div className="bt-set-field">
                <label className="bt-set-l">SIRET</label>
                <input className="bt-set-i" value={f.siret} onChange={(e) => set('siret', e.target.value)} placeholder="123 456 789 00012" />
              </div>
              <div className="bt-set-field">
                <label className="bt-set-l">TVA intracom.</label>
                <input className="bt-set-i" value={f.tva_intra} onChange={(e) => set('tva_intra', e.target.value)} placeholder="FR12 345678901" />
              </div>
            </div>

            <div className="bt-set-field">
              <label className="bt-set-l">Adresse</label>
              <input className="bt-set-i" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="12 rue des Artisans" />
            </div>

            <div className="bt-set-grid-cpv">
              <div className="bt-set-field">
                <label className="bt-set-l">Code postal</label>
                <input className="bt-set-i" value={f.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="13100" />
              </div>
              <div className="bt-set-field">
                <label className="bt-set-l">Ville</label>
                <input className="bt-set-i" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Aix-en-Provence" />
              </div>
            </div>

            <div className="bt-set-grid2">
              <div className="bt-set-field">
                <label className="bt-set-l">Téléphone</label>
                <input className="bt-set-i" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="06 12 34 56 78" />
              </div>
              <div className="bt-set-field">
                <label className="bt-set-l">Email</label>
                <input className="bt-set-i" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@entreprise.fr" />
              </div>
            </div>

            {err && <div className="bt-set-err">{err}</div>}
            <div className="bt-set-foot">
              <p className="bt-set-note">Tous les champs sont facultatifs.</p>
              <button type="button" className="bt-set-save" onClick={save} disabled={saving || uploading}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
