'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { validDate } from './att';
import { readWorkbook } from './exprev-import';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

// ExpRev is for the Sr. Ops Manager only.
async function needOm() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (u.role !== 'om') redirect('/');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Replace everything in ExpRev with what is in the workbook.
export async function importWorkbook(fd) {
  const u = await needOm();
  const here = '/exprev/import';
  const file = fd.get('file');
  if (!file || typeof file === 'string' || !file.size) back(here, 'Choose the Ops Expenses Dashboard file first');
  let w;
  try {
    w = await readWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    back(here, e && e.message ? e.message : 'That file could not be read');
  }
  if (!w.entries.length) back(here, 'No expenditure rows were found in that file');

  await q('DELETE FROM pc2_er_entries');
  await q('DELETE FROM pc2_er_sheet');
  for (const part of chunks(w.entries, 1500)) {
    await q(
      `INSERT INTO pc2_er_entries (spent_on, cost_center, expense_type, detail, amount, pay_mode, office, vendor, remarks, created_by)
       SELECT d::date, cc, et, de, a, pm, "of", ve, re, $2 FROM jsonb_to_recordset($1::jsonb) AS x(d text, cc text, et text, de text, a numeric, pm text, "of" text, ve text, re text)`,
      [JSON.stringify(part), u.id]
    );
  }

  const sheet = [];
  w.dash.forEach((l, i) => sheet.push({ kind: 'dash', sort: i, label: l.label, row_kind: 'line', field: l.field, mval: l.match, meta: { grp: l.grp || 0 }, vals: {} }));
  if (w.bva) {
    w.bva.lines.forEach((l, i) =>
      sheet.push({ kind: 'bva', sort: i, label: l.label, row_kind: l.kind, field: l.field || '', mval: l.match || '', meta: { year: w.bva.year, row: l.row, rng: l.rng || null, closed: w.bva.closed, finalYa: w.bva.finalYa }, vals: { b: l.b, q: l.q, a: l.a, ya: l.ya === undefined ? null : l.ya } })
    );
  }
  if (w.pnl) {
    w.pnl.rows.forEach((l, i) => sheet.push({ kind: 'pnl', sort: i, label: l.label, row_kind: l.kind, field: '', mval: '', meta: { year: w.pnl.year, title: w.pnl.title, level: l.level }, vals: l.vals }));
  }
  for (const part of chunks(sheet, 400)) {
    await q(
      `INSERT INTO pc2_er_sheet (kind, sort, label, row_kind, field, mval, meta, vals)
       SELECT kind, sort, label, row_kind, field, mval, meta, vals FROM jsonb_to_recordset($1::jsonb) AS x(kind text, sort int, label text, row_kind text, field text, mval text, meta jsonb, vals jsonb)`,
      [JSON.stringify(part)]
    );
  }
  const stamp = new Date().toISOString() + '|' + file.name;
  await q(`INSERT INTO pc2_meta (key, value) VALUES ('er_import', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [stamp]);
  await logEvent(u, 'create', 'exprev', null, 'ExpRev loaded from ' + file.name + ': ' + w.entries.length + ' expenditure rows', null, { entries: w.entries.length });
  back('/exprev', 'Loaded ' + w.entries.length + ' expenditure rows from ' + file.name, true);
}

export async function addEntry(fd) {
  const u = await needOm();
  const here = '/exprev/entries';
  const date = s(fd, 'date');
  const amount = Math.round(Number(s(fd, 'amount').replace(/,/g, '')) * 100) / 100;
  const cc = s(fd, 'cc');
  if (!validDate(date)) back(here, 'Choose a valid date');
  if (!cc) back(here, 'Choose the cost center');
  if (!Number.isFinite(amount) || amount === 0) back(here, 'Enter the amount in rupees');
  const r = await q(
    'INSERT INTO pc2_er_entries (spent_on, cost_center, expense_type, detail, amount, pay_mode, office, vendor, remarks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [date, cc, s(fd, 'type'), s(fd, 'detail'), amount, s(fd, 'mode'), s(fd, 'office'), s(fd, 'vendor'), s(fd, 'remarks'), u.id]
  );
  await logEvent(u, 'create', 'exprev', r[0].id, 'ExpRev entry: ' + cc + ' ' + amount.toLocaleString('en-US') + ' on ' + date, null, { cc, amount });
  back(here, 'Entry added', true);
}

export async function deleteEntry(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const r = Number.isInteger(id) ? await q('DELETE FROM pc2_er_entries WHERE id = $1 RETURNING cost_center, amount::float8 AS amount, spent_on::text AS d', [id]) : [];
  if (r[0]) await logEvent(u, 'delete', 'exprev', id, 'Removed ExpRev entry: ' + r[0].cost_center + ' ' + r[0].amount.toLocaleString('en-US') + ' on ' + r[0].d, null, null);
  back('/exprev/entries', r[0] ? 'Entry removed' : 'Entry not found', !!r[0]);
}
