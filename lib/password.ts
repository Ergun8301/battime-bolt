// La règle de mot de passe, à un seul endroit.
//
// POURQUOI CE FICHIER EXISTE. La règle était écrite deux fois — à l'inscription
// et à la création du mot de passe après invitation. Deux copies d'une règle
// finissent toujours par diverger : un parcours laisserait passer ce que
// l'autre refuse, sans que rien ne le signale.
//
// CE QUE CE FICHIER N'EST PAS. Ce n'est PAS une barrière de sécurité. Une
// vérification faite dans le navigateur se contourne en appelant l'API Supabase
// directement. La vraie application de la règle est le réglage du tableau de
// bord Supabase (Authentication → Providers → Email : longueur minimale et
// caractères exigés), qui refuse côté serveur. Ici, on aide la personne à
// réussir du premier coup — on ne se défend pas contre un attaquant.
//
// La règle (octobre 2026) : 8 caractères minimum, dont au moins un chiffre et
// un caractère spécial. Plus de majuscule obligatoire. Exemple : Fatih.2024.
// Le serveur, lui, peut au plus exiger « lettres et chiffres » (aucun réglage
// Supabase ne sait demander un caractère spécial sans majuscule) : il ne doit
// jamais être PLUS strict que cette liste, sinon la personne coche tout puis se
// fait refuser. D'où la condition « 1 lettre » : « lettres et chiffres » exige
// une lettre a-z ou A-Z, et « 12/05/1990 » (une date de naissance) cocherait
// sinon les trois autres cases avant d'être refusé.

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  id: 'length' | 'letter' | 'digit' | 'special';
  /** Ce qu'affiche la liste sous le champ. */
  label: string;
  /** Ce qui manque, dans une phrase : « il manque un chiffre ». */
  missing: string;
  test: (password: string) => boolean;
}

// Construite à l'exécution : la cible TypeScript (ES5) refuse l'écriture
// littérale /…/u, que tous les navigateurs actuels comprennent.
const SPECIAL = new RegExp('[^\\p{L}\\p{N}\\s]', 'u');

/**
 * Les conditions, dans l'ordre d'affichage. Une coche verte par condition
 * remplie, au fur et à mesure de la frappe (components/password-input.tsx).
 *
 * « Caractère spécial » = tout ce qui n'est ni une lettre (accentuée ou non),
 * ni un chiffre, ni un espace : . - _ ! ? @ # € * … Une lettre accentuée (é)
 * ne compte PAS : « Bétonnière2 » n'a pas de caractère spécial, et la liste le
 * dit. La lettre et le chiffre sont testés en ASCII (a-z, A-Z, 0-9), comme le
 * fait Supabase : « ééééé.12 » n'a pas de lettre pour le serveur.
 */
export const PASSWORD_CHECKS: PasswordCheck[] = [
  { id: 'length', label: `${PASSWORD_MIN_LENGTH} caractères minimum`, missing: `${PASSWORD_MIN_LENGTH} caractères minimum`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'letter', label: 'Au moins 1 lettre', missing: 'une lettre', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'digit', label: 'Au moins 1 chiffre', missing: 'un chiffre', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'Au moins 1 caractère spécial (. - _ ! ? @ # …)', missing: 'un caractère spécial (. - _ ! ? @ # …)', test: (p) => SPECIAL.test(p) },
];

/**
 * Le mot de passe est-il conforme ? Retourne le message à afficher, ou `null`
 * si tout va bien. On nomme TOUT ce qui manque, pas seulement le premier
 * manquement : sinon la personne corrige, réessaie, et se fait refuser une
 * deuxième fois.
 */
export function passwordProblem(password: string): string | null {
  const failed = PASSWORD_CHECKS.filter((c) => !c.test(password));
  if (failed.length === 0) return null;
  const short = failed.find((c) => c.id === 'length');
  const chars = failed.filter((c) => c.id !== 'length').map((c) => c.missing);
  const parts: string[] = [];
  if (short) parts.push(`au moins ${PASSWORD_MIN_LENGTH} caractères`);
  if (chars.length) parts.push(`au moins ${chars.length > 1 ? `${chars.slice(0, -1).join(', ')} et ${chars[chars.length - 1]}` : chars[0]}`);
  return `Le mot de passe doit contenir ${parts.join(', dont ')}.`;
}

/** Ce que le champ affiche tant qu'il est vide. */
export const PASSWORD_PLACEHOLDER = 'Ex. Fatih.2024';

/**
 * La règle en une phrase, pour traduire un refus venu du SERVEUR.
 *
 * Quand Supabase refuse un mot de passe, il le dit en anglais. On réaffiche la
 * règle entière plutôt que d'en deviner un morceau.
 */
export const PASSWORD_RULE =
  `Mot de passe refusé : il faut au moins ${PASSWORD_MIN_LENGTH} caractères, `
  + `avec au moins une lettre, un chiffre et un caractère spécial (ex. Fatih.2024).`;
