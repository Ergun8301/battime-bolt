'use client';

// Lot 5 — « Statistiques » de l'équipe, pour le bureau. LECTURE SEULE : rien
// ne s'écrit d'ici. Par salarié, sur une semaine, un mois ou une année :
// heures travaillées, heures sup, absences, journées oubliées (et relances
// reçues), coût si un taux horaire est renseigné. Comparaison : barres CSS et
// classement — pas de bibliothèque de graphiques.
//
// Chaque chiffre vient de la fonction qui le produit déjà ailleurs (voir
// lib/team-stats.ts) : CSV de paie, « Coût chantiers », cockpit « à relancer ».

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { loadTeamStats, type StatsRow, type TeamStatsResult } from '@/lib/team-stats';
import {
  barWidths, isFuturePeriod, periodFor, periodLabel, rankBy, shiftPeriod,
  type Metric, type Period, type PeriodKind,
} from '@/supabase/functions/_shared/team-stats-core';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId?: string }

const fmtH = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
const fmtEur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtDays = (n: number) => `${n} j`;
const todayISO = () => format(new Date(), 'yyyy-MM-dd');

const METRICS: { key: Metric; label: string; short: string; color: string }[] = [
  { key: 'hours', label: 'Heures', short: 'Heures', color: '#15120F' },
  { key: 'overtime', label: 'Heures sup', short: 'Sup.', color: '#C98A12' },
  { key: 'absences', label: 'Absences', short: 'Abs.', color: '#7c766c' },
  { key: 'forgotten', label: 'Oublis', short: 'Oublis', color: '#D85A30' },
  { key: 'cost', label: 'Coût', short: 'Coût', color: '#1F7A4D' },
];
const KINDS: { key: PeriodKind; label: string }[] = [
  { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }, { key: 'year', label: 'Année' },
];

const valueOf = (r: StatsRow, m: Metric): number =>
  m === 'hours' ? r.minutes : m === 'overtime' ? r.overtime : m === 'absences' ? r.absences.total
    : m === 'forgotten' ? r.forgotten.length : (r.cost ?? 0);
const show = (m: Metric, v: number): string =>
  v === 0 ? '—' : m === 'hours' || m === 'overtime' ? fmtH(v) : m === 'cost' ? fmtEur(v) : fmtDays(v);

