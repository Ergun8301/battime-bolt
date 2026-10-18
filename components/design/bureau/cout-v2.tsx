'use client';

// Design du bureau · lot 3 B · ST03, ST04, XM06 : « Coût chantiers » et « Ajouter une dépense ».
// Habillage seulement : les lectures (my_worksite_labour, worksite_expenses, budgets), l'ajout (lib/admin-writes.ts addExpense), la suppression et
// les règles (budgetProgress, coût réel) restent dans components/cost-report.tsx, qui passe ici son état et ses gestionnaires tels quels.
// Écarts assumés à la planche : la catégorie de la dépense est gardée (champ existant), le détail par salarié et la liste des dépenses (avec la
// suppression) restent sous la ligne dépliée, comme aujourd'hui. Chargée en différé, seulement avec `?ui=2`.
import type { ReactNode } from 'react';
import CoqueL3, { FenetreL3 as FenetreBureau, BoutonL3 as BoutonBureau } from './coque-l3';


type Preset = 'month' | 'week' | 'custom';
export interface CoutSite { id: string; name: string; city: string | null; minutes: number; routeMinutes: number; cost: number; unpriced: number; workers: Map<string, { name: string; minutes: number; routeMinutes: number; cost: number; unpriced: number }> }
export interface CoutDepense { id: string; worksite_id: string; spent_on: string; category: string; label: string | null; supplier: string | null; amount: number }
interface Budget { hours: number | null; amount: number | null; usedMinutes: number; usedCost: number }

export interface CoutV2Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Les règles de cost-report.tsx (format des heures et des euros, catégories, avancement du budget), passées telles quelles : ce morceau n'importe
   *  rien de partagé (sinon le module commun serait découpé en morceaux de plus, chargés par toutes les pages via le chargeur). */
  regles: {
    fmtH: (min: number) => string; fmtEur: (n: number) => string; categories: readonly { key: string; label: string }[]; libelle: Record<string, string>;
    budget: (b: Budget) => { pct: number; tone: string; label: string } | null;
  };
  preset: Preset; setPreset: (p: Preset) => void;
  /** Le bouton « Créneau » et son calendrier, fournis par cost-report.tsx (mêmes composants qu'en v1 : rien de plus dans ce morceau). */
  creneau: ReactNode;
  /** L'ⓘ existant du « taux horaire manquant ». */
  infoTaux: ReactNode;
  /** « 1 oct. → 31 oct. 2026 », formaté par cost-report.tsx. */
  periode: string;
  loading: boolean; failed: boolean;
  sites: CoutSite[]; depenses: CoutDepense[]; depensesDe: (id: string) => CoutDepense[];
  totals: { min: number; route: number; cost: number; exp: number; all: number };
  missingRates: boolean; budgets: Map<string, Budget>;
  expanded: string | null; setExpanded: (id: string | null) => void;
  /** Le bloc « coût réel » existant d'un chantier (rien quand la fonction est éteinte). */
  coutReel: (s: CoutSite) => ReactNode;
  // Saisie d'une dépense (les mêmes champs et le même enregistrement qu'aujourd'hui).
  formOpen: boolean; setFormOpen: (o: boolean) => void; activeSites: { id: string; name: string }[];
  newSite: string; setNewSite: (v: string) => void; newCat: string; setNewCat: (v: string) => void;
  newLabel: string; setNewLabel: (v: string) => void; newAmount: string; setNewAmount: (v: string) => void;
  newDate: string; setNewDate: (v: string) => void; saving: boolean; addExpense: () => void; delExpense: (e: CoutDepense) => void;
}

const PERIODES: [Preset, string][] = [['month', 'Ce mois'], ['week', 'Cette semaine']];

