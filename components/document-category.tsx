'use client';

// Changer la catégorie d'un document de chantier (lot 24, oct. 2026).
// Branché dans components/chantier-documents.tsx, côté bureau ET côté salarié.
//
//   · Un bouton « Devis ▾ » sur la ligne du document (44 px de haut au moins).
//   · Une fenêtre avec les choix, un avertissement léger quand le changement a
//     des conséquences (facture : les salariés ne la voient plus ; réserve :
//     elle sort du rapport), « Enregistrer » / « Annuler ».
//   · Après l'enregistrement, un bandeau de 8 secondes avec « Annuler » : le
//     changement reste réversible, sans nouvelle question. Ce n'est PAS un
//     message flottant (toast) : le panneau Documents est une fenêtre, qui rend
//     inerte tout ce qui est derrière elle, y compris un message flottant — son
//     « Annuler » serait intouchable. Le bandeau est donc DANS le panneau, collé
//     en bas de l'écran.
//
// TANT QUE LA MIGRATION N'EST PAS APPLIQUÉE, RIEN NE S'AFFICHE : ni bouton, ni
// message (useDocCategoryReady reste faux). Le salarié ne se voit jamais proposer
// une facture ni une réserve : la base les lui refuserait (règles dans
// supabase/functions/_shared/doc-categories.ts).
import { useEffect, useState } from 'react';
import { Check, Loader2, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { docCategoryReady, setDocumentCategory } from '@/lib/doc-category';
import { categoryChangeNotice, categoryChoices, categoryErrorMessage, categoryText } from '@/supabase/functions/_shared/doc-categories';

/** Vrai quand la migration du lot 24 est là. Vérifié à chaque ouverture du panneau ; faux = rien ne s'affiche, aucun message. */
export function useDocCategoryReady(open: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    docCategoryReady().then((r) => { if (!cancelled) setReady(r); });
    return () => { cancelled = true; };
  }, [open]);
  return ready;
}

const CAT_CSS = `
.bt-cat-btn{display:inline-flex;align-items:center;min-height:44px;min-width:44px;max-width:100%;padding:0;margin:2px 0 0;border:none;background:transparent;cursor:pointer;font-family:inherit;touch-action:manipulation;color:#15120F}
.bt-cat-btn:focus-visible{outline:2px solid #15120F;outline-offset:2px;border-radius:999px}
.bt-cat-pill{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;padding:6px 11px;border-radius:999px;font-size:12.5px;font-weight:800;background:#FFF2CC;color:#15120F}
.bt-cat-pill.paid{background:#E3F5EA}
.bt-cat-pill.none{background:#F1ECE0}
.bt-cat-pill-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-cat-sheet{display:flex;flex-direction:column;gap:12px;min-width:0}
.bt-cat-doc{font-size:13.5px;font-weight:800;color:#15120F;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bt-cat-ask{font-size:13px;font-weight:600;color:#6E6A63}
.bt-cat-list{display:flex;flex-direction:column;gap:7px;max-height:50vh;overflow-y:auto;overflow-x:hidden;padding:1px}
.bt-cat-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:48px;padding:8px 14px;border:1.5px solid rgba(21,18,15,.16);border-radius:12px;background:#fff;color:#15120F;font-family:inherit;font-size:14.5px;font-weight:800;text-align:left;cursor:pointer;touch-action:manipulation}
.bt-cat-opt[aria-checked=true]{border-color:#15120F;background:#FFF2CC}
.bt-cat-opt:focus-visible{outline:2px solid #15120F;outline-offset:2px}
.bt-cat-opt-t{min-width:0;overflow-wrap:anywhere}
.bt-cat-opt-now{display:inline-flex;align-items:center;gap:4px;flex:none;font-size:12px;font-weight:700;color:#6E6A63}
.bt-cat-warn{padding:9px 12px;border-radius:10px;background:#FFF2CC;color:#15120F;font-size:13px;font-weight:700;line-height:1.35}
.bt-cat-err{padding:9px 12px;border-radius:10px;background:#F4D9D1;color:#8A2F12;font-size:13px;font-weight:700;line-height:1.35}
.bt-cat-done{position:sticky;bottom:8px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px 6px 14px;border-radius:12px;background:#15120F;color:#F2EDE3;font-size:13.5px;font-weight:700;line-height:1.3;box-shadow:0 8px 22px -8px rgba(21,18,15,.5)}
.bt-cat-done.bad{background:#F4D9D1;color:#8A2F12}
.bt-cat-done-t{min-width:0;overflow-wrap:anywhere}
.bt-cat-done button{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:0 14px;border:none;border-radius:10px;background:#FFC21A;color:#15120F;font-family:inherit;font-size:14px;font-weight:900;cursor:pointer;touch-action:manipulation}
.bt-cat-done button:disabled{opacity:.6;cursor:default}
.bt-cat-done button:focus-visible{outline:2px solid #F2EDE3;outline-offset:2px}
.bt-cat-foot{display:flex;gap:8px}
.bt-cat-foot button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 12px;border-radius:11px;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;touch-action:manipulation;border:1.5px solid #15120F;background:#fff;color:#15120F}
.bt-cat-foot button.go{background:#FFC21A;box-shadow:0 3px 0 #C99300}
.bt-cat-foot button:disabled{opacity:.55;cursor:default;box-shadow:none}
.bt-cat-foot button:focus-visible{outline:2px solid #15120F;outline-offset:2px}
`;
// Objet FIXE (comme DOC_CSS_HTML) : un `{ __html }` neuf à chaque rendu ferait réécrire la feuille de style.
const CAT_CSS_HTML = { __html: CAT_CSS };

