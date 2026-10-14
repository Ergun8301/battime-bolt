'use client';

// Formations (lot 6, oct. 2026) — côté BUREAU : la fenêtre « Formations », ouverte depuis « Salariés »
// (et le menu du téléphone). Aucun bouton de barre.
// Formations simplifiées (oct. 2026, décision du patron : « trop de petits textes, trop de boutons ») :
//  - AUCUN texte d'aide statique (ni introduction, ni « aucune formation… », ni rappel de taille, de GPS ou de lien).
//    Ne restent que les messages conditionnels : refus, alerte HEVC, arrêt automatique, progression, erreurs.
//  - liste vide : le formulaire est là tout de suite (sans « + Ajouter » ni « Annuler » : on ferme avec la croix) ;
//    liste non vide : « + Ajouter » en haut à droite, puis la liste.
//  - UNE rangée de gros boutons de choix sous le titre : « Filmer » · « Fichier » · « Lien » · « Document » (un appui = l'action).
//    « Filmer » = l'enregistreur intégré (lot 14) ; s'il est indisponible, la caméra native sur un écran tactile, rien sur un ordinateur
//    (jamais un « Filmer » qui ouvre l'explorateur de fichiers). « Document » n'existe que s'il y a un document à proposer.
//  - la jauge de place n'apparaît qu'à partir de 80 % ; « Retirer » demande seulement « Retirer cette formation ? ».
//  - « Ajouter » : un titre, puis une vidéo (filmée ou fichier), un lien YouTube / Vimeo / Google Drive OU un document déjà
//    téléversé dans « Documents » d'un chantier ; pour toute l'équipe ou certains salariés. Notification aux destinataires
//    (jamais d'e-mail). Pas de modification en V1 : on retire, on remet.
//  - la liste : « x/y vues » ; un clic montre qui l'a vue (✓ date) et qui pas encore ; « Ouvrir ↗ » (nouvel onglet) ; « Retirer ».
// Les écritures sont dans lib/trainings.ts. Jamais d'iframe.
//  - Lot 13 (lib/training-videos.ts) : vidéo filmée ou fichier, aperçu, durée, taille, refus clair au-delà de 50 Mo ou du quota,
//    barre de progression réelle avec « Annuler l'envoi ». Hébergée dans le bucket privé « formations » (forfait gratuit) ;
//    lue dans l'appli (« Regarder »). Tant que la migration du lot 13 manque, « Filmer » et « Fichier » n'existent pas.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { format, parseISO } from 'date-fns';
import dynamic from 'next/dynamic';
import { CirclePlay, FileText, FolderOpen, Link2, Loader2, Video, type LucideIcon } from 'lucide-react';
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
import {
  fetchOfficeVideos, fetchVideoFilesAudit, fetchVideoLimits, publishVideo, setVideoArchived, startVideoUpload, uploadVideoFile, type OfficeLeftover, type OfficeVideo, type UploadRun,
} from '@/lib/training-videos';
import type { PickedVideo } from '@/components/training-video-upload';
import {
  checkVideoFile, leftoverNote, leftoverSummary, quotaFull, quotaNear, VIDEO_MAX_BYTES, VIDEO_QUOTA_BYTES, videoSummary, type FileAudit, type Limits,
} from '@/supabase/functions/_shared/training-videos';
import { pickRecorderMime, REC_AUTO_TEXT, recorderAvailable, type RecAuto } from '@/supabase/functions/_shared/video-recorder';

// Lot 13 : le panneau d'envoi et le lecteur ne se chargent qu'à l'ouverture.
const Waiting = () => <p className="bt-fo-muted"><Loader2 className="inline h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Chargement…</p>;
const loadUploadPanel = () => import('@/components/training-video-upload');
const UploadPanel = dynamic(loadUploadPanel, { ssr: false, loading: Waiting });
const TrainingVideoPlayer = dynamic(() => import('@/components/training-video-player'), { ssr: false, loading: Waiting });
const VideoOrphans = dynamic(() => import('@/components/training-video-orphans'), { ssr: false, loading: Waiting });

