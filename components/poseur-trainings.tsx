'use client';

// Formations (lot 6, oct. 2026) — côté SALARIÉ (et chef d'équipe) :
//  - useMyTrainings : mes formations (my_trainings), lues au chargement, toutes
//    les 60 s tant que la fonction existe, au retour sur l'appli (notification
//    touchée, onglet repris) et après chaque « Vue » ;
//  - TrainingsBanner : « 2 formations à voir › » sur « Ma journée » (même
//    habillage que « réserves à lever »), tant qu'il en reste à voir ;
//  - PoseurTrainings : la liste. « Ouvrir ↗ » est un VRAI lien (nouvel onglet,
//    rel="noopener noreferrer") — jamais d'iframe, aucune vidéo hébergée ici ;
//    « Vue » se coche à la main (set_training_seen), « Annuler » 10 s.
//  - Lot 13 : une vidéo envoyée par le bureau (kind 'upload') se regarde DANS
//    l'appli (« Regarder » : lecteur intégré, lien signé créé à l'ouverture,
//    components/training-video-player.tsx) ; « Vue » par set_training_video_seen.
// Tant que la migration n'est pas appliquée : rien du tout (ni bandeau, ni menu).
import { useCallback, useEffect, useRef, useState } from 'react';
import { CirclePlay, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { keep } from '@/lib/same';
import {
  announceTrainingsChanged, fetchMyTrainings, setTrainingSeen, signTrainingDocs, TRAININGS_CHANGED_EVENT, type MyTraining,
} from '@/lib/trainings';
import { setVideoSeen } from '@/lib/training-videos';
import dynamic from 'next/dynamic';
import { PROVIDER_LABEL, providerOf, safeTrainingUrl, toSeeLabel } from '@/supabase/functions/_shared/trainings';
import { videoSummary } from '@/supabase/functions/_shared/training-videos';

interface State { available: boolean; items: MyTraining[] }
const OFF: State = { available: false, items: [] };
const POLL_MS = 60_000;

/** Mes formations. `available` = la migration est passée (sinon : rien ne s'affiche). */
/** « Vue » ne s'annule que 10 minutes (même règle que set_training_seen) : ensuite le bouton devient une simple mention. */
const SEEN_UNDO_MS = 10 * 60 * 1000;
const canUndoSeen = (seenAt: string) => Date.now() - new Date(seenAt).getTime() < SEEN_UNDO_MS;

export function useMyTrainings(userId: string | null | undefined) {
  const [st, setSt] = useState<State>(OFF);
  const seq = useRef(0);
  const availRef = useRef(false);
  const load = useCallback(async () => {
    if (!userId) return;
    const n = ++seq.current;
    const r = await fetchMyTrainings();
    if (n !== seq.current) return;
    if (r === 'missing') { availRef.current = false; setSt((prev) => (prev.available || prev.items.length ? OFF : prev)); return; }
    if (!r) return; // lecture en échec (réseau…) : on garde ce qu'on sait, sans message
    availRef.current = true;
    setSt((prev) => keep(prev, { available: true, items: r }));
  }, [userId]);
  useEffect(() => {
    load();
    // Toutes les minutes SEULEMENT si la fonction existe (avant la migration : pas
    // une requête en échec par minute) ; sinon au retour sur l'appli.
    const id = setInterval(() => { if (availRef.current && document.visibilityState !== 'hidden') load(); }, POLL_MS);
    const onBack = () => { if (document.visibilityState !== 'hidden') load(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener(TRAININGS_CHANGED_EVENT, load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onBack); window.removeEventListener(TRAININGS_CHANGED_EVENT, load); };
  }, [load]);
  /** Mise à jour sur place (case « Vue » cochée avant la réponse du serveur). */
  const patch = useCallback((id: string, seenAt: string | null) => {
    setSt((prev) => ({ ...prev, items: prev.items.map((t) => (t.id === id ? { ...t, seen_at: seenAt } : t)) }));
  }, []);
  const unseen = st.items.filter((t) => !t.seen_at).length;
  return { available: st.available, items: st.items, unseen, reload: load, patch };
}

/** « 2 formations à voir › » — même habillage que les autres bandeaux de « Ma journée ». */
export function TrainingsBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count <= 0) return null;
  return (
    <button className="bt-alert" onClick={onOpen} aria-label={toSeeLabel(count)} data-testid="trainings-banner">
      <span className="bt-alert-badge">{count}</span>
      <span className="bt-alert-txt">{toSeeLabel(count)}</span>
      <span className="bt-alert-chev">›</span>
    </button>
  );
}

