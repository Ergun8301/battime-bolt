'use client';

// Lot 23 : terminer un chantier, le rouvrir, et lire son BILAN (bureau).
//
// Fenêtre chargée à l'OUVERTURE (lib/lazy-window.tsx, lot 5) : rien de tout ça n'est dans le premier
// chargement, et rien n'est LU au chargement de la page — le contrôle avant de terminer et le bilan
// lisent ce dont ils ont besoin quand on les ouvre (lot 29 : pas de lecture de plus au démarrage).
//
// TERMINER ne supprime rien et ne modifie aucune heure : une date est posée sur le chantier (fonction
// du bureau, deux colonnes). Les avertissements (réserves non levées, pointages en cours, brouillons,
// interventions à venir) ne BLOQUENT jamais : « Terminer quand même ». Si le contrôle lui-même échoue,
// on le dit et on laisse terminer.
//
// LE BILAN est en LECTURE SEULE (aucun bouton d'écriture) et lisible sur téléphone : une colonne.
// Il n'invente aucun chiffre — voir lib/chantier-termine.ts et supabase/functions/_shared/chantier-termine.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import { loadBilan, loadFinishCheck, setWorksiteCompleted, type BilanData } from '@/lib/chantier-termine';
import {
  checkCompletionDate, finishButtonLabel, finishWarnings, fmtEur, fmtH, frDate, todayParis, type FinishCheck,
} from '@/supabase/functions/_shared/chantier-termine';
import { readSupportSession } from '@/lib/support';
import type { Worksite } from '@/lib/types';
import type { TermineMode } from '@/components/chantier-termine-bar';

export interface TermineTarget { ws: Worksite; mode: TermineMode }
interface Props {
  target: TermineTarget | null;
  companyId: string;
  onClose: () => void;
  /** Le statut a changé (terminé ou rouvert) : le bureau relit ses listes et met la fiche à jour. */
  onChanged: (patch: { completed_at: string | null; completed_by: string | null }) => void;
}

const CT_CSS = `
.bt-ct-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0}
.bt-ct-name{font-weight:900;font-size:15px;letter-spacing:-.01em;min-width:0;overflow-wrap:anywhere}
.bt-ct-city{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:600}
.bt-ct-chip{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;border-radius:99px;padding:3px 10px;background:#EFEDE8;color:#5c574f;white-space:nowrap}
.bt-ct-chip.done{background:#E3F1E9;color:#1F7A4D}
.bt-ct-sec{margin-top:10px;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:13px;padding:11px 13px;min-width:0}
.bt-ct-h{display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700;margin-bottom:6px}
.bt-ct-row{display:flex;align-items:baseline;gap:10px;font-size:13.5px;padding:3px 0;min-width:0}
.bt-ct-k{flex:1;min-width:0;color:#3a352f;font-weight:600;overflow-wrap:anywhere}
.bt-ct-v{flex:none;max-width:60%;text-align:right;font-weight:800;color:#15120F;overflow-wrap:anywhere}
.bt-ct-v.big{font-size:20px;font-weight:900;letter-spacing:-.02em}
.bt-ct-note{font-size:11.5px;color:#8a8378;font-weight:600;line-height:1.35;margin-top:2px}
.bt-ct-warn{display:flex;gap:7px;align-items:flex-start;background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00;border-radius:10px;padding:8px 11px;font-size:12.5px;font-weight:600;margin-top:8px}
.bt-ct-warn>span{min-width:0;overflow-wrap:anywhere}
.bt-ct-w{display:flex;gap:8px;align-items:flex-start;border:1px solid #F0C9A8;background:#FFF6EC;border-radius:11px;padding:9px 11px;margin-top:7px;min-width:0}
.bt-ct-w b{display:block;font-size:13.5px;color:#7a3a05}
.bt-ct-w span{display:block;font-size:12px;color:#6b4a2a;font-weight:600;margin-top:1px;line-height:1.35}
.bt-ct-w>div{min-width:0}
.bt-ct-person{padding:6px 0;border-top:1px solid rgba(21,18,15,.07)}
.bt-ct-person:first-of-type{border-top:none}
.bt-ct-bar{height:6px;border-radius:99px;background:rgba(21,18,15,.09);overflow:hidden;margin-top:4px}
.bt-ct-fill{height:100%;background:#1F7A4D;border-radius:99px}
.bt-ct-fill.soft{background:#E0A800}.bt-ct-fill.warn{background:#C0461F}.bt-ct-fill.over{background:#B5472E}
.bt-ct-pct{font-family:'JetBrains Mono',monospace;font-weight:800;color:#1F7A4D}
.bt-ct-pct.soft{color:#8a6d05}.bt-ct-pct.warn{color:#C0461F}.bt-ct-pct.over{color:#B5472E}
.bt-ct-total{margin-top:10px;background:#FFC21A;color:#15120F;border-radius:13px;padding:12px 14px;display:flex;align-items:baseline;gap:10px}
.bt-ct-total b{flex:1;min-width:0;font-size:13px}
.bt-ct-total span{font-size:20px;font-weight:900;letter-spacing:-.02em}
.bt-ct-empty{text-align:center;color:#9a948a;font-weight:600;padding:22px 0;font-size:13.5px}
`;
const CT_HTML = { __html: CT_CSS };

