import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Battime',
  description: 'Politique de confidentialité de Battime, édité par K.HABITAT (SAS) — conforme au RGPD.',
};

// Page légale autonome, dans l'identité noir + jaune chantier de la landing.
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
.ml-intro{font-size:16px;line-height:1.6;margin-top:22px;color:#c9c3b8}
.ml h2{font-size:20px;font-weight:800;color:#FFC21A;margin:34px 0 8px;letter-spacing:-.01em}
.ml p{font-size:15.5px;line-height:1.6;margin-top:10px;color:#c9c3b8}
.ml strong{color:#F2EDE3;font-weight:700}
.ml ul{margin:12px 0 0;list-style:none;display:flex;flex-direction:column;gap:11px}
.ml li{font-size:15px;line-height:1.55;color:#c9c3b8;padding-left:20px;position:relative}
.ml li:before{content:"";position:absolute;left:0;top:9px;width:7px;height:7px;background:#FFC21A;border-radius:2px}
.ml-foot{border-top:1px solid rgba(242,237,227,.1);margin-top:46px;padding-top:22px;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#6E6A63}
@media(max-width:560px){ .ml h1{font-size:30px} .ml-main{padding:32px 20px 64px} }
`;

export default function ConfidentialitePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="ml">
        <div className="ml-hazard" />
        <header className="ml-header">
          <div className="ml-header-in">
            <Link href="/landing" className="ml-brand">
              <span className="ml-logo"><i /></span>
              <span>Battime</span>
            </Link>
            <Link href="/landing" className="ml-back">← Retour</Link>
          </div>
        </header>

        <main className="ml-main">
          <h1>Politique de confidentialité</h1>
          <div className="ml-updated">Dernière mise à jour : 17 juin 2026</div>

          <p className="ml-intro">
            La présente politique explique comment Battime traite les données personnelles dans le cadre de son service
            de gestion des feuilles d&apos;heures pour le BTP. Elle est rédigée conformément au Règlement (UE) 2016/679
            (RGPD) et à la loi « Informatique et Libertés ».
          </p>

          <h2>1. Qui est responsable des données ?</h2>
          <p>
            Battime est un outil utilisé par des entreprises (l&apos;« <strong>entreprise cliente</strong> »), qui y
            gèrent les données de leurs salariés.
          </p>
          <ul>
            <li>
              Pour les données des <strong>salariés</strong> saisies via Battime (identité, heures, etc.),
              l&apos;<strong>entreprise cliente est responsable de traitement</strong> ;{' '}
              <strong>Battime agit comme sous-traitant</strong> (au sens de l&apos;article 28 du RGPD), pour le compte
              et sur instruction de l&apos;entreprise cliente.
            </li>
            <li>
              Pour les données du <strong>compte de l&apos;entreprise cliente</strong> elle-même (création de compte,
              facturation), Battime (édité par K.HABITAT) est responsable de traitement.
            </li>
          </ul>

          <h2>2. Quelles données sont traitées ?</h2>
          <ul>
            <li><strong>Identité et contact</strong> : nom, prénom, adresse e-mail, téléphone.</li>
            <li><strong>Données de connexion</strong> : e-mail et mot de passe (chiffré), journaux techniques.</li>
            <li>
              <strong>Données de paie — facultatives</strong> : numéro de sécurité sociale (NIR), date d&apos;embauche,
              type de contrat. Ces champs ne sont renseignés que si l&apos;employeur le souhaite, pour ses obligations
              de paie.
            </li>
            <li><strong>Données d&apos;activité</strong> : heures déclarées, interventions, plannings, chantiers / clients.</li>
          </ul>
          <p>Aucune donnée n&apos;est collectée à des fins publicitaires. Aucune revente de données n&apos;est effectuée.</p>

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
            sociales</strong> est expressément autorisée. Dans Battime, il est <strong>facultatif</strong> et{' '}
            <strong>accessible uniquement à l&apos;employeur</strong> (secrétaire / administrateur) ; il n&apos;est
            jamais visible par les autres salariés.
          </p>

          <h2>5. Qui a accès aux données ?</h2>
          <ul>
            <li>L&apos;<strong>entreprise cliente</strong> (employeur), strictement pour ses propres salariés.</li>
            <li>Les <strong>sous-traitants techniques</strong> de Battime : Netlify (hébergement de l&apos;interface) et Supabase (base de données / authentification).</li>
            <li>Le cas échéant, les autorités si la loi l&apos;exige.</li>
          </ul>

          <h2>6. Hébergement et localisation</h2>
          <p>
            Les données sont stockées dans l&apos;<strong>Union européenne</strong> (Supabase, région Paris).
            L&apos;interface est distribuée via Netlify, ce qui peut impliquer des transferts hors UE encadrés par des
            garanties appropriées (clauses contractuelles types de la Commission européenne).
          </p>

          <h2>7. Durée de conservation</h2>
          <p>
            Les données sont conservées pendant la durée de la relation contractuelle, puis archivées ou supprimées
            selon les durées légales applicables. Les éléments liés à la paie sont conservés conformément aux
            obligations légales en vigueur ; la durée précise applicable est déterminée par l&apos;employeur,
            responsable de traitement.
          </p>

          <h2>8. Sécurité</h2>
          <ul>
            <li>Chiffrement des communications (HTTPS / TLS) et des données au repos.</li>
            <li><strong>Cloisonnement par entreprise et par rôle</strong> (politiques d&apos;accès au niveau base de données).</li>
            <li>Mots de passe stockés sous forme chiffrée (hachée).</li>
            <li>Accès limité au strict nécessaire.</li>
          </ul>

          <h2>9. Vos droits</h2>
          <p>
            Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition
            et de portabilité. Pour les données traitées par votre employeur, adressez-vous à lui ; pour les autres,
            contactez Battime à <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>. Vous pouvez
            également introduire une réclamation auprès de la <strong>CNIL</strong>{' '}
            (<a href="https://www.cnil.fr" target="_blank" rel="noreferrer">cnil.fr</a>).
          </p>

          <h2>10. Cookies</h2>
          <p>
            Battime n&apos;utilise que des cookies <strong>strictement nécessaires</strong> au fonctionnement
            (authentification / session). Aucun cookie publicitaire ou de traçage tiers n&apos;est utilisé ; aucun
            bandeau de consentement n&apos;est donc requis pour ces cookies essentiels.
          </p>

          <h2>11. Contact</h2>
          <p>
            Pour toute question sur cette politique :{' '}
            <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>.
          </p>

          <div className="ml-foot">© 2026 Battime — K.HABITAT (SAS)</div>
        </main>
      </div>
    </>
  );
}
