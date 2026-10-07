// Dictée vocale de l'Assistant BEMEXO (lot 7) — patron, secrétaire ET salarié.
//
// RÈGLE : l'enregistrement ne s'arrête JAMAIS tout seul. Un appui démarre, un
// appui arrête (ou « Envoyer »). Les navigateurs, eux, coupent la reconnaissance
// à la moindre pause (Safari iOS), après un silence (« no-speech ») ou au bout
// d'un moment (Chrome) : on relance alors aussitôt, sans rien perdre du texte.
//
// Chrome Android a un défaut connu en mode continu : chaque résultat « final »
// peut répéter tout ce qui précède. `mergeFinal` absorbe ces répétitions.
//
// Rien n'est envoyé ni conservé ici : le texte va dans le champ, l'utilisateur
// le corrige s'il veut, puis appuie sur Envoyer.

export interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives?: number;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void; stop(): void; abort?(): void;
}
export type SpeechCtor = new () => SpeechRec;

export function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const join = (a: string, b: string) => (!a ? b : !b ? a : `${a}${/\s$/.test(a) || /^\s/.test(b) ? '' : ' '}${b}`);

/**
 * Ajoute un morceau « final » au texte déjà dicté. Si le navigateur renvoie le
 * texte en entier (Chrome Android), on remplace au lieu de doubler.
 */
export function mergeFinal(finals: string[], chunk: string): string[] {
  const c = chunk.trim();
  if (!c) return finals;
  const last = finals[finals.length - 1];
  if (last !== undefined) {
    const a = squash(last), b = squash(c);
    if (b === a) return finals;
    if (a && b.startsWith(a)) return [...finals.slice(0, -1), c];
  }
  const all = squash(finals.join(' '));
  if (all && squash(c).startsWith(all)) return [c];
  return [...finals, c];
}

export interface DictationHandlers {
  /** Texte complet à afficher dans le champ (texte déjà là + dictée + en cours). */
  onText: (text: string) => void;
  onState: (listening: boolean) => void;
  /** Micro refusé ou indisponible : message court pour l'utilisateur. */
  onError?: (message: string) => void;
}

/**
 * Une séance de dictée. `start(base)` : `base` est le texte déjà présent dans
 * le champ (la dictée s'ajoute après). `stop()` : arrêt demandé par
 * l'utilisateur. `edit(text)` : l'utilisateur a corrigé le champ pendant qu'on
 * écoute — sa correction devient la nouvelle base.
 */
export class Dictation {
  private rec: SpeechRec | null = null;
  private want = false;
  private base = '';
  private finals: string[] = [];
  private interim = '';
  private restarts = 0;
  private lastStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private Ctor: SpeechCtor, private h: DictationHandlers) {}

  get listening() { return this.want; }

  start(base: string) {
    if (this.want) return;
    this.want = true;
    this.base = base.trim();
    this.finals = [];
    this.interim = '';
    this.restarts = 0;
    this.h.onState(true);
    this.open();
  }

  /** Arrêt voulu par l'utilisateur : on garde le dernier morceau entendu. */
  stop() {
    if (!this.want) return;
    this.want = false;
    if (this.interim.trim()) { this.finals = mergeFinal(this.finals, this.interim); this.interim = ''; }
    this.emit();
    this.close(false);
    this.h.onState(false);
  }

  /** « Envoyer » pendant l'écoute : on coupe net, plus aucun résultat n'arrive. */
  abort() {
    this.want = false;
    this.finals = []; this.interim = ''; this.base = '';
    this.close(true);
    this.h.onState(false);
  }

  edit(text: string) {
    if (!this.want) return;
    this.base = text.trim();
    this.finals = [];
    this.interim = '';
  }

  text() { return join(join(this.base, this.finals.join(' ')), this.interim.trim()).trim(); }

  private emit() { this.h.onText(this.text()); }

  private open() {
    if (!this.want) return;
    const rec = new this.Ctor();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // Résultats de CETTE séance du navigateur (elle repart de zéro à chaque relance).
    let sessionFinals: string[] = [];
    let heard = false;
    const sessionBase = [...this.finals];
    rec.onresult = (e) => {
      if (this.rec !== rec) return;
      heard = true;
      let interim = '';
      const finalsNow: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) finalsNow.push(t); else interim += t;
      }
      sessionFinals = finalsNow.reduce<string[]>((acc, t) => mergeFinal(acc, t), []);
      this.finals = sessionFinals.reduce<string[]>((acc, t) => mergeFinal(acc, t), [...sessionBase]);
      this.interim = interim;
      this.emit();
    };
    rec.onerror = (e) => {
      if (this.rec !== rec) return;
      const code = e?.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        this.want = false;
        this.close(true);
        this.h.onState(false);
        this.h.onError?.(code === 'audio-capture' ? 'Micro introuvable.' : 'Micro refusé : autorisez-le dans les réglages du navigateur.');
      }
      // « no-speech », « network », « aborted » : la fin de séance suit, on relancera.
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      // Le morceau en cours n'est pas perdu à la coupure.
      if (this.interim.trim()) { this.finals = mergeFinal(this.finals, this.interim); this.interim = ''; this.emit(); }
      if (!this.want) return;
      // Relance automatique, tout de suite. Garde-fou : si le navigateur coupe
      // en boucle sans rien entendre (micro pris ailleurs), on espace les relances.
      const quick = !heard && Date.now() - this.lastStart < 800;
      this.restarts = quick ? this.restarts + 1 : 0;
      if (this.restarts > 6) {
        this.want = false;
        this.h.onState(false);
        this.h.onError?.('La dictée s’est arrêtée. Appuyez à nouveau sur le micro.');
        return;
      }
      this.timer = setTimeout(() => this.open(), quick ? 250 * this.restarts : 0);
    };
    this.rec = rec;
    this.lastStart = Date.now();
    try { rec.start(); } catch {
      // Déjà démarré (certains Safari) : la fin de séance relancera.
    }
  }

  private close(hard: boolean) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.onresult = null; rec.onerror = null; rec.onend = null;
    try { if (hard && rec.abort) rec.abort(); else rec.stop(); } catch { /* déjà arrêtée */ }
  }
}
