'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { q } from './db';
import { getUser, startSession, endSession } from './auth';
import { FUNDS, CATEGORIES, pkr } from './fmt';
import { fundSummary } from './queries';
import { notifyRoles, notifyUser } from './notify';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const amt = (fd) => Math.round(Number(s(fd, 'amount').replace(/,/g, '')));
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));
const dest = (v, d) => (['/', '/expenses', '/advances', '/accounts'].includes(v) ? v : d);

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

// Anyone can add an expense; the Operations Manager is notified straight away.
export async function addExpense(fd) {
  const u = await need();
  const amount = amt(fd);
  const category = s(fd, 'category');
  const spentOn = s(fd, 'spent_on');
  const description = s(fd, 'description');
  if (!(amount > 0)) back('/expenses', 'Enter a valid amount');
  if (!CATEGORIES.includes(category)) back('/expenses', 'Pick a category');
  if (badDate(spentOn)) back('/expenses', 'Pick a valid date');

  let fund = s(fd, 'fund');
  let issueId = null;
  let officeId = u.office_id;
  let status;
  if (u.role === 'so') {
    const i = (await q(
      `SELECT i.id, i.fund, i.amount - i.returned - COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0) AS remaining FROM pc2_issues i WHERE i.id = $1 AND i.issued_to = $2`,
      [Number(s(fd, 'issue_id')), u.id]
    ))[0];
    if (!i) back('/expenses', 'Pick one of your advances');
    if (amount > Number(i.remaining)) back('/expenses', 'Amount exceeds your cash in hand (' + pkr(i.remaining) + ')');
    fund = i.fund;
    issueId = i.id;
    status = 'submitted';
  } else {
    if (!FUNDS[fund]) back('/expenses', 'Pick a fund');
    status = u.role === 'om' ? 'approved' : 'verified';
    if (u.role === 'om') {
      const o = (await q('SELECT id FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
      if (o) officeId = o.id;
    }
  }

  const decided = u.role === 'om';
  await q(
    `INSERT INTO pc2_expenses (office_id, fund, category, description, amount, spent_on, status, submitted_by, issue_id, decided_by, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [officeId, fund, category, description, amount, spentOn, status, u.id, issueId, decided ? u.id : null, decided ? new Date().toISOString() : null]
  );

  const msg = u.name + ' added an expense: ' + pkr(amount) + ' - ' + category + (description ? ' (' + description + ')' : '');
  if (u.role === 'so') await notifyRoles(['om', 'sso'], msg, '/expenses?status=submitted', u.id);
  else if (u.role === 'sso') await notifyRoles(['om'], msg, '/expenses?status=verified', u.id);
  back('/expenses', u.role === 'so' ? 'Submitted - your SSO and the Operations Manager have been notified' : 'Expense recorded', true);
}

// SSO verifies a Support Officer expense; the OM reviews verified expenses.
export async function decideExpense(fd) {
  const u = await need(['om', 'sso']);
  const id = Number(s(fd, 'id'));
  const approve = s(fd, 'decision') === 'approve';
  const note = s(fd, 'note');
  const to = dest(s(fd, 'back'), '/expenses');
  const row = (await q('SELECT id, status, amount, category, submitted_by FROM pc2_expenses WHERE id = $1', [id]))[0];
  if (!row) redirect(to);
  let next = null;
  if (row.status === 'submitted') next = approve ? (u.role === 'om' ? 'approved' : 'verified') : 'rejected';
  else if (row.status === 'verified' && u.role === 'om') next = approve ? 'approved' : 'rejected';
  if (!next) redirect(to);

  await q(
    `UPDATE pc2_expenses SET status = $1, decided_by = $2, decided_at = now(), decision_note = $3, verified_by = CASE WHEN $1 = 'verified' THEN $2 ELSE verified_by END, verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE verified_at END WHERE id = $4 AND status = $5`,
    [next, u.id, note, id, row.status]
  );

  const what = pkr(row.amount) + ' (' + row.category + ')';
  if (next === 'verified') await notifyRoles(['om'], u.name + ' verified ' + what + ' - ready for your review', '/expenses?status=verified', u.id);
  if (next === 'rejected' && row.submitted_by !== u.id) await notifyUser(row.submitted_by, 'Your expense of ' + what + ' was rejected' + (note ? ': ' + note : ''), '/expenses');
  if (next === 'approved' && row.submitted_by !== u.id) await notifyUser(row.submitted_by, 'Your expense of ' + what + ' was approved', '/expenses');
  redirect(to);
}

export async function deleteExpense(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  if (u.role === 'om') await q(`DELETE FROM pc2_expenses WHERE id = $1 AND status <> 'sent'`, [id]);
  else await q(`DELETE FROM pc2_expenses WHERE id = $1 AND submitted_by = $2 AND status = 'submitted'`, [id, u.id]);
  redirect(dest(s(fd, 'back'), '/expenses'));
}

// Funds received from the Accounts team (Petty, BRC, Others) - Operations Manager only.
export async function addAdvance(fd) {
  const u = await need(['om']);
  const amount = amt(fd);
  const fund = s(fd, 'fund');
  const on = s(fd, 'received_on');
  if (!(amount > 0) || !FUNDS[fund]) back('/advances', 'Enter a valid fund and amount');
  if (badDate(on)) back('/advances', 'Pick a valid date');
  await q(
    `INSERT INTO pc2_advances (fund, amount, received_on, reference, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [fund, amount, on, s(fd, 'reference'), s(fd, 'note'), u.id]
  );
  await notifyRoles(['sso'], 'Funds received from Accounts: ' + pkr(amount) + ' (' + FUNDS[fund] + ')', '/advances', u.id);
  back('/advances', 'Advance recorded', true);
}

export async function deleteAdvance(fd) {
  await need(['om']);
  await q('DELETE FROM pc2_advances WHERE id = $1', [Number(s(fd, 'id'))]);
  back('/advances', 'Advance removed', true);
}

// SSO issues cash from a petty fund to a Support Officer.
export async function issueAdvance(fd) {
  const u = await need(['sso', 'om']);
  const holderId = Number(s(fd, 'issued_to'));
  const fund = s(fd, 'fund');
  const amount = amt(fd);
  const on = s(fd, 'issued_on');
  if (!(amount > 0) || !FUNDS[fund]) back('/advances', 'Enter a valid fund and amount');
  if (badDate(on)) back('/advances', 'Pick a valid date');
  const holder = (await q(`SELECT id, name FROM pc2_users WHERE id = $1 AND role = 'so' AND active`, [holderId]))[0];
  if (!holder) back('/advances', 'Pick a Support Officer');
  const row = (await fundSummary()).rows.find((r) => r.key === fund);
  if (amount > row.pool) back('/advances', 'Not enough in ' + FUNDS[fund] + ' (available ' + pkr(row.pool) + ')');
  await q(
    `INSERT INTO pc2_issues (fund, amount, issued_to, issued_by, issued_on, note) VALUES ($1,$2,$3,$4,$5,$6)`,
    [fund, amount, holder.id, u.id, on, s(fd, 'note')]
  );
  await notifyUser(holder.id, u.name + ' issued you an advance of ' + pkr(amount) + ' (' + FUNDS[fund] + ')', '/advances');
  await notifyRoles(['om'], u.name + ' issued ' + pkr(amount) + ' (' + FUNDS[fund] + ') to ' + holder.name, '/advances', u.id);
  back('/advances', 'Advance issued to ' + holder.name, true);
}

// Unspent cash handed back by a Support Officer.
export async function recordReturn(fd) {
  await need(['sso', 'om']);
  const id = Number(s(fd, 'issue_id'));
  const amount = amt(fd);
  const i = (await q(
    `SELECT i.amount - i.returned - COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0) AS remaining FROM pc2_issues i WHERE i.id = $1`,
    [id]
  ))[0];
  if (!i) back('/advances', 'Advance not found');
  if (!(amount > 0) || amount > Number(i.remaining)) back('/advances', 'Return must be between 1 and ' + pkr(i.remaining));
  await q('UPDATE pc2_issues SET returned = returned + $1 WHERE id = $2', [amount, id]);
  back('/advances', 'Return recorded', true);
}

// OM submits all reviewed expenses back to Accounts as one batch.
export async function submitToAccounts(fd) {
  const u = await need(['om']);
  const rows = await q(`SELECT id, amount FROM pc2_expenses WHERE status = 'approved' AND batch_id IS NULL`);
  if (!rows.length) back('/accounts', 'No reviewed expenses to submit');
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const b = (await q(
    `INSERT INTO pc2_batches (created_by, note, total, item_count) VALUES ($1,$2,$3,$4) RETURNING id`,
    [u.id, s(fd, 'note'), total, rows.length]
  ))[0];
  await q(`UPDATE pc2_expenses SET status = 'sent', batch_id = $1 WHERE status = 'approved' AND batch_id IS NULL`, [b.id]);
  await notifyRoles(['sso'], 'Batch #' + b.id + ' submitted to Accounts: ' + rows.length + ' expenses, ' + pkr(total), '/accounts', u.id);
  back('/accounts', 'Batch #' + b.id + ' submitted to Accounts', true);
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

export async function readAll() {
  const u = await need();
  await q('UPDATE pc2_notifications SET is_read = TRUE WHERE user_id = $1', [u.id]);
  redirect('/notifications');
}
