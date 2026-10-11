'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { q } from './db';
import { getUser, startSession, endSession } from './auth';
import { FUNDS, CATEGORIES, pkr } from './fmt';
import { fundSummary, custodyFor } from './queries';
import { notifyRoles, notifyUser } from './notify';
import { logEvent, diff } from './audit';

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
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

async function expSnap(id) {
  return (await q(
    `SELECT e.id, o.code AS office, e.fund, e.category, e.description, e.amount, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, e.status, e.issue_id, e.submitted_by FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.id = $1`,
    [id]
  ))[0];
}

const expView = (r) => ({ office: r.office, fund: r.fund, category: r.category, description: r.description, amount: r.amount, spent_on: r.spent_on, status: r.status });

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
  await logEvent({ id: r[0].id, name, role: 'om' }, 'create', 'user', r[0].id, 'Operations Manager account created during setup: ' + email);
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
  let officeCode = u.office_code;
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
      const o = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
      if (o) { officeId = o.id; officeCode = o.code; }
    }
  }

  const decided = u.role === 'om';
  const ins = await q(
    `INSERT INTO pc2_expenses (office_id, fund, category, description, amount, spent_on, status, submitted_by, issue_id, decided_by, decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [officeId, fund, category, description, amount, spentOn, status, u.id, issueId, decided ? u.id : null, decided ? new Date().toISOString() : null]
  );
  const id = ins[0].id;
  await logEvent(u, 'create', 'expense', id, 'Added expense #' + id + ': ' + pkr(amount) + ' - ' + category + ' (' + officeCode + ', ' + FUNDS[fund] + ')', null,
    { office: officeCode, fund, category, description, amount, spent_on: spentOn, status });

  const msg = u.name + ' added an expense: ' + pkr(amount) + ' - ' + category + (description ? ' (' + description + ')' : '');
  if (u.role === 'so') await notifyRoles(['om', 'sso'], msg, '/expenses?status=submitted', u.id);
  else if (u.role === 'sso') await notifyRoles(['om'], msg, '/expenses?status=verified', u.id);
  back('/expenses', u.role === 'so' ? 'Submitted - your SSO and the Operations Manager have been notified' : 'Expense recorded', true);
}

// Operations Manager edits any expense that has not yet been sent to Accounts.
export async function editExpense(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const here = '/expenses/edit?id=' + id;
  const before = await expSnap(id);
  if (!before) back('/expenses', 'Expense not found');
  if (before.status === 'sent') back('/expenses', 'Expense #' + id + ' was already sent to Accounts and can no longer be edited');

  const amount = amt(fd);
  const category = s(fd, 'category');
  const spentOn = s(fd, 'spent_on');
  const description = s(fd, 'description');
  if (!(amount > 0)) back(here, 'Enter a valid amount');
  if (!CATEGORIES.includes(category)) back(here, 'Pick a category');
  if (badDate(spentOn)) back(here, 'Pick a valid date');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back(here, 'Pick an office');

  let fund = before.fund;
  if (!before.issue_id) {
    fund = s(fd, 'fund');
    if (!FUNDS[fund]) back(here, 'Pick a fund');
  } else if (before.status !== 'rejected') {
    const i = (await q(
      `SELECT i.amount - i.returned - COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected' AND e.id <> $2), 0) AS remaining FROM pc2_issues i WHERE i.id = $1`,
      [before.issue_id, id]
    ))[0];
    if (i && amount > Number(i.remaining)) back(here, 'Amount exceeds the cash available on advance #' + before.issue_id + ' (' + pkr(i.remaining) + ')');
  }

  const after = { office: off.code, fund, category, description, amount, spent_on: spentOn };
  const changes = diff(before, after);
  if (!changes.length) back('/expenses', 'No changes were made', true);

  await q(
    `UPDATE pc2_expenses SET office_id = $1, fund = $2, category = $3, description = $4, amount = $5, spent_on = $6 WHERE id = $7`,
    [off.id, fund, category, description, amount, spentOn, id]
  );
  await logEvent(u, 'edit', 'expense', id, 'Edited expense #' + id + ' - ' + changes.join('; '), expView(before), { ...after, status: before.status });
  if (before.submitted_by !== u.id) {
    await notifyUser(before.submitted_by, u.name + ' edited your expense #' + id + ': ' + changes.join('; '), '/expenses');
  }
  back('/expenses', 'Expense #' + id + ' updated', true);
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
  await logEvent(u, 'decision', 'expense', id, 'Expense #' + id + ' ' + row.status + ' -> ' + next + (note ? ' (' + note + ')' : ''), { status: row.status }, { status: next });

  const what = pkr(row.amount) + ' (' + row.category + ')';
  if (next === 'verified') await notifyRoles(['om'], u.name + ' verified ' + what + ' - ready for your review', '/expenses?status=verified', u.id);
  if (next === 'rejected' && row.submitted_by !== u.id) await notifyUser(row.submitted_by, 'Your expense of ' + what + ' was rejected' + (note ? ': ' + note : ''), '/expenses');
  if (next === 'approved' && row.submitted_by !== u.id) await notifyUser(row.submitted_by, 'Your expense of ' + what + ' was approved', '/expenses');
  redirect(to);
}

