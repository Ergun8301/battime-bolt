// OUVRIR un écran, pré-rempli, sans jamais rien enregistrer (étape 3, livraison 3b-1). Contrat : docs/ia-etape3/00-conception-etape3.md §3.3.
//
// `ouvrirDepuisAppel(args, ctx, cote, role)` : ce que le serveur fait du choix du modèle (l'outil `ouvrir_fenetre{ id, valeurs? }`). FONCTION PURE : ni
// réseau, ni base, ni horloge, ni écriture (le test ouvrir.test.ts le vérifie sur le texte). Dans l'ordre :
//   1. l'id est cherché PAR ÉGALITÉ dans un tableau (jamais `OUVREURS[id]` : `__proto__`, `constructor`), du bon côté et du bon rôle ;
//   2. un écran de niveau 3 (`export.equipe`, `cloture.mois`) n'est ouvert que si la PERSONNE a évoqué le sujet dans sa demande (`declencheur`) et que
//      la requête n'est pas teintée : un nom de chantier, une note ou un PDF ne peuvent pas ouvrir « Exporter » ni « Clôturer » ;
//   3. chaque valeur est résolue par l'existant (salarié, chantier, date, lundi, heure…) : un nom inconnu ou ambigu devient UNE question avec choix,
//      jamais un identifiant deviné ; une valeur invalide est laissée vide ;
//   4. au plus 3 liens, 8 valeurs, 80 caractères par texte, 200 par lien, 700 par réponse ;
//   5. `auto` (ouvrir sans toucher) : calculé ICI, jamais lu dans la sortie du modèle — seulement si la personne a dit un verbe d'ouverture, jamais pour un
//      niveau 3, jamais pour une requête teintée, jamais quand une question est posée.
//
// Le lien : `ouvrir:<id>?k=v&k=v` (les valeurs sont encodées). Les paramètres vivent dans la chaîne `action` parce que `cleanLinks` (lib/assistant-chats.ts)
// ne garde que `label` et `action`.
//
// SERVEUR SEULEMENT (il lit ouvreurs.ts, le registre lourd).
import { addDays, candidats, findGuide, frDate, guideLinks, mondayOf, norm, scrubNir, type ActionContext } from './assistant-actions-core.ts';
import { findWorkerGuide, workerGuideLinks, type WorkerSnapshot } from './worker-assistant-core.ts';
import { GUIDE_LIENS_ETAPE3 } from './guide-etape3.ts';
import { parseDateFr, parseTimeFr } from './fr-langue.ts';
import { dateTr, demandeTurque, moisTr, TITRES_TR } from './ouvrir-tr.ts';
import { trouverOuvreur } from './registre/ouvreurs.ts';
import { VALEURS_MAX } from './registre/outil-ouvrir.ts';
import type { Cote, Ouvreur } from './registre/types.ts';

export type RoleOuvrir = 'admin' | 'worker' | 'lead';
export interface CtxOuvrir {
  /** Aujourd'hui, aaaa-mm-jj (fuseau de Paris). */
  today: string;
  salaries?: readonly { id: string; prenom: string; nom: string; role?: string }[];
  chantiers?: readonly { id: string; nom: string; ville: string | null }[];
  /** La demande de la personne, telle qu'elle l'a écrite. */
  demande?: string;
  /** Requête teintée (un texte qui n'est pas celui de la personne a pu guider le modèle) : niveau 3 refusé, textes ignorés, jamais `auto`. */
  teinte?: boolean;
}
export interface LienOuvrir { label: string; action: string }
export interface RepOuvrir { answer: string; links: LienOuvrir[]; /** Ouvrir sans toucher (≥ 1024 px) : décidé par le serveur seulement. */ auto?: true }

export const LIENS_MAX = 3;
export const REPONSE_MAX = 700;
export const LIEN_MAX = 200;
export const TEXTE_MAX = 80;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;
const NOMS_MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const estDateValide = (iso: string) => ISO.test(iso) && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) && new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso;

/** Un texte de pré-remplissage : une ligne, sans caractères de contrôle ni chevrons, sans n° de sécurité sociale, 80 caractères. */
export function aplatir(v: unknown): string {
  const t = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  return scrubNir(t.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, TEXTE_MAX).trim();
}

