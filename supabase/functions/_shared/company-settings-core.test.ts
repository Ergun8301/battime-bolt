// `deno test --allow-env supabase/functions/_shared/company-settings-core.test.ts` (npm run test:reglages-entreprise)
// Lot 29 — une seule lecture des réglages de l'entreprise, avec repli si une colonne manque.
import { COLUMNS, emptyValue, GROUPS, readCompanySettings, type CompanySettingsValue, type MiniClient } from './company-settings-core.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const ROW = {
  name: 'Entreprise Test', logo_url: 'https://x/logo.png', travel_paid: true, weekly_hours: 39, accountant_email: '  compta@exemple.fr ',
  overtime_rate_1: 25, overtime_rate_2: 50, trial_ends_at: '2026-12-01T00:00:00Z', subscription_status: 'trialing',
  ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: true, meal_enabled: false,
};

/** Base simulée : renvoie les colonnes demandées ; 42703 si l'une manque ; `reseau` = tout échoue. */
function base(opts: { missing?: string[]; reseau?: boolean | (() => boolean); row?: Record<string, unknown> | null } = {}) {
  const log: string[] = [];
  const client: MiniClient = {
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            log.push(cols);
            const reseau = typeof opts.reseau === 'function' ? opts.reseau() : opts.reseau;
            if (reseau) return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } };
            const wanted = cols.split(',').map((s) => s.trim());
            const manque = wanted.find((c) => (opts.missing || []).includes(c));
            if (manque) return { data: null, error: { code: '42703', message: `column companies.${manque} does not exist` } };
            const src = opts.row === undefined ? ROW : opts.row;
            if (!src) return { data: null, error: null };
            return { data: Object.fromEntries(wanted.filter((c) => c in src).map((c) => [c, (src as Record<string, unknown>)[c]])), error: null };
          },
        }),
      }),
    }),
  };
  return { client, log };
}

Deno.test('colonnes : 13 pour le bureau, 5 pour le salarié (rien de sensible côté salarié)', () => {
  eq(COLUMNS.office.split(', ').length, 13, '13 colonnes bureau');
  eq(COLUMNS.worker, 'travel_paid, ai_enabled, kiosk_enabled, position_tracking_enabled, meal_enabled', '5 colonnes salarié');
  eq(COLUMNS.worker.includes('accountant_email') || COLUMNS.worker.includes('overtime') || COLUMNS.worker.includes('subscription'), false, 'pas de donnée de gestion côté salarié');
  eq(COLUMNS.office.startsWith('name, logo_url, travel_paid, weekly_hours, accountant_email, overtime_rate_1, overtime_rate_2'), true, 'ordre bureau');
  eq(GROUPS.office.length, 6, '6 groupes de repli bureau');
  eq(GROUPS.worker.length, 5, '5 groupes de repli salarié');
});

Deno.test('défauts : ceux des anciens écrans', () => {
  eq(emptyValue(), {
    name: '', logoUrl: '', travelPaid: false, weeklyHours: null, accountantEmail: '', overtimeRate1: null, overtimeRate2: null,
    trialEndsAt: null, subscriptionStatus: null, aiEnabled: false, kioskEnabled: false, positionTrackingEnabled: false, mealEnabled: null,
  }, 'défauts');
});

Deno.test('bureau : UNE requête, 13 colonnes, valeurs converties', async () => {
  const { client, log } = base();
  const r = await readCompanySettings(client, 'c1', 'office', null, { grouped: true });
  eq(log.length, 1, 'une seule requête');
  eq(log[0], COLUMNS.office, 'les 13 colonnes');
  eq(r.grouped, true, 'régime groupé conservé');
  eq(r.value, {
    name: 'Entreprise Test', logoUrl: 'https://x/logo.png', travelPaid: true, weeklyHours: 39, accountantEmail: 'compta@exemple.fr',
    overtimeRate1: 25, overtimeRate2: 50, trialEndsAt: '2026-12-01T00:00:00Z', subscriptionStatus: 'trialing',
    aiEnabled: true, kioskEnabled: true, positionTrackingEnabled: true, mealEnabled: false,
  }, 'valeur du bureau');
});

Deno.test('salarié : UNE requête, 5 colonnes seulement', async () => {
  const { client, log } = base();
  const r = await readCompanySettings(client, 'c1', 'worker', null, { grouped: true });
  eq(log, [COLUMNS.worker], 'une requête, 5 colonnes');
  eq(r.value?.travelPaid, true, 'trajet');
  eq(r.value?.mealEnabled, false, 'panier = non (booléen strict)');
  eq(r.value?.name, '', 'le nom n\'est pas lu côté salarié : défaut');
  eq(r.value?.accountantEmail, '', 'e-mail du comptable : jamais lu');
});

Deno.test('panier : strict — absent de la ligne (base simulée) ou non booléen = null', async () => {
  const { client } = base({ row: { ...ROW, meal_enabled: undefined } });
  eq((await readCompanySettings(client, 'c1', 'worker', null, { grouped: true })).value?.mealEnabled, null, 'clé absente');
  const b2 = base({ row: { ...ROW, meal_enabled: 'true' } });
  eq((await readCompanySettings(b2.client, 'c1', 'worker', null, { grouped: true })).value?.mealEnabled, null, 'texte refusé');
  const b3 = base({ row: { ...ROW, meal_enabled: true } });
  eq((await readCompanySettings(b3.client, 'c1', 'worker', null, { grouped: true })).value?.mealEnabled, true, 'oui');
});

