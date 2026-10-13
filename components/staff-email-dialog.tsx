'use client';

// Lot 19 — « Envoyer par e-mail » (bureau) : le planning de la semaine en PDF, ou un court
// message, à un ou plusieurs salariés. Fenêtre CHARGÉE À L'OUVERTURE (lib/lazy-window.tsx) :
// rien n'est lu au chargement du bureau. À l'ouverture : UNE réponse de la fonction
// `send-staff-email` (qui a une adresse, qui est désabonné, combien d'envois aujourd'hui)
// et UNE lecture paginée du planning de la semaine.
//
// Ce que la fenêtre garantit :
//  - rien ne part sans une confirmation explicite (« Envoyer N e-mails ») ;
//  - le destinataire n'est jamais choisi ici : la fenêtre n'envoie que des identifiants de
//    salariés, la fonction relit l'adresse en base ;
//  - un salarié sans adresse, désabonné ou sans intervention cette semaine est grisé, avec la
//    raison ; le message du bureau à un salarié désabonné est bloqué (explication à l'écran) ;
//  - le compteur « N e-mails aujourd'hui sur 50 » vient de la base ; au-delà : « Limite
//    quotidienne atteinte (50). Réessayez demain. » ;
//  - résultat par destinataire : envoyé / ignoré (raison) / refusé / incertain ;
//  - mode support : lecture seule, AUCUN appel, aucun envoi ;
//  - fonction ou migration absente : message neutre, sans erreur, et les boutons se cachent.
// Les règles (plafond, texte, libellés) sont celles de la fonction (staff-email-core.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, CheckCircle2, CircleAlert, CircleHelp, Loader2, Mail, MinusCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { User } from '@/lib/types';
import { readSupportSession } from '@/lib/support';
import { isExportLibError, preloadExportLibs } from '@/lib/export-utils';
import { markStaffEmailAbsent } from '@/lib/staff-email-flag';
import {
  buildWeekPdf, callStaffEmail, countFor, loadLog, loadWeekSlots, type Etat, type LogRow, type SendData, type WeekSlot,
} from '@/lib/staff-email';
import {
  DAILY_EMAIL_CAP, MAX_MESSAGE_CHARS, UNCERTAIN_LOG_TEXT, cleanMessage, effectiveLogStatus, isPlausibleEmail, limitMessage, messageLength,
  messageParts, planningFileName, planningParts, previewText, weekFromMonday, type ResultItem, type StaffEmailKind,
} from '@/supabase/functions/_shared/staff-email-core';

