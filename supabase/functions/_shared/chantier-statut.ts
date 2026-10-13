// Statut « terminé » d'un chantier (lot 23, oct. 2026) : les règles PURES les plus petites, celles que les écrans du
// PREMIER CHARGEMENT utilisent (cartes du salarié, listes de choix, fiche client du bureau). Fichier à part exprès :
// le reste des règles du lot (avertissements, bilan, budget) est dans chantier-termine.ts, qui n'est chargé qu'avec la
// fenêtre (lib/lazy-window.tsx) — et qui ré-exporte tout ceci.
//
// Aucune fonction edge n'importe ce fichier : rien à redéployer.

// ── Statut d'un chantier ────────────────────────────────────────────────────────

/** Tout ce qu'on lit d'un chantier pour savoir s'il est terminé. `undefined` = la colonne n'existe pas (migration pas appliquée). */
export interface CompletionLike { completed_at?: string | null }

/** La base a-t-elle la colonne ? `select('*')` la rend (null ou non) quand elle existe, jamais quand elle manque. */
export const hasCompletionColumn = (w?: CompletionLike | null): boolean => w != null && w.completed_at !== undefined;

/** Terminé = une date de fin est posée. Une colonne absente ou vide = en cours. */
export const isWorksiteFinished = (w?: CompletionLike | null): boolean => !!w?.completed_at;

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Le jour de fin (AAAA-MM-JJ) lu dans la colonne. La base l'écrit à midi UTC : les 10 premiers caractères sont le jour choisi. */
export function completedDay(w?: CompletionLike | null): string | null {
  const m = DAY.exec(String(w?.completed_at ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-13 » → « 13 octobre 2026 » (même écriture que date-fns/fr : pas de « 1er »). Valeur illisible → telle quelle. */
export function frDate(day: string): string {
  const m = DAY.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
const frShort = (day: string): string => { const m = DAY.exec(day); return m ? `${m[3]}/${m[2]}/${m[1]}` : day; };

/** « Terminé le 13 octobre 2026 » ; null si le chantier n'est pas terminé. `court` : « Terminé le 13/10/2026 » (petites cases). */
export function termineLe(w?: CompletionLike | null, court = false): string | null {
  const d = completedDay(w);
  if (!d) return null;
  return `Terminé le ${court ? frShort(d) : frDate(d)}`;
}

/**
 * Les listes de CHOIX du salarié (nouvelle intervention, nouveau pointage) : on retire les chantiers terminés.
 * `keep` : ceux qu'on garde malgré tout (le chantier déjà coché, par exemple). Jamais utilisée pour AFFICHER un nom
 * (cartes, historique, pointage en cours) : un chantier terminé garde son nom et ses heures partout ailleurs.
 */
export function choosableWorksites<T extends CompletionLike & { id: string }>(list: T[], keep: (string | null | undefined)[] = []): T[] {
  return list.filter((w) => !isWorksiteFinished(w) || keep.includes(w.id));
}

/** Qui voit quoi : le bilan et les boutons d'écriture. Sans la migration, rien ; en mode support (lecture seule), pas de bouton d'écriture. */
export function completionUi(p: { ready: boolean; hasColumn: boolean; supportMode: boolean }): { bilan: boolean; write: boolean } {
  const on = p.ready && p.hasColumn;
  return { bilan: on, write: on && !p.supportMode };
}
