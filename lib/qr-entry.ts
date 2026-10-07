// Lot 12 — lignes d'heures venues du pointage QR : une seule définition pour
// l'écran du salarié, le bureau et l'export.
//
// Colonnes posées PAR LA BASE (migration 20261003120000_lot12_pointage_qr) :
//   · source = 'qr'      → ligne d'un pointage commencé à la tablette ;
//   · exit_forgotten     → chrono oublié, fermé la nuit en brouillon ;
//   · corrected_at       → heures d'une ligne QR changées après coup.
// Tant que la migration n'est pas passée, ces champs sont absents (undefined) :
// tout se lit alors « non », rien ne casse.

export interface QrFields {
  source?: string | null;
  exit_forgotten?: boolean | null;
  corrected_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export const isQrEntry = (e: QrFields) => e.source === 'qr';

/** Sortie oubliée SANS heure de fin (fin = début) : à compléter, ne part pas. */
export const isExitToComplete = (e: QrFields) =>
  !!e.exit_forgotten && !!e.start_time && (e.start_time || '').slice(0, 5) === (e.end_time || '').slice(0, 5);

export const EXIT_TO_COMPLETE_MSG = 'Sortie oubliée : mets ton heure de fin avant d’envoyer.';

/** Au-delà de 6 h d'affilée sans pause, on demande « Tu as pris une pause ? ». */
export const PAUSE_ASK_MINUTES = 360;
export const PAUSE_CHOICES = [0, 30, 60] as const;

interface DayLine extends QrFields {
  id: string;
  status: string;
  locked?: boolean | null;
  break_minutes?: number | null;
  total_minutes: number;
  gap_before?: string | null;
}

const toMin = (t?: string | null) => {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

/**
 * La ligne QR sur laquelle poser la question de la pause, ou null.
 * Une journée QR de plus de 6 h, aucune pause notée nulle part, et pas de
 * trou entre deux lignes (un scan à midi = deux lignes = la pause est déjà là).
 */
export function pauseCandidate(lines: DayLine[]): string | null {
  const live = lines.filter((l) => l.status !== 'cancelled');
  if (live.some((l) => (l.break_minutes || 0) > 0 || l.gap_before === 'pause')) return null;
  const sorted = [...live].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  for (let i = 1; i < sorted.length; i++) {
    if (toMin(sorted[i].start_time) - toMin(sorted[i - 1].end_time) >= 20) return null;
  }
  const cands = live.filter((l) => l.status === 'draft' && !l.locked && isQrEntry(l) && !isExitToComplete(l)
    && l.total_minutes > PAUSE_ASK_MINUTES);
  if (!cands.length) return null;
  return cands.sort((a, b) => b.total_minutes - a.total_minutes)[0].id;
}

/**
 * Les trois drapeaux du lot 12 pour des lignes déjà lues (bureau). Requête à
 * part, et silencieuse : tant que la migration n'est pas passée, les colonnes
 * n'existent pas — la fiche reste exactement celle d'avant, sans badge.
 */
export async function fetchQrFlags(
  supabase: { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => PromiseLike<{ data: unknown; error: unknown }> } } },
  ids: string[],
): Promise<Map<string, QrFields>> {
  const out = new Map<string, QrFields>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('time_entries')
      .select('id, source, exit_forgotten, corrected_at, start_time, end_time').in('id', ids.slice(i, i + 200));
    if (error) return new Map();
    for (const r of (data || []) as (QrFields & { id: string })[]) out.set(r.id, r);
  }
  return out;
}
