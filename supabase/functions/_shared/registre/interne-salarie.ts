// Côté SALARIÉ (et pages partagées) : ce qui n'est PAS une capacité (routes publiques, pages légales, vitrine, aperçus,
// détails de présentation), avec la raison. Une entrée coûte une ligne de revue : on ne classe ici que ce qu'aucun cahier
// ne décrit comme une fonction (fonctions-salarie.md §8.1 : « hors périmètre : écran du bureau, borne, connexion,
// inscription, pages légales »). Dès qu'une page porte une fonction du cahier, elle va dans `surfaces-salarie.ts`.
import type { EntreeInterne } from './types.ts';

/** Jamais une clé d'écriture (`rpc:`, `fn:`, `table:*:insert|update|delete|upsert`) : voir la liste suivante. */
export const INTERNE_SALARIE: EntreeInterne[] = [
  // ── Accès au compte : avant toute session, donc avant tout assistant ──────
  { cle: 'route:/', raison: "Simple aiguillage de la racine : un chargement, puis une redirection vers /landing ou vers l'espace du rôle connecté. Aucune fonction à faire faire à l'assistant." },
  { cle: 'route:/connexion', raison: "Écran de connexion : l'assistant n'existe qu'une fois connecté et ne voit ni ne manipule jamais un identifiant ni un mot de passe (vision §4). Hors périmètre des cahiers (fonctions-salarie §8.1). La connexion sur place après un scan est S94, sur /pointer." },
  { cle: 'route:/inscription', raison: "Création du compte de l'entreprise par son futur patron, avant toute session : il n'y a pas encore d'assistant ni d'entreprise à servir. Hors périmètre des cahiers (fonctions-salarie §8.1)." },
  { cle: 'route:/mot-de-passe-oublie', raison: "Demande d'un lien de réinitialisation par une personne qui ne peut pas se connecter : sans session, donc sans assistant, et l'assistant ne touche jamais un mot de passe (vision §4)." },
  { cle: 'route:/auth/confirm', raison: "Arrivée depuis le lien d'un e-mail d'authentification (inscription, invitation, mot de passe oublié) : pas encore de session, donc pas d'assistant ; le bouton consomme un jeton à usage unique, que seule la personne doit utiliser." },
  { cle: 'route:/desabonnement', raison: "Page ouverte par le lien signé d'un e-mail récurrent, sans compte ni session ; le désabonnement part au clic seulement (envoi signé vers la fonction dédiée), jamais à l'ouverture, pour que les robots de messagerie ne le déclenchent pas." },

  // ── Tablette ──────────────────────────────────────────────────────────────
  { cle: 'route:/borne', raison: "Écran de la tablette de l'entreprise, relié une fois par le patron : il ne porte aucune session de salarié ni de patron. Son QR est la moitié « tablette » du pointage (S10) ; sa gestion est celle du bureau (B55, B124 à B126). Hors périmètre des cahiers (fonctions-salarie §8.1)." },

  // ── Pages légales : texte statique, aucune donnée ni action ───────────────
  { cle: 'route:/cgu', raison: "Page légale statique (conditions d'utilisation) : du texte à lire, aucune donnée de l'entreprise ni action ; hors périmètre des cahiers (fonctions-salarie §8.1)." },
  { cle: 'route:/cgv', raison: "Page légale statique (conditions de vente) : du texte à lire, aucune donnée de l'entreprise ni action ; hors périmètre des cahiers (fonctions-salarie §8.1)." },
  { cle: 'route:/mentions-legales', raison: "Page légale statique (éditeur, hébergeur) : du texte à lire, aucune donnée de l'entreprise ni action ; hors périmètre des cahiers (fonctions-salarie §8.1)." },
  { cle: 'route:/confidentialite', raison: "Page légale statique (politique de confidentialité) : du texte à lire. Le salarié y arrive par le lien de la fenêtre « Informations » (S75), qui est la capacité ; la page elle-même n'a rien à agir." },

  // ── Vitrine publique : référencement et démonstration, sans compte ────────
  { cle: 'route:/landing', raison: "Page d'accueil publique du produit (vitrine, référencement) : lue par des visiteurs sans compte, qui n'ont pas d'assistant. Aucune fonction du produit n'y est pilotable." },
  { cle: 'route:/fonctionnalites/export-paie', raison: "Page de vitrine (référencement) décrivant l'export de paie : texte pour des visiteurs sans compte ; la fonction elle-même est celle du bureau (B43 à B45)." },
  { cle: 'route:/fonctionnalites/planning-equipe', raison: "Page de vitrine (référencement) décrivant le planning d'équipe : texte pour des visiteurs sans compte ; la fonction elle-même est celle du bureau (B1 à B26)." },
  { cle: 'route:/fonctionnalites/pointage-chantier', raison: "Page de vitrine (référencement) décrivant le pointage de chantier : texte pour des visiteurs sans compte ; la fonction elle-même est le pointage du salarié (S10 à S16)." },
  { cle: 'route:/suisse', raison: "Page de vitrine (référencement, Suisse romande) : texte pour des visiteurs sans compte, aucune fonction du produit n'y est pilotable." },
  { cle: 'route:/suisse/enregistrement-temps-de-travail', raison: "Page de vitrine (référencement, Suisse romande) sur l'enregistrement du temps de travail : texte pour des visiteurs sans compte." },
  { cle: 'route:/suisse/timbrage-chantier', raison: "Page de vitrine (référencement, Suisse romande) sur le timbrage de chantier : texte pour des visiteurs sans compte." },

  // ── Aperçus : données fictives, absents du site de production ─────────────
  { cle: 'route:/apercu/assistant-salarie', raison: "Aperçu de démonstration de l'assistant salarié, réservé aux préversions (?demo=salarie) : données fictives, et sur bemexo.com la page ne montre rien. Le vrai assistant est S82 à S93." },

  // ── Détails de présentation ───────────────────────────────────────────────
  { cle: 'dialogue:components/time-field#open', raison: "Liste déroulante des quarts d'heure d'un champ d'heure, réutilisée par plusieurs formulaires (pointage oublié, Mon équipe, et au bureau). Un détail de saisie : les capacités sont celles des formulaires qui l'emploient." },
];

/**
 * Écritures que l'assistant ne portera pas, à REVUE EXPLICITE : plafonnée dans
 * `dettes.json` (`ecritures_non_assistees`) et comptée par T9. Même forme que l'interne.
 */
export const ECRITURES_NON_ASSISTEES_SALARIE: EntreeInterne[] = [
  { cle: 'ecriture:lib/live-session#startLiveSession', raison: "Démarrage du chrono depuis le téléphone, retiré volontairement au lot 12 (fonctions-salarie §8.1) : seul le scan du QR de la tablette ouvre un pointage, et l'assistant répond de scanner (PHONE_LIVE_REMOVED). Plus aucun appelant atteignable ; à supprimer du code, ou à passer en capacité si le démarrage au téléphone revenait." },
];