/** Un verbe d'OUVERTURE dans la demande : « ouvre », « emmène-moi », « montre-moi », « affiche », « va sur » — et en turc « aç », « göster ». Pas « comment… ? ». */
export function verbeOuverture(demande: string | undefined): boolean {
  const n = ` ${norm(demande ?? '').replace(/ı/g, 'i')} `;
  if (/\b(comment|expliqu|a quoi sert|quoi sert|c est quoi|ca sert|ou (est|se trouve|se met|je trouve)|pourquoi)\b/.test(n)) return false;
  return /\b(ouvre|ouvrez|ouvrir|ouvres|emmene|emmenez|emmener|amene|amenez|montre|montrez|montrer|affiche|affichez|afficher|va|vas|allez|aller)\b/.test(n)
    || /\b(ac|acin|acar misin|goster|gosterir misin|git)\b/.test(n);
}

/** La phrase de la personne évoque-t-elle ce que cet écran de niveau 3 ouvre ? (`declencheur` : expression sur la demande normalisée.) */
export function evoque(o: Ouvreur, demande: string | undefined): boolean {
  if (!o.declencheur) return true;
  try { return new RegExp(`(?:${o.declencheur})`).test(norm(demande ?? '')); } catch { return false; }
}

/** `aaaa-mm` du mois dit : « 2026-09 », une date, ou un nom de mois (le plus proche qui n'est pas dans le futur : « septembre » en octobre 2026 = 2026-09). */
function lireMois(v: string, today: string): string {
  const t = norm(v).trim();
  if (MOIS.test(t)) return t;
  if (estDateValide(t)) return t.slice(0, 7);
  const i = NOMS_MOIS.findIndex((m) => t === m || t.startsWith(`${m} `));
  if (i < 0) return '';
  const an = Number(t.slice(-4)) >= 2000 && /\b\d{4}$/.test(t) ? Number(t.slice(-4)) : Number(today.slice(0, 4)) - (i + 1 > Number(today.slice(5, 7)) ? 1 : 0);
  return `${an}-${String(i + 1).padStart(2, '0')}`;
}
/** Les deux mois qu'un bureau peut clôturer : celui qui vient de finir et celui en cours (components/admin-planning.tsx `closableMonths`). */
export function moisClotures(today: string): string[] {
  const [a, m] = today.split('-').map(Number);
  const prec = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  return [prec, today.slice(0, 7)];
}

type Valeurs = Record<string, string>;
interface Lecture {
  valeurs: Valeurs;
  /** Ce qui a été compris, en clair, pour la phrase de réponse. */
  dit: string[];
  /** Une question à poser au lieu d'ouvrir : le paramètre en cause et, si le nom est ambigu, les choix (3 au plus). */
  question?: { texte: string; param: string; choix: { id: string; label: string }[] };
}

const fullName = (s: { prenom: string; nom: string }) => `${s.prenom} ${s.nom}`.trim();
const nomChantier = (c: { nom: string; ville: string | null }) => (c.ville ? `${c.nom} (${c.ville})` : c.nom);

/** L'objet `valeurs` du modèle : un objet, ou une chaîne JSON qui en contient un (certains modèles sérialisent) ; sinon rien. Les clés viennent d'`Object.keys`. */
function objetValeurs(brut: unknown): Record<string, unknown> {
  let v = brut;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: Record<string, unknown> = Object.create(null);
  for (const k of Object.keys(v as Record<string, unknown>)) out[k] = (v as Record<string, unknown>)[k];
  return out;
}

