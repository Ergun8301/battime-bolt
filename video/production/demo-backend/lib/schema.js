'use strict';
// Table definitions of the fake database: column types (for filter coercion
// and unknown-column detection), primary keys, foreign keys (for PostgREST
// embeds) and defaults. Mirrors the columns the BEMEXO app actually reads and
// writes (verified against components/, app/, lib/ and supabase/migrations).

const COMMON_TS = 'timestamptz';

const TABLES = {
  companies: {
    pk: ['id'],
    cols: {
      id: 'uuid', name: 'text', siret: 'text', tva_intra: 'text', address: 'text', postal_code: 'text',
      city: 'text', phone: 'text', email: 'text', logo_url: 'text', created_at: COMMON_TS, is_active: 'bool',
      trial_ends_at: COMMON_TS, subscription_status: 'text', stripe_customer_id: 'text',
      stripe_subscription_id: 'text', plan_code: 'text', current_period_end: COMMON_TS,
      auto_reminder_enabled: 'bool', reminder_hour: 'int', budget_alerts_enabled: 'bool',
      weekly_digest_enabled: 'bool', travel_paid: 'bool', weekly_hours: 'numeric', accountant_email: 'text',
      overtime_rate_1: 'numeric', overtime_rate_2: 'numeric', position_tracking_enabled: 'bool',
    },
    fks: {},
  },
  users: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', first_name: 'text', last_name: 'text', role: 'text', phone: 'text',
      email: 'text', is_active: 'bool', created_at: COMMON_TS, invited_at: COMMON_TS, last_seen_at: COMMON_TS,
      photo_url: 'text',
    },
    fks: { company_id: 'companies' },
  },
  user_payroll: {
    pk: ['user_id'],
    cols: {
      user_id: 'uuid', company_id: 'uuid', social_security_number: 'text', hire_date: 'date',
      contract_type: 'text', hourly_rate: 'numeric', weekly_hours: 'numeric', payroll_id: 'text', updated_at: COMMON_TS,
    },
    fks: { user_id: 'users', company_id: 'companies' },
  },
  worksites: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', client_name: 'text', client_phone: 'text', client_email: 'text',
      address: 'text', city: 'text', postal_code: 'text', description: 'text', product_type: 'text',
      is_active: 'bool', created_at: COMMON_TS, completed_at: COMMON_TS, budget_hours: 'numeric',
      budget_amount: 'numeric', budget_alert_level: 'int',
    },
    fks: { company_id: 'companies' },
  },
  planning: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', user_id: 'uuid', worksite_id: 'uuid', work_date: 'date',
      estimated_start: 'time', estimated_end: 'time', notes: 'text', absence_type: 'text', position: 'int',
      added_by_worker: 'bool', created_at: COMMON_TS, created_by: 'uuid',
    },
    fks: { company_id: 'companies', user_id: 'users', worksite_id: 'worksites', created_by: 'users' },
  },
  time_entries: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', user_id: 'uuid', worksite_id: 'uuid', planning_id: 'uuid',
      work_date: 'date', start_time: 'time', end_time: 'time', break_minutes: 'int', total_minutes: 'int',
      meal_allowance: 'bool', observation: 'text', photos: 'json', reception: 'text', gap_before: 'text',
      status: 'text', created_at: COMMON_TS, submitted_at: COMMON_TS, validated_at: COMMON_TS,
      validated_by: 'uuid', locked: 'bool', exported_at: COMMON_TS, modified_by: 'uuid', modified_at: COMMON_TS,
      client_id: 'text',
      reserve_resolved_at: COMMON_TS, reserve_resolved_by: 'uuid', reserve_resolution: 'text',
      reserve_fixed_at: COMMON_TS, reserve_fixed_by: 'uuid', reserve_fix_note: 'text',
    },
    generated: ['total_minutes'],
    fks: {
      company_id: 'companies', user_id: 'users', worksite_id: 'worksites', planning_id: 'planning',
      validated_by: 'users', modified_by: 'users', reserve_resolved_by: 'users', reserve_fixed_by: 'users',
    },
  },
  active_sessions: {
    pk: ['user_id'],
    cols: {
      user_id: 'uuid', company_id: 'uuid', worksite_id: 'uuid', planning_id: 'uuid', work_date: 'date',
      started_at: COMMON_TS, created_at: COMMON_TS, start_lat: 'numeric', start_lng: 'numeric',
      start_accuracy_m: 'int', start_located_at: COMMON_TS,
    },
    fks: { user_id: 'users', company_id: 'companies', worksite_id: 'worksites', planning_id: 'planning' },
  },
  time_entry_positions: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', entry_id: 'uuid', user_id: 'uuid', work_date: 'date', moment: 'text',
      latitude: 'numeric', longitude: 'numeric', accuracy_m: 'int', captured_at: COMMON_TS, created_at: COMMON_TS,
    },
    fks: { company_id: 'companies', entry_id: 'time_entries', user_id: 'users' },
  },
  time_entry_corrections: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', entry_id: 'uuid', worker_id: 'uuid', work_date: 'date',
      corrected_by: 'uuid', corrected_by_role: 'text', corrected_at: COMMON_TS, old_start: 'time',
      old_end: 'time', new_start: 'time', new_end: 'time', was_exported: 'bool', notified_at: COMMON_TS,
      notify_error: 'text',
    },
    fks: { company_id: 'companies', entry_id: 'time_entries', worker_id: 'users', corrected_by: 'users' },
  },
  documents: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', worksite_id: 'uuid', uploaded_by: 'uuid', label: 'text', file_path: 'text',
      file_name: 'text', mime_type: 'text', size_bytes: 'int', created_at: COMMON_TS, work_date: 'date',
      time_entry_id: 'uuid', photo_no: 'int',
    },
    fks: { company_id: 'companies', worksite_id: 'worksites', uploaded_by: 'users', time_entry_id: 'time_entries' },
  },
  certifications: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', user_id: 'uuid', type: 'text', label: 'text', expiry_date: 'date',
      alert_30_sent_at: COMMON_TS, alert_7_sent_at: COMMON_TS, created_at: COMMON_TS, created_by: 'uuid',
    },
    fks: { company_id: 'companies', user_id: 'users', created_by: 'users' },
  },
  leave_requests: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', user_id: 'uuid', type: 'text', start_date: 'date', end_date: 'date',
      note: 'text', status: 'text', decided_at: COMMON_TS, decided_by: 'uuid', decision_note: 'text',
      created_at: COMMON_TS,
    },
    fks: { company_id: 'companies', user_id: 'users', decided_by: 'users' },
  },
  worksite_expenses: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', worksite_id: 'uuid', spent_on: 'date', category: 'text', label: 'text',
      supplier: 'text', amount: 'numeric', created_by: 'uuid', created_at: COMMON_TS,
    },
    fks: { company_id: 'companies', worksite_id: 'worksites', created_by: 'users' },
  },
  month_closures: {
    pk: ['company_id', 'month'],
    cols: { company_id: 'uuid', month: 'date', closed_at: COMMON_TS, closed_by: 'uuid' },
    fks: { company_id: 'companies', closed_by: 'users' },
  },
  invitations: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', email: 'text', phone: 'text', first_name: 'text', last_name: 'text',
      role: 'text', token: 'text', created_at: COMMON_TS, expires_at: COMMON_TS, accepted_at: COMMON_TS,
      created_by: 'uuid',
    },
    fks: { company_id: 'companies', created_by: 'users' },
  },
  push_subscriptions: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', user_id: 'uuid', endpoint: 'text', p256dh: 'text', auth: 'text',
      user_agent: 'text', created_at: COMMON_TS,
    },
    fks: { company_id: 'companies', user_id: 'users' },
  },
  subscription_plans: {
    pk: ['id'],
    cols: {
      id: 'uuid', code: 'text', label: 'text', stripe_price_id: 'text', amount_eur: 'int', min_workers: 'int',
      max_workers: 'int', sort: 'int', active: 'bool', created_at: COMMON_TS,
    },
    fks: {},
  },
  payroll_sends: {
    pk: ['id'],
    cols: {
      id: 'uuid', company_id: 'uuid', idempotency_key: 'text', period_label: 'text', file_name: 'text',
      sent_at: COMMON_TS, sent_by: 'uuid',
    },
    fks: { company_id: 'companies', sent_by: 'users' },
  },
};

