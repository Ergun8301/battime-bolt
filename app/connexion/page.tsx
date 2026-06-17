'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect'
          : authError.message);
        return;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        setError('Connexion impossible. Veuillez reessayer.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        setError('Impossible de recuperer votre profil. Veuillez reessayer.');
        return;
      }

      if (!profile) {
        setError('Aucun profil associe a ce compte. Contactez votre administrateur.');
        return;
      }

      router.push(profile.role === 'admin' ? '/admin' : '/poseur');
    } catch (err) {
      console.error('Login error:', err);
      setError('Une erreur est survenue lors de la connexion. Veuillez reessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Mot de passe</Label>
        <Input
          id="login-password"
          type="password"
          placeholder="Votre mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Se connecter
      </Button>
      <div className="text-center">
        <Link href="/mot-de-passe-oublie" className="text-sm text-primary hover:underline">
          Mot de passe oublie ?
        </Link>
      </div>
    </form>
  );
}

function SignupForm() {
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres');
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName,
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-green-800">Compte cree avec succes !</p>
          <p className="text-sm text-green-600 mt-2">
            Vous pouvez maintenant vous connecter.
          </p>
        </div>
        <Button onClick={() => router.push('/connexion')} variant="outline" className="w-full">
          Retour a la connexion
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company-name">Nom de l'entreprise</Label>
        <Input
          id="company-name"
          type="text"
          placeholder="Votre entreprise"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="signup-firstname">Prenom</Label>
          <Input
            id="signup-firstname"
            type="text"
            placeholder="Prenom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-lastname">Nom</Label>
          <Input
            id="signup-lastname"
            type="text"
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Mot de passe</Label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Minimum 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirmer le mot de passe</Label>
        <Input
          id="signup-confirm"
          type="password"
          placeholder="Confirmez le mot de passe"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Creer mon compte
      </Button>
    </form>
  );
}

function SetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();
  const type = searchParams.get('type');
  const isRecovery = type === 'recovery';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // We are already on /connexion (showing the set-password screen), so a
    // router.push('/connexion') is a no-op and would leave the user stuck on
    // the success message. A hard redirect re-mounts the page and shows the
    // login form again.
    setTimeout(() => {
      window.location.href = '/connexion';
    }, 2000);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-green-800">
            {isRecovery ? 'Mot de passe reinitialise !' : 'Mot de passe defini !'}
          </p>
          <p className="text-sm text-green-600 mt-2">
            Redirection vers la connexion...
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">
          {isRecovery ? 'Nouveau mot de passe' : 'Creer un mot de passe'}
        </Label>
        <Input
          id="new-password"
          type="password"
          placeholder="Minimum 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirmer le mot de passe</Label>
        <Input
          id="confirm-new-password"
          type="password"
          placeholder="Confirmez"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isRecovery ? 'Reinitialiser' : 'Confirmer'}
      </Button>
    </form>
  );
}

export default function ConnexionPage() {
  const [showPasswordSet, setShowPasswordSet] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [processingHash, setProcessingHash] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || (!hash.includes('access_token') && !hash.includes('type='))) {
      return;
    }

    // Show a loading screen immediately so the login form never flashes while
    // we establish the invitation/recovery session.
    setProcessingHash(true);

    const handleAuthHash = async () => {
      try {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        const errorDescription = params.get('error_description');

        if (errorDescription) {
          console.error('Auth link error:', errorDescription);
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('setSession failed:', error);
            return;
          }

          if (type === 'recovery' || type === 'invite') {
            setIsRecovery(type === 'recovery');
            setShowPasswordSet(true);
          } else {
            // A valid session was established via another link type
            // (magic link, signup confirmation). Let the app route normally.
            router.replace('/');
          }
        }
      } catch (err) {
        console.error('Auth hash handling failed:', err);
      } finally {
        // Strip the hash so tokens never linger in the URL / history.
        window.history.replaceState(null, '', window.location.pathname);
        setProcessingHash(false);
      }
    };

    handleAuthHash();
  }, [router]);

  if (processingHash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validation du lien...</p>
        </div>
      </div>
    );
  }

  if (showPasswordSet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-primary text-primary-foreground rounded-lg p-3">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-2xl">
              {isRecovery ? 'Reinitialiser le mot de passe' : 'Creer votre mot de passe'}
            </CardTitle>
            <CardDescription>
              {isRecovery
                ? 'Choisissez un nouveau mot de passe'
                : 'Definissez votre mot de passe pour acceder a Battime'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense>
              <SetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary text-primary-foreground rounded-lg p-3">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
          </div>
          <CardTitle className="text-2xl">Battime</CardTitle>
          <CardDescription>Feuilles d'heures BTP simplifiees</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-center">
        <a href="/mentions-legales" className="hover:underline">Mentions légales</a>
        {' · '}
        <a href="/confidentialite" className="hover:underline">Confidentialité</a>
        {' · '}
        <a href="/cgu" className="hover:underline">CGU</a>
      </p>
    </div>
  );
}