// Lot 13 : le lecteur ne se charge qu'au premier « Regarder ».
const TrainingVideoPlayer = dynamic(() => import('@/components/training-video-player'), {
  ssr: false, loading: () => <p className="bt-tr-na"><Loader2 className="inline h-3 w-3 animate-spin motion-reduce:animate-none" /> Chargement…</p>,
});

const CSS = `
.bt-tr-list{display:flex;flex-direction:column;gap:8px}
.bt-tr-row{display:flex;align-items:flex-start;gap:10px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:12px;padding:10px 12px;min-width:0}
.bt-tr-row.seen{background:#F7F4EC}
.bt-tr-row.seen .bt-tr-t{color:#6E6A63}
.bt-tr-ic{flex:none;width:28px;height:28px;border-radius:8px;background:#F2EDE3;display:flex;align-items:center;justify-content:center;color:#15120F;margin-top:1px}
.bt-tr-main{flex:1;min-width:0}
.bt-tr-t{font-size:14.5px;font-weight:800;color:#15120F;line-height:1.25;overflow-wrap:anywhere}
.bt-tr-s{font-size:12px;font-weight:600;color:#6E6A63;margin-top:2px;overflow-wrap:anywhere}
.bt-tr-acts{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:8px}
.bt-tr-open{display:inline-flex;align-items:center;height:30px;padding:0 10px;border-radius:8px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font-size:12.5px;font-weight:800;color:#15120F;text-decoration:none;white-space:nowrap}
.bt-tr-open:focus-visible,.bt-tr-seen:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
button.bt-tr-open{font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
button.bt-tr-open[aria-expanded="true"]{background:#FFF6D9;border-color:#15120F}
.bt-tr-player{margin-top:8px}
.bt-tr-na{font-size:12px;font-weight:700;color:#8a8378}
.bt-tr-seen{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:8px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font:inherit;font-size:12.5px;font-weight:800;color:#15120F;cursor:pointer;white-space:nowrap}
.bt-tr-seen[aria-pressed="true"]{background:#15120F;border-color:#15120F;color:#FFC21A}
.bt-tr-seen:disabled{opacity:.6;cursor:default}
.bt-tr-empty{font-size:13.5px;font-weight:600;color:#6E6A63;text-align:center;padding:28px 8px}
`;
const CSS_HTML = { __html: CSS };
const SIGN_FRESH_MS = 45 * 60 * 1000; // liens signés 1 h : resignés au-delà de 45 min

const added = (iso: string) => { try { return format(parseISO(iso), 'd MMM', { locale: fr }); } catch { return ''; } };
const ddmm = (iso: string) => { try { return format(parseISO(iso), 'dd/MM'); } catch { return ''; } };
const order = (a: MyTraining, b: MyTraining) => Number(!!a.seen_at) - Number(!!b.seen_at) || String(b.created_at).localeCompare(String(a.created_at));

