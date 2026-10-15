'use client';

// Fiche récapitulative de l'Assistant BEMEXO salarié : UNE fiche pour plusieurs actions dites dans la même
// phrase (heures avec TOUS les créneaux et la pause, nouveau chantier, panier, réserve, congé, envoi).
//
// RIEN n'est enregistré ni exécuté avant « Tout confirmer » — aucun effet au montage, pas même un geste
// « simple » : en mode fiche, l'exécution directe du lot 7 n'existe pas. Le clic lance runMulti
// (supabase/functions/_shared/worker-multi-run.ts) : chantier → heures → panier → réserve → congé → envoi.
// Les erreurs bloquantes sont RECALCULÉES à chaque modification (verifierFiche), jamais lues une fois pour toutes.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, MapPin, Trash2, Undo2 } from 'lucide-react';
import type { ExtraControl } from '@/components/assistant-panel';
import { DraftPause } from '@/components/worker-draft-card';
import { readCard, undoneMemory, useCardMemory, writeCard } from '@/lib/card-memory';
import type { MultiExtra } from '@/lib/worker-assistant';
import { addDaysIso } from '@/supabase/functions/_shared/fr-langue';
import { fmtMin, LEAVE_LABEL, shiftMinutes, toMin, type DraftLine, type NewWorksite } from '@/supabase/functions/_shared/worker-assistant-core';
import type { MultiItem } from '@/supabase/functions/_shared/worker-multi';
import { DATE_ILLISIBLE, verifierFiche } from '@/supabase/functions/_shared/worker-multi';
import { messageFinal, reutilisable, runMulti, type ItemResult, type MultiDeps, type MultiRun } from '@/supabase/functions/_shared/worker-multi-run';

const CSS = `
.wm{margin-top:10px;border:1px solid rgba(21,18,15,.14);border-radius:14px;background:#FBF8F2;padding:11px 11px 0;font-size:14px;color:#15120F}
.wm h3{font-size:15px;font-weight:900;margin:0}
.wm-sub{font-size:13px;color:#56514a;font-weight:700;margin:2px 0 0}
.wm-note{font-size:13px;font-style:italic;color:#56514a;margin:6px 0 0;overflow-wrap:anywhere}
.wm-warn{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0}
.wm-sec{margin-top:12px}
.wm-lbl{display:block;font-size:11px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.05em;margin:0 0 3px}
.wm input,.wm select,.wm textarea{width:100%;box-sizing:border-box;font-family:inherit;font-size:16px;border:1.5px solid rgba(21,18,15,.16);border-radius:8px;padding:7px 8px;background:#fff;color:#15120F;min-width:0}
.wm input[type=checkbox]{width:20px;height:20px;padding:0;flex:none}
.wm input:read-only:not([type=checkbox]),.wm input:disabled{background:#F1ECE2;color:#56514a}
.wm .todo{border-color:#F1B84A;background:#FFFBF0}
.wm-block{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:10px;padding:9px;margin-top:8px}
.wm-block.off{opacity:.55}
.wm-block.todo{border-color:#F1B84A;background:#FFFBF0}
.wm-sum{font-size:13.5px;font-weight:800;margin:0 0 6px;display:flex;gap:6px;align-items:flex-start}
.wm-sum>span,.wm-res li>span{min-width:0;overflow-wrap:anywhere}
.wm-grid{display:grid;grid-template-columns:1fr;gap:6px}
.wm-grid2{display:grid;grid-template-columns:96px 1fr;gap:6px}
.wm-help{font-size:12.5px;color:#56514a;margin:6px 0 0;line-height:1.4;overflow-wrap:anywhere}
.wm-help.warn{color:#9a3b14;font-weight:700}
.wm-row{display:flex;gap:6px;align-items:center}
.wm-row>*{flex:1}
.wm-row>.wm-arrow{flex:none;color:#6E6A63;font-weight:800}
.wm-line{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:10px;padding:8px;margin-top:8px}
.wm-line.todo{border-color:#F1B84A;background:#FFFBF0}
.wm-x{flex:none!important;border:none;background:transparent;color:#9a948a;min-width:44px;min-height:44px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:8px}
.wm-x:hover{color:#C0461F}
.wm-gap{margin:8px 0 0;padding:6px 9px;border-radius:8px;font-size:13px;font-weight:800;display:flex;gap:6px;align-items:center}
.wm-gap.g-pause{background:#EAF6EE;color:#0F7A43}
.wm-gap.g-ecart{background:#F1ECE2;color:#56514a}
.wm-total{margin:10px 0 0;font-weight:900;font-size:14px;text-align:right}
.wm-plan{font-size:11.5px;color:#0F7A43;font-weight:700;margin:-2px 0 6px 2px}
.wm-ask{font-size:12.5px;color:#9a3b14;font-weight:800;margin:6px 0 0}
.wm-annexe{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:10px;padding:8px 9px;margin-top:8px}
.wm-annexe-h{display:flex;gap:8px;align-items:center;font-weight:800;font-size:14px}
.wm-annexe-h>span{flex:1;min-width:0}
.wm-retirer{flex:none;border:1px solid rgba(21,18,15,.16);background:#fff;border-radius:999px;padding:5px 11px;min-height:36px;font-size:12.5px;font-weight:800;color:#56514a;cursor:pointer;font-family:inherit}
.wm-check{display:flex;gap:8px;align-items:center;font-size:14px;font-weight:700;margin-top:6px}
.wm-err{font-size:13px;color:#B42318;font-weight:700;margin:6px 0 0;overflow-wrap:anywhere}
.wm-bloq{margin-bottom:10px}
.wm-remettre{display:flex;align-items:center;gap:6px;min-height:44px;width:100%;margin-top:8px;border:1px dashed rgba(21,18,15,.3);background:#fff;border-radius:10px;padding:6px 10px;font-size:13.5px;font-weight:800;color:#15120F;cursor:pointer;font-family:inherit}
.wm-ok{font-size:13px;color:#0F7A43;font-weight:800}
.wm-bar{position:sticky;bottom:0;background:#FBF8F2;margin:12px -11px 0;padding:10px 11px 11px;border-top:1px solid rgba(21,18,15,.1);border-radius:0 0 14px 14px;z-index:1}
.wm-btns{display:flex;gap:8px}
.wm-confirm{flex:1;min-height:44px;border:none;border-radius:11px;background:#15120F;color:#FBF8F2;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;display:inline-flex;gap:6px;align-items:center;justify-content:center}
.wm-confirm:disabled{opacity:.35;cursor:default}
.wm-dismiss{min-height:44px;padding:0 14px;border:1px solid rgba(21,18,15,.16);border-radius:11px;background:#fff;font-weight:800;font-size:14px;color:#56514a;cursor:pointer;font-family:inherit}
.wm-need{font-size:12.5px;color:#6E6A63;margin:7px 0 0;line-height:1.4}
.wm-res{margin:0 0 4px}
.wm-res ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
.wm-res li{display:flex;gap:8px;font-size:13.5px;line-height:1.4}
.wm-res li b{flex:none;width:16px;text-align:center}
.wm-res .s-done b{color:#0F7A43}.wm-res .s-failed b{color:#B42318}.wm-res .s-skipped b,.wm-res .s-ignored b{color:#6E6A63}
.wm-msg{font-size:14px;font-weight:700;line-height:1.45;margin:0}
.wm-undo{margin:10px 0 11px;min-height:40px;border:1px solid rgba(21,18,15,.16);background:#fff;border-radius:999px;padding:6px 14px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit;display:inline-flex;gap:6px;align-items:center}
.wm-undo:disabled{opacity:.45;cursor:default}
.wm .pause{width:92px;flex:none;font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700}
.wm .pause[aria-invalid=true]{border-color:#C0461F}
.wm .wd-err{font-size:12.5px;color:#9a3b14;font-weight:700}
.wm :focus-visible{outline:2px solid #FFC21A;outline-offset:2px}
.wm input,.wm select,.wm textarea,.wm button{scroll-margin-bottom:130px}
.wm-live:focus{outline:none}
`;

