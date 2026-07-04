import React from 'react';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, JAUNE_OMBRE, MONO, NOIR, ROUILLE, VERT_OK } from '../brand';
import { clamp01 } from './helpers';

// Fenêtre navigateur bemexo.fr/planning — mockup fictif piloté par la scène S4/S5.
// v2 : cellule "En attente" + cloche de relance (Julien · JEU), curseur intégré
// en COORDONNÉES FENÊTRE (0..1) => il suit naturellement les zooms caméra.
export type PlanningState = {
  fill: number;          // 0..1 remplissage en cascade des saisies RÉELLES
  ping: number;          // 0..1 tooltip "Reçu à l'instant"
  menuOpen: number;      // 0..1 menu Exporter déroulé
  menuHot: number;       // 0..1 surbrillance "Exporter l'équipe"
  plannedIn?: number;    // 0..1 apparition des chips "Prévu" (dès l'establishing)
  pendingPulse?: number; // 0..1 pulsation du badge "En attente"
  bellClick?: number;    // 0..1 enfoncement de la cloche
  relanced?: number;     // 0..1 badge devient "Relancé ✓"
  cursor?: { x: number; y: number; click: number; visible: number }; // coordonnées relatives fenêtre
};

// Couleurs OPAQUES pré-mélangées (les fonds rgba semi-transparents déclenchent
// un bug de compositing Chromium sous transform : la cellule laisse voir le
// fond de page au lieu du crème parent).
const MER_BG = '#F3EBD9';        // crème + 5 % jaune
const PENDING_BG = '#EFE3D7';    // crème + 6 % rouille
const PENDING_BADGE = '#E9D0C1'; // badge "En attente"
const RELANCED_BG = '#E4E8DB';   // crème + 7 % vert

const stagger = (fill: number, start: number, span = 0.18) => clamp01((fill - start) / span);

const Chip: React.FC<{ p: number; dark?: boolean; bar: string; title: string; sub?: string; dashed?: boolean; u: number }> = ({ p, dark, bar, title, sub, dashed, u }) => (
  <div
    style={{
      position: 'relative', overflow: 'hidden', borderRadius: 10 * u,
      background: dark ? NOIR : '#fff',
      border: dashed ? `2px dashed ${bar}` : '1px solid rgba(21,18,15,.1)',
      padding: `${9 * u}px ${10 * u}px ${9 * u}px ${14 * u}px`,
      opacity: p, transform: `translateY(${(1 - p) * 16}px) scale(${0.92 + p * 0.08})`,
    }}
  >
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 * u, background: bar }} />
    <div style={{ fontSize: 14.5 * u, fontWeight: 900, color: dark ? CREME : NOIR }}>{title}</div>
    {sub && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 * u, marginTop: 3 * u }}>
        <span style={{ width: 13 * u, height: 13 * u, background: VERT_OK, borderRadius: '50%', color: '#fff', fontSize: 9 * u, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
        <span style={{ fontFamily: MONO, fontSize: 12.5 * u, fontWeight: 700, color: JAUNE }}>{sub}</span>
      </div>
    )}
    {!sub && dashed && (
      <div style={{ marginTop: 3 * u }}>
        <span style={{ fontFamily: MONO, fontSize: 10 * u, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 700, padding: `${2 * u}px ${7 * u}px`, borderRadius: 5 * u, background: '#F1E3CB', color: '#9a7c14' }}>Prévu</span>
      </div>
    )}
  </div>
);

