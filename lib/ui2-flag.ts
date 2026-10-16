// Design salarié (?ui=2) : le drapeau que lit le Toaster (components/ui/sonner.tsx), monté une seule fois dans app/layout.tsx.
// La page /poseur (ou /pointer) le pose sur <html> tant que `?ui=2` est actif et le retire en partant : le Toaster change de place PAR ROUTE,
// sans que le reste de l'appli (bureau, connexion…) ne voie rien. Sans drapeau : Toaster d'avant, octet pour octet.
const ATTR = 'data-bt-ui2';
const EVT = 'bt-ui2-change';

export function setUi2Flag(on: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (html.hasAttribute(ATTR) === on) return;
  if (on) html.setAttribute(ATTR, ''); else html.removeAttribute(ATTR);
  window.dispatchEvent(new Event(EVT));
}
export function readUi2Flag(): boolean { return typeof document !== 'undefined' && document.documentElement.hasAttribute(ATTR); }
export function subscribeUi2Flag(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}