type Phase = 'edit' | 'running' | 'done' | 'dismissed';
type Memo = { phase: Phase; run: MultiRun; worksites: MultiRun['worksites'] };

/** Un seul clic « Tout confirmer » par fiche, même si le bouton est touché deux fois de suite. */
const running = new WeakSet<object>();
const NOUVEAU = '__nouveau__';
const JOUR_SEUL = ['panier_repas', 'signaler_reserve', 'reserve_corrigee', 'envoyer_journee'];
const NOM_RETRAIT: Record<string, string> = {
  panier_repas: 'panier repas', signaler_reserve: 'réserve', reserve_corrigee: 'réserve levée', demander_conge: 'congé', envoyer_journee: 'envoi de la journée', chantier: 'nouveau chantier',
};

/** 60 → « 1 h », 90 → « 1 h 30 », 45 → « 45 min ». */
const fmtDuree = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min / 60} h`);
const frDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const net = (l: DraftLine) => Math.max(0, shiftMinutes(l.start, l.end, Number.isFinite(l.break_minutes) ? l.break_minutes : 0) || 0);
const gapBetween = (a: DraftLine, b: DraftLine) => toMin(b.start) - (toMin(a.start) + shiftMinutes(a.start, a.end));
const resume = (b: NewWorksite) => [b.nom, b.adresse, `${b.ville}${b.code_postal ? ` ${b.code_postal}` : ''}`.trim(), b.description].filter(Boolean).join(' · ');
const withKeys = (lines: DraftLine[]): DraftLine[] => lines.map((l, i) => (l.key ? l : { ...l, key: `L${i}` }));

interface Props {
  extra: MultiExtra;
  /** Les accès (base, téléphone) donnés à runMulti : lib/worker-multi.ts (vrais) ou demoMultiDeps (aperçu). */
  deps: MultiDeps;
  /** Panier repas : false = l'entreprise ne l'utilise pas (la ligne est ignorée). */
  meal: boolean | null;
  onDone?: () => void;
  ctl?: ExtraControl;
}

export default function WorkerMultiCard({ extra, deps, meal, onDone, ctl }: Props) {
  const m = extra.multi;
  const uid = useId();
  const mem = readCard<Memo>(extra);
  const heuresItem = m.items.find((i): i is Extract<MultiItem, { kind: 'heures' }> => i.kind === 'heures');

  // ── L'état éditable : une copie de la réponse du serveur ──────────────────────────────────────
  const [date, setDate] = useState(m.date || m.aujourdhui);
  const [lines, setLines] = useState<DraftLine[]>(() => withKeys(heuresItem ? heuresItem.draft.lines : []));
  const [blocs, setBlocs] = useState<Record<string, NewWorksite>>(() => {
    const o: Record<string, NewWorksite> = {};
    for (const it of m.items) {
      if (it.kind === 'chantier') o[it.id] = { ...it.nouveau_chantier };
      else if (it.kind === 'heures' && it.draft.nouveau_chantier) o[it.id] = { ...it.draft.nouveau_chantier };
    }
    return o;
  });
  const [removed, setRemoved] = useState<string[]>([]);
  // Les créneaux retirés restent ici (avec leur rang) tant que la fiche est en édition : « Remettre le créneau ».
  const [retires, setRetires] = useState<{ l: DraftLine; i: number }[]>([]);
  // La date illisible (rendue par le modèle) reste bloquante tant que le salarié n'a pas touché au champ « Jour ».
  const [dateVue, setDateVue] = useState(false);
  const [valeurs, setValeurs] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const it of m.items) if (it.kind === 'action' && it.action.draft.type === 'panier_repas') o[it.id] = it.action.draft.valeur;
    return o;
  });
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const it of m.items) {
      if (it.kind !== 'action') continue;
      const d = it.action.draft;
      if (d.type === 'signaler_reserve') o[it.id] = d.detail; else if (d.type === 'reserve_corrigee') o[it.id] = d.note ?? '';
    }
    return o;
  });
  const [entries, setEntries] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const it of m.items) if (it.kind === 'action' && (it.action.draft.type === 'signaler_reserve' || it.action.draft.type === 'reserve_corrigee')) o[it.id] = it.action.draft.entry_id ?? '';
    return o;
  });

  const [phase, setPhase] = useState<Phase>(mem.phase ?? 'edit');
  const [run, setRun] = useState<MultiRun | null>(mem.run ?? null);
  const [progress, setProgress] = useState<ItemResult[] | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [undone, setUndone] = useState<string | null>(() => (mem.run?.undo && undoneMemory.get(mem.run.undo)) || null);
  const [undoErr, setUndoErr] = useState<string | null>(null);
  const [busyUndo, setBusyUndo] = useState(false);
  // Après « Tout confirmer », le bouton disparaît : le focus passe à la zone du résultat (annoncée, aussi au lecteur d'écran).
  const resultRef = useRef<HTMLDivElement>(null);
  const phasePrec = useRef(phase);
  useEffect(() => {
    if (phasePrec.current !== 'done' && phase === 'done') resultRef.current?.focus();
    phasePrec.current = phase;
  }, [phase]);
  useCardMemory<Memo>(extra, (x) => {
    if (x.phase) setPhase(x.phase);
    if (x.run) setRun(x.run);
  });
  useEffect(() => { if (phase === 'done' || phase === 'dismissed') ctl?.settle(null); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Étape 2 : la fiche attend « Tout confirmer » tant qu'elle est en édition (le panneau demande « Abandonner cette action ? » avant de vider l'écran).
  useEffect(() => { ctl?.waiting(phase === 'edit'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ce qui est recalculé à chaque modification ────────────────────────────────────────────────
  const actif = (id: string) => removed.indexOf(id) < 0;
  const errors = useMemo(() => (heuresItem && lines.length ? verifierFiche(date, lines, m.aujourdhui, m.deja_notees) : []), [heuresItem, lines, date, m.aujourdhui, m.deja_notees]);
  const pauseBad = lines.some((l) => !Number.isFinite(l.break_minutes));
  const blocHeures = heuresItem ? blocs[heuresItem.id] : undefined;
  const blocHeuresReuse = blocHeures ? reutilisable(blocHeures, m.chantiers) : null;
  const offreNouveau = !!blocHeures && !blocHeuresReuse;
  const blocUtilise = (id: string, b: NewWorksite) => (id === heuresItem?.id
    ? lines.some((l) => l.nouveau) || (!!reutilisable(b, m.chantiers) && lines.some((l) => l.worksite_id === b.reutilise_id))
    : true);
  const total = lines.reduce((t, l) => t + net(l), 0);
  const demain = addDaysIso(m.aujourdhui, 1);
  const hier31 = addDaysIso(m.aujourdhui, -31);
  const jourOk = date === m.aujourdhui;

  /** Les problèmes d'une annexe, recalculés (la réserve vise un CHANTIER ou une clé de ligne, jamais un rang). */
  const problemesDe = (it: Extract<MultiItem, { kind: 'action' }>): string[] => {
    const d = it.action.draft;
    const p: string[] = [];
    if (JOUR_SEUL.indexOf(d.type) >= 0 && heuresItem && !jourOk) p.push('Ne concerne que la journée d’aujourd’hui : retirez-la ou remettez la date d’aujourd’hui.');
    if (d.type === 'signaler_reserve' || d.type === 'reserve_corrigee') {
      const e = entries[it.id];
      if (it.cible) {
        const reste = lines.some((l) => (it.cible!.nouveau ? !!l.nouveau : !!it.cible!.chantier_id && l.worksite_id === it.cible!.chantier_id));
        if (!reste) p.push(`Aucun créneau n’est plus sur ${it.cible.nom} : retirez la réserve ou choisissez un chantier.`);
      } else if (!e) p.push('Choisissez le chantier.');
      else if (e.indexOf('draft:') === 0 && !lines.some((l) => `draft:${l.key}` === e)) p.push('Aucun créneau n’est plus sur ce chantier : retirez la réserve ou choisissez un chantier.');
    } else {
      p.push(...it.action.problems.filter((x) => !(d.type === 'panier_repas' && x.indexOf('Aucune ligne') === 0)));
    }
    return p;
  };
  const annexes = m.items.filter((i): i is Extract<MultiItem, { kind: 'action' }> => i.kind === 'action' && actif(i.id));
  const problemes = Array.from(new Set(annexes.filter((i) => !(i.action.draft.type === 'panier_repas' && meal === false)).flatMap(problemesDe)));
  const dateIllisible = !dateVue && !!heuresItem?.draft.errors.includes(DATE_ILLISIBLE);
  const bloquants = Array.from(new Set([...(dateIllisible ? [DATE_ILLISIBLE] : []), ...errors, ...problemes]));

  // « Complétez : … » sous le bouton grisé.
  const aCompleter: string[] = [];
  for (const it of m.items) {
    const b = blocs[it.id];
    if (!b || !actif(it.id) || !blocUtilise(it.id, b) || reutilisable(b, m.chantiers)) continue;
    if (!b.nom.trim()) aCompleter.push('le nom du client');
    if (!b.ville.trim()) aCompleter.push('la ville du chantier');
  }
  lines.forEach((l, i) => { if (!l.nouveau && !l.worksite_id) aCompleter.push(`le chantier du créneau ${i + 1}`); if (!Number.isFinite(l.break_minutes)) aCompleter.push(`la pause du créneau ${i + 1}`); });
  const nbElements = (lines.length ? 1 : 0) + m.items.filter((i) => i.kind !== 'heures' && actif(i.id)).length;
  const peutConfirmer = phase === 'edit' && nbElements > 0 && !aCompleter.length && !bloquants.length && !pauseBad;
  const besoin = [aCompleter.length ? `Complétez : ${aCompleter.join(', ')}.` : '', bloquants.length ? 'Corrigez les points en rouge.' : '', !nbElements ? 'Il ne reste rien à confirmer.' : ''].filter(Boolean).join(' ');

  // ── Modifications ─────────────────────────────────────────────────────────────────────────────
  const upd = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const retirerCreneau = (i: number) => {
    setRetires((r) => [...r, { l: lines[i], i }]);
    setLines((ls) => ls.filter((_, j) => j !== i));
  };
  const remettre = (key: string | undefined) => {
    const r = retires.find((x) => x.l.key === key);
    if (!r) return;
    setRetires((rs) => rs.filter((x) => x !== r));
    setLines((ls) => [...ls.slice(0, r.i), r.l, ...ls.slice(r.i)]);
  };
  const choisirChantier = (i: number, v: string) => {
    if (v === NOUVEAU) upd(i, { worksite_id: null, nouveau: true, a_choisir: undefined, from_planning: false });
    else upd(i, { worksite_id: v || null, nouveau: undefined, a_choisir: undefined, from_planning: false });
  };
  const editBloc = (id: string, patch: Partial<NewWorksite>) => setBlocs((bs) => ({
    ...bs, [id]: { ...bs[id], ...patch, ...('nom' in patch || 'ville' in patch ? { reutilise_id: undefined } : {}) },
  }));

  // ── Le clic ───────────────────────────────────────────────────────────────────────────────────
  const confirmer = async () => {
    if (running.has(extra) || phase !== 'edit') return;
    running.add(extra);
    setStopped(null); setPhase('running');
    writeCard(extra, { phase: 'running' });
    const items: MultiItem[] = m.items.filter((it) => actif(it.id)).map((it): MultiItem => {
      if (it.kind === 'heures') return { ...it, draft: { ...it.draft, date, lines, ...(blocs[it.id] ? { nouveau_chantier: blocs[it.id] } : {}) } };
      if (it.kind === 'chantier') return { ...it, nouveau_chantier: blocs[it.id] };
      const d = it.action.draft;
      if (d.type === 'panier_repas') return { ...it, action: { ...it.action, draft: { ...d, valeur: valeurs[it.id] ?? d.valeur } } };
      if (d.type === 'signaler_reserve') return { ...it, action: { ...it.action, draft: { ...d, detail: details[it.id] ?? d.detail, entry_id: entries[it.id] || null } } };
      if (d.type === 'reserve_corrigee') return { ...it, action: { ...it.action, draft: { ...d, note: details[it.id] ?? d.note, entry_id: entries[it.id] || null } } };
      return it;
    }).filter((it) => !(it.kind === 'heures' && !it.draft.lines.length));
    let out: MultiRun;
    // Étape 2 : tant que la fiche écrit, le panneau refuse « Nouveau chat », la réouverture d'une ancienne conversation et la suppression du chat affiché
    // (la fiche serait démontée avant d'avoir montré son résultat). `working(false)` part TOUJOURS à la fin, même si la fiche a été démontée entre-temps.
    ctl?.working(true); ctl?.waiting(false);
    try {
      out = await runMulti({ items, date, aujourdhui: m.aujourdhui, chantiers: m.chantiers, dejaNotees: m.deja_notees, meal, worksites: readCard<Memo>(extra).worksites }, {
        ...deps,
        onProgress: setProgress,
        onWorksite: (id, ws) => writeCard(extra, { worksites: { ...(readCard<Memo>(extra).worksites ?? {}), [id]: ws } }),
      });
    } catch {
      // runMulti ne lève pas : par prudence, on ne sait pas ce qui est parti.
      out = { results: [], worksites: {}, wrote: true, sent: false, message: 'Un problème est survenu : vérifiez dans « Ma journée » avant de recommencer.' };
    } finally {
      ctl?.working(false);
    }
    if (out.stopped) {
      // Rien n'a été écrit : la fiche reste modifiable.
      running.delete(extra);
      writeCard(extra, { phase: 'edit' });
      setStopped(out.stopped); setProgress(null); setPhase('edit');
      ctl?.waiting(true);
      return;
    }
    writeCard(extra, { phase: 'done', run: out });
    setRun(out); setProgress(null); setPhase('done');
    if (out.wrote) onDone?.();
  };

  const annuler = async () => {
    const u = run?.undo;
    if (!u || busyUndo) return;
    setBusyUndo(true); setUndoErr(null);
    const r = await u();
    setBusyUndo(false);
    if (r.ok) { undoneMemory.set(u, r.message); setUndone(r.message); } else setUndoErr(r.message);
  };

  // ── Rendu : fiche ignorée, en cours, terminée ─────────────────────────────────────────────────
  // La zone annoncée (aria-live) est toujours le 2e enfant de la carte : elle existe déjà (vide) avant que le résultat n'y arrive.
  const live = (content: ReactNode) => <div ref={resultRef} tabIndex={-1} aria-live="polite" data-testid="wm-result" className="wm-live">{content}</div>;
  if (phase === 'dismissed') return <p className="wm-help" data-testid="multi-card-ignoree"><style>{CSS}</style>Fiche ignorée.</p>;

  if (phase === 'done' && run) {
    const symbole = (s: ItemResult['status']) => (s === 'done' ? '✓' : s === 'failed' ? '✗' : s === 'ignored' ? '○' : '–');
    return (
      <div className="wm wm-res" role="group" aria-label="Fiche récapitulative" data-testid="multi-card" style={{ paddingBottom: 11 }}>
        <style>{CSS}</style>
        {live(<>
          <p className="wm-msg">{run.message || messageFinal(run.results)}</p>
          {undone && <p className="wm-help" data-testid="wm-undone"><Undo2 className="h-4 w-4" style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {undone}</p>}
        </>)}
        <ul data-testid="wm-items">
          {run.results.map((r) => (
            <li key={r.id} className={`s-${r.status}`} data-testid={`wm-res-${r.status}`}><b aria-hidden="true">{symbole(r.status)}</b><span>{r.label}{r.message ? ` : ${r.message}` : ''}</span></li>
          ))}
        </ul>
        {run.sent && <p className="wm-help">Journée envoyée : pour corriger, passez par « Ma journée ».</p>}
        {!undone && run.undo && (
          <>
            <button type="button" className="wm-undo" data-testid="wm-undo" disabled={busyUndo} onClick={annuler}>
              {busyUndo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Annuler
            </button>
            {undoErr && <p className="wm-err" role="alert">{undoErr}</p>}
          </>
        )}
      </div>
    );
  }

  if (phase === 'running') {
    const liste = progress ?? [];
    return (
      <div className="wm" role="group" aria-label="Fiche récapitulative" data-testid="multi-card" style={{ paddingBottom: 11 }}>
        <style>{CSS}</style>
        {live(<p className="wm-msg"><Loader2 className="h-4 w-4 animate-spin" style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Enregistrement en cours…</p>)}
        {liste.length > 0 && <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, fontSize: 13.5 }}>{liste.map((r) => <li key={r.id}>{r.status === 'running' ? '… ' : r.status === 'done' ? '✓ ' : r.status === 'todo' ? '○ ' : '– '}{r.label}</li>)}</ul>}
        <button type="button" className="wm-confirm" disabled data-testid="wm-confirm" style={{ marginTop: 10, width: '100%' }}>Tout confirmer</button>
      </div>
    );
  }

  // Sans heures (congé, chantier ou panier seuls), aucun sous-titre de journée : il serait faux pour l'action affichée.
  const dateLabel = !heuresItem ? null : jourOk ? `Journée d’aujourd’hui · ${frDay(m.aujourdhui)}` : `Journée du ${frDay(date)}`;
  const optionsReserve = (it: Extract<MultiItem, { kind: 'action' }>) => {
    const d = it.action.draft;
    if (d.type !== 'signaler_reserve' && d.type !== 'reserve_corrigee') return [];
    const nomDe = (l: DraftLine) => (l.nouveau ? (blocHeures?.nom || 'Nouveau chantier') : m.chantiers.find((c) => c.id === l.worksite_id)?.nom ?? 'Chantier');
    return [
      ...lines.map((l) => ({ value: `draft:${l.key}`, label: `${nomDe(l)} · ${l.start}–${l.end}` })),
      ...d.choix.filter((c) => c.id.indexOf('draft:') !== 0).map((c) => ({ value: c.id, label: `${c.chantier} · ${c.debut}–${c.fin}` })),
    ];
  };

  return (
    <div className="wm" role="group" aria-label="Fiche récapitulative" data-testid="multi-card">
      <style>{CSS}</style>
      {live(null)}
      <h3>Fiche à confirmer</h3>
      {dateLabel && <p className="wm-sub">{dateLabel}</p>}
      {m.note && <p className="wm-note">{m.note}</p>}
      {m.incertain && <p className="wm-warn">Lecture rapide : vérifiez que tout y est.</p>}
      {m.non_prepare.length > 0 && <p className="wm-warn" data-testid="wm-nonprepare">Non préparé : {m.non_prepare.join(', ')}. Redemandez-le séparément.</p>}

      {heuresItem && (
        <div className="wm-sec">
          <label className="wm-lbl" htmlFor={`${uid}-jour`}>Jour</label>
          <input id={`${uid}-jour`} type="date" value={date} min={hier31} max={demain} onChange={(e) => { setDateVue(true); if (e.target.value) setDate(e.target.value); }} onBlur={() => setDateVue(true)} data-testid="wm-jour" />
        </div>
      )}

      {m.items.filter((it) => (it.kind === 'chantier' || (it.kind === 'heures' && blocs[it.id])) && actif(it.id)).map((it) => {
        const b = blocs[it.id];
        const reuse = reutilisable(b, m.chantiers);
        const utilise = blocUtilise(it.id, b);
        const vide = !b.ville.trim() && !reuse && utilise;
        return (
          <div key={`bloc-${it.id}`} className={`wm-block${utilise ? '' : ' off'}${vide ? ' todo' : ''}`} data-testid="wm-nouveau">
            <p className="wm-sum"><MapPin className="h-4 w-4" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true" /><span><span className="wm-lbl" style={{ margin: 0 }}>{reuse ? 'Chantier existant utilisé' : 'Nouveau chantier'}</span><span data-testid="wm-nouveau-resume">{resume(b) || 'À préciser'}</span></span></p>
            <div className="wm-grid">
              <div><label className="wm-lbl" htmlFor={`${uid}-${it.id}-nom`}>Client (prénom et nom)</label>
                <input id={`${uid}-${it.id}-nom`} value={b.nom} maxLength={80} readOnly={!!reuse} onChange={(e) => editBloc(it.id, { nom: e.target.value })} data-testid="wm-nom" autoComplete="off" /></div>
              <div><label className="wm-lbl" htmlFor={`${uid}-${it.id}-adr`}>Adresse</label>
                <input id={`${uid}-${it.id}-adr`} value={b.adresse} maxLength={120} readOnly={!!reuse} onChange={(e) => editBloc(it.id, { adresse: e.target.value })} data-testid="wm-adresse" autoComplete="off" /></div>
              <div className="wm-grid2">
                <div><label className="wm-lbl" htmlFor={`${uid}-${it.id}-cp`}>Code postal</label>
                  <input id={`${uid}-${it.id}-cp`} value={b.code_postal} maxLength={5} inputMode="numeric" readOnly={!!reuse} onChange={(e) => editBloc(it.id, { code_postal: e.target.value.replace(/\D/g, '') })} data-testid="wm-cp" autoComplete="off" /></div>
                <div><label className="wm-lbl" htmlFor={`${uid}-${it.id}-ville`}>Ville (obligatoire)</label>
                  <input id={`${uid}-${it.id}-ville`} value={b.ville} maxLength={60} readOnly={!!reuse} className={vide ? 'todo' : undefined} onChange={(e) => editBloc(it.id, { ville: e.target.value })} data-testid="wm-ville" autoComplete="off" aria-required="true" aria-invalid={vide || undefined} aria-describedby={vide ? `${uid}-${it.id}-ask` : undefined} /></div>
              </div>
              <div><label className="wm-lbl" htmlFor={`${uid}-${it.id}-trav`}>Travaux</label>
                <input id={`${uid}-${it.id}-trav`} value={b.description} maxLength={200} readOnly={!!reuse} onChange={(e) => editBloc(it.id, { description: e.target.value })} data-testid="wm-travaux" autoComplete="off" /></div>
            </div>
            {reuse ? <p className="wm-help" data-testid="wm-reuse">Ce chantier existe déjà : il sera utilisé, rien ne sera créé.</p>
              : !utilise ? <p className="wm-help warn">Aucun créneau n’est sur ce chantier : il ne sera pas créé. Choisissez « Nouveau chantier » sur un créneau pour l’utiliser.</p>
              : <p className="wm-help">Ce chantier sera créé quand vous confirmerez. Vous ne pourrez pas le supprimer vous-même : le bureau pourra l’archiver.</p>}
            {vide && <p className="wm-ask" id={`${uid}-${it.id}-ask`}>Indiquez la ville du chantier pour confirmer.</p>}
            {it.kind === 'chantier' && (
              <button type="button" className="wm-retirer" style={{ marginTop: 8 }} aria-label="Retirer : nouveau chantier" onClick={() => setRemoved((r) => [...r, it.id])}>Retirer</button>
            )}
          </div>
        );
      })}

      {heuresItem && (
        <div className="wm-sec" data-testid="wm-heures">
          <span className="wm-lbl">Heures</span>
          {lines.length === 0 && <p className="wm-help">Aucun créneau : les heures ne seront pas notées.</p>}
          {lines.map((l, i) => {
            const prev = i > 0 ? lines[i - 1] : null;
            const ecart = prev ? gapBetween(prev, l) : 0;
            const suiv = i < lines.length - 1 ? gapBetween(l, lines[i + 1]) : 0;
            const doublon = Number.isFinite(l.break_minutes) && l.break_minutes > 0 && [ecart, suiv].some((g) => g > 0 && Math.abs(g - l.break_minutes) <= 10);
            return (
              <div key={l.key}>
                {prev && ecart > 0 && ecart <= 240 && (l.gap_before === 'pause'
                  ? <p className="wm-gap g-pause" data-testid={`wm-pause-${i - 1}`}>Pause {fmtDuree(ecart)} · {prev.end} → {l.start}</p>
                  : <p className="wm-gap g-ecart" data-testid={`wm-ecart-${i - 1}`}>Écart {fmtDuree(ecart)} · {prev.end} → {l.start} · non compté</p>)}
                <div className={`wm-line${!l.nouveau && !l.worksite_id ? ' todo' : ''}`} data-testid={`wm-line-${i}`}>
                  <div className="wm-row" style={{ marginBottom: 6 }}>
                    <select value={l.nouveau ? NOUVEAU : l.worksite_id ?? ''} onChange={(e) => choisirChantier(i, e.target.value)} aria-label={`Chantier du créneau ${i + 1}`} data-testid={`wm-chantier-${i}`}>
                      <option value="">{l.worksite_text && !l.a_choisir ? `« ${l.worksite_text} » → choisir…` : 'Choisir le chantier…'}</option>
                      {offreNouveau && <option value={NOUVEAU}>{blocHeures?.nom ? `Nouveau : ${blocHeures.nom}` : 'Nouveau chantier'}</option>}
                      {m.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
                    </select>
                    <button type="button" className="wm-x" onClick={() => retirerCreneau(i)} aria-label={`Retirer le créneau ${i + 1}`} data-testid={`wm-retirer-${i}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {l.a_choisir && !l.worksite_id && !l.nouveau && <p className="wm-ask">Nouveau chantier « {l.a_choisir.nouveau} » ou « {l.a_choisir.existant} » ?</p>}
                  {l.from_planning && l.worksite_id && <p className="wm-plan" data-testid="from-planning">📅 D’après votre planning — modifiable</p>}
                  <div className="wm-row">
                    <input type="time" value={l.start} onChange={(e) => upd(i, { start: e.target.value })} aria-label={`Début du créneau ${i + 1}`} />
                    <span className="wm-arrow" aria-hidden="true">→</span>
                    <input type="time" value={l.end} onChange={(e) => upd(i, { end: e.target.value })} aria-label={`Fin du créneau ${i + 1}`} />
                  </div>
                  <div className="wm-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="wm-lbl" style={{ margin: 0, flex: '1 1 auto' }}>Pause (h:mm)</span>
                    <DraftPause value={l.break_minutes} onChange={(v) => upd(i, { break_minutes: v })} testId={`wd-pause-${i}`} ariaLabel={`Pause (h:mm) du créneau ${i + 1}`} />
                  </div>
                  {doublon && <p className="wm-help warn">Cette pause est déjà comptée par l’écart entre les créneaux : mettez 0 pour ne pas la retirer deux fois.</p>}
                </div>
              </div>
            );
          })}
          {retires.map(({ l }) => (
            <button key={l.key} type="button" className="wm-remettre" data-testid={`wm-remettre-${l.key}`} onClick={() => remettre(l.key)}>
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Remettre le créneau {l.start} → {l.end}
            </button>
          ))}
          {lines.length > 0 && <p className="wm-total" data-testid="wm-total">Total net : {fmtMin(total)}</p>}
        </div>
      )}

      {annexes.length > 0 && <div className="wm-sec"><span className="wm-lbl">Et aussi</span></div>}
      {annexes.map((it) => {
        const d = it.action.draft;
        const retirer = <button type="button" className="wm-retirer" aria-label={`Retirer : ${NOM_RETRAIT[d.type]}`} onClick={() => setRemoved((r) => [...r, it.id])}>Retirer</button>;
        if (d.type === 'panier_repas') {
          return (
            <div key={it.id} className="wm-annexe" data-testid="wm-panier">
              <div className="wm-annexe-h"><span>Panier repas</span>{retirer}</div>
              {meal === false ? <p className="wm-help">Votre entreprise n’utilise pas le panier repas : ignoré</p>
                : <label className="wm-check"><input type="checkbox" checked={valeurs[it.id] ?? d.valeur} onChange={(e) => setValeurs((v) => ({ ...v, [it.id]: e.target.checked }))} /> Cocher le panier repas du jour</label>}
            </div>
          );
        }
        if (d.type === 'signaler_reserve' || d.type === 'reserve_corrigee') {
          const e = entries[it.id];
          const choix = optionsReserve(it);
          const nom = it.cible?.nom ?? choix.find((o) => o.value === e)?.label.split(' · ')[0];
          return (
            <div key={it.id} className="wm-annexe" data-testid="wm-reserve">
              <div className="wm-annexe-h"><span>{d.type === 'signaler_reserve' ? 'Réserve' : 'Lever la réserve'}{nom ? ` sur ${nom}` : ''}</span>{retirer}</div>
              {!it.cible && (
                <div style={{ marginTop: 6 }}>
                  <label className="wm-lbl" htmlFor={`${uid}-${it.id}-ch`}>Sur quel chantier ?</label>
                  <select id={`${uid}-${it.id}-ch`} value={e} className={e ? undefined : 'todo'} onChange={(ev) => setEntries((x) => ({ ...x, [it.id]: ev.target.value }))}>
                    <option value="">Choisir…</option>
                    {choix.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <label className="wm-lbl" htmlFor={`${uid}-${it.id}-det`}>{d.type === 'signaler_reserve' ? 'Détail (facultatif)' : 'Commentaire (facultatif)'}</label>
                <textarea id={`${uid}-${it.id}-det`} rows={2} value={details[it.id] ?? ''} onChange={(ev) => setDetails((x) => ({ ...x, [it.id]: ev.target.value }))} />
              </div>
            </div>
          );
        }
        if (d.type === 'demander_conge') {
          return (
            <div key={it.id} className="wm-annexe" data-testid="wm-conge">
              <div className="wm-annexe-h"><span>Demande de congé · du {jjmm(d.du)} au {jjmm(d.au)}</span>{retirer}</div>
              <p className="wm-help" style={{ marginTop: 4 }}>{LEAVE_LABEL[d.conge_type] ?? 'Congé'}{d.note ? ` · ${d.note}` : ''}</p>
            </div>
          );
        }
        if (d.type === 'envoyer_journee') {
          const deja = it.deja_notees ?? [];
          const n = (heuresItem ? lines.length : 0) + deja.length;
          return (
            <div key={it.id} className="wm-annexe" data-testid="wm-envoi">
              <div className="wm-annexe-h"><span>Envoyer la journée au bureau ({n} créneau{n > 1 ? 'x' : ''}{deja.length ? `, dont ${deja.length} déjà noté${deja.length > 1 ? 's' : ''}` : ''})</span>{retirer}</div>
              {deja.length > 0 && <p className="wm-help">Déjà notés aujourd’hui, ils partiront avec : {deja.map((x) => `${x.debut}–${x.fin} ${x.chantier}`).join(', ')}</p>}
              {(it.avertissements ?? []).map((a) => <p key={a} className="wm-help warn">{a}</p>)}
            </div>
          );
        }
        return null;
      })}

      {m.ignores.length > 0 && (
        <div className="wm-sec" data-testid="wm-ignores">
          <span className="wm-lbl">Laissé de côté</span>
          {m.ignores.map((x) => <p key={`${x.name}-${x.raison}`} className="wm-help" style={{ marginTop: 3 }}>{x.label} : {x.raison}</p>)}
        </div>
      )}

      {(bloquants.length > 0 || stopped) && (
        <div className="wm-sec wm-bloq" data-testid="wm-bloquants" role="alert">
          {bloquants.map((e) => <p key={e} className="wm-err">{e}</p>)}
          {stopped && <p className="wm-err" data-testid="wm-stop">{stopped}</p>}
        </div>
      )}

      <div className="wm-bar">
        <div className="wm-btns">
          <button type="button" className="wm-confirm" data-testid="wm-confirm" disabled={!peutConfirmer} aria-describedby={peutConfirmer ? undefined : `${uid}-besoin`} onClick={confirmer}>Tout confirmer</button>
          <button type="button" className="wm-dismiss" data-testid="wm-dismiss" onClick={() => { writeCard(extra, { phase: 'dismissed' }); setPhase('dismissed'); }}>Ignorer</button>
        </div>
        {!peutConfirmer && besoin && <p className="wm-need" id={`${uid}-besoin`} data-testid="wm-besoin">{besoin}</p>}
      </div>
    </div>
  );
}
