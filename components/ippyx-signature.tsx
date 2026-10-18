import type { CSSProperties } from 'react';
import { ippyxHref } from '@/lib/ippyx';

// Signature « Site réalisé par IPPYX », reprise fidèle de celle de la landing
// (.lp-sign, écrite en HTML brut dans app/landing/page.tsx et laissée telle
// quelle). Même logo SVG en currentColor, même famille mono 12 px, soulignement
// sur le texte seulement. Lien suivi (pas de nofollow) : c'est le crédit de
// l'agence, voulu pour le référencement croisé.
//
// `tone` : « dark » sur fond noir (pages légales, comme la landing), « light »
// sur fond crème (pages /fonctionnalites et /suisse).
// `align` : centré sous un pied de page en ligne, ou à gauche sous une ligne
// de pied de page alignée à gauche (pages légales).

const CSS = `
.ix-sign{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;line-height:1.4}
.ix-sign--center{text-align:center}
.ix-sign a{display:inline-flex;align-items:center;gap:7px;text-decoration:none !important;border-bottom:none !important;transition:color .18s ease}
.ix-sign a svg{display:block;flex:none}
.ix-sign a span{padding-bottom:1px;transition:border-color .18s ease}
.ix-sign--dark a{color:#9a948a !important}
.ix-sign--dark a span{border-bottom:1px solid rgba(154,148,138,.42)}
.ix-sign--dark a:hover,.ix-sign--dark a:focus-visible{color:#FFC21A !important}
.ix-sign--dark a:hover span,.ix-sign--dark a:focus-visible span{border-bottom-color:rgba(255,194,26,.6)}
.ix-sign--light a{color:#6E6A63 !important}
.ix-sign--light a span{border-bottom:1px solid rgba(110,106,99,.38)}
.ix-sign--light a:hover,.ix-sign--light a:focus-visible{color:#15120F !important}
.ix-sign--light a:hover span,.ix-sign--light a:focus-visible span{border-bottom-color:rgba(21,18,15,.55)}
`;

export default function IppyxSignature({
  campaign,
  tone = 'dark',
  align = 'center',
  style,
}: {
  campaign: string;
  tone?: 'dark' | 'light';
  align?: 'center' | 'left';
  style?: CSSProperties;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={`ix-sign ix-sign--${tone}${align === 'center' ? ' ix-sign--center' : ''}`} style={style}>
        <a href={ippyxHref(campaign)} target="_blank" rel="noopener" aria-label="Site réalisé par IPPYX">
          <svg width="13" height="14" viewBox="0 0 26 27" aria-hidden="true" focusable="false">
            <g fill="currentColor">
              <rect x="0" y="7" width="4" height="4" /><rect x="4" y="11" width="4" height="4" />
              <rect x="8" y="15" width="4" height="4" /><rect x="12" y="19" width="4" height="4" />
              <rect x="16" y="23" width="4" height="4" /><rect x="16" y="7" width="4" height="4" />
              <rect x="12" y="11" width="4" height="4" /><rect x="4" y="19" width="4" height="4" />
              <rect x="0" y="23" width="4" height="4" />
            </g>
            <rect x="21.6" y="1.4" width="4" height="4" fill="currentColor" />
          </svg>
          <span>Site réalisé par IPPYX</span>
        </a>
      </div>
    </>
  );
}
