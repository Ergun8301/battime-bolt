'use client';

// Formations (lot 6, lot 13) — la LISTE du salarié, sortie de components/poseur-trainings.tsx pour être
// chargée à l'ouverture de l'onglet « Formations » (lazyWindow dans app/poseur/page.tsx) : le hook
// useMyTrainings et le bandeau restent, eux, dans le premier chargement. Comportement inchangé.
// Sa feuille de style est components/poseur-trainings.css (importée par app/poseur/layout.tsx).
import { useEffect, useRef, useState } from 'react';
import { CirclePlay, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { announceTrainingsChanged, setTrainingSeen, signTrainingDocs, type MyTraining } from '@/lib/trainings';
import { setVideoSeen } from '@/lib/training-videos';
import dynamic from 'next/dynamic';
import { PROVIDER_LABEL, providerOf, safeTrainingUrl } from '@/supabase/functions/_shared/trainings';
import { videoSummary } from '@/supabase/functions/_shared/training-videos';

/** « Vue » ne s'annule que 10 minutes (même règle que set_training_seen) : ensuite le bouton devient une simple mention. */
const SEEN_UNDO_MS = 10 * 60 * 1000;
const canUndoSeen = (seenAt: string) => Date.now() - new Date(seenAt).getTime() < SEEN_UNDO_MS;

// Lot 13 : le lecteur ne se charge qu'au premier « Regarder ».
const TrainingVideoPlayer = dynamic(() => import('@/components/training-video-player'), {
  ssr: false, loading: () => <p className="bt-tr-na"><Loader2 className="inline h-3 w-3 animate-spin motion-reduce:animate-none" /> Chargement…</p>,
});

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
