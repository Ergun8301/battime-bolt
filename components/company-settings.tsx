'use client';

// Réglages de l'entreprise (côté admin). Tous les champs sont FACULTATIFS.
// L'écriture passe par la fonction serveur sécurisée `update_company_info`
// (n'écrit QUE les champs humains, jamais Stripe/abonnement). Le logo est stocké
// dans le bucket `company-logos` (dossier {company_id}/…), URL publique dans logo_url.

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, Trash2, Building2, CreditCard, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

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
.bt-set-sub{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:12px;padding:12px 14px;margin-top:4px}
.bt-set-subtxt{min-width:0}
.bt-set-substate{font-size:13px;color:#56514a;font-weight:600;margin:3px 0 0}
.bt-set-rem .bt-set-substate{max-width:46ch;line-height:1.45}
.bt-set-remctl{display:flex;align-items:center;gap:10px;flex:none}
.bt-set-switch{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#15120F;cursor:pointer;white-space:nowrap}
.bt-set-switch input{width:17px;height:17px;accent-color:#15120F;cursor:pointer}
.bt-set-hour{font-family:'Archivo',sans-serif;font-size:13.5px;font-weight:800;color:#15120F;padding:8px 10px;border:1.5px solid rgba(21,18,15,.18);border-radius:9px;background:#fff;cursor:pointer}
.bt-set-hour:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:640px){
  .bt-set-grid2{grid-template-columns:1fr}
  .bt-set-grid-cpv{grid-template-columns:1fr}
}
`;

export default function CompanySettings({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  // Relance automatique des pointages manquants (hors du type Form, qui n'accepte
  // que des chaînes) — enregistrées par le même bouton « Enregistrer ».
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderHour, setReminderHour] = useState(17);
  const [budgetAlertsOn, setBudgetAlertsOn] = useState(true);
  // Le temps de route entre deux chantiers est-il payé ? Décision de
  // l'entreprise : le logiciel ne tranche pas à sa place.
  const [travelPaid, setTravelPaid] = useState(false);
  // Horaire hebdomadaire de base : au-delà, les heures sont supplémentaires.
  const [weeklyHours, setWeeklyHours] = useState('35');
  // Destinataire de l'export de paie. Enregistré une fois, modifiable ici : la
  // fonction serveur ne lit QUE cette adresse, jamais celle du navigateur.
  const [accountantEmail, setAccountantEmail] = useState('');

  useEffect(() => {
    if (!open || !user?.company_id) return;
    setLoading(true); setErr(null);
    supabase.from('companies')
      .select('name, siret, tva_intra, address, postal_code, city, phone, email, logo_url, subscription_status, auto_reminder_enabled, reminder_hour, budget_alerts_enabled, travel_paid, weekly_hours, accountant_email')
      .eq('id', user.company_id).maybeSingle()
      .then(({ data }) => {
        const d = (data || {}) as Partial<Form> & {
          subscription_status?: string | null;
          auto_reminder_enabled?: boolean | null;
          reminder_hour?: number | null;
          budget_alerts_enabled?: boolean | null;
          travel_paid?: boolean | null;
          weekly_hours?: number | null;
          accountant_email?: string | null;
        };
        setF({
          name: d.name || '', siret: d.siret || '', tva_intra: d.tva_intra || '', address: d.address || '',
          postal_code: d.postal_code || '', city: d.city || '', phone: d.phone || '', email: d.email || '', logo_url: d.logo_url || '',
        });
        setSubStatus(d.subscription_status ?? null);
        setReminderOn(d.auto_reminder_enabled ?? true);
        setReminderHour(d.reminder_hour ?? 17);
        setBudgetAlertsOn(d.budget_alerts_enabled ?? true);
        setTravelPaid(d.travel_paid ?? false);
        setWeeklyHours(String(d.weekly_hours ?? 35));
        setAccountantEmail(d.accountant_email || '');
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

  // Ouvre le portail client Stripe (gérer / résilier l'abonnement, factures,
  // moyen de paiement) — page hébergée par Stripe, hors de l'app.
  const openPortal = async () => {
    setPortalBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} });
      if (error) throw new Error((data as { error?: string } | null)?.error || error.message);
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error((data as { error?: string } | null)?.error || "Impossible d'ouvrir la gestion de l'abonnement.");
      window.location.href = url;
    } catch (e) {
      setErr((e as Error)?.message || 'Réessayez dans un instant.');
      setPortalBusy(false);
    }
  };

  // Extrait le message d'erreur réel renvoyé par la fonction edge (le body JSON
  // {error:"..."} n'est pas exposé automatiquement par le client functions.invoke).
  const extractError = async (e: unknown, fallback: string): Promise<string> => {
    const err = e as { context?: Response; message?: string };
    if (err?.context && typeof err.context.json === 'function') {
      try { const body = await err.context.json(); if (body?.error) return String(body.error); } catch { /* body illisible */ }
    }
    return err?.message || fallback;
  };

  const sendDigestNow = async () => {
    setDigestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-digest', { body: {} });
      if (error) throw error;
      const result = (data as { result?: { sent?: number; skipped?: string } } | null)?.result;
      if (result?.skipped === 'no_admin') toast.error('Aucun admin actif pour recevoir le récap.');
      else if (result?.skipped === 'no_worker') toast.error('Aucun salarié actif — rien à récapituler.');
      else toast.success(`Récap envoyé (${result?.sent ?? 0} destinataire${(result?.sent ?? 0) > 1 ? 's' : ''}).`);
    } catch (e) {
      toast.error(await extractError(e, "Échec de l'envoi du récap."));
    } finally {
      setDigestBusy(false);
    }
  };

  const checkCertsNow = async () => {
    setCertBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('cert-expiry-alerts', { body: {} });
      if (error) throw error;
      const result = (data as { result?: { sent?: number; skipped?: string; urgent?: number; upcoming?: number } } | null)?.result;
      if (result?.skipped) toast.success('Rien à signaler pour le moment.');
      else toast.success(`Alerte envoyée (${result?.urgent ?? 0} urgente${(result?.urgent ?? 0) > 1 ? 's' : ''}, ${result?.upcoming ?? 0} à anticiper).`);
    } catch (e) {
      toast.error(await extractError(e, 'Échec de la vérification.'));
    } finally {
      setCertBusy(false);
    }
  };

  const save = async () => {
    // Vérifié ici AUSSI, pas seulement en base : une adresse fautive ferait
    // échouer l'envoi de la paie plus tard, loin de l'écran où on l'a tapée.
    const mail = accountantEmail.trim();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setErr("Adresse du comptable invalide.");
      return;
    }
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc('update_company_info', {
        p_name: f.name, p_siret: f.siret, p_tva_intra: f.tva_intra, p_address: f.address,
        p_postal_code: f.postal_code, p_city: f.city, p_phone: f.phone, p_email: f.email, p_logo_url: f.logo_url,
        p_auto_reminder_enabled: reminderOn, p_reminder_hour: reminderHour,
        p_budget_alerts_enabled: budgetAlertsOn,
        p_travel_paid: travelPaid,
        p_weekly_hours: Number(weeklyHours.replace(',', '.')) || 0,
        p_accountant_email: mail,
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

            {/* Abonnement — gestion/résiliation en self-service via le portail Stripe */}
            <div className="bt-set-sub">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Abonnement</label>
                <p className="bt-set-substate">
                  {subStatus === 'active' ? 'Abonnement actif — vous pouvez le gérer ou le résilier à tout moment.'
                    : subStatus === 'trialing' ? "Essai gratuit en cours — aucun abonnement à gérer pour l'instant."
                    : subStatus === 'canceled' ? 'Abonnement résilié.'
                    : 'Aucun abonnement actif.'}
                </p>
              </div>
              {(subStatus === 'active' || subStatus === 'canceled') && (
                <button type="button" className="bt-set-btn" onClick={openPortal} disabled={portalBusy}>
                  {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Gérer mon abonnement
                </button>
              )}
            </div>

            {/* Relance automatique : le salarié en retard est prévenu directement
                (notification, ou email s'il n'a pas activé les notifications) —
                le bureau n'a plus à courir après chacun. */}
            <div className="bt-set-sub bt-set-rem">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Relance automatique des heures</label>
                <p className="bt-set-substate">
                  Prévient chaque salarié qui a des journées planifiées non déclarées, tous les jours de la semaine.
                  Au maximum une relance tous les 2 jours, et 3 au total — ensuite on n&apos;insiste plus.
                </p>
              </div>
              <div className="bt-set-remctl">
                <label className="bt-set-switch">
                  <input type="checkbox" checked={reminderOn} onChange={(e) => setReminderOn(e.target.checked)} />
                  <span>{reminderOn ? 'Activée' : 'Désactivée'}</span>
                </label>
                <select
                  className="bt-set-hour"
                  value={reminderHour}
                  onChange={(e) => setReminderHour(parseInt(e.target.value, 10))}
                  disabled={!reminderOn}
                  aria-label="Heure d'envoi de la relance"
                >
                  {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Alertes de budget : main-d'œuvre uniquement, d'où le libellé
                explicite — comparer un budget total aux seules heures ne
                déclencherait jamais d'alerte. */}
            <div className="bt-set-sub bt-set-rem">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Alertes de budget chantier</label>
                <p className="bt-set-substate">
                  Prévient quand la <strong>main-d&apos;œuvre</strong> consommée atteint 70 %, 80 % puis 100 % du budget
                  saisi sur un chantier. Hors matériaux et sous-traitance.
                </p>
              </div>
              <div className="bt-set-remctl">
                <label className="bt-set-switch">
                  <input type="checkbox" checked={budgetAlertsOn} onChange={(e) => setBudgetAlertsOn(e.target.checked)} />
                  <span>{budgetAlertsOn ? 'Activées' : 'Désactivées'}</span>
                </label>
              </div>
            </div>

            {/* Horaire hebdomadaire de base — la seule référence qui décide
                ce qui est une heure supplémentaire. Calcul à la semaine. */}
            <div className="bt-set-sub">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Horaire hebdomadaire de base</label>
                <p className="bt-set-substate">
                  Au-delà de cet horaire, les heures d&apos;une semaine sont comptées comme <strong>supplémentaires</strong>.
                  Le calcul se fait à la semaine, du lundi au dimanche. Un salarié peut avoir son propre horaire, depuis sa fiche.
                </p>
              </div>
              <div className="bt-set-remctl">
                <label className="bt-set-switch" style={{ gap: 8 }}>
                  <input
                    type="number" min={0} max={80} step={0.5} inputMode="decimal"
                    className="bt-field" style={{ width: 88, textAlign: 'right' }}
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(e.target.value)}
                  />
                  <span>h / semaine</span>
                </label>
              </div>
            </div>

            {/* Trajet entre deux chantiers — le salarié dit si le trou était de
                la route ou une pause ; c'est ici qu'on décide si la route est
                payée. Rien n'est déduit ni ajouté en silence. */}
            <div className="bt-set-sub">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Temps de route entre deux chantiers</label>
                <p className="bt-set-substate">
                  Le salarié indique lui-même si le temps entre deux interventions était de la <strong>route</strong> ou une <strong>pause</strong>.
                  Ici, vous décidez si la route est payée. Les pauses ne sont jamais comptées.
                </p>
              </div>
              <div className="bt-set-remctl">
                <label className="bt-set-switch">
                  <input type="checkbox" checked={travelPaid} onChange={(e) => setTravelPaid(e.target.checked)} />
                  <span>{travelPaid ? 'Payée' : 'Non payée'}</span>
                </label>
              </div>
            </div>

            {/* Comptable — destinataire de l'export de paie. L'adresse vit ici,
                pas dans l'écran d'export : rien ne part vers une adresse tapée
                au moment de l'envoi, et le bureau garde la main dessus. */}
            <div className="bt-set-sub">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Adresse de votre comptable</label>
                <p className="bt-set-substate">
                  Depuis le planning, le bouton <strong>Envoyer au comptable</strong> expédie le tableur des heures
                  à cette adresse, <strong>en pièce jointe</strong>. Vous recevez une copie. Laissez vide pour désactiver l&apos;envoi.
                </p>
              </div>
              <div className="bt-set-remctl">
                <input
                  type="email" inputMode="email" autoComplete="off" placeholder="comptable@cabinet.fr"
                  className="bt-field" style={{ minWidth: 220 }}
                  value={accountantEmail}
                  onChange={(e) => setAccountantEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Notifications email — déclenchement manuel des mêmes fonctions que
                les crons (récap hebdo du vendredi, alertes habilitations). Utile
                pour tester sans attendre l'horaire planifié. */}
            <div className="bt-set-sub">
              <div className="bt-set-subtxt">
                <label className="bt-set-l">Notifications par email</label>
                <p className="bt-set-substate">Récap hebdo (vendredi) et alertes d&apos;habilitations (30 j / 7 j) — envoi automatique, ou à la demande ci-dessous.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="bt-set-btn" onClick={sendDigestNow} disabled={digestBusy}>
                  {digestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Envoyer le récap maintenant
                </button>
                <button type="button" className="bt-set-btn" onClick={checkCertsNow} disabled={certBusy}>
                  {certBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Vérifier les habilitations
                </button>
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
