'use client';

// Lot 3 — « Interventions supprimées (ou décalées) ». LECTURE SEULE : aucune
// restauration ici (elle viendra avec les versions du planning, lot 8).
//
//  · salarié (`office` faux) : les 60 derniers jours de SON planning, de ses
//    heures, de ses tâches et réunions — quoi, quand, par qui, avant → après ;
//  · bureau : toute l'entreprise, filtrable par salarié et par période
//    (semaine / mois), avec l'auteur et l'origine (écran, assistant…).
//
// Chargé seulement quand on l'ouvre (next/dynamic chez l'appelant). Les traces
// viennent de la base (lib/traces.ts) ; la mise en forme de
// supabase/functions/_shared/traces.ts (testée sous Deno).

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchTraces, type TracesResult } from '@/lib/traces';
import {
  daysAgoISO, isSystemTrace, ORIGIN_LABEL, traceChange, traceConcerned, traceTitle, traceWho, whenLabel, WORKER_DAYS, type TraceRow,
} from '@/supabase/functions/_shared/traces';
import { isFuturePeriod, periodFor, periodLabel, shiftPeriod, type Period } from '@/supabase/functions/_shared/team-stats-core';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  /** La personne connectée (« vous »). */
  viewerId: string;
  /** Bureau : filtres, auteurs nommés, origine. Sinon : vue du salarié. */
  office?: boolean;
  /** Bureau : la liste du filtre « salarié » (les vrais comptes, jamais la démo). */
  workers?: { id: string; first_name: string; last_name: string }[];
}

const TR_CSS = `
.bt-tr{overflow-x:hidden}
.bt-tr-body{display:grid;gap:12px;min-width:0}
.bt-tr-note{font-size:12.5px;color:#6b6459;font-weight:600;line-height:1.45;margin:0}
.bt-tr-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bt-tr-sel{border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:9px;padding:5px 8px;font:inherit;font-size:13px;font-weight:700;color:#15120F;max-width:100%;min-width:0}
.bt-tr-seg{display:inline-flex;gap:4px}
.bt-tr-nav{display:inline-flex;align-items:center;gap:4px;margin-left:auto;min-width:0}
.bt-tr-navbtn{width:30px;height:30px;flex:none;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#fff;color:#15120F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.bt-tr-navbtn:hover:not(:disabled){border-color:#15120F}
.bt-tr-navbtn:disabled{opacity:.35;cursor:default}
.bt-tr-label{min-width:0;padding:0 4px;text-align:center;font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-tr-label::first-letter{text-transform:uppercase}
.bt-tr-list{border:1px solid rgba(21,18,15,.1);border-radius:13px;overflow:hidden;background:#fff}
.bt-tr-item{padding:10px 12px;border-top:1px solid rgba(21,18,15,.06);min-width:0}
.bt-tr-item:first-child{border-top:0}
.bt-tr-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bt-tr-title{font-weight:800;font-size:13.5px;color:#15120F}
.bt-tr-title .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;vertical-align:1px;background:#B5472E}
.bt-tr-title .dot.moved{background:#C98A12}
.bt-tr-title .dot.back{background:#1F7A4D}
.bt-tr-when{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#9a948a;white-space:nowrap}
.bt-tr-who{font-size:12px;color:#6b6459;font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.bt-tr-who b{color:#3a352f;font-weight:800}
.bt-tr-tag{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;background:#F1E8D6;color:#6b5a2e;border-radius:6px;padding:1px 5px;margin-left:6px;white-space:nowrap}
.bt-tr-chg{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;margin-top:6px;font-size:12.5px;line-height:1.4}
.bt-tr-chg span{color:#9a948a;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding-top:1px}
.bt-tr-chg p{margin:0;color:#15120F;font-weight:600;overflow-wrap:anywhere;min-width:0}
.bt-tr-chg p.old{color:#6b6459;text-decoration:line-through;text-decoration-color:rgba(181,71,46,.55)}
.bt-tr-empty{text-align:center;color:#9a948a;font-weight:600;padding:26px 0;font-size:13.5px}
.bt-tr-ko{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00;border-radius:10px;padding:8px 11px;font-size:12.5px;font-weight:600}
@media (max-width:639px){ .bt-tr-nav{margin-left:0;width:100%;justify-content:space-between} .bt-tr-sel{flex:1 1 100%} }
`;
// Objet FIXE (règle anti-flash du lot 10).
const TR_HTML = { __html: TR_CSS };

const todayISO = () => format(new Date(), 'yyyy-MM-dd');
const dotClass = (t: TraceRow) => (t.action === 'remise' ? 'dot back' : t.action === 'supprimee' || t.action === 'retiree' ? 'dot' : 'dot moved');