const ST_CSS = `
.bt-st{overflow-x:hidden}
.bt-st-body{display:grid;gap:14px;min-width:0}
.bt-st-chip[aria-pressed="true"] .dot{box-shadow:0 0 0 1.5px #fff}
.bt-st-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bt-st-seg{display:inline-flex;gap:4px}
.bt-st-nav{display:inline-flex;align-items:center;gap:4px;margin-left:auto;min-width:0}
.bt-st-navbtn{width:30px;height:30px;flex:none;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#fff;color:#15120F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.bt-st-navbtn:hover:not(:disabled){border-color:#15120F}
.bt-st-navbtn:disabled{opacity:.35;cursor:default}
.bt-st-label{min-width:0;padding:0 4px;text-align:center;font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-st-label::first-letter{text-transform:uppercase}
.bt-st-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.bt-st-chip{border:1.5px solid rgba(21,18,15,.14);background:#fff;border-radius:999px;padding:4px 11px;font:inherit;font-size:12.5px;font-weight:700;color:#3a352f;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.bt-st-chip:hover{border-color:rgba(21,18,15,.4)}
.bt-st-chip .dot{width:8px;height:8px;border-radius:50%;flex:none}
.bt-st-chip[aria-pressed="true"]{background:#15120F;border-color:#15120F;color:#fff}
.bt-st-def{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#8a8378;font-weight:600;margin-left:auto}
.bt-st-list{border:1px solid rgba(21,18,15,.1);border-radius:13px;overflow:hidden;background:#fff}
.bt-st-g{display:grid;grid-template-columns:24px minmax(0,1fr) minmax(60px,1.1fr) 78px;align-items:center;column-gap:10px}
.bt-st-head{padding:7px 12px;background:#FBF8F1;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-st-head .r{text-align:right}
.bt-st-row{width:100%;padding:9px 12px;border:0;border-top:1px solid rgba(21,18,15,.06);background:none;font:inherit;color:#15120F;text-align:left;cursor:pointer}
.bt-st-row:hover{background:#FBF8F1}
.bt-st-row[aria-expanded="true"]{background:#F7F2E7}
.bt-st-rk{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:800;color:#9a948a;text-align:center}
.bt-st-nm{min-width:0;font-weight:800;font-size:13.5px;overflow-wrap:anywhere;line-height:1.25;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bt-st-tag{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;background:#F1E8D6;color:#6b5a2e;border-radius:6px;padding:1px 5px}
.bt-st-bar{height:10px;border-radius:99px;background:rgba(21,18,15,.07);overflow:hidden;min-width:0}
.bt-st-fill{display:block;height:100%;border-radius:99px;transition:width .2s ease}
.bt-st-v{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:800;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.bt-st-v .chev{display:inline-block;vertical-align:-2px;margin-left:3px;color:#9a948a;transition:transform .16s ease}
.bt-st-row[aria-expanded="true"] .chev{transform:rotate(180deg)}
.bt-st-sec{display:none}
.bt-st-team{padding:9px 12px;border-top:1.5px solid rgba(21,18,15,.14);background:#FBF8F1;font-weight:800}
.bt-st-det{padding:4px 12px 12px 46px;background:#F7F2E7;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;font-size:12.5px}
.bt-st-det div{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed rgba(21,18,15,.1);padding:3px 0;min-width:0}
.bt-st-det span{color:#6b6459;font-weight:600;min-width:0}
.bt-st-det b{font-weight:800;text-align:right;min-width:0;overflow-wrap:anywhere}
.bt-st-det .wide{grid-column:1 / -1}
.bt-st-note{font-size:11.5px;color:#8a8378;font-weight:600;line-height:1.45}
.bt-st-warn{display:flex;align-items:center;gap:6px;background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:600}
.bt-st-empty{text-align:center;color:#9a948a;font-weight:600;padding:26px 0;font-size:13.5px}
@media (min-width:820px){
  .bt-st-g.sec5{grid-template-columns:24px minmax(0,1.2fr) minmax(60px,1fr) 78px repeat(4,62px)}
  .bt-st-g.sec4{grid-template-columns:24px minmax(0,1.2fr) minmax(60px,1fr) 78px repeat(3,62px)}
  .bt-st-sec{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#6b6459;text-align:right;white-space:nowrap}
  .bt-st-head .bt-st-sec{font-size:9.5px;color:#9a948a}
}
@media (max-width:639px){
  .bt-st-g{grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"rk nm v" ". bar bar";row-gap:6px}
  .bt-st-g > .bt-st-rk{grid-area:rk}.bt-st-g > .bt-st-nm{grid-area:nm}.bt-st-g > .bt-st-bar{grid-area:bar}.bt-st-g > .bt-st-v{grid-area:v}
  .bt-st-head .hb{display:none}
  .bt-st-det{grid-template-columns:minmax(0,1fr);padding-left:12px}
  .bt-st-nav{margin-left:0;width:100%;justify-content:space-between}
  .bt-st-def{margin-left:0}
}
`;
// Lot 10 (règle anti-flash) : objet FIXE au niveau du module.
const ST_HTML = { __html: ST_CSS };

export default function TeamStats({ open, onOpenChange, companyId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin bt-st max-w-3xl max-h-[86vh] overflow-y-auto overflow-x-hidden">
        <style dangerouslySetInnerHTML={ST_HTML} />
        <DialogHeader><DialogTitle>Statistiques</DialogTitle></DialogHeader>
        {/* Le contenu n'existe que fenêtre ouverte : chaque ouverture repart du mois en
            cours, classé par heures, avec un cache vide (rouvrir relit la base). */}
        <StatsBody companyId={companyId} />
      </DialogContent>
    </Dialog>
  );
}

