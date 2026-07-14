import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Export paie du BTP, prêt en un clic — BEMEXO',
  description:
    'En fin de mois, exportez un récapitulatif d’heures propre, prêt pour votre comptable ou votre logiciel de paie. Heures supplémentaires calculées, mois verrouillé, fini la ressaisie du lundi.',
  alternates: {
    canonical: 'https://bemexo.com/fonctionnalites/export-paie',
    languages: {
      'fr-FR': 'https://bemexo.com/fonctionnalites/export-paie',
      'x-default': 'https://bemexo.com/landing',
    },
  },
  openGraph: {
    title: 'Export paie du BTP — BEMEXO',
    description: 'Le récap d’heures du mois, propre et prêt pour la paie. Heures sup calculées, export Excel.',
    url: 'https://bemexo.com/fonctionnalites/export-paie',
    type: 'website',
    locale: 'fr_FR',
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
          { '@type': 'ListItem', position: 2, name: 'Export paie', item: 'https://bemexo.com/fonctionnalites/export-paie' },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Est-ce que ça marche avec mon logiciel de paie ?',
            acceptedAnswer: { '@type': 'Answer', text: 'L’export se fait en Excel ou au format attendu par votre logiciel. Votre comptable récupère un fichier propre, sans ressaisie.' },
          },
          {
            '@type': 'Question',
            name: 'Puis-je exporter un seul salarié ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Oui. Vous pouvez exporter toute l’équipe (ce qui verrouille le mois) ou la feuille d’un salarié précis, sans verrouillage.' },
          },
        ],
      }} />
      <SeoPage
        kicker="Fonctionnalité · Export paie"
        crumbs={[{ label: 'Export paie', href: '/fonctionnalites/export-paie' }]}
        title={<>L’export paie, <em>prêt en un clic.</em></>}
        lede="En fin de mois, plus besoin de recompiler les heures à la main. BEMEXO produit un récapitulatif propre — par salarié et par chantier — prêt pour votre comptable ou votre logiciel de paie."
        ctaTitle="La paie se prépare toute seule."
        ctaText="Essayez BEMEXO 30 jours : des heures fiables toute l’année, un export propre en fin de mois."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Fini la ressaisie du lundi</h2>
          <p className="sp-p">
            Les heures pointées sur le terrain s’accumulent proprement toute l’année, classées par salarié et par
            chantier. En fin de mois, vous cliquez sur <strong>« Exporter »</strong> et vous obtenez un récapitulatif
            net — sans repasser derrière, sans recopier un tableur.
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Ce que contient l’export</h2>
          <ul className="sp-list">
            <li>Le <strong>total d’heures par salarié</strong>, détaillé par chantier.</li>
            <li>Les <strong>heures supplémentaires</strong> et la pause déduite, déjà calculées.</li>
            <li>Un format <strong>Excel</strong> exploitable, ou adapté à votre logiciel de paie.</li>
            <li>Un récap lisible que votre <strong>comptable</strong> récupère sans rien retaper.</li>
          </ul>
          <div className="sp-note">
            <strong>Le mois se verrouille à l’export.</strong> Une fois la paie exportée, les heures du mois sont figées
            pour éviter toute modification après coup — vous gardez une base fiable et incontestable.
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">De la saisie du terrain à la fiche de paie</h2>
          <p className="sp-p">
            Tout part d’<strong>une seule saisie</strong> : le salarié pointe sur le chantier, les heures remontent au
            planning, et l’export les transforme en récap de paie. Une seule saisie, tout suit — c’est toute la logique
            de BEMEXO.
          </p>
          <div className="sp-related">
            <a href="/fonctionnalites/pointage-chantier"><b>Pointage chantier →</b><span>D’où viennent les heures : le pointage mobile.</span></a>
            <a href="/fonctionnalites/planning-equipe"><b>Planning d’équipe →</b><span>Le suivi en temps réel avant l’export.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>Est-ce que ça marche avec mon logiciel de paie ?</h3>
              <p>L’export se fait en Excel ou au format attendu par votre logiciel. Votre comptable récupère un fichier propre, sans ressaisie.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Puis-je exporter un seul salarié ?</h3>
              <p>Oui. Vous pouvez exporter toute l’équipe (ce qui verrouille le mois) ou la feuille d’un salarié précis, sans verrouillage.</p>
            </div>
          </div>
        </section>
      </SeoPage>
    </>
  );
}
