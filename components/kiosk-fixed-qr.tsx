'use client';

// Lot 12 — « QR fixe à imprimer » : une section repliée de la fenêtre « Borne
// de pointage » du bureau (components/kiosk-admin.tsx), chargée seulement à
// l'ouverture de la fenêtre.
//
// OPTION DÉSACTIVÉE PAR DÉFAUT, « moins sécurisé » écrit en clair :
//   · « Activer le QR fixe… » → confirmation (rappels RGPD, CSE, jurisprudence)
//     → « Oui, activer » ;
//   · « Poser le point ici » : depuis le téléphone du bureau, À L'ENDROIT DU QR
//     (précision 100 m ou mieux, sinon on le dit et on redemande) ; rayon
//     100 / 200 / 500 / 1 000 m (200 m par défaut) ;
//   · « Imprimer » : une feuille A4 (nom de l'entreprise, « QR fixe — moins
//     sécurisé », date, référence courte), dans une fenêtre à part ;
//   · « Régénérer… » (l'ancien QR imprimé cesse aussitôt de marcher) et
//     « Désactiver… », chacun avec sa confirmation sur place.
//   · « Puce NFC » : le MÊME lien que le QR fixe, écrit sur une puce
//     autocollante (NTAG213/215/216). Écrire : Android + Chrome seulement
//     (Web NFC) ; sinon un mini-guide iPhone avec l'appli gratuite NFC Tools.
//     Lire : tout téléphone récent (iPhone et Android), sans appli — le
//     salarié approche son téléphone et retombe sur /pointer#f=…, donc même
//     connexion, même position au scan, même réglage par chantier. Régénérer
//     le QR fixe rend aussi la puce inutile : il faut la réécrire.
//
// CE QUE VAUT LA ZONE, DIT EN CLAIR AU PATRON : la position est DÉCLARÉE par le
// téléphone du salarié ; elle peut être falsifiée (coordonnées simulées sur un
// navigateur, appel direct à la fonction). C'est un FREIN contre la photo du QR
// utilisée de chez soi, PAS une preuve de présence. « Dans la zone : oui » (liste
// des derniers pointages ci-dessous) est lu avec cette réserve.
//
// Borne COUPÉE par BEMEXO (kiosk_enabled faux) : la section reste utile pour
// COUPER le QR imprimé — le désactiver, le régénérer — jamais pour l'activer,
// poser le point ou changer le rayon (la fonction kiosk les refuse). Elle est
// alors montrée aussi dans Réglages → Borne & pointage (components/company-settings.tsx),
// où la fenêtre « Borne » n'existe plus.
//
// Toutes les écritures passent par la fonction `kiosk` (rôle admin et
// interrupteur revérifiés). Migration absente ou ancienne fonction : la
// section ne s'affiche pas du tout (l'appli reste exactement comme avant).
// Le QR de la tablette, qui change chaque minute, n'est pas touché.
// Ce composant porte sa propre feuille de style (il sert aussi hors de la
// fenêtre « Borne »).

import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { callKiosk, type FixedQrStatus } from '@/lib/kiosk-client';
import { demanderPosition, fmtPrecision } from '@/lib/position';
import {
  fixedAlternative, fixedQrUrl, lowerFirst, FIXED_QR_POINT_MAX_ACCURACY_M, FIXED_QR_RADIUS_CHOICES,
} from '@/supabase/functions/_shared/fixed-qr';

