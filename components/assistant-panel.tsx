'use client';

// Assistant BEMEXO — UN bouton, UN panneau. On écrit, ou on appuie sur 🎤 et
// on parle : la dictée (fr-FR) vient du navigateur / téléphone. Si l'appareil
// ne sait pas la faire, le micro n'apparaît simplement pas.
// Lot 7 : la dictée ne s'arrête JAMAIS seule (lib/dictation.ts) ; le texte
// s'écrit en direct dans le champ, on le corrige, puis « Envoyer ».
//
// Rien n'est conservé sur l'appareil : la conversation disparaît quand on
// recharge la page. Lot 7 : elle vit HORS de l'écran (en mémoire), pour qu'un
// redessin (session rafraîchie, planning rechargé) ne ferme pas le panneau et
// ne perde ni les messages, ni la réponse en cours. 📎 (lot 3 bis) : photo ou
// PDF joint, compressé ici, rangé seulement après « Confirmer ».
// Salarié (phrases longues, français ET turc) : limite de saisie relevée (`maxChars`), sélecteur de langue de
// dictée (`dictationLangs`), indice d'attente après 4 s (`slowHint`) et phrase remise dans le champ quand
// l'assistant n'a pas pu répondre (`restoreOnFailure`). Le bureau n'en passe aucune : rien ne change pour lui.
// Rien ici ne parle de la formule IA (essai / payant) : à la demande d'Ergun, le
// panneau n'affiche aucun bandeau ; seul le support BEMEXO la voit (app/support).

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { Sparkles, X, Mic, Square, ArrowUp, Loader2, ArrowRight, Paperclip, FileText } from 'lucide-react';
import { Dictation, speechCtor } from '@/lib/dictation';
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, attachmentError, compressAttachment } from '@/lib/attachment';
import { ASSISTANT_SUGGESTIONS, type AssistantLink, type AssistantSource } from '@/lib/assistant';
import { isNewRequest as isNewRequestFr } from '@/supabase/functions/_shared/fr-langue';

export interface ExtraControl {
  /** Change le texte de la bulle (null = l'efface), la question en attente reste ouverte. */
  text: (text: string | null) => void;
  /** Action finie : texte de la bulle (facultatif) et fin de la question en attente. */
  settle: (text?: string | null) => void;
}
type Msg = { who: 'me' | 'bot'; text: string; links?: AssistantLink[]; notice?: boolean; extra?: unknown; file?: string };

// Lot 7 : une conversation par écran (bureau, salarié…), gardée en mémoire.
interface Convo { msgs: Msg[]; busy: boolean; pending: string | null; open: boolean; remaining: number | null; listeners: Set<() => void> }
const CONVOS = new Map<string, Convo>();
function convoOf(key: string): Convo {
  let c = CONVOS.get(key);
  if (!c) { c = { msgs: [], busy: false, pending: null, open: false, remaining: null, listeners: new Set() }; CONVOS.set(key, c); }
  return c;
}
function changed(c: Convo) { c.listeners.forEach((f) => f()); }


