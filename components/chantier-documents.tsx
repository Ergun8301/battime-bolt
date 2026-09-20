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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, Trash2, FileText, FolderOpen, Download, Mail, Copy, Camera, Paperclip, Link2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

type Uploader = { first_name: string | null; last_name: string | null };
interface DocRow {
  id: string; label: string | null; file_path: string; file_name: string | null;
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
}

const DOC_CSS = `
.bt-doc-addrow{display:flex;gap:8px;margin-top:2px}
.bt-doc-addbtn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#FFC21A;color:#15120F;border:none;border-radius:12px;padding:12px 8px;font-weight:900;font-size:14.5px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 #C99300;transition:transform .12s ease,box-shadow .12s ease}
.bt-doc-addbtn.ghost{background:#fff;color:#15120F;border:1.5px solid #15120F;box-shadow:0 4px 0 rgba(21,18,15,.22)}
.bt-doc-addbtn:hover{transform:translateY(-1px)}
.bt-doc-addbtn:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
.bt-doc-addbtn.ghost:active{box-shadow:0 1px 0 rgba(21,18,15,.22)}
.bt-doc-addbtn:disabled{opacity:.65;transform:none}
.bt-doc-hint{font-size:11.5px;color:#9a948a;font-weight:600;margin:8px 2px 2px}
.bt-doc-hint b{color:#6E6A63}
.bt-doc-tabs{display:flex;gap:7px;margin-top:11px}
.bt-doc-tab{flex:1;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:11px;padding:9px 8px;font-family:inherit;font-weight:800;font-size:13px;color:#6E6A63;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.bt-doc-tab.on{background:#15120F;border-color:#15120F;color:#F2EDE3}
.bt-doc-tabn{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:800;background:rgba(21,18,15,.08);border-radius:99px;padding:1px 7px}
.bt-doc-tab.on .bt-doc-tabn{background:rgba(255,194,26,.9);color:#15120F}
.bt-doc-day{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#9a948a;font-weight:700;margin:13px 2px 5px;display:flex;align-items:center;gap:8px}
.bt-doc-day::after{content:'';flex:1;height:1px;background:rgba(21,18,15,.09)}
.bt-doc-empty{padding:22px 10px;text-align:center;color:#9a948a;font-weight:600;font-size:13px;line-height:1.5}
.bt-doc-list{display:flex;flex-direction:column;gap:8px}
.bt-doc-row{display:flex;align-items:center;gap:11px;padding:8px;border:1px solid rgba(21,18,15,.1);border-radius:12px;background:#fff}
.bt-doc-row.here{border-color:rgba(255,194,26,.75);background:#FFFDF6}
.bt-doc-thumb{width:44px;height:44px;border-radius:10px;flex:none;background:#FBF6EA;border:1px solid rgba(21,18,15,.08);display:flex;align-items:center;justify-content:center;overflow:hidden;color:#15120F}
.bt-doc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.bt-doc-meta{flex:1;min-width:0}
.bt-doc-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:800;color:#15120F;text-decoration:none;overflow-wrap:anywhere;line-height:1.25}
.bt-doc-name:hover{text-decoration:underline}
.bt-doc-sub{font-size:11.5px;color:#9a948a;font-weight:600;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-doc-here{display:inline-flex;align-items:center;gap:3px;color:#a87c1e;font-weight:800}
.bt-doc-act{flex:none;width:34px;height:34px;border-radius:9px;border:none;background:transparent;color:#6E6A63;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}
.bt-doc-act:hover{background:#F1E8D6;color:#15120F}
.bt-doc-act.danger:hover{background:#F4D9D1;color:#C0461F}
.bt-doc-send{margin-top:12px;padding:12px;border:1px solid rgba(21,18,15,.12);border-radius:13px;background:#FBF7EF}
.bt-doc-send-h{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:900;color:#15120F;margin-bottom:8px}
.bt-doc-send-to{font-size:12.5px;font-weight:700;color:#15120F;margin-bottom:9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bt-doc-send-edit{border:none;background:transparent;color:#a87c1e;font-weight:800;font-size:11.5px;cursor:pointer;text-decoration:underline;font-family:inherit;padding:0}
.bt-doc-send-row{display:flex;gap:7px;margin-bottom:9px}
.bt-doc-send-input{flex:1;min-width:0;font-family:inherit;font-size:14px;padding:9px 11px;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;background:#fff;outline:none;color:#15120F}
.bt-doc-send-input:focus{border-color:#15120F}
.bt-doc-send-save{flex:none;border:none;background:#15120F;color:#F2EDE3;border-radius:10px;padding:0 15px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center}
.bt-doc-send-save:disabled{opacity:.6}
.bt-doc-send-actions{display:flex;gap:8px}
.bt-doc-send-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid #15120F;background:#15120F;color:#F2EDE3;border-radius:11px;padding:11px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit}
.bt-doc-send-btn.ghost{background:#fff;color:#15120F}
.bt-doc-send-btn:disabled{opacity:.5;cursor:default}
.bt-doc-send-note{font-size:11.5px;color:#9a948a;font-weight:600;margin-top:8px}
`;

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
  worksiteId, worksiteName, open, onOpenChange, workDate = null, timeEntryId = null,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('photos');
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const { data } = await supabase.from('documents')
      .select('id,label,file_path,file_name,mime_type,size_bytes,created_at,uploaded_by,work_date,time_entry_id,uploader:users!uploaded_by(first_name,last_name)')
      .eq('worksite_id', worksiteId)
      .order('work_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
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
    if (file.size > 15 * 1024 * 1024) { toast.error('Fichier trop lourd (15 Mo max).'); return; }
    // Le classement suit le TYPE du fichier, jamais le bouton cliqué. Une image
    // choisie via « Fichier » est rangée dans Photos par la liste ; basculer sur
    // l'onglet Fichiers la ferait disparaître sous les yeux de la personne qui
    // vient de l'envoyer.
    const image = (file.type || '').startsWith('image/');
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const path = `${user.company_id}/${worksiteId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('chantier-docs').upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('documents').insert({
        company_id: user.company_id, worksite_id: worksiteId, uploaded_by: user.id,
        // Nom : celui du fichier pour un document choisi, RIEN pour une photo —
        // la base le compose alors elle-même, à son heure à elle.
        label: image ? null : file.name,
        file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
        // Le jour et l'intervention : la base revérifie et rectifie la date
        // d'après l'intervention, elle ne fait pas confiance au navigateur.
        work_date: workDate, time_entry_id: timeEntryId,
      });
      if (insErr) {
        // Le fichier est déjà dans le bucket : sans ce nettoyage, il y resterait
        // sans aucune ligne pour le retrouver ni le supprimer.
        await supabase.storage.from('chantier-docs').remove([path]);
        throw insErr;
      }
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
      <DialogContent className="bt-skin max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Documents{worksiteName ? ` — ${worksiteName}` : ''}
          </DialogTitle>
        </DialogHeader>
        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />

        {/* Deux entrées distinctes : l'appareil photo d'un côté, le sélecteur de
            fichiers de l'autre. `capture` fait ouvrir directement la caméra sur
            un téléphone ; sur ordinateur il est ignoré et le sélecteur s'ouvre
            filtré sur les images, ce qui reste le bon comportement. */}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => onPick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" hidden
          onChange={(e) => onPick(e.target.files?.[0])} />

        <div className="bt-doc-addrow">
          <button type="button" className="bt-doc-addbtn" onClick={() => photoRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Photo
          </button>
          <button type="button" className="bt-doc-addbtn ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip className="h-4 w-4" /> Fichier
          </button>
        </div>
        <div className="bt-doc-hint">
          15 Mo max. Le nom est automatique.{' '}
          {workDate
            ? <>Rattaché au <b>{format(parseISO(workDate), 'EEEE d MMMM', { locale: fr })}</b>{timeEntryId ? <> et à <b>cette intervention</b></> : null}.</>
            : <>Rattaché au chantier, sans jour précis.</>}
        </div>

        <div className="bt-doc-tabs">
          <button className={`bt-doc-tab${tab === 'photos' ? ' on' : ''}`} onClick={() => setTab('photos')}>
            <Camera className="h-4 w-4" /> Photos <span className="bt-doc-tabn">{photos.length}</span>
          </button>
          <button className={`bt-doc-tab${tab === 'files' ? ' on' : ''}`} onClick={() => setTab('files')}>
            <Paperclip className="h-4 w-4" /> Fichiers <span className="bt-doc-tabn">{files.length}</span>
          </button>
        </div>

        {loading ? (
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
                        {/* Date + HEURE (horodatage serveur) : sur un chantier, savoir qu'une
                            photo a été prise à 8h12 ou à 17h45 change tout pour une réserve. */}
                        <div className="bt-doc-sub">
                          {here && <span className="bt-doc-here"><Link2 className="h-3 w-3" /> cette intervention · </span>}
                          {who ? `${who} · ` : ''}
                          {new Date(d.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
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
              {clientEmail}
              <button type="button" className="bt-doc-send-edit" onClick={() => { setEmailInput(clientEmail); setEditingEmail(true); }}>modifier</button>
            </div>
          )}
          {(!clientEmail || editingEmail) && (
            <div className="bt-doc-send-row">
              <input className="bt-doc-send-input" type="email" inputMode="email" placeholder="E-mail du client" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
              <button type="button" className="bt-doc-send-save" onClick={saveClientEmail} disabled={savingEmail || !emailInput.trim()}>
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'OK'}
              </button>
            </div>
          )}
          <div className="bt-doc-send-actions">
            <button type="button" className="bt-doc-send-btn" onClick={openMail} disabled={sending || !clientEmail || docs.length === 0}>
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
      </DialogContent>
    </Dialog>
  );
}