function StatsBody({ companyId }: { companyId?: string }) {
  const [today] = useState(todayISO);
  const [period, setPeriod] = useState<Period>(() => periodFor('month', today));
  const [metric, setMetric] = useState<Metric>('hours');
  const [data, setData] = useState<TeamStatsResult | null>(null);
  const [loadedKey, setLoadedKey] = useState(''); // la période des chiffres affichés
  const [state, setState] = useState<'loading' | 'ok' | 'ko'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Une lecture par période pendant UNE ouverture.
  const cache = useRef(new Map<string, TeamStatsResult>());

  useEffect(() => {
    if (!companyId) return;
    const key = `${period.from}|${period.to}`;
    const hit = cache.current.get(key);
    if (hit) { setData(hit); setLoadedKey(key); setState('ok'); return; }
    let stale = false; // une période plus récente a été demandée : on ignore cette réponse
    setState('loading');
    loadTeamStats(companyId, period, today).then(
      (res) => { if (stale) return; cache.current.set(key, res); setData(res); setLoadedKey(key); setState('ok'); },
      (err) => { if (stale) return; console.error('Statistiques illisibles :', err); setData(null); setState('ko'); },
    );
    return () => { stale = true; };
  }, [companyId, period, today, retry]);

  const costShown = !!data && data.costAvailable && data.anyPriced;
  const metrics = METRICS.filter((m) => m.key !== 'cost' || costShown);
  const active: Metric = metric === 'cost' && !costShown ? 'hours' : metric;
  const meta = METRICS.find((m) => m.key === active)!;
  const secondary = metrics.filter((m) => m.key !== active);

  const ranked = useMemo(() => (data ? rankBy(data.rows, (r) => valueOf(r, active), (r) => r.name) : []), [data, active]);
  const widths = useMemo(() => barWidths(ranked.map((x) => x.value)), [ranked]);
  const totals = useMemo(() => {
    const rows = data?.rows || [];
    const sum = (f: (r: StatsRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
      hours: sum((r) => r.minutes), overtime: sum((r) => r.overtime), absences: sum((r) => r.absences.total),
      forgotten: sum((r) => r.forgotten.length), cost: sum((r) => r.cost ?? 0),
    } as Record<Metric, number>;
  }, [data]);
  const nothing = !!data && data.rows.every((r) => r.minutes === 0 && r.absences.total === 0 && r.absences.upcoming === 0 && r.forgotten.length === 0);

  const next = shiftPeriod(period, 1);
  const switchKind = (k: PeriodKind) => {
    if (k === period.kind) return;
    // La nouvelle période contient aujourd'hui si la période affichée le contient, sinon son 1er jour.
    const anchor = today >= period.from && today <= period.to ? today : period.from;
    setExpanded(null); setPeriod(periodFor(k, anchor));
  };
  const go = (delta: number) => { setExpanded(null); setPeriod((p) => shiftPeriod(p, delta)); };

  const rates = data?.rates;
  const DEFS: Record<Metric, string> = {
    hours: 'Heures envoyées par le salarié (brouillons et lignes retirées exclus), route payée comprise si l’entreprise la paie. Le même calcul que le « Total heures » du CSV de paie.',
    overtime: `Heures au-delà de l’horaire de base, comptées à la semaine (lundi → dimanche) : les 8 premières à ${rates?.tier1 ?? 25} %, les suivantes à ${rates?.tier2 ?? 50} %. La semaine entière sert à classer, seuls les jours de la période comptent — comme le CSV de paie. Une semaine en cours est partielle.`,
    absences: 'Jours d’absence posés sur le planning (congé, maladie, intempérie), week-end compris, jusqu’à aujourd’hui. Le détail par type est dans la ligne du salarié ; les jours à venir n’entrent pas dans le total.',
    forgotten: 'Journées planifiées passées sans heures envoyées, à ce jour — mois clôturés compris (le cockpit, lui, ne réclame plus un mois clôturé). Y entrent aussi les journées renvoyées par le bureau, les sorties oubliées « à compléter » et les heures saisies hors ligne pas encore synchronisées. Une journée envoyée en retard disparaît du compte.',
    cost: 'Le coût de « Coût chantiers » : heures × taux horaire ACTUEL du salarié, route payée comprise, sans majoration des heures sup. « — » : taux horaire à renseigner dans la fiche du salarié.',
  };
  const remindersNote = data?.remindersAvailable
    ? `Relances comptées ${data.remindersSince ? `depuis le ${format(new Date(data.remindersSince), 'dd/MM/yyyy')}` : 'depuis la mise en service du journal'} : rappels automatiques « journées manquantes » et bouton « Relancer » (un e-mail préparé compte comme une relance).`
    : null;

  const sec = (r: StatsRow, m: Metric) => show(m, valueOf(r, m));
  const gridCls = `bt-st-g ${secondary.length === 4 ? 'sec5' : 'sec4'}`;

  return (
      <div className="bt-st-body" data-testid="team-stats" data-loaded={state === 'ok' ? loadedKey : state === 'ko' ? 'ko' : ''}>
        <div className="bt-st-ctl pt-1">
          <div className="bt-st-seg" role="group" aria-label="Période">
            {KINDS.map((k) => (
              <Button key={k.key} size="sm" variant={period.kind === k.key ? 'default' : 'outline'} aria-pressed={period.kind === k.key}
                data-testid={`stats-kind-${k.key}`} onClick={() => switchKind(k.key)}>{k.label}</Button>
            ))}
          </div>
          <div className="bt-st-nav">
            <button type="button" className="bt-st-navbtn" aria-label="Période précédente" data-testid="stats-prev" onClick={() => go(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="bt-st-label" data-testid="stats-label">{periodLabel(period)}</span>
            <button type="button" className="bt-st-navbtn" aria-label="Période suivante" data-testid="stats-next"
              disabled={isFuturePeriod(next, today)} onClick={() => go(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="bt-st-chips">
          {metrics.map((m) => (
            <button key={m.key} type="button" className="bt-st-chip" aria-pressed={active === m.key} data-testid={`stats-metric-${m.key}`}
              onClick={() => { setMetric(m.key); }}>
              <span className="dot" style={{ background: m.color }} />{m.label}
            </button>
          ))}
          <span className="bt-st-def">{meta.label}<InfoTip text={DEFS[active]} label={`Définition : ${meta.label}`} testId="stats-def" /></span>
        </div>

        {state === 'loading' ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Calcul…</div>
        ) : state === 'ko' || !data ? (
          <div className="bt-st-empty" data-testid="stats-error">
            Chiffres illisibles pour le moment. Réessayez — mieux vaut rien qu&apos;un chiffre faux.
            <div className="mt-3"><Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Réessayer</Button></div>
          </div>
        ) : data.rows.length === 0 || nothing ? (
          <div className="bt-st-empty" data-testid="stats-empty">Aucune donnée sur cette période.</div>
        ) : (
          <>
            {!data.costAvailable && <div className="bt-st-warn" data-testid="stats-cost-off">Coût indisponible pour le moment — les autres chiffres sont justes.</div>}
            <div className="bt-st-list" data-testid="stats-list">
              <div className={`${gridCls} bt-st-head`}>
                <span className="bt-st-rk">#</span>
                <span>Salarié</span>
                <span className="hb">{meta.label}</span>
                <span className="r hb">&nbsp;</span>
                {secondary.map((m) => <span key={m.key} className="bt-st-sec">{m.short}</span>)}
              </div>
              {ranked.map((x, i) => {
                const r = x.row;
                const on = expanded === r.id;
                return (
                  <div key={r.id}>
                    <button type="button" className={`${gridCls} bt-st-row`} aria-expanded={on} onClick={() => setExpanded(on ? null : r.id)}
                      data-testid="stats-row" data-uid={r.id} data-rank={x.rank ?? ''} data-minutes={r.minutes} data-overtime={r.overtime}
                      data-absences={r.absences.total} data-forgotten={r.forgotten.length} data-cost={r.cost == null ? '' : r.cost.toFixed(2)}>
                      <span className="bt-st-rk">{x.rank ?? '–'}</span>
                      <span className="bt-st-nm">{r.name}{r.tag && <span className="bt-st-tag">{r.tag}</span>}</span>
                      <span className="bt-st-bar" aria-hidden><span className="bt-st-fill" data-testid="stats-bar" style={{ width: `${widths[i]}%`, background: meta.color }} /></span>
                      <span className="bt-st-v">{active === 'cost' && r.cost == null && r.unpriced ? '—' : show(active, x.value)}<ChevronDown className="chev h-3.5 w-3.5" /></span>
                      {secondary.map((m) => <span key={m.key} className="bt-st-sec">{sec(r, m.key)}</span>)}
                    </button>
                    {on && <Detail r={r} data={data} />}
                  </div>
                );
              })}
              <div className={`${gridCls} bt-st-team`} data-testid="stats-team" data-minutes={totals.hours} data-overtime={totals.overtime}
                data-absences={totals.absences} data-forgotten={totals.forgotten} data-cost={totals.cost.toFixed(2)}>
                <span className="bt-st-rk">Σ</span>
                <span className="bt-st-nm">Équipe</span>
                <span className="hb" />
                <span className="bt-st-v">{show(active, totals[active])}</span>
                {secondary.map((m) => <span key={m.key} className="bt-st-sec">{show(m.key, totals[m.key])}</span>)}
              </div>
            </div>
            {data.costAvailable && !data.anyPriced && (
              <p className="bt-st-note" data-testid="stats-no-rate">Coût caché : aucun taux horaire renseigné sur cette période (fiche du salarié).</p>
            )}
            {remindersNote && active === 'forgotten' && <p className="bt-st-note">{remindersNote}</p>}
          </>
        )}
        <p className="bt-st-note">Lecture seule — rien ne se modifie d&apos;ici. Cliquez une ligne pour le détail.</p>
      </div>
  );
}

function Detail({ r, data }: { r: StatsRow; data: TeamStatsResult }) {
  const a = r.absences;
  const days = r.forgotten.slice(0, 8).map((d) => format(parseISO(d), 'EEE d MMM', { locale: fr })).join(', ');
  return (
    <div className="bt-st-det" data-testid="stats-detail">
      <div><span>Heures travaillées</span><b>{fmtH(r.minutes)}{data.travelPaid && r.route > 0 ? ` (dont ${fmtH(r.route)} de route)` : ''}</b></div>
      <div><span>Heures normales</span><b>{fmtH(r.normal)}</b></div>
      <div><span>Sup. 1 ({data.rates.tier1} %)</span><b>{fmtH(r.t1)}</b></div>
      <div><span>Sup. 2 ({data.rates.tier2} %)</span><b>{fmtH(r.t2)}</b></div>
      <div className={r.base === 0 ? 'wide' : ''}><span>Horaire de base</span>
        <b data-testid="stats-base">{r.base == null ? '—' : r.base === 0 ? 'Base 0 h/sem. : toutes ses heures comptent en sup.' : `${String(r.base).replace('.', ',')} h/sem.`}</b></div>
      <div><span>Absences</span><b>{fmtDays(a.total)}{a.upcoming > 0 ? ` (à venir : ${fmtDays(a.upcoming)})` : ''}</b></div>
      <div className="wide" data-testid="stats-absence-types"><span>Dont</span>
        <b>Congé {fmtDays(a.conge)} · Maladie {fmtDays(a.maladie)} · Intempérie {fmtDays(a.intemperie)}{a.autre ? ` · Autre ${fmtDays(a.autre)}` : ''}</b></div>
      <div className="wide"><span>Journées oubliées</span><b data-testid="stats-forgotten-days">{r.forgotten.length ? `${fmtDays(r.forgotten.length)} — ${days}${r.forgotten.length > 8 ? '…' : ''}` : 'aucune'}</b></div>
      {data.remindersAvailable && <div><span>Relances reçues</span><b data-testid="stats-reminders">{r.reminders}</b></div>}
      {data.returnsAvailable && <div><span>Renvoyées par le bureau</span><b data-testid="stats-returns">{fmtDays(r.returns)}</b></div>}
      {data.costAvailable && (
        <div className="wide"><span>Coût</span>
          <b data-testid="stats-cost">{r.cost != null ? fmtEur(r.cost) : r.unpriced ? 'Taux horaire à renseigner (fiche salarié)' : '—'}</b></div>
      )}
    </div>
  );
}
