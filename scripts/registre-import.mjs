#!/usr/bin/env node
// Import du registre des capacités (étape 3, livraison 3a-1) : à exécuter UNE fois.
//
// Lit docs/ia-etape3/capacites-bureau.json (138 entrées) et capacites-salarie.json (105) et écrit, dans
// supabase/functions/_shared/registre/ : capacites-bureau.ts, capacites-salarie.ts (Capacite[] typé, une
// capacité par bloc), ids.snapshot.json (ids triés) et dettes.json (max.dette et max.ecart).
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.4 (règles de transformation) et §6.2 (échéances).
//
// Rejouable : relancé sur les mêmes JSON, il réécrit les mêmes octets (rien ne bouge). Mais une fois les
// fichiers générés, ils deviennent la SOURCE (on y ajoute B139+/S106+, on y ferme des dettes) : le script
// refuse donc d'écraser un fichier qui a changé depuis, sauf avec --ecraser (et alors les ids déjà publiés
// restent dans ids.snapshot.json : un id ne disparaît jamais, T3).
//
// Usage : node scripts/registre-import.mjs [--a-blanc] [--ecraser] [--racine <dossier>]
//   --a-blanc  ne rien écrire, afficher seulement le rapport (comptes, « à trancher »)
//   --ecraser  réécrire même si capacites-*.ts a été modifié à la main
//   --racine   autre racine de dépôt (tests dans une copie) ; défaut : le dépôt de ce script
//
// RIEN n'est deviné : quand l'exposition d'une capacité du bureau ne permet pas de lire son état, elle devient
// une dette « à trancher » (voir etatBureau). Les JSON du bureau n'ont aucun champ d'état exploitable
// (§0.2) : l'état se lit au début du texte de l'exposition, avec les mêmes marques que celles du cahier 02.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Arguments ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const aBlanc = args.includes('--a-blanc');
const ecraser = args.includes('--ecraser');
const iRacine = args.indexOf('--racine');
const RACINE = iRacine >= 0 ? resolve(args[iRacine + 1] ?? '') : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(RACINE, 'docs/ia-etape3');
const REGISTRE = join(RACINE, 'supabase/functions/_shared/registre');
const SOURCES_CODE = join(RACINE, 'supabase/functions/_shared');

// ── Ce que le code contient AUJOURD'HUI (mesuré le 15/10/2026 en important les deux modules sous Deno) ─────
// Embarqué pour que l'import soit rejouable sans Deno ; verifierCode() compare ces listes au source et PRÉVIENT
// si le code a bougé depuis (un outil renommé change l'état d'une capacité : mieux vaut le savoir).

const OUTILS = {
  bureau: ['repondre', 'inviter_salarie', 'creer_chantier', 'ranger_document', 'poser_absence', 'affecter_planning', 'planning_semaine',
    'corriger_pointage', 'modifier_intervention', 'repondre_conge', 'lever_reserve', 'ajouter_depense', 'modifier_client', 'archiver_client',
    'changer_role', 'relancer_invitation', 'envoyer_rappel', 'cloturer_mois', 'attribuer_client', 'ajouter_habilitation', 'modifier_salarie',
    'archiver_salarie', 'cout_reel', 'modifier_reglages', 'supprimer_intervention', 'effacer_planning', 'supprimer_absence', 'supprimer_document',
    'modifier_document', 'supprimer_depense', 'modifier_depense', 'supprimer_habilitation', 'modifier_habilitation', 'annuler_invitation'],
  salarie: ['effacer_heures', 'annuler_conge', 'modifier_conge', 'retirer_photo', 'retirer_reserve', 'repondre', 'declarer_heures', 'demander_conge',
    'terminer_pointage', 'ranger_photo', 'signaler_reserve', 'envoyer_journee', 'modifier_heures', 'panier_repas', 'copier_journee', 'reserve_corrigee',
    'nouveau_chantier', 'email_client', 'planning_collegues'],
};
const NAV = {
  bureau: ['salaries', 'nouveau_salarie', 'nouveau_client', 'import_clients', 'conges', 'couts', 'reserves', 'export', 'reglages', 'planning', 'clients',
    'salarie'], // « salarie » = le lien « Fiche de X » (salarie:<id>), qui n'est pas une clé de NAV_ACTIONS
  salarie: ['journee', 'semaine', 'mois', 'historique', 'conges', 'notifications', 'photo', 'borne', 'infos'],
};
const GUIDES = {
  bureau: ['ajouter_salarie', 'importer_salaries', 'creer_client', 'importer_clients', 'affecter', 'absence', 'demandes_conge', 'corriger', 'export',
    'cloture', 'couts', 'budget', 'reserves', 'role', 'reglages', 'documents', 'relancer', 'semaine', 'deplacer', 'heure_note', 'retirer', 'selection',
    'versions', 'present', 'attribuer', 'annuler_invitation', 'rappel', 'fiche_client', 'archiver_client', 'supprimer_client', 'fiche_salarie',
    'archiver_salarie', 'cloture_salarie', 'feuille', 'habilitations', 'cout_reel', 'reouvrir', 'telecharger', 'lever_reserve', 'depense', 'envoyer_client',
    'borne', 'position', 'sortie_oubliee', 'support', 'abonnement', 'recap', 'caisse', 'collegues', 'assistant'],
  salarie: ['reserve', 'photo-document', 'conge', 'pointer', 'envoyer-journee', 'noter-heures', 'planning', 'historique', 'copier-journee', 'notifications',
    'photo-profil', 'panier', 'modifier-heures', 'retirer-ligne', 'route-pause', 'lever-reserve', 'annuler-conge', 'sortie-oubliee', 'autre-chantier',
    'envoyer-client', 'borne', 'equipe', 'infos', 'collegues', 'assistant'],
};

