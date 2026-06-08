'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Garde-fou : une lecture de profil ne doit jamais rester bloquee indefiniment.
const PROFILE_FETCH_TIMEOUT = 8000;
// Garde-fou global : on ne reste jamais coince sur l'ecran de chargement.
const AUTH_INIT_TIMEOUT = 10000;

async function fetchUserProfile(userId: string): Promise<User | null> {
  try {
    const response: any = await Promise.race([
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timed out')), PROFILE_FETCH_TIMEOUT)
      ),
    ]);

    if (response?.error) {
      console.error('Error fetching user profile:', response.error);
      return null;
    }
    return (response?.data as User) ?? null;
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user) {
        const profile = await fetchUserProfile(currentSession.user.id);
        setUser(profile);
        setSupabaseUser(currentSession.user);
        setSession(currentSession);
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Garde-fou : si getSession() ne repond jamais, on debloque l'UI quand meme.
    const safetyTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, AUTH_INIT_TIMEOUT);

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setSupabaseUser(initialSession.user);
          const profile = await fetchUserProfile(initialSession.user.id);
          if (!isMounted) return;
          setUser(profile);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimeout);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;

      // La session initiale est deja prise en charge par initializeAuth().
      if (event === 'INITIAL_SESSION') return;

      // IMPORTANT : ne JAMAIS await un appel Supabase dans ce callback.
      // GoTrue tient un verrou pendant l'emission de l'evenement ; tout appel
      // Supabase attendu ici peut provoquer un deadlock (spinner infini).
      // On met a jour la session de maniere synchrone et on diffère la lecture
      // du profil hors du callback (setTimeout).
      setSession(newSession);
      setSupabaseUser(newSession?.user ?? null);

      if (event === 'SIGNED_OUT' || !newSession?.user) {
        setUser(null);
        setLoading(false);
        if (event === 'SIGNED_OUT') {
          router.push('/');
        }
        return;
      }

      // Nouvelle connexion : on remet l'ecran de chargement le temps de
      // recuperer le profil, pour eviter une redirection prematuree des layouts.
      if (event === 'SIGNED_IN') {
        setLoading(true);
      }

      const signedInUser = newSession.user;
      setTimeout(() => {
        if (!isMounted) return;
        fetchUserProfile(signedInUser.id)
          .then((profile) => {
            if (isMounted) setUser(profile);
          })
          .finally(() => {
            if (isMounted) setLoading(false);
          });
      }, 0);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [router]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setUser(null);
      setSupabaseUser(null);
      setSession(null);
      router.push('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, supabaseUser, session, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