/** La liste « Formations » : pas encore vues d'abord ; « Ouvrir ↗ » et « Vue ». */
export default function PoseurTrainings({ items, companyId, onPatch }: {
  items: MyTraining[]; companyId: string | null | undefined; onPatch: (id: string, seenAt: string | null) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signedRef = useRef({ at: 0, key: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  // Lot 13 : la vidéo ouverte dans le lecteur (une à la fois).
  const [playing, setPlaying] = useState<string | null>(null);
  const pathsKey = Array.from(new Set(items.map((t) => t.document_path).filter((p): p is string => !!p))).sort().join('|');

  // Liens des documents : signés à l'ouverture (ou quand la liste change), puis au
  // retour sur l'appli s'ils ont plus de 45 min (ils expirent au bout d'1 h).
  useEffect(() => {
    if (!companyId || !pathsKey) return;
    let stale = false;
    const sign = async () => {
      const at = Date.now();
      const next = await signTrainingDocs(companyId, pathsKey.split('|'));
      if (stale) return;
      signedRef.current = { at, key: pathsKey };
      setUrls(next);
    };
    if (signedRef.current.key !== pathsKey || Date.now() - signedRef.current.at >= SIGN_FRESH_MS) sign();
    const onBack = () => { if (document.visibilityState !== 'hidden' && Date.now() - signedRef.current.at >= SIGN_FRESH_MS) sign(); };
    document.addEventListener('visibilitychange', onBack);
    return () => { stale = true; document.removeEventListener('visibilitychange', onBack); };
  }, [companyId, pathsKey]);

  const toggle = async (t: MyTraining) => {
    if (busyId) return;
    const seen = !t.seen_at;
    setBusyId(t.id);
    onPatch(t.id, seen ? new Date().toISOString() : null); // tout de suite ; revient si le serveur refuse
    try {
      const setSeen = t.kind === 'upload' ? setVideoSeen : setTrainingSeen;
      const r = await setSeen(t.id, seen);
      if (!r.ok) {
        onPatch(t.id, t.seen_at);
        toast.error(r.message || 'Impossible d’enregistrer. Réessayez.');
        announceTrainingsChanged(); // relue : une formation retirée disparaît
        return;
      }
      onPatch(t.id, r.seenAt ?? null);
      if (seen) {
        toast.success('Formation marquée « Vue »', {
          duration: 10_000,
          action: {
            label: 'Annuler',
            onClick: async () => {
              const u = await setSeen(t.id, false);
              if (u.ok) { onPatch(t.id, null); toast.success('« Vue » retirée'); } else toast.error(u.message || 'Impossible d’annuler.');
              announceTrainingsChanged();
            },
          },
        });
      } else {
        toast.success('« Vue » retirée');
      }
      announceTrainingsChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="trainings-list">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {items.length === 0 ? (
        <p className="bt-tr-empty">Aucune formation pour le moment.</p>
      ) : (
        <div className="bt-tr-list">
          {[...items].sort(order).map((t) => {
            const isDoc = t.kind === 'document';
            const isUpload = t.kind === 'upload';
            const href = isDoc ? (t.document_path ? urls[t.document_path] || null : null) : isUpload ? null : safeTrainingUrl(t.video_url);
            const prov = providerOf(t.video_url);
            const what = isDoc ? (t.document_name || 'Document') : isUpload ? videoSummary({ duration_s: t.video_duration, size_bytes: t.video_size }) : prov ? PROVIDER_LABEL[prov] : 'Vidéo';
            const isPlaying = isUpload && playing === t.id && !!t.video_path;
            return (
              <div key={t.id} className={`bt-tr-row${t.seen_at ? ' seen' : ''}`} data-testid="training-row" data-seen={t.seen_at ? '1' : '0'}>
                <span className="bt-tr-ic" aria-hidden="true">{isDoc ? <FileText className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}</span>
                <div className="bt-tr-main">
                  <div className="bt-tr-t">{t.title}</div>
                  <div className="bt-tr-s">{what} · ajoutée le {added(t.created_at)}</div>
                  <div className="bt-tr-acts">
                    {isUpload && t.video_path ? (
                      <button type="button" className="bt-tr-open" aria-expanded={isPlaying} onClick={() => setPlaying(isPlaying ? null : t.id)} data-testid="training-watch">
                        {isPlaying ? 'Fermer la vidéo' : '▶ Regarder'}
                      </button>
                    ) : href ? (
                      <a className="bt-tr-open" href={href} target="_blank" rel="noopener noreferrer" data-testid="training-open">Ouvrir ↗</a>
                    ) : (
                      <span className="bt-tr-na" data-testid="training-na">Lien indisponible</span>
                    )}
                    <button type="button" className="bt-tr-seen" aria-pressed={!!t.seen_at} disabled={busyId === t.id || (!!t.seen_at && !canUndoSeen(t.seen_at))} data-testid="training-seen"
                      aria-label={`${t.title} : ${t.seen_at ? (canUndoSeen(t.seen_at) ? 'vue (toucher pour annuler)' : 'vue') : 'pas encore vue'}`} onClick={() => toggle(t)}>
                      {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {t.seen_at ? `✓ Vue le ${ddmm(t.seen_at)}` : '○ Vue'}
                    </button>
                  </div>
                  {isPlaying && t.video_path && (
                    <div className="bt-tr-player"><TrainingVideoPlayer companyId={companyId} path={t.video_path} title={t.title} /></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
