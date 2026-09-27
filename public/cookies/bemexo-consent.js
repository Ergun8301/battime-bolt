/*
 * Module IPPYX « Google Analytics 4 + bandeau cookies » — BEMEXO.
 * Inclus sur tout le site par components/site-analytics.tsx.
 *
 * 1. Consent Mode v2 : tout est « denied » par défaut, avant tout le reste.
 * 2. CookieConsent v3 (servi depuis le site) affiche le bandeau.
 * 3. gtag.js n'est téléchargé qu'APRÈS acceptation de la mesure d'audience.
 *    Durée des cookies _ga / _ga_* : 13 mois (recommandation CNIL).
 */
(function () {
  var script = document.currentScript;
  var GA_ID = script && script.getAttribute('data-ga-id');
  if (!GA_ID || !window.CookieConsent) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'denied',
    wait_for_update: 500,
  });

  var gtagLoaded = false;
  function loadGtag() {
    if (gtagLoaded) return;
    gtagLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { cookie_expires: 13 * 30 * 24 * 60 * 60 });
  }

  function applyConsent() {
    var ok = window.CookieConsent.acceptedCategory('analytics');
    gtag('consent', 'update', { analytics_storage: ok ? 'granted' : 'denied' });
    if (ok) loadGtag();
  }

  // Lien « Gérer les cookies » en bas de page (délégation : fonctionne aussi
  // après une navigation interne).
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-bx-cookies]')) {
      window.CookieConsent.showPreferences();
    }
  });

  window.CookieConsent.run({
    // Choix mémorisé 6 mois (cookie cc_cookie), puis redemandé.
    cookie: { name: 'cc_cookie', expiresAfterDays: 182 },
    guiOptions: {
      consentModal: { layout: 'box', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
      preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
      analytics: {
        autoClear: { cookies: [{ name: /^_ga/ }] },
      },
    },
    onConsent: applyConsent,
    onChange: applyConsent,
    language: {
      default: 'fr',
      translations: {
        fr: {
          consentModal: {
            title: 'Cookies',
            description:
              'Nous utilisons des cookies de mesure d’audience (Google Analytics) pour savoir comment le site est utilisé. Ils ne sont déposés qu’avec votre accord.',
            acceptAllBtn: 'Tout accepter',
            acceptNecessaryBtn: 'Tout refuser',
            showPreferencesBtn: 'Choisir',
            footer: '<a href="/confidentialite">Confidentialité</a>',
          },
          preferencesModal: {
            title: 'Vos choix de cookies',
            acceptAllBtn: 'Tout accepter',
            acceptNecessaryBtn: 'Tout refuser',
            savePreferencesBtn: 'Enregistrer mes choix',
            closeIconLabel: 'Fermer',
            sections: [
              {
                title: 'Cookies nécessaires',
                description: 'Indispensables au fonctionnement du site. Toujours actifs.',
                linkedCategory: 'necessary',
              },
              {
                title: 'Mesure d’audience',
                description: 'Google Analytics 4 : statistiques de visite (pages vues, provenance, appareil). Cookies _ga et _ga_*, conservés 13 mois. Désactivé tant que vous ne l’acceptez pas.',
                linkedCategory: 'analytics',
              },
              {
                title: 'En savoir plus',
                description: 'Voir notre <a href="/confidentialite#cookies">politique de confidentialité</a>.',
              },
            ],
          },
        },
      },
    },
  });
})();
