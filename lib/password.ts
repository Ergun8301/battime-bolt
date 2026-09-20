// La règle de mot de passe, à un seul endroit.
//
// POURQUOI CE FICHIER EXISTE. La règle était écrite deux fois — à l'inscription
// et à la création du mot de passe après invitation — avec le même `< 6` copié
// des deux côtés. Deux copies d'une règle finissent toujours par diverger, et
// celle qui divergerait ici laisserait passer des mots de passe faibles sur un
// parcours et pas sur l'autre, sans que rien ne le signale.
//
// CE QUE CE FICHIER N'EST PAS. Ce n'est PAS une barrière de sécurité. Une
// vérification faite dans le navigateur se contourne en appelant l'API Supabase
// directement. La vraie application de la règle est le réglage du tableau de
// bord Supabase (Authentication → Sign In / Providers → Email), qui refuse
// côté serveur. Ici, on empêche l'erreur honnête et on l'explique en français
// avant que la requête ne parte — pas on se défend contre un attaquant.
//
// Les deux doivent donc dire la MÊME chose, sinon l'utilisateur passe notre
// contrôle puis se fait refuser par le serveur avec un message anglais.

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Le mot de passe est-il conforme ? Retourne le message à afficher, ou `null`
 * si tout va bien.
 *
 * ATTENTION AUX CLASSES DE CARACTÈRES. On teste l'ASCII (`a-z`, `A-Z`, `0-9`)
 * et pas les classes Unicode, parce que c'est ce que Supabase teste. Avec
 * `\p{Ll}`, un mot de passe comme « éééééééééééé1A » passerait notre contrôle
 * — le « é » comptant comme minuscule — puis se ferait refuser par le serveur.
 * L'utilisateur verrait un message anglais incompréhensible après avoir cru
 * avoir bien fait. Les deux règles doivent coïncider exactement.
 */
export function passwordProblem(password: string): string | null {
  const manques: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  // On ÉCRIT les classes (a-z, A-Z, 0-9). Sans ça, « Bétonnière » — qui n'a
  // que des lettres accentuées après le B — se fait refuser avec « il manque
  // une minuscule » devant un mot de passe qui semble n'être que ça. Le
  // message serait vrai et incompréhensible en même temps.
  if (!/[0-9]/.test(password)) manques.push('un chiffre (0-9)');
  if (!/[a-z]/.test(password)) manques.push('une minuscule non accentuée (a-z)');
  if (!/[A-Z]/.test(password)) manques.push('une majuscule non accentuée (A-Z)');

  if (manques.length === 0) return null;

  // On nomme TOUT ce qui manque, pas seulement le premier manquement : sinon
  // le salarié corrige, réessaie, et se fait refuser une deuxième fois.
  const liste =
    manques.length === 1
      ? manques[0]
      : `${manques.slice(0, -1).join(', ')} et ${manques[manques.length - 1]}`;

  return `Le mot de passe doit contenir au moins ${liste}.`;
}

/**
 * Ce que le champ affiche tant qu'il est vide.
 *
 * Les deux champs annonçaient « 6 caractères minimum ». Laisser cette phrase
 * en place aurait été pire que de ne rien écrire : l'application aurait promis
 * une règle puis refusé le mot de passe qui la respecte.
 */
export const PASSWORD_PLACEHOLDER =
  `${PASSWORD_MIN_LENGTH} caractères, 1 chiffre, 1 majuscule`;

/**
 * La règle en une phrase, pour traduire un refus venu du SERVEUR.
 *
 * Quand Supabase refuse un mot de passe, il le dit en anglais et on ne sait pas
 * toujours laquelle des règles a manqué. On réaffiche donc la règle entière
 * plutôt que d'en deviner une : l'ancien texte annonçait « trop court
 * (6 caractères minimum) » pour TOUT refus lié au mot de passe — y compris un
 * refus portant sur les caractères, et avec un seuil qui n'existe plus.
 */
export const PASSWORD_RULE =
  `Mot de passe refusé : il faut au moins ${PASSWORD_MIN_LENGTH} caractères, `
  + `dont un chiffre, une minuscule et une majuscule.`;
