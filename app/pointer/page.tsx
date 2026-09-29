'use client';

// Ce qu'ouvre le QR de la borne sur le téléphone du salarié.
//
// Pas connecté → on garde le scan de côté, on passe par /connexion, et la
// connexion ramène ici automatiquement. Connecté → un seul appel au serveur,
// qui décide arrivée ou départ selon la même règle que l'écran du salarié.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { callKiosk, getPosition, PENDING_SCAN_KEY, readPendingScan } from '@/lib/kiosk';

type ScanOk = { status: 'ok' | 'duplicate'; direction: 'in' | 'out'; time: string; first_name?: string };
type View =
  | { k: 'loading'; label: string }
  | { k: 'done'; r: ScanOk }
  | { k: 'error'; msg: string };

const CSS = `
.kp{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 22px;text-align:center;font-family:inherit}
.kp.in{background:#0F7A43;color:#fff}
.kp.out{background:#15120F;color:#FBF8F2}
.kp.neutral{background:#FBF8F2;color:#15120F}
.kp-ico{width:104px;height:104px;margin-bottom:22px}
.kp-t{font-size:30px;font-weight:900;letter-spacing:-.02em;margin:0;line-height:1.15}
.kp-time{font-size:84px;font-weight:900;letter-spacing:-.04em;margin:10px 0 6px;font-variant-numeric:tabular-nums;line-height:1}
.kp-s{font-size:17px;font-weight:600;opacity:.85;margin:6px 0 0;max-width:32ch;line-height:1.45}
.kp-btn{margin-top:34px;border:none;border-radius:14px;padding:15px 26px;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit}
.kp.in .kp-btn{background:rgba(255,255,255,.18);color:#fff}
.kp.out .kp-btn{background:#FFC21A;color:#15120F}
.kp.neutral .kp-btn{background:#15120F;color:#FBF8F2}
`;

export default function PointerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>({ k: 'loading', label: 'Pointage en cours…' });
  const started = useRef(false);

  // Le scan arrive dans l'adresse ; on le met de côté AVANT toute redirection.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const b = q.get('b'), c = q.get('c');
    if (b && c) {
      try { sessionStorage.setItem(PENDING_SCAN_KEY, JSON.stringify({ b, c, at: Date.now() })); } catch { /* privé */ }
      window.history.replaceState(null, '', '/pointer');
    }
  }, []);

  useEffect(() => {
    if (loading || started.current) return;
    const pending = readPendingScan();
    if (!user) {
      if (pending) { router.replace('/connexion'); return; }
      setView({ k: 'error', msg: 'Scannez le QR affiché sur la borne pour pointer.' });
      return;
    }
    if (!pending) {
      setView({ k: 'error', msg: 'Scannez le QR affiché sur la borne pour pointer.' });
      return;
    }
    started.current = true;
    (async () => {
      const body = { action: 'scan', device_id: pending.b, code: pending.c };
      let r = await callKiosk<ScanOk>(body);
      // Option GPS de l'entreprise : la position n'est demandée QUE dans ce cas.
      if (!r.ok && r.reason === 'need_position') {
        setView({ k: 'loading', label: 'Vérification de votre position…' });
        const p = await getPosition(12_000);
        if (!p) {
          try { sessionStorage.removeItem(PENDING_SCAN_KEY); } catch { /* privé */ }
          setView({ k: 'error', msg: 'Autorisez la localisation pour pointer sur cette borne, puis rescannez le QR.' });
          return;
        }
        r = await callKiosk<ScanOk>({ ...body, lat: p.lat, lng: p.lng });
      }
      try { sessionStorage.removeItem(PENDING_SCAN_KEY); } catch { /* privé */ }
      if (!r.ok) setView({ k: 'error', msg: r.error });
      else setView({ k: 'done', r: r.data });
    })();
  }, [user, loading, router]);

  const home = () => router.push(user?.role === 'admin' ? '/admin' : '/poseur');

  if (view.k === 'loading') {
    return (
      <div className="kp neutral">
        <style>{CSS}</style>
        {view.label.includes('position') ? <MapPin className="kp-ico" strokeWidth={1.6} /> : <Loader2 className="kp-ico animate-spin" strokeWidth={1.6} />}
        <p className="kp-t">{view.label}</p>
      </div>
    );
  }

  if (view.k === 'error') {
    return (
      <div className="kp neutral">
        <style>{CSS}</style>
        <AlertTriangle className="kp-ico" strokeWidth={1.6} color="#C0461F" />
        <p className="kp-t">Pointage non enregistré</p>
        <p className="kp-s">{view.msg}</p>
        {user && <button type="button" className="kp-btn" onClick={home}>Mes heures</button>}
      </div>
    );
  }

  const { r } = view;
  const arrive = r.direction === 'in';
  return (
    <div className={`kp ${arrive ? 'in' : 'out'}`}>
      <style>{CSS}</style>
      <CheckCircle2 className="kp-ico" strokeWidth={1.6} />
      <p className="kp-t">{arrive ? 'Arrivée enregistrée' : 'Départ enregistré'}</p>
      <p className="kp-time">{r.time}</p>
      <p className="kp-s">
        {r.status === 'duplicate'
          ? 'Déjà pris en compte — inutile de rescanner.'
          : `${arrive ? 'Bonne journée' : 'Bonne fin de journée'}${r.first_name ? `, ${r.first_name}` : ''} !`}
      </p>
      <button type="button" className="kp-btn" onClick={home}>Voir mes heures</button>
    </div>
  );
}