const CSS = `
.as-fab{position:fixed;right:20px;bottom:20px;z-index:60;display:inline-flex;align-items:center;gap:8px;background:#15120F;color:#FBF8F2;border:none;border-radius:999px;padding:12px 18px 12px 14px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 10px 30px rgba(21,18,15,.28);font-family:inherit}
.as-fab svg{color:#FFC21A}
.as-panel{position:fixed;top:0;right:0;bottom:0;z-index:70;width:min(420px,100vw);background:#FBF8F2;border-left:1px solid rgba(21,18,15,.12);box-shadow:-20px 0 50px rgba(21,18,15,.14);display:flex;flex-direction:column;font-family:inherit}
.as-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(21,18,15,.08)}
.as-head b{font-size:16px;font-weight:900;color:#15120F;flex:1}
.as-head .ico{width:30px;height:30px;border-radius:9px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center}
.as-x{border:none;background:transparent;color:#6E6A63;cursor:pointer;padding:6px;border-radius:8px}
.as-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px}
.as-hello{color:#15120F;font-weight:800;font-size:20px;letter-spacing:-.01em;margin:6px 0 2px}
.as-sub{color:#6E6A63;font-size:13.5px;margin:0 0 10px;line-height:1.45}
.as-sugg{display:flex;flex-direction:column;gap:8px}
.as-sugg button{text-align:left;border:1px solid rgba(21,18,15,.12);background:#fff;border-radius:12px;padding:11px 13px;font-size:14px;font-weight:600;color:#15120F;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px}
.as-sugg button:hover{border-color:#15120F}
.as-me{align-self:flex-end;max-width:85%;background:#15120F;color:#FBF8F2;border-radius:16px 16px 4px 16px;padding:10px 13px;font-size:14px;font-weight:600;line-height:1.4}
.as-bot{align-self:flex-start;max-width:92%;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:16px 16px 16px 4px;padding:11px 13px;font-size:14px;color:#15120F;line-height:1.5}
.as-bot.notice{background:#FFF6E0;border-color:#F1D48A}
.as-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.as-links button{display:inline-flex;align-items:center;gap:5px;border:none;background:#FFC21A;color:#15120F;border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit}
.as-typing{align-self:flex-start;color:#6E6A63;font-size:13px;display:flex;align-items:center;gap:6px}
.as-foot{padding:12px 14px 16px;border-top:1px solid rgba(21,18,15,.08)}
.as-bar{display:flex;align-items:flex-end;gap:8px;background:#fff;border:1.5px solid rgba(21,18,15,.16);border-radius:16px;padding:6px 6px 6px 12px}
.as-bar:focus-within{border-color:#15120F}
.as-bar textarea{flex:1;border:none;outline:none;resize:none;font-family:inherit;font-size:15px;line-height:1.4;padding:7px 0;max-height:120px;background:transparent;color:#15120F}
.as-bar textarea.long{max-height:min(38vh,240px)}
.as-lang{display:flex;align-items:center;gap:6px;margin:0 2px 8px;font-size:12px;font-weight:800;color:#56514a}
.as-lang button{min-height:32px;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:800;color:#15120F;cursor:pointer;font-family:inherit}
.as-lang button[aria-pressed=true]{background:#15120F;color:#FBF8F2;border-color:#15120F}
.as-lang button:disabled{opacity:.45;cursor:default}
.as-lang button:focus-visible{outline:2px solid #FFC21A;outline-offset:2px}
.as-count{text-align:right;font-size:11.5px;font-weight:700;color:#6E6A63;margin:0 6px 4px}
.as-count.full{color:#B42318}
.as-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.as-btn{width:38px;height:38px;flex:none;border-radius:12px;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer}
.as-send{background:#15120F;color:#FBF8F2}
.as-send:disabled{opacity:.35;cursor:default}
.as-mic{background:#F1ECE2;color:#15120F}
.as-mic.on{background:#E5484D;color:#fff;animation:as-pulse 1.2s infinite}
@keyframes as-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,72,77,.45)}50%{box-shadow:0 0 0 7px rgba(229,72,77,0)}}
.as-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:999px;padding:4px 6px 4px 10px;font-size:12.5px;font-weight:700;color:#15120F;margin:0 0 8px}
.as-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px}
.as-chip button{border:none;background:#F1ECE2;border-radius:999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56514a}
.as-file{display:flex;align-items:center;gap:5px;font-size:12px;opacity:.85;margin-bottom:4px}
.as-meta{font-size:11px;color:#9a948a;margin:7px 4px 0;display:flex;justify-content:space-between;gap:8px}
.as-rec{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;color:#B42318;margin:0 4px 8px}
.as-rec i{width:8px;height:8px;border-radius:50%;background:#E5484D;animation:as-blink 1s infinite}
@keyframes as-blink{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.as-mic.on,.as-rec i{animation:none}}
@media(max-width:640px){.as-fab{right:14px;bottom:14px}}
`;

