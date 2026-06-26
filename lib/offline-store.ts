// Offline entry storage — localStorage, scoped per user_id to prevent cross-user leaks.
// Entries added while offline are persisted here and auto-synced on reconnect.

const KEY_PREFIX = 'battime_offline_';

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
  // denormalised for display only
  _worksite_name: string;
  _worksite_city?: string | null;
  _saved_at: number;
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
