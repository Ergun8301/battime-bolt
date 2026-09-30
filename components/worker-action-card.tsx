'use client';

// Carte d'une action salarié de l'Assistant BEMEXO (lot 3 bis, lot 7).
// Lot 7 : geste simple et complet → fait tout de suite, « ✅ Fait » + Annuler +
// Modifier ; info manquante → UNE question ; envoi de la journée, nouveau
// chantier, email client, correction d'une ligne envoyée → à confirmer.

import type { ExtraControl } from '@/components/assistant-panel';
import { readCard, useCardMemory, writeCard } from '@/lib/card-memory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, CalendarOff, Play, Square, AlertTriangle, FolderInput, Paperclip, Send, Clock, UtensilsCrossed, Copy, Wrench, MapPin, Mail, Eraser, CalendarX, CircleX, FileX } from 'lucide-react';
import {
  applyWorkerAnswer, checkWorkerAction, DOC_CATEGORY_LABEL, LEAVE_KINDS, LEAVE_LABEL, workerActionMode, workerQuestionFor,
  type WorkerActionDraft, type WorkerLive, type WorkerSnapshot,
} from '@/supabase/functions/_shared/worker-assistant-core';
import type { WorkerActionExtra } from '@/lib/worker-assistant';
import type { WorkerActionExecutor, WorkerActionResult } from '@/lib/worker-actions';
import { ActionAsk, ActionDone } from '@/components/action-done';
import GeoInfoDialog from '@/components/geo-info-dialog';
import { markGeoInfoSeen } from '@/lib/position-info';

const CSS = `
.wa{margin-top:10px;border:1px solid rgba(21,18,15,.14);border-radius:14px;background:#FBF8F2;padding:11px}
.wa-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:900;color:#15120F;margin:0 0 8px}
.wa-h .i{width:26px;height:26px;border-radius:8px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;flex:none}
.wa-f{display:flex;flex-direction:column;gap:6px}
.wa-row{display:flex;gap:6px}.wa-row>*{flex:1;min-width:0}
.wa label{font-size:10.5px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.05em;display:block;margin:0 0 2px}
.wa input,.wa select,.wa textarea{width:100%;font-family:inherit;font-size:14px;border:1.5px solid rgba(21,18,15,.16);border-radius:8px;padding:7px 8px;background:#fff;color:#15120F;box-sizing:border-box}
.wa .todo{border-color:#F1B84A;background:#FFFBF0}
.wa-att{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#56514a;margin:-4px 0 8px}
.wa .wa-check{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#15120F;text-transform:none;letter-spacing:0}
.wa .wa-check input{width:18px;height:18px}
.wa-info{font-size:13px;color:#15120F;font-weight:700}
.wa-p{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0}
.wa-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:9px}
.wa-b{border:none;border-radius:10px;padding:8px 13px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
.wa-b.ok{background:#15120F;color:#FBF8F2}.wa-b.ok:disabled{opacity:.35;cursor:default}
.wa-b.no{background:transparent;color:#6E6A63}
.wa-done{display:flex;align-items:center;gap:8px;color:#0F7A43;font-weight:800;font-size:14px;margin-top:10px}
`;

const HEAD: Record<WorkerActionDraft['type'], [string, typeof Play, string]> = {
  demander_conge: ['Demande de congé', CalendarOff, 'Envoyer la demande'],
  commencer_pointage: ['Commencer le pointage', Play, 'Je commence'],
  terminer_pointage: ['Terminer le pointage', Square, 'J’ai fini'],
  signaler_reserve: ['Signaler une réserve', AlertTriangle, 'Confirmer'],
  ranger_photo: ['Ranger sur le chantier', FolderInput, 'Ranger'],
  envoyer_journee: ['Envoyer ma journée', Send, 'Envoyer au bureau'],
  modifier_heures: ['Changer mes horaires', Clock, 'Enregistrer'],
  panier_repas: ['Panier repas', UtensilsCrossed, 'Enregistrer'],
  copier_journee: ['Copier une journée', Copy, 'Copier'],
  reserve_corrigee: ['Réserve corrigée sur place', Wrench, 'Confirmer'],
  nouveau_chantier: ['Nouveau chantier', MapPin, 'Ajouter'],
  email_client: ['Email du client', Mail, 'Enregistrer'],
  effacer_heures: ['Effacer mes heures', Eraser, 'Effacer'],
  annuler_conge: ['Annuler ma demande', CalendarX, 'Annuler la demande'],
  modifier_conge: ['Changer ma demande', CalendarOff, 'Envoyer'],
  annuler_pointage: ['Annuler le pointage', CircleX, 'Annuler le pointage'],
  retirer_photo: ['Retirer un document', FileX, 'Retirer'],
  retirer_reserve: ['Retirer la réserve', AlertTriangle, 'Retirer'],
};
const launched = new WeakSet<object>();
type Phase = 'auto' | 'question' | 'form' | 'done';
const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '');