/**
 * Outils dont le résultat est une carte à confirmer à cause d'un retrait ou d'un message qui part (niveau 3 de
 * l'outil, S87). Sert au seul choix de `outil` quand une capacité cite plusieurs outils : « le plus engageant »
 * sans dépasser le niveau de la capacité (une capacité de niveau 2 qui cite signaler_reserve ET retirer_reserve
 * garde signaler_reserve, sinon le registre la rangerait en niveau 3 alors que le cahier la veut au niveau 2).
 */
const OUTILS_CARTE = {
  bureau: ['supprimer_intervention', 'effacer_planning', 'supprimer_absence', 'supprimer_document', 'supprimer_depense', 'supprimer_habilitation',
    'annuler_invitation', 'changer_role', 'archiver_salarie', 'cloturer_mois', 'cout_reel'],
  salarie: ['envoyer_journee', 'nouveau_chantier', 'email_client', 'effacer_heures', 'annuler_conge', 'modifier_conge', 'retirer_photo', 'retirer_reserve'],
};

// ── Livraisons et échéances (§5.1, §6.2) ────────────────────────────────────

/** Échéance d'une dette par livraison : 3b au 31/01/2027, 3c au 28/02/2027, 3d au 30/06/2027 (= HORIZON_DETTES). */
const ECHEANCE = {
  '3b': '2027-01-31', '3c': '2027-02-28',
  '3d1': '2027-06-30', '3d2': '2027-06-30', '3d3': '2027-06-30', '3d4': '2027-06-30', '3d5': '2027-06-30', '3d6': '2027-06-30',
};

/** Livraison par genre quand l'exposition ne dit rien de plus : lire → 3c, ouvrir / naviguer (et guider, humain : une ouverture ou une fiche) → 3b. */
const LIVRAISON_PAR_GENRE = { lire: '3c', ouvrir: '3b', naviguer: '3b', guider: '3b', humain: '3b' };

/**
 * Livraison des capacités `ecrire` en dette ou en écart : §5.1, une ligne par sous-livraison. Pas de repli par
 * genre pour elles (3d1 à 3d6 se distinguent par le travail, pas par le genre) : un id absent de cette table fait ÉCHOUER l'import au
 * lieu d'être rangé au hasard. Les cas que le §5.1 ne nomme pas vont en 3d5 (« le reste », objectif 0 dette).
 */
const LIVRAISON_ECRITURE = {
  // 3d1 « Annuler partout » : annuler_derniere_action, conversions en niveau 2, provenance (bureau 14, 15)
  B23: '3d1', B28: '3d1', B32: '3d1', B36: '3d1', B54: '3d1', B108: '3d1',
  // 3d2 secrétaire : copier_intervention, tâches, réunions, chantier terminé, fin d'horaire, absence sans fin, versions, pointage
  B17: '3d2', B19: '3d2', B20: '3d2', B25: '3d2', B38: '3d2', B40: '3d2', B84: '3d2', B101: '3d2', B111: '3d2', B115: '3d2', B131: '3d2',
  // 3d4 dernier clic : rouvrir le mois, heures d'un salarié, renvoi, rôle / archivage, récap, habilitations, retraits ; B90 = modifier_paie_salarie supprimé
  B34: '3d4', B46: '3d4', B62: '3d4', B80: '3d4', B81: '3d4', B82: '3d4', B83: '3d4', B90: '3d4', B92: '3d4', B96: '3d4', B112: '3d4', B116: '3d4', B121: '3d4',
  // 3d5 le reste : réglages étendus, formations, horaires de la borne, tâches habituelles, ordre, documents, versions, messages, suppressions non listées
  B18: '3d5', B24: '3d5', B26: '3d5', B30: '3d5', B35: '3d5', B37: '3d5', B41: '3d5', B59: '3d5', B60: '3d5', B61: '3d5', B79: '3d5', B85: '3d5', B110: '3d5',
  B113: '3d5', B114: '3d5', B117: '3d5', B118: '3d5', B119: '3d5', B120: '3d5', B125: '3d5', B127: '3d5', B129: '3d5', B130: '3d5',
  // 3d3 ouvrier : confirmer le prévu, pause, sortie oubliée, journées passées, réserve + photo, tâche, formation vue, trou, contrôles de l'écran
  S3: '3d3', S8: '3d3', S14: '3d3', S15: '3d3', S22: '3d3', S23: '3d3', S24: '3d3', S26: '3d3', S27: '3d3', S28: '3d3', S30: '3d3', S31: '3d3', S32: '3d3',
  S34: '3d3', S38: '3d3', S39: '3d3', S40: '3d3', S41: '3d3', S42: '3d3', S44: '3d3', S60: '3d3', S64: '3d3', S81: '3d3',
  // 3d5 le reste (salarié) : documents du chantier (manque 10), chef d'équipe (décision du patron, §8 e), file du téléphone
  S66: '3d5', S67: '3d5', S68: '3d5', S70: '3d5', S71: '3d5', S80: '3d5', S105: '3d5',
};