const CSS = `
.kf-sec{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:12px 14px;font-family:'Archivo',sans-serif;color:#15120F;min-width:0}
.kf-head{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left;min-width:0}
.kf-title{display:block;margin:0;flex:1;min-width:0;font-weight:800;font-size:14px}
.kf-title small{font-weight:600;color:#9a948a;font-size:13px}
.kf-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#fff;border-radius:10px;padding:6px 11px;font-weight:800;font-size:13px;color:#15120F;cursor:pointer;font-family:inherit;white-space:nowrap}
.kf-btn.danger{border-color:rgba(192,70,31,.45);color:#C0461F}
.kf-btn:disabled{opacity:.6;cursor:default}
.kf-chip{border:1.5px solid rgba(21,18,15,.22);background:#fff;border-radius:99px;padding:7px 12px;font:inherit;font-size:13px;font-weight:800;color:#15120F;cursor:pointer;white-space:nowrap}
.kf-chip[aria-pressed=true]{background:#FFC21A;border-color:#FFC21A}
.kf-chip:disabled{opacity:.6;cursor:default}
.kf-badge{font-size:12px;font-weight:800;color:#8a8378;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:99px;padding:3px 9px;white-space:nowrap}
.kf-badge.on{color:#8A3A12;background:#FDEBD9;border-color:#F3C9A6}
.kf-chev{width:18px;height:18px;flex:none;color:#8a8378;transition:transform .15s ease}
.kf-head[aria-expanded=true] .kf-chev{transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){.kf-chev{transition:none}}
.kf-body{display:flex;flex-direction:column;gap:10px;margin-top:10px;font-size:13.5px;line-height:1.45;color:#3b362f}
.kf-warn{margin:0;background:#FDF3E7;border:1px solid #F3C9A6;border-radius:10px;padding:8px 10px;color:#6B3410;font-weight:600}
.kf-warn b{color:#8A3A12}
.kf-confirm{background:#fff;border:1.5px solid #15120F;border-radius:12px;padding:10px 12px}
.kf-confirm ul{margin:6px 0 10px;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.kf-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.kf-qrrow{display:flex;align-items:flex-start;gap:12px;min-width:0}
.kf-qr{width:92px;height:92px;flex:none;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:10px;padding:6px}
.kf-qr svg{width:100%;height:100%;display:block}
.kf-side{display:flex;flex-direction:column;gap:6px;min-width:0}
.kf-meta{margin:0;color:#8a8378;font-weight:600;font-size:12.5px}
.kf-sub{border-top:1px solid rgba(21,18,15,.08);padding-top:10px}
.kf-sub-t{font-weight:800;margin:0 0 4px;color:#15120F}
.kf-msg{margin:6px 0 0;font-size:12.5px;font-weight:700;min-height:1.2em;color:#8a8378}
.kf-msg.ok{color:#1F7A4D}
.kf-msg.bad{color:#C0461F}
.kf-link{background:none;border:0;padding:2px 0;font:inherit;font-size:13px;font-weight:700;color:#8a8378;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left}
.kf-link:hover{color:#C0461F}
.kf-cut{margin:0;background:#FBE9E5;border:1px solid #F0B8AD;border-radius:10px;padding:8px 10px;color:#8A2A12;font-weight:700}
.kf-steps{margin:6px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
.kf-url{display:block;margin:6px 0 0;padding:6px 8px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;overflow-wrap:anywhere;user-select:all}
.kf-recent summary{cursor:pointer;font-weight:800;color:#15120F}
.kf-recent ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:5px;max-height:220px;overflow:auto}
.kf-recent li{font-size:13px;line-height:1.35}
.kf-recent li b{font-weight:800}
`;
const CSS_HTML = { __html: CSS };

// Dit franchement ce que la zone vaut : un frein, pas une preuve (la position est donnée par le téléphone).
const WARNING = 'une photo de ce QR permet de pointer à toute heure. Le salarié doit être connecté à son compte et son téléphone envoie sa position au moment du scan, mais cette position est déclarée par le téléphone et peut être falsifiée : la zone est un frein, pas une preuve de présence.';
const TABLET_STAYS = ' Le QR de la tablette, qui change chaque minute, reste disponible.'; // pas dit borne coupée : la tablette l'est aussi
const NO_TABLET = 'Aucune tablette n’est reliée : le QR fixe serait le seul pointage en direct (le chrono du téléphone n’est plus proposé), et un salarié qui refuse sa position ne pourrait qu’ajouter son intervention à la main. Reliez d’abord la tablette pour garder un autre moyen de pointer.';

const frDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');
const frTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) : '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** La feuille A4, dans une fenêtre à part (la page du bureau n'est pas imprimée). */
function printSheet(st: FixedQrStatus, url: string) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Fenêtre bloquée : autorisez les fenêtres de ce site pour imprimer.'); return; }
  const company = esc(st.company_name || '');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QR fixe — ${company}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page{size:A4 portrait;margin:14mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,system-ui,sans-serif;color:#15120F;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:182mm;margin:0 auto;padding:6mm 0;text-align:center}
h1{font-size:30pt;font-weight:900;letter-spacing:-.02em;margin:0 0 3mm;line-height:1.1;overflow-wrap:anywhere}
.tag{display:inline-block;margin:0 0 8mm;padding:2mm 5mm;border:1.5px solid #C0461F;border-radius:99px;color:#C0461F;font-weight:800;font-size:13pt}
.qr{width:120mm;height:120mm;margin:0 auto 8mm}
.qr svg{width:100%;height:100%;display:block}
.how{font-size:14pt;font-weight:700;margin:0 auto 4mm;max-width:160mm;line-height:1.35}
.geo{font-size:11pt;color:#4a453e;margin:0 auto 8mm;max-width:160mm;line-height:1.4}
.meta{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5pt;color:#6E6A63;margin:0}
.noprint{margin:8mm auto 0;text-align:center}
.noprint button{font:inherit;font-weight:800;font-size:12pt;border:1.5px solid #15120F;background:#fff;border-radius:10px;padding:2.5mm 6mm;cursor:pointer}
@media print{.noprint{display:none}}
</style></head><body>
<main class="sheet" data-testid="fixed-sheet">
<h1>${company}</h1>
<p class="tag">QR fixe — moins sécurisé</p>
<div class="qr" data-url="${esc(url)}">${qrSvg(url)}</div>
<p class="how">Pour pointer votre arrivée ou votre départ : scannez ce QR avec l’appareil photo de votre téléphone, ou avec le scanner de l’appli BEMEXO.</p>
<p class="geo">Votre position est lue une seule fois, au moment du scan, pour vérifier que vous êtes près de l’entreprise. Elle n’est pas gardée. Vous pouvez refuser : ${esc(lowerFirst(fixedAlternative(st.has_tablet)))}</p>
<p class="meta">Imprimé le ${esc(new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }))} · Réf. ${esc(st.ref || '')}</p>
</main>
<div class="noprint"><button type="button" onclick="window.print()">Imprimer</button></div>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Laisser la feuille se dessiner avant la fenêtre d'impression (polices du
  // système : rien à télécharger, l'impression ne dépend pas du réseau).
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* le bouton « Imprimer » de la feuille reste */ } }, 350);
}

// Web NFC (Android + Chrome seulement) : pas encore dans les types de TypeScript.
type NdefWriter = { write: (msg: { records: { recordType: 'url'; data: string }[] }, opts?: { signal?: AbortSignal }) => Promise<void> };
const nfcWriter = (): NdefWriter | null => {
  const C = typeof window !== 'undefined' ? (window as unknown as { NDEFReader?: new () => NdefWriter }).NDEFReader : undefined;
  return C ? new C() : null;
};

/**
 * « Puce NFC » : écrire le lien du QR fixe (exactement le même) sur une puce
 * autocollante. Android + Chrome : directement d'ici. Ailleurs (iPhone,
 * ordinateur) : copier le lien et l'écrire avec NFC Tools (gratuit).
 */
