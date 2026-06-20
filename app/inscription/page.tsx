'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';

// Traduction des messages d'erreur Supabase les plus courants a l'inscription.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) {
    return 'Un compte existe deja avec cet email. Connectez-vous plutot.';
  }
  if (m.includes('password')) {
    return 'Mot de passe trop court (6 caracteres minimum).';
  }
  if (m.includes('valid email') || m.includes('invalid email') || m.includes('email address')) {
    return 'Adresse email invalide.';
  }
  return message;
}

export default function InscriptionPage() {
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // Le trigger SQL `handle_new_user` lit ces metadonnees : la presence de
      // `company_name` cree l'entreprise et rattache ce compte en role admin.
      // L'essai 30 jours est pose par defaut sur la nouvelle entreprise
      // (colonne companies.trial_ends_at). `employee_count` reste pour l'instant
      // dans les metadonnees du compte (non persiste en base).
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            company_name: companyName.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            employee_count: employeeCount.trim() || null,
          },
        },
      });

      if (authError) {
        setError(translateAuthError(authError.message));
        return;
      }

      if (data.session) {
        // Confirmation d'email desactivee => session immediate => tableau de bord.
        router.push('/admin');
        return;
      }

      // Filet de securite si la confirmation d'email etait reactivee un jour.
      setInfo('Compte cree. Verifiez votre email pour activer votre acces, puis connectez-vous.');
    } catch (err) {
      console.error('Signup error:', err);
      setError('Une erreur est survenue lors de la creation du compte. Veuillez reessayer.');
    } finally {
      setLoading(false);
    }
  };

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
          <CardTitle className="text-2xl">Creer votre compte entreprise</CardTitle>
          <CardDescription>30 jours d&apos;essai gratuits, sans carte bancaire</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nom de l&apos;entreprise *</Label>
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
                <Label htmlFor="firstname">Prenom *</Label>
                <Input
                  id="firstname"
                  type="text"
                  placeholder="Prenom"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Nom *</Label>
                <Input
                  id="lastname"
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
              <Label htmlFor="signup-email">Email *</Label>
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
              <Label htmlFor="signup-password">Mot de passe *</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telephone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Facultatif"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-count">Nb de salaries</Label>
                <Input
                  id="employee-count"
                  type="number"
                  min="0"
                  placeholder="Facultatif"
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Creer mon compte
            </Button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <p className="text-muted-foreground">
              Deja un compte ?{' '}
              <Link href="/connexion" className="text-primary hover:underline">
                Se connecter
              </Link>
            </p>
            <Link
              href="/landing"
              className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
