'use client';

// Pointage par la borne — ce que voit le salarié après avoir scanné le QR avec
// l'appareil photo de son téléphone (lot 1).
//
// LE PARCOURS, EN TROIS TEMPS :
//   1. le code du QR est vérifié tout de suite (il ne vaut qu'une à deux
//      minutes) et échangé contre un ticket de 5 minutes ;
//   2. si le salarié n'est pas connecté, il se connecte ICI, sans quitter la
//      page — le ticket attend ;
//   3. le pointage part : arrivée ou départ, décidé par le serveur avec la même
//      règle que l'appli. Grand écran de confirmation.
//
// La position n'est demandée QUE si l'entreprise a activé le contrôle « sur
// place » — et elle n'est que comparée à celle de la borne, jamais enregistrée.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { demanderPosition } from '@/lib/position';
import { callKiosk } from '@/lib/kiosk-client';

interface TicketResp { ticket: string; kiosk_name: string; company_name: string; needs_gps: boolean }
interface PunchResp {
  kind: 'arrival' | 'departure'; time: string; first_name: string;
  kiosk_name: string; worksite_name: string | null; range: { start: string; end: string } | null;
}

type Phase =
  | { s: 'checking' }
  | { s: 'login'; t: TicketResp }
  | { s: 'punching'; t: TicketResp }
  | { s: 'done'; r: PunchResp }
  | { s: 'error'; msg: string; retry?: boolean };

const CSS = `
@import url('/fonts/fonts.css');
.kx{min-height:100vh;min-height:100svh;font-family:'Archivo',system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px;text-align:center;background:#F2EDE3;color:#15120F}
.kx *{box-sizing:border-box}
.kx.ok{background:#1C7A4B;color:#fff}
.kx.bye{background:#15120F;color:#F2EDE3}
.kx.bad{background:#F2EDE3}
.kx-wrap{width:100%;max-width:420px}
.kx-logo{display:inline-flex;background:#15120F;border-radius:14px;padding:12px 20px;margin-bottom:22px}
.kx-logo img{width:140px;height:auto;display:block}
.kx-icon{font-size:72px;line-height:1;margin-bottom:14px}
.kx-title{font-size:clamp(28px,8vw,40px);font-weight:900;letter-spacing:-.025em;line-height:1.05;margin:0}
.kx-time{font-family:'JetBrains Mono',monospace;font-size:clamp(56px,20vw,96px);font-weight:700;letter-spacing:-.04em;line-height:1;margin:14px 0 6px}
.kx-sub{font-size:17px;font-weight:600;opacity:.85;line-height:1.45;margin:6px 0 0}
.kx-chip{display:inline-block;margin-top:16px;padding:8px 14px;border-radius:99px;background:rgba(255,255,255,.14);font-weight:800;font-size:15px}
.kx-btn{display:block;width:100%;margin-top:26px;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:17px;padding:16px;border-radius:14px;box-shadow:0 4px 0 #C99300;text-decoration:none}
.kx-ghost{display:inline-block;margin-top:16px;color:inherit;opacity:.8;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.kx-card{background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:20px;padding:26px 22px;box-shadow:0 24px 50px -24px rgba(21,18,15,.35);text-align:left}
.kx-h2{font-size:22px;font-weight:900;letter-spacing:-.02em;margin:0 0 4px;text-align:center}
.kx-p{font-size:15px;color:#6E6A63;font-weight:600;margin:0 0 18px;text-align:center}
.kx-l{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:6px}
.kx-i{width:100%;font-family:inherit;font-size:16px;font-weight:500;padding:13px 15px;border:1.5px solid rgba(21,18,15,.18);border-radius:12px;background:#FBF8F2;outline:none;color:#15120F;margin-bottom:14px}
.kx-i:focus{border-color:#15120F;background:#fff}
.kx-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:700;border-radius:12px;padding:11px 14px;margin-bottom:14px}
.kx-spin{width:44px;height:44px;border:4px solid rgba(21,18,15,.15);border-top-color:#15120F;border-radius:50%;animation:kxs .8s linear infinite;margin:0 auto 18px}
@keyframes kxs{to{transform:rotate(360deg)}}
`;

