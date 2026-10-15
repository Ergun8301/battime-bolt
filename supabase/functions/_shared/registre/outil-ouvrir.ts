// L'outil `ouvrir_fenetre` d'un côté (étape 3, livraison 3b-1), GÉNÉRÉ depuis les ouvreurs : l'enum des écrans et la description (une ligne par écran,
// avec ses paramètres) ne s'écrivent nulle part à la main. Contrat : docs/ia-etape3/00-conception-etape3.md §3.3.
//
// SERVEUR SEULEMENT (il tire les phrases lues par le modèle). L'outil n'est servi que si l'interrupteur `ouvrir` est allumé (`interrupteur: 'ouvrir'`,
// outils-pour.ts), avec `ouvrir1` annoncé par l'écran et SANS fichier joint.
import { ouvreursDe } from './ouvreurs.ts';
import type { Cote, Outil } from './types.ts';

/** Bornes du contrat : `valeurs` porte 8 clés au plus. */
export const VALEURS_MAX = 8;

/** Une ligne par écran : `- id(param*, param) : phrase` (* = obligatoire ; les valeurs d'une liste fermée sont citées). */
export function ligneEcran(o: ReturnType<typeof ouvreursDe>[number]): string {
  const ps = Object.entries(o.params).map(([nom, p]) => `${nom}${p.requis ? '*' : ''}${p.kind === 'enum' && p.valeurs ? `=${p.valeurs.join('|')}` : ''}`);
  return `- ${o.id}${ps.length ? `(${ps.join(', ')})` : ''}${o.niveau === 3 ? ' [la personne clique elle-même]' : ''} : ${o.decrit}`;
}

export function descriptionOuvrir(cote: Cote): string {
  return `Ouvrir un écran, une fenêtre ou un formulaire de BEMEXO, éventuellement pré-rempli, quand la personne demande de l’OUVRIR, de le MONTRER, de l’y EMMENER ou dit qu’elle veut remplir un formulaire (« ouvre », « emmène-moi », « montre-moi », « je veux remplir »). N’enregistre, n’envoie et ne clôture RIEN : la personne vérifie puis clique elle-même. Pour EXPLIQUER où cliquer (« comment… ? »), utiliser repondre, pas cet outil. Pour FAIRE (« mets », « ajoute », « pose »), utiliser l’outil d’écriture. Dans valeurs, seulement ce que la personne a dit (${VALEURS_MAX} au plus) : les noms tels que dits, les dates en aaaa-mm-jj ; ne jamais deviner. Écrans (id(valeurs), * = obligatoire) :\n${ouvreursDe(cote).map(ligneEcran).join('\n')}`;
}

/** Les paramètres : `id` (enum de l'écran) et `valeurs` (un objet dont les noms possibles sont l'union de ceux des écrans du côté, tous facultatifs). */
export function parametresOuvrir(cote: Cote): Record<string, unknown> {
  const noms = new Map<string, Set<string>>();
  for (const o of ouvreursDe(cote)) for (const [nom, p] of Object.entries(o.params)) {
    const aides = noms.get(nom) ?? new Set<string>();
    aides.add(p.aide);
    noms.set(nom, aides);
  }
  const properties: Record<string, unknown> = {};
  noms.forEach((aides, nom) => { properties[nom] = { type: 'string', description: aides.size === 1 ? Array.from(aides)[0] : 'voir l’écran choisi' }; });
  return {
    type: 'object',
    properties: {
      id: { type: 'string', enum: ouvreursDe(cote).map((o) => o.id), description: 'L’écran à ouvrir.' },
      valeurs: { type: 'object', description: `Valeurs à pré-remplir, celles que l’écran choisi accepte (${VALEURS_MAX} au plus). Omettre ce qui n’est pas dit.`, properties },
    },
    required: ['id'],
  };
}

export function outilOuvrir(cote: Cote): Outil {
  return {
    id: 'ouvrir_fenetre', cote, roles: cote === 'bureau' ? ['admin'] : ['worker', 'lead'], kind: 'ouverture', niveau: 1,
    description: descriptionOuvrir(cote), parametres: parametresOuvrir(cote), domaines: [], livraison: '3b', interrupteur: 'ouvrir',
    ouvreurs: ouvreursDe(cote).map((o) => o.id),
    // Paires « proches » (§3.3) : repondre (expliquer ≠ ouvrir) ; l'écriture voisine (ouvrir le formulaire ≠ faire).
    proches: cote === 'bureau' ? ['repondre', 'affecter_planning', 'poser_absence', 'creer_chantier'] : ['repondre'],
  };
}
