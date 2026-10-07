'use client';

// Lot 9 — le planning de la SEMAINE sur la borne, en lecture seule.
//
// La même grille que le bureau (admin-planning.tsx, grille desktop) : mêmes
// classes, même CSS (PL_GRID_CSS), mêmes bulles (PlannedBubbleView). Ce qui n'y
// est PAS, volontairement : aucun bouton, aucun « + », aucun coût, aucune heure
// pointée, aucun statut d'envoi, aucune photo, aucun document. Une absence est
// un bloc hachuré neutre « Absent » : jamais le motif (une maladie est une
// donnée de santé, la tablette est dans le couloir).
//
// Les données arrivent déjà réduites à la liste blanche par la fonction kiosk
// (supabase/functions/_shared/kiosk-board.ts) : ce composant ne lit rien.

import { memo, useEffect, useRef } from 'react';
import { format, getISOWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PL_GRID_CSS, PlannedBubbleView, paletteAt } from '@/components/planning-bubble';
import type { KioskBoard, KioskBoardLiveExtra, KioskBoardSlot } from '@/lib/kiosk-client';

// Même hachure que la cellule nom d'un absent au bureau.
const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(110,106,99,0.18) 0, rgba(110,106,99,0.18) 5px, transparent 5px, transparent 10px)',
};
// Le bloc d'absence : la hachure « congé » du bureau, pour TOUS les motifs.
const ABSENT_STYLE = { background: 'repeating-linear-gradient(45deg,#E7E1D5 0 8px,#DDD5C6 8px 16px)', color: '#7c766c' };
// Comme au bureau : permet à un enfant `height:100%` de suivre la hauteur de la ligne.
const CELL_HEIGHT_HACK = { height: '1px' } as const;

// La grille du bureau, plus ce qu'il faut pour qu'une tablette paysage
// (1280×800 comme 1024×768) montre les 7 jours sans défilement horizontal.
// Beaucoup de salariés : la grille défile verticalement, en-tête collé.
export const KIOSK_WEEK_CSS = `
${PL_GRID_CSS}
.kb-week{height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;background:#fff;border-radius:16px;color:#15120F;font-family:'Archivo',sans-serif;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.kb-week .bt-pl-table{min-width:0;border-collapse:separate;border-spacing:0}
.kb-week thead th{position:sticky;top:0;z-index:4}
.kb-week thead .bt-pl-th-name{z-index:7}
.kb-week .bt-pl-namebtn{cursor:default}
.kb-week .bt-pl-namebtn:hover{background:transparent}
.kb-week .bt-pl-cellfill,.kb-week .bt-pl-abs{cursor:default}
/* Lot 10 : LECTURE SEULE, et ça se voit. Rien n'a l'air cliquable : curseur
   par défaut partout, aucun effet au survol ni à l'appui, pas de surbrillance
   au toucher. (Aucun bouton, aucun lien, aucun tabindex dans la grille.) */
.kb-week,.kb-week *{cursor:default!important;-webkit-tap-highlight-color:transparent}
.kb-week .bt-pl-namebtn:hover,.kb-week .bt-pl-namebtn:active{background:transparent!important}
.kb-week .bt-pl-livechip{flex-wrap:wrap;row-gap:3px}
.kb-week .bt-pl-livechip .kb-lx-title{flex:1;min-width:0;overflow-wrap:anywhere}
.kb-week .bt-pl-livechip .t{flex-basis:100%;white-space:normal}
.kb-week .bt-pl-name{white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.15}
.kb-week-empty{padding:28px 16px;text-align:center;color:#6E6A63;font-weight:700;font-size:15px}
@media (max-width:1180px){
  .kb-week .bt-pl-th-name{width:168px}
  .kb-week .bt-pl-th{padding:10px 4px}
  .kb-week .bt-pl-th-cell{gap:5px}
  .kb-week .bt-pl-th-day{font-size:13px}
  .kb-week .bt-pl-th-num{font-size:16px}
  .kb-week .bt-pl-cell{padding:6px}
  .kb-week .bt-pl-namebtn{padding:10px 8px}
  .kb-week .bt-pl-nametop{gap:8px}
  .kb-week .bt-pl-avatar{width:32px;height:32px;font-size:12px}
  .kb-week .bt-pl-name{font-size:13.5px}
}
`;

// Toujours le MÊME objet : un nouvel objet ferait réécrire la feuille de style
// par React à chaque nouveau planning (clignotement).
const KIOSK_WEEK_HTML = { __html: KIOSK_WEEK_CSS };

const dayFull = (iso: string) => { const s = format(parseISO(iso), 'EEEE', { locale: fr }); return s.charAt(0).toUpperCase() + s.slice(1); };

