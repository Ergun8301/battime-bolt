import type { Metadata } from 'next';
import SeoPage, { JsonLd } from '@/components/seo-page';

export const metadata: Metadata = {
  title: 'Enregistrement du temps de travail en Suisse : vos obligations | BEMEXO',
  description:
    'Ce que dit la loi suisse sur l’enregistrement du temps de travail : art. 46 LTr, art. 73 OLT 1, et les allègements des art. 73a / 73b. Comment rester conforme sur le chantier avec un timbrage mobile.',
  alternates: { canonical: 'https://bemexo.com/suisse/enregistrement-temps-de-travail' },
  openGraph: {
    title: 'Enregistrement de la durée du travail en Suisse — vos obligations | BEMEXO',
    description: 'Art. 46 LTr, art. 73 OLT 1 et allègements 73a / 73b, expliqués pour les entreprises de construction.',
    url: 'https://bemexo.com/suisse/enregistrement-temps-de-travail',
    locale: 'fr_CH',
    type: 'article',
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Un employeur est-il obligé d’enregistrer le temps de travail en Suisse ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Oui. L’art. 46 de la loi sur le travail (LTr) et l’art. 73 de l’ordonnance 1 (OLT 1) imposent à l’employeur de tenir à disposition des autorités un enregistrement de la durée du travail quotidienne et hebdomadaire (y compris heures supplémentaires) et des pauses de 30 minutes et plus.',
            },
          },
          {
            '@type': 'Question',
            name: 'Existe-t-il des exceptions à l’enregistrement de la durée du travail ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Oui, depuis 2016 : l’art. 73a OLT 1 permet une renonciation sous conditions strictes (grande autonomie, revenu annuel brut supérieur à 120 000 CHF, renonciation écrite du salarié, base dans une convention collective), et l’art. 73b OLT 1 autorise un enregistrement simplifié (durée quotidienne uniquement) pour les salariés fixant eux-mêmes une partie de leurs horaires, notamment par accord écrit dans les entreprises de moins de 50 collaborateurs.',
            },
          },
          {
            '@type': 'Question',
            name: 'Un timbrage sur téléphone suffit-il à être conforme ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'La loi impose d’enregistrer la durée du travail sans imposer un moyen technique précis. Un enregistrement électronique daté, conservé et consultable par les autorités — comme un timbrage mobile — répond à cette exigence.',
            },
          },
        ],
      }} />
      <SeoPage
        kicker="Suisse · Obligations légales"
        crumbs={[{ label: 'Suisse', href: '/suisse' }, { label: 'Enregistrement du temps de travail', href: '/suisse/enregistrement-temps-de-travail' }]}
        title={<>Enregistrer la durée du travail : <em>vos obligations en Suisse.</em></>}
        lede="En Suisse, l’employeur doit consigner la durée du travail de ses collaborateurs. Voici, en clair, ce que dit la loi (art. 46 LTr, art. 73 OLT 1), les allègements possibles, et comment un timbrage de chantier mobile vous met en règle sans paperasse."
        ctaTitle="Restez en règle sans y penser."
        ctaText="Avec BEMEXO, l’enregistrement de la durée du travail se fait tout seul à partir du timbrage terrain. 30 jours gratuits."
      >
        <section className="sp-section">
          <h2 className="sp-h2">Ce que dit la loi</h2>
          <p className="sp-p">
            L’<strong>art. 46 de la loi sur le travail (LTr)</strong> oblige l’employeur à tenir à la disposition des
            autorités les registres et pièces nécessaires à l’application de la loi. L’<strong>art. 73 de l’ordonnance 1
            (OLT 1)</strong> précise ce qu’il faut enregistrer :
          </p>
          <div className="sp-law">
            <div className="sp-law-ref">Art. 73 OLT 1 — ce qui doit être consigné</div>
            <p>
              La <strong>durée du travail</strong> quotidienne et hebdomadaire effectivement fournie (y compris le
              travail compensatoire et le travail supplémentaire), ainsi que les <strong>pauses de 30 minutes et
              plus</strong>. Ces informations doivent être conservées cinq ans et pouvoir être présentées lors d’un contrôle.
            </p>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Les allègements possibles (art. 73a et 73b)</h2>
          <p className="sp-p">
            Depuis le 1<sup>er</sup> janvier 2016, deux assouplissements existent :
          </p>
          <ul className="sp-list">
            <li>
              <strong>Renonciation (art. 73a OLT 1)</strong> — réservée à des collaborateurs à
              <strong> grande autonomie</strong> (qui fixent eux-mêmes leurs horaires), avec un
              <strong>revenu annuel brut supérieur à 120 000 CHF</strong> (bonus compris), sur la base d’une
              convention collective le prévoyant et moyennant une <strong>renonciation individuelle écrite</strong>
              (révocable). C’est une exception étroite.
            </li>
            <li>
              <strong>Enregistrement simplifié (art. 73b OLT 1)</strong> — on ne consigne que la <strong>durée
              quotidienne</strong> du travail. Réservé aux salariés pouvant <strong>fixer eux-mêmes une part
              significative de leurs horaires</strong> ; dans les entreprises de <strong>moins de 50 collaborateurs</strong>,
              il peut résulter d’un accord écrit individuel avec le travailleur.
            </li>
          </ul>
          <p className="sp-p">
            Pour les équipes de chantier, dont les horaires sont fixés par l’entreprise, c’est en général
            l’<strong>enregistrement détaillé de l’art. 73 qui s’applique</strong> (l’enregistrement simplifié suppose
            que le salarié fixe lui-même une partie de ses horaires). D’où l’intérêt d’un outil qui le fait sans effort.
          </p>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Comment BEMEXO vous met en conformité</h2>
          <p className="sp-p">
            Chaque timbrage de vos ouvriers alimente automatiquement un <strong>enregistrement daté</strong> de la durée
            du travail : heures d’arrivée et de départ, pauses déduites, total quotidien et hebdomadaire. Tout est
            conservé et exportable — vous disposez d’un relevé propre, prêt à être présenté en cas de contrôle et prêt
            pour la paie.
          </p>
          <div className="sp-related">
            <a href="/suisse/timbrage-chantier"><b>Le timbrage de chantier →</b><span>Comment vos ouvriers timbrent sur mobile.</span></a>
            <a href="/suisse"><b>BEMEXO pour la Suisse →</b><span>Vue d’ensemble et tarifs indicatifs en CHF.</span></a>
          </div>
        </section>

        <section className="sp-section">
          <h2 className="sp-h2">Questions fréquentes</h2>
          <div className="sp-faq">
            <div className="sp-faq-item">
              <h3>Un employeur est-il obligé d’enregistrer le temps de travail en Suisse ?</h3>
              <p>Oui. L’art. 46 de la loi sur le travail (LTr) et l’art. 73 de l’ordonnance 1 (OLT 1) imposent à l’employeur de tenir à disposition des autorités un enregistrement de la durée du travail quotidienne et hebdomadaire (y compris les heures supplémentaires) et des pauses de 30 minutes et plus.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Existe-t-il des exceptions à l’enregistrement de la durée du travail ?</h3>
              <p>Oui, depuis 2016 : l’art. 73a OLT 1 permet une renonciation sous conditions strictes (grande autonomie, revenu annuel brut supérieur à 120 000 CHF, renonciation écrite du salarié, base dans une convention collective), et l’art. 73b OLT 1 autorise un enregistrement simplifié (durée quotidienne uniquement) pour les salariés fixant eux-mêmes une partie de leurs horaires, notamment par accord écrit dans les entreprises de moins de 50 collaborateurs.</p>
            </div>
            <div className="sp-faq-item">
              <h3>Un timbrage sur téléphone suffit-il à être conforme ?</h3>
              <p>La loi impose d’enregistrer la durée du travail sans imposer un moyen technique précis. Un enregistrement électronique daté, conservé et consultable par les autorités — comme un timbrage mobile — répond à cette exigence.</p>
            </div>
          </div>
          <div className="sp-note">
            <strong>Information générale.</strong> Cette page vulgarise le cadre légal (LTr, OLT 1) à titre informatif
            et ne constitue pas un conseil juridique. Pour votre situation précise (convention collective applicable,
            catégories de personnel), rapprochez-vous de votre fiduciaire ou d’un conseil spécialisé.
          </div>
        </section>
      </SeoPage>
    </>
  );
}
