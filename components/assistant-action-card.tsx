'use client';

// Carte d'une action de l'Assistant BEMEXO (lot 3 bis, lot 7).
//
// Lot 7 — MOINS DE VALIDATIONS : action simple, claire, réversible → faite
// tout de suite, puis « ✅ Fait » + Annuler (vraie annulation) + Modifier.
// Info indispensable manquante → UNE question avec ses choix. Sinon (écritures
// multiples, message envoyé, correction passée, coût / paie / droits) : la
// fiche modifiable et « Confirmer ». Les contrôles sont ceux du serveur.

import type { ExtraControl } from '@/components/assistant-panel';
import { readCard, useCardMemory, writeCard } from '@/lib/card-memory';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Loader2, UserPlus, Building2, CalendarOff, CalendarPlus, CalendarRange, Clock, FolderInput, Paperclip,
  CalendarClock, Check, ShieldCheck, Receipt, Archive, UserCog, Send, BellRing, Lock, Link2, BadgeCheck, UserPen, UserX, Wallet, Settings,
  CalendarX, Eraser, FileX, FilePen, Trash2, MailX,
} from 'lucide-react';
import {
  ABSENCE_KINDS, ABSENCE_LABEL, CERT_LABEL, DOC_CATEGORY_LABEL, EXPENSE_LABEL, ROLE_LABEL, actionMode, applyAnswer, bulletinFigures, checkAction, frDate, questionFor, summarize,
  type ActionDraft, type ActionExecutor, type ActionExtra, type ActionResult,
} from '@/lib/assistant-actions';
import { ActionAsk, ActionDone } from '@/components/action-done';

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
  modifier_intervention: ['Modifier une intervention', CalendarClock],
  repondre_conge: ['Demande de congé', Check],
  lever_reserve: ['Lever une réserve', ShieldCheck],
  ajouter_depense: ['Ajouter une dépense', Receipt],
  modifier_client: ['Fiche client', Building2],
  archiver_client: ['Archiver un client', Archive],
  changer_role: ['Changer le rôle', UserCog],
  relancer_invitation: ['Relancer une invitation', Send],
  envoyer_rappel: ['Envoyer un rappel', BellRing],
  cloturer_mois: ['Clôturer le mois', Lock],
  attribuer_client: ['Attribuer un client', Link2],
  ajouter_habilitation: ['Ajouter une habilitation', BadgeCheck],
  modifier_salarie: ['Fiche salarié', UserPen],
  archiver_salarie: ['Archiver un salarié', UserX],
  cout_reel: ['Coût réel du salarié', Wallet],
  modifier_reglages: ['Réglages de l’entreprise', Settings],
  supprimer_intervention: ['Retirer du planning', CalendarX],
  effacer_planning: ['Effacer le planning', Eraser],
  supprimer_absence: ['Retirer une absence', CalendarX],
  supprimer_document: ['Supprimer un document', FileX],
  modifier_document: ['Modifier un document', FilePen],
  supprimer_depense: ['Supprimer une dépense', Trash2],
  modifier_depense: ['Corriger une dépense', Receipt],
  supprimer_habilitation: ['Supprimer une habilitation', Trash2],
  modifier_habilitation: ['Modifier une habilitation', BadgeCheck],
  annuler_invitation: ['Annuler une invitation', MailX],
};
const CONFIRM: Record<ActionDraft['type'], string> = {
  inviter_salarie: 'Confirmer et envoyer', creer_chantier: 'Confirmer', poser_absence: 'Enregistrer',
  affecter_planning: 'Enregistrer', planning_semaine: 'Appliquer', corriger_pointage: 'Corriger et prévenir',
  ranger_document: 'Ranger', modifier_intervention: 'Enregistrer', repondre_conge: 'Confirmer et prévenir',
  lever_reserve: 'Lever la réserve', ajouter_depense: 'Ajouter', modifier_client: 'Enregistrer', archiver_client: 'Archiver',
  changer_role: 'Changer le rôle', relancer_invitation: 'Renvoyer', envoyer_rappel: 'Envoyer', cloturer_mois: 'Clôturer',
  attribuer_client: 'Attribuer', ajouter_habilitation: 'Ajouter', modifier_salarie: 'Enregistrer', archiver_salarie: 'Archiver',
  cout_reel: 'Enregistrer', modifier_reglages: 'Enregistrer',
  supprimer_intervention: 'Retirer', effacer_planning: 'Effacer', supprimer_absence: 'Retirer', supprimer_document: 'Supprimer',
  modifier_document: 'Enregistrer', supprimer_depense: 'Supprimer', modifier_depense: 'Enregistrer', supprimer_habilitation: 'Supprimer',
  modifier_habilitation: 'Enregistrer', annuler_invitation: 'Annuler l’invitation',
};

