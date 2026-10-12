// Salarié — « profil » d'une saisie : courte et simple (lecteur local autorisé) ou
// LONGUE (phrase libre, turc, plusieurs actions : jamais le lecteur à expressions
// régulières, IA en réflexion « medium »). Fonction pure, sans réseau ni base,
// identique côté navigateur et serveur.
//
// RÈGLE DE COMPATIBILITÉ NAVIGATEUR (Safari/iOS < 16.4) : AUCUNE assertion
// arrière (« lookbehind ») dans ce fichier ni dans aucun fichier importé par le
// navigateur. Une SyntaxError dans un littéral casse le chunk entier. À la place :
// préfixe capturant `(^|[^\p{L}\d])` (le drapeau `u` et `\p{L}` sont acceptés dès
// Safari 11.1) et index corrigé de `m[1].length`. Un test statique le vérifie.

/** Longueur maximale d'un message du SALARIÉ (le bureau reste à 500 : MAX_QUESTION_CHARS). */
export const WORKER_TEXT_MAX = 1500;
/** Au-delà : message « long ». Les 80 phrases de mesure font 91 caractères au plus. */
export const LONG_MIN_CHARS = 120;

// Minuscules, sans accents, « ı » turc ramené à « i », apostrophes droites.
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[’']/g, "'");

// ── Turc ────────────────────────────────────────────────────────────────────
const TR_LETTRES = /[ğĞşŞıİ]/; // le français n'en a aucune (ç ö ü existent : pas comptées)
const TR_MOTS = new Set([
  'bugun', 'dun', 'yarin', 'evvelsi', 'haftaya', 'hafta', 'gelecek', 'onumuzdeki', 'gecen', 'saat', 'kadar', 'mola', 'molasi', 'verdim',
  'calistim', 'calisiyorum', 'calisacagim', 'basladim', 'bitirdim', 'biraktim', 'yaptim', 'yaptik', 'istiyorum', 'sonra', 'ardindan',
  'sonrasinda', 'icin', 'yeni', 'santiye', 'santiyede', 'santiyesinde', 'musteri', 'adres', 'posta', 'kodu', 'izin', 'rapor', 'hasta',
  'pazartesi', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar', 'sabah', 'ogle', 'ogleden', 'aksam', 'lutfen', 'merhaba', 'tesekkurler',
  'gonder', 'gonderin', 'kaydet', 'ekle', 'isaretle', 'rezerv', 'catlak', 'sepet', 'sepeti', 'yemek', 'buro', 'buroya',
]);
const TR_SUFFIXE_HEURE = /(?:^|[^a-z0-9])\d{1,2}(?:[:.]\d{2})?\s*'?\s*(?:den|dan|ten|tan)(?![a-z])/; // « 8'den », « 13'ten », « 7:30'dan »
const FR_MOTS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'je', 'j', 'chez', 'sur', 'pour', 'avec', 'dans', 'mon', 'ma', 'mes', 'est', 'ai', 'suis', 'ce', 'cet', 'cette', 'qui', 'que', 'puis', 'ensuite', 'aujourd', 'hier', 'demain', 'chantier', 'pause']);

/**
 * Turc ? Des points (lettre propre au turc : 1, chaque mot turc distinct : 1, suffixe
 * d'heure « 8'den » : 1) : au moins 2, et plus que les mots français. Un nom turc seul
 * dans une phrase française (« chez Yılmaz ») fait 1 point : reste français.
 */
export function detecteTurc(text: string): boolean {
  const f = fold(text);
  const tokens = f.match(/[a-z]+/g) ?? [];
  const points = (TR_LETTRES.test(text) ? 1 : 0) + new Set(tokens.filter((w) => TR_MOTS.has(w))).size + (TR_SUFFIXE_HEURE.test(f) ? 1 : 0);
  return points >= 2 && points > new Set(tokens.filter((w) => FR_MOTS.has(w))).size;
}

