'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { User } from '@/lib/types';
import {
  Users, Building2, Download, ChevronDown, FileSpreadsheet, FileText, Settings, LogOut,
} from 'lucide-react';

// Menu hamburger mobile de l'admin : identité + statut d'abonnement + les mêmes
// destinations que la barre desktop (Salariés, Chantiers, Exporter, Réglages,
// Déconnexion). Panneau générique et sans logique métier propre : chaque item
// délègue à un callback fourni par admin-planning.tsx, qui ouvre exactement la
// même fenêtre que sur ordinateur. Aucune donnée n'est dupliquée ici.
const MM_CSS = `
.bt-mm-sheet{padding:0!important;color:#F2EDE3;overflow-y:auto;display:flex;flex-direction:column}
.bt-mm-head{padding:22px 40px 18px 18px;background:#15120F;flex:none}
.bt-mm-brand{display:flex;align-items:center;gap:10px}
.bt-mm-av{width:40px;height:40px;border-radius:11px;background:#FFC21A;color:#15120F;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;flex:none;overflow:hidden}
.bt-mm-av img{width:100%;height:100%;object-fit:cover;display:block}
.bt-mm-id{min-width:0}
.bt-mm-co{font-size:14.5px;font-weight:800;letter-spacing:-.005em;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-mm-user{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#a59c86;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-mm-trial{display:flex;align-items:center;gap:8px;background:#211B14;border:1px solid rgba(255,194,26,.35);color:#F2EDE3;border-radius:11px;padding:9px 9px 9px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;margin-top:14px}
.bt-mm-trial .d{width:6px;height:6px;border-radius:50%;background:#FFC21A;flex:none}
.bt-mm-trial b{color:#FFC21A;font-weight:800}
.bt-mm-trial.expired{border-color:rgba(216,90,48,.5)}
.bt-mm-trial.expired .d{background:#D85A30}
.bt-mm-trial .cta{margin-left:auto;background:#FFC21A;color:#15120F;border:none;font-family:'Archivo',sans-serif;font-weight:800;font-size:11.5px;padding:6px 12px;border-radius:8px;cursor:pointer;box-shadow:0 2px 0 #C99300;flex:none}
.bt-mm-trial.expired .cta{box-shadow:0 2px 0 #8a3016}
.bt-mm-body{flex:1;min-height:0;overflow-y:auto;padding:12px 10px 10px;background:#F7F4EE;display:flex;flex-direction:column}
.bt-mm-kicker{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#9a948a;margin:4px 8px 6px}
.bt-mm-item{width:100%;display:flex;align-items:center;gap:11px;padding:12px 10px;background:none;border:none;text-align:left;cursor:pointer;border-radius:11px;font-family:'Archivo',sans-serif;color:#15120F}
.bt-mm-item:hover{background:rgba(21,18,15,.05)}
.bt-mm-icon{width:30px;height:30px;border-radius:9px;background:#fff;border:1px solid rgba(21,18,15,.1);display:flex;align-items:center;justify-content:center;flex:none;color:#15120F}
.bt-mm-label{font-weight:800;font-size:13.5px;letter-spacing:-.005em;flex:1}
.bt-mm-chev{color:#9a948a;transition:transform .18s ease;flex:none}
.bt-mm-chev.open{transform:rotate(180deg)}
.bt-mm-sub{display:flex;flex-direction:column;gap:2px;padding:2px 0 6px 47px}
.bt-mm-subitem{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;background:none;border:none;cursor:pointer;font-family:'Archivo',sans-serif;font-size:12.5px;font-weight:700;color:#3a352f;text-align:left}
.bt-mm-subitem:hover{background:rgba(21,18,15,.06)}
.bt-mm-subitem small{display:block;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:600;color:#9a948a;margin-top:1px}
.bt-mm-sep{height:1px;background:rgba(21,18,15,.1);margin:8px 8px}
.bt-mm-item.danger .bt-mm-label,.bt-mm-item.danger .bt-mm-icon{color:#B5472E}
`;