export const PlanningWindow: React.FC<{ width: number; state: PlanningState }> = ({ width, state }) => {
  const u = width / 1000;
  const { fill } = state;
  const planned = clamp01(state.plannedIn ?? 1);
  const pendingOn = fill > 0.75;
  const pulse = 1 + (state.pendingPulse ?? 0) * 0.09;
  const relanced = clamp01(state.relanced ?? 0);

  const avatar = (init: string) => (
    <div style={{ width: 40 * u, height: 40 * u, borderRadius: '50%', background: NOIR, color: JAUNE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 * u }}>
      {init}
    </div>
  );

  const dayHead = (label: string, num: string, active?: boolean) => (
    <div style={{ padding: `${10 * u}px 0`, textAlign: 'center', background: active ? NOIR : 'transparent', borderRight: '1px solid rgba(21,18,15,.08)', borderBottom: '2px solid rgba(21,18,15,.14)' }}>
      <div style={{ fontFamily: MONO, fontSize: 12 * u, fontWeight: 700, color: active ? JAUNE : '#9a948a' }}>{label}</div>
      <div style={{ fontSize: 19 * u, fontWeight: 900, color: active ? CREME : NOIR }}>{num}</div>
    </div>
  );

  const cell: React.CSSProperties = { padding: 8 * u, borderRight: '1px solid rgba(21,18,15,.08)', borderBottom: '1px solid rgba(21,18,15,.08)', minHeight: 74 * u };
  const plus = (
    <div style={{ minHeight: 56 * u, border: '2px dashed rgba(21,18,15,.16)', borderRadius: 10 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8b1a4', fontSize: 20 * u, fontWeight: 800 }}>+</div>
  );

  return (
    <div style={{ width, fontFamily: ARCHIVO, position: 'relative' }}>
      <div
        style={{
          background: CREME, borderRadius: 18 * u, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.09)',
          boxShadow: '0 70px 110px -30px rgba(0,0,0,.66), 0 24px 44px -18px rgba(0,0,0,.5)',
        }}
      >
        {/* barre navigateur */}
        <div style={{ background: '#211D19', padding: `${12 * u}px ${16 * u}px`, display: 'flex', alignItems: 'center', gap: 8 * u }}>
          <span style={{ width: 13 * u, height: 13 * u, borderRadius: '50%', background: '#FF5F57' }} />
          <span style={{ width: 13 * u, height: 13 * u, borderRadius: '50%', background: '#FEBC2E' }} />
          <span style={{ width: 13 * u, height: 13 * u, borderRadius: '50%', background: '#28C840' }} />
          <span style={{ fontFamily: MONO, marginLeft: 10 * u, fontSize: 13 * u, color: '#9a948a' }}>bemexo.fr/planning</span>
        </div>

        {/* header planning + bouton Exporter */}
        <div style={{ background: NOIR, color: CREME, padding: `${14 * u}px ${20 * u}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11 * u, letterSpacing: '.15em', textTransform: 'uppercase', color: JAUNE, marginBottom: 3 * u }}>Planning équipe</div>
            <div style={{ fontSize: 20 * u, fontWeight: 900, letterSpacing: '-.02em' }}>Semaine 25 · 16–21 juin</div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ background: JAUNE, color: NOIR, fontWeight: 900, fontSize: 15 * u, borderRadius: 11 * u, padding: `${10 * u}px ${16 * u}px`, boxShadow: `0 ${3 * u}px 0 ${JAUNE_OMBRE}` }}>
              Exporter ▾
            </div>
            {(state.menuOpen ?? 0) > 0.01 && (
              <div
                style={{
                  position: 'absolute', top: '112%', right: 0, width: 300 * u, background: '#fff',
                  borderRadius: 12 * u, border: '1px solid rgba(21,18,15,.12)', boxShadow: '0 18px 40px -12px rgba(0,0,0,.45)',
                  padding: 6 * u, zIndex: 5,
                  opacity: clamp01(state.menuOpen), transform: `translateY(${(1 - clamp01(state.menuOpen)) * -8}px)`,
                }}
              >
                <div style={{ borderRadius: 8 * u, padding: `${10 * u}px ${12 * u}px`, background: state.menuHot > 0.3 ? '#FFF1CC' : 'transparent', border: state.menuHot > 0.3 ? `1.5px solid ${JAUNE}` : '1.5px solid transparent' }}>
                  <div style={{ fontSize: 14.5 * u, fontWeight: 900, color: NOIR }}>Exporter l&apos;équipe</div>
                  <div style={{ fontSize: 12 * u, fontWeight: 600, color: GRIS_TXT }}>verrouille le mois</div>
                </div>
                <div style={{ borderRadius: 8 * u, padding: `${10 * u}px ${12 * u}px` }}>
                  <div style={{ fontSize: 14.5 * u, fontWeight: 900, color: NOIR }}>Exporter un salarié</div>
                  <div style={{ fontSize: 12 * u, fontWeight: 600, color: GRIS_TXT }}>sans verrou</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* grille */}
        <div style={{ display: 'grid', gridTemplateColumns: `${86 * u}px 1fr 1fr 1fr` }}>
          <div style={{ borderRight: '1px solid rgba(21,18,15,.08)', borderBottom: '2px solid rgba(21,18,15,.14)' }} />
          {dayHead('LUN', '16')}
          {dayHead('MER', '18', true)}
          {dayHead('JEU', '19')}

          {/* Karim */}
          <div style={{ ...cell, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRight: '2px solid rgba(21,18,15,.14)' }}>{avatar('KB')}</div>
          <div style={{ ...cell, position: 'relative' }}>
            {/* placeholder lisible tant que la saisie réelle n'est pas arrivée */}
            <div style={{ position: 'absolute', inset: 8 * u, opacity: Math.max(0, 1 - stagger(fill, 0.05) * 1.6) }}>{plus}</div>
            <Chip u={u} p={stagger(fill, 0.05)} dark bar="#C9821F" title="Villa Lupin" sub="4h00" />
            {state.ping > 0.02 && (
              <div
                style={{
                  position: 'absolute', top: -14 * u, right: 6 * u, background: NOIR, color: CREME,
                  borderRadius: 999, padding: `${5 * u}px ${11 * u}px`, fontSize: 11.5 * u, fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 6 * u, whiteSpace: 'nowrap',
                  opacity: clamp01(state.ping), transform: `translateY(${(1 - clamp01(state.ping)) * 8}px)`,
                  boxShadow: '0 10px 24px -8px rgba(0,0,0,.5)', zIndex: 4,
                }}
              >
                <span style={{ width: 7 * u, height: 7 * u, background: VERT_OK, borderRadius: '50%' }} />
                Reçu à l&apos;instant
              </div>
            )}
          </div>
          <div style={{ ...cell, background: MER_BG }}>
            <Chip u={u} p={planned} bar="#C9821F" title="Villa Lupin" dashed />
          </div>
          <div style={cell}>{plus}</div>

          {/* Julien */}
          <div style={{ ...cell, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRight: '2px solid rgba(21,18,15,.14)', borderBottom: 'none' }}>{avatar('JM')}</div>
          <div style={{ ...cell, borderBottom: 'none', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 8 * u, opacity: Math.max(0, 1 - stagger(fill, 0.25) * 1.6) }}>{plus}</div>
            <Chip u={u} p={stagger(fill, 0.25)} dark bar="#A23E6B" title="Toiture Pasteur" sub="5h00" />
          </div>
          <div style={{ ...cell, borderBottom: 'none', background: MER_BG }}>
            <Chip u={u} p={planned} bar="#A23E6B" title="Toiture Pasteur" dashed />
          </div>
          {/* JEU Julien — saisie manquante : badge En attente + cloche de relance */}
          <div style={{ ...cell, borderBottom: 'none' }}>
            {!pendingOn ? (
              plus
            ) : (
              <div
                style={{
                  minHeight: 56 * u, border: `2px dashed ${relanced > 0.4 ? 'rgba(47,163,107,.55)' : 'rgba(192,70,31,.55)'}`,
                  background: relanced > 0.4 ? RELANCED_BG : PENDING_BG,
                  borderRadius: 10 * u, padding: `${7 * u}px ${9 * u}px`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 * u,
                }}
              >
                {relanced > 0.4 ? (
                  <span
                    style={{
                      fontFamily: MONO, fontSize: 10.5 * u, fontWeight: 700, letterSpacing: '.04em',
                      color: '#1f7a4d', background: '#E7F6ED', border: `1.5px solid ${VERT_OK}`,
                      borderRadius: 999, padding: `${3 * u}px ${9 * u}px`,
                      transform: `scale(${0.6 + relanced * 0.4})`, opacity: relanced,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Relancé ✓
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: MONO, fontSize: 10.5 * u, fontWeight: 700, letterSpacing: '.04em',
                      color: ROUILLE, background: PENDING_BADGE, border: `1.5px solid rgba(192,70,31,.5)`,
                      borderRadius: 999, padding: `${3 * u}px ${9 * u}px`,
                      transform: `scale(${pulse})`, whiteSpace: 'nowrap',
                    }}
                  >
                    En attente
                  </span>
                )}
                <span
                  style={{
                    width: 30 * u, height: 30 * u, flex: 'none', borderRadius: '50%',
                    background: NOIR, color: JAUNE, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14 * u, boxShadow: `0 ${2.5 * u}px 0 rgba(0,0,0,.35)`,
                    transform: `translateY(${(state.bellClick ?? 0) * 2.5 * u}px) scale(${1 - (state.bellClick ?? 0) * 0.08})`,
                  }}
                >
                  🔔
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* curseur en coordonnées fenêtre (suit les zooms caméra) */}
      {state.cursor && state.cursor.visible > 0.02 && (
        <div
          style={{
            position: 'absolute',
            left: `${state.cursor.x * 100}%`,
            top: `${state.cursor.y * 100}%`,
            zIndex: 40,
            opacity: state.cursor.visible,
            transform: `scale(${1 - state.cursor.click * 0.16})`,
            transformOrigin: 'top left',
          }}
        >
          <svg width={30 * u} height={41 * u} viewBox="0 0 34 46">
            <path d="M2 2 L2 36 L11 28 L17 43 L24 40 L18 25 L30 24 Z" fill={NOIR} stroke={CREME} strokeWidth="2.5" />
          </svg>
          {state.cursor.click > 0.03 && (
            <div
              style={{
                position: 'absolute', top: -12 * u, left: -12 * u, width: 48 * u, height: 48 * u,
                borderRadius: '50%', border: `3px solid ${JAUNE}`,
                opacity: 1 - state.cursor.click, transform: `scale(${0.5 + state.cursor.click})`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};
