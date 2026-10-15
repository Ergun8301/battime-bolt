// Étape 3 · 3c — les 3 lectures du SALARIÉ. Règle d'or : TOUTE requête sur time_entries, planning et active_sessions passe par `siennes()`, qui ajoute
// `.eq('user_id', ctx.userId)` PAR CONSTRUCTION. La RLS laisse en effet le chef d'équipe (`lead`) lire son équipe du jour : sans ce filtre, « mes heures »
// rendrait celles de ses collègues. Aucun texte libre n'est rendu (ni note, ni observation) : que des heures, des dates et des noms de chantier.
import { couper, estDate, heures, minutes, NON_FIABLE, periode, rows, texte, type ContexteLecture, type ResultatLecture } from './lecteur.ts';
import type { CacheLecture, OutilLecture } from './bureau.ts';

/** Requête sur une table PERSONNELLE : toujours bornée à la personne connectée. */
// deno-lint-ignore no-explicit-any
const siennes = (ctx: ContexteLecture, table: 'time_entries' | 'planning' | 'active_sessions', colonnes: string): any => ctx.db.from(table).select(colonnes).eq('user_id', ctx.userId);

async function chantiers(ctx: ContexteLecture, cache: CacheLecture): Promise<Map<string, string>> {
  if (cache.annuaire) return cache.annuaire.worksites;
  const r = await ctx.db.from('worksites').select('id, client_name').eq('company_id', ctx.companyId).limit(300);
  const worksites = new Map<string, string>();
  for (const x of rows<{ id: string; client_name: string | null }>(r)) worksites.set(x.id, texte(x.client_name || 'Chantier', 60) || 'Chantier');
  cache.annuaire = { users: new Map(), worksites, cherche: new Map() };
  return worksites;
}
const nomChantier = (m: Map<string, string>, id: string | null) => (id ? m.get(id) ?? 'Chantier' : 'Sans chantier');

const JOURNEE: OutilLecture = {
  name: 'lire_ma_journee',
  description: 'LIT MA journée : mes lignes d\'heures du jour (début, fin, pause, envoyée ou brouillon), ce qui est prévu au planning et mon pointage en cours. Pour « qu\'ai-je pointé aujourd\'hui », « où suis-je prévu ». Par défaut aujourd\'hui. Ne modifie rien.',
  parameters: { type: 'object', properties: { date: { type: 'string', description: 'Jour, aaaa-mm-jj (facultatif).' } } },
  async run(args, ctx, cache): Promise<ResultatLecture> {
    const date = args.date === undefined || args.date === '' ? ctx.today : args.date;
    if (!estDate(date)) return { donnees: { erreur: 'Date invalide : écris-la aaaa-mm-jj.' } };
    const ch = await chantiers(ctx, cache);
    const [te, pl, se] = await Promise.all([
      siennes(ctx, 'time_entries', 'worksite_id, start_time, end_time, break_minutes, status').eq('work_date', date).neq('status', 'cancelled').order('start_time'),
      siennes(ctx, 'planning', 'worksite_id, absence_type, estimated_start, estimated_end').eq('work_date', date),
      date === ctx.today ? siennes(ctx, 'active_sessions', 'worksite_id, started_at').limit(1) : Promise.resolve({ data: [], error: null }),
    ]);
    const lignes = rows<{ worksite_id: string | null; start_time: string; end_time: string; break_minutes: number | null; status: string }>(te).map((x) => ({
      chantier: nomChantier(ch, x.worksite_id), debut: x.start_time.slice(0, 5), fin: x.end_time.slice(0, 5), pause_minutes: Number(x.break_minutes) || 0, heures: heures(minutes(x.start_time, x.end_time, x.break_minutes)), envoyee: x.status !== 'draft',
    }));
    return {
      donnees: {
        date, lignes, total_heures: heures(lignes.reduce((s, l) => s + Math.round(l.heures * 60), 0)),
        prevu: rows<{ worksite_id: string | null; absence_type: string | null; estimated_start: string | null; estimated_end: string | null }>(pl).map((x) => ({
          ...(x.absence_type ? { absence: x.absence_type === 'maladie' ? 'absent' : x.absence_type } : { chantier: nomChantier(ch, x.worksite_id) }),
          ...(x.estimated_start ? { debut: x.estimated_start.slice(0, 5) } : {}), ...(x.estimated_end ? { fin: x.estimated_end.slice(0, 5) } : {}),
        })),
        pointage_en_cours: rows<{ worksite_id: string | null; started_at: string }>(se).map((x) => ({ chantier: nomChantier(ch, x.worksite_id), depuis: String(x.started_at).slice(11, 16) })),
      },
      non_fiable: NON_FIABLE,
    };
  },
};

