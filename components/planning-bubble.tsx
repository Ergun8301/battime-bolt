'use client';

// Lot 9 — le rendu du planning PARTAGÉ entre le bureau (admin-planning.tsx) et
// la borne (lecture seule). Une seule source : la borne est « identique
// visuellement » parce qu'elle affiche EXACTEMENT ces bulles et cette grille.
//
// Rien ici ne lit la base : uniquement des champs déjà choisis par l'appelant
// (titre, chantier · ville, horaires prévus, « en cours depuis »).
import type { ReactNode } from 'react';
import type { DayPartTint } from '@/supabase/functions/_shared/day-part';

export interface ChantierPalette { bar: string; tagBg: string; tagText: string }

// La couleur appartient au CHANTIER (stable toute la semaine), pas au poseur.
export const CHANTIER_PALETTES: ChantierPalette[] = [
  { bar: '#C9821F', tagBg: '#F1E3CB', tagText: '#9a7c14' },
  { bar: '#A23E6B', tagBg: '#EFD9E2', tagText: '#8a3358' },
  { bar: '#2F8A5B', tagBg: '#D5E8DD', tagText: '#27744c' },
  { bar: '#B5472E', tagBg: '#F4D9D1', tagText: '#a8412a' },
  { bar: '#7A5EA8', tagBg: '#E7DEF2', tagText: '#6b4f99' },
  { bar: '#5E7A33', tagBg: '#E5E8CF', tagText: '#4f661f' },
  { bar: '#A8742A', tagBg: '#EFE2CC', tagText: '#8a5f1e' },
];

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Même couleur que le bureau pour un chantier donné (index renvoyé par la borne ou id). */
export const paletteAt = (index: number): ChantierPalette => CHANTIER_PALETTES[((index % CHANTIER_PALETTES.length) + CHANTIER_PALETTES.length) % CHANTIER_PALETTES.length];

/** « ● en cours depuis 07:45 » — pointage en direct ouvert. */
export function LiveLine({ since, dark = false }: { since: string; dark?: boolean }) {
  return (
    <div className={`bt-pl-bub-live${dark ? ' dark' : ''}`} data-testid="bubble-live">
      <span className="bt-pl-live-dot" aria-hidden />en cours depuis {since}
    </div>
  );
}

/** Bulle « prévu » : fond blanc, pointillé couleur chantier ; verte quand le salarié est en cours.
 *  Lot 3 : `tint` = teinte du créneau (matin / après-midi / soir, day-part.ts). Le chantier
 *  garde sa couleur (barre de gauche + pointillé) ; le vert « en cours » passe avant. */
export function PlannedBubbleView({ title, sub, hours, palette, docs, live, tint }: {
  title: string;
  sub?: string | null;
  hours?: string | null;
  palette: ChantierPalette;
  docs?: ReactNode;
  live?: string;
  tint?: DayPartTint | null;
}) {
  const t = live ? null : tint ?? null;
  const style = live
    ? { background: '#E7F6EE', border: '1.5px solid #2FA36B', color: '#15120F' }
    : { background: t ? t.bg : '#fff', border: `1.5px dashed ${palette.bar}`, color: '#15120F' };
  return (
    <div className={`bt-pl-bub${live ? ' bt-pl-bub-on' : ''}`} style={style} data-creneau={t?.key}>
      <span className="bt-pl-bub-bar" style={{ background: live ? '#2FA36B' : palette.bar }} />
      <div className="bt-pl-bub-name">
        <span className="bt-pl-bub-title" data-testid="bubble-title">{title}</span>
        {docs && <span className="bt-pl-bub-ic">{docs}</span>}
      </div>
      {/* Sur une teinte, l'encre plus foncée : le gris habituel passerait sous 4,5:1. */}
      {sub && <div className="bt-pl-bub-sub" style={{ color: t ? t.ink : '#6E6A63' }}>{sub}</div>}
      {hours && (
        <div className="bt-pl-bub-foot">
          <span className="bt-pl-hour" data-testid="bubble-hours" style={t ? { color: t.ink } : undefined}>{hours}</span>
        </div>
      )}
      {live && <LiveLine since={live} />}
    </div>
  );
}

