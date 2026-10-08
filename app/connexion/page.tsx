'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { passwordProblem, PASSWORD_PLACEHOLDER, PASSWORD_RULE } from '@/lib/password';
import { PasswordInput } from '@/components/password-input';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';
import { SAL_ILLUS, ENT_ILLUS } from './_illustrations';
import { AUTH_CSS_HTML } from './_auth-style';

// Design "noir + jaune chantier" (maquette Claude Design v2). Habillage uniquement :
// toute la logique d'authentification (signInWithPassword, lecture du role +
// redirection, gestion du lien invitation/recuperation, updateUser) est conservee
// a l'identique. Les onglets Salarie/Entreprise sont purement visuels : meme
// connexion pour tous, c'est le role qui pilote la redirection.
// Les illustrations des panneaux noirs (vrais ecrans Ma journee / Planning) sont
// du HTML statique decoratif injecte tel quel (_illustrations.ts).

/** L'écran d'arrivée selon le rôle (même règle qu'à la connexion). */
const homeForRole = (role: string) => (role === 'admin' ? '/admin' : '/poseur');

/**
 * L'e-mail déjà tapé passe à « Mot de passe oublié » par le stockage de session,
 * PAS par l'adresse de la page : une adresse e-mail dans l'URL finirait dans
 * l'historique et dans les statistiques de visite.
 */
const RESET_EMAIL_KEY = 'bx-reset-email'; // même clé dans app/mot-de-passe-oublie/page.tsx

/**
 * Après « Créer mon mot de passe » ou « Réinitialiser », quand la connexion
 * directe n'a pas pu se faire : on revient ici avec un message et l'e-mail
 * déjà rempli, au lieu d'un écran de connexion muet.
 */
interface LoginNotice { text: string; email: string }

function LoginView({ notice }: { notice?: LoginNotice | null }) {
  const [tab, setTab] = useState<'sal' | 'ent'>('sal');
  const [email, setEmail] = useState(notice?.email ?? '');
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

      router.push(homeForRole(profile.role));
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
          <div className="bt-logo">
            <Link href="/landing" className="bt-logo-badge" aria-label="BEMEXO — accueil">
              <img src="/bemexo-wordmark-light.svg" alt="BEMEXO" className="bt-logo-badge-img" />
            </Link>
          </div>

          <h1 className="bt-h1" style={{ marginBottom: '28px' }}>
            Bon retour sur le <span className="bt-h1-accent">chantier</span>.
          </h1>

          {notice && <div className="bt-ok" role="status" data-testid="login-notice">{notice.text}</div>}

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
              {/* L'e-mail déjà tapé suit (stockage de session) : pas besoin de le retaper. */}
              <Link
                href="/mot-de-passe-oublie"
                className="bt-forgot"
                onClick={() => { try { if (email.trim()) sessionStorage.setItem(RESET_EMAIL_KEY, email.trim()); } catch { /* navigation privée : on retapera */ } }}
              >Oublié&nbsp;?</Link>
            </div>
            <PasswordInput
              id="login-password"
              className="bt-field"
              name="password"
              autoComplete="current-password"
              required
              disabled={loading}
              placeholder="••••••••"
              value={password}
              onChange={setPassword}
              wrapStyle={{ marginBottom: '18px' }}
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
              {loading ? 'Connexion…' : isEnt ? 'Accéder au tableau de bord →' : 'Envoyer mes heures →'}
            </button>
          </form>

          <p className="bt-foot">
            Pas encore de compte&nbsp;? <Link href="/inscription">Démarrer l&apos;essai gratuit</Link>
          </p>
        </div>
      </div>

      {/* ============ COLONNE VISUELLE (vrais écrans de l'app) ============ */}
      <div className="bt-visual">
        {/* décor de fond subtil : halo + X BEMEXO en biais */}
        <div className="bt-vis-halo" aria-hidden="true" />
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-vis-xbg bt-vis-xbg-1" />
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-vis-xbg bt-vis-xbg-2" />
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-vis-xbg bt-vis-xbg-3" />
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-vis-xbg bt-vis-xbg-4" />
        <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" className="bt-vis-xbg bt-vis-xbg-5" />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <div className="bt-vis-inner" dangerouslySetInnerHTML={{ __html: isEnt ? ENT_ILLUS : SAL_ILLUS }} />
          <div className="bt-vis-tagline">{isEnt ? '🏢 Espace entreprise · le planning' : '👷 Espace salarié · vos heures'}</div>
        </div>
        <img src="/bemexo-wordmark-light.svg" alt="" aria-hidden="true" className="bt-vis-brand" />
      </div>
    </div>
  );
}

