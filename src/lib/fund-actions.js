'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { loadFunds } from './fund-types';

const KEEP = ['petty', 'brc', 'other'];
const back = (msg, ok) => redirect('/advances?' + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));

async function needOm() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (u.role !== 'om' || u.impersonatedBy) redirect('/advances');
  return u;
}
const label = (fd) => String(fd.get('label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);

// Sr. Ops Manager: add another type of advance (for example BOLDBus). It shows up in every dropdown and report straight away.
export async function addFundType(fd) {
  const u = await needOm();
  const name = label(fd);
  if (!name) back('Enter a name for the new advance type');
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  if (!key) back('Use letters or numbers in the name');
  const clash = await q('SELECT key FROM pc2_fund_types WHERE key = $1 OR lower(label) = lower($2)', [key, name]);
  if (clash.length) back('There is already an advance type with that name');
  const next = (await q('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM pc2_fund_types'))[0].n;
  await q('INSERT INTO pc2_fund_types (key, label, sort) VALUES ($1, $2, $3)', [key, name, next]);
  await logEvent(u, 'create', 'fund_type', null, 'Added advance type ' + name, null, { key, label: name });
  await loadFunds(true);
  back('Advance type added: ' + name, true);
}

export async function renameFundType(fd) {
  const u = await needOm();
  const key = String(fd.get('key') ?? '');
  const name = label(fd);
  if (!name) back('Enter a name');
  const cur = (await q('SELECT label FROM pc2_fund_types WHERE key = $1', [key]))[0];
  if (!cur) back('That advance type was not found');
  const clash = await q('SELECT key FROM pc2_fund_types WHERE lower(label) = lower($1) AND key <> $2', [name, key]);
  if (clash.length) back('There is already an advance type with that name');
  await q('UPDATE pc2_fund_types SET label = $1 WHERE key = $2', [name, key]);
  await logEvent(u, 'edit', 'fund_type', null, 'Renamed advance type ' + cur.label + ' to ' + name, { label: cur.label }, { label: name });
  await loadFunds(true);
  back('Saved', true);
}

// Only a type nothing has ever been recorded against can be removed; the three original types stay.
export async function removeFundType(fd) {
  const u = await needOm();
  const key = String(fd.get('key') ?? '');
  if (KEEP.includes(key)) back('The original advance types cannot be removed');
  const cur = (await q('SELECT label FROM pc2_fund_types WHERE key = $1', [key]))[0];
  if (!cur) back('That advance type was not found');
  const used = (await q(
    `SELECT (SELECT COUNT(*) FROM pc2_advances WHERE fund = $1) + (SELECT COUNT(*) FROM pc2_issues WHERE fund = $1) + (SELECT COUNT(*) FROM pc2_expenses WHERE fund = $1) + (SELECT COUNT(*) FROM pc2_returns WHERE fund = $1) AS n`,
    [key]
  ))[0].n;
  if (Number(used) > 0) back(cur.label + ' already has records, so it cannot be removed');
  await q('DELETE FROM pc2_fund_types WHERE key = $1', [key]);
  await logEvent(u, 'delete', 'fund_type', null, 'Removed advance type ' + cur.label, { key, label: cur.label }, null);
  await loadFunds(true);
  back('Removed ' + cur.label, true);
}
