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
// Étape 2 « chat avec mémoire » : à chaque demande l'écran envoie les derniers messages TEXTE (`history`) pour que l'assistant
// comprenne « et pour Lucas aussi ? » ; « Nouveau chat » repart d'une page blanche ; avec `chats`, chaque tour complet est
// enregistré (texte seulement, privé, 30 jours) et « Historique » rouvre — pour la CONTINUER — une ancienne conversation.
// Rien ici ne parle de la formule IA (essai / payant) : à la demande d'Ergun, le
// panneau n'affiche aucun bandeau ; seul le support BEMEXO la voit (app/support).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Sparkles, X, Mic, Square, ArrowUp, Loader2, ArrowRight, Paperclip, FileText, Plus, Clock, Trash2, ArrowLeft } from 'lucide-react';
import { Dictation, speechCtor } from '@/lib/dictation';
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, attachmentError, compressAttachment } from '@/lib/attachment';
import { ASSISTANT_SUGGESTIONS, type AssistantLink, type AssistantSource } from '@/lib/assistant';
import { historyOf, jourRelatif, type ChatMessage, type ChatStore, type ChatSummary } from '@/lib/assistant-chats';
import { isNewRequest as isNewRequestFr } from '@/supabase/functions/_shared/fr-langue';

export interface ExtraControl {
  /** Change le texte de la bulle (null = l'efface), la question en attente reste ouverte. */
  text: (text: string | null) => void;
  /** Action finie : texte de la bulle (facultatif) et fin de la question en attente. */
  settle: (text?: string | null) => void;
}
/** `lost` (une question) : sa réponse a été une notice (erreur, quota) — elle n'est ni envoyée comme contexte ni enregistrée. */
type Msg = { who: 'me' | 'bot'; text: string; links?: AssistantLink[]; notice?: boolean; extra?: unknown; file?: string; lost?: boolean };

// Lot 7 : une conversation par écran (bureau, salarié…), gardée en mémoire.
// Étape 2 : `chatId` = la conversation enregistrée où vont les prochains tours (null = pas encore enregistrée) ;
// `gen` change à chaque fois que la conversation est vidée ou rouverte (une réponse en vol d'AVANT ne doit pas atterrir dans la nouvelle) ;
// `sauve` met les enregistrements en file : deux tours rapprochés ne doivent pas ouvrir deux conversations.
interface Convo {
  msgs: Msg[]; busy: boolean; pending: string | null; open: boolean; remaining: number | null; chatId: string | null; gen: number; sauve: Promise<void>; listeners: Set<() => void>;
}
const CONVOS = new Map<string, Convo>();
function convoOf(key: string): Convo {
  let c = CONVOS.get(key);
  if (!c) { c = { msgs: [], busy: false, pending: null, open: false, remaining: null, chatId: null, gen: 0, sauve: Promise.resolve(), listeners: new Set() }; CONVOS.set(key, c); }
  return c;
}
function changed(c: Convo) { c.listeners.forEach((f) => f()); }
/** « Nouveau chat » (ou la conversation à l'écran vient d'être supprimée) : page blanche, plus de question en attente, plus de chat courant. */
function resetConvo(c: Convo) { c.msgs = []; c.pending = null; c.chatId = null; c.gen++; changed(c); }
/**
 * Enregistre un tour COMPLET (jamais une notice). Les erreurs sont avalées SANS rien écrire dans la console : l'assistant doit marcher
 * même si l'enregistrement échoue, et le contenu d'un chat n'a rien à faire dans un journal.
 */
function enregistrer(c: Convo, chats: ChatStore, gen: number, question: string, answer: string, links: AssistantLink[]) {
  c.sauve = c.sauve.then(async () => {
    try {
      if (c.gen !== gen) return; // la conversation a été vidée ou supprimée entre-temps : ce tour n'a plus de chat où aller
      const id = await chats.append(c.chatId, question, answer, links);
      if (id && c.gen === gen) c.chatId = id;
    } catch { /* sans enregistrement, l'assistant répond quand même */ }
  });
}


