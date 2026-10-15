// Assistant BEMEXO, étape 2 « chat avec mémoire » — l'historique des conversations, côté navigateur.
//
// PRIVÉ PAR UTILISATEUR : la lecture et la suppression passent par la RLS (`user_id = auth.uid()`), et
// l'écriture UNIQUEMENT par les fonctions `assistant_chat_append` / `assistant_chat_clear` (aucune politique
// INSERT/UPDATE pour les clients). Ni l'employeur ni le support BEMEXO ne lisent le chat d'un salarié.
// Conservation : 30 jours après la dernière activité (purge quotidienne côté base). On ne garde que le TEXTE
// des messages et leurs liens : jamais une pièce jointe, jamais une carte d'action (un chat rouvert montre du
// texte, les cartes ne reviennent pas), jamais un message d'erreur ou de quota.
//
// L'assistant doit marcher même si l'enregistrement échoue : `append` n'échoue jamais (il rend `{ id: null, why }`) et
// n'écrit RIEN dans la console — le contenu d'un chat ne doit apparaître dans aucun journal.
import { supabase } from '@/lib/supabase';
import type { AssistantHistory, AssistantLink } from '@/lib/assistant';

export interface ChatSummary { id: string; title: string; updatedAt: string }
export interface ChatMessage { who: 'me' | 'bot'; text: string; links?: AssistantLink[] }
/**
 * Ce que rend `append`. Rien n'a été enregistré quand `id` est null, et `why` dit s'il sert à quelque chose de réessayer SUR LE MÊME chat :
 *  · 'introuvable' : ce chat n'existe plus (supprimé depuis un autre onglet ou un autre appareil, « Tout effacer » fait ailleurs) ;
 *  · 'pleine'      : ce chat a atteint 200 messages ;
 *  · 'echec'       : tout le reste (panne passagère, texte refusé…) — l'écran ne change rien, le tour suivant réessaiera.
 * Dans les deux premiers cas, réécrire sur ce chat échouera à chaque tour : l'écran doit en ouvrir un autre (`chatId` null).
 */
export type AppendResult = { id: string } | { id: null; why: 'introuvable' | 'pleine' | 'echec' };
export interface ChatStore {
  /** Les 50 conversations les plus récentes (la plus récente d'abord). Rejette si la lecture échoue : l'écran dit « Historique indisponible ». */
  list(): Promise<ChatSummary[]>;
  /** Les messages d'une conversation, dans l'ordre. Rejette si la lecture échoue. */
  load(id: string): Promise<ChatMessage[]>;
  /** Ajoute un tour COMPLET (question + réponse). `chatId` null = ouvre une conversation. Rend l'identifiant de la conversation, ou la raison pour laquelle rien n'a pu être enregistré (jamais d'exception). */
  append(chatId: string | null, userText: string, botText: string, links: AssistantLink[]): Promise<AppendResult>;
  /** Supprime une conversation. Faux si la suppression a échoué. */
  remove(id: string): Promise<boolean>;
  /** Supprime TOUTES les conversations de l'utilisateur. Faux si ça a échoué. */
  clear(): Promise<boolean>;
}

/** Ce que le serveur reçoit pour comprendre « et pour Lucas aussi ? » : les 7 derniers messages TEXTE, 600 caractères chacun (le serveur nettoie de toute façon). */
export const HISTORY_MAX_MESSAGES = 7;
export const HISTORY_MAX_CHARS = 600;
/** Même plafond que la base (text de 1 à 4000 caractères) : un texte plus long ferait refuser le tour entier. */
const TEXT_MAX = 4000;
const LINKS_MAX = 10;
const LINKS_JSON_MAX = 3500; // la base compte 4000 caractères sur le texte de jsonb, un peu plus aéré que JSON.stringify
const LIST_MAX = 50;

/**
 * Les messages de la conversation en cours, tels que le serveur doit les voir (avant la question qu'on envoie).
 * Sans les notices (erreur, quota, dictée : ce n'est pas de la conversation) ; et sans une question restée sans
 * réponse (`lost` : sa réponse a été une notice) — elle n'est pas non plus enregistrée, un chat rouvert ne la montrerait pas.
 * Un message sans texte (la bulle d'une carte qui pose sa question dans la carte) n'a rien à dire au serveur.
 */
export function historyOf(msgs: { who: 'me' | 'bot'; text: string; notice?: boolean; lost?: boolean }[]): AssistantHistory {
  const texte = msgs.filter((m) => !m.notice && !m.lost).map((m) => ({ who: m.who, text: m.text.trim() })).filter((m) => m.text);
  return texte.slice(-HISTORY_MAX_MESSAGES).map((m) => ({ who: m.who, text: m.text.slice(0, HISTORY_MAX_CHARS) }));
}

/** « aujourd’hui », « hier », « il y a 3 jours » — en jours de calendrier (pas en tranches de 24 h : un chat d'hier soir est « hier » ce matin). */
export function jourRelatif(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const debut = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const jours = Math.round((debut(now) - debut(d)) / 86400000); // round : le passage à l'heure d'été fait des jours de 23 h / 25 h
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

/** Des liens lus en base : on ne garde que des {label, action} de texte (un chat ne doit jamais faire planter l'écran). */
function cleanLinks(raw: unknown): AssistantLink[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantLink[] = [];
  for (const l of raw) {
    const x = l as { label?: unknown; action?: unknown } | null;
    if (x && typeof x.label === 'string' && typeof x.action === 'string') out.push({ label: x.label, action: x.action });
  }
  return out.slice(0, LINKS_MAX);
}

/** Titre automatique = début de la première question (60 caractères, espaces réduits), sans appel IA en plus. Jamais vide. */
function titleOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'Conversation';
}

