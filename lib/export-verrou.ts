// Lot 18 — alerte avant l'export d'ÉQUIPE, qui VERROUILLE les heures exportées.
//
// Règles PURES (aucun accès à la base, aucun import lourd) : elles disent quelles heures
// l'export verrouille, combien de lignes et de salariés ça touche, quand il faut prévenir
// le bureau et ce qu'on lui écrit. Testées sous Deno : npm run test:export-alerte-regles.
//
// Rappel de ce que fait l'export d'équipe (components/admin-planning.tsx, runExport) :
//   1. il lit les heures ENVOYÉES ou VALIDÉES de l'entreprise sur la période (jamais un
//      brouillon, jamais une intervention retirée) ;
//   2. il fabrique le fichier (Excel, PDF, CSV) ou l'envoie au comptable ;
//   3. SEULEMENT ENSUITE il pose `locked = true` et `exported_at` sur ces mêmes lignes.
// Un salarié ne peut plus modifier une ligne `locked = true` (règle d'accès de la base :
// time_entries_worker_update exige `locked = false`).

/** Les heures qui partent dans un export d'équipe (et que le verrou touche) : un seul endroit, partagé. */
export const STATUTS_EXPORTES = ['submitted', 'validated'] as const;

/** Une heure telle que l'alerte la lit : à qui elle est, et si elle est déjà verrouillée. */
export interface LigneVerrou {
  user_id: string;
  locked?: boolean | null;
}

export interface CompteVerrou {
  /** Lignes qui vont PASSER à « verrouillée » avec cet export (celles qui ne le sont pas encore). */
  lignes: number;
  /** Salariés distincts parmi ces lignes. */
  salaries: number;
  /** Lignes de la période déjà verrouillées avant : elles le restent, rien ne change pour elles. */
  dejaVerrouillees: number;
}

/**
 * Compte ce que l'export va verrouiller, à partir des lignes qu'il traite (même filtre que le code
 * qui verrouille). Une ligne déjà verrouillée n'est pas « verrouillée par cet export » : elle est
 * comptée à part.
 */
export function compterVerrou(rows: readonly LigneVerrou[]): CompteVerrou {
  const salaries = new Set<string>();
  let lignes = 0;
  let dejaVerrouillees = 0;
  for (const r of rows) {
    if (r.locked === true) { dejaVerrouillees++; continue; }
    lignes++;
    salaries.add(r.user_id);
  }
  return { lignes, salaries: salaries.size, dejaVerrouillees };
}

/**
 * Faut-il prévenir le bureau ? Oui dès qu'au moins une ligne va être verrouillée.
 * Non s'il n'y a rien à verrouiller, et non en mode support (lecture seule : la base refuse
 * toute écriture, l'export ne verrouille donc rien).
 */
export function alerteNecessaire(c: CompteVerrou, o: { support: boolean }): boolean {
  return !o.support && c.lignes > 0;
}

/** Deux comptes disent-ils la même chose ? (les chiffres annoncés, puis ceux relus au moment d'exporter) */
export function memeCompte(a: CompteVerrou, b: CompteVerrou): boolean {
  return a.lignes === b.lignes && a.salaries === b.salaries && a.dejaVerrouillees === b.dejaVerrouillees;
}

export type ExportEquipe = 'excel' | 'pdf' | 'csv' | 'comptable';

/**
 * « Exporter sans verrouiller » (export de contrôle) : possible pour un fichier téléchargé, dont le
 * verrou est une étape à part APRÈS la génération. Pas pour « Envoyer au comptable » : l'envoi écrit
 * lui-même en base (journal d'envoi) et part par e-mail, ce n'est pas un contrôle.
 */
export function choixSansVerrou(kind: ExportEquipe): boolean {
  return kind !== 'comptable';
}

const s = (n: number) => (n > 1 ? 's' : '');

/** « jj/MM/aaaa » depuis « aaaa-MM-jj » (sans passer par un fuseau : la date reste celle choisie). */
const fr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** La période, dite simplement : « du 01/10/2026 au 31/10/2026 » ou « le 13/10/2026 ». */
export function libellePeriode(from: string, to: string): string {
  return from === to ? `le ${fr(from)}` : `du ${fr(from)} au ${fr(to)}`;
}

/** La phrase de l'alerte (exacte, au singulier comme au pluriel). */
export function phraseVerrou(c: CompteVerrou, periode: string): string {
  const n = c.lignes;
  const m = c.salaries;
  return `Cet export va verrouiller ${n} ligne${s(n)} d’heures de ${m} salarié${s(m)} (période ${periode}). `
    + `${m > 1 ? 'Ils ne pourront' : 'Il ne pourra'} plus ${n > 1 ? 'les' : 'la'} modifier.`;
}

/** La précision sur les lignes déjà verrouillées (vide s'il n'y en a pas). */
export function phraseDejaVerrouillees(c: CompteVerrou): string {
  const k = c.dejaVerrouillees;
  if (k <= 0) return '';
  return `${k} autre${s(k)} ligne${s(k)} de la période ${k > 1 ? 'sont' : 'est'} déjà verrouillée${s(k)} : ${k > 1 ? 'elles le restent' : 'elle le reste'}.`;
}

/** Le message affiché une fois l'export terminé (le texte d'avant le lot 18, sauf « sans verrouiller »). */
export function messageFinExport(o: {
  kind: ExportEquipe; verrouille: boolean; saisies: number; envoi?: string;
}): string {
  const lockLabel = `${o.saisies} saisie${s(o.saisies)} verrouillée${s(o.saisies)}`;
  const reste = o.verrouille ? ` — ${lockLabel}` : ' — rien n’a été verrouillé';
  if (o.kind === 'comptable') return `${o.envoi ?? ''}${reste}`;
  return `${o.kind === 'csv' ? 'CSV de paie téléchargé' : 'Export téléchargé'}${reste}`;
}

/**
 * Le verrou a échoué APRÈS le fichier : il est déjà téléchargé (ou l'e-mail déjà parti). On le dit, avec ce qui reste
 * modifiable. `poses` = lignes déjà verrouillées avant l'échec (le verrou se pose par lots de 200).
 */
export function messageEchecVerrou(o: { kind: ExportEquipe; poses: number; total: number }): string {
  const fichier = o.kind === 'comptable' ? 'Fichier envoyé' : 'Fichier téléchargé';
  const reprise = o.kind === 'comptable' ? 'Recommencez : si l’e-mail est déjà parti, il ne partira pas deux fois.' : 'Recommencez.';
  if (o.poses > 0) {
    return `${fichier}, mais le verrouillage n’est fait qu’en partie (${o.poses} ligne${s(o.poses)} sur ${o.total}) : les autres heures restent modifiables. ${reprise}`;
  }
  return `${fichier}, mais le verrouillage a échoué : les heures restent modifiables. ${reprise}`;
}
