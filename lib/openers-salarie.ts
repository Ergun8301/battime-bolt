// Les OUVREURS du salarié, côté navigateur (étape 3, livraison 3b-1) : la vague 1 de docs/ia-etape3/00-conception-etape3.md §3.1 qui ne touche aucune fenêtre à état interne
// (`jour.date`, `formations.ouvrir`). Les autres (`historique.supprimees`, `semaine.ouvrir`, `mois.ouvrir`, `conges.demande`, la journée…) exigent une prop `init` sur une fenêtre
// ou toucher components/poseur-day.tsx : reportés, voir OUVREURS_REPORTES dans registre/ouvreurs.ts.
//
// CHARGÉ À LA DEMANDE par app/poseur/page.tsx (`import('@/lib/openers-salarie')`, après l'affichage). Comme openers-bureau.ts : un ouvreur POSE des états, jamais d'écriture.
import { registerOpeners, type ImplOuvreur } from '@/lib/openers';
import { OUVREURS_LEGER_SALARIE } from '@/supabase/functions/_shared/registre/ouvreurs-leger-salarie';

export interface PoigneesSalarie {
  role: string;
  /** Les formations existent pour cette personne (le menu les propose). */
  formations: boolean;
  /** Une fenêtre ou une couche à saisie est ouverte (une couche de la journée, la demande de congé) ? */
  occupe: () => boolean;
  /** Ferme les petites fenêtres sans saisie (menu du compte, « Informations », scanner). */
  fermer: () => void;
  jour: (iso: string) => void;
  voirFormations: () => void;
}

export function registerSalarie(ref: { current: PoigneesSalarie | null }): () => void {
  const H = () => ref.current as PoigneesSalarie;
  return registerOpeners('salarie', {
    'jour.date': (p) => { if (!p.date) return 'indisponible'; H().fermer(); H().jour(p.date); },
    'formations.ouvrir': () => { H().fermer(); H().voirFormations(); },
  } as Record<string, ImplOuvreur>, {
    table: OUVREURS_LEGER_SALARIE,
    role: ref.current ? ref.current.role : 'worker',
    dispo: (d) => (d === 'formations' ? H().formations : true),
    occupe: () => H().occupe(),
  });
}
