'use client';

// Réglages → « Support BEMEXO » (lot 5). N'existe que si BEMEXO a activé
// `support_enabled` pour l'entreprise. UN bouton pour autoriser (avec une
// durée), UN bouton pour retirer, et le journal de tout ce qui s'est passé.
//
// Les droits sont vérifiés par la base : ce composant n'affiche que l'état.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, LifeBuoy, ShieldCheck } from 'lucide-react';
import {
  describeEvent, fmtDateTime, SUPPORT_DURATIONS, type SupportAdminSource, type SupportHours, type SupportState,
} from '@/lib/support';

const CSS = `
.sa{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:12px;padding:12px 14px;margin-top:4px}
.sa-top{display:flex;gap:10px;align-items:flex-start}
.sa-ico{width:30px;height:30px;flex:none;border-radius:9px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center}
.sa-l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin:0 0 3px;display:block}
.sa-txt{font-size:13px;color:#56514a;font-weight:600;margin:0;line-height:1.45;max-width:52ch}
.sa-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.sa select{font-family:inherit;font-size:13.5px;font-weight:700;border:1.5px solid rgba(21,18,15,.16);border-radius:9px;padding:7px 9px;background:#fff;color:#15120F}
.sa-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#15120F;color:#FBF8F2;border-radius:9px;padding:8px 12px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit}
.sa-btn.ghost{background:#fff;color:#C0461F;border-color:rgba(192,70,31,.45)}
.sa-btn:disabled{opacity:.5;cursor:default}
.sa-on{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:#0F7A43}
.sa-err{font-size:12.5px;color:#9a3b14;font-weight:700;margin:8px 0 0}
.sa-log{margin:12px 0 0;padding:10px 0 0;border-top:1px solid rgba(21,18,15,.08)}
.sa-log ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:5px;max-height:180px;overflow-y:auto}
.sa-log li{display:flex;gap:10px;font-size:12.5px;color:#15120F;line-height:1.35}
.sa-log time{flex:none;width:112px;color:#6E6A63;font-weight:700}
.sa-empty{font-size:12.5px;color:#9a948a;margin:6px 0 0}
`;

interface Props { source: SupportAdminSource }

export default function SupportAccess({ source }: Props) {
  const [state, setState] = useState<SupportState | null>(null);
  const [hours, setHours] = useState<SupportHours>(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => { setState(await source.load()); }, [source]);
  useEffect(() => { reload(); }, [reload]);

  // L'accès s'éteint tout seul à l'heure dite : l'écran suit sans recharger.
  useEffect(() => {
    if (!state?.grant) return;
    const ms = new Date(state.grant.expires_at).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(reload, Math.min(ms + 500, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [state?.grant, reload]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="sa" data-testid="support-access">
      <style>{CSS}</style>
      <div className="sa-top">
        <span className="sa-ico"><LifeBuoy className="h-4 w-4" /></span>
        <div>
          <label className="sa-l">Support BEMEXO</label>
          <p className="sa-txt">
            Autorisez l’équipe BEMEXO à consulter votre espace pour vous aider. <strong>Lecture seule</strong> :
            rien ne peut être modifié. L’accès s’arrête tout seul, et vous pouvez le retirer à tout moment.
          </p>
        </div>
      </div>

      {!state ? (
        <div className="sa-row"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : state.grant ? (
        <div className="sa-row">
          <span className="sa-on"><ShieldCheck className="h-4 w-4" /> Autorisé jusqu’au {fmtDateTime(state.grant.expires_at)}</span>
          <button type="button" className="sa-btn ghost" disabled={busy} onClick={() => act(() => source.revoke())} data-testid="support-revoke">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Retirer l’accès
          </button>
        </div>
      ) : (
        <div className="sa-row">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value) as SupportHours)} aria-label="Durée de l’accès">
            {SUPPORT_DURATIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
          </select>
          <button type="button" className="sa-btn" disabled={busy} onClick={() => act(() => source.grant(hours))} data-testid="support-grant">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Autoriser le support BEMEXO
          </button>
        </div>
      )}
      {err && <p className="sa-err">{err}</p>}

      {state && (
        <div className="sa-log">
          <label className="sa-l">Journal des accès</label>
          {state.log.length === 0 ? <p className="sa-empty">Aucun accès pour l’instant.</p> : (
            <ul data-testid="support-log">
              {state.log.map((r) => <li key={r.id}><time dateTime={r.at}>{fmtDateTime(r.at)}</time><span>{describeEvent(r)}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
