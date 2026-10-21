'use client';

// Appli salarié › « Mon compte » › « Mes documents » : ses bulletins, son contrat, et ce qu'il envoie au bureau (photo d'un arrêt, justificatif…).
// Une fenêtre plein écran au téléphone ; le contenu est components/documents-salarie.tsx en mode « salarie ».
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import DocumentsSalarie from '@/components/documents-salarie';
import { useAuth } from '@/components/auth-provider';

export default function MesDocuments({ companyId, userId, prenom, onClose }: { companyId: string; userId: string; prenom: string; onClose: () => void }) {
  const { user } = useAuth();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="mes-docs max-w-lg max-h-[92vh] overflow-y-auto" data-testid="mes-documents">
        <DialogTitle className="text-2xl font-black tracking-tight">Mes documents</DialogTitle>
        <DialogDescription>Vos bulletins, votre contrat, et ce que vous envoyez au bureau.</DialogDescription>
        <DocumentsSalarie mode="salarie" companyId={companyId} userId={userId} prenom={prenom} meId={user?.id || userId} />
      </DialogContent>
    </Dialog>
  );
}
