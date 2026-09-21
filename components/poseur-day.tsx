'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Copy, AlertTriangle, FolderOpen, Trash2, Paperclip, Hammer, CheckCircle2, MapPin } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  addPendingEntry, getPendingEntries, removePendingEntry, updatePendingEntry, clearPendingEntriesForDate,
  generateLocalId, OFFLINE_CHANGED_EVENT, OFFLINE_SYNCED_EVENT, PendingEntry,
} from '@/lib/offline-store';
import { syncAllPending } from '@/lib/offline-sync';
import { planningsToMaterialise, remainingPlannings } from '@/lib/work-status';
import { fmtHeure } from '@/lib/corrections';
import { positionUtile, fmtPrecision, fmtCoord } from '@/lib/position';
import { parisHHmm } from '@/lib/utils';
import { TimeCylinder, snapToGrid } from '@/components/time-cylinder';
import LiveTimer from '@/components/live-timer';
import TeamDay from '@/components/team-day';
import ChantierDocuments from '@/components/chantier-documents';

/** Une correction reçue du bureau, telle que la journée du salarié l'affiche. */
interface CorrectionVue {
  id: string;
  entry_id: string;
  old_start: string; old_end: string;
  new_start: string; new_end: string;
  corrected_at: string;
  /**
   * QUI A CORRIGÉ, AU SENS DU SALARIÉ : le bureau, ou son chef d'équipe.
   *
   * On lit le RÔLE, pas l'identifiant. Lire `corrected_by` et le comparer à
   * l'admin connu aurait affiché « le bureau » pour une correction faite par
   * le chef — et la notification reçue sur le téléphone, elle, disait « ton
   * chef ». Deux messages contradictoires sur la même correction, c'est
   * exactement le doute que cette étape existe pour lever.
   */
  corrected_by_role: 'admin' | 'lead';
}

/**
 * Un endroit enregistré sur MA journée (étape 26).
 *
 * Le salarié voit ce qui a été collecté sur lui, sans avoir à le demander.
 * Ce n'est pas une politesse : une donnée personnelle collectée en silence est
 * une donnée collectée illégalement, et elle ne prouverait plus rien.
 */
interface PositionVue {
  id: string;
  entry_id: string;
  moment: 'start' | 'end';
  latitude: string;
  longitude: string;
  accuracy_m: number | null;
  captured_at: string;
}

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

// "h" format for the editor duration boxes (ex: 4h00).
function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
// ":" format used everywhere on « Ma journée » (ex: 6:45).
function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// Worked duration of a slot (break is always 0 in the slot model).
function calculateTotalMinutes(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s - breakMins);
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * Au-delà de ce trou, on ne demande plus « Route ou Pause ? ».
 *
 * CE QUI A ÉTÉ VU EN VRAI : « 5:00 entre 17:00 et 22:00 — c'était quoi ? »
 * Personne ne fait cinq heures de route entre deux chantiers. Un trou de cette
 * taille ne raconte pas un trajet ni une pause : il raconte que la journée
 * s'est arrêtée puis a repris.
 *
 * POURQUOI 2 h ET PAS 1 h 30. Une pause déjeuner de deux heures existe
 * réellement dans le bâtiment, et un trajet vers un chantier éloigné peut
 * friser les deux heures. Couper à 1 h 30 ferait disparaître la question sur
 * des trous que le salarié aurait légitimement qualifiés — et, chez une
 * entreprise qui paie le trajet, ce trajet cesserait d'être payable sans que
 * personne ne s'en aperçoive. À 2 h, on ne supprime que l'absurde.
 *
 * C'est un seuil de PRODUIT, pas une vérité : une ligne à changer si tu veux
 * 1 h 30 ou 3 h.
 *
 * CE QUE LE PLAFOND NE FAIT PAS : effacer une réponse déjà donnée. Un trou
 * qu'un salarié a qualifié reste affiché et reste compté, même au-dessus du
 * seuil. On arrête de poser des questions absurdes ; on ne réécrit pas
 * silencieusement ce qu'un humain a répondu.
 */
const GAP_ASK_MAX_MINUTES = 120;

// Pauses = the gaps between consecutive (sorted) slots. Computed, never stored.
// Les créneaux sont replacés sur une ligne de temps absolue : une intervention
// qui franchit minuit se prolonge sur le jour suivant, exactement comme dans
// calculateTotalMinutes. Sans ça, un poste de nuit fabriquait une pause fantôme
// de plusieurs heures. On avance aussi la borne de fin au plus tard rencontré,
// pour que deux créneaux qui se chevauchent n'inventent pas de trou entre eux.
type GapSlot = { start: string; end: string; key: string; gap: 'route' | 'pause' | null };
type Gap = { start: string; end: string; minutes: number; key: string; gap: 'route' | 'pause' | null };

function computePauses(slots: GapSlot[]): Gap[] {
  const abs = slots
    .filter((s) => s.start && s.end)
    .map((s) => {
      const start = toMin(s.start);
      let end = toMin(s.end);
      if (end < start) end += 24 * 60; // franchit minuit
      return { start, end, endLabel: s.end, startLabel: s.start, key: s.key, gap: s.gap };
    })
    .sort((a, b) => a.start - b.start);

  const out: Gap[] = [];
  let prevEnd = -1;
  let prevEndLabel = '';
  for (const slot of abs) {
    if (prevEnd >= 0 && slot.start > prevEnd) {
      // `key` désigne le créneau QUI SUIT le trou : c'est sur lui que la
      // réponse « route ou pause » est enregistrée.
      out.push({ start: prevEndLabel, end: slot.startLabel, minutes: slot.start - prevEnd, key: slot.key, gap: slot.gap });
    }
    if (slot.end > prevEnd) { prevEnd = slot.end; prevEndLabel = slot.endLabel; }
  }
  return out;
}

