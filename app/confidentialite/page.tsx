import LegalLayout from '@/components/legal-layout';

export const metadata = { title: 'Politique de confidentialité — Battime' };

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updated="[À COMPLÉTER]">
      <p>
        La présente politique explique comment Battime traite les données personnelles dans le cadre de son service de
        gestion des feuilles d'heures pour le BTP. Elle est rédigée conformément au Règlement (UE) 2016/679 (RGPD) et à
        la loi « Informatique et Libertés ».
      </p>

      <h2>1. Qui est responsable des données ?</h2>
      <p>
        Battime est un outil utilisé par des entreprises (l'« <strong>entreprise cliente</strong> »), qui y gèrent les
        données de leurs salariés.
      </p>
      <ul>
        <li>
          Pour les données des <strong>salariés</strong> saisies via Battime (identité, heures, etc.), l'
          <strong>entreprise cliente est responsable de traitement</strong> ; <strong>Battime agit comme sous-traitant</strong>{' '}
          (au sens de l'article 28 du RGPD), pour le compte et sur instruction de l'entreprise cliente.
        </li>
        <li>
          Pour les données du <strong>compte de l'entreprise cliente</strong> elle-même (création de compte, facturation),
          Battime est responsable de traitement.
        </li>
      </ul>

      <h2>2. Quelles données sont traitées ?</h2>
      <ul>
        <li><strong>Identité et contact</strong> : nom, prénom, adresse e-mail, téléphone.</li>
        <li><strong>Données de connexion</strong> : e-mail et mot de passe (chiffré), journaux techniques.</li>
        <li>
          <strong>Données de paie — facultatives</strong> : numéro de sécurité sociale (NIR), date d'embauche, type de
          contrat. Ces champs ne sont renseignés que si l'employeur le souhaite, pour ses obligations de paie.
        </li>
        <li><strong>Données d'activité</strong> : heures déclarées, interventions, plannings, chantiers / clients.</li>
      </ul>
      <p>Aucune donnée n'est collectée à des fins publicitaires. Aucune revente de données n'est effectuée.</p>

      <h2>3. Pourquoi (finalités) et sur quelle base ?</h2>
      <ul>
        <li><strong>Fournir le service</strong> (saisie des heures, planning, exports pour la paie) — base : exécution du contrat.</li>
        <li><strong>Authentification et sécurité</strong> — base : intérêt légitime / obligation de sécurité.</li>
        <li><strong>Obligations de paie et déclarations sociales</strong> (côté employeur) — base : obligation légale.</li>
        <li><strong>Support et amélioration du service</strong> — base : intérêt légitime.</li>
      </ul>

      <h2>4. Le numéro de sécurité sociale (NIR)</h2>
      <p>
        Le NIR est une donnée encadrée, mais son utilisation pour la <strong>gestion de la paie et les déclarations
        sociales</strong> est expressément autorisée. Dans Battime, il est <strong>facultatif</strong> et
        <strong> accessible uniquement à l'employeur</strong> (secrétaire / administrateur) ; il n'est jamais visible par
        les autres salariés.
      </p>

      <h2>5. Qui a accès aux données ?</h2>
      <ul>
        <li>L'<strong>entreprise cliente</strong> (employeur), strictement pour ses propres salariés.</li>
        <li>Les <strong>sous-traitants techniques</strong> de Battime : Netlify (hébergement de l'interface) et Supabase (base de données / authentification).</li>
        <li>Le cas échéant, les autorités si la loi l'exige.</li>
      </ul>

      <h2>6. Hébergement et localisation</h2>
      <p>
        Les données sont stockées dans l'<strong>Union européenne</strong> (Supabase, région Paris). L'interface est
        distribuée via Netlify, ce qui peut impliquer des transferts hors UE encadrés par des garanties appropriées
        (clauses contractuelles types de la Commission européenne).
      </p>

      <h2>7. Durée de conservation</h2>
      <p>
        Les données sont conservées pendant la durée de la relation contractuelle, puis archivées ou supprimées selon
        les durées légales applicables (par exemple, les éléments liés à la paie sont conservés conformément aux
        obligations légales — durée à préciser avec l'employeur). [À COMPLÉTER : durées précises.]
      </p>

      <h2>8. Sécurité</h2>
      <ul>
        <li>Chiffrement des communications (HTTPS / TLS) et des données au repos.</li>
        <li><strong>Cloisonnement par entreprise et par rôle</strong> (politiques d'accès au niveau base de données).</li>
        <li>Mots de passe stockés sous forme chiffrée (hachée).</li>
        <li>Accès limité au strict nécessaire.</li>
      </ul>

      <h2>9. Vos droits</h2>
      <p>
        Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité.
        Pour les données traitées par votre employeur, adressez-vous à lui ; pour les autres, contactez Battime à{' '}
        <a href="mailto:[À COMPLÉTER]">[À COMPLÉTER : email]</a>. Vous pouvez également introduire une réclamation auprès
        de la <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noreferrer">cnil.fr</a>).
      </p>

      <h2>10. Cookies</h2>
      <p>
        Battime n'utilise que des cookies <strong>strictement nécessaires</strong> au fonctionnement (authentification /
        session). Aucun cookie publicitaire ou de traçage tiers n'est utilisé ; aucun bandeau de consentement n'est donc
        requis pour ces cookies essentiels.
      </p>

      <h2>11. Contact</h2>
      <p>Pour toute question sur cette politique : <a href="mailto:[À COMPLÉTER]">[À COMPLÉTER : email]</a>.</p>
    </LegalLayout>
  );
}
