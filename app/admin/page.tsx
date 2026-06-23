'use client';

import { useAuth } from '@/components/auth-provider';
import { LogOut, Clock } from 'lucide-react';
import AdminPlanning from '@/components/admin-planning';

const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
/* hauteur de l'en-tête, réutilisée pour le sticky de la barre d'outils */
.bt-admin{--bt-admin-h:56px;font-family:'Archivo',sans-serif;min-height:100vh;background:#D6CFC1}
.bt-admin *{box-sizing:border-box}
.bt-admin-hdr{position:sticky;top:0;z-index:50;background:#F2EDE3;border-bottom:1px solid rgba(21,18,15,.12)}
.bt-admin-hdr-in{max-width:1800px;margin:0 auto;height:var(--bt-admin-h);padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bt-admin-brand{display:flex;align-items:center;gap:11px}
.bt-admin-logo{position:relative;background:#15120F;color:#FFC21A;border-radius:9px;padding:7px;display:flex}
.bt-admin-logo-dot{position:absolute;top:-2px;right:-2px;width:9px;height:9px;border-radius:50%;background:#C0461F;border:2px solid #F2EDE3}
.bt-admin-name{font-size:16px;font-weight:900;color:#15120F;letter-spacing:-.02em;line-height:1.05}
.bt-admin-sub{font-size:12px;color:#6E6A63;font-weight:600}
.bt-admin-logout{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1.5px solid rgba(21,18,15,.22);color:#15120F;border-radius:9px;padding:7px 13px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;transition:background .14s ease,border-color .14s ease,transform .08s ease}
.bt-admin-logout:hover{background:rgba(21,18,15,.05);border-color:#15120F}
.bt-admin-logout:active{transform:translateY(1px)}
.bt-admin-main{max-width:1800px;margin:0 auto;padding:14px 16px 36px}

/* ============================================================
   .bt-skin — thème CLAIR (crème + jaune + noir en accent) appliqué
   à TOUTES les fenêtres, menus déroulants et calendriers (portails
   Radix au niveau du body). On surcharge les variables shadcn :
   aucune fenêtre n'échappe à l'identité, sans réécrire chaque champ.
   ============================================================ */
.bt-skin{
  --background:40 33% 95%;
  --foreground:36 16% 7%;
  --card:0 0% 100%;
  --card-foreground:36 16% 7%;
  --popover:40 33% 96%;
  --popover-foreground:36 16% 7%;
  --primary:43 100% 55%;
  --primary-foreground:36 16% 7%;
  --secondary:40 24% 90%;
  --secondary-foreground:36 16% 12%;
  --muted:40 22% 91%;
  --muted-foreground:40 6% 42%;
  --accent:42 58% 88%;
  --accent-foreground:36 16% 12%;
  --destructive:14 72% 44%;
  --destructive-foreground:40 33% 97%;
  --border:38 16% 82%;
  --input:38 16% 80%;
  --ring:43 100% 55%;
  font-family:'Archivo',sans-serif;
}
.bt-skin .mono,.bt-skin .tabular{font-variant-numeric:tabular-nums}
/* fin liseré jaune en haut de chaque fenêtre pour l'identité */
.bt-skin[role="dialog"]{border-top:3px solid #FFC21A}
.bt-skin[role="dialog"] h2{font-weight:900;letter-spacing:-.01em}
`;

export default function AdminPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="bt-admin">
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      <header className="bt-admin-hdr">
        <div className="bt-admin-hdr-in">
          <div className="bt-admin-brand">
            <span className="bt-admin-logo">
              <Clock className="h-4 w-4" />
              <span className="bt-admin-logo-dot" />
            </span>
            <div>
              <div className="bt-admin-name">Battime</div>
              <div className="bt-admin-sub">{user?.first_name} {user?.last_name}</div>
            </div>
          </div>
          <button className="bt-admin-logout" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="bt-admin-main">
        <AdminPlanning />
      </main>
    </div>
  );
}