// useLayoutEffect côté navigateur seulement : ce que l'appareil sait faire est connu avant le premier affichage des boutons (pas de clignotement).
const useBrowserLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const CSS = `
.bt-fo{display:flex;flex-direction:column;gap:12px;font-size:13px;color:#15120F;min-width:0}
.bt-fo-top{display:flex;align-items:center;justify-content:flex-end;gap:10px}
.bt-fo-muted{font-size:12px;color:#6E6A63;font-weight:600;line-height:1.35}
.bt-fo-err{font-size:12.5px;font-weight:700;color:#C0461F}
.bt-fo-ok{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:#E3F5EA;color:#15120F;font-size:11.5px;font-weight:800}
.bt-fo-btn{height:32px;padding:0 12px;border-radius:9px;border:0;background:#15120F;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;flex:none}
.bt-fo-btn:disabled{opacity:.5;cursor:default}
.bt-fo-btn.ghost{background:#fff;color:#15120F;border:1.5px solid rgba(21,18,15,.2)}
.bt-fo-btn.danger{background:#fff;color:#C0461F;border:1.5px solid rgba(192,70,31,.45)}
.bt-fo-btn.sm{height:28px;padding:0 10px;font-size:12px}
.bt-fo-btn.lg{height:44px;padding:0 16px;font-size:13.5px}
.bt-fo-btn:focus-visible,.bt-fo-chip:focus-visible,.bt-fo-pill:focus-visible,.bt-fo-head:focus-visible,.bt-fo-link:focus-visible,.bt-fo-open:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
.bt-fo-form{display:flex;flex-direction:column;gap:10px;border:1px solid rgba(21,18,15,.14);border-radius:12px;padding:12px;background:#FBF8F2}
.bt-fo-lbl{display:block;font-size:12px;font-weight:800;color:#15120F;margin-bottom:4px}
.bt-fo-input,.bt-fo-select{width:100%;height:40px;border-radius:9px;border:1.5px solid rgba(21,18,15,.18);background:#fff;font:inherit;font-size:13px;font-weight:600;color:#15120F;padding:0 10px;outline:none;min-width:0}
.bt-fo-input:focus,.bt-fo-select:focus{border-color:#15120F}
.bt-fo-chips{display:flex;gap:6px}
.bt-fo-chip{flex:1 1 0;min-width:0;min-height:56px;padding:6px 2px;border-radius:12px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font:inherit;font-size:12px;font-weight:800;color:#15120F;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
.bt-fo-chip[aria-checked="true"]{background:#15120F;border-color:#15120F;color:#FFC21A}
.bt-fo-chip:disabled{opacity:.5;cursor:default}
@media (max-width:360px){.bt-fo-form{padding:8px}.bt-fo-chips{gap:3px}.bt-fo-chip{font-size:11px;padding:6px 0;letter-spacing:-.01em}}
.bt-fo-hidden{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);opacity:0;pointer-events:none}
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

/** Les choix de contenu. `record` = « Filmer » (enregistreur intégré, ou caméra native), `file` = « Fichier ». */
type Kind = 'record' | 'file' | 'link' | 'document';
const isVideoKind = (k: Kind | null) => k === 'record' || k === 'file';
// Texte visible court, libellé accessible complet (il contient toujours le mot visible).
const CHOICES: { kind: Kind; label: string; aria: string; Icon: LucideIcon }[] = [
  { kind: 'record', label: 'Filmer', aria: 'Filmer une vidéo', Icon: Video },
  { kind: 'file', label: 'Fichier', aria: 'Choisir un fichier vidéo', Icon: FolderOpen },
  { kind: 'link', label: 'Lien', aria: 'Coller un lien', Icon: Link2 },
  { kind: 'document', label: 'Document', aria: 'Choisir un document', Icon: FileText },
];
/** Une ligne de la liste : formation du lot 6, ou vidéo envoyée (lot 13). */
type Item = { src: 'link'; t: OfficeTraining; at: string } | { src: 'upload'; v: OfficeVideo; at: string } | { src: 'left'; l: OfficeLeftover; at: string };
const NO_LIMITS: Limits = { maxBytes: VIDEO_MAX_BYTES, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 0 };
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
  // Le formulaire. `adding` = ouvert par « + Ajouter » ; il est aussi affiché d'office quand la liste (lue) est vide.
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind | null>(null); // null = rien choisi encore (vidéos activées)
  const [link, setLink] = useState('');
  const [docs, setDocs] = useState<PickableDoc[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docId, setDocId] = useState('');
  const [allTeam, setAllTeam] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Lot 13 : vidéos envoyées. `vids` null = migration absente (ou pas encore lue) : « Filmer » et « Fichier » cachés.
  const [vids, setVids] = useState<{ videos: OfficeVideo[]; views: ViewRow[]; leftovers: OfficeLeftover[] } | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [file, setFile] = useState<PickedVideo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audit, setAudit] = useState<FileAudit | null>(null); // lot 14 : fichiers à vérifier (lecture seule)
  const auditSeq = useRef(0);
  const [recording, setRecording] = useState(false); // lot 14 : prise en cours dans « Filmer » (ce qui la jetterait est verrouillé)
  const [recOpen, setRecOpen] = useState(false); // l'enregistreur est ouvert
  const [recAuto, setRecAuto] = useState<string | null>(null); // message d'arrêt automatique de la dernière prise
  const [recError, setRecError] = useState<string | null>(null); // refus de la caméra
  const [canRec, setCanRec] = useState(false); // l'appareil sait enregistrer (MediaRecorder, contexte sécurisé, type de fichier compris)
  const [coarse, setCoarse] = useState(false); // écran tactile
  const uploadRef = useRef<UploadRun | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const chipRefs = useRef<Partial<Record<Kind, HTMLButtonElement | null>>>({});
  const filmInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const [r, v] = await Promise.all([fetchOfficeTrainings(companyId), fetchOfficeVideos(companyId)]);
    if (!r.ok) { setLoadError(r.message); return; }
    setLoadError(null);
    setList({ trainings: r.trainings, views: r.views });
    // Vidéos illisibles (migration absente, réseau…) : la liste du lot 6 reste telle quelle.
    if (v.ok) {
      setVids({ videos: v.videos, views: v.views, leftovers: v.leftovers });
      // Lot 14 : non bloquant ; rien n'est affiché s'il n'y a rien ou si la migration manque. Seule la réponse du dernier chargement compte
      // (une lecture plus ancienne qui arrive en retard ne remplace pas la plus récente).
      const seq = ++auditSeq.current;
      void fetchVideoFilesAudit().then((a) => { if (seq === auditSeq.current) setAudit(a); });
    } else {
      auditSeq.current++; setAudit(null);
      if (v.missing) setVids(null);
    }
  }, [companyId]);
  const videosOn = vids !== null;
  const refreshLimits = useCallback(async () => { const l = await fetchVideoLimits(); if (l) setLimits(l); }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  // Formations du lot 6 et vidéos envoyées, une seule liste, plus récentes d'abord.
  const items: Item[] = useMemo(() => [
    ...(list?.trainings || []).map((t): Item => ({ src: 'link', t, at: t.created_at })),
    ...(vids?.videos || []).map((v): Item => ({ src: 'upload', v, at: v.published_at || v.created_at })),
    // Fichiers arrivés mais jamais publiés : gardés, comptés dans la place, donc montrés (avec les formations retirées).
    ...(vids?.leftovers || []).map((l): Item => ({ src: 'left', l, at: l.reserved_at })),
  ].sort((a, z) => z.at.localeCompare(a.at)), [list, vids]);
  const isArchived = (i: Item) => i.src === 'left' || !!(i.src === 'link' ? i.t.archived_at : i.v.archived_at);
  const active = items.filter((i) => !isArchived(i));
  const archived = items.filter(isArchived);
  // Le formulaire : ouvert par « + Ajouter », ou d'office quand la liste est lue, sans erreur, et vide. Jamais pendant le chargement.
  const formOpen = adding || (list !== null && !loadError && active.length === 0);

  const clearFile = useCallback(() => {
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
    // Un autre fichier ne reprend pas les messages de la prise précédente (arrêt automatique, refus de la caméra).
    setFile(null); setFileError(null); setRecAuto(null); setRecError(null);
  }, []);
  const resetForm = useCallback(() => {
    // Un envoi en cours est coupé (rien n'est publié ; la place sera reprise au prochain envoi).
    uploadRef.current?.cancel(); uploadRef.current = null;
    setAdding(false); setTitle(''); setKind(null); setLink(''); setDocId(''); setAllTeam(true); setPicked([]); setQuery(''); setFormError(null); setRecOpen(false);
    // La jauge est relue à chaque nouveau formulaire (un autre compte du bureau a pu envoyer entre-temps).
    clearFile(); setProgress(null); setUploadNote(null); setLimits(null);
  }, [clearFile]);
  useEffect(() => { if (!open) { resetForm(); setDocs(null); setExpanded(null); setConfirmId(null); setShowArchived(false); setDocUrls({}); setPlaying(null); } }, [open, resetForm]); // liens signés 1 h : resignés à la réouverture
  useEffect(() => () => { uploadRef.current?.cancel(); if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current); }, []);

  // Ce que l'appareil sait faire pour « Filmer », relevé à chaque ouverture du formulaire.
  useBrowserLayoutEffect(() => {
    if (!open || !formOpen) return;
    setCanRec(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
      && pickRecorderMime((t) => MediaRecorder.isTypeSupported(t)) !== null);
    setCoarse(typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  }, [open, formOpen]);

  // La jauge est lue dès que le formulaire est là (elle décide aussi si l'enregistreur a assez de place) ; le panneau d'envoi est préchargé.
  useEffect(() => {
    if (!(open && formOpen && videosOn)) return;
    if (!limits) refreshLimits();
    void loadUploadPanel();
  }, [open, formOpen, videosOn, limits, refreshLimits]);
  const lim = limits || NO_LIMITS;
  const full = !!limits && quotaFull(limits);
  // Fichier choisi avant l'arrivée de la jauge : revérifié avec la vraie place restante.
  useEffect(() => {
    if (!limits || !file || progress) return;
    const c = checkVideoFile(file.file, limits);
    setFileError(c.ok ? null : c.error);
  }, [limits, file, progress]);

  const pickFile = (f: File | null | undefined, durationS?: number) => {
    setUploadNote(null); setFormError(null);
    clearFile();
    if (!f) return;
    const c = checkVideoFile(f, lim);
    if (!c.ok) { setFileError(c.error); return; }
    const url = URL.createObjectURL(f);
    fileUrlRef.current = url;
    // Lot 14 : une prise de « Filmer » arrive avec sa durée (le minuteur ; un WebM de navigateur n'en porte pas).
    setFile({ file: f, mime: c.mime, url, duration: durationS ?? null, source: durationS != null ? 'recorder' : undefined });
  };
  // Durée lue par le panneau (aperçu) : gardée si c'est toujours le même fichier.
  const onDuration = useCallback((url: string, d: number | null) => {
    setFile((prev) => (prev && prev.url === url ? { ...prev, duration: d } : prev));
  }, []);

  // Les documents sont lus à l'ouverture du formulaire : « Document » n'existe que s'il y en a au moins un.
  useEffect(() => {
    if (!open || !formOpen || docs !== null || docsLoading) return;
    setDocsLoading(true);
    fetchPickableDocuments(companyId).then((d) => { setDocs(d || []); setDocsLoading(false); });
  }, [open, formOpen, docs, docsLoading, companyId]);
  const docsOn = !!docs && docs.length > 0;

  // Les choix proposés, dans l'ordre : Filmer · Fichier · Lien · Document.
  // « Filmer » : l'enregistreur intégré (place d'au moins 2 Mo comprise) ; à défaut la caméra native sur un écran tactile ; sinon rien
  // (jamais un « Filmer » qui ouvrirait l'explorateur de fichiers d'un ordinateur).
  const cam: 'rec' | 'native' | 'none' = canRec && (!limits || recorderAvailable(limits)) ? 'rec' : coarse ? 'native' : 'none';
  const allowed: Kind[] = [...(videosOn && cam !== 'none' ? ['record' as const] : []), ...(videosOn ? ['file' as const] : []), 'link', ...(docsOn ? ['document' as const] : [])];
  // Rien de choisi : « Lien » sans les vidéos, aucun contenu sinon. Un choix devenu impossible (« Document » sans document…) retombe sur « Lien ».
  const eff: Kind | null = kind === null ? (videosOn ? null : 'link') : allowed.includes(kind) ? kind : 'link';
  const effRef = useRef(eff);
  effRef.current = eff;
  const isVideo = isVideoKind(eff);
  // Passer d'un choix à un autre nettoie l'état du précédent (fichier + URL objet, prise, lien, document) : rien ne fuit.
  const prevEff = useRef<Kind | null>(eff);
  useEffect(() => {
    const p = prevEff.current;
    prevEff.current = eff;
    if (p === eff) return;
    if (isVideoKind(p) && !isVideoKind(eff)) { clearFile(); setRecOpen(false); setUploadNote(null); }
    if (p === 'link') setLink('');
    if (p === 'document') setDocId('');
  }, [eff, clearFile]);

  const focusChip = useCallback(() => { const k = effRef.current; if (k) chipRefs.current[k]?.focus(); }, []);
  // L'enregistreur se ferme sans rendre de fichier (« Fermer la caméra », refus) : le focus revient sur « Filmer ».
  const wasRec = useRef(false);
  useEffect(() => {
    if (wasRec.current && !recOpen && !file) focusChip();
    wasRec.current = recOpen;
  }, [recOpen, file, focusChip]);

  // Un appui sur un choix = l'action : « Filmer » ouvre l'enregistreur (ou la caméra native), « Fichier » le sélecteur de fichiers.
  // Les sélecteurs sont dans le formulaire (pas dans le panneau chargé à la demande) : ils doivent s'ouvrir dans le même geste.
  const choose = (k: Kind) => {
    if (progress || recording) return;
    setKind(k);
    if (k === 'record') {
      if (full) return; // plus de place : le panneau le dit, rien à ouvrir
      if (cam === 'rec') { clearFile(); setRecOpen(true); } else filmInput.current?.click();
    } else {
      setRecOpen(false);
      if (k === 'file' && !full) fileInput.current?.click();
    }
  };
  // Flèches : le focus passe d'un choix à l'autre (sans rien ouvrir) ; Espace ou Entrée choisit.
  const onChoiceKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
    e.preventDefault();
    btns[n].focus();
  };
  const changeVideo = () => { clearFile(); focusChip(); };

  const linkCheck = useMemo(() => (link.trim() ? parseTrainingLink(link) : null), [link]);
  const titleCheck = checkTrainingTitle(title);
  const sourceOk = eff === 'link' ? !!linkCheck?.ok : eff === 'document' ? !!docId : isVideo ? !!file && !fileError : false;
  const valid = titleCheck.ok && sourceOk && (allTeam || picked.length > 0) && !progress;
  // Le panneau d'envoi ne se montre que s'il a quelque chose à dire (enregistreur, fichier prêt, refus, progression, jauge à 80 % ou plus).
  const showPanel = isVideo && (!!file || recOpen || !!fileError || !!progress || !!uploadNote || !!recError || (!!limits && (full || quotaNear(limits))));

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

  const saveUpload = async (titleText: string, ids: string[]) => {
    if (!file) return;
    setUploadNote(null);
    const s = await startVideoUpload({ title: titleText, allTeam, assigneeIds: ids, mime: file.mime, size: file.file.size, duration: file.duration });
    if (!s.ok) { setFormError(s.message); refreshLimits(); return; }
    if (!s.uploaded) {
      setProgress({ loaded: 0, total: file.file.size });
      const run = uploadVideoFile(s.path, file.file, file.mime, (loaded, total) => setProgress({ loaded, total }));
      uploadRef.current = run;
      const r = await run.done;
      if (uploadRef.current === run) uploadRef.current = null;
      if (!r.ok) {
        setProgress(null);
        if (r.kind === 'abort') setUploadNote(r.message); else setFormError(r.message);
        return;
      }
    }
    const p = await publishVideo(s.id);
    setProgress(null);
    if (!p.ok) { setFormError(p.message || 'La vidéo n’est pas publiée.'); return; }
    const push = await notifyTraining({ userIds: allTeam ? team.map((w) => w.id) : ids, companyName, title: titleText, trainingId: s.id });
    toast.success(`Vidéo ajoutée${push.sent > 0 ? ` · ${push.sent} appareil${push.sent > 1 ? 's' : ''} prévenu${push.sent > 1 ? 's' : ''}` : ''}`);
    await load(); // la liste est relue AVANT de refermer : un formulaire d'office (liste vide) ne réapparaît pas une seconde
    resetForm();
  };

  const save = async () => {
    if (!valid || saving || !titleCheck.ok) return;
    setSaving(true); setFormError(null);
    if (isVideo) {
      try { await saveUpload(titleCheck.title, allTeam ? [] : picked.filter((id) => team.some((w) => w.id === id))); } finally { setSaving(false); }
      return;
    }
    try {
      const videoUrl = eff === 'link' && linkCheck?.ok ? linkCheck.url : null;
      const ids = allTeam ? [] : picked.filter((id) => team.some((w) => w.id === id));
      const r = await createTraining({ companyId, title: titleCheck.title, kind: eff === 'document' ? 'document' : 'video', videoUrl, documentId: eff === 'document' ? docId : null, allTeam, assigneeIds: ids });
      if (!r.ok || !r.id) { setFormError(r.message || 'Impossible d’ajouter la formation.'); return; }
      // Notification aux destinataires (bonus, jamais bloquant, jamais d'e-mail).
      const push = await notifyTraining({ userIds: allTeam ? team.map((w) => w.id) : ids, companyName, title: titleCheck.title, trainingId: r.id });
      toast.success(`Formation ajoutée${push.sent > 0 ? ` · ${push.sent} appareil${push.sent > 1 ? 's' : ''} prévenu${push.sent > 1 ? 's' : ''}` : ''}`);
      await load();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const expandVideo = (v: OfficeVideo) => {
    setConfirmId(null); setPlaying(null);
    setExpanded(expanded === v.id ? null : v.id);
  };
  const archiveVideo = async (v: OfficeVideo, on: boolean) => {
    if (busyId) return;
    setBusyId(v.id);
    try {
      const r = await setVideoArchived(v.id, on);
      if (!r.ok) { toast.error(r.message || 'Impossible d’enregistrer.'); return; }
      toast.success(on ? 'Vidéo retirée' : 'Vidéo remise');
      setConfirmId(null); setExpanded(null); setPlaying(null);
      await load();
    } finally {
      setBusyId(null);
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
                  <span>Retirer cette formation ?</span>
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

  const videoRow = (v: OfficeVideo) => {
    const sum = seenSummary(v, team, vids?.views || []);
    const who = v.all_team ? 'Toute l’équipe' : `${sum.total} salarié${sum.total > 1 ? 's' : ''}`;
    const isOpen = expanded === v.id;
    const isPlaying = isOpen && playing === v.id;
    return (
      <div key={v.id} className={`bt-fo-item${v.archived_at ? ' archived' : ''}`} data-testid={v.archived_at ? 'tr-archived-item' : 'tr-item'} data-kind="upload">
        <button type="button" className="bt-fo-head" aria-expanded={isOpen} onClick={() => expandVideo(v)} data-testid="tr-head">
          <span className="bt-fo-ic" aria-hidden="true"><CirclePlay className="h-3.5 w-3.5" /></span>
          <span className="bt-fo-main">
            <span className="bt-fo-t" data-testid="tr-title-text">{v.title}</span>
            <span className="bt-fo-s">{videoSummary(v)} · {who} · {ddmm(v.published_at || v.created_at)}</span>
          </span>
          {!v.archived_at && (
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
            {isPlaying && <TrainingVideoPlayer companyId={companyId} path={v.file_path} title={v.title} />}
            <div className="bt-fo-acts">
              <button type="button" className="bt-fo-btn ghost sm" aria-expanded={isPlaying} onClick={() => setPlaying(isPlaying ? null : v.id)} data-testid="tr-watch">
                {isPlaying ? 'Fermer la vidéo' : '▶ Regarder'}
              </button>
              {v.archived_at ? (
                <button type="button" className="bt-fo-btn ghost sm" disabled={busyId === v.id} onClick={() => archiveVideo(v, false)} data-testid="tr-restore">Remettre</button>
              ) : confirmId === v.id ? (
                <span className="bt-fo-confirm">
                  <span>Retirer cette formation ?</span>
                  <button type="button" className="bt-fo-btn danger sm" disabled={busyId === v.id} onClick={() => archiveVideo(v, true)} data-testid="tr-archive-yes">Retirer</button>
                  <button type="button" className="bt-fo-btn ghost sm" onClick={() => setConfirmId(null)}>Annuler</button>
                </span>
              ) : (
                <button type="button" className="bt-fo-btn ghost sm" onClick={() => setConfirmId(v.id)} data-testid="tr-archive">Retirer</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  const leftoverRow = (l: OfficeLeftover) => {
    const isOpen = expanded === l.id;
    const isPlaying = isOpen && playing === l.id;
    return (
      <div key={l.id} className="bt-fo-item archived" data-testid="tr-archived-item" data-kind="leftover">
        <button type="button" className="bt-fo-head" aria-expanded={isOpen} onClick={() => { setConfirmId(null); setPlaying(null); setExpanded(isOpen ? null : l.id); }} data-testid="tr-head">
          <span className="bt-fo-ic" aria-hidden="true"><CirclePlay className="h-3.5 w-3.5" /></span>
          <span className="bt-fo-main">
            <span className="bt-fo-t" data-testid="tr-title-text">{l.title}</span>
            <span className="bt-fo-s" data-testid="tr-leftover-sum">{leftoverSummary(l.real_bytes, !!l.archived_at)} · {ddmm(l.reserved_at)}</span>
          </span>
        </button>
        {isOpen && (
          <div className="bt-fo-detail" data-testid="tr-detail">
            <p className="bt-fo-muted" data-testid="tr-leftover-note">{leftoverNote(lim.quotaBytes)}</p>
            {isPlaying && <TrainingVideoPlayer companyId={companyId} path={l.file_path} title={l.title} />}
            <div className="bt-fo-acts">
              <button type="button" className="bt-fo-btn ghost sm" aria-expanded={isPlaying} onClick={() => setPlaying(isPlaying ? null : l.id)} data-testid="tr-watch">
                {isPlaying ? 'Fermer la vidéo' : '▶ Regarder'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  const renderItem = (i: Item) => (i.src === 'link' ? row(i.t) : i.src === 'upload' ? videoRow(i.v) : leftoverRow(i.l));

  const locked = !!progress || recording; // envoi ou prise en cours : les choix et « Annuler » ne bougent plus
  const firstChoice = allowed[0];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && recording) return; onOpenChange(o); }}>
      <DialogContent className="bt-skin max-w-lg max-h-[85vh] overflow-y-auto max-sm:p-4" data-testid="trainings-dialog">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader><DialogTitle>Formations</DialogTitle></DialogHeader>
        <div className="bt-fo">
          {!formOpen && !loadError && active.length > 0 && (
            <div className="bt-fo-top">
              <button type="button" className="bt-fo-btn ghost lg" onClick={() => setAdding(true)} data-testid="tr-add-open">+ Ajouter</button>
            </div>
          )}
          {formOpen && (
            <form className="bt-fo-form" data-testid="tr-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div>
                <label className="bt-fo-lbl" htmlFor="tr-title">Titre</label>
                <input id="tr-title" className="bt-fo-input" value={title} maxLength={TRAINING_TITLE_MAX} placeholder="Ex. : Port du harnais"
                  onChange={(e) => setTitle(e.target.value)} data-testid="tr-title" autoComplete="off" />
                {title.trim() !== '' && !titleCheck.ok && <div className="bt-fo-err" style={{ marginTop: 4 }}>{titleCheck.error}</div>}
              </div>
              {allowed.length > 1 && (
                <div className="bt-fo-chips" role="radiogroup" aria-label="Contenu" onKeyDown={onChoiceKey}>
                  {CHOICES.filter((c) => allowed.includes(c.kind)).map(({ kind: k, label, aria, Icon }) => (
                    <button key={k} ref={(el) => { chipRefs.current[k] = el; }} type="button" role="radio" className="bt-fo-chip" aria-checked={eff === k} aria-label={aria}
                      tabIndex={eff === k || (eff === null && k === firstChoice) ? 0 : -1} disabled={locked} onClick={() => choose(k)} data-testid={`tr-kind-${k}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
              {videosOn && (
                <>
                  {cam === 'native' && (
                    <input ref={filmInput} type="file" accept="video/*" capture="environment" className="bt-fo-hidden" tabIndex={-1} aria-hidden="true" disabled={!!progress}
                      onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="tr-film" />
                  )}
                  <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm" className="bt-fo-hidden" tabIndex={-1} aria-hidden="true" disabled={!!progress}
                    onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="tr-file" />
                </>
              )}
              {isVideo ? (
                showPanel && (
                  <UploadPanel limits={limits} file={file} fileError={fileError} progress={progress} note={uploadNote} recOpen={recOpen} recAuto={recAuto} recError={recError} recAvailable={cam === 'rec'}
                    onClear={changeVideo} onCancel={() => uploadRef.current?.cancel()} onDuration={onDuration} onRecording={setRecording}
                    onRecDone={(f, d, a: RecAuto | null) => { setRecOpen(false); pickFile(f, d); setRecAuto(a ? REC_AUTO_TEXT[a] : null); }}
                    onRecError={(m) => { setRecOpen(false); setRecError(m); }} onRecClose={() => setRecOpen(false)} />
                )
              ) : eff === 'link' ? (
                <div>
                  <input className="bt-fo-input" value={link} maxLength={TRAINING_URL_MAX + 50} inputMode="url" autoComplete="off" aria-label="Lien de la vidéo"
                    placeholder="https://youtu.be/… · vimeo.com/… · drive.google.com/…" onChange={(e) => setLink(e.target.value)} data-testid="tr-link" />
                  {linkCheck && (
                    <div className="bt-fo-line">
                      {linkCheck.ok ? (
                        <span className="bt-fo-ok" data-testid="tr-link-ok">{PROVIDER_LABEL[linkCheck.provider]} ✓</span>
                      ) : (
                        <span className="bt-fo-err" data-testid="tr-link-error">{linkCheck.error}</span>
                      )}
                      {/* Seulement pour un lien Google Drive reconnu : c'est ce qui évite une formation que personne ne peut ouvrir. */}
                      {linkCheck.ok && linkCheck.provider === 'drive' && (
                        <span className="bt-fo-muted" data-testid="tr-drive-hint">Partage du fichier : « Tous les utilisateurs disposant du lien ».</span>
                      )}
                    </div>
                  )}
                </div>
              ) : eff === 'document' ? (
                <select className="bt-fo-select" value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Document" data-testid="tr-doc">
                  <option value="">Choisir un document…</option>
                  {docGroups.map(([wid, g]) => (
                    <optgroup key={wid} label={g.name}>
                      {g.docs.map((d) => <option key={d.id} value={d.id}>{docName(d)} · {ddmm(d.created_at)}</option>)}
                    </optgroup>
                  ))}
                </select>
              ) : null}
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
                {/* Liste vide : le formulaire est d'office là, on le ferme avec la croix de la fenêtre (pas d'« Annuler »). */}
                {adding && (
                  <button type="button" className="bt-fo-btn ghost lg" onClick={resetForm} disabled={locked} data-testid="tr-cancel">Annuler</button>
                )}
                <button type="submit" className="bt-fo-btn lg" disabled={!valid || saving} data-testid="tr-save">
                  {saving && !progress && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />} Ajouter
                </button>
              </div>
            </form>
          )}

          {loadError ? (
            <p className="bt-fo-err" data-testid="tr-load-error">{loadError}</p>
          ) : list === null ? (
            <p className="bt-fo-muted"><Loader2 className="inline h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Chargement…</p>
          ) : active.length > 0 ? (
            <div className="bt-fo-list" data-testid="tr-list">{active.map(renderItem)}</div>
          ) : null}

          {archived.length > 0 && (
            <>
              <button type="button" className="bt-fo-link" onClick={() => setShowArchived((v) => !v)} data-testid="tr-show-archived">
                {(vids?.leftovers.length || 0) > 0
                  ? (showArchived ? 'Masquer les formations retirées et les envois non terminés' : `Afficher les formations retirées et les envois non terminés (${archived.length})`)
                  : (showArchived ? 'Masquer les formations retirées' : `Afficher les formations retirées (${archived.length})`)}
              </button>
              {showArchived && <div className="bt-fo-list" data-testid="tr-archived-list">{archived.map(renderItem)}</div>}
            </>
          )}
          {videosOn && audit && <VideoOrphans audit={audit} quotaBytes={lim.quotaBytes} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
