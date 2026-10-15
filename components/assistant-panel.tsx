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
// Garde-fous (revue de l'étape 2) : tant qu'une carte ÉCRIT (« Je le fais… ») ou qu'une réponse est en route, « Nouveau chat », la réouverture d'une
// ancienne conversation et la suppression du chat affiché sont refusés (la carte serait démontée avant d'avoir montré son résultat) ; une fiche
// pas encore confirmée demande « Abandonner cette action ? » ; une réponse qui dépasse 60 s rend la main (lib/assistant.ts) ; un chat disparu
// ou plein est remplacé par un nouveau (jamais de tours perdus en silence) ; le clavier ne retombe plus sur le haut de la page.
// Rien ici ne parle de la formule IA (essai / payant) : à la demande d'Ergun, le
// panneau n'affiche aucun bandeau ; seul le support BEMEXO la voit (app/support).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Sparkles, X, Mic, Square, ArrowUp, Loader2, ArrowRight, Paperclip, FileText, Plus, Clock, Trash2, ArrowLeft } from 'lucide-react';
import { Dictation, speechCtor } from '@/lib/dictation';
import { ATTACH_ACCEPT, ATTACH_MAX_BYTES, attachmentError, compressAttachment } from '@/lib/attachment';
import { ASSISTANT_SUGGESTIONS, type AssistantLink, type AssistantSource } from '@/lib/assistant';
import { historyOf, jourRelatif, type ChatMessage, type ChatStore, type ChatSummary } from '@/lib/assistant-chats';
import { isNewRequest as isNewRequestFr } from '@/supabase/functions/_shared/fr-langue';
import { isNarrow, messageOuverture, openLink } from '@/lib/openers';

export interface ExtraControl {
  /** Change le texte de la bulle (null = l'efface), la question en attente reste ouverte. */
  text: (text: string | null) => void;
  /** Action finie : texte de la bulle (facultatif) et fin de la question en attente. */
  settle: (text?: string | null) => void;
  /**
   * La carte ÉCRIT en ce moment (« Je le fais… », ou « Confirmer » cliqué) : `working(true)` au départ, `working(false)` à la fin — quoi qu'il arrive,
   * même si la carte a été démontée entre-temps (le panneau fermé, l'historique ouvert). Tant que `working`, le panneau refuse « Nouveau chat »,
   * la réouverture d'une ancienne conversation et la suppression du chat affiché : sinon la carte disparaît, l'écriture part quand même et
   * son résultat (« C'est fait », Annuler) n'est jamais montré.
   */
  working: (on: boolean) => void;
  /**
   * La carte attend un « Confirmer » (fiche à vérifier ou à remplir) : `waiting(true)` ; `waiting(false)` dès qu'elle est confirmée, abandonnée ou
   * faite. Vider l'écran demande alors « Abandonner cette action ? » au lieu de la faire disparaître sans un mot. Reste vrai si la carte est
   * démontée (historique ouvert) : la fiche existe toujours dans la conversation.
   */
  waiting: (on: boolean) => void;
}
/**
 * `lost` (une question) : sa réponse a été une notice (erreur, quota) — elle n'est ni envoyée comme contexte ni enregistrée.
 * `note` (avec `notice`) : une ligne discrète de l'écran lui-même (« la suite est enregistrée dans un nouveau chat »), pas une bulle de l'assistant.
 */
type Msg = { who: 'me' | 'bot'; text: string; links?: AssistantLink[]; notice?: boolean; extra?: unknown; file?: string; lost?: boolean; note?: boolean };

