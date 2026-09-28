import type { Metadata } from 'next';
import { WEB_HOST } from '@/lib/hosting';
import Link from 'next/link';
import VitrineFonts from '@/components/vitrine-fonts';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — BEMEXO',
  description: 'Politique de confidentialité de BEMEXO, édité par K.HABITAT (SAS) — conforme au RGPD.',
  alternates: { canonical: 'https://bemexo.com/confidentialite' },
};

// Page légale autonome, dans l'identité noir + jaune chantier de la landing.
const STYLES = `
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
.ml-foot button{background:none;border:0;padding:0;font:inherit;color:#9a948a;cursor:pointer;text-decoration:underline}
@media(max-width:560px){ .ml h1{font-size:30px} .ml-main{padding:32px 20px 64px} }
`;

export default function ConfidentialitePage() {
  return (
    <>
      <VitrineFonts />
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
          <h1>Politique de confidentialité</h1>
          <div className="ml-updated">Dernière mise à jour : 28 septembre 2026</div>

          <p className="ml-intro">
            La présente politique explique comment BEMEXO traite les données personnelles dans le cadre de son service
            de gestion des feuilles d&apos;heures pour le BTP. Elle est rédigée conformément au Règlement (UE) 2016/679
            (RGPD) et à la loi « Informatique et Libertés ».
          </p>

          <h2>1. Qui est responsable des données ?</h2>
          <p>
            BEMEXO est un outil utilisé par des entreprises (l&apos;« <strong>entreprise cliente</strong> »), qui y
            gèrent les données de leurs salariés.
          </p>
          <ul>
            <li>
              Pour les données des <strong>salariés</strong> saisies via BEMEXO (identité, heures, etc.),
              l&apos;<strong>entreprise cliente est responsable de traitement</strong> ;{' '}
              <strong>BEMEXO agit comme sous-traitant</strong> (au sens de l&apos;article 28 du RGPD), pour le compte
              et sur instruction de l&apos;entreprise cliente.
            </li>
            <li>
              Pour les données du <strong>compte de l&apos;entreprise cliente</strong> elle-même (création de compte,
              facturation), BEMEXO (édité par K.HABITAT) est responsable de traitement.
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
            sociales</strong> est expressément autorisée. Dans BEMEXO, il est <strong>facultatif</strong> et{' '}
            <strong>accessible uniquement à l&apos;employeur</strong> (secrétaire / administrateur) ; il n&apos;est
            jamais visible par les autres salariés.
          </p>

          {/* L'ENDROIT DU POINTAGE — ÉTAPE 28.
              Ce bloc est le détail que l'écran de pointage ne porte plus : là-bas
              une phrase, ici tout. Il est écrit pour être lu par un salarié qui
              se demande ce qu'on sait de lui, pas par un juriste — d'où les
              sous-titres en question. */}
          {/* `id` LU PAR LE LIEN DE L'ÉCRAN DE POINTAGE (`live-timer.tsx`).
              Le renommer casserait ce lien sans rien signaler : il tomberait
              en haut de la page, et le salarié devrait chercher. */}
          <h2 id="endroit">5. L&apos;endroit, quand votre entreprise l&apos;a activé</h2>
          <p>
            Cette fonction est <strong>désactivée par défaut</strong>. Votre employeur peut l&apos;activer ; tant
            qu&apos;il ne l&apos;a pas fait, <strong>aucune position n&apos;est enregistrée</strong>, et rien de
            ce paragraphe ne s&apos;applique à vous.
          </p>
          <p><strong>Ce qui est enregistré, et quand.</strong></p>
          <ul>
            <li>
              <strong>Deux points par pointage en direct</strong> : au moment où vous le démarrez, et au moment où
              vous le fermez. <strong>Rien entre les deux</strong>, rien quand l&apos;application est fermée, rien
              quand vous ne pointez pas. Cinq pointages dans la journée donnent donc cinq départs et cinq fermetures,
              pas un suivi continu.
            </li>
            <li>
              Les coordonnées, et la <strong>précision annoncée par votre téléphone</strong> — souvent quelques
              mètres dehors, mais couramment un à trois kilomètres à l&apos;intérieur d&apos;un bâtiment. Cette
              précision est toujours affichée à côté du point, parce qu&apos;un point imprécis ne prouve rien.
            </li>
            <li>
              <strong>Rien du tout si vous refusez</strong> l&apos;autorisation que demande votre téléphone, ou si
              celui-ci ne trouve pas la position. Votre pointage fonctionne à l&apos;identique, vos heures et votre
              paie ne changent pas. Une journée saisie à la main n&apos;a jamais de position.
            </li>
            <li>
              Un pointage oublié et fermé <strong>plus de quatorze heures</strong> après son début
              n&apos;enregistre <strong>pas</strong> de point de fermeture : c&apos;est ce qui évite d&apos;enregistrer
              votre domicile au lieu d&apos;un chantier.
            </li>
          </ul>
          <p>
            <strong>Pourquoi.</strong> Pour pouvoir répondre à un <strong>client qui conteste une facture</strong> :
            montrer que quelqu&apos;un était bien sur le chantier à telle heure. <strong>Ce n&apos;est pas un moyen
            de contrôler vos heures de travail</strong>, et ce n&apos;est utilisé ni pour vérifier ni pour contester
            ce que vous déclarez. Base légale : l&apos;<strong>intérêt légitime</strong> de l&apos;entreprise
            (article 6.1.f du RGPD).
          </p>
          <p>
            <strong>Qui les voit.</strong> Uniquement <strong>votre employeur</strong> (secrétaire / administrateur)
            et <strong>vous-même</strong> : chaque position est affichée sur votre propre journée, à côté des heures
            concernées. <strong>Votre chef d&apos;équipe ne les voit pas</strong>, même pour les personnes de son
            chantier. Personne ne peut les modifier ni les effacer à la main, pas même l&apos;employeur.
          </p>
          <p>
            <strong>Combien de temps.</strong> <strong>Douze mois</strong>, puis suppression automatique. Ce délai
            correspond au temps pendant lequel une facture peut être discutée ; il ne sert pas à constituer un
            historique de déplacements.
          </p>

          <h2>6. Qui a accès aux données ?</h2>
          <ul>
            <li>L&apos;<strong>entreprise cliente</strong> (employeur), strictement pour ses propres salariés.</li>
            <li>Les <strong>sous-traitants techniques</strong> de BEMEXO : {WEB_HOST.name} (hébergement de l&apos;interface) et Supabase (base de données / authentification) ; pour la mesure d&apos;audience et la mesure des conversions publicitaires du site, Google (uniquement avec votre accord, voir sections 11 et 12) et Cloudflare (statistiques sans cookie).</li>
            <li>Le cas échéant, les autorités si la loi l&apos;exige.</li>
          </ul>

          <h2>7. Hébergement et localisation</h2>
          <p>
            Les données sont stockées dans l&apos;<strong>Union européenne</strong> (Supabase, région Paris).
            L&apos;interface est distribuée via {WEB_HOST.name}, ce qui peut impliquer des transferts hors UE encadrés par des
            garanties appropriées (clauses contractuelles types de la Commission européenne).
          </p>

          <h2>8. Durée de conservation</h2>
          <p>
            Les données sont conservées pendant la durée de la relation contractuelle, puis archivées ou supprimées
            selon les durées légales applicables. Les éléments liés à la paie sont conservés conformément aux
            obligations légales en vigueur ; la durée précise applicable est déterminée par l&apos;employeur,
            responsable de traitement.
          </p>

          <h2>9. Sécurité</h2>
          <ul>
            <li>Chiffrement des communications (HTTPS / TLS) et des données au repos.</li>
            <li><strong>Cloisonnement par entreprise et par rôle</strong> (politiques d&apos;accès au niveau base de données).</li>
            <li>Mots de passe stockés sous forme chiffrée (hachée).</li>
            <li>Accès limité au strict nécessaire.</li>
          </ul>

          <h2>10. Vos droits</h2>
          <p>
            Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition
            et de portabilité. Pour les données traitées par votre employeur, adressez-vous à lui ; pour les autres,
            contactez BEMEXO à <a href="mailto:contact@bemexo.com">contact@bemexo.com</a>. Vous pouvez
            également introduire une réclamation auprès de la <strong>CNIL</strong>{' '}
            (<a href="https://www.cnil.fr" target="_blank" rel="noreferrer">cnil.fr</a>).
          </p>

          <h2 id="audience">11. Mesure d&apos;audience (Google Analytics 4)</h2>
          <p>
            Sur le site bemexo.com, nous utilisons <strong>Google Analytics 4</strong> pour mesurer la fréquentation
            du site et l&apos;efficacité de nos campagnes publicitaires (pages vues, provenance des visites, type
            d&apos;appareil et de navigateur).
          </p>
          <ul>
            <li><strong>Consentement</strong> : Google Analytics n&apos;est chargé qu&apos;après votre accord, donné
              dans le bandeau cookies (« Tout accepter » ou catégorie « Mesure d&apos;audience »). Sans accord, aucun
              script Google n&apos;est chargé et aucun cookie Google n&apos;est déposé. Base légale : votre consentement
              (art. 6.1.a du RGPD et art. 82 de la loi « Informatique et Libertés »).</li>
            <li><strong>Cookies</strong> : <strong>_ga</strong> et <strong>_ga_C76Q47N9KN</strong>, conservés
              <strong> 13 mois</strong> au maximum.</li>
            <li><strong>Destinataire</strong> : Google Ireland Limited. Des données peuvent être transférées à Google
              LLC (États-Unis), transfert encadré par le cadre de protection des données UE–États-Unis (Data Privacy
              Framework).</li>
            <li><strong>Retrait</strong> : vous pouvez retirer votre accord à tout moment via le lien{' '}
              <strong>« Gérer les cookies »</strong> en bas de page. Les cookies _ga et _ga_* sont alors supprimés.</li>
          </ul>
          <p>
            Nous utilisons aussi <strong>Cloudflare Web Analytics</strong>, qui compte les visites de façon agrégée,
            <strong> sans cookie</strong> ni stockage sur votre appareil ; il ne nécessite donc pas de consentement.
          </p>

          <h2 id="publicite">12. Publicité (Google Ads — mesure des conversions)</h2>
          <p>
            Nous diffusons des annonces <strong>Google Ads</strong>. Si vous l&apos;acceptez, nous mesurons si une
            visite venue de l&apos;une de nos annonces aboutit à une action sur le site (clic sur « Essayer
            gratuitement », création d&apos;un compte d&apos;essai). Cette mesure ne contient ni votre nom, ni votre
            e-mail, ni votre téléphone.
          </p>
          <ul>
            <li><strong>Consentement</strong> : catégorie « Publicité » du bandeau cookies, <strong>décochée par
              défaut</strong> (ou « Tout accepter »). Sans cet accord, les signaux publicitaires de Google
              (ad_storage, ad_user_data, ad_personalization) restent refusés et aucun cookie publicitaire n&apos;est
              déposé. Base légale : votre consentement (art. 6.1.a du RGPD et art. 82 de la loi « Informatique et
              Libertés »).</li>
            <li><strong>Cookie</strong> : <strong>_gcl_au</strong> (Google Ads, mesure des conversions), conservé
              <strong> 90 jours</strong>.</li>
            <li><strong>Destinataire</strong> : Google Ireland Limited, avec les mêmes garanties de transfert que
              ci-dessus (Data Privacy Framework).</li>
            <li><strong>Retrait</strong> : à tout moment via le lien <strong>« Gérer les cookies »</strong> en bas de
              page. Le cookie _gcl_au est alors supprimé et les signaux publicitaires repassent à « refusé ».</li>
          </ul>

          <h2 id="cookies">13. Cookies et stockage local</h2>
          <p>Liste complète de ce qui est déposé sur votre appareil :</p>
          <ul>
            <li><strong>cc_cookie</strong> — mémorise votre choix dans le bandeau cookies. Nécessaire. Durée :
              6 mois.</li>
            <li><strong>_ga</strong> — Google Analytics 4, distingue les visiteurs. Uniquement avec votre accord.
              Durée : 13 mois.</li>
            <li><strong>_ga_C76Q47N9KN</strong> — Google Analytics 4, conserve l&apos;état de la visite. Uniquement
              avec votre accord. Durée : 13 mois.</li>
            <li><strong>_gcl_au</strong> — Google Ads, mesure des conversions publicitaires. Uniquement avec votre
              accord (catégorie « Publicité »). Durée : 90 jours.</li>
            <li><strong>Stockage local de l&apos;application</strong> (utilisateurs connectés uniquement) — nécessaire
              au fonctionnement : session de connexion (<strong>sb-…-auth-token</strong>, jusqu&apos;à la
              déconnexion), heures saisies hors réseau en attente d&apos;envoi (<strong>battime_offline_…</strong>,
              jusqu&apos;à leur envoi) et préférence d&apos;affichage du tableau de bord
              (<strong>bemexo_admin_coach</strong>).</li>
          </ul>
          <p>
            Aucun autre cookie publicitaire ou de traçage n&apos;est utilisé.
          </p>

          <h2>14. Contact</h2>
          <p>
            Pour toute question sur cette politique :{' '}
            <a href="mailto:contact@bemexo.com">contact@bemexo.com</a>.
          </p>

          <div className="ml-foot">© 2026 BEMEXO — K.HABITAT (SAS) · <button type="button" data-bx-cookies="">Gérer les cookies</button></div>
        </main>
      </div>
    </>
  );
}
