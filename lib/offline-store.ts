// Saisies faites sans réseau — conservées dans le stockage du navigateur, une
// clé par salarié (jamais de fuite d'un compte à l'autre sur un téléphone
// partagé). L'envoi différé est dans lib/offline-sync.ts : il part tout seul au
// retour du réseau, quel que soit le jour de la saisie.

const KEY_PREFIX = 'battime_offline_';

/**
 * Émis à chaque écriture, dans l'onglet qui écrit.
 *
 * L'événement `storage` du navigateur ne se déclenche QUE dans les autres
 * onglets : sans ce signal, le compteur « en attente d'envoi » et la liste
 * affichée dans « Ma journée » restaient figés après un ajout ou un envoi.
 */
export const OFFLINE_CHANGED_EVENT = 'bemexo:offline-changed';

/** Émis quand au moins une saisie vient d'atteindre le serveur. */
export const OFFLINE_SYNCED_EVENT = 'bemexo:offline-synced';

function notifyChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OFFLINE_CHANGED_EVENT));
}

export interface PendingEntry {
  localId: string;
  company_id: string;
  user_id: string;
  worksite_id: string;
  planning_id?: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_minutes: number;
  meal_allowance: boolean;
  observation?: string | null;
  reception?: 'sans' | 'avec' | 'en_cours' | null;
  /** Route ou pause depuis l'intervention précédente (voir lib/types.ts). */
  gap_before?: 'route' | 'pause' | null;
  // denormalised for display only
  _worksite_name: string;
  _worksite_city?: string | null;
  _saved_at: number;
  /** Nombre de tentatives d'envoi déjà faites (voir lib/offline-sync.ts). */
  attempts?: number;
  /** Dernier refus du serveur, pour pouvoir l'expliquer au salarié. */
  lastError?: string | null;
  /** Refus définitif : on arrête de réessayer tout seul (voir lib/offline-sync.ts). */
  blocked?: boolean;
}

export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function safeRead(userId: string): PendingEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as PendingEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(userId: string, entries: PendingEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    // Ignore quota errors silently
  }
  notifyChanged();
}

export function getPendingEntries(userId: string): PendingEntry[] {
  return safeRead(userId);
}

export function addPendingEntry(userId: string, entry: PendingEntry): void {
  const entries = safeRead(userId);
  entries.push(entry);
  safeWrite(userId, entries);
}

export function removePendingEntry(userId: string, localId: string): void {
  const entries = safeRead(userId).filter(e => e.localId !== localId);
  safeWrite(userId, entries);
}

export function clearPendingEntriesForDate(userId: string, date: string): void {
  const entries = safeRead(userId).filter(e => e.work_date !== date);
  safeWrite(userId, entries);
}

/** Met à jour une saisie en attente sur place (compteur de tentatives, erreur). */
export function updatePendingEntry(
  userId: string,
  localId: string,
  patch: Partial<PendingEntry>,
): void {
  const entries = safeRead(userId).map(e => (e.localId === localId ? { ...e, ...patch } : e));
  safeWrite(userId, entries);
}

/** Nombre total de saisies en attente, tous jours confondus. */
export function countPendingEntries(userId: string): number {
  return safeRead(userId).length;
}

/** Saisies que le serveur a refusées définitivement : elles n'iront pas plus loin seules. */
export function countBlockedEntries(userId: string): number {
  return safeRead(userId).filter(e => e.blocked).length;
}

/**
 * Remet les compteurs à zéro pour forcer une nouvelle tentative.
 * Utilisé par le bouton d'envoi manuel : le salarié a le droit de réessayer
 * même quand l'envoi automatique a renoncé.
 */
export function unblockPendingEntries(userId: string): void {
  const entries = safeRead(userId).map(e => (e.blocked ? { ...e, blocked: false, attempts: 0 } : e));
  safeWrite(userId, entries);
}
