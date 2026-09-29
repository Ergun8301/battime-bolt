'use client';

// Carte de confirmation d'une action préparée par l'Assistant BEMEXO (lot 3 bis).
// Tout est MODIFIABLE ; rien ne s'exécute avant « Confirmer ». Les contrôles
// sont les mêmes que côté serveur (checkAction), à chaque modification.

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, UserPlus, Building2, CalendarOff, CalendarPlus, CalendarRange, Clock, FolderInput, Paperclip } from 'lucide-react';
import {
  ABSENCE_KINDS, ABSENCE_LABEL, bulletinFigures, checkAction, frDate, summarize,
  type ActionDraft, type ActionExecutor, type ActionExtra,
} from '@/lib/assistant-actions';

const CSS = `
.ac{margin-top:10px;border:1px solid rgba(21,18,15,.14);border-radius:14px;background:#FBF8F2;padding:11px}
.ac-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:900;color:#15120F;margin:0 0 8px}
.ac-h .i{width:26px;height:26px;border-radius:8px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;flex:none}
.ac-f{display:flex;flex-direction:column;gap:6px}
.ac-row{display:flex;gap:6px}
.ac-row>*{flex:1;min-width:0}
.ac label{font-size:10.5px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.05em;display:block;margin:0 0 2px}
.ac input,.ac select,.ac textarea{width:100%;font-family:inherit;font-size:13.5px;border:1.5px solid rgba(21,18,15,.16);border-radius:8px;padding:6px 8px;background:#fff;color:#15120F;box-sizing:border-box}
.ac .todo{border-color:#F1B84A;background:#FFFBF0}
.ac-wk{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:10px;padding:7px 8px}
.ac-wk-h{display:grid;grid-template-columns:auto auto 1fr;gap:6px;align-items:center;font-size:13px}
.ac-wk-h>span:first-of-type{font-size:11px;color:#6E6A63;font-weight:700}
.ac-wk details{margin-top:4px}
.ac-wk summary{font-size:11.5px;color:#6E6A63;font-weight:700;cursor:pointer}
.ac-wk-d{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center;font-size:12px;margin-top:4px}
.ac-notes{margin:6px 0 0;padding:0 0 0 16px;font-size:12px;color:#56514a;line-height:1.4}
.ac-p{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0}
.ac-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:9px}
.ac-b{border:none;border-radius:10px;padding:8px 13px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
.ac-b.ok{background:#15120F;color:#FBF8F2}
.ac-b.ok:disabled{opacity:.35;cursor:default}
.ac-b.no{background:transparent;color:#6E6A63}
.ac-done{display:flex;align-items:center;gap:8px;color:#0F7A43;font-weight:800;font-size:13.5px;margin-top:10px}
.ac-err{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0}
.ac-sub{font-size:11.5px;font-weight:900;color:#15120F;margin:6px 0 0}
.ac-att{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#56514a;margin:-4px 0 8px}
.ac-hint{font-size:11.5px;color:#6E6A63;margin:4px 0 0}
`;

const TITLES: Record<ActionDraft['type'], [string, typeof UserPlus]> = {
  inviter_salarie: ['Inviter un salarié', UserPlus],
  creer_chantier: ['Créer un client / chantier', Building2],
  poser_absence: ['Poser une absence', CalendarOff],
  affecter_planning: ['Ajouter au planning', CalendarPlus],
  planning_semaine: ['Planning proposé', CalendarRange],
  corriger_pointage: ['Corriger un pointage', Clock],
  ranger_document: ['Ranger dans les documents', FolderInput],
};
const CONFIRM: Record<ActionDraft['type'], string> = {
  inviter_salarie: 'Confirmer et envoyer', creer_chantier: 'Confirmer', poser_absence: 'Confirmer',
  affecter_planning: 'Confirmer', planning_semaine: 'Appliquer', corriger_pointage: 'Corriger et prévenir',
  ranger_document: 'Ranger',
};

interface Props { extra: ActionExtra; execute: ActionExecutor; onDone?: () => void }

