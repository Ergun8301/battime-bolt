'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User, Invitation, TimeEntryWithWorksite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  UserPlus, Users, Building2, Archive, CalendarRange, Download, FileSpreadsheet, FileText,
  Bell, Clock, Mail, RefreshCw, X, Pencil, LogOut, User as UserIcon,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin, rectIntersection,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';
import { format, startOfWeek, addDays, addWeeks, subWeeks, subDays, parseISO, getISOWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { computeMissingDays } from '@/lib/work-status';
import { exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';
import WorkerDetailDialog from '@/components/worker-detail';

// ─── helpers / constants ──────────────────────────────────────────────────────

const WINDOW_DAYS = 21; // how far back the "planned but not declared" dot looks

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// Colour belongs to the CHANTIER (stable all week), not the poseur.
// Palette BTP noir/jaune : barre de couleur du chantier + tag « Prévu » assorti.
interface ChantierPalette { bar: string; tagBg: string; tagText: string }
const CHANTIER_PALETTES: ChantierPalette[] = [
  { bar: '#C9821F', tagBg: '#F1E3CB', tagText: '#9a7c14' },
  { bar: '#3E6E8E', tagBg: '#D7E2EA', tagText: '#356283' },
  { bar: '#2F8A5B', tagBg: '#D5E8DD', tagText: '#27744c' },
  { bar: '#B5472E', tagBg: '#F4D9D1', tagText: '#a8412a' },
  { bar: '#7A5EA8', tagBg: '#E7DEF2', tagText: '#6b4f99' },
  { bar: '#2C7A8C', tagBg: '#D3E7EB', tagText: '#256673' },
  { bar: '#A8742A', tagBg: '#EFE2CC', tagText: '#8a5f1e' },
];

const ABSENCE_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_STATUS_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'conge', label: 'Congé' },
  { value: 'maladie', label: 'Arrêt maladie' },
  { value: 'intemperie', label: 'Intempérie' },
  { value: 'repos', label: 'Repos' },
];

// Open-ended absences are materialised up to this horizon (no DB column to store
// an "until further notice" flag); the secretary ends them by setting "Présent".
const HORIZON_DAYS = 90;

const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(100,116,139,0.18) 0, rgba(100,116,139,0.18) 5px, transparent 5px, transparent 10px)',
};
// Trick to let a child `h-full` stretch to the table-row height.
const CELL_HEIGHT_HACK = { height: '1px' } as const;

// Fixed hour (rare RDV) is stored in estimated_start with estimated_end empty.
const fixedHourOf = (p: PlanningWithWorksite): string | null =>
  p.estimated_start && !p.estimated_end ? p.estimated_start.slice(0, 5) : null;