const CSS = `
.as-fab{position:fixed;right:20px;bottom:20px;z-index:60;display:inline-flex;align-items:center;gap:8px;background:#15120F;color:#FBF8F2;border:none;border-radius:999px;padding:12px 18px 12px 14px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 10px 30px rgba(21,18,15,.28);font-family:inherit}
.as-fab svg{color:#FFC21A}
.as-panel{position:fixed;top:0;right:0;bottom:0;z-index:70;width:min(420px,100vw);background:#FBF8F2;border-left:1px solid rgba(21,18,15,.12);box-shadow:-20px 0 50px rgba(21,18,15,.14);display:flex;flex-direction:column;font-family:inherit}
.as-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(21,18,15,.08)}
.as-head b{font-size:16px;font-weight:900;color:#15120F;flex:1}
.as-head .ico{width:30px;height:30px;border-radius:9px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center}
.as-x{border:none;background:transparent;color:#6E6A63;cursor:pointer;padding:6px;border-radius:8px}
.as-tools{flex:1 0 100%;display:flex;gap:8px}
.as-tool{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:12px;padding:6px 10px;font-family:inherit;font-size:14px;font-weight:800;color:#15120F;cursor:pointer}
.as-tool:hover:not(:disabled){border-color:#15120F}
.as-tool[aria-pressed=true]{background:#15120F;color:#FBF8F2;border-color:#15120F}
.as-tool:disabled{opacity:.45;cursor:default}
.as-tool:focus-visible,.as-x:focus-visible,.as-hback:focus-visible,.as-hopen:focus-visible,.as-hdel:focus-visible,.as-hbtn:focus-visible,.as-hclear:focus-visible{outline:2px solid #FFC21A;outline-offset:2px}
.as-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px}
.as-hback{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:40px;border:none;background:transparent;color:#15120F;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;padding:6px 10px 6px 4px;margin:-8px 0 -2px -4px;border-radius:10px}
.as-hlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.as-hitem{display:flex;align-items:stretch;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:12px;overflow:hidden}
.as-hopen{flex:1;min-width:0;min-height:56px;text-align:left;border:none;background:transparent;padding:10px 13px;font-family:inherit;color:#15120F;cursor:pointer;display:flex;flex-direction:column;justify-content:center;gap:2px}
.as-hopen:hover:not(:disabled){background:#FBF8F2}
.as-hopen:disabled{opacity:.55;cursor:default}
.as-hname{font-size:14.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-hdate{font-size:12.5px;color:#6E6A63}
.as-hdel{flex:none;width:48px;border:none;border-left:1px solid rgba(21,18,15,.08);background:transparent;color:#6E6A63;cursor:pointer;display:flex;align-items:center;justify-content:center}
.as-hdel:hover:not(:disabled){color:#B42318;background:#FDF0EE}
.as-hdel:disabled{opacity:.45;cursor:default}
.as-hconf{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px}
.as-hconf p{flex:1 1 100%;margin:0;min-width:0;font-size:14px;font-weight:800;color:#15120F}
.as-hconf p span{display:block;font-weight:600;font-size:12.5px;color:#6E6A63;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.as-hbtn{flex:1;min-height:44px;min-width:84px;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:12px;padding:6px 14px;font-family:inherit;font-size:14px;font-weight:800;color:#15120F;cursor:pointer}
.as-hbtn.danger{background:#B42318;border-color:#B42318;color:#fff}
.as-hclear{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;min-height:44px;border:none;background:transparent;color:#B42318;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;padding:6px 4px;border-radius:10px}
.as-hclear:disabled{opacity:.45;cursor:default}
.as-hconf-all{border:1px solid #F1D48A;background:#FFF6E0;border-radius:12px}
.as-hnote{margin:0;font-size:13px;line-height:1.45;color:#56514a}
.as-hnote.err{color:#B42318;font-weight:700}
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
@media(max-width:640px){.as-fab{right:14px;bottom:14px}.as-tool{min-height:44px}.as-x{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}.as-hdel{width:52px}}
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
  /** Vrai pour une carte longue (fiche à plusieurs éléments) : le panneau montre le HAUT de la réponse, pas sa fin. */
  showFromTop?: (extra: unknown) => boolean;
  /** Étape 2 : l'historique des conversations (privé, 30 jours). Sans lui, pas de bouton « Historique » et rien n'est enregistré ; « Nouveau chat » existe toujours. */
  chats?: ChatStore;
}

const SLOW_MS = 4000;
const fmtNum = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const LANG_KEY = (memoryKey: string) => `bemexo:dictee-langue:${memoryKey}`;

export default function AssistantPanel({
  source, onNavigate, defaultOpen = false, suggestions = ASSISTANT_SUGGESTIONS, intro, renderExtra, footNote = 'Actions simples faites tout de suite · « Annuler » en un clic', attachments = false, open: openProp, onOpenChange,
  launcher = true, memoryKey = 'assistant', maxChars = 500, dictationLangs, slowHint, restoreOnFailure = false, isNewRequest = isNewRequestFr, showFromTop, chats,
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
  // Étape 2 : le corps du panneau est le chat, ou la liste des conversations (« Historique »). Panneau refermé : retour au chat.
  const [view, setView] = useState<'chat' | 'history'>('chat');
  useEffect(() => { if (!open) setView('chat'); }, [open]);
  const histBtnRef = useRef<HTMLButtonElement>(null);
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
  // Défilement : vers le bas (la dernière bulle) ; mais une fiche longue s'ouvre sur son HAUT (titre, jour, chantier à créer), là où se vérifie
  // ce qu'on va confirmer — pas sur son bouton. Seulement quand un message vient d'arriver (pas à chaque retouche de la carte).
  const nbMsgs = useRef(msgs.length);
  // Une conversation rouverte depuis l'historique arrive d'un coup, tout en bas : pas de défilement animé depuis le haut.
  const jump = useRef(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const dernier = msgs[msgs.length - 1];
    const nouveau = msgs.length !== nbMsgs.current;
    nbMsgs.current = msgs.length;
    const bulles = body.querySelectorAll<HTMLElement>('.as-bot');
    const haut = nouveau && !busy && dernier?.who === 'bot' && dernier.extra != null && showFromTop?.(dernier.extra) ? bulles[bulles.length - 1] : null;
    if (haut) body.scrollTo({ top: body.scrollTop + haut.getBoundingClientRect().top - body.getBoundingClientRect().top - 8, behavior: 'smooth' });
    else body.scrollTo({ top: body.scrollHeight, behavior: jump.current ? 'auto' : 'smooth' });
    jump.current = false;
  }, [msgs, busy, showFromTop, view]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim() || (file ? 'Regarde ce fichier.' : '');
    if (!question || busy) return;
    // « Envoyer » pendant la dictée : on coupe net, le texte affiché part tel quel.
    dictRef.current?.abort();
    // Étape 2 : ce que l'assistant doit savoir de la conversation (les derniers messages TEXTE, avant cette question).
    const history = historyOf(convo.msgs);
    const gen = convo.gen;
    const sent = file;
    setText(''); setFile(null);
    const mine: Msg = { who: 'me', text: question, file: sent?.name };
    setMsgs((m) => [...m, mine]);
    setBusy(true);
    // La réponse à la question en attente s'ajoute à la demande : c'est la FIN (la réponse) qui compte si le total dépasse la limite.
    // (Le bureau, à 500, garde sa règle d'avant : la demande en attente entière, coupée ensuite par le serveur.)
    const attente = pendingRef.current && maxChars > 500 ? pendingRef.current.slice(0, Math.max(0, maxChars - question.length - 2)) : pendingRef.current;
    const full = attente && !sent && !isNewRequest(question) ? `${attente}, ${question}` : question;
    // Une phrase longue peut demander plusieurs secondes : au bout de 4 s, on le dit.
    const wait = slowHint?.(full) ?? null;
    const timer = wait ? setTimeout(() => setHint(wait), SLOW_MS) : null;
    const r = await source.ask(full, sent ?? undefined, history);
    if (timer) clearTimeout(timer);
    setHint(null);
    // La conversation a été vidée pendant l'attente (le chat à l'écran vient d'être supprimé) : cette réponse n'a plus de question à côté d'elle.
    if (convo.gen !== gen) { setBusy(false); if (typeof r.remaining === 'number') setRemaining(r.remaining); return; }
    pendingRef.current = r.followUp ? full : null;
    setBusy(false);
    // L'assistant n'a pas pu répondre : la phrase revient dans le champ (300 à 1 500 caractères à redicter, sinon).
    if (restoreOnFailure && r.notice && !r.extra) setText((cur) => cur || question.slice(0, maxChars));
    // Le fichier reste DANS L'ÉCRAN, joint à la carte : il ne sera rangé
    // (documents du chantier) qu'après « Confirmer ».
    const extra = r.extra && sent && typeof r.extra === 'object' ? { ...(r.extra as object), attachment: sent } : r.extra;
    if (r.notice) mine.lost = true;
    setMsgs((m) => [...m, { who: 'bot', text: r.answer, links: r.links, notice: r.notice, extra }]);
    if (typeof r.remaining === 'number') setRemaining(r.remaining);
    // Un tour COMPLET (hors erreur / quota) s'enregistre, avec le texte que l'utilisateur a tapé — pas la demande en attente recollée à sa réponse.
    if (chats && !r.notice) enregistrer(convo, chats, gen, question, r.answer, r.links ?? []);
  }, [busy, source, file, maxChars, slowHint, restoreOnFailure, isNewRequest, chats, convo]);

  // « Nouveau chat » : page blanche. Refusé pendant une réponse en cours (elle atterrirait dans la nouvelle conversation).
  const newChat = () => {
    if (busy) return;
    resetConvo(convo);
    setHint(null);
    setView('chat');
  };
  const backToChat = () => { setView('chat'); setTimeout(() => histBtnRef.current?.focus(), 0); };
  // Une conversation choisie dans l'historique : on la rouvre en texte (liens compris) et on peut la CONTINUER, le prochain message s'y ajoute.
  const reopen = (id: string, rows: ChatMessage[]) => {
    dictRef.current?.abort();
    convo.msgs = rows.map((m) => ({ who: m.who, text: m.text, ...(m.links ? { links: m.links } : {}) }));
    convo.pending = null; convo.chatId = id; convo.gen++;
    jump.current = true;
    changed(convo);
    setView('chat');
  };
  // Un chat (ou tous) vient d'être supprimé : si c'était celui de l'écran, l'écran repart à blanc.
  const removed = (id: string | null) => { if (convo.chatId && (id === null || id === convo.chatId)) resetConvo(convo); };

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
        // Dictée coupée au plafond (salarié) : une seule fois par séance, on le dit. Le bureau coupe en silence, comme avant.
        if (maxChars > 500 && t.length > maxChars && !cut) { cut = true; setMsgs((x) => [...x, { who: 'bot', text: `Message coupé à ${fmtNum(maxChars)} caractères.`, notice: true }]); }
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
            <div className="as-tools">
              <button type="button" className="as-tool" onClick={newChat} disabled={busy} data-testid="assistant-newchat" aria-label="Nouveau chat"><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau chat</button>
              {chats && (
                <button type="button" className="as-tool" ref={histBtnRef} aria-pressed={view === 'history'} aria-label="Historique des conversations" data-testid="assistant-history"
                  onClick={() => { if (view === 'history') { setView('chat'); return; } dictRef.current?.abort(); setView('history'); }}><Clock className="h-4 w-4" aria-hidden="true" /> Historique</button>
              )}
            </div>
          </div>
          {view === 'history' && chats ? (
            <HistoryView chats={chats} busy={busy} onBack={backToChat} onOpen={reopen} onRemoved={removed} />
          ) : (<>
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
                    onClick={() => pickLang(l.code)}><span lang={l.code.slice(0, 2)}>{l.label}</span></button>
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
          </>)}
        </aside>
      )}
    </>
  );
}

/**
 * La liste des conversations enregistrées (étape 2). Monté à l'ouverture de « Historique », démonté au retour : il relit la liste à chaque fois.
 * Balisage volontairement simple (button, ul/li) : le design sera repris plus tard. Les confirmations se font ICI, dans la ligne
 * (« Supprimer ? Oui / Non ») — pas de fenêtre du navigateur.
 */
type Demande = { kind: 'un'; id: string } | { kind: 'tout' };
function HistoryView({ chats, busy, onBack, onOpen, onRemoved }: {
  chats: ChatStore; busy: boolean; onBack: () => void; onOpen: (id: string, rows: ChatMessage[]) => void; onRemoved: (id: string | null) => void;
}) {
  const [list, setList] = useState<ChatSummary[] | 'chargement' | 'erreur'>('chargement');
  const [demande, setDemande] = useState<Demande | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const backRef = useRef<HTMLButtonElement>(null);
  const req = useRef(0);
  const charge = useCallback(async () => {
    const mine = ++req.current;
    setList('chargement'); setNote(null);
    try {
      const items = await chats.list();
      if (mine === req.current) setList(items);
    } catch { if (mine === req.current) setList('erreur'); }
  }, [chats]);
  useEffect(() => { charge(); backRef.current?.focus(); }, [charge]);

  const rouvrir = async (id: string) => {
    if (busy || acting) return;
    setActing(true); setNote(null);
    try {
      const rows = await chats.load(id);
      if (!rows.length) throw new Error('vide');
      onOpen(id, rows);
    } catch {
      setActing(false);
      setNote('Cette conversation n’a pas pu être ouverte. Réessayez.');
    }
  };
  const confirmer = async () => {
    const d = demande;
    if (!d || acting) return;
    setDemande(null); setActing(true); setNote(null);
    const ok = await (d.kind === 'tout' ? chats.clear() : chats.remove(d.id)).catch(() => false);
    setActing(false);
    if (!ok) { setNote(d.kind === 'tout' ? 'Impossible de tout effacer pour le moment. Réessayez.' : 'Suppression impossible pour le moment. Réessayez.'); return; }
    setList((l) => (d.kind === 'tout' ? [] : Array.isArray(l) ? l.filter((c) => c.id !== d.id) : l));
    onRemoved(d.kind === 'tout' ? null : d.id);
  };
  const items = Array.isArray(list) ? list : [];

  return (
    <div className="as-body" data-testid="assistant-history-view">
      <button type="button" className="as-hback" ref={backRef} onClick={onBack} aria-label="Retour au chat" data-testid="assistant-history-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour</button>
      <h2 className="as-hello">Conversations</h2>
      <p className="as-sub">Gardées 30 jours · visibles de vous seul</p>
      {list === 'chargement' && <p className="as-typing" role="status" data-testid="assistant-history-loading"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</p>}
      {list === 'erreur' && (
        <div role="alert" data-testid="assistant-history-error">
          <p className="as-hnote err">Historique indisponible</p>
          <p className="as-hnote">L’assistant reste utilisable : revenez au chat.</p>
          <button type="button" className="as-hbtn" onClick={charge} data-testid="assistant-history-retry">Réessayer</button>
        </div>
      )}
      {Array.isArray(list) && items.length === 0 && (
        <div data-testid="assistant-history-empty">
          <p className="as-hnote"><b>Aucune conversation pour l’instant</b></p>
          <p className="as-hnote">Vos prochaines conversations apparaîtront ici.</p>
        </div>
      )}
      {items.length > 0 && (
        <ul className="as-hlist" aria-label="Conversations enregistrées">
          {items.map((c) => (
            <li key={c.id} className="as-hitem" data-testid="assistant-history-item">
              {demande?.kind === 'un' && demande.id === c.id ? (
                <div className="as-hconf" role="group" aria-label="Confirmer la suppression">
                  <p>Supprimer ?<span>{c.title}</span></p>
                  <button type="button" className="as-hbtn danger" onClick={confirmer} data-testid="assistant-history-confirm-yes">Oui</button>
                  <button type="button" className="as-hbtn" onClick={() => setDemande(null)} data-testid="assistant-history-confirm-no">Non</button>
                </div>
              ) : (<>
                <button type="button" className="as-hopen" onClick={() => rouvrir(c.id)} disabled={busy || acting}>
                  <span className="as-hname">{c.title}</span>
                  <span className="as-hdate">{jourRelatif(c.updatedAt, now)}</span>
                </button>
                <button type="button" className="as-hdel" onClick={() => { setNote(null); setDemande({ kind: 'un', id: c.id }); }} disabled={acting}
                  aria-label={`Supprimer la conversation « ${c.title} »`} data-testid="assistant-history-delete"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </>)}
            </li>
          ))}
        </ul>
      )}
      {busy && items.length > 0 && <p className="as-hnote">Une réponse est en cours : attendez-la pour ouvrir une autre conversation.</p>}
      {note && <p className="as-hnote err" role="alert" data-testid="assistant-history-note">{note}</p>}
      {items.length > 0 && (demande?.kind === 'tout' ? (
        <div className="as-hconf as-hconf-all" role="group" aria-label="Confirmer l’effacement de tout l’historique">
          <p>Tout effacer ?<span>Toutes vos conversations seront supprimées.</span></p>
          <button type="button" className="as-hbtn danger" onClick={confirmer} data-testid="assistant-history-confirm-yes">Oui</button>
          <button type="button" className="as-hbtn" onClick={() => setDemande(null)} data-testid="assistant-history-confirm-no">Non</button>
        </div>
      ) : (
        <button type="button" className="as-hclear" onClick={() => { setNote(null); setDemande({ kind: 'tout' }); }} disabled={acting} data-testid="assistant-history-clear"><Trash2 className="h-4 w-4" aria-hidden="true" /> Tout effacer</button>
      ))}
    </div>
  );
}