// ── Plages horaires STRICTES lues dans la phrase (français + turc) ───────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const MOTS_HEURE: Record<string, number> = {
  une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20,
};
const MOT_H = '(?:dix-sept|dix-huit|dix-neuf|une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt)';
/** « 8h », « 8h30 », « 8 heures », « 8:30 », « 08.00 », « huit heures », « midi », « minuit » ; un entier nu (« 8 ») n'est accepté que dans « de 8 à 12 ». */
function hhmm(raw: string): string | null {
  const t = fold(raw).replace(/\s+/g, '');
  if (t === 'midi') return '12:00';
  if (t === 'minuit') return '00:00';
  const mot = new RegExp(`^(${MOT_H})(?:h|heures?)$`).exec(t);
  if (mot) return `${pad2(MOTS_HEURE[mot[1]])}:00`;
  const m = /^(\d{1,2})(?:h|:|\.|heures?)?(\d{0,2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]); const mi = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return h > 24 || mi > 59 || (h === 24 && mi > 0) ? null : `${pad2(h === 24 ? 0 : h)}:${pad2(mi)}`;
}
// Un instant avec marque d'heure : h, :, ., « heures », « huit heures », midi, minuit.
const T_MARQUE = String.raw`(?:midi|minuit|${MOT_H}\s*heures?(?:\s*\d{2})?|\d{1,2}\s*(?:h|:|heures?)\s*\d{0,2}|\d{1,2}\.\d{2})`;
const SEP_FR = String.raw`(?:-|–|—|/|à|a|au|jusqu'?[aà]|et)`;
const PREFIXE = String.raw`(^|[^\p{L}\d])`; // remplace l'assertion arrière
const RE_FR = new RegExp(`${PREFIXE}(?:de\\s+|entre\\s+|du\\s+)?(${T_MARQUE})\\s*${SEP_FR}\\s*(${T_MARQUE})(?![\\p{L}\\d])`, 'giu');
// « de 8 à midi », « de 8 à 12 », « entre 8 et 12 » : entier nu seulement après « de » / « entre » (jamais « 2 et 3 » seul)
const BARE = String.raw`(\d{1,2})`;
const RE_NU = new RegExp(`${PREFIXE}(?:de|entre)\\s+${BARE}\\s*(?:à|a|au|et)\\s*(${T_MARQUE}|${BARE})(?![\\p{L}\\d])(?!\\s*(?:€|%|m2?\\b|jours?\\b|personnes?\\b|salaries?\\b|ouvriers?\\b|fois\\b|euros?\\b|metres?\\b))`, 'giu');
const RE_NU2 = new RegExp(`${PREFIXE}(?:de|entre)\\s+(${T_MARQUE})\\s*(?:à|a|au|et)\\s+${BARE}(?![\\p{L}\\d:.])(?!\\s*(?:h\\b|€|%|m2?\\b|jours?\\b|personnes?\\b|salaries?\\b|ouvriers?\\b|fois\\b|euros?\\b|metres?\\b))`, 'giu');
const NUM = String.raw`(\d{1,2})(?:[:.](\d{2}))?`;
// turc : « 8'den 12'ye (kadar) », « 7:30'dan 12'ye », « 08.00'dan 12.00'ye », « 8 ile 12 arası »
const RE_TR = new RegExp(`${PREFIXE}${NUM}\\s*'?\\s*(?:den|dan|ten|tan)\\s+${NUM}\\s*'?\\s*(?:ye|ya|e|a)(?:\\s+kadar)?(?![\\p{L}\\d])`, 'giu');
const RE_TR2 = new RegExp(`${PREFIXE}${NUM}\\s*(?:ile|-)\\s*${NUM}\\s*arasi(?![\\p{L}\\d])`, 'giu');
const PAUSE_MOT = String.raw`(?:pause|coupure|dejeuner|repas|mola|ara)`;
const PAUSE_AVANT = new RegExp(`${PAUSE_MOT}\\s*(?:de\\s+|d')?\\s*$`);
const PAUSE_APRES = new RegExp(`^\\s+(?:de\\s+|d')?(?:pause|coupure|dejeuner|mola)(?![\\p{L}\\d])(?!\\s*(?:de\\s+|d')?\\d)`, 'u');

export interface PlageTexte { start: string; end: string; at: number }
/**
 * Plages lues dans la phrase, dans l'ordre. Une plage précédée de « pause/coupure/déjeuner/mola »
 * est exclue ; une plage de 2 h au plus SUIVIE du mot « pause » (« de 12h à 13h pause ») aussi
 * (un « 8h-12h pause 1h 13h-17h » garde sa plage : le mot « pause » y est suivi d'une durée).
 */
