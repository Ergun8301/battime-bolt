'use client';

// Console du SUPPORT BEMEXO (lot 5).
//
// ORDRE DES MARCHES, chacune revérifiée par la base :
//   1. connecté (compte support d'Ergun, via /connexion) ;
//   2. inscrit dans `support_staff` (sinon : « pas un compte support ») ;
//   3. double vérification : code à 6 chiffres d'une application
//      d'authentification (première fois : QR code à scanner) → jeton aal2 ;
//   4. liste des entreprises qui l'ont autorisé → « Entrer ».
// « Entrer » est noté dans le journal du client, puis on ouvre l'espace du
// patron, en lecture seule, avec le bandeau « Mode support ».
//
// Une fois les marches 2 et 3 franchies (donc jamais pour un patron ni un
// salarié), la console montre aussi la formule IA active (« essai » ou
// « payant »), lue par la requête de statut des fonctions : ni quota ni appel au
// modèle, et surtout aucun chiffre du compteur (réservé au service).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import SupportConsoleView, { type ConsoleStep } from '@/components/support-console';
import { iaFormule } from '@/lib/ia-formule';
import {
  readSupportSession, supportEnter, supportExit, supportIsStaff, supportMyCompanies, type SupportCompany,
} from '@/lib/support';

export default function SupportPage() {
  const { supabaseUser, loading } = useAuth();
  const [step, setStep] = useState<ConsoleStep>({ kind: 'loading' });
  const [companies, setCompanies] = useState<SupportCompany[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // undefined = pas demandée (compte non vérifié) ; null = formule inconnue.
  const [ia, setIa] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setErr(null); setIa(undefined);
    if (!supabaseUser) { setStep({ kind: 'signed-out' }); return; }
    if (!(await supportIsStaff())) { setStep({ kind: 'not-staff' }); return; }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const verified = (f?.totp || []).find((x) => x.status === 'verified');
      if (verified) { setStep({ kind: 'challenge', factorId: verified.id }); return; }
      // Première fois : on nettoie un enrôlement abandonné, puis QR code.
      for (const x of f?.all || []) if (x.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: x.id });
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BEMEXO support' });
      if (error || !e) { setErr(error?.message || 'Double vérification indisponible.'); setStep({ kind: 'not-staff' }); return; }
      setStep({ kind: 'enroll', factorId: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
      return;
    }
    // Compte support confirmé, double vérification passée : on peut demander la formule IA.
    iaFormule('assistant').then(setIa);
    const cur = readSupportSession();
    if (cur) { setStep({ kind: 'inside', name: cur.name, companyId: cur.companyId }); return; }
    try { setCompanies(await supportMyCompanies()); } catch (x) { setErr((x as Error).message); }
    setStep({ kind: 'ready' });
  }, [supabaseUser]);

  useEffect(() => { if (!loading) refresh(); }, [loading, refresh]);

  const verify = async (factorId: string, code: string) => {
    setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) { setErr('Code incorrect. Réessayez avec le code affiché maintenant.'); return; }
    await refresh();
  };

  const enter = async (companyId: string) => {
    if (!supabaseUser) return;
    setErr(null);
    try {
      await supportEnter(supabaseUser.id, companyId);
      window.location.assign('/admin');
    } catch (x) { setErr((x as Error).message); }
  };

  return (
    <SupportConsoleView
      step={step} companies={companies} error={err} ia={ia}
      onLogin={() => window.location.assign('/connexion')}
      onVerify={verify}
      onEnter={enter}
      onBack={() => window.location.assign('/admin')}
      onExit={async (companyId) => { await supportExit(companyId); await refresh(); }}
    />
  );
}
