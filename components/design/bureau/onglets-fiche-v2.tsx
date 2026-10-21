'use client';

// Design bureau · lot 2 : les deux onglets de la fiche salarié (HP01 : « Gérer » | « Feuille d'heures »). Même composant dans la feuille d'heures v2 et, en attendant le
// lot 3 (la fiche « Gérer » habillée, EQ09), au-dessus de l'ancienne fiche « Gérer », pour qu'on puisse aller de l'une à l'autre dans les deux sens.
// Aucune logique : deux boutons qui changent l'onglet affiché par components/worker-detail.tsx.
import './bureau-jetons.css';
import './heures-v2.css';

export default function OngletsFicheV2({ mode, onGerer, onHeures, onDocs }: { mode: 'hours' | 'manage' | 'docs'; onGerer: () => void; onHeures: () => void; onDocs?: () => void }) {
  return (
    <div className="bt-skin dz-hb-onglets dz-hb-onglets--fiche" role="tablist" aria-label="Fiche salarié">
      <button type="button" role="tab" aria-selected={mode === 'manage'} data-testid="fiche-onglet-gerer" data-guide="bureau-fiche.gerer" onClick={onGerer}>Gérer</button>
      <button type="button" role="tab" aria-selected={mode === 'hours'} data-testid="fiche-onglet-heures" onClick={onHeures}>Feuille d’heures</button>
      {onDocs ? <button type="button" role="tab" aria-selected={mode === 'docs'} data-testid="fiche-onglet-docs" onClick={onDocs}>Documents</button> : null}
    </div>
  );
}
