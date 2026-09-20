'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // Un compte archivé n'a plus accès : on le déconnecte.
  const archived = !!user && user.is_active === false;

  useEffect(() => {
    if (loading) return;
    if (archived) {
      toast.error('Ce compte a été archivé.');
      signOut();
      return;
    }
    if (!user || user.role !== 'admin') {
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

  if (!user || user.role !== 'admin' || archived) {
    return null;
  }

  return <>{children}</>;
}