/**
 * Cas où le genre de la capacité n'est pas celui de la pièce qui manque : la livraison suit la pièce, sinon la
 * dette tomberait « due » (T9) avant que son travail existe. Chaque ligne dit pourquoi.
 */
const LIVRAISON_FORCEE = {
  S49: ['3c', 'naviguer, mais ce qui manque est lire_mon_planning / lire_mes_heures (lectures de 3c)'],
  S50: ['3c', 'naviguer, mais ce qui manque est lire_mes_heures (lecture de 3c)'],
  S51: ['3c', 'naviguer, mais ce qui manque est lire_mes_heures (lecture de 3c)'],
  S43: ['3d3', 'lire, mais ce qui manque sont les contrôles de l\'envoi (manque salarié 5, §5.1 3d-3)'],
  S74: ['3d3', 'ouvrir, mais ce qui manque est couper_notifications, un geste d\'ouvrier de niveau 2 (3d-3)'],
  B43: ['3c', 'humain : l\'ouvreur (3b) doit dire « N lignes seraient verrouillées » = lire_verrou_export (3c)'],
  B44: ['3c', 'humain : l\'ouvreur (3b) doit lire l\'adresse du comptable et la période déjà partie (lectures de 3c)'],
};

/**
 * Le cahier date d'avant la révision 2 du contrat : là où le contrat a tranché autrement, la note le dit pour que
 * la dette ne soit pas implémentée telle que le cahier la décrit.
 */
const NOTE_CONTRAT = {
  B90: 'Contrat §5.1 (3d-4) : l\'outil modifier_paie_salarie est SUPPRIMÉ (le taux et le matricule partiraient chez le modèle) ; à sa place une capacité humain (donnee_sensible), ouvrir_fenetre(salarie.fiche, rubrique=paie) sans aucune valeur et un filtre local sur les phrases de paie.',
};

function livraisonDe(x, genre, { ambigu = false } = {}) {
  if (LIVRAISON_FORCEE[x.id]) return LIVRAISON_FORCEE[x.id][0];
  if (genre === 'ecrire') {
    const l = LIVRAISON_ECRITURE[x.id];
    if (l) return l;
    // Dette « à trancher » : aucune pièce nommée, donc aucune sous-livraison à choisir ; « le reste » (3d5) en attendant.
    if (ambigu) return '3d5';
    throw new Error(`${x.id} : écriture sans livraison dans LIVRAISON_ECRITURE (à décider d'après le §5.1)`);
  }
  return LIVRAISON_PAR_GENRE[genre];
}

// ── État d'une capacité ─────────────────────────────────────────────────────

const PARTIEL = /^PARTIEL\s+—/;

