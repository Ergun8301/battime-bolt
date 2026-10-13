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
// Lot 11 : la position n'est JAMAIS demandée (plus de contrôle « sur place »).
// Lot 12 — SAUF pour le QR FIXE imprimé (/pointer#f=…, option du bureau) :
//   · avant le premier scan d'un QR fixe PAR COMPTE (pas par téléphone : un
//     collègue qui se connecte sur le même téléphone voit l'écran à son tour),
//     un écran court explique pourquoi, qu'il n'y a qu'UNE lecture au scan, que
//     rien n'est gardé, et que le salarié peut refuser (autres moyens proposés).
//     Il passe toujours AVANT la lecture de la position, après la connexion ;
//   · la position est lue UNE fois (lib/position.ts, délai de 8 s), juste
//     avant le pointage, envoyée avec lui et vérifiée par le serveur ;
//   · refus, position introuvable, hors zone ou trop imprécise : « Scannez la
//     tablette, ou ajoutez votre intervention à la main. » (« Scannez la
//     tablette » seulement si l'entreprise en a une de reliée)
// Le QR de la tablette (?k=…&c=…) ne change pas : jamais de position.
//
// Lot 9 : un départ moins d'une minute après l'arrivée annule le pointage
// (rien n'est enregistré). Écran neutre : ce n'est pas une erreur.
//
// Lot 10 : sous « Ouvrir mon espace », des raccourcis (jamais sur l'écran
// « annulé » ni sur une erreur). Après une arrivée : « Ajouter une intervention
// faite avant ». Après un départ : « Envoyer ma journée » (qui ne fait qu'OUVRIR
// une demande de confirmation sur /poseur) et « Ajouter une intervention ».
// Ils n'écrivent rien : ils ouvrent /poseur avec un paramètre que /poseur lit
// une fois et efface. L'adresse est calculée AU TOUCHER, pas à l'affichage :
// l'écran de succès peut rester ouvert des heures.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { callKiosk, type KioskPunchResult as PunchResp, type KioskTicket as TicketResp } from '@/lib/kiosk-client';
import { demanderPosition } from '@/lib/position';
import { PasswordInput } from '@/components/password-input';
import { afterScanHref, type AfterScan } from '@/supabase/functions/_shared/after-scan';
import { fixedAlternative, fixedRefusalMessage, lowerFirst, FIXED_REFUSAL_MESSAGES } from '@/supabase/functions/_shared/fixed-qr';

type Phase =
  | { s: 'checking' }
  | { s: 'info'; t: TicketResp; uid: string }
  | { s: 'login'; t: TicketResp }
  | { s: 'locating'; t: TicketResp }
  | { s: 'punching'; t: TicketResp }
  | { s: 'done'; r: PunchResp }
  | { s: 'refused'; msg: string; t?: TicketResp }
  | { s: 'error'; msg: string; retry?: boolean; neutral?: boolean };

/**
 * Lot 12 : l'écran d'information du QR fixe a été lu PAR CE COMPTE (une clé par
 * salarié, pas une pour le téléphone : un collègue sur le même téléphone, ou
 * qui prête le sien, doit lire l'information avant que SA position soit lue).
 * Un autre téléphone, ou une navigation privée, le remontre : trop d'information
 * vaut mieux que pas assez.
 */
