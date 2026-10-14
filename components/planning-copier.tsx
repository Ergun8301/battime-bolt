'use client';

// « Copier une case » SIMPLE (planning du bureau).
//
// Trois petites pièces, volontairement légères (elles font partie du premier chargement de /admin) :
//  · CopyTip      — l'astuce VISIBLE et durable, qui remplace l'ancienne info-bulle du navigateur.
//                   Fermable (« Compris »), mémorisée par navigateur, réaffichable par le petit « ? ».
//                   Sur un écran tactile, elle ne parle pas de Ctrl : on touche la case, puis « Copier vers… ».
//  · CopyTipHelp  — le petit bouton « ? » qui la réaffiche.
//  · SlotActions  — la rangée « Actions » en pied de la fenêtre de modification d'une case :
//                   « Copier vers un autre jour… », « Dupliquer au lendemain », « Ajouter une tâche à ce créneau » (seulement si les
//                   tâches existent) et « Supprimer ».
//                   Le bouton « Supprimer » est celui de la fenêtre (même confirmation, mêmes garde-fous) : il est seulement
//                   rangé ici, plus grand. Ces boutons ne font RIEN eux-mêmes : l'écran du planning écrit.
//
// Le choix des jours (fenêtre « Copier vers… ») est dans components/planning-copy-dialog.tsx, chargée à l'ouverture.
import { useSyncExternalStore, type ReactNode } from 'react';
import { Copy, CopyPlus, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Mémoire de l'astuce (localStorage, dans un try/catch : l'écran marche sans) ──────────────────────
export const TIP_KEY = 'bemexo-astuce-copier-case';
let hidden: boolean | null = null; // null = pas encore lu
const subs = new Set<() => void>();
function readHidden(): boolean {
  if (hidden === null) {
    try { hidden = window.localStorage.getItem(TIP_KEY) === '1'; } catch { hidden = false; }
  }
  return hidden;
}
function setHidden(v: boolean) {
  hidden = v; // même si le navigateur refuse d'écrire : fermée jusqu'au rechargement
  try { if (v) window.localStorage.setItem(TIP_KEY, '1'); else window.localStorage.removeItem(TIP_KEY); } catch { /* navigation privée, stockage bloqué… */ }
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** L'astuce est-elle fermée ? (faux au premier rendu côté serveur : jamais d'écart d'affichage) */
export function useTipHidden(): boolean {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}

// ─── Écran tactile ? (le doigt n'a pas de touche Ctrl) ────────────────────────────────────────────────
const touchQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null);
function subscribeTouch(f: () => void) {
  const q = touchQuery();
  if (!q) return () => {};
  q.addEventListener?.('change', f);
  return () => q.removeEventListener?.('change', f);
}
/** Le pointeur principal est le doigt (téléphone, tablette). Un PC à écran tactile garde la souris : phrase avec Ctrl. */
export function useTouchPrimary(): boolean {
  return useSyncExternalStore(subscribeTouch, () => !!touchQuery()?.matches, () => false);
}

export const TIP_TEXT_PC = 'Copier une case : cliquez dessus puis « Copier vers… », ou glissez-la en maintenant Ctrl (Windows) ou ⌥ Option (Mac).';
export const TIP_TEXT_TOUCH = 'Copier une case : touchez-la puis « Copier vers… ».';

// Objets FIXES (règle anti-flash du lot 10 : le contenu d'un <style> ne change jamais d'identité).
const TIP_STYLE = { __html: `
.bt-cp-tip{display:flex;align-items:center;gap:10px;margin:0;padding:8px 14px;background:#FFF8E1;border-bottom:1px solid rgba(255,194,26,.55);color:#15120F;font-family:'Archivo',sans-serif;font-size:13px;font-weight:600;line-height:1.4}
.bt-cp-tip p{margin:0;flex:1;min-width:0}
.bt-cp-tip b{font-weight:800}
.bt-cp-tip-ok{flex:none;min-height:30px;padding:0 12px;border-radius:9px;border:1.5px solid rgba(21,18,15,.28);background:#fff;color:#15120F;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.bt-cp-tip-ok:hover{border-color:#15120F}
.bt-cp-tip-ok:focus-visible{outline:2px solid #15120F;outline-offset:2px}
.bt-cp-help:focus-visible>span{outline:2px solid #15120F;outline-offset:2px}
.bt-cp-tip--m{margin:0 0 2px;border:1px solid rgba(255,194,26,.6);border-radius:12px;padding:10px 12px;align-items:flex-start}
.bt-cp-tip--m .bt-cp-tip-ok{min-height:44px;padding:0 14px}
.bt-cp-help{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;background:transparent;cursor:pointer;font-family:inherit}
.bt-cp-help>span{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:1.5px solid rgba(21,18,15,.3);background:#fff;color:#56514a;font-size:13px;font-weight:900;line-height:1}
.bt-cp-help:hover>span{border-color:#15120F;color:#15120F;background:#FAF7F0}
.bt-cp-help--corner{position:absolute;left:84px;bottom:6px}
.bt-cp-help--corner.after-ver{left:114px}
.bt-cp-help--m{width:44px;height:44px}
/* Au doigt (tablette en mise en page bureau) : même « ? », zone de toucher de 44 px. */
@media (pointer:coarse){.bt-cp-help--corner{width:44px;height:44px;left:74px;bottom:-4px}.bt-cp-help--corner.after-ver{left:104px}}
.bt-cp-desk{display:block}
@media (max-width:1023px){.bt-cp-desk{display:none}}
` };