function Login({ t, onDone }: { t: TicketResp; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setErr(/invalid login/i.test(error.message) ? 'E-mail ou mot de passe incorrect.'
        : /not confirmed/i.test(error.message) ? "Votre e-mail n'est pas encore confirmé."
        : 'Connexion impossible. Réessayez.');
      return;
    }
    onDone();
  };

  return (
    <div className="kx-wrap">
      <div className="kx-logo"><img src="/bemexo-wordmark-light.svg" alt="BEMEXO" /></div>
      <form className="kx-card" onSubmit={submit}>
        <h1 className="kx-h2">Connectez-vous pour pointer</h1>
        <p className="kx-p">{t.company_name} · {t.kiosk_name}</p>
        {err && <div className="kx-err" role="alert">{err}</div>}
        <label className="kx-l" htmlFor="kx-email">E-mail</label>
        <input id="kx-email" className="kx-i" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="kx-l" htmlFor="kx-pass">Mot de passe</label>
        <input id="kx-pass" className="kx-i" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="kx-btn" style={{ marginTop: 4 }} type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter et pointer'}</button>
        <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
          <Link href="/mot-de-passe-oublie" style={{ color: '#6E6A63', fontWeight: 700, fontSize: 14 }}>Mot de passe oublié ?</Link>
        </p>
      </form>
    </div>
  );
}

export default function PointerPage() {
  const [phase, setPhase] = useState<Phase>({ s: 'checking' });
  const started = useRef(false);

  const punch = useCallback(async (t: TicketResp) => {
    setPhase({ s: 'punching', t });
    const pos = t.needs_gps ? await demanderPosition() : null;
    const { data, error, code } = await callKiosk<PunchResp>({
      action: 'punch', ticket: t.ticket, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy,
    });
    if (data) { setPhase({ s: 'done', r: data }); return; }
    if (code === 'auth') { setPhase({ s: 'login', t }); return; }
    setPhase({ s: 'error', msg: error || 'Pointage impossible.' });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    const k = q.get('k'), c = q.get('c');
    // Le code ne doit pas resservir : on le retire de l'adresse (historique,
    // partage, retour arrière).
    window.history.replaceState(null, '', window.location.pathname);
    if (!k || !c) { setPhase({ s: 'error', msg: 'Scannez le QR affiché sur la borne.' }); return; }
    (async () => {
      const { data: t, error } = await callKiosk<TicketResp>({ action: 'ticket', k, c });
      if (!t) { setPhase({ s: 'error', msg: error || 'QR invalide.' }); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPhase({ s: 'login', t }); return; }
      punch(t);
    })();
  }, [punch]);

  let body: React.ReactNode;
  let tone = '';
  if (phase.s === 'checking' || phase.s === 'punching') {
    body = (
      <div className="kx-wrap">
        <div className="kx-spin" aria-hidden="true" />
        <p className="kx-sub">{phase.s === 'checking' ? 'Vérification du QR…' : 'Pointage en cours…'}</p>
      </div>
    );
  } else if (phase.s === 'login') {
    body = <Login t={phase.t} onDone={() => punch(phase.t)} />;
  } else if (phase.s === 'done') {
    const r = phase.r;
    const arrival = r.kind === 'arrival';
    tone = arrival ? 'ok' : 'bye';
    body = (
      <div className="kx-wrap">
        <div className="kx-icon" aria-hidden="true">{arrival ? '✅' : '👋'}</div>
        <h1 className="kx-title">{arrival ? 'Arrivée enregistrée' : 'Départ enregistré'}</h1>
        <div className="kx-time">{r.time}</div>
        <p className="kx-sub">
          {arrival ? `Bonne journée${r.first_name ? `, ${r.first_name}` : ''} !` : `À bientôt${r.first_name ? `, ${r.first_name}` : ''} !`}
        </p>
        {arrival && r.worksite_name && <div className="kx-chip">{r.worksite_name}</div>}
        {!arrival && r.range && <div className="kx-chip">Heures enregistrées : {r.range.start} → {r.range.end}</div>}
        <Link className="kx-btn" href="/poseur">Ouvrir mon espace</Link>
      </div>
    );
  } else {
    tone = 'bad';
    body = (
      <div className="kx-wrap">
        <div className="kx-icon" aria-hidden="true">⚠️</div>
        <h1 className="kx-title" style={{ fontSize: 'clamp(24px,7vw,32px)' }}>Pointage non enregistré</h1>
        <p className="kx-sub" style={{ marginTop: 12 }}>{phase.msg}</p>
        <Link className="kx-btn" href="/poseur">Ouvrir mon espace</Link>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <main className={`kx ${tone}`}>{body}</main>
    </>
  );
}
