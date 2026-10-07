// Relances « journées manquantes » — le calcul, sans base ni réseau.
//
// La fonction `missing-days-reminders` lit la base puis confie ici la décision
// « quels jours manquent à qui ». Testé seul (missing-days.test.ts).
//
// Un jour MANQUE quand il n'a aucune ligne envoyée ou validée et :
//   · qu'il était planifié sur un chantier (jamais une absence) ;
//   · OU qu'une ligne en brouillon existe pour ce jour passé : heures saisies
//     mais jamais envoyées, ou « sortie oubliée — fin à compléter » (lot 12,
//     posée en brouillon par la fermeture de nuit). Sans cette règle, une
//     journée pointée hors planning (borne, « Autre ») restait en brouillon
//     sans que personne ne soit jamais relancé.
// Le brouillon du JOUR même n'est pas un manque : il a son propre rappel
// (« saisi mais pas envoyé »).

/** Rôles relancés : le salarié ET le chef d'équipe (il saisit aussi ses propres heures). */
export const REMINDED_ROLES = ['worker', 'lead'] as const;

export interface PlanRow { user_id: string; work_date: string; absence_type: string | null }
export interface DayRow { user_id: string; work_date: string }

export function computeMissingDays(
  planRows: PlanRow[],
  declaredRows: DayRow[],
  draftRows: DayRow[],
  todayStr: string,
): Map<string, string[]> {
  const absenceDays = new Set(planRows.filter((p) => p.absence_type).map((p) => `${p.user_id}|${p.work_date}`));
  const declared = new Set(declaredRows.map((e) => `${e.user_id}|${e.work_date}`));

  const out = new Map<string, string[]>();
  const add = (userId: string, day: string) => {
    const key = `${userId}|${day}`;
    if (day >= todayStr || absenceDays.has(key) || declared.has(key)) return;
    const arr = out.get(userId) || [];
    if (!arr.includes(day)) arr.push(day);
    out.set(userId, arr);
  };
  for (const p of planRows) if (!p.absence_type) add(p.user_id, p.work_date);
  for (const d of draftRows) add(d.user_id, d.work_date);
  return out;
}