/**
 * Les vraies requêtes, sous RLS, + les deux fonctions SQL. Rien n'est écrit dans la console : le contenu d'un chat n'a rien à faire dans un journal.
 * `side` : l'historique d'un écran ne montre que les chats de SON côté (un administrateur qui a été salarié a des chats des deux côtés ;
 * la base, elle, cache déjà les chats « bureau » à qui n'est plus administrateur : migration IA 3c-0).
 */
function supabaseChatStoreFor(side: 'bureau' | 'salarie'): ChatStore {
  return {
    async list() {
      const { data, error } = await supabase.from('assistant_chats').select('id, title, side, updated_at').eq('side', side).order('updated_at', { ascending: false }).limit(LIST_MAX);
      if (error) throw new Error('historique indisponible');
      return (data ?? []).map((r: { id: string; title: string; updated_at: string }) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
    },
    async load(id) {
      const { data, error } = await supabase.from('assistant_chat_messages').select('who, text, links').eq('chat_id', id).order('id', { ascending: true });
      if (error) throw new Error('conversation illisible');
      return (data ?? []).map((r: { who: string; text: string; links: unknown }) => {
        const links = cleanLinks(r.links);
        return { who: r.who === 'me' ? 'me' : 'bot', text: r.text, ...(links.length ? { links } : {}) } as ChatMessage;
      });
    },
    async append(chatId, userText, botText, links) {
      try {
        const p_user_text = userText.trim().slice(0, TEXT_MAX);
        const p_bot_text = botText.trim().slice(0, TEXT_MAX);
        if (!p_user_text || !p_bot_text) return { id: null, why: 'echec' }; // la base exige 1 à 4000 caractères de chaque côté
        // La base refuse des liens de plus de 4000 caractères : mieux vaut un tour sans ses boutons que pas de tour.
        const clean = cleanLinks(links);
        const p_links = JSON.stringify(clean).length <= LINKS_JSON_MAX ? clean : [];
        const { data, error } = await supabase.rpc('assistant_chat_append', { p_chat_id: chatId, p_user_text, p_bot_text, p_links });
        if (!error && typeof data === 'string') return { id: data };
        // Les codes de la fonction SQL : 54000 = conversation pleine (200 messages) ; 42501 = « Conversation introuvable » (un chat inconnu ou qui
        // n'est pas le mien donne la MÊME erreur) — mais 42501 dit aussi « session invalide » / « assistant non activé » : on ne conclut « introuvable »
        // que lorsqu'on visait un chat précis, et si c'était autre chose, l'essai suivant (sur un nouveau chat) échouera pareil, sans rien casser.
        const code = (error as { code?: unknown } | null)?.code;
        if (chatId !== null && code === '54000') return { id: null, why: 'pleine' };
        if (chatId !== null && code === '42501') return { id: null, why: 'introuvable' };
        return { id: null, why: 'echec' };
      } catch { return { id: null, why: 'echec' }; }
    },
    async remove(id) {
      try {
        const { error } = await supabase.from('assistant_chats').delete().eq('id', id);
        return !error;
      } catch { return false; }
    },
    async clear() {
      try {
        const { error } = await supabase.rpc('assistant_chat_clear');
        return !error;
      } catch { return false; }
    },
  };
}
export const supabaseChatStoreBureau: ChatStore = supabaseChatStoreFor('bureau');
export const supabaseChatStoreSalarie: ChatStore = supabaseChatStoreFor('salarie');

/**
 * Historique EN MÉMOIRE : démo, préviews et tests sans base. Mêmes règles que la base (titre, 200 messages par
 * conversation, 100 conversations, la plus récente d'abord), mais rien ne survit à un rechargement de la page.
 */
export function memoryChatStore(): ChatStore {
  const chats = new Map<string, { id: string; title: string; at: number; seq: number; msgs: ChatMessage[] }>();
  let seq = 0;
  const sorted = () => Array.from(chats.values()).sort((a, b) => b.at - a.at || b.seq - a.seq);
  return {
    async list() {
      return sorted().slice(0, LIST_MAX).map((c) => ({ id: c.id, title: c.title, updatedAt: new Date(c.at).toISOString() }));
    },
    async load(id) {
      const c = chats.get(id);
      if (!c) throw new Error('conversation introuvable');
      return c.msgs.map((m) => ({ ...m, ...(m.links ? { links: m.links.map((l) => ({ ...l })) } : {}) }));
    },
    async append(chatId, userText, botText, links) {
      const u = userText.trim().slice(0, TEXT_MAX);
      const b = botText.trim().slice(0, TEXT_MAX);
      if (!u || !b) return { id: null, why: 'echec' };
      let c = chatId === null ? undefined : chats.get(chatId);
      if (chatId !== null && !c) return { id: null, why: 'introuvable' }; // une conversation qui n'est pas la nôtre (ou supprimée) : refusé, comme la base (42501)
      if (c && c.msgs.length + 2 > 200) return { id: null, why: 'pleine' };
      if (!c) {
        c = { id: `mem-${++seq}`, title: titleOf(u), at: 0, seq, msgs: [] };
        chats.set(c.id, c);
        // 100 conversations au plus : les plus anciennes partent.
        for (const old of sorted().slice(100)) chats.delete(old.id);
      }
      const l = cleanLinks(links);
      c.msgs.push({ who: 'me', text: u }, { who: 'bot', text: b, ...(l.length ? { links: l } : {}) });
      c.at = Date.now();
      c.seq = ++seq;
      return { id: c.id };
    },
    async remove(id) { chats.delete(id); return true; },
    async clear() { chats.clear(); return true; },
  };
}
