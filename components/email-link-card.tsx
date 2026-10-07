// Habillage commun des écrans ouverts depuis un e-mail (/auth/confirm,
// /desabonnement) : même charte que /connexion (crème, noir, jaune chantier),
// une carte centrée, un seul bouton. Purement visuel.
import Link from 'next/link';
import type { ReactNode } from 'react';

export const EMAIL_LINK_CSS = `
@import url('/fonts/fonts.css');
.el{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.el *{box-sizing:border-box}
.el-card{width:100%;max-width:440px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:18px;padding:32px 28px;box-shadow:0 24px 50px -24px rgba(21,18,15,.4);text-align:center}
.el-logo{display:inline-flex;background:#15120F;border-radius:14px;padding:13px 24px;margin-bottom:24px}
.el-logo img{width:170px;height:auto;display:block}
.el-h1{font-size:23px;line-height:1.15;font-weight:900;letter-spacing:-.02em;margin:0 0 10px}
.el-p{font-size:15px;color:#6E6A63;font-weight:500;line-height:1.5;margin:0 0 22px}
.el-btn{display:block;width:100%;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:'Archivo',sans-serif;font-weight:900;font-size:17px;padding:15px;border-radius:12px;box-shadow:0 4px 0 #C99300;text-decoration:none}
.el-btn:disabled{opacity:.65;cursor:default}
.el-link{display:inline-block;margin-top:16px;font-size:14.5px;font-weight:800;color:#15120F;text-decoration:none;border-bottom:2px solid #FFC21A}
.el-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin:0 0 18px;text-align:left}
.el-ok{background:#e7f6ed;border:1px solid #a8dcc0;color:#1f7a4d;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin:0 0 18px;text-align:left}
.el-spin{width:34px;height:34px;border:3px solid rgba(21,18,15,.18);border-top-color:#15120F;border-radius:50%;animation:elspin .8s linear infinite;margin:6px auto 0}
@keyframes elspin{to{transform:rotate(360deg)}}
`;

export function EmailLinkCard({ children }: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={EMAIL_LINK_CSS_HTML} />
      <main className="el">
        <div className="el-card">
          <Link href="/landing" className="el-logo" aria-label="BEMEXO — accueil">
            <img src="/bemexo-wordmark-light.svg" alt="BEMEXO" />
          </Link>
          {children}
        </div>
      </main>
    </>
  );
}

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
const EMAIL_LINK_CSS_HTML = { __html: EMAIL_LINK_CSS };
