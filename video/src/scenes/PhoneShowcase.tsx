import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ARCHIVO, MONO } from '../brand';
import { CineBackdrop } from '../ui/CineBackdrop';
import { PhoneMaJournee } from '../ui/PhoneMaJournee';

// Compos de VALIDATION (stills envoyés à Ergun) : deux traitements du téléphone
// sur la nouvelle ambiance de fond v2, pour choisir la direction.
//  A — frontal flottant : face caméra, zéro rotation, élévation (ombre large douce)
//  B — perspective 3D : rotation marquée (pose d'entrée en scène), ombre au sol réaliste

const POSE = {
  sheet: 0,
  tapPulse: 0,
  selected: 1,
  endMinutes: 645, // 07:30 → 10:45, molette en cours (3:15)
  pressed: 0,
  sent: 0,
  offline: 0,
};

export const PhoneShowcase: React.FC<{ variant: 'A' | 'B' }> = ({ variant }) => {
  return (
    <AbsoluteFill style={{ fontFamily: ARCHIVO }}>
      <CineBackdrop />

      {variant === 'A' ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* halo d'élévation, très diffus, derrière le téléphone */}
          <div
            style={{
              position: 'absolute', width: 900, height: 900, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,194,26,.10), transparent 58%)',
              filter: 'blur(34px)',
            }}
          />
          <div
            style={{
              filter:
                'drop-shadow(0 80px 110px rgba(0,0,0,.62)) drop-shadow(0 26px 42px rgba(0,0,0,.42))',
            }}
          >
            <PhoneMaJournee width={452} state={POSE} />
          </div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* ombre au sol réaliste (ellipse floue, décalée côté opposé à la lumière) */}
          <div
            style={{
              position: 'absolute', bottom: 64, left: '50%',
              width: 700, height: 120,
              transform: 'translateX(-42%)',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,.6), transparent 64%)',
              filter: 'blur(20px)',
            }}
          />
          <div
            style={{
              transform: 'perspective(2100px) rotateY(-24deg) rotateX(7deg) rotate(-2deg)',
            }}
          >
            <div style={{ filter: 'drop-shadow(60px 70px 80px rgba(0,0,0,.55))' }}>
              <PhoneMaJournee width={452} state={POSE} />
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* étiquette de validation */}
      <div
        style={{
          position: 'absolute', top: 42, left: 0, right: 0, textAlign: 'center',
          fontFamily: MONO, fontSize: 22, letterSpacing: '.16em', fontWeight: 700,
          color: 'rgba(242,237,227,.55)',
        }}
      >
        {variant === 'A' ? 'VARIANTE A · FRONTAL FLOTTANT' : 'VARIANTE B · PERSPECTIVE 3D'}
      </div>
    </AbsoluteFill>
  );
};
