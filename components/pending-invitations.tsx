'use client';

// Invitations en attente, au-dessus du planning du bureau.
//
// AVANT : une ligne jaune par invitation, dépliée en permanence. Avec une équipe
// de 15 personnes préparée d'un coup, le planning descendait hors de l'écran et
// le patron voyait 15 alertes. MAINTENANT : une seule ligne, repliée par défaut
// (« 15 salariés n'ont pas encore activé leur compte · Voir la liste ») ; le
// planning reste visible dès l'arrivée.
//
// Dans la liste dépliée :
//   - jamais envoyée → « Envoyer l'invitation » ;
//   - déjà envoyée   → « Invitée le JJ/MM » + « Renvoyer » ;
//   - ✕ demande confirmation (le serveur supprime aussi le compte de l'invité
//     s'il ne s'est jamais connecté) ;
//   - « Envoyer toutes les invitations » demande confirmation (« Envoyer
//     15 e-mails ? ») puis envoie une par une, en s'arrêtant à la première erreur.
//
// TANT QUE LES DATES D'ENVOI NE SONT PAS LUES, on ne sait pas qui a déjà reçu
// l'invitation : l'envoi groupé reste bloqué (sinon « Envoyer 15 e-mails ? »
// viserait des gens déjà invités, et chaque renvoi rend leur ancien lien caduc).
// Lecture impossible → bouton de ligne « Envoyer / renvoyer », groupé désactivé.
//
// DEUX EXEMPLAIRES (ordinateur et téléphone) sont montés en même temps : un seul
// verrou, au niveau du module, empêche deux envois en parallèle.
//
// PRÉVIEW = VRAIE BASE. Une préview (Cloudflare, Netlify, localhost) lit et écrit
// la base de production : un clic de vérification y enverrait de vrais e-mails à
// de vrais salariés, ou supprimerait leur compte. Sur une préview, ces boutons
// SIMULENT donc l'action (rien n'est appelé) et le disent.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2, Mail, X } from 'lucide-react';
import type { Invitation } from '@/lib/types';
import { isPreviewHost } from '@/lib/hosting';
import { fetchInvitationsSentAt, functionErrorMessage, resendInvitation, revokeInvitation } from '@/lib/admin-writes';

interface Props {
  companyId: string;
  invitations: Invitation[];
  /** Après un envoi ou une suppression : relire les invitations (et l'équipe). */
  onChanged: () => void;
}

const CSS = `
.bt-inv{background:#FBF8F2;border-bottom:1px solid rgba(21,18,15,.1);font-family:inherit}
.bt-inv-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;min-height:40px;font-size:13.5px;font-weight:600;color:#3a352f;line-height:1.3}
.bt-inv-bar svg{flex:none;color:#8a8378}
.bt-inv-count{min-width:0}
.bt-inv-toggle{flex:none;display:inline-flex;align-items:center;gap:3px;background:none;border:none;padding:6px 4px;margin:-6px 0;cursor:pointer;font:inherit;font-weight:800;color:#15120F;text-decoration:underline;text-decoration-color:#FFC21A;text-decoration-thickness:2px;text-underline-offset:3px}
.bt-inv-toggle svg{color:#15120F}
.bt-inv-panel{padding:2px 16px 12px}
.bt-inv-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.bt-inv-sim{font-size:12px;font-weight:600;color:#7a5e00;background:#FFF1CC;border:1px solid #E8CE7A;border-radius:8px;padding:5px 9px}
.bt-inv-all{display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font:inherit;font-weight:800;font-size:13.5px;padding:8px 14px;border-radius:10px;box-shadow:0 3px 0 #C99300;margin-left:auto}
.bt-inv-all:disabled{opacity:.6;cursor:default}
.bt-inv-list{list-style:none;margin:0;padding:0;max-height:min(46vh,420px);overflow-y:auto;border:1px solid rgba(21,18,15,.1);border-radius:12px;background:#fff}
.bt-inv-row{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 12px;border-top:1px solid rgba(21,18,15,.07)}
.bt-inv-row:first-child{border-top:none}
.bt-inv-who{flex:1;min-width:0}
.bt-inv-who b{display:block;font-size:13.5px;font-weight:800;color:#15120F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-inv-who small{display:block;font-size:12px;color:#8a8378;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-inv-act{flex:none;display:flex;align-items:center;gap:6px}
.bt-inv-when{font-size:12px;font-weight:600;color:#1f7a4d;white-space:nowrap}
.bt-inv-btn{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border:1.5px solid rgba(21,18,15,.25);background:#fff;color:#15120F;font:inherit;font-weight:800;font-size:12.5px;padding:6px 10px;border-radius:9px;cursor:pointer;min-height:34px}
.bt-inv-btn:hover{border-color:#15120F}
.bt-inv-btn:disabled,.bt-inv-x:disabled{opacity:.5;cursor:default}
.bt-inv-x{flex:none;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:9px;color:#B5472E;cursor:pointer}
.bt-inv-x:hover{background:rgba(181,71,46,.08)}
.bt-inv-warn{font-size:12.5px;font-weight:600;color:#9a2820;background:#fce8e6;border:1px solid #f3b4ad;border-radius:8px;padding:6px 10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bt-inv-warn button{background:none;border:none;padding:0;font:inherit;font-weight:800;color:#15120F;text-decoration:underline;cursor:pointer}
@media (max-width:560px){
  .bt-inv-bar{padding:8px 12px;flex-wrap:wrap;row-gap:2px}
  .bt-inv-sep{display:none}
  .bt-inv-panel{padding:2px 10px 10px}
  .bt-inv-row{flex-wrap:wrap;row-gap:6px}
  .bt-inv-who{flex-basis:calc(100% - 44px)}
  .bt-inv-act{flex-basis:100%;justify-content:flex-end}
  .bt-inv-x{order:0}
}
`;
// Objet FIXE : un `{ __html }` neuf à chaque rendu ferait réécrire la feuille.
const CSS_HTML = { __html: CSS };

