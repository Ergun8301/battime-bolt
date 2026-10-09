'use client';

// « Mot de passe oublié » : même habillage que « Réinitialiser le mot de passe »
// (carte blanche, logo BEMEXO, bouton jaune). L'ancienne page était restée sur
// le premier design (icône horloge, textes sans accents).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AUTH_CSS_HTML } from '../connexion/_auth-style';

/** Même clé que l'écran de connexion (« Oublié ? »). */
const RESET_EMAIL_KEY = 'bx-reset-email';

/** Les refus de Supabase arrivent en anglais : on les dit en français. */
function frenchResetError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('for security purposes') || m.includes('only request this after')) {
    return 'Un lien vient déjà d’être envoyé. Patientez une minute avant de recommencer.';
  }
  if (m.includes('rate limit')) {
    return 'Trop de demandes pour le moment. Réessayez dans une heure.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'Adresse e-mail invalide.';
  }
  return 'Impossible d’envoyer le lien pour le moment. Réessayez dans un instant.';
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // L'e-mail déjà tapé sur l'écran de connexion (« Oublié ? ») est repris, puis
  // effacé du stockage de session (il ne sert qu'une fois).
  useEffect(() => {
    try {
      const fromLogin = sessionStorage.getItem(RESET_EMAIL_KEY);
      if (fromLogin) setEmail(fromLogin);
      sessionStorage.removeItem(RESET_EMAIL_KEY);
    } catch { /* navigation privée : champ vide */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const address = email.trim();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/connexion`,
    });

    setLoading(false);
    if (resetError) {
      setError(frenchResetError(resetError.message));
      return;
    }
    setSentTo(address);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={AUTH_CSS_HTML} />
      <div className="bt-auth">
        <div className="bt-center">
          <div className="bt-card">
            <div className="bt-logo">
              <Link href="/landing" className="bt-logo-badge" aria-label="BEMEXO — accueil">
                <img src="/bemexo-wordmark-light.svg" alt="BEMEXO" className="bt-logo-badge-img" />
              </Link>
            </div>
            <h1 className="bt-h1">Mot de passe oublié</h1>

            {sentTo ? (
              <>
                <div className="bt-ok" role="status" data-testid="reset-sent">
                  E-mail envoyé ✅
                  <span style={{ display: 'block', fontWeight: 500, marginTop: '6px', color: '#3a8a62' }}>
                    Si un compte existe avec {sentTo}, vous allez recevoir un lien pour choisir un nouveau mot de passe.
                    Il est valable 24&nbsp;h. Pensez à regarder dans les spams.
                  </span>
                </div>
                <Link href="/connexion" className="bt-ybtn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  Retour à la connexion
                </Link>
              </>
            ) : (
              <>
                <p className="bt-sub">Entrez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
                <form onSubmit={handleSubmit}>
                  <label className="bt-label" htmlFor="reset-email">E-mail</label>
                  <input
                    id="reset-email"
                    className="bt-field"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    disabled={loading}
                    placeholder="prenom@entreprise.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ marginBottom: '18px' }}
                  />
                  {error && <div className="bt-err">{error}</div>}
                  <button className="bt-ybtn" type="submit" disabled={loading}>
                    {loading ? 'Envoi…' : 'Envoyer le lien'}
                  </button>
                </form>
                <p className="bt-foot">
                  <Link href="/connexion">← Retour à la connexion</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
