// Lot 7 — mémoire des cartes de l'assistant, HORS de React.
//
// Si le panneau est redessiné (session rafraîchie au retour sur l'onglet,
// écran rechargé), une action faite reste « Fait » avec Annuler / Modifier, et
// une action lancée juste avant se termine quand même : son résultat est noté
// ici, puis la carte qui s'affiche à nouveau le reprend. La clé est l'objet de
// la réponse (le même tant que la conversation vit) ; rien n'est écrit sur
// l'appareil, tout disparaît quand on recharge la page.
import { useEffect } from 'react';

type Memo = Record<string, unknown>;
const memory = new WeakMap<object, Memo>();
const listeners = new WeakMap<object, Set<() => void>>();

export function readCard<T extends Memo>(key: object): Partial<T> {
  return (memory.get(key) ?? {}) as Partial<T>;
}

export function writeCard(key: object, patch: Memo): void {
  memory.set(key, { ...(memory.get(key) ?? {}), ...patch });
  listeners.get(key)?.forEach((f) => f());
}

/** La carte affichée reprend ce qui a été noté (ex. action terminée pendant un redessin). */
export function useCardMemory<T extends Memo>(key: object, apply: (m: Partial<T>) => void): void {
  useEffect(() => {
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set);
    const f = () => apply(readCard<T>(key));
    set.add(f);
    return () => { set.delete(f); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** « Annuler » déjà fait : la carte ne le propose plus, même redessinée. */
export const undoneMemory = new WeakMap<object, string>();
