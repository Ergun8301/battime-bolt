'use client';

// Design bureau · lot 3 A · « Terminer le chantier » (CL14), « Rouvrir le chantier ? », « Bilan du chantier » (CL15, lecture seule).
// Les contrôles (date, réserves, pointages, brouillons, à venir), l'écriture et la lecture du bilan restent dans components/chantier-termine.tsx.
import type { BilanData } from '@/lib/chantier-termine';
import type { FinishWarning } from '@/supabase/functions/_shared/chantier-termine';

/** Les formats d'avant (fmtH, fmtEur, frDate de _shared/chantier-termine), passés par chantier-termine.tsx : rien n'est importé de son morceau. */
export interface FormatsBilan { fmtH: (m: number) => string; fmtEur: (n: number) => string; frDate: (d: string) => string }
import type { Worksite } from '@/lib/types';
import { Alerte, Btn, Champ, Chiffres, Coque, Jauge, Kv, P, Squelettes } from './lot3a-ui';

export function TerminerV2({ ws, today, day, setDay, dateErr, checking, unknown, warnings, err, busy, label, onClose, confirm }: {
  ws: Worksite; today: string; day: string; setDay: (d: string) => void; dateErr: string | null; checking: boolean; unknown: boolean; warnings: FinishWarning[];
  err: string | null; busy: boolean; label: string; onClose: () => void; confirm: () => void;
}) {
  return (
    <Coque open onOpenChange={(o) => { if (!o && !busy) onClose(); }} forme="fenetre" largeur={540} alerte titre={`Terminer ${ws.client_name} ?`} testId="chantier-termine-fenetre"
      pied={<><Btn onClick={onClose} disabled={busy} data-testid="ct-annuler">Annuler</Btn>
        <Btn ton="encre" onClick={confirm} disabled={busy || !!dateErr || checking} busy={busy} data-testid="ct-confirmer">{unknown ? 'Terminer quand même' : label}</Btn></>}>
      <Champ nom="Terminé le" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} data-testid="ct-date" erreur={dateErr || undefined} aide="Aujourd’hui au plus tard." />
      {checking ? <Squelettes n={1} /> : null}
      {unknown ? <Alerte ton="attention" titre="Vérification impossible" testId="ct-check-error">Impossible de vérifier les réserves, les pointages en cours, les brouillons et les interventions à venir pour le moment. Vous pouvez terminer quand même : rien n’est supprimé et vous pourrez rouvrir le chantier.</Alerte> : null}
      {warnings.length > 0 ? (
        <Alerte ton="attention" titre="À savoir avant de terminer" testId="ct-warnings">
          {warnings.map((w) => <span key={w.key} style={{ display: 'block' }} data-testid={`ct-warn-${w.key}`}><b>{w.title}</b> · {w.detail}</span>)}
        </Alerte>
      ) : null}
      {!checking && !unknown && warnings.length === 0 ? <P ton="ok" data-testid="ct-rien">Rien à signaler : ni réserve à lever, ni pointage en cours, ni brouillon, ni intervention à venir.</P> : null}
      <P>Il n’est plus proposé aux salariés pour une nouvelle intervention. Rien n’est supprimé et aucune heure n’est modifiée ; vous pourrez le rouvrir.</P>
      {err ? <Alerte ton="erreur" testId="ct-erreur">{err}</Alerte> : null}
    </Coque>
  );
}

export function RouvrirV2({ ws, err, busy, onClose, confirm }: { ws: Worksite; err: string | null; busy: boolean; onClose: () => void; confirm: () => void }) {
  return (
    <Coque open onOpenChange={(o) => { if (!o && !busy) onClose(); }} forme="fenetre" largeur={480} alerte titre={`Rouvrir ${ws.client_name} ?`} testId="chantier-termine-fenetre"
      pied={<><Btn onClick={onClose} disabled={busy} data-testid="ct-annuler">Annuler</Btn><Btn ton="encre" onClick={confirm} disabled={busy} busy={busy} data-testid="ct-rouvrir-ok">Rouvrir</Btn></>}>
      <P>Il redevient proposé aux salariés pour une nouvelle intervention ou un nouveau pointage. Rien d’autre ne change.</P>
      {err ? <Alerte ton="erreur" testId="ct-erreur">{err}</Alerte> : null}
    </Coque>
  );
}

export function BilanV2({ ws, data, onClose, f }: { ws: Worksite; data: BilanData | 'loading' | 'error'; onClose: () => void; f: FormatsBilan }) {
  const { frDate } = f;
  const ok = typeof data === 'object';
  const fin = ok ? data.bilan.period.completed : null;
  return (
    <Coque open onOpenChange={(o) => { if (!o) onClose(); }} forme="panneau" kicker="Bilan · lecture seule" titre={ok ? data.worksite.client_name : ws.client_name}
      sous={ok ? (fin ? `Terminé le ${frDate(fin)}` : 'En cours') : undefined} testId="chantier-termine-fenetre">
      {data === 'loading' ? <Squelettes n={4} />
        : data === 'error' ? <Alerte ton="erreur" titre="Bilan illisible pour le moment" testId="bl-erreur">Réessayez : mieux vaut rien qu’un chiffre faux.</Alerte>
        : <BilanCorps d={data} f={f} />}
    </Coque>
  );
}

