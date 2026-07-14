import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Pointage sur chantier : la feuille d’heures qui se remplit toute seule — BEMEXO',
  description:
    'Vos salariés pointent leurs heures depuis leur téléphone, directement sur le chantier. Arrivée, pause, départ — tout remonte au bureau en temps réel, prêt pour la paie. Sans papier, sans ressaisie.',
  alternates: { canonical: 'https://bemexo.com/fonctionnalites/pointage-chantier' },
  openGraph: {
    title: 'Pointage sur chantier — BEMEXO',
    description: 'Le pointage mobile du BTP : arrivée, pause, départ en un geste. Tout remonte au bureau, prêt pour la paie.',
    url: 'https://bemexo.com/fonctionnalites/pointage-chantier',
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
          { '@type': 'ListItem', position: 2, name: 'Pointage chantier', item: 'https://bemexo.com/fonctionnalites/pointage-chantier' },
        ],
      }} />
      <SeoPage
        kicker="Fonctionnalité · Pointage"
        crumbs={[{ label: 'Pointage chantier', href: '/fonctionnalites/pointage-chantier' }]}
        title={<>Le pointage chantier, <em>en un geste.</em></>}
        lede="Fini les feuilles d’heures en papier qui se perdent et la ressaisie du lundi matin. Sur le chantier, vos salariés pointent depuis leur téléphone — arrivée, pause, départ — et tout remonte au bureau en temps réel, propre et prêt pour la paie."
        ctaTitle="Le pointage papier, c’est terminé."
        ctaText="Essayez BEMEXO 30 jours : vos gars pointent depuis leur téléphone, vous récupérez des heures fiables sans rien retaper."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Le problème des feuilles d’heures papier</h2>
          <p className="sp-p">
            Sur un chantier, les heures se notent sur un carnet, un coin de feuille, un SMS. En fin de mois, il faut
            tout rassembler, déchiffrer, recopier dans un tableur, corriger les oublis. C’est long, c’est source
            d’erreurs, et l’information se perd <strong>entre le terrain et le bureau</strong>.
          </p>
          <p className="sp-p">
            BEMEXO remplace tout ça par un <strong>pointage mobile pensé pour le terrain</strong> : un écran, un gros
            bouton. Si vos salariés savent envoyer un SMS, ils savent pointer.
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
              <p>Début, fin, la durée se calcule et la pause est déduite automatiquement. Aucun calcul de tête.</p>
            </div>
            <div className="sp-step">
              <div className="sp-step-n">03</div>
              <h3>Il envoie sa journée</h3>
              <p>Un bouton « Envoyer ma journée » et c’est remonté au bureau. Trois taps, c’est fait.</p>
            </div>
          </div>
          <div className="sp-note">
            <strong>Pas de réseau sur le chantier ?</strong> Aucun souci. Le pointage est enregistré sur le téléphone
            et remonte tout seul dès que la connexion revient — rien n’est perdu.
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Ce que ça change pour vous</h2>
          <ul className="sp-list">
            <li>Des heures <strong>fiables et datées</strong>, chantier par chantier, salarié par salarié.</li>
            <li><strong>Fini la ressaisie</strong> : les heures arrivent déjà classées, prêtes à être validées.</li>
            <li>Vous suivez l’avancement <strong>en temps réel</strong>, sans appeler personne.</li>
            <li>Les <strong>heures supplémentaires</strong> et la pause déduite sont calculées automatiquement.</li>
            <li>En fin de mois, un <strong>export propre</strong> pour votre comptable ou votre logiciel de paie.</li>
          </ul>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Pour qui ?</h2>
          <p className="sp-p">
            BEMEXO est fait pour les <strong>entreprises du bâtiment et des travaux publics</strong> — maçons,
            électriciens, plombiers, couvreurs, menuisiers, paysagistes — et pour les <strong>agences d’intérim</strong>
            qui suivent des équipes sur plusieurs chantiers. Que vous soyez 3 ou 50 sur le terrain, le pointage reste
            aussi simple.
          </p>
          <div className="sp-related">
            <a href="/fonctionnalites/planning-equipe"><b>Planning d’équipe →</b><span>Qui est sur quel chantier, en temps réel.</span></a>
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
              <h3>Et si un salarié oublie de pointer ?</h3>
              <p>Vous voyez immédiatement les jours en attente au bureau et pouvez le relancer, ou compléter la saisie vous-même.</p>
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
