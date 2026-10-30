'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

async function needOm() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (u.role !== 'om' || u.impersonatedBy) redirect('/team');
  return u;
}
function back(msg, ok) {
  redirect('/team' + (ok ? '?ok=' : '?err=') + encodeURIComponent(msg));
}

// Sr. Ops Manager: add someone who is issued advances but never signs in to the app (a driver, a courier, a
// one-off helper). They show up as a recipient on the Advances page, next to the real team members.
export async function addPayee(fd) {
  const u = await needOm();
  const name = s(fd, 'name').slice(0, 80);
  if (!name) back('Enter a name');
  const off = (await q('SELECT id FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back('Pick an office');
  const r = await q(
    'INSERT INTO pc2_payees (name, office_id, phone, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [name, off.id, s(fd, 'phone').slice(0, 30), s(fd, 'note').slice(0, 200), u.id]
  );
  await logEvent(u, 'create', 'payee', r[0].id, 'Added advance-only team member: ' + name + ' (' + s(fd, 'office') + ')', null, { name, office: s(fd, 'office') });
  back(name + ' added. They can now be issued an advance.', true);
}

export async function editPayee(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const before = (await q('SELECT p.id, p.name, p.phone, p.note, o.code AS office FROM pc2_payees p JOIN pc2_offices o ON o.id = p.office_id WHERE p.id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!before) back('That team member was not found');
  const name = s(fd, 'name').slice(0, 80);
  if (!name) back('Enter a name');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back('Pick an office');
  await q('UPDATE pc2_payees SET name = $1, office_id = $2, phone = $3, note = $4 WHERE id = $5', [name, off.id, s(fd, 'phone').slice(0, 30), s(fd, 'note').slice(0, 200), id]);
  await logEvent(u, 'edit', 'payee', id, 'Edited advance-only team member #' + id + ': ' + before.name + ' -> ' + name, { name: before.name, office: before.office }, { name, office: off.code });
  back('Saved', true);
}

// Deactivating only hides them from the "Issue an advance" dropdown; past advances stay exactly as they are.
export async function togglePayee(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, active FROM pc2_payees WHERE id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back('That team member was not found');
  await q('UPDATE pc2_payees SET active = $1 WHERE id = $2', [!p.active, id]);
  await logEvent(u, 'edit', 'payee', id, (p.active ? 'Deactivated' : 'Reactivated') + ' advance-only team member: ' + p.name);
  back(p.name + (p.active ? ' deactivated' : ' reactivated'), true);
}
