'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { q } from './db';
import { getUser, startSession, endSession } from './auth';
import { FUNDS, CATEGORIES } from './fmt';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const amt = (fd) => Math.round(Number(s(fd, 'amount').replace(/,/g, '')));
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));

async function need(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/');
  return u;
}

function back(path, msg, ok) {
  redirect(path + '?' + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

export async function login(fd) {
  const email = s(fd, 'email').toLowerCase();
  const pw = s(fd, 'password');
  const rows = await q('SELECT id, password_hash FROM pc2_users WHERE lower(email) = $1 AND active', [email]);
  if (!rows[0] || !bcrypt.compareSync(pw, rows[0].password_hash)) back('/login', 'Invalid email or password');
  await startSession(rows[0].id);
  redirect('/');
}

export async function logout() {
  await endSession();
  redirect('/login');
}

export async function setup(fd) {
  const n = (await q('SELECT count(*)::int AS n FROM pc2_users'))[0].n;
  if (n > 0) redirect('/login');
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  const pw = s(fd, 'password');
  if (!name || !email.includes('@') || pw.length < 8) back('/setup', 'Enter a name, a valid email and a password of at least 8 characters');
  const off = (await q(`SELECT id FROM pc2_offices WHERE code = 'LHR'`))[0];
  const r = await q(
    `INSERT INTO pc2_users (name, email, password_hash, role, office_id) VALUES ($1, $2, $3, 'om', $4) RETURNING id`,
    [name, email, bcrypt.hashSync(pw, 10), off.id]
  );
  await startSession(r[0].id);
  redirect('/');
}

export async function addExpense(fd) {
  const u = await need();
  const amount = amt(fd);
  const fund = s(fd, 'fund');
  const category = s(fd, 'category');
  const spentOn = s(fd, 'spent_on');
  const description = s(fd, 'description');
  if (!(amount > 0)) back('/expenses', 'Enter a valid amount');
  if (!FUNDS[fund] || !CATEGORIES.includes(category)) back('/expenses', 'Pick a fund and a category');
  if (badDate(spentOn)) back('/expenses', 'Pick a valid date');
  let officeId = u.office_id;
  if (u.role === 'om') {
    const o = (await q('SELECT id FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
    if (o) officeId = o.id;
  }
  const auto = u.role === 'om';
  await q(
    `INSERT INTO pc2_expenses (office_id, fund, category, description, amount, spent_on, status, submitted_by, decided_by, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [officeId, fund, category, description, amount, spentOn, auto ? 'approved' : 'pending', u.id, auto ? u.id : null, auto ? new Date().toISOString() : null]
  );
  back('/expenses', auto ? 'Expense recorded' : 'Expense submitted for approval', true);
}

export async function decideExpense(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const status = s(fd, 'decision') === 'approve' ? 'approved' : 'rejected';
  await q(
    `UPDATE pc2_expenses SET status = $1, decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $4 AND status = 'pending'`,
    [status, u.id, s(fd, 'note'), id]
  );
  redirect(s(fd, 'back') === '/' ? '/' : '/expenses');
}

export async function deleteExpense(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  if (u.role === 'om') await q('DELETE FROM pc2_expenses WHERE id = $1', [id]);
  else await q(`DELETE FROM pc2_expenses WHERE id = $1 AND submitted_by = $2 AND status = 'pending'`, [id, u.id]);
  redirect(s(fd, 'back') === '/' ? '/' : '/expenses');
}

export async function addAdvance(fd) {
  const u = await need(['om']);
  const amount = amt(fd);
  const fund = s(fd, 'fund');
  const on = s(fd, 'received_on');
  if (!(amount > 0) || !FUNDS[fund]) back('/funds', 'Enter a valid fund and amount');
  if (badDate(on)) back('/funds', 'Pick a valid date');
  await q(
    `INSERT INTO pc2_advances (fund, amount, received_on, reference, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [fund, amount, on, s(fd, 'reference'), s(fd, 'note'), u.id]
  );
  back('/funds', 'Advance recorded', true);
}

export async function deleteAdvance(fd) {
  await need(['om']);
  await q('DELETE FROM pc2_advances WHERE id = $1', [Number(s(fd, 'id'))]);
  back('/funds', 'Advance removed', true);
}

export async function addUser(fd) {
  await need(['om']);
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  const pw = s(fd, 'password');
  const role = s(fd, 'role');
  if (!name || !email.includes('@') || pw.length < 8 || !['sso', 'so'].includes(role)) back('/team', 'Enter name, valid email, role and a password of at least 8 characters');
  const off = (await q('SELECT id FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back('/team', 'Pick an office');
  let failed = false;
  try {
    await q(`INSERT INTO pc2_users (name, email, password_hash, role, office_id) VALUES ($1,$2,$3,$4,$5)`, [name, email, bcrypt.hashSync(pw, 10), role, off.id]);
  } catch {
    failed = true;
  }
  if (failed) back('/team', 'That email is already in use');
  back('/team', 'User added', true);
}

export async function resetPassword(fd) {
  await need(['om']);
  const pw = s(fd, 'password');
  if (pw.length < 8) back('/team', 'Password must be at least 8 characters');
  await q('UPDATE pc2_users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(pw, 10), Number(s(fd, 'id'))]);
  back('/team', 'Password updated', true);
}

export async function toggleUser(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  if (id === u.id) back('/team', 'You cannot deactivate your own account');
  await q('UPDATE pc2_users SET active = NOT active WHERE id = $1', [id]);
  back('/team', 'User updated', true);
}
