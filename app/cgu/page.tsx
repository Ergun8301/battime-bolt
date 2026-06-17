import LegalLayout from '@/components/legal-layout';

export const metadata = { title: "Conditions générales d'utilisation — Battime" };

export default function CguPage() {
  return (
    <LegalLayout title="Conditions générales d'utilisation" updated="[À COMPLÉTER]">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions (« CGU ») encadrent l'accès et l'utilisation de l'application <strong>Battime</strong>,
        un service en ligne (SaaS) de gestion des feuilles d'heures et de planning pour le secteur du BTP, édité par
        [À COMPLÉTER]. L'utilisation de Battime implique l'acceptation des présentes CGU.
      </p>

      <h2>2. Accès au service</h2>
      <p>
        L'accès se fait via un compte personnel. Les salariés accèdent à Battime sur <strong>invitation</strong> de leur
        employeur ; les comptes d'entreprise sont créés par l'éditeur. Les identifiants sont personnels et confidentiels :
        l'utilisateur est responsable de leur conservation et de toute activité réalisée depuis son compte.
      </p>

      <h2>3. Utilisation</h2>
      <ul>
        <li>Le service est réservé à un usage <strong>professionnel</strong>.</li>
        <li>
          L'utilisateur s'engage à fournir des informations <strong>exactes</strong> (notamment les heures déclarées) et à
          ne pas détourner le service à des fins illicites.
        </li>
        <li>Il est interdit de tenter de perturber, contourner la sécurité ou accéder à des données qui ne le concernent pas.</li>
      </ul>

      <h2>4. Données et confidentialité</h2>
      <p>
        Le traitement des données personnelles est décrit dans la <a href="/confidentialite">Politique de confidentialité</a>.
        Chaque entreprise cliente reste responsable des données de ses salariés et de ses obligations légales (paie,
        déclarations sociales) ; Battime fournit l'outil.
      </p>

      <h2>5. Disponibilité et responsabilité</h2>
      <p>
        Battime met en œuvre les moyens raisonnables pour assurer la disponibilité et la fiabilité du service
        (obligation de moyens). Le service est fourni « en l'état » ; une disponibilité ininterrompue ne peut être
        garantie (maintenance, incidents techniques, dépendance à des prestataires tiers). La responsabilité de l'éditeur
        ne saurait être engagée pour les conséquences d'erreurs de saisie réalisées par les utilisateurs.
      </p>

      <h2>6. Propriété intellectuelle</h2>
      <p>
        Battime, son code et ses contenus restent la propriété de l'éditeur. Aucune cession de droits n'est accordée à
        l'utilisateur en dehors du droit d'utiliser le service pendant la durée de l'abonnement.
      </p>

      <h2>7. Durée et résiliation</h2>
      <p>
        Les CGU s'appliquent pendant toute la durée d'utilisation du service. L'éditeur peut suspendre ou résilier un
        accès en cas de manquement aux présentes conditions. [À COMPLÉTER : modalités d'abonnement / résiliation.]
      </p>

      <h2>8. Modification des CGU</h2>
      <p>L'éditeur peut faire évoluer les présentes CGU ; les utilisateurs sont informés de toute modification substantielle.</p>

      <h2>9. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au <strong>droit français</strong>. En cas de litige, et à défaut de résolution
        amiable, les tribunaux compétents seront ceux du ressort du siège de l'éditeur, sous réserve des règles d'ordre
        public applicables.
      </p>

      <p className="!mt-6 !text-xs">
        <em>Des Conditions Générales de Vente (CGV) distinctes seront ajoutées lors de la mise en place d'un abonnement payant.</em>
      </p>
    </LegalLayout>
  );
}
