// Les OUVREURS du bureau, côté navigateur (étape 3, livraison 3b-1) : vagues 1 et 2 de docs/ia-etape3/00-conception-etape3.md §3.1.
//
// CHARGÉ À LA DEMANDE par components/admin-planning.tsx (`import('@/lib/openers-bureau')`, après l'affichage) : ces 25 implémentations ne pèsent pas dans le premier
// chargement de /admin (budget : voir registre/README.md). La page lui prête ses poignées (`PoigneesBureau` : ses setters et deux ou trois fonctions) dans une `ref` ; chaque
// ouvreur les lit AU MOMENT d'ouvrir, donc jamais sur des données périmées.
//
// RÈGLE ABSOLUE : un ouvreur POSE des états (ouvre une fenêtre, remplit un champ que la personne peut changer). Il ne clique jamais « Enregistrer », « Envoyer », « Clôturer »,
// n'appelle ni `demanderExport` ni aucune écriture. La seule lecture qu'il déclenche est celle de `askClosure` (compte des journées en brouillon d'un mois, comme le bouton).
// Il ferme d'abord la NAVIGATION sans saisie (listes, panneaux, menus), jamais une fenêtre à saisie : `openLink` a déjà répondu `occupe` dans ce cas.
import { registerOpeners, isNarrow, type ImplOuvreur } from '@/lib/openers';
import { OUVREURS_LEGER_BUREAU } from '@/supabase/functions/_shared/registre/ouvreurs-leger-bureau';

