'use client';

// Formations (lot 6, oct. 2026) — côté BUREAU : la fenêtre « Formations »,
// ouverte depuis « Salariés » (et le menu du téléphone). Aucun bouton de barre.
//  - « + Ajouter » : un titre, puis un lien YouTube / Vimeo / Google Drive OU un
//    document déjà téléversé dans « Documents » d'un chantier ; pour toute
//    l'équipe ou certains salariés. Notification aux destinataires (jamais
//    d'e-mail). Pas de modification en V1 : on retire, on remet.
//  - la liste : « x/y vues » ; un clic montre qui l'a vue (✓ date) et qui pas
//    encore ; « Ouvrir ↗ » (nouvel onglet) ; « Retirer » (les « Vue » restent).
// Les écritures sont dans lib/trainings.ts. Jamais d'iframe, aucune vidéo hébergée.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CirclePlay, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { User } from '@/lib/types';
import {
  createTraining, fetchOfficeTrainings, fetchPickableDocuments, notifyTraining, setTrainingArchived, signTrainingDocs,
  type OfficeTraining, type PickableDoc,
} from '@/lib/trainings';
import {
  checkTrainingTitle, parseTrainingLink, PROVIDER_LABEL, providerOf, safeTrainingUrl, seenSummary, TRAINING_TITLE_MAX, TRAINING_URL_MAX, type ViewRow,
} from '@/supabase/functions/_shared/trainings';

const CSS = `
.bt-fo{display:flex;flex-direction:column;gap:12px;font-size:13px;color:#15120F;min-width:0}
.bt-fo-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bt-fo-muted{font-size:12px;color:#6E6A63;font-weight:600;line-height:1.35}
.bt-fo-err{font-size:12.5px;font-weight:700;color:#C0461F}
.bt-fo-ok{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:#E3F5EA;color:#15120F;font-size:11.5px;font-weight:800}
.bt-fo-btn{height:32px;padding:0 12px;border-radius:9px;border:0;background:#15120F;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;flex:none}
.bt-fo-btn:disabled{opacity:.5;cursor:default}
.bt-fo-btn.ghost{background:#fff;color:#15120F;border:1.5px solid rgba(21,18,15,.2)}
.bt-fo-btn.danger{background:#fff;color:#C0461F;border:1.5px solid rgba(192,70,31,.45)}
.bt-fo-btn.sm{height:28px;padding:0 10px;font-size:12px}
.bt-fo-btn:focus-visible,.bt-fo-pill:focus-visible,.bt-fo-head:focus-visible,.bt-fo-link:focus-visible,.bt-fo-open:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
.bt-fo-form{display:flex;flex-direction:column;gap:10px;border:1px solid rgba(21,18,15,.14);border-radius:12px;padding:12px;background:#FBF8F2}
.bt-fo-lbl{display:block;font-size:12px;font-weight:800;color:#15120F;margin-bottom:4px}
.bt-fo-input,.bt-fo-select{width:100%;height:34px;border-radius:9px;border:1.5px solid rgba(21,18,15,.18);background:#fff;font:inherit;font-size:13px;font-weight:600;color:#15120F;padding:0 10px;outline:none;min-width:0}
.bt-fo-input:focus,.bt-fo-select:focus{border-color:#15120F}
.bt-fo-pills{display:flex;flex-wrap:wrap;gap:5px}
.bt-fo-pill{height:26px;padding:0 10px;border-radius:999px;border:1.5px solid rgba(21,18,15,.16);background:#fff;font:inherit;font-size:12px;font-weight:700;color:#15120F;cursor:pointer;white-space:nowrap}
.bt-fo-pill[aria-pressed="true"]{border-color:#15120F;box-shadow:inset 0 0 0 1px #15120F;background:#FFF6D9}
.bt-fo-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;min-height:22px}
.bt-fo-people{max-height:160px;overflow:auto;border:1px solid rgba(21,18,15,.12);border-radius:9px;padding:4px 8px;display:grid;grid-template-columns:1fr;gap:0 10px;background:#fff}
@media (min-width:640px){.bt-fo-people{grid-template-columns:1fr 1fr}}
.bt-fo-chk{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;font-weight:600;color:#15120F;cursor:pointer;min-width:0}
.bt-fo-chk span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-fo-chk input{width:15px;height:15px;accent-color:#15120F;flex:none}
.bt-fo-foot{display:flex;justify-content:flex-end;gap:6px}
.bt-fo-list{display:flex;flex-direction:column;border:1px solid rgba(21,18,15,.12);border-radius:12px;overflow:hidden;background:#fff}
.bt-fo-item{border-top:1px solid rgba(21,18,15,.08)}
.bt-fo-item:first-child{border-top:0}
.bt-fo-item.archived{background:#F7F4EC;color:#6E6A63}
.bt-fo-head{width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;background:none;border:0;text-align:left;font:inherit;color:inherit;cursor:pointer;min-width:0}
.bt-fo-ic{flex:none;width:26px;height:26px;border-radius:7px;background:#F2EDE3;display:flex;align-items:center;justify-content:center}
.bt-fo-main{flex:1;min-width:0}
.bt-fo-t,.bt-fo-s{display:block}
.bt-fo-t{font-size:13.5px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
.bt-fo-s{font-size:11.5px;font-weight:600;color:#6E6A63;margin-top:1px;overflow-wrap:anywhere}
.bt-fo-count{flex:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;background:#F2EDE3;white-space:nowrap}
.bt-fo-count.all{background:#E3F5EA}
.bt-fo-gone{display:inline-block;margin-left:6px;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:999px;background:#FDE8E1;color:#9A3412;vertical-align:1px}
.bt-fo-detail{padding:2px 10px 10px 45px;display:flex;flex-direction:column;gap:8px}
.bt-fo-who{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.bt-fo-who li{display:flex;gap:6px;font-size:12.5px;font-weight:600;min-width:0}
.bt-fo-who li .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-fo-who li .d{flex:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#3a352f}
.bt-fo-who li.no{color:#8a8378}
.bt-fo-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bt-fo-open{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:8px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font-size:12px;font-weight:800;color:#15120F;text-decoration:none;white-space:nowrap}
.bt-fo-confirm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;font-weight:700}
.bt-fo-link{background:none;border:0;padding:0;font:inherit;font-size:12px;font-weight:700;color:#6E6A63;text-decoration:underline;cursor:pointer;align-self:flex-start}
`;
const CSS_HTML = { __html: CSS };

