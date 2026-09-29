// Lot 7 — le français parlé, pour les DEUX assistants (bureau et salarié).
//
//  • nettoyer ce qui est dicté (« euh, alors… ») avant d'en faire un titre ;
//  • comprendre les dates et heures relatives (« demain matin », « jeudi 14h ») ;
//  • un petit calendrier pour la consigne de l'IA (jour de la semaine → date) ;
//  • reconnaître une DEMANDE D'ACTION (modèle plus fort) d'une simple question.
//
// Sans réseau ni base : testable, identique côté serveur et navigateur.

const deaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const low = (s: string) => deaccent(s.toLowerCase()).replace(/[’']/g, "'");

// ── Nettoyage de l'oral ─────────────────────────────────────────────────────
const FILLERS = [
  'euh+', 'heu+', 'hum+', 'bah', 'ben', 'bon ben', 'alors', 'du coup', 'en fait', 'voila', 'genre', 'tu vois', 'vous voyez',
  "s'il te plait", "s'il vous plait", 'stp', 'svp', 'merci', 'please', 'ok', 'okay', 'dis', 'dites',
];
const FILLER_RE = new RegExp(`(^|[\\s,;.!?])(?:${FILLERS.join('|')})(?=$|[\\s,;.!?])`, 'gi');

/** Enlève les mots d'hésitation et la ponctuation qui traîne ; garde la casse d'origine. */
export function cleanSpoken(s: string): string {
  let t = ` ${String(s ?? '')} `;
  // Les mots d'hésitation, comparés sans accents mais retirés du texte d'origine.
  const flat = deaccent(t);
  let out = '';
  let last = 0;
  FILLER_RE.lastIndex = 0;
  for (let m = FILLER_RE.exec(flat); m; m = FILLER_RE.exec(flat)) {
    out += t.slice(last, m.index) + m[1];
    last = m.index + m[0].length;
  }
  t = out + t.slice(last);
  return t.replace(/\s+([,;.!?])/g, '$1').replace(/([,;])\1+/g, '$1').replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.:!?-]+|[\s,;.:!?-]+$/g, '').trim();
}

export const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1) : s);

/**
 * Un TITRE propre : oral nettoyé, première lettre en majuscule, sans point
 * final, sans guillemets, court. « euh alors remplacement du chauffe-eau. » →
 * « Remplacement du chauffe-eau ».
 */