// Column defaults applied on INSERT when the column is absent from the body.
// `ctx.now` is the demo clock ISO string, `ctx.uuid()` a fresh id.
const DEFAULTS = {
  '*': { id: (c) => c.uuid(), created_at: (c) => c.now },
  companies: { is_active: true, subscription_status: 'trialing', travel_paid: false, position_tracking_enabled: false },
  users: { is_active: true, role: 'worker' },
  user_payroll: { updated_at: (c) => c.now },
  worksites: { is_active: true },
  planning: { added_by_worker: false },
  time_entries: { status: 'draft', locked: false, break_minutes: 0, meal_allowance: false },
  active_sessions: { started_at: (c) => c.now },
  time_entry_positions: {},
  time_entry_corrections: { corrected_at: (c) => c.now, was_exported: false },
  documents: {},
  certifications: {},
  leave_requests: { status: 'pending' },
  worksite_expenses: { spent_on: (c) => c.today },
  month_closures: { closed_at: (c) => c.now },
  invitations: {},
  push_subscriptions: {},
  subscription_plans: { active: true, sort: 0 },
  payroll_sends: { sent_at: (c) => c.now },
};

function fkConstraintName(table, col) { return `${table}_${col}_fkey`; }

/**
 * Resolves an embed `alias:target!hint(...)` from `base`.
 * Returns { kind: 'm2o'|'o2m', target, col } or throws a string (ambiguity / unknown).
 */
function resolveEmbed(base, name, hint) {
  const b = TABLES[base];
  if (!b) throw `unknown table ${base}`;
  // Embedding by FK column name: worksite_id(*)
  if (!TABLES[name] && b.fks[name]) return { kind: 'm2o', target: b.fks[name], col: name };
  const target = name;
  const t = TABLES[target];
  if (!t) throw `unknown embedded table ${name}`;
  const cands = [];
  for (const [col, tgt] of Object.entries(b.fks)) {
    if (tgt === target) cands.push({ kind: 'm2o', target, col, cname: fkConstraintName(base, col) });
  }
  for (const [col, tgt] of Object.entries(t.fks)) {
    if (tgt === base) cands.push({ kind: 'o2m', target, col, cname: fkConstraintName(target, col) });
  }
  let pick = cands;
  if (hint) pick = cands.filter((c) => c.col === hint || c.cname === hint);
  if (pick.length === 1) return pick[0];
  if (pick.length === 0) throw `no relationship ${base} -> ${name}${hint ? '!' + hint : ''}`;
  throw `ambiguous relationship ${base} -> ${name} (${pick.map((c) => c.cname).join(', ')}) — add a hint`;
}

module.exports = { TABLES, DEFAULTS, resolveEmbed, fkConstraintName };
