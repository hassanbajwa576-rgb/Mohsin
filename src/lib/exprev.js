import { q } from './db';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON3 = MONTHS.map((m) => m.slice(0, 3));

// Whole rupees with thousands separators; zero shows as a dash so the tables stay readable.
export const money = (n) => {
  const v = Math.round(Number(n) || 0);
  return v ? v.toLocaleString('en-US') : '-';
};
export const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');

const zeros = () => Array(12).fill(0);
const add = (map, key, i, v) => {
  if (!map.has(key)) map.set(key, zeros());
  map.get(key)[i] += v;
};

export async function erYears() {
  const r = await q('SELECT DISTINCT extract(year from spent_on)::int AS y FROM pc2_er_entries ORDER BY y DESC');
  return r.map((x) => x.y);
}

export async function erStatus() {
  const [e] = await q('SELECT COUNT(*)::int AS n, MIN(spent_on)::text AS first, MAX(spent_on)::text AS last FROM pc2_er_entries');
  const m = await q("SELECT value FROM pc2_meta WHERE key = 'er_import'");
  return { entries: e.n, first: e.first, last: e.last, imported: m[0] ? m[0].value : '' };
}

// Spend of one year by month, grouped by cost centre and by expense type.
async function sums(year) {
  const rows = await q(
    'SELECT extract(month from spent_on)::int AS m, cost_center AS cc, expense_type AS et, SUM(amount)::float8 AS s FROM pc2_er_entries WHERE spent_on >= $1 AND spent_on <= $2 GROUP BY 1, 2, 3',
    [year + '-01-01', year + '-12-31']
  );
  const cc = new Map();
  const et = new Map();
  const month = zeros();
  const pairs = rows.map((r) => ({ m: r.m - 1, cc: r.cc, et: r.et, s: r.s }));
  for (const r of rows) {
    add(cc, r.cc, r.m - 1, r.s);
    add(et, r.et, r.m - 1, r.s);
    month[r.m - 1] += r.s;
  }
  return { cc, et, month, pairs };
}
const pick = (s, field, v) => (field === 'cc' ? s.cc : s.et).get(v) || zeros();
const plus = (a, b) => a.map((x, i) => x + b[i]);
const total = (a) => a.reduce((x, y) => x + y, 0);

// The dashboard, laid out like the workbook: one row per cost center, a subtotal, then the advances and tax rows, then the final total.
const EXTRA = /^(assets \/ security advances|vendor taxes payment)/i;
export async function dashboard(year) {
  const [lines, s] = await Promise.all([q("SELECT label, field, mval, meta FROM pc2_er_sheet WHERE kind = 'dash' ORDER BY sort"), sums(year)]);
  // A cost center row, with the expense types listed beneath it in the workbook as its children (opened with the + button).
  const cc = [];
  for (const l of lines) {
    const lvl = l.meta && typeof l.meta.lvl === 'number' ? l.meta.lvl : l.field === 'cc' ? 0 : 1;
    const vals = pick(s, l.field, l.mval);
    if (lvl === 0) cc.push({ label: l.label, extra: (l.meta && l.meta.grp === 1) || EXTRA.test(l.label), vals, kids: [] });
    else if (cc.length) cc[cc.length - 1].kids.push({ label: l.label, vals });
  }
  const main = cc.filter((r) => !r.extra);
  const extras = cc.filter((r) => r.extra);
  const listed = cc.reduce((a, r) => plus(a, r.vals), zeros());
  const other = s.month.map((v, i) => v - listed[i]);
  if (other.some((v) => Math.abs(v) > 0.5)) main.push({ label: 'Other (not on the list)', extra: false, vals: other, kids: [] });
  const mainTotal = main.reduce((a, r) => plus(a, r.vals), zeros());
  return { main, extras, mainTotal, month: s.month, year: total(s.month) };
}

