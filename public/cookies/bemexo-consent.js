/*
 * Module IPPYX « Google Analytics 4 + bandeau cookies » — BEMEXO.
 * Inclus sur tout le site par components/site-analytics.tsx.
 *
 * 1. Consent Mode v2 : tout est « denied » par défaut, avant tout le reste.
 * 2. CookieConsent v3 (servi depuis le site) affiche le bandeau.
 * 3. gtag.js n'est téléchargé qu'APRÈS acceptation de la mesure d'audience.
 *    Durée des cookies _ga / _ga_* : 13 mois (recommandation CNIL).
 * 4. Catégorie « Publicité » (décochée par défaut) : ad_storage, ad_user_data
 *    et ad_personalization ne passent à « granted » qu'avec cet accord-là.
 * 5. Événements GA4 (window.bxTrack) : envoyés uniquement si gtag.js est
 *    chargé, donc après accord. Jamais de donnée personnelle en paramètre.
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

  // Tant que la publicité n'est pas acceptée, les données publicitaires
  // sont caviardées (identifiants de clic retirés des URL envoyées).
  gtag('set', 'ads_data_redaction', true);

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
    var ads = window.CookieConsent.acceptedCategory('advertising') ? 'granted' : 'denied';
    gtag('consent', 'update', {
      analytics_storage: ok ? 'granted' : 'denied',
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads,
    });
    gtag('set', 'ads_data_redaction', ads === 'denied');
    // Retrait en cours de visite : gtag.js reste en mémoire, on le coupe
    // (désactivation officielle GA) pour qu'il n'envoie plus rien.
    window['ga-disable-' + GA_ID] = !ok;
    if (ok) loadGtag();
  }

  // Événement GA4. Ne part qu'avec l'accord « Mesure d'audience » EN COURS
  // (pas seulement « gtag.js a été chargé un jour ») : sans accord, rien
  // n'est envoyé ni mis en file d'attente.
  window.bxTrack = function (name, params) {
    if (!gtagLoaded || !window.CookieConsent.acceptedCategory('analytics')) return;
    gtag('event', name, params || {});
  };

  // cta_essai : tout clic vers /inscription (« Essayer 30 jours gratuits »,
  // « Commencer l'essai »…). La position vient de data-cta-position sur le
  // lien ; à défaut, « autre ».
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var path;
    try { path = new URL(a.href, location.href).pathname.replace(/\/+$/, ''); } catch (err) { return; }
    if (path !== '/inscription') return;
    window.bxTrack('cta_essai', { cta_position: a.getAttribute('data-cta-position') || 'autre' });
  });

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
    // Révision du bandeau : à incrémenter à chaque nouvelle finalité, pour
    // redemander leur choix aux visiteurs déjà passés. 1 = ajout « Publicité ».
    revision: 1,
    guiOptions: {
      consentModal: { layout: 'box', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
      preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
      analytics: {
        autoClear: { cookies: [{ name: /^_ga/ }] },
      },
      advertising: {
        autoClear: { cookies: [{ name: /^_gcl/ }] },
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
              'Nous utilisons des cookies de mesure d’audience (Google Analytics) pour savoir comment le site est utilisé et, si vous l’acceptez, de publicité (Google Ads) pour mesurer l’efficacité de nos annonces. Ils ne sont déposés qu’avec votre accord.',
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
                title: 'Publicité',
                description: 'Google Ads : mesure des conversions (savoir si une visite venue d’une annonce BEMEXO aboutit à un essai). Cookie _gcl_au, conservé 90 jours. Désactivé tant que vous ne l’acceptez pas.',
                linkedCategory: 'advertising',
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
