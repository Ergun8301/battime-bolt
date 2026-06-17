import LegalLayout from '@/components/legal-layout';

export const metadata = { title: 'Mentions légales — Battime' };

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" updated="17 juin 2026">
      <h2>1. Éditeur du site et de l'application</h2>
      <p>
        L'application <strong>Battime</strong> est éditée par <strong>K.HABITAT</strong>, société par actions
        simplifiée (SAS) au capital de 10&nbsp;000&nbsp;€, immatriculée sous le numéro{' '}
        <strong>SIRET 840&nbsp;185&nbsp;607&nbsp;00024</strong> (RCS Bourg-en-Bresse 840&nbsp;185&nbsp;607), dont le
        siège est situé <strong>1100 chemin de Champagne, 01440 Viriat</strong>.
      </p>
      <p>
        Numéro de TVA intracommunautaire : FR96&nbsp;840&nbsp;185&nbsp;607.<br />
        Contact : <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>.
      </p>
      <p>Directeur de la publication : <strong>Ergun Kilic</strong>.</p>

      <h2>2. Hébergement</h2>
      <p>L'application et les données sont hébergées par :</p>
      <ul>
        <li>
          <strong>Netlify, Inc.</strong> (interface web) — 512 2nd Street, Suite 200, San Francisco, CA 94107,
          États-Unis — <a href="https://www.netlify.com" target="_blank" rel="noreferrer">netlify.com</a>.
        </li>
        <li>
          <strong>Supabase</strong> (base de données et authentification) — données hébergées sur une
          infrastructure située dans l'<strong>Union européenne</strong> (région Paris, France) —
          <a href="https://supabase.com" target="_blank" rel="noreferrer"> supabase.com</a>.
        </li>
      </ul>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments de Battime (code, interface, marques, logos, contenus) est protégé par le droit de la
        propriété intellectuelle et demeure la propriété exclusive de l'éditeur, sauf mentions contraires. Toute
        reproduction ou réutilisation sans autorisation est interdite.
      </p>

      <h2>4. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans notre{' '}
        <a href="/confidentialite">Politique de confidentialité</a>. Vous disposez de droits sur vos données
        (accès, rectification, effacement…) que vous pouvez exercer comme indiqué dans cette politique.
      </p>

      <h2>5. Contact</h2>
      <p>Pour toute question relative au site ou à l'application : <a href="mailto:khabitatcontact@gmail.com">khabitatcontact@gmail.com</a>.</p>
    </LegalLayout>
  );
}
