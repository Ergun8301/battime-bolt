'use strict';
// A small PostgREST emulator over the in-memory store: select lists with
// embeds (alias:table!hint(cols)), horizontal filters (eq, neq, gt, gte, lt,
// lte, like, ilike, is, in, not.*, or=(…), and=(…)), order with nulls
// first/last, offset/limit, Prefer count=exact / return=representation /
// resolution=merge-duplicates + on_conflict, Accept vnd.pgrst.object+json.
// Anything it does not understand raises Unsupported -> HTTP 501.

const { TABLES, resolveEmbed } = require('./schema');
const db = require('./db');
const { PgError } = db;

class Unsupported extends Error {}

// ─── select list ─────────────────────────────────────────────────────────────
function splitTop(s, sep = ',') {
  const out = []; let depth = 0; let cur = ''; let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || out.length) out.push(cur);
  return out.filter((x) => x !== '');
}

function parseSelect(str) {
  const nodes = [];
  for (const raw of splitTop(str || '*')) {
    let item = raw.trim();
    if (item === '*') { nodes.push({ type: 'star' }); continue; }
    if (item.startsWith('...')) throw new Unsupported(`spread embed "${item}"`);
    let alias = null;
    const am = /^([A-Za-z_][\w]*):(?!:)(.*)$/s.exec(item);
    if (am) { alias = am[1]; item = am[2]; }
    const pi = item.indexOf('(');
    if (pi >= 0) {
      if (!item.endsWith(')')) throw new Unsupported(`bad embed "${raw}"`);
      const head = item.slice(0, pi);
      const inner = item.slice(pi + 1, -1);
      const parts = head.split('!');
      const name = parts[0];
      let hint = null; let innerJoin = false;
      for (const p of parts.slice(1)) { if (p === 'inner') innerJoin = true; else if (p === 'left') { /* default */ } else hint = p; }
      nodes.push({ type: 'embed', alias: alias || name, name, hint, inner: innerJoin, select: parseSelect(inner) });
      continue;
    }
    let cast = null;
    const ci = item.indexOf('::');
    if (ci >= 0) { cast = item.slice(ci + 2); item = item.slice(0, ci); }
    if (item.includes('->')) throw new Unsupported(`json path select "${raw}"`);
    if (/\(/.test(item) || /^count$/.test(item)) throw new Unsupported(`aggregate select "${raw}"`);
    nodes.push({ type: 'col', name: item, alias: alias || item, cast });
  }
  return nodes;
}

function checkSelectColumns(table, nodes) {
  const cols = TABLES[table].cols;
  for (const n of nodes) {
    if (n.type === 'col' && !cols[n.name]) {
      throw new PgError('42703', `column ${table}.${n.name} does not exist`);
    }
    if (n.type === 'embed') {
      let rel;
      try { rel = resolveEmbed(table, n.name, n.hint); } catch (e) { throw new Unsupported(String(e)); }
      n.rel = rel;
      checkSelectColumns(rel.target, n.select);
    }
  }
}

function project(table, row, nodes, c) {
  const out = {};
  const cols = TABLES[table].cols;
  for (const n of nodes) {
    if (n.type === 'star') { for (const k of Object.keys(cols)) out[k] = row[k] === undefined ? null : row[k]; continue; }
    if (n.type === 'col') {
      let v = row[n.name] === undefined ? null : row[n.name];
      if (n.cast === 'text' && v != null) v = String(v);
      out[n.alias] = v;
      continue;
    }
    const { rel } = n;
    if (rel.kind === 'm2o') {
      const fkVal = row[rel.col];
      const pkCol = TABLES[rel.target].pk[0];
      const t = fkVal == null ? null : db.rows(rel.target).find((r) => r[pkCol] === fkVal && db.can('select', rel.target, r, c));
      out[n.alias] = t ? project(rel.target, t, n.select, c) : null;
    } else {
      const pkCol = TABLES[table].pk[0];
      out[n.alias] = db.rows(rel.target).filter((r) => r[rel.col] === row[pkCol] && db.can('select', rel.target, r, c))
        .map((r) => project(rel.target, r, n.select, c));
    }
  }
  return out;
}

// ─── filters ─────────────────────────────────────────────────────────────────
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and', 'not.or', 'not.and']);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'isdistinct']);

function parseList(s) {
  // "(a,b,\"c,d\")" -> ['a','b','c,d']
  if (!s.startsWith('(') || !s.endsWith(')')) throw new Unsupported(`bad in-list ${s}`);
  const inner = s.slice(1, -1);
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === '\\' && q) { cur += inner[++i]; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (inner.length) out.push(cur);
  return out;
}

function coerce(type, v) {
  if (v === null || v === undefined) return v;
  switch (type) {
    case 'numeric': case 'int': return Number(v);
    case 'bool': return v === true || v === 'true';
    case 'timestamptz': { const ms = Date.parse(v); return Number.isFinite(ms) ? ms : v; }
    case 'time': return db.normValue('time', v);
    case 'date': return String(v).slice(0, 10);
    default: return String(v);
  }
}
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function likeToRegex(p, ci) {
  const esc = String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, ci ? 'is' : 's');
}

