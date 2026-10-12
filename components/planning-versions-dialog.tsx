'use client';

// Lot 8 — « Versions du planning » de la semaine affichée (BUREAU seulement).
//
//  · la liste : V1 initiale, essais de l'assistant (date, auteur, demande),
//    versions gardées à la main, état gardé avant un retour en arrière ;
//  · « Voir » : ce que le retour changerait, lu en base, RIEN n'est écrit —
//    « 12 cases remises, 3 retirées, 2 gardées (heures déjà notées) » et le détail ;
//  · « Revenir à cette version » : toujours APRÈS cet aperçu et une
//    confirmation ; l'état actuel est d'abord gardé comme nouvelle version, puis
//    seules les cases du planning bougent (jamais les heures ni les absences) ;
//    juste après : « Annuler » (= revenir à l'état gardé juste avant) ;
//  · « Garder cette version » : discret, sans demande.
//
// Chargé seulement quand on l'ouvre (next/dynamic chez l'appelant). Les écritures :
// lib/planning-versions.ts, avec les droits du bureau connecté. Pendant un retour,
// la fenêtre ne se ferme pas et aucun second clic n'est pris en compte ; si le
// planning a bougé depuis l'aperçu, rien n'est fait et l'aperçu est refait.

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Loader2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  listVersions, previewRestore, restoreVersion, saveVersion, type PlanningVersion, type RestorePreview, type VersionCell,
} from '@/lib/planning-versions';
import { nothingToDo, versionSize, versionTitle } from '@/supabase/functions/_shared/planning-versions';
import { dayLabel, hhmm, whenLabel } from '@/supabase/functions/_shared/traces';

export interface VersionNames { users: Record<string, string>; worksites: Record<string, string> }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  /** Le bureau connecté. */
  userId: string;
  /** Le lundi de la semaine affichée (aaaa-mm-jj). */
  monday: string;
  /** « 12–18 oct. » */
  weekLabel: string;
  names: VersionNames;
  /** Le planning a changé (retour, Annuler) : l'écran relit la semaine. */
  onChanged: () => void;
}

const PV_CSS = `
.bt-pv{overflow-x:hidden}
.bt-pv-body{display:grid;gap:12px;min-width:0}
.bt-pv-note{font-size:12.5px;color:#6b6459;font-weight:600;line-height:1.45;margin:0}
.bt-pv-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bt-pv-keep{border:none;background:none;padding:0;color:#56514a;font:inherit;font-size:12.5px;font-weight:700;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.bt-pv-keep:disabled{opacity:.45;cursor:default}
.bt-pv-list{border:1px solid rgba(21,18,15,.1);border-radius:13px;overflow:hidden;background:#fff}
.bt-pv-item{padding:10px 12px;border-top:1px solid rgba(21,18,15,.06);min-width:0}
.bt-pv-item:first-child{border-top:0}
.bt-pv-item.on{background:#FBF8F2}
.bt-pv-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
.bt-pv-title{font-weight:800;font-size:13.5px;color:#15120F}
.bt-pv-when{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#9a948a;white-space:nowrap}
.bt-pv-who{font-size:12px;color:#6b6459;font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.bt-pv-req{font-size:12.5px;color:#3a352f;font-style:italic;margin:5px 0 0;overflow-wrap:anywhere;line-height:1.4}
.bt-pv-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.bt-pv-prev{margin-top:9px;border:1px solid rgba(21,18,15,.12);border-radius:11px;background:#fff;padding:9px 10px}
.bt-pv-sum{font-size:13px;font-weight:800;color:#15120F;margin:0}
.bt-pv-grp{margin-top:7px}
.bt-pv-grp b{display:block;font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#6E6A63;margin-bottom:2px}
.bt-pv-grp ul{margin:0;padding:0 0 0 16px;font-size:12.5px;line-height:1.45;color:#15120F}
.bt-pv-grp.kept b{color:#0F7A43}
.bt-pv-grp.out b{color:#9a3b14}
.bt-pv-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:9px}
.bt-pv-res{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;border-radius:11px;padding:9px 11px;font-size:13px;font-weight:700;line-height:1.4}
.bt-pv-res.ok{background:#F2FBF5;border:1px solid rgba(15,122,67,.25);color:#0F5F35}
.bt-pv-res.ko{background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00}
.bt-pv-empty{text-align:center;color:#9a948a;font-weight:600;padding:22px 0;font-size:13.5px}
`;
// Objet FIXE (règle anti-flash du lot 10).
const PV_HTML = { __html: PV_CSS };
const MAX_LINES = 8;