export default function TracesDialog({ open, onOpenChange, companyId, viewerId, office = false, workers = [] }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin bt-tr max-w-2xl max-h-[86vh] overflow-y-auto overflow-x-hidden" data-testid="traces-dialog">
        <style dangerouslySetInnerHTML={TR_HTML} />
        <DialogHeader>
          <DialogTitle>{office ? 'Interventions supprimées ou décalées' : 'Interventions supprimées'}</DialogTitle>
        </DialogHeader>
        {/* Le contenu n'existe que fenêtre ouverte : chaque ouverture relit la base. */}
        {open && <TracesBody companyId={companyId} viewerId={viewerId} office={office} workers={workers} />}
      </DialogContent>
    </Dialog>
  );
}

function TracesBody({ companyId, viewerId, office, workers }: Omit<Props, 'open' | 'onOpenChange'> & { office: boolean; workers: NonNullable<Props['workers']> }) {
  const [today] = useState(todayISO);
  const [period, setPeriod] = useState<Period>(() => periodFor('week', today));
  const [who, setWho] = useState<string>('');
  const [res, setRes] = useState<TracesResult | null>(null);
  const [retry, setRetry] = useState(0);
  // Salarié : les 60 derniers jours. Bureau : la période choisie.
  const range = useMemo(() => (office ? { from: period.from, to: period.to } : { from: daysAgoISO(today, WORKER_DAYS), to: today }), [office, period, today]);

  useEffect(() => {
    let stale = false;
    setRes(null);
    fetchTraces({ companyId, from: range.from, to: range.to, ...(office ? { userId: who || null } : { mine: viewerId }) })
      .then((r) => { if (!stale) setRes(r); });
    return () => { stale = true; };
  }, [companyId, viewerId, office, range, who, retry]);

  const sorted = useMemo(() => [...workers].sort((a, z) => `${a.first_name} ${a.last_name}`.localeCompare(`${z.first_name} ${z.last_name}`, 'fr')), [workers]);
  const viewer = { id: viewerId, office };

  return (
    <div className="bt-tr-body">
      {office ? (
        <div className="bt-tr-ctl">
          <select className="bt-tr-sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Salarié" data-testid="traces-worker">
            <option value="">Tous les salariés</option>
            {sorted.map((w) => <option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>)}
          </select>
          <div className="bt-tr-seg" role="group" aria-label="Période">
            {(['week', 'month'] as const).map((k) => (
              <Button key={k} type="button" size="sm" variant={period.kind === k ? 'default' : 'outline'} aria-pressed={period.kind === k}
                onClick={() => setPeriod(periodFor(k, today))}>{k === 'week' ? 'Semaine' : 'Mois'}</Button>
            ))}
          </div>
          <div className="bt-tr-nav">
            <button type="button" className="bt-tr-navbtn" aria-label="Période précédente" onClick={() => setPeriod(shiftPeriod(period, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <span className="bt-tr-label" data-testid="traces-period">{periodLabel(period)}</span>
            <button type="button" className="bt-tr-navbtn" aria-label="Période suivante" disabled={isFuturePeriod(shiftPeriod(period, 1), today)}
              onClick={() => setPeriod(shiftPeriod(period, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      ) : (
        <p className="bt-tr-note">Les {WORKER_DAYS} derniers jours : ce qui a été supprimé ou décalé dans votre planning et vos heures.</p>
      )}

      {res === null ? (
        <div className="bt-tr-empty"><Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" /> Chargement…</div>
      ) : !res.ok ? (
        <div className="bt-tr-ko" role="alert">
          Impossible de charger la liste.
          <Button type="button" size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Réessayer</Button>
        </div>
      ) : res.rows.length === 0 ? (
        <div className="bt-tr-empty" data-testid="traces-empty">Rien de supprimé ni de décalé sur cette période.</div>
      ) : (
        <div className="bt-tr-list" data-testid="traces-list">
          {res.rows.map((t) => {
            const chg = traceChange(t, res.names);
            const concerned = office ? traceConcerned(t, res.names) : '';
            return (
              <div key={t.id} className="bt-tr-item" data-testid="traces-item">
                <div className="bt-tr-top">
                  <span className="bt-tr-title"><span className={dotClass(t)} aria-hidden="true" />{traceTitle(t)}{concerned ? ` — ${concerned}` : ''}</span>
                  <span className="bt-tr-when">{whenLabel(t.created_at)}</span>
                </div>
                <div className="bt-tr-who">
                  {isSystemTrace(t) ? <b>{traceWho(t, viewer, res.names)}</b> : <>par <b>{traceWho(t, viewer, res.names)}</b></>}
                  {office && <span className="bt-tr-tag">{ORIGIN_LABEL[t.origin] || t.origin}</span>}
                </div>
                {(chg.before || chg.after) && (
                  <div className="bt-tr-chg">
                    {chg.before && <><span>{chg.after ? 'Avant' : 'Était'}</span><p className={chg.after ? undefined : 'old'}>{chg.before}</p></>}
                    {chg.after && <><span>{chg.before ? 'Après' : 'Remis'}</span><p>{chg.after}</p></>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="bt-tr-note">Lecture seule. {office ? 'Le salarié voit les lignes qui le concernent dans son Historique.' : 'Une question ? Voyez avec le bureau.'}</p>
    </div>
  );
}
