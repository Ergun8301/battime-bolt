'use client';

// Assistant BEMEXO — UN bouton, UN panneau. On écrit, ou on appuie sur 🎤 et
// on parle : la dictée (fr-FR) vient du navigateur / téléphone. Si l'appareil
// ne sait pas la faire, le micro n'apparaît simplement pas.
//
// Rien n'est conservé : la conversation vit dans cet écran et disparaît quand
// on recharge la page. 📎 (lot 3 bis) : photo ou PDF joint, compressé ici,
// rangé seulement après « Confirmer ».

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles, X, Mic, ArrowUp, Loader2, ArrowRight, Paperclip, FileText } from 'lucide-react';
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, attachmentError, compressAttachment } from '@/lib/attachment';
import { ASSISTANT_SUGGESTIONS, type AssistantLink, type AssistantSource } from '@/lib/assistant';

type Msg = { who: 'me' | 'bot'; text: string; links?: AssistantLink[]; notice?: boolean; extra?: unknown; file?: string };

interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechCtor = new () => SpeechRec;

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

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
.as-meta{font-size:11px;color:#9a948a;margin:7px 4px 0;display:flex;justify-content:space-between}
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
  renderExtra?: (extra: unknown) => ReactNode;
  /** Lot 4 : mention sous la zone de saisie. */
  footNote?: string;
  /** Lot 3 bis : 📎 photo ou PDF joint à la demande. */
  attachments?: boolean;
  /** Lot 6 : ouverture pilotée par l'écran (bouton ✨ dans une barre), sans bouton flottant. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Lot 6 : false = pas de bouton flottant (il recouvrait du contenu). */
  launcher?: boolean;
}

export default function AssistantPanel({ source, onNavigate, defaultOpen = false, suggestions = ASSISTANT_SUGGESTIONS, intro, renderExtra, footNote = 'Rien n’est fait sans votre confirmation', attachments = false, open: openProp, onOpenChange, launcher = true }: Props) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setInnerOpen(v); };
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCanSpeak(!!speechCtor()); }, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim() || (file ? 'Regarde ce fichier.' : '');
    if (!question || busy) return;
    const sent = file;
    setText(''); setFile(null);
    setMsgs((m) => [...m, { who: 'me', text: question, file: sent?.name }]);
    setBusy(true);
    const r = await source.ask(question, sent ?? undefined);
    setBusy(false);
    // Le fichier reste DANS L'ÉCRAN, joint à la carte : il ne sera rangé
    // (documents du chantier) qu'après « Confirmer ».
    const extra = r.extra && sent && typeof r.extra === 'object' ? { ...(r.extra as object), attachment: sent } : r.extra;
    setMsgs((m) => [...m, { who: 'bot', text: r.answer, links: r.links, notice: r.notice, extra }]);
    if (typeof r.remaining === 'number') setRemaining(r.remaining);
  }, [busy, source, file]);

  const pickFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    const bad = attachmentError(f);
    if (bad) { setMsgs((m) => [...m, { who: 'bot', text: bad, notice: true }]); return; }
    const small = await compressAttachment(f);
    if (small.size > ATTACH_MAX_BYTES) { setMsgs((m) => [...m, { who: 'bot', text: 'Fichier trop lourd (8 Mo maximum).', notice: true }]); return; }
    setFile(small);
  };

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      setText((finalText + interim).trim());
    };
    rec.onend = () => { setListening(false); recRef.current = null; if (finalText.trim()) ask(finalText); };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const go = (action: string) => {
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
            <button type="button" className="as-x" onClick={() => { recRef.current?.stop(); setOpen(false); }} aria-label="Fermer"><X className="h-5 w-5" /></button>
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
                  {m.extra != null && renderExtra ? renderExtra(m.extra) : null}
                </div>
              )))}
            {busy && <div className="as-typing"><Loader2 className="h-4 w-4 animate-spin" /> Je regarde…</div>}
          </div>
          <div className="as-foot">
            {file && (
              <div className="as-chip" data-testid="assistant-file">
                <FileText className="h-3.5 w-3.5" /> <span>{file.name}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Retirer le fichier"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <form className="as-bar" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
              <textarea
                rows={1} value={text} placeholder={listening ? 'Je vous écoute…' : 'Votre question…'} maxLength={500}
                onChange={(e) => setText(e.target.value)}
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
                <button type="button" className={`as-btn as-mic${listening ? ' on' : ''}`} onClick={toggleMic} aria-label={listening ? 'Arrêter la dictée' : 'Dicter'} data-testid="assistant-mic">
                  <Mic className="h-4 w-4" />
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