function BilanCorps({ d, f }: { d: BilanData; f: FormatsBilan }) {
  const { fmtH, fmtEur, frDate } = f;
  const jour = (x: string | null) => (x ? frDate(x) : '—');
  const { bilan: b, hoursUnavailable, namesUnavailable } = d;
  const tone = (pct: number): 'erreur' | 'attention' | undefined => (pct >= 100 ? 'erreur' : pct >= 70 ? 'attention' : undefined);
  return (
    <div data-testid="bilan" className="dz-l3-bloc" style={{ gap: 14 }}>
      {!hoursUnavailable ? (
        <Chiffres items={[
          { k: 'Heures', v: b.hours.paidMinutes > 0 ? fmtH(b.hours.paidMinutes) : '—', s: b.hours.routeMinutes > 0 ? `dont route ${fmtH(b.hours.routeMinutes)}` : 'envoyées par les salariés', testId: 'bl-heures-valid' },
          { k: 'Total', v: b.totalCost !== 0 ? fmtEur(b.totalCost) : '—', s: 'main-d’œuvre + dépenses', testId: 'bl-total' },
        ]} />
      ) : <P ton="doux" data-testid="bl-heures-support">Les heures ne sont pas affichées en mode support (lecture seule) : elles se calculent pour l’entreprise du compte connecté.</P>}
      {namesUnavailable ? <Alerte ton="attention" titre="Noms indisponibles" testId="bl-noms">Les salariés sont numérotés. Les heures et les montants, eux, sont exacts. Fermez puis rouvrez le bilan pour réessayer.</Alerte> : null}
      <Kv titre="Période" lignes={[['Première intervention', jour(b.period.first)], ['Dernière intervention', jour(b.period.last)], ['Fin du chantier', jour(b.period.completed)]]} />
      {!hoursUnavailable ? (
        <Kv titre="Heures" lignes={[
          ['Heures en attente (brouillons, pas encore comptées)', b.hours.draftMinutes > 0 ? fmtH(b.hours.draftMinutes) : '—', true],
          ...b.hours.workers.map((w, i): [string, string, boolean] => [namesUnavailable ? `Salarié ${i + 1}` : w.name,
            `${w.paidMinutes > 0 ? fmtH(w.paidMinutes) : '—'}${w.routeMinutes > 0 ? ` · dont ${fmtH(w.routeMinutes)} de route` : ''}${w.draftMinutes > 0 ? ` · + ${fmtH(w.draftMinutes)} en attente` : ''}`, true]),
          ['Main-d’œuvre', b.hours.cost > 0 ? fmtEur(b.hours.cost) : '—', true],
        ]} />
      ) : null}
      {!hoursUnavailable && b.hours.unpricedMinutes > 0 ? <Alerte ton="attention" testId="bl-taux">Taux horaire manquant pour certains salariés : coût incomplet.</Alerte> : null}
      <Kv titre="Dépenses" lignes={[
        [b.expenses.count > 1 ? `Total (${b.expenses.count} lignes)` : b.expenses.count === 1 ? 'Total (1 ligne)' : 'Total', b.expenses.count > 0 ? fmtEur(b.expenses.total) : '—', true],
        ...b.expenses.byCategory.map((c): [string, string, boolean] => [c.label, `${fmtEur(c.total)}${c.count > 1 ? ` (${c.count})` : ''}`, true]),
      ]} />
      <Kv titre="Réserves" lignes={[
        ['À lever', String(b.reserves.open), true], ['Levées', String(b.reserves.lifted), true],
        ...b.reserves.openList.map((r): [string, string] => [`${namesUnavailable ? 'Salarié' : r.who} · ${frDate(r.work_date)}`, r.text ? (r.text.length > 160 ? `${r.text.slice(0, 160)}…` : r.text) : '—']),
      ]} />
      <Kv titre="Documents rangés" lignes={[[b.documents.total > 1 ? 'Documents' : 'Document', String(b.documents.total), true], ...b.documents.byCategory.map((c): [string, string, boolean] => [c.label, String(c.count), true])]} />
      {b.budget.hoursLine || b.budget.amountLine ? (
        <div className="dz-l3-bloc" data-testid="bl-budget">
          {b.budget.hoursLine ? <Jauge nom="Budget heures" pct={b.budget.hoursLine.pct} ton={tone(b.budget.hoursLine.pct)} texte={`${fmtH(b.budget.hoursLine.used)} / ${b.budget.hoursLine.planned} h · ${Math.round(b.budget.hoursLine.pct)} %`} /> : null}
          {b.budget.amountLine ? <Jauge nom="Budget main-d’œuvre" pct={b.budget.amountLine.pct} ton={tone(b.budget.amountLine.pct)} texte={`${fmtEur(b.budget.amountLine.used)} / ${fmtEur(b.budget.amountLine.planned)} · ${Math.round(b.budget.amountLine.pct)} %`} /> : null}
          {b.budget.amountLine?.incomplete ? <P ton="doux">Incomplet : un taux horaire manque.</P> : null}
        </div>
      ) : null}
      <P ton="doux">Bilan en lecture seule : rien ne se modifie d’ici. Mêmes chiffres que « Coût chantiers ».</P>
    </div>
  );
}
