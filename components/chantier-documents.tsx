'use client';

// Panneau « Documents » d'un CHANTIER (worksite) — étape 12.
// Réutilisé côté bureau (/admin) ET côté salarié (/poseur).
// Bucket PRIVÉ : on génère des URLs signées (1 h) pour l'aperçu/téléchargement.
//
// CE QUI CHANGE À L'ÉTAPE 12
//
//   Deux boutons au lieu d'un. « Photo » ouvre l'appareil sur le téléphone ;
//   « Fichier » ouvre le sélecteur. Sur un chantier, prendre une photo et
//   joindre un devis ne sont pas le même geste, et les confondre derrière un
//   seul bouton faisait perdre du temps à celui qui a les mains sales.
//
//   Deux onglets. Les photos et les papiers ne se cherchent pas de la même
//   façon : on feuillette les unes, on cherche les autres par leur nom.
//
//   Un nom automatique. Personne ne tape de libellé sur un chantier. Une photo
//   reçoit « Photo 3 — 20/09/2026 », numéroté par la BASE ; un fichier garde le
//   nom que la personne a déjà choisi en l'enregistrant — le remplacer par
//   « Fichier 3 » perdrait l'information la plus utile, y compris dans l'e-mail
//   au client.
//
//   Le numéro vaut MAX + 1 et ne recule donc jamais après une suppression, et un
//   index unique par chantier et par journée interdit physiquement deux « Photo
//   3 ». Un simple comptage aurait produit des doublons ; l'heure d'ajout aussi,
//   dès que deux photos tombent dans la même minute.
//
//   Une pièce appartient à un JOUR, et à l'INTERVENTION quand elle a été prise
//   depuis une intervention ouverte. Les pièces déposées depuis la fiche
//   chantier n'ont pas de jour : elles sont rangées à part, sans qu'on leur
//   invente une date.

import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { DOC_CATEGORY_LABEL } from '@/supabase/functions/_shared/worker-assistant-core';
import { DOC_MAX_BYTES, uploadWorksiteDocument } from '@/lib/chantier-docs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FeuilleCorps, FeuilleTete } from '@/components/design/salarie/feuille';
import { InfoTip } from '@/components/ui/info-tip';
import { DocCategoryButton, DocumentCategorySheet, useDocCategoryReady } from '@/components/document-category';
import { canEditCategory, categoryText } from '@/supabase/functions/_shared/doc-categories';
import {
  Loader2, Trash2, FileText, FolderOpen, Download, Mail, Copy, Camera, Paperclip, Link2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
// Sa feuille de style est components/chantier-documents.css, importée au niveau des ROUTES qui l'affichent (app/poseur/layout.tsx, app/admin/layout.tsx) :
// un import ici ferait une feuille chargée à part avec chaque morceau différé (et alourdirait le chargeur de TOUTES les pages).

type Uploader = { first_name: string | null; last_name: string | null };
interface DocRow {
  id: string; label: string | null; file_path: string; file_name: string | null;
  /** Lot 7 : catégorie (posée par l'Assistant) — absente tant que la migration n'est pas là. */
  category?: string | null;
  mime_type: string | null; size_bytes: number | null; created_at: string;
  uploaded_by: string | null; uploader?: Uploader | Uploader[] | null;
  work_date: string | null; time_entry_id: string | null;
}
interface Props {
  worksiteId: string | null;
  worksiteName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Jour auquel rattacher les pièces ajoutées ici (ISO). Absent = pièce du chantier. */
  workDate?: string | null;
  /** Intervention d'où le panneau a été ouvert. La base revérifie la cohérence. */
  timeEntryId?: string | null;
  /** Design salarié (?ui=2) : feuille du bas. Jamais passée par le bureau. */
  feuille?: boolean;
}

const uploaderName = (d: DocRow) => {
  const u = Array.isArray(d.uploader) ? d.uploader[0] : d.uploader;
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
};

const isPhoto = (d: DocRow) => (d.mime_type || '').startsWith('image/');

/** Titre d'un groupe : une journée de chantier, ou les pièces sans jour. */
const dayTitle = (iso: string | null) =>
  iso ? format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr }) : 'Pièces du chantier (sans jour)';

type Tab = 'photos' | 'files';