interface Identifie { id: string }
export interface PoigneesBureau {
  /** Les données sont lues (« Chargement du planning… » terminé) : sinon un ouvreur qui a besoin d'un salarié ou d'un chantier répond `file`. */
  pret: boolean;
  workers: Identifie[]; worksites: Identifie[];
  tracesOn: boolean; versionsOn: boolean; trainingsOn: boolean;
  /** Une fenêtre à saisie est ouverte ? */
  occupe: () => boolean;
  /** Ferme la navigation sans saisie (listes, panneaux, menus). */
  fermer: () => void;
  /** Pose la ligne « Pré-rempli par l'assistant : vérifiez avant d'enregistrer » dans la fenêtre `id`. */
  pre: (id: string | null) => void;
  /** Les clics sur un bouton de niveau 3 sont ignorés pendant 700 ms (le bouton se retrouve sous le doigt). */
  garde: () => void;
  salaries: { query: (q: string) => void; open: (o: boolean) => void; importer: (o: boolean) => void };
  clients: { query: (q: string) => void; menu: (o: boolean) => void; liste: (o: boolean) => void; importer: (o: boolean) => void };
  fenetres: { reserves: (o: boolean) => void; conges: (o: boolean) => void; stats: (o: boolean) => void; traces: (o: boolean) => void; versions: (o: boolean) => void; formations: (o: boolean) => void };
  relances: { panneau: (v: 'waiting' | null) => void; liste: (o: boolean) => void };
  selection: () => void;
  semaine: { aller: (iso: string) => void; jour: (i: number) => void };
  fiche: { salarie: (w: Identifie | null) => void; mode: (m: 'hours' | 'manage') => void; client: (ws: Identifie) => void; documents: (v: { ws: Identifie; day: string | null }) => void };
  nouveauClient: { champs: [(v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void]; open: (o: boolean) => void };
  nouveauSalarie: { champs: [(v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void]; open: (o: boolean) => void };
  exporter: { periode: (r: { from: Date; to: Date }) => void; open: (o: boolean) => void; salarie: (o: boolean) => void; cloture: (mois: string) => void };
  ajouter: { ouvrir: (workerId: string, date: string) => void; champs: [(v: string) => void, (v: string) => void, (v: string) => void, (v: string) => void]; type: (k: 'intervention' | 'tache') => void };
  statut: (v: { worker: Identifie; fromStr: string }) => void;
  absence: (worker: Identifie, type: string, fromStr: string) => void;
  absenceFin: (iso: string | null) => void;
}

const jour = (iso: string) => new Date(`${iso}T00:00:00`);
/** Le jour de la semaine, lundi = 0 (comme `mobileDayIdx`). */
const indexJour = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
/** Les deux mois qu'un bureau peut clôturer : celui qui vient de finir et celui en cours (components/admin-planning.tsx `closableMonths`). */
function moisClotures(): string[] {
  const n = new Date();
  const p = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return [f(p), f(n)];
}

export function registerBureau(ref: { current: PoigneesBureau | null }): () => void {
  const H = () => ref.current as PoigneesBureau;
  /** La page n'a pas fini de lire ses données : on attend (file), sans rien perdre. */
  const attend = () => !H().pret;
  const trouve = (liste: Identifie[], id: string | undefined) => (id ? liste.filter((x) => x.id === id)[0] : undefined);
  /** Ferme la navigation puis pose la ligne « Pré-rempli » si quelque chose a été posé. */
  const debut = () => { H().fermer(); H().pre(null); };
  return registerOpeners('bureau', {
    // ── Vague 1 ──
    'salaries.liste': (p) => { debut(); H().salaries.query(p.recherche || ''); H().salaries.open(true); },
    'salaries.importer': () => { debut(); H().salaries.importer(true); },
    'clients.importer': () => { debut(); H().clients.importer(true); },
    'reserves.registre': () => { debut(); H().fenetres.reserves(true); },
    'conges.demandes': () => { debut(); H().fenetres.conges(true); },
    'stats.equipe': () => { debut(); H().fenetres.stats(true); },
    'planning.supprimees': () => { debut(); H().fenetres.traces(true); },
    'planning.versions': (p) => { debut(); if (p.lundi) H().semaine.aller(p.lundi); H().fenetres.versions(true); },
    'formations.gestion': () => { debut(); H().fenetres.formations(true); },
    'relances.liste': () => { debut(); if (isNarrow()) H().relances.liste(true); else H().relances.panneau('waiting'); },
    'planning.selection': () => { debut(); H().selection(); },
    'clients.liste': (p) => { debut(); H().clients.query(p.recherche || ''); if (isNarrow()) H().clients.liste(true); else H().clients.menu(true); },
    // ── Vague 2 ──
    'planning.semaine': (p) => {
      debut();
      const cible = p.lundi || p.jour;
      if (cible) H().semaine.aller(cible);
      if (p.jour) H().semaine.jour(indexJour(p.jour));
    },
    'salarie.fiche': (p) => {
      if (attend()) return 'file';
      const w = trouve(H().workers, p.salarie);
      if (!w) return 'indisponible';
      debut(); H().fiche.mode(p.mode === 'manage' ? 'manage' : 'hours'); H().fiche.salarie(w);
    },
    'client.fiche': (p) => {
      if (attend()) return 'file';
      const ws = trouve(H().worksites, p.chantier);
      if (!ws) return 'indisponible';
      debut(); H().fiche.client(ws);
    },
    'chantier.documents': (p) => {
      if (attend()) return 'file';
      const ws = trouve(H().worksites, p.chantier);
      if (!ws) return 'indisponible';
      debut(); H().fiche.documents({ ws, day: p.jour || null });
    },
    'client.nouveau': (p) => {
      debut();
      const f = H().nouveauClient.champs; const v = [p.nom, p.produit, p.telephone, p.email, p.ville, p.adresse, p.description];
      for (let i = 0; i < f.length; i++) f[i](v[i] || '');
      if (v.some(Boolean)) H().pre('client.nouveau');
      H().nouveauClient.open(true);
    },
    'salarie.nouveau': (p) => {
      debut();
      const f = H().nouveauSalarie.champs; const v = [p.prenom, p.nom, p.email, p.telephone];
      for (let i = 0; i < f.length; i++) f[i](v[i] || '');
      if (v.some(Boolean)) H().pre('salarie.nouveau');
      H().nouveauSalarie.open(true);
    },
    // Niveau 3 : la période est posée, jamais l'export. Les clics qui exportent sont ignorés 700 ms (la fenêtre se retrouve sous le doigt).
    'export.equipe': (p) => {
      debut();
      if (p.du) H().exporter.periode({ from: jour(p.du), to: jour(p.au && p.au >= p.du ? p.au : p.du) });
      H().garde(); H().exporter.open(true);
    },
    'cloture.mois': (p) => {
      if (!p.mois || moisClotures().indexOf(p.mois) < 0) return 'indisponible';
      debut(); H().exporter.cloture(p.mois);                              // la garde de 700 ms est armée par la page quand la confirmation apparaît (après le comptage)
    },
    'planning.ajouter': (p) => {
      if (attend()) return 'file';
      const w = trouve(H().workers, p.salarie);
      if (!w || !p.date) return 'indisponible';
      debut();
      H().ajouter.ouvrir(w.id, p.date);                                 // remet les champs à zéro (openAdd), PUIS on pose les valeurs
      const ws = trouve(H().worksites, p.chantier);
      const c = H().ajouter.champs; const v = [ws ? ws.id : '', p.debut, p.fin, p.note];
      for (let i = 0; i < c.length; i++) if (v[i]) c[i](v[i]);
      if (p.type === 'tache') H().ajouter.type('tache');
      if (v.some(Boolean)) H().pre('planning.ajouter');
    },
    'salarie.statut': (p) => {
      if (attend()) return 'file';
      const w = trouve(H().workers, p.salarie);
      if (!w) return 'indisponible';
      debut(); H().statut({ worker: w, fromStr: p.date || new Date().toLocaleDateString('sv-SE') });
    },
    'absence.poser': (p) => {
      if (attend()) return 'file';
      const w = trouve(H().workers, p.salarie);
      if (!w || !p.du) return 'indisponible';
      debut(); H().absence(w, p.type || 'conge', p.du); H().absenceFin(p.au && p.au >= p.du ? p.au : null);
      H().pre('absence.poser');
    },
    'export.salarie': (p) => {
      debut();
      const w = p.salarie ? trouve(H().workers, p.salarie) : undefined;
      if (w) H().fiche.salarie(w); else H().exporter.salarie(true);       // un salarié nommé : sa feuille d'heures (calendrier, Excel, PDF) ; sinon le choix du salarié
    },
  } as Record<string, ImplOuvreur>, {
    table: OUVREURS_LEGER_BUREAU,
    role: 'admin',
    // Bureau v2 (drapeau `data-dz-bureau` posé par le planning v2) : « Versions du planning » n'est plus offert dans l'interface ; l'ouvreur répond « indisponible ».
    dispo: (d) => (d === 'traces' ? H().tracesOn : d === 'versions' ? H().versionsOn && !document.documentElement.hasAttribute('data-dz-bureau') : d === 'formations' ? H().trainingsOn : true),
    occupe: () => H().occupe(),
  });
}

/** `abonnement.choisir` vit dans la page /admin (le panneau « Choisissez votre abonnement » est à elle, pas à la grille du planning). */
export function registerAbonnement(ouvrirPanneau: () => void): () => void {
  return registerOpeners('bureau', { 'abonnement.choisir': () => { ouvrirPanneau(); } }, { table: OUVREURS_LEGER_BUREAU, role: 'admin' });
}