/** Un renvoi groupé ne vise pas une invitation partie il y a moins de 10 min. */
const RECENT_MS = 10 * 60 * 1000;

// Verrou commun aux deux exemplaires (ordinateur / téléphone) : un seul envoi à la fois.
let lockBusy = false;
const lockListeners = new Set<(busy: boolean) => void>();
const setLock = (busy: boolean) => { lockBusy = busy; lockListeners.forEach((f) => f(busy)); };

type SentState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; map: Map<string, string | null> };

const fullName = (inv: Invitation) => `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || inv.email;
const ddmm = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PendingInvitations({ companyId, invitations, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  // Date du dernier envoi, par adresse en minuscules (absente = jamais envoyée).
  const [sent, setSent] = useState<SentState>({ kind: 'loading' });
  const [busy1, setBusy1] = useState<{ email: string; kind: 'send' | 'remove' } | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [locked, setLocked] = useState(lockBusy);
  const simulate = useMemo(() => isPreviewHost(), []);

  useEffect(() => {
    lockListeners.add(setLocked);
    return () => { lockListeners.delete(setLocked); };
  }, []);

  const list = invitations.filter((inv) => !!inv.email);
  const n = list.length;
  // Relire les dates quand la liste change (un envoi recrée l'invitation).
  const listKey = list.map((i) => `${i.email}|${i.created_at}`).sort().join(',');

  const loadSent = useCallback(async () => {
    try {
      const map = await fetchInvitationsSentAt();
      setSent({ kind: 'ok', map });
    } catch (err) {
      console.error('Lecture des dates d’envoi impossible :', err);
      // Une relecture qui échoue garde les dates déjà connues.
      setSent((prev) => (prev.kind === 'ok' ? prev : { kind: 'error' }));
    }
  }, []);

  // Lecture seule : faite aussi sur une préview (seuls les envois y sont simulés).
  useEffect(() => {
    if (open && n > 0) loadSent();
  }, [open, n, listKey, loadSent]);

  if (n === 0) return null;

  const known = sent.kind === 'ok';
  /** Date du dernier envoi ; `null` = jamais envoyée ; `undefined` = on ne sait pas. */
  const sentOf = (inv: Invitation): string | null | undefined =>
    sent.kind === 'ok' ? (sent.map.get(inv.email.toLowerCase()) ?? null) : undefined;
  const markSent = (emails: string[]) => setSent((prev) => {
    const next = new Map(prev.kind === 'ok' ? prev.map : []);
    const now = new Date().toISOString();
    for (const e of emails) next.set(e.toLowerCase(), now);
    return { kind: 'ok', map: next };
  });

  const unsent = known ? list.filter((inv) => sentOf(inv) === null) : [];
  // Mode « Renvoyer » : pas celles qui viennent de partir (reprise après une erreur).
  const resendable = known ? list.filter((inv) => { const at = sentOf(inv); return !at || Date.now() - Date.parse(at) > RECENT_MS; }) : [];
  const bulkTargets = unsent.length > 0 ? unsent : resendable;
  const bulkVerb = unsent.length > 0 ? 'Envoyer' : 'Renvoyer';
  const bulkLabel = !known ? (sent.kind === 'loading' ? 'Lecture des dates d’envoi…' : 'Envoyer toutes les invitations')
    : unsent.length === n ? 'Envoyer toutes les invitations'
    : unsent.length > 1 ? `Envoyer les ${unsent.length} invitations non envoyées`
    : unsent.length === 1 ? 'Envoyer l’invitation non envoyée'
    : resendable.length === n ? 'Renvoyer toutes les invitations'
    : resendable.length > 1 ? `Renvoyer les ${resendable.length} autres invitations`
    : resendable.length === 1 ? 'Renvoyer l’autre invitation'
    : 'Invitations envoyées à l’instant';

  const take = () => { if (lockBusy) { toast.info('Un envoi est déjà en cours.'); return false; } setLock(true); return true; };

  const sendOne = async (inv: Invitation) => {
    if (!take()) return;
    const already = !!sentOf(inv);
    setBusy1({ email: inv.email, kind: 'send' });
    try {
      if (simulate) {
        await sleep(300);
        markSent([inv.email]);
        toast.success(`Préview : envoi simulé à ${fullName(inv)}. Aucun e-mail n’est parti.`);
        return;
      }
      await resendInvitation(companyId, inv);
      markSent([inv.email]);
      toast.success(already ? `Invitation renvoyée à ${fullName(inv)}` : `Invitation envoyée à ${fullName(inv)}`);
      onChanged();
    } catch (err) {
      console.error('Envoi de l’invitation impossible :', err);
      toast.error(await functionErrorMessage(err, `Impossible d’envoyer l’invitation à ${fullName(inv)}`));
      onChanged();
    } finally {
      setBusy1(null);
      setLock(false);
    }
  };

  const removeOne = async (inv: Invitation) => {
    if (lockBusy) { toast.info('Un envoi est déjà en cours.'); return; }
    const ok = window.confirm(
      `Supprimer l’invitation de ${fullName(inv)} ?\n\n`
      + 'Son compte sera supprimé s’il ne s’est jamais connecté. Vous pourrez l’inviter à nouveau plus tard.',
    );
    if (!ok || !take()) return;
    setBusy1({ email: inv.email, kind: 'remove' });
    try {
      if (simulate) {
        await sleep(300);
        toast.success(`Préview : suppression simulée pour ${fullName(inv)}. Rien n’a été supprimé.`);
        return;
      }
      await revokeInvitation(inv.email);
      toast.success(`Invitation de ${fullName(inv)} supprimée`);
      onChanged();
    } catch (err) {
      console.error('Suppression de l’invitation impossible :', err);
      toast.error(await functionErrorMessage(err, 'Impossible de supprimer l’invitation'));
    } finally {
      setBusy1(null);
      setLock(false);
    }
  };

  const sendAll = async () => {
    if (lockBusy) { toast.info('Un envoi est déjà en cours.'); return; }
    if (!known || bulkTargets.length === 0) return; // dates inconnues : jamais d'envoi groupé à l'aveugle
    const targets = [...bulkTargets]; // la liste se recrée pendant l'envoi : on fige la cible
    const total = targets.length;
    const ok = window.confirm(
      `${bulkVerb} ${total} e-mail${total > 1 ? 's' : ''} ?\n\n`
      + 'Chaque salarié reçoit un lien valable 24 h pour créer son mot de passe.',
    );
    if (!ok || !take()) return;
    let done = 0;
    let failure: { inv: Invitation; message: string } | null = null;
    try {
      for (const inv of targets) {
        setBulk({ done, total });
        try {
          if (simulate) await sleep(150);
          else await resendInvitation(companyId, inv);
        } catch (err) {
          console.error('Envoi groupé interrompu :', err);
          failure = { inv, message: await functionErrorMessage(err, 'envoi impossible') };
          break;
        }
        done++;
        markSent([inv.email]);
        // Un petit temps entre deux e-mails : le serveur d'envoi limite le débit.
        if (!simulate && done < total) await sleep(350);
      }
    } finally {
      setBulk(null);
      setLock(false);
    }
    if (simulate) {
      toast.success(`Préview : ${done} envois simulés. Aucun e-mail n’est parti.`);
      return;
    }
    if (failure) {
      const rest = total - done - 1;
      toast.error(
        `${done} invitation${done > 1 ? 's' : ''} envoyée${done > 1 ? 's' : ''} sur ${total}. `
        + `Échec pour ${fullName(failure.inv)} : ${failure.message}.`
        + (rest > 0 ? ` Les ${rest} suivante${rest > 1 ? 's' : ''} n’${rest > 1 ? 'ont' : 'a'} pas été envoyée${rest > 1 ? 's' : ''} : réessayez plus tard.` : ''),
        { duration: 12000 },
      );
    } else {
      toast.success(`${done} invitation${done > 1 ? 's' : ''} envoyée${done > 1 ? 's' : ''} ✅`);
    }
    onChanged();
    loadSent();
  };

  const busy = locked || !!busy1 || !!bulk;

  return (
    <div className="bt-inv" data-testid="pending-invitations">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <div className="bt-inv-bar">
        <Mail className="h-4 w-4" aria-hidden="true" />
        <span className="bt-inv-count" data-testid="inv-count">
          {n === 1 ? '1 salarié n’a pas encore activé son compte' : `${n} salariés n’ont pas encore activé leur compte`}
        </span>
        <span className="bt-inv-sep" aria-hidden="true">·</span>
        <button type="button" className="bt-inv-toggle" aria-expanded={open} aria-controls="bt-inv-panel" onClick={() => setOpen((v) => !v)} data-testid="inv-toggle">
          {open ? 'Masquer la liste' : 'Voir la liste'}
          {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div className="bt-inv-panel" id="bt-inv-panel">
          <div className="bt-inv-head">
            {simulate && <span className="bt-inv-sim" data-testid="inv-sim">Préview : envois et suppressions simulés, aucun e-mail ne part.</span>}
            {sent.kind === 'error' && (
              <span className="bt-inv-warn" role="alert" data-testid="inv-dates-ko">
                Dates d’envoi indisponibles : impossible de savoir qui a déjà reçu l’invitation.
                <button type="button" onClick={() => { setSent({ kind: 'loading' }); loadSent(); }}>Réessayer</button>
              </span>
            )}
            {n >= 2 && (
              <button type="button" className="bt-inv-all" onClick={sendAll} disabled={busy || !known || bulkTargets.length === 0} data-testid="inv-send-all"
                title={!known ? 'Disponible quand les dates d’envoi sont connues' : undefined}>
                {bulk ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Envoi {Math.min(bulk.done + 1, bulk.total)}/{bulk.total}…</> : bulkLabel}
              </button>
            )}
          </div>
          <ul className="bt-inv-list">
            {list.map((inv) => {
              const when = sentOf(inv);
              const mine = busy1?.email === inv.email;
              return (
                <li key={inv.id} className="bt-inv-row" data-testid="inv-row" data-email={inv.email}>
                  <div className="bt-inv-who">
                    <b>{fullName(inv)}</b>
                    <small>{inv.email}</small>
                  </div>
                  <div className="bt-inv-act">
                    {when && <span className="bt-inv-when" data-testid="inv-when">Invitée le {ddmm(when)}</span>}
                    <button type="button" className="bt-inv-btn" onClick={() => sendOne(inv)} disabled={busy || sent.kind === 'loading'} data-testid="inv-send">
                      {mine && busy1?.kind === 'send' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {sent.kind === 'loading' ? '…' : sent.kind === 'error' ? 'Envoyer / renvoyer' : when ? 'Renvoyer' : 'Envoyer l’invitation'}
                    </button>
                    <button type="button" className="bt-inv-x" onClick={() => removeOne(inv)} disabled={busy} aria-label={`Supprimer l’invitation de ${fullName(inv)}`} title="Supprimer l’invitation" data-testid="inv-remove">
                      {mine && busy1?.kind === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
