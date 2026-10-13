'use client';

// Fenêtre « Associer cette tablette ? » — lot 11 (IA), appairage en un geste.
//
// Le patron a scanné le QR d'une tablette (/admin#borne=<identifiant>, gardé
// par lib/kiosk-pair-stash.ts le temps de se connecter). Ici il voit le nom de
// SON entreprise (renvoyé par le serveur), l'âge du QR et quatre codes ; il
// touche celui qu'affiche la tablette. Le serveur décide de tout (jamais cette
// fenêtre) : `pair_lookup` (lecture), `pair_confirm` (écriture). Chargée à la
// demande par app/admin/layout.tsx : rien n'est téléchargé sans QR en attente.
//
// · Une tablette en service (vue il y a moins de 15 min) ne se remplace qu'avec
//   un second geste, « Remplacer la tablette en service » (le serveur l'impose :
//   `replace_required`).
// · Après la confirmation, la fenêtre relit `kiosks` (lecture sous RLS, aucun
//   appel à la fonction) pour dire si une tablette neuve est vraiment apparue.
// · Compte BEMEXO Support : lecture seule, aucun appel (le serveur refuse aussi).
// · Les refus du serveur sont affichés tels quels (le texte vient de lui).
// · Aucun secret affiché : ni l'identifiant de demande, ni jeton.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { seenLabel } from '@/components/kiosk-admin';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callKiosk } from '@/lib/kiosk-client';
import { clearPairRequest, peekPairRequest } from '@/lib/kiosk-pair-stash';
import { supabase } from '@/lib/supabase';
import { readSupportSession } from '@/lib/support';
import { minutesLabel, SUPPORT_READONLY_MESSAGE } from '../supabase/functions/_shared/kiosk-pair';

interface Lookup {
  available?: boolean;
  company_name: string;
  choices: string[];
  age_s: number;
  replaces: { alive: boolean; seen_ago_s: number | null } | null;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'support' }
  | { kind: 'unavailable' }
  | { kind: 'choose'; lookup: Lookup; selected: string | null }
  | { kind: 'sending'; lookup: Lookup; selected: string | null }
  | { kind: 'done' }
  | { kind: 'error'; message: string; retry: boolean };

/** Vérification de bout en bout : une tablette neuve est-elle apparue ? */
type Verify = 'checking' | 'ok' | 'timeout' | 'unknown';

const VERIFY_EVERY_MS = 3 * 1000;
const VERIFY_FOR_MS = 30 * 1000;
const NETWORK_MESSAGE = 'Connexion impossible. Vérifiez internet et réessayez.';

const CSS = `
.bt-skin.kpc{max-height:calc(100dvh - 32px);overflow-y:auto}
.kpc{font-family:'Archivo',sans-serif;color:#15120F}
.kpc-body{display:flex;flex-direction:column;gap:14px;min-width:0}
.kpc-co{margin:0;font-size:17px;font-weight:900}
.kpc-age{margin:0;font-size:13.5px;font-weight:700;color:#6E6A63}
.kpc-p{margin:0;font-size:14.5px;font-weight:600;line-height:1.45;color:#3d3933}
.kpc-warn{margin:0;font-size:14.5px;font-weight:800;line-height:1.45;color:#C0461F}
.kpc-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.kpc-choice{min-height:56px;border:2px solid #15120F;background:#fff;color:#15120F;border-radius:14px;font-family:'JetBrains Mono',monospace;font-size:clamp(19px,6vw,24px);font-weight:700;letter-spacing:.08em;cursor:pointer;padding:8px 6px}
.kpc-choice:disabled{opacity:.6;cursor:default}
.kpc-choice[aria-pressed=true]{background:#FFC21A;border-color:#FFC21A}
.kpc-panel{border:2px solid #C0461F;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;background:#FFF7F2}
.kpc-panel h3{margin:0;font-size:16px;font-weight:900;color:#C0461F}
.kpc-panel .kpc-picked{font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:.08em}
.kpc-actions{display:flex;flex-wrap:wrap;gap:10px}
.kpc-btn{min-height:48px;border:2px solid #15120F;background:#FFC21A;color:#15120F;border-radius:12px;padding:10px 16px;font:inherit;font-weight:900;font-size:15px;cursor:pointer}
.kpc-btn.danger{background:#C0461F;border-color:#C0461F;color:#fff}
.kpc-btn.plain{background:#fff}
.kpc-btn:disabled{opacity:.6;cursor:default}
.kpc-text{align-self:flex-start;min-height:44px;border:0;background:none;padding:6px 2px;font:inherit;font-size:14px;font-weight:700;color:#6E6A63;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.kpc-text:disabled{opacity:.6;cursor:default}
.kpc-err{margin:0;background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:700;border-radius:12px;padding:11px 14px}
.kpc-ok{margin:0;font-size:16px;font-weight:800;line-height:1.4}
.kpc-state{margin:0;font-size:15px;font-weight:700;color:#6E6A63}
.kpc-state.good{color:#1F7A4D}
@media(max-width:520px){.bt-skin.kpc{padding-bottom:96px}}
`;
// Objet FIXE : une feuille réécrite à chaque rendu ferait recharger les polices.
const CSS_HTML = { __html: CSS };