const fullDate = (d: string | null) => (d ? frDate(d) : '—');

// ── Terminer ────────────────────────────────────────────────────────────────────

function TerminerView({ ws, companyId, onClose, onChanged }: { ws: Worksite; companyId: string; onClose: () => void; onChanged: Props['onChanged'] }) {
  const today = useMemo(() => todayParis(), []);
  const [day, setDay] = useState(today);
  const [check, setCheck] = useState<FinishCheck | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadFinishCheck(ws.id, companyId).then((c) => { if (live) setCheck(c); }).catch(() => { if (live) setCheck('error'); });
    return () => { live = false; };
  }, [ws.id, companyId]);

  const dateErr = checkCompletionDate(day, today);
  const warnings = typeof check === 'object' ? finishWarnings(check) : [];
  const unknown = check === 'error';

  const confirm = async () => {
    if (dateErr || busy || check === 'loading') return;
    setBusy(true); setErr(null);
    try {
      const at = await setWorksiteCompleted(ws.id, day);
      toast.success(`Chantier terminé le ${frDate(day)}`);
      onChanged({ completed_at: at ?? `${day}T12:00:00+00:00`, completed_by: null });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Terminer le chantier</DialogTitle>
        <DialogDescription>
          Rien n’est supprimé et aucune heure n’est modifiée. Le chantier n’est plus proposé aux salariés pour une nouvelle intervention ; ses heures et son historique restent visibles.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 pt-1">
        <div className="bt-ct-head"><span className="bt-ct-name">{ws.client_name}</span>{ws.city ? <span className="bt-ct-city">{ws.city}</span> : null}</div>
        <div className="space-y-1">
          <Label htmlFor="ct-date">Date de fin du chantier</Label>
          <Input id="ct-date" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="min-h-[44px]" data-testid="ct-date" />
          {dateErr && <p className="text-xs font-semibold text-destructive" role="alert" data-testid="ct-date-err">{dateErr}</p>}
        </div>

        {check === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="ct-checking"><Loader2 className="h-4 w-4 animate-spin" /> Vérification des réserves, pointages et brouillons…</div>
        )}
        {unknown && (
          <div className="bt-ct-warn" data-testid="ct-check-error"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Impossible de vérifier les réserves, les pointages en cours, les brouillons et les interventions à venir pour le moment. Vous pouvez terminer quand même : rien n’est supprimé et vous pourrez rouvrir le chantier.</span></div>
        )}
        {warnings.length > 0 && (
          <div data-testid="ct-warnings">
            <p className="text-sm font-semibold">Avant de terminer, à savoir&nbsp;:</p>
            {warnings.map((w) => (
              <div key={w.key} className="bt-ct-w" data-testid={`ct-warn-${w.key}`}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#C0461F' }} />
                <div><b>{w.title}</b><span>{w.detail}</span></div>
              </div>
            ))}
          </div>
        )}
        {typeof check === 'object' && warnings.length === 0 && (
          <p className="text-sm font-semibold" style={{ color: '#1F7A4D' }} data-testid="ct-rien"><CheckCircle2 className="h-4 w-4 inline mr-1" />Rien à signaler : ni réserve à lever, ni pointage en cours, ni brouillon, ni intervention à venir.</p>
        )}
        {err && <p className="text-sm font-semibold text-destructive" role="alert" data-testid="ct-erreur">{err}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={onClose} disabled={busy} data-testid="ct-annuler">Annuler</Button>
          <Button className="flex-1 min-h-[44px] whitespace-normal" onClick={confirm} disabled={busy || !!dateErr || check === 'loading'} data-testid="ct-confirmer">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {unknown ? 'Terminer quand même' : finishButtonLabel(warnings)}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Rouvrir ─────────────────────────────────────────────────────────────────────

function RouvrirView({ ws, onClose, onChanged }: { ws: Worksite; onClose: () => void; onChanged: Props['onChanged'] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      await setWorksiteCompleted(ws.id, null);
      toast.success('Chantier rouvert');
      onChanged({ completed_at: null, completed_by: null });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Rouvrir le chantier&nbsp;?</DialogTitle>
        <DialogDescription>Il redevient proposé aux salariés pour une nouvelle intervention ou un nouveau pointage. Rien d’autre ne change.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 pt-1">
        <div className="bt-ct-head"><span className="bt-ct-name">{ws.client_name}</span>{ws.city ? <span className="bt-ct-city">{ws.city}</span> : null}</div>
        {err && <p className="text-sm font-semibold text-destructive" role="alert" data-testid="ct-erreur">{err}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={onClose} disabled={busy} data-testid="ct-annuler">Annuler</Button>
          <Button className="flex-1 min-h-[44px]" onClick={confirm} disabled={busy} data-testid="ct-rouvrir-ok">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />} Rouvrir
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Le bilan (lecture seule) ────────────────────────────────────────────────────

const Row = ({ k, v, big, testId, note }: { k: string; v: string; big?: boolean; testId?: string; note?: string }) => (
  <div>
    <div className="bt-ct-row"><span className="bt-ct-k">{k}</span><span className={`bt-ct-v${big ? ' big' : ''}`} data-testid={testId}>{v}</span></div>
    {note ? <div className="bt-ct-note">{note}</div> : null}
  </div>
);

function BilanView({ ws, companyId, supportMode }: { ws: Worksite; companyId: string; supportMode: boolean }) {
  const [data, setData] = useState<BilanData | 'loading' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    setData('loading');
    loadBilan(ws.id, companyId, supportMode).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData('error'); });
    return () => { live = false; };
  }, [ws.id, companyId, supportMode]);

  if (data === 'loading') return <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Calcul…</div>;
  if (data === 'error') return <div className="bt-ct-empty" data-testid="bl-erreur">Bilan illisible pour le moment. Réessayez — mieux vaut rien qu’un chiffre faux.</div>;

  const { bilan: b, worksite, hoursUnavailable } = data;
  const fin = b.period.completed;
  const bp = b.budget.progress;
  const hasBudget = !!(b.budget.hoursLine || b.budget.amountLine);
  const tone = (pct: number) => (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : pct >= 70 ? 'soft' : '');
  return (
    <div data-testid="bilan">
      <div className="bt-ct-head">
        <span className="bt-ct-name" data-testid="bl-nom">{worksite.client_name}</span>
        {worksite.city ? <span className="bt-ct-city">{worksite.city}</span> : null}
        <span className={`bt-ct-chip${fin ? ' done' : ''}`} data-testid="bl-statut">{fin ? `Terminé le ${frDate(fin)}` : 'En cours'}</span>
      </div>

      <section className="bt-ct-sec" data-testid="bl-periode">
        <div className="bt-ct-h">Période</div>
        <Row k="Première intervention" v={fullDate(b.period.first)} testId="bl-premiere" />
        <Row k="Dernière intervention" v={fullDate(b.period.last)} testId="bl-derniere" />
        <Row k="Fin du chantier" v={fullDate(b.period.completed)} testId="bl-fin" />
      </section>

      <section className="bt-ct-sec" data-testid="bl-heures">
        <div className="bt-ct-h">Heures <InfoTip text="Les mêmes chiffres que « Coût chantiers » : heures envoyées par les salariés, route payée comprise. Les brouillons (journées pas encore envoyées) sont à part : ils ne comptent nulle part tant qu’ils ne sont pas envoyés." /></div>
        {hoursUnavailable ? (
          <p className="bt-ct-note" data-testid="bl-heures-support">Les heures ne sont pas affichées en mode support (lecture seule) : elles se calculent pour l’entreprise du compte connecté.</p>
        ) : (
          <>
            <Row k="Heures validées" v={b.hours.paidMinutes > 0 ? fmtH(b.hours.paidMinutes) : '—'} big testId="bl-heures-valid" note="Envoyées par les salariés, comptées dans « Coût chantiers »." />
            {b.hours.routeMinutes > 0 && <Row k="dont route payée" v={fmtH(b.hours.routeMinutes)} testId="bl-route" />}
            <Row k="Heures en attente" v={b.hours.draftMinutes > 0 ? fmtH(b.hours.draftMinutes) : '—'} testId="bl-heures-attente" note="Brouillons non envoyés : pas encore comptées." />
            {b.hours.workers.length > 0 && (
              <div style={{ marginTop: 6 }} data-testid="bl-salaries">
                {b.hours.workers.map((w) => (
                  <div key={w.userId} className="bt-ct-person" data-testid="bl-salarie">
                    <div className="bt-ct-row"><span className="bt-ct-k">{w.name}</span><span className="bt-ct-v" data-testid="bl-salarie-h">{w.paidMinutes > 0 ? fmtH(w.paidMinutes) : '—'}</span></div>
                    {(w.routeMinutes > 0 || w.draftMinutes > 0) && (
                      <div className="bt-ct-note">{[w.routeMinutes > 0 ? `dont ${fmtH(w.routeMinutes)} de route` : '', w.draftMinutes > 0 ? `+ ${fmtH(w.draftMinutes)} en attente (brouillon)` : ''].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Row k="Main-d’œuvre" v={b.hours.cost > 0 ? fmtEur(b.hours.cost) : '—'} testId="bl-mo" />
            {b.hours.unpricedMinutes > 0 && <div className="bt-ct-warn" data-testid="bl-taux"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>Taux horaire manquant pour certains salariés : coût incomplet.</span></div>}
            {b.hours.workers.length === 0 && <p className="bt-ct-note">Aucune heure déclarée sur ce chantier.</p>}
          </>
        )}
      </section>

      <section className="bt-ct-sec" data-testid="bl-depenses">
        <div className="bt-ct-h">Dépenses</div>
        <Row k={b.expenses.count > 1 ? `Total (${b.expenses.count} lignes)` : b.expenses.count === 1 ? 'Total (1 ligne)' : 'Total'} v={b.expenses.count > 0 ? fmtEur(b.expenses.total) : '—'} big testId="bl-dep-total" />
        {b.expenses.byCategory.map((c) => <Row key={c.key} k={c.label} v={`${fmtEur(c.total)}${c.count > 1 ? ` (${c.count})` : ''}`} testId={`bl-dep-${c.key}`} />)}
        {b.expenses.count === 0 && <p className="bt-ct-note">Aucune dépense saisie.</p>}
      </section>

      <section className="bt-ct-sec" data-testid="bl-reserves">
        <div className="bt-ct-h">Réserves</div>
        <Row k="À lever" v={String(b.reserves.open)} big testId="bl-res-ouvertes" />
        <Row k="Levées" v={String(b.reserves.lifted)} testId="bl-res-levees" />
        {b.reserves.openList.map((r) => (
          <div key={r.id} className="bt-ct-person" data-testid="bl-res-ligne">
            <div className="bt-ct-row"><span className="bt-ct-k">{r.who}</span><span className="bt-ct-v" style={{ fontWeight: 700 }}>{frDate(r.work_date)}</span></div>
            {r.text ? <div className="bt-ct-note" style={{ color: '#3a352f' }}>{r.text.length > 160 ? `${r.text.slice(0, 160)}…` : r.text}</div> : null}
          </div>
        ))}
        {b.reserves.open === 0 && b.reserves.lifted === 0 && <p className="bt-ct-note">Aucune réserve déclarée.</p>}
      </section>

      <section className="bt-ct-sec" data-testid="bl-documents">
        <div className="bt-ct-h">Documents rangés</div>
        <Row k={b.documents.total > 1 ? 'Documents' : 'Document'} v={String(b.documents.total)} big testId="bl-doc-total" />
        {b.documents.byCategory.map((c) => <Row key={c.key} k={c.label} v={String(c.count)} testId={`bl-doc-${c.key}`} />)}
        {b.documents.total === 0 && <p className="bt-ct-note">Aucun document rangé.</p>}
      </section>

      {hasBudget && (
        <section className="bt-ct-sec" data-testid="bl-budget">
          <div className="bt-ct-h">Budget prévu / réel <InfoTip text="Budget de main-d’œuvre, sur tout le chantier : il ne compte ni les matériaux ni la sous-traitance (voir « Dépenses »)." /></div>
          {b.budget.hoursLine && (
            <div style={{ marginBottom: 6 }}>
              <div className="bt-ct-row"><span className="bt-ct-k">Heures : <b data-testid="bl-bud-h">{fmtH(b.budget.hoursLine.used)} / {b.budget.hoursLine.planned} h</b></span><span className={`bt-ct-v bt-ct-pct ${tone(b.budget.hoursLine.pct)}`} data-testid="bl-bud-h-pct">{Math.round(b.budget.hoursLine.pct)} %</span></div>
              <div className="bt-ct-bar"><div className={`bt-ct-fill ${tone(b.budget.hoursLine.pct)}`} style={{ width: `${Math.min(b.budget.hoursLine.pct, 100)}%` }} /></div>
            </div>
          )}
          {b.budget.amountLine && (
            <div>
              <div className="bt-ct-row"><span className="bt-ct-k">Main-d’œuvre : <b data-testid="bl-bud-e">{fmtEur(b.budget.amountLine.used)} / {fmtEur(b.budget.amountLine.planned)}</b></span><span className={`bt-ct-v bt-ct-pct ${tone(b.budget.amountLine.pct)}`} data-testid="bl-bud-e-pct">{Math.round(b.budget.amountLine.pct)} %</span></div>
              <div className="bt-ct-bar"><div className={`bt-ct-fill ${tone(b.budget.amountLine.pct)}`} style={{ width: `${Math.min(b.budget.amountLine.pct, 100)}%` }} /></div>
              {b.budget.amountLine.incomplete && <div className="bt-ct-note">Incomplet : un taux horaire manque.</div>}
            </div>
          )}
          {bp && <p className="bt-ct-note" data-testid="bl-bud-global">Le plus avancé des deux : {Math.round(bp.pct)} %.</p>}
        </section>
      )}

      {!hoursUnavailable && (
        <div className="bt-ct-total" data-testid="bl-total"><b>Coût total <span style={{ fontSize: 11, fontWeight: 700 }}>(main-d’œuvre + dépenses)</span></b><span>{b.totalCost !== 0 ? fmtEur(b.totalCost) : '—'}</span></div>
      )}
      <p className="bt-ct-note" style={{ textAlign: 'center', marginTop: 8 }}>Bilan en lecture seule : rien ne se modifie d’ici.</p>
    </div>
  );
}

// ── La fenêtre ──────────────────────────────────────────────────────────────────

export default function ChantierTermine({ target, companyId, onClose, onChanged }: Props) {
  // Mode support (lecture seule) : le bilan se lit, les heures ne sont pas celles du client visité (voir lib/chantier-termine.ts).
  const supportMode = !!readSupportSession();
  // La fenêtre reste montée après sa fermeture (lazyWindow) : on garde la dernière cible pour l'animation de
  // fermeture, et un numéro neuf à chaque ouverture remet les saisies à zéro.
  const last = useRef<{ t: TermineTarget | null; n: number }>({ t: null, n: 0 });
  if (target && last.current.t !== target) last.current = { t: target, n: last.current.n + 1 };
  const shown = target ?? last.current.t;
  const key = last.current.n;

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bt-skin max-w-md max-h-[90vh] overflow-y-auto" data-testid="chantier-termine-fenetre">
        <style dangerouslySetInnerHTML={CT_HTML} />
        {shown?.mode === 'terminer' && <TerminerView key={key} ws={shown.ws} companyId={companyId} onClose={onClose} onChanged={onChanged} />}
        {shown?.mode === 'rouvrir' && <RouvrirView key={key} ws={shown.ws} onClose={onClose} onChanged={onChanged} />}
        {shown?.mode === 'bilan' && (
          <>
            <DialogHeader>
              <DialogTitle>Bilan du chantier</DialogTitle>
              <DialogDescription className="sr-only">Heures, dépenses, réserves, documents et budget de ce chantier, en lecture seule.</DialogDescription>
            </DialogHeader>
            <BilanView key={key} ws={shown.ws} companyId={companyId} supportMode={supportMode} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
