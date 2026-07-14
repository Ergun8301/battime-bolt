import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Planning d’équipe chantier en temps réel — BEMEXO',
  description:
    'Affectez vos salariés aux chantiers d’un glisser-déposer, voyez qui est où et combien d’heures, en direct. Le planning BTP qui se met à jour tout seul, sans appeler personne.',
  alternates: {
    canonical: 'https://bemexo.com/fonctionnalites/planning-equipe',
    languages: {
      'fr-FR': 'https://bemexo.com/fonctionnalites/planning-equipe',
      'x-default': 'https://bemexo.com/landing',
    },
  },
  openGraph: {
    title: 'Planning d’équipe chantier — BEMEXO',
    description: 'Qui est sur quel chantier, combien d’heures, en temps réel. Le planning du BTP, simple et vivant.',
    url: 'https://bemexo.com/fonctionnalites/planning-equipe',
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
          { '@type': 'ListItem', position: 2, name: 'Planning d’équipe', item: 'https://bemexo.com/fonctionnalites/planning-equipe' },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Je gère plusieurs chantiers en même temps, ça suit ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Oui. Chaque salarié peut être affecté à des chantiers différents selon les jours, et chaque chantier garde sa couleur pour s’y retrouver instantanément.' },
          },
          {
            '@type': 'Question',
            name: 'Le salarié voit-il tout le planning de l’entreprise ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Non. Le salarié ne voit que ce qui le concerne pour pointer. La vue d’ensemble du planning reste côté bureau (patron / secrétariat).' },
          },
        ],
      }} />
      <SeoPage
        kicker="Fonctionnalité · Planning"
        crumbs={[{ label: 'Planning d’équipe', href: '/fonctionnalites/planning-equipe' }]}
        title={<>Le planning d’équipe, <em>en temps réel.</em></>}
        lede="Qui est sur quel chantier, combien d’heures, depuis quand. Affectez vos équipes d’un simple glisser-déposer et suivez tout depuis l’ordinateur — pendant que les heures remontent du terrain, en direct."
        ctaTitle="Voyez toute votre semaine d’un coup d’œil."
        ctaText="Essayez BEMEXO 30 jours : un planning clair, des heures qui remontent toutes seules, zéro coup de fil."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Un planning qui vit avec le chantier</h2>
          <p className="sp-p">
            La semaine est affichée comme un tableau : vos salariés en lignes, les jours en colonnes. Pour affecter
            quelqu’un à un chantier, vous <strong>glissez le client sur la case</strong> — c’est tout. Chaque chantier a
            sa couleur, la même toute la semaine, pour repérer d’un regard qui fait quoi.
          </p>
          <p className="sp-p">
            Et surtout : ce n’est pas un planning figé. Quand un salarié pointe sur le terrain, sa carte passe
            <strong> en direct</strong> de « prévu » à « pointé » avec ses heures réelles. Le planning et la réalité ne
            font plus qu’un.
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Ce que vous suivez, sans appeler personne</h2>
          <ul className="sp-list">
            <li><strong>Qui est sur quel chantier</strong>, aujourd’hui et sur toute la semaine.</li>
            <li>Les <strong>heures réelles</strong> pointées, comparées au prévu.</li>
            <li>Les <strong>absences</strong> (congé, maladie, intempérie) posées en un clic.</li>
            <li>Les <strong>jours en attente de saisie</strong>, pour relancer le bon salarié au bon moment.</li>
            <li>Les <strong>interventions ajoutées par le salarié</strong> lui-même, quand il passe sur un autre chantier.</li>
          </ul>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Pensé pour le patron et la secrétaire</h2>
          <p className="sp-p">
            Pas besoin d’être informaticien. Le vendredi, vous validez la semaine ; le mois fini, vous exportez. Entre
            les deux, le planning se remplit tout seul avec les heures du terrain. La secrétaire garde la main sur tout
            depuis un seul écran, sans jongler entre dix outils.
          </p>
          <div className="sp-related">
            <a href="/fonctionnalites/pointage-chantier"><b>Pointage chantier →</b><span>Comment les salariés pointent depuis leur téléphone.</span></a>
            <a href="/fonctionnalites/export-paie"><b>Export paie →</b><span>Le récap du mois, prêt en un clic.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>Je gère plusieurs chantiers en même temps, ça suit ?</h3>
              <p>Oui. Chaque salarié peut être affecté à des chantiers différents selon les jours, et chaque chantier garde sa couleur pour s’y retrouver instantanément.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Le salarié voit-il tout le planning de l’entreprise ?</h3>
              <p>Non. Le salarié ne voit que ce qui le concerne pour pointer. La vue d’ensemble du planning reste côté bureau (patron / secrétariat).</p>
            </div>
          </div>
        </section>
      </SeoPage>
    </>
  );
}