/**
 * L'astuce visible. `variant="desk"` : bandeau fin sous la barre du planning (ordinateur, tablette en mise en page bureau) ;
 * `variant="mobile"` : carte en haut de la liste du jour (téléphone). Rien quand elle est fermée : voir CopyTipHelp.
 */
export function CopyTip({ variant }: { variant: 'desk' | 'mobile' }) {
  const closed = useTipHidden();
  const touch = useTouchPrimary();
  if (closed) return null;
  const mobile = variant === 'mobile';
  const text = touch || mobile ? TIP_TEXT_TOUCH : TIP_TEXT_PC;
  const [head, ...rest] = text.split(' : ');
  return (
    <div className={`bt-cp-tip${mobile ? ' bt-cp-tip--m' : ''}`} role="note" data-testid={mobile ? 'copy-tip-m' : 'copy-tip'}>
      <style dangerouslySetInnerHTML={TIP_STYLE} />
      <p><span aria-hidden="true">💡 </span><b>{head} :</b> {rest.join(' : ')}</p>
      <button type="button" className="bt-cp-tip-ok" onClick={() => setHidden(true)} data-testid={mobile ? 'copy-tip-ok-m' : 'copy-tip-ok'}>Compris</button>
    </div>
  );
}

/** Le petit « ? » qui réaffiche l'astuce (n'existe que tant qu'elle est fermée). */
export function CopyTipHelp({ variant, afterVersions = false }: { variant: 'corner' | 'mobile'; afterVersions?: boolean }) {
  const closed = useTipHidden();
  if (!closed) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={TIP_STYLE} />
      <button type="button" className={`bt-cp-help bt-cp-help--${variant === 'corner' ? 'corner' : 'm'}${variant === 'corner' && afterVersions ? ' after-ver' : ''}`}
        aria-label="Afficher l’astuce pour copier une case" data-testid={variant === 'corner' ? 'copy-tip-help' : 'copy-tip-help-m'}
        onClick={(e) => { e.stopPropagation(); setHidden(false); }}>
        <span aria-hidden="true">?</span>
      </button>
    </>
  );
}

// ─── La rangée « Actions » de la fenêtre de modification ─────────────────────────────────────────────
const ACT_STYLE = { __html: `
.bt-cp-act{display:grid;gap:8px;padding-top:12px;border-top:1px solid rgba(21,18,15,.12)}
.bt-cp-act-h{margin:0;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#6E6A63}
.bt-cp-act-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
.bt-cp-act-row>button{min-height:44px;height:auto;padding-top:8px;padding-bottom:8px;white-space:normal;text-align:left;justify-content:flex-start;line-height:1.25}
.bt-cp-act-row>button.bt-cp-wide{grid-column:1/-1}
.bt-cp-act-note{margin:0;font-size:12.5px;font-weight:600;color:#6b6459;line-height:1.4}
` };

/**
 * « Actions » sur une case : copier, dupliquer, supprimer. `children` = le bouton « Supprimer » de la fenêtre
 * (ni doublé ni remplacé : même clic, même confirmation). `blockedWhy` : une modification pas encore enregistrée —
 * la copie reprend la case telle qu'elle est ENREGISTRÉE, on le dit au lieu de copier à moitié.
 */
export function SlotActions({ onCopyTo, onDuplicate, onAddTask, busy, blockedWhy, children }: {
  onCopyTo: () => void; onDuplicate: () => void;
  /** Absent quand les tâches n'existent pas (migration pas passée) : le bouton n'est alors pas montré. */
  onAddTask?: () => void;
  busy?: boolean; blockedWhy?: string | null; children?: ReactNode;
}) {
  const off = !!busy || !!blockedWhy;
  return (
    <div className="bt-cp-act" role="group" aria-label="Actions sur cette intervention" data-testid="edit-actions">
      <style dangerouslySetInnerHTML={ACT_STYLE} />
      <p className="bt-cp-act-h">Actions</p>
      <div className="bt-cp-act-row">
        <Button type="button" variant="outline" disabled={off} onClick={onCopyTo} data-testid="edit-copy-to">
          <Copy className="h-4 w-4 mr-2 shrink-0" /> Copier vers un autre jour…
        </Button>
        <Button type="button" variant="outline" disabled={off} onClick={onDuplicate} data-testid="edit-duplicate">
          <CopyPlus className="h-4 w-4 mr-2 shrink-0" /> Dupliquer au lendemain
        </Button>
        {onAddTask && (
          <Button type="button" variant="outline" onClick={onAddTask} data-testid="edit-add-task">
            <ListPlus className="h-4 w-4 mr-2 shrink-0" /> Ajouter une tâche à ce créneau
          </Button>
        )}
        {children}
      </div>
      {blockedWhy && <p className="bt-cp-act-note" data-testid="edit-actions-note">{blockedWhy}</p>}
    </div>
  );
}
