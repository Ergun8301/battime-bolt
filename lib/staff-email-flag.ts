// Lot 19 — « Envoyer par e-mail » est-il disponible ? Un petit drapeau pour la session.
//
// Le bureau ne fait AUCUNE lecture de plus au chargement de la page : on ne sait donc pas
// d'avance si la migration est appliquée et la fonction `send-staff-email` déployée. Les
// boutons sont visibles ; à la première ouverture de la fenêtre, si la fonction répond
// « pas encore disponible » (ou n'existe pas), le drapeau passe à « absent » : les boutons
// se cachent pour le reste de la session de l'onglet, sans message d'erreur.
//
// Ce fichier est dans le chargement de la page (quelques octets) ; la fenêtre, elle, est
// chargée à l'ouverture (components/staff-email-dialog.tsx).
import { useSyncExternalStore } from 'react';

const KEY = 'bemexo-emails-absents';
let listeners: (() => void)[] = [];

function readStored(): boolean {
  try { return typeof window !== 'undefined' && window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
let absent = readStored();

export function markStaffEmailAbsent(): void {
  if (absent) return;
  absent = true;
  try { window.sessionStorage.setItem(KEY, '1'); } catch { /* stockage indisponible : valable jusqu'au rechargement */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners = listeners.concat(l); return () => { listeners = listeners.filter((x) => x !== l); }; };

/** Vrai tant que rien n'a montré que la fonction manque. */
export function useStaffEmailVisible(): boolean {
  return !useSyncExternalStore(subscribe, () => absent, () => false);
}
