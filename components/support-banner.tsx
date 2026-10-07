'use client';

// Bandeau du MODE SUPPORT (lot 5) : impossible à manquer, impossible à
// oublier. Il rappelle chez qui on est, que c'est en lecture seule, quand ça
// s'arrête, et offre « Quitter ». Hors mode support, ce composant ne rend rien.

import { useEffect, useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import { readSupportSession, supportExit, supportStillValid, type SupportSession } from '@/lib/support';

const CSS = `
.sb{position:sticky;top:0;z-index:90;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#C0461F;color:#fff;padding:9px 16px;font-size:13.5px;font-weight:700;box-shadow:0 4px 14px rgba(21,18,15,.18)}
.sb b{font-weight:900}
.sb .sb-tag{background:#fff;color:#C0461F;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.sb .sb-sp{flex:1}
.sb button{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #fff;background:transparent;color:#fff;border-radius:9px;padding:5px 11px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit}
`;

const hhmm = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? t : `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à ${t}`;
};

export function SupportBannerView({ name, expiresAt, onExit }: { name: string; expiresAt: string; onExit: () => void }) {
  return (
    <div className="sb" role="status" data-testid="support-banner">
      <style>{CSS}</style>
      <Eye className="h-4 w-4" />
      <span className="sb-tag">Mode support</span>
      <span><b>{name}</b> · lecture seule · expire à {hhmm(expiresAt)}</span>
      <span className="sb-sp" />
      <button type="button" onClick={onExit}><LogOut className="h-3.5 w-3.5" /> Quitter</button>
    </div>
  );
}

/** Version branchée : lit le mode support, le revérifie auprès de la base, gère la sortie. */
export default function SupportBanner() {
  const [s, setS] = useState<SupportSession | null>(null);

  useEffect(() => {
    const cur = readSupportSession();
    setS(cur);
    if (!cur) return;
    let stale = false;
    // Autorisation retirée ou expirée entre-temps : on sort (sans rien noter).
    supportStillValid(cur.companyId).then((ok) => {
      if (!stale && !ok) supportExit(cur.companyId, false).then(() => window.location.assign('/support'));
    });
    const ms = new Date(cur.expiresAt).getTime() - Date.now();
    const t = setTimeout(() => { supportExit(cur.companyId).then(() => window.location.assign('/support')); }, Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => { stale = true; clearTimeout(t); };
  }, []);

  if (!s) return null;
  return (
    <SupportBannerView
      name={s.name} expiresAt={s.expiresAt}
      onExit={() => { supportExit(s.companyId).then(() => window.location.assign('/support')); }}
    />
  );
}
