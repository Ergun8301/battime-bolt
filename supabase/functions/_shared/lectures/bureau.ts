// Étape 3 · 3c — les 8 lectures du BUREAU. Voir lecteur.ts pour les règles communes (liste blanche, noms, pas d'UUID, pas de coût par salarié).
import {
  annuaire, couper, heures, idsParNom, minutes, NON_FIABLE, observation, periode, plusJours, rows, texte,
  type Annuaire, type ContexteLecture, type ResultatLecture,
} from './lecteur.ts';

export type CacheLecture = { annuaire?: Annuaire };
export interface OutilLecture {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run(args: Record<string, unknown>, ctx: ContexteLecture, cache: CacheLecture): Promise<ResultatLecture>;
}

const P_DU = { type: 'string', description: 'Début de période, aaaa-mm-jj.' };
const P_AU = { type: 'string', description: 'Fin de période, aaaa-mm-jj.' };
const P_SALARIE = { type: 'string', description: 'Prénom et/ou nom du salarié (facultatif).' };
const P_CHANTIER = { type: 'string', description: 'Nom du chantier ou du client (facultatif).' };
const MAX_LIGNES = 60;

const PLANNING: OutilLecture = {
  name: 'lire_planning',
  description: 'LIT le planning (qui est prévu où, absences) sur une période de 28 jours au plus (par défaut : cette semaine). Utilise-le pour « qui travaille où », « qui est absent », « que fait X lundi ». Ne modifie rien.',
  parameters: { type: 'object', properties: { du: P_DU, au: P_AU, salarie: P_SALARIE, chantier: P_CHANTIER } },
  async run(args, ctx, cache) {
    const p = periode(args, ctx.today, 28, 0, 6);
    if ('erreur' in p) return { donnees: { erreur: p.erreur } };
    const an = await annuaire(ctx, cache);
    const r = await ctx.db.from('planning').select('user_id, work_date, worksite_id, absence_type, estimated_start, estimated_end')
      .eq('company_id', ctx.companyId).gte('work_date', p.du).lte('work_date', p.au).order('work_date').limit(800);
    const fu = idsParNom(an, 'users', args.salarie), fw = idsParNom(an, 'worksites', args.chantier);
    const lignes = rows<{ user_id: string; work_date: string; worksite_id: string | null; absence_type: string | null; estimated_start: string | null; estimated_end: string | null }>(r)
      .filter((x) => (!fu || fu.has(x.user_id)) && (!fw || (x.worksite_id !== null && fw.has(x.worksite_id))))
      .map((x) => ({
        date: x.work_date, salarie: an.users.get(x.user_id) ?? 'Salarié',
        ...(x.absence_type ? { absence: x.absence_type === 'maladie' ? 'absent' : x.absence_type } : { chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : 'Sans chantier' }),
        ...(x.estimated_start ? { debut: x.estimated_start.slice(0, 5) } : {}), ...(x.estimated_end ? { fin: x.estimated_end.slice(0, 5) } : {}),
      }));
    const { gardees, tronque } = couper(lignes, MAX_LIGNES, 'Resserre la période ou précise le salarié / le chantier.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

const HEURES: OutilLecture = {
  name: 'lire_heures',
  description: 'LIT les heures travaillées (envoyées, hors brouillons) par salarié et par chantier sur une période de 56 jours au plus (par défaut : 7 derniers jours), avec le total. Pour « combien d\'heures a fait X », « heures sur le chantier Y ce mois ». Ne donne jamais de coût ni de taux. Ne modifie rien.',
  parameters: { type: 'object', properties: { du: P_DU, au: P_AU, salarie: P_SALARIE, chantier: P_CHANTIER } },
  async run(args, ctx, cache) {
    const p = periode(args, ctx.today, 56, 6, 0);
    if ('erreur' in p) return { donnees: { erreur: p.erreur } };
    const an = await annuaire(ctx, cache);
    const r = await ctx.db.from('time_entries').select('user_id, worksite_id, work_date, start_time, end_time, break_minutes, status')
      .eq('company_id', ctx.companyId).neq('status', 'cancelled').neq('status', 'draft').gte('work_date', p.du).lte('work_date', p.au).limit(3000);
    const fu = idsParNom(an, 'users', args.salarie), fw = idsParNom(an, 'worksites', args.chantier);
    const agr = new Map<string, { salarie: string; chantier: string; min: number; jours: Set<string> }>();
    let total = 0;
    for (const x of rows<{ user_id: string; worksite_id: string | null; work_date: string; start_time: string; end_time: string; break_minutes: number | null }>(r)) {
      if ((fu && !fu.has(x.user_id)) || (fw && !(x.worksite_id !== null && fw.has(x.worksite_id)))) continue;
      const m = minutes(x.start_time, x.end_time, x.break_minutes);
      const cle = `${x.user_id}|${x.worksite_id ?? ''}`;
      const a = agr.get(cle) ?? { salarie: an.users.get(x.user_id) ?? 'Salarié', chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : 'Sans chantier', min: 0, jours: new Set<string>() };
      a.min += m; a.jours.add(x.work_date); agr.set(cle, a); total += m;
    }
    const lignes = [...agr.values()].sort((a, b) => b.min - a.min).map((a) => ({ salarie: a.salarie, chantier: a.chantier, heures: heures(a.min), jours: a.jours.size }));
    const { gardees, tronque } = couper(lignes, MAX_LIGNES, 'Précise le salarié ou le chantier : le total ci-dessus reste exact.');
    return { donnees: { periode: `${p.du} → ${p.au}`, total_heures: heures(total), lignes: gardees }, tronque, non_fiable: NON_FIABLE };
  },
};

const POINTAGES: OutilLecture = {
  name: 'lire_pointages',
  description: 'LIT qui est en train de pointer maintenant (chrono ouvert) et qui n\'a PAS pointé hier alors qu\'il était prévu. Pour « qui est sur chantier », « qui a oublié de pointer ». Ne modifie rien.',
  parameters: { type: 'object', properties: {} },
  async run(_args, ctx, cache) {
    const an = await annuaire(ctx, cache);
    const hier = plusJours(ctx.today, -1);
    const [s, pl, te] = await Promise.all([
      ctx.db.from('active_sessions').select('user_id, worksite_id, started_at').eq('company_id', ctx.companyId).eq('work_date', ctx.today).limit(200),
      ctx.db.from('planning').select('user_id, worksite_id, absence_type').eq('company_id', ctx.companyId).eq('work_date', hier).limit(500),
      ctx.db.from('time_entries').select('user_id').eq('company_id', ctx.companyId).eq('work_date', hier).neq('status', 'cancelled').limit(2000),
    ]);
    const pointes = new Set(rows<{ user_id: string }>(te).map((x) => x.user_id));
    return {
      donnees: {
        en_cours: rows<{ user_id: string; worksite_id: string | null; started_at: string }>(s).map((x) => ({
          salarie: an.users.get(x.user_id) ?? 'Salarié', chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : 'Sans chantier', depuis: String(x.started_at).slice(11, 16),
        })),
        pas_pointe_hier: rows<{ user_id: string; worksite_id: string | null; absence_type: string | null }>(pl)
          .filter((x) => !x.absence_type && !pointes.has(x.user_id))
          .map((x) => ({ salarie: an.users.get(x.user_id) ?? 'Salarié', chantier_prevu: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : null })),
        hier,
      },
      non_fiable: NON_FIABLE,
    };
  },
};

const CHANTIER: OutilLecture = {
  name: 'lire_chantier',
  description: 'LIT un ou plusieurs chantiers actifs : ville, heures prévues (budget), heures déjà faites, pourcentage consommé. Pour « où en est le chantier X », « quels chantiers dépassent ». Ne donne aucun coût par salarié. Ne modifie rien.',
  parameters: { type: 'object', properties: { chantier: P_CHANTIER } },
  async run(args, ctx) {
    const [w, l] = await Promise.all([
      ctx.db.from('worksites').select('id, client_name, city, budget_hours').eq('company_id', ctx.companyId).eq('is_active', true).limit(300),
      ctx.db.rpc('my_worksite_labour', { p_from: null, p_to: null }),
    ]);
    const minParChantier = new Map<string, number>();
    // Seul `paid_minutes` est lu : le coût par salarié de cette fonction n'est jamais recopié.
    for (const x of rows<{ worksite_id: string; paid_minutes: number | null }>(l as { data: unknown; error: unknown })) minParChantier.set(x.worksite_id, (minParChantier.get(x.worksite_id) ?? 0) + (Number(x.paid_minutes) || 0));
    const q = typeof args.chantier === 'string' ? args.chantier.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() : '';
    const liste = rows<{ id: string; client_name: string | null; city: string | null; budget_hours: number | null }>(w)
      .filter((x) => !q || `${x.client_name ?? ''} ${x.city ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .map((x) => {
        const fait = heures(minParChantier.get(x.id) ?? 0);
        const budget = x.budget_hours ? Number(x.budget_hours) : null;
        return { chantier: texte(x.client_name || 'Chantier', 60), ville: x.city ? texte(x.city, 40) : null, heures_prevues: budget, heures_faites: fait, ...(budget ? { pourcent: Math.round((fait / budget) * 100) } : {}) };
      })
      .sort((a, b) => ((b as { pourcent?: number }).pourcent ?? -1) - ((a as { pourcent?: number }).pourcent ?? -1));
    const { gardees, tronque } = couper(liste, 25, 'Précise le nom du chantier.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

const CONGES: OutilLecture = {
  name: 'lire_conges',
  description: 'LIT les demandes de congé et d\'absence : en attente, acceptées ou refusées, avec leurs dates (jamais le motif). Pour « qui a demandé un congé », « y a-t-il des demandes en attente ». Ne modifie rien.',
  parameters: { type: 'object', properties: { statut: { type: 'string', enum: ['en_attente', 'acceptee', 'refusee'], description: 'Facultatif : par défaut les demandes en attente.' }, salarie: P_SALARIE } },
  async run(args, ctx, cache) {
    const an = await annuaire(ctx, cache);
    const st = args.statut === 'acceptee' ? 'approved' : args.statut === 'refusee' ? 'rejected' : 'pending';
    const r = await ctx.db.from('leave_requests').select('user_id, type, start_date, end_date, status').eq('company_id', ctx.companyId).eq('status', st).order('start_date', { ascending: false }).limit(60);
    const fu = idsParNom(an, 'users', args.salarie);
    const lignes = rows<{ user_id: string; type: string; start_date: string; end_date: string; status: string }>(r).filter((x) => !fu || fu.has(x.user_id))
      .map((x) => ({ salarie: an.users.get(x.user_id) ?? 'Salarié', type: x.type === 'maladie' ? 'absence' : x.type, du: x.start_date, au: x.end_date, statut: x.status === 'approved' ? 'acceptée' : x.status === 'rejected' ? 'refusée' : 'en attente' }));
    const { gardees, tronque } = couper(lignes, MAX_LIGNES, 'Précise le salarié.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

const RESERVES: OutilLecture = {
  name: 'lire_reserves',
  description: 'LIT les réserves ouvertes (réception avec réserve, pas encore levée) : date, salarié, chantier, observation. Pour « quelles réserves sont à lever ». Ne modifie rien.',
  parameters: { type: 'object', properties: { chantier: P_CHANTIER } },
  async run(args, ctx, cache) {
    const an = await annuaire(ctx, cache);
    const r = await ctx.db.from('time_entries').select('user_id, work_date, worksite_id, observation').eq('company_id', ctx.companyId).eq('reception', 'avec')
      .is('reserve_resolved_at', null).is('reserve_fixed_at', null).neq('status', 'cancelled').order('work_date', { ascending: false }).limit(50);
    const fw = idsParNom(an, 'worksites', args.chantier);
    const lignes = rows<{ user_id: string; work_date: string; worksite_id: string | null; observation: string | null }>(r).filter((x) => !fw || (x.worksite_id !== null && fw.has(x.worksite_id)))
      .map((x) => ({ date: x.work_date, salarie: an.users.get(x.user_id) ?? 'Salarié', chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : 'Sans chantier', observation: observation(x.observation) }));
    const { gardees, tronque } = couper(lignes, 30, 'Précise le chantier.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

const DOCUMENTS: OutilLecture = {
  name: 'lire_documents',
  description: 'LIT les documents rangés (nom, catégorie, chantier, date), les plus récents d\'abord. Pour « quels documents sur le chantier X », « a-t-on le devis de Y ». Ne lit pas le contenu des fichiers. Ne modifie rien.',
  parameters: { type: 'object', properties: { chantier: P_CHANTIER } },
  async run(args, ctx, cache) {
    const an = await annuaire(ctx, cache);
    const r = await ctx.db.from('documents').select('worksite_id, label, file_name, category, created_at').eq('company_id', ctx.companyId).order('created_at', { ascending: false }).limit(150);
    const fw = idsParNom(an, 'worksites', args.chantier);
    const lignes = rows<{ worksite_id: string | null; label: string | null; file_name: string | null; category: string | null; created_at: string }>(r)
      .filter((x) => !fw || (x.worksite_id !== null && fw.has(x.worksite_id)))
      .map((x) => ({ nom: texte(x.label || x.file_name || 'Document', 60), categorie: x.category ? texte(x.category, 30) : null, chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : null, date: String(x.created_at).slice(0, 10) }));
    const { gardees, tronque } = couper(lignes, 30, 'Précise le chantier.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

const DEPENSES: OutilLecture = {
  name: 'lire_depenses',
  description: 'LIT les dépenses de chantier (achats, matériaux : libellé, montant, catégorie, date) sur une période de 56 jours au plus (par défaut 30 jours), avec le total. Ce ne sont PAS des salaires. Ne modifie rien.',
  parameters: { type: 'object', properties: { du: P_DU, au: P_AU, chantier: P_CHANTIER } },
  async run(args, ctx, cache) {
    const p = periode(args, ctx.today, 56, 29, 0);
    if ('erreur' in p) return { donnees: { erreur: p.erreur } };
    const an = await annuaire(ctx, cache);
    const r = await ctx.db.from('worksite_expenses').select('worksite_id, label, amount, category, spent_on').eq('company_id', ctx.companyId)
      .gte('spent_on', p.du).lte('spent_on', p.au).order('spent_on', { ascending: false }).limit(150);
    const fw = idsParNom(an, 'worksites', args.chantier);
    let total = 0;
    const lignes = rows<{ worksite_id: string | null; label: string | null; amount: number | null; category: string | null; spent_on: string }>(r)
      .filter((x) => !fw || (x.worksite_id !== null && fw.has(x.worksite_id)))
      .map((x) => { const m = Math.round((Number(x.amount) || 0) * 100) / 100; total += m; return { date: x.spent_on, chantier: x.worksite_id ? an.worksites.get(x.worksite_id) ?? 'Chantier' : null, libelle: texte(x.label, 60), montant: m, categorie: x.category ? texte(x.category, 30) : null }; });
    const { gardees, tronque } = couper(lignes, 40, 'Précise le chantier : le total reste exact.');
    return { donnees: { periode: `${p.du} → ${p.au}`, total_euros: Math.round(total * 100) / 100, lignes: gardees }, tronque, non_fiable: NON_FIABLE };
  },
};

export const LECTURES_BUREAU: readonly OutilLecture[] = [PLANNING, HEURES, POINTAGES, CHANTIER, CONGES, RESERVES, DOCUMENTS, DEPENSES];
