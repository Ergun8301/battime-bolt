import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * L'heure locale (Europe/Paris) d'un instant, en « 14:05 ».
 *
 * POURQUOI ICI ET PAS DANS CHAQUE ÉCRAN. Cette fonction vivait dans
 * `live-timer.tsx` ; l'étape 26 en avait besoin dans `poseur-day.tsx`. La
 * recopier aurait fait deux versions d'une règle de fuseau horaire — et le jour
 * où l'une des deux dériverait, un salarié lirait deux heures différentes pour
 * le même instant, sur le même écran.
 *
 * Toute l'application raisonne en Europe/Paris, y compris côté base
 * (`is_my_team_member`, `stop_active_session`). Le fuseau du téléphone n'entre
 * jamais dans le calcul : un salarié en déplacement ne doit pas voir ses heures
 * bouger.
 */
export function parisHHmm(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso)).replace('h', ':');
}