// Lot 7 : une conversation par écran (bureau, salarié…), gardée en mémoire.
// Étape 2 : `chatId` = la conversation enregistrée où vont les prochains tours (null = pas encore enregistrée) ;
// `gen` change à chaque fois que la conversation est vidée ou rouverte (une réponse en vol d'AVANT ne doit pas atterrir dans la nouvelle) ;
// `sauve` met les enregistrements en file : deux tours rapprochés ne doivent pas ouvrir deux conversations.
// `working` / `waiting` : les cartes qui écrivent en ce moment / qui attendent un « Confirmer » (voir ExtraControl), repérées par l'objet `extra` de leur réponse.
interface Convo {
  msgs: Msg[]; busy: boolean; pending: string | null; open: boolean; remaining: number | null; chatId: string | null; gen: number; sauve: Promise<void>;
  working: Set<unknown>; waiting: Set<unknown>; listeners: Set<() => void>;
}
const CONVOS = new Map<string, Convo>();
function convoOf(key: string): Convo {
  let c = CONVOS.get(key);
  if (!c) { c = { msgs: [], busy: false, pending: null, open: false, remaining: null, chatId: null, gen: 0, sauve: Promise.resolve(), working: new Set(), waiting: new Set(), listeners: new Set() }; CONVOS.set(key, c); }
  return c;
}
function changed(c: Convo) { c.listeners.forEach((f) => f()); }
/** Une carte écrit (ou n'écrit plus) / attend (ou n'attend plus) : le panneau se redessine pour griser, ou dégriser, « Nouveau chat ». */
function marquer(c: Convo, quoi: 'working' | 'waiting', cle: unknown, on: boolean) {
  const s = c[quoi];
  if (s.has(cle) === on) return;
  if (on) s.add(cle); else s.delete(cle);
  changed(c);
}
/** Vrai tant qu'une réponse est en route OU qu'une carte écrit : on ne vide pas, ne remplace pas la conversation à l'écran. */
const occupee = (c: Convo) => c.busy || c.working.size > 0;
/**
 * « Nouveau chat » (ou la conversation à l'écran vient d'être supprimée) : page blanche, plus de question en attente, plus de chat courant.
 * `busy` repart à faux : la réponse encore en route (si la conversation est supprimée pendant qu'elle arrive) sera jetée par la garde `gen`, et
 * ne doit pas laisser « Je regarde… » ni Envoyer grisés jusqu'à son arrivée — qui peut ne jamais venir.
 */
function resetConvo(c: Convo) { c.msgs = []; c.pending = null; c.chatId = null; c.busy = false; c.working.clear(); c.waiting.clear(); c.gen++; changed(c); }
/** Une ligne discrète de l'écran (pas de l'assistant), jamais envoyée comme contexte ni enregistrée. */
function noter(c: Convo, gen: number, text: string) {
  if (c.gen !== gen) return;
  c.msgs = [...c.msgs, { who: 'bot', text, notice: true, note: true }];
  changed(c);
}
/**
 * Enregistre un tour COMPLET (jamais une notice). Les erreurs sont avalées SANS rien écrire dans la console : l'assistant doit marcher
 * même si l'enregistrement échoue, et le contenu d'un chat n'a rien à faire dans un journal.
 * Si le chat courant n'existe plus (supprimé depuis un autre onglet ou appareil) ou est plein (200 messages), réécrire dessus échouerait à
 * chaque tour sans que personne le sache : le tour est alors enregistré dans un NOUVEAU chat, et une ligne discrète le dit, une seule fois.
 */
