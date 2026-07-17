'use client';

import { IS_PROD_DB } from '@/lib/supabase';

// Bandeau discret affiche UNIQUEMENT quand l'app n'est pas reliee a la base de
// production (staging / preview). Invisible en prod.
// Purement visuel : pointer-events:none => n'intercepte jamais un clic, ne
// decale rien (position:fixed). Aucune logique metier, aucune dependance.
export default function StagingBanner() {
  if (IS_PROD_DB) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 2147483647,
        pointerEvents: 'none',
        background: '#15120F',
        color: '#FFC21A',
        border: '1px solid #FFC21A',
        borderRadius: 999,
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 800,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: '0.04em',
        boxShadow: '0 6px 18px -6px rgba(0,0,0,.5)',
        userSelect: 'none',
      }}
    >
      ⚠ STAGING · base de test
    </div>
  );
}
