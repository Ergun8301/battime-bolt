'use client';

// Panneau « Documents » d'un CHANTIER (worksite) — étape 2.
// Liste (photos en aperçu, fichiers en icône) + upload avec libellé + suppression.
// Réutilisable côté secrétaire (/admin) ET côté salarié (/poseur, étape 2b).
// Bucket PRIVÉ : on génère des URLs signées (1 h) pour l'aperçu/téléchargement.

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, Trash2, FileText, FolderOpen, Download, Mail, Copy } from 'lucide-react';
import { toast } from 'sonner';

type Uploader = { first_name: string | null; last_name: string | null };
interface DocRow {
  id: string; label: string | null; file_path: string; file_name: string | null;
  mime_type: string | null; size_bytes: number | null; created_at: string;
  uploaded_by: string | null; uploader?: Uploader | Uploader[] | null;
}
interface Props { worksiteId: string | null; worksiteName?: string; open: boolean; onOpenChange: (o: boolean) => void; }

const DOC_CSS = `
.bt-doc-addbtn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#FFC21A;color:#15120F;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 #C99300;transition:transform .12s ease,box-shadow .12s ease;margin-top:2px}
.bt-doc-addbtn:hover{transform:translateY(-1px);box-shadow:0 5px 0 #C99300}
.bt-doc-addbtn:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
.bt-doc-addbtn:disabled{opacity:.65;transform:none;box-shadow:0 4px 0 #C99300}
.bt-doc-hint{font-size:11.5px;color:#9a948a;font-weight:600;margin:8px 2px 2px}
.bt-doc-empty{padding:22px 10px;text-align:center;color:#9a948a;font-weight:600;font-size:13px}
.bt-doc-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.bt-doc-row{display:flex;align-items:center;gap:11px;padding:8px;border:1px solid rgba(21,18,15,.1);border-radius:12px;background:#fff}
.bt-doc-thumb{width:44px;height:44px;border-radius:10px;flex:none;background:#FBF6EA;border:1px solid rgba(21,18,15,.08);display:flex;align-items:center;justify-content:center;overflow:hidden;color:#15120F}
.bt-doc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.bt-doc-meta{flex:1;min-width:0}
.bt-doc-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:800;color:#15120F;text-decoration:none;overflow-wrap:anywhere;line-height:1.25}
.bt-doc-name:hover{text-decoration:underline}
.bt-doc-sub{font-size:11.5px;color:#9a948a;font-weight:600;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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

export default function ChantierDocuments({ worksiteId, worksiteName, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Envoi au client (étape 4) — secrétaire uniquement, via sa propre messagerie ──
  const isAdmin = user?.role === 'admin';
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
      .select('id,label,file_path,file_name,mime_type,size_bytes,created_at,uploaded_by,uploader:users!uploaded_by(first_name,last_name)')
      .eq('worksite_id', worksiteId).order('created_at', { ascending: false });
    const rows = (data || []) as DocRow[];
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

  // E-mail du client + nom de l'entreprise (pour le message), côté secrétaire.
  useEffect(() => {
    if (!open || !worksiteId || !isAdmin || !user?.company_id) return;
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
  }, [open, worksiteId, isAdmin, user?.company_id]);

  const saveClientEmail = async () => {
    const email = emailInput.trim();
    if (!email || !worksiteId) return;
    setSavingEmail(true);
    const { error } = await supabase.from('worksites').update({ client_email: email }).eq('id', worksiteId);
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

  const onPick = async (file?: File) => {
    if (!file || !worksiteId || !user?.company_id || !user?.id) return;
    if (file.size > 15 * 1024 * 1024) { toast.error('Fichier trop lourd (15 Mo max).'); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const path = `${user.company_id}/${worksiteId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('chantier-docs').upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('documents').insert({
        company_id: user.company_id, worksite_id: worksiteId, uploaded_by: user.id,
        label: null, file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success('Document ajouté');
      await fetchDocs();
    } catch {
      toast.error("Échec de l'envoi du document.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const del = async (d: DocRow) => {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer « ${d.label || d.file_name || 'ce document'} » ?`)) return;
    try {
      await supabase.storage.from('chantier-docs').remove([d.file_path]);
      const { error } = await supabase.from('documents').delete().eq('id', d.id);
      if (error) throw error;
      setDocs((p) => p.filter((x) => x.id !== d.id));
    } catch {
      toast.error('Suppression impossible.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Documents{worksiteName ? ` — ${worksiteName}` : ''}
          </DialogTitle>
        </DialogHeader>
        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />

        <input ref={fileRef} type="file" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <button type="button" className="bt-doc-addbtn" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Ajouter un document
        </button>
        <div className="bt-doc-hint">Photos, PDF, fichiers… 15 Mo max.</div>

        {isAdmin && (
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
            {docs.length === 0 && <div className="bt-doc-send-note">Ajoutez au moins un document à envoyer.</div>}
          </div>
        )}

        {loading ? (
          <div className="bt-doc-empty">Chargement…</div>
        ) : docs.length === 0 ? (
          <div className="bt-doc-empty">Aucun document pour ce chantier.</div>
        ) : (
          <div className="bt-doc-list">
            {docs.map((d) => {
              const url = urls[d.file_path];
              const isImg = (d.mime_type || '').startsWith('image/');
              const who = uploaderName(d);
              return (
                <div key={d.id} className="bt-doc-row">
                  <a className="bt-doc-thumb" href={url} target="_blank" rel="noopener noreferrer">
                    {isImg && url ? <img src={url} alt="" /> : <FileText className="h-5 w-5" />}
                  </a>
                  <div className="bt-doc-meta">
                    <a className="bt-doc-name" href={url} target="_blank" rel="noopener noreferrer">{d.label || d.file_name || 'Document'}</a>
                    <div className="bt-doc-sub">{who ? `${who} · ` : ''}{new Date(d.created_at).toLocaleDateString('fr-FR')}</div>
                  </div>
                  {url && (
                    <a className="bt-doc-act" href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir / télécharger"><Download className="h-4 w-4" /></a>
                  )}
                  <button type="button" className="bt-doc-act danger" onClick={() => del(d)} title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