const infoKey = (uid: string) => `bx_fixed_qr_info_v1:${uid}`;
const infoSeen = (uid: string) => { try { return localStorage.getItem(infoKey(uid)) === '1'; } catch { return false; } };
const markInfoSeen = (uid: string) => { try { localStorage.setItem(infoKey(uid), '1'); } catch { /* navigation privée : redemandé la prochaine fois */ } };
/** Les refus du QR fixe : écran « autres moyens » (pas une panne). */
const FIXED_CODES = new Set(Object.keys(FIXED_REFUSAL_MESSAGES));

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
.kx-sec{display:block;width:100%;margin-top:10px;background:transparent;border:2px solid currentColor;color:inherit;cursor:pointer;font-family:inherit;font-weight:800;font-size:16px;line-height:1.25;min-height:48px;padding:12px 16px;border-radius:14px}
.kx-sec:disabled{opacity:.6;cursor:default}
.kx-ghost{display:inline-block;margin-top:16px;color:inherit;opacity:.8;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.kx-card{background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:20px;padding:26px 22px;box-shadow:0 24px 50px -24px rgba(21,18,15,.35);text-align:left}
.kx-h2{font-size:22px;font-weight:900;letter-spacing:-.02em;margin:0 0 4px;text-align:center}
.kx-p{font-size:15px;color:#6E6A63;font-weight:600;margin:0 0 18px;text-align:center}
.kx-l{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:6px}
.kx-i{width:100%;font-family:inherit;font-size:16px;font-weight:500;padding:13px 15px;border:1.5px solid rgba(21,18,15,.18);border-radius:12px;background:#FBF8F2;outline:none;color:#15120F;margin-bottom:14px}
.kx-i:focus{border-color:#15120F;background:#fff}
.kx-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:700;border-radius:12px;padding:11px 14px;margin-bottom:14px}
.kx-info{list-style:none;margin:0 0 6px;padding:0;display:flex;flex-direction:column;gap:12px;font-size:15px;line-height:1.45;color:#3b362f}
.kx-info b{color:#15120F}
.kx-link{display:block;width:100%;margin-top:12px;background:none;border:0;padding:8px;font:inherit;font-size:15px;font-weight:700;color:#6E6A63;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.kx-spin{width:44px;height:44px;border:4px solid rgba(21,18,15,.15);border-top-color:#15120F;border-radius:50%;animation:kxs .8s linear infinite;margin:0 auto 18px}
@keyframes kxs{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.kx-spin{animation-duration:2.4s}}
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
        {t.company_name && <p className="kx-p" data-testid="pointer-company">{t.company_name}</p>}
        {err && <div className="kx-err" role="alert">{err}</div>}
        <label className="kx-l" htmlFor="kx-email">E-mail</label>
        <input id="kx-email" className="kx-i" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="kx-l" htmlFor="kx-pass">Mot de passe</label>
        <PasswordInput id="kx-pass" className="kx-i" autoComplete="current-password" required value={password} onChange={setPassword} wrapStyle={{ marginBottom: 14 }} />
        <button className="kx-btn" style={{ marginTop: 4 }} type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter et pointer'}</button>
        <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
          <Link href="/mot-de-passe-oublie" style={{ color: '#6E6A63', fontWeight: 700, fontSize: 14 }}>Mot de passe oublié ?</Link>
        </p>
      </form>
    </div>
  );
}

/** Lot 12 — avant le premier scan d'un QR fixe : pourquoi, une seule lecture, rien de gardé, droit de refuser. */
function FixedInfo({ t, onAccept, onRefuse }: { t: TicketResp; onAccept: () => void; onRefuse: () => void }) {
  const radius = t.radius_m || 200;
  return (
    <div className="kx-wrap">
      <div className="kx-logo"><img src="/bemexo-wordmark-light.svg" alt="BEMEXO" /></div>
      <div className="kx-card" data-testid="fixed-info">
        <h1 className="kx-h2">Ce QR demande votre position</h1>
        {t.company_name && <p className="kx-p">{t.company_name}</p>}
        <ul className="kx-info">
          <li><b>Pourquoi ?</b> Ce QR est imprimé : une photo pourrait servir ailleurs. On vérifie donc que vous êtes à moins de {radius} m de l’entreprise.</li>
          <li><b>Une seule lecture</b>, au moment du scan. Jamais en continu, jamais en dehors.</li>
          <li><b>Rien n’est gardé :</b> ni coordonnées, ni trajet. Seulement « dans la zone : oui » avec votre pointage, que le bureau peut lire.</li>
          <li><b>Vous pouvez refuser :</b> {lowerFirst(fixedAlternative(t.has_tablet))}</li>
        </ul>
        <button type="button" className="kx-btn" data-testid="fixed-info-ok" onClick={onAccept}>Continuer</button>
        <button type="button" className="kx-link" data-testid="fixed-info-no" onClick={onRefuse}>Je refuse</button>
      </div>
    </div>
  );
}

export default function PointerPage() {
  const [phase, setPhase] = useState<Phase>({ s: 'checking' });
  const started = useRef(false);
  const router = useRouter();

  /** Lot 10 : ouvre /poseur sur le raccourci touché. Sans compte lisible, on ouvre simplement /poseur comme avant. */
  const shortcut = useCallback(async (a: AfterScan, h?: string | null) => {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user.id;
    router.push(u ? afterScanHref(a, Date.now(), { h, u }) : '/poseur');
  }, [router]);

  const punch = useCallback(async (t: TicketResp, informed = false) => {
    // Lot 12 — QR fixe : la position est lue ICI, une fois, juste avant le
    // pointage (jamais avant, jamais après). Pas de position : on ne l'envoie
    // pas, on propose les autres moyens.
    let pos: { lat: number; lng: number; accuracy: number | null } | null = null;
    if (t.needs_position) {
      // L'information d'abord, une fois PAR COMPTE : c'est ici, juste avant la
      // lecture, que tous les chemins passent (scan, connexion, « Réessayer »).
      if (!informed) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setPhase({ s: 'login', t }); return; }
        if (!infoSeen(session.user.id)) { setPhase({ s: 'info', t, uid: session.user.id }); return; }
      }
      setPhase({ s: 'locating', t });
      pos = await demanderPosition(8000);
      if (!pos) { setPhase({ s: 'refused', msg: fixedRefusalMessage('position_missing', t.has_tablet), t }); return; }
    }
    setPhase({ s: 'punching', t });
    const { data, error, code } = await callKiosk<PunchResp>(pos
      ? { action: 'punch', ticket: t.ticket, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy }
      : { action: 'punch', ticket: t.ticket });
    if (data) { setPhase({ s: 'done', r: data }); return; }
    if (code === 'auth') { setPhase({ s: 'login', t }); return; }
    if (code && FIXED_CODES.has(code)) { setPhase({ s: 'refused', msg: error || fixedAlternative(t.has_tablet), t }); return; }
    // Arrivée et départ trop proches (ancien chemin) : rien de grave, ton neutre.
    setPhase({ s: 'error', msg: error || 'Pointage impossible.', neutral: code === 'too_short' || code === 'double_scan' });
  }, []);

  /** Après le ticket : se connecter si besoin, puis pointer (l'information du QR fixe passe dans `punch`). */
  const proceed = useCallback(async (t: TicketResp) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPhase({ s: 'login', t }); return; }
    punch(t);
  }, [punch]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    const k = q.get('k'), c = q.get('c');
    // Lot 12 : le QR fixe imprimé porte son jeton dans le fragment (#f=…),
    // jamais envoyé au serveur du site.
    const f = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('f');
    // Le code ne doit pas resservir : on le retire de l'adresse (historique,
    // partage, retour arrière).
    window.history.replaceState(null, '', window.location.pathname);
    if (!f && (!k || !c)) { setPhase({ s: 'error', msg: 'Scannez le QR affiché sur la borne.' }); return; }
    (async () => {
      const { data: t, error, code } = await callKiosk<TicketResp>(f ? { action: 'ticket', f } : { action: 'ticket', k, c });
      if (!t) {
        if (f && code && FIXED_CODES.has(code)) { setPhase({ s: 'refused', msg: error || fixedAlternative() }); return; }
        setPhase({ s: 'error', msg: error || 'QR invalide.' });
        return;
      }
      void proceed(t);
    })();
  }, [proceed]);

  let body: React.ReactNode;
  let tone = '';
  if (phase.s === 'checking' || phase.s === 'punching' || phase.s === 'locating') {
    body = (
      <div className="kx-wrap" data-testid={`pointer-${phase.s}`}>
        <div className="kx-spin" aria-hidden="true" />
        <p className="kx-sub">{phase.s === 'checking' ? 'Vérification du QR…' : phase.s === 'locating' ? 'Lecture de votre position (une seule fois)…' : 'Pointage en cours…'}</p>
      </div>
    );
  } else if (phase.s === 'info') {
    const { t, uid } = phase;
    body = (
      <FixedInfo t={t}
        onAccept={() => { markInfoSeen(uid); void punch(t, true); }}
        onRefuse={() => setPhase({ s: 'refused', msg: `Votre position ne sera pas lue. ${fixedAlternative(t.has_tablet)}` })} />
    );
  } else if (phase.s === 'refused') {
    // Lot 12 — pas une panne : le QR fixe n'a pas pu vérifier la zone. Deux
    // autres moyens, toujours proposés.
    const t = phase.t;
    body = (
      <div className="kx-wrap" data-testid="fixed-refused">
        <div className="kx-icon" aria-hidden="true">📍</div>
        <h1 className="kx-title" style={{ fontSize: 'clamp(24px,7vw,32px)' }}>Pointage non enregistré</h1>
        <p className="kx-sub" style={{ marginTop: 12 }}>{phase.msg}</p>
        <Link className="kx-btn" href="/poseur" data-testid="fixed-refused-manual">Ajouter mon intervention à la main</Link>
        {t && <button type="button" className="kx-link" data-testid="fixed-refused-retry" onClick={() => punch(t)}>Réessayer</button>}
      </div>
    );
  } else if (phase.s === 'login') {
    body = <Login t={phase.t} onDone={() => punch(phase.t)} />;
  } else if (phase.s === 'done' && phase.r.cancelled) {
    // Neutre : même fond que l'accueil, aucun rouge, aucun pictogramme d'alerte.
    body = (
      <div className="kx-wrap" data-testid="punch-cancelled">
        <div className="kx-icon" aria-hidden="true">↩️</div>
        <h1 className="kx-title">Pointage annulé (moins d&apos;une minute)</h1>
        <p className="kx-sub" style={{ marginTop: 12 }}>
          Départ scanné juste après l&apos;arrivée : rien n&apos;est enregistré{phase.r.first_name ? `, ${phase.r.first_name}` : ''}.
        </p>
        <Link className="kx-btn" href="/poseur">Ouvrir mon espace</Link>
      </div>
    );
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
        {arrival ? (
          <button type="button" className="kx-sec" data-testid="after-before" onClick={() => void shortcut('avant', r.time)}>
            Ajouter une intervention faite avant
          </button>
        ) : (
          <>
            <button type="button" className="kx-sec" data-testid="after-send" onClick={() => void shortcut('envoyer')}>
              Envoyer ma journée
            </button>
            <button type="button" className="kx-sec" data-testid="after-add" onClick={() => void shortcut('ajouter', r.range?.end ?? r.time)}>
              Ajouter une intervention
            </button>
          </>
        )}
      </div>
    );
  } else if (phase.neutral) {
    body = (
      <div className="kx-wrap">
        <h1 className="kx-title" style={{ fontSize: 'clamp(24px,7vw,32px)' }}>Rien à enregistrer</h1>
        <p className="kx-sub" style={{ marginTop: 12 }}>{phase.msg}</p>
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
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <main className={`kx ${tone}`}>{body}</main>
    </>
  );
}

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
const CSS_HTML = { __html: CSS };
