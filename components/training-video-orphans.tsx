'use client';

// Fichiers vidéo à vérifier (lot 14, oct. 2026) — LECTURE SEULE, sous la liste des
// formations (components/trainings-admin.tsx). Montre (a) les fichiers du dossier
// privé sans formation, (b) les formations publiées dont le fichier manque.
// AUCUN bouton d'action : rien n'est supprimé sans l'accord d'Ergun (D12). Chargé
// à la demande (next/dynamic) et seulement quand il y a quelque chose à montrer.
import { useState } from 'react';
import {
  AUDIT_BYTES, AUDIT_LINK, AUDIT_MISSING_NOTE, AUDIT_MISSING_ROW, AUDIT_MISSING_TITLE, AUDIT_MORE, AUDIT_NOTE, AUDIT_ORPHAN_ROW, AUDIT_ORPHANS_NOTE, AUDIT_ORPHANS_TITLE,
  type FileAudit, type FileAuditRow,
} from '@/supabase/functions/_shared/training-videos';

/** Lignes montrées par sorte ; le reste tient en « + N autres ». */
const SHOWN = 5;

const CSS = `
.bt-fo-audit{display:flex;flex-direction:column;gap:8px}
.bt-fo-audit .bt-fo-link{display:inline-flex;align-items:center;min-height:44px}
.bt-fo-audit-box{display:flex;flex-direction:column;gap:8px;border:1px solid rgba(21,18,15,.12);border-radius:12px;padding:10px;background:#FBF8F2}
.bt-fo-audit-sec{display:flex;flex-direction:column;gap:4px;min-width:0}
.bt-fo-audit-h{font-size:12.5px;font-weight:800;color:#15120F}
.bt-fo-audit-rows{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.bt-fo-audit-rows li{font-size:12.5px;font-weight:600;color:#15120F;overflow-wrap:anywhere}
`;
const CSS_HTML = { __html: CSS };

function Section({ title, note, rows, total, render, footer }: {
  title: string; note: string; rows: FileAuditRow[]; total: number; render: (r: FileAuditRow) => string; footer?: string;
}) {
  if (total <= 0 && rows.length === 0) return null;
  const more = Math.max(0, total - Math.min(rows.length, SHOWN));
  return (
    <section className="bt-fo-audit-sec">
      <h4 className="bt-fo-audit-h">{title}</h4>
      <p className="bt-fo-muted">{note}</p>
      <ul className="bt-fo-audit-rows">
        {rows.slice(0, SHOWN).map((r) => <li key={`${r.kind}-${r.file_path}`} data-testid="tr-audit-row">{render(r)}</li>)}
      </ul>
      {more > 0 && <span className="bt-fo-muted">{AUDIT_MORE(more)}</span>}
      {footer && <span className="bt-fo-muted">{footer}</span>}
    </section>
  );
}

export default function TrainingVideoOrphans({ audit, quotaBytes }: { audit: FileAudit; quotaBytes: number }) {
  const [open, setOpen] = useState(false);
  const total = audit.orphanTotal + audit.missingTotal;
  return (
    <div className="bt-fo-audit">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <button type="button" className="bt-fo-link" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="tr-audit-toggle">{AUDIT_LINK(total, open)}</button>
      {open && (
        <div className="bt-fo-audit-box" data-testid="tr-audit">
          <p className="bt-fo-muted">{AUDIT_NOTE}</p>
          <Section title={AUDIT_ORPHANS_TITLE(audit.orphanTotal)} note={AUDIT_ORPHANS_NOTE(quotaBytes)} rows={audit.orphans} total={audit.orphanTotal}
            render={AUDIT_ORPHAN_ROW} footer={AUDIT_BYTES(audit.orphanBytes)} />
          <Section title={AUDIT_MISSING_TITLE(audit.missingTotal)} note={AUDIT_MISSING_NOTE} rows={audit.missing} total={audit.missingTotal} render={AUDIT_MISSING_ROW} />
        </div>
      )}
    </div>
  );
}
