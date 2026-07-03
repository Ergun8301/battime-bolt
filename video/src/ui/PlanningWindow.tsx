import React from 'react';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, JAUNE_OMBRE, MONO, NOIR, VERT_OK } from '../brand';
import { clamp01 } from './helpers';

// Fenêtre navigateur bemexo.fr/planning — mockup fictif piloté par la scène S4/S5.
export type PlanningState = {
  fill: number;      // 0..1 remplissage en cascade des cases
  ping: number;      // 0..1 tooltip "Reçu à l'instant"
  menuOpen: number;  // 0..1 menu Exporter déroulé
  menuHot: number;   // 0..1 surbrillance "Exporter l'équipe"
};

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
    <div style={{ width, fontFamily: ARCHIVO, position: 'relative', filter: 'drop-shadow(0 60px 90px rgba(0,0,0,.65))' }}>
      <div style={{ background: CREME, borderRadius: 18 * u, overflow: 'hidden', border: '1px solid rgba(255,255,255,.09)' }}>
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
            {state.menuOpen > 0.01 && (
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
          <div style={{ ...cell, background: 'rgba(255,194,26,.05)' }}>
            <Chip u={u} p={stagger(fill, 0.45)} bar="#C9821F" title="Villa Lupin" dashed />
          </div>
          <div style={cell}>{plus}</div>

          {/* Julien */}
          <div style={{ ...cell, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRight: '2px solid rgba(21,18,15,.14)', borderBottom: 'none' }}>{avatar('JM')}</div>
          <div style={{ ...cell, borderBottom: 'none' }}>
            <Chip u={u} p={stagger(fill, 0.25)} dark bar="#A23E6B" title="Toiture Pasteur" sub="5h00" />
          </div>
          <div style={{ ...cell, borderBottom: 'none', background: 'rgba(255,194,26,.05)' }}>
            <Chip u={u} p={stagger(fill, 0.62)} bar="#A23E6B" title="Toiture Pasteur" dashed />
          </div>
          <div style={{ ...cell, borderBottom: 'none' }}>{plus}</div>
        </div>
      </div>
    </div>
  );
};