function enregistrer(c: Convo, chats: ChatStore, gen: number, question: string, answer: string, links: AssistantLink[]) {
  c.sauve = c.sauve.then(async () => {
    try {
      if (c.gen !== gen) return; // la conversation a été vidée ou supprimée entre-temps : ce tour n'a plus de chat où aller
      const cible = c.chatId;
      const r = await chats.append(cible, question, answer, links);
      if (c.gen !== gen) return;
      if (r.id !== null) { c.chatId = r.id; return; }
      if (cible === null || r.why === 'echec') return; // panne passagère (ou rien à rattraper) : le tour suivant réessaiera
      c.chatId = null;
      const r2 = await chats.append(null, question, answer, links);
      if (c.gen !== gen) return;
      if (r2.id !== null) {
        c.chatId = r2.id;
        noter(c, gen, r.why === 'pleine'
          ? 'Cette conversation est pleine (200 messages) : la suite est enregistrée dans un nouveau chat.'
          : 'Cette conversation n’est plus dans l’historique : la suite est enregistrée dans un nouveau chat.');
      }
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
.as-tool:focus-visible,.as-x:focus-visible,.as-hconf .as-hbtn:focus-visible,.as-warn .as-hbtn:focus-visible,.as-hback:focus-visible,.as-hopen:focus-visible,.as-hdel:focus-visible,.as-hbtn:focus-visible,.as-hclear:focus-visible{outline:2px solid #FFC21A;outline-offset:2px}
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
.as-warn{flex:1 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid #F1D48A;background:#FFF6E0;border-radius:12px}
.as-warn p{flex:1 1 100%;margin:0;font-size:14px;font-weight:800;color:#15120F}
.as-warn p span{display:block;font-weight:600;font-size:12.5px;color:#56514a}
.as-sysnote{align-self:center;max-width:92%;margin:0;text-align:center;font-size:12.5px;line-height:1.4;color:#6E6A63}
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

  /** Ouvre un lien `ouvrir:…` ; si rien ne s'ouvre, une bulle le dit (occupé, fonction non activée, écran trop petit, écran inconnu de cette page). */
  const ouvrirLien = (action: string) => {
    const msg = messageOuverture(openLink(action));
    if (msg) setMsgs((m) => [...m, { who: 'bot', text: msg, notice: true }]);
    else if (isNarrow()) setOpen(false);
  };
  const ouvrirRef = useRef(ouvrirLien);
  ouvrirRef.current = ouvrirLien;

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
    // (Si la conversation est vidée entre-temps, l'indice de CETTE demande n'a plus rien à faire à l'écran.)
    const timer = wait ? setTimeout(() => { if (convo.gen === gen) setHint(wait); }, SLOW_MS) : null;
    const r = await source.ask(full, sent ?? undefined, history);
    if (timer) clearTimeout(timer);
    // La conversation a été vidée pendant l'attente (le chat à l'écran vient d'être supprimé) : cette réponse n'a plus de question à côté d'elle.
    // `busy` et l'indice appartiennent déjà à autre chose (resetConvo les a remis à zéro, une nouvelle demande a pu partir depuis) : on n'y touche pas.
    // Le quota, lui, a bien été consommé : le compteur se met à jour.
    if (convo.gen !== gen) { if (typeof r.remaining === 'number') setRemaining(r.remaining); return; }
    setHint(null);
    pendingRef.current = r.followUp ? full : null;
    setBusy(false);
    // L'assistant n'a pas pu répondre : la phrase revient dans le champ (300 à 1 500 caractères à redicter, sinon).
    if (restoreOnFailure && r.notice && !r.extra) setText((cur) => cur || question.slice(0, maxChars));
    // Le fichier reste DANS L'ÉCRAN, joint à la carte : il ne sera rangé
    // (documents du chantier) qu'après « Confirmer ».
    const extra = r.extra && sent && typeof r.extra === 'object' ? { ...(r.extra as object), attachment: sent } : r.extra;
    if (r.notice) mine.lost = true;
    setMsgs((m) => [...m, { who: 'bot', text: r.answer, links: r.links, notice: r.notice, extra }]);
    // Étape 3 : le SERVEUR a dit « ouvrir sans toucher » (verbe d'ouverture, niveau 1) : sur 1024 px et plus, la fenêtre s'ouvre seule et le panneau reste visible ; sous 1024 px, un bouton.
    if (r.auto && !isNarrow() && r.links && r.links[0] && r.links[0].action.startsWith('ouvrir:')) ouvrirRef.current(r.links[0].action);
    if (typeof r.remaining === 'number') setRemaining(r.remaining);
    // Un tour COMPLET (hors erreur / quota) s'enregistre, avec le texte que l'utilisateur a tapé — pas la demande en attente recollée à sa réponse.
    if (chats && !r.notice) enregistrer(convo, chats, gen, question, r.answer, r.links ?? []);
  }, [busy, source, file, maxChars, slowHint, restoreOnFailure, isNewRequest, chats, convo]);

  // Le champ de saisie reçoit le focus quand on revient dans le chat sans l'avoir cliqué (conversation rouverte) : le clavier repart de là.
  // (Le champ n'existe qu'une fois la vue « chat » dessinée : le focus est donné par un effet, pas par un minuteur qui pourrait passer avant.)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusInput = useRef(false);
  useEffect(() => {
    if (view === 'chat' && focusInput.current) { focusInput.current = false; inputRef.current?.focus({ preventScroll: true }); }
  }, [view, msgs]);
  // Une fiche pas encore confirmée est à l'écran : « Nouveau chat » demande d'abord « Abandonner cette action ? » (jamais de fiche qui disparaît sans un mot).
  const [abandon, setAbandon] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const newChatRef = useRef<HTMLButtonElement>(null);
  const attente = convo.waiting.size > 0;
  const occupe = occupee(convo);
  const demanderAbandon = abandon && view === 'chat' && attente && !occupe;
  useEffect(() => { setAbandon(false); }, [view, open]);
  useEffect(() => { if (demanderAbandon) keepRef.current?.focus(); }, [demanderAbandon]);
  const vider = () => {
    setAbandon(false);
    resetConvo(convo);
    setHint(null);
    setView('chat');
  };
  // « Nouveau chat » : page blanche. Refusé tant qu'une réponse est en route (elle atterrirait dans la nouvelle conversation) ou qu'une carte écrit
  // (elle serait démontée avant d'avoir montré son résultat). On relit l'état de la conversation, pas celui du dernier dessin.
  const newChat = () => {
    if (occupee(convo)) return;
    if (convo.waiting.size > 0) { setAbandon(true); return; }
    vider();
  };
  const keepAction = () => { setAbandon(false); setTimeout(() => newChatRef.current?.focus(), 0); };
  const backToChat = () => { setView('chat'); setTimeout(() => histBtnRef.current?.focus(), 0); };
  // Une conversation choisie dans l'historique : on la rouvre en texte (liens compris) et on peut la CONTINUER, le prochain message s'y ajoute.
  // Rend 'occupe' si une réponse arrive ou si une carte écrit (la lecture de la conversation peut avoir pris du temps : on relit l'état ICI), et
  // 'confirmer' si une fiche attend un « Confirmer » et que l'abandon n'a pas encore été accepté.
  const reopen = (id: string, rows: ChatMessage[], abandonOk = false): 'ok' | 'occupe' | 'confirmer' => {
    if (occupee(convo)) return 'occupe';
    if (convo.waiting.size > 0 && !abandonOk) return 'confirmer';
    dictRef.current?.abort();
    convo.msgs = rows.map((m) => ({ who: m.who, text: m.text, ...(m.links ? { links: m.links } : {}) }));
    convo.pending = null; convo.chatId = id; convo.working.clear(); convo.waiting.clear(); convo.gen++;
    jump.current = true;
    changed(convo);
    setHint(null);
    focusInput.current = true;
    setView('chat');
    return 'ok';
  };
  // Un chat (ou tous) vient d'être supprimé : si c'était celui de l'écran, l'écran repart à blanc — sauf si une carte écrit encore (elle montrera
  // son résultat) : l'écran reste, mais n'est plus un chat enregistré, le prochain tour en ouvrira un autre.
  const removed = (id: string | null) => {
    if (!convo.chatId || (id !== null && id !== convo.chatId)) return;
    if (convo.working.size > 0) { convo.chatId = null; changed(convo); return; }
    resetConvo(convo);
    setHint(null);
  };

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
    // Étape 3 (3b-1) : « ouvrir:<écran>?… » — la page l'ouvre (lib/openers.ts) ; sous 1024 px le panneau se replie pour laisser voir la fenêtre. Rien d'ouvert : on le dit.
    if (action.startsWith('ouvrir:')) { ouvrirLien(action); return; }
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
              <button type="button" className="as-tool" ref={newChatRef} onClick={newChat} disabled={occupe} data-testid="assistant-newchat" aria-label="Nouveau chat"
                title={busy ? 'Une réponse est en cours' : occupe ? 'Une action est en cours' : undefined}><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau chat</button>
              {chats && (
                <button type="button" className="as-tool" ref={histBtnRef} aria-pressed={view === 'history'} aria-label="Historique des conversations" data-testid="assistant-history"
                  onClick={() => { if (view === 'history') { setView('chat'); return; } dictRef.current?.abort(); setView('history'); }}><Clock className="h-4 w-4" aria-hidden="true" /> Historique</button>
              )}
            </div>
            {demanderAbandon && (
              <div className="as-warn" role="group" aria-label="Abandonner l’action en attente" data-testid="assistant-abandon"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); keepAction(); } }}>
                <p>Abandonner cette action ?<span>Elle n’a pas été confirmée : rien n’a été fait.</span></p>
                <button type="button" className="as-hbtn danger" onClick={vider} data-testid="assistant-abandon-yes">Abandonner</button>
                <button type="button" className="as-hbtn" ref={keepRef} onClick={keepAction} data-testid="assistant-abandon-no">Garder</button>
              </div>
            )}
          </div>
          {view === 'history' && chats ? (
            <HistoryView chats={chats} busy={busy} verrou={convo.working.size > 0} attente={attente} courant={convo.chatId} onBack={backToChat} onOpen={reopen} onRemoved={removed} />
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
              : m.note ? <p key={i} className="as-sysnote" role="status" data-testid="assistant-note">{m.text}</p>
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
                    working: (on) => marquer(convo, 'working', m.extra, on),
                    waiting: (on) => marquer(convo, 'waiting', m.extra, on),
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
                ref={inputRef} className={maxChars > 500 ? 'long' : undefined} lang={langs ? lang.slice(0, 2) : undefined}
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
 * Clavier et lecteur d'écran : une action qui démonte le bouton focalisé ne doit jamais envoyer le focus sur le haut de la page. La confirmation
 * reçoit le focus sur le choix SÛR (« Non » / « Garder ») ; « Non » rend le focus au bouton d'origine ; après « Oui », le focus va à la ligne
 * suivante (sinon la précédente, sinon « Retour ») et une zone `role="status"` annonce « Conversation supprimée » ; une conversation rouverte
 * donne le focus au champ de saisie (c'est le panneau qui s'en charge).
 */
type Demande = { kind: 'un'; id: string } | { kind: 'tout' } | { kind: 'ouvrir'; id: string };
function HistoryView({ chats, busy, verrou, attente, courant, onBack, onOpen, onRemoved }: {
  chats: ChatStore;
  /** Une réponse est en route. */
  busy: boolean;
  /** Une carte écrit : le chat affiché ne se supprime pas (son résultat n'aurait plus d'écran où s'afficher), et aucune conversation ne s'ouvre à sa place. */
  verrou: boolean;
  /** Une fiche attend un « Confirmer » : la remplacer, ou supprimer son chat, demande d'abord de l'abandonner. */
  attente: boolean;
  /** Le chat de l'écran (null = pas encore enregistré). */
  courant: string | null;
  onBack: () => void;
  onOpen: (id: string, rows: ChatMessage[], abandonOk?: boolean) => 'ok' | 'occupe' | 'confirmer';
  onRemoved: (id: string | null) => void;
}) {
  const [list, setList] = useState<ChatSummary[] | 'chargement' | 'erreur'>('chargement');
  const [demande, setDemande] = useState<Demande | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Annoncé aux lecteurs d'écran (zone toujours présente, texte ajouté après coup), invisible à l'écran : on voit la ligne partir.
  const [statut, setStatut] = useState('');
  const [acting, setActing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const backRef = useRef<HTMLButtonElement>(null);
  const nonRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const trashRefs = useRef(new Map<string, HTMLButtonElement>());
  const openRefs = useRef(new Map<string, HTMLButtonElement>());
  const req = useRef(0);
  // Faux dès que la vue est quittée (Retour, Historique, panneau fermé) : une lecture qui se termine après ne doit plus toucher à l'écran.
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  // Le focus est donné quand la vue a RÉELLEMENT changé. Dans un clic, React dessine avant le minuteur (focusSoon). Après un `await`, les mises à jour
  // d'état ne sont dessinées que plus tard, et un bouton encore « disabled » (action en cours) ne reçoit pas le focus : ces mises à jour sont donc
  // faites dans un `flushSync`, puis `focusAfter` donne le focus.
  const focusSoon = (f: () => void) => { setTimeout(() => { if (vivant.current) f(); }, 0); };
  const focusAfter = (cible: () => HTMLElement | null | undefined) => { if (vivant.current) cible()?.focus(); };
  const charge = useCallback(async () => {
    const mine = ++req.current;
    setList('chargement'); setNote(null);
    try {
      const items = await chats.list();
      if (mine === req.current) setList(items);
    } catch { if (mine === req.current) setList('erreur'); }
  }, [chats]);
  useEffect(() => { charge(); backRef.current?.focus(); }, [charge]);
  // Une confirmation s'ouvre : le focus va sur le choix sûr.
  useEffect(() => { if (demande) nonRef.current?.focus(); }, [demande]);

  const items = Array.isArray(list) ? list : [];
  const retour = (d: Demande) => (d.kind === 'tout' ? clearRef.current : d.kind === 'un' ? trashRefs.current.get(d.id) : openRefs.current.get(d.id));

  const rouvrir = async (id: string, abandonOk = false) => {
    if (busy || verrou || acting) return;
    // Une fiche attend son « Confirmer » : on demande d'abord, dans la ligne, avant de remplacer l'écran.
    if (attente && !abandonOk) { setNote(null); setDemande({ kind: 'ouvrir', id }); return; }
    setActing(true); setNote(null);
    try {
      const rows = await chats.load(id);
      // L'utilisateur est revenu au chat (et a peut-être posé une question) pendant la lecture : cette conversation ne doit PAS remplacer l'écran.
      if (!vivant.current) return;
      if (!rows.length) throw new Error('vide');
      const r = onOpen(id, rows, abandonOk);
      if (r === 'ok') return; // la vue est remplacée par le chat
      flushSync(() => {
        setActing(false);
        if (r === 'confirmer') setDemande({ kind: 'ouvrir', id });
        else setNote('Une réponse ou une action est en cours : attendez qu’elle soit finie, puis réessayez.');
      });
      if (r !== 'confirmer') focusAfter(() => openRefs.current.get(id));
    } catch {
      if (!vivant.current) return;
      flushSync(() => { setActing(false); setNote('Cette conversation n’a pas pu être ouverte. Réessayez.'); });
      focusAfter(() => openRefs.current.get(id));
    }
  };
  const annuler = () => {
    const d = demande;
    setDemande(null);
    if (d) focusSoon(() => retour(d)?.focus());
  };
  const confirmer = async () => {
    const d = demande;
    if (!d || d.kind === 'ouvrir' || acting) return;
    // La ligne qui prendra la place de celle qui part : la suivante, sinon la précédente (sinon « Retour »).
    const rang = d.kind === 'un' ? items.findIndex((c) => c.id === d.id) : -1;
    const voisin = d.kind === 'un' && rang >= 0 ? (items[rang + 1] ?? items[rang - 1])?.id ?? null : null;
    setDemande(null); setActing(true); setNote(null); setStatut('');
    const ok = await (d.kind === 'tout' ? chats.clear() : chats.remove(d.id)).catch(() => false);
    if (!ok) {
      flushSync(() => {
        setActing(false);
        setNote(d.kind === 'tout' ? 'Impossible de tout effacer pour le moment. Réessayez.' : 'Suppression impossible pour le moment. Réessayez.');
      });
      focusAfter(() => retour(d));
      return;
    }
    flushSync(() => {
      setList((l) => (d.kind === 'tout' ? [] : Array.isArray(l) ? l.filter((c) => c.id !== d.id) : l));
      setActing(false);
      setStatut(d.kind === 'tout' ? 'Toutes les conversations ont été supprimées.' : 'Conversation supprimée.');
    });
    // Même si la vue a été quittée entre-temps, la suppression a eu lieu : l'écran du chat doit le savoir.
    onRemoved(d.kind === 'tout' ? null : d.id);
    focusAfter(() => (voisin ? openRefs.current.get(voisin) : backRef.current));
  };
  // Le chat de l'écran ne se supprime pas pendant qu'une carte y écrit ; « Tout effacer » non plus tant qu'il en fait partie.
  const verrouille = (id: string) => verrou && id === courant;

  return (
    <div className="as-body" data-testid="assistant-history-view">
      <button type="button" className="as-hback" ref={backRef} onClick={onBack} aria-label="Retour au chat" data-testid="assistant-history-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour</button>
      <h2 className="as-hello">Conversations</h2>
      <p className="as-sub">Gardées 30 jours · visibles de vous seul</p>
      <p className="as-sr" role="status" data-testid="assistant-history-status">{statut}</p>
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
              {demande && demande.kind !== 'tout' && demande.id === c.id ? (
                <div className="as-hconf" role="group" aria-label={demande.kind === 'un' ? 'Confirmer la suppression' : 'Confirmer l’abandon de l’action en attente'}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); annuler(); } }}>
                  {demande.kind === 'un'
                    ? <p>Supprimer ?<span>{c.title}</span>{attente && c.id === courant && <span>L’action en attente à l’écran sera abandonnée.</span>}</p>
                    : <p>Abandonner l’action en attente ?<span>Elle n’a pas été confirmée : rien n’a été fait.</span></p>}
                  <button type="button" className="as-hbtn danger" data-testid="assistant-history-confirm-yes"
                    onClick={demande.kind === 'un' ? confirmer : () => { setDemande(null); rouvrir(c.id, true); }}>{demande.kind === 'un' ? 'Oui' : 'Abandonner'}</button>
                  <button type="button" className="as-hbtn" ref={nonRef} onClick={annuler} data-testid="assistant-history-confirm-no">{demande.kind === 'un' ? 'Non' : 'Garder'}</button>
                </div>
              ) : (<>
                <button type="button" className="as-hopen" onClick={() => rouvrir(c.id)} disabled={busy || verrou || acting}
                  ref={(el) => { if (el) openRefs.current.set(c.id, el); else openRefs.current.delete(c.id); }}>
                  <span className="as-hname">{c.title}</span>
                  <span className="as-hdate">{jourRelatif(c.updatedAt, now)}</span>
                </button>
                <button type="button" className="as-hdel" onClick={() => { setNote(null); setDemande({ kind: 'un', id: c.id }); }} disabled={acting || verrouille(c.id)}
                  ref={(el) => { if (el) trashRefs.current.set(c.id, el); else trashRefs.current.delete(c.id); }}
                  aria-label={`Supprimer la conversation « ${c.title} »`} data-testid="assistant-history-delete"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </>)}
            </li>
          ))}
        </ul>
      )}
      {busy && items.length > 0 && <p className="as-hnote">Une réponse est en cours : attendez-la pour ouvrir une autre conversation.</p>}
      {!busy && verrou && items.length > 0 && <p className="as-hnote" data-testid="assistant-history-verrou">Une action est en cours : attendez qu’elle soit finie pour ouvrir une autre conversation ou supprimer celle de l’écran.</p>}
      {note && <p className="as-hnote err" role="alert" data-testid="assistant-history-note">{note}</p>}
      {items.length > 0 && (demande?.kind === 'tout' ? (
        <div className="as-hconf as-hconf-all" role="group" aria-label="Confirmer l’effacement de tout l’historique"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); annuler(); } }}>
          <p>Tout effacer ?<span>Toutes vos conversations seront supprimées.</span>{attente && courant !== null && <span>L’action en attente à l’écran sera abandonnée.</span>}</p>
          <button type="button" className="as-hbtn danger" onClick={confirmer} data-testid="assistant-history-confirm-yes">Oui</button>
          <button type="button" className="as-hbtn" ref={nonRef} onClick={annuler} data-testid="assistant-history-confirm-no">Non</button>
        </div>
      ) : (
        <button type="button" className="as-hclear" ref={clearRef} onClick={() => { setNote(null); setDemande({ kind: 'tout' }); }} disabled={acting || (verrou && courant !== null)} data-testid="assistant-history-clear"><Trash2 className="h-4 w-4" aria-hidden="true" /> Tout effacer</button>
      ))}
    </div>
  );
}