interface Props {
  source: AssistantSource;
  onNavigate: (action: string) => void;
  defaultOpen?: boolean;
  /** Lot 4 : questions de départ propres à l'écran (défaut : celles du bureau). */
  suggestions?: string[];
  /** Lot 4 : phrase d'accueil. */
  intro?: string;
  /** Lot 4 : contenu en plus sous une réponse (ex. brouillon de pointage à confirmer). */
  /** `ctl.settle(texte)` : la carte remplace le texte de sa bulle (null = l'efface) une fois faite. */
  renderExtra?: (extra: unknown, ctl: ExtraControl) => ReactNode;
  /** Lot 4 : mention sous la zone de saisie. */
  footNote?: string;
  /** Lot 3 bis : 📎 photo ou PDF joint à la demande. */
  attachments?: boolean;
  /** Lot 6 : ouverture pilotée par l'écran (bouton ✨ dans une barre), sans bouton flottant. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Lot 6 : false = pas de bouton flottant (il recouvrait du contenu). */
  launcher?: boolean;
  /** Lot 7 : nom de la conversation gardée en mémoire (une par écran). */
  memoryKey?: string;
  /** Longueur maximale d'un message (défaut 500 : le bureau). Le salarié passe 1500 (phrases longues). */
  maxChars?: number;
  /** Langues de dictée proposées (le salarié : français et turc). Sans cette liste (bureau), pas de sélecteur : français. */
  dictationLangs?: { code: string; label: string; aria: string }[];
  /** Message d'attente affiché au bout de 4 s pour cette demande (null = « Je regarde… » reste). */
  slowHint?: (text: string) => string | null;
  /** Vrai (salarié) : si l'assistant n'a pas pu répondre (notice sans carte), la phrase est remise dans le champ pour ne pas la redicter. */
  restoreOnFailure?: boolean;
  /** Une saisie est-elle une NOUVELLE demande (et non la réponse à la question en attente) ? Défaut : la règle du français. */
  isNewRequest?: (text: string) => boolean;
}

const SLOW_MS = 4000;
const fmtNum = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const LANG_KEY = (memoryKey: string) => `bemexo:dictee-langue:${memoryKey}`;

