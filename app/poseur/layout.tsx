'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Le CSS de l'écran salarié (/poseur) : des fichiers .css, plus des constantes écrites dans le TSX
// (étape 1 du plan d'intégration du design salarié ; plan : docs/design-brief/audit-salarie/03-plan-integration.md §5).
// ORDRE = celui d'avant : la feuille de la page, puis celle de « Ma journée », du chrono, des réunions
// et tâches, des réserves, de la pause, de « Mon équipe », des formations, du formulaire de réserve, des
// documents du chantier, de l'information d'endroit. Les noms de classes ne se recouvrent pas (aucun
// sélecteur n'est écrit dans deux fichiers) : l'ordre ne change aucune règle, il garde la cascade d'hier.
// Les quatre derniers servent aussi hors de /poseur : app/admin/layout.tsx (pause, réserve, documents) et
// app/apercu/assistant-salarie/layout.tsx (information d'endroit) les importent à leur tour. Jamais dans le composant :
// une feuille importée par un morceau différé en ferait une feuille chargée à part et alourdirait le chargeur de toutes les pages.
import './poseur.css';
import '@/components/poseur-day.css';
import '@/components/live-timer.css';
import '@/components/missions-worker.css';
import '@/components/worker-reserves.css';
import '@/components/pause-picker.css';
import '@/components/team-day.css';
import '@/components/poseur-trainings.css';
import '@/components/reserve-lift-form.css';
import '@/components/chantier-documents.css';
import '@/components/geo-info-dialog.css';

export default function PoseurLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // Un compte archivé par l'entreprise n'a plus accès : on le déconnecte.
  // (La base refuse déjà toute lecture/écriture ; ici on l'explique.)
  const archived = !!user && user.is_active === false;

  useEffect(() => {
    if (loading) return;
    if (archived) {
      toast.error('Ce compte a été archivé par votre entreprise.');
      signOut();
      return;
    }
    // Le chef d'équipe travaille sur le chantier comme les autres : c'est son
    // écran aussi. Ne laisser passer que `worker` l'aurait éjecté vers la page
    // de connexion dès sa nomination — sans accès même à ses propres heures.
    if (!user || (user.role !== 'worker' && user.role !== 'lead')) {
      router.push('/connexion');
    }
  }, [user, loading, archived, router, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  // Le même test qu'au-dessus, et il DOIT rester le même. Ne corriger que la
  // redirection laissait le chef d'équipe sur une page entièrement blanche :
  // pas de redirection (le test du dessus le laisse passer), pas de contenu
  // (celui-ci le refusait). Aucune erreur, aucun message — le pire des états.
  if (!user || (user.role !== 'worker' && user.role !== 'lead') || archived) {
    return null;
  }

  return <>{children}</>;
}
