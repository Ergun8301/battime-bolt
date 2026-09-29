'use client';

// Écran de la console support (lot 5) — AFFICHAGE seulement. La logique (et
// donc les vérifications) vit dans app/support/page.tsx et dans la base ; la
// démo des préviews réutilise ce même écran avec de faux états.

import { useState } from 'react';
import { Loader2, LifeBuoy, ShieldCheck, LogIn, ArrowRight, KeyRound, Eye, EyeOff } from 'lucide-react';
import type { SupportCompany } from '@/lib/support';

export type ConsoleStep =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-staff' }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'ready' }
  | { kind: 'inside'; name: string; companyId: string };

const CSS = `
.sc{min-height:100vh;background:#F4F1EA;display:flex;justify-content:center;padding:32px 16px;font-family:inherit}
.sc-card{width:100%;max-width:460px;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:18px;padding:22px;box-shadow:0 10px 30px rgba(21,18,15,.06);align-self:flex-start}
.sc-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sc-ico{width:34px;height:34px;border-radius:10px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center}
.sc h1{font-size:18px;font-weight:900;margin:0;color:#15120F}
.sc h2{font-size:15px;font-weight:900;margin:0 0 6px;color:#15120F}
.sc p{font-size:13.5px;color:#56514a;line-height:1.5;margin:0 0 12px}
.sc-steps{display:flex;gap:6px;margin:0 0 16px}
.sc-steps span{flex:1;height:5px;border-radius:9px;background:#EAE4D8}
.sc-steps span.on{background:#15120F}
.sc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:#15120F;color:#FBF8F2;border-radius:11px;padding:10px 14px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit}
.sc-btn.ghost{background:#fff;color:#15120F;border:1.5px solid rgba(21,18,15,.2)}
.sc-btn:disabled{opacity:.45;cursor:default}
.sc-qr{display:flex;justify-content:center;margin:6px 0 10px}
.sc-qr img{width:180px;height:180px;border:1px solid rgba(21,18,15,.1);border-radius:12px;padding:6px;background:#fff}
.sc-secret{display:flex;gap:6px;align-items:center;font-family:'JetBrains Mono',monospace;font-size:12.5px;background:#FBF8F2;border:1px dashed rgba(21,18,15,.2);border-radius:9px;padding:7px 9px;margin:0 0 12px;word-break:break-all}
.sc-secret button{border:none;background:transparent;cursor:pointer;color:#6E6A63;flex:none}
.sc-code{display:flex;gap:8px}
.sc-code input{flex:1;min-width:0;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.3em;text-align:center;border:1.5px solid rgba(21,18,15,.2);border-radius:11px;padding:8px}
.sc-err{font-size:13px;color:#9a3b14;font-weight:700;margin:10px 0 0}
.sc-list{display:flex;flex-direction:column;gap:8px}
.sc-co{display:flex;align-items:center;gap:10px;border:1px solid rgba(21,18,15,.12);border-radius:12px;padding:10px 12px}
.sc-co b{display:block;font-size:14.5px;color:#15120F}
.sc-co small{font-size:12px;color:#6E6A63;font-weight:600}
.sc-co div{flex:1;min-width:0}
.sc-foot{font-size:12px;color:#9a948a;margin:14px 0 0;line-height:1.45}
`;

const qrSrc = (q: string) => (q.startsWith('data:') ? q : `data:image/svg+xml;utf-8,${encodeURIComponent(q)}`);
const until = (iso: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function CodeForm({ onVerify }: { onVerify: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="sc-code" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onVerify(code); setBusy(false); setCode(''); }}>
      <input
        inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label="Code à 6 chiffres" autoFocus
      />
      <button type="submit" className="sc-btn" disabled={code.length !== 6 || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Valider
      </button>
    </form>
  );
}

