'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { SAL_ILLUS, ENT_ILLUS } from './_illustrations';

// Design "noir + jaune chantier" (maquette Claude Design v2). Habillage uniquement :
// toute la logique d'authentification (signInWithPassword, lecture du role +
// redirection, gestion du lien invitation/recuperation, updateUser) est conservee
// a l'identique. Les onglets Salarie/Entreprise sont purement visuels : meme
// connexion pour tous, c'est le role qui pilote la redirection.
// Les illustrations des panneaux noirs (vrais ecrans Ma journee / Planning) sont
// du HTML statique decoratif injecte tel quel (_illustrations.ts).
const AUTH_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-auth{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;min-height:100vh;min-height:100svh}
.bt-auth *{box-sizing:border-box}
.bt-auth .mono{font-family:'JetBrains Mono',monospace}
.bt-mono{font-family:'JetBrains Mono',monospace}
.bt-split{display:grid;grid-template-columns:1fr 1fr;min-height:100vh;min-height:100svh;position:relative}
.bt-leftcol{display:flex;flex-direction:column;justify-content:center;padding:32px 7vw;min-width:0}
.bt-wrap{width:100%;max-width:480px;margin:0 auto}
.bt-logo{display:flex;align-items:center;justify-content:center;gap:11px;text-decoration:none;margin-bottom:28px;color:inherit}
.bt-logo-img{height:auto;width:100%;max-width:383px;display:block}
.bt-x-sig{position:absolute;bottom:30px;right:30px;width:52px;height:52px;opacity:.9;pointer-events:none;z-index:2}
.bt-h1{font-size:25px;line-height:1.15;font-weight:900;letter-spacing:-.02em;margin:0 0 10px;text-align:center}
.bt-h1-accent{color:#9a7c14}
.bt-sub{font-size:15px;color:#6E6A63;font-weight:500;margin:0 0 20px}
.bt-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#E4DCCE;border-radius:12px;padding:5px;margin-bottom:20px}
.bt-tab{cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:9px;font-weight:800;font-size:15px;color:#6E6A63;border:none;background:transparent;font-family:'Archivo',sans-serif}
.bt-tab.is-active{background:#15120F;color:#FFC21A}
.bt-label{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:6px}
.bt-field{width:100%;font-family:'Archivo',sans-serif;font-size:16px;font-weight:500;padding:13px 16px;border:1.5px solid rgba(21,18,15,.18);border-radius:11px;background:#FBF8F2;outline:none;color:#15120F}
.bt-field::placeholder{color:#a39d92}
.bt-field:focus{border-color:#15120F;background:#fff}
.bt-forgot{font-size:12.5px;font-weight:700;color:#9a7c14;text-decoration:none}
.bt-ybtn{width:100%;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:'Archivo',sans-serif;font-weight:900;font-size:17px;padding:16px;border-radius:12px;box-shadow:0 4px 0 #C99300;transition:transform .12s ease, box-shadow .12s ease}
.bt-ybtn:hover{transform:translateY(-2px);box-shadow:0 6px 0 #C99300}
.bt-ybtn:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
.bt-ybtn:disabled{opacity:.65;cursor:default;transform:none;box-shadow:0 4px 0 #C99300}
.bt-foot{text-align:center;font-size:14.5px;color:#6E6A63;font-weight:500;margin:18px 0 0}
.bt-foot a{font-weight:800;color:#15120F;text-decoration:none;border-bottom:2px solid #FFC21A}
.bt-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin-bottom:16px}
.bt-visual{position:relative;background:#15120F;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:40px;min-width:0}
.bt-ruban-center{position:absolute;top:0;left:calc(50% - 6px);width:12px;height:100%;background:repeating-linear-gradient(45deg,#15120F 0 9px,#FFC21A 9px 18px);z-index:5;pointer-events:none}
.bt-vis-inner{display:flex;flex-direction:column;align-items:center}
.bt-vis-tagline{display:none;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#FFC21A;text-align:center;font-weight:700}
.bt-card{width:100%;max-width:420px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:18px;padding:34px 30px;box-shadow:0 24px 50px -24px rgba(21,18,15,.4)}
.bt-center{min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px}
.bt-spin{width:34px;height:34px;border:3px solid rgba(21,18,15,.18);border-top-color:#15120F;border-radius:50%;animation:btspin .8s linear infinite;margin:0 auto}
@keyframes btspin{to{transform:rotate(360deg)}}
@media(min-width:881px){
  .bt-split{height:100vh;height:100svh;min-height:0}
  .bt-leftcol{overflow-y:auto}
}
@media(max-width:880px){
  .bt-split{grid-template-columns:1fr}
  .bt-leftcol{order:2;padding:40px 28px}
  .bt-visual{order:1;min-height:0;padding:24px}
  .bt-vis-inner{display:none}
  .bt-x-sig{display:none}
  .bt-vis-tagline{display:block}
  .bt-ruban-center{display:none}
  .bt-h1{font-size:23px}
}
`;

function LoginView() {
  const [tab, setTab] = useState<'sal' | 'ent'>('sal');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null); // email en attente de confirmation
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const router = useRouter();

  // ── Logique d'authentification : INCHANGEE ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsConfirm(null);
    setResendMsg(null);

    try {
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const m = authError.message.toLowerCase();
        if (m.includes('not confirmed')) {
          setNeedsConfirm(email);
          setError("Votre email n'est pas encore confirmé. Vérifiez votre boîte mail (et les spams).");
        } else if (authError.message === 'Invalid login credentials') {
          setError('Email ou mot de passe incorrect');
        } else {
          setError(authError.message);
        }
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

  const handleResend = async () => {
    if (!needsConfirm) return;
    setResending(true);
    setResendMsg(null);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: needsConfirm,
      options: { emailRedirectTo: `${window.location.origin}/connexion` },
    });
    setResending(false);
    setResendMsg(resendError
      ? "Impossible de renvoyer l'email pour le moment. Réessayez dans un instant."
      : 'Email de confirmation renvoyé ✓ Vérifiez votre boîte mail.');
  };

  const isEnt = tab === 'ent';

  return (
    <div className="bt-split">
      <div className="bt-ruban-center" />
      {/* ============ COLONNE FORMULAIRE ============ */}
      <div className="bt-leftcol">
        <div className="bt-wrap">
          <Link href="/landing" className="bt-logo">
            <img src="/bemexo-wordmark-dark.svg" alt="BEMEXO" className="bt-logo-img" />
          </Link>

          <h1 className="bt-h1" style={{ marginBottom: '28px' }}>
            Bon retour sur le <span className="bt-h1-accent">chantier</span>.
          </h1>

          <div className="bt-tabs">
            <button type="button" className={`bt-tab${!isEnt ? ' is-active' : ''}`} onClick={() => setTab('sal')}>
              <span style={{ fontSize: '16px' }}>👷</span> Salarié
            </button>
            <button type="button" className={`bt-tab${isEnt ? ' is-active' : ''}`} onClick={() => setTab('ent')}>
              <span style={{ fontSize: '16px' }}>🏢</span> Entreprise
            </button>
          </div>

          <form onSubmit={handleLogin}>
            <label className="bt-label" htmlFor="login-email">{isEnt ? 'Email professionnel' : 'Email'}</label>
            <input
              id="login-email"
              className="bt-field"
              type="email"
              name="email"
              required
              disabled={loading}
              placeholder={isEnt ? 'bureau@entreprise.fr' : 'prenom@entreprise.fr'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: '14px' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="bt-label" htmlFor="login-password" style={{ marginBottom: 0 }}>Mot de passe</label>
              <Link href="/mot-de-passe-oublie" className="bt-forgot">Oublié&nbsp;?</Link>
            </div>
            <input
              id="login-password"
              className="bt-field"
              type="password"
              name="password"
              required
              disabled={loading}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: '18px' }}
            />

            {error && <div className="bt-err">{error}</div>}
            {needsConfirm && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="bt-forgot"
                style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '14px' }}
              >
                {resending ? 'Envoi…' : "Renvoyer l'email de confirmation"}
              </button>
            )}
            {resendMsg && (
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f7a4d', marginBottom: '14px' }}>{resendMsg}</div>
            )}

            <button className="bt-ybtn" type="submit" disabled={loading}>
              {loading ? 'Connexion…' : isEnt ? 'Accéder au tableau de bord →' : 'Pointer mes heures →'}
            </button>
          </form>

          <p className="bt-foot">
            Pas encore de compte&nbsp;? <Link href="/inscription">Démarrer l&apos;essai gratuit</Link>
          </p>
        </div>
      </div>

      {/* ============ COLONNE VISUELLE (vrais écrans de l'app) ============ */}
      <div className="bt-visual">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <div className="bt-vis-inner" dangerouslySetInnerHTML={{ __html: isEnt ? ENT_ILLUS : SAL_ILLUS }} />
          <div className="bt-vis-tagline">{isEnt ? '🏢 Espace entreprise · le planning' : '👷 Espace salarié · vos heures'}</div>
        </div>
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-x-sig" />
      </div>
    </div>
  );
}

// ── Ecran "definir / reinitialiser le mot de passe" (lien invitation / recuperation).
//    Logique INCHANGEE — seul l'habillage change. useSearchParams => Suspense.
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

    setTimeout(() => {
      window.location.href = '/connexion';
    }, 2000);
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ background: '#e7f6ed', border: '1px solid #a8dcc0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ color: '#1f7a4d', fontWeight: 700 }}>
            {isRecovery ? 'Mot de passe réinitialisé !' : 'Mot de passe défini !'}
          </p>
          <p style={{ fontSize: '13.5px', color: '#3a8a62', marginTop: '6px' }}>Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="bt-label" htmlFor="new-password">
        {isRecovery ? 'Nouveau mot de passe' : 'Créer un mot de passe'}
      </label>
      <input
        id="new-password"
        className="bt-field"
        type="password"
        required
        disabled={loading}
        placeholder="6 caractères minimum"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ marginBottom: '18px' }}
      />
      <label className="bt-label" htmlFor="confirm-new-password">Confirmer le mot de passe</label>
      <input
        id="confirm-new-password"
        className="bt-field"
        type="password"
        required
        disabled={loading}
        placeholder="••••••••"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={{ marginBottom: '22px' }}
      />
      {error && <div className="bt-err">{error}</div>}
      <button className="bt-ybtn" type="submit" disabled={loading}>
        {loading ? 'Patientez…' : isRecovery ? 'Réinitialiser' : 'Confirmer'}
      </button>
    </form>
  );
}

export default function ConnexionPage() {
  const [showPasswordSet, setShowPasswordSet] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [processingHash, setProcessingHash] = useState(false);
  const router = useRouter();

  // ── Gestion du lien invitation / recuperation : INCHANGEE ──
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || (!hash.includes('access_token') && !hash.includes('type='))) {
      return;
    }

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
            router.replace('/');
          }
        }
      } catch (err) {
        console.error('Auth hash handling failed:', err);
      } finally {
        window.history.replaceState(null, '', window.location.pathname);
        setProcessingHash(false);
      }
    };

    handleAuthHash();
  }, [router]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AUTH_CSS }} />
      <div className="bt-auth">
        {processingHash ? (
          <div className="bt-center">
            <div style={{ textAlign: 'center' }}>
              <div className="bt-spin" />
              <p style={{ color: '#6E6A63', fontWeight: 600, marginTop: '16px' }}>Validation du lien…</p>
            </div>
          </div>
        ) : showPasswordSet ? (
          <div className="bt-center">
            <div className="bt-card">
              <Link href="/landing" className="bt-logo">
                <img src="/bemexo-wordmark-dark.svg" alt="BEMEXO" className="bt-logo-img" />
              </Link>
              <h1 className="bt-h1">
                {isRecovery ? 'Réinitialiser le mot de passe' : 'Créer votre mot de passe'}
              </h1>
              <p className="bt-sub">
                {isRecovery ? 'Choisissez un nouveau mot de passe.' : 'Définissez votre mot de passe pour accéder à BEMEXO.'}
              </p>
              <Suspense>
                <SetPasswordForm />
              </Suspense>
            </div>
          </div>
        ) : (
          <LoginView />
        )}
      </div>
    </>
  );
}