// Display order inside a cell: manual position first (asc), then creation order.
const orderCmp = (a: PlanningWithWorksite, b: PlanningWithWorksite) => {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

// Prefer a bubble droppable under the pointer, else fall back to the cell.
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const bub = within.find((c) => String(c.id).startsWith('bub|'));
  if (bub) return [bub];
  if (within.length) return within;
  return rectIntersection(args);
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const paletteFor = (p: PlanningWithWorksite) =>
  CHANTIER_PALETTES[hashStr(p.worksite_id || p.id) % CHANTIER_PALETTES.length];

interface RealAgg { minutes: number; start: string; end: string; count: number }
const realKey = (userId: string, date: string, worksiteId: string | null) => `${userId}|${date}|${worksiteId}`;

// ─── compact one-line chantier bubble ──────────────────────────────────────────

function BubbleContent({ p, palette, real }: { p: PlanningWithWorksite; palette: ChantierPalette; real?: RealAgg }) {
  const hour = fixedHourOf(p);
  const sub = [p.worksite?.product_type, p.worksite?.city].filter(Boolean).join(' · ');
  if (real) {
    // Pointé (réel) — fond noir, heures réelles en mono jaune.
    return (
      <div className="bt-pl-bub" style={{ background: '#15120F', color: '#F2EDE3' }}>
        <span className="bt-pl-bub-bar" style={{ background: palette.bar }} />
        <div className="bt-pl-bub-name">{p.worksite?.client_name || 'Chantier'}</div>
        {sub && <div className="bt-pl-bub-sub" style={{ color: '#a59c86' }}>{sub}</div>}
        <div className="bt-pl-bub-real">
          <span className="bt-pl-check">✓</span>
          <span className="bt-pl-real-txt">{real.start.slice(0, 5)}–{real.end.slice(0, 5)} · {formatMinutes(real.minutes)}</span>
        </div>
      </div>
    );
  }
  // Prévu — fond blanc, pointillé couleur chantier.
  return (
    <div className="bt-pl-bub" style={{ background: '#fff', border: `1.5px dashed ${palette.bar}`, color: '#15120F' }}>
      <span className="bt-pl-bub-bar" style={{ background: palette.bar }} />
      <div className="bt-pl-bub-name">{p.worksite?.client_name || 'Chantier'}</div>
      {sub && <div className="bt-pl-bub-sub" style={{ color: '#6E6A63' }}>{sub}</div>}
      <div className="bt-pl-bub-foot">
        <span className="bt-pl-tag" style={{ background: palette.tagBg, color: palette.tagText }}>Prévu</span>
        {hour && <span className="bt-pl-hour">{hour}</span>}
      </div>
    </div>
  );
}

// A bubble is both draggable (move/reorder) and droppable (reorder target).
function DraggableBubble({
  p, palette, real, onEdit,
}: {
  p: PlanningWithWorksite;
  palette: ChantierPalette;
  real?: RealAgg;
  onEdit: (p: PlanningWithWorksite) => void;
}) {
  const drag = useDraggable({ id: p.id, data: { type: 'move' } });
  const drop = useDroppable({ id: `bub|${p.id}` });
  return (
    <div ref={drop.setNodeRef} className={drop.isOver ? 'bt-pl-bub-over' : ''}>
      <div
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        onClick={(e) => { e.stopPropagation(); onEdit(p); }}
        className={`bt-pl-grab ${drag.isDragging ? 'bt-pl-dragging' : ''}`}
        title="Glisser pour déplacer / réordonner · cliquer pour modifier"
      >
        <BubbleContent p={p} palette={palette} real={real} />
      </div>
    </div>
  );
}

// Une ligne du menu « + Chantier » : attrapable (drag → crée une affectation).
// Chaque ligne porte son propre worksiteId ; les handlers dnd lisent data.worksiteId.
function PaletteRow({ worksite, color }: { worksite: Worksite; color: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-new-${worksite.id}`,
    data: { type: 'new', worksiteId: worksite.id },
  });
  const sub = [worksite.product_type, worksite.city].filter(Boolean).join(' · ');
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bt-pl-ddrow ${isDragging ? 'bt-pl-dragging' : ''}`}
      title="Glisser sur une case du planning"
    >
      <span className="bt-pl-grip"><span /><span /><span /></span>
      <span className="bt-pl-pilldot" style={{ background: color }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="bt-pl-ddname">{worksite.client_name}</span>
        {sub && <span className="bt-pl-ddsub">{sub}</span>}
      </span>
    </div>
  );
}

function DroppableCell({
  workerId, dateStr, isToday, children,
}: {
  workerId: string;
  dateStr: string;
  isToday: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${workerId}|${dateStr}` });
  return (
    <td
      ref={setNodeRef}
      style={CELL_HEIGHT_HACK}
      className={`bt-pl-cell ${isOver ? 'bt-pl-cell-over' : isToday ? 'bt-pl-cell-today' : ''}`}
    >
      <div className="bt-pl-cellinner">
        {children}
        {isOver && (
          <div className="bt-pl-drop"><span className="bt-pl-drop-arrow">↓</span><span>Déposer ici</span></div>
        )}
      </div>
    </td>
  );
}

// Stable colour for a chantier (legend + mobile) — same hash as paletteFor.
const colorForWorksite = (worksiteId: string | null | undefined): ChantierPalette =>
  CHANTIER_PALETTES[hashStr(worksiteId || 'x') % CHANTIER_PALETTES.length];

const ABSENCE_VISUAL: Record<string, { icon: string; bg: string; fg: string }> = {
  conge: { icon: '🌴', bg: 'repeating-linear-gradient(45deg,#E7E1D5 0 8px,#DDD5C6 8px 16px)', fg: '#7c766c' },
  repos: { icon: '💤', bg: 'repeating-linear-gradient(45deg,#ECE6DA 0 7px,#E4DCCE 7px 14px)', fg: '#9a948a' },
  intemperie: { icon: '🌧️', bg: 'repeating-linear-gradient(45deg,#E0E4E7 0 8px,#D2D7DB 8px 16px)', fg: '#5e6a72' },
  maladie: { icon: '🤒', bg: 'repeating-linear-gradient(45deg,#EBE0DC 0 8px,#E0D2CD 8px 16px)', fg: '#8a6a60' },
};

// Scoped noir/jaune styling for the planning. Logic-free — appearance only.
const PL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-pl{font-family:'Archivo',sans-serif;color:#15120F}
.bt-pl *{box-sizing:border-box}
.bt-pl .mono{font-family:'JetBrains Mono',monospace}
/* ===== BARRE UNIQUE pleine largeur (sticky) — pas de cadre ===== */
.bt-pl-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#F2EDE3;border-bottom:2px solid #15120F;padding:8px 16px}
.bt-pl-gridwrap{overflow-x:auto;background:#F2EDE3}
.bt-pl-bar-left{display:flex;align-items:center;gap:11px;flex-wrap:wrap}
.bt-pl-bar-right{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.bt-pl-logo{width:30px;height:30px;background:#15120F;color:#FFC21A;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex:none}
.bt-pl-nav{display:flex;align-items:center;gap:6px}
.bt-pl-week2{font-size:14px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;color:#15120F;display:inline-flex;align-items:center;gap:8px}
.bt-pl-wk{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;background:#15120F;color:#FFC21A;border-radius:6px;padding:3px 7px;letter-spacing:.04em}
.bt-pl-icobtn{width:33px;height:33px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;border:1.5px solid rgba(21,18,15,.18);background:#fff;color:#15120F;font-family:inherit;transition:border-color .14s ease,background .14s ease,transform .08s ease}
.bt-pl-icobtn:hover{border-color:#15120F;background:rgba(21,18,15,.05)}
.bt-pl-icobtn:active{transform:translateY(1px)}
.bt-pl-dark{background:#15120F;color:#F2EDE3;border:none;border-radius:10px;padding:7px 12px;height:33px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;transition:background .14s ease,transform .08s ease}
.bt-pl-dark:hover{background:#2a2620;transform:translateY(-1px)}
.bt-pl-dark:active{transform:translateY(1px)}
.bt-pl-seg{display:inline-flex;background:#E3DAC8;border-radius:11px;padding:4px;gap:3px}
.bt-pl-segbtn{font-family:inherit;font-weight:800;font-size:12.5px;border:none;background:transparent;color:#6E6A63;padding:7px 12px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .14s ease,color .14s ease}
.bt-pl-segbtn:hover{color:#15120F;background:rgba(21,18,15,.05)}
.bt-pl-out{background:transparent;border:1.5px solid rgba(21,18,15,.3);color:#15120F;border-radius:10px;padding:7px 13px;height:33px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:border-color .14s ease,background .14s ease,transform .08s ease}
.bt-pl-out:hover{border-color:#15120F;background:rgba(21,18,15,.04)}
.bt-pl-out:active{transform:translateY(1px)}
.bt-pl-fill{background:#FFC21A;color:#15120F;border:none;box-shadow:0 3px 0 #C99300;border-radius:10px;padding:8px 14px;height:33px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:transform .12s ease,box-shadow .12s ease}
.bt-pl-fill:hover{transform:translateY(-1px);box-shadow:0 5px 0 #C99300}
.bt-pl-fill:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
/* dropdown « + Chantier » — lignes attrapables */
.bt-pl-ddwrap{position:relative}
.bt-pl-ddbackdrop{position:fixed;inset:0;z-index:35}
.bt-pl-dd{position:absolute;top:42px;right:0;z-index:40;width:266px;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:14px;box-shadow:0 24px 50px -18px rgba(21,18,15,.45);overflow:hidden}
.bt-pl-dd-h{padding:9px 13px 7px;border-bottom:1px solid rgba(21,18,15,.08);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-pl-ddrow{display:flex;align-items:center;gap:10px;padding:10px 13px;cursor:grab;background:#fff;border:none;width:100%;text-align:left;font-family:inherit;transition:background .12s ease}
.bt-pl-ddrow:hover{background:#FBF6EA}
.bt-pl-ddrow:active{cursor:grabbing}
.bt-pl-grip{display:flex;flex-direction:column;gap:2px;flex:none}
.bt-pl-grip span{display:block;width:11px;height:1.7px;background:#c4bdae;border-radius:2px}
.bt-pl-pilldot{width:11px;height:11px;border-radius:50%;flex:none}
.bt-pl-ddname{display:block;font-size:13.5px;font-weight:800;line-height:1.1;color:#15120F}
.bt-pl-ddsub{display:block;font-size:11px;color:#9a948a;font-weight:600}
.bt-pl-ddcreate{display:flex;align-items:center;gap:9px;padding:11px 13px;border-top:1px solid rgba(21,18,15,.1);background:#FBF6EA;cursor:pointer;border:none;width:100%;text-align:left;font-family:inherit;color:#15120F;font-size:13.5px;font-weight:800}
.bt-pl-ddcreate-ico{width:22px;height:22px;background:#FFC21A;color:#15120F;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;flex:none}
.bt-pl-dragchip{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid rgba(21,18,15,.16);border-radius:11px;padding:8px 13px;box-shadow:0 16px 30px -12px rgba(21,18,15,.55);font-weight:800;font-size:13.5px;color:#15120F}

/* compte entreprise (remplace le bouton Déconnexion) */
.bt-pl-sep{width:1px;height:24px;background:rgba(21,18,15,.16)}
.bt-pl-acctwrap{position:relative}
.bt-pl-acct{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;padding:4px 10px 4px 4px;cursor:pointer;font-family:inherit;height:33px;transition:border-color .14s ease,background .14s ease}
.bt-pl-acct:hover{border-color:#15120F;background:rgba(21,18,15,.04)}
.bt-pl-acct-av{width:24px;height:24px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;flex:none}
.bt-pl-acct-name{font-size:13px;font-weight:800;color:#15120F;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-acct-car{font-size:10px;color:#9a948a}
.bt-pl-acctmenu{position:absolute;top:42px;right:0;z-index:40;width:232px;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:13px;box-shadow:0 24px 50px -18px rgba(21,18,15,.45);overflow:hidden}
.bt-pl-acctmenu-h{padding:11px 13px;border-bottom:1px solid rgba(21,18,15,.08)}
.bt-pl-acctmenu-co{font-size:13.5px;font-weight:900;color:#15120F}
.bt-pl-acctmenu-u{font-size:11.5px;color:#6E6A63;font-weight:600}
.bt-pl-acct-item{display:flex;align-items:center;gap:9px;width:100%;padding:11px 13px;background:#fff;border:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:800;color:#15120F;text-align:left;transition:background .12s ease}
.bt-pl-acct-item:hover{background:#FBF6EA}
.bt-pl-acct-item.danger{color:#C0461F}

/* grille desktop */
.bt-pl-table{width:100%;border-collapse:collapse;min-width:980px}
.bt-pl-th{background:#F2EDE3;padding:13px 10px;text-align:center;border-right:1px solid rgba(21,18,15,.38);border-bottom:2px solid rgba(21,18,15,.28)}
.bt-pl-th-day{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.bt-pl-th-num{font-size:19px;font-weight:900}
.bt-pl-th.today{background:rgba(255,194,26,.14)}
.bt-pl-th.today .bt-pl-th-day{color:#9a7c14}
.bt-pl-th-name{position:sticky;left:0;z-index:6;background:#F2EDE3;text-align:left;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700;padding:13px 13px;border-right:2px solid #15120F;border-bottom:2px solid rgba(21,18,15,.28)}
.bt-pl-namecell{position:sticky;left:0;z-index:5;background:#fff;border-right:2px solid #15120F;border-bottom:1px solid rgba(21,18,15,.12);padding:0;vertical-align:top}
.bt-pl-namebtn{display:flex;align-items:center;gap:10px;width:100%;height:100%;padding:12px 13px;background:transparent;border:none;cursor:pointer;text-align:left;font-family:inherit}
.bt-pl-namebtn:hover{background:rgba(21,18,15,.03)}
.bt-pl-avatar{width:36px;height:36px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none}
.bt-pl-name{font-size:14.5px;font-weight:800;letter-spacing:-.01em}
.bt-pl-status{display:flex;align-items:center;gap:5px;margin-top:2px}
.bt-pl-status-dot{width:7px;height:7px;border-radius:50%;background:#E0A21C}
.bt-pl-status-txt{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700}
.bt-pl-cell{border-right:1px solid rgba(21,18,15,.38);border-bottom:1px solid rgba(21,18,15,.12);padding:8px;vertical-align:top}
.bt-pl-cell-today{background:rgba(255,194,26,.05)}
.bt-pl-cell-over{background:rgba(255,194,26,.16);outline:2px dashed #FFC21A;outline-offset:-3px}
.bt-pl-cellinner{position:relative;height:100%;min-height:88px;display:flex;flex-direction:column}
.bt-pl-cellfill{flex:1;display:flex;flex-direction:column;gap:7px;cursor:pointer;border-radius:6px}
.bt-pl-drop{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9a7c14;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;pointer-events:none}
.bt-pl-drop-arrow{font-size:20px;font-weight:900}

/* bulle */
.bt-pl-bub{position:relative;overflow:hidden;border-radius:9px;padding:7px 9px 7px 12px;font-family:'Archivo',sans-serif}
.bt-pl-bub-bar{position:absolute;left:0;top:0;bottom:0;width:4px}
.bt-pl-bub-name{font-size:12.5px;font-weight:800;letter-spacing:-.01em;line-height:1.15}
.bt-pl-bub-sub{font-size:10.5px;font-weight:600;margin-bottom:5px;line-height:1.2}
.bt-pl-bub-real{display:flex;align-items:center;gap:5px}
.bt-pl-check{width:14px;height:14px;background:#2FA36B;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:900;flex:none}
.bt-pl-real-txt{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#FFC21A}
.bt-pl-bub-foot{display:flex;align-items:center;justify-content:space-between;gap:6px}
.bt-pl-tag{font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap}
.bt-pl-hour{font-family:'JetBrains Mono',monospace;font-size:10px;color:#9a948a;font-weight:700}
.bt-pl-grab{cursor:grab}
.bt-pl-grab:active{cursor:grabbing}
.bt-pl-dragging{opacity:.4}
.bt-pl-bub-over{border-radius:9px;outline:2px solid rgba(255,194,26,.7);outline-offset:1px}

/* hors-planning (déclaré salarié) */
.bt-pl-extra{position:relative;overflow:hidden;border-radius:9px;padding:7px 9px 7px 12px;background:#fff;border:1.5px dashed #B5472E;width:100%;text-align:left;cursor:pointer;font-family:inherit}
.bt-pl-extra-top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.bt-pl-extra-name{font-size:12px;font-weight:800;color:#15120F;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-extra-by{display:flex;align-items:center;gap:4px;font-size:8.5px;color:#9a3b14;margin-top:3px;font-weight:700}

/* case vide */
.bt-pl-add{flex:1;min-height:60px;border:1.5px dashed rgba(21,18,15,.18);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#b8b1a4;font-size:22px;font-weight:800}

/* absence cell */
.bt-pl-abs{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;min-height:88px;border:none;border-radius:6px;cursor:pointer;font-family:inherit}
.bt-pl-abs-ico{font-size:16px}
.bt-pl-abs-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}

/* mobile */
.bt-pl-mobile{display:none;flex-direction:column;border:1.5px solid #15120F;border-radius:14px;overflow:hidden;background:#F2EDE3}
.bt-pl-m-headrow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
@media (max-width:1023px){.bt-pl-bar,.bt-pl-gridwrap{display:none}.bt-pl-mobile{display:flex}}
.bt-pl-kicker{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:3px;font-weight:700}
.bt-pl-m-ibtn{flex:none;width:38px;height:38px;border-radius:9px;border:1px solid rgba(242,237,227,.22);background:transparent;color:#F2EDE3;display:inline-flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;font-family:inherit}
.bt-pl-m-ibtn:hover{background:rgba(242,237,227,.08)}
.bt-pl-m-head{background:#15120F;color:#F2EDE3;padding:18px 16px 14px}
.bt-pl-m-date{font-size:20px;font-weight:900;letter-spacing:-.02em;text-transform:capitalize}
.bt-pl-m-days{display:flex;gap:6px;margin-top:14px;overflow-x:auto}
.bt-pl-daypill{flex:none;min-width:46px;border-radius:11px;padding:8px 4px;text-align:center;border:1px solid rgba(242,237,227,.18);cursor:pointer;background:transparent;color:#F2EDE3;font-family:inherit}
.bt-pl-daypill-d{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a59c86;font-weight:700;text-transform:uppercase}
.bt-pl-daypill-n{font-size:15px;font-weight:800}
.bt-pl-daypill.on{background:#FFC21A;border-color:#FFC21A}
.bt-pl-daypill.on .bt-pl-daypill-d{color:#7a5e00}
.bt-pl-daypill.on .bt-pl-daypill-n{color:#15120F}
.bt-pl-m-list{padding:14px 14px 24px;display:flex;flex-direction:column;gap:11px}
.bt-pl-m-card{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:15px;padding:13px 14px}
.bt-pl-m-top{display:flex;align-items:center;gap:10px}
.bt-pl-m-badge{display:flex;align-items:center;gap:5px;border-radius:7px;padding:4px 8px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700}
.bt-pl-m-bubs{margin-top:11px;display:flex;flex-direction:column;gap:8px}
.bt-pl-m-empty{font-size:12.5px;color:#9a948a;font-weight:600;margin-top:8px}

/* ===== MOUVEMENT / EFFETS (apparence seulement — dnd-kit non touché) ===== */
.bt-pl-bub{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-grab{transition:transform .12s ease}
.bt-pl-grab:hover .bt-pl-bub{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(21,18,15,.45)}
.bt-pl-dragging{opacity:.35}
.bt-pl-dragging .bt-pl-bub{box-shadow:none;transform:none}
.bt-pl-overlay{transform:rotate(-2.5deg) scale(1.06);filter:drop-shadow(0 16px 22px rgba(21,18,15,.5));cursor:grabbing}
.bt-pl-extra{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-extra:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(181,71,46,.4)}
.bt-pl-cell{transition:background .14s ease}
.bt-pl-cellfill{transition:background .14s ease}
.bt-pl-cellfill:hover{background:rgba(21,18,15,.028)}
.bt-pl-add{transition:border-color .14s ease, color .14s ease, background .14s ease}
.bt-pl-cellfill:hover .bt-pl-add{border-color:rgba(21,18,15,.34);color:#9a8a3a;background:rgba(255,194,26,.06)}
.bt-pl-namebtn{transition:background .14s ease}
.bt-pl-chip{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-chip:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(21,18,15,.45)}
.bt-pl-chip:active{transform:translateY(0) scale(.98)}
.bt-pl-abs{transition:filter .12s ease}
.bt-pl-abs:hover{filter:brightness(.97)}
.bt-pl-daypill{transition:background .14s ease, border-color .14s ease, transform .08s ease}
.bt-pl-daypill:active{transform:translateY(1px)}
`;

// ─── main ────────────────────────────────────────────────────────────────────

export default function AdminPlanning() {
  const { user, signOut } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [realEntries, setRealEntries] = useState<{ user_id: string; work_date: string; worksite_id: string | null; start_time: string; end_time: string; total_minutes: number }[]>([]);
  const [todayAbsence, setTodayAbsence] = useState<Map<string, string>>(new Map());
  const [missingByWorker, setMissingByWorker] = useState<Map<string, string[]>>(new Map());
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [positionWarned, setPositionWarned] = useState(false);
  // Mobile (consultation only) — which weekday is shown. Default = today (Mon..Sat → 0..5).
  const [mobileDayIdx, setMobileDayIdx] = useState(() => { const d = new Date().getDay(); return d === 0 ? 0 : Math.min(d - 1, 5); });

  // client to place on the planning
  const [paletteWorksiteId, setPaletteWorksiteId] = useState<string>('');
  const [chantierMenuOpen, setChantierMenuOpen] = useState(false); // dropdown « + Chantier »
  const [accountMenuOpen, setAccountMenuOpen] = useState(false); // menu compte (entreprise → Déconnexion)
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: 'move' | 'new'; worksiteId?: string } | null>(null);

  // disponibilité popup + worker fiche + management screens
  const [statusTarget, setStatusTarget] = useState<{ worker: User; fromStr: string } | null>(null);
  const [ficheWorker, setFicheWorker] = useState<User | null>(null);
  const [ficheMode, setFicheMode] = useState<'hours' | 'manage'>('hours');
  const [salariesOpen, setSalariesOpen] = useState(false);
  const [clientsListOpen, setClientsListOpen] = useState(false);

  // team export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWorkerOpen, setExportWorkerOpen] = useState(false);
  const [exportRange, setExportRange] = useState<{ from: Date; to: Date } | null>(null);
  const [attributeTarget, setAttributeTarget] = useState<{ userId: string; dateStr: string; worksiteId: string | null; label: string } | null>(null);
  const [attrBusy, setAttrBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // invitation row actions
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // cell add dialog (a client on a specific day)
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ workerId: string; date: string } | null>(null);
  const [addWorksite, setAddWorksite] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // affectation (bubble) edit dialog
  const [editing, setEditing] = useState<PlanningWithWorksite | null>(null);
  const [editHour, setEditHour] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);

  // separate client fiche (permanent data)
  const [clientFiche, setClientFiche] = useState<Worksite | null>(null);
  const [wsName, setWsName] = useState('');
  const [wsProduct, setWsProduct] = useState('');
  const [wsPhone, setWsPhone] = useState('');
  const [wsEmail, setWsEmail] = useState('');
  const [wsCity, setWsCity] = useState('');
  const [wsAddress, setWsAddress] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [savingWs, setSavingWs] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);

  // absence start dialog (optional end date via calendar)
  const [pendingAbsence, setPendingAbsence] = useState<{ worker: User; type: string; fromStr: string } | null>(null);
  const [absRange, setAbsRange] = useState<DateRange | undefined>(undefined);
  const [absSaving, setAbsSaving] = useState(false);

  // create client / worker dialogs
  const [clientOpen, setClientOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cProduct, setCProduct] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cCity, setCCity] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cSaving, setCSaving] = useState(false);

  const [workerOpen, setWorkerOpen] = useState(false);
  const [wFirst, setWFirst] = useState('');
  const [wLast, setWLast] = useState('');
  const [wEmail, setWEmail] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wSaving, setWSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ─── data ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const [workersRes, worksitesRes] = await Promise.all([
        supabase.from('users').select('*').eq('company_id', user.company_id).eq('role', 'worker').eq('is_active', true).order('first_name'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      setWorkers(workersRes.data || []);
      setWorksites(worksitesRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  const fetchPlanning = useCallback(async () => {
    if (!user?.company_id) return;
    const weekEnd = addDays(currentWeekStart, 6);
    const from = format(currentWeekStart, 'yyyy-MM-dd');
    const to = format(weekEnd, 'yyyy-MM-dd');
    try {
      const [planRes, realRes] = await Promise.all([
        supabase.from('planning').select('*, worksite:worksites(*), user:users!user_id(*)')
          .eq('company_id', user.company_id).gte('work_date', from).lte('work_date', to).order('work_date'),
        supabase.from('time_entries').select('user_id, work_date, worksite_id, start_time, end_time, total_minutes')
          .eq('company_id', user.company_id).neq('status', 'draft').gte('work_date', from).lte('work_date', to),
      ]);
      if (planRes.error) throw planRes.error;
      setPlanning(planRes.data || []);
      if (!realRes.error) setRealEntries(realRes.data || []);
    } catch (err) {
      console.error('Error fetching planning:', err);
    }
  }, [user?.company_id, currentWeekStart]);

  // Today's absence (cell tint) + planned-but-undeclared dots + company + invitations.
  const fetchExtras = useCallback(async () => {
    if (!user?.company_id) return;
    const windowStart = format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd');
    const [planRes, entRes, compRes, invRes] = await Promise.all([
      supabase.from('planning').select('user_id, work_date, absence_type').eq('company_id', user.company_id).gte('work_date', windowStart),
      supabase.from('time_entries').select('user_id, work_date').eq('company_id', user.company_id).neq('status', 'draft').gte('work_date', windowStart),
      supabase.from('companies').select('name').eq('id', user.company_id).maybeSingle(),
      supabase.from('invitations').select('*').eq('company_id', user.company_id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ]);

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const planned = new Map<string, Set<string>>();
    const absence = new Map<string, Set<string>>();
    const today = new Map<string, string>();
    for (const p of planRes.data || []) {
      if (p.absence_type) {
        if (!absence.has(p.user_id)) absence.set(p.user_id, new Set());
        absence.get(p.user_id)!.add(p.work_date);
        if (p.work_date === todayKey) today.set(p.user_id, p.absence_type);
      } else {
        if (!planned.has(p.user_id)) planned.set(p.user_id, new Set());
        planned.get(p.user_id)!.add(p.work_date);
      }
    }
    const declared = new Map<string, Set<string>>();
    for (const e of entRes.data || []) {
      if (!declared.has(e.user_id)) declared.set(e.user_id, new Set());
      declared.get(e.user_id)!.add(e.work_date);
    }
    const miss = new Map<string, string[]>();
    planned.forEach((days, uid) => {
      const m = computeMissingDays(Array.from(days).filter((d) => !absence.get(uid)?.has(d)), declared.get(uid) || new Set<string>());
      if (m.length) miss.set(uid, m);
    });
    setTodayAbsence(today);
    setMissingByWorker(miss);
    setCompanyName(compRes.data?.name || '');
    setInvitations((invRes.data || []) as Invitation[]);
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);
  useEffect(() => {
    fetchExtras();
    const id = setInterval(fetchExtras, 60000);
    return () => clearInterval(id);
  }, [fetchExtras]);

  const refresh = () => { fetchPlanning(); fetchExtras(); };

  const realMap = useMemo(() => {
    const m = new Map<string, RealAgg>();
    for (const e of realEntries) {
      const k = realKey(e.user_id, e.work_date, e.worksite_id);
      const cur = m.get(k);
      if (!cur) m.set(k, { minutes: e.total_minutes, start: e.start_time, end: e.end_time, count: 1 });
      else {
        cur.minutes += e.total_minutes;
        if (e.start_time && e.start_time < cur.start) cur.start = e.start_time;
        if (e.end_time && e.end_time > cur.end) cur.end = e.end_time;
        cur.count += 1;
      }
    }
    return m;
  }, [realEntries]);

  const realForPlanning = (p: PlanningWithWorksite): RealAgg | undefined =>
    p.absence_type ? undefined : realMap.get(realKey(p.user_id, p.work_date, p.worksite_id));

  // Declared hours that DON'T match a planned chantier of the cell (hors-planning) —
  // shown as a distinct "déclaré par le salarié" chip on the grid.
  const worksiteNameById = useMemo(() => {
    const m = new Map<string, string>();
    worksites.forEach((w) => m.set(w.id, w.client_name));
    return m;
  }, [worksites]);
  const extraDeclaredForCell = (workerId: string, dateStr: string) => {
    const plannedWs = new Set(
      planning.filter((p) => p.user_id === workerId && p.work_date === dateStr && !p.absence_type).map((p) => p.worksite_id),
    );
    const agg = new Map<string, { worksiteId: string | null; name: string; minutes: number }>();
    for (const e of realEntries) {
      if (e.user_id !== workerId || e.work_date !== dateStr) continue;
      if (e.worksite_id && plannedWs.has(e.worksite_id)) continue; // already shown on its bubble
      const key = e.worksite_id || 'none';
      const name = (e.worksite_id && worksiteNameById.get(e.worksite_id)) || 'Autre';
      const cur = agg.get(key);
      if (cur) cur.minutes += e.total_minutes;
      else agg.set(key, { worksiteId: e.worksite_id, name, minutes: e.total_minutes });
    }
    return Array.from(agg.values());
  };

  // Attribute a real client to a worker-added intervention (from the grid).
  const attributeClient = async (newWorksiteId: string) => {
    if (!user?.company_id || !attributeTarget) return;
    setAttrBusy(true);
    try {
      const base = supabase.from('time_entries').update({ worksite_id: newWorksiteId })
        .eq('company_id', user.company_id).eq('user_id', attributeTarget.userId).eq('work_date', attributeTarget.dateStr);
      const { error } = await (attributeTarget.worksiteId ? base.eq('worksite_id', attributeTarget.worksiteId) : base.is('worksite_id', null));
      if (error) throw error;
      toast.success('Client attribué');
      setAttributeTarget(null);
      fetchPlanning();
    } catch (err) {
      console.error('Error attributing client:', err);
      toast.error("Impossible d'attribuer le client");
    } finally {
      setAttrBusy(false);
    }
  };
  const cellChantiers = useCallback((workerId: string, dateStr: string) =>
    planning.filter(p => p.user_id === workerId && p.work_date === dateStr && !p.absence_type).sort(orderCmp),
  [planning]);

  // ─── drag: create (palette) · move (cross-cell) · reorder (within cell) ──────

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type?: 'move' | 'new'; worksiteId?: string } | undefined;
    setActiveDrag({ id: String(e.active.id), type: data?.type === 'new' ? 'new' : 'move', worksiteId: data?.worksiteId });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const drag = activeDrag;
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || !user?.company_id) return;

    const overId = String(over.id);
    let tWorker: string;
    let tDate: string;
    let overBubbleId: string | null = null;
    if (overId.startsWith('bub|')) {
      overBubbleId = overId.slice(4);
      const ob = planning.find(p => p.id === overBubbleId);
      if (!ob) return;
      tWorker = ob.user_id; tDate = ob.work_date;
    } else {
      [tWorker, tDate] = overId.split('|');
    }

    // Create a new affectation by dropping a client.
    if (drag?.type === 'new') {
      if (!drag.worksiteId) return;
      const ws = worksites.find(w => w.id === drag.worksiteId);
      try {
        const { error } = await supabase.from('planning').insert({
          company_id: user.company_id, created_by: user.id, user_id: tWorker, worksite_id: drag.worksiteId,
          work_date: tDate, estimated_start: null, estimated_end: null, notes: null, absence_type: null,
        });
        if (error) throw error;
        toast.success(`${ws?.client_name || 'Client'} ajouté au planning`);
        fetchPlanning();
      } catch (err) {
        console.error('Error creating planning:', err);
        toast.error("Impossible d'ajouter au planning");
      }
      return;
    }

    // Move / reorder an existing chantier bubble.
    const draggedId = String(active.id);
    const dragged = planning.find(p => p.id === draggedId);
    if (!dragged || dragged.absence_type) return;
    if (overBubbleId === draggedId) return;

    const sameCell = dragged.user_id === tWorker && dragged.work_date === tDate;
    const target = cellChantiers(tWorker, tDate).filter(p => p.id !== draggedId);
    const idx = overBubbleId ? (() => { const i = target.findIndex(p => p.id === overBubbleId); return i < 0 ? target.length : i; })() : target.length;
    const newIds = target.map(p => p.id);
    newIds.splice(idx, 0, draggedId);
    if (sameCell && newIds.every((id, i) => (cellChantiers(tWorker, tDate)[i]?.id === id))) return; // no change

    // Optimistic reorder/move.
    const prev = planning;
    setPlanning(ps => ps.map(p => {
      if (p.id === draggedId) return { ...p, user_id: tWorker, work_date: tDate, position: newIds.indexOf(draggedId) };
      const i = newIds.indexOf(p.id);
      return i >= 0 ? { ...p, position: i } : p;
    }));

    // 1) The move itself (user_id/date) must work even without the position column.
    if (!sameCell) {
      const { error } = await supabase.from('planning').update({ user_id: tWorker, work_date: tDate })
        .eq('id', draggedId).eq('company_id', user.company_id);
      if (error) {
        console.error('Error moving planning:', error);
        toast.error('Impossible de déplacer');
        setPlanning(prev);
        return;
      }
    }
    // 2) Persist the order (best-effort — requires the `position` column).
    try {
      const results = await Promise.all(newIds.map((id, i) =>
        supabase.from('planning').update({ position: i }).eq('id', id).eq('company_id', user.company_id)));
      const bad = results.find(r => r.error);
      if (bad?.error) throw bad.error;
    } catch (err) {
      console.warn('Order not persisted (run the SQL migration?):', err);
      if (!positionWarned) {
        toast('Astuce : exécute le SQL « position » pour mémoriser l\'ordre des chantiers.');
        setPositionWarned(true);
      }
    }
  };

  // ─── cell add (click) ─────────────────────────────────────────────────────────

  const openAdd = (workerId: string, dateStr: string) => {
    setAddTarget({ workerId, date: dateStr });
    setAddWorksite(paletteWorksiteId || '');
    setAddNote('');
    setAddOpen(true);
  };

  const confirmAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id || !addTarget) return;
    if (!addWorksite) { toast.error('Choisissez un client'); return; }
    setAddSaving(true);
    try {
      const { error } = await supabase.from('planning').insert({
        company_id: user.company_id, created_by: user.id, user_id: addTarget.workerId,
        worksite_id: addWorksite, work_date: addTarget.date,
        estimated_start: null, estimated_end: null,
        notes: addNote.trim() || null, absence_type: null,
      });
      if (error) throw error;
      toast.success('Ajouté au planning');
      setAddOpen(false);
      setAddTarget(null);
      refresh();
    } catch (err) {
      console.error('Error adding planning:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setAddSaving(false);
    }
  };

  // ─── status / absence ───────────────────────────────────────────────────────

  const fromLabel = (fromStr: string) =>
    fromStr === todayStr ? "aujourd'hui" : format(new Date(`${fromStr}T00:00:00`), 'EEEE d MMMM', { locale: fr });

  const setPresentFrom = async (workerId: string, fromStr: string) => {
    if (!user?.company_id) return;
    try {
      const { error } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', workerId)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (error) throw error;
      toast.success(fromStr === todayStr ? 'Salarié présent' : `Présent à partir du ${format(new Date(`${fromStr}T00:00:00`), 'd MMM', { locale: fr })}`);
      refresh();
    } catch (err) {
      console.error('Error setting present:', err);
      toast.error('Impossible de mettre à jour le statut');
    }
  };

  const chooseAbsence = (worker: User, type: string, fromStr: string) => {
    setStatusTarget(null);
    setAbsRange({ from: new Date(`${fromStr}T00:00:00`), to: undefined });
    setPendingAbsence({ worker, type, fromStr });
  };

  const confirmAbsence = async () => {
    if (!user?.company_id || !pendingAbsence) return;
    const { worker, type } = pendingAbsence;
    const fromD = absRange?.from ?? new Date(`${pendingAbsence.fromStr}T00:00:00`);
    const fromStr = format(fromD, 'yyyy-MM-dd');
    const endStr = absRange?.to ? format(absRange.to, 'yyyy-MM-dd') : format(addDays(fromD, HORIZON_DAYS), 'yyyy-MM-dd');
    if (endStr < fromStr) { toast.error('La date de fin est avant le début'); return; }
    setAbsSaving(true);
    try {
      const dates: string[] = [];
      let d = new Date(`${fromStr}T00:00:00`);
      const endD = new Date(`${endStr}T00:00:00`);
      let guard = 0;
      while (d <= endD && guard < 400) { dates.push(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); guard++; }

      const { error: delErr } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', worker.id)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (delErr) throw delErr;

      const rows = dates.map((dt) => ({
        company_id: user.company_id, created_by: user.id, user_id: worker.id,
        worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
        notes: null, absence_type: type,
      }));
      const { error } = await supabase.from('planning').insert(rows);
      if (error) throw error;

      toast.success(absRange?.to ? "Absence enregistrée jusqu'à la date de fin" : 'Absence enregistrée (jusqu\'au retour « Présent »)');
      setPendingAbsence(null);
      refresh();
    } catch (err) {
      console.error('Error saving absence:', err);
      toast.error("Impossible d'enregistrer l'absence (si « Repos », ta base la refuse peut-être encore)");
    } finally {
      setAbsSaving(false);
    }
  };

  const sendReminder = (worker: User) => {
    const missing = missingByWorker.get(worker.id) || [];
    if (!worker.email) { toast.error(`Pas d'email pour ${worker.first_name}`); return; }
    const jours = missing.map((d) => format(parseISO(d), 'EEEE d MMMM', { locale: fr })).join(', ');
    const subject = encodeURIComponent('Rappel : pense à envoyer tes heures');
    const body = encodeURIComponent(
      `Bonjour ${worker.first_name},\n\n`
      + `Il manque l'envoi de tes heures pour : ${jours || 'des journées planifiées'}.\n`
      + `Merci de les saisir et de les envoyer dès que possible depuis l'application Battime.\n\n`
      + `— ${companyName || "L'équipe"}`,
    );
    window.location.href = `mailto:${worker.email}?subject=${subject}&body=${body}`;
    toast.success(`Rappel préparé pour ${worker.first_name}`);
  };

  // ─── team export (locks) ──────────────────────────────────────────────────────

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (!user?.company_id) { toast.error('Profil non chargé'); return; }
    setExporting(true);
    try {
      if (!exportRange) { toast.error('Choisis une période'); return; }
      const from = format(exportRange.from, 'yyyy-MM-dd');
      const to = format(exportRange.to, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, worksite:worksites(*), user:users!user_id(*)')
        .eq('company_id', user.company_id)
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('user_id');
      if (error) throw error;
      const entries = (data || []) as (TimeEntryWithWorksite & { user: User })[];
      if (entries.length === 0) { toast.error(`Aucune saisie du ${format(exportRange.from, 'dd/MM')} au ${format(exportRange.to, 'dd/MM')}`); return; }

      const opts = {
        fileName: `battime-${kind === 'pdf' ? 'rapport' : 'export'}-${from}`,
        title: 'Battime - Rapport hebdomadaire',
        periodLabel: `${format(exportRange.from, 'dd/MM/yyyy')} au ${format(exportRange.to, 'dd/MM/yyyy')}`,
        companyName,
      };
      if (kind === 'excel') exportEntriesToExcel(entries, opts);
      else exportEntriesToPDF(entries, opts);

      await supabase.from('time_entries').update({ exported_at: new Date().toISOString(), locked: true })
        .in('id', entries.map(e => e.id)).eq('company_id', user.company_id);

      toast.success(`Export téléchargé — ${entries.length} saisie${entries.length > 1 ? 's' : ''} verrouillée${entries.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error exporting team:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  // ─── invitations ──────────────────────────────────────────────────────────────

  const resendInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setResendingId(inv.id);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: { email: inv.email, first_name: inv.first_name, last_name: inv.last_name, phone: inv.phone || null, company_id: user.company_id, role: 'worker' },
      });
      if (error) throw error;
      toast.success('Invitation renvoyée');
      fetchExtras();
    } catch (err) {
      console.error('Error resending invitation:', err);
      toast.error("Impossible de renvoyer l'invitation");
    } finally {
      setResendingId(null);
    }
  };

  const cancelInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setCancellingId(inv.id);
    try {
      const { error } = await supabase.from('invitations').delete().eq('id', inv.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Invitation annulée');
      fetchExtras();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      toast.error("Impossible d'annuler l'invitation");
    } finally {
      setCancellingId(null);
    }
  };

  // ─── affectation popup (this day only) ──────────────────────────────────────

  const openEdit = (p: PlanningWithWorksite) => {
    setEditing(p);
    setEditHour(fixedHourOf(p) || '');
    setEditNote(p.notes || '');
  };

  const closeEdit = () => { setEditing(null); };

  const openClientFiche = (ws: Worksite | null | undefined) => {
    if (!ws) return;
    setWsName(ws.client_name || '');
    setWsEmail(ws.client_email || '');
    setWsProduct(ws.product_type || '');
    setWsPhone(ws.client_phone || '');
    setWsCity(ws.city || '');
    setWsAddress(ws.address || '');
    setWsDesc(ws.description || '');
    setEditing(null);
    setClientFiche(ws);
  };

  const saveAffectation = async () => {
    if (!user?.company_id || !editing) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('planning').update({
        estimated_start: editHour ? `${editHour}:00` : null, estimated_end: null, notes: editNote.trim() || null,
      }).eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Enregistré');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error saving affectation:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteAffectation = async () => {
    if (!user?.company_id || !editing) return;
    setDeletingEdit(true);
    try {
      const { error } = await supabase.from('planning').delete().eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Retiré du planning');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error deleting affectation:', err);
      toast.error('Impossible de retirer du planning');
    } finally {
      setDeletingEdit(false);
    }
  };

  // ─── client fiche (permanent) ───────────────────────────────────────────────

  const saveClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    if (!wsName.trim()) { toast.error('Le nom du client est requis'); return; }
    setSavingWs(true);
    try {
      const { error } = await supabase.from('worksites').update({
        client_name: wsName.trim(), product_type: wsProduct.trim() || null, client_phone: wsPhone.trim() || null, client_email: wsEmail.trim() || null,
        city: wsCity.trim() || null, address: wsAddress.trim() || null, description: wsDesc.trim() || null,
      }).eq('id', clientFiche.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Fiche client enregistrée');
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error saving client:', err);
      toast.error("Impossible d'enregistrer la fiche client");
    } finally {
      setSavingWs(false);
    }
  };

  const archiveClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    setWsBusy(true);
    try {
      const { error } = await supabase.from('worksites').update({ is_active: false })
        .eq('id', clientFiche.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Client archivé');
      setClientFiche(null);
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error archiving client:', err);
      toast.error("Impossible d'archiver");
    } finally {
      setWsBusy(false);
    }
  };

  const deleteClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    const worksiteId = clientFiche.id;
    setWsBusy(true);
    try {
      const [{ count: entryCount, error: e1 }, { count: planCount, error: e2 }] = await Promise.all([
        supabase.from('time_entries').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
        supabase.from('planning').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((entryCount || 0) > 0 || (planCount || 0) > 0) {
        toast.error('Client utilisé dans le planning. Archivez-le plutôt.');
        return;
      }
      const { error } = await supabase.from('worksites').delete().eq('id', worksiteId).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Client supprimé');
      setClientFiche(null);
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error deleting client:', err);
      toast.error('Impossible de supprimer le client');
    } finally {
      setWsBusy(false);
    }
  };

  // ─── create client / worker ─────────────────────────────────────────────────

  const resetClient = () => { setCName(''); setCProduct(''); setCPhone(''); setCEmail(''); setCCity(''); setCAddress(''); setCDesc(''); };

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    if (!cName.trim()) { toast.error('Le nom du client est requis'); return; }
    setCSaving(true);
    try {
      const { data, error } = await supabase.from('worksites').insert({
        company_id: user.company_id, client_name: cName.trim(), product_type: cProduct.trim() || null,
        client_phone: cPhone.trim() || null, client_email: cEmail.trim() || null, city: cCity.trim() || null, address: cAddress.trim() || null,
        description: cDesc.trim() || null, is_active: true,
      }).select().single();
      if (error) throw error;
      setClientOpen(false);
      resetClient();
      await fetchData();
      if (attributeTarget && data?.id) {
        await attributeClient(data.id);
      } else {
        toast.success('Client créé — glisse-le sur le planning');
        if (data?.id) setPaletteWorksiteId(data.id);
      }
    } catch (err) {
      console.error('Error creating client:', err);
      toast.error('Impossible de créer le client');
    } finally {
      setCSaving(false);
    }
  };

  const resetWorker = () => { setWFirst(''); setWLast(''); setWEmail(''); setWPhone(''); };

  const createWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    setWSaving(true);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: { email: wEmail, first_name: wFirst, last_name: wLast, phone: wPhone || null, company_id: user.company_id, role: 'worker' },
      });
      if (error) throw error;
      toast.success('Invitation envoyée');
      setWorkerOpen(false);
      resetWorker();
      fetchData();
      fetchExtras();
    } catch (err) {
      console.error('Error inviting worker:', err);
      toast.error("Impossible d'envoyer l'invitation");
    } finally {
      setWSaving(false);
    }
  };

  // ─── derived ──────────────────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(currentWeekStart, i));
  const dayShort = (d: Date) => format(d, 'EEE', { locale: fr }).replace('.', '');
  // Nom + initiales de l'entreprise connectée (bouton compte).
  const companyLabel = companyName || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Mon compte';
  const companyInitials = (companyLabel.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('') || 'BT').slice(0, 2).toUpperCase();

  const absenceForDay = (workerId: string, dateStr: string) =>
    planning.find(p => p.user_id === workerId && p.work_date === dateStr && p.absence_type);

  const workerEmails = useMemo(() => new Set(workers.map(w => w.email.toLowerCase())), [workers]);
  const pendingInvites = invitations.filter(inv => !workerEmails.has(inv.email.toLowerCase()));

  const editRealAgg = editing ? realForPlanning(editing) : undefined;

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="bt-pl">
      <style dangerouslySetInnerHTML={{ __html: PL_CSS }} />

      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={(e) => { handleDragEnd(e); setChantierMenuOpen(false); }} onDragCancel={() => { setActiveDrag(null); setChantierMenuOpen(false); }}>
        {/* Barre UNIQUE pleine largeur, figée (sticky) — tout aligné sur une ligne */}
        <div className="bt-pl-bar">
          <div className="bt-pl-bar-left">
            <span className="bt-pl-logo"><Clock className="h-4 w-4" /></span>
            <div className="bt-pl-nav">
              <button className="bt-pl-icobtn" aria-label="Semaine précédente" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>‹</button>
              <button className="bt-pl-dark" onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Aujourd'hui</button>
              <button className="bt-pl-icobtn" aria-label="Semaine suivante" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>›</button>
            </div>
            <div className="bt-pl-week2"><span className="bt-pl-wk">S.{getISOWeek(currentWeekStart)}</span> {format(currentWeekStart, 'd', { locale: fr })}–{format(addDays(currentWeekStart, 5), 'd MMM', { locale: fr })}</div>
          </div>
          <div className="bt-pl-bar-right">
            <div className="bt-pl-seg">
              <button className="bt-pl-segbtn" onClick={() => setSalariesOpen(true)}><Users className="h-3.5 w-3.5" /> Salariés</button>
              <button className="bt-pl-segbtn" onClick={() => setClientsListOpen(true)}><Building2 className="h-3.5 w-3.5" /> Clients</button>
            </div>
            <div className="bt-pl-ddwrap">
              <button className="bt-pl-out" onClick={() => setChantierMenuOpen((o) => !o)}>＋ Chantier ▾</button>
              {chantierMenuOpen && (
                <>
                  <div className="bt-pl-ddbackdrop" onClick={() => setChantierMenuOpen(false)} />
                  <div className="bt-pl-dd">
                    <div className="bt-pl-dd-h">Glissez sur le planning ↘</div>
                    {worksites.map((ws) => (
                      <PaletteRow key={ws.id} worksite={ws} color={colorForWorksite(ws.id).bar} />
                    ))}
                    <button className="bt-pl-ddcreate" onClick={() => { setChantierMenuOpen(false); setClientOpen(true); }}>
                      <span className="bt-pl-ddcreate-ico">＋</span> Créer un client
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="bt-pl-fill" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" /> Exporter la paie</button>
            <button className="bt-pl-out" onClick={() => setExportWorkerOpen(true)}><FileText className="h-4 w-4" /> Export salarié</button>
            <span className="bt-pl-sep" />
            <div className="bt-pl-acctwrap">
              <button className="bt-pl-acct" onClick={() => setAccountMenuOpen((o) => !o)} title="Compte entreprise">
                <span className="bt-pl-acct-av">{companyInitials}</span>
                <span className="bt-pl-acct-name">{companyLabel}</span>
                <span className="bt-pl-acct-car">▾</span>
              </button>
              {accountMenuOpen && (
                <>
                  <div className="bt-pl-ddbackdrop" onClick={() => setAccountMenuOpen(false)} />
                  <div className="bt-pl-acctmenu">
                    <div className="bt-pl-acctmenu-h">
                      <div className="bt-pl-acctmenu-co">{companyLabel}</div>
                      <div className="bt-pl-acctmenu-u">{user?.first_name} {user?.last_name}</div>
                    </div>
                    <button className="bt-pl-acct-item danger" onClick={() => { setAccountMenuOpen(false); signOut(); }}>
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invitations en attente (sous la barre) */}
        {pendingInvites.length > 0 && (
          <div className="mt-2 mx-4 space-y-1.5 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2.5">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Invitations en attente</p>
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate">{inv.first_name} {inv.last_name} · {inv.email}</span>
                <Button variant="outline" size="sm" className="h-7" onClick={() => resendInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                  {resendingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  <span className="hidden sm:inline ml-1">Relancer</span>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                  {cancellingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* GRILLE — desktop (glisser-déposer) */}
        <div className="bt-pl-gridwrap">
          <table className="bt-pl-table">
            <thead>
              <tr>
                <th className="bt-pl-th-name">Salarié</th>
                {weekDays.map(day => {
                  const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                  return (
                    <th key={day.toISOString()} className={`bt-pl-th ${isToday ? 'today' : ''}`}>
                      <div className="bt-pl-th-day">{dayShort(day)}{isToday ? ' · Auj.' : ''}</div>
                      <div className="bt-pl-th-num">{format(day, 'd')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
                <tbody>
                  {workers.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucun salarié — bouton « Salariés »</td></tr>
                  ) : (
                    workers.map(worker => {
                      const absToday = todayAbsence.get(worker.id);
                      const isLate = (missingByWorker.get(worker.id) || []).length > 0;
                      const fullName = `${worker.first_name} ${worker.last_name}`;
                      return (
                        <tr key={worker.id} className="border-b last:border-b-0">
                          {/* Cellule nom : avatar + nom + statut (en attente / à jour / absence). */}
                          <td className="bt-pl-namecell" style={absToday ? { ...CELL_HEIGHT_HACK, ...HATCH_STYLE } : CELL_HEIGHT_HACK}>
                            <button
                              onClick={() => setStatusTarget({ worker, fromStr: todayStr })}
                              className="bt-pl-namebtn"
                              title="Cliquer pour le statut / la disponibilité"
                            >
                              <span className="bt-pl-avatar" style={absToday ? { background: '#c4bdae', color: '#15120F' } : undefined}>
                                {(worker.first_name?.[0] || '')}{(worker.last_name?.[0] || '')}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="bt-pl-name" style={{ display: 'block' }}>{fullName}</span>
                                {absToday ? (
                                  <span className="bt-pl-status"><span className="bt-pl-status-txt" style={{ color: '#6E6A63' }}>{ABSENCE_LABELS[absToday] || absToday}</span></span>
                                ) : isLate ? (
                                  <span className="bt-pl-status"><span className="bt-pl-status-dot" /><span className="bt-pl-status-txt" style={{ color: '#9a7c14' }}>{(missingByWorker.get(worker.id) || []).length} jour{(missingByWorker.get(worker.id) || []).length > 1 ? 's' : ''} en attente</span></span>
                                ) : (
                                  <span className="bt-pl-status"><span className="bt-pl-status-txt" style={{ color: '#9a948a' }}>À jour</span></span>
                                )}
                              </span>
                            </button>
                          </td>

                          {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const absence = absenceForDay(worker.id, dateStr);
                            const chantiers = cellChantiers(worker.id, dateStr);
                            const extra = extraDeclaredForCell(worker.id, dateStr);
                            return (
                              <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={dateStr === todayStr}>
                                {absence ? (() => {
                                  const av = ABSENCE_VISUAL[absence.absence_type!] || ABSENCE_VISUAL.conge;
                                  return (
                                    <button
                                      style={{ background: av.bg, color: av.fg }}
                                      onClick={() => setStatusTarget({ worker, fromStr: dateStr })}
                                      className="bt-pl-abs"
                                      title="Absence — cliquer pour changer le statut"
                                    >
                                      <span className="bt-pl-abs-ico">{av.icon}</span>
                                      <span className="bt-pl-abs-lbl">{ABSENCE_LABELS[absence.absence_type!] || absence.absence_type}</span>
                                    </button>
                                  );
                                })() : (
                                  <div
                                    className="bt-pl-cellfill"
                                    onClick={() => openAdd(worker.id, dateStr)}
                                    title="Cliquer pour ajouter une intervention"
                                  >
                                    {chantiers.map(p => (
                                      <DraggableBubble key={p.id} p={p} palette={paletteFor(p)} real={realForPlanning(p)} onEdit={openEdit} />
                                    ))}
                                    {extra.map((x, i) => (
                                      <button
                                        key={`xd${i}`}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setAttributeTarget({ userId: worker.id, dateStr, worksiteId: x.worksiteId, label: x.name }); }}
                                        title="Ajouté par le salarié — cliquer pour attribuer un client"
                                        className="bt-pl-extra"
                                      >
                                        <span className="bt-pl-bub-bar" style={{ background: '#B5472E' }} />
                                        <span className="bt-pl-extra-top">
                                          <span className="bt-pl-extra-name">{x.name}</span>
                                          <span className="bt-pl-tag" style={{ background: '#F4D9D1', color: '#a8412a' }}>Hors planning</span>
                                        </span>
                                        <span className="bt-pl-extra-by"><UserIcon className="h-2.5 w-2.5 shrink-0" /> {formatMinutes(x.minutes)} · ajouté par le salarié</span>
                                      </button>
                                    ))}
                                    {chantiers.length === 0 && extra.length === 0 && <div className="bt-pl-add">+</div>}
                                  </div>
                                )}
                              </DroppableCell>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
            </table>
          </div>

          {/* MOBILE — consultation jour par jour (pas de glisser-déposer) */}
          <div className="bt-pl-mobile">
            <div className="bt-pl-m-head">
              <div className="bt-pl-m-headrow">
                <div>
                  <div className="bt-pl-kicker">Planning · Sem. {getISOWeek(currentWeekStart)}</div>
                  <div className="bt-pl-m-date">{format(weekDays[mobileDayIdx], 'EEEE d MMMM', { locale: fr })}</div>
                </div>
                <div className="bt-pl-nav">
                  <button className="bt-pl-m-ibtn" aria-label="Semaine précédente" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>‹</button>
                  <button className="bt-pl-m-ibtn" aria-label="Semaine suivante" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>›</button>
                  <button className="bt-pl-m-ibtn" aria-label="Déconnexion" title="Déconnexion" onClick={signOut}><LogOut className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="bt-pl-m-days">
                {weekDays.map((day, i) => (
                  <button key={day.toISOString()} className={`bt-pl-daypill ${i === mobileDayIdx ? 'on' : ''}`} onClick={() => setMobileDayIdx(i)}>
                    <div className="bt-pl-daypill-d">{dayShort(day)}</div>
                    <div className="bt-pl-daypill-n">{format(day, 'd')}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bt-pl-m-list">
              {workers.length === 0 ? (
                <div className="bt-pl-m-empty">Aucun salarié — bouton « Salariés ».</div>
              ) : workers.map(worker => {
                const dateStr = format(weekDays[mobileDayIdx], 'yyyy-MM-dd');
                const absence = absenceForDay(worker.id, dateStr);
                const chantiers = cellChantiers(worker.id, dateStr);
                const extra = extraDeclaredForCell(worker.id, dateStr);
                const av = absence ? (ABSENCE_VISUAL[absence.absence_type!] || ABSENCE_VISUAL.conge) : null;
                const anyReal = chantiers.some(p => realForPlanning(p));
                return (
                  <div key={worker.id} className="bt-pl-m-card">
                    <div className="bt-pl-m-top">
                      <span className="bt-pl-avatar" style={absence ? { background: '#c4bdae', color: '#15120F' } : undefined}>{(worker.first_name?.[0] || '')}{(worker.last_name?.[0] || '')}</span>
                      <span style={{ flex: 1, minWidth: 0 }}><span className="bt-pl-name" style={{ display: 'block' }}>{worker.first_name} {worker.last_name}</span></span>
                      {absence ? (
                        <span className="bt-pl-m-badge" style={{ background: '#EFE7DA', color: av!.fg }}>{av!.icon} {(ABSENCE_LABELS[absence.absence_type!] || '').toUpperCase()}</span>
                      ) : anyReal ? (
                        <span className="bt-pl-m-badge" style={{ background: '#E4F2E9', color: '#1F7A4D' }}>✓ POINTÉ</span>
                      ) : null}
                    </div>
                    {!absence && (chantiers.length > 0 || extra.length > 0) && (
                      <div className="bt-pl-m-bubs">
                        {chantiers.map(p => <BubbleContent key={p.id} p={p} palette={paletteFor(p)} real={realForPlanning(p)} />)}
                        {extra.map((x, i) => (
                          <div key={`mx${i}`} className="bt-pl-extra">
                            <span className="bt-pl-bub-bar" style={{ background: '#B5472E' }} />
                            <span className="bt-pl-extra-top"><span className="bt-pl-extra-name">{x.name}</span><span className="bt-pl-tag" style={{ background: '#F4D9D1', color: '#a8412a' }}>Hors planning</span></span>
                            <span className="bt-pl-extra-by"><UserIcon className="h-2.5 w-2.5 shrink-0" /> {formatMinutes(x.minutes)} · ajouté par le salarié</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!absence && chantiers.length === 0 && extra.length === 0 && <div className="bt-pl-m-empty">Rien de prévu ce jour.</div>}
                  </div>
                );
              })}
            </div>
          </div>

        <DragOverlay>
          {activeDrag?.type === 'new' ? (() => {
            const ws = worksites.find((w) => w.id === activeDrag.worksiteId);
            return ws ? (
              <div className="bt-pl-dragchip"><span className="bt-pl-pilldot" style={{ background: colorForWorksite(ws.id).bar }} />{ws.client_name}</div>
            ) : null;
          })() : activeDrag?.type === 'move' ? (
            (() => {
              const p = planning.find(x => x.id === activeDrag.id);
              return p ? <div className="bt-pl-overlay"><BubbleContent p={p} palette={paletteFor(p)} real={realForPlanning(p)} /></div> : null;
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Disponibilité popup — 5 buttons + fiche link */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => { if (!o) setStatusTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {statusTarget ? `Statut de ${statusTarget.worker.first_name} à partir ${statusTarget.fromStr === todayStr ? "d'aujourd'hui" : `du ${fromLabel(statusTarget.fromStr)}`}` : ''}
            </DialogTitle>
          </DialogHeader>
          {statusTarget && (
            <div className="space-y-2 pt-1">
              <Button variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => { setPresentFrom(statusTarget.worker.id, statusTarget.fromStr); setStatusTarget(null); }}>
                <span className="h-3 w-3 rounded-full bg-green-500 mr-3" /> Présent
              </Button>
              {ABSENCE_OPTIONS.map(opt => (
                <Button key={opt.value} variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => chooseAbsence(statusTarget.worker, opt.value, statusTarget.fromStr)}>
                  <span className="h-3 w-3 rounded-full bg-orange-500 mr-3" /> {opt.label}
                </Button>
              ))}
              <div className="border-t pt-2 mt-1">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => { setFicheMode('hours'); setFicheWorker(statusTarget.worker); setStatusTarget(null); }}>
                  <FileText className="h-4 w-4 mr-2" /> Feuille d'heures
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Worker fiche (detailed — management + hours) */}
      <WorkerDetailDialog
        worker={ficheWorker}
        mode={ficheMode}
        onOpenChange={(open) => { if (!open) setFicheWorker(null); }}
        onChanged={() => { fetchData(); refresh(); }}
      />

      {/* Salariés — administrative management */}
      <Dialog open={salariesOpen} onOpenChange={setSalariesOpen}>
        <DialogContent className="bt-skin max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Salariés</DialogTitle></DialogHeader>
          <div className="pt-1">
            <Button variant="outline" size="sm" className="mb-2 w-full" onClick={() => { setSalariesOpen(false); setWorkerOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Nouveau salarié
            </Button>
            <div className="space-y-1">
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun salarié</p>
              ) : (
                workers.map(w => {
                  const miss = (missingByWorker.get(w.id) || []).length;
                  return (
                    <div key={w.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => { setSalariesOpen(false); setFicheMode('manage'); setFicheWorker(w); }}>
                        <span className="font-medium truncate">{w.first_name} {w.last_name}</span>
                        {miss > 0 && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" title={`${miss} jour(s) en attente`} />}
                      </button>
                      {miss > 0 && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => sendReminder(w)} title="Envoyer un rappel">
                          <Bell className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attribute a client to a worker-added intervention (clicked from the grid) */}
      <Dialog open={!!attributeTarget && !clientOpen} onOpenChange={(o) => { if (!o) setAttributeTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>Attribuer un client</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Intervention <strong>« {attributeTarget?.label} »</strong> ajoutée par le salarié. Choisis le bon client, ou crée-le.</p>
            <Select onValueChange={(v) => attributeClient(v)} disabled={attrBusy}>
              <SelectTrigger><SelectValue placeholder="Choisir un client existant…" /></SelectTrigger>
              <SelectContent className="bt-skin">
                {worksites.filter((w) => w.client_name !== 'Autre' && w.id !== attributeTarget?.worksiteId).map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full" disabled={attrBusy} onClick={() => setClientOpen(true)}>
              <Building2 className="h-4 w-4 mr-2" /> Créer un nouveau client…
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Team export */}
      <Dialog open={exportOpen} onOpenChange={(o) => { setExportOpen(o); if (o) setExportRange(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>Exporter les heures de l'équipe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => { const t = new Date(); setExportRange({ from: t, to: t }); }}>Aujourd'hui</Button>
              <Button variant="outline" size="sm" onClick={() => setExportRange({ from: currentWeekStart, to: addDays(currentWeekStart, 5) })}>Cette semaine</Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"><CalendarRange className="h-4 w-4 mr-1" /> Créneau</Button>
                </PopoverTrigger>
                <PopoverContent className="bt-skin w-auto p-0" align="end">
                  <Calendar mode="range" numberOfMonths={1} locale={fr}
                    selected={exportRange ?? undefined}
                    onSelect={(r) => { if (r?.from) setExportRange({ from: r.from, to: r.to ?? r.from }); }} />
                </PopoverContent>
              </Popover>
            </div>
            {exportRange
              ? <p className="text-center text-sm font-medium capitalize">{format(exportRange.from, 'd MMM', { locale: fr })} → {format(exportRange.to, 'd MMM yyyy', { locale: fr })}</p>
              : <p className="text-center text-sm text-muted-foreground">Choisis une période à exporter.</p>}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => runExport('excel')} disabled={exporting || !exportRange}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />} Excel
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => runExport('pdf')} disabled={exporting || !exportRange}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />} PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Verrouille les saisies exportées (paie).</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export one worker — pick a worker, then their fiche (calendar + Excel/PDF, no lock) */}
      <Dialog open={exportWorkerOpen} onOpenChange={setExportWorkerOpen}>
        <DialogContent className="bt-skin max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Exporter un salarié</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Choisis un salarié : sa fiche s'ouvre avec le calendrier (jour / semaine / période) et le téléchargement Excel / PDF. Cet export ne verrouille pas les heures.</p>
            <div className="space-y-1">
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun salarié</p>
              ) : (
                workers.map(w => (
                  <button
                    key={w.id}
                    onClick={() => { setExportWorkerOpen(false); setFicheMode('hours'); setFicheWorker(w); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium truncate">{w.first_name} {w.last_name}</span>
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cell add — a client on a specific day */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>Ajouter un client</DialogTitle></DialogHeader>
          <form onSubmit={confirmAdd} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={addWorksite} onValueChange={setAddWorksite}>
                <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                <SelectContent className="bt-skin">
                  {worksites.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note pour le poseur (optionnel)</Label>
              <Textarea value={addNote} onChange={(e) => setAddNote(e.target.value)} rows={2} placeholder="Ex : code portail 1234…" />
            </div>
            <Button type="submit" className="w-full" disabled={addSaving}>
              {addSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Ajouter au planning
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Absence start — optional end date via calendar */}
      <Dialog open={!!pendingAbsence} onOpenChange={(o) => { if (!o) setPendingAbsence(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendingAbsence ? `${ABSENCE_STATUS_LABELS[pendingAbsence.type] || pendingAbsence.type} — ${pendingAbsence.worker.first_name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {pendingAbsence && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">Choisis la période (clique le 1er jour puis le dernier). Dernier jour vide = jusqu'au retour « Présent ».</p>
              <div className="flex justify-center">
                <Calendar
                  mode="range"
                  selected={absRange}
                  onSelect={setAbsRange}
                  numberOfMonths={1}
                  locale={fr}
                  weekStartsOn={1}
                  defaultMonth={absRange?.from || new Date(`${pendingAbsence.fromStr}T00:00:00`)}
                />
              </div>
              <p className="text-center text-sm">
                {absRange?.from
                  ? <>Du <strong className="capitalize">{format(absRange.from, 'd MMM', { locale: fr })}</strong>{absRange.to ? <> au <strong className="capitalize">{format(absRange.to, 'd MMM yyyy', { locale: fr })}</strong></> : <span className="text-muted-foreground"> (jusqu'au retour)</span>}</>
                  : <span className="text-muted-foreground">Aucune date choisie</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStatusTarget({ worker: pendingAbsence.worker, fromStr: pendingAbsence.fromStr }); setPendingAbsence(null); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Retour
                </Button>
                <Button className="flex-1" onClick={confirmAbsence} disabled={absSaving || !absRange?.from}>
                  {absSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Affectation popup — ONLY this day's assignment */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="bt-skin max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.worksite?.client_name || 'Intervention'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 pt-1">
              {/* Client (read-only) + link to the separate fiche */}
              <div className="rounded-lg border bg-muted/30 p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{editing.worksite?.client_name || 'Client'}</p>
                  {(editing.worksite?.address || editing.worksite?.city) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[editing.worksite?.address, editing.worksite?.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                {editing.worksite && (
                  <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => openClientFiche(editing.worksite)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Fiche client
                  </Button>
                )}
              </div>

              {/* Optional fixed hour (rare RDV) */}
              <div className="space-y-1.5">
                <Label>Heure (facultatif)</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={editHour} onChange={(e) => setEditHour(e.target.value)} className="w-32" />
                  <span className="text-xs text-muted-foreground">Seulement pour un RDV à heure fixe.</span>
                </div>
              </div>

              {/* Note for the poseur */}
              <div className="space-y-1.5">
                <Label>Note pour le poseur</Label>
                <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="Ex : code portail 1234, attention au chien…" />
              </div>

              {/* Real hours (read-only) */}
              <div className="rounded-lg border bg-muted/30 p-2.5 text-sm">
                <span className="font-medium">Heures déclarées : </span>
                {editRealAgg ? (
                  <span className="text-green-700">{editRealAgg.start?.substring(0, 5)}–{editRealAgg.end?.substring(0, 5)} · <strong>{formatMinutes(editRealAgg.minutes)} réelles</strong>{editRealAgg.count > 1 ? ` (${editRealAgg.count} saisies)` : ''}</span>
                ) : (
                  <span className="text-muted-foreground">pas encore déclaré</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveAffectation} disabled={savingEdit}>
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
                <Button variant="outline" className="text-destructive" onClick={deleteAffectation} disabled={deletingEdit}>
                  {deletingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />} Retirer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Client fiche — permanent client data (separate) */}
      <Dialog open={!!clientFiche} onOpenChange={(o) => { if (!o) setClientFiche(null); }}>
        <DialogContent className="bt-skin max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Fiche client</DialogTitle>
          </DialogHeader>
          {clientFiche && (
            <div className="space-y-3 pt-1">
              <div className="space-y-2"><Label>Nom du client</Label><Input value={wsName} onChange={(e) => setWsName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>Type de produit</Label><Input value={wsProduct} onChange={(e) => setWsProduct(e.target.value)} /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={wsPhone} onChange={(e) => setWsPhone(e.target.value)} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={wsEmail} onChange={(e) => setWsEmail(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>Ville</Label><Input value={wsCity} onChange={(e) => setWsCity(e.target.value)} /></div>
                <div className="space-y-2"><Label>Adresse</Label><Input value={wsAddress} onChange={(e) => setWsAddress(e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} rows={2} /></div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={saveClientFiche} disabled={savingWs}>
                  {savingWs && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
                <Button variant="outline" onClick={archiveClientFiche} disabled={wsBusy}>
                  <Archive className="h-4 w-4 mr-1" /> Archiver
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={deleteClientFiche} disabled={wsBusy} title="Supprimer (seulement si aucune donnée rattachée)">
                  <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clients list — open any client fiche */}
      <Dialog open={clientsListOpen} onOpenChange={setClientsListOpen}>
        <DialogContent className="bt-skin max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Clients</DialogTitle></DialogHeader>
          <div className="pt-1">
            <Button variant="outline" size="sm" className="mb-2 w-full" onClick={() => { setClientsListOpen(false); setClientOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Nouveau client
            </Button>
            <div className="space-y-1">
              {worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun client</p>
              ) : (
                worksites.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => { setClientsListOpen(false); openClientFiche(ws); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{ws.client_name}</span>
                      {(ws.city || ws.product_type) && <span className="block truncate text-xs text-muted-foreground">{[ws.product_type, ws.city].filter(Boolean).join(' · ')}</span>}
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nouveau client */}
      <Dialog open={clientOpen} onOpenChange={(o) => { setClientOpen(o); if (!o) resetClient(); }}>
        <DialogContent className="bt-skin max-w-md">
          <DialogHeader><DialogTitle>Nouveau client / chantier</DialogTitle></DialogHeader>
          <form onSubmit={createClient} className="space-y-3 pt-2">
            <div className="space-y-2"><Label>Nom du client *</Label><Input value={cName} onChange={(e) => setCName(e.target.value)} required disabled={cSaving} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type de produit</Label><Input placeholder="Stores, volets…" value={cProduct} onChange={(e) => setCProduct(e.target.value)} disabled={cSaving} /></div>
              <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} disabled={cSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} disabled={cSaving} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Ville</Label><Input value={cCity} onChange={(e) => setCCity(e.target.value)} disabled={cSaving} /></div>
              <div className="space-y-2"><Label>Adresse</Label><Input value={cAddress} onChange={(e) => setCAddress(e.target.value)} disabled={cSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} disabled={cSaving} /></div>
            <Button type="submit" className="w-full" disabled={cSaving}>
              {cSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Créer le client
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nouveau salarié */}
      <Dialog open={workerOpen} onOpenChange={(o) => { setWorkerOpen(o); if (!o) resetWorker(); }}>
        <DialogContent className="bt-skin max-w-md">
          <DialogHeader><DialogTitle>Nouveau salarié</DialogTitle></DialogHeader>
          <form onSubmit={createWorker} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Prénom *</Label><Input value={wFirst} onChange={(e) => setWFirst(e.target.value)} required disabled={wSaving} /></div>
              <div className="space-y-2"><Label>Nom *</Label><Input value={wLast} onChange={(e) => setWLast(e.target.value)} required disabled={wSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={wEmail} onChange={(e) => setWEmail(e.target.value)} required disabled={wSaving} /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)} disabled={wSaving} /></div>
            <Button type="submit" className="w-full" disabled={wSaving}>
              {wSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Envoyer l'invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
