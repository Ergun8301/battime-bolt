'use strict';
// Europe/Paris helpers + the DEMO CLOCK.
// Every server-side timestamp in the fake Supabase comes from `clock.now()`,
// never from the real wall clock.

const TZ = 'Europe/Paris';
const dtf = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parisParts(ms) {
  const o = {};
  for (const p of dtf.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour, M: +o.minute, S: +o.second };
}

/** Offset of Paris vs UTC at instant `ms`, in minutes (e.g. +120 in summer). */
function parisOffsetMin(ms) {
  const p = parisParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' (Paris wall time) -> epoch ms. */
function parisToMs(date, time = '00:00:00') {
  const [y, m, d] = date.split('-').map(Number);
  const [H, M, S] = String(time).split(':').map((x) => Number(x || 0));
  const guess = Date.UTC(y, m - 1, d, H, M, S || 0);
  let ms = guess - parisOffsetMin(guess) * 60000;
  ms = guess - parisOffsetMin(ms) * 60000; // second pass settles DST edges
  return ms;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** PostgREST-like timestamptz text: 2026-09-24T05:30:00+00:00 (ms kept when present). */
function iso(ms) {
  const d = new Date(ms);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const frac = d.getUTCMilliseconds() ? `.${pad(d.getUTCMilliseconds(), 3)}` : '';
  return `${base}${frac}+00:00`;
}

function parisIso(date, time) { return iso(parisToMs(date, time)); }
function parisDate(ms) { const p = parisParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
function parisTime(ms) { const p = parisParts(ms); return `${pad(p.H)}:${pad(p.M)}:${pad(p.S)}`; }

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** 0 = Monday … 6 = Sunday */
function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
function mondayOf(date) { return addDays(date, -weekday(date)); }
function dateRange(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

/** Normalises 'H:MM', 'HH:MM' or 'HH:MM:SS' to 'HH:MM:SS'. Returns input unchanged when not a time. */
function normTime(v) {
  if (v == null) return v;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(String(v));
  if (!m) return v;
  return `${pad(+m[1])}:${m[2]}:${m[3] || '00'}`;
}
function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function minToTime(min) { const x = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}:00`; }

// ─── demo clock ──────────────────────────────────────────────────────────────
// Flows at real speed from the instant it was set (like page.clock.install),
// unless frozen.
const clock = {
  base: parisToMs('2026-09-24', '07:25:00'),
  setAt: Date.now(),
  frozen: false,
  set(ms, { frozen = false } = {}) { this.base = ms; this.setAt = Date.now(); this.frozen = !!frozen; },
  now() { return this.frozen ? this.base : this.base + (Date.now() - this.setAt); },
  nowIso() { return iso(this.now()); },
  today() { return parisDate(this.now()); },
};

module.exports = {
  TZ, parisParts, parisOffsetMin, parisToMs, iso, parisIso, parisDate, parisTime,
  addDays, weekday, mondayOf, dateRange, normTime, timeToMin, minToTime, pad, clock,
};