function lire(o: Ouvreur, brut: unknown, ctx: CtxOuvrir, tr = false): Lecture {
  const entrees = objetValeurs(brut);
  const valeurs: Valeurs = Object.create(null);
  const dit: string[] = [];
  // Les noms autorisés sont ceux de l'écran, dans l'ordre où l'écran les déclare (jamais l'ordre du modèle) ; 8 valeurs au plus.
  const noms = Object.keys(o.params).filter((n) => Object.prototype.hasOwnProperty.call(entrees, n)).slice(0, VALEURS_MAX);
  let question: Lecture['question'];
  const demande = (texte: string, param: string, choix: { id: string; label: string }[] = []) => { question ??= { texte, param, choix }; };
  for (const nom of noms) {
    const p = o.params[nom];
    const v = entrees[nom];
    const texte = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    if (!texte) continue;
    switch (p.kind) {
      case 'salarie': {
        const c = candidats(texte, [...(ctx.salaries ?? [])], fullName);
        if (!c.length) { demande(tr ? `“${aplatir(texte)}” adlı bir çalışan bulamıyorum. Adı belirtin.` : `Je ne trouve pas de salarié « ${aplatir(texte)} ». Précisez le nom.`, nom); break; }
        if (c.length > 1 && c[1].hits === c[0].hits) {
          const tetes = c.filter((x) => x.hits === c[0].hits);
          demande(tr ? `“${aplatir(texte)}” için birden fazla çalışan var${tetes.length > LIENS_MAX ? ` (${tetes.length}, ilk ${LIENS_MAX} tanesi burada: adı belirtin)` : ''}: hangisi?` : `Plusieurs salariés correspondent à « ${aplatir(texte)} »${tetes.length > LIENS_MAX ? ` (${tetes.length}, voici les ${LIENS_MAX} premiers : précisez le nom)` : ''} : lequel ?`, nom,
            tetes.slice(0, LIENS_MAX).map((x) => ({ id: x.id, label: fullName((ctx.salaries ?? []).find((s) => s.id === x.id)!) })));
          break;
        }
        valeurs[nom] = c[0].id;
        dit.push(fullName((ctx.salaries ?? []).find((s) => s.id === c[0].id)!));
        break;
      }
      case 'chantier': {
        const c = candidats(texte, [...(ctx.chantiers ?? [])], (x) => `${x.nom} ${x.ville ?? ''}`);
        if (!c.length) { demande(tr ? `“${aplatir(texte)}” adlı bir müşteri ya da şantiye bulamıyorum. Adı belirtin.` : `Je ne trouve pas de client ni de chantier « ${aplatir(texte)} ». Précisez le nom.`, nom); break; }
        if (c.length > 1 && c[1].hits === c[0].hits) {
          const tetes = c.filter((x) => x.hits === c[0].hits);
          demande(tr ? `“${aplatir(texte)}” için birden fazla müşteri ya da şantiye var${tetes.length > LIENS_MAX ? ` (${tetes.length}, ilk ${LIENS_MAX} tanesi burada: adı belirtin)` : ''}: hangisi?` : `Plusieurs clients ou chantiers correspondent à « ${aplatir(texte)} »${tetes.length > LIENS_MAX ? ` (${tetes.length}, voici les ${LIENS_MAX} premiers : précisez le nom)` : ''} : lequel ?`, nom,
            tetes.slice(0, LIENS_MAX).map((x) => ({ id: x.id, label: nomChantier((ctx.chantiers ?? []).find((s) => s.id === x.id)!) })));
          break;
        }
        valeurs[nom] = c[0].id;
        dit.push(nomChantier((ctx.chantiers ?? []).find((s) => s.id === c[0].id)!));
        break;
      }
      case 'date': case 'lundi': {
        const d = estDateValide(texte) ? texte : parseDateFr(texte, ctx.today);
        if (!estDateValide(d)) break;
        const jour = p.kind === 'lundi' ? mondayOf(d) : d;
        valeurs[nom] = jour;
        if (tr) { const j = dateTr(jour); dit.push(p.kind === 'lundi' ? `${j} haftası` : nom === 'du' ? `başlangıç ${j}` : nom === 'au' ? `bitiş ${j}` : j); }
        else dit.push(p.kind === 'lundi' ? `semaine du ${frDate(jour)}` : nom === 'du' || nom === 'au' ? `${nom} ${frDate(jour)}` : frDate(jour));
        break;
      }
      case 'mois': {
        const m = lireMois(texte, ctx.today);
        if (!m) break;
        valeurs[nom] = m;
        dit.push(tr ? moisTr(m) : `mois ${m}`);
        break;
      }
      case 'heure': {
        const h = parseTimeFr(texte);
        if (!h) break;
        valeurs[nom] = h;
        dit.push(tr ? `${nom === 'debut' ? 'başlangıç' : 'bitiş'} ${h}` : `${nom === 'debut' ? 'de' : 'à'} ${h}`);
        break;
      }
      case 'enum': {
        const m = norm(texte).trim().replace(/\s+/g, '');
        const trouve = (p.valeurs ?? []).find((x) => x === m);
        if (!trouve) break;
        valeurs[nom] = trouve;
        break;
      }
      case 'texte': {
        // Un texte libre ne passe JAMAIS sur une requête teintée : c'est le canal d'un texte venu d'ailleurs (PDF, note, nom de chantier).
        if (ctx.teinte) break;
        const t = aplatir(texte);
        if (t) valeurs[nom] = t;
        break;
      }
      case 'liste_dates': {
        const l = texte.split(',').map((x) => x.trim()).filter(estDateValide).slice(0, 31);
        if (l.length) valeurs[nom] = l.join(',');
        break;
      }
    }
  }
  return { valeurs, dit, question };
}