const MES_HEURES: OutilLecture = {
  name: 'lire_mes_heures',
  description: 'LIT MES heures envoyées sur une période de 56 jours au plus (par défaut : 7 derniers jours), par chantier et par jour, avec le total. Pour « combien d\'heures cette semaine / ce mois ». Ne modifie rien.',
  parameters: { type: 'object', properties: { du: { type: 'string', description: 'Début, aaaa-mm-jj.' }, au: { type: 'string', description: 'Fin, aaaa-mm-jj.' } } },
  async run(args, ctx, cache): Promise<ResultatLecture> {
    const p = periode(args, ctx.today, 56, 6, 0);
    if ('erreur' in p) return { donnees: { erreur: p.erreur } };
    const ch = await chantiers(ctx, cache);
    const r = await siennes(ctx, 'time_entries', 'worksite_id, work_date, start_time, end_time, break_minutes, status').neq('status', 'cancelled').neq('status', 'draft').gte('work_date', p.du).lte('work_date', p.au).order('work_date').limit(800);
    const parJour = new Map<string, number>(), parChantier = new Map<string, number>();
    let total = 0;
    for (const x of rows<{ worksite_id: string | null; work_date: string; start_time: string; end_time: string; break_minutes: number | null }>(r)) {
      const m = minutes(x.start_time, x.end_time, x.break_minutes);
      total += m; parJour.set(x.work_date, (parJour.get(x.work_date) ?? 0) + m);
      const n = nomChantier(ch, x.worksite_id); parChantier.set(n, (parChantier.get(n) ?? 0) + m);
    }
    const jours = [...parJour].map(([date, m]) => ({ date, heures: heures(m) }));
    const { gardees, tronque } = couper(jours, 60, 'Resserre la période : le total reste exact.');
    return { donnees: { periode: `${p.du} → ${p.au}`, total_heures: heures(total), par_chantier: [...parChantier].map(([chantier, m]) => ({ chantier, heures: heures(m) })), par_jour: gardees }, tronque, non_fiable: NON_FIABLE };
  },
};

const MON_PLANNING: OutilLecture = {
  name: 'lire_mon_planning',
  description: 'LIT MON planning (où je suis prévu, mes absences) sur 28 jours au plus (par défaut : 7 prochains jours). Pour « où je travaille demain », « suis-je prévu lundi ». Ne modifie rien.',
  parameters: { type: 'object', properties: { du: { type: 'string', description: 'Début, aaaa-mm-jj.' }, au: { type: 'string', description: 'Fin, aaaa-mm-jj.' } } },
  async run(args, ctx, cache): Promise<ResultatLecture> {
    const p = periode(args, ctx.today, 28, 0, 6);
    if ('erreur' in p) return { donnees: { erreur: p.erreur } };
    const ch = await chantiers(ctx, cache);
    const r = await siennes(ctx, 'planning', 'work_date, worksite_id, absence_type, estimated_start, estimated_end').gte('work_date', p.du).lte('work_date', p.au).order('work_date').limit(100);
    const lignes = rows<{ work_date: string; worksite_id: string | null; absence_type: string | null; estimated_start: string | null; estimated_end: string | null }>(r).map((x) => ({
      date: x.work_date, ...(x.absence_type ? { absence: x.absence_type === 'maladie' ? 'absent' : x.absence_type } : { chantier: nomChantier(ch, x.worksite_id) }),
      ...(x.estimated_start ? { debut: x.estimated_start.slice(0, 5) } : {}), ...(x.estimated_end ? { fin: x.estimated_end.slice(0, 5) } : {}),
    }));
    const { gardees, tronque } = couper(lignes, 40, 'Resserre la période.');
    return { donnees: gardees, tronque, non_fiable: NON_FIABLE };
  },
};

export const LECTURES_SALARIE: readonly OutilLecture[] = [JOURNEE, MES_HEURES, MON_PLANNING];
