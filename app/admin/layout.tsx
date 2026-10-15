'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SupportBanner from '@/components/support-banner';
import { peekPairRequest, stashPairRequestFromHash } from '@/lib/kiosk-pair-stash';
// Feuilles de style de composants que le bureau charge à l'ouverture (fiche salarié, réserves, documents du chantier) : elles
// étaient des <style> écrits dans leur TSX (plan d'intégration du design salarié, étape 1) ; au niveau de la route, pas du morceau différé.
import '@/components/pause-picker.css';
import '@/components/reserve-lift-form.css';
import '@/components/chantier-documents.css';

// Lot 11 (IA) : « Associer cette tablette ? », chargée seulement quand un QR de
// tablette attend (le poids du site ne bouge pas pour les autres visites).
const KioskPairConfirm = dynamic(() => import('@/components/kiosk-pair-confirm'), { ssr: false });

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [pairPending, setPairPending] = useState(false);
  // Change à chaque nouveau QR scanné dans ce document : la fenêtre repart sur le dernier.
  const [pairKey, setPairKey] = useState(0);
  const adminRef = useRef(false);

  // Le patron qui scanne le QR d'une tablette arrive sur /admin#borne=… souvent
  // DÉCONNECTÉ : le fragment est gardé (et retiré de l'adresse) AVANT la
  // redirection vers /connexion, et repris une fois connecté. Un lien ouvert dans
  // un /admin déjà chargé (appli installée, adresse collée) ne recharge rien :
  // c'est `hashchange` qui le rattrape.
  useEffect(() => {
    stashPairRequestFromHash();
    const onHash = () => {
      stashPairRequestFromHash();
      if (adminRef.current && peekPairRequest()) { setPairKey((k) => k + 1); setPairPending(true); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  // Connecté en administrateur actif et un QR de tablette attend : la fenêtre s'ouvre.
  const admin = !loading && user?.role === 'admin' && !archived;
  adminRef.current = admin;
  useEffect(() => { if (admin && peekPairRequest()) setPairPending(true); }, [admin]);

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

  return <><SupportBanner />{children}{pairPending && <KioskPairConfirm key={pairKey} onClose={() => setPairPending(false)} />}</>;
}