interface Props {
  step: ConsoleStep;
  companies: SupportCompany[];
  error: string | null;
  onLogin: () => void;
  onVerify: (factorId: string, code: string) => Promise<void>;
  onEnter: (companyId: string) => void;
  onBack: () => void;
  onExit: (companyId: string) => void;
}

export default function SupportConsoleView({ step, companies, error, onLogin, onVerify, onEnter, onBack, onExit }: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const level = step.kind === 'enroll' || step.kind === 'challenge' ? 2 : step.kind === 'ready' || step.kind === 'inside' ? 3 : 1;
  return (
    <main className="sc" data-testid="support-console">
      <style>{CSS}</style>
      <div className="sc-card">
        <div className="sc-head">
          <span className="sc-ico"><LifeBuoy className="h-4 w-4" /></span>
          <h1>Support BEMEXO</h1>
        </div>
        <div className="sc-steps" aria-hidden><span className="on" /><span className={level >= 2 ? 'on' : ''} /><span className={level >= 3 ? 'on' : ''} /></div>

        {step.kind === 'loading' && <Loader2 className="h-5 w-5 animate-spin" />}

        {step.kind === 'signed-out' && (<>
          <h2>1. Connexion</h2>
          <p>Connectez-vous avec le <strong>compte support</strong>, puis revenez sur cette page.</p>
          <button type="button" className="sc-btn" onClick={onLogin}><LogIn className="h-4 w-4" /> Se connecter</button>
        </>)}

        {step.kind === 'not-staff' && (<>
          <h2>Accès réservé</h2>
          <p>Ce compte n’est pas un compte support BEMEXO.</p>
        </>)}

        {step.kind === 'enroll' && (<>
          <h2>2. Activer la double vérification</h2>
          <p>Scannez ce QR code avec une application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…), puis tapez le code à 6 chiffres qu’elle affiche.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR en data: URL, rien à optimiser */}
          <div className="sc-qr"><img src={qrSrc(step.qr)} alt="QR code de double vérification" /></div>
          <div className="sc-secret">
            <KeyRound className="h-4 w-4" style={{ flex: 'none' }} />
            <span style={{ flex: 1 }}>{showSecret ? step.secret : 'Clé manuelle masquée'}</span>
            <button type="button" onClick={() => setShowSecret((v) => !v)} aria-label={showSecret ? 'Masquer la clé' : 'Afficher la clé'}>
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <CodeForm onVerify={(c) => onVerify(step.factorId, c)} />
        </>)}

        {step.kind === 'challenge' && (<>
          <h2>2. Double vérification</h2>
          <p>Tapez le code à 6 chiffres de votre application d’authentification.</p>
          <CodeForm onVerify={(c) => onVerify(step.factorId, c)} />
        </>)}

        {step.kind === 'ready' && (<>
          <h2>3. Entreprises qui vous ont autorisé</h2>
          {companies.length === 0 ? <p>Aucune pour l’instant. Le patron doit cliquer « Autoriser le support BEMEXO » dans ses Réglages.</p> : (
            <div className="sc-list">
              {companies.map((c) => (
                <div className="sc-co" key={c.company_id}>
                  <div><b>{c.name}</b><small>Autorisé jusqu’au {until(c.expires_at)}</small></div>
                  <button type="button" className="sc-btn" onClick={() => onEnter(c.company_id)} data-testid="support-enter">Entrer <ArrowRight className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </>)}

        {step.kind === 'inside' && (<>
          <h2>Vous êtes dans « {step.name} »</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="sc-btn" onClick={onBack}>Revenir à son espace <ArrowRight className="h-4 w-4" /></button>
            <button type="button" className="sc-btn ghost" onClick={() => onExit(step.companyId)}>Quitter</button>
          </div>
        </>)}

        {error && <p className="sc-err">{error}</p>}
        <p className="sc-foot">Lecture seule. Chaque entrée et chaque sortie sont notées dans le journal du client, qu’il peut consulter à tout moment.</p>
      </div>
    </main>
  );
}
