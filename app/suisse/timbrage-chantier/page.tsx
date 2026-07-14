import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Timbrage de chantier sur mobile — Suisse | BEMEXO',
  description:
    'Le timbrage de chantier sans badgeuse : vos ouvriers timbrent leurs heures depuis leur téléphone. Enregistrement fiable de la durée du travail, conforme au droit suisse, prêt pour la paie.',
  alternates: {
    canonical: 'https://bemexo.com/suisse/timbrage-chantier',
    languages: {
      'fr-CH': 'https://bemexo.com/suisse/timbrage-chantier',
      'x-default': 'https://bemexo.com/landing',
    },
  },
  openGraph: {
    title: 'Timbrage de chantier sur mobile — Suisse | BEMEXO',
    description: 'Vos ouvriers timbrent depuis leur téléphone. Enregistrement de la durée du travail conforme au droit suisse.',
    url: 'https://bemexo.com/suisse/timbrage-chantier',
    locale: 'fr_CH',
    type: 'website',
    images: ['/og-image.png'],
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://bemexo.com/landing' },
          { '@type': 'ListItem', position: 2, name: 'Suisse', item: 'https://bemexo.com/suisse' },
          { '@type': 'ListItem', position: 3, name: 'Timbrage de chantier', item: 'https://bemexo.com/suisse/timbrage-chantier' },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Faut-il installer du matériel ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Non. Aucune badgeuse, aucun boîtier. Vos ouvriers installent l’application sur leur téléphone, et c’est parti.' },
          },
          {
            '@type': 'Question',
            name: 'Le timbrage mobile est-il accepté légalement ?',
            acceptedAnswer: { '@type': 'Answer', text: 'La loi impose d’enregistrer la durée du travail, sans imposer de moyen précis. Un enregistrement électronique daté et conservé — comme celui de BEMEXO — répond à cette exigence. Voir vos obligations.' },
          },
        ],
      }} />
      <SeoPage
        kicker="Suisse · Timbrage"
        crumbs={[{ label: 'Suisse', href: '/suisse' }, { label: 'Timbrage de chantier', href: '/suisse/timbrage-chantier' }]}
        title={<>Le timbrage de chantier, <em>sur le téléphone.</em></>}
        lede="Pas de badgeuse murale, pas de carte à passer : sur le chantier, vos ouvriers timbrent depuis leur smartphone. Chaque heure d’arrivée, de pause et de départ est enregistrée et remonte au bureau — un relevé de la durée du travail fiable et conforme au droit suisse."
        ctaTitle="Un timbrage qui suit vos ouvriers, partout."
        ctaText="30 jours gratuits : équipez vos chantiers d’un timbrage mobile, sans matériel ni installation."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Le timbrage là où travaillent vos ouvriers</h2>
          <p className="sp-p">
            Sur un chantier, une badgeuse fixe n’a pas de sens : les équipes bougent, changent de site, travaillent en
            extérieur. Le <strong>timbrage mobile</strong> résout ça — le téléphone que chaque ouvrier a déjà dans la
            poche devient l’outil de saisie. Un écran, un gros bouton : il choisit le chantier, timbre son arrivée, sa
            pause, son départ.
          </p>
          <div className="sp-note">
            <strong>Hors réseau ?</strong> Le timbrage est enregistré localement et se synchronise dès le retour de la
            connexion. Rien n’est perdu, l’horodatage est conservé.
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Un relevé exploitable, tout de suite</h2>
          <ul className="sp-list">
            <li>La <strong>durée du travail quotidienne et hebdomadaire</strong> est calculée automatiquement.</li>
            <li>Les <strong>pauses</strong> sont déduites — vous gardez le net travaillé.</li>
            <li>Chaque timbrage est <strong>daté et rattaché à un chantier</strong>.</li>
            <li>Le bureau suit tout <strong>en temps réel</strong>, sans téléphoner sur le terrain.</li>
            <li>En fin de mois, un <strong>export propre</strong> pour la comptabilité et la paie.</li>
          </ul>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Adapté à la construction suisse</h2>
          <p className="sp-p">
            La <strong>Convention nationale du secteur principal de la construction</strong> prévoit une durée du
            travail répartie sur l’année — <strong>environ 40,5 heures par semaine en moyenne</strong>, soit
            2112 heures par an. BEMEXO enregistre les heures réellement travaillées, ce qui vous aide à suivre ce total
            annualisé et à repérer les écarts, chantier par chantier.
          </p>
          <div className="sp-related">
            <a href="/suisse/enregistrement-temps-de-travail"><b>Vos obligations légales →</b><span>Enregistrer la durée du travail : LTr / OLT 1 art. 73.</span></a>
            <a href="/suisse"><b>BEMEXO pour la Suisse →</b><span>Vue d’ensemble et tarifs indicatifs en CHF.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>Faut-il installer du matériel ?</h3>
              <p>Non. Aucune badgeuse, aucun boîtier. Vos ouvriers installent l’application sur leur téléphone, et c’est parti.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Le timbrage mobile est-il accepté légalement ?</h3>
              <p>La loi impose d’enregistrer la durée du travail, sans imposer de moyen précis. Un enregistrement électronique daté et conservé — comme celui de BEMEXO — répond à cette exigence. Voir <a href="/suisse/enregistrement-temps-de-travail">vos obligations</a>.</p>
            </div>
          </div>
          <div className="sp-note">
            <strong>Information générale.</strong> Les références au droit suisse (LTr, OLT 1, Convention nationale) sont
            fournies à titre informatif et ne constituent pas un conseil juridique. Pour votre situation précise,
            rapprochez-vous de votre fiduciaire ou d’un conseil spécialisé.
          </div>
        </section>
      </SeoPage>
    </>
  );
}
