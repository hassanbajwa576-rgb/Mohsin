'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { logEvent } from './audit';
import { notifyUser } from './notify';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const PAGE = '/visitors/hires';
const back = (msg, ok) => redirect(PAGE + '?' + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'hire_info')) redirect('/');
  return u;
}

// The guard (or anyone who can see new hires) marks that the new hire has come in.
export async function markHireArrived(fd) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!can(u, 'hire_view')) redirect('/');
  const id = Number(s(fd, 'id'));
  const h = (await q('SELECT h.id, h.name, h.office_id, h.created_by, h.arrived_at FROM pc2_hires h WHERE h.id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!h) back('New hire not found');
  if (!can(u, 'hire_info') && u.role !== 'om' && u.role !== 'sso' && u.office_id !== h.office_id) back('That new hire is in the other office');
  if (h.arrived_at) back(h.name + ' is already marked as arrived');
  await q('UPDATE pc2_hires SET arrived_at = now(), arrived_by = $1 WHERE id = $2', [u.id, h.id]);
  await logEvent(u, 'edit', 'hire', h.id, 'New hire arrived: ' + h.name);
  if (h.created_by && h.created_by !== u.id) await notifyUser(h.created_by, h.name + ' has arrived (new hire)', '/visitors/hires');
  back(h.name + ' marked as arrived', true);
}

// Record a new joiner: name, department, joining date, office and level.
export async function saveHire(fd) {
  const u = await need();
  const id = Number(s(fd, 'id')) || 0;
  const name = s(fd, 'name').slice(0, 80);
  const dept = s(fd, 'dept').slice(0, 60);
  const date = s(fd, 'join_date');
  const level = s(fd, 'level').slice(0, 20);
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!name) back('Enter the name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) back('Pick the joining date');
  if (!off) back('Pick the office');
  if (id) {
    await q('UPDATE pc2_hires SET name = $1, dept = $2, join_date = $3, office_id = $4, level = $5 WHERE id = $6', [name, dept, date, off.id, level, id]);
  } else {
    await q('INSERT INTO pc2_hires (name, dept, join_date, office_id, level, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [name, dept, date, off.id, level, u.id]);
  }
  await logEvent(u, id ? 'edit' : 'create', 'hire', id || null, (id ? 'Updated' : 'Added') + ' new hire ' + name + ' (' + off.code + ', joins ' + date + ')');
  back((id ? 'Updated ' : 'Added ') + name, true);
}

export async function deleteHire(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const r = await q('DELETE FROM pc2_hires WHERE id = $1 RETURNING name', [id]);
  if (r[0]) await logEvent(u, 'delete', 'hire', id, 'Removed new hire ' + r[0].name);
  back('Removed', true);
}