const DAY_CSS = `
.bt-day{display:flex;flex-direction:column;height:100%;min-height:0;flex:1}
.bt-day-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(var(--phdr-h, 132px) + 16px) 16px 6px}
.bt-day:has(.bt-net) .bt-day-scroll{padding-top:12px}
.bt-day-scroll::-webkit-scrollbar{display:none}

.bt-net{flex:none;color:#fff;padding:7px 18px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;margin-top:var(--phdr-h, 132px);position:relative;z-index:20}
.bt-net-off{background:#C0461F}
.bt-net-sync{background:#2a2620;color:#FFC21A}
.bt-net-dot{width:7px;height:7px;background:currentColor;border-radius:50%;flex:none}

.bt-total{background:#15120F;color:#F2EDE3;border-radius:20px;padding:20px;position:relative;overflow:hidden}
.bt-total-ruban{position:absolute;top:0;right:0;width:88px;height:9px;background:repeating-linear-gradient(45deg,#15120F 0 7px,#FFC21A 7px 14px)}
.bt-total-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#a59c86;margin-bottom:8px}
.bt-total-big{font-family:'JetBrains Mono',monospace;font-size:52px;font-weight:700;letter-spacing:-.02em;line-height:.9}
.bt-total-unit{font-size:15px;font-weight:700;color:#a59c86;margin-left:4px}
.bt-stats{display:flex;gap:8px;margin-top:16px}
.bt-stat{flex:1;background:#211D19;border-radius:11px;padding:10px 12px}
.bt-stat-n{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;color:#F2EDE3;line-height:1}
.bt-stat-l{font-size:11px;font-weight:600;color:#a59c86;margin-top:2px}
.bt-stat.on{background:#FFC21A}
.bt-stat.on .bt-stat-n{color:#15120F;font-family:'Archivo',sans-serif;font-size:16px;font-weight:900;line-height:1.1}
.bt-stat.on .bt-stat-l{color:#7a5e00;font-weight:700}

.bt-meal{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:13px 15px;margin-top:12px}
.bt-meal-emoji{font-size:22px}
.bt-meal-t{font-size:15px;font-weight:800;color:#15120F}
.bt-meal-s{font-size:12.5px;color:#6E6A63;font-weight:500}
.bt-switch{width:54px;height:31px;background:#cfc8b8;border-radius:30px;position:relative;flex:none;border:none;cursor:pointer;transition:background .15s;padding:0}
.bt-switch.on{background:#15120F}
.bt-switch i{position:absolute;top:3px;left:3px;width:25px;height:25px;background:#fff;border-radius:50%;transition:left .15s,background .15s}
.bt-switch.on i{left:26px;background:#FFC21A}

.bt-sec{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin:24px 4px 12px}

.bt-iv{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:12px 14px;margin-bottom:9px}
.bt-iv.draft{box-shadow:inset 4px 0 0 #C0461F}
.bt-iv.sent{box-shadow:inset 4px 0 0 #2FA36B}
.bt-iv.ok{box-shadow:inset 4px 0 0 #1F7A4D}
.bt-iv.off{background:#FFFBF4;border:1.5px dashed #C0461F}
.bt-iv-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}
.bt-iv-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:800;letter-spacing:-.01em;color:#15120F}
.bt-iv-city{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#6E6A63;font-weight:600}
.bt-iv-tap{cursor:pointer;transition:border-color .14s ease,transform .06s ease}
.bt-iv-tap:hover{border-color:rgba(21,18,15,.35)}
.bt-iv-tap:active{transform:scale(.995)}
.bt-iv-row{display:flex;align-items:center;gap:10px}
.bt-iv-cta{flex:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#a87c1e;white-space:nowrap}
.bt-badge{flex:none;display:flex;align-items:center;gap:5px;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:800;white-space:nowrap}
.bt-badge-sent{background:#E4F2E9;border:1px solid #B7DCC4;color:#1F7A4D}
.bt-badge-sent .dot{width:14px;height:14px;background:#2FA36B;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:900}
.bt-badge-draft{background:#FFF1CC;border:1px solid #E8CE7A;color:#8a6d05}
.bt-badge-off{background:#FBE3D8;border:1px solid #E8B79E;color:#9a3b14}
.bt-badge-wait{background:#FCEADF;border:1px solid #F0C49A;color:#C0461F}
.bt-badge-ok{background:#1F7A4D;border:1px solid #1A6A43;color:#fff}
.bt-badge-ok .dot{width:14px;height:14px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#1F7A4D;font-size:9px;font-weight:900}
.bt-iv-docs{flex:none;display:inline-flex;align-items:center;gap:2px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#6E6A63}
.bt-iv-times{display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#15120F}
.bt-iv-times-v{flex:none;white-space:nowrap}
.bt-iv-times .dot{width:4px;height:4px;background:#c4bdae;border-radius:50%}
/* Correction reçue du bureau : visible sans être alarmante. Le salarié doit la
   REMARQUER, pas croire qu'il a fait une faute. */
.bt-iv-corr{margin-top:8px;display:flex;align-items:center;gap:7px;background:#FFF6E0;border:1px solid #EAD08A;border-radius:9px;padding:6px 9px}
.bt-iv-corr-t{font-size:12.5px;font-weight:800;color:#6b5a2e;line-height:1.35}
.bt-iv-corr-v{font-family:'JetBrains Mono',monospace;font-weight:700}
/* L'endroit enregistré. Gris, discret, factuel : ce n'est ni une alerte ni une
   récompense, c'est le compte-rendu de ce qui a été gardé sur lui. */
.bt-iv-geo{margin-top:8px;display:flex;align-items:flex-start;gap:7px;font-size:12px;color:#6E6A63;font-weight:600;line-height:1.45}
.bt-iv-geo svg{flex:none;margin-top:1px;color:#9a948a}
.bt-iv-geo-v{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#3a352f}
.bt-iv-note{font-size:13px;color:#6E6A63;margin-top:8px}
.bt-iv-reserve{display:inline-flex;align-items:center;gap:5px;margin-top:7px;font-size:12px;font-weight:800;border-radius:7px;padding:3px 9px}
.bt-iv-reserve.avec{background:#FCEADF;border:1px solid #F0C49A;color:#C0461F}
.bt-iv-reserve.sans{background:#EAF6EF;border:1px solid #BBE0CC;color:#1F7A4D}
.bt-iv-reserve.encours{background:#FFF6E0;border:1px solid #EAD08A;color:#8a6d05}
.bt-iv-reserve.corrige{background:#EAF6EF;border:1px solid #BBE0CC;color:#1F7A4D}
.bt-iv-reserve.levee{background:#EFEDE8;border:1px solid #D6D1C6;color:#5c574f}
.bt-iv-fixbtn{display:inline-flex;align-items:center;gap:6px;margin-top:7px;border:1.5px solid #1F7A4D;background:#fff;color:#1F7A4D;border-radius:9px;padding:6px 11px;font-family:inherit;font-weight:800;font-size:12.5px;cursor:pointer}
.bt-iv-fixbtn:disabled{opacity:.55}
.bt-iv-fixundo{margin-left:7px;border:none;background:none;color:#8a8378;font-family:inherit;font-size:11.5px;font-weight:700;text-decoration:underline;cursor:pointer;padding:0}
.bt-iv-acts{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.bt-iv-mod{flex:1;min-width:110px;border:1.5px solid #15120F;background:transparent;border-radius:10px;padding:10px;font-weight:800;font-size:13.5px;color:#15120F;cursor:pointer;font-family:inherit}
.bt-iv-doc{flex:none;border:1.5px solid rgba(21,18,15,.18);background:#fff;border-radius:10px;padding:10px 12px;font-weight:800;font-size:13.5px;color:#15120F;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.bt-iv-doc:hover{border-color:#15120F;background:#FBF6EA}
.bt-plan-doc{width:100%;justify-content:center;margin-top:8px}
.bt-iv-del{flex:none;border:none;background:#15120F;border-radius:10px;padding:10px 13px;font-weight:800;font-size:13.5px;color:#F2EDE3;cursor:pointer;font-family:inherit}

.bt-iv-cancel{background:transparent;border:1px solid rgba(21,18,15,.12);border-radius:16px;padding:13px 15px;margin-bottom:11px;opacity:.55;display:flex;align-items:center;justify-content:space-between;gap:10px}
.bt-cancel-name{font-size:16px;font-weight:800;color:#6E6A63;text-decoration:line-through}
.bt-cancel-time{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#9a948a;font-weight:600;text-decoration:line-through}
.bt-cancel-badge{flex:none;font-size:11px;font-weight:800;color:#9a948a;border:1px solid rgba(21,18,15,.18);border-radius:7px;padding:4px 9px;white-space:nowrap}

.bt-iv-plan{background:transparent;border:1.5px dashed rgba(21,18,15,.28);border-radius:14px;padding:12px 14px;margin-bottom:9px}
.bt-plan-k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin-bottom:4px}
.bt-plan-btn{width:100%;border:none;background:#15120F;border-radius:11px;padding:13px;font-weight:800;font-size:14.5px;color:#FFC21A;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;margin-top:12px;font-family:inherit}

.bt-gap{display:flex;align-items:center;gap:10px;padding:8px 12px;margin:6px 0;border-left:2px dashed rgba(21,18,15,.22);background:rgba(21,18,15,.03);border-radius:0 10px 10px 0}
.bt-gap-t{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#56514a}
.bt-gap-d{font-family:'JetBrains Mono',monospace;font-weight:700;color:#15120F}
.bt-gap-btns{display:flex;gap:6px;flex:none}
.bt-gap-b{border:1.5px solid rgba(21,18,15,.2);background:#fff;border-radius:8px;padding:6px 10px;font-family:inherit;font-size:12px;font-weight:800;color:#15120F;cursor:pointer}
.bt-gap-b.on{background:#15120F;color:#FFC21A;border-color:#15120F}
.bt-gap-ask{color:#9a3b14;font-weight:800}

.bt-empty{text-align:center;font-size:13.5px;color:#6E6A63;font-weight:600;padding:18px 0 4px}
.bt-ghostbtn{display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:transparent;border:1.5px solid rgba(21,18,15,.2);color:#15120F;border-radius:11px;padding:11px 16px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit}
.bt-dup{display:inline-flex;align-items:center;gap:7px;margin:6px auto 4px;background:transparent;border:1px solid rgba(21,18,15,.16);color:#6E6A63;border-radius:10px;padding:9px 15px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.bt-sentnote{text-align:center;font-size:12.5px;color:#9a948a;font-weight:600;padding:4px 0 2px}

.bt-day-dock{flex:none;padding:14px 16px calc(env(safe-area-inset-bottom) + 16px);background:#F2EDE3;border-top:1px solid rgba(21,18,15,.1);display:flex;gap:10px}
.bt-fab{flex:none;width:58px;border:2px solid #15120F;background:#F2EDE3;border-radius:15px;font-weight:900;font-size:26px;color:#15120F;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit}
.bt-send{flex:1;border:none;background:#FFC21A;border-radius:15px;padding:17px;font-weight:900;font-size:17px;color:#15120F;box-shadow:0 4px 0 #C99300;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit}
.bt-send:disabled{background:#e7ddc4;color:#9a948a;box-shadow:0 4px 0 #cfc4a5;cursor:default}
.bt-send.done{background:#E4F2E9;color:#1F7A4D;box-shadow:0 4px 0 #b7dcc4}

/* ===== ÉDITEUR PLEIN ÉCRAN ===== */
.bt-ed{position:fixed;inset:0;z-index:40;display:flex;justify-content:center;background:rgba(21,18,15,.35)}
.bt-ed-inner{width:100%;max-width:480px;height:100vh;height:100svh;height:100dvh;background:#F2EDE3;display:flex;flex-direction:column;position:relative;overflow:hidden}
.bt-ed-hdr{background:#15120F;color:#F2EDE3;flex:none;padding:calc(env(safe-area-inset-top) + 16px) 18px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bt-ed-cancel{border:none;background:transparent;color:#a59c86;font-size:15px;font-weight:700;padding:6px 2px;cursor:pointer;font-family:inherit;flex:none;min-width:54px;text-align:left}
.bt-ed-title{font-size:17px;font-weight:900;letter-spacing:-.01em;text-align:center;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-ed-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 18px 18px}
.bt-ed-scroll::-webkit-scrollbar{display:none}
.bt-ed-dock{flex:none;padding:13px 18px calc(env(safe-area-inset-bottom) + 18px);background:#F2EDE3;border-top:1px solid rgba(21,18,15,.12);box-shadow:0 -10px 24px -12px rgba(21,18,15,.18)}

.bt-site-search{width:100%;font-family:'Archivo',sans-serif;font-size:15px;font-weight:500;padding:11px 13px;border:1.5px solid rgba(21,18,15,.18);border-radius:12px;background:#fff;outline:none;color:#15120F;margin-bottom:9px}
.bt-site-search::placeholder{color:#b3aca0}
.bt-site-search:focus{border-color:#15120F}
.bt-site-empty{padding:16px;text-align:center;color:#9a948a;font-weight:600;font-size:13px}
.bt-site{border:1px solid rgba(21,18,15,.14);text-align:left;background:#fff;color:#15120F;border-radius:13px;padding:14px 15px;display:flex;align-items:center;gap:12px;width:100%;cursor:pointer;margin-bottom:8px;font-family:inherit}
.bt-site.on{background:#15120F;color:#F2EDE3;border-color:#15120F}
.bt-site.other{border-style:dashed;border-color:rgba(21,18,15,.3)}
.bt-site-name{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em}
.bt-site-city{display:block;font-size:13px;font-weight:600;color:#6E6A63}
.bt-site.on .bt-site-city{color:#a59c86}
.bt-rdo{flex:none;width:22px;height:22px;border:2px solid rgba(21,18,15,.2);border-radius:50%;display:flex;align-items:center;justify-content:center}
.bt-site.on .bt-rdo{width:26px;height:26px;border:none;background:#FFC21A;color:#15120F;font-weight:900;font-size:14px;border-radius:50%}
.bt-rdo-plus{flex:none;width:26px;height:26px;background:#15120F;color:#FFC21A;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px}

.bt-times{display:flex;gap:9px;align-items:stretch}
.bt-timecard{flex:1;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:13px;padding:11px 14px;display:flex;flex-direction:column;gap:3px;cursor:pointer;text-align:left;font-family:inherit}
.bt-timecard:active{border-color:#15120F}
.bt-timecard .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-timecard .v{font-family:'JetBrains Mono',monospace;font-size:25px;font-weight:700;color:#15120F;line-height:1}
.bt-dur{flex:none;width:84px;background:#15120F;border-radius:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFC21A}
.bt-dur .k{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#a59c86;font-weight:700}
.bt-dur .v{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700}
.bt-times-hint{text-align:center;font-size:12.5px;color:#9a948a;font-weight:600;margin-top:8px}

.bt-pause-auto{display:flex;align-items:center;gap:8px;margin-top:16px;background:rgba(255,194,26,.12);border:1px solid rgba(255,194,26,.4);border-radius:12px;padding:11px 13px;font-size:12.5px;font-weight:700;color:#7a5e00}

.bt-recep{display:flex;gap:8px}
.bt-recep-b{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:13px;padding:11px 6px;font-weight:800;font-size:12.5px;color:#6E6A63;cursor:pointer;font-family:inherit;text-align:center;line-height:1.1}
.bt-recep-b svg{opacity:.65}
.bt-recep-b.encours.on{border-color:#C98A12;background:#FFF6E0;color:#8a6d05}
.bt-recep-b.sans.on{border-color:#1F7A4D;background:#EAF6EF;color:#1F7A4D}
.bt-recep-b.avec.on{border-color:#C0461F;background:#FCEADF;color:#C0461F}
.bt-recep-b.on svg{opacity:1}
.bt-recep-hint{margin-top:8px;font-size:12.5px;font-weight:600;color:#C0461F;background:#FCEADF;border:1px solid #F0C49A;border-radius:11px;padding:10px 12px}
.bt-recep-hint strong{font-weight:900}
.bt-note{width:100%;font-family:inherit;font-size:15.5px;font-weight:500;color:#15120F;padding:14px 15px;border:1.5px solid rgba(21,18,15,.16);border-radius:13px;background:#fff;outline:none;resize:none}

.bt-save{width:100%;border:none;background:#FFC21A;border-radius:13px;padding:15px;font-weight:900;font-size:16px;color:#15120F;box-shadow:0 4px 0 #C99300;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit}
.bt-save:disabled{opacity:.6;cursor:default}
.bt-retire{width:100%;background:transparent;border:none;color:#C0461F;font-weight:800;font-size:14px;padding:10px;cursor:pointer;margin-bottom:8px;font-family:inherit}
.bt-ed-dock-row{display:flex;gap:8px;margin-bottom:9px}
.bt-ed-doc{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid #15120F;background:#fff;border-radius:12px;padding:12px;font-weight:800;font-size:14px;color:#15120F;cursor:pointer;font-family:inherit}
.bt-ed-doc:active{transform:translateY(1px)}
.bt-ed-trash{flex:none;width:50px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid rgba(192,70,31,.45);background:#fff;color:#C0461F;border-radius:12px;cursor:pointer}
.bt-ed-trash:hover{background:#F4D9D1}
.bt-ed-trash:disabled{opacity:.5}

/* ===== TIROIR MOLETTE ===== */
.bt-overlay{position:absolute;inset:0;background:rgba(21,18,15,.5);z-index:8;opacity:0;pointer-events:none;transition:opacity .25s ease}
.bt-overlay.open{opacity:1;pointer-events:auto}
.bt-sheet{position:absolute;left:0;right:0;bottom:0;background:#15120F;border-radius:24px 24px 0 0;z-index:9;padding:12px 16px calc(env(safe-area-inset-bottom) + 22px);transform:translateY(106%);transition:transform .32s cubic-bezier(.22,1,.36,1)}
.bt-sheet.open{transform:translateY(0)}
.bt-grip{width:42px;height:5px;background:#3a352f;border-radius:3px;margin:2px auto 12px}
.bt-seg{display:flex;background:#211D19;border-radius:11px;padding:4px;gap:4px;margin-bottom:8px}
.bt-segb{flex:1;border:none;background:transparent;color:#a59c86;border-radius:8px;padding:9px;font-weight:800;font-size:13px;cursor:pointer;text-align:center;font-family:inherit}
.bt-segb .lbl{display:block}
.bt-segb .v{font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:700;color:#6E6A63;display:block;margin-top:1px}
.bt-segb.on{background:#000}
.bt-segb.on .lbl{color:#FFC21A}
.bt-segb.on .v{color:#F2EDE3}
.bt-sheet-dur{display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:2px}
.bt-sheet-dur .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#a59c86;font-weight:700}
.bt-sheet-dur .v{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#FFC21A}
.bt-molette{display:flex;justify-content:center;padding:4px 0 2px}
`;

// ─── main ──────────────────────────────────────────────────────────────────────

type SlotTarget =
  | { kind: 'planned'; planningId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'pending'; localId: string }
  | { kind: 'new' };