function KioskWeekGrid({ board, today, showLive }: {
  board: KioskBoard;
  /** Aujourd'hui à Paris (aaaa-mm-jj), calculé par la tablette : colonne surlignée. */
  today: string;
  /** Faux si le planning en cache est trop ancien : un « en cours » périmé serait faux. */
  showLive: boolean;
}) {
  const absent = new Set(board.absences.map((a) => `${a.w}|${a.date}`));
  // Une case = un salarié × un jour (l'ordre des bulles est celui de la fonction).
  const slotsOf = new Map<string, KioskBoardSlot[]>();
  for (const s of board.slots) { const k = `${s.w}|${s.date}`; slotsOf.set(k, [...(slotsOf.get(k) || []), s]); }
  const extrasOf = new Map<string, KioskBoardLiveExtra[]>();
  for (const x of board.live_extra) { const k = `${x.w}|${x.date}`; extrasOf.set(k, [...(extrasOf.get(k) || []), x]); }
  // Écran mural : après une minute sans toucher, la grille revient en haut
  // pour la personne suivante (sinon les premières lignes restent cachées).
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => { if (t) clearTimeout(t); t = setTimeout(() => el.scrollTo({ top: 0, behavior: 'smooth' }), 60 * 1000); };
    el.addEventListener('scroll', arm, { passive: true });
    return () => { el.removeEventListener('scroll', arm); if (t) clearTimeout(t); };
  }, []);
  return (
    <div className="kb-week" data-testid="kb-week" ref={ref}>
      <style dangerouslySetInnerHTML={KIOSK_WEEK_HTML} />
      <table className="bt-pl-table">
        <thead>
          <tr>
            <th className="bt-pl-th-name">
              <span className="bt-pl-corner-wk">S-{getISOWeek(parseISO(board.week_start))}</span>
              <span className="bt-pl-corner-sal">Salarié</span>
            </th>
            {board.days.map((d) => (
              <th key={d} className={`bt-pl-th ${d === today ? 'today' : ''}`}>
                <div className="bt-pl-th-cell">
                  <span className="bt-pl-th-day">{dayFull(d)}</span>
                  <span className="bt-pl-th-num">{format(parseISO(d), 'd')}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.workers.map((w) => {
            const absToday = absent.has(`${w.k}|${today}`);
            // Même pastille que le bureau (avatarTint) : pastel propre à la personne, grisée si absente.
            const tint = absToday ? { background: '#c4bdae', color: '#15120F' } : { background: paletteAt(w.tint).tagBg, color: '#15120F' };
            return (
              <tr key={w.k}>
                <td className="bt-pl-namecell" style={absToday ? { ...CELL_HEIGHT_HACK, ...HATCH_STYLE } : CELL_HEIGHT_HACK}>
                  <div className="bt-pl-namebtn">
                    <span className="bt-pl-nametop">
                      <span className="bt-pl-avatar" style={tint}>{(w.first_name[0] || '')}{(w.last_name[0] || '')}</span>
                      <span className="bt-pl-name" data-testid="kb-worker">{`${w.first_name} ${w.last_name}`.trim()}</span>
                    </span>
                    {absToday && <span className="bt-pl-status"><span className="bt-pl-status-txt" style={{ color: '#6E6A63' }}>Absent</span></span>}
                  </div>
                </td>
                {board.days.map((d) => {
                  const cell = `${w.k}|${d}`;
                  const isAbsent = absent.has(cell);
                  const slots = isAbsent ? [] : slotsOf.get(cell) || [];
                  const extras = showLive ? extrasOf.get(cell) || [] : [];
                  // Une CASE passe en vert dès que le salarié a un pointage en direct ce jour-là.
                  const live = showLive && (extras.length > 0 || slots.some((s) => s.live));
                  return (
                    <td key={d} style={CELL_HEIGHT_HACK} className={`bt-pl-cell${d === today ? ' bt-pl-cell-today' : ''}${live ? ' bt-pl-cell-live' : ''}`}>
                      <div className="bt-pl-cellinner">
                        <div className="bt-pl-cellfill">
                          {isAbsent && (
                            <div className="bt-pl-abs" style={ABSENT_STYLE} data-testid="kb-absent">
                              <span className="bt-pl-abs-lbl">Absent</span>
                            </div>
                          )}
                          {slots.map((s, i) => (
                            <PlannedBubbleView
                              key={i}
                              title={s.title}
                              sub={s.sub}
                              hours={s.hours}
                              palette={paletteAt(s.color)}
                              live={showLive && s.live ? s.live : undefined}
                            />
                          ))}
                          {extras.map((x, i) => (
                            <div key={`x${i}`} className="bt-pl-livechip" data-testid="live-extra">
                              <span className="bt-pl-live-dot" aria-hidden />
                              <span className="kb-lx-title">{x.title}</span>
                              <span className="t">en cours depuis {x.since}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {board.workers.length === 0 && <p className="kb-week-empty">Aucun salarié au planning pour l&apos;instant.</p>}
    </div>
  );
}

// La borne se redessine chaque seconde (horloge, QR) : la grille, elle, ne
// change qu'avec un nouveau planning, un nouveau jour ou la fraîcheur du direct.
export default memo(KioskWeekGrid);
