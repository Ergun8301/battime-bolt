'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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

  if (!user || user.role !== 'worker' || archived) {
    return null;
  }

  return <>{children}</>;
}