// Grille desktop, bulles, cases d'absence : déplacé tel quel depuis admin-planning.tsx
// (le bureau l'inclut dans son PL_CSS, la borne aussi). Ne pas dupliquer ailleurs.
export const PL_GRID_CSS = `
/* grille desktop */
.bt-pl-table{width:100%;border-collapse:collapse;min-width:1110px;table-layout:fixed}
/* La grille s'arrête net : bordure de fin franche (2px noir, comme l'en-tête) sous la
   dernière ligne visible (fantôme si présente, sinon dernier salarié). */
.bt-pl-table tbody:last-of-type tr:last-child td{border-bottom:2px solid #15120F}
.bt-pl-th{background:#fff;padding:11px 12px;text-align:center;border-right:1px solid rgba(21,18,15,.25);border-bottom:2px solid #15120F}
.bt-pl-th-cell{display:flex;align-items:baseline;justify-content:center;gap:8px}
.bt-pl-th-day{font-family:'Archivo',sans-serif;font-size:14px;font-weight:800;color:#15120F;letter-spacing:-.01em}
.bt-pl-th-num{font-family:'Archivo',sans-serif;font-size:17px;font-weight:900;color:#15120F}
.bt-pl-th.today{background:#FFF3CC;box-shadow:inset 0 3px 0 #FFC21A}
.bt-pl-th.today .bt-pl-th-day{color:#15120F}
/* Coin haut-gauche coupé en diagonale : « Salarié » (bas-gauche) étiquette la colonne
   des noms ; « S-26 » (haut-droite) étiquette la ligne des dates. Trait corner-à-corner
   via SVG (preserveAspectRatio:none + non-scaling-stroke = épaisseur constante). */
.bt-pl-th-name{position:sticky;left:0;z-index:6;width:200px;padding:0;border-right:2px solid #15120F;border-bottom:2px solid #15120F;background-color:#fff;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='0' x2='100' y2='100' stroke='%2315120F' stroke-width='2' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");background-size:100% 100%;background-repeat:no-repeat}
.bt-pl-corner-wk{position:absolute;top:7px;right:12px;font-family:'Archivo',sans-serif;font-size:13px;font-weight:900;letter-spacing:-.01em;color:#15120F}
.bt-pl-corner-sal{position:absolute;left:13px;bottom:7px;font-family:'Archivo',sans-serif;font-size:15px;font-weight:900;letter-spacing:-.02em;color:#15120F}
.bt-pl-namecell{position:sticky;left:0;z-index:5;background:#fff;border-right:2px solid #15120F;border-bottom:1px solid rgba(21,18,15,.25);padding:0;vertical-align:top}
.bt-pl-namebtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;width:100%;height:100%;padding:13px;background:transparent;border:none;cursor:pointer;text-align:center;font-family:inherit}
.bt-pl-namebtn:hover{background:rgba(21,18,15,.03)}
.bt-pl-nametop{display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;max-width:100%}
.bt-pl-avatar{width:36px;height:36px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none;overflow:hidden}
.bt-pl-avatar-img{width:100%;height:100%;object-fit:cover;display:block}
.bt-pl-name{font-size:14.5px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.bt-pl-status{display:flex;align-items:center;gap:5px}
.bt-pl-status-dot{width:7px;height:7px;border-radius:50%;background:#E0A21C}
.bt-pl-status-txt{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700}
.bt-pl-cell{border-right:1px solid rgba(21,18,15,.25);border-bottom:1px solid rgba(21,18,15,.25);padding:8px;vertical-align:top}
.bt-pl-cell-today{background:#FFF6DB}
/* Lignes vierges de remplissage : même hauteur qu'une ligne salarié vide (105px),
   quadrillage continu, jour J teinté ; « + » discret pour ajouter un salarié. */
.bt-pl-ghostrow td{height:104px}
.bt-pl-ghost-add{display:flex;align-items:center;justify-content:center;width:100%;min-height:104px;background:transparent;border:none;cursor:pointer;color:#b3a88e;font-family:inherit;transition:color .14s ease,background .14s ease}
.bt-pl-ghost-add:hover{color:#15120F;background:rgba(21,18,15,.03)}
.bt-pl-cell-over{background:rgba(255,194,26,.28);outline:2px dashed #FFC21A;outline-offset:-3px}
.bt-pl-cellinner{position:relative;height:100%;min-height:88px;display:flex;flex-direction:column}
.bt-pl-cellfill{flex:1;display:flex;flex-direction:column;gap:7px;cursor:pointer;border-radius:6px}
.bt-pl-drop{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9a7c14;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;pointer-events:none}
.bt-pl-drop-arrow{font-size:20px;font-weight:900}

/* bulle */
.bt-pl-bub{position:relative;overflow:hidden;border-radius:9px;padding:7px 9px 7px 12px;font-family:'Archivo',sans-serif}
.bt-pl-bub-bar{position:absolute;left:0;top:0;bottom:0;width:4px}
.bt-pl-bub-name{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:800;letter-spacing:-.01em;line-height:1.15}
.bt-pl-bub-title{flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.bt-pl-bub-ic{flex:none;display:inline-flex;align-items:center;gap:5px;margin-top:1px}
.bt-pl-ic{display:inline-flex;align-items:center}
.bt-pl-bub-docs{display:inline-flex;align-items:center;gap:2px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;opacity:.85}
.bt-pl-bub-sub{font-size:10.5px;font-weight:600;margin-bottom:5px;line-height:1.2}
.bt-pl-bub-real{display:flex;align-items:center;gap:5px}
.bt-pl-check{width:14px;height:14px;background:#2FA36B;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:900;flex:none}
.bt-pl-real-txt{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#FFC21A}
.bt-pl-bub-draft{margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:700;color:#8a8378}
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
.bt-pl-add{flex:1;min-height:60px;border:1.5px dashed rgba(21,18,15,.26);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#a89c7f;font-size:22px;font-weight:800;transition:border-color .14s ease,color .14s ease,background .14s ease}
.bt-pl-add:hover{border-color:rgba(21,18,15,.45);color:#15120F;background:rgba(255,194,26,.08)}

/* absence cell */
.bt-pl-abs{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;min-height:88px;border:none;border-radius:6px;cursor:pointer;font-family:inherit}
.bt-pl-abs-ico{font-size:16px}
.bt-pl-abs-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
/* Lot 9 : « en cours » (pointage en direct) */
.bt-pl-bub-live{display:flex;align-items:center;gap:5px;margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;color:#1F7A4D}
.bt-pl-bub-live.dark{color:#46C281}
.bt-pl-live-dot{width:7px;height:7px;border-radius:50%;background:#2FA36B;flex:none;animation:bt-pl-pulse 1.6s ease-in-out infinite}
@keyframes bt-pl-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.bt-pl-live-dot{animation:none}}
.bt-pl-cell-live{background:#EEF9F2}
.bt-pl-livechip{display:flex;align-items:center;gap:6px;border-radius:9px;padding:6px 9px;background:#E7F6EE;border:1.5px solid #2FA36B;font-size:11.5px;font-weight:800;color:#15120F;line-height:1.2}
.bt-pl-livechip .t{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#1F7A4D;white-space:nowrap}
`;