export default function ChantierDocuments({
  worksiteId, worksiteName, open, onOpenChange, workDate = null, timeEntryId = null, feuille = false,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('photos');
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lot 24 : changer la catégorie après coup. Rien ne s'affiche tant que la migration manque.
  const office = user?.role === 'admin';
  // ?ui=2 : feuille du bas pour le salarié (le bureau garde sa fenêtre ; `feuille` n'est passée que par « Ma journée »).
  const ui2 = !!feuille && !office;
  const { ready: catReady, settled: catSettled } = useDocCategoryReady(open);
  const [catDoc, setCatDoc] = useState<DocRow | null>(null);
  const canCat = (d: DocRow) => catReady && canEditCategory({ office, userId: user?.id, uploadedBy: d.uploaded_by, current: d.category });

  // ── Envoi au client — salarié OU secrétaire, via sa propre messagerie ──
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchDocs = async () => {
    if (!worksiteId) return;
    setLoading(true);
    const cols = 'id,label,file_path,file_name,mime_type,size_bytes,created_at,uploaded_by,work_date,time_entry_id,uploader:users!uploaded_by(first_name,last_name)';
    const read = (withCategory: boolean) => supabase.from('documents')
      .select(withCategory ? `${cols},category` : cols)
      .eq('worksite_id', worksiteId)
      .order('work_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    // Avec la catégorie (lot 7) ; sans, si la colonne n'existe pas encore.
    let { data, error } = await read(true);
    if (error) ({ data } = await read(false));
    const rows = (data || []) as unknown as DocRow[];
    setDocs(rows);
    const paths = rows.map((r) => r.file_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('chantier-docs').createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (signed || []).forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    } else {
      setUrls({});
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && worksiteId) fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, worksiteId]);

  // E-mail du client + nom de l'entreprise (pour le message) — salarié comme secrétaire.
  useEffect(() => {
    if (!open || !worksiteId || !user?.company_id) return;
    const companyId = user.company_id;
    let cancelled = false;
    (async () => {
      const [{ data: ws }, { data: co }] = await Promise.all([
        supabase.from('worksites').select('client_email').eq('id', worksiteId).maybeSingle(),
        supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
      ]);
      if (cancelled) return;
      setClientEmail((ws?.client_email as string) || null);
      setCompanyName((co?.name as string) || '');
      setEditingEmail(false);
    })();
    return () => { cancelled = true; };
  }, [open, worksiteId, user?.company_id]);

  const saveClientEmail = async () => {
    const email = emailInput.trim();
    if (!email || !worksiteId) return;
    setSavingEmail(true);
    // RPC cloisonnée par entreprise : marche pour la secrétaire ET le salarié
    // (qui n'a pas le droit d'écrire directement dans worksites).
    const { error } = await supabase.rpc('set_worksite_client_email', { p_worksite_id: worksiteId, p_email: email });
    setSavingEmail(false);
    if (error) { toast.error("Impossible d'enregistrer l'e-mail."); return; }
    setClientEmail(email);
    setEditingEmail(false);
    toast.success('E-mail du client enregistré.');
  };

  // Construit le message (liens valables 7 jours) à envoyer au client.
  const buildMessage = async (): Promise<{ subject: string; body: string } | null> => {
    if (!worksiteId || docs.length === 0) { toast.error("Ajoutez d'abord un document."); return null; }
    const { data: signed } = await supabase.storage.from('chantier-docs').createSignedUrls(docs.map((d) => d.file_path), 60 * 60 * 24 * 7);
    const link: Record<string, string> = {};
    (signed || []).forEach((s) => { if (s.path && s.signedUrl) link[s.path] = s.signedUrl; });
    const lines = docs.map((d) => `- ${d.label || d.file_name || 'Document'} : ${link[d.file_path] || ''}`).join('\n');
    const chantier = worksiteName ? ` « ${worksiteName} »` : '';
    const sign = companyName ? `\n\nCordialement,\n${companyName}` : '';
    const subject = `Documents${chantier ? ` —${chantier}` : ''}`;
    const body = `Bonjour,\n\nVeuillez trouver les documents de votre chantier${chantier} :\n\n${lines}\n\n(Ces liens restent valables 7 jours.)${sign}`;
    return { subject, body };
  };

  const openMail = async () => {
    if (!clientEmail) { toast.error("Renseignez l'e-mail du client."); return; }
    setSending(true);
    const msg = await buildMessage();
    setSending(false);
    if (!msg) return;
    window.location.href = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`;
  };

  const copyMessage = async () => {
    setSending(true);
    const msg = await buildMessage();
    setSending(false);
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(`${clientEmail ? `À : ${clientEmail}\n` : ''}${msg.subject}\n\n${msg.body}`);
      toast.success('Message copié — collez-le dans votre e-mail.');
    } catch { toast.error('Copie impossible.'); }
  };

  const onPick = async (file: File | undefined) => {
    if (!file || !worksiteId || !user?.company_id || !user?.id) return;
    if (file.size > DOC_MAX_BYTES) { toast.error('Fichier trop lourd (15 Mo max).'); return; }
    setUploading(true);
    try {
      // Même geste que l'Assistant BEMEXO : lib/chantier-docs.ts.
      const { image } = await uploadWorksiteDocument({
        companyId: user.company_id, userId: user.id, worksiteId, file, workDate, timeEntryId,
      });
      setTab(image ? 'photos' : 'files');
      toast.success(image ? 'Photo ajoutée' : 'Fichier ajouté');
      await fetchDocs();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Échec de l'envoi du document.");
    } finally {
      setUploading(false);
      if (photoRef.current) photoRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const del = async (d: DocRow) => {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer « ${d.label || d.file_name || 'ce document'} » ?`)) return;
    try {
      // La ligne d'abord : si elle résiste (droits), le fichier doit rester,
      // sinon la pièce apparaîtrait dans la liste sans contenu derrière.
      const { data: gone, error } = await supabase.from('documents').delete().eq('id', d.id).select('id');
      if (error) throw error;
      if (!gone || gone.length === 0) { toast.error('Suppression refusée : cette pièce ne vous appartient pas.'); return; }
      setDocs((p) => p.filter((x) => x.id !== d.id));

      // Le stockage rend son échec dans `error`, il ne le LÈVE pas : sans ce
      // test, un refus passait inaperçu et le fichier restait dans le bucket
      // sans plus aucune ligne pour le désigner. Une seconde tentative suffit
      // dans le cas courant (coupure passagère) ; si elle échoue aussi, on le
      // dit au lieu de laisser croire que tout est propre.
      let rmErr = (await supabase.storage.from('chantier-docs').remove([d.file_path])).error;
      if (rmErr) rmErr = (await supabase.storage.from('chantier-docs').remove([d.file_path])).error;
      if (rmErr) {
        console.error('[documents] fichier non supprimé', d.file_path, rmErr);
        toast.warning("Pièce retirée de la liste, mais le fichier n'a pas pu être effacé du stockage.");
      }
    } catch {
      toast.error('Suppression impossible.');
    }
  };

  const photos = useMemo(() => docs.filter(isPhoto), [docs]);
  const files = useMemo(() => docs.filter((d) => !isPhoto(d)), [docs]);
  const shown = tab === 'photos' ? photos : files;

  // Regroupées par journée de chantier — l'ordre vient déjà du serveur.
  const byDay = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of shown) {
      const k = d.work_date || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return Array.from(m.entries());
  }, [shown]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent feuille={ui2} className={ui2 ? undefined : 'bt-skin max-w-lg max-h-[88vh] overflow-y-auto'}>
        <FeuilleTete ui2={ui2} kicker="DOCUMENTS" titre={
          <DialogTitle className={ui2 ? undefined : 'flex items-center gap-2'}>
            {!ui2 && <><FolderOpen className="h-5 w-5 shrink-0" /> </>}<span className="min-w-0">Documents{worksiteName ? ` — ${worksiteName}` : ''}</span>
          </DialogTitle>
        } />
        <FeuilleCorps ui2={ui2}>

        {/* Deux entrées distinctes : l'appareil photo d'un côté, le sélecteur de
            fichiers de l'autre. `capture` fait ouvrir directement la caméra sur
            un téléphone ; sur ordinateur il est ignoré et le sélecteur s'ouvre
            filtré sur les images, ce qui reste le bon comportement. */}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => onPick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" hidden
          onChange={(e) => onPick(e.target.files?.[0])} />

        <div className="bt-doc-addrow">
          <button type="button" className="bt-doc-addbtn" data-guide="docs.photo" onClick={() => photoRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Photo
          </button>
          <button type="button" className="bt-doc-addbtn ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip className="h-4 w-4" /> Fichier
          </button>
        </div>
        {/* Lot 11 : une ligne courte ; le reste dans l'ⓘ. */}
        <div className="bt-doc-hint">
          <span className="bt-doc-hint-t">
            {workDate
              ? <>Rattaché au <b>{format(parseISO(workDate), 'EEEE d MMMM', { locale: fr })}</b>{timeEntryId ? <> et à <b>cette intervention</b></> : null}.</>
              : <>Rattaché au chantier, sans jour précis.</>}
          </span>
          <InfoTip testId="doc-tip" label="Plus d’infos : pièces" text={<>15 Mo maximum par pièce. Une photo est nommée automatiquement (« Photo 3 — 20/09/2026 ») ; un fichier garde son nom.</>} />
        </div>

        <div className="bt-doc-tabs">
          <button className={`bt-doc-tab${tab === 'photos' ? ' on' : ''}`} onClick={() => setTab('photos')}>
            <Camera className="h-4 w-4" /> Photos <span className="bt-doc-tabn">{photos.length}</span>
          </button>
          <button className={`bt-doc-tab${tab === 'files' ? ' on' : ''}`} onClick={() => setTab('files')}>
            <Paperclip className="h-4 w-4" /> Fichiers <span className="bt-doc-tabn">{files.length}</span>
          </button>
        </div>

        {loading || !catSettled ? (
          <div className="bt-doc-empty">Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="bt-doc-empty">
            {tab === 'photos'
              ? 'Aucune photo pour ce chantier. Le bouton Photo ouvre directement l’appareil.'
              : 'Aucun fichier pour ce chantier (devis, plan, PV de réception…).'}
          </div>
        ) : (
          byDay.map(([day, items]) => (
            <div key={day || 'sans-jour'}>
              <div className="bt-doc-day">{dayTitle(day || null)}</div>
              <div className="bt-doc-list">
                {items.map((d) => {
                  const url = urls[d.file_path];
                  const img = isPhoto(d);
                  const who = uploaderName(d);
                  const here = !!timeEntryId && d.time_entry_id === timeEntryId;
                  return (
                    <div key={d.id} className={`bt-doc-row${here ? ' here' : ''}`}>
                      <a className="bt-doc-thumb" href={url} target="_blank" rel="noopener noreferrer">
                        {img && url ? <img src={url} alt="" /> : <FileText className="h-5 w-5" />}
                      </a>
                      <div className="bt-doc-meta">
                        <a className="bt-doc-name" href={url} target="_blank" rel="noopener noreferrer">{d.label || d.file_name || 'Document'}</a>
                        {!canCat(d) && d.category && d.category !== 'photo' && (
                          <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: d.category === 'facture_payee' ? '#E3F5EA' : '#FFF2CC', color: '#15120F' }}>
                            {DOC_CATEGORY_LABEL[d.category] ?? d.category}
                          </span>
                        )}
                        {/* Date + HEURE (horodatage serveur) : sur un chantier, savoir qu'une
                            photo a été prise à 8h12 ou à 17h45 change tout pour une réserve. */}
                        <div className="bt-doc-sub">
                          {here && <span className="bt-doc-here"><Link2 className="h-3 w-3" /> cette intervention · </span>}
                          {who ? `${who} · ` : ''}
                          {new Date(d.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {canCat(d) && (
                          <DocCategoryButton label={categoryText(d.category)} current={d.category} docName={d.label || d.file_name || 'Document'} onClick={() => setCatDoc(d)} />
                        )}
                      </div>
                      {url && (
                        <a className="bt-doc-act" href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir / télécharger"><Download className="h-4 w-4" /></a>
                      )}
                      <button type="button" className="bt-doc-act danger" onClick={() => del(d)} title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="bt-doc-send">
          <div className="bt-doc-send-h"><Mail className="h-4 w-4" /> Envoyer au client</div>
          {clientEmail && !editingEmail && (
            <div className="bt-doc-send-to">
              <span className="bt-doc-send-mail" title={clientEmail}>{clientEmail}</span>
              <button type="button" className="bt-doc-send-edit" onClick={() => { setEmailInput(clientEmail); setEditingEmail(true); }}>modifier</button>
            </div>
          )}
          {(!clientEmail || editingEmail) && (
            <div className="bt-doc-send-row">
              <input className="bt-doc-send-input" type="email" inputMode="email" placeholder="E-mail du client" data-guide="bureau-docs.email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
              <button type="button" className="bt-doc-send-save" onClick={saveClientEmail} disabled={savingEmail || !emailInput.trim()}>
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
              </button>
            </div>
          )}
          <div className="bt-doc-send-actions">
            <button type="button" className="bt-doc-send-btn" data-guide="docs.envoyer" onClick={openMail} disabled={sending || !clientEmail || docs.length === 0}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Ouvrir l&apos;e-mail
            </button>
            <button type="button" className="bt-doc-send-btn ghost" onClick={copyMessage} disabled={sending || docs.length === 0}>
              <Copy className="h-4 w-4" /> Copier
            </button>
          </div>
          {/* Le message reprend TOUTES les pièces du chantier, pas seulement
              l'onglet affiché : le client attend son dossier, pas un onglet. */}
          {docs.length === 0
            ? <div className="bt-doc-send-note">Ajoutez au moins un document à envoyer.</div>
            : <div className="bt-doc-send-note">Le message reprendra les {docs.length} pièces du chantier, photos et fichiers.</div>}
        </div>
        <DocumentCategorySheet doc={catDoc} office={office} onClose={() => setCatDoc(null)}
          onChanged={(id, cat) => setDocs((p) => p.map((x) => (x.id === id ? { ...x, category: cat } : x)))}
          onGone={() => { void fetchDocs(); }} />
        </FeuilleCorps>
      </DialogContent>
    </Dialog>
  );
}