export default function AssistantActionCard({ extra, execute, onDone }: Props) {
  const { options } = extra;
  const [d, setD] = useState<ActionDraft>(extra.action.draft);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const ctx = useMemo(() => ({
    today, planning: [], congesEnAttente: [],
    salaries: options.salaries.map((s) => ({ id: s.id, prenom: s.nom, nom: '', role: 'worker' })),
    chantiers: options.chantiers,
  }), [options, today]);
  const problems = useMemo(() => checkAction(d, ctx), [d, ctx]);
  const set = (patch: Partial<ActionDraft>) => setD((x) => ({ ...x, ...patch } as ActionDraft));

  if (done) return <div className="ac-done"><style>{CSS}</style><CheckCircle2 className="h-5 w-5" /> {done}</div>;
  if (cancelled) return <p className="ac-hint">Action annulée : rien n’a été fait.</p>;

  const [title, Icon] = TITLES[d.type];
  const salSelect = (value: string | null, onChange: (v: string | null) => void, said = '') => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={value ? '' : 'todo'} aria-label="Salarié">
      <option value="">{said ? `« ${said} » → choisir…` : 'Choisir le salarié…'}</option>
      {options.salaries.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
    </select>
  );
  const chSelect = (value: string | null, onChange: (v: string | null) => void, said = '', label = 'Choisir le chantier…') => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={value ? '' : 'todo'} aria-label="Chantier">
      <option value="">{said ? `« ${said} » → choisir…` : label}</option>
      {options.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
    </select>
  );

  let body: React.ReactNode = null;
  switch (d.type) {
    case 'inviter_salarie':
      body = (<>
        <div className="ac-row">
          <div><label>Prénom</label><input value={d.prenom} onChange={(e) => set({ prenom: e.target.value })} /></div>
          <div><label>Nom</label><input value={d.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
        </div>
        <div><label>Email</label><input type="email" inputMode="email" value={d.email} onChange={(e) => set({ email: e.target.value.trim() })} className={d.email ? '' : 'todo'} /></div>
        <div><label>Téléphone (facultatif)</label><input type="tel" value={d.telephone} onChange={(e) => set({ telephone: e.target.value })} /></div>
        {(d.date_entree || d.contrat || d.taux_horaire || d.heures_hebdo || d.bulletin) && (<>
          <p className="ac-sub">Infos paie (lues sur le bulletin)</p>
          <div className="ac-row">
            <div><label>Entrée</label><input type="date" value={d.date_entree ?? ''} onChange={(e) => set({ date_entree: e.target.value })} /></div>
            <div><label>Contrat</label><input value={d.contrat ?? ''} onChange={(e) => set({ contrat: e.target.value })} /></div>
          </div>
          <div className="ac-row">
            <div><label>Taux horaire (€)</label><input inputMode="decimal" value={d.taux_horaire ?? ''} onChange={(e) => set({ taux_horaire: e.target.value.replace(',', '.') })} /></div>
            <div><label>Heures / semaine</label><input inputMode="decimal" value={d.heures_hebdo ?? ''} onChange={(e) => set({ heures_hebdo: e.target.value.replace(',', '.') })} /></div>
          </div>
          {d.bulletin && (() => {
            const b = d.bulletin!;
            const setB = (patch: Partial<typeof b>) => set({ bulletin: { ...b, ...patch } });
            const ok = bulletinFigures(b).complete;
            return (<>
              <p className="ac-sub">Coût réel ({b.mois || 'mois ?'})</p>
              <div className="ac-row">
                <div><label>Brut</label><input inputMode="decimal" value={b.brut} onChange={(e) => setB({ brut: e.target.value.replace(',', '.') })} /></div>
                <div><label>Coût employeur</label><input inputMode="decimal" value={b.cout_employeur} onChange={(e) => setB({ cout_employeur: e.target.value.replace(',', '.') })} /></div>
                <div><label>Heures payées</label><input inputMode="decimal" value={b.heures_payees} onChange={(e) => setB({ heures_payees: e.target.value.replace(',', '.') })} /></div>
              </div>
              <p className="ac-hint">{ok ? 'Enregistré avec l’invitation. Le bulletin n’est pas conservé.' : 'Chiffres incomplets : le coût réel ne sera pas enregistré.'}</p>
            </>);
          })()}
        </>)}
      </>);
      break;
    case 'creer_chantier':
      body = (<>
        <div><label>Nom du client</label><input value={d.nom_client} onChange={(e) => set({ nom_client: e.target.value })} className={d.nom_client ? '' : 'todo'} /></div>
        <div className="ac-row">
          <div><label>Ville</label><input value={d.ville} onChange={(e) => set({ ville: e.target.value })} /></div>
          <div><label>Téléphone</label><input value={d.telephone} onChange={(e) => set({ telephone: e.target.value })} /></div>
        </div>
        <div><label>Adresse</label><input value={d.adresse} onChange={(e) => set({ adresse: e.target.value })} /></div>
        {(d.budget_heures || d.budget_montant || extra.attachment) && (
          <div className="ac-row">
            <div><label>Montant prévu (€)</label><input inputMode="decimal" value={d.budget_montant ?? ''} onChange={(e) => set({ budget_montant: e.target.value.replace(',', '.') })} /></div>
            <div><label>Heures prévues</label><input inputMode="decimal" value={d.budget_heures ?? ''} onChange={(e) => set({ budget_heures: e.target.value.replace(',', '.') })} /></div>
          </div>
        )}
      </>);
      break;
    case 'poser_absence':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Type</label>
            <select value={d.absence_type} onChange={(e) => set({ absence_type: e.target.value })}>
              {ABSENCE_KINDS.map((k) => <option key={k} value={k}>{ABSENCE_LABEL[k]}</option>)}
            </select>
          </div>
        </div>
        <div className="ac-row">
          <div><label>Du</label><input type="date" value={d.du} onChange={(e) => set({ du: e.target.value })} /></div>
          <div><label>Au</label><input type="date" value={d.au} onChange={(e) => set({ au: e.target.value })} /></div>
        </div>
        <p className="ac-hint">Remplace les absences déjà posées sur ces dates, comme l’écran « Statut ».</p>
      </>);
      break;
    case 'affecter_planning':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Chantier</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
        </div>
        <div><label>Jour(s)</label>
          <input type="date" value={d.dates[0] ?? ''} onChange={(e) => set({ dates: e.target.value ? [e.target.value, ...d.dates.slice(1).filter((x) => x !== e.target.value)] : d.dates.slice(1) })} />
          {d.dates.length > 1 && <p className="ac-hint">+ {d.dates.slice(1).map(frDate).join(', ')}</p>}
        </div>
        <div><label>Note pour le poseur (facultatif)</label><input value={d.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </>);
      break;
    case 'planning_semaine': {
      const people = Array.from(new Set(d.lignes.map((l) => l.user_id)));
      const nameOf = (id: string) => options.salaries.find((s) => s.id === id)?.nom ?? '—';
      const setCells = (pred: (l: { user_id: string; date: string }) => boolean, v: string | null) =>
        set({ lignes: d.lignes.map((l) => (pred(l) ? { ...l, worksite_id: v } : l)) });
      body = (<>
        {people.length === 0 ? <p className="ac-hint">Tout le monde est déjà planifié ou absent.</p> : people.map((u) => {
          const rows = d.lignes.filter((l) => l.user_id === u);
          const same = rows.every((l) => l.worksite_id === rows[0].worksite_id);
          return (
            <div key={u} className="ac-wk">
              <div className="ac-wk-h">
                <b>{nameOf(u)}</b>
                <span>{rows.length} j</span>
                {same
                  ? chSelect(rows[0].worksite_id, (v) => setCells((l) => l.user_id === u, v), '', 'Pas de chantier')
                  : <span className="ac-hint">Plusieurs chantiers</span>}
              </div>
              <details>
                <summary>Par jour</summary>
                {rows.map((l) => (
                  <div key={l.date} className="ac-wk-d">
                    <span>{frDate(l.date)}</span>
                    {chSelect(l.worksite_id, (v) => setCells((x) => x.user_id === u && x.date === l.date, v), '', 'Pas de chantier')}
                  </div>
                ))}
              </details>
            </div>
          );
        })}
        {d.notes.length > 0 && <ul className="ac-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </>);
      break;
    }
    case 'ranger_document':
      body = (
        <div><label>Chantier</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
      );
      break;
    case 'corriger_pointage':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Jour</label><input type="date" value={d.date} disabled /></div>
        </div>
        {d.choix.length > 1 && (
          <div><label>Ligne à corriger</label>
            <select value={d.entry_id ?? ''} onChange={(e) => set({ entry_id: e.target.value || null })} className={d.entry_id ? '' : 'todo'}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.debut}–{c.fin}</option>)}
            </select>
          </div>
        )}
        {d.choix.length === 1 && <p className="ac-hint">Actuellement : {d.choix[0].chantier} · {d.choix[0].debut}–{d.choix[0].fin}</p>}
        <div className="ac-row">
          <div><label>Nouveau début</label><input type="time" value={d.debut} onChange={(e) => set({ debut: e.target.value })} /></div>
          <div><label>Nouvelle fin</label><input type="time" value={d.fin} onChange={(e) => set({ fin: e.target.value })} /></div>
        </div>
        <p className="ac-hint">Même règle que « Corriger les heures » : c’est tracé et le salarié est prévenu.</p>
      </>);
      break;
  }

  return (
    <div className="ac" data-testid="action-card" data-type={d.type}>
      <style>{CSS}</style>
      <p className="ac-h"><span className="i"><Icon className="h-3.5 w-3.5" /></span>{title}</p>
      {extra.attachment && <p className="ac-att"><Paperclip className="h-3.5 w-3.5" /> {extra.attachment.name}</p>}
      <div className="ac-f">{body}</div>
      {problems.map((p) => <p key={p} className="ac-p">{p}</p>)}
      {err && <p className="ac-err">{err}</p>}
      <div className="ac-foot">
        <button type="button" className="ac-b no" onClick={() => setCancelled(true)} disabled={busy}>Annuler</button>
        <button
          type="button" className="ac-b ok" disabled={busy || problems.length > 0} data-testid="action-confirm"
          onClick={async () => {
            setBusy(true); setErr(null);
            const r = await execute(d, summarize(d, ctx), extra.attachment);
            setBusy(false);
            if (r.ok) { setDone(r.message); onDone?.(); } else setErr(r.message);
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {CONFIRM[d.type]}
        </button>
      </div>
    </div>
  );
}