interface Props {
  extra: WorkerActionExtra; execute: WorkerActionExecutor; onDone?: () => void;
  /** Lot 7 : la carte pilote le texte de sa bulle (voir ExtraControl). */
  ctl?: ExtraControl;
}

export default function WorkerActionCard({ extra, execute, onDone, ctl }: Props) {
  // Lot 7 : ce qui a déjà été fait survit à un redessin du panneau.
  const mem = readCard<{ phase: Phase; result: WorkerActionResult; done: string; cancelled: boolean; d: WorkerActionDraft }>(extra);
  const [d, setD] = useState<WorkerActionDraft>(mem.d ?? extra.workerAction.draft);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(mem.done ?? null);
  const [cancelled, setCancelled] = useState(mem.cancelled ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [geoFor, setGeoFor] = useState<string | null>(null);
  const snap: WorkerSnapshot = useMemo(() => ({ aujourdhui: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }), chantiers: extra.chantiers, semaine: [], planning: [] }), [extra.chantiers]);
  const live: WorkerLive = useMemo(() => ({
    enCours: extra.workerAction.draft.type === 'terminer_pointage' && extra.workerAction.draft.depuis
      ? { chantier_id: '', chantier: extra.workerAction.draft.chantier, depuis: extra.workerAction.draft.depuis } : null,
    lignes: extra.workerAction.draft.type === 'signaler_reserve' || extra.workerAction.draft.type === 'modifier_heures' || extra.workerAction.draft.type === 'reserve_corrigee' ? extra.workerAction.draft.choix
      : extra.workerAction.draft.type === 'ranger_photo' ? extra.workerAction.draft.lignes : [],
    // Contrôles « serveur » déjà faits (rien hier, rien aujourd'hui) : on ne les rejoue pas ici.
    hier: undefined,
  }), [extra.workerAction.draft]);
  // Un « déjà en cours » vu par le serveur reste un blocage ici.
  const problems = useMemo(() => {
    const p = checkWorkerAction(d, snap, live).filter((x) => !(d.type === 'panier_repas' && x.startsWith('Aucune ligne')));
    const serverOnly = extra.workerAction.problems.filter((x) => x.startsWith('Un pointage') || x.startsWith('Rien à') || x.startsWith('Aucune ligne'));
    return Array.from(new Set([...p, ...(d === extra.workerAction.draft ? serverOnly : serverOnly.filter((x) => x.startsWith('Un pointage')))]));
  }, [d, snap, live, extra.workerAction.draft, extra.workerAction.problems]);
  const set = (patch: Partial<WorkerActionDraft>) => setD((x) => ({ ...x, ...patch } as WorkerActionDraft));
  const direct = workerActionMode(extra.workerAction.draft) === 'direct';
  const [question, setQuestion] = useState(() => workerQuestionFor(extra.workerAction.draft, extra.workerAction.problems, snap));
  const [phase, setPhase] = useState<Phase>(() => mem.phase ?? (!direct ? 'form' : !extra.workerAction.problems.length ? 'auto' : question ? 'question' : 'form'));
  const [result, setResult] = useState<WorkerActionResult | null>(mem.result ?? null);
  useCardMemory<typeof mem>(extra, (m) => {
    if (m.result) setResult(m.result);
    if (m.done) setDone(m.done);
    if (m.d) setD(m.d);
    if (m.phase) setPhase(m.phase);
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    writeCard(extra, { phase, cancelled });
  }, [phase, cancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'question') ctl?.text(null); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'done') ctl?.settle('C’est fait.'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cancelled) ctl?.settle(); }, [cancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  const editOf = useRef<WorkerActionResult['undo'] | null>(null);

  const run = async (draft: WorkerActionDraft = d) => {
    setBusy(true); setErr(null);
    if (editOf.current) {
      const u = await editOf.current();
      if (!u.ok) { setBusy(false); setErr(u.message); return; }
      editOf.current = null;
    }
    const r = await execute(draft, extra.attachment);
    setBusy(false);
    setD(draft);
    if (r.geoInfoFor) { setGeoFor(r.geoInfoFor); setPhase('form'); return; }
    if (r.ok) { writeCard(extra, { phase: 'done', result: r, done: r.message, d: draft }); setResult(r); setDone(r.message); setPhase('done'); onDone?.(); }
    else { writeCard(extra, { phase: 'form', d: draft }); setErr(r.message); setPhase('form'); }
  };

  useEffect(() => {
    if (phase !== 'auto' || launched.has(extra)) return;
    launched.add(extra);
    run(extra.workerAction.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done' && result) {
    return <ActionDone message={result.message} undo={result.undo} onEdit={result.undo ? () => { editOf.current = result.undo!; setPhase('form'); } : undefined} />;
  }
  if (done && phase !== 'form') return <div className="wa-done"><style>{CSS}</style><CheckCircle2 className="h-5 w-5" /> {done}</div>;
  if (cancelled) return <p className="wa-info" style={{ fontWeight: 600, color: '#6E6A63', fontSize: 12.5 }}>Annulé : rien n’a été fait.</p>;
  if (phase === 'auto') return <p className="wa-info" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><Loader2 className="h-4 w-4 animate-spin" /> Je le fais…</p>;
  if (phase === 'question' && question) {
    return (
      <ActionAsk text={question.text} chips={question.chips} onPick={(value) => {
        const nd = applyWorkerAnswer(d, question.field, value);
        const p2 = checkWorkerAction(nd, snap, live);
        setD(nd);
        if (!p2.length) { launched.add(extra); setPhase('auto'); run(nd); return; }
        const q2 = workerQuestionFor(nd, p2, snap);
        if (q2) setQuestion(q2); else setPhase('form');
      }} />
    );
  }
  const [title, Icon, confirm] = HEAD[d.type];

  let body: React.ReactNode = null;
  switch (d.type) {
    case 'demander_conge':
      body = (<>
        <div><label>Type</label>
          <select value={d.conge_type} onChange={(e) => set({ conge_type: e.target.value })}>
            {LEAVE_KINDS.map((k) => <option key={k} value={k}>{LEAVE_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="wa-row">
          <div><label>Du</label><input type="date" value={d.du} className={d.du ? '' : 'todo'} onChange={(e) => set({ du: e.target.value, au: d.au && d.au >= e.target.value ? d.au : e.target.value })} /></div>
          <div><label>Au</label><input type="date" value={d.au} className={d.au ? '' : 'todo'} onChange={(e) => set({ au: e.target.value })} /></div>
        </div>
        <div><label>Mot pour le bureau (facultatif)</label><input value={d.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </>);
      break;
    case 'commencer_pointage':
      body = (
        <div><label>Chantier</label>
          <select value={d.worksite_id ?? ''} className={d.worksite_id ? '' : 'todo'} onChange={(e) => set({ worksite_id: e.target.value || null })} aria-label="Chantier">
            <option value="">{d.chantier_texte ? `« ${d.chantier_texte} » → choisir…` : 'Choisir le chantier…'}</option>
            {extra.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
          </select>
        </div>
      );
      break;
    case 'terminer_pointage':
      body = (<>
        {d.depuis && <p className="wa-info">{d.chantier} · depuis {hhmm(d.depuis)}</p>}
        <div><label>Heure de fin (vide = maintenant)</label><input type="time" value={d.fin} onChange={(e) => set({ fin: e.target.value })} /></div>
      </>);
      break;
    case 'signaler_reserve':
      body = (<>
        {d.choix.length > 1 ? (
          <div><label>Chantier</label>
            <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.debut}–{c.fin}</option>)}
            </select>
          </div>
        ) : d.choix[0] ? <p className="wa-info">{d.choix[0].chantier} · {d.choix[0].debut}–{d.choix[0].fin}</p> : null}
        <div><label>Détail des réserves (facultatif)</label>
          <textarea rows={2} value={d.detail} placeholder="Ex. : fissure mur sud" onChange={(e) => set({ detail: e.target.value })} />
        </div>
      </>);
      break;
 case 'ranger_photo':
      body = (<>
        <div><label>Chantier</label>
          <select value={d.worksite_id ?? ''} className={d.worksite_id ? '' : 'todo'} onChange={(e) => set({ worksite_id: e.target.value || null })} aria-label="Chantier">
            <option value="">{d.chantier_texte ? `« ${d.chantier_texte} » → choisir…` : 'Choisir le chantier…'}</option>
            {extra.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
          </select>
        </div>
        {d.categorie && <p className="wa-info">Catégorie : {DOC_CATEGORY_LABEL[d.categorie] ?? d.categorie}</p>}
        <label className="wa-check"><input type="checkbox" checked={d.reserve} onChange={(e) => set({ reserve: e.target.checked })} /> Avec réserve</label>
        {d.reserve && (
          <div><label>Détail des réserves (facultatif)</label>
            <textarea rows={2} value={d.detail} placeholder="Ex. : fissure mur sud" onChange={(e) => set({ detail: e.target.value })} />
          </div>
        )}
      </>);
      break;
    // ── Lot 7 ──
    case 'envoyer_journee':
      body = <p className="wa-info">{d.lignes} chantier{d.lignes > 1 ? 's' : ''} aujourd’hui (prévus compris) partent au bureau.</p>;
      break;
    case 'modifier_heures':
      body = (<>
        {d.choix.length > 1 && (
          <div><label>Ligne</label>
            <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.debut}–{c.fin}</option>)}
            </select>
          </div>
        )}
        <div className="wa-row">
          <div><label>Début</label><input type="time" value={d.debut} onChange={(e) => set({ debut: e.target.value })} /></div>
          <div><label>Fin</label><input type="time" value={d.fin} onChange={(e) => set({ fin: e.target.value })} /></div>
        </div>
        {d.choix.find((c) => c.id === d.entry_id)?.envoyee && <p className="wa-p" style={{ color: '#6E6A63' }}>Journée déjà envoyée : le bureau sera prévenu de la modification.</p>}
      </>);
      break;
    case 'panier_repas':
      body = <label className="wa-check"><input type="checkbox" checked={d.valeur} onChange={(e) => set({ valeur: e.target.checked })} /> Panier repas aujourd’hui</label>;
      break;
    case 'copier_journee':
      body = (
        <div className="wa-row">
          <div><label>Copier le</label><input type="date" value={d.depuis} onChange={(e) => set({ depuis: e.target.value })} /></div>
          <div><label>Sur le</label><input type="date" value={d.vers[0] ?? ''} onChange={(e) => set({ vers: e.target.value ? [e.target.value] : [] })} /></div>
        </div>
      );
      break;
    case 'reserve_corrigee':
      body = (
        <div><label>Chantier</label>
          <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
            <option value="">Choisir…</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.debut}–{c.fin}</option>)}
          </select>
        </div>
      );
      break;
    case 'nouveau_chantier':
      body = (
        <div className="wa-row">
          <div><label>Nom</label><input value={d.nom} className={d.nom ? '' : 'todo'} onChange={(e) => set({ nom: e.target.value })} /></div>
          <div><label>Ville</label><input value={d.ville} onChange={(e) => set({ ville: e.target.value })} /></div>
        </div>
      );
      break;
    case 'email_client':
      body = (<>
        <div><label>Chantier</label>
          <select value={d.worksite_id ?? ''} className={d.worksite_id ? '' : 'todo'} onChange={(e) => set({ worksite_id: e.target.value || null })}>
            <option value="">{d.chantier_texte ? `« ${d.chantier_texte} » → choisir…` : 'Choisir le chantier…'}</option>
            {extra.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
          </select>
        </div>
        <div><label>Email du client</label><input type="email" value={d.email} onChange={(e) => set({ email: e.target.value.trim() })} /></div>
      </>);
      break;
    // ── Lot 8 ──
    case 'effacer_heures':
      body = d.tout || d.date !== snap.aujourdhui
        ? <p className="wa-info">Toutes vos lignes NON envoyées du {d.date === snap.aujourdhui ? 'jour' : d.date} seront effacées. Les lignes envoyées restent.</p>
        : (
          <div><label>Ligne</label>
            <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.filter((l) => !l.envoyee).map((l) => <option key={l.id} value={l.id}>{l.chantier} · {l.debut}–{l.fin}</option>)}
            </select>
          </div>
        );
      break;
    case 'annuler_conge':
    case 'modifier_conge':
      body = (<>
        <div><label>Demande</label>
          <select value={d.leave_id ?? ''} className={d.leave_id ? '' : 'todo'} onChange={(e) => set({ leave_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucune demande en attente'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.du} → {c.au}</option>)}
          </select>
        </div>
        {d.type === 'modifier_conge' && (
          <div className="wa-row">
            <div><label>Nouveau début</label><input type="date" value={d.du} onChange={(e) => set({ du: e.target.value })} /></div>
            <div><label>Nouvelle fin</label><input type="date" value={d.au} onChange={(e) => set({ au: e.target.value })} /></div>
          </div>
        )}
      </>);
      break;
    case 'annuler_pointage':
      body = <p className="wa-info">{d.chantier ? `Pointage en cours sur ${d.chantier} : il sera annulé, rien ne sera noté.` : 'Aucun pointage en cours.'}</p>;
      break;
    case 'retirer_photo':
      body = (
        <div><label>Document</label>
          <select value={d.document_id ?? ''} className={d.document_id ? '' : 'todo'} onChange={(e) => set({ document_id: e.target.value || null })}>
            <option value="">{d.choix.length ? 'Choisir…' : 'Aucun document ajouté par vous récemment'}</option>
            {d.choix.map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.chantier}</option>)}
          </select>
        </div>
      );
      break;
    case 'retirer_reserve':
      body = (
        <div><label>Ligne</label>
          <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
            <option value="">Choisir…</option>
            {d.choix.filter((l) => !l.envoyee).map((l) => <option key={l.id} value={l.id}>{l.chantier} · {l.debut}–{l.fin}</option>)}
          </select>
        </div>
      );
      break;
  }

  return (
    <div className="wa" data-testid="worker-action-card" data-type={d.type}>
      <style>{CSS}</style>
      <p className="wa-h"><span className="i"><Icon className="h-3.5 w-3.5" /></span>{title}</p>
      {extra.attachment && <p className="wa-att"><Paperclip className="h-3.5 w-3.5" /> {extra.attachment.name}</p>}
      <div className="wa-f">{body}</div>
      {problems.map((p) => <p key={p} className="wa-p">{p}</p>)}
      {geoFor && <GeoInfoDialog onOk={() => { markGeoInfoSeen(geoFor); setGeoFor(null); run(d); }} />}
      {err && <p className="wa-p">{err}</p>}
      <div className="wa-foot">
        <button type="button" className="wa-b no" disabled={busy} onClick={() => { if (editOf.current && result) { editOf.current = null; setPhase('done'); } else setCancelled(true); }}>{editOf.current ? 'Garder comme avant' : 'Annuler'}</button>
        <button
          type="button" className="wa-b ok" disabled={busy || problems.length > 0} data-testid="worker-action-confirm"
          onClick={() => run()}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirm}
        </button>
      </div>
    </div>
  );
}
