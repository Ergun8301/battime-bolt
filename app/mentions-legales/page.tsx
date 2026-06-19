import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mentions légales — Battime',
  description: 'Mentions légales de Battime, édité par K.HABITAT (SAS).',
};

// Page légale autonome, dans l'identité noir + jaune chantier de la landing
// (indépendante du LegalLayout bleu/gris de l'app). Contenu K.HABITAT.
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

export default function MentionsLegalesPage() {
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
          <h1>Mentions légales</h1>
          <div className="ml-updated">Dernière mise à jour : 17 juin 2026</div>

          <h2>1. Éditeur du site et de l&apos;application</h2>
          <p>
            L&apos;application <strong>Battime</strong> est éditée par <strong>K.HABITAT</strong>, société par
            actions simplifiée (SAS) au capital de 10&nbsp;000&nbsp;€, immatriculée sous le numéro{' '}
            <strong>SIRET 840&nbsp;185&nbsp;607&nbsp;00024</strong> (RCS Bourg-en-Bresse 840&nbsp;185&nbsp;607),
            dont le siège est situé <strong>1100 chemin de Champagne, 01440 Viriat</strong>.
          </p>
          <p>
            Numéro de TVA intracommunautaire : FR96&nbsp;840&nbsp;185&nbsp;607.<br />
            Contact : <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>.
          </p>
          <p>Directeur de la publication : <strong>Ergun Kilic</strong>.</p>

          <h2>2. Hébergement</h2>
          <p>L&apos;application et les données sont hébergées par :</p>
          <ul>
            <li>
              <strong>Netlify, Inc.</strong> (interface web) — 512 2nd Street, Suite 200, San Francisco, CA 94107,
              États-Unis — <a href="https://www.netlify.com" target="_blank" rel="noreferrer">netlify.com</a>.
            </li>
            <li>
              <strong>Supabase</strong> (base de données et authentification) — données hébergées dans
              l&apos;<strong>Union européenne</strong> (région Paris, France) —{' '}
              <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.
            </li>
          </ul>

          <h2>3. Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble des éléments de Battime (code, interface, marques, logos, contenus) est protégé par le
            droit de la propriété intellectuelle et demeure la propriété exclusive de l&apos;éditeur, sauf mentions
            contraires. Toute reproduction ou réutilisation sans autorisation est interdite.
          </p>

          <h2>4. Données personnelles</h2>
          <p>
            Battime traite des données personnelles dans le cadre de son service (gestion des feuilles d&apos;heures
            pour le BTP). Vous disposez de droits sur vos données — accès, rectification, effacement, opposition —
            que vous pouvez exercer en écrivant à{' '}
            <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>. Une politique de
            confidentialité détaillée est mise à disposition par l&apos;éditeur.
          </p>

          <h2>5. Contact</h2>
          <p>
            Pour toute question relative au site ou à l&apos;application :{' '}
            <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>.
          </p>

          <div className="ml-foot">© 2026 Battime — K.HABITAT (SAS)</div>
        </main>
      </div>
    </>
  );
}