export function cleanTitle(s: string, max = 60): string {
  let t = cleanSpoken(s).replace(/^["«“'\s]+|["»”'\s]+$/g, '').replace(/[.。]+$/, '').trim();
  // « une intervention pour … », « il faut … » : le verbe de commande n'est pas le titre.
  t = t.replace(/^(?:(?:une?|l'|la|le)\s+)?(?:intervention|rdv|rendez-vous)\s+(?:pour|de|:)\s+/i, '')
    .replace(/^(?:il faut|faut|faire|pour)\s+/i, '');
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return capitalize(t);
}

/** Nom de client / chantier : nettoyé, chaque mot important avec sa majuscule. */
export function cleanName(s: string, max = 80): string {
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'd', 'l', 'à', 'a', 'au', 'aux', 'sur', 'en']);
  const t = cleanSpoken(s).replace(/^(?:chez|pour|client|le client|la cliente|chantier|le chantier)\s+/i, '').slice(0, max);
  return t.split(/(\s+|-)/).map((w, i) => {
    if (!w.trim() || w === '-') return w;
    if (/^[A-Z0-9]{2,}$/.test(w) || /[A-Z].*[A-Z]/.test(w.slice(1))) return w; // SARL, BTP, McDo : tel quel
    const lw = w.toLocaleLowerCase('fr-FR');
    if (i > 0 && small.has(deaccent(lw))) return lw;
    return capitalize(lw);
  }).join('').trim();
}

/** Titre d'une intervention au planning : « Client · objet court ». */
export function interventionTitle(client: string, objet: string): string {
  const c = (client || '').trim();
  const o = cleanTitle(objet || '');
  if (!o || low(o) === low(c)) return c;
  return c ? `${c} · ${o}` : o;
}

// ── Dates relatives ─────────────────────────────────────────────────────────
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const dow = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Une date dite → « aaaa-mm-jj » (ou '' si rien de clair). Règles :
 * « jeudi » = le PROCHAIN jeudi (aujourd'hui compris s'il est jeudi) ;
 * « lundi prochain » = le prochain lundi, jamais aujourd'hui ni demain (dit un
 * jeudi : « jeudi prochain » = dans 7 jours) ; « le 12 » = le 12 à venir.
 */
export function parseDateFr(text: string, today: string): string {
  const n = low(text);
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(n);
  if (iso) return iso[1];
  if (/\bapres[- ]?demain\b/.test(n)) return addDaysIso(today, 2);
  if (/\bavant[- ]?hier\b/.test(n)) return addDaysIso(today, -2);
  if (/\bdemain\b/.test(n)) return addDaysIso(today, 1);
  if (/\bhier\b/.test(n)) return addDaysIso(today, -1);
  if (/\b(aujourd'?hui|ce matin|cet apres[- ]?midi|ce soir|ce midi)\b/.test(n)) return today;
  const j = new RegExp(`\\b(${JOURS.join('|')})\\b(\\s+(?:prochain|suivant|d'apres))?`).exec(n);
  if (j) {
    const target = JOURS.indexOf(j[1]);
    let delta = (target - dow(today) + 7) % 7;
    // « lundi prochain » (dit un jeudi) = ce lundi-là ; jamais aujourd'hui ni demain.
    if (j[2]) delta = delta <= 1 ? delta + 7 : delta;
    else if (/\bsemaine prochaine\b/.test(n)) delta = 7 - dow(today) + target;
    return addDaysIso(today, delta);
  }
  if (/\bsemaine prochaine\b/.test(n)) return addDaysIso(today, 7 - dow(today));
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const dm = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?\\b`).exec(n);
  if (dm) {
    const day = Number(dm[1]), mon = MOIS.indexOf(dm[2]) + 1;
    let year = dm[3] ? Number(dm[3]) : y;
    let out = `${year}-${pad(mon)}-${pad(day)}`;
    if (!dm[3] && out < addDaysIso(today, -31)) { year += 1; out = `${year}-${pad(mon)}-${pad(day)}`; }
    return validIso(out) ? out : '';
  }
  const sl = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(n);
  if (sl) {
    let year = sl[3] ? Number(sl[3].length === 2 ? `20${sl[3]}` : sl[3]) : y;
    let out = `${year}-${pad(Number(sl[2]))}-${pad(Number(sl[1]))}`;
    if (!sl[3] && out < addDaysIso(today, -31)) { year += 1; out = `${year}-${pad(Number(sl[2]))}-${pad(Number(sl[1]))}`; }
    return validIso(out) ? out : '';
  }
  const le = /\ble\s+(\d{1,2})(?:er)?\b(?!\s*(?:h|heures?|:))/.exec(n);
  if (le) {
    const day = Number(le[1]);
    let out = `${y}-${pad(m)}-${pad(day)}`;
    if (out < today) out = m === 12 ? `${y + 1}-01-${pad(day)}` : `${y}-${pad(m + 1)}-${pad(day)}`;
    return validIso(out) ? out : '';
  }
  return '';
}

function validIso(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Une période dite : « du 20 au 24 octobre », « du 12/10 au 16/10 », « du lundi
 * au mercredi », « demain et après-demain ». null si rien de clair.
 */
export function parseDateRangeFr(text: string, today: string): { du: string; au: string } | null {
  const n = low(text);
  const m = /\bdu\s+(.+?)\s+(?:au|jusqu'?au|a)\s+(.+?)(?:[,.;]|$)/.exec(n);
  if (m) {
    const moisFin = new RegExp(`\\b(${MOIS.join('|')})\\b`).exec(m[2])?.[1] ?? '';
    const debut = /^\d{1,2}(?:er)?$/.test(m[1].trim()) && moisFin ? `${m[1].trim()} ${moisFin}` : m[1];
    const du = parseDateFr(/^\d{1,2}(?:er)?$/.test(debut.trim()) ? `le ${debut}` : debut, today);
    const au = parseDateFr(/^\d{1,2}(?:er)?$/.test(m[2].trim()) ? `le ${m[2]}` : m[2], today);
    if (du && au && au >= du) return { du, au };
  }
  // « aujourd'hui et demain », « lundi et mardi » : les deux bouts.
  const parts = n.split(/\bet\b/).map((x) => parseDateFr(x, today)).filter(Boolean).sort();
  if (parts.length >= 2) return { du: parts[0], au: parts[parts.length - 1] };
  const one = parseDateFr(n, today);
  return one ? { du: one, au: one } : null;
}

/** Une heure dite → « HH:MM » (ou ''). « 14h », « 8h30 », « 8 heures », « midi ». */
export function parseTimeFr(text: string): string {
  const n = low(text);
  if (/\bmidi\b/.test(n) && !/\bapres[- ]?midi\b/.test(n.replace(/\bmidi\b(?=.*\bapres)/, ''))) {
    const only = n.replace(/\bapres[- ]?midi\b/g, '');
    if (/\bmidi\b/.test(only)) return '12:00';
  }
  const m = /\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/.exec(n);
  if (!m) return '';
  let h = Number(m[1]); const mi = m[2] ? Number(m[2]) : 0;
  if (h <= 7 && /\b(apres[- ]?midi|soir)\b/.test(n)) h += 12;
  return h <= 23 && mi <= 59 ? `${pad(h)}:${pad(mi)}` : '';
}

/** Moment de la journée → horaires prévus indicatifs (modifiables). */
export function dayPart(text: string): { debut: string; fin: string } | null {
  const n = low(text);
  if (/\b(toute la journee|journee entiere|la journee)\b/.test(n)) return { debut: '08:00', fin: '17:00' };
  if (/\bapres[- ]?midi\b/.test(n)) return { debut: '13:30', fin: '17:00' };
  if (/\bmatin(ee)?\b/.test(n)) return { debut: '08:00', fin: '12:00' };
  return null;
}

/** Les jours autour d'aujourd'hui, pour que l'IA ne se trompe jamais de date. */
export function calendarForPrompt(today: string, before = 7, after = 21): string {
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const d = addDaysIso(today, i);
    const prochain = i > 1 && i <= 8 && parseDateFr(`${JOURS[dow(d)]} prochain`, today) === d ? ` (${JOURS[dow(d)]} prochain)` : '';
    const tag = i === 0 ? " (aujourd'hui)" : i === 1 ? ' (demain)' : i === -1 ? ' (hier)' : prochain;
    out.push(`${JOURS[dow(d)]} ${Number(d.slice(8))} ${MOIS[Number(d.slice(5, 7)) - 1]} = ${d}${tag}`);
  }
  return out.join('\n');
}

// ── Demande d'action, ou simple question ? ──────────────────────────────────
const ACTION_VERBS = /\b(ajout\w*|rajout\w*|cree\w*|creer|mets?|mettre|met|pose\w*|planifi\w*|programm\w*|affect\w*|place\w*|invit\w*|embauch\w*|corrig\w*|modifi\w*|chang\w*|decal\w*|deplac\w*|rang\w*|class\w*|enregistr\w*|note\w*|commenc\w*|demarr\w*|fini\w*|termin\w*|arret\w*|demand\w*|signal\w*|envoi\w*|envoy\w*|valid\w*|accept\w*|refus\w*|clotur\w*|renomm\w*|archiv\w*|relanc\w*|fais|faire|fait|prepar\w*|remplis|duplique\w*|copie\w*|budget\w*|pointe\w*|j'?ai (?:bosse|travaille|fait))\b/;

/**
 * Une question en attente (« Pour quel salarié ? ») : la réponse tapée la complète,
 * SAUF si c'est clairement une nouvelle demande (question, ou phrase d'action complète).
 */
export function isNewRequest(text: string): boolean {
  const n = low(text).trim();
  if (/\?\s*$/.test(text.trim())) return true;
  if (/^(comment|pourquoi|combien|quand|ou |ou est|qui |quel|quelle|est-ce|a quoi|c'?est quoi|explique|aide|montre)/.test(n)) return true;
  return n.split(/\s+/).length >= 6 && ACTION_VERBS.test(n);
}

/** true → modèle « actions » (plus fort) ; false → modèle léger pour une question. */
export function looksLikeAction(text: string, hasFile = false): boolean {
  if (hasFile) return true;
  const n = low(text);
  if (/^\s*(qui|combien|quel(?:le)?s?|quand|est-ce que|est ce que|y a-t-il|ya t il|comment|pourquoi|ou)\b/.test(n) && !/\b(peux-tu|peux tu|tu peux|pourrais-tu)\b/.test(n)) return false;
  return ACTION_VERBS.test(n) || /\d{1,2}\s*h/.test(n);
}