export default function PlanningVersionsDialog({ open, onOpenChange, weekLabel, ...rest }: Props) {
  // Un retour en cours : la fenêtre reste ouverte jusqu'au message final.
  const working = useRef(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && working.current) return; onOpenChange(o); }}>
      <DialogContent className="bt-skin bt-pv max-w-2xl max-h-[86vh] overflow-y-auto overflow-x-hidden" data-testid="versions-dialog">
        <style dangerouslySetInnerHTML={PV_HTML} />
        <DialogHeader>
          <DialogTitle>Versions du planning · {weekLabel}</DialogTitle>
        </DialogHeader>
        {/* Le contenu n'existe que fenêtre ouverte : chaque ouverture relit la base. */}
        {open && <VersionsBody key={rest.monday} working={working} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

type Result = { ok: boolean; message: string; undo: PlanningVersion | null; undone?: boolean; after?: string };

function VersionsBody({ companyId, userId, monday, names, onChanged, working }: Omit<Props, 'open' | 'onOpenChange' | 'weekLabel'> & { working: { current: boolean } }) {
  const [list, setList] = useState<PlanningVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<{ v: PlanningVersion; prev: RestorePreview | null; err: string | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const focusConfirm = useRef(false);
  const seq = useRef(0); // le dernier « Voir » gagne
  // Une opération à la fois (retour, annulation, « Garder ») : un second clic, même très rapide, est ignoré.
  const lock = async (name: string, run: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(name);
    try { await run(); } finally { working.current = false; setBusy(null); }
  };

  const load = useCallback(async () => {
    try { setList(await listVersions(companyId, monday)); setFailed(false); } catch { setFailed(true); }
  }, [companyId, monday]);
  useEffect(() => { setList(null); load(); }, [load, retry]);
  useEffect(() => { if (sel?.prev && focusConfirm.current) { focusConfirm.current = false; confirmRef.current?.focus(); } }, [sel]);

  const who = (id: string | null) => (id ? names.users[id] ?? 'Quelqu’un du bureau' : 'Automatique');
  const line = (c: VersionCell) => [names.users[c.user_id] ?? 'Salarié', dayLabel(c.work_date), c.worksite_id ? names.worksites[c.worksite_id] ?? 'Chantier' : 'Sans chantier',
    c.estimated_start ? `${hhmm(c.estimated_start)}${c.estimated_end ? `–${hhmm(c.estimated_end)}` : ''}` : '', c.notes ?? ''].filter(Boolean).join(' · ');

  const view = async (v: PlanningVersion, confirm = false) => {
    if (working.current) return;
    const mine = ++seq.current;
    focusConfirm.current = confirm;
    setResult(null);
    setSel({ v, prev: null, err: null });
    try {
      const prev = await previewRestore(companyId, monday, v);
      if (mine === seq.current) setSel({ v, prev, err: null });
    } catch (e) {
      if (mine === seq.current) setSel({ v, prev: null, err: (e as { message?: string })?.message || 'Lecture impossible.' });
    }
  };

  const restore = (v: PlanningVersion, expect: string) => lock('restore', async () => {
    const r = await restoreVersion({ companyId, userId, monday, version: v, expect });
    if (r.stale) {
      // Le planning a bougé depuis l'aperçu : rien n'a été fait, on montre le nouvel aperçu.
      ++seq.current;
      setSel({ v, prev: r.stale, err: null });
      setResult({ ok: false, message: r.message, undo: null });
      return;
    }
    setSel(null);
    setResult({ ok: r.ok, message: r.message, undo: r.saved, after: r.after });
    onChanged();
    await load();
  });
  const undo = (saved: PlanningVersion, after?: string) => lock('undo', async () => {
    const r = await restoreVersion({ companyId, userId, monday, version: saved, label: 'Annulé', ifStateIs: after });
    if (r.stale) {
      // Le planning a bougé depuis le retour : « Annuler » ne part plus en un clic, on montre ce qu'il changerait.
      ++seq.current;
      setSel({ v: saved, prev: r.stale, err: null });
      setResult({ ok: false, message: r.message, undo: null });
      return;
    }
    // Échec à mi-chemin : « Annuler » reprend là où on en était.
    setResult({ ok: r.ok, message: r.message, undo: r.ok ? null : saved, undone: r.ok, after: r.after });
    onChanged();
    await load();
  });
  const keep = () => lock('keep', async () => {
    setResult(null);
    try {
      const v = await saveVersion(companyId, monday, 'manuel');
      setResult({ ok: true, message: `Version gardée : V${v.number}.`, undo: null });
    } catch (e) {
      setResult({ ok: false, message: `Version non gardée : ${(e as { message?: string })?.message || 'erreur'}.`, undo: null });
    }
    await load();
  });

  const group = (title: string, items: string[], cls = '') => (items.length ? (
    <div className={`bt-pv-grp ${cls}`}>
      <b>{title}</b>
      <ul>{items.slice(0, MAX_LINES).map((t, i) => <li key={i}>{t}</li>)}{items.length > MAX_LINES && <li>+ {items.length - MAX_LINES} autre{items.length - MAX_LINES > 1 ? 's' : ''}</li>}</ul>
    </div>
  ) : null);

  return (
    <div className="bt-pv-body">
      <div className="bt-pv-top">
        <p className="bt-pv-note">L’assistant garde une version chaque fois qu’il change le planning de la semaine. Revenir à une version ne touche jamais aux heures ni aux absences.</p>
        <button type="button" className="bt-pv-keep" onClick={keep} disabled={!!busy} data-testid="versions-keep">
          {busy === 'keep' ? 'Enregistrement…' : 'Garder cette version'}
        </button>
      </div>

      {result && (
        <div className={`bt-pv-res ${result.ok ? 'ok' : 'ko'}`} role="status" data-testid="versions-result">
          <span>{result.undone ? <Undo2 className="inline h-4 w-4 mr-1" /> : null}{result.message}</span>
          {result.undo && (
            <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => undo(result.undo!, result.after)} data-testid="versions-undo">
              {busy === 'undo' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Undo2 className="h-4 w-4" />} Annuler
            </Button>
          )}
        </div>
      )}

      {list === null && !failed ? (
        <div className="bt-pv-empty"><Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" /> Chargement…</div>
      ) : failed ? (
        <div className="bt-pv-res ko" role="alert">
          Impossible de charger les versions.
          <Button type="button" size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Réessayer</Button>
        </div>
      ) : !list!.length ? (
        <div className="bt-pv-empty" data-testid="versions-empty">
          <History className="inline h-4 w-4 mr-1" /> Aucune version pour cette semaine. Elles apparaissent quand l’assistant change le planning, ou avec « Garder cette version ».
        </div>
      ) : (
        <div className="bt-pv-list" data-testid="versions-list">
          {list!.map((v) => {
            const on = sel?.v.id === v.id;
            const p = on ? sel!.prev : null;
            return (
              <div key={v.id} className={`bt-pv-item${on ? ' on' : ''}`} data-testid="versions-item">
                <div className="bt-pv-h">
                  <span className="bt-pv-title">{versionTitle(v)}</span>
                  <span className="bt-pv-when">{whenLabel(v.created_at)}</span>
                </div>
                <div className="bt-pv-who">par <b>{who(v.created_by)}</b> · {versionSize(v.cells)}</div>
                {v.request && <p className="bt-pv-req" data-testid="versions-request">« {v.request} »</p>}
                {v.kind === 'assistant' && v.note && <p className="bt-pv-who" data-testid="versions-note">{v.note}</p>}
                {!on && (
                  <div className="bt-pv-act">
                    <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => view(v)} data-testid="versions-view">Voir</Button>
                    <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => view(v, true)} data-testid="versions-restore">Revenir à cette version</Button>
                  </div>
                )}
                {on && (
                  <div className="bt-pv-prev" data-testid="versions-preview">
                    {sel!.err ? <p className="bt-pv-sum">{sel!.err}</p> : !p ? (
                      <p className="bt-pv-note"><Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" /> Je compare avec le planning actuel…</p>
                    ) : (<>
                      <p className="bt-pv-sum" data-testid="versions-summary">{nothingToDo(p.counts) ? p.summary : `Revenir à la V${v.number} : ${p.summary}`}</p>
                      {group('Remises', p.plan.add.map((a) => line(a.cell)))}
                      {group('Retirées', p.plan.remove.map(line), 'out')}
                      {group('Modifiées', p.plan.update.map((u) => `${line(u.from)} → ${line(u.to)}`))}
                      {group('Gardées comme maintenant', p.plan.kept.map((k) => `${line(k.cell)} (${k.reason})`), 'kept')}
                      {group('Non remises', p.plan.skipped.map((k) => `${line(k.cell)} (${k.reason})`))}
                      {!nothingToDo(p.counts) && <p className="bt-pv-note" style={{ marginTop: 8 }}>Le planning actuel est d’abord gardé comme nouvelle version. Rien n’est fait avant de confirmer. « Annuler » restera possible juste après.</p>}
                    </>)}
                    <div className="bt-pv-foot">
                      <Button type="button" size="sm" variant="ghost" disabled={busy === 'restore'} onClick={() => { ++seq.current; setSel(null); }} data-testid="versions-cancel">Garder comme maintenant</Button>
                      {p && !nothingToDo(p.counts) && (
                        <Button ref={confirmRef} type="button" size="sm" disabled={!!busy} onClick={() => restore(v, p.sig)} data-testid="versions-confirm">
                          {busy === 'restore' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Revenir à la V{v.number}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="bt-pv-note">Réservé au bureau. Une version ne se modifie pas et ne s’efface pas ; les demandes faites à l’assistant sont gardées 12 mois.</p>
    </div>
  );
}