/** `ouvrir:<id>?k=v…` ; au-delà de 200 caractères, les textes sont retirés un à un (les identifiants et dates restent). */
export function lienOuvrir(id: string, params: Record<string, string>, ordre: readonly string[]): string {
  const noms = ordre.filter((n) => Object.prototype.hasOwnProperty.call(params, n));
  const fait = (ns: string[]) => `ouvrir:${id}${ns.length ? `?${ns.map((n) => `${n}=${encodeURIComponent(params[n])}`).join('&')}` : ''}`;
  let ns = noms;
  while (fait(ns).length > LIEN_MAX && ns.length) ns = ns.slice(0, -1);
  return fait(ns);
}

const refuser = (answer: string, links: LienOuvrir[] = []): RepOuvrir => ({ answer: answer.slice(0, REPONSE_MAX), links: links.slice(0, LIENS_MAX) });

/** Le lien de la fiche d'aide la plus proche, quand l'écran demandé n'existe pas ou n'est pas pour cette personne. */
function ficheProche(cote: Cote, demande: string | undefined): LienOuvrir[] {
  try {
    if (cote === 'bureau') { const g = findGuide(demande ?? ''); return g ? guideLinks(g).slice(0, LIENS_MAX) : []; }
    const g = findWorkerGuide(demande ?? '');
    return g ? workerGuideLinks(g).slice(0, LIENS_MAX) : [];
  } catch { return []; }
}

export function ouvrirDepuisAppel(args: Record<string, unknown>, ctx: CtxOuvrir, cote: Cote, role: RoleOuvrir): RepOuvrir {
  // La langue du texte construit ici : celle de la demande (turc ou français). N'influence ni le lien, ni les valeurs, ni `auto`.
  const tr = demandeTurque(ctx.demande);
  // 1. L'id : égalité dans un tableau, du bon côté et du bon rôle.
  const o = trouverOuvreur(args?.id, cote);
  if (!o || !o.roles.includes(role)) {
    return refuser(tr ? 'Bu ekranı açamıyorum.' : 'Je ne peux pas ouvrir cet écran.', ficheProche(cote, ctx.demande));
  }
  const titre = tr ? TITRES_TR[o.id] ?? o.titre : o.titre;
  // 2. Un écran de niveau 3 : seulement si la personne l'a évoqué, jamais sur une requête teintée.
  if (o.niveau === 3) {
    if (ctx.teinte) return refuser(tr ? 'Bu istekte bu ekranı açmıyorum. Doğrudan, kendi sözlerinizle söyleyin.' : 'Je n’ouvre pas cet écran sur cette demande. Dites-le-moi directement, avec vos mots.');
    if (!evoque(o, ctx.demande)) return refuser(tr ? `“${titre}” ekranını açmam için açıkça söyleyin (örneğin “${titre} aç”).` : `Pour ouvrir « ${o.titre} », dites-le-moi clairement (par exemple « ouvre ${o.titre.toLowerCase()} »).`, ficheProche(cote, ctx.demande));
  }
  // 3. Les valeurs.
  const lu = lire(o, args.valeurs, ctx, tr);
  const ordre = Object.keys(o.params);
  // Le mois de clôture : seulement le précédent ou celui en cours (le navigateur le recontrôle).
  if (o.id === 'cloture.mois' && lu.valeurs.mois && !moisClotures(ctx.today).includes(lu.valeurs.mois)) {
    return refuser(tr ? `${moisTr(lu.valeurs.mois)} ayı burada kapatılamaz: yalnızca önceki ay (${moisTr(moisClotures(ctx.today)[0])}) ya da içinde bulunulan ay (${moisTr(moisClotures(ctx.today)[1])}).` : `Le mois ${lu.valeurs.mois} ne peut pas être clôturé ici : seulement le mois précédent (${moisClotures(ctx.today)[0]}) ou le mois en cours (${moisClotures(ctx.today)[1]}).`);
  }
  // 4. Une valeur obligatoire manque, ou un nom est inconnu / ambigu : UNE question, jamais un identifiant deviné.
  const manque = ordre.filter((n) => o.params[n].requis && !Object.prototype.hasOwnProperty.call(lu.valeurs, n));
  if (lu.question) {
    const q = lu.question;
    // Un choix par candidat (3 au plus) : le MÊME écran avec ce salarié / ce chantier. Nom inconnu : l'écran sans cette valeur, s'il peut s'ouvrir ainsi.
    const choix = q.choix.map((c) => ({ label: `${titre.length > 28 ? '' : `${titre} · `}${c.label}`.slice(0, 60), action: lienOuvrir(o.id, { ...lu.valeurs, [q.param]: c.id }, ordre) }));
    const sans = !q.choix.length && !manque.some((n) => n !== q.param) && !o.params[q.param].requis ? [{ label: titre.slice(0, 60), action: lienOuvrir(o.id, lu.valeurs, ordre) }] : [];
    return refuser(q.texte, [...choix, ...sans]);
  }
  if (manque.length) {
    const k = o.params[manque[0]].kind;
    if (tr) {
      const quoiTr = k === 'salarie' ? 'Hangi çalışan için?' : k === 'chantier' ? 'Hangi müşteri ya da şantiye için?' : k === 'mois' ? 'Hangi ay?' : k === 'date' ? 'Hangi gün için?' : 'Eksik bir bilgi var, lütfen belirtin.';
      return refuser(`${quoiTr} Öğrenir öğrenmez “${titre}” ekranını açarım.`);
    }
    const quoi = k === 'salarie' ? 'Pour quel salarié ?' : k === 'chantier' ? 'Pour quel client ou chantier ?' : k === 'mois' ? 'Quel mois ?' : k === 'date' ? 'Pour quel jour ?' : `Précisez : ${o.params[manque[0]].aide}.`;
    return refuser(`${quoi} Je vous ouvre « ${o.titre} » dès que je le sais.`);
  }
  // 5. Le lien, la phrase, et `auto`.
  const action = lienOuvrir(o.id, lu.valeurs, ordre);
  const label = `${titre}${lu.dit[0] && (o.params.salarie || o.params.chantier) ? ` · ${lu.dit[0]}` : ''}`.slice(0, 60);
  const auto = o.niveau === 1 && !ctx.teinte && verbeOuverture(ctx.demande);
  // Le dernier mot d'une date française finit par un point (« sept. ») : pas de second point derrière.
  const dits = lu.dit.join(', ').replace(/\.+$/, '');
  const prerempli = lu.dit.length ? (tr ? ` Önceden dolduruldu: ${dits}.` : ` Pré-rempli : ${dits}.`) : '';
  const answer = tr
    ? o.niveau === 3
      ? `İşte “${titre}”. Onaylamak için siz tıklarsınız: o zamana kadar hiçbir şey yapılmaz.${prerempli}`
      : `${auto ? `${titre} açılıyor.` : `İşte ${titre}.`}${prerempli}${o.formulaire ? ' Kaydetmeden önce kontrol edin.' : ''}`
    : o.niveau === 3
      ? `Voici « ${o.titre} ». C’est vous qui cliquez pour valider : rien n’est fait avant.${prerempli}`
      : `${auto ? 'J’ouvre' : 'Voici'} « ${o.titre} ».${prerempli}${o.formulaire ? ' Vérifiez avant d’enregistrer.' : ''}`;
  return { answer: answer.slice(0, REPONSE_MAX), links: [{ label, action }], ...(auto ? { auto: true as const } : {}) };
}

