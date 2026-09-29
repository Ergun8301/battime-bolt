'use client';

// Lot 7 — ce que l'assistant affiche APRÈS avoir fait une action directe :
// « ✅ Fait » + « Annuler » (vraie annulation : on défait ce qui a été écrit)
// + « Modifier » (on rouvre la fiche, « Enregistrer » remplace). Et, s'il
// manquait une info, UNE question courte avec ses choix. Partagé bureau / salarié.

import { useState } from 'react';
import { CheckCircle2, Loader2, Undo2, Pencil, HelpCircle } from 'lucide-react';

const CSS = `
.ad{margin-top:10px;border:1px solid rgba(15,122,67,.25);border-radius:14px;background:#F2FBF5;padding:10px 11px}
.ad-m{display:flex;align-items:flex-start;gap:8px;color:#0F7A43;font-weight:800;font-size:13.5px;line-height:1.4}
.ad-m svg{flex:none;margin-top:1px}
.ad-s{font-size:12.5px;color:#15120F;font-weight:600;margin:4px 0 0 26px;line-height:1.4}
.ad-b{display:flex;gap:8px;margin:9px 0 0 26px;flex-wrap:wrap}
.ad-b button{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(21,18,15,.16);background:#fff;color:#15120F;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit}
.ad-b button:disabled{opacity:.45;cursor:default}
.ad-u{display:flex;align-items:center;gap:8px;color:#56514a;font-weight:800;font-size:13px;margin-top:10px}
.ad-e{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0 26px}
.aq{margin-top:10px;border:1px solid rgba(21,18,15,.12);border-radius:14px;background:#FBF8F2;padding:10px 11px}
.aq-t{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:#15120F}
.aq-c{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.aq-c button{border:1px solid rgba(21,18,15,.16);background:#fff;border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:700;color:#15120F;cursor:pointer;font-family:inherit}
.aq-c button:hover{border-color:#15120F}
.aq-h{font-size:12px;color:#6E6A63;margin:7px 0 0}
`;

export interface UndoResult { ok: boolean; message: string }

export function ActionDone({ message, summary, undo, onEdit }: {
  message: string; summary?: string; undo?: () => Promise<UndoResult>; onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (undone) return <div className="ad-u" data-testid="action-undone"><style>{CSS}</style><Undo2 className="h-4 w-4" /> {undone}</div>;
  return (
    <div className="ad" data-testid="action-done">
      <style>{CSS}</style>
      <p className="ad-m"><CheckCircle2 className="h-[18px] w-[18px]" /> Fait — {message}</p>
      {summary && <p className="ad-s">{summary}</p>}
      {err && <p className="ad-e">{err}</p>}
      {(undo || onEdit) && (
        <div className="ad-b">
          {undo && (
            <button type="button" disabled={busy} data-testid="action-undo" onClick={async () => {
              setBusy(true); setErr(null);
              const r = await undo();
              setBusy(false);
              if (r.ok) setUndone(r.message); else setErr(r.message);
            }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Annuler
            </button>
          )}
          {onEdit && <button type="button" disabled={busy} data-testid="action-edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Modifier</button>}
        </div>
      )}
    </div>
  );
}

export function ActionAsk({ text, chips, onPick }: { text: string; chips: { label: string; value: string }[]; onPick: (value: string) => void }) {
  return (
    <div className="aq" data-testid="action-question">
      <style>{CSS}</style>
      <p className="aq-t"><HelpCircle className="h-4 w-4" /> {text}</p>
      {chips.length > 0 && (
        <div className="aq-c">{chips.map((c) => <button type="button" key={c.value} onClick={() => onPick(c.value)}>{c.label}</button>)}</div>
      )}
      <p className="aq-h">{chips.length ? 'Touchez un choix, ou répondez ci-dessous.' : 'Répondez ci-dessous, à l’écrit ou à voix haute.'}</p>
    </div>
  );
}
