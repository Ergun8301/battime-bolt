'use client';

import { useAuth } from '@/components/auth-provider';
import { LogOut, Clock } from 'lucide-react';
import AdminPlanning from '@/components/admin-planning';

const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-admin{font-family:'Archivo',sans-serif;min-height:100vh;background:#15120F;background-image:repeating-linear-gradient(45deg,#15120F 0 32px,#19150f 32px 64px)}
.bt-admin *{box-sizing:border-box}
.bt-admin-hdr{position:sticky;top:0;z-index:50;background:#15120F;border-bottom:1px solid rgba(242,237,227,.1)}
.bt-admin-hdr-in{max-width:1800px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bt-admin-brand{display:flex;align-items:center;gap:11px}
.bt-admin-logo{position:relative;background:#FFC21A;color:#15120F;border-radius:11px;padding:9px;display:flex}
.bt-admin-logo-dot{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#C0461F;border:2px solid #15120F}
.bt-admin-name{font-size:18px;font-weight:900;color:#F2EDE3;letter-spacing:-.01em;line-height:1.05}
.bt-admin-sub{font-size:12.5px;color:#a59c86;font-weight:500}
.bt-admin-logout{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid rgba(242,237,227,.22);color:#F2EDE3;border-radius:9px;padding:8px 14px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.bt-admin-logout:hover{background:rgba(242,237,227,.08)}
.bt-admin-main{max-width:1800px;margin:0 auto;padding:14px 16px 32px}

/* ============================================================
   .bt-skin — thème noir/jaune chantier appliqué à TOUTES les
   fenêtres, menus déroulants et calendriers (portails Radix au
   niveau du body). On surcharge les variables shadcn : aucune
   fenêtre n'échappe à l'identité, sans réécrire chaque champ.
   ============================================================ */
.bt-skin{
  --background:40 33% 92%;
  --foreground:36 16% 7%;
  --card:40 33% 95%;
  --card-foreground:36 16% 7%;
  --popover:40 33% 94%;
  --popover-foreground:36 16% 7%;
  --primary:43 100% 55%;
  --primary-foreground:36 16% 7%;
  --secondary:40 24% 88%;
  --secondary-foreground:36 16% 12%;
  --muted:40 22% 89%;
  --muted-foreground:40 6% 42%;
  --accent:42 58% 85%;
  --accent-foreground:36 16% 12%;
  --destructive:14 72% 44%;
  --destructive-foreground:40 33% 96%;
  --border:38 18% 80%;
  --input:38 18% 78%;
  --ring:43 100% 55%;
  font-family:'Archivo',sans-serif;
}
.bt-skin .mono,.bt-skin .tabular{font-variant-numeric:tabular-nums}
/* petit liseré jaune en haut de chaque fenêtre pour l'identité */
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
              <Clock className="h-5 w-5" />
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