function NfcChip({ url }: { url: string }) {
  const canWrite = typeof window !== 'undefined' && 'NDEFReader' in window;
  const [msg, setMsg] = useState<Msg>(null);
  const [waiting, setWaiting] = useState<AbortController | null>(null);
  const [guide, setGuide] = useState(!canWrite);
  useEffect(() => () => waiting?.abort(), [waiting]);

  const write = async () => {
    const w = nfcWriter();
    if (!w) { setGuide(true); return; }
    const ctrl = new AbortController();
    setWaiting(ctrl);
    setMsg({ tone: '', text: 'Approchez la puce du dos du téléphone et ne bougez plus…' });
    try {
      await w.write({ records: [{ recordType: 'url', data: url }] }, { signal: ctrl.signal });
      setMsg({ tone: 'ok', text: '✓ Lien écrit sur la puce. Testez-la : approchez un téléphone, la page de pointage doit s’ouvrir.' });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setMsg(name === 'AbortError' ? null : {
        tone: 'bad',
        text: name === 'NotAllowedError'
          ? 'NFC refusé : autorisez le NFC pour ce site (et activez le NFC du téléphone), puis réessayez.'
          : 'Écriture impossible : puce verrouillée, trop petite ou retirée trop tôt. Réessayez en la tenant immobile.',
      });
    } finally { setWaiting(null); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Lien copié.'); }
    catch { toast.error('Copie impossible : sélectionnez le lien ci-dessous et copiez-le.'); }
  };

  return (
    <div className="kf-sub" data-testid="kf-nfc">
      <p className="kf-sub-t">Puce NFC</p>
      <p style={{ margin: 0 }}>
        Une puce autocollante (type NTAG213, quelques euros) qui contient <b>le même lien que ce QR fixe</b>. Le salarié approche son téléphone
        (iPhone ou Android, sans appli) : même connexion, même lecture de la position au moment du pointage. Régénérer le QR fixe rend aussi la puce inutile : il faut la réécrire.
      </p>
      <div className="kf-row" style={{ marginTop: 8 }}>
        {canWrite && (waiting
          ? <button type="button" className="kf-btn" data-testid="kf-nfc-cancel" onClick={() => waiting.abort()}>Annuler</button>
          : <button type="button" className="kf-btn" data-testid="kf-nfc-write" onClick={() => void write()}>Écrire le lien sur une puce</button>)}
        <button type="button" className="kf-btn" data-testid="kf-nfc-copy" onClick={() => void copy()}>Copier le lien</button>
        {canWrite && <button type="button" className="kf-link" data-testid="kf-nfc-guide-toggle" onClick={() => setGuide((g) => !g)}>Sur iPhone ?</button>}
      </div>
      <p className={`kf-msg${msg?.tone ? ` ${msg.tone}` : ''}`} data-testid="kf-nfc-msg" aria-live="polite">{msg?.text ?? ''}</p>
      {guide && (
        <div data-testid="kf-nfc-guide">
          <p style={{ margin: 0 }}>
            {canWrite ? 'Sur iPhone' : 'Écrire depuis ce navigateur n’est possible qu’avec Chrome sur Android. Sur iPhone'}, avec l’appli gratuite <b>NFC Tools</b> :
          </p>
          <ol className="kf-steps">
            <li>Copiez le lien ci-dessus (bouton « Copier le lien »), ou ouvrez cette page sur l’iPhone.</li>
            <li>Ouvrez NFC Tools → <b>Écrire</b> → <b>Ajouter un enregistrement</b> → <b>URL / URI</b>.</li>
            <li>Collez le lien en entier, puis validez.</li>
            <li>Touchez <b>Écrire</b> et approchez la puce du haut de l’iPhone.</li>
            <li>Testez : approchez un téléphone, la page de pointage BEMEXO doit s’ouvrir.</li>
          </ol>
          <code className="kf-url" data-testid="kf-nfc-url">{url}</code>
        </div>
      )}
    </div>
  );
}

type Confirm = null | 'enable' | 'regenerate' | 'disable';
type Msg = { tone: '' | 'ok' | 'bad'; text: string } | null;

export default function KioskFixedQr({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [st, setSt] = useState<FixedQrStatus | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [pointMsg, setPointMsg] = useState<Msg>(null);

  useEffect(() => {
    let off = false;
    // Ancienne fonction (« Action inconnue ») ou migration absente : rien à montrer.
    void callKiosk<FixedQrStatus>({ action: 'fixed_status' }).then(({ data }) => { if (!off) setSt(data ?? { available: false }); });
    return () => { off = true; };
  }, []);

  const url = st?.token ? fixedQrUrl(window.location.origin, st.token) : null;
  const qrHtml = useMemo(() => (url ? { __html: qrSvg(url) } : null), [url]);

  if (!st?.available) return null;
  const enabled = !!st.enabled;
  // Borne coupée par BEMEXO : on ne peut que couper le QR fixe (désactiver, régénérer).
  const cut = st.kiosk_enabled === false;

  const act = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    const { data, error } = await callKiosk<FixedQrStatus>(body);
    setBusy(false);
    if (!data?.available) { toast.error(error || 'Action impossible. Réessayez.'); return false; }
    setSt(data);
    setConfirm(null);
    if (done) toast.success(done);
    return true;
  };

  const setPoint = async () => {
    setPointMsg({ tone: '', text: 'Lecture de la position (une seule fois)…' });
    const pos = await demanderPosition(15000);
    if (!pos) { setPointMsg({ tone: 'bad', text: 'Position indisponible : autorisez la localisation pour ce site, puis réessayez.' }); return; }
    if (pos.accuracy == null || pos.accuracy > FIXED_QR_POINT_MAX_ACCURACY_M) {
      setPointMsg({ tone: 'bad', text: `Précision insuffisante (${fmtPrecision(pos.accuracy)}) : il faut 100 m ou mieux. Approchez-vous d’une fenêtre ou sortez, puis réessayez.` });
      return;
    }
    setBusy(true);
    const { data, error } = await callKiosk<FixedQrStatus>({ action: 'fixed_point', lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    setBusy(false);
    if (!data?.available) { setPointMsg({ tone: 'bad', text: error || 'Enregistrement impossible. Réessayez.' }); return; }
    setSt(data);
    setPointMsg({ tone: 'ok', text: `✓ Point posé (${fmtPrecision(pos.accuracy)}).` });
  };

  const point = st.point;
  const recent = st.recent ?? [];
  return (
    <div className="kf-sec" data-testid="kf">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <button type="button" className="kf-head" aria-expanded={open} data-testid="kf-head" onClick={() => setOpen((o) => !o)}>
        <span className="kf-title">QR fixe à imprimer <small>(option)</small></span>
        <span className={`kf-badge${enabled ? ' on' : ''}`} data-testid="kf-badge">{enabled ? `Activé · réf. ${st.ref}` : 'Désactivé'}</span>
        <ChevronDown className="kf-chev" aria-hidden="true" />
      </button>

      {open && (
        <div className="kf-body">
          <p className="kf-warn" data-testid="kf-warn"><b>Moins sécurisé :</b> {WARNING}{cut ? '' : TABLET_STAYS}</p>
          {cut && (
            <p className="kf-cut" data-testid="kf-cut" role="status">
              La borne est coupée par BEMEXO : ce QR fixe ne marche pas pour l’instant{enabled ? ' (il remarchera si la borne est rallumée)' : ''}. Vous pouvez
              {enabled ? ' le désactiver ou le régénérer' : ' seulement le laisser désactivé'}, pas l’activer ni changer le point ou le rayon.
            </p>
          )}
          {!cut && st.has_tablet === false && <p className="kf-warn" data-testid="kf-no-tablet">{NO_TABLET}</p>}

          {!enabled && !cut && confirm !== 'enable' && (
            <div className="kf-row">
              <button type="button" className="kf-btn" data-testid="kf-enable" onClick={() => setConfirm('enable')}>Activer le QR fixe…</button>
            </div>
          )}

          {!enabled && !cut && confirm === 'enable' && (
            <div className="kf-confirm" data-testid="kf-confirm" role="group" aria-label="Confirmer l’activation du QR fixe">
              <b>Avant d’activer</b>
              <ul>
                <li><b>La zone est un frein, pas une preuve.</b> La position est déclarée par le téléphone du salarié et peut être falsifiée : « dans la zone : oui » ne prouve pas qu’il était sur place.</li>
                <li>Informez vos salariés (un écran d’information leur est montré au premier scan de chaque compte), inscrivez ce traitement à votre registre RGPD et consultez le CSE s’il existe.</li>
                <li>La position n’est lue qu’au moment du scan, jamais en continu. Aucune coordonnée du salarié n’est gardée : seulement « dans la zone : oui », que vous pouvez relire ici.</li>
                <li>La justice n’admet la géolocalisation pour contrôler le temps de travail que s’il n’existe pas d’autre moyen : {st.has_tablet === false ? 'la saisie à la main reste toujours proposée (aucune tablette n’est reliée pour l’instant).' : 'le QR de la tablette et la saisie à la main restent toujours proposés.'}</li>
              </ul>
              <div className="kf-row">
                <button type="button" className="kf-btn" data-testid="kf-confirm-yes" disabled={busy}
                  onClick={() => void act({ action: 'fixed_enable', confirm: true }, 'QR fixe activé. Posez maintenant le point de référence.')}>
                  {busy ? 'Activation…' : 'Oui, activer'}
                </button>
                <button type="button" className="kf-btn" data-testid="kf-confirm-no" disabled={busy} onClick={() => setConfirm(null)}>Annuler</button>
              </div>
            </div>
          )}

          {enabled && (
            <>
              <div className="kf-qrrow">
                {qrHtml && <div className="kf-qr" data-testid="kf-qr" data-url={url ?? undefined} role="img" aria-label="QR fixe à imprimer" dangerouslySetInnerHTML={qrHtml} />}
                <div className="kf-side">
                  <p className="kf-meta" data-testid="kf-meta">
                    Réf. {st.ref} · créé le {frDate(st.created_at)}
                    {typeof st.uses_7d === 'number' ? ` · ${st.uses_7d === 0 ? 'aucun pointage' : st.uses_7d === 1 ? '1 pointage' : `${st.uses_7d} pointages`} ces 7 derniers jours` : ''}
                  </p>
                  {!cut && (
                    <div className="kf-row">
                      <button type="button" className="kf-btn" data-testid="kf-print" onClick={() => url && printSheet(st, url)}>Imprimer</button>
                    </div>
                  )}
                  {confirm === null && (
                    <div className="kf-row">
                      <button type="button" className="kf-link" data-testid="kf-regen" onClick={() => setConfirm('regenerate')}>Régénérer…</button>
                      <button type="button" className="kf-link" data-testid="kf-disable" onClick={() => setConfirm('disable')}>Désactiver…</button>
                    </div>
                  )}
                </div>
              </div>

              {confirm === 'regenerate' && (
                <div className="kf-confirm" data-testid="kf-regen-confirm">
                  <b>Régénérer le QR fixe ?</b> L’ancien QR imprimé cessera aussitôt de marcher : il faudra imprimer le nouveau.
                  <div className="kf-row" style={{ marginTop: 8 }}>
                    <button type="button" className="kf-btn danger" data-testid="kf-regen-yes" disabled={busy}
                      onClick={() => void act({ action: 'fixed_regenerate', confirm: true }, 'Nouveau QR fixe : imprimez-le. L’ancien ne marche plus.')}>
                      {busy ? 'Régénération…' : 'Oui, régénérer'}
                    </button>
                    <button type="button" className="kf-btn" disabled={busy} onClick={() => setConfirm(null)}>Non</button>
                  </div>
                </div>
              )}
              {confirm === 'disable' && (
                <div className="kf-confirm" data-testid="kf-disable-confirm">
                  <b>Désactiver le QR fixe ?</b> Plus aucun pointage ne sera possible avec le QR imprimé. Le réactiver plus tard créera un nouveau QR.
                  <div className="kf-row" style={{ marginTop: 8 }}>
                    <button type="button" className="kf-btn danger" data-testid="kf-disable-yes" disabled={busy}
                      onClick={() => void act({ action: 'fixed_disable' }, 'QR fixe désactivé.')}>
                      {busy ? 'Désactivation…' : 'Oui, désactiver'}
                    </button>
                    <button type="button" className="kf-btn" disabled={busy} onClick={() => setConfirm(null)}>Non</button>
                  </div>
                </div>
              )}

              {!cut && url && <NfcChip url={url} />}

              {!cut && (
                <>
                  <div className="kf-sub">
                    <p className="kf-sub-t">Point de référence</p>
                    <p style={{ margin: 0 }} data-testid="kf-point-state">
                      {point?.set
                        ? `Posé le ${frDate(point.at)} à ${frTime(point.at)} (${fmtPrecision(point.accuracy_m)}).`
                        : 'À poser une fois, depuis votre téléphone, à l’endroit où le QR sera affiché. Tant qu’il n’est pas posé, le QR fixe refuse les pointages.'}
                    </p>
                    <div className="kf-row" style={{ marginTop: 8 }}>
                      <button type="button" className="kf-btn" data-testid="kf-point" disabled={busy} onClick={() => void setPoint()}>
                        {point?.set ? 'Reposer le point ici' : 'Poser le point ici'}
                      </button>
                    </div>
                    <p className={`kf-msg${pointMsg?.tone ? ` ${pointMsg.tone}` : ''}`} data-testid="kf-point-msg" aria-live="polite">{pointMsg?.text ?? ''}</p>
                  </div>

                  <div className="kf-sub">
                    <p className="kf-sub-t">Rayon autour du point</p>
                    <div className="kf-row">
                      {FIXED_QR_RADIUS_CHOICES.map((r) => (
                        <button key={r} type="button" className="kf-chip" aria-pressed={st.radius_m === r} data-testid={`kf-radius-${r}`} disabled={busy}
                          onClick={() => { if (st.radius_m !== r) void act({ action: 'fixed_radius', radius_m: r }); }}>
                          {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {recent.length > 0 && (
            <details className="kf-sub kf-recent" data-testid="kf-recent">
              <summary data-testid="kf-recent-sum">Derniers pointages avec ce QR ({recent.length})</summary>
              <ul>
                {recent.map((x, i) => (
                  <li key={`${x.at}-${i}`} data-testid="kf-recent-row">
                    <b>{x.name}</b> · {x.kind === 'departure' ? 'départ' : 'arrivée'} · {frDate(x.at)} à {frTime(x.at)} · dans la zone : {x.in_zone ? 'oui' : 'non'}
                  </li>
                ))}
              </ul>
              <p className="kf-meta" style={{ marginTop: 8 }} data-testid="kf-recent-note">
                « Dans la zone » : position déclarée par le téléphone au moment du scan. Elle peut être falsifiée : ce n’est pas une preuve de présence. Aucune coordonnée n’est gardée.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
