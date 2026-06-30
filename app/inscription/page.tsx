'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { ASIDE_FULL } from './_illustrations';

// Design "noir + jaune chantier" (maquette Claude Design). Habillage uniquement :
// la creation de compte (signUp + metadonnees -> trigger qui cree l'entreprise +
// rattache en admin), la redirection /admin et la gestion d'erreurs restent
// INCHANGEES.
//
// IMPORTANT — repartition des roles :
//  - Le PANNEAU NOIR (aside, vitrine 3D) vient du designer : injecte tel quel
//    (_illustrations.ts / ASIDE_FULL), purement decoratif.
//  - La TENUE DANS L'ECRAN (hauteur, scroll, dimensions) reste la notre :
//    grille plein ecran + .bt-aside en overflow:hidden (le panneau ne peut jamais
//    causer de scroll de page ; au pire il se rogne sur un ecran tres court) +
//    formulaire fluide (clamp/vh) qui s'adapte a la hauteur, + 100svh pour eviter
//    le bug de scroll mobile du 100vh.
const SIGNUP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-auth{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;min-height:100vh;min-height:100svh}
.bt-auth *{box-sizing:border-box}
.bt-auth .mono{font-family:'JetBrains Mono',monospace}
.bt-mono{font-family:'JetBrains Mono',monospace}
.bt-auth .backbtn{transition:background .15s ease,border-color .15s ease,color .15s ease}
.bt-auth .backbtn:hover{background:rgba(255,194,26,.16);border-color:rgba(255,194,26,.6);color:#FFC21A}
.bt-split{display:grid;grid-template-columns:1fr 1fr;min-height:100vh;min-height:100svh;position:relative}
.bt-aside{position:relative;background:#15120F;color:#F2EDE3;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;padding:clamp(30px,6vh,72px) clamp(22px,4vw,50px) clamp(20px,3vh,40px);min-width:0}
.bt-ruban-center{position:absolute;top:0;left:calc(50% - 6px);width:12px;height:100%;background:repeating-linear-gradient(45deg,#15120F 0 9px,#FFC21A 9px 18px);z-index:5;pointer-events:none}
.bt-formcol{display:flex;flex-direction:column;padding:clamp(14px,3vh,34px) 6vw;min-width:0}
.bt-wrap{width:100%;max-width:480px;margin:auto}
.bt-logo-ins{display:inline-flex;margin-bottom:18px}
.bt-logo-img{height:30px;width:auto;display:block}
.bt-back-m{display:none;align-items:center;gap:7px;text-decoration:none;color:#6E6A63;font-weight:700;font-size:14px;margin-bottom:16px}
.bt-back-m:hover{color:#15120F}
.bt-h1{font-size:clamp(24px,4.2vh,30px);line-height:1.05;font-weight:900;letter-spacing:-.025em;margin:0 0 clamp(3px,0.8vh,7px)}
.bt-sub{font-size:15px;color:#6E6A63;font-weight:500;margin:0 0 clamp(9px,2vh,20px)}
.bt-label{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:clamp(3px,0.6vh,6px)}
.bt-opt{font-family:'Archivo',sans-serif;text-transform:none;letter-spacing:0;font-size:11px;color:#a39d92;font-weight:600;margin-left:7px}
.bt-field{width:100%;font-family:'Archivo',sans-serif;font-size:16px;font-weight:500;padding:clamp(9px,1.5vh,13px) 16px;border:1.5px solid rgba(21,18,15,.18);border-radius:11px;background:#FBF8F2;outline:none;color:#15120F;margin-bottom:clamp(8px,1.7vh,16px)}
.bt-field::placeholder{color:#a39d92}
.bt-field:focus{border-color:#15120F;background:#fff}
.bt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:clamp(8px,1.7vh,16px)}
.bt-grid2 .bt-field{margin-bottom:0}
.bt-ybtn{width:100%;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:'Archivo',sans-serif;font-weight:900;font-size:17px;padding:clamp(12px,1.7vh,16px);border-radius:12px;box-shadow:0 4px 0 #C99300;transition:transform .12s ease, box-shadow .12s ease}
.bt-ybtn:hover{transform:translateY(-2px);box-shadow:0 6px 0 #C99300}
.bt-ybtn:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
.bt-ybtn:disabled{opacity:.65;cursor:default;transform:none;box-shadow:0 4px 0 #C99300}
.bt-legal{font-size:12.5px;color:#9a948a;font-weight:500;text-align:center;line-height:1.45;margin:clamp(7px,1.5vh,13px) 0 0}
.bt-legal a{color:#6E6A63;font-weight:700}
.bt-foot{text-align:center;font-size:14.5px;color:#6E6A63;font-weight:500;margin:clamp(9px,1.6vh,16px) 0 0}
.bt-foot a{font-weight:800;color:#15120F;text-decoration:none;border-bottom:2px solid #FFC21A}
.bt-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin-bottom:14px}
.bt-info{background:#e7f6ed;border:1px solid #a8dcc0;color:#1f7a4d;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin-bottom:14px}
@media(min-width:881px){
  .bt-split{height:100vh;height:100svh;min-height:0}
  .bt-formcol{height:100vh;height:100svh;overflow-y:auto}
}
@media(max-width:880px){
  .bt-split{grid-template-columns:1fr}
  .bt-aside{display:none}
  .bt-formcol{padding:28px 28px}
  .bt-ruban-center{display:none}
  .bt-back-m{display:inline-flex}
  .bt-wrap{margin:0 auto}
}
`;

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  // ── Creation de compte : INCHANGEE ──
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
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Le lien de confirmation revient sur NOTRE app (prod ou preview selon
          // l'origine) ; le handler de hash de /connexion pose la session.
          emailRedirectTo: `${window.location.origin}/connexion`,
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
        router.push('/admin');
        return;
      }

      setInfo('Compte cree. Verifiez votre email pour activer votre acces, puis connectez-vous.');
    } catch (err) {
      console.error('Signup error:', err);
      setError('Une erreur est survenue lors de la creation du compte. Veuillez reessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SIGNUP_CSS }} />
      <div className="bt-auth">
        <div className="bt-split">
          <div className="bt-ruban-center" />

          {/* Panneau noir (design Claude Design v3) injecte tel quel. La tenue dans
              l'ecran reste geree par .bt-aside (overflow:hidden) dans la grille
              .bt-split -> ne peut jamais causer de scroll de page. */}
          <div className="bt-aside" dangerouslySetInnerHTML={{ __html: ASIDE_FULL }} />

          {/* ============ COLONNE FORMULAIRE (notre gestion hauteur/scroll, inchangee) ============ */}
          <div className="bt-formcol">
            <div className="bt-wrap">
              <Link href="/landing" className="bt-logo-ins" aria-label="BEMEXO — accueil">
                <img src="/bemexo-wordmark-dark.svg" alt="BEMEXO" className="bt-logo-img" />
              </Link>
              {/* Retour visible sur telephone (le panneau noir est masque en mobile) */}
              <Link href="/landing" className="bt-back-m">
                <span style={{ fontSize: '16px' }}>←</span> Retour à l&apos;accueil
              </Link>

              <h1 className="bt-h1">Créez votre compte.</h1>
              <p className="bt-sub">Lancez votre essai gratuit — aucune carte demandée.</p>

              <form onSubmit={handleSignup}>
                <label className="bt-label" htmlFor="company-name">Nom de l&apos;entreprise</label>
                <input id="company-name" className="bt-field" type="text" required disabled={loading} placeholder="Ex. Martin Menuiserie" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />

                <div className="bt-grid2">
                  <div>
                    <label className="bt-label" htmlFor="firstname">Prénom</label>
                    <input id="firstname" className="bt-field" type="text" required disabled={loading} placeholder="Thierry" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label" htmlFor="lastname">Nom</label>
                    <input id="lastname" className="bt-field" type="text" required disabled={loading} placeholder="Rivière" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>

                <label className="bt-label" htmlFor="signup-email">Email professionnel</label>
                <input id="signup-email" className="bt-field" type="email" required disabled={loading} placeholder="bureau@entreprise.fr" value={email} onChange={(e) => setEmail(e.target.value)} />

                <label className="bt-label" htmlFor="signup-password">Mot de passe</label>
                <input id="signup-password" className="bt-field" type="password" required disabled={loading} placeholder="6 caractères minimum" value={password} onChange={(e) => setPassword(e.target.value)} />

                <div className="bt-grid2">
                  <div>
                    <label className="bt-label" htmlFor="phone">Téléphone <span className="bt-opt">facultatif</span></label>
                    <input id="phone" className="bt-field" type="tel" disabled={loading} placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <label className="bt-label" htmlFor="employee-count">Salariés <span className="bt-opt">facultatif</span></label>
                    <input id="employee-count" className="bt-field" type="number" min="1" disabled={loading} placeholder="Ex. 9" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} />
                  </div>
                </div>

                {error && <div className="bt-err">{error}</div>}
                {info && <div className="bt-info">{info}</div>}

                <button className="bt-ybtn" type="submit" disabled={loading}>
                  {loading ? 'Création…' : 'Démarrer mon essai gratuit →'}
                </button>

                <p className="bt-legal">
                  En créant un compte, vous acceptez les <Link href="/mentions-legales">conditions d&apos;utilisation</Link> et la <Link href="/confidentialite">politique de confidentialité</Link>.
                </p>
              </form>

              <p className="bt-foot">
                Déjà un compte&nbsp;? <Link href="/connexion">Se connecter</Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
