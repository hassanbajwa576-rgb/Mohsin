'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

// Only the Sr. Ops Manager changes the holiday calendar; everyone else reads it.
async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== 'om') redirect('/holidays');
  return u;
}
const back = (year, msg, ok) => redirect('/holidays?y=' + year + '&' + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));

export async function addGazetted(fd) {
  const u = await need();
  const day = s(fd, 'day');
  const name = s(fd, 'name').slice(0, 80);
  const y = dateOk(day) ? day.slice(0, 4) : String(new Date().getFullYear());
  if (!dateOk(day)) back(y, 'Choose a valid date');
  if (!name) back(y, 'Enter the holiday name');
  await q('INSERT INTO pc2_holidays (day, name, created_by) VALUES ($1, $2, $3) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', [day, name, u.id]);
  await logEvent(u, 'create', 'holiday', null, 'Holiday added: ' + name + ' ' + day, null, null);
  back(y, name + ' added', true);
}

export async function removeGazetted(fd) {
  const u = await need();
  const day = s(fd, 'day');
  if (!dateOk(day)) back(String(new Date().getFullYear()), 'Choose a valid date');
  await q('DELETE FROM pc2_holidays WHERE day = $1', [day]);
  await logEvent(u, 'delete', 'holiday', null, 'Holiday removed: ' + day, null, null);
  back(day.slice(0, 4), 'Holiday removed', true);
}

// The national days that fall on the same date every year. Islamic holidays (Eid, Ashura, Eid Milad-un-Nabi) move with the moon,
// so those are added by hand once the government announces them.
const FIXED = [['02-05', 'Kashmir Solidarity Day'], ['03-23', 'Pakistan Day'], ['05-01', 'Labour Day'], ['08-14', 'Independence Day'], ['12-25', 'Quaid-e-Azam Day / Christmas']];
export async function addFixedHolidays(fd) {
  const u = await need();
  const y = s(fd, 'year');
  if (!/^\d{4}$/.test(y)) back(String(new Date().getFullYear()), 'Choose a valid year');
  for (const [md, name] of FIXED) {
    await q('INSERT INTO pc2_holidays (day, name, created_by) VALUES ($1, $2, $3) ON CONFLICT (day) DO NOTHING', [y + '-' + md, name, u.id]);
  }
  await logEvent(u, 'create', 'holiday', null, 'Fixed-date holidays added for ' + y, null, null);
  back(y, 'Fixed-date holidays added for ' + y, true);
}

// Holidays read from an uploaded notification, after the Sr. Ops Manager has checked them on the page.
export async function importHolidays(fd) {
  const u = await need();
  const year = s(fd, 'year');
  const y = /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
  let rows = [];
  try { rows = JSON.parse(s(fd, 'rows')); } catch { back(y, 'Could not read the list'); }
  if (!Array.isArray(rows) || !rows.length) back(y, 'Tick at least one holiday');
  let n = 0;
  for (const r of rows.slice(0, 60)) {
    const day = String(r.day || '');
    const name = String(r.name || '').trim().slice(0, 80);
    if (!dateOk(day) || !name) continue;
    await q('INSERT INTO pc2_holidays (day, name, created_by) VALUES ($1, $2, $3) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', [day, name, u.id]);
    n++;
  }
  await logEvent(u, 'create', 'holiday', null, n + ' holidays imported from the government notification for ' + y, null, null);
  back(y, n + ' holidays added from the notification', true);
}
