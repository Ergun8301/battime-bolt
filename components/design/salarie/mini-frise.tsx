'use client';

// Design salarié · ÉTAPE 4 — la mini-frise de la journée : une barre qui montre, d'un coup d'œil, ce qui est fait, ce qui reste à envoyer, ce qui est prévu et le pointage en cours.
// Présentation seulement : l'axe et le placement viennent de salarie-vue.ts (`friseAxe`, testé sur les 7 cas de l'audit). Visible seulement avec `?ui=2`.
import { friseAxe, type SegmentFrise } from '@/supabase/functions/_shared/salarie-vue';

export type TypeFrise = 'fait' | 'a-envoyer' | 'prevu' | 'en-cours' | 'oublie';
export interface SegFrise extends SegmentFrise { type: TypeFrise; label?: string }
const LIB: Record<TypeFrise, string> = { fait: 'envoyé', 'a-envoyer': 'à envoyer', prevu: 'prévu', 'en-cours': 'en cours', oublie: 'sortie oubliée' };

export function MiniFrise({ segments }: { segments: SegFrise[] }) {
  if (!segments.length) return null;
  const axe = friseAxe(segments);
  const pct = (m: number) => `${(((m - axe.debut) / axe.largeur) * 100).toFixed(2)}%`;
  const resume = segments.map((s, i) => `${axe.segments[i] ? `${s.debut} à ${s.fin}` : ''} ${LIB[s.type]}`).join(', ');
  return (
    <div className="dz-frise" role="img" aria-label={`Ma journée en un coup d’œil : ${resume}`} data-testid="dz-frise">
      <div className="dz-frise-piste">
        {axe.segments.map((a, i) => (
          <span
            key={i}
            className={`dz-frise-seg dz-frise-${segments[i].type}${a.point ? ' is-point' : ''}`}
            style={{ left: pct(a.debut), width: a.point ? undefined : `calc(${pct(a.fin)} - ${pct(a.debut)})` }}
            data-testid={`dz-frise-seg-${segments[i].type}`}
          />
        ))}
        {axe.minuit !== null && <span className="dz-frise-minuit" style={{ left: pct(axe.minuit) }} />}
      </div>
      <div className="dz-frise-ticks" aria-hidden="true">
        {axe.ticks.filter((_, i) => i % Math.max(1, Math.round(axe.ticks.length / 6)) === 0).map((t) => (
          <span key={t.min} style={{ left: pct(t.min) }}>{t.label === 'minuit' ? 'minuit' : `${Math.floor((((t.min % 1440) + 1440) % 1440) / 60)}h`}</span>
        ))}
      </div>
    </div>
  );
}