/** Builds a predicate for "col" + "op.value" (op may be prefixed by not.). */
function buildCond(table, col, expr) {
  if (col.includes('.')) throw new Unsupported(`embedded/json filter on "${col}"`);
  const type = TABLES[table].cols[col];
  if (!type) throw new PgError('42703', `column ${table}.${col} does not exist`);
  let neg = false; let rest = expr;
  if (rest.startsWith('not.')) { neg = true; rest = rest.slice(4); }
  const dot = rest.indexOf('.');
  if (dot < 0) throw new Unsupported(`filter without operator ${col}=${expr}`);
  const op = rest.slice(0, dot); const val = rest.slice(dot + 1);
  if (!OPS.has(op)) throw new Unsupported(`operator "${op}" (${col}=${expr})`);
  let pred;
  if (op === 'is') {
    const v = val.toLowerCase();
    if (v === 'null') pred = (r) => r[col] === null || r[col] === undefined;
    else if (v === 'true') pred = (r) => r[col] === true;
    else if (v === 'false') pred = (r) => r[col] === false;
    else if (v === 'unknown') pred = (r) => r[col] == null;
    else throw new Unsupported(`is.${val}`);
  } else if (op === 'in') {
    const set = parseList(val).map((x) => coerce(type, x));
    pred = (r) => r[col] != null && set.some((x) => coerce(type, r[col]) === x);
  } else if (op === 'like' || op === 'ilike') {
    const re = likeToRegex(val, op === 'ilike');
    pred = (r) => r[col] != null && re.test(String(r[col]));
  } else {
    const target = coerce(type, val === 'null' ? null : val);
    pred = (r) => {
      const v = r[col];
      if (op === 'isdistinct') return coerce(type, v) !== target;
      if (v === null || v === undefined) return false; // SQL NULL semantics
      const c = cmp(coerce(type, v), target);
      switch (op) {
        case 'eq': return c === 0; case 'neq': return c !== 0;
        case 'gt': return c > 0; case 'gte': return c >= 0;
        case 'lt': return c < 0; case 'lte': return c <= 0;
        default: return false;
      }
    };
  }
  if (!neg) return pred;
  return (r) => (op === 'is' ? !pred(r) : (r[col] == null ? false : !pred(r)));
}

/** or=(a.gt.0,b.gt.0) / and=(...) / nested or(...) */
function buildLogic(table, kind, inner, negate = false) {
  if (!inner.startsWith('(') || !inner.endsWith(')')) throw new Unsupported(`bad logic tree ${kind}=${inner}`);
  const parts = splitTop(inner.slice(1, -1));
  const preds = parts.map((p) => {
    const m = /^(not\.)?(or|and)(\(.*\))$/s.exec(p);
    if (m) return buildLogic(table, m[2], m[3], !!m[1]);
    const d = p.indexOf('.');
    if (d < 0) throw new Unsupported(`bad logic condition ${p}`);
    return buildCond(table, p.slice(0, d), p.slice(d + 1));
  });
  const f = kind === 'or' ? (r) => preds.some((x) => x(r)) : (r) => preds.every((x) => x(r));
  return negate ? (r) => !f(r) : f;
}

function buildFilters(table, params) {
  const preds = [];
  for (const [k, v] of params) {
    if (k === 'or' || k === 'and') { preds.push(buildLogic(table, k, v)); continue; }
    if (k === 'not.or' || k === 'not.and') { preds.push(buildLogic(table, k.slice(4), v, true)); continue; }
    if (RESERVED.has(k)) continue;
    if (/\.(or|and)$/.test(k)) throw new Unsupported(`embedded logic filter ${k}`);
    preds.push(buildCond(table, k, v));
  }
  return (r) => preds.every((p) => p(r));
}

function buildOrder(table, spec) {
  if (!spec) return null;
  const terms = spec.split(',').map((t) => {
    if (t.includes('(')) throw new Unsupported(`order on embedded resource "${t}"`);
    const parts = t.split('.');
    const col = parts[0];
    const type = TABLES[table].cols[col];
    if (!type) throw new PgError('42703', `column ${table}.${col} does not exist`);
    let dir = 'asc'; let nulls = null;
    for (const p of parts.slice(1)) {
      if (p === 'asc' || p === 'desc') dir = p;
      else if (p === 'nullsfirst' || p === 'nullslast') nulls = p;
      else throw new Unsupported(`order modifier "${p}"`);
    }
    if (!nulls) nulls = dir === 'asc' ? 'nullslast' : 'nullsfirst'; // Postgres default
    return { col, type, dir, nulls };
  });
  return (a, b) => {
    for (const t of terms) {
      const va = a[t.col]; const vb = b[t.col];
      const na = va == null; const nb = vb == null;
      if (na || nb) {
        if (na && nb) continue;
        return (na ? -1 : 1) * (t.nulls === 'nullsfirst' ? 1 : -1);
      }
      const c = cmp(coerce(t.type, va), coerce(t.type, vb));
      if (c) return t.dir === 'asc' ? c : -c;
    }
    return 0;
  };
}