const CSS = `
.bt-em{display:flex;flex-direction:column;gap:14px;font-size:14px;color:#15120F;min-width:0}
.bt-em *{box-sizing:border-box}
.bt-em-muted{font-size:12.5px;color:#6E6A63;font-weight:600;line-height:1.4}
.bt-em-seg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.bt-em-segbtn{min-height:44px;border-radius:11px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font:inherit;font-size:13.5px;font-weight:800;color:#15120F;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 8px}
.bt-em-segbtn[aria-pressed="true"]{background:#FFC21A;border-color:#15120F;box-shadow:inset 0 0 0 1px #15120F}
.bt-em-counter{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:9px 12px;border-radius:11px;background:#F2EDE3;font-size:13px;font-weight:800}
.bt-em-counter.full{background:#FBE4DD;color:#8a2e14}
.bt-em-list{border:1px solid rgba(21,18,15,.14);border-radius:12px;background:#fff;overflow:hidden}
.bt-em-row{display:flex;align-items:center;gap:11px;width:100%;min-height:44px;padding:6px 12px;cursor:pointer;border-top:1px solid rgba(21,18,15,.08);text-align:left;background:transparent;font:inherit;color:inherit}
.bt-em-row:first-child{border-top:0}
.bt-em-row.is-off{cursor:default;background:#F9F6EF;color:#6E6A63}
.bt-em-row input{width:22px;height:22px;flex:none;accent-color:#15120F;margin:0}
.bt-em-name{flex:1;min-width:0;font-weight:800;overflow-wrap:anywhere}
.bt-em-mail{display:block;font-size:11.5px;font-weight:600;color:#6E6A63;overflow-wrap:anywhere}
.bt-em-tag{flex:none;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:800;background:#EDE7DA;color:#57524A;white-space:nowrap}
.bt-em-tag.warn{background:#FBE4DD;color:#8a2e14}
.bt-em-why{padding:0 12px 8px 45px;margin-top:-2px;font-size:12px;font-weight:600;color:#6E6A63;line-height:1.35}
.bt-em-all{font-weight:800;background:#FBF8F2}
.bt-em-label{display:block;font-size:12.5px;font-weight:800;margin-bottom:5px}
.bt-em-text{width:100%;min-height:104px;border-radius:11px;border:1.5px solid rgba(21,18,15,.22);background:#fff;font:inherit;font-size:16px;font-weight:500;color:#15120F;padding:10px 12px;resize:vertical;line-height:1.4}
.bt-em-text:focus-visible,.bt-em-btn:focus-visible,.bt-em-segbtn:focus-visible,.bt-em-row:focus-visible,.bt-em-row input:focus-visible{outline:2px solid #FFC21A;outline-offset:2px}
.bt-em-count{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:12px;font-weight:700;color:#6E6A63}
.bt-em-count.over{color:#C0461F}
.bt-em-preview{border:1.5px dashed rgba(21,18,15,.3);border-radius:12px;padding:11px 13px;background:#FBF8F2}
.bt-em-preview b{display:block;font-size:12.5px;margin-bottom:6px}
.bt-em-preview pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.45;font-weight:500}
.bt-em-subject{font-size:12.5px;font-weight:800;margin-bottom:6px;overflow-wrap:anywhere}
.bt-em-actions{display:flex;gap:8px;flex-wrap:wrap}
.bt-em-actions>.bt-em-btn{flex:1 1 140px}
.bt-em-btn{min-height:44px;padding:0 16px;border-radius:11px;border:0;background:#15120F;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.bt-em-btn.ghost{background:#fff;color:#15120F;border:1.5px solid rgba(21,18,15,.25)}
.bt-em-btn.go{background:#FFC21A;color:#15120F;box-shadow:0 3px 0 #C99300}
.bt-em-btn:disabled{opacity:.5;cursor:default;box-shadow:none}
.bt-em-hint{font-size:12.5px;font-weight:700;color:#6E6A63}
.bt-em-hint.err{color:#C0461F}
.bt-em-confirm{border:2px solid #15120F;border-radius:12px;padding:12px 13px;background:#FFF6D9;display:flex;flex-direction:column;gap:9px}
.bt-em-confirm ul{margin:0;padding-left:18px;font-size:13px;font-weight:600}
.bt-em-confirm .bt-em-actions{flex-direction:column-reverse}
.bt-em-confirm .bt-em-actions>.bt-em-btn{flex:none;width:100%;white-space:nowrap}
.bt-em-res{display:flex;flex-direction:column;border:1px solid rgba(21,18,15,.14);border-radius:12px;background:#fff;overflow:hidden;margin:0;padding:0;list-style:none}
.bt-em-res li{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-top:1px solid rgba(21,18,15,.08);min-width:0}
.bt-em-res li:first-child{border-top:0}
.bt-em-res .t{flex:1;min-width:0}
.bt-em-res .n{font-weight:800;overflow-wrap:anywhere}
.bt-em-res .m{display:block;font-size:12.5px;font-weight:600;color:#57524A;line-height:1.35}
.bt-em-res .ic{flex:none;margin-top:1px}
.bt-em-res .sent .ic{color:#1f7a4d}.bt-em-res .failed .ic{color:#C0461F}.bt-em-res .uncertain .ic{color:#B0720B}.bt-em-res .skipped .ic{color:#6E6A63}
.bt-em-banner{border-radius:11px;padding:10px 12px;font-size:13px;font-weight:700;line-height:1.4}
.bt-em-banner.info{background:#EDE7DA}
.bt-em-banner.err{background:#FBE4DD;color:#8a2e14}
.bt-em-banner.warn{background:#FFF1D1;color:#6b4a06}
.bt-em-log{margin:0;padding:0;list-style:none;border:1px solid rgba(21,18,15,.14);border-radius:12px;background:#fff;overflow:hidden}
.bt-em-log li{padding:8px 12px;border-top:1px solid rgba(21,18,15,.08);font-size:12.5px;font-weight:600;overflow-wrap:anywhere}
.bt-em-log li:first-child{border-top:0}
@media (prefers-reduced-motion:reduce){.bt-em *{animation:none!important;transition:none!important}}
`;
const CSS_HTML = { __html: CSS };