/** Les noms d'outils que l'exposition présente comme SIENS : en tête de texte (après « Outil », « Même outil »…) et l'ouvreur unique. */
function outilsPropose(e) {
  const trouves = new Set();
  const tete = e.match(/^(?:Même outil |Outil (?:à créer )?|Option de |Ouverture d['’]écran )?([a-z]+(?:_[a-z]+)+)\b/);
  if (tete) trouves.add(tete[1]);
  if (/\bouvrir_fenetre\b/.test(e)) trouves.add('ouvrir_fenetre');
  return [...trouves];
}

/**
 * Bureau : aucun champ d'état dans le JSON (§0.2), donc lecture du début de l'exposition, marques du cahier 02 :
 *   « PARTIEL — » ........................... écart (existe, fait moins)
 *   « Déjà couvert » / « Outil existant » ... couverte
 *   « Aucun outil » / « Mécanisme déjà en place » / « Pas une action » (genre humain) ... sans objet : l'humain fait tout
 *   un outil ABSENT du code, nommé comme sien (« Outil lire_x », « ouvrir_fenetre(… »), ou « Étendre <outil> » ... dette
 * Tout le reste est AMBIGU : dette « à trancher », jamais couverte par défaut (une couverte oubliée ne se verrait
 * plus jamais ; une dette de trop se ferme d'une ligne, et le plafond ne fait que baisser).
 */
function etatBureau(x, etatsDejaLus) {
  const e = x.exposition.trim();
  if (PARTIEL.test(e)) return { etat: 'ecart' };
  if (/^Déjà couvert/.test(e) || /^Outil existant/.test(e)) return { etat: 'couvert' };
  if (x.genre === 'humain' && /^(Aucun outil|Mécanisme déjà en place|Pas une action)/.test(e)) return { etat: 'sans_objet' };

  const renvoi = e.match(/^Même outil que (B\d+)\b/);
  if (renvoi) {
    const parent = etatsDejaLus.get(renvoi[1]);
    if (parent && (parent.etat === 'dette' || parent.etat === 'ecart')) return { etat: parent.etat === 'dette' ? 'dette' : 'ecart' };
    return { etat: 'ambigu', pourquoi: `l'exposition renvoie à ${renvoi[1]} (« Même outil que ${renvoi[1]} ») sans dire elle-même si le geste est couvert` };
  }
  if (/^Étendre /.test(e)) return { etat: 'dette', extension: true };
  const absents = outilsPropose(e).filter((t) => !OUTILS.bureau.includes(t));
  if (absents.length) return { etat: 'dette', absents };
  if (/Aucune fiche/.test(e)) return { etat: 'dette', absents: ['fiche d\'aide à écrire'] };
  return { etat: 'ambigu', pourquoi: 'l\'exposition du cahier ne dit pas l\'état actuel (ni couvert, ni partiel, ni outil à créer nommé comme sien)' };
}

/** Salarié : l'état est écrit en toutes lettres en tête de l'exposition (cahier 02-salarié, « Conventions »). */
function etatSalarie(x) {
  const e = x.exposition.trim();
  if (/^COUVERT\s+—/.test(e)) return { etat: 'couvert' };
  if (PARTIEL.test(e)) return { etat: 'ecart' };
  if (/^À CRÉER\s+—/.test(e)) return { etat: 'dette' };
  if (/^RÉSERVÉ À L['’]HUMAIN\s+—/.test(e)) return { etat: 'sans_objet' };
  throw new Error(`${x.id} : exposition sans état reconnu (« ${e.slice(0, 30)} »)`);
}

// ── Catégorie d'un geste réservé à l'humain (proposée par mots-clés, à relire) ──────────

/**
 * Deux passes : la première clause de la raison (avant « : » ou « ( ») dit le sujet, la plus fiable ; sinon le
 * texte entier. Au sein d'une passe, l'ordre des règles départage (le plus spécifique d'abord).
 */
const REGLES_CATEGORIE = [
  ['paiement', /abonnement|paiement|stripe/i],
  ['securite', /mot de passe|identifiants?\b|sécurité de session|fin de session/i],
  ['droits_acces', /droits? d['’]accès/i],
  ['donnee_sensible', /sécurité sociale|donnée de paie|CNIL|conversations privées/i],
  ['appareil', /appairage|tablette|caméra|geste physique|présence physique|QR physique|messagerie|file du navigateur|comportement de l['’]appareil/i],
  ['niveau3_valide', /liste du niveau 3 validée|e-mails groupés|export/i],
  ['hors_ecran', /états? d['’]écran|geste d['’]écran sans effet|présentation d['’]écran|n['’]héberge pas l['’]assistant|raccourcis? de la page|rien à agir|mécanisme|dernier clic humain|identité|garde-fou de coût/i],
];

function categorieHumain(raison) {
  // Un « à confirmer par le patron » écrit dans la raison l'emporte sur tout : c'est la question vivante du §8.
  if (/à confirmer par le patron|décision du patron/i.test(raison)) return 'doute_patron';
  const clause = raison.split(/\s[:(]\s?|\s\(/)[0];
  for (const texte of [clause, raison]) {
    for (const [categorie, motif] of REGLES_CATEGORIE) if (motif.test(texte)) return categorie;
  }
  return 'doute_patron'; // repli : niveau 3 par défaut en attendant le patron (§2.4)
}

// ── Textes : notes courtes tirées de l'exposition ───────────────────────────

function aplatir(t) { return String(t).replace(/\s+/g, ' ').trim(); }

function phrases(t) { return aplatir(t).split(/(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ«"(])/); }

/** Coupe à `max` caractères, de préférence à une frontière de proposition (« ; ») puis de mot, jamais au milieu d'un mot. */
function couper(t, max) {
  if (t.length <= max) return t;
  const fenetre = t.slice(0, max - 1);
  const pointVirgule = fenetre.lastIndexOf(' ; ');
  const coupe = pointVirgule > max * 0.5 ? fenetre.slice(0, pointVirgule) : fenetre.slice(0, Math.max(fenetre.lastIndexOf(' '), max - 40));
  return `${coupe.replace(/[\s,;:(]+$/, '')}…`;
}

const MARQUE_MANQUE = /^(Écarts?|À créer|Manque|Manquent|Limites?|Aujourd['’]hui)\b|n['’]existe pas|\bn['’]a (?:ni|pas|aucun)\b|\baucun(?:e)? (?:outil|lien|lecture)\b/i;

/**
 * Ce qui existe (première phrase), puis ce qui manque : la phrase « À créer : … » du cahier si elle existe (elle
 * nomme la pièce à construire), sinon la première phrase marquée comme un manque. Sans le préfixe d'état.
 */
function resumer(exposition, { manque = true, max = 260 } = {}) {
  const sans = aplatir(exposition).replace(/^(PARTIEL|COUVERT|À CRÉER|RÉSERVÉ À L['’]HUMAIN)\s+—\s*/, '');
  const ph = phrases(sans);
  const premiere = couper(ph[0], max);
  if (!manque) return premiere;
  const creer = ph.slice(1).find((p) => /^À créer\b/.test(p));
  const trou = creer ?? ph.slice(1).find((p) => MARQUE_MANQUE.test(p));
  return trou ? `${premiere} ${couper(trou, creer ? 170 : 200)}` : premiere;
}

// ── Construction de la capacité ─────────────────────────────────────────────

function choisirOutil(cote, niveau, outilsCites) {
  const reels = outilsCites.filter((o) => o !== 'repondre');
  if (reels.length === 0) return outilsCites.includes('repondre') ? 'repondre' : undefined;
  const niveauOutil = (o) => (OUTILS_CARTE[cote].includes(o) ? 3 : 2);
  const admis = reels.filter((o) => niveauOutil(o) <= niveau);
  const pool = admis.length ? admis : reels;
  return pool.reduce((meilleur, o) => (niveauOutil(o) > niveauOutil(meilleur) ? o : meilleur));
}

function decouperActions(cote, x) {
  const r = { outils: [], nav: [], guides: [], ignores: [], inconnus: [] };
  for (const a of x.actions_existantes) {
    const i = a.indexOf(':');
    const type = i < 0 ? 'outil' : a.slice(0, i);
    const nom = i < 0 ? a : a.slice(i + 1);
    if (type === 'NAV_ACTION' || type === 'WORKER_NAV') {
      if (nom === '*' || !NAV[cote].includes(nom)) r.inconnus.push(a); else r.nav.push(a);
    } else if (type === 'guide') {
      if (nom === '*' || !GUIDES[cote].includes(nom)) r.inconnus.push(a); else r.guides.push(nom);
    } else if (type === 'instantane' || type === 'local') {
      r.ignores.push(a);
    } else if (type === 'outil' && nom === 'multi') {
      r.ignores.push(a);
    } else if (type === 'outil' && OUTILS[cote].includes(nom)) {
      r.outils.push(nom);
    } else {
      r.inconnus.push(a); // ni outil, ni navigation, ni guide du code : à dire dans le rapport
    }
  }
  return r;
}

function construire(cote, brut) {
  const etats = new Map();
  const resultats = [];
  const NIVEAU_OK = new Set([1, 2, 3]);
  for (const x of brut) {
    if (!NIVEAU_OK.has(x.niveau)) throw new Error(`${x.id} : niveau ${x.niveau} hors 1/2/3`);
    const etat = cote === 'bureau' ? etatBureau(x, etats) : etatSalarie(x);
    etats.set(x.id, etat);
    const acts = decouperActions(cote, x);
    const c = { id: x.id, cote, libelle: x.libelle, genre: x.genre, niveau: x.niveau };
    const rapport = { id: x.id, etat: etat.etat, genre: x.genre, niveau: x.niveau, acts, ambigu: etat.etat === 'ambigu' ? etat.pourquoi : undefined, sansOutil: [] };
    const commentaires = [];

    if (acts.guides.length) c.guides = acts.guides;
    let outil = choisirOutil(cote, x.niveau, acts.outils);
    if (x.genre === 'humain' && outil && outil !== 'repondre') {
      // T4 : une capacité humain n'a jamais d'outil d'écriture. Le cahier cite quand même ces outils (« l'assistant
      // couvre les mêmes gestes ») : on les garde en commentaire plutôt que de les perdre.
      rapport.sansOutil = acts.outils.filter((o) => o !== 'repondre');
      commentaires.push(`outils cités par le cahier, non retenus (capacité humain, T4) : ${rapport.sansOutil.join(', ')}`);
      outil = acts.outils.includes('repondre') ? 'repondre' : undefined;
    }
    if (outil) c.outil = outil;

    if (x.genre === 'humain') {
      if (!x.raison_humaine || x.raison_humaine.trim().length < 30) throw new Error(`${x.id} : genre humain sans raison_humaine d'au moins 30 caractères`);
      c.humain = { categorie: categorieHumain(x.raison_humaine), raison: aplatir(x.raison_humaine) };
    } else if (x.raison_humaine && x.raison_humaine.trim()) {
      commentaires.push(`raison du niveau ${x.niveau} (cahier) : ${aplatir(x.raison_humaine)}`);
    }

    const noteContrat = NOTE_CONTRAT[x.id] ? ` ${NOTE_CONTRAT[x.id]}` : '';
    if (etat.etat === 'ecart') {
      c.ecart = { livraison: livraisonDe(x, x.genre), note: resumer(x.exposition) + noteContrat };
    } else if (etat.etat === 'dette') {
      const livraison = livraisonDe(x, x.genre);
      let note = resumer(x.exposition);
      if (etat.extension) note = `Extension d'un outil existant. ${note}`;
      c.dette = { livraison, avant: ECHEANCE[livraison], note: note + noteContrat };
    } else if (etat.etat === 'ambigu') {
      const livraison = livraisonDe(x, x.genre, { ambigu: true });
      c.dette = { livraison, avant: ECHEANCE[livraison], note: `À trancher : ${etat.pourquoi}. Exposition du cahier : ${resumer(x.exposition, { manque: false, max: 190 })}` };
    }
    if (acts.nav.length) commentaires.unshift(`navigation existante, rattachée par un ouvreur en 3b : ${acts.nav.join(', ')}`);
    if (acts.ignores.length) commentaires.push(`comportement hors registre (instantané, lecteur local, fiche multi) : ${acts.ignores.join(', ')}`);
    if (acts.inconnus.length) commentaires.push(`référence du cahier absente du code, ignorée : ${acts.inconnus.join(', ')}`);

    c.__commentaires = commentaires;
    resultats.push({ capacite: c, rapport });
  }
  return resultats;
}

// ── Écriture TypeScript ─────────────────────────────────────────────────────

function q(s) {
  const t = String(s);
  const echappe = (guillemet) => t.replace(/\\/g, '\\\\').replace(new RegExp(guillemet, 'g'), `\\${guillemet}`).replace(/\r?\n/g, ' ');
  if (!t.includes('\'')) return `'${echappe('\'')}'`;
  if (!t.includes('"')) return `"${echappe('"')}"`;
  return `'${echappe('\'')}'`;
}

function listeQ(valeurs, indent) {
  const un = `[${valeurs.map(q).join(', ')}]`;
  if (indent.length + un.length + 12 <= 120) return un;
  const lignes = [];
  let courante = '';
  for (const v of valeurs.map(q)) {
    if (courante && (indent + '  ' + courante + ', ' + v).length > 118) { lignes.push(courante + ','); courante = v; }
    else courante = courante ? `${courante}, ${v}` : v;
  }
  lignes.push(courante + ',');
  return `[\n${lignes.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}]`;
}

function bloc(c) {
  const lignes = [];
  const titre = `${c.id} · ${c.genre} · niveau ${c.niveau}`;
  lignes.push(`  // ${titre}`);
  for (const k of c.__commentaires) lignes.push(`  // ${k}`);
  lignes.push('  {');
  lignes.push(`    id: ${q(c.id)}, cote: ${q(c.cote)}, libelle: ${q(c.libelle)},`);
  lignes.push(`    genre: ${q(c.genre)}, niveau: ${c.niveau},`);
  if (c.guides) lignes.push(`    guides: ${listeQ(c.guides, '    ')},`);
  if (c.outil) lignes.push(`    outil: ${q(c.outil)},`);
  if (c.humain) {
    lignes.push('    humain: {');
    lignes.push(`      categorie: ${q(c.humain.categorie)},`);
    lignes.push(`      raison: ${q(c.humain.raison)},`);
    lignes.push('    },');
  }
  if (c.dette) {
    lignes.push('    dette: {');
    lignes.push(`      livraison: ${q(c.dette.livraison)}, avant: ${q(c.dette.avant)},`);
    lignes.push(`      note: ${q(c.dette.note)},`);
    lignes.push('    },');
  }
  if (c.ecart) {
    lignes.push('    ecart: {');
    lignes.push(`      livraison: ${q(c.ecart.livraison)},`);
    lignes.push(`      note: ${q(c.ecart.note)},`);
    lignes.push('    },');
  }
  lignes.push('  },');
  return lignes.join('\n');
}

const ENTETE = {
  bureau: {
    nom: 'CAPACITES_BUREAU', json: 'capacites-bureau.json', ids: 'B1…B138, puis B139+',
    quoi: 'ce que le patron peut faire ou demander dans BEMEXO',
  },
  salarie: {
    nom: 'CAPACITES_SALARIE', json: 'capacites-salarie.json', ids: 'S1…S105, puis S106+',
    quoi: 'ce que le salarié peut faire ou demander dans BEMEXO',
  },
};

function fichierTs(cote, resultats) {
  const h = ENTETE[cote];
  const n = resultats.length;
  return [
    `// Capacités du ${cote === 'bureau' ? 'BUREAU' : 'SALARIÉ'} (${h.ids}) : ${h.quoi}.`,
    '// Couche STABLE du registre : ids jamais renumérotés ni réutilisés (T3). Contrat : docs/ia-etape3/00-conception-etape3.md §2.',
    `// Généré UNE fois par scripts/registre-import.mjs depuis docs/ia-etape3/${h.json} (${n} entrées ; libellés du cahier mot pour mot).`,
    '// Depuis, ce fichier est la SOURCE : on y ajoute les nouvelles capacités et on y ferme les dettes ; le script refuse de l\'écraser.',
    '// Lecture : aucun champ d\'état = couverte par `outil` / `guides` ; `ecart` = couverte en partie ; `dette` = rien encore (échéance `avant`) ;',
    '// `humain` = le dernier clic reste à l\'humain (peut aller avec un `ecart` ou une `dette` : l\'aide de l\'assistant, ouvrir ou lire, manque).',
    '// Les commentaires « navigation existante » notent les liens du code que les ouvreurs de la livraison 3b rattacheront à la capacité.',
    'import type { Capacite } from \'./types.ts\';',
    '',
    `export const ${h.nom}: Capacite[] = [`,
    resultats.map(({ capacite }) => bloc(capacite)).join('\n'),
    '];',
    '',
  ].join('\n');
}

// ── Fichiers générés ────────────────────────────────────────────────────────

/** B1 < B2 < … < B138 < S1 < … : tri par préfixe puis par numéro (le tri alphabétique rangerait B10 avant B2). */
function idCompare(a, b) {
  const [, pa, na] = /^([A-Z]+)(\d+)$/.exec(a);
  const [, pb, nb] = /^([A-Z]+)(\d+)$/.exec(b);
  return pa === pb ? Number(na) - Number(nb) : pa < pb ? -1 : 1;
}

function lireJson(chemin, repli) {
  if (!existsSync(chemin)) return repli;
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

/**
 * Décide ce qu'il faut faire d'un fichier, sans rien écrire : 'identique' (rien), 'ecrire' ou 'refuse'.
 * Écrire plus tard, en bloc, seulement si AUCUN fichier n'est refusé : un capacites-bureau.ts modifié à la main
 * et un dettes.json réécrit avec d'autres comptes feraient un dépôt incohérent.
 */
function planifier(chemin, contenu, { protege }) {
  const actuel = existsSync(chemin) ? readFileSync(chemin, 'utf8') : null;
  if (actuel === contenu) return { chemin, contenu, statut: 'identique' };
  const gabarit = actuel !== null && /Capacite\[\] = \[\];\s*$/.test(actuel); // le socle vide de 3a-1
  if (protege && actuel !== null && !gabarit && !ecraser) return { chemin, contenu, statut: 'refuse' }; // une capacité B139+ ajoutée à la main serait perdue
  return { chemin, contenu, statut: 'ecrire' };
}

// ── Vérification contre le code (avertit, ne bloque pas) ────────────────────

function verifierCode() {
  const avertissements = [];
  const lire = (f) => (existsSync(join(SOURCES_CODE, f)) ? readFileSync(join(SOURCES_CODE, f), 'utf8') : null);
  const pairs = [
    ['bureau', 'assistant-actions-core.ts', 'export const ASSISTANT_FUNCTIONS', 'export const ATTACHMENT_ACTIONS'],
    ['salarie', 'worker-assistant-core.ts', 'export const WORKER_FUNCTIONS', 'export const WORKER_ATTACHMENT_ACTIONS'],
  ];
  for (const [cote, fichier, debut, fin] of pairs) {
    const src = lire(fichier);
    if (src === null) { avertissements.push(`${fichier} introuvable : listes d'outils non vérifiées`); continue; }
    const a = src.indexOf(debut); const b = src.indexOf(fin);
    if (a < 0 || b < a) { avertissements.push(`${fichier} : bornes de ${debut} introuvables`); continue; }
    const noms = [...src.slice(a, b).matchAll(/\bname:\s*'([a-z_]{3,40})'/g)].map((m) => m[1]);
    const attendus = new Set(OUTILS[cote]);
    const trouves = new Set(noms);
    const manquants = [...attendus].filter((o) => !trouves.has(o));
    const nouveaux = [...trouves].filter((o) => !attendus.has(o));
    if (manquants.length || nouveaux.length) avertissements.push(`${cote} : outils du code ≠ liste embarquée (disparus : ${manquants.join(', ') || '—'} ; nouveaux : ${nouveaux.join(', ') || '—'})`);
  }
  return avertissements;
}

// ── Programme ───────────────────────────────────────────────────────────────

function main() {
  const brut = {
    bureau: JSON.parse(readFileSync(join(DOCS, 'capacites-bureau.json'), 'utf8')),
    salarie: JSON.parse(readFileSync(join(DOCS, 'capacites-salarie.json'), 'utf8')),
  };
  const attendu = { bureau: 138, salarie: 105 };
  for (const cote of ['bureau', 'salarie']) {
    if (brut[cote].length !== attendu[cote]) throw new Error(`${cote} : ${brut[cote].length} entrées au lieu de ${attendu[cote]}`);
    const ids = brut[cote].map((x) => x.id);
    if (new Set(ids).size !== ids.length) throw new Error(`${cote} : ids en double`);
  }

  const parCote = { bureau: construire('bureau', brut.bureau), salarie: construire('salarie', brut.salarie) };
  const plans = [];
  for (const cote of ['bureau', 'salarie']) {
    plans.push(planifier(join(REGISTRE, `capacites-${cote}.ts`), fichierTs(cote, parCote[cote]), { protege: true }));
  }

  // ids.snapshot.json : union de ce qui existe déjà et des ids importés, triée (un id publié ne disparaît jamais)
  const cheminIds = join(REGISTRE, 'ids.snapshot.json');
  const deja = lireJson(cheminIds, []);
  const tous = [...new Set([...deja, ...parCote.bureau.map((r) => r.capacite.id), ...parCote.salarie.map((r) => r.capacite.id)])].sort(idCompare);
  plans.push(planifier(cheminIds, `${JSON.stringify(tous, null, 2)}\n`, { protege: false }));

  // dettes.json : seuls dette et ecart viennent d'ici ; interne et ecritures_non_assistees appartiennent à d'autres étapes
  const compte = (cle) => [...parCote.bureau, ...parCote.salarie].filter((r) => r.capacite[cle]).length;
  const cheminDettes = join(REGISTRE, 'dettes.json');
  const avant = lireJson(cheminDettes, { max: {} }).max ?? {};
  const dettes = { max: { dette: compte('dette'), ecart: compte('ecart'), interne: avant.interne ?? 0, ecritures_non_assistees: avant.ecritures_non_assistees ?? 0 } };
  plans.push(planifier(cheminDettes, `${JSON.stringify(dettes, null, 2)}\n`, { protege: false }));

  const refuse = plans.some((p) => p.statut === 'refuse');
  const sorties = plans.map((p) => {
    const nom = p.chemin.slice(REGISTRE.length + 1);
    if (p.statut === 'ecrire' && !refuse && !aBlanc) {
      mkdirSync(dirname(p.chemin), { recursive: true });
      writeFileSync(p.chemin, p.contenu);
      return [nom, 'ecrit'];
    }
    return [nom, p.statut === 'ecrire' && (refuse || aBlanc) ? (refuse ? 'non écrit (un fichier est refusé)' : 'a_ecrire') : p.statut];
  });

  rapport(parCote, sorties, dettes);
  if (refuse) process.exitCode = 1;
}

function rapport(parCote, sorties, dettes) {
  const out = [];
  for (const cote of ['bureau', 'salarie']) {
    const rs = parCote[cote];
    const nb = (f) => rs.filter(f).length;
    const par = (cle) => rs.reduce((m, r) => ((m[r.rapport[cle]] = (m[r.rapport[cle]] || 0) + 1), m), {});
    out.push(`── ${cote} : ${rs.length} capacités`);
    out.push(`   genres  ${JSON.stringify(par('genre'))}`);
    out.push(`   niveaux ${JSON.stringify(par('niveau'))}`);
    out.push(`   états   ${JSON.stringify(par('etat'))}`);
    out.push(`   dette ${nb((r) => r.capacite.dette)} (dont à trancher ${nb((r) => r.rapport.ambigu)}) · écart ${nb((r) => r.capacite.ecart)} · humain ${nb((r) => r.capacite.humain)} · avec outil ${nb((r) => r.capacite.outil)}`);
    const trancher = rs.filter((r) => r.rapport.ambigu).map((r) => r.capacite.id);
    out.push(`   à trancher : ${trancher.join(', ') || '—'}`);
    const sansRien = rs.filter(({ capacite: c }) => !c.outil && !c.ouvreurs && !c.humain && !c.dette).map((r) => r.capacite.id);
    out.push(`   sans outil ni ouvreurs ni humain ni dette (T3 tel qu'écrit) : ${sansRien.length} → ${sansRien.join(', ') || '—'}`);
    const inconnus = rs.filter((r) => r.rapport.acts.inconnus.length).map((r) => `${r.capacite.id}[${r.rapport.acts.inconnus.join(' ')}]`);
    if (inconnus.length) out.push(`   références du cahier absentes du code (ignorées) : ${inconnus.join(' ; ')}`);
  }
  out.push(`── dettes.json : ${JSON.stringify(dettes.max)}`);
  for (const [f, s] of sorties) out.push(`   ${f} : ${s}`);
  const av = verifierCode();
  for (const a of av) out.push(`   ATTENTION ${a}`);
  if (sorties.some(([, s]) => s === 'refuse')) out.push('   REFUSÉ : capacites-*.ts a changé depuis la génération ; relancer avec --ecraser pour le réécrire (les ajouts à la main seront perdus).');
  console.log(out.join('\n'));
}

main();
