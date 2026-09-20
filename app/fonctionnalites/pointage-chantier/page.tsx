import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Pointage sur chantier : la feuille d’heures qui se remplit toute seule — BEMEXO',
  description:
    'Vos salariés saisissent leurs heures depuis leur téléphone, directement sur le chantier. Chantier, début, fin — la journée part au bureau, prête pour la paie. Sans papier, sans ressaisie.',
  alternates: {
    canonical: 'https://bemexo.com/fonctionnalites/pointage-chantier',
    languages: {
      'fr-FR': 'https://bemexo.com/fonctionnalites/pointage-chantier',
      'x-default': 'https://bemexo.com/landing',
    },
  },
  openGraph: {
    title: 'Pointage sur chantier — BEMEXO',
    description: 'Le pointage mobile du BTP : chantier, début, fin en quelques gestes. Tout remonte au bureau, prêt pour la paie.',
    url: 'https://bemexo.com/fonctionnalites/pointage-chantier',
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
          { '@type': 'ListItem', position: 2, name: 'Pointage chantier', item: 'https://bemexo.com/fonctionnalites/pointage-chantier' },
        ],
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Mes salariés ne sont pas à l’aise avec la technologie.',
            acceptedAnswer: { '@type': 'Answer', text: 'C’est fait pour eux : un écran, un gros bouton. Aucune formation nécessaire, ça marche du premier coup.' },
          },
          {
            '@type': 'Question',
            name: 'Et si un salarié oublie sa journée ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Vous voyez immédiatement les jours en attente au bureau et pouvez le relancer en un clic.' },
          },
          {
            '@type': 'Question',
            name: 'Combien de temps pour démarrer ?',
            acceptedAnswer: { '@type': 'Answer', text: 'Cinq minutes : vous ajoutez vos salariés et vos chantiers, ils installent l’appli, et c’est parti dès le lendemain.' },
          },
        ],
      }} />
      <SeoPage
        kicker="Fonctionnalité · Pointage"
        crumbs={[{ label: 'Pointage chantier', href: '/fonctionnalites/pointage-chantier' }]}
        title={<>Le pointage chantier, <em>en un geste.</em></>}
        lede="Fini les feuilles d’heures en papier qui se perdent et la ressaisie du lundi matin. Sur le chantier, vos salariés saisissent leurs heures depuis leur téléphone — chantier, début, fin — puis envoient leur journée au bureau, propre et prête pour la paie."
        ctaTitle="Le pointage papier, c’est terminé."
        ctaText="Essayez BEMEXO 30 jours : vos gars saisissent leurs heures depuis leur téléphone, vous récupérez des heures fiables sans rien retaper."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Le problème des feuilles d’heures papier</h2>
          <p className="sp-p">
            Sur un chantier, les heures se notent sur un carnet, un coin de feuille, un SMS. En fin de mois, il faut
            tout rassembler, déchiffrer, recopier dans un tableur, corriger les oublis. C’est long, c’est source
            d’erreurs, et l’information se perd <strong>entre le terrain et le bureau</strong>.
          </p>
          <p className="sp-p">
            BEMEXO remplace tout ça par une <strong>saisie mobile pensée pour le terrain</strong> : un écran, un gros
            bouton. Si vos salariés savent envoyer un SMS, ils savent envoyer leur journée.
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Comment ça marche, côté salarié</h2>
          <div className="sp-steps">
            <div className="sp-step">
              <div className="sp-step-n">01</div>
              <h3>Il choisit son chantier</h3>
              <p>La liste de ses chantiers du jour s’affiche. Un tap suffit pour sélectionner le bon.</p>
            </div>
            <div className="sp-step">
              <div className="sp-step-n">02</div>
              <h3>Il saisit ses heures</h3>
              <p>Début, fin : la durée se calcule toute seule. Aucun calcul de tête.</p>
            </div>
            <div className="sp-step">
              <div className="sp-step-n">03</div>
              <h3>Il envoie sa journée</h3>
              <p>Un bouton « Envoyer ma journée » et c’est remonté au bureau. Trois taps, c’est fait.</p>
            </div>
          </div>
          <div className="sp-note">
            <strong>Pas de réseau sur le chantier ?</strong> Aucun souci. La saisie est conservée sur le téléphone
            et part toute seule au retour de la connexion, même plusieurs jours après.
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Ce que ça change pour vous</h2>
          <ul className="sp-list">
            <li>Des heures <strong>fiables et datées</strong>, chantier par chantier, salarié par salarié.</li>
            <li><strong>Fini la ressaisie</strong> : les heures arrivent déjà classées, prêtes à être vérifiées.</li>
            <li>Vous suivez l’avancement <strong>jour par jour</strong>, sans appeler personne.</li>
            <li>Les <strong>jours oubliés</strong> sont repérés et le salarié relancé en un clic.</li>
            <li>En fin de mois, un <strong>export propre</strong> pour votre comptable.</li>
          </ul>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Pour qui ?</h2>
          <p className="sp-p">
            BEMEXO est fait pour les <strong>entreprises du bâtiment et des travaux publics</strong> — maçons,
            électriciens, plombiers, couvreurs, menuisiers, paysagistes — et pour les <strong>agences d’intérim</strong>
            qui suivent des équipes sur plusieurs chantiers. Que vous soyez 3 ou 50 sur le terrain, la saisie reste
            aussi simple.
          </p>
          <div className="sp-related">
            <a href="/fonctionnalites/planning-equipe"><b>Planning d’équipe →</b><span>Qui est sur quel chantier, jour par jour.</span></a>
            <a href="/fonctionnalites/export-paie"><b>Export paie →</b><span>Le récap du mois, prêt en un clic.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>Mes salariés ne sont pas à l’aise avec la technologie.</h3>
              <p>C’est fait pour eux : un écran, un gros bouton. Aucune formation nécessaire, ça marche du premier coup.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Et si un salarié oublie sa journée ?</h3>
              <p>Vous voyez immédiatement les jours en attente au bureau et pouvez le relancer en un clic.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Combien de temps pour démarrer ?</h3>
              <p>Cinq minutes : vous ajoutez vos salariés et vos chantiers, ils installent l’appli, et c’est parti dès le lendemain.</p>
            </div>
          </div>
        </section>
      </SeoPage>
    </>
  );
}