type Phase = 'loading' | 'ready' | 'confirm' | 'sending' | 'done' | 'unavailable' | 'error' | 'support';
type Mode = 'planning' | 'message';
type RowKind = 'ok' | 'sans-adresse' | 'adresse-invalide' | 'desabonne' | 'vide';

export interface StaffEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  /** Les salariés actifs déjà chargés par le bureau (aucune lecture ici). */
  workers: User[];
  /** Le lundi de la semaine affichée, « AAAA-MM-JJ ». */
  monday: string;
}

const KIND_OF: Record<Mode, StaffEmailKind> = { planning: 'planning-hebdo', message: 'message-bureau' };
const KIND_LABEL: Record<string, string> = { 'planning-hebdo': 'Planning', 'message-bureau': 'Message' };
const STATUS_LABEL: Record<string, string> = { reserved: 'en cours', sent: 'envoyé', failed: 'refusé', uncertain: 'incertain' };
const fullName = (w: { first_name?: string | null; last_name?: string | null }) => `${w.first_name || ''} ${w.last_name || ''}`.trim() || 'Salarié';

export default function StaffEmailDialog({ open, onOpenChange, companyId, companyName, workers, monday }: StaffEmailDialogProps) {
  const support = useMemo(() => open && !!readSupportSession(), [open]);
  const week = useMemo(() => weekFromMonday(monday), [monday]);
  const people = useMemo(
    () => workers.filter((w) => (w.role === 'worker' || w.role === 'lead') && w.is_active !== false)
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr')),
    [workers],
  );

  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<Mode>('planning');
  const [etat, setEtat] = useState<Etat | null>(null);
  const [slots, setSlots] = useState<WeekSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [banner, setBanner] = useState<{ tone: 'err' | 'warn' | 'info'; text: string } | null>(null);
  const [errorText, setErrorText] = useState('');
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logState, setLogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const run = useRef(0);
  const sendingRef = useRef(false); // un seul envoi à la fois, même si le bouton est touché deux fois très vite
  const confirmRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const my = ++run.current;
    setPhase('loading'); setBanner(null); setResults(null); setPicked(new Set()); setLog(null); setLogState('idle'); setSlotsError(false);
    const [e, s] = await Promise.all([
      callStaffEmail<Etat>({ action: 'etat' }),
      loadWeekSlots(companyId, monday).then((rows) => ({ rows }), () => ({ rows: null as WeekSlot[] | null })),
    ]);
    if (my !== run.current) return;
    if (e.kind === 'missing') { markStaffEmailAbsent(); setPhase('unavailable'); return; }
    if (e.kind === 'network') { setErrorText('Impossible de joindre le serveur pour le moment. Vérifiez votre connexion.'); setPhase('error'); return; }
    if (e.kind === 'refused') { setErrorText(typeof e.data.error === 'string' ? e.data.error : 'Accès refusé.'); setPhase('error'); return; }
    // Une réponse qui n'est pas celle de la fonction (« available: true » et la liste des salariés) = pas disponible.
    if (e.data?.available !== true || !Array.isArray(e.data.workers)) { markStaffEmailAbsent(); setPhase('unavailable'); return; }
    setEtat(e.data);
    setSlots(s.rows); setSlotsError(s.rows === null);
    setPhase('ready');
    preloadExportLibs('pdf'); // le PDF est prêt quand on clique « Continuer »
  }, [companyId, monday]);

  // À chaque ouverture : tout repart de zéro. Le mode support ne fait AUCUN appel.
  useEffect(() => {
    if (!open) { run.current++; return; }
    if (support) { run.current++; setPhase('support'); setMode('planning'); setText(''); setPicked(new Set()); return; }
    setMode('planning'); setText('');
    void load();
  }, [open, support, load]);

  // La confirmation et les résultats se montrent d'eux-mêmes : sur téléphone, ils arrivent sous la ligne de flottaison.
  useEffect(() => {
    if (phase === 'confirm') confirmRef.current?.scrollIntoView({ block: 'nearest' });
    if (phase === 'done') doneRef.current?.scrollIntoView({ block: 'nearest' });
  }, [phase]);

  const kind = KIND_OF[mode];
  const flags = useMemo(() => new Map((etat?.workers || []).map((w) => [w.id, w])), [etat]);

  const rowKind = useCallback((w: User): RowKind => {
    const f = flags.get(w.id);
    const raw = (w.email || '').trim();
    // La fonction a relu l'adresse en base : c'est elle qui fait foi ; sans sa réponse, la même règle qu'elle sur ce qu'on connaît.
    const invalid = f ? f.invalid_email === true : raw !== '' && !isPlausibleEmail(raw);
    const hasEmail = f ? f.has_email : isPlausibleEmail(raw);
    if (invalid) return 'adresse-invalide';
    if (!hasEmail) return 'sans-adresse';
    if (f?.unsubscribed[kind]) return 'desabonne';
    if (mode === 'planning' && slots && countFor(slots, w.id) === 0) return 'vide';
    return 'ok';
  }, [flags, kind, mode, slots]);

  const selectable = useMemo(() => people.filter((w) => rowKind(w) === 'ok'), [people, rowKind]);
  // Ceux qu'on peut contacter d'abord ; les lignes grisées (avec leur raison) en bas, dans l'ordre alphabétique.
  const ordered = useMemo(() => [...selectable, ...people.filter((w) => rowKind(w) !== 'ok')], [selectable, people, rowKind]);
  const chosen = useMemo(() => selectable.filter((w) => picked.has(w.id)), [selectable, picked]);
  const clean = cleanMessage(text);
  const used = etat?.used ?? 0;
  const remaining = etat ? etat.remaining : DAILY_EMAIL_CAP;
  const cap = etat?.cap ?? DAILY_EMAIL_CAP;

  // Changer de mode : la sélection repart de zéro (les raisons d'exclusion ne sont pas les mêmes).
  const pickMode = (m: Mode) => { if (m !== mode) { setMode(m); setPicked(new Set()); setBanner(null); } };
  const toggle = (id: string) => setPicked((p) => new Set(p.has(id) ? Array.from(p).filter((x) => x !== id) : Array.from(p).concat(id)));
  const allOn = selectable.length > 0 && chosen.length === selectable.length;
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(selectable.map((w) => w.id)));

  // Pourquoi « Continuer » est grisé (dit en clair, jamais un bouton muet).
  const blocker = useMemo(() => {
    if (remaining <= 0) return limitMessage(cap);
    if (mode === 'message' && !text.trim()) return 'Écrivez un message.';
    if (mode === 'message' && !clean.ok) return clean.error;
    if (chosen.length === 0) return 'Choisissez au moins une personne.';
    if (chosen.length > remaining) return `Il reste ${remaining} envoi${remaining > 1 ? 's' : ''} aujourd’hui : retirez ${chosen.length - remaining} personne${chosen.length - remaining > 1 ? 's' : ''}.`;
    if (mode === 'planning' && slots === null) return 'Le planning de la semaine n’a pas pu être lu : réessayez.';
    return '';
  }, [remaining, cap, mode, text, clean, chosen.length, slots]);

  // L'aperçu : le texte EXACT de l'e-mail (mêmes gabarits que la fonction).
  const preview = useMemo(() => {
    const first = (chosen[0] || selectable[0])?.first_name || '';
    // Le pied de l'e-mail dépend de l'adresse de l'entreprise (relue par la fonction, qui nous la dit) : même règle que l'envoi.
    const canReply = etat?.can_reply === true;
    if (mode === 'planning' && week) {
      return planningParts({ company: companyName, firstName: first, weekLabel: week.label, fileName: planningFileName(week.start), canReply });
    }
    return messageParts({ company: companyName, firstName: first, message: clean.ok ? clean.text : text.trim() || 'Votre message apparaîtra ici.', canReply });
  }, [chosen, selectable, mode, week, companyName, clean, text, etat]);

  const nameOf = useMemo(() => new Map(people.map((w) => [w.id, fullName(w)])), [people]);

  async function send() {
    if (blocker || phase !== 'confirm' || sendingRef.current) return;
    sendingRef.current = true;
    setPhase('sending'); setBanner(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'planning') {
        const items: Record<string, unknown>[] = [];
        for (const w of chosen) {
          const pdf = await buildWeekPdf({ companyName, workerName: fullName(w), monday, slots: (slots || []).filter((s) => s.user_id === w.id) });
          items.push({ user_id: w.id, mime: 'application/pdf', content_base64: pdf });
        }
        body = { action: 'planning', week_start: monday, items };
      } else {
        body = { action: 'message', user_ids: chosen.map((w) => w.id), message: clean.ok ? clean.text : '' };
      }
      const r = await callStaffEmail<SendData>(body);
      if (r.kind === 'ok' || (r.kind === 'refused' && Array.isArray((r.data as Partial<SendData>).results))) {
        const d = r.data as SendData;
        setResults(d.results);
        if (typeof d.used === 'number') setEtat((e) => (e ? { ...e, used: d.used, remaining: d.remaining } : e));
        if (r.kind === 'refused' && typeof d.error === 'string') setBanner({ tone: 'err', text: d.error });
        setPhase('done');
      } else if (r.kind === 'refused') {
        setBanner({ tone: 'err', text: typeof r.data.error === 'string' ? r.data.error : 'Envoi refusé. Rien n’est parti.' });
        if (r.status === 429) setEtat((e) => (e ? { ...e, used: e.cap, remaining: 0 } : e));
        setPhase('ready');
      } else if (r.kind === 'missing') {
        markStaffEmailAbsent(); setPhase('unavailable');
      } else {
        // Réponse perdue : la fonction a PEUT-ÊTRE envoyé. On le dit, sans inventer de résultat.
        setBanner({ tone: 'warn', text: 'La connexion a été coupée pendant l’envoi : les e-mails sont peut-être partis. Regardez « Derniers envois » avant de recommencer.' });
        setPhase('ready'); setLogState('idle');
      }
    } catch (err) {
      setBanner({ tone: 'err', text: isExportLibError(err) ? 'Impossible de préparer les PDF (outil non chargé). Vérifiez votre connexion et réessayez. Rien n’est parti.' : 'Préparation impossible. Rien n’est parti.' });
      setPhase('ready');
    } finally {
      sendingRef.current = false;
    }
  }

  async function showLog() {
    setLogState('loading');
    const rows = await loadLog(companyId);
    setLog(rows); setLogState(rows ? 'ready' : 'error');
  }

  const weekTitle = week ? `Semaine ${week.label}` : '';
  const loadingLog = logState === 'loading';

  return (
    <Dialog open={open} onOpenChange={(o) => {
      // Pendant l'envoi la fenêtre reste ouverte : la fermer ferait perdre le résultat (il reste dans « Derniers envois »).
      if (!o && phase === 'sending') return;
      if (!o) (document.activeElement as HTMLElement | null)?.blur?.();
      onOpenChange(o);
    }}>
      <DialogContent className="bt-skin max-w-lg" data-testid="staff-email-dialog">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Envoyer par e-mail</DialogTitle>
          <DialogDescription>{weekTitle}</DialogDescription>
        </DialogHeader>

        <div className="bt-em">
          {phase === 'loading' && (
            <p className="bt-em-muted" role="status" data-testid="em-loading"><Loader2 className="mr-1 inline h-4 w-4 animate-spin motion-reduce:animate-none" /> Chargement…</p>
          )}

          {phase === 'unavailable' && (
            <div data-testid="em-unavailable" className="flex flex-col gap-3">
              <div className="bt-em-banner info" role="status">L’envoi par e-mail n’est pas encore activé pour votre entreprise. Rien n’est parti et rien n’est à corriger de votre côté.</div>
              <div className="bt-em-actions"><button type="button" className="bt-em-btn" onClick={() => onOpenChange(false)}>Fermer</button></div>
            </div>
          )}

          {phase === 'error' && (
            <div data-testid="em-error" className="flex flex-col gap-3">
              <div className="bt-em-banner err" role="alert">{errorText}</div>
              <div className="bt-em-actions">
                <button type="button" className="bt-em-btn" onClick={() => void load()}>Réessayer</button>
                <button type="button" className="bt-em-btn ghost" onClick={() => onOpenChange(false)}>Fermer</button>
              </div>
            </div>
          )}

          {phase === 'support' && (
            <div data-testid="em-support" className="flex flex-col gap-3">
              <div className="bt-em-banner info" role="status">Mode support : lecture seule. Aucun e-mail ne peut partir depuis cet écran.</div>
              <div className="bt-em-list">
                {people.length === 0 && <p className="bt-em-muted" style={{ padding: 12 }}>Aucun salarié.</p>}
                {people.map((w) => (
                  <div key={w.id} className="bt-em-row is-off" role="group" aria-label={fullName(w)}>
                    <span className="bt-em-name">{fullName(w)}</span>
                    <span className={`bt-em-tag${isPlausibleEmail((w.email || '').trim()) ? '' : ' warn'}`}>{isPlausibleEmail((w.email || '').trim()) ? 'avec adresse' : (w.email || '').trim() ? 'adresse invalide' : 'sans adresse'}</span>
                  </div>
                ))}
              </div>
              <div className="bt-em-actions"><button type="button" className="bt-em-btn ghost" onClick={() => onOpenChange(false)}>Fermer</button></div>
            </div>
          )}

          {(phase === 'ready' || phase === 'confirm' || phase === 'sending') && etat && (
            <>
              <div className="bt-em-seg" role="group" aria-label="Que voulez-vous envoyer ?">
                <button type="button" className="bt-em-segbtn" aria-pressed={mode === 'planning'} data-testid="em-mode-planning" disabled={phase !== 'ready'} onClick={() => pickMode('planning')}>
                  <CalendarDays className="h-4 w-4" aria-hidden /> Planning (PDF)
                </button>
                <button type="button" className="bt-em-segbtn" aria-pressed={mode === 'message'} data-testid="em-mode-message" disabled={phase !== 'ready'} onClick={() => pickMode('message')}>
                  <Mail className="h-4 w-4" aria-hidden /> Message
                </button>
              </div>

              <div className={`bt-em-counter${remaining <= 0 ? ' full' : ''}`} data-testid="em-counter" role="status">
                <span>{used} e-mail{used > 1 ? 's' : ''} aujourd’hui sur {cap}</span>
                <span>{remaining <= 0 ? limitMessage(cap) : `il en reste ${remaining}`}</span>
              </div>

              {banner && <div className={`bt-em-banner ${banner.tone}`} role={banner.tone === 'err' ? 'alert' : 'status'} data-testid="em-banner">{banner.text}</div>}
              {mode === 'planning' && slotsError && <div className="bt-em-banner err" role="alert">Le planning de la semaine n’a pas pu être lu. <button type="button" className="underline" onClick={() => void load()}>Réessayer</button></div>}

              <fieldset className="m-0 border-0 p-0" disabled={phase !== 'ready'}>
                <legend className="bt-em-label">Qui reçoit ?</legend>
                <div className="bt-em-list" data-testid="em-list">
                  {people.length === 0 && <p className="bt-em-muted" style={{ padding: 12 }}>Aucun salarié actif.</p>}
                  {selectable.length > 0 && (
                    <label className="bt-em-row bt-em-all" data-testid="em-all">
                      <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label={`Tout sélectionner (${selectable.length})`} />
                      <span className="bt-em-name">Tout sélectionner ({selectable.length})</span>
                    </label>
                  )}
                  {ordered.map((w) => {
                    const k = rowKind(w);
                    const off = k !== 'ok';
                    const why = k === 'sans-adresse' ? 'Pas d’adresse e-mail enregistrée : rien ne peut lui être envoyé.'
                      : k === 'adresse-invalide' ? 'Adresse e-mail invalide : corrigez-la sur la fiche du salarié, rien ne peut lui être envoyé.'
                      : k === 'desabonne' ? (mode === 'message'
                        ? 'A demandé à ne plus recevoir les messages du bureau : le message n’est pas envoyé. Contactez cette personne autrement.'
                        : 'A demandé à ne plus recevoir le planning par e-mail : pas d’envoi.')
                        : k === 'vide' ? 'Aucune intervention prévue cette semaine : pas de planning à envoyer.' : '';
                    const tag = k === 'sans-adresse' ? 'sans adresse' : k === 'adresse-invalide' ? 'adresse invalide' : k === 'desabonne' ? 'désabonné' : k === 'vide' ? 'rien cette semaine' : '';
                    return (
                      <div key={w.id} data-testid={`em-person-${w.id}`} data-state={k}>
                        <label className={`bt-em-row${off ? ' is-off' : ''}`}>
                          <input type="checkbox" checked={!off && picked.has(w.id)} disabled={off} onChange={() => toggle(w.id)} aria-label={`${fullName(w)}${tag ? ` (${tag})` : ''}`} />
                          <span className="bt-em-name">
                            {fullName(w)}
                            {!off && (w.email || '').trim() && <span className="bt-em-mail">{w.email}</span>}
                          </span>
                          {off && <span className={`bt-em-tag${k === 'vide' ? '' : ' warn'}`}>{tag}</span>}
                          {!off && mode === 'planning' && slots && <span className="bt-em-tag">{countFor(slots, w.id)} interv.</span>}
                        </label>
                        {off && <p className="bt-em-why">{why}</p>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              {mode === 'message' && (
                <div>
                  <label className="bt-em-label" htmlFor="em-text">Votre message</label>
                  <textarea id="em-text" className="bt-em-text" data-testid="em-text" value={text} disabled={phase !== 'ready'}
                    onChange={(e) => setText(e.target.value)} aria-describedby="em-count" placeholder="Ex. : Réunion de chantier demain à 7 h 30 au dépôt." />
                  <div id="em-count" className={`bt-em-count${messageLength(text) > MAX_MESSAGE_CHARS ? ' over' : ''}`} data-testid="em-count">
                    <span>Texte simple, sans mise en forme.</span>
                    <span>{messageLength(text)}/{MAX_MESSAGE_CHARS}</span>
                  </div>
                </div>
              )}

              <div className="bt-em-preview" data-testid="em-preview">
                <b>Aperçu de l’e-mail</b>
                <div className="bt-em-subject">Objet : {preview.subject}</div>
                <pre>{previewText(preview)}</pre>
                <p className="bt-em-muted" style={{ marginTop: 8 }}>
                  {mode === 'planning'
                    ? 'Chaque salarié reçoit son propre planning en PDF, à l’adresse enregistrée sur sa fiche. Un lien « Se désabonner » est ajouté en bas.'
                    : 'Un e-mail par personne, à l’adresse enregistrée sur sa fiche. Un lien « Se désabonner » est ajouté en bas.'}
                </p>
              </div>

              {phase === 'confirm' ? (
                <div className="bt-em-confirm" role="alertdialog" aria-labelledby="em-confirm-title" data-testid="em-confirm" ref={confirmRef}>
                  <b id="em-confirm-title">Envoyer {chosen.length} e-mail{chosen.length > 1 ? 's' : ''} ?</b>
                  <ul>{chosen.slice(0, 8).map((w) => <li key={w.id}>{fullName(w)}</li>)}{chosen.length > 8 && <li>… et {chosen.length - 8} autre{chosen.length - 8 > 1 ? 's' : ''}</li>}</ul>
                  <p className="bt-em-muted">Un e-mail envoyé ne se rappelle pas. Il restera {Math.max(0, remaining - chosen.length)} envoi{remaining - chosen.length > 1 ? 's' : ''} aujourd’hui.</p>
                  <div className="bt-em-actions">
                    <button type="button" className="bt-em-btn ghost" data-testid="em-back" onClick={() => setPhase('ready')}>Retour</button>
                    <button type="button" className="bt-em-btn go" data-testid="em-send" onClick={() => void send()}>Envoyer {chosen.length} e-mail{chosen.length > 1 ? 's' : ''}</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {blocker && <p className={`bt-em-hint${remaining <= 0 || chosen.length > remaining ? ' err' : ''}`} data-testid="em-blocker" role="status">{blocker}</p>}
                  <div className="bt-em-actions">
                    <button type="button" className="bt-em-btn go" data-testid="em-continue" disabled={!!blocker || phase === 'sending'} onClick={() => setPhase('confirm')}>
                      {phase === 'sending' ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Envoi en cours…</> : 'Continuer'}
                    </button>
                    <button type="button" className="bt-em-btn ghost" onClick={() => onOpenChange(false)} disabled={phase === 'sending'}>Fermer</button>
                  </div>
                </div>
              )}

              {phase === 'sending' && <p className="bt-em-muted" role="status">Envoi en cours : ne fermez pas cette fenêtre.</p>}

              {phase === 'ready' && (
                <div className="flex flex-col gap-2">
                  <button type="button" className="bt-em-btn ghost" data-testid="em-log-open" onClick={() => void showLog()} disabled={loadingLog}>
                    {loadingLog ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Chargement…</> : 'Derniers envois'}
                  </button>
                  {logState === 'error' && <p className="bt-em-muted" data-testid="em-log-error">Le journal n’est pas lisible pour le moment.</p>}
                  {logState === 'ready' && log && (log.length === 0 ? (
                    <p className="bt-em-muted" data-testid="em-log-empty">Aucun envoi pour le moment.</p>
                  ) : (
                    <ul className="bt-em-log" data-testid="em-log">
                      {log.map((l) => {
                        // Une place restée « en cours » passé quelques minutes s'affiche « incertain » (calcul ici, rien n'est écrit).
                        const st = effectiveLogStatus(l.status, parseISO(l.created_at).getTime(), Date.now());
                        return (
                          <li key={l.id} data-status={st}>
                            {format(parseISO(l.created_at), 'd MMM HH:mm', { locale: fr })} · {KIND_LABEL[l.kind] || l.kind} · {l.user_id && nameOf.get(l.user_id) ? nameOf.get(l.user_id) : l.recipient_mask} · {STATUS_LABEL[st] || st}
                            {st === 'uncertain' && <span className="block text-[#8a5a00]"> {UNCERTAIN_LOG_TEXT}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === 'done' && results && (
            <div className="flex flex-col gap-3" data-testid="em-done" ref={doneRef}>
              {banner && <div className={`bt-em-banner ${banner.tone}`} role="alert" data-testid="em-banner">{banner.text}</div>}
              <div className="bt-em-banner info" role="status" data-testid="em-summary">
                {results.filter((r) => r.outcome === 'sent').length} envoyé{results.filter((r) => r.outcome === 'sent').length > 1 ? 's' : ''}
                {' · '}{results.filter((r) => r.outcome === 'skipped').length} ignoré{results.filter((r) => r.outcome === 'skipped').length > 1 ? 's' : ''}
                {' · '}{results.filter((r) => r.outcome === 'failed').length} non envoyé{results.filter((r) => r.outcome === 'failed').length > 1 ? 's' : ''}
                {' · '}{results.filter((r) => r.outcome === 'uncertain').length} incertain{results.filter((r) => r.outcome === 'uncertain').length > 1 ? 's' : ''}
                {' · '}{etat ? `${etat.used} aujourd’hui sur ${etat.cap}` : ''}
              </div>
              <ul className="bt-em-res" data-testid="em-results" aria-live="polite">
                {results.map((r) => (
                  <li key={r.user_id} className={r.outcome} data-testid={`em-result-${r.user_id}`} data-outcome={r.outcome}>
                    <span className="ic" aria-hidden>
                      {r.outcome === 'sent' ? <CheckCircle2 className="h-5 w-5" /> : r.outcome === 'failed' ? <CircleAlert className="h-5 w-5" /> : r.outcome === 'uncertain' ? <CircleHelp className="h-5 w-5" /> : <MinusCircle className="h-5 w-5" />}
                    </span>
                    <span className="t">
                      <span className="n">{nameOf.get(r.user_id) || 'Salarié'} — {r.outcome === 'sent' ? 'envoyé' : r.outcome === 'skipped' ? 'ignoré' : r.outcome === 'failed' ? 'non envoyé' : 'incertain'}</span>
                      <span className="m">{r.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="bt-em-actions">
                <button type="button" className="bt-em-btn" data-testid="em-new" onClick={() => { setResults(null); setPicked(new Set()); setText(''); setBanner(null); setPhase('ready'); }}>Nouvel envoi</button>
                <button type="button" className="bt-em-btn ghost" onClick={() => onOpenChange(false)}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
