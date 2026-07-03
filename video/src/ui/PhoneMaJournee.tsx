import React from 'react';
import { ARCHIVO, CREME, CREME_TXT_DIM, GRIS_TXT, JAUNE, JAUNE_OMBRE, MONO, NOIR, NOIR_CARD, ROUILLE, VERT_OK } from '../brand';
import { clamp01, fmtClock, fmtHM } from './helpers';

// Mockup "Ma journée" (données fictives) piloté image par image par la scène S3.
// Reconstruction stylisée de l'écran poseur — AUCUNE donnée réelle.
export type PhoneState = {
  sheet: number;        // 0 fermé → 1 feuille "Chantier" ouverte
  tapPulse: number;     // 0..1 anneau de tap sur Villa Lupin
  selected: number;     // 0..1 apparition de la carte chantier choisie
  endMinutes: number;   // fin de journée animée (450 = 07:30 → 690 = 11:30)
  pressed: number;      // 0..1 enfoncement du bouton Envoyer
  sent: number;         // 0..1 badge ✓ Envoyé
  offline: number;      // 0..1 bandeau hors-ligne
};

const START_MIN = 450; // 07:30

export const PhoneMaJournee: React.FC<{ width: number; state: PhoneState }> = ({ width, state }) => {
  const u = width / 390; // unité responsive (base 390 px)
  const total = Math.max(0, state.endMinutes - START_MIN);
  const off = clamp01(state.offline);

  return (
    <div
      style={{
        width,
        background: NOIR,
        borderRadius: 56 * u,
        padding: 13 * u,
        border: `1.5px solid rgba(255,255,255,.12)`,
        boxShadow: '0 70px 130px -45px rgba(0,0,0,.8)',
        fontFamily: ARCHIVO,
        position: 'relative',
      }}
    >
      <div style={{ background: CREME, borderRadius: 44 * u, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 818 * u }}>
        {/* ===== header noir (avec barre de statut → proportions réelles) ===== */}
        <div style={{ background: NOIR, color: CREME, padding: `${14 * u}px ${24 * u}px ${18 * u}px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 * u }}>
            <span style={{ fontFamily: MONO, fontSize: 13.5 * u, fontWeight: 700, color: CREME }}>07:42</span>
            <span style={{ display: 'flex', alignItems: 'flex-end', gap: 4 * u }}>
              {[4, 6.5, 9, 11.5].map((h, i) => (
                <span key={i} style={{ width: 3.2 * u, height: h * u, background: CREME, borderRadius: 1, opacity: i < 3 ? 1 : 0.35 }} />
              ))}
              <span style={{ width: 23 * u, height: 11.5 * u, border: `1.5px solid rgba(242,237,227,.8)`, borderRadius: 3.5 * u, marginLeft: 5 * u, padding: 1.8 * u, display: 'flex' }}>
                <span style={{ width: '68%', background: CREME, borderRadius: 1 }} />
              </span>
            </span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13 * u, letterSpacing: '.16em', color: JAUNE, fontWeight: 700, marginBottom: 6 * u }}>
            MA JOURNÉE
          </div>
          <div style={{ fontSize: 28 * u, fontWeight: 900, letterSpacing: '-.02em' }}>Lundi 20 juin</div>
        </div>

        {/* ===== bandeau hors-ligne (beat dédié) ===== */}
        <div
          style={{
            background: ROUILLE, color: '#fff', overflow: 'hidden',
            height: 40 * u * off, opacity: off,
            display: 'flex', alignItems: 'center', gap: 9 * u, padding: `0 ${24 * u}px`,
            fontSize: 14.5 * u, fontWeight: 800,
          }}
        >
          <span style={{ width: 9 * u, height: 9 * u, background: '#fff', borderRadius: '50%', flex: 'none' }} />
          Hors-ligne, tout est gardé · 1 en attente
        </div>

        {/* ===== corps (flex → remplit la hauteur réelle du téléphone) ===== */}
        <div style={{ padding: 18 * u, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* carte total */}
          <div style={{ background: NOIR, color: CREME, borderRadius: 20 * u, padding: 18 * u, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 74 * u, height: 10 * u, background: `repeating-linear-gradient(45deg, ${NOIR} 0 ${8 * u}px, ${JAUNE} ${8 * u}px ${16 * u}px)` }} />
            <div style={{ fontFamily: MONO, fontSize: 11.5 * u, letterSpacing: '.16em', textTransform: 'uppercase', color: CREME_TXT_DIM, marginBottom: 8 * u }}>
              Total aujourd&apos;hui
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 * u, marginBottom: 14 * u }}>
              <span style={{ fontFamily: MONO, fontSize: 56 * u, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 0.9 }}>
                {fmtHM(total)}
              </span>
              <span style={{ fontSize: 15 * u, fontWeight: 700, color: CREME_TXT_DIM }}>travaillées</span>
            </div>
            <div style={{ display: 'flex', gap: 8 * u }}>
              <div style={{ flex: 1, background: NOIR_CARD, borderRadius: 12 * u, padding: `${10 * u}px ${12 * u}px` }}>
                <div style={{ fontFamily: MONO, fontSize: 20 * u, fontWeight: 700, lineHeight: 1 }}>{total > 0 ? 1 : 0}</div>
                <div style={{ fontSize: 12 * u, fontWeight: 600, color: CREME_TXT_DIM, marginTop: 3 * u }}>interv.</div>
              </div>
              <div style={{ flex: 1, background: NOIR_CARD, borderRadius: 12 * u, padding: `${10 * u}px ${12 * u}px` }}>
                <div style={{ fontFamily: MONO, fontSize: 20 * u, fontWeight: 700, lineHeight: 1 }}>0:45</div>
                <div style={{ fontSize: 12 * u, fontWeight: 600, color: CREME_TXT_DIM, marginTop: 3 * u }}>pauses</div>
              </div>
              <div style={{ flex: 1, background: JAUNE, borderRadius: 12 * u, padding: `${10 * u}px ${12 * u}px` }}>
                <div style={{ fontSize: 16 * u, fontWeight: 900, color: NOIR, lineHeight: 1.1 }}>Panier ✓</div>
                <div style={{ fontSize: 12 * u, fontWeight: 700, color: '#7a5e00', marginTop: 3 * u }}>repas</div>
              </div>
            </div>
          </div>

          {/* chantier : champ à choisir OU carte sélectionnée */}
          {state.selected < 0.02 ? (
            <div
              style={{
                marginTop: 14 * u, border: `2px dashed rgba(21,18,15,.28)`, borderRadius: 16 * u,
                padding: `${16 * u}px ${16 * u}px`, color: GRIS_TXT, fontWeight: 800, fontSize: 16.5 * u,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              Choisir le chantier <span style={{ color: NOIR, fontSize: 22 * u }}>›</span>
            </div>
          ) : (
            <div
              style={{
                marginTop: 14 * u, background: '#fff', border: '1px solid rgba(21,18,15,.1)', borderRadius: 16 * u,
                padding: 16 * u, position: 'relative', overflow: 'hidden',
                opacity: clamp01(state.selected),
                transform: `translateY(${(1 - clamp01(state.selected)) * 14}px)`,
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 * u, background: '#C9821F' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18 * u, fontWeight: 900, color: NOIR }}>Villa Lupin</div>
                  <div style={{ fontSize: 13.5 * u, fontWeight: 600, color: GRIS_TXT, marginTop: 2 * u }}>Aix-en-Provence</div>
                </div>
                {state.sent > 0.05 && (
                  <div
                    style={{
                      background: '#E7F6ED', border: `1.5px solid ${VERT_OK}`, color: '#1f7a4d',
                      borderRadius: 999, padding: `${6 * u}px ${13 * u}px`, fontWeight: 900, fontSize: 14 * u,
                      transform: `scale(${0.5 + clamp01(state.sent) * 0.5})`, opacity: clamp01(state.sent),
                    }}
                  >
                    ✓ Envoyé
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u, marginTop: 12 * u }}>
                <span style={{ fontFamily: MONO, fontSize: 19 * u, fontWeight: 700, color: NOIR }}>
                  07:30 → {fmtClock(state.endMinutes)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 15 * u, fontWeight: 700, color: '#9a7c14', background: '#F1E3CB', borderRadius: 8 * u, padding: `${2 * u}px ${8 * u}px` }}>
                  {fmtHM(total)}
                </span>
                {/* petite molette */}
                <span style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 3 * u }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 22 * u, height: 3 * u, borderRadius: 3, background: i === 1 ? JAUNE : 'rgba(21,18,15,.25)' }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          {/* panier repas (comme dans l'app) — donne aussi sa hauteur au téléphone */}
          <div style={{ marginTop: 12 * u, background: '#fff', border: '1px solid rgba(21,18,15,.1)', borderRadius: 16 * u, padding: `${12 * u}px ${14 * u}px`, display: 'flex', alignItems: 'center', gap: 10 * u }}>
            <span style={{ fontSize: 21 * u }}>🥪</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5 * u, fontWeight: 800, color: NOIR }}>Panier repas</div>
              <div style={{ fontSize: 12 * u, color: GRIS_TXT, fontWeight: 600 }}>Déclaré aujourd&apos;hui</div>
            </div>
            <div style={{ width: 52 * u, height: 29 * u, background: NOIR, borderRadius: 999, position: 'relative', flex: 'none' }}>
              <span style={{ position: 'absolute', top: 3 * u, right: 3 * u, width: 23 * u, height: 23 * u, background: JAUNE, borderRadius: '50%' }} />
            </div>
          </div>

          {/* ajout d'intervention (comme dans l'app) — comble l'espace de l'écran réel */}
          <div
            style={{
              marginTop: 12 * u, border: '2px dashed rgba(21,18,15,.2)', borderRadius: 16 * u,
              padding: `${13 * u}px`, textAlign: 'center', color: '#9a948a', fontWeight: 800, fontSize: 15 * u,
            }}
          >
            ＋ Ajouter une intervention
          </div>

          {/* pousse le bouton vers le bas (hauteur réelle du téléphone) */}
          <div style={{ flex: 1, minHeight: 10 * u }} />

          {/* bouton envoyer */}
          <div
            style={{
              marginTop: 16 * u, background: JAUNE, color: NOIR, borderRadius: 16 * u,
              padding: `${17 * u}px`, textAlign: 'center', fontWeight: 900, fontSize: 19 * u,
              boxShadow: `0 ${Math.max(1, 6 * (1 - state.pressed)) * u}px 0 ${JAUNE_OMBRE}`,
              transform: `translateY(${state.pressed * 5 * u}px) scale(${1 - state.pressed * 0.02})`,
            }}
          >
            Envoyer ma journée →
          </div>

          {/* indicateur home */}
          <div style={{ width: 122 * u, height: 5 * u, borderRadius: 4, background: 'rgba(21,18,15,.25)', margin: `${13 * u}px auto 2px` }} />
        </div>

        {/* ===== feuille "Chantier" (par-dessus) ===== */}
        {state.sheet > 0.01 && (
          <div style={{ position: 'absolute', inset: 0, background: `rgba(21,18,15,${0.35 * clamp01(state.sheet)})`, borderRadius: 44 * u }}>
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                background: CREME, borderRadius: `${26 * u}px ${26 * u}px ${44 * u}px ${44 * u}px`,
                padding: 18 * u,
                transform: `translateY(${(1 - clamp01(state.sheet)) * 100}%)`,
                boxShadow: '0 -20px 50px rgba(0,0,0,.35)',
              }}
            >
              <div style={{ width: 44 * u, height: 5 * u, borderRadius: 3, background: 'rgba(21,18,15,.22)', margin: `0 auto ${12 * u}px` }} />
              <div style={{ fontSize: 19 * u, fontWeight: 900, color: NOIR, marginBottom: 12 * u }}>Chantier</div>

              {/* Autre — toujours dispo */}
              <div style={{ border: `2px dashed ${JAUNE_OMBRE}`, background: '#FBF6E9', borderRadius: 14 * u, padding: `${12 * u}px ${14 * u}px`, fontWeight: 800, fontSize: 15 * u, color: '#7a5e00', marginBottom: 10 * u }}>
                + Autre chantier · travail non prévu
              </div>

              {/* Villa Lupin — cible du tap */}
              <div
                style={{
                  position: 'relative', background: '#fff', borderRadius: 14 * u, padding: `${14 * u}px ${14 * u}px`,
                  border: state.tapPulse > 0.03 ? `2.5px solid ${JAUNE}` : '1px solid rgba(21,18,15,.12)',
                  boxShadow: state.tapPulse > 0.03 ? `0 0 0 ${state.tapPulse * 9 * u}px rgba(255,194,26,${0.35 * (1 - state.tapPulse)})` : 'none',
                  marginBottom: 10 * u,
                }}
              >
                <div style={{ fontSize: 16.5 * u, fontWeight: 900, color: NOIR }}>Villa Lupin</div>
                <div style={{ fontSize: 13 * u, fontWeight: 600, color: GRIS_TXT }}>Aix-en-Provence</div>
              </div>

              <div style={{ background: '#fff', borderRadius: 14 * u, padding: `${14 * u}px ${14 * u}px`, border: '1px solid rgba(21,18,15,.12)', marginBottom: 6 * u }}>
                <div style={{ fontSize: 16.5 * u, fontWeight: 900, color: NOIR }}>Toiture Pasteur</div>
                <div style={{ fontSize: 13 * u, fontWeight: 600, color: GRIS_TXT }}>Marseille 13e</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
