import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Conditions Générales de Vente — BEMEXO',
  description: "Conditions Générales de Vente de BEMEXO, service édité par K.HABITAT (SAS) : abonnement SaaS B2B, essai gratuit 30 jours, sans engagement.",
};

// Page légale autonome, identité noir + jaune de la landing (même charte que
// mentions-legales / confidentialite). Contenu générique B2B SaaS — À FAIRE
// VALIDER PAR UN CONSEIL JURIDIQUE avant mise en production commerciale.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.ml{font-family:'Archivo',sans-serif;background:#15120F;color:#c9c3b8;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.ml *{box-sizing:border-box;margin:0;padding:0}
.ml ::selection{background:#FFC21A;color:#15120F}
.ml a{color:#FFC21A;text-decoration:none;border-bottom:1px solid rgba(255,194,26,.4)}
.ml a:hover{border-bottom-color:#FFC21A}
.ml-hazard{height:12px;background:repeating-linear-gradient(45deg,#15120F 0 9px,#FFC21A 9px 18px)}
.ml-header{position:sticky;top:0;z-index:20;background:rgba(21,18,15,.88);backdrop-filter:blur(10px);border-bottom:1px solid rgba(242,237,227,.1)}
.ml-header-in{max-width:820px;margin:0 auto;padding:15px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.ml-brand{display:flex;align-items:center;gap:10px;border-bottom:none !important}
.ml-logo{width:30px;height:30px;background:#FFC21A;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none}
.ml-logo i{width:13px;height:13px;border:2.5px solid #15120F;border-radius:50%;border-top-color:transparent;transform:rotate(45deg);display:block}
.ml-brand span{font-weight:900;font-size:18px;color:#F2EDE3;letter-spacing:-.02em}
.ml-back{font-size:14px;font-weight:700;color:#F2EDE3 !important;border-bottom:none !important;white-space:nowrap}
.ml-main{max-width:820px;margin:0 auto;padding:44px 24px 80px}
.ml h1{font-size:40px;font-weight:900;letter-spacing:-.025em;color:#F2EDE3;line-height:1.04}
.ml-updated{font-family:'JetBrains Mono',monospace;font-size:12px;color:#9a948a;margin-top:11px;text-transform:uppercase;letter-spacing:.08em}
.ml h2{font-size:20px;font-weight:800;color:#FFC21A;margin:34px 0 8px;letter-spacing:-.01em}
.ml p{font-size:15.5px;line-height:1.6;margin-top:10px;color:#c9c3b8}
.ml strong{color:#F2EDE3;font-weight:700}
.ml ul{margin:12px 0 0;list-style:none;display:flex;flex-direction:column;gap:11px}
.ml li{font-size:15px;line-height:1.55;color:#c9c3b8;padding-left:20px;position:relative}
.ml li:before{content:"";position:absolute;left:0;top:9px;width:7px;height:7px;background:#FFC21A;border-radius:2px}
.ml-foot{border-top:1px solid rgba(242,237,227,.1);margin-top:46px;padding-top:22px;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#6E6A63}
@media(max-width:560px){ .ml h1{font-size:32px} .ml-main{padding:32px 20px 64px} }
`;

export default function CGVPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="ml">
        <div className="ml-hazard" />
        <header className="ml-header">
          <div className="ml-header-in">
            <Link href="/landing" className="ml-brand">
              <span className="ml-logo"><i /></span>
              <span>BEMEXO</span>
            </Link>
            <Link href="/landing" className="ml-back">← Retour</Link>
          </div>
        </header>

        <main className="ml-main">
          <h1>Conditions Générales de Vente</h1>
          <div className="ml-updated">Dernière mise à jour : 12 juillet 2026</div>

          <h2>1. Objet</h2>
          <p>
            Les présentes Conditions Générales de Vente (« CGV ») régissent la souscription et l&apos;utilisation
            payante du service <strong>BEMEXO</strong>, application en ligne (SaaS) de gestion des feuilles
            d&apos;heures, du pointage, du suivi de chantier et de l&apos;export paie destinée aux entreprises du
            bâtiment et des travaux publics. Toute souscription implique l&apos;acceptation sans réserve des présentes CGV.
          </p>

          <h2>2. Prestataire</h2>
          <p>
            Le service est édité et commercialisé par <strong>K.HABITAT</strong>, société par actions simplifiée (SAS)
            au capital de 10&nbsp;000&nbsp;€, immatriculée sous le <strong>SIRET 840&nbsp;185&nbsp;607&nbsp;00024</strong>{' '}
            (RCS Bourg-en-Bresse 840&nbsp;185&nbsp;607), dont le siège est situé <strong>1100 chemin de Champagne,
            01440 Viriat</strong> — TVA intracommunautaire FR96&nbsp;840&nbsp;185&nbsp;607 (ci-après « le Prestataire »).
          </p>

          <h2>3. Clientèle — service entre professionnels</h2>
          <p>
            BEMEXO est un service <strong>strictement professionnel (B2B)</strong>. En souscrivant, le client déclare
            agir pour les besoins de son activité professionnelle. Les présentes CGV s&apos;appliquent à l&apos;exclusion
            de toute condition d&apos;achat du client.
          </p>

          <h2>4. Compte et inscription</h2>
          <p>
            L&apos;accès au service suppose la création d&apos;un compte administrateur pour l&apos;entreprise. Le client
            garantit l&apos;exactitude des informations fournies et est responsable de la confidentialité de ses
            identifiants ainsi que de l&apos;activité réalisée depuis son compte.
          </p>

          <h2>5. Essai gratuit</h2>
          <p>
            Le service est proposé avec une période d&apos;<strong>essai gratuit de 30 jours</strong>, sans carte
            bancaire et sans engagement. À l&apos;issue de l&apos;essai, la poursuite de l&apos;utilisation nécessite la
            souscription d&apos;un abonnement payant. En l&apos;absence de souscription, l&apos;accès aux fonctionnalités
            peut être suspendu.
          </p>

          <h2>6. Formules et prix</h2>
          <p>
            L&apos;abonnement est proposé selon la taille de l&apos;équipe, aux tarifs mensuels <strong>hors taxes
            (HT)</strong> suivants :
          </p>
          <ul>
            <li><strong>Petite équipe</strong> (1 à 15 salariés) — 49&nbsp;€ HT / mois.</li>
            <li><strong>Équipe moyenne</strong> (16 à 30 salariés) — 89&nbsp;€ HT / mois.</li>
            <li><strong>Grande équipe</strong> (31 salariés et plus) — 149&nbsp;€ HT / mois.</li>
          </ul>
          <p>
            La TVA au taux en vigueur s&apos;ajoute au prix HT. Le Prestataire se réserve le droit de faire évoluer ses
            tarifs ; toute modification est notifiée au client et s&apos;applique à compter de la période de facturation
            suivante.
          </p>

          <h2>7. Commande et paiement</h2>
          <p>
            Le paiement s&apos;effectue par carte bancaire via le prestataire de paiement sécurisé <strong>Stripe</strong>.
            L&apos;abonnement donne lieu à un <strong>prélèvement mensuel automatique</strong>. Le paiement vaut
            acceptation des présentes CGV. Aucune donnée de carte bancaire n&apos;est stockée par le Prestataire.
          </p>

          <h2>8. Durée, reconduction, sans engagement</h2>
          <p>
            L&apos;abonnement est conclu <strong>pour une durée d&apos;un mois, reconduit tacitement</strong> à chaque
            échéance, <strong>sans engagement de durée</strong>. Le client peut y mettre fin à tout moment.
          </p>

          <h2>9. Résiliation</h2>
          <p>
            Le client peut résilier son abonnement à tout moment depuis son espace ou par courriel. La résiliation prend
            effet <strong>à la fin de la période mensuelle en cours</strong> ; l&apos;accès reste ouvert jusqu&apos;à
            cette échéance. Les sommes correspondant à une période déjà entamée ne donnent pas lieu à remboursement.
          </p>

          <h2>10. Droit de rétractation</h2>
          <p>
            Le service étant fourni à des professionnels agissant dans le cadre de leur activité, le droit de
            rétractation de 14 jours prévu pour les consommateurs ne s&apos;applique pas. La période d&apos;essai gratuit
            de 30 jours tient lieu de phase d&apos;évaluation.
          </p>

          <h2>11. Disponibilité et maintenance</h2>
          <p>
            Le Prestataire met en œuvre les moyens raisonnables pour assurer la disponibilité du service. Il peut être
            interrompu ponctuellement pour maintenance ou pour des raisons techniques indépendantes de sa volonté, sans
            que cela ouvre droit à indemnité.
          </p>

          <h2>12. Responsabilité</h2>
          <p>
            BEMEXO est un outil d&apos;aide à la gestion. Le client demeure seul responsable de l&apos;exactitude des
            données saisies, de leur exploitation et de la conformité de ses obligations sociales et de paie. La
            responsabilité du Prestataire est limitée aux dommages directs et prouvés, dans la limite des sommes versées
            au titre de l&apos;abonnement sur les douze derniers mois.
          </p>

          <h2>13. Données personnelles</h2>
          <p>
            Le traitement des données personnelles est décrit dans la <Link href="/confidentialite">politique de
            confidentialité</Link>, conforme au RGPD. Les données sont hébergées dans l&apos;Union européenne.
          </p>

          <h2>14. Propriété intellectuelle</h2>
          <p>
            Le service, son code, son interface et ses contenus demeurent la propriété exclusive du Prestataire.
            L&apos;abonnement confère un droit d&apos;usage personnel, non exclusif et non cessible, pour la durée de
            l&apos;abonnement.
          </p>

          <h2>15. Modification des CGV</h2>
          <p>
            Le Prestataire peut modifier les présentes CGV. La version applicable est celle en vigueur à la date de la
            commande ou de son renouvellement.
          </p>

          <h2>16. Droit applicable et litiges</h2>
          <p>
            Les présentes CGV sont soumises au <strong>droit français</strong>. À défaut de résolution amiable, tout
            litige relève de la compétence des tribunaux du ressort du siège du Prestataire. Contact :{' '}
            <a href="mailto:contact@bemexo.com">contact@bemexo.com</a>.
          </p>

          <div className="ml-foot">© 2026 BEMEXO — K.HABITAT (SAS)</div>
        </main>
      </div>
    </>
  );
}
