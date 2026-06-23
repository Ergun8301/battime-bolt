'use client';

import AdminPlanning from '@/components/admin-planning';

const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.bt-admin{font-family:'Archivo',sans-serif;min-height:100vh;background:#15120F;padding:6px}
.bt-admin *{box-sizing:border-box}

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
  return (
    <div className="bt-admin">
      <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
      <AdminPlanning />
    </div>
  );
}
