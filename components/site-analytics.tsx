// Module IPPYX « Google Analytics 4 + bandeau cookies », sur tout le site
// (rendu une seule fois par app/layout.tsx).
//
// Fonctionnement (public/cookies/bemexo-consent.js) :
// - Consent Mode v2 : tout « denied » par défaut, avant tout chargement ;
// - bandeau CookieConsent v3 (Orest Bida) servi depuis le site, aucun CDN ;
// - gtag.js chargé UNIQUEMENT après acceptation de la mesure d'audience ;
// - « Tout refuser » a exactement le même style que « Tout accepter ».
// Le bandeau est en surimpression : aucun décalage de mise en page.
// Le lien « Gérer les cookies » des pieds de page ([data-bx-cookies]) rouvre
// les préférences.
//
// Cloudflare Web Analytics (injecté par l'hébergeur, sans cookie) n'est pas
// concerné.

// ID de mesure GA4 de bemexo.com (identifiant public, pas un secret).
const GA_ID = 'G-C76Q47N9KN';

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
`;

export default function SiteAnalytics() {
  return (
    <>
      <link rel="stylesheet" href="/cookies/cookieconsent.css" />
      <style dangerouslySetInnerHTML={{ __html: THEME }} />
      <script src="/cookies/cookieconsent.umd.js" defer />
      <script src="/cookies/bemexo-consent.js" data-ga-id={GA_ID} defer />
    </>
  );
}