export async function deleteExpense(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const before = await expSnap(id);
  if (before) {
    const allowed = u.role === 'om' ? before.status !== 'sent' : before.status === 'submitted' && before.submitted_by === u.id;
    if (allowed) {
      await q('DELETE FROM pc2_expenses WHERE id = $1', [id]);
      await logEvent(u, 'delete', 'expense', id, 'Deleted expense #' + id + ': ' + pkr(before.amount) + ' - ' + before.category, expView(before), null);
    }
  }
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
  const r = await q(
    `INSERT INTO pc2_advances (fund, amount, received_on, reference, note, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [fund, amount, on, s(fd, 'reference'), s(fd, 'note'), u.id]
  );
  await logEvent(u, 'create', 'received_funds', r[0].id, 'Recorded funds from Accounts: ' + pkr(amount) + ' (' + FUNDS[fund] + ')', null,
    { fund, amount, received_on: on, reference: s(fd, 'reference'), note: s(fd, 'note') });
  await notifyRoles(['sso'], 'Funds received from Accounts: ' + pkr(amount) + ' (' + FUNDS[fund] + ')', '/advances', u.id);
  back('/advances', 'Funds recorded', true);
}

export async function editAdvance(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const here = '/advances/edit?type=received&id=' + id;
  const before = (await q(`SELECT id, fund, amount, reference, note, to_char(received_on, 'YYYY-MM-DD') AS received_on FROM pc2_advances WHERE id = $1`, [id]))[0];
  if (!before) back('/advances', 'Entry not found');
  const amount = amt(fd);
  const fund = s(fd, 'fund');
  const on = s(fd, 'received_on');
  if (!(amount > 0) || !FUNDS[fund]) back(here, 'Enter a valid fund and amount');
  if (badDate(on)) back(here, 'Pick a valid date');
  const after = { fund, amount, received_on: on, reference: s(fd, 'reference'), note: s(fd, 'note') };
  const { id: _id, ...old } = before;
  const changes = diff(old, after);
  if (!changes.length) back('/advances', 'No changes were made', true);
  await q(`UPDATE pc2_advances SET fund = $1, amount = $2, received_on = $3, reference = $4, note = $5 WHERE id = $6`, [fund, amount, on, after.reference, after.note, id]);
  await logEvent(u, 'edit', 'received_funds', id, 'Edited funds received #' + id + ' - ' + changes.join('; '), old, after);
  back('/advances', 'Funds entry #' + id + ' updated', true);
}

export async function deleteAdvance(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const before = (await q(`SELECT fund, amount, reference, note, to_char(received_on, 'YYYY-MM-DD') AS received_on FROM pc2_advances WHERE id = $1`, [id]))[0];
  if (before) {
    await q('DELETE FROM pc2_advances WHERE id = $1', [id]);
    await logEvent(u, 'delete', 'received_funds', id, 'Removed funds received #' + id + ': ' + pkr(before.amount) + ' (' + FUNDS[before.fund] + ')', before, null);
  }
  back('/advances', 'Entry removed', true);
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
  // The Operations Manager can issue to the SSO or an SO; the SSO can issue to an SO from cash they hold.
  const allowed = u.role === 'om' ? ['so', 'sso'] : ['so'];
  const holder = (await q(`SELECT id, name, role FROM pc2_users WHERE id = $1 AND role = ANY($2::text[]) AND active`, [holderId, allowed]))[0];
  if (!holder) back('/advances', 'Pick a team member to issue to');
  // Both the Operations Manager and the SSO can issue to a Support Officer: the SSO draws on
  // the cash they hold first, then on the shared pool.
  const row = (await fundSummary()).rows.find((r) => r.key === fund);
  const mine = u.role === 'sso' ? Math.max(0, await custodyFor(u.id, fund)) : 0;
  if (amount > row.pool + mine) back('/advances', 'Not enough in ' + FUNDS[fund] + ' (available ' + pkr(row.pool + mine) + ')');
  const r = await q(
    `INSERT INTO pc2_issues (fund, amount, issued_to, issued_by, issued_on, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [fund, amount, holder.id, u.id, on, s(fd, 'note')]
  );
  await logEvent(u, 'create', 'advance', r[0].id, 'Issued advance #' + r[0].id + ' of ' + pkr(amount) + ' (' + FUNDS[fund] + ') to ' + holder.name, null,
    { fund, amount, issued_on: on, note: s(fd, 'note'), holder: holder.name });
  await notifyUser(holder.id, u.name + ' issued you an advance of ' + pkr(amount) + ' (' + FUNDS[fund] + ')', '/advances');
  await notifyRoles(['om'], u.name + ' issued ' + pkr(amount) + ' (' + FUNDS[fund] + ') to ' + holder.name, '/advances', u.id);
  back('/advances', 'Advance issued to ' + holder.name, true);
}

// Operations Manager corrects an advance issued to a Support Officer.
export async function editIssue(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const here = '/advances/edit?type=issue&id=' + id;
  const before = (await q(
    `SELECT i.id, i.fund, i.amount, i.returned, i.note, i.issued_to, to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on, COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0)::float8 AS spent FROM pc2_issues i WHERE i.id = $1`,
    [id]
  ))[0];
  if (!before) back('/advances', 'Advance not found');
  const amount = amt(fd);
  const on = s(fd, 'issued_on');
  if (!(amount > 0)) back(here, 'Enter a valid amount');
  if (badDate(on)) back(here, 'Pick a valid date');
  const floor = before.returned + Number(before.spent);
  if (amount < floor) back(here, 'Amount cannot be below what is already spent or returned (' + pkr(floor) + ')');
  if (amount > before.amount) {
    const row = (await fundSummary()).rows.find((r) => r.key === before.fund);
    if (amount - before.amount > row.pool) back(here, 'Not enough in ' + FUNDS[before.fund] + ' (available ' + pkr(row.pool) + ')');
  }
  const old = { amount: before.amount, issued_on: before.issued_on, note: before.note };
  const after = { amount, issued_on: on, note: s(fd, 'note') };
  const changes = diff(old, after);
  if (!changes.length) back('/advances', 'No changes were made', true);
  await q('UPDATE pc2_issues SET amount = $1, issued_on = $2, note = $3 WHERE id = $4', [amount, on, after.note, id]);
  await logEvent(u, 'edit', 'advance', id, 'Edited advance #' + id + ' - ' + changes.join('; '), old, after);
  await notifyUser(before.issued_to, u.name + ' updated your advance #' + id + ': ' + changes.join('; '), '/advances');
  back('/advances', 'Advance #' + id + ' updated', true);
}

// Unspent cash handed back by a Support Officer.
export async function recordReturn(fd) {
  const u = await need(['sso', 'om']);
  const id = Number(s(fd, 'issue_id'));
  const amount = amt(fd);
  const i = (await q(
    `SELECT i.amount - i.returned - COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0) AS remaining FROM pc2_issues i WHERE i.id = $1`,
    [id]
  ))[0];
  if (!i) back('/advances', 'Advance not found');
  if (!(amount > 0) || amount > Number(i.remaining)) back('/advances', 'Return must be between 1 and ' + pkr(i.remaining));
  await q('UPDATE pc2_issues SET returned = returned + $1 WHERE id = $2', [amount, id]);
  await logEvent(u, 'update', 'advance', id, 'Recorded cash returned on advance #' + id + ': ' + pkr(amount), null, { returned: amount });
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
  await logEvent(u, 'create', 'batch', b.id, 'Submitted batch #' + b.id + ' to Accounts: ' + rows.length + ' expenses, ' + pkr(total), null, { total, count: rows.length, note: s(fd, 'note') });
  await notifyRoles(['sso'], 'Batch #' + b.id + ' submitted to Accounts: ' + rows.length + ' expenses, ' + pkr(total), '/accounts', u.id);
  back('/accounts', 'Batch #' + b.id + ' submitted to Accounts', true);
}

export async function addUser(fd) {
  const u = await need(['om']);
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  const pw = s(fd, 'password');
  const role = s(fd, 'role');
  if (!name || !email.includes('@') || pw.length < 8 || !['sso', 'so'].includes(role)) back('/team', 'Enter name, valid email, role and a password of at least 8 characters');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back('/team', 'Pick an office');
  let failed = false;
  let newId = null;
  try {
    const r = await q(`INSERT INTO pc2_users (name, email, password_hash, role, office_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [name, email, bcrypt.hashSync(pw, 10), role, off.id]);
    newId = r[0].id;
  } catch {
    failed = true;
  }
  if (failed) back('/team', 'That email is already in use');
  await logEvent(u, 'create', 'user', newId, 'Added user ' + name + ' (' + role.toUpperCase() + ', ' + off.code + ') - ' + email, null, { name, email, role, office: off.code });
  back('/team', 'User added', true);
}

export async function resetPassword(fd) {
  const u = await need(['om']);
  const pw = s(fd, 'password');
  const id = Number(s(fd, 'id'));
  if (pw.length < 8) back('/team', 'Password must be at least 8 characters');
  const t = (await q('SELECT name, email FROM pc2_users WHERE id = $1', [id]))[0];
  await q('UPDATE pc2_users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(pw, 10), id]);
  await logEvent(u, 'update', 'user', id, 'Reset password for ' + (t ? t.name + ' (' + t.email + ')' : 'user #' + id));
  back('/team', 'Password updated', true);
}

export async function toggleUser(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  if (id === u.id) back('/team', 'You cannot deactivate your own account');
  const r = await q('UPDATE pc2_users SET active = NOT active WHERE id = $1 RETURNING name, active', [id]);
  if (r[0]) await logEvent(u, 'update', 'user', id, (r[0].active ? 'Activated ' : 'Deactivated ') + r[0].name);
  back('/team', 'User updated', true);
}

export async function readAll() {
  const u = await need();
  await q('UPDATE pc2_notifications SET is_read = TRUE WHERE user_id = $1', [u.id]);
  redirect('/notifications');
}

// Any signed-in user can update their own name and email.
export async function updateProfile(fd) {
  const u = await need();
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  if (!name || !email.includes('@')) back('/profile', 'Enter your name and a valid email');
  const before = { name: u.name, email: u.email };
  const after = { name, email };
  const changes = diff(before, after);
  if (!changes.length) back('/profile', 'No changes were made', true);
  let failed = false;
  try {
    await q('UPDATE pc2_users SET name = $1, email = $2 WHERE id = $3', [name, email, u.id]);
  } catch {
    failed = true;
  }
  if (failed) back('/profile', 'That email is already in use');
  await logEvent(u, 'edit', 'user', u.id, 'Updated own profile - ' + changes.join('; '), before, after);
  back('/profile', 'Profile updated', true);
}

// Any signed-in user can change their own password (current password required).
export async function changePassword(fd) {
  const u = await need();
  const current = s(fd, 'current');
  const next = s(fd, 'next');
  const again = s(fd, 'again');
  const row = (await q('SELECT password_hash FROM pc2_users WHERE id = $1', [u.id]))[0];
  if (!row || !bcrypt.compareSync(current, row.password_hash)) back('/profile', 'Your current password is not correct');
  if (next.length < 8) back('/profile', 'The new password must be at least 8 characters');
  if (next !== again) back('/profile', 'The two new passwords do not match');
  await q('UPDATE pc2_users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(next, 10), u.id]);
  await logEvent(u, 'update', 'user', u.id, 'Changed own password');
  back('/profile', 'Password changed', true);
}

// Operations Manager edits a team member name, email, role and office.
export async function editUser(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const here = '/team/edit?id=' + id;
  const before = (await q(
    `SELECT u.id, u.name, u.email, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.id = $1`,
    [id]
  ))[0];
  if (!before) back('/team', 'Team member not found');
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  if (!name || !email.includes('@')) back(here, 'Enter a name and a valid email');
  let role = before.role;
  if (before.role !== 'om') {
    role = s(fd, 'role');
    if (!['sso', 'so'].includes(role)) back(here, 'Pick a role');
  }
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back(here, 'Pick an office');
  const old = { name: before.name, email: before.email, role: before.role, office: before.office };
  const after = { name, email, role, office: off.code };
  const changes = diff(old, after);
  if (!changes.length) back('/team', 'No changes were made', true);
  let failed = false;
  try {
    await q('UPDATE pc2_users SET name = $1, email = $2, role = $3, office_id = $4 WHERE id = $5', [name, email, role, off.id, id]);
  } catch {
    failed = true;
  }
  if (failed) back(here, 'That email is already in use');
  await logEvent(u, 'edit', 'user', id, 'Edited team member #' + id + ' - ' + changes.join('; '), old, after);
  if (id !== u.id) await notifyUser(id, u.name + ' updated your profile: ' + changes.join('; '), '/profile');
  back('/team', 'Team member updated', true);
}