export default function CoutV2(p: CoutV2Props) {
  const { sites, depenses } = p;
  const { fmtH, fmtEur, libelle: EXPENSE_LABEL, categories: EXPENSE_CATEGORIES } = p.regles;
  const vide = sites.length === 0 && depenses.length === 0;
  return (
    <CoqueL3
      open={p.open} onOpenChange={p.onOpenChange} large kicker="Plus ⋯" titre="Coût chantiers" testId="cout-v2" portee="dz-l3-cout"
      pied={(
        <>
          {p.activeSites.length === 0 && !p.loading && !p.failed && <span className="dz-l3-pied-note">Aucun chantier ouvert — créez-en un pour y rattacher une dépense.</span>}
          <BoutonBureau ton="principal" onClick={() => p.setFormOpen(true)} disabled={p.activeSites.length === 0} data-guide="bureau-cout.depense" data-testid="cout-ajouter">+ Ajouter une dépense</BoutonBureau>
        </>
      )}
    >
      <div className="dz-l3-seg" role="group" aria-label="Période" data-guide="bureau-cout.periodes">
        {PERIODES.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={p.preset === k} onClick={() => p.setPreset(k)}>{l}</button>
        ))}
        {p.creneau}
      </div>
      <p className="dz-l3-periode" data-testid="cout-periode">{p.periode}</p>

      {p.loading ? (
        <div className="dz-l3-vide" role="status"><span className="dz-l3-attente" aria-hidden="true" /> Calcul…</div>
      ) : p.failed ? (
        <div className="dz-l3-alerte" data-ton="err" role="alert"><b>Chiffres illisibles</b><span>Chiffres illisibles pour le moment. Réessayez — mieux vaut rien qu&apos;un coût faux.</span></div>
      ) : (
        <>
          <div className="dz-l3-stats" data-n="4">
            <div className="dz-l3-stat" data-testid="cr-hours"><span>Heures</span><b>{p.totals.min > 0 ? fmtH(p.totals.min) : '—'}</b>{p.totals.route > 0 && <small>dont {fmtH(p.totals.route)} de route</small>}</div>
            <div className="dz-l3-stat"><span>Main-d&apos;œuvre</span><b>{p.totals.cost > 0 ? fmtEur(p.totals.cost) : '—'}</b></div>
            <div className="dz-l3-stat"><span>Dépenses</span><b>{p.totals.exp !== 0 ? fmtEur(p.totals.exp) : '—'}</b></div>
            <div className="dz-l3-stat" data-ton="sombre"><span>Total</span><b>{p.totals.all !== 0 ? fmtEur(p.totals.all) : '—'}</b></div>
          </div>

          {p.missingRates && (
            <div className="dz-l3-alerte" data-ton="warn">
              <b>Coût incomplet {p.infoTaux}</b>
              <span>Taux horaire manquant pour certains salariés : coût incomplet.</span>
            </div>
          )}

          {vide ? (
            <div className="dz-l3-vide" data-testid="cout-vide">Aucune heure déclarée ni dépense sur cette période.</div>
          ) : (
            <div className="dz-l3-table dz-l3-cout__table" role="table" aria-label="Coût par chantier">
              <div className="dz-l3-table__tete" role="row">
                <span role="columnheader">Chantier</span><span role="columnheader">Heures</span><span role="columnheader">Main-d&apos;œuvre</span>
                <span role="columnheader">Dépenses</span><span role="columnheader">Total</span><span role="columnheader">Budget</span>
              </div>
              {sites.map((s) => {
                const on = p.expanded === s.id;
                const deps = p.depensesDe(s.id);
                const exp = deps.reduce((a, e) => a + e.amount, 0);
                const partiel = s.unpriced > 0;
                const b = p.budgets.get(s.id);
                const bp = b ? p.regles.budget(b) : null;
                return (
                  <div key={s.id} className="dz-l3-cout__bloc" data-ouvert={on || undefined} data-testid="cout-ligne">
                    <div className="dz-l3-table__ligne" role="row">
                      <span role="cell" className="dz-l3-cout__nom">
                        <button type="button" aria-expanded={on} onClick={() => p.setExpanded(on ? null : s.id)}>
                          <b>{s.name}</b>{s.city ? <small>{s.city}</small> : null}
                          <i className="dz-l3-chevron" aria-hidden="true">▾</i>
                        </button>
                        <small className="dz-l3-cout__resume">{fmtH(s.minutes)}{bp ? ` · budget ${Math.round(bp.pct)} %` : ''}{partiel ? ' · Taux manquant : coût incomplet' : ''}</small>
                      </span>
                      <span role="cell" className="dz-l3-mono">{fmtH(s.minutes)}{s.routeMinutes > 0 && <small>dont route {fmtH(s.routeMinutes)}</small>}</span>
                      <span role="cell" className="dz-l3-mono" data-ton={partiel ? 'err' : undefined}>{fmtEur(s.cost)}{partiel && <small>taux manquant : coût incomplet</small>}</span>
                      <span role="cell" className="dz-l3-mono">{fmtEur(exp)}</span>
                      <span role="cell" className="dz-l3-mono dz-l3-cout__total" data-ton={partiel ? 'err' : undefined}>{partiel ? '≥ ' : ''}{fmtEur(s.cost + exp)}</span>
                      <span role="cell" className="dz-l3-mono">{bp ? <>{Math.round(bp.pct)} %<em className="dz-l3-badge" data-ton={bp.tone || 'ok'}>{bp.label}</em></> : '—'}</span>
                    </div>
                    {on && (
                      <div className="dz-l3-cout__detail">
                        {bp && <p className="dz-l3-note">Budget main-d&apos;œuvre · tout le chantier · <b>{bp.label}</b></p>}
                        {p.coutReel(s)}
                        <p className="dz-l3-etiquette">Main-d&apos;œuvre</p>
                        <ul className="dz-l3-mini">
                          {Array.from(s.workers.values()).sort((a, z) => z.minutes - a.minutes).map((w, i) => (
                            <li key={i}><span>{w.name}</span><span className="dz-l3-mono">{fmtH(w.minutes)}{w.routeMinutes > 0 ? ` (dont ${fmtH(w.routeMinutes)} route)` : ''}{w.unpriced > 0 ? ' · taux ?' : ` · ${fmtEur(w.cost)}`}</span></li>
                          ))}
                        </ul>
                        <p className="dz-l3-etiquette">Dépenses{exp !== 0 ? ` · ${fmtEur(exp)}` : ''}</p>
                        {deps.length === 0 ? <p className="dz-l3-note">Aucune dépense sur cette période.</p> : (
                          <ul className="dz-l3-mini">
                            {deps.map((e) => (
                              <li key={e.id}>
                                <span><em className="dz-l3-badge">{EXPENSE_LABEL[e.category] || e.category}</em> {e.label || '—'}</span>
                                <span className="dz-l3-mono">{fmtEur(e.amount)}
                                  <button type="button" className="dz-l3-icone" onClick={() => p.delExpense(e)} title="Supprimer" aria-label={`Supprimer ${e.label || EXPENSE_LABEL[e.category] || 'la dépense'}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ST04 : la saisie d'une dépense, en fenêtre posée sur le panneau. Mêmes champs et même enregistrement que la ligne de saisie d'avant. */}
      <FenetreBureau
        open={p.formOpen} onOpenChange={(o) => { if (!o && !p.saving) p.setFormOpen(false); }} titre="Ajouter une dépense" testId="cout-depense" className="dz-l3"
        pied={(
          <>
            <BoutonBureau disabled={p.saving} onClick={() => p.setFormOpen(false)}>Annuler</BoutonBureau>
            <BoutonBureau ton="principal" disabled={p.saving} onClick={p.addExpense} data-testid="cout-depense-ajouter">{p.saving && <span className="dz-l3-attente" aria-hidden="true" />} Ajouter</BoutonBureau>
          </>
        )}
      >
        <div className="dz-l3-champs" data-n="2">
          <label className="dz-l3-champ" data-large>
            <span>Chantier</span>
            <select value={p.newSite} onChange={(e) => p.setNewSite(e.target.value)}>{p.activeSites.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          </label>
          <label className="dz-l3-champ">
            <span>Catégorie</span>
            <select value={p.newCat} onChange={(e) => p.setNewCat(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </label>
          <label className="dz-l3-champ">
            <span>Date</span>
            <input type="date" value={p.newDate} onChange={(e) => p.setNewDate(e.target.value)} />
          </label>
          <label className="dz-l3-champ" data-large>
            <span>Libellé</span>
            <input placeholder="Ex : plaques de plâtre" value={p.newLabel} onChange={(e) => p.setNewLabel(e.target.value)} />
          </label>
          <label className="dz-l3-champ">
            <span>Montant</span>
            <span className="dz-l3-suffixe"><input className="dz-l3-mono" inputMode="decimal" placeholder="0,00" value={p.newAmount} onChange={(e) => p.setNewAmount(e.target.value)} /><i>€</i></span>
          </label>
        </div>
      </FenetreBureau>
    </CoqueL3>
  );
}
