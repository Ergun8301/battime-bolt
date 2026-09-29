'use client';

// Assistant BEMEXO — UN bouton, UN panneau. On écrit, ou on appuie sur 🎤 et
// on parle : la dictée (fr-FR) vient du navigateur / téléphone. Si l'appareil
// ne sait pas la faire, le micro n'apparaît simplement pas.
//
// Rien n'est conservé : la conversation vit dans cet écran et disparaît quand
// on recharge la page.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles, X, Mic, ArrowUp, Loader2, ArrowRight } from 'lucide-react';
import { ASSISTANT_SUGGESTIONS, type AssistantLink, type AssistantSource } from '@/lib/assistant';

type Msg = { who: 'me' | 'bot'; text: string; links?: AssistantLink[]; notice?: boolean; extra?: unknown };

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
}

export default function AssistantPanel({ source, onNavigate, defaultOpen = false, suggestions = ASSISTANT_SUGGESTIONS, intro, renderExtra, footNote = 'Lecture seule · rien n’est conservé' }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCanSpeak(!!speechCtor()); }, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    setMsgs((m) => [...m, { who: 'me', text: question }]);
    setBusy(true);
    const r = await source.ask(question);
    setBusy(false);
    setMsgs((m) => [...m, { who: 'bot', text: r.answer, links: r.links, notice: r.notice, extra: r.extra }]);
    if (typeof r.remaining === 'number') setRemaining(r.remaining);
  }, [busy, source]);

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
      {!open && (
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
                <p className="as-sub">{intro ?? 'Posez une question sur vos équipes, vos heures ou vos chantiers'}{canSpeak ? ' — à l’écrit ou à voix haute' : ''}.</p>
                <div className="as-sugg">
                  {suggestions.map((s) => (
                    <button type="button" key={s} onClick={() => ask(s)}>{s}<ArrowRight className="h-4 w-4 text-neutral-400" /></button>
                  ))}
                </div>
              </>
            )}
            {msgs.map((m, i) => (m.who === 'me'
              ? <div key={i} className="as-me">{m.text}</div>
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
            <form className="as-bar" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
              <textarea
                rows={1} value={text} placeholder={listening ? 'Je vous écoute…' : 'Votre question…'} maxLength={500}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }}
                aria-label="Votre question"
              />
              {canSpeak && (
                <button type="button" className={`as-btn as-mic${listening ? ' on' : ''}`} onClick={toggleMic} aria-label={listening ? 'Arrêter la dictée' : 'Dicter'} data-testid="assistant-mic">
                  <Mic className="h-4 w-4" />
                </button>
              )}
              <button type="submit" className="as-btn as-send" disabled={!text.trim() || busy} aria-label="Envoyer"><ArrowUp className="h-4 w-4" /></button>
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
