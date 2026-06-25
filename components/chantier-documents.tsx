'use client';

// Panneau « Documents » d'un CHANTIER (worksite) — étape 2.
// Liste (photos en aperçu, fichiers en icône) + upload avec libellé + suppression.
// Réutilisable côté secrétaire (/admin) ET côté salarié (/poseur, étape 2b).
// Bucket PRIVÉ : on génère des URLs signées (1 h) pour l'aperçu/téléchargement.

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, Trash2, FileText, FolderOpen, Download } from 'lucide-react';
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
.bt-doc-name{display:block;font-size:14px;font-weight:800;color:#15120F;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-doc-name:hover{text-decoration:underline}
.bt-doc-sub{font-size:11.5px;color:#9a948a;font-weight:600;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-doc-act{flex:none;width:34px;height:34px;border-radius:9px;border:none;background:transparent;color:#6E6A63;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}
.bt-doc-act:hover{background:#F1E8D6;color:#15120F}
.bt-doc-act.danger:hover{background:#F4D9D1;color:#C0461F}
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
      <DialogContent className="bt-skin max-w-lg max-h-[88vh] overflow-y-auto">
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
