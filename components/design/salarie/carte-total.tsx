'use client';

// Design salarié · la carte « Total aujourd'hui » de la planche : petit chiffre à gauche, barres des 7 jours à droite.
// Présentation seulement (les heures et les états viennent de poseur-day.tsx et de salarie-vue.ts). Visible seulement avec `?ui=2`.
import type { EtatJour } from '@/supabase/functions/_shared/salarie-vue';

export interface BarreJour { date: string; jour: string; etat: EtatJour; aujourdhui: boolean; affiche: boolean; minutes: number;
  /** Heures prévues au planning (jour à venir) : dessinent la barre en pointillés, ne comptent pas dans le total. */
  prevu?: number }

type EtatBarre = 'aujourdhui' | 'envoye' | 'a-envoyer' | 'renvoye' | 'a-venir' | 'absence' | 'cloture' | 'vide';
const ETAT_BARRE: Record<EtatJour, EtatBarre> = { vide: 'vide', prevu: 'a-venir', 'a-envoyer': 'a-envoyer', renvoye: 'renvoye', oublie: 'a-envoyer', envoye: 'envoye', cloture: 'cloture', absence: 'absence' };
const JOUR_PLEIN = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
/** 10 h = la barre pleine (même échelle que la planche). */
const MINUTES_PLEINES = 600;
/** Un jour d'absence : barre rayée de 8 h (décor, comme sur la planche). */
const MINUTES_ABSENCE = 480;
const hauteurDe = (b: BarreJour) => (b.minutes > 0 ? b.minutes : b.etat === 'absence' ? MINUTES_ABSENCE : b.prevu ?? 0);

/** Les barres : le jour dont le total est dans la carte prend les minutes de la carte (elles incluent le pointage en cours). */
export function barresAvecTotal(barres: BarreJour[], minutesAffichees: number): BarreJour[] {
  return barres.map((b) => (b.affiche ? { ...b, minutes: minutesAffichees } : b));
}
/** Les heures de la semaine : tout ce qui est noté, envoyé ou non (le pointage en cours compte comme dans le total du jour). */
export const minutesSemaine = (barres: BarreJour[]) => barres.reduce((s, b) => s + b.minutes, 0);

export function BarresSemaine({ barres }: { barres: BarreJour[] }) {
  return (
    <div className="dz-barres" aria-hidden="true" data-testid="dz-barres">
      {barres.map((b, i) => {
        const etat: EtatBarre = b.affiche ? 'aujourdhui' : ETAT_BARRE[b.etat];
        return (
          <div key={b.date} className="dz-barre-jour" data-etat={etat} title={JOUR_PLEIN[i]}>
            <div className="dz-barre-piste"><span className="dz-barre-valeur" style={{ height: `${Math.min(100, (hauteurDe(b) / MINUTES_PLEINES) * 100).toFixed(1)}%` }} /></div>
            <span>{b.jour}</span>
          </div>
        );
      })}
    </div>
  );
}