type Kind = 'video' | 'document';
const ddmm = (iso: string) => { try { return format(parseISO(iso), 'dd/MM'); } catch { return ''; } };
const ddmmhhmm = (iso: string) => { try { return format(parseISO(iso), 'dd/MM HH:mm'); } catch { return ''; } };
const docName = (d: { label?: string | null; file_name?: string | null } | null | undefined) => (d?.label || '').trim() || d?.file_name || 'Document';

export default function TrainingsAdmin({ open, onOpenChange, companyId, companyName, workers }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  companyName: string;
  /** Salariés et chefs d'équipe ACTIFS (jamais les salariés de démonstration). */
  workers: User[];
}) {
  // Jamais un salarié de démonstration (« demo-… », aperçu) : ce ne sont pas des comptes.
  const team = useMemo(() => workers.filter((w) => !!w.id && !w.id.startsWith('demo-') && (w.role === 'worker' || w.role === 'lead') && w.is_active !== false), [workers]);
  const [list, setList] = useState<{ trainings: OfficeTraining[]; views: ViewRow[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Le formulaire.
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('video');
  const [link, setLink] = useState('');
  const [docs, setDocs] = useState<PickableDoc[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docId, setDocId] = useState('');
  const [allTeam, setAllTeam] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchOfficeTrainings(companyId);
    if (!r.ok) { setLoadError(r.message); return; }
    setLoadError(null);
    setList({ trainings: r.trainings, views: r.views });
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const resetForm = useCallback(() => {
    setAdding(false); setTitle(''); setKind('video'); setLink(''); setDocId(''); setAllTeam(true); setPicked([]); setQuery(''); setFormError(null);
  }, []);
  useEffect(() => { if (!open) { resetForm(); setDocs(null); setExpanded(null); setConfirmId(null); setShowArchived(false); } }, [open, resetForm]);

  // Les documents ne sont lus qu'au premier choix de « Document ».
  useEffect(() => {
    if (!open || kind !== 'document' || docs !== null || docsLoading) return;
    setDocsLoading(true);
    fetchPickableDocuments(companyId).then((d) => { setDocs(d || []); setDocsLoading(false); });
  }, [open, kind, docs, docsLoading, companyId]);

  const linkCheck = useMemo(() => (link.trim() ? parseTrainingLink(link) : null), [link]);
  const titleCheck = checkTrainingTitle(title);
  const valid = titleCheck.ok && (kind === 'video' ? !!linkCheck?.ok : !!docId) && (allTeam || picked.length > 0);

  const docGroups = useMemo(() => {
    const groups = new Map<string, { name: string; docs: PickableDoc[] }>();
    for (const d of docs || []) {
      const g = groups.get(d.worksite_id) || { name: d.worksite?.client_name || 'Chantier', docs: [] };
      g.docs.push(d);
      groups.set(d.worksite_id, g);
    }
    return Array.from(groups.entries());
  }, [docs]);

  const peopleShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? team.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(q)) : team;
  }, [team, query]);

  const save = async () => {
    if (!valid || saving || !titleCheck.ok) return;
    setSaving(true); setFormError(null);
    try {
      const videoUrl = kind === 'video' && linkCheck?.ok ? linkCheck.url : null;
      const ids = allTeam ? [] : picked.filter((id) => team.some((w) => w.id === id));
      const r = await createTraining({ companyId, title: titleCheck.title, kind, videoUrl, documentId: kind === 'document' ? docId : null, allTeam, assigneeIds: ids });
      if (!r.ok || !r.id) { setFormError(r.message || 'Impossible d’ajouter la formation.'); return; }
      // Notification aux destinataires (bonus, jamais bloquant, jamais d'e-mail).
      const push = await notifyTraining({ userIds: allTeam ? team.map((w) => w.id) : ids, companyName, title: titleCheck.title, trainingId: r.id });
      toast.success(`Formation ajoutée${push.sent > 0 ? ` · ${push.sent} appareil${push.sent > 1 ? 's' : ''} prévenu${push.sent > 1 ? 's' : ''}` : ''}`);
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const expand = async (t: OfficeTraining) => {
    setConfirmId(null);
    if (expanded === t.id) { setExpanded(null); return; }
    setExpanded(t.id);
    const p = t.document?.file_path;
    if (t.kind === 'document' && p && !docUrls[p]) {
      const urls = await signTrainingDocs(companyId, [p]);
      if (urls[p]) setDocUrls((prev) => ({ ...prev, [p]: urls[p] }));
    }
  };

  const archive = async (t: OfficeTraining, on: boolean) => {
    if (busyId) return;
    setBusyId(t.id);
    try {
      const r = await setTrainingArchived(t.id, on);
      if (!r.ok) { toast.error(r.message || 'Impossible d’enregistrer.'); return; }
      toast.success(on ? 'Formation retirée' : 'Formation remise');
      setConfirmId(null); setExpanded(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const active = (list?.trainings || []).filter((t) => !t.archived_at);
  const archived = (list?.trainings || []).filter((t) => !!t.archived_at);

  const row = (t: OfficeTraining) => {
    const sum = seenSummary(t, team, list?.views || []);
    const isDoc = t.kind === 'document';
    const prov = providerOf(t.video_url);
    const what = isDoc ? (t.document ? `Document · ${docName(t.document)}` : 'Document') : prov ? PROVIDER_LABEL[prov] : 'Vidéo';
    const who = t.all_team ? 'Toute l’équipe' : `${sum.total} salarié${sum.total > 1 ? 's' : ''}`;
    const gone = isDoc && !t.document_id;
    const href = isDoc ? (t.document?.file_path ? docUrls[t.document.file_path] || null : null) : safeTrainingUrl(t.video_url);
    const isOpen = expanded === t.id;
    return (
      <div key={t.id} className={`bt-fo-item${t.archived_at ? ' archived' : ''}`} data-testid={t.archived_at ? 'tr-archived-item' : 'tr-item'}>
        <button type="button" className="bt-fo-head" aria-expanded={isOpen} onClick={() => expand(t)} data-testid="tr-head">
          <span className="bt-fo-ic" aria-hidden="true">{isDoc ? <FileText className="h-3.5 w-3.5" /> : <CirclePlay className="h-3.5 w-3.5" />}</span>
          <span className="bt-fo-main">
            <span className="bt-fo-t" data-testid="tr-title-text">{t.title}{gone && <span className="bt-fo-gone" data-testid="tr-doc-gone">document retiré</span>}</span>
            <span className="bt-fo-s">{what} · {who} · {ddmm(t.created_at)}</span>
          </span>
          {!t.archived_at && (
            <span className={`bt-fo-count${sum.total > 0 && sum.seen === sum.total ? ' all' : ''}`} data-testid="tr-count">{sum.seen}/{sum.total} vue{sum.seen > 1 ? 's' : ''}</span>
          )}
        </button>
        {isOpen && (
          <div className="bt-fo-detail" data-testid="tr-detail">
            {sum.rows.length === 0 ? (
              <p className="bt-fo-muted">Personne dans l’équipe pour cette formation.</p>
            ) : (
              <ul className="bt-fo-who" data-testid="tr-who">
                {sum.rows.map((r) => (
                  <li key={r.person.id} className={r.seen_at ? 'yes' : 'no'} data-testid="tr-who-row">
                    <span aria-hidden="true">{r.seen_at ? '✓' : '—'}</span>
                    <span className="n">{r.person.first_name} {r.person.last_name}</span>
                    <span className="d">{r.seen_at ? ddmmhhmm(r.seen_at) : 'pas encore'}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="bt-fo-acts">
              {href ? (
                <a className="bt-fo-open" href={href} target="_blank" rel="noopener noreferrer" data-testid="tr-open">Ouvrir ↗</a>
              ) : (
                <span className="bt-fo-muted" data-testid="tr-na">Lien indisponible</span>
              )}
              {t.archived_at ? (
                <button type="button" className="bt-fo-btn ghost sm" disabled={busyId === t.id} onClick={() => archive(t, false)} data-testid="tr-restore">Remettre</button>
              ) : confirmId === t.id ? (
                <span className="bt-fo-confirm">
                  <span>Les salariés ne la verront plus ; les « Vue » restent.</span>
                  <button type="button" className="bt-fo-btn danger sm" disabled={busyId === t.id} onClick={() => archive(t, true)} data-testid="tr-archive-yes">Retirer</button>
                  <button type="button" className="bt-fo-btn ghost sm" onClick={() => setConfirmId(null)}>Annuler</button>
                </span>
              ) : (
                <button type="button" className="bt-fo-btn ghost sm" onClick={() => setConfirmId(t.id)} data-testid="tr-archive">Retirer</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[85vh] overflow-y-auto" data-testid="trainings-dialog">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader><DialogTitle>Formations</DialogTitle></DialogHeader>
        <div className="bt-fo">
          {!adding ? (
            <div className="bt-fo-top">
              <span className="bt-fo-muted">Une vidéo YouTube, Vimeo ou Google Drive, ou un document déjà téléversé. Le salarié l’ouvre et coche « Vue ».</span>
              <button type="button" className="bt-fo-btn ghost sm" onClick={() => setAdding(true)} data-testid="tr-add-open">+ Ajouter</button>
            </div>
          ) : (
            <form className="bt-fo-form" data-testid="tr-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div>
                <label className="bt-fo-lbl" htmlFor="tr-title">Titre</label>
                <input id="tr-title" className="bt-fo-input" value={title} maxLength={TRAINING_TITLE_MAX} placeholder="Ex. : Port du harnais"
                  onChange={(e) => setTitle(e.target.value)} data-testid="tr-title" autoComplete="off" />
                {title.trim() !== '' && !titleCheck.ok && <div className="bt-fo-err" style={{ marginTop: 4 }}>{titleCheck.error}</div>}
              </div>
              <div className="bt-fo-pills" role="radiogroup" aria-label="Contenu">
                <button type="button" role="radio" className="bt-fo-pill" aria-checked={kind === 'video'} aria-pressed={kind === 'video'} onClick={() => setKind('video')} data-testid="tr-kind-video">Lien vidéo</button>
                <button type="button" role="radio" className="bt-fo-pill" aria-checked={kind === 'document'} aria-pressed={kind === 'document'} onClick={() => setKind('document')} data-testid="tr-kind-document">Document</button>
              </div>
              {kind === 'video' ? (
                <div>
                  <input className="bt-fo-input" value={link} maxLength={TRAINING_URL_MAX + 50} inputMode="url" autoComplete="off" aria-label="Lien de la vidéo"
                    placeholder="https://youtu.be/… · vimeo.com/… · drive.google.com/…" onChange={(e) => setLink(e.target.value)} data-testid="tr-link" />
                  <div className="bt-fo-line">
                    {linkCheck?.ok ? (
                      <span className="bt-fo-ok" data-testid="tr-link-ok">{PROVIDER_LABEL[linkCheck.provider]} ✓</span>
                    ) : linkCheck ? (
                      <span className="bt-fo-err" data-testid="tr-link-error">{linkCheck.error}</span>
                    ) : (
                      <span className="bt-fo-muted">YouTube, Vimeo ou Google Drive. La vidéo reste chez eux.</span>
                    )}
                    {linkCheck?.ok && linkCheck.provider === 'drive' && (
                      <span className="bt-fo-muted" data-testid="tr-drive-hint">Partage du fichier : « Tous les utilisateurs disposant du lien ».</span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {docsLoading || docs === null ? (
                    <span className="bt-fo-muted"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Documents…</span>
                  ) : docs.length === 0 ? (
                    <p className="bt-fo-muted" data-testid="tr-doc-empty">Aucun document : ajoutez-le d’abord dans « Documents » d’un chantier.</p>
                  ) : (
                    <select className="bt-fo-select" value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Document" data-testid="tr-doc">
                      <option value="">Choisir un document…</option>
                      {docGroups.map(([wid, g]) => (
                        <optgroup key={wid} label={g.name}>
                          {g.docs.map((d) => <option key={d.id} value={d.id}>{docName(d)} · {ddmm(d.created_at)}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <span className="bt-fo-lbl">Pour</span>
                <div className="bt-fo-pills" role="radiogroup" aria-label="Pour">
                  <button type="button" role="radio" className="bt-fo-pill" aria-checked={allTeam} aria-pressed={allTeam} onClick={() => setAllTeam(true)} data-testid="tr-all">Toute l’équipe</button>
                  <button type="button" role="radio" className="bt-fo-pill" aria-checked={!allTeam} aria-pressed={!allTeam} onClick={() => setAllTeam(false)} data-testid="tr-pick">Certains salariés</button>
                </div>
                {!allTeam && (
                  <div style={{ marginTop: 6 }}>
                    {team.length > 8 && (
                      <input className="bt-fo-input" style={{ marginBottom: 6 }} placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="tr-people-search" />
                    )}
                    {team.length === 0 ? (
                      <p className="bt-fo-muted">Aucun salarié actif.</p>
                    ) : (
                      <div className="bt-fo-people" data-testid="tr-people">
                        {peopleShown.map((w) => (
                          <label key={w.id} className="bt-fo-chk">
                            <input type="checkbox" checked={picked.includes(w.id)} data-testid="tr-person" data-id={w.id}
                              onChange={() => setPicked((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))} />
                            <span>{w.first_name} {w.last_name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {formError && <p className="bt-fo-err" data-testid="tr-error">{formError}</p>}
              <div className="bt-fo-foot">
                <button type="button" className="bt-fo-btn ghost sm" onClick={resetForm} data-testid="tr-cancel">Annuler</button>
                <button type="submit" className="bt-fo-btn sm" disabled={!valid || saving} data-testid="tr-save">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ajouter
                </button>
              </div>
            </form>
          )}

          {loadError ? (
            <p className="bt-fo-err" data-testid="tr-load-error">{loadError}</p>
          ) : list === null ? (
            <p className="bt-fo-muted"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Chargement…</p>
          ) : active.length === 0 ? (
            <p className="bt-fo-muted" data-testid="tr-empty">Aucune formation. Ajoutez un lien YouTube, Vimeo ou Google Drive, ou un document déjà téléversé.</p>
          ) : (
            <div className="bt-fo-list" data-testid="tr-list">{active.map(row)}</div>
          )}

          {archived.length > 0 && (
            <>
              <button type="button" className="bt-fo-link" onClick={() => setShowArchived((v) => !v)} data-testid="tr-show-archived">
                {showArchived ? 'Masquer les formations retirées' : `Afficher les formations retirées (${archived.length})`}
              </button>
              {showArchived && <div className="bt-fo-list" data-testid="tr-archived-list">{archived.map(row)}</div>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
