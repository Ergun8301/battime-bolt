'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // B2: if an invitation/recovery link lands on the root with its auth hash,
    // forward it (hash intact) to /connexion, which owns the hash handler.
    // A plain router.push would drop the hash and break the flow.
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && (hash.includes('access_token') || hash.includes('type='))) {
        window.location.replace(`/connexion${hash}`);
        return;
      }
    }

    if (!loading) {
      if (user) {
        if (user.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/poseur');
        }
      } else {
        router.push('/connexion');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );
}