// Le bouton qui a ouvert la fenêtre : Radix ne rend le focus qu'à un « déclencheur » déclaré, ce qui
// n'est pas le cas ici (la fenêtre vit à côté de la liste). Sans cela, le focus tombait sur la page
// et un utilisateur au clavier perdait sa place dans la liste.
let lastOpener: HTMLElement | null = null;

/** Le bouton de la ligne : la catégorie actuelle, qui ouvre le choix. */
export function DocCategoryButton({ label, current, docName, onClick }: { label: string; current?: string | null; docName: string; onClick: () => void }) {
  const tone = current === 'facture_payee' ? ' paid' : current ? '' : ' none';
  return (
    <button type="button" className="bt-cat-btn" data-testid="doc-cat-btn" title="Changer la catégorie" onClick={(e) => { lastOpener = e.currentTarget; onClick(); }}
      aria-label={`Changer la catégorie de « ${docName} » (actuellement : ${label})`}>
      <span className={`bt-cat-pill${tone}`}>
        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="bt-cat-pill-t">{label}</span>
        <span aria-hidden>▾</span>
      </span>
    </button>
  );
}

export interface CategoryDoc { id: string; label: string | null; file_name: string | null; category?: string | null }

/** La fenêtre de choix. Ouverte quand `doc` n'est pas nul. Aucune écriture avant « Enregistrer ». */
export function DocumentCategorySheet({ doc, office, onClose, onChanged }: {
  doc: CategoryDoc | null;
  office: boolean;
  onClose: () => void;
  onChanged: (id: string, category: string | null) => void;
}) {
  const current = doc?.category || null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Le bandeau d'après-coup : « changée » (avec Annuler), « remise » ou « impossible ».
  const [done, setDone] = useState<{ kind: 'changed'; id: string; category: string | null; previous: string | null } | { kind: 'info' | 'bad'; text: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const docId = doc?.id ?? null;

  // Une fenêtre neuve à chaque document : le choix part de la catégorie actuelle.
  useEffect(() => {
    setChosen(current);
    setError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Hors connexion à l'ouverture : on prévient tout de suite (l'erreur réelle viendra au clic).
  useEffect(() => {
    if (!docId) return;
    const sync = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, [docId]);

  // Le bandeau s'efface seul : 8 s tant qu'on peut annuler, 5 s ensuite.
  useEffect(() => {
    if (!done || undoing) return;
    const t = setTimeout(() => setDone(null), done.kind === 'changed' ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [done, undoing]);

  // « Annuler » : remet l'ancienne catégorie par un second changement (la trace garde les deux).
  const undo = async (id: string, previous: string | null) => {
    setUndoing(true);
    try {
      await setDocumentCategory(id, previous);
      onChanged(id, previous);
      setDone({ kind: 'info', text: `Catégorie remise : ${categoryText(previous)}.` });
    } catch {
      setDone({ kind: 'bad', text: 'Annulation impossible : remettez l’ancienne catégorie à la main.' });
    } finally {
      setUndoing(false);
    }
  };

  const save = async () => {
    if (!doc || saving || chosen === current) return;
    setSaving(true);
    setError(null);
    try {
      const r = await setDocumentCategory(doc.id, chosen);
      onChanged(doc.id, r.category);
      onClose();
      setDone({ kind: 'changed', id: r.id, category: r.category, previous: r.previous });
    } catch (e) {
      setError(categoryErrorMessage(e, typeof navigator === 'undefined' ? true : navigator.onLine));
    } finally {
      setSaving(false);
    }
  };

  const notice = doc ? categoryChangeNotice(current, chosen, office) : null;
  const name = doc ? doc.label || doc.file_name || 'Document' : '';

  return (
    <>
      <style dangerouslySetInnerHTML={CAT_CSS_HTML} />
      {done && (
        <div className={`bt-cat-done${done.kind === 'bad' ? ' bad' : ''}`} role={done.kind === 'bad' ? 'alert' : 'status'} data-testid="doc-cat-done">
          <span className="bt-cat-done-t">{done.kind === 'changed' ? `Catégorie changée : ${categoryText(done.category)}.` : done.text}</span>
          {done.kind === 'changed' && (
            <button type="button" onClick={() => { void undo(done.id, done.previous); }} disabled={undoing} data-testid="doc-cat-undo">
              {undoing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Annuler'}
            </button>
          )}
        </div>
      )}
      <Dialog open={!!doc} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
        <DialogContent className="bt-skin max-w-sm" data-testid="doc-cat-sheet"
          onCloseAutoFocus={(e) => { e.preventDefault(); if (lastOpener?.isConnected) lastOpener.focus(); }}
          onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}
          onInteractOutside={(e) => { if (saving) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Catégorie du document</DialogTitle>
            <DialogDescription className="sr-only">Choisissez où ranger ce document.</DialogDescription>
          </DialogHeader>
          <div className="bt-cat-sheet">
            <div className="bt-cat-doc" data-testid="doc-cat-name">{name}</div>
            <div className="bt-cat-ask" aria-hidden>Choisissez où ranger ce document.</div>
            {offline && <div className="bt-cat-warn" role="status">Pas de connexion : le changement ne pourra pas être enregistré.</div>}
            <div className="bt-cat-list" role="radiogroup" aria-label="Catégorie">
              {categoryChoices(office).map((c) => {
                const isNow = c === current;
                return (
                  <button key={c ?? 'none'} type="button" role="radio" aria-checked={chosen === c} className="bt-cat-opt"
                    data-testid="doc-cat-opt" data-cat={c ?? 'none'} disabled={saving}
                    aria-label={`${categoryText(c)}${isNow ? ' (actuelle)' : ''}`} onClick={() => setChosen(c)}>
                    <span className="bt-cat-opt-t">{categoryText(c)}</span>
                    {isNow && <span className="bt-cat-opt-now" aria-hidden><Check className="h-3.5 w-3.5" /> actuelle</span>}
                  </button>
                );
              })}
            </div>
            {notice && <div className="bt-cat-warn" role="status" data-testid="doc-cat-notice">{notice}</div>}
            {error && <div className="bt-cat-err" role="alert" data-testid="doc-cat-error">{error}</div>}
            <div className="bt-cat-foot">
              <button type="button" onClick={onClose} disabled={saving} data-testid="doc-cat-cancel">Annuler</button>
              <button type="button" className="go" onClick={save} disabled={saving || chosen === current} data-testid="doc-cat-save">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</> : error ? 'Réessayer' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