/** Pour les tests et le banc : les mois clôturables et le lundi d'une date (mêmes calculs que l'écran). */
export const _calculs = { moisClotures, mondayOf, addDays };

/**
 * Allume `ouvrir` pour UNE requête du bureau : `ctx.ouvrir` traite l'appel `ouvrir_fenetre`, `ctx.guideLiens` pose la seconde variante du GUIDE. À appeler
 * seulement si l'interrupteur est allumé, l'écran annonce `ouvrir1` et aucun fichier n'est joint (assistant/index.ts, banc d'essai). Sans appel : l'assistant d'avant.
 */
export function brancherOuvrirBureau(ctx: ActionContext, teinte = false): void {
  ctx.ouvrir = (args) => {
    const r = ouvrirDepuisAppel(args, { today: ctx.today, salaries: ctx.salaries, chantiers: ctx.chantiers, demande: ctx.demande, teinte }, 'bureau', 'admin');
    return { answer: r.answer, links: r.links, ...(r.auto ? { auto: true as const } : {}) };
  };
  ctx.guideLiens = GUIDE_LIENS_ETAPE3;
}

/** Idem côté salarié (profils court et long) : `snapshot.ouvrir` traite l'appel `ouvrir_fenetre`. */
export function brancherOuvrirSalarie(snapshot: WorkerSnapshot, role: 'worker' | 'lead', teinte = false): void {
  snapshot.ouvrir = (args) => {
    const r = ouvrirDepuisAppel(args, { today: snapshot.aujourdhui, chantiers: snapshot.chantiers, demande: snapshot.demande, teinte }, 'salarie', role);
    return { kind: 'guide', answer: r.answer, links: r.links, ...(r.auto ? { auto: true as const } : {}) };
  };
}