export default function AssistantPanel({
  source, onNavigate, defaultOpen = false, suggestions = ASSISTANT_SUGGESTIONS, intro, renderExtra, footNote = 'Actions simples faites tout de suite · « Annuler » en un clic', attachments = false, open: openProp, onOpenChange,
  launcher = true, memoryKey = 'assistant', maxChars = 500, dictationLangs, slowHint, restoreOnFailure = false, isNewRequest = isNewRequestFr,
}: Props) {
  const convo = convoOf(memoryKey);
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { convo.listeners.add(redraw); return () => { convo.listeners.delete(redraw); }; }, [convo]);
  const [innerOpen, setInnerOpen] = useState(defaultOpen || convo.open);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setInnerOpen(v); };
  // Redessiné alors qu'il était ouvert : il se rouvre tout seul, conversation comprise.
  useEffect(() => { if (convo.open && !open) setOpen(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const firstOpen = useRef(true);
  useEffect(() => { if (firstOpen.current) { firstOpen.current = false; return; } convo.open = open; }, [open, convo]);
  const msgs = convo.msgs;
  const setMsgs = useCallback((f: (m: Msg[]) => Msg[]) => { convo.msgs = f(convo.msgs); changed(convo); }, [convo]);
  const busy = convo.busy;
  const setBusy = useCallback((v: boolean) => { convo.busy = v; changed(convo); }, [convo]);
  const remaining = convo.remaining;
  const setRemaining = (v: number) => { convo.remaining = v; changed(convo); };
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // Langue de dictée : « fr-FR » au départ (export statique : pas d'écart d'hydratation), la valeur gardée est lue APRÈS le montage.
  const langs = dictationLangs && dictationLangs.length >= 2 ? dictationLangs : null;
  const [lang, setLang] = useState(langs ? langs[0].code : 'fr-FR');
  const dictRef = useRef<Dictation | null>(null);
  // Lot 7 : une question vient d'être posée (« Sur quel chantier ? ») — la
  // prochaine réponse complète la MÊME demande au lieu d'en ouvrir une autre.
  const pendingRef = { get current() { return convo.pending; }, set current(v: string | null) { convo.pending = v; } };
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCanSpeak(!!speechCtor()); return () => dictRef.current?.abort(); }, []);
  useEffect(() => {
    if (!langs) return;
    try {
      const v = window.localStorage.getItem(LANG_KEY(memoryKey));
      if (v && langs.some((l) => l.code === v)) setLang(v);
    } catch { /* stockage indisponible : le panneau marche sans */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pickLang = (code: string) => {
    setLang(code);
    try { window.localStorage.setItem(LANG_KEY(memoryKey), code); } catch { /* sans effet */ }
  };
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim() || (file ? 'Regarde ce fichier.' : '');
    if (!question || busy) return;
    // « Envoyer » pendant la dictée : on coupe net, le texte affiché part tel quel.
    dictRef.current?.abort();
    const sent = file;
    setText(''); setFile(null);
    setMsgs((m) => [...m, { who: 'me', text: question, file: sent?.name }]);
    setBusy(true);
    // La réponse à la question en attente s'ajoute à la demande : c'est la FIN (la réponse) qui compte si le total dépasse la limite.
    const full = pendingRef.current && !sent && !isNewRequest(question)
      ? `${pendingRef.current.slice(0, Math.max(0, maxChars - question.length - 2))}, ${question}` : question;
    // Une phrase longue peut demander plusieurs secondes : au bout de 4 s, on le dit.
    const wait = slowHint?.(full) ?? null;
    const timer = wait ? setTimeout(() => setHint(wait), SLOW_MS) : null;
    const r = await source.ask(full, sent ?? undefined);
    if (timer) clearTimeout(timer);
    setHint(null);
    pendingRef.current = r.followUp ? full : null;
    setBusy(false);
    // L'assistant n'a pas pu répondre : la phrase revient dans le champ (300 à 1 500 caractères à redicter, sinon).
    if (restoreOnFailure && r.notice && !r.extra) setText((cur) => cur || question.slice(0, maxChars));
    // Le fichier reste DANS L'ÉCRAN, joint à la carte : il ne sera rangé
    // (documents du chantier) qu'après « Confirmer ».
    const extra = r.extra && sent && typeof r.extra === 'object' ? { ...(r.extra as object), attachment: sent } : r.extra;
    setMsgs((m) => [...m, { who: 'bot', text: r.answer, links: r.links, notice: r.notice, extra }]);
    if (typeof r.remaining === 'number') setRemaining(r.remaining);
  }, [busy, source, file, maxChars, slowHint, restoreOnFailure, isNewRequest]);

  const pickFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    const bad = attachmentError(f);
    if (bad) { setMsgs((m) => [...m, { who: 'bot', text: bad, notice: true }]); return; }
    const small = await compressAttachment(f);
    if (small.size > ATTACH_MAX_BYTES) { setMsgs((m) => [...m, { who: 'bot', text: 'Fichier trop lourd (8 Mo maximum).', notice: true }]); return; }
    setFile(small);
  };

  // Un appui : on écoute (sans jamais s'arrêter seul). Un appui : on arrête.
  // Rien ne part tout seul : le texte reste dans le champ jusqu'à « Envoyer ».
  const toggleMic = () => {
    if (dictRef.current?.listening) { dictRef.current.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    let cut = false;
    dictRef.current = new Dictation(Ctor, {
      onText: (t) => {
        setText(t.slice(0, maxChars));
        // Dictée coupée au plafond : une seule fois par séance, on le dit.
        if (t.length > maxChars && !cut) { cut = true; setMsgs((x) => [...x, { who: 'bot', text: `Message coupé à ${fmtNum(maxChars)} caractères.`, notice: true }]); }
      },
      onState: setListening,
      onError: (m) => setMsgs((x) => [...x, { who: 'bot', text: m, notice: true }]),
      lang,
      onLangUnsupported: () => { if (langs) pickLang(langs[0].code); },
    });
    dictRef.current.start(text);
  };

  const go = (action: string) => {
    // « ask:… » : une question toute prête, posée ici même.
    if (action.startsWith('ask:')) { ask(action.slice(4)); return; }
    onNavigate(action);
    if (window.matchMedia('(max-width: 640px)').matches) setOpen(false);
  };

  return (
    <>
      <style>{CSS}</style>
      {!open && launcher && (
        <button type="button" className="as-fab" onClick={() => setOpen(true)} data-testid="assistant-open">
          <Sparkles className="h-4 w-4" /> Assistant BEMEXO
        </button>
      )}
      {open && (
        <aside className="as-panel" aria-label="Assistant BEMEXO" data-testid="assistant-panel">
          <div className="as-head">
            <span className="ico"><Sparkles className="h-4 w-4" /></span>
            <b>Assistant BEMEXO</b>
            <button type="button" className="as-x" onClick={() => { dictRef.current?.abort(); setOpen(false); }} aria-label="Fermer"><X className="h-5 w-5" /></button>
          </div>
          <div className="as-body" ref={bodyRef}>
            {msgs.length === 0 && (
              <>
                <p className="as-hello">Bonjour 👋</p>
                <p className="as-sub">{intro ?? 'Demandez-moi de faire quelque chose, comment faire, ou un chiffre sur vos équipes'}{canSpeak ? ' — à l’écrit ou à voix haute' : ''}.</p>
                <div className="as-sugg">
                  {suggestions.map((s) => (
                    <button type="button" key={s} onClick={() => ask(s)}>{s}<ArrowRight className="h-4 w-4 text-neutral-400" /></button>
                  ))}
                </div>
              </>
            )}
            {msgs.map((m, i) => (m.who === 'me'
              ? <div key={i} className="as-me">{m.file && <span className="as-file"><FileText className="h-3.5 w-3.5" /> {m.file}</span>}{m.text}</div>
              : (
                <div key={i} className={`as-bot${m.notice ? ' notice' : ''}`}>
                  {m.text}
                  {m.links && m.links.length > 0 && (
                    <div className="as-links">
                      {m.links.map((l) => <button type="button" key={l.action} onClick={() => go(l.action)}>{l.label} <ArrowRight className="h-3 w-3" /></button>)}
                    </div>
                  )}
                  {m.extra != null && renderExtra ? renderExtra(m.extra, {
                    text: (t) => setMsgs((all) => all.map((x, j) => (j === i ? { ...x, text: t ?? '' } : x))),
                    settle: (t) => {
                      pendingRef.current = null;
                      if (t !== undefined) setMsgs((all) => all.map((x, j) => (j === i ? { ...x, text: t ?? '' } : x)));
                    },
                  }) : null}
                </div>
              )))}
            {busy && <div className="as-typing" role="status"><Loader2 className="h-4 w-4 animate-spin" /> {hint ?? 'Je regarde…'}</div>}
          </div>
          <div className="as-foot">
            {file && (
              <div className="as-chip" data-testid="assistant-file">
                <FileText className="h-3.5 w-3.5" /> <span>{file.name}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Retirer le fichier"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {listening && (
              <div className="as-rec" role="status" data-testid="assistant-listening"><i /> J’écoute… appuyez sur ■ pour arrêter, ou Envoyer</div>
            )}
            {langs && canSpeak && (
              <div className="as-lang" role="group" aria-label="Langue de la dictée" data-testid="assistant-langs">
                <span aria-hidden="true">Dictée :</span>
                {langs.map((l) => (
                  <button type="button" key={l.code} aria-pressed={lang === l.code} aria-label={l.aria} disabled={listening} data-testid={`assistant-lang-${l.code}`}
                    lang={l.code.slice(0, 2)} onClick={() => pickLang(l.code)}>{l.label}</button>
                ))}
              </div>
            )}
            {maxChars > 500 && text.length >= maxChars * 0.8 && (
              <p className={`as-count${text.length >= maxChars ? ' full' : ''}`} data-testid="assistant-count" aria-hidden="true">{fmtNum(text.length)} / {fmtNum(maxChars)}</p>
            )}
            {maxChars > 500 && (
              // Annoncé seulement aux seuils (80 % et 100 %), pas à chaque lettre.
              <div className="as-sr" role="status">{text.length >= maxChars ? `Limite de ${fmtNum(maxChars)} caractères atteinte.` : text.length >= maxChars * 0.8 ? `${fmtNum(Math.round(maxChars * 0.8))} caractères sur ${fmtNum(maxChars)}.` : ''}</div>
            )}
            <form className="as-bar" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
              <textarea
                className={maxChars > 500 ? 'long' : undefined} lang={langs ? lang.slice(0, 2) : undefined}
                rows={listening || text.length > 60 ? (maxChars > 500 && text.length > 300 ? 6 : 3) : 1} value={text} placeholder={listening ? 'Parlez, le texte s’écrit ici…' : 'Votre question…'} maxLength={maxChars}
                onChange={(e) => { setText(e.target.value); dictRef.current?.edit(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }}
                aria-label="Votre question"
              />
              {attachments && (<>
                <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} hidden onChange={(e) => pickFile(e.target.files?.[0])} data-testid="assistant-file-input" />
                <button type="button" className="as-btn as-mic" onClick={() => fileRef.current?.click()} aria-label="Joindre une photo ou un PDF" data-testid="assistant-attach">
                  <Paperclip className="h-4 w-4" />
                </button>
              </>)}
              {canSpeak && (
                <button type="button" className={`as-btn as-mic${listening ? ' on' : ''}`} onClick={toggleMic} aria-label={listening ? 'Arrêter la dictée' : 'Dicter'} aria-pressed={listening} data-testid="assistant-mic">
                  {listening ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button type="submit" className="as-btn as-send" disabled={(!text.trim() && !file) || busy} aria-label="Envoyer"><ArrowUp className="h-4 w-4" /></button>
            </form>
            <div className="as-meta">
              <span>{footNote}</span>
              {remaining != null && <span>{remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} aujourd’hui</span>}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
