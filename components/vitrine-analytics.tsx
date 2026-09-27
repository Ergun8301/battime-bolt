// Module IPPYX « Google Analytics 4 + bandeau cookies » pour la vitrine.
//
// DÉSACTIVÉ PAR DÉFAUT. Il ne s'active que si la variable d'environnement
// PUBLIC_GA_ID (ex. G-XXXXXXXXXX) est définie au moment du build (Netlify).
// Sans elle, ce composant ne rend RIEN : aucun bandeau, aucun script, aucune
// requête. Les pages sont pré-rendues : la valeur est lue au build.
//
// Fonctionnement (public/cookies/bemexo-consent.js) : Consent Mode v2 tout
// « denied » par défaut, bandeau CookieConsent v3 servi depuis le site,
// gtag.js chargé seulement après acceptation. « Tout refuser » a le même poids
// visuel que « Tout accepter ».
//
// Cloudflare Web Analytics (injecté par Netlify) n'est pas concerné.

const GA_ID = (process.env.PUBLIC_GA_ID || '').trim();
const ENABLED = /^G-[A-Z0-9]+$/.test(GA_ID);

// Charte BEMEXO : noir #15120F, jaune chantier #FFC21A, crème #F2EDE3.
// Les deux boutons (accepter / refuser) ont exactement le même style.
const THEME = `
#cc-main{--cc-font-family:'Archivo',system-ui,sans-serif;--cc-bg:#F2EDE3;--cc-primary-color:#15120F;--cc-secondary-color:#46413a;
--cc-btn-primary-bg:#15120F;--cc-btn-primary-color:#FFC21A;--cc-btn-primary-border-color:#15120F;
--cc-btn-primary-hover-bg:#2a251f;--cc-btn-primary-hover-color:#FFC21A;--cc-btn-primary-hover-border-color:#2a251f;
--cc-btn-secondary-bg:#15120F;--cc-btn-secondary-color:#FFC21A;--cc-btn-secondary-border-color:#15120F;
--cc-btn-secondary-hover-bg:#2a251f;--cc-btn-secondary-hover-color:#FFC21A;--cc-btn-secondary-hover-border-color:#2a251f;
--cc-btn-border-radius:10px;--cc-modal-border-radius:14px;--cc-link-color:#15120F;
--cc-toggle-on-bg:#15120F;--cc-toggle-off-bg:#8a857c;--cc-toggle-readonly-bg:#c9c2b4;
--cc-cookie-category-block-bg:#fff;--cc-cookie-category-block-border:rgba(21,18,15,.12);
--cc-cookie-category-block-hover-bg:#fff;--cc-cookie-category-block-hover-border:rgba(21,18,15,.25);
--cc-cookie-category-expanded-block-bg:#fff;--cc-footer-bg:#ebe4d6;--cc-footer-color:#46413a;--cc-footer-border-color:rgba(21,18,15,.12);
--cc-separator-border-color:rgba(21,18,15,.12);--cc-section-category-border:rgba(21,18,15,.12)}
#cc-main .cm__btn,#cc-main .pm__btn{font-weight:800}
.bx-cookies{text-align:center;padding:14px 16px 18px}
.bx-cookies--dark{background:#0e0c0a}
.bx-cookies button{background:none;border:0;font:600 12px 'JetBrains Mono',monospace;color:#6E6A63;text-decoration:underline;cursor:pointer}
.bx-cookies--dark button{color:#9a948a}
`;

// `tone` : couleur du bas de page où s'affiche le lien « Gérer les cookies »
// (sombre sous le pied de page noir de l'accueil, clair ailleurs).
export default function VitrineAnalytics({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  if (!ENABLED) return null;
  return (
    <>
      <link rel="stylesheet" href="/cookies/cookieconsent.css" />
      <style dangerouslySetInnerHTML={{ __html: THEME }} />
      <script src="/cookies/cookieconsent.umd.js" defer />
      <script src="/cookies/bemexo-consent.js" data-ga-id={GA_ID} defer />
      {/* Permet de revenir sur son choix à tout moment (exigence CNIL). */}
      <div className={tone === 'dark' ? 'bx-cookies bx-cookies--dark' : 'bx-cookies'}>
        <button type="button" data-bx-cookies="">
          Gérer les cookies
        </button>
      </div>
    </>
  );
}
