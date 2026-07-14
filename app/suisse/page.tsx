import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Timbrage de chantier et suivi des heures — Suisse romande | BEMEXO',
  description:
    'BEMEXO : le timbrage de chantier sur mobile pour les entreprises de construction de Suisse romande (Genève, Vaud, Valais, Fribourg, Neuchâtel). Conforme à l’obligation d’enregistrement du temps de travail (LTr / OLT 1 art. 73).',
  alternates: { canonical: 'https://bemexo.com/suisse' },
  openGraph: {
    title: 'BEMEXO pour la Suisse romande — timbrage de chantier',
    description: 'Le suivi des heures sur chantier, conforme au droit suisse du travail. Genève, Vaud, Valais, Fribourg, Neuchâtel.',
    url: 'https://bemexo.com/suisse',
    locale: 'fr_CH',
    type: 'website',
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
          { '@type': 'ListItem', position: 2, name: 'Suisse romande', item: 'https://bemexo.com/suisse' },
        ],
      }} />
      <SeoPage
        kicker="Suisse romande"
        crumbs={[{ label: 'Suisse', href: '/suisse' }]}
        title={<>Le timbrage de chantier, <em>conforme au droit suisse.</em></>}
        lede="BEMEXO est le logiciel de timbrage et de suivi des heures pensé pour les entreprises de construction de Suisse romande. Vos ouvriers timbrent depuis leur téléphone, vous gardez un enregistrement du temps de travail conforme à la loi — de Genève au Valais."
        ctaTitle="Essayez le timbrage BEMEXO en Suisse romande."
        ctaText="30 jours gratuits pour équiper vos chantiers d’un timbrage mobile conforme au droit suisse du travail."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Le timbrage, sans badgeuse ni papier</h2>
          <p className="sp-p">
            Sur le chantier, pas de pointeuse murale ni de fiche à remplir : vos ouvriers <strong>timbrent depuis leur
            téléphone</strong>. Arrivée, pause, départ — la durée du travail est enregistrée, datée, et remonte au
            bureau en temps réel. Vous obtenez un relevé fiable, exploitable pour la paie et pour d’éventuels contrôles.
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Conçu pour vos obligations légales suisses</h2>
          <p className="sp-p">
            En Suisse, l’employeur doit <strong>enregistrer la durée du travail</strong> de ses collaborateurs
            (art. 46 de la loi sur le travail et art. 73 de l’ordonnance 1). BEMEXO tient cet enregistrement pour vous,
            automatiquement, à partir du timbrage terrain.
          </p>
          <div className="sp-related">
            <a href="/suisse/timbrage-chantier"><b>Le timbrage de chantier →</b><span>Comment vos ouvriers timbrent sur mobile.</span></a>
            <a href="/suisse/enregistrement-temps-de-travail"><b>Enregistrement du temps de travail →</b><span>Vos obligations LTr / OLT 1 art. 73, expliquées.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Pour les entreprises de toute la Suisse romande</h2>
          <p className="sp-p">
            Gros œuvre, second œuvre, artisans du bâtiment, entreprises générales — de <strong>Genève, Lausanne, Sion,
            Fribourg, Neuchâtel</strong> et partout en Romandie. BEMEXO s’adapte à la gestion annualisée des heures du
            secteur (la Convention nationale prévoit une durée de travail répartie sur l’année).
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Tarifs</h2>
          <p className="sp-p">
            Un prix simple selon la taille de l’équipe. Tarifs indicatifs :
          </p>
          <ul className="sp-list">
            <li><strong>≈ 49 CHF / mois</strong> — petites équipes et artisans (1 à 15 collaborateurs).</li>
            <li><strong>≈ 89 CHF / mois</strong> — le choix le plus courant (16 à 30 collaborateurs).</li>
            <li><strong>≈ 149 CHF / mois</strong> — structures avec plusieurs équipes (31 collaborateurs et plus).</li>
          </ul>
          <div className="sp-note">
            <strong>À noter :</strong> les montants en CHF sont indicatifs. La facturation est actuellement libellée en
            euros ; une facturation en francs suisses sera mise en place pour les premiers clients suisses. L’essai de
            30 jours est gratuit et sans carte bancaire.
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>« Timbrer », « pointer » — c’est la même chose ?</h3>
              <p>Oui. En Suisse romande on parle de <em>timbrage</em> ; en France de <em>pointage</em>. BEMEXO fait exactement ça : enregistrer les heures d’arrivée, de pause et de départ, depuis le téléphone.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Est-ce conforme si je n’ai pas de connexion sur le chantier ?</h3>
              <p>Oui. Le timbrage est enregistré sur le téléphone et se synchronise dès que le réseau revient. L’horodatage de la saisie est conservé.</p>
            </div>
          </div>
          <div className="sp-note">
            <strong>Information générale.</strong> Les références légales (LTr, OLT 1) sont fournies à titre informatif
            et ne constituent pas un conseil juridique. Voir le détail de{' '}
            <a href="/suisse/enregistrement-temps-de-travail">vos obligations d’enregistrement</a>.
          </div>
        </section>
      </SeoPage>
    </>
  );
}
