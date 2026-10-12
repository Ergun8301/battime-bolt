// Lot 6 — bandeau « Mode essai » : visible AVANT que la personne n'envoie quoi
// que ce soit (assistant du bureau, assistant du salarié, lecture d'un bulletin).
import { showTrialBanner, TRIAL_TEXT } from '@/lib/ia-formule';

export default function TrialBanner({ formule, className = '' }: { formule: string | null | undefined; className?: string }) {
  if (!showTrialBanner(formule)) return null;
  return <p role="note" data-testid="mode-essai" className={className}>{TRIAL_TEXT}</p>;
}