export function plagesDuTexte(text: string): PlageTexte[] {
  const f = fold(text);
  const out: PlageTexte[] = [];
  const ajoute = (m: RegExpMatchArray, a: string | null, b: string | null) => {
    if (!a || !b) return;
    const at = (m.index ?? 0) + m[1].length;
    const fin = (m.index ?? 0) + m[0].length;
    const [ha, ma] = a.split(':').map(Number), [hb, mb] = b.split(':').map(Number);
    let d = hb * 60 + mb - (ha * 60 + ma); if (d <= 0) d += 1440;
    if (PAUSE_AVANT.test(f.slice(Math.max(0, at - 14), at))) return;
    if (d <= 120 && PAUSE_APRES.test(f.slice(fin, fin + 24))) return;
    out.push({ start: a, end: b, at });
  };
  for (const m of Array.from(f.matchAll(RE_FR))) ajoute(m, hhmm(m[2]), hhmm(m[3]));
  for (const m of Array.from(f.matchAll(RE_NU))) {
    const dejaFr = out.some((p) => p.at === (m.index ?? 0) + m[1].length); if (dejaFr) continue;
    const a = hhmm(m[2]), b = hhmm(m[3]); if (a && b && Number(m[2]) < 24) ajoute(m, a, b);
  }
  for (const m of Array.from(f.matchAll(RE_NU2))) {
    const at = (m.index ?? 0) + m[1].length; if (out.some((p) => p.at === at)) continue;
    ajoute(m, hhmm(m[2]), hhmm(m[3]));
  }
  for (const m of Array.from(f.matchAll(RE_TR))) ajoute(m, hhmm(`${m[2]}:${m[3] ?? '00'}`), hhmm(`${m[4]}:${m[5] ?? '00'}`));
  for (const m of Array.from(f.matchAll(RE_TR2))) ajoute(m, hhmm(`${m[2]}:${m[3] ?? '00'}`), hhmm(`${m[4]}:${m[5] ?? '00'}`));
  // doublons (une plage reconnue par deux motifs) : on garde la première
  const vus = new Set<number>();
  return out.sort((x, y) => x.at - y.at).filter((p) => (vus.has(p.at) ? false : (vus.add(p.at), true)));
}