interface AdminMobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  companyLabel: string;
  companyLogo: string;
  companyInitials: string;
  trial?: { inTrial: boolean; expired: boolean; daysLeft: number | null };
  onSubscribe?: () => void;
  onOpenSalaries: () => void;
  onOpenChantiers: () => void;
  onOpenExportTeam: () => void;
  onOpenExportWorker: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export default function AdminMobileMenu({
  open, onOpenChange, user, companyLabel, companyLogo, companyInitials,
  trial, onSubscribe,
  onOpenSalaries, onOpenChantiers, onOpenExportTeam, onOpenExportWorker, onOpenSettings, onSignOut,
}: AdminMobileMenuProps) {
  const [exportExpanded, setExportExpanded] = useState(false);

  const go = (fn: () => void) => { onOpenChange(false); fn(); };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setExportExpanded(false); }}>
      <SheetContent side="right" className="bt-skin bt-mm-sheet">
        <style dangerouslySetInnerHTML={{ __html: MM_CSS }} />
        <SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle></SheetHeader>

        <div className="bt-mm-head">
          <div className="bt-mm-brand">
            <span className="bt-mm-av">
              {companyLogo ? <img src={companyLogo} alt="" /> : companyInitials}
            </span>
            <div className="bt-mm-id">
              <div className="bt-mm-co">{companyLabel}</div>
              <div className="bt-mm-user">{user?.first_name} {user?.last_name}</div>
            </div>
          </div>
          {trial?.inTrial && !trial.expired && trial.daysLeft !== null && (
            <div className="bt-mm-trial"><span className="d" /> Essai · <b>{trial.daysLeft} j</b> restants
              <button className="cta" onClick={() => go(() => onSubscribe?.())}>S&apos;abonner</button>
            </div>
          )}
          {trial?.inTrial && trial.expired && (
            <div className="bt-mm-trial expired"><span className="d" /> Essai terminé
              <button className="cta" onClick={() => go(() => onSubscribe?.())}>S&apos;abonner</button>
            </div>
          )}
        </div>

        <nav className="bt-mm-body">
          <div className="bt-mm-kicker">Gestion</div>

          <button className="bt-mm-item" onClick={() => go(onOpenSalaries)}>
            <span className="bt-mm-icon"><Users className="h-4 w-4" /></span>
            <span className="bt-mm-label">Salariés</span>
          </button>

          <button className="bt-mm-item" onClick={() => go(onOpenChantiers)}>
            <span className="bt-mm-icon"><Building2 className="h-4 w-4" /></span>
            <span className="bt-mm-label">Chantiers</span>
          </button>

          <button className="bt-mm-item" onClick={() => setExportExpanded((v) => !v)}>
            <span className="bt-mm-icon"><Download className="h-4 w-4" /></span>
            <span className="bt-mm-label">Exporter</span>
            <span className={`bt-mm-chev${exportExpanded ? ' open' : ''}`}><ChevronDown className="h-4 w-4" /></span>
          </button>
          {exportExpanded && (
            <div className="bt-mm-sub">
              <button className="bt-mm-subitem" onClick={() => go(onOpenExportTeam)}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Exporter l&apos;équipe<small>Verrouille le mois</small></span>
              </button>
              <button className="bt-mm-subitem" onClick={() => go(onOpenExportWorker)}>
                <FileText className="h-3.5 w-3.5" />
                <span>Exporter un salarié<small>Sans verrou</small></span>
              </button>
            </div>
          )}

          <button className="bt-mm-item" onClick={() => go(onOpenSettings)}>
            <span className="bt-mm-icon"><Settings className="h-4 w-4" /></span>
            <span className="bt-mm-label">Réglages de l&apos;entreprise</span>
          </button>

          <div className="bt-mm-sep" />
          <button className="bt-mm-item danger" onClick={() => go(onSignOut)}>
            <span className="bt-mm-icon"><LogOut className="h-4 w-4" /></span>
            <span className="bt-mm-label">Déconnexion</span>
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