interface Props {
  extra: ActionExtra; execute: ActionExecutor; onDone?: () => void;
  /** Lot 7 : la carte pilote le texte de sa bulle (voir ExtraControl). */
  ctl?: ExtraControl;
}

// Une action directe n'est lancée qu'UNE fois, même si l'écran se redessine.
const launched = new WeakSet<object>();

type Phase = 'auto' | 'question' | 'form' | 'done';

export default function AssistantActionCard({ extra, execute, onDone, ctl }: Props) {
  const { options } = extra;
  // Lot 7 : ce qui a déjà été fait survit à un redessin du panneau.
  const mem = readCard<{ phase: Phase; result: ActionResult; doneSummary: string; cancelled: boolean; d: ActionDraft }>(extra);
  const [d, setD] = useState<ActionDraft>(mem.d ?? extra.action.draft);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(mem.cancelled ?? false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const ctx = useMemo(() => ({
    today, planning: [], congesEnAttente: [],
    salaries: options.salaries.map((s) => ({ id: s.id, prenom: s.nom, nom: '', role: 'worker' })),
    chantiers: options.chantiers,
  }), [options, today]);
  const problems = useMemo(() => checkAction(d, ctx), [d, ctx]);
  const set = (patch: Partial<ActionDraft>) => setD((x) => ({ ...x, ...patch } as ActionDraft));

  const direct = actionMode(extra.action.draft) === 'direct';
  const [phase, setPhase] = useState<Phase>(() => {
    if (mem.phase) return mem.phase;
    if (!direct) return 'form';
    if (!extra.action.problems.length) return 'auto';
    return questionFor(extra.action.draft, extra.action.problems, ctx) ? 'question' : 'form';
  });
  const [result, setResult] = useState<ActionResult | null>(mem.result ?? null);
  const [doneSummary, setDoneSummary] = useState(mem.doneSummary ?? '');
  useCardMemory<typeof mem>(extra, (m) => {
    if (m.result) setResult(m.result);
    if (m.doneSummary) setDoneSummary(m.doneSummary);
    if (m.d) setD(m.d);
    if (m.phase) setPhase(m.phase);
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    writeCard(extra, { phase, cancelled });
  }, [phase, cancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  // « Modifier » après coup : l'ancienne action est défaite AU MOMENT d'enregistrer.
  const editOf = useRef<(() => Promise<{ ok: boolean; message: string }>) | null>(null);
  const [question, setQuestion] = useState(() => questionFor(extra.action.draft, extra.action.problems, ctx));
  // Fait : la bulle ne garde pas la question (« Pour quel salarié ? ») au-dessus du résultat.
  useEffect(() => { if (phase === 'question') ctl?.text(null); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'done') ctl?.settle('C’est fait.'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cancelled) ctl?.settle(); }, [cancelled]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (draft: ActionDraft) => {
    setBusy(true); setErr(null);
    if (editOf.current) {
      const u = await editOf.current();
      if (!u.ok) { setBusy(false); setErr(u.message); return; }
      editOf.current = null;
    }
    const summary = summarize(draft, ctx);
    const r = await execute(draft, summary, extra.attachment);
    setBusy(false);
    // Noté AVANT l'affichage : si le panneau a été redessiné entre-temps, la
    // nouvelle carte reprend ce résultat.
    if (r.ok) { writeCard(extra, { phase: 'done', result: r, doneSummary: summary, d: draft }); setResult(r); setDoneSummary(summary); setD(draft); setPhase('done'); onDone?.(); }
    else { writeCard(extra, { phase: 'form', d: draft }); setErr(r.message); setD(draft); setPhase('form'); }
  };

  useEffect(() => {
    if (phase !== 'auto' || launched.has(extra)) return;
    launched.add(extra);
    run(extra.action.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cancelled) return <p className="ac-hint">Action annulée : rien n’a été fait.</p>;
  if (phase === 'auto') return <p className="ac-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><style>{CSS}</style><Loader2 className="h-4 w-4 animate-spin" /> Je le fais…</p>;
  if (phase === 'done' && result) {
    return (
      <ActionDone
        message={result.message} summary={doneSummary} undo={result.undo} strongUndo={(result.count ?? 0) > 10}
        onEdit={result.undo ? () => { editOf.current = result.undo!; setPhase('form'); } : undefined}
      />
    );
  }
  if (phase === 'question' && question) {
    return (
      <ActionAsk text={question.text} chips={question.chips} onPick={(value) => {
        const nd = applyAnswer(d, question.field, value);
        const p2 = checkAction(nd, ctx);
        setD(nd);
        if (!p2.length) { launched.add(extra); run(nd); setPhase('auto'); return; }
        const q2 = questionFor(nd, p2, ctx);
        if (q2) setQuestion(q2); else setPhase('form');
      }} />
    );
  }

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
        <div className="ac-row">
          <div><label>Objet (facultatif)</label><input value={d.note} placeholder="Ex. : Remplacement chauffe-eau" onChange={(e) => set({ note: e.target.value })} /></div>
        </div>
        <div className="ac-row">
          <div><label>Début</label><input type="time" value={d.debut ?? ''} onChange={(e) => set({ debut: e.target.value })} /></div>
          <div><label>Fin</label><input type="time" value={d.fin ?? ''} onChange={(e) => set({ fin: e.target.value })} /></div>
        </div>
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
      body = (<>
        <div><label>Chantier</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
        <div className="ac-row">
          <div><label>Catégorie</label>
            <select value={d.categorie ?? ''} onChange={(e) => set({ categorie: e.target.value || undefined })}>
              <option value="">Sans catégorie</option>
              {Object.entries(DOC_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label>Nom</label><input value={d.libelle ?? ''} onChange={(e) => set({ libelle: e.target.value })} /></div>
        </div>
      </>);
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
    // ── Lot 7 ──
    case 'modifier_intervention':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Jour actuel</label><input type="date" value={d.date} disabled /></div>
        </div>
        {d.choix.length > 1 && (
          <div><label>Intervention</label>
            <select value={d.planning_id ?? ''} className={d.planning_id ? '' : 'todo'} onChange={(e) => set({ planning_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier}{c.debut ? ` · ${c.debut}` : ''}{c.note ? ` · ${c.note}` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="ac-row">
          <div><label>Nouveau jour</label><input type="date" value={d.nouvelle_date} onChange={(e) => set({ nouvelle_date: e.target.value })} /></div>
          <div><label>Nouvelle heure</label><input type="time" value={d.debut} onChange={(e) => set({ debut: e.target.value })} /></div>
        </div>
        <div className="ac-row">
          <div><label>Autre salarié</label>{salSelect(d.nouveau_user_id, (v) => set({ nouveau_user_id: v }), '')}</div>
          <div><label>Note</label><input value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></div>
        </div>
      </>);
      break;
    case 'repondre_conge':
      body = (<>
        {d.choix.length > 1 ? (
          <div><label>Demande</label>
            <select value={d.leave_id ?? ''} className={d.leave_id ? '' : 'todo'} onChange={(e) => set({ leave_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.nom} · {ABSENCE_LABEL[c.type] ?? c.type} · {frDate(c.du)} → {frDate(c.au)}</option>)}
            </select>
          </div>
        ) : d.choix[0] ? <p className="ac-hint" style={{ fontSize: 13, color: '#15120F', fontWeight: 700 }}>{d.choix[0].nom} · {ABSENCE_LABEL[d.choix[0].type] ?? d.choix[0].type} · {frDate(d.choix[0].du)} → {frDate(d.choix[0].au)}</p> : null}
        <div><label>Décision</label>
          <select value={d.decision} onChange={(e) => set({ decision: e.target.value as 'accepter' | 'refuser' })}>
            <option value="accepter">Accepter (posé au planning)</option><option value="refuser">Refuser</option>
          </select>
        </div>
        {d.decision === 'refuser' && <div><label>Motif (facultatif)</label><input value={d.motif} onChange={(e) => set({ motif: e.target.value })} /></div>}
        <p className="ac-hint">Le salarié est prévenu sur son téléphone.</p>
      </>);
      break;
    case 'lever_reserve':
      body = (<>
        <div><label>Réserve</label>
          <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
            <option value="">Choisir…</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.nom} · {frDate(c.date)}{c.detail ? ` · ${c.detail.slice(0, 40)}` : ''}</option>)}
          </select>
        </div>
        <div><label>Comment elle a été réglée (facultatif)</label><input value={d.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </>);
      break;
    case 'ajouter_depense':
      body = (<>
        <div><label>Chantier</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
        <div className="ac-row">
          <div><label>Montant (€)</label><input inputMode="decimal" value={d.montant} className={d.montant ? '' : 'todo'} onChange={(e) => set({ montant: e.target.value.replace(',', '.') })} /></div>
          <div><label>Date</label><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>
        <div className="ac-row">
          <div><label>Catégorie</label>
            <select value={d.categorie} onChange={(e) => set({ categorie: e.target.value })}>{Object.entries(EXPENSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div><label>Libellé</label><input value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} /></div>
        </div>
      </>);
      break;
    case 'modifier_client':
      body = (<>
        <div><label>Client</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
        <p className="ac-hint">Seuls les champs remplis changent.</p>
        <div className="ac-row">
          <div><label>Nouveau nom</label><input value={d.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
          <div><label>Ville</label><input value={d.ville} onChange={(e) => set({ ville: e.target.value })} /></div>
        </div>
        <div><label>Adresse</label><input value={d.adresse} onChange={(e) => set({ adresse: e.target.value })} /></div>
        <div className="ac-row">
          <div><label>Téléphone</label><input value={d.telephone} onChange={(e) => set({ telephone: e.target.value })} /></div>
          <div><label>Email</label><input value={d.email} onChange={(e) => set({ email: e.target.value.trim() })} /></div>
        </div>
        <div className="ac-row">
          <div><label>Heures prévues</label><input inputMode="decimal" value={d.budget_heures} onChange={(e) => set({ budget_heures: e.target.value.replace(',', '.') })} /></div>
          <div><label>Montant prévu (€)</label><input inputMode="decimal" value={d.budget_montant} onChange={(e) => set({ budget_montant: e.target.value.replace(',', '.') })} /></div>
        </div>
      </>);
      break;
    case 'archiver_client':
      body = (<>
        <div><label>Client</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
        <p className="ac-hint">Il disparaît des listes ; ses heures et documents restent. Réactivable depuis sa fiche.</p>
      </>);
      break;
    case 'changer_role':
      body = (
        <div className="ac-row">
          <div><label>Personne</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Rôle</label>
            <select value={d.role} onChange={(e) => set({ role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
      );
      break;
    case 'relancer_invitation':
      body = (
        <div><label>Invitation</label>
          <select value={d.email} className={d.email ? '' : 'todo'} onChange={(e) => set({ email: e.target.value })}>
            <option value="">Choisir…</option>
            {d.choix.map((c) => <option key={c.email} value={c.email}>{c.nom} · {c.email}</option>)}
          </select>
        </div>
      );
      break;
    case 'envoyer_rappel':
    case 'archiver_salarie':
      body = (<>
        <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
        {d.type === 'archiver_salarie' && <p className="ac-hint">Il ne peut plus se connecter ; ses heures restent. Réactivable depuis sa fiche.</p>}
      </>);
      break;
    case 'cloturer_mois':
      body = (<>
        <div><label>Mois</label><input type="month" value={d.mois} onChange={(e) => set({ mois: e.target.value })} /></div>
        <p className="ac-hint">Plus aucune heure de ce mois ne pourra être modifiée. « Rouvrir » reste possible depuis « Exporter ».</p>
      </>);
      break;
    case 'attribuer_client':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Jour</label><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></div>
        </div>
        <div><label>Client</label>{chSelect(d.worksite_id, (v) => set({ worksite_id: v }), d.chantier_texte)}</div>
      </>);
      break;
    case 'ajouter_habilitation':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Type</label>
            <select value={d.categorie} onChange={(e) => set({ categorie: e.target.value })}>{Object.entries(CERT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
        <div className="ac-row">
          <div><label>Précision</label><input value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} /></div>
          <div><label>Expire le</label><input type="date" value={d.expiration} className={d.expiration ? '' : 'todo'} onChange={(e) => set({ expiration: e.target.value })} /></div>
        </div>
      </>);
      break;
    case 'modifier_salarie':
      body = (<>
        <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
        <div className="ac-row">
          <div><label>Prénom</label><input value={d.prenom} onChange={(e) => set({ prenom: e.target.value })} /></div>
          <div><label>Nom</label><input value={d.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
        </div>
        <div><label>Téléphone</label><input value={d.telephone} onChange={(e) => set({ telephone: e.target.value })} /></div>
        <p className="ac-hint">Vide = inchangé. Le n° de sécurité sociale ne se modifie que sur sa fiche.</p>
      </>);
      break;
    case 'cout_reel':
      body = (<>
        <div className="ac-row">
          <div><label>Salarié</label>{salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}</div>
          <div><label>Mois</label><input type="month" value={d.mois} onChange={(e) => set({ mois: e.target.value })} /></div>
        </div>
        <div className="ac-row">
          <div><label>Brut</label><input inputMode="decimal" value={d.brut} onChange={(e) => set({ brut: e.target.value.replace(',', '.') })} /></div>
          <div><label>Coût employeur</label><input inputMode="decimal" value={d.cout_employeur} onChange={(e) => set({ cout_employeur: e.target.value.replace(',', '.') })} /></div>
          <div><label>Heures payées</label><input inputMode="decimal" value={d.heures_payees} onChange={(e) => set({ heures_payees: e.target.value.replace(',', '.') })} /></div>
        </div>
        <p className="ac-hint">Le bulletin n’est pas conservé ; le n° de sécurité sociale n’est jamais lu.</p>
      </>);
      break;
    // ── Lot 8 ──
    case 'supprimer_intervention':
      body = (
        <div><label>Intervention</label>
          <select value={d.planning_id ?? ''} className={d.planning_id ? '' : 'todo'} onChange={(e) => set({ planning_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucune intervention trouvée'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{[c.nom, c.date ? frDate(c.date) : '', c.chantier, c.debut, c.note].filter(Boolean).join(' · ')}</option>)}
          </select>
        </div>
      );
      break;
    case 'effacer_planning':
    case 'supprimer_absence':
      body = (<>
        <div><label>{d.type === 'effacer_planning' ? 'Planning de' : 'Salarié'}</label>
          {d.type === 'effacer_planning'
            ? <select value={d.user_id ?? ''} onChange={(e) => set({ user_id: e.target.value || null, salarie_texte: '' })}>
                <option value="">Toute l’équipe</option>
                {options.salaries.map((s2) => <option key={s2.id} value={s2.id}>{s2.nom}</option>)}
              </select>
            : salSelect(d.user_id, (v) => set({ user_id: v }), d.salarie_texte)}
        </div>
        <div className="ac-row">
          <div><label>Du</label><input type="date" value={d.du} onChange={(e) => set({ du: e.target.value })} /></div>
          <div><label>Au</label><input type="date" value={d.au} onChange={(e) => set({ au: e.target.value })} /></div>
        </div>
        <p className="ac-hint">{d.type === 'effacer_planning' ? 'Les absences restent. Les cases avec des heures notées ou envoyées, et les mois clôturés, ne sont jamais effacés.' : 'Le salarié redevient présent ces jours-là.'}</p>
      </>);
      break;
    case 'supprimer_document':
    case 'modifier_document':
      body = (<>
        <div><label>Document</label>
          <select value={d.document_id ?? ''} className={d.document_id ? '' : 'todo'} onChange={(e) => set({ document_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucun document trouvé'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.chantier} · {frDate(c.date)}</option>)}
          </select>
        </div>
        {d.type === 'modifier_document' && (
          <div className="ac-row">
            <div><label>Catégorie</label>
              <select value={d.categorie} onChange={(e) => set({ categorie: e.target.value })}>
                <option value="">(inchangée)</option>
                {Object.entries(DOC_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label>Nom</label><input value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} /></div>
          </div>
        )}
      </>);
      break;
    case 'supprimer_depense':
    case 'modifier_depense':
      body = (<>
        <div><label>Dépense</label>
          <select value={d.expense_id ?? ''} className={d.expense_id ? '' : 'todo'} onChange={(e) => set({ expense_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucune dépense trouvée'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.libelle} · {c.montant.toLocaleString('fr-FR')} € · {c.chantier} · {frDate(c.date)}</option>)}
          </select>
        </div>
        {d.type === 'modifier_depense' && (
          <div className="ac-row">
            <div><label>Montant (€)</label><input inputMode="decimal" value={d.montant} onChange={(e) => set({ montant: e.target.value.replace(',', '.') })} /></div>
            <div><label>Libellé</label><input value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} /></div>
          </div>
        )}
      </>);
      break;
    case 'supprimer_habilitation':
    case 'modifier_habilitation':
      body = (<>
        <div><label>Habilitation</label>
          <select value={d.cert_id ?? ''} className={d.cert_id ? '' : 'todo'} onChange={(e) => set({ cert_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucune habilitation trouvée'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.libelle || CERT_LABEL[c.categorie] || c.categorie} · expire le {frDate(c.expiration)}</option>)}
          </select>
        </div>
        {d.type === 'modifier_habilitation' && (
          <div className="ac-row">
            <div><label>Nouvelle expiration</label><input type="date" value={d.expiration} onChange={(e) => set({ expiration: e.target.value })} /></div>
            <div><label>Libellé</label><input value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} /></div>
          </div>
        )}
      </>);
      break;
    case 'annuler_invitation':
      body = (
        <div><label>Invitation</label>
          <select value={d.email} className={d.email ? '' : 'todo'} onChange={(e) => set({ email: e.target.value })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucune invitation en attente'}</option>
            {d.choix.map((c) => <option key={c.email} value={c.email}>{c.nom} · {c.email}</option>)}
          </select>
        </div>
      );
      break;
    case 'modifier_reglages': {
      const yn = (k: 'relance_auto' | 'alertes_budget' | 'trajet_paye', label: string) => (
        <div><label>{label}</label>
          <select value={d[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<ActionDraft>)}>
            <option value="">Inchangé</option><option value="oui">Oui</option><option value="non">Non</option>
          </select>
        </div>
      );
      const txt = (k: 'heures_hebdo' | 'email_comptable' | 'heure_relance' | 'majoration_1' | 'majoration_2' | 'telephone' | 'email' | 'adresse' | 'code_postal' | 'ville', label: string) => (
        <div><label>{label}</label><input value={d[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<ActionDraft>)} /></div>
      );
      body = (<>
        <p className="ac-hint">Seuls les champs remplis changent.</p>
        <div className="ac-row">{txt('heures_hebdo', 'Heures / semaine')}{txt('email_comptable', 'Email du comptable')}</div>
        <div className="ac-row">{yn('relance_auto', 'Relance auto')}{txt('heure_relance', 'Heure relance')}</div>
        <div className="ac-row">{yn('alertes_budget', 'Alertes budget')}{yn('trajet_paye', 'Trajet payé')}</div>
        <div className="ac-row">{txt('majoration_1', 'Heures sup 1 (%)')}{txt('majoration_2', 'Heures sup 2 (%)')}</div>
        <div className="ac-row">{txt('telephone', 'Téléphone')}{txt('email', 'Email')}</div>
        <div className="ac-row">{txt('adresse', 'Adresse')}{txt('code_postal', 'CP')}{txt('ville', 'Ville')}</div>
      </>);
      break;
    }
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
        <button
          type="button" className="ac-b no" disabled={busy}
          onClick={() => { if (editOf.current && result) { editOf.current = null; setPhase('done'); } else setCancelled(true); }}
        >{editOf.current ? 'Garder comme avant' : 'Annuler'}</button>
        <button
          type="button" className="ac-b ok" disabled={busy || problems.length > 0} data-testid="action-confirm"
          onClick={() => run(d)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {CONFIRM[d.type]}
        </button>
      </div>
    </div>
  );
}