// ── Heures citées (français) : « 8h », « 8h30 », « 8 heures », « 8:30 », « midi », « minuit » ──
const HEURE_FR = /(?:^|[^a-z0-9])(?:midi|minuit)(?![a-z])|(?:^|[^a-z0-9])\d{1,2}\s*(?:h|heures?)\s*\d{0,2}(?![a-z0-9])|(?:^|[^a-z0-9])\d{1,2}\s*:\s*\d{2}(?![a-z0-9])/g;
/** Nombre d'heures citées (2 par plage). Une DURÉE (« pause d'1h ») n'en est pas une ; une plage reconnue sous une autre forme (« de 8 à 12 », « 08.00-12.00 », « 8h/12h ») compte pour 2. */
export function compteHeures(text: string): number {
  const n = fold(text)
    .replace(/\bapres[- ]?midi\b/g, ' ') // « après-midi » n'est pas « midi »
    .replace(/\b(?:pause|coupure|dejeuner)\s+(?:de\s+|d')?\d{1,2}\s*(?:h|heures?|min\w*)\s*\d{0,2}\b/g, ' ')
    .replace(/\b\d{1,2}\s*(?:h|heures?|min\w*)\s*\d{0,2}\s+de\s+(?:pause|coupure)\b/g, ' ');
  return Math.max((n.match(HEURE_FR) ?? []).length, 2 * plagesDuTexte(text).length);
}

// ── Familles d'actions (au moins 2 = « plusieurs actions ») ─────────────────
const FAMILLES: [string, RegExp][] = [
  ['panier', /\bpanier|\byemek sepeti|\bsepet/],
  ['reserve', /\breserve|\bfissure|\bmalfacon|\brezerv|\bcatlak/],
  ['conge', /\bconges?\b|\bvacances|\bmalade|\bmaladie|\brtt\b|\bizin|\bhasta|\btatil/],
  ['envoi', /\benvoi\w*\s+(?:ma|la|mes)\s+(?:journee|heures)|\bvalide\w*\s+ma\s+journee|\bgunumu\s+(?:buroya\s+)?gonder/],
  ['copie', /\bpareil\s+qu'?\s*hier|\bcomme hier\b|\bmeme (?:chose|journee)\b|\bcopie\w*\s+(?:ma|la)\s+journee/],
  ['nouveau_chantier', /\bnouveau\s+(?:chantier|client)|\bnouvelle?\s+cliente?|\byeni\s+(?:bir\s+)?(?:santiye|musteri)/],
];
/** Mots qui disent la pause SANS durée en chiffres (le lecteur local ne les lit pas : « demi-heure de pause », « une heure de pause »). */
const PAUSE_LETTRES = /\b(?:pause|coupure|dejeuner|mola)\b/;
const PAUSE_CHIFFREE = /\b(?:pause|coupure|dejeuner)\s+(?:de\s+|d')?\d|\d\s*(?:h|heures?|min\w*)\s*\d{0,2}\s+de\s+(?:pause|coupure)\b/;
/** Autocorrection en cours de phrase : « 14h, euh non plutôt 14h30 ». */
const AUTOCORRECTION = /\b(?:non plutot|ou plutot|plutot|enfin|pardon|attends?|je me trompe|en fait non|euh non|non non)\b/;

export interface ProfilSaisie {
  /** true → pas de lecteur local ; IA en réflexion « medium » (14 s / 22 s). */
  long: boolean;
  langue: 'fr' | 'tr';
  heures: number;
  plages: number;
  familles: string[];
  /** Codes des signaux déclenchés (journalisables : jamais le texte). */
  signaux: string[];
}

export function profilSaisie(text: string): ProfilSaisie {
  const t = String(text ?? '').trim();
  const n = fold(t);
  const turc = detecteTurc(t);
  const heures = compteHeures(t);
  const plages = Math.floor(heures / 2);
  const familles = FAMILLES.filter(([, re]) => re.test(n)).map(([k]) => k);
  if (plages >= 1) familles.push('heures');
  const signaux: string[] = [];
  if (t.length >= LONG_MIN_CHARS) signaux.push('longueur');
  if (turc) signaux.push('turc');
  if (familles.length >= 2) signaux.push('plusieurs_actions');
  if (plages >= 3) signaux.push('trois_plages');
  if (plages >= 2 && /\b(?:pause|coupure|dejeuner|mola)\b/.test(n)) signaux.push('deux_plages_et_pause');
  if (/\bnouveau\s+(?:chantier|client)|\bnouvelle?\s+cliente?/.test(n) && /\b\d{5}\b|\bprenom\b|\bnom\b|\badresse\b|\brue\b|\bavenue\b|\bchemin\b|\broute\b/.test(n)) signaux.push('nouveau_chantier_detaille');
  // Une plage + le mot « pause » sans durée en chiffres : le lecteur local l'ignorerait et enregistrerait 9 h au lieu de 8 h 30.
  if (plages >= 1 && PAUSE_LETTRES.test(n) && !PAUSE_CHIFFREE.test(n)) signaux.push('pause_en_lettres');
  if (plages >= 1 && AUTOCORRECTION.test(n)) signaux.push('autocorrection');
  return { long: signaux.length > 0, langue: turc ? 'tr' : 'fr', heures, plages, familles, signaux };
}

/**
 * Panneau salarié : la saisie est-elle une NOUVELLE demande (et non la réponse à la
 * question en attente) ? Complète `isNewRequest` (français) pour les phrases longues,
 * à plusieurs actions, et le turc. Une réponse courte (« Dupont villasında ») reste une suite.
 */
export function nouvelleDemandeSalarie(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const mots = t.split(/\s+/).filter(Boolean).length;
  const p = profilSaisie(t);
  if (t.length >= LONG_MIN_CHARS || p.signaux.some((s) => s !== 'turc' && s !== 'nouveau_chantier_detaille')) return true;
  return p.langue === 'tr' && (mots >= 6 || /\?|(?:^|[^\p{L}])(?:mi|mı|mu|mü|kaç|nasıl|nerede|hangi)(?![\p{L}])/iu.test(t));
}
