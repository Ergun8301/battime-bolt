'use client';

// Design bureau · fiche salarié › « Documents » : le 3ᵉ onglet (Gérer | Feuille d'heures | Documents), même panneau de 760 px que « Gérer ».
// Le contenu est components/documents-salarie.tsx en mode « bureau » (déposer, filtrer, ouvrir, retirer ; le salarié est prévenu).
import type { User } from '@/lib/types';
import DocumentsSalarie from '@/components/documents-salarie';
import { Coque, Onglets } from './lot3a-ui';

export default function DocumentsSalarieV2({ worker, meId, onOpenChange, allerGerer, allerHeures }: {
  worker: User; meId: string; onOpenChange: (o: boolean) => void; allerGerer: () => void; allerHeures: () => void;
}) {
  const nom = `${worker.first_name} ${worker.last_name}`.trim();
  return (
    <Coque open onOpenChange={onOpenChange} forme="panneau" largeur={760} kicker="Fiche salarié" titre={nom || 'Salarié'} sous="Bulletins, contrat et autres documents" testId="fiche-docs-v2"
      onglets={<Onglets nom="Fiche salarié" valeur="docs" onChange={(v) => { if (v === 'gerer') allerGerer(); if (v === 'heures') allerHeures(); }}
        options={[{ v: 'gerer', l: 'Gérer' }, { v: 'heures', l: 'Feuille d’heures', testId: 'onglet-heures' }, { v: 'docs', l: 'Documents', testId: 'onglet-docs' }]} />}>
      <DocumentsSalarie mode="bureau" companyId={worker.company_id} userId={worker.id} prenom={worker.first_name} meId={meId} />
    </Coque>
  );
}