/** Les tablettes actives de l'entreprise (sous RLS), hors QR fixe ; `null` si la lecture échoue. */
async function readTabletIds(companyId: string): Promise<Set<string> | null> {
  const read = (cols: string) => supabase.from('kiosks').select(cols).eq('company_id', companyId).is('revoked_at', null);
  // Colonne `kind` absente (42703 : avant le QR fixe) : la lecture d'avant, comme la fenêtre « Borne ».
  let { data, error } = await read('id, created_at, kind');
  if (error?.code === '42703') ({ data, error } = await read('id, created_at'));
  if (error) return null;
  return new Set(((data || []) as unknown as { id: string; kind?: string | null }[]).filter((r) => r.kind !== 'fixe').map((r) => r.id));
}

export default function KioskPairConfirm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [verify, setVerify] = useState<Verify>('checking');
  // L'identifiant est lu UNE fois : il reste ici même quand la mémoire est nettoyée.
  const rid = useRef<string | null>(null);
  const before = useRef<Set<string> | null>(null);
  const alive = useRef(true);

  const close = useCallback(() => { clearPairRequest(); onClose(); }, [onClose]);

  const lookup = useCallback(async (id: string) => {
    setPhase({ kind: 'loading' });
    const [res, ids] = await Promise.all([
      callKiosk<Lookup>({ action: 'pair_lookup', request_id: id }),
      companyId ? readTabletIds(companyId) : Promise.resolve(null),
    ]);
    if (!alive.current) return;
    before.current = ids;
    const { data, error, status } = res;
    if (data) {
      if (data.available === false) { clearPairRequest(); setPhase({ kind: 'unavailable' }); return; }
      setPhase({ kind: 'choose', lookup: data, selected: null });
      return;
    }
    // Fonction pas encore à jour (« Action inconnue ») : la fenêtre se tait.
    if (status === 400 && error === 'Action inconnue') { clearPairRequest(); setPhase({ kind: 'unavailable' }); return; }
    if (status) clearPairRequest();
    setPhase({ kind: 'error', message: error || NETWORK_MESSAGE, retry: !status });
  }, [companyId]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Une seule ouverture : la mémoire (ou le compte) peut changer ensuite sans rouvrir.
  useEffect(() => {
    if (rid.current || !companyId) return;
    const id = peekPairRequest();
    if (!id) { onClose(); return; }
    rid.current = id;
    if (readSupportSession()) { clearPairRequest(); setPhase({ kind: 'support' }); return; }
    void lookup(id);
  }, [companyId, lookup, onClose]);

  const confirm = async (lk: Lookup, code: string, replace: boolean) => {
    if (!rid.current) return;
    setPhase({ kind: 'sending', lookup: lk, selected: code });
    const { data, error, code: errCode } = await callKiosk<{ ok?: boolean; available?: boolean }>({
      action: 'pair_confirm', request_id: rid.current, code: code.replace(/\s/g, ''), confirm: true, ...(replace ? { replace: true } : {}),
    });
    if (!alive.current) return;
    if (data?.available === false) { clearPairRequest(); setPhase({ kind: 'unavailable' }); return; }
    if (data?.ok) {
      clearPairRequest();
      setPhase({ kind: 'done' });
      return;
    }
    // La tablette est devenue « en service » entre-temps : le second geste, code déjà choisi.
    if (errCode === 'replace_required') { setPhase({ kind: 'choose', lookup: { ...lk, replaces: { alive: true, seen_ago_s: lk.replaces?.seen_ago_s ?? null } }, selected: code }); return; }
    clearPairRequest();
    setPhase({ kind: 'error', message: error || NETWORK_MESSAGE, retry: false });
  };

  const decline = async () => {
    const id = rid.current;
    if (id) await callKiosk({ action: 'pair_confirm', request_id: id, decline: true });
    if (alive.current) close();
  };

  // Après la confirmation : une tablette neuve est-elle apparue ? (toutes les 3 s, 30 s au plus)
  const done = phase.kind === 'done';
  useEffect(() => {
    if (!done) return;
    if (!companyId || !before.current) { setVerify('unknown'); return; }
    const known = before.current;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stale = false;
    const look = async () => {
      const ids = await readTabletIds(companyId);
      if (stale) return;
      if (!ids) { setVerify('unknown'); return; }
      if (Array.from(ids).some((id) => !known.has(id))) { setVerify('ok'); toast.success('Tablette reliée'); return; }
      if (Date.now() - startedAt >= VERIFY_FOR_MS) { setVerify('timeout'); return; }
      timer = setTimeout(look, VERIFY_EVERY_MS);
    };
    setVerify('checking');
    timer = setTimeout(look, VERIFY_EVERY_MS);
    return () => { stale = true; if (timer) clearTimeout(timer); };
  }, [done, companyId]);

  const busy = phase.kind === 'sending';
  const lk = phase.kind === 'choose' || phase.kind === 'sending' ? phase.lookup : null;
  const selected = phase.kind === 'choose' || phase.kind === 'sending' ? phase.selected : null;
  const replaces = lk?.replaces ?? null;
  const seen = replaces?.seen_ago_s != null ? ` (${seenLabel(replaces.seen_ago_s * 1000)})` : '';
  const choose = (c: string) => {
    if (!lk) return;
    if (replaces?.alive) setPhase({ kind: 'choose', lookup: lk, selected: c });
    else void confirm(lk, c, false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="bt-skin kpc max-w-md">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader>
          <DialogTitle>Associer cette tablette ?</DialogTitle>
          <DialogDescription className="sr-only">Touchez le code de vérification affiché sur la tablette pour la relier à votre entreprise.</DialogDescription>
        </DialogHeader>
        <div className="kpc-body" data-testid="kpc">
          {phase.kind === 'loading' && <p className="kpc-state" role="status">Recherche de la tablette…</p>}

          {phase.kind === 'support' && (
            <>
              <p className="kpc-p" data-testid="kpc-support">{SUPPORT_READONLY_MESSAGE}</p>
              <button type="button" className="kpc-btn plain" onClick={close}>Fermer</button>
            </>
          )}

          {phase.kind === 'unavailable' && (
            <>
              <p className="kpc-p" data-testid="kpc-unavailable">Cette fonction n’est pas encore disponible. Sur la tablette, tapez le code à 6 chiffres (bouton 📟 Borne).</p>
              <button type="button" className="kpc-btn plain" onClick={close}>Fermer</button>
            </>
          )}

          {phase.kind === 'error' && (
            <>
              <p className="kpc-err" role="alert" data-testid="kpc-error">{phase.message}</p>
              <div className="kpc-actions">
                {phase.retry && <button type="button" className="kpc-btn" onClick={() => { if (rid.current) void lookup(rid.current); }}>Réessayer</button>}
                <button type="button" className="kpc-btn plain" onClick={close}>Fermer</button>
              </div>
            </>
          )}

          {lk && (
            <>
              <p className="kpc-co" data-testid="kpc-company">Entreprise : {lk.company_name}</p>
              <p className="kpc-age" data-testid="kpc-age">QR affiché il y a {minutesLabel(lk.age_s)}</p>
              {selected && replaces?.alive ? (
                <div className="kpc-panel" data-testid="kpc-replace-panel">
                  <h3>Remplacer la tablette en service ?</h3>
                  <p className="kpc-p">Code choisi : <span className="kpc-picked">{selected}</span></p>
                  <p className="kpc-p">La tablette actuelle sera déconnectée dès que la nouvelle sera reliée.</p>
                  <div className="kpc-actions">
                    <button type="button" className="kpc-btn danger" data-testid="kpc-replace" disabled={busy} onClick={() => void confirm(lk, selected, true)}>Remplacer la tablette en service</button>
                    <button type="button" className="kpc-btn plain" disabled={busy} onClick={() => setPhase({ kind: 'choose', lookup: lk, selected: null })}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="kpc-p">La tablette affiche un code de vérification. Touchez le même.</p>
                  {replaces && (replaces.alive
                    ? <p className="kpc-warn" data-testid="kpc-alive">⚠ La tablette actuelle est en service{seen}. Elle sera déconnectée.</p>
                    : <p className="kpc-p" data-testid="kpc-dead">La tablette actuelle{seen} sera déconnectée.</p>)}
                  <div className="kpc-choices" role="group" aria-label="Codes proposés">
                    {lk.choices.map((c) => (
                      <button key={c} type="button" className="kpc-choice" data-testid="kpc-choice" aria-label={`Code ${c}`} disabled={busy} onClick={() => choose(c)}>{c}</button>
                    ))}
                  </div>
                </>
              )}
              <p className="kpc-p">Cette tablette affichera le planning de la semaine (prénoms, chantiers) et le QR de pointage.</p>
              <button type="button" className="kpc-text" disabled={busy} onClick={() => void decline()}>Non, ce n’est pas ma tablette</button>
            </>
          )}

          {phase.kind === 'done' && (
            <>
              <p className="kpc-ok" data-testid="kpc-done">C’est confirmé. Regardez la tablette : elle doit afficher le planning.</p>
              {verify === 'checking' && <p className="kpc-state" role="status">Vérification…</p>}
              {verify === 'ok' && <p className="kpc-state good" role="status" data-testid="kpc-verified">Tablette reliée.</p>}
              {verify === 'timeout' && <p className="kpc-err" role="alert" data-testid="kpc-timeout">La tablette n’a pas répondu : réveillez-la, sinon scannez de nouveau son QR.</p>}
              {verify !== 'checking' && <button type="button" className="kpc-btn" onClick={close}>Terminé</button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