Deno.test('ligne introuvable : les défauts, sans erreur', async () => {
  const { client } = base({ row: null });
  const r = await readCompanySettings(client, 'c1', 'office', null, { grouped: true });
  eq(r.value, emptyValue(), 'défauts');
});

Deno.test('colonne absente (42703) : repli en parallèle, bureau = 1 + 6 requêtes, collant', async () => {
  const { client, log } = base({ missing: ['position_tracking_enabled'] });
  const r = await readCompanySettings(client, 'c1', 'office', null, { grouped: true });
  eq(log.length, 7, '1 lecture groupée échouée + 6 groupes');
  eq(log[0], COLUMNS.office, 'la groupée d\'abord');
  eq(log.slice(1).sort(), GROUPS.office.map((g) => g.join(', ')).sort(), 'les 6 groupes isolés');
  eq(r.grouped, false, 'repli collant');
  eq(r.value?.name, 'Entreprise Test', 'le nom reste lu');
  eq(r.value?.aiEnabled, true, 'l\'assistant reste lu');
  eq(r.value?.positionTrackingEnabled, false, 'seule la colonne absente garde son défaut');
  eq(r.mealMissing, false, 'le panier existe');
  // la relecture suivante ne retente PAS la lecture groupée
  log.length = 0;
  const r2 = await readCompanySettings(client, 'c1', 'office', r.value, { grouped: r.grouped });
  eq(log.length, 6, '6 requêtes, pas de lecture groupée');
  eq(r2.grouped, false, 'toujours en repli');
});

Deno.test('colonne absente : salarié = 1 + 5 requêtes ; panier absent signalé', async () => {
  const { client, log } = base({ missing: ['meal_enabled'] });
  const r = await readCompanySettings(client, 'c1', 'worker', null, { grouped: true });
  eq(log.length, 6, '1 groupée + 5 groupes');
  eq(r.value?.travelPaid, true, 'trajet lu');
  eq(r.value?.mealEnabled, null, 'panier : colonne absente');
  eq(r.mealMissing, true, 'absence du panier signalée (le téléphone oublie sa valeur gardée)');
});

Deno.test('repli : un groupe en échec garde la valeur précédente de SES champs seulement', async () => {
  let n = 0;
  // 1re lecture : tout va bien. 2e lecture (repli forcé) : le groupe « ai_enabled » tombe en panne réseau.
  const prev = (await readCompanySettings(base().client, 'c1', 'office', null, { grouped: true })).value as CompanySettingsValue;
  const cassee: MiniClient = {
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            n++;
            if (cols === 'ai_enabled') return { data: null, error: { code: '', message: 'Failed to fetch' } };
            if (cols === 'name, logo_url, travel_paid, weekly_hours, accountant_email, overtime_rate_1, overtime_rate_2') return { data: { name: 'Nouveau nom', logo_url: '', travel_paid: false, weekly_hours: null, accountant_email: null, overtime_rate_1: null, overtime_rate_2: null }, error: null };
            return { data: {}, error: null };
          },
        }),
      }),
    }),
  };
  const r = await readCompanySettings(cassee, 'c1', 'office', prev, { grouped: false });
  eq(n, 6, '6 groupes');
  eq(r.value?.name, 'Nouveau nom', 'le groupe lu est mis à jour');
  eq(r.value?.aiEnabled, true, 'le groupe en échec garde sa valeur d\'avant');
});

Deno.test('erreur réseau : value null, rien n\'est réinitialisé, régime inchangé', async () => {
  const b = base({ reseau: true });
  const r = await readCompanySettings(b.client, 'c1', 'office', null, { grouped: true });
  eq(r.value, null, 'rien de lisible');
  eq(r.grouped, true, 'on ne passe pas en repli sur une panne réseau');
  eq(b.log.length, 1, 'une seule requête');
  // même chose en repli : tout échoue => null
  const b2 = base({ reseau: true });
  eq((await readCompanySettings(b2.client, 'c1', 'worker', null, { grouped: false })).value, null, 'repli : tout en panne => null');
});

Deno.test('l\'assistant (ai) n\'est pas écrasé par une erreur après une première lecture réussie', async () => {
  let panne = false;
  const b = base({ reseau: () => panne });
  const r1 = await readCompanySettings(b.client, 'c1', 'worker', null, { grouped: true });
  eq(r1.value?.aiEnabled, true, 'lu');
  panne = true;
  const r2 = await readCompanySettings(b.client, 'c1', 'worker', r1.value, { grouped: true });
  eq(r2.value, null, 'l\'appelant garde r1.value');
});

Deno.test('une lecture qui lève une exception est traitée comme une erreur', async () => {
  const lance: MiniClient = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => { throw new Error('boom'); } }) }) }) };
  const r = await readCompanySettings(lance, 'c1', 'worker', null, { grouped: true });
  eq(r.value, null, 'null');
});