// ─── request handling ────────────────────────────────────────────────────────
function parsePrefer(h) {
  const out = {};
  for (const part of String(h || '').split(',')) {
    const [k, v] = part.trim().split('=');
    if (k) out[k.trim()] = (v || '').trim();
  }
  return out;
}

function wantsObject(accept) { return /application\/vnd\.pgrst\.object\+json/.test(accept || ''); }

/**
 * @returns {status, headers, body}
 */
function handleTable(method, table, url, headers, bodyText, c) {
  if (!TABLES[table]) {
    throw new PgError('42P01', `relation "public.${table}" does not exist`, { status: 404, hint: null });
  }
  const params = [...url.searchParams.entries()];
  const q = Object.fromEntries(params);
  const prefer = parsePrefer(headers.prefer);
  const accept = headers.accept || '';
  if (/text\/csv|vnd\.pgrst\.plan|geo\+json/.test(accept)) throw new Unsupported(`Accept ${accept}`);
  if (headers.range) throw new Unsupported('Range header paging');
  const filter = buildFilters(table, params);
  const selectNodes = parseSelect(q.select || '*');
  checkSelectColumns(table, selectNodes);

  const respond = (list, status, extraHeaders = {}) => {
    const hdr = { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders };
    const representation = method === 'GET' || method === 'HEAD' || prefer.return === 'representation';
    if (!representation) return { status: status === 200 ? 204 : status, headers: hdr, body: '' };
    let projected = list.map((r) => project(table, r, selectNodes, c));
    for (const n of selectNodes) if (n.type === 'embed' && n.inner) projected = projected.filter((x) => x[n.alias] != null && (!Array.isArray(x[n.alias]) || x[n.alias].length));
    if (wantsObject(accept)) {
      if (projected.length !== 1) {
        const e = new PgError('PGRST116', 'JSON object requested, multiple (or no) rows returned',
          { details: `The result contains ${projected.length} rows`, status: 406 });
        throw e;
      }
      hdr['Content-Type'] = 'application/vnd.pgrst.object+json; charset=utf-8';
      return { status, headers: hdr, body: method === 'HEAD' ? '' : JSON.stringify(projected[0]) };
    }
    return { status, headers: hdr, body: method === 'HEAD' ? '' : JSON.stringify(projected) };
  };

  if (method === 'GET' || method === 'HEAD') {
    let list = db.rows(table).filter((r) => db.can('select', table, r, c)).filter(filter);
    const order = buildOrder(table, q.order);
    if (order) list = [...list].sort(order);
    const total = list.length;
    const offset = q.offset ? Number(q.offset) : 0;
    const limit = q.limit ? Number(q.limit) : Infinity;
    list = list.slice(offset, offset + limit);
    const extra = {};
    const range = list.length ? `${offset}-${offset + list.length - 1}` : '*';
    extra['Content-Range'] = prefer.count ? `${range}/${total}` : `${range}/*`;
    return respond(list, 200, extra);
  }

  let body = null;
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch { throw new PgError('PGRST102', 'Empty or invalid json'); }
  }

  if (method === 'POST') {
    const bodies = Array.isArray(body) ? body : [body || {}];
    if (prefer.resolution === 'merge-duplicates' || prefer.resolution === 'ignore-duplicates') {
      const conflict = (q.on_conflict || TABLES[table].pk.join(',')).split(',');
      const out = [];
      const toInsert = [];
      for (const b of bodies) {
        const existing = db.rows(table).find((r) => conflict.every((k) => String(r[k]) === String(db.normValue(TABLES[table].cols[k], b[k]))));
        if (existing) {
          if (prefer.resolution === 'ignore-duplicates') continue;
          if (!db.can('update', table, existing, c)) {
            throw new PgError('42501', `new row violates row-level security policy (USING expression) for table "${table}"`);
          }
          out.push(...db.updateRows(table, [existing], b, c));
        } else toInsert.push(b);
      }
      if (toInsert.length) out.push(...db.insertRows(table, toInsert, c));
      return respond(out, 201);
    }
    const inserted = db.insertRows(table, bodies, c);
    return respond(inserted, 201);
  }

  if (method === 'PATCH') {
    const targets = db.rows(table).filter((r) => db.can('update', table, r, c)).filter(filter);
    const updated = db.updateRows(table, targets, body || {}, c);
    return respond(updated, 200);
  }

  if (method === 'DELETE') {
    const targets = db.rows(table).filter((r) => db.can('delete', table, r, c)).filter(filter);
    const snapshot = targets.map((r) => ({ ...r }));
    db.deleteRows(table, targets, c);
    return respond(snapshot, 200);
  }

  throw new Unsupported(`method ${method} on /rest/v1/${table}`);
}

module.exports = { handleTable, parseSelect, buildFilters, buildOrder, Unsupported, parsePrefer };
