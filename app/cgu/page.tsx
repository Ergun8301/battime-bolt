import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — BEMEXO",
  description: "Conditions Générales d'Utilisation de BEMEXO, service édité par K.HABITAT (SAS) : règles d'accès et d'usage de l'application.",
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

export default function CGUPage() {
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
          <h1>Conditions Générales d&apos;Utilisation</h1>
          <div className="ml-updated">Dernière mise à jour : 12 juillet 2026</div>

          <h2>1. Objet</h2>
          <p>
            Les présentes Conditions Générales d&apos;Utilisation (« CGU ») définissent les modalités d&apos;accès et
            d&apos;usage de l&apos;application <strong>BEMEXO</strong>, service en ligne de gestion des feuilles
            d&apos;heures, du pointage et du suivi de chantier pour les entreprises du bâtiment. Elles s&apos;appliquent à
            tout utilisateur du service (administrateur comme salarié).
          </p>

          <h2>2. Éditeur</h2>
          <p>
            BEMEXO est édité par <strong>K.HABITAT</strong> (SAS), SIRET 840&nbsp;185&nbsp;607&nbsp;00024, siège
            1100 chemin de Champagne, 01440 Viriat. Les conditions de vente de l&apos;abonnement font l&apos;objet de{' '}
            <Link href="/cgv">Conditions Générales de Vente</Link> distinctes.
          </p>

          <h2>3. Acceptation</h2>
          <p>
            L&apos;utilisation du service vaut acceptation pleine et entière des présentes CGU. Si l&apos;utilisateur
            n&apos;accepte pas ces conditions, il lui appartient de ne pas utiliser le service.
          </p>

          <h2>4. Accès au service et comptes</h2>
          <p>
            L&apos;accès nécessite un compte. Deux rôles coexistent : l&apos;<strong>administrateur</strong> (chef
            d&apos;entreprise ou secrétariat), qui gère l&apos;équipe, le planning et les exports, et le{' '}
            <strong>salarié</strong>, qui pointe ses heures depuis le terrain. Chaque utilisateur est responsable de
            l&apos;usage de son compte.
          </p>

          <h2>5. Identifiants et sécurité</h2>
          <p>
            Les identifiants sont personnels et confidentiels. L&apos;utilisateur s&apos;engage à les protéger et à
            signaler sans délai tout usage non autorisé. Le Prestataire ne saurait être tenu responsable des
            conséquences d&apos;une divulgation, volontaire ou non, des identifiants par l&apos;utilisateur.
          </p>

          <h2>6. Utilisation conforme</h2>
          <p>L&apos;utilisateur s&apos;interdit notamment de :</p>
          <ul>
            <li>utiliser le service à des fins illicites ou frauduleuses ;</li>
            <li>tenter d&apos;accéder à des données ou espaces qui ne lui sont pas destinés ;</li>
            <li>perturber, surcharger ou compromettre le fonctionnement ou la sécurité du service ;</li>
            <li>copier, revendre ou détourner tout ou partie du service.</li>
          </ul>

          <h2>7. Disponibilité et maintenance</h2>
          <p>
            Le Prestataire met en œuvre les moyens raisonnables pour assurer un service disponible et sécurisé. Des
            interruptions peuvent survenir pour maintenance, mises à jour ou raisons techniques. Le service évolue et ses
            fonctionnalités peuvent être adaptées.
          </p>

          <h2>8. Données personnelles</h2>
          <p>
            Le traitement des données est décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>,
            conforme au RGPD. Les données sont hébergées dans l&apos;Union européenne. Chaque utilisateur dispose de
            droits d&apos;accès, de rectification et d&apos;effacement sur ses données.
          </p>

          <h2>9. Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des éléments du service (code, interface, marques, logos, contenus) est protégé et demeure la
            propriété exclusive de l&apos;éditeur. Aucun droit n&apos;est cédé à l&apos;utilisateur en dehors du simple
            droit d&apos;usage du service.
          </p>

          <h2>10. Responsabilité</h2>
          <p>
            BEMEXO est un outil d&apos;aide à la gestion : l&apos;utilisateur reste responsable de l&apos;exactitude des
            informations qu&apos;il saisit et de leur exploitation. Le Prestataire ne saurait être tenu responsable des
            dommages indirects résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser le service.
          </p>

          <h2>11. Suspension et résiliation</h2>
          <p>
            En cas de manquement aux présentes CGU, le Prestataire peut suspendre ou résilier l&apos;accès de
            l&apos;utilisateur concerné, sans préjudice des CGV applicables à l&apos;abonnement de l&apos;entreprise.
          </p>

          <h2>12. Modification des CGU</h2>
          <p>
            Les présentes CGU peuvent être modifiées à tout moment. La version applicable est celle en vigueur lors de
            l&apos;utilisation du service.
          </p>

          <h2>13. Droit applicable</h2>
          <p>
            Les présentes CGU sont soumises au <strong>droit français</strong>. Pour toute question :{' '}
            <a href="mailto:contact@bemexo.com">contact@bemexo.com</a>.
          </p>

          <div className="ml-foot">© 2026 BEMEXO — K.HABITAT (SAS)</div>
        </main>
      </div>
    </>
  );
}
