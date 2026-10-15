// Lot 6 (couche IA v2) — les OUTILS envoyés au modèle selon le DOMAINE de la
// demande (planning, heures, salariés, chantiers, documents, réglages…).
//
// But : une demande plus légère (moins de déclarations à lire, réponse plus
// rapide, moins de jetons sur le gratuit). Règle de prudence, pour ne JAMAIS
// perdre une action :
//   · plusieurs domaines reconnus → on envoie l'UNION de leurs outils ;
//   · aucun domaine reconnu → on envoie TOUT, comme avant ;
//   · « repondre » est toujours là (questions, guide).
// Les mots cherchés sont larges exprès : un outil en trop ne coûte presque
// rien, un outil manquant ferait rater l'action. Le jeu d'évaluation vérifie,
// phrase par phrase, que l'outil attendu reste proposé (tool-domains.test.ts).
//
// Fichier joint : ce n'est PAS ce filtre qui décide, mais la liste « documents »
// de chaque assistant (lot 1), plus courte et plus sûre.
//
// Étape 3, 3a-2 : les listes `tools` de chaque domaine ne sont plus écrites ici, elles sont GÉNÉRÉES depuis le registre
// (outils-listes-*.ts, via le champ `domaines` de chaque outil). Les mots qui déclenchent un domaine restent écrits ici, à la main.
//
// Sans réseau ni base : identique côté serveur et navigateur.
import { low } from './fr-langue.ts';
import { DOMAINES_OUTILS as OUTILS_BUREAU } from './outils-listes-bureau.ts';
import { DOMAINES_OUTILS as OUTILS_SALARIE } from './outils-listes-salarie.ts';

type Domain = { re: RegExp; tools: readonly string[] };

const JOURS = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd|hier|semaine|matin|aprem|apres-midi|soir|journee|week-end';
const HEURE = '\\d{1,2}\\s*h\\b|\\d{1,2}\\s*h\\s*\\d{2}|\\d{1,2}:\\d{2}';

/** Bureau : un domaine = des mots → des outils. */
export const OFFICE_DOMAINS: Record<string, Domain> = {
  planning: {
    re: new RegExp(`planning|intervention|rendez|rdv|affect|\\bmets?\\b|\\bmettre\\b|\\bplace|decal|deplac|avance|recule|\\bchez\\b|${JOURS}|${HEURE}|enleve|retire|vide|efface|conge|vacance|malad|absen|arret|rtt|ferie|formation`),
    tools: OUTILS_BUREAU.planning,
  },
  heures: {
    re: new RegExp(`heure|pointage|pointe|badge|corrig|rappel|relanc|clotur|\\bmois\\b|septembre|octobre|novembre|decembre|janvier|fevrier|mars|avril|mai|juin|juillet|aout|reserve|attribu|\\bautre\\b|${HEURE}`),
    tools: OUTILS_BUREAU.heures,
  },
  salaries: {
    re: /salari|employe|ouvrier|equipe|chef|role|bureau|admin|invit|embauch|recrut|relanc|annule|habilit|caces|carte btp|visite med|aipr|sst|archiv|quitt|parti|depart|demission|licenci|prenom|\bnom\b|telephone|\btel\b|portable|bulletin|paie|salaire|cout|brut|@/,
    tools: OUTILS_BUREAU.salaries,
  },
  chantiers: {
    re: /client|chantier|depense|achat|euro|€|\d\s*e\b|montant|facture|location|materi|placo|fourniture|budget|devis|archiv|fini|termine|adresse|telephone|\btel\b|ville|email|mail|@|reserve|attribu|nouveau|cree|creer|renomm/,
    tools: OUTILS_BUREAU.chantiers,
  },
  documents: {
    re: /document|\bdoc\b|photo|image|facture|devis|pdf|\bplan\b|\bpv\b|proces-verbal|reception|fichier|classe|range|categorie|piece/,
    tools: OUTILS_BUREAU.documents,
  },
  reglages: {
    re: /reglage|parametr|comptable|compta|majoration|heures sup|relance auto|alerte|trajet|hebdo|35 ?h|39 ?h|entreprise|societe|siret|collegue|notre|nos /,
    tools: OUTILS_BUREAU.reglages,
  },
};

/** Salarié : ses heures, ses congés, son chantier (réserves, photos), ses collègues. */
export const WORKER_DOMAINS: Record<string, Domain> = {
  heures: {
    re: new RegExp(`heure|pointage|pointe|commenc|demarr|fini|termin|arret|bosse|travaill|fait|envoi|envoy|journee|copie|pareil|meme chose|comme hier|panier|repas|pause|efface|supprim|ligne|horaire|change|modifi|corrig|${JOURS}|${HEURE}`),
    tools: OUTILS_SALARIE.heures,
  },
  conges: {
    re: /conge|vacance|malad|absen|arret|rtt|repos|enfant malade|demande/,
    tools: OUTILS_SALARIE.conges,
  },
  chantier: {
    re: /chantier|client|reserve|fissure|defaut|probleme|souci|photo|image|document|facture|devis|range|classe|retire|enleve|email|mail|@|nouveau|corrig|repar|leve/,
    tools: OUTILS_SALARIE.chantier,
  },
  collegues: {
    re: /collegue|equipe|\bou (est|sont)\b|que fait|qui (est|travaille|bosse)|les autres|avec qui/,
    tools: OUTILS_SALARIE.collegues,
  },
};

/** Les noms des outils à proposer ; null = aucun domaine reconnu (tout envoyer). */
export function domainTools(text: string, domains: Record<string, Domain>): Set<string> | null {
  const n = low(String(text ?? ''));
  const hit = Object.values(domains).filter((d) => d.re.test(n));
  if (!hit.length) return null;
  return new Set(['repondre', ...hit.flatMap((d) => d.tools)]);
}

/** Filtre une liste d'outils ; l'ordre d'origine est gardé. */
export function pickTools<T extends { name: string }>(all: readonly T[], text: string | undefined, domains: Record<string, Domain>): T[] {
  if (!text) return [...all];
  const keep = domainTools(text, domains);
  return keep ? all.filter((f) => keep.has(f.name)) : [...all];
}