// ── Ecran "definir / reinitialiser le mot de passe" (lien invitation / recuperation).
//    Le type (invitation ou récupération) vient du FRAGMENT du lien (#…type=…),
//    lu par la page : il n'est jamais dans la requête (?type=). Le lire ici avec
//    useSearchParams donnait toujours « invitation » — d'où « Créer un mot de
//    passe » et « Mot de passe défini ! » après un « mot de passe oublié ».
function SetPasswordForm({ isRecovery, onNeedLogin }: { isRecovery: boolean; onNeedLogin: (notice: LoginNotice) => void }) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    const probleme = passwordProblem(password);
    if (probleme) {
      setError(probleme);
      setLoading(false);
      return;
    }

    const { data: updated, error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      // Le serveur applique sa propre règle (réglage Supabase). Si elle est un
      // jour plus stricte que la nôtre, son refus arrive ici EN ANGLAIS, devant
      // un salarié qui vient de cliquer sur un lien d'invitation. On réaffiche
      // alors la règle en français plutôt que « Password should contain… ».
      // « Mot de passe oublié » puis le même mot de passe qu'avant : le serveur
      // refuse, mais ce n'est pas la règle qui est en cause.
      const memeMotDePasse = updateError.code === 'same_password' || /different from the old/i.test(updateError.message);
      setError(
        memeMotDePasse
          ? 'C’est déjà votre mot de passe actuel. Choisissez-en un nouveau, ou connectez-vous directement avec celui-ci.'
          : /password/i.test(updateError.message) ? PASSWORD_RULE : updateError.message
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Le lien reçu par e-mail a déjà ouvert une session : on emmène la personne
    // directement sur son écran (planning pour le bureau, « Ma journée » pour un
    // salarié). Avant, on la renvoyait sur un écran de connexion muet, sans
    // savoir si le mot de passe avait été enregistré.
    const email = updated?.user?.email ?? '';
    const shown = new Promise((r) => setTimeout(r, 900)); // le temps de lire « ✅ »
    // Le rôle décide de l'écran. Lecture bornée à 6 s : au-delà, on montre
    // l'écran de connexion avec le message plutôt qu'un « Connexion… » sans fin.
    const findTarget = async (): Promise<string | null> => {
      const userId = updated?.user?.id;
      if (!userId) return null;
      const { data: profile } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
      if (!profile?.role) return null;
      // Le profil en mémoire (auth-provider) est rafraîchi AVANT d'arriver sur
      // l'écran : /admin et /poseur ne voient jamais « personne n'est connecté ».
      await refreshUser();
      return homeForRole(profile.role);
    };
    let target: string | null = null;
    try {
      target = await Promise.race([
        findTarget(),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
    } catch {
      target = null;
    }
    await shown;
    if (target) {
      router.replace(target);
      return;
    }
    // Connexion directe impossible (profil illisible, réseau) : écran de connexion
    // avec le message et l'e-mail déjà rempli. Pas de signOut ici : l'écoute de
    // session (auth-provider) renverrait vers l'accueil et le message serait perdu ;
    // la connexion qui suit remplace simplement la session.
    onNeedLogin({
      text: isRecovery ? 'Mot de passe modifié ✅ Connectez-vous' : 'Mot de passe créé ✅ Connectez-vous',
      email,
    });
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center' }} role="status" data-testid="password-saved">
        <div style={{ background: '#e7f6ed', border: '1px solid #a8dcc0', borderRadius: '12px', padding: '16px' }}>
          <p style={{ color: '#1f7a4d', fontWeight: 700 }}>
            {isRecovery ? 'Mot de passe modifié ✅' : 'Mot de passe créé ✅'}
          </p>
          <p style={{ fontSize: '13.5px', color: '#3a8a62', marginTop: '6px' }}>Connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="bt-label" htmlFor="new-password">
        {isRecovery ? 'Nouveau mot de passe' : 'Créer un mot de passe'}
      </label>
      <PasswordInput
        id="new-password"
        className="bt-field"
        autoComplete="new-password"
        required
        disabled={loading}
        placeholder={PASSWORD_PLACEHOLDER}
        value={password}
        onChange={setPassword}
        showRules
        wrapStyle={{ marginBottom: '18px' }}
      />
      <label className="bt-label" htmlFor="confirm-new-password">Confirmer le mot de passe</label>
      <PasswordInput
        id="confirm-new-password"
        className="bt-field"
        autoComplete="new-password"
        required
        disabled={loading}
        placeholder="••••••••"
        value={confirmPassword}
        onChange={setConfirmPassword}
        wrapStyle={{ marginBottom: '22px' }}
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
  const [notice, setNotice] = useState<LoginNotice | null>(null);
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
      <style dangerouslySetInnerHTML={AUTH_CSS_HTML} />
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
              <div className="bt-logo">
                <Link href="/landing" className="bt-logo-badge" aria-label="BEMEXO — accueil">
                  <img src="/bemexo-wordmark-light.svg" alt="BEMEXO" className="bt-logo-badge-img" />
                </Link>
              </div>
              <h1 className="bt-h1">
                {isRecovery ? 'Réinitialiser le mot de passe' : 'Créer votre mot de passe'}
              </h1>
              <p className="bt-sub">
                {isRecovery ? 'Choisissez un nouveau mot de passe.' : 'Définissez votre mot de passe pour accéder à BEMEXO.'}
              </p>
              <SetPasswordForm
                isRecovery={isRecovery}
                onNeedLogin={(n) => { setNotice(n); setShowPasswordSet(false); }}
              />
            </div>
          </div>
        ) : (
          <LoginView notice={notice} />
        )}
      </div>
    </>
  );
}