// Budget against actual, as the workbook has it. Months the workbook has worked out (Jan to the closed month) show its own
// budget, actual by Ops, QuickBooks figures; later months show the consolidated budget only (nothing is spent against them yet).
export async function budgetView(year) {
  const lines = await q("SELECT sort, label, row_kind, field, mval, meta, vals FROM pc2_er_sheet WHERE kind = 'bva' ORDER BY sort");
  const closed = lines[0] ? Number(lines[0].meta.closed) || 0 : 0;
  const rows = lines.map((l) => {
    const v = l.vals || {};
    const has = l.row_kind === 'line' || l.row_kind === 'head';
    return {
      row: l.meta.row,
      label: l.label,
      kind: l.row_kind,
      rng: l.meta.rng || null,
      b: has ? v.b || zeros() : zeros(),
      q: has ? v.q || zeros() : zeros(),
      a: has ? v.a || zeros() : zeros(),
      ya: typeof v.ya === 'number' ? v.ya : null,
      // The workbook's own outline: a row indented under a heading belongs to it.
      inside: Number(l.meta.lvl) >= 1,
    };
  });
  // A total ("Total 6600 ...") takes every line between its own heading ("6600 ...") and itself, even one the sheet's SUM leaves out.
  for (const t of rows.filter((r) => r.kind === 'total')) {
    const code = (/(\d{4})/.exec(t.label) || [])[1];
    const head = code && rows.find((r) => r.kind === 'head' && r.row < t.row && r.label.startsWith(code));
    if (!head) continue;
    t.members = new Set();
    for (const r of rows) if (r.row > head.row && r.row < t.row && r.kind !== 'total') { r.inside = true; t.members.add(r.row); }
  }
  const totals = rows.filter((r) => r.kind === 'total');
  // A total's year-to-date actual is the workbook's own figure when it has one; otherwise it is the sum of its lines.
  const ownYa = new Set(totals.filter((r) => r.ya !== null).map((r) => r.row));
  for (const t of totals) {
    for (const r of rows) {
      if ((t.members ? t.members.has(r.row) : r.row >= t.rng[0] && r.row <= t.rng[1]) && r.kind !== 'total') {
        r.inside = true;
        t.b = plus(t.b, r.b);
        t.q = plus(t.q, r.q);
        t.a = plus(t.a, r.a);
        if (!ownYa.has(t.row) && r.ya !== null) t.ya = (t.ya || 0) + r.ya;
      }
    }
  }
  const grand = rows.find((r) => r.kind === 'grand');
  const grandOwn = !!grand && grand.ya !== null;
  const finalYa = lines[0] && typeof lines[0].meta.finalYa === 'number' ? lines[0].meta.finalYa : null;
  for (const r of rows) {
    if (grand && r.row < grand.row && (r.kind === 'total' || (!r.inside && (r.kind === 'line' || r.kind === 'head')))) {
      grand.b = plus(grand.b, r.b);
      grand.q = plus(grand.q, r.q);
      grand.a = plus(grand.a, r.a);
      if (!grandOwn && r.ya !== null && r.ya !== undefined) grand.ya = (grand.ya || 0) + r.ya;
    }
  }
  // Lines after the first Total Budgeted (contingency, vendor taxes) belong to a final total, as in the workbook.
  if (grand) {
    const fin = { row: 9998, label: 'Total Budgeted', kind: 'grand2', b: grand.b, q: grand.q, a: grand.a, ya: finalYa !== null ? finalYa : grand.ya === undefined ? null : grand.ya, inside: false };
    for (const r of rows) {
      if (r.row > grand.row && r.kind !== 'grand2' && !r.inside && (r.kind === 'line' || r.kind === 'head')) {
        fin.b = plus(fin.b, r.b);
        fin.q = plus(fin.q, r.q);
        fin.a = plus(fin.a, r.a);
        if (finalYa === null && r.ya !== null && r.ya !== undefined) fin.ya = (fin.ya || 0) + r.ya;
      }
    }
    rows.push(fin);
  }
  return { rows, closed, hasData: lines.length > 0 };
}

export async function budgetYear() {
  const r = await q("SELECT meta FROM pc2_er_sheet WHERE kind = 'bva' ORDER BY sort LIMIT 1");
  return r[0] ? Number(r[0].meta.year) || 0 : 0;
}

export async function pnlView() {
  const rows = await q("SELECT label, row_kind, meta, vals FROM pc2_er_sheet WHERE kind = 'pnl' ORDER BY sort");
  return { year: rows[0] ? Number(rows[0].meta.year) || 0 : 0, title: rows[0] ? rows[0].meta.title || [] : [], rows: rows.map((r) => ({ label: r.label, kind: r.row_kind, level: r.meta.level || 0, vals: r.vals })) };
}
