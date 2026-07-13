import Link from 'next/link';
import type { ReactNode } from 'react';

// Coquille de page de contenu SEO (charte BEMEXO : noir #15120F / jaune #FFC21A /
// crème #F2EDE3, Archivo + JetBrains Mono). Réutilisée par toutes les pages
// /fonctionnalites/* et /suisse/*. Purement additif : aucune logique produit.
//
// Chaque page fournit son en-tête (kicker/titre/chapeau) + son contenu via
// `children`, en utilisant les classes utilitaires .sp-* ci-dessous.

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.sp{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden;min-height:100vh}
.sp *{box-sizing:border-box;margin:0;padding:0}
.sp ::selection{background:#FFC21A;color:#15120F}
.sp a{color:inherit}
/* header */
.sp-head{position:sticky;top:0;z-index:40;background:rgba(242,237,227,.86);backdrop-filter:blur(10px);border-bottom:1px solid rgba(21,18,15,.12)}
.sp-head-in{max-width:1000px;margin:0 auto;padding:13px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.sp-brand{display:inline-flex;align-items:center;border-bottom:none}
.sp-brand img{height:27px;width:auto;display:block}
.sp-head-cta{display:inline-flex;align-items:center;gap:8px;background:#FFC21A;color:#15120F;font-weight:800;font-size:14px;padding:9px 16px;border-radius:9px;text-decoration:none;box-shadow:0 2px 0 #C99300;white-space:nowrap}
/* fil d'ariane */
.sp-crumb{max-width:820px;margin:0 auto;padding:22px 24px 0;font-family:'JetBrains Mono',monospace;font-size:12px;color:#8a8378;font-weight:600}
.sp-crumb a{text-decoration:none;border-bottom:1px solid rgba(21,18,15,.2)}
/* hero */
.sp-main{max-width:820px;margin:0 auto;padding:20px 24px 10px}
.sp-hero{padding-bottom:6px;border-bottom:1px solid rgba(21,18,15,.08)}
.sp-kicker{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin-bottom:16px}
.sp-h1{font-size:clamp(30px,5vw,46px);line-height:1.03;font-weight:900;letter-spacing:-.03em;text-wrap:balance;margin-bottom:18px}
.sp-h1 em{font-style:normal;color:#15120F;background:#FFC21A;padding:0 8px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.sp-lede{font-size:19px;line-height:1.55;color:#46413a;font-weight:500;max-width:62ch}
.sp-hero-cta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:28px 0 8px}
.sp-ybtn{display:inline-flex;align-items:center;gap:10px;background:#FFC21A;color:#15120F;font-weight:900;font-size:17px;padding:15px 26px;border-radius:12px;text-decoration:none;box-shadow:0 4px 0 #C99300}
.sp-hero-note{font-family:'JetBrains Mono',monospace;font-size:13px;color:#6E6A63;font-weight:600}
/* sections de contenu */
.sp-section{padding:34px 0 6px}
.sp-h2{font-size:clamp(23px,3.4vw,30px);line-height:1.1;font-weight:900;letter-spacing:-.02em;text-wrap:balance;margin-bottom:14px}
.sp-p{font-size:16.5px;line-height:1.65;color:#3a352f;font-weight:500;margin-top:12px;max-width:65ch}
.sp-p strong{font-weight:800;color:#15120F}
.sp-p a{font-weight:700;border-bottom:2px solid #FFC21A;text-decoration:none}
.sp-list{list-style:none;display:flex;flex-direction:column;gap:11px;margin:16px 0 0}
.sp-list li{position:relative;padding-left:30px;font-size:16px;line-height:1.55;color:#3a352f;font-weight:500}
.sp-list li:before{content:"✓";position:absolute;left:0;top:0;width:20px;height:20px;background:#15120F;color:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900}
.sp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
.sp-step{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:16px;padding:22px 20px}
.sp-step-n{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;color:#FFC21A;-webkit-text-stroke:1px #15120F;line-height:1;margin-bottom:12px}
.sp-step h3{font-size:18px;font-weight:800;letter-spacing:-.01em;margin-bottom:6px}
.sp-step p{font-size:14.5px;line-height:1.5;color:#56514a;font-weight:500}
.sp-note{background:#fff;border:1px solid rgba(21,18,15,.12);border-left:4px solid #FFC21A;border-radius:12px;padding:16px 18px;margin-top:22px;font-size:15px;line-height:1.55;color:#3a352f;font-weight:500}
.sp-note strong{color:#15120F;font-weight:800}
.sp-law{background:#15120F;color:#F2EDE3;border-radius:16px;padding:22px 22px;margin-top:22px}
.sp-law .sp-law-ref{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#FFC21A;font-weight:700;margin-bottom:8px}
.sp-law p{font-size:15.5px;line-height:1.6;color:#d7d1c6;font-weight:500}
.sp-law p strong{color:#fff;font-weight:800}
/* FAQ */
.sp-faq{display:flex;flex-direction:column;gap:12px;margin-top:20px}
.sp-faq-item{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:18px 20px}
.sp-faq-item h3{font-size:16.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:7px}
.sp-faq-item p{font-size:15px;line-height:1.55;color:#56514a;font-weight:500}
/* liens connexes */
.sp-related{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:20px}
.sp-related a{display:block;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:14px;padding:16px 18px;text-decoration:none;transition:border-color .14s ease,box-shadow .14s ease}
.sp-related a:hover{border-color:rgba(255,194,26,.7);box-shadow:0 12px 26px -16px rgba(21,18,15,.4)}
.sp-related b{display:block;font-size:15.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:3px}
.sp-related span{font-size:13.5px;color:#6E6A63;font-weight:500}
/* CTA final */
.sp-final{background:#15120F;color:#F2EDE3;border-radius:20px;padding:38px 30px;margin:44px 0 8px;text-align:center}
.sp-final h2{font-size:clamp(24px,3.6vw,32px);font-weight:900;letter-spacing:-.02em;line-height:1.06;margin-bottom:12px;text-wrap:balance}
.sp-final p{font-size:16px;color:#c9c3b8;font-weight:500;margin-bottom:22px}
.sp-final .sp-ybtn{box-shadow:0 4px 0 #C99300}
.sp-final-note{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#9a948a;margin-top:16px}
/* footer */
.sp-foot{border-top:1px solid rgba(21,18,15,.12);margin-top:20px}
.sp-foot-in{max-width:1000px;margin:0 auto;padding:26px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:13.5px;color:#6E6A63;font-weight:600}
.sp-foot-in nav{display:flex;gap:20px;flex-wrap:wrap}
.sp-foot-in a{text-decoration:none}
.sp-foot-in a:hover{color:#15120F}
@media(max-width:640px){
  .sp-steps{grid-template-columns:1fr}
  .sp-head-cta{padding:8px 13px;font-size:13px}
}
`;

interface Crumb { label: string; href: string; }

export default function SeoPage({
  kicker, title, lede, children, crumbs = [], ctaTitle, ctaText,
}: {
  kicker: string;
  title: ReactNode;
  lede: string;
  children: ReactNode;
  crumbs?: Crumb[];
  ctaTitle?: string;
  ctaText?: string;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sp">
        <header className="sp-head">
          <div className="sp-head-in">
            <Link href="/landing" className="sp-brand" aria-label="BEMEXO — accueil">
              <img src="/bemexo-wordmark-dark.svg" alt="BEMEXO" />
            </Link>
            <Link href="/inscription" className="sp-head-cta">Essayer gratuitement</Link>
          </div>
        </header>

        {crumbs.length > 0 && (
          <div className="sp-crumb">
            <Link href="/landing">Accueil</Link>
            {crumbs.map((c) => (
              <span key={c.href}> · <Link href={c.href}>{c.label}</Link></span>
            ))}
          </div>
        )}

        <main className="sp-main">
          <div className="sp-hero">
            <div className="sp-kicker">{kicker}</div>
            <h1 className="sp-h1">{title}</h1>
            <p className="sp-lede">{lede}</p>
            <div className="sp-hero-cta">
              <Link href="/inscription" className="sp-ybtn">Essayer 30 jours gratuits <span aria-hidden="true">→</span></Link>
              <span className="sp-hero-note">Sans carte bancaire · prêt en 5 min</span>
            </div>
          </div>

          {children}

          <section className="sp-final">
            <h2>{ctaTitle || 'Prêt à ranger les feuilles papier ?'}</h2>
            <p>{ctaText || 'Vos équipes pointent depuis leur téléphone, vous récupérez tout — propre, prêt pour la paie.'}</p>
            <Link href="/inscription" className="sp-ybtn">Démarrer mon essai gratuit <span aria-hidden="true">→</span></Link>
            <div className="sp-final-note">30 jours gratuits · sans carte bancaire · sans engagement</div>
          </section>
        </main>

        <footer className="sp-foot">
          <div className="sp-foot-in">
            <span>© 2026 BEMEXO — K.HABITAT (SAS)</span>
            <nav>
              <Link href="/landing">Accueil</Link>
              <Link href="/suisse">Suisse</Link>
              <Link href="/cgv">CGV</Link>
              <Link href="/cgu">CGU</Link>
              <Link href="/mentions-legales">Mentions légales</Link>
              <Link href="/confidentialite">Confidentialité</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}

// Petit utilitaire : injecte un bloc JSON-LD (données structurées) dans une page.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
