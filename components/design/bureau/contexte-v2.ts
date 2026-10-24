// Design du bureau (v2) · ce que `admin-planning.tsx` prête au rendu v2 du planning.
// Le planning v2 ne lit RIEN lui-même (ni base, ni requête) : tout vient de l'écran existant — mêmes états, mêmes gestionnaires, mêmes règles.
// Les fonctions sont donc typées largement (`Fn`) : leur vrai type est celui de leur définition dans admin-planning.tsx.
import type { ReactNode } from 'react';
import type { PlanningWithWorksite, User, Worksite } from '@/lib/types';
import type { EntryRow, RealAgg } from '@/lib/planning-cells';
import type { DayTask, Meeting, MissionsState } from '@/lib/missions';

export type Fn = (...args: any[]) => any;

export interface SelState { on: boolean; lock: string | null }
export interface Essai { inTrial: boolean; expired: boolean; daysLeft: number | null }

export interface PlanningCtx {
  // identité, compte, essai
  user: User | null; companyLabel: string; companyLogo: string; companyInitials: string; trial?: Essai; onSubscribe?: () => void;
  signOut: () => void; aiOn: boolean; isAdmin: boolean;
  // options présentes (selon les migrations passées)
  kioskOn: boolean; trainingsOn: boolean; tracesOn: boolean; versionsOn: boolean; emailAllowed: boolean;
  // compteurs
  pendingLeaves: number; pendingInvites: number; openReserves: number; cockpitStats: { waiting: number; docs: number };
  // la semaine
  currentWeekStart: Date; weekDays: Date[]; isCurrentWeek: boolean; todayStr: string; thisWeekStart: Date; changeWeek: (d: Date) => void;
  mobileDayIdx: number; setMobileDayIdx: (i: number) => void;
  // les gens, les chantiers, les données lues
  workers: User[]; displayWorkers: User[]; worksites: Worksite[]; planning: PlanningWithWorksite[]; realEntries: EntryRow[]; draftEntries: { planning_id?: string | null }[];
  withdrawnIds: Set<string>; docsByWorksite: Map<string, number>; todayAbsence: Map<string, string>; missingEffective: Map<string, string[]>;
  closedMonths: Set<string>; workerClosures: Map<string, string>; missions: MissionsState;
  livePlaces: Map<string, { user_id: string; since: string; worksite_id: string | null; work_date: string }>; worksiteNameById: Map<string, string>;
  // lecture d'une case
  absenceForDay: Fn; cellChantiers: Fn; extraDeclaredForCell: Fn; liveForCell: Fn; liveChipFor: Fn; realForPlanning: (p: PlanningWithWorksite) => RealAgg | undefined;
  draftForPlanning: Fn; liveForBubble: Fn; cells: { meetings: (w: string, d: string) => Meeting[]; tasks: (w: string, d: string) => DayTask[] };
  // sélection
  selectMode: boolean; selFor: (p: PlanningWithWorksite) => SelState | undefined; toggleOne: Fn; toggleGroup: Fn; selectableIn: Fn; enterSelect: () => void; exitSelect: () => void;
  selIds: string[]; selOn: Set<string>; deleteSelected: Fn; eraseBusy: boolean; undoCard: { key: number; message: string; strong: boolean; undo: () => Promise<unknown> } | null; setUndoCard: Fn;
  // glisser-déposer
  activeDrag: { id: string; type: 'move' | 'new'; worksiteId?: string } | null; copying: boolean; moveLock: Fn; copyRefusalAt: Fn;
  // ouvrir quelque chose
  openAdd: Fn; openEdit: Fn; openTasks: Fn; openTaskAdd: Fn; openMeeting: Fn; openClientFiche: Fn; setStatusTarget: Fn; setExtraTarget: Fn;
  setSalariesOpen: Fn; setReservesOpen: Fn; setKioskOpen: Fn; setCostOpen: Fn; setVersionsOpen: Fn; setTracesOpen: Fn; setTrainingsOpen: Fn; setEmailOpen: Fn; setExportOpen: Fn;
  setSettingsOpen: Fn; setStatsOpen: Fn; setAssistantOpen: Fn; setMobileMenuOpen: Fn; setClientOpen: Fn; setImportOpen: Fn; setWorkerOpen: Fn; setDocsWorksite: Fn;
  preloadTrainings: () => void; preloadEmail: () => void;
  // menus
  accountMenuOpen: boolean; setAccountMenuOpen: (o: boolean) => void; chantierMenuOpen: boolean; setChantierMenuOpen: (o: boolean) => void;
  clientsQuery: string; setClientsQuery: (q: string) => void; filteredClients: Worksite[];
  // bandeau
  statPanel: null | 'waiting' | 'docs'; setStatPanel: Fn; renderRelanceRows: (onOpen: () => void) => ReactNode; monthLabel: string; docListState: 'idle' | 'loading' | 'ok' | 'ko';
  docsByChantier: { id: string; name: string; docs: { id: string; label: string | null; file_name: string | null; mime_type: string | null; work_date: string | null; created_at: string }[] }[];
  waitingByWorker: { id: string; name: string; days: string[] }[];
  openRelance: () => void;
  /** Objectif de la semaine d'un salarié, en heures : son horaire propre (fiche), sinon celui de l'entreprise, sinon 35 h. 0 = pas d'horaire. */
  weeklyGoalFor: (workerId: string) => number;
  /** « Tout valider » (bureau seulement) : sans réglage, toute l'entreprise sur le mois ; sinon l'endroit cliqué (en-tête d'un jour : l'équipe ce jour-là ; case : un salarié ce jour-là). */
  openValiderTout?: (o?: { userId?: string | null; periode?: 'jour' | 'semaine' | 'mois'; date?: string }) => void;
  // imprimer
  printOpen: boolean; setPrintOpen: (o: boolean) => void; closePrintMenu: () => void; printMenu: ReactNode;
  // coach, astuce
  coachHidden: boolean; dismissCoach: () => void; copyTipDesk: ReactNode; copyTipHelpCorner: ReactNode;
  // téléphone
  copyTipMobile: ReactNode; copyTipHelpMobile: ReactNode;
}