export default function PoseurDay({ date: dateProp, topBanner }: { date?: string; topBanner?: ReactNode } = {}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  // Ce que le bureau (ou le chef) a corrigé sur MES heures. Le salarié doit le
  // voir sur sa journée, même s'il n'a pas activé les notifications — une
  // correction qu'on ne découvre qu'en fin de mois est un litige en préparation.
  const [mesCorrections, setMesCorrections] = useState<Map<string, CorrectionVue[]>>(new Map());
  // Les endroits enregistrés sur mes journées (étape 26). Vide tant que
  // l'entreprise n'a pas activé le réglage — et c'est le cas par défaut.
  const [mesPositions, setMesPositions] = useState<Map<string, PositionVue[]>>(new Map());
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [docsByWorksite, setDocsByWorksite] = useState<Map<string, number>>(new Map()); // nb de documents par chantier (pastille 📎)
  const [planning, setPlanning] = useState<(Planning & { worksite: Worksite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Day-level panier repas (one per day).
  const [dayMeal, setDayMeal] = useState(false);

  // Inline slot editor
  const [openSlot, setOpenSlot] = useState<SlotTarget | null>(null);
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fObs, setFObs] = useState('');
  const [fReception, setFReception] = useState<'sans' | 'avec' | 'en_cours' | ''>(''); // statut du chantier : en cours / sans / avec réserve (facultatif)
  const [fSaving, setFSaving] = useState(false);
  // Chantier picker (existing chantiers only — workers don't create clients)
  const [fWorksiteId, setFWorksiteId] = useState('');
  const [chantierQuery, setChantierQuery] = useState(''); // recherche dans la liste des chantiers (nouvelle intervention)
  // Tiroir molette (purement présentation : quelle roue on règle)
  const [drawerField, setDrawerField] = useState<'start' | 'end' | null>(null);
  // Les pauses sont CALCULÉES automatiquement (les trous entre créneaux, via
  // computePauses ; break_minutes reste toujours 0). Plus de sélecteur manuel :
  // le salarié saisit seulement ses heures, la pause se déduit toute seule.

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Repeat this day onto other days (same chantier for several days).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyDates, setCopyDates] = useState<Date[]>([]);
  // A sent day is frozen; every change re-asks for confirmation (secretary informed).
  const [confirmCorrectOpen, setConfirmCorrectOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [lateOpen, setLateOpen] = useState(false);
  // Panneau Documents du chantier (photos/fichiers, consultable côté secrétaire aussi).
  // Le panneau Documents garde le contexte du moment où il a été ouvert :
  // l'éditeur d'intervention peut se refermer derrière lui, la pièce doit
  // rester rattachée à l'intervention depuis laquelle on l'a prise.
  const [docsWs, setDocsWs] = useState<{ id: string; name: string; entryId: string | null } | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  // Suppression d'une intervention : jamais sans confirmation (gant de chantier,
  // écran mouillé — un appui involontaire ne doit pas effacer une demi-journée).
  const [confirmDel, setConfirmDel] = useState<
    | { kind: 'entry'; entry: TimeEntryWithWorksite; sent: boolean }
    | { kind: 'pending'; localId: string }
    | null
  >(null);

  // « Ma journée » ne bascule pas au lendemain au beau milieu d'une saisie (la
  // date était recalculée à chaque rendu → heures enregistrées sur le mauvais
  // jour). Mais une appli laissée ouverte toute la nuit doit bien repasser sur
  // le nouveau jour : on rafraîchit au retour au premier plan et chaque minute,
  // seulement quand aucune fiche n'est ouverte.
  const [mountedToday, setMountedToday] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const date = dateProp || mountedToday;
  const editingOpen = openSlot !== null;
  useEffect(() => {
    if (dateProp) return;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const today = format(new Date(), 'yyyy-MM-dd');
      setMountedToday((prev) => (prev === today || editingOpen ? prev : today));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const id = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(id);
    };
  }, [dateProp, editingOpen]);
  const yesterday = format(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd');
  // Payroll cutoff: a day in a past month is locked — corrections go through the secretary.
  // Mois clos : c'est le bureau qui le décide, pas le calendrier. Avant, tout
  // mois passé était déclaré « clôturé » sur le téléphone alors que personne
  // n'avait rien clôturé et que la base laissait écrire.
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const monthLocked = closedMonths.has(date.slice(0, 7));

  /**
   * Met un refus du serveur en français de chantier.
   *
   * Les gardes posés en base parlent technique (« time_entries: le mois est
   * clôturé… »). Sans ça le salarié voyait « Impossible d'enregistrer » et ne
   * savait ni pourquoi, ni quoi faire. Le cas le plus fréquent : le bureau a
   * clôturé le mois pendant que l'application était ouverte.
   */
  const explainWriteError = (err: unknown, fallback: string): string => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (msg.includes('clôturé')) {
      setClosedMonths((prev) => new Set(prev).add(date.slice(0, 7)));
      return 'Le bureau vient de clôturer ce mois. Rapproche-toi de la secrétaire.';
    }
    if (msg.includes('ne redevient pas brouillon')) return 'Journée déjà envoyée : tu peux la corriger ou la retirer.';
    if (msg.includes('ne se réactive pas')) return 'Ce chantier a été retiré : ajoute-le à nouveau.';
    if (msg.includes('chantier hors de votre entreprise')) return "Ce chantier n'existe plus dans ton entreprise. Choisis-en un autre.";
    return fallback;
  };

  // Mois clôturés de l'entreprise. Lecture seule pour le salarié : il doit
  // savoir pourquoi c'est fermé plutôt que de se heurter à un refus muet.
  useEffect(() => {
    if (!user?.company_id) return;
    let stale = false;
    supabase.from('month_closures').select('month').eq('company_id', user.company_id)
      .then(({ data }) => {
        if (stale || !data) return;
        setClosedMonths(new Set((data as { month: string }[]).map((m) => m.month.slice(0, 7))));
      });
    return () => { stale = true; };
  }, [user?.company_id]);

  // Le temps de route est-il payé ? Réglage de l'entreprise, pas du logiciel.
  const [travelPaid, setTravelPaid] = useState(false);
  useEffect(() => {
    if (!user?.company_id) return;
    let stale = false;
    supabase.from('companies').select('travel_paid').eq('id', user.company_id).maybeSingle()
      .then(({ data }) => { if (!stale && data) setTravelPaid(!!(data as { travel_paid?: boolean }).travel_paid); });
    return () => { stale = true; };
  }, [user?.company_id]);

  /**
   * L'entreprise enregistre-t-elle l'endroit au pointage ? (étape 26)
   *
   * REQUÊTE SÉPARÉE, ET C'EST VOLONTAIRE. L'ajouter au `select` ci-dessus
   * aurait été plus économique — et aurait fait échouer la requête ENTIÈRE tant
   * que la colonne n'existe pas, emportant avec elle `travel_paid`, donc le
   * temps de route. Un réglage neuf ne doit pas pouvoir casser un réglage qui
   * marche. Ici, si la colonne manque, cette requête seule échoue, `false`
   * reste, et l'application se comporte exactement comme avant.
   */
  const [positionActive, setPositionActive] = useState(false);
  useEffect(() => {
    if (!user?.company_id) return;
    let stale = false;
    supabase.from('companies').select('position_tracking_enabled').eq('id', user.company_id).maybeSingle()
      .then(({ data }) => {
        if (!stale && data) setPositionActive(!!(data as { position_tracking_enabled?: boolean }).position_tracking_enabled);
      });
    return () => { stale = true; };
  }, [user?.company_id]);

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [entriesRes, worksitesRes, planningRes, docsRes] = await Promise.all([
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date).order('start_time'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date),
        supabase.from('documents').select('worksite_id').eq('company_id', user.company_id),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      const docCounts = new Map<string, number>();
      for (const d of (docsRes.data || []) as { worksite_id: string | null }[]) {
        if (d.worksite_id) docCounts.set(d.worksite_id, (docCounts.get(d.worksite_id) || 0) + 1);
      }
      setDocsByWorksite(docCounts);

      let worksitesData = worksitesRes.data || [];
      // Filet de sécurité (règle d'or : l'heure n'est jamais bloquée par le client) :
      // le chantier « Autre / Client inconnu » doit TOUJOURS exister. S'il manque,
      // on le (re)crée côté serveur (idempotent) puis on recharge la liste.
      if (!worksitesData.some((w) => w.client_name === 'Autre')) {
        await supabase.rpc('ensure_other_worksite');
        const reload = await supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name');
        if (!reload.error && reload.data) worksitesData = reload.data;
      }

      setEntries(entriesRes.data || []);

      // Les corrections des lignes du jour. La RLS ne me montre que les
      // miennes : pas besoin de filtrer par salarié ici.
      const idsDuJour = ((entriesRes.data || []) as TimeEntryWithWorksite[]).map((e) => e.id);
      if (idsDuJour.length > 0) {
        const { data: corr } = await supabase.from('time_entry_corrections')
          .select('id, entry_id, old_start, old_end, new_start, new_end, corrected_at, corrected_by_role')
          .in('entry_id', idsDuJour)
          .order('corrected_at', { ascending: true });
        const m = new Map<string, CorrectionVue[]>();
        for (const c of (corr || []) as CorrectionVue[]) {
          const l = m.get(c.entry_id) || [];
          l.push(c);
          m.set(c.entry_id, l);
        }
        setMesCorrections(m);

        // Les endroits enregistrés sur ces mêmes journées. Requête à part de
        // la précédente : tant que la table n'existe pas, celle-ci échoue
        // seule, la carte reste vide, et la journée s'affiche normalement.
        const { data: pos } = await supabase.from('time_entry_positions')
          .select('id, entry_id, moment, latitude, longitude, accuracy_m, captured_at')
          .in('entry_id', idsDuJour);
        const mp = new Map<string, PositionVue[]>();
        for (const p of (pos || []) as PositionVue[]) {
          const l = mp.get(p.entry_id) || [];
          l.push(p);
          mp.set(p.entry_id, l);
        }
        setMesPositions(mp);
      } else {
        setMesCorrections(new Map());
        setMesPositions(new Map());
      }
      setWorksites(worksitesData);
      setPlanning(planningRes.data || []);

      const pendForToday = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setDayMeal((entriesRes.data || []).some((e: TimeEntryWithWorksite) => e.meal_allowance) || pendForToday.some((e) => e.meal_allowance));
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger tes données');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  /**
   * Le salarié dit ce qu'était le trou : route entre deux chantiers, ou pause.
   * Enregistré sur l'intervention QUI SUIT le trou. Tant qu'il n'a pas répondu,
   * rien n'est compté comme travail — on ne décide pas à sa place.
   */
  const setGapKind = async (key: string, kind: 'route' | 'pause') => {
    if (!user) return;
    const [sort, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    try {
      if (sort === 'pe') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === id);
        if (!pend) return;
        removePendingEntry(user.id, id);
        addPendingEntry(user.id, { ...pend, gap_before: kind });
        setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
        return;
      }
      const { data: upd, error } = await supabase.from('time_entries')
        .update({ gap_before: kind }).eq('id', id).eq('user_id', user.id).select('id');
      if (error) throw error;
      if (!upd || upd.length === 0) { toast.error('Journée verrouillée : impossible de changer.'); return; }
      fetchData();
    } catch (err) {
      console.error('Error setting gap kind:', err);
      toast.error(explainWriteError(err, 'Impossible de garder ta réponse'));
    }
  };

  /**
   * Répondre reste possible après l'envoi de la journée.
   *
   * Sinon une journée envoyée avant d'avoir répondu gardait la question
   * affichée sans moyen d'y répondre, et la route déjà faite ne pouvait plus
   * entrer dans la paie. Sur une journée envoyée, ça passe par la même
   * confirmation qu'un changement d'horaire — la secrétaire voit la retouche.
   */
  const askGapKind = (key: string, kind: 'route' | 'pause') => {
    if (frozen) { askCorrect(() => setGapKind(key, kind)); return; }
    setGapKind(key, kind);
  };

  // ─── Envoi des saisies faites sans réseau ─────────────────────────────────
  // L'envoi lui-même est dans lib/offline-sync.ts et porte sur TOUS les jours en
  // attente, pas seulement celui affiché : une journée saisie lundi sans réseau
  // ne partait autrefois que si le salarié rouvrait ce lundi-là.

  const syncPendingEntries = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    if (getPendingEntries(user.id).length === 0) return;

    setSyncing(true);
    const { synced, blocked } = await syncAllPending(user.id);
    setSyncing(false);

    setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    if (blocked.length > 0) {
      const jours = Array.from(new Set(blocked.map((b) => b.work_date.split('-').reverse().join('/')))).join(', ');
      toast.error(`${blocked.length} chantier${blocked.length > 1 ? 's' : ''} du ${jours} ne part${blocked.length > 1 ? 'ent' : ''} pas. Préviens le bureau.`, { duration: 10000 });
    }
    if (synced > 0) {
      toast.success(`${synced} chantier${synced > 1 ? 's' : ''} envoyé${synced > 1 ? 's' : ''}`);
      fetchData();
    }
  }, [user, date, fetchData]);

  // ─── Online / offline listeners ───────────────────────────────────────────

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); syncPendingEntries(); };
    const handleOffline = () => setIsOnline(false);
    // La synchronisation peut partir d'ailleurs (le compte à rebours de la page
    // salarié, le retour au premier plan). Sans ces deux écoutes, la carte
    // « en attente » restait affichée et comptée alors que la ligne était déjà
    // partie, et le bouton d'envoi ne faisait plus rien.
    const handleChanged = () => {
      if (!user) return;
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    };
    const handleSynced = () => { handleChanged(); fetchData(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_CHANGED_EVENT, handleChanged);
    window.addEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_CHANGED_EVENT, handleChanged);
      window.removeEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    };
  }, [syncPendingEntries, user, date, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user) {
      const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setPendingEntries(pending);
      if (navigator.onLine && pending.length > 0) syncPendingEntries();
    }
  }, [user, date, syncPendingEntries]);

  // Reset the editor sub-state when the editor closes.
  useEffect(() => {
    if (!openSlot) setDrawerField(null);
  }, [openSlot]);

  // ─── Bouton « retour » du téléphone ─────────────────────────────────────────
  // En PWA installée, le geste retour d'Android quitte l'application si personne
  // ne consomme l'événement : le salarié se retrouve éjecté au lieu de refermer
  // son écran. On empile une entrée d'historique tant qu'une couche est ouverte
  // et on referme celle du dessus à chaque retour.
  const anyLayerOpen = !!(openSlot || drawerField || docsWs || confirmDel || confirmOpen || confirmCorrectOpen || lateOpen || repeatOpen);
  const [histTick, setHistTick] = useState(0);
  const closeTopLayer = useRef<() => void>(() => {});
  // Réassigné après chaque rendu, de la couche la plus haute à la plus basse.
  useEffect(() => {
    closeTopLayer.current = () => {
      if (drawerField) { setDrawerField(null); return; }
      if (confirmDel) { setConfirmDel(null); return; }
      if (confirmOpen) { setConfirmOpen(false); return; }
      if (confirmCorrectOpen) { setConfirmCorrectOpen(false); setPendingAction(null); return; }
      if (lateOpen) { setLateOpen(false); return; }
      if (repeatOpen) { setRepeatOpen(false); return; }
      if (docsWs) { setDocsWs(null); return; }
      if (openSlot) { setOpenSlot(null); }
    };
  });

  useEffect(() => {
    if (!anyLayerOpen || typeof window === 'undefined') return;
    let consumed = false;
    // On hérite de l'état posé par Next (marqueur __NA + arbre) : une entrée
    // sans ce marqueur ferait recharger toute la page si le navigateur y revenait.
    window.history.pushState({ ...(window.history.state || {}), btLayer: true }, '');
    const onPop = () => { consumed = true; closeTopLayer.current(); setHistTick((t) => t + 1); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Refermé depuis l'interface : on retire l'entrée qu'on avait empilée,
      // sinon le prochain retour ne ferait rien de visible. On ne le fait que si
      // cette entrée est toujours la courante : si l'utilisateur a quitté /poseur
      // entre-temps (déconnexion…), on ne doit surtout pas le renvoyer en arrière.
      if (!consumed && (window.history.state as { btLayer?: boolean } | null)?.btLayer) window.history.back();
    };
  }, [anyLayerOpen, histTick]);

  // ─── Day meal: keep exactly one flagged row per day (no migration) ──────────

  // Renvoie false si le panier n'a pas pu être écrit (ligne verrouillée, réseau…).
  const applyDayMeal = useCallback(async (value: boolean, flagModified = false): Promise<boolean> => {
    if (!user) return false;
    let ok = true;
    if (navigator.onLine) {
      // Le panier ne se pose que sur une ligne vivante et modifiable : jamais sur
      // une intervention retirée (elle ne compte plus) ni verrouillée (exportée).
      const { data, error: readErr } = await supabase.from('time_entries')
        .select('id, start_time, meal_allowance')
        .eq('user_id', user.id).eq('work_date', date)
        .neq('status', 'cancelled').eq('locked', false);
      if (readErr) return false;
      const rows = [...(data || [])].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      // Journée déjà envoyée : corriger le panier prévient la secrétaire (même logique que l'édition d'une intervention).
      const stamp = flagModified ? { modified_at: new Date().toISOString(), modified_by: user.id } : {};
      const setMeal = async (id: string, target: boolean) => {
        // `.select('id')` : une mise à jour filtrée par la RLS renvoie 0 ligne
        // SANS erreur ; on le détecte au lieu d'afficher un succès.
        const { data: upd, error } = await supabase.from('time_entries')
          .update({ meal_allowance: target, ...stamp }).eq('id', id).eq('user_id', user.id).select('id');
        if (error || !upd || upd.length === 0) ok = false;
      };
      // D'abord retirer le panier des autres lignes, PUIS le poser sur la
      // première : dans cet ordre, jamais deux paniers en même temps (index
      // unique en base).
      for (const r of rows.slice(1)) if (r.meal_allowance) await setMeal(r.id, false);
      if (rows[0] && rows[0].meal_allowance !== value) await setMeal(rows[0].id, value);
    }
    const pend = getPendingEntries(user.id).filter((e) => e.work_date === date);
    if (pend.length > 0) {
      const sorted = [...pend].sort((a, b) => a.start_time.localeCompare(b.start_time));
      clearPendingEntriesForDate(user.id, date);
      sorted.forEach((e, i) => addPendingEntry(user.id, { ...e, meal_allowance: i === 0 ? value : false }));
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    }
    return ok;
  }, [user, date]);

  const toggleDayMeal = async (value: boolean, flagModified = false) => {
    setDayMeal(value);
    try {
      const ok = await applyDayMeal(value, flagModified);
      if (!ok) {
        setDayMeal(!value);
        toast.error("Panier non pris en compte (journée verrouillée ou hors-ligne)");
      }
      if (navigator.onLine) fetchData();
    } catch (err) {
      console.error('Error setting meal:', err);
      setDayMeal(!value);
      toast.error('Panier non pris en compte');
    }
  };

  // ─── Inline editor open / save / delete ─────────────────────────────────────

  const openPlanned = (p: Planning & { worksite: Worksite }) => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'planned', planningId: p.id });
    setFStart(snapToGrid(p.estimated_start ? p.estimated_start.substring(0, 5) : '08:00'));
    setFEnd(snapToGrid(p.estimated_end ? p.estimated_end.substring(0, 5) : '17:00'));
    setFObs('');
    setFReception('');
  };
  const openEntry = (e: TimeEntryWithWorksite) => {
    setOpenSlot({ kind: 'entry', entryId: e.id });
    setFStart(snapToGrid(e.start_time?.substring(0, 5) || '08:00'));
    setFEnd(snapToGrid(e.end_time?.substring(0, 5) || '17:00'));
    setFObs(e.observation || '');
    setFReception(e.reception || '');
  };
  const openPending = (e: PendingEntry) => {
    setOpenSlot({ kind: 'pending', localId: e.localId });
    setFStart(snapToGrid(e.start_time.substring(0, 5)));
    setFEnd(snapToGrid(e.end_time.substring(0, 5)));
    setFObs(e.observation || '');
    setFReception(e.reception || '');
  };
  const openNew = () => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'new' });
    setFWorksiteId('');
    setChantierQuery('');
    // Heure de début pré-remplie à MAINTENANT (heure de Paris) ; fin = début + 1 h
    // (durée 1 h par défaut). Le salarié peut changer début ET fin aussitôt OU après
    // coup (ces possibilités existent déjà et restent inchangées). On ne touche à rien
    // d'autre dans la gestion des heures.
    const rawParis = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    let startParis = snapToGrid(rawParis);
    // Fin de soirée : 23:53 s'arrondit à 00:00, ce qui serait le début du jour →
    // on le ramène à 23:45. La fin reste « début + 1 h », quitte à franchir
    // minuit : une intervention qui déborde sur le lendemain est gérée (durée
    // calculée sur une ligne de temps absolue, comme les pauses de nuit).
    if (rawParis >= '23:00' && startParis === '00:00') startParis = '23:45';
    const [sh, sm] = startParis.split(':').map(Number);
    const endMin = (sh * 60 + sm + 60) % (24 * 60);
    const endParis = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    setFStart(startParis);
    setFEnd(endParis);
    setFObs('');
    setFReception('');
  };
  const cancelSlot = () => { setDrawerField(null); setOpenSlot(null); };

  // On a sent (frozen) day, any touch — edit a sent entry OR declare a remaining
  // chantier OR the meal — goes through this confirm, then unlocks the day.
  const askCorrect = (action: (() => void) | null) => { setPendingAction(() => action); setConfirmCorrectOpen(true); };
  const confirmCorrect = () => {
    setConfirmCorrectOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  };

  /**
   * « J'ai corrigé sur place ».
   *
   * Ce geste NE LÈVE PAS la réserve : le salarié ne se donne pas quitus sur son
   * propre travail. Il informe le bureau, qui constatera et lèvera. Tant que le
   * bureau n'est pas passé, le salarié peut se rétracter.
   */
  const markFixed = async (entryId: string, fixed: boolean) => {
    setFixingId(entryId);
    try {
      const { error } = await supabase.rpc('mark_reserve_fixed', {
        p_entry_id: entryId, p_fixed: fixed, p_note: null,
      });
      if (error) throw error;
      toast.success(fixed
        ? 'Signalé au bureau — la réserve sera levée par le bureau'
        : 'Signalement retiré');
      await fetchData();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Impossible de signaler.");
    } finally {
      setFixingId(null);
    }
  };

  const saveSlot = async () => {
    if (!user || !openSlot) return;
    if (!fStart || !fEnd) { toast.error("Indique l'heure de début et de fin"); return; }
    // Une réserve sans description n'a aucune valeur en cas de litige : on exige
    // le détail dès que « Avec réserve » est coché (l'écran l'annonce déjà).
    if (fReception === 'avec' && !fObs.trim()) { toast.error('Décris la réserve constatée'); return; }
    setFSaving(true);
    try {
      const totalMins = calculateTotalMinutes(fStart, fEnd, 0);
      let savedMsg = "C'est noté";

      // ── Update an existing entry ──
      if (openSlot.kind === 'entry') {
        const wasSubmitted = entries.find((e) => e.id === openSlot.entryId)?.status === 'submitted';
        if (wasSubmitted) savedMsg = 'Correction envoyée — la secrétaire est prévenue';
        const { data: upd, error } = await supabase.from('time_entries').update({
          start_time: fStart, end_time: fEnd, break_minutes: 0, observation: fObs.trim() || null,
          reception: fReception || null,
          // Editing an already-sent entry: flag it so the secretary sees the change.
          ...(wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: user.id } : {}),
        }).eq('id', openSlot.entryId).eq('user_id', user.id).select('id');
        if (error) throw error;
        // 0 ligne = la RLS a refusé (verrouillée, exportée…) : ce n'est pas un succès.
        if (!upd || upd.length === 0) { toast.error('Ce chantier n’a pas changé : il est verrouillé par le bureau.'); return; }
      } else if (openSlot.kind === 'pending') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === openSlot.localId);
        if (pend) {
          removePendingEntry(user.id, openSlot.localId);
          addPendingEntry(user.id, { ...pend, start_time: fStart, end_time: fEnd, break_minutes: 0, total_minutes: totalMins, observation: fObs.trim() || null, reception: fReception || null });
        }
      } else {
        // ── Create a new slot (planned chantier or free intervention) ──
        let worksiteId = '';
        let worksiteName = '';
        let worksiteCity: string | null = null;

        if (openSlot.kind === 'planned') {
          const p = planning.find((pp) => pp.id === openSlot.planningId);
          worksiteId = p?.worksite_id || '';
          worksiteName = p?.worksite?.client_name || '';
          worksiteCity = p?.worksite?.city || null;
        } else {
          worksiteId = fWorksiteId;
          const ws = worksites.find((w) => w.id === worksiteId);
          worksiteName = ws?.client_name || ''; worksiteCity = ws?.city || null;
        }
        if (!worksiteId) { toast.error('Choisis un chantier'); return; }

        // Le planning EXACT qu'on a ouvert, pas « le premier de ce chantier » :
        // avec deux créneaux prévus sur le même chantier, l'ancien code liait les
        // deux lignes au premier, et l'appariement ne s'y retrouvait plus.
        const planningId = openSlot.kind === 'planned'
          ? openSlot.planningId
          : (planning.find((p) => p.worksite_id === worksiteId)?.id || null);

        // Un identifiant est posé dès la saisie, en ligne comme hors ligne : si la
        // réponse du serveur se perd, la même saisie ne peut pas entrer deux fois.
        const localId = generateLocalId();
        const pending: PendingEntry = {
          localId, company_id: user.company_id, user_id: user.id, worksite_id: worksiteId,
          planning_id: planningId, work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
          total_minutes: totalMins, meal_allowance: false, observation: fObs.trim() || null, reception: fReception || null,
          _worksite_name: worksiteName, _worksite_city: worksiteCity, _saved_at: Date.now(),
        };

        if (!navigator.onLine) {
          addPendingEntry(user.id, pending);
        } else {
          const row = {
            company_id: user.company_id, user_id: user.id, worksite_id: worksiteId, planning_id: planningId,
            work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
            meal_allowance: false, observation: fObs.trim() || null, reception: fReception || null, status: 'draft' as const,
          };
          let { error } = await supabase.from('time_entries').insert({ ...row, client_id: localId });
          if (error && error.code === 'PGRST204' && error.message?.includes('client_id')) {
            ({ error } = await supabase.from('time_entries').insert(row));
          }
          if (error) {
            // Le réseau a lâché en plein envoi : on garde la saisie sur le
            // téléphone plutôt que de la perdre, elle partira toute seule.
            addPendingEntry(user.id, pending);
            toast.message('Réseau instable — ça partira tout seul.');
          }
        }
      }

      setDrawerField(null);
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      if (navigator.onLine) fetchData();
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success(savedMsg);
    } catch (err) {
      console.error('Error saving slot:', err);
      toast.error(explainWriteError(err, "Impossible d'ajouter ce chantier"));
    } finally {
      setFSaving(false);
    }
  };

  // Remove a wrong intervention. Draft → delete. Sent → soft-cancel (stays
  // visible "Retirée", excluded from the total, secretary informed).
  // `.select('id')` sur chaque écriture : 0 ligne = refus RLS (verrouillée), pas
  // un succès.
  const handleRetire = async (entry: TimeEntryWithWorksite) => {
    if (!user) return;
    try {
      if (entry.status === 'submitted') {
        const { data: upd, error } = await supabase.from('time_entries')
          .update({ status: 'cancelled', modified_at: new Date().toISOString(), modified_by: user.id })
          .eq('id', entry.id).eq('user_id', user.id).select('id');
        if (error) throw error;
        if (!upd || upd.length === 0) { toast.error('Impossible de retirer : chantier verrouillé par le bureau.'); return; }
        toast.success('Chantier retiré — la secrétaire est prévenue');
      } else {
        const { data: del, error } = await supabase.from('time_entries').delete().eq('id', entry.id).eq('user_id', user.id).select('id');
        if (error) throw error;
        if (!del || del.length === 0) { toast.error('Impossible de retirer : chantier verrouillé par le bureau.'); fetchData(); return; }
        toast.success('Chantier retiré');
      }
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error retiring entry:', err);
      toast.error(explainWriteError(err, 'Impossible de retirer'));
    }
  };

  const handleDeletePending = (localId: string) => {
    if (!user) return;
    removePendingEntry(user.id, localId);
    setPendingEntries((prev) => prev.filter((e) => e.localId !== localId));
    if (openSlot?.kind === 'pending' && openSlot.localId === localId) setOpenSlot(null);
    toast.success('Chantier supprimé');
  };

  // ─── Copy yesterday ──────────────────────────────────────────────────────────

  const handleCopyYesterday = async () => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    setCopyingYesterday(true);
    try {
      // Une intervention retirée hier ne se recopie pas.
      const { data: yEntries, error } = await supabase.from('time_entries').select('*').eq('user_id', user.id).eq('work_date', yesterday).neq('status', 'cancelled').order('start_time');
      if (error) throw error;
      if (!yEntries || yEntries.length === 0) { toast.error('Aucun chantier hier à copier'); return; }

      const rows = yEntries.map((e) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: e.worksite_id,
        planning_id: planning.find((p) => p.worksite_id === e.worksite_id)?.id || null,
        work_date: date, start_time: e.start_time, end_time: e.end_time, break_minutes: 0,
        // total_minutes is a generated column in Postgres — never send it.
        meal_allowance: false, observation: e.observation, status: 'draft' as const,
      }));
      const { error: insErr } = await supabase.from('time_entries').insert(rows);
      if (insErr) throw insErr;

      toast.success(`${rows.length} chantier${rows.length > 1 ? 's' : ''} copié${rows.length > 1 ? 's' : ''} depuis hier`);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error copying yesterday:', err);
      toast.error("Impossible de copier la journée d'hier");
    } finally {
      setCopyingYesterday(false);
    }
  };

  // ─── Repeat this day onto other days ─────────────────────────────────────────

  const copyTargetStrs = copyDates.map((d) => format(d, 'yyyy-MM-dd')).filter((d) => d !== date);

  const copyToDates = async (targetStrs: string[]) => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    const targets = Array.from(new Set(targetStrs)).filter((d) => d !== date);
    // Les interventions retirées ne se copient pas ; le panier non plus (il se
    // coche jour par jour, et un seul par jour est accepté en base).
    const sources = [
      ...liveEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: false, observation: e.observation })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: false, observation: e.observation })),
    ];
    if (sources.length === 0) { toast.error('Aucun chantier à copier'); return; }
    if (targets.length === 0) { toast.error('Aucun jour à remplir'); return; }
    setCopying(true);
    try {
      // Link planning_id where the target day already has that chantier planned.
      const { data: plan } = await supabase.from('planning').select('id, work_date, worksite_id').eq('user_id', user.id).in('work_date', targets);
      const planMap = new Map<string, string>();
      (plan || []).forEach((p: { id: string; work_date: string; worksite_id: string | null }) => {
        if (p.worksite_id) planMap.set(`${p.work_date}|${p.worksite_id}`, p.id);
      });
      const rows = targets.flatMap((td) => sources.map((s) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: s.worksite_id,
        planning_id: planMap.get(`${td}|${s.worksite_id}`) || null,
        work_date: td, start_time: s.start_time, end_time: s.end_time, break_minutes: 0,
        meal_allowance: s.meal_allowance, observation: s.observation || null, status: 'draft' as const,
      })));
      const { error } = await supabase.from('time_entries').insert(rows);
      if (error) throw error;
      toast.success(`Copié sur ${targets.length} jour${targets.length > 1 ? 's' : ''}`);
      setRepeatOpen(false);
    } catch (err) {
      console.error('Error repeating day:', err);
      toast.error('Impossible de copier');
    } finally {
      setCopying(false);
    }
  };

  // ─── Submit day ────────────────────────────────────────────────────────────

  const checkCoherenceWarnings = (): string[] => {
    const drafts = entries.filter((e) => e.status === 'draft' && !e.locked);
    // Les chantiers prévus non ouverts partent maintenant eux aussi. Les laisser
    // hors des contrôles aurait rouvert le trou que ces contrôles bouchent :
    // deux plannings 08:00–17:00 le même jour, c'est 18 h envoyées sans un mot.
    if (drafts.length === 0 && plannedToSend.length === 0) return [];
    const warnings: string[] = [];

    // L'ancien avertissement « il reste N chantiers prévus sans heures » a
    // disparu : il ne reste plus rien, ces chantiers partent avec la feuille.
    // Le garder aurait fait surgir une fenêtre de confirmation à chaque envoi
    // d'une journée conforme au planning — exactement le geste qu'on supprime.
    const plannedMins = plannedToSend.reduce((s, p) => s + calculateTotalMinutes(p.start, p.end, 0), 0);
    const totalMins = drafts.reduce((s, e) => s + e.total_minutes, 0) + plannedMins;
    if (totalMins > 600) warnings.push(`Total : ${formatMinutesToHours(totalMins)} (dépasse 10h). Vérifie tes horaires.`);

    const slots = [
      ...liveEntries.map((e) => ({ s: (e.start_time || '').slice(0, 5), e: (e.end_time || '').slice(0, 5) })),
      ...pendingEntries.map((e) => ({ s: (e.start_time || '').slice(0, 5), e: (e.end_time || '').slice(0, 5) })),
      ...plannedToSend.map((p) => ({ s: p.start, e: p.end })),
    ]
      .filter((x) => x.s && x.e)
      .sort((a, b) => a.s.localeCompare(b.s));
    if (slots.some((x, i) => i > 0 && toMin(x.s) < toMin(slots[i - 1].e))) {
      warnings.push('Certains chantiers se chevauchent. Vérifie tes heures.');
    }
    return warnings;
  };

  const handleSubmitDay = () => {
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    // Un chantier prévu par le bureau EST une ligne de la feuille : il n'a pas
    // besoin d'être ouvert pour compter. On ne refuse que si la journée est
    // réellement vide — aucune ligne d'aucune sorte.
    if (draftIds.length === 0 && plannedToSend.length === 0 && pendingEntries.length === 0) {
      toast.error('Ajoute un chantier');
      return;
    }
    const warnings = checkCoherenceWarnings();
    if (warnings.length > 0) { setCoherenceWarnings(warnings); setConfirmOpen(true); } else { doSubmit(); }
  };

  /**
   * Matérialise les chantiers prévus non ouverts, et rend les identifiants des
   * lignes créées pour qu'elles partent avec les autres.
   *
   * EN DEUX TEMPS, ET CE N'EST PAS UN CHOIX. La politique RLS
   * `time_entries_worker_insert` impose `status = 'draft'` : un salarié ne peut
   * pas insérer une ligne déjà envoyée. Rejoué en base avant d'écrire cette
   * fonction — l'insert direct en « envoyée » est refusé. On insère donc en
   * brouillon, puis la bascule se fait avec le reste. C'est d'ailleurs ce
   * chemin qui fait poser `submitted_at` par le garde en base, lequel efface
   * cette colonne à toute insertion.
   */
  const materialisePlanned = async (): Promise<string[]> => {
    if (!user || plannedToSend.length === 0) return [];
    // IDENTIFIANT STABLE, dérivé du planning — pas un identifiant tiré au sort.
    //
    // Si l'insertion réussit mais que la bascule qui suit échoue (réseau qui
    // lâche entre les deux), le salarié réessaie. Avec un identifiant neuf à
    // chaque tentative, l'index unique `(user_id, client_id)` ne reconnaît pas
    // la première insertion : on fabrique un doublon de brouillon, puis un
    // doublon d'heures payées. Dérivé du planning, il est le même à la seconde
    // tentative, et la base refuse elle-même l'entrée en double.
    const cid = (planningId: string) => `plan_${planningId}`;
    const rows = plannedToSend.map((p) => ({
      company_id: user.company_id, user_id: user.id, worksite_id: p.worksiteId,
      planning_id: p.planningId, work_date: date,
      start_time: p.start, end_time: p.end, break_minutes: 0,
      // Le panier est posé juste après, par `applyDayMeal`, qui sait le placer
      // sur une seule ligne du jour. Le poser ici doublerait la logique.
      meal_allowance: false, observation: null, reception: null,
      status: 'draft' as const,
      client_id: cid(p.planningId),
    }));

    let { data, error } = await supabase.from('time_entries').insert(rows).select('id');

    // 23505 = au moins une de ces lignes existe déjà, d'une tentative
    // précédente. L'insertion étant une seule instruction, elle est rejetée
    // EN ENTIER — y compris les lignes qui, elles, n'existaient pas.
    //
    // Se contenter de relire les existantes laisserait donc les autres au
    // bord de la route : le bureau ajoute un chantier entre deux tentatives,
    // et il ne part jamais. Sans erreur, évidemment. On relit ce qui est là,
    // puis on insère ce qui manque.
    if (error && error.code === '23505') {
      const tous = plannedToSend.map((p) => cid(p.planningId));
      const { data: deja, error: readErr } = await supabase.from('time_entries')
        .select('id, client_id').eq('user_id', user.id).eq('work_date', date).in('client_id', tous);
      if (readErr) throw readErr;
      const presents = (deja || []) as { id: string; client_id: string | null }[];
      const connus = new Set(presents.map((r) => r.client_id));
      const manquantes = rows.filter((r) => !connus.has(r.client_id));
      const ids = presents.map((r) => r.id);
      if (manquantes.length > 0) {
        const { data: ajoutees, error: insErr } = await supabase.from('time_entries').insert(manquantes).select('id');
        if (insErr) throw insErr;
        ids.push(...((ajoutees || []) as { id: string }[]).map((r) => r.id));
      }
      return ids;
    }
    // Base pas encore migrée : on insère sans l'identifiant local (et on perd
    // la protection contre le doublon — c'est le comportement d'avant).
    if (error && error.code === 'PGRST204' && error.message?.includes('client_id')) {
      ({ data, error } = await supabase.from('time_entries')
        .insert(rows.map(({ client_id, ...r }) => r)).select('id'));
    }
    if (error) throw error;
    return ((data || []) as { id: string }[]).map((r) => r.id);
  };

  const doSubmit = async () => {
    if (!user) return;
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);

    // ── Sans réseau ──────────────────────────────────────────────────────────
    // On ne peut rien écrire, mais le geste du salarié ne doit pas se perdre.
    // Les chantiers prévus rejoignent la file du téléphone, et TOUTES les lignes
    // du jour déjà en file sont marquées « à envoyer dès qu'il y a du réseau ».
    // Sans ça, un salarié qui envoie sa journée depuis un sous-sol la retrouve
    // en brouillon le lendemain — son geste effacé sans un mot.
    if (!navigator.onLine) {
      for (const p of plannedToSend) {
        const ws = worksites.find((w) => w.id === p.worksiteId);
        addPendingEntry(user.id, {
          localId: generateLocalId(), company_id: user.company_id, user_id: user.id,
          worksite_id: p.worksiteId, planning_id: p.planningId, work_date: date,
          start_time: p.start, end_time: p.end, break_minutes: 0,
          total_minutes: calculateTotalMinutes(p.start, p.end, 0),
          meal_allowance: false, observation: null, reception: null,
          _worksite_name: ws?.client_name || '', _worksite_city: ws?.city || null,
          _saved_at: Date.now(), submit_after_sync: true,
        });
      }
      for (const pe of getPendingEntries(user.id).filter((e) => e.work_date === date)) {
        updatePendingEntry(user.id, pe.localId, { submit_after_sync: true });
      }
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success('Journée gardée sur le téléphone — elle partira dès que tu auras du réseau.');
      return;
    }

    setSubmitting(true);
    try {
      const newIds = await materialisePlanned();
      const allIds = [...draftIds, ...newIds];
      if (allIds.length === 0) { toast.error('Ajoute un chantier'); return; }

      // LE PANIER, une fois les lignes créées et pas avant.
      //
      // Sur une journée sans aucune ligne, `applyDayMeal` n'a rien sur quoi
      // écrire : il ne trouve aucune ligne, n'écrit rien — et renvoie `ok`.
      // Le salarié cochait le panier, ne voyait aucune erreur, et le panier
      // n'existait nulle part. Encore « pas d'erreur, donc c'est passé ».
      // Maintenant que les lignes existent, on le pose pour de bon, avant la
      // bascule (sur une ligne envoyée, il préviendrait la secrétaire).
      if (newIds.length > 0 && dayMeal) await applyDayMeal(true);

      const { data: sent, error } = await supabase.from('time_entries').update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .in('id', allIds).eq('user_id', user.id).eq('status', 'draft').select('id');
      if (error) throw error;
      // On compare au nombre attendu : une ligne verrouillée entre-temps est
      // silencieusement ignorée par la RLS.
      const n = sent?.length ?? 0;
      if (n === 0) toast.error("Rien n'a été envoyé : la journée est verrouillée ou a changé. Recharge.");
      else if (n < allIds.length) toast.error(`${n} chantier${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''} sur ${allIds.length} — les autres sont verrouillés.`);
      else toast.success('Journée envoyée');
      fetchData();
    } catch (err) {
      console.error('Error submitting day:', err);
      toast.error(explainWriteError(err, "Impossible d'envoyer"));
      // On recharge même en cas d'échec : la matérialisation a pu passer avant
      // que la bascule n'échoue. Sans ça l'écran garde des cartes « prévu »
      // pour des lignes qui existent déjà en base, et la tentative suivante
      // travaille sur une vue périmée.
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const liveEntries = entries.filter((e) => e.status !== 'cancelled');
  const cancelledEntries = entries.filter((e) => e.status === 'cancelled');
  const serverTotal = liveEntries.reduce((s, e) => s + e.total_minutes, 0);
  const pendingTotal = pendingEntries.reduce((s, e) => s + e.total_minutes, 0);
  const totalMinutes = serverTotal + pendingTotal;
  const nbChantiers = liveEntries.length + pendingEntries.length;
  const hasDrafts = liveEntries.some((e) => e.status === 'draft') || pendingEntries.length > 0;
  const hasRealDrafts = liveEntries.some((e) => e.status === 'draft' && !e.locked);
  const allSubmitted = liveEntries.length > 0 && liveEntries.every((e) => e.status !== 'draft') && pendingEntries.length === 0;
  const frozen = allSubmitted; // a sent day stays frozen; every change re-asks to confirm
  const isEmpty = liveEntries.length === 0 && pendingEntries.length === 0;
  const isEditable = (e: TimeEntryWithWorksite) => !e.locked && !e.exported_at;

  // Appariement LIGNE À LIGNE, et pas « ce chantier a déjà une ligne » : deux
  // créneaux prévus sur le même chantier demandent deux lignes pour disparaître
  // tous les deux. Voir `remainingPlannings`.
  //
  // Les lignes RETIRÉES comptent toujours : un chantier prévu puis retiré ne
  // doit pas resurgir comme s'il restait à faire (il s'affiche « Retiré »).
  //
  // ON FILTRE AVANT D'APPARIER. `remainingPlannings` ne juge que « ce planning
  // a-t-il déjà sa ligne » ; il ne sait pas ce qu'est une absence. Lui donner
  // le planning brut faisait remonter les congés et les lignes sans chantier
  // comme des cartes « prévu » vides, qu'on ne pouvait qu'ouvrir pour se faire
  // répondre « Choisis un chantier ». C'est moi qui l'avais cassé en passant
  // de l'ancien filtre `p.worksite_id && …` à l'appariement.
  const plannedTodo = remainingPlannings(
    planning.filter((p) => p.worksite_id && !p.absence_type),
    [
      ...entries.map((e) => ({ worksite_id: e.worksite_id, planning_id: e.planning_id })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, planning_id: e.planning_id })),
    ],
  );

  /**
   * Les chantiers prévus par le bureau que le salarié n'a pas ouverts : ils
   * partent AVEC le reste de la feuille.
   *
   * La règle (absence exclue, doublons fondus, horaires du bureau) vit dans
   * `lib/work-status.ts` — elle décide de ce qui part en paie, donc elle doit
   * pouvoir être mise au banc plutôt que se cacher dans un rendu.
   */
  const plannedToSend = planningsToMaterialise(plannedTodo);

  /**
   * Y a-t-il quelque chose à envoyer ?
   *
   * LE PIÈGE, et il m'a eu : corriger `handleSubmitDay` ne sert à rien si le
   * bouton reste grisé. Il ne s'activait que sur `hasRealDrafts` — donc une
   * journée uniquement planifiée le laissait désactivé et le nouveau code
   * n'était JAMAIS atteint. Tout compilait, tout se testait vert, et le salarié
   * voyait exactement ce qu'il voyait avant. La même porte oubliée que dans
   * `app/poseur/layout.tsx` : on répare la serrure et on laisse le verrou.
   */
  const canSend = hasRealDrafts || plannedToSend.length > 0;

  /**
   * Le total affiché doit être celui qu'on s'apprête à envoyer.
   *
   * Il n'y a pas d'écran de confirmation : le total posé juste au-dessus du
   * bouton EST la confirmation. Sur une journée uniquement planifiée il
   * annonçait « 0:00 » et « 0 chantier » alors qu'un appui allait envoyer neuf
   * heures. Le seul endroit où le salarié pouvait vérifier lui mentait.
   */
  const plannedMinutes = plannedToSend.reduce((s, p) => s + calculateTotalMinutes(p.start, p.end, 0), 0);
  const shownMinutes = totalMinutes + plannedMinutes;
  const shownChantiers = nbChantiers + plannedToSend.length;

  const gaps = computePauses([
    ...liveEntries.map((e) => ({
      start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5),
      key: `e:${e.id}`, gap: (e.gap_before ?? null) as 'route' | 'pause' | null,
    })),
    ...pendingEntries.map((e) => ({
      start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5),
      key: `pe:${e.localId}`, gap: (e.gap_before ?? null) as 'route' | 'pause' | null,
    })),
  ]);
  // Un trou non qualifié n'est NI une pause NI de la route : tant que le
  // salarié n'a pas répondu, on ne décide pas à sa place, et on ne le fait pas
  // entrer dans le total des pauses affiché juste au-dessus de la question.
  const pauses = gaps.filter((g) => g.gap === 'pause');
  const pauseMinutes = pauses.reduce((s, p) => s + p.minutes, 0);
  const routeMinutes = gaps.filter((g) => g.gap === 'route').reduce((s, p) => s + p.minutes, 0);
  /**
   * Les trous sur lesquels on pose encore la question.
   *
   * Un trou déjà qualifié reste dans la liste quelle que soit sa taille : le
   * salarié a répondu, on ne lui reprend pas sa réponse. Seul le trou SANS
   * réponse et plus long que le seuil disparaît — c'est la question qu'on
   * supprime, pas le temps.
   */
  const askableGaps = gaps.filter((g) => g.gap !== null || g.minutes <= GAP_ASK_MAX_MINUTES);
  const unansweredGaps = askableGaps.filter((g) => g.gap === null).length;

  // "Autre" is a real worksite pinned at the top of the picker (created once per
  // company in Supabase) — for work the secretary hasn't listed / the worker can't name.
  const OTHER_NAME = 'Autre';
  const sortedWorksites = [...worksites].sort((a, b) => {
    if (a.client_name === OTHER_NAME) return -1;
    if (b.client_name === OTHER_NAME) return 1;
    return a.client_name.localeCompare(b.client_name);
  });
  const cq = chantierQuery.trim().toLowerCase();
  const filteredWorksites = cq
    ? sortedWorksites.filter((w) => w.client_name.toLowerCase().includes(cq) || (w.city || '').toLowerCase().includes(cq))
    : sortedWorksites;

  // Unified list of the day's slots — planned-not-yet-declared, declared entries, and pending
  // (offline) entries — sorted by start time. The card position stays put as soon as the slot
  // has a start time, so filling a planned card no longer makes it jump to the bottom.
  type DayItem =
    | { kind: 'planned'; sort: string; key: string; data: Planning & { worksite: Worksite } }
    | { kind: 'entry'; sort: string; key: string; data: TimeEntryWithWorksite }
    | { kind: 'pending'; sort: string; key: string; data: PendingEntry }
    | { kind: 'cancelled'; sort: string; key: string; data: TimeEntryWithWorksite };
  const items: DayItem[] = [
    ...plannedTodo.map((p): DayItem => ({ kind: 'planned', sort: (p.estimated_start || '99:99').slice(0, 5), key: `p:${p.id}`, data: p })),
    ...liveEntries.map((e): DayItem => ({ kind: 'entry', sort: (e.start_time || '99:99').slice(0, 5), key: `e:${e.id}`, data: e })),
    ...pendingEntries.map((pe): DayItem => ({ kind: 'pending', sort: (pe.start_time || '99:99').slice(0, 5), key: `pe:${pe.localId}`, data: pe })),
    ...cancelledEntries.map((e): DayItem => ({ kind: 'cancelled', sort: (e.start_time || '99:99').slice(0, 5), key: `c:${e.id}`, data: e })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  // Le trou se dessine juste avant l'intervention qui le suit.
  const gapByKey = new Map(askableGaps.map((g) => [g.key, g]));

  const titleName = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.client_name || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.client_name || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_name || '')
    : '';
  const titleCity = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.city || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.city || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_city || '')
    : '';
  const slotWorksiteId = !openSlot ? null
    : openSlot.kind === 'new' ? (fWorksiteId || null)
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.id || null)
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite_id || null)
    : null;
  const slotWorksiteName = openSlot?.kind === 'new'
    ? (worksites.find((w) => w.id === fWorksiteId)?.client_name || OTHER_NAME)
    : (titleName || OTHER_NAME);
  const slotTitle = !openSlot ? ''
    : openSlot.kind === 'new' ? 'Nouveau chantier'
    : titleName ? `Chantier ${titleName}` : 'Chantier';

  const editorEntry = openSlot?.kind === 'entry' ? entries.find((x) => x.id === openSlot.entryId) : undefined;
  const durMin = (fStart && fEnd) ? calculateTotalMinutes(fStart, fEnd, 0) : 0;

  if (loading) {
    return (
      <div className="bt-day">
        <style dangerouslySetInnerHTML={{ __html: DAY_CSS }} />
        <div className="bt-day-scroll space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bt-day">
      <style dangerouslySetInnerHTML={{ __html: DAY_CSS }} />

      {/* ===== BANDEAU RÉSEAU ===== */}
      {!isOnline && (
        <div className="bt-net bt-net-off">
          <span className="bt-net-dot" />
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Hors-ligne, tout est gardé{pendingEntries.length > 0 ? ` · ${pendingEntries.length} en attente` : ''}
          </span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="bt-net bt-net-sync">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Envoi en cours…</span>
        </div>
      )}

      {/* ===== ZONE SCROLLABLE ===== */}
      <div className="bt-day-scroll">

        {/* rappel « jours oubliés » (rendu par le parent) — défile avec la liste */}
        {topBanner}

        {/* Feuille d'heures d'équipe — chef d'équipe uniquement, jour courant.
            La RLS décide seule de qui il voit : cet écran n'ajoute aucun filtre
            de sécurité, il n'en serait pas un. */}
        {user?.role === 'lead' && user?.company_id && date === mountedToday && (
          <TeamDay
            me={user}
            date={date}
            myWorksiteIds={Array.from(new Set([
              ...planning.map((p) => p.worksite_id).filter(Boolean),
              ...entries.filter((e) => e.status !== 'cancelled').map((e) => e.worksite_id).filter(Boolean),
            ])) as string[]}
            worksiteName={(id) => worksites.find((w) => w.id === id)?.client_name || 'Chantier'}
            onChanged={() => { fetchData(); }}
          />
        )}

        {/* Pointage en direct. Affiché SEULEMENT sur le jour courant : pointer
            « en direct » sur une journée passée n'a pas de sens, et la saisie à
            la main reste là pour ça. Un chrono resté ouvert d'un autre jour
            s'affiche quand même, pour qu'on puisse le fermer. */}
        {user?.id && user?.company_id && date === mountedToday && (
          <LiveTimer
            userId={user.id}
            companyId={user.company_id}
            today={date}
            worksites={sortedWorksites}
            planningIdFor={(wid) => planning.find((p) => p.worksite_id === wid)?.id || null}
            frozen={monthLocked}
            positionActive={positionActive}
            onSaved={() => { fetchData(); }}
          />
        )}
        {/* ----- TOTAL DU JOUR ----- */}
        <div className="bt-total">
          <div className="bt-total-ruban" />
          <div className="bt-total-k">Total aujourd&apos;hui</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="bt-total-big">{fmtHM(shownMinutes)}</span>
            <span className="bt-total-unit">travaillées</span>
          </div>
          <div className="bt-stats">
            <div className="bt-stat">
              <div className="bt-stat-n">{shownChantiers}</div>
              <div className="bt-stat-l">chantier{shownChantiers > 1 ? 's' : ''}</div>
            </div>
            <div className="bt-stat">
              <div className="bt-stat-n">{fmtHM(pauseMinutes)}</div>
              <div className="bt-stat-l">
                pause{pauses.length > 1 ? 's' : ''}
                {unansweredGaps > 0 && ` · ${unansweredGaps} à préciser`}
              </div>
            </div>
            {routeMinutes > 0 && (
              <div className="bt-stat">
                <div className="bt-stat-n">{fmtHM(routeMinutes)}</div>
                <div className="bt-stat-l">route{travelPaid ? ' · payée' : ''}</div>
              </div>
            )}
            <div className={`bt-stat${dayMeal ? ' on' : ''}`}>
              <div className="bt-stat-n">{dayMeal ? 'Panier ✓' : 'Panier'}</div>
              <div className="bt-stat-l">{dayMeal ? 'repas pris' : 'non pris'}</div>
            </div>
          </div>
        </div>

        {/* ----- PANIER REPAS (toggle, une fois/jour) ----- */}
        <div className="bt-meal">
          <span className="bt-meal-emoji">🥪</span>
          <div style={{ flex: 1 }}>
            <div className="bt-meal-t">Panier repas</div>
            <div className="bt-meal-s">{dayMeal ? "Compté pour aujourd'hui" : 'Pour la journée'}</div>
          </div>
          <button
            type="button"
            className={`bt-switch${dayMeal ? ' on' : ''}`}
            aria-label="Panier repas"
            aria-pressed={dayMeal}
            onClick={() => {
              if (monthLocked) { setLateOpen(true); return; }
              if (frozen) { askCorrect(() => toggleDayMeal(!dayMeal, true)); return; }
              toggleDayMeal(!dayMeal);
            }}
          >
            <i />
          </button>
        </div>

        {/* ----- INTERVENTIONS ----- */}
        <div className="bt-sec">Chantiers du jour</div>

        {items.map((item) => {
          const g = gapByKey.get(item.key);
          const gapRow = g ? (
            <div className="bt-gap" key={`${item.key}:gap`}>
              <div className="bt-gap-t">
                <span className="bt-gap-d">{fmtHM(g.minutes)}</span>{' '}
                entre {g.start} et {g.end} —{' '}
                {g.gap === null
                  ? <span className="bt-gap-ask">c'était quoi ?</span>
                  : g.gap === 'route' ? `route${travelPaid ? ' (payée)' : ' (non payée)'}` : 'pause'}
              </div>
              {!monthLocked && (
                <div className="bt-gap-btns">
                  <button type="button" className={`bt-gap-b${g.gap === 'route' ? ' on' : ''}`} onClick={() => askGapKind(g.key, 'route')}>Route</button>
                  <button type="button" className={`bt-gap-b${g.gap === 'pause' ? ' on' : ''}`} onClick={() => askGapKind(g.key, 'pause')}>Pause</button>
                </div>
              )}
            </div>
          ) : null;

          const withGap = (node: ReactNode) => gapRow ? <div key={item.key}>{gapRow}{node}</div> : node;

          if (item.kind === 'planned') {
            const p = item.data;
            const onTap = monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openPlanned(p)) : () => openPlanned(p);
            return (
              <div key={item.key} className="bt-iv-plan bt-iv-tap" onClick={onTap}>
                <div className="bt-plan-k">
                  {p.estimated_start && p.estimated_end ? `Prévu · ${p.estimated_start.substring(0, 5)}–${p.estimated_end.substring(0, 5)}` : 'Prévu'}
                </div>
                <div className="bt-iv-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bt-iv-name">{p.worksite?.client_name}</div>
                    {p.worksite?.city && <div className="bt-iv-city">{p.worksite.city}</div>}
                  </div>
                  {p.worksite?.id && (docsByWorksite.get(p.worksite.id) || 0) > 0 && (
                    <span className="bt-iv-docs"><Paperclip className="h-3 w-3" />{docsByWorksite.get(p.worksite.id)}</span>
                  )}
                  <span className="bt-iv-cta">Mes heures ›</span>
                </div>
              </div>
            );
          }

          if (item.kind === 'entry') {
            const entry = item.data;
            const tappable = isEditable(entry);
            const isDraft = entry.status === 'draft' && !entry.locked;
            const onTap = !tappable ? undefined : monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openEntry(entry)) : () => openEntry(entry);
            return withGap(
              <div key={item.key} className={`bt-iv${entry.locked ? ' ok' : entry.status === 'submitted' ? ' sent' : isDraft ? ' draft' : ''}${onTap ? ' bt-iv-tap' : ''}`} onClick={onTap}>
                <div className="bt-iv-top">
                  <span className="bt-iv-name">{entry.worksite?.client_name || OTHER_NAME}</span>
                  {entry.worksite_id && (docsByWorksite.get(entry.worksite_id) || 0) > 0 && (
                    <span className="bt-iv-docs"><Paperclip className="h-3 w-3" />{docsByWorksite.get(entry.worksite_id)}</span>
                  )}
                  {entry.locked ? (
                    <div className="bt-badge bt-badge-ok"><span className="dot">✓</span> Exporté</div>
                  ) : entry.status === 'submitted' ? (
                    <div className="bt-badge bt-badge-sent"><span className="dot">✓</span> Envoyé</div>
                  ) : isDraft ? (
                    <div className="bt-badge bt-badge-wait">● À envoyer</div>
                  ) : null}
                </div>
                <div className="bt-iv-times">
                  {entry.worksite?.city && <span className="bt-iv-city">{entry.worksite.city}</span>}
                  <span className="bt-iv-times-v">{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)} · {fmtHM(entry.total_minutes)}</span>
                </div>
                {/* CE QUE LE BUREAU A CORRIGÉ. Affiché ici même, et pas
                    seulement envoyé en notification : le salarié qui n'a pas
                    activé les notifications doit le voir quand même. Chaque
                    correction garde sa ligne — deux corrections successives se
                    lisent comme une suite, pas comme un état final. */}
                {(mesCorrections.get(entry.id) || []).map((c) => (
                  <div key={c.id} className="bt-iv-corr">
                    <Hammer className="h-3.5 w-3.5 shrink-0" style={{ color: '#8a6d05' }} />
                    <div className="bt-iv-corr-t">
                      {c.corrected_by_role === 'lead' ? 'Ton chef a corrigé' : 'Le bureau a corrigé'} :{' '}
                      <span className="bt-iv-corr-v">{fmtHeure(c.old_start)}–{fmtHeure(c.old_end)}</span>
                      {' → '}
                      <span className="bt-iv-corr-v">{fmtHeure(c.new_start)}–{fmtHeure(c.new_end)}</span>
                    </div>
                  </div>
                ))}
                {/* CE QUI A ÉTÉ GARDÉ SUR LUI — LES MÊMES CHIFFRES QUE LE BUREAU.
                    Je n'affichais d'abord que l'heure et la précision : le
                    salarié savait qu'un endroit avait été noté, sans savoir
                    LEQUEL. C'était une demi-mesure, et la pire des deux — il ne
                    pouvait ni reconnaître son chantier, ni contester un point
                    faux, alors que le bureau, lui, voyait les coordonnées.
                    Cette asymétrie était exactement ce que « le salarié voit ce
                    qui est enregistré sur lui » devait empêcher.

                    Une journée sans endroit n'affiche RIEN : pas de « aucune
                    position », qui ferait du refus une absence à justifier. */}
                {(mesPositions.get(entry.id) || []).length > 0 && (
                  <div className="bt-iv-geo">
                    <MapPin className="h-3.5 w-3.5" />
                    <div>
                      <div>Endroit noté :</div>
                      {(mesPositions.get(entry.id) || [])
                        .slice()
                        .sort((a, b) => (a.moment === 'start' ? -1 : 1) - (b.moment === 'start' ? -1 : 1))
                        .map((p) => (
                          <div key={p.id}>
                            {p.moment === 'start' ? 'départ' : 'fin'} {parisHHmm(p.captured_at)}
                            {' · '}
                            <span className="bt-iv-geo-v">{fmtCoord(p.latitude, p.longitude)}</span>
                            {' '}
                            {positionUtile(p.accuracy_m)
                              ? fmtPrecision(p.accuracy_m)
                              : `${fmtPrecision(p.accuracy_m)} — trop imprécis`}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {entry.reception === 'avec' && (
                  <>
                    <div className="bt-iv-reserve avec">⚠ Avec réserve</div>
                    {/* Trois états bien distincts : le bureau a levé, le salarié
                        a signalé avoir corrigé (en attente du bureau), ou rien
                        encore. Le salarié ne ferme jamais lui-même. */}
                    {entry.reserve_resolved_at ? (
                      <div className="bt-iv-reserve levee">✓ Levée par le bureau</div>
                    ) : entry.reserve_fixed_at ? (
                      <div className="bt-iv-reserve corrige">
                        ✓ Corrigé sur place — en attente du bureau
                        <button type="button" className="bt-iv-fixundo" disabled={fixingId === entry.id}
                          onClick={(ev) => { ev.stopPropagation(); markFixed(entry.id, false); }}>annuler</button>
                      </div>
                    ) : (
                      <button type="button" className="bt-iv-fixbtn" disabled={fixingId === entry.id}
                        onClick={(ev) => { ev.stopPropagation(); markFixed(entry.id, true); }}>
                        {fixingId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '✓'} J&apos;ai corrigé sur place
                      </button>
                    )}
                  </>
                )}
                {entry.reception === 'sans' && <div className="bt-iv-reserve sans">✓ Sans réserve</div>}
                {entry.reception === 'en_cours' && <div className="bt-iv-reserve encours">🔨 Chantier en cours</div>}
                {entry.observation && <div className="bt-iv-note">{entry.observation}</div>}
              </div>
            );
          }

          if (item.kind === 'cancelled') {
            const entry = item.data;
            return (
              <div key={item.key} className="bt-iv-cancel">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-cancel-name">{entry.worksite?.client_name || OTHER_NAME}</div>
                  <div className="bt-cancel-time">{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)} · {fmtHM(entry.total_minutes)}</div>
                </div>
                <div className="bt-cancel-badge">Retiré</div>
              </div>
            );
          }

          // pending (offline)
          const entry = item.data;
          return withGap(
            <div key={item.key} className="bt-iv off">
              <div className="bt-iv-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-iv-name">{entry._worksite_name}</div>
                  {entry._worksite_city && <div className="bt-iv-city">{entry._worksite_city}</div>}
                </div>
                <div className="bt-badge bt-badge-off">● Sur le téléphone</div>
              </div>
              <div className="bt-iv-times">
                <span>{entry.start_time.substring(0, 5)} → {entry.end_time.substring(0, 5)}</span>
                <span className="dot" />
                <span>{fmtHM(entry.total_minutes)}</span>
              </div>
              <div className="bt-iv-acts">
                <button type="button" className="bt-iv-mod" onClick={() => openPending(entry)}>Modifier</button>
                <button type="button" className="bt-iv-del" onClick={() => setConfirmDel({ kind: 'pending', localId: entry.localId })}>Retirer</button>
              </div>
            </div>
          );
        })}

        {/* Vide → astuce + copier hier */}
        {isEmpty && plannedTodo.length === 0 && (
          <div className="bt-empty">
            <div>Aucun chantier aujourd&apos;hui.</div>
            {isOnline && !monthLocked && (
              <button type="button" className="bt-ghostbtn" onClick={handleCopyYesterday} disabled={copyingYesterday}>
                {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copier la journée d&apos;hier
              </button>
            )}
          </div>
        )}

        {/* Dupliquer cette journée */}
        {!isEmpty && !monthLocked && (
          <div style={{ textAlign: 'center' }}>
            <button type="button" className="bt-dup" onClick={() => { setCopyDates([]); setRepeatOpen(true); }}>
              <Copy className="h-4 w-4" /> Dupliquer cette journée
            </button>
          </div>
        )}

        {/* Journée envoyée — note de correction */}
        {allSubmitted && (
          <div className="bt-sentnote">
            {monthLocked
              ? 'Mois clôturé — vois avec la secrétaire pour modifier.'
              : 'Touche un chantier pour le corriger (la secrétaire sera prévenue).'}
          </div>
        )}
      </div>

      {/* ===== BARRE D'ACTION DOCKÉE (bas) ===== */}
      <div className="bt-day-dock">
        <button
          type="button"
          className="bt-fab"
          aria-label="Ajouter un chantier"
          onClick={frozen && !monthLocked ? () => askCorrect(openNew) : openNew}
        >
          +
        </button>

        {!isOnline ? (
          <button type="button" className="bt-send" disabled>Envoyer ma journée</button>
        ) : pendingEntries.length > 0 ? (
          <button type="button" className="bt-send" onClick={syncPendingEntries} disabled={syncing}>
            {syncing && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer ce qui reste ({pendingEntries.length})
          </button>
        ) : canSend ? (
          <button type="button" className="bt-send" onClick={frozen ? () => askCorrect(handleSubmitDay) : handleSubmitDay} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Envoyer ma journée <span style={{ fontSize: 19 }}>→</span>
          </button>
        ) : allSubmitted ? (
          <button type="button" className="bt-send done" disabled>Journée envoyée ✓</button>
        ) : (
          <button type="button" className="bt-send" disabled>Envoyer ma journée <span style={{ fontSize: 19 }}>→</span></button>
        )}
      </div>

      {/* ===== ÉDITEUR PLEIN ÉCRAN — Ajouter / modifier une intervention ===== */}
      {openSlot && (
        <div className="bt-ed">
          <div className="bt-ed-inner">
            <div className="bt-ed-hdr">
              <button type="button" className="bt-ed-cancel" onClick={cancelSlot}>Annuler</button>
              <div className="bt-ed-title">{slotTitle}</div>
              <span style={{ width: 54, flex: 'none' }} aria-hidden />
            </div>

            <div className="bt-ed-scroll">

              {/* 1 · Chantier */}
              <div className="bt-sec">1 · Chantier</div>
              {openSlot.kind === 'new' ? (
                <>
                <input className="bt-site-search" placeholder="Rechercher un chantier…" value={chantierQuery} onChange={(e) => setChantierQuery(e.target.value)} />
                {filteredWorksites.length === 0 && <div className="bt-site-empty">Aucun chantier trouvé</div>}
                {filteredWorksites.map((ws) => {
                  const isOther = ws.client_name === OTHER_NAME;
                  const on = fWorksiteId === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      className={`bt-site${on ? ' on' : ''}${isOther ? ' other' : ''}`}
                      onClick={() => setFWorksiteId(ws.id)}
                    >
                      {isOther && !on ? <span className="bt-rdo-plus">+</span> : null}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="bt-site-name">{isOther ? 'Autre chantier' : ws.client_name}</span>
                        <span className="bt-site-city">{isOther ? 'Travail non prévu, à préciser' : (ws.city || '')}</span>
                      </span>
                      {!(isOther && !on) && <span className="bt-rdo">{on ? '✓' : ''}</span>}
                    </button>
                  );
                })}
                </>
              ) : (
                <div className="bt-site on">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="bt-site-name">{titleName || OTHER_NAME}</span>
                    {titleCity && <span className="bt-site-city">{titleCity}</span>}
                  </span>
                  <span className="bt-rdo">✓</span>
                </div>
              )}

              {/* 2 · Horaires */}
              <div className="bt-sec">2 · Horaires</div>
              <div className="bt-times">
                <button type="button" className="bt-timecard" onClick={() => setDrawerField('start')}>
                  <span className="k">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className="bt-timecard" onClick={() => setDrawerField('end')}>
                  <span className="k">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
                <div className="bt-dur">
                  <span className="k">Durée</span>
                  <span className="v">{formatMinutesToHours(durMin)}</span>
                </div>
              </div>
              <div className="bt-times-hint">Touche une heure pour la régler</div>

              {/* Pauses calculées automatiquement (trous entre créneaux) — plus de sélecteur manuel */}
              <div className="bt-pause-auto">
                <span aria-hidden>☕</span>
                Les pauses sont calculées automatiquement d&apos;après vos horaires.
              </div>

              {/* 3 · Statut du chantier — en cours / sans / avec réserve (facultatif) */}
              <div className="bt-sec">3 · Statut du chantier <span style={{ textTransform: 'none', letterSpacing: 0, color: '#a39d92' }}>(facultatif)</span></div>
              <div className="bt-recep">
                <button type="button" className={`bt-recep-b encours${fReception === 'en_cours' ? ' on' : ''}`} onClick={() => setFReception(fReception === 'en_cours' ? '' : 'en_cours')}>
                  <Hammer className="h-[18px] w-[18px]" /> En cours
                </button>
                <button type="button" className={`bt-recep-b sans${fReception === 'sans' ? ' on' : ''}`} onClick={() => setFReception(fReception === 'sans' ? '' : 'sans')}>
                  <CheckCircle2 className="h-[18px] w-[18px]" /> Sans réserve
                </button>
                <button type="button" className={`bt-recep-b avec${fReception === 'avec' ? ' on' : ''}`} onClick={() => setFReception(fReception === 'avec' ? '' : 'avec')}>
                  <AlertTriangle className="h-[18px] w-[18px]" /> Avec réserve
                </button>
              </div>
              {fReception === 'avec' && (
                <div className="bt-recep-hint">Décris les réserves ci-dessous (obligatoire) et ajoute tes photos ou documents via le bouton <strong>Documents</strong>.</div>
              )}

              {/* 4 · Note (devient « Détail des réserves » si avec réserve) */}
              <div className="bt-sec">4 · {fReception === 'avec' ? 'Détail des réserves' : 'Note'} <span style={{ textTransform: 'none', letterSpacing: 0, color: fReception === 'avec' ? '#C0461F' : '#a39d92' }}>{fReception === 'avec' ? '(obligatoire)' : '(facultatif)'}</span></div>
              <textarea
                className="bt-note"
                rows={2}
                placeholder={fReception === 'avec' ? 'Décrivez les réserves constatées…' : 'Préciser le travail effectué…'}
                value={fObs}
                onChange={(e) => setFObs(e.target.value)}
              />
            </div>

            {/* Barre d'action dockée */}
            <div className="bt-ed-dock">
              {(slotWorksiteId || (openSlot.kind === 'entry' && editorEntry)) && (
                <div className="bt-ed-dock-row">
                  {slotWorksiteId && (
                    <button type="button" className="bt-ed-doc" onClick={() => setDocsWs({ id: slotWorksiteId, name: slotWorksiteName, entryId: openSlot.kind === 'entry' ? openSlot.entryId : null })}>
                      <FolderOpen className="h-4 w-4" /> Documents
                    </button>
                  )}
                  {openSlot.kind === 'entry' && editorEntry && (
                    <button type="button" className="bt-ed-trash" disabled={fSaving} onClick={() => setConfirmDel({ kind: 'entry', entry: editorEntry, sent: editorEntry.status === 'submitted' })} aria-label="Retirer ce chantier" title="Retirer ce chantier">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <button type="button" className="bt-save" onClick={saveSlot} disabled={fSaving}>
                {fSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                OK <span style={{ fontSize: 18 }}>✓</span>
              </button>
            </div>

            {/* ===== TIROIR MOLETTE ===== */}
            <div className={`bt-overlay${drawerField ? ' open' : ''}`} onClick={() => setDrawerField(null)} />
            <div className={`bt-sheet${drawerField ? ' open' : ''}`}>
              <div className="bt-grip" />
              <div className="bt-seg">
                <button type="button" className={`bt-segb${drawerField !== 'end' ? ' on' : ''}`} onClick={() => setDrawerField('start')}>
                  <span className="lbl">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className={`bt-segb${drawerField === 'end' ? ' on' : ''}`} onClick={() => setDrawerField('end')}>
                  <span className="lbl">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
              </div>
              <div className="bt-sheet-dur">
                <span className="k">Durée totale</span>
                <span className="v">{formatMinutesToHours(durMin)}</span>
              </div>
              <div className="bt-molette">
                {/* La molette TimeCylinder et sa mécanique restent intactes. */}
                <TimeCylinder
                  value={drawerField === 'end' ? fEnd : fStart}
                  onChange={(v) => (drawerField === 'end' ? setFEnd(v) : setFStart(v))}
                />
              </div>
              <button type="button" className="bt-save" style={{ marginTop: 14 }} onClick={() => setDrawerField(null)}>
                Valider les heures ✓
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Repeat this day onto other days */}
      <Dialog open={repeatOpen} onOpenChange={setRepeatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5" /> Dupliquer cette journée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choisis les jours où copier cette journée (mêmes chantiers + heures).</p>
          <div className="flex justify-center">
            <Calendar mode="multiple" selected={copyDates} onSelect={(d) => setCopyDates(d || [])} locale={fr} weekStartsOn={1} disabled={{ before: new Date() }} />
          </div>
          <Button className="w-full h-11" disabled={copying || copyTargetStrs.length === 0} onClick={() => copyToDates(copyTargetStrs)}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            Copier{copyTargetStrs.length > 0 ? ` (${copyTargetStrs.length})` : ''}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Month closed — too late to edit */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Mois clôturé</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Le bureau a clôturé ce mois : la paie est partie. Pour toute correction, rapproche-toi de la secrétaire — elle peut rouvrir le mois.</p>
          <Button className="w-full mt-2" onClick={() => setLateOpen(false)}>Compris</Button>
        </DialogContent>
      </Dialog>

      {/* Confirm correcting an already-sent day */}
      <Dialog open={confirmCorrectOpen} onOpenChange={(o) => { setConfirmCorrectOpen(o); if (!o) setPendingAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Journée déjà envoyée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setConfirmCorrectOpen(false); setPendingAction(null); }}>Annuler</Button>
            <Button className="flex-1" onClick={confirmCorrect}>Continuer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coherence confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Vérification</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {coherenceWarnings.map((w, i) => <p key={i} className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">{w}</p>)}
            <p className="text-sm text-muted-foreground pt-1">Envoyer quand même ta journée ?</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>Corriger</Button>
            <Button className="flex-1" onClick={() => { setConfirmOpen(false); doSubmit(); }}>Confirmer l&apos;envoi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation avant de retirer une intervention */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Retirer ce chantier ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDel?.kind === 'entry' && confirmDel.sent
              ? 'Il a déjà été envoyé : il restera visible comme « Retiré » et la secrétaire en sera informée.'
              : 'Les heures seront perdues.'}
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDel(null)}>Non</Button>
            <Button
              className="flex-1"
              onClick={() => {
                const c = confirmDel;
                setConfirmDel(null);
                if (!c) return;
                if (c.kind === 'entry') handleRetire(c.entry); else handleDeletePending(c.localId);
              }}
            >
              Oui, retirer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* La pièce est rattachée au jour affiché, et à l'intervention quand elle
          existe déjà en base. Un créneau prévu ou une saisie encore hors ligne
          n'ont pas d'identifiant : la pièce reste alors rattachée au jour. */}
      <ChantierDocuments
        worksiteId={docsWs?.id || null}
        worksiteName={docsWs?.name}
        workDate={date}
        timeEntryId={docsWs?.entryId || null}
        open={!!docsWs}
        onOpenChange={(o) => { if (!o) setDocsWs(null); }}
      />
    </div>
  );
}
