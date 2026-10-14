'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { q } from './db';
import { getUser, startSession, endSession, startPending, getPending, clearPending, trustDevice, isTrusted, startImpersonation, stopImpersonation } from './auth';
import { cookies } from 'next/headers';
import { verifyTotp, newRecoveryCodes } from './totp';
import { FUNDS, CATEGORIES, pkr } from './fmt';
import { fundSummary, custodyFor } from './queries';
import { notifyRoles, notifyUser } from './notify';
import { logEvent, diff } from './audit';
import { PERMS, ROLE_PERMS } from './perms';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const amt = (fd) => Math.round(Number(s(fd, 'amount').replace(/,/g, '')));
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));
const dest = (v, d) => (['/', '/expenses', '/advances', '/accounts'].includes(v) ? v : d);

async function need(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  // Guards may only use the attendance actions (lib/att-actions.js), never the petty cash ones.
  if (u.role === 'guard') redirect('/attendance');
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
  const who = (s(fd, 'username') || s(fd, 'email')).toLowerCase();
  const pw = s(fd, 'password');
  const rows = await q('SELECT id, password_hash, totp_enabled, totp_epoch FROM pc2_users WHERE (lower(username) = $1 OR lower(email) = $1) AND active', [who]);
  if (!rows[0] || !bcrypt.compareSync(pw, rows[0].password_hash)) back('/login', 'Invalid username or password');
  const r = rows[0];
  // With the authenticator on, a device we do not know yet must enter a code first.
  if (r.totp_enabled && !(await isTrusted(r.id, r.totp_epoch))) {
    await startPending(r.id);
    redirect('/login/verify');
  }
  await startSession(r.id);
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
  await logEvent({ id: r[0].id, name, role: 'om' }, 'create', 'user', r[0].id, 'Sr. Ops Manager account created during setup: ' + email);
  await startSession(r[0].id);
  redirect('/');
}

// Anyone can add an expense; the Sr. Ops Manager is notified straight away.
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
    status = 'draft';
  } else {
    if (!FUNDS[fund]) back('/expenses', 'Pick a fund');
    status = u.role === 'om' ? 'approved' : 'submitted';
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
  if (u.role === 'so') await notifyRoles(['om', 'sso'], msg + ' (kept with them until submitted)', '/expenses?status=draft', u.id);
  else if (u.role === 'sso') await notifyRoles(['om'], msg, '/expenses?status=submitted', u.id);
  back('/expenses', u.role === 'so' ? 'Expense added. It stays with you until you submit your expenses to the Sr. SO or Sr. Ops Manager.' : 'Expense recorded', true);
}

// Sr. Ops Manager edits any expense that has not yet been sent to Accounts.
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

// The Sr. Ops Manager is the only reviewer: submitted expenses are approved or rejected here.
export async function decideExpense(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const approve = s(fd, 'decision') === 'approve';
  const note = s(fd, 'note');
  const to = dest(s(fd, 'back'), '/expenses');
  const row = (await q('SELECT id, status, amount, category, submitted_by FROM pc2_expenses WHERE id = $1', [id]))[0];
  if (!row) redirect(to);
  let next = null;
  if (row.status === 'submitted' || row.status === 'verified') next = approve ? 'approved' : 'rejected';
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

// The Sr. Ops Manager can delete any expense (including ones already sent to Accounts);
// others can only delete their own expense while it is still awaiting verification.
export async function deleteExpense(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const before = await expSnap(id);
  if (before) {
    // Delete is a manager action: only the Sr. Ops Manager, or a Support Officer retracting their
    // own expense that has not been verified yet. The Sr. Support Officer cannot delete entries.
    const allowed = u.role === 'om' || (u.role === 'so' && ['draft', 'submitted'].includes(before.status) && before.submitted_by === u.id);
    if (allowed) {
      const b = (await q('SELECT batch_id FROM pc2_expenses WHERE id = $1', [id]))[0];
      await q('DELETE FROM pc2_expenses WHERE id = $1', [id]);
      if (b && b.batch_id) {
        await q('UPDATE pc2_batches SET total = GREATEST(total - $1, 0), item_count = GREATEST(item_count - 1, 0) WHERE id = $2', [before.amount, b.batch_id]);
      }
      await logEvent(u, 'delete', 'expense', id, 'Deleted expense #' + id + ': ' + pkr(before.amount) + ' - ' + before.category + (b && b.batch_id ? ' (was in batch #' + b.batch_id + ')' : ''), expView(before), null);
      if (before.submitted_by !== u.id) {
        await notifyUser(before.submitted_by, u.name + ' deleted your expense #' + id + ' (' + pkr(before.amount) + ' - ' + before.category + ')', '/expenses');
      }
    }
  }
  redirect(dest(s(fd, 'back'), '/expenses'));
}

// Sr. Ops Manager removes an advance issued to a team member (only if nothing was spent on it).
export async function deleteIssue(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const before = (await q(
    `SELECT i.id, i.fund, i.amount, i.returned, i.issued_to, u.name AS holder, (SELECT COUNT(*)::int FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected') AS live FROM pc2_issues i JOIN pc2_users u ON u.id = i.issued_to WHERE i.id = $1`,
    [id]
  ))[0];
  if (!before) back('/advances', 'Advance not found');
  if (before.live > 0) back('/advances', 'Advance #' + id + ' has ' + before.live + ' expense(s) recorded against it. Delete or reject those first.');
  await q(`DELETE FROM pc2_expenses WHERE issue_id = $1 AND status = 'rejected'`, [id]);
  await q('DELETE FROM pc2_issues WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'advance', id, 'Deleted advance #' + id + ' of ' + pkr(before.amount) + ' (' + FUNDS[before.fund] + ') issued to ' + before.holder, { fund: before.fund, amount: before.amount, holder: before.holder }, null);
  await notifyUser(before.issued_to, u.name + ' removed advance #' + id + ' (' + pkr(before.amount) + ')', '/advances');
  back('/advances', 'Advance #' + id + ' deleted', true);
}

// Funds received from the Accounts team (Petty, BRC, Others) - Sr. Ops Manager only.
export async function addAdvance(fd) {
  const u = await need(['om', 'sso']);
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
  await notifyRoles(u.role === 'om' ? ['sso'] : ['om'], (u.role === 'om' ? 'Funds received from Accounts: ' : u.name + ' recorded funds received from Accounts: ') + pkr(amount) + ' (' + FUNDS[fund] + ')', '/advances', u.id);
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

// Sr. SO issues cash from a petty fund to a Support Officer.
export async function issueAdvance(fd) {
  const u = await need(['sso', 'om']);
  const holderId = Number(s(fd, 'issued_to'));
  const fund = s(fd, 'fund');
  const amount = amt(fd);
  const on = s(fd, 'issued_on');
  if (!(amount > 0) || !FUNDS[fund]) back('/advances', 'Enter a valid fund and amount');
  if (badDate(on)) back('/advances', 'Pick a valid date');
  // The Sr. Ops Manager can issue to the Sr. SO or an SO; the Sr. SO can issue to an SO from cash they hold.
  const allowed = u.role === 'om' ? ['so', 'sso'] : ['so'];
  const holder = (await q(`SELECT id, name, role FROM pc2_users WHERE id = $1 AND role = ANY($2::text[]) AND active`, [holderId, allowed]))[0];
  if (!holder) back('/advances', 'Pick a team member to issue to');
  // Both the Sr. Ops Manager and the Sr. SO can issue to a Support Officer: the Sr. SO draws on
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

// Sr. Ops Manager corrects an advance issued to a Support Officer.
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

// A Support Officer hands their expenses to the Sr. SO / Sr. Ops Manager (never to Accounts).
// Only now do the expenses count against the advance they hold.
export async function submitDrafts() {
  const u = await need(['so']);
  const rows = await q(`UPDATE pc2_expenses SET status = 'submitted' WHERE submitted_by = $1 AND status = 'draft' RETURNING id, amount`, [u.id]);
  if (!rows.length) back('/', 'You have no expenses waiting to be submitted');
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  await logEvent(u, 'update', 'expense', null, 'Submitted ' + rows.length + ' expenses (' + pkr(total) + ') for adjustment to the Sr. SO / Sr. Ops Manager', null, { ids: rows.map((r) => r.id), total });
  await notifyRoles(['sso', 'om'], u.name + ' submitted ' + rows.length + ' expenses (' + pkr(total) + ') for adjustment', '/expenses?status=submitted', u.id);
  back('/', 'Submitted ' + rows.length + ' expenses (' + pkr(total) + ') to the Sr. SO and Sr. Ops Manager', true);
}

// Only the Sr. Ops Manager or the Sr. Support Officer can submit to Accounts.
// Support Officers can never do this.
export async function submitToAccounts(fd) {
  const u = await need(['om', 'sso']);
  const rows = await q(`SELECT id, amount FROM pc2_expenses WHERE status = 'approved' AND batch_id IS NULL`);
  if (!rows.length) back('/accounts', 'No verified expenses to submit');
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const b = (await q(
    `INSERT INTO pc2_batches (created_by, note, total, item_count) VALUES ($1,$2,$3,$4) RETURNING id`,
    [u.id, s(fd, 'note'), total, rows.length]
  ))[0];
  await q(`UPDATE pc2_expenses SET status = 'sent', batch_id = $1 WHERE status = 'approved' AND batch_id IS NULL`, [b.id]);
  await logEvent(u, 'create', 'batch', b.id, 'Submitted batch #' + b.id + ' to Accounts: ' + rows.length + ' expenses, ' + pkr(total), null, { total, count: rows.length, note: s(fd, 'note') });
  await notifyRoles(u.role === 'om' ? ['sso'] : ['om'], u.name + ' submitted batch #' + b.id + ' to Accounts: ' + rows.length + ' expenses, ' + pkr(total), '/accounts', u.id);
  back('/accounts', 'Batch #' + b.id + ' submitted to Accounts', true);
}

export async function addUser(fd) {
  const u = await need(['om']);
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  const username = s(fd, 'username').toLowerCase();
  const pw = s(fd, 'password');
  const role = s(fd, 'role');
  if (!name || !email.includes('@') || pw.length < 8 || !['sso', 'so', 'guard'].includes(role)) back('/team', 'Enter name, valid email, role and a password of at least 8 characters');
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) back('/team', 'Username must be 3 to 20 letters, numbers, dot, dash or underscore, with no spaces');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back('/team', 'Pick an office');
  const phone = s(fd, 'phone');
  const shift = role === 'guard' && ['morning', 'evening'].includes(s(fd, 'shift')) ? s(fd, 'shift') : '';
  let failed = false;
  let newId = null;
  try {
    const r = await q(`INSERT INTO pc2_users (name, email, password_hash, role, office_id, phone, shift, username) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [name, email, bcrypt.hashSync(pw, 10), role, off.id, phone, shift, username]);
    newId = r[0].id;
  } catch {
    failed = true;
  }
  if (failed) back('/team', 'That email or username is already in use');
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
  if (t) {
    // Close the open request and tell the person it is done.
    await q('UPDATE pc2_notifications SET is_read = TRUE WHERE message = $1', ['Password reset requested by ' + t.name + ' (' + t.email + ')']);
    await notifyUser(id, 'The Sr. Ops Manager has reset your password. Sign in with the new password you were given.', '/');
  }
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
  if (u.impersonatedBy) back('/profile', 'Not available while viewing as someone else');
  // The Sr. Support Officer's details are managed by the Sr. Ops Manager.
  if (u.role === 'sso') back('/profile', 'Your details are managed by the Sr. Ops Manager');
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
  // Passwords of the Sr. SO and Support Officers are managed by the Sr. Ops Manager (Team page).
  if (u.role !== 'om') back('/profile', 'Your password is managed by the Sr. Ops Manager');
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

// Sr. Ops Manager edits a team member name, email, role and office.
export async function editUser(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const here = '/team/edit?id=' + id;
  const before = (await q(
    `SELECT u.id, u.name, u.email, u.username, u.role, u.phone, u.shift, u.perms, u.totp_required, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.id = $1`,
    [id]
  ))[0];
  if (!before) back('/team', 'Team member not found');
  const name = s(fd, 'name');
  const email = s(fd, 'email').toLowerCase();
  const username = s(fd, 'username').toLowerCase();
  if (!name || !email.includes('@')) back(here, 'Enter a name and a valid email');
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) back(here, 'Username must be 3 to 20 letters, numbers, dot, dash or underscore, with no spaces');
  let role = before.role;
  if (before.role !== 'om') {
    role = s(fd, 'role');
    if (!['sso', 'so', 'guard'].includes(role)) back(here, 'Pick a role');
  }
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!off) back(here, 'Pick an office');
  const phone = s(fd, 'phone');
  const shift = role === 'guard' && ['morning', 'evening'].includes(s(fd, 'shift')) ? s(fd, 'shift') : '';
  // Extra attendance access ticked on the form (what the role already includes is not stored).
  const roleBase = ROLE_PERMS[role] || [];
  const permsStr = PERMS.map(([k]) => k).filter((k) => fd.get('perm_' + k) === 'on' && !roleBase.includes(k)).join(',');
  const old = { name: before.name, email: before.email, username: before.username || '', role: before.role, office: before.office, phone: before.phone, shift: before.shift, perms: before.perms || '', authenticator: before.totp_required ? 'required' : 'optional' };
  const reqTotp = role !== 'om' && fd.get('require_totp') === 'on';
  const after = { name, email, username, role, office: off.code, phone, shift, perms: permsStr, authenticator: reqTotp ? 'required' : 'optional' };
  const changes = diff(old, after);
  if (!changes.length) back('/team', 'No changes were made', true);
  let failed = false;
  try {
    await q('UPDATE pc2_users SET name = $1, email = $2, role = $3, office_id = $4, phone = $5, shift = $6, perms = $7, totp_required = $8, username = $9 WHERE id = $10', [name, email, role, off.id, phone, shift, permsStr, reqTotp, username, id]);
  } catch {
    failed = true;
  }
  if (failed) back(here, 'That email or username is already in use');
  await logEvent(u, 'edit', 'user', id, 'Edited team member #' + id + ' - ' + changes.join('; '), old, after);
  if (id !== u.id) await notifyUser(id, u.name + ' updated your profile: ' + changes.join('; '), '/profile');
  back('/team', 'Team member updated', true);
}

// Second sign-in step on a device that is not trusted yet: authenticator code or a recovery code.
export async function verifyLogin(fd) {
  const uid = await getPending();
  if (!uid) back('/login', 'Your sign-in timed out. Please sign in again.');
  const row = (await q(
    'SELECT id, totp_secret, totp_enabled, totp_epoch, totp_recovery, (totp_locked_until IS NOT NULL AND totp_locked_until > now()) AS locked FROM pc2_users WHERE id = $1 AND active',
    [uid]
  ))[0];
  if (!row || !row.totp_enabled) back('/login', 'Please sign in again.');
  if (row.locked) back('/login/verify', 'Too many wrong codes. Try again in 15 minutes.');

  const code = s(fd, 'code');
  let ok = verifyTotp(row.totp_secret, code);
  let usedRecovery = false;
  if (!ok && row.totp_recovery) {
    const list = row.totp_recovery.split(',').filter(Boolean);
    const norm = code.toLowerCase().split(' ').join('').split('-').join('');
    const i = norm.length === 10 ? list.findIndex((h) => bcrypt.compareSync(norm, h)) : -1;
    if (i >= 0) {
      list.splice(i, 1);
      await q('UPDATE pc2_users SET totp_recovery = $1 WHERE id = $2', [list.join(','), uid]);
      ok = true;
      usedRecovery = true;
    }
  }
  if (!ok) {
    await q("UPDATE pc2_users SET totp_fails = totp_fails + 1, totp_locked_until = CASE WHEN totp_fails + 1 >= 5 THEN now() + interval '15 minutes' ELSE totp_locked_until END WHERE id = $1", [uid]);
    back('/login/verify', 'That code is not correct');
  }
  await q('UPDATE pc2_users SET totp_fails = 0, totp_locked_until = NULL WHERE id = $1', [uid]);
  await clearPending();
  if (s(fd, 'remember') === 'on') await trustDevice(uid, row.totp_epoch);
  await startSession(uid);
  if (usedRecovery) await logEvent({ id: uid, name: 'User #' + uid, role: '' }, 'update', 'user', uid, 'Signed in with a recovery code');
  redirect('/');
}

// Turn the authenticator on after scanning the QR code and typing the first code.
export async function confirmSetup(fd) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.impersonatedBy) back('/security', 'Not available while viewing as someone else');
  const row = (await q('SELECT totp_secret, totp_enabled, totp_epoch FROM pc2_users WHERE id = $1', [u.id]))[0];
  if (row.totp_enabled) back('/security', 'The authenticator app is already on', true);
  if (!verifyTotp(row.totp_secret, s(fd, 'code'))) back('/security', 'That code is not correct. Check that the time on your phone is automatic, then try again.');
  const codes = newRecoveryCodes(8);
  const hashes = codes.map((c) => bcrypt.hashSync(c.split('-').join(''), 8));
  await q('UPDATE pc2_users SET totp_enabled = TRUE, totp_recovery = $1, totp_fails = 0, totp_locked_until = NULL WHERE id = $2', [hashes.join(','), u.id]);
  await trustDevice(u.id, row.totp_epoch);
  const jar = await cookies();
  jar.set('pc_rc', codes.join(' '), { httpOnly: true, secure: true, sameSite: 'lax', path: '/security', maxAge: 180 });
  await logEvent(u, 'update', 'user', u.id, 'Turned on the authenticator app');
  back('/security', 'Authenticator app is on', true);
}

// Turn it off again (not allowed while the Sr. Ops Manager requires it). Needs a current code.
export async function disableTotp(fd) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.impersonatedBy) back('/security', 'Not available while viewing as someone else');
  const row = (await q('SELECT totp_secret, totp_enabled, totp_required FROM pc2_users WHERE id = $1', [u.id]))[0];
  if (row.totp_required) back('/security', 'The Sr. Ops Manager requires the authenticator app for your account');
  if (!row.totp_enabled) back('/security', 'It is already off', true);
  if (!verifyTotp(row.totp_secret, s(fd, 'code'))) back('/security', 'That code is not correct');
  await q("UPDATE pc2_users SET totp_enabled = FALSE, totp_secret = '', totp_recovery = '', totp_epoch = totp_epoch + 1 WHERE id = $1", [u.id]);
  await logEvent(u, 'update', 'user', u.id, 'Turned off the authenticator app');
  back('/security', 'Authenticator app is off', true);
}

// Sr. Ops Manager: clear someone's authenticator (lost phone). They set it up again at next sign-in.
export async function resetTotp(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const t = (await q('SELECT name FROM pc2_users WHERE id = $1', [id]))[0];
  if (!t) back('/team', 'Team member not found');
  await q("UPDATE pc2_users SET totp_enabled = FALSE, totp_secret = '', totp_recovery = '', totp_epoch = totp_epoch + 1, totp_fails = 0, totp_locked_until = NULL WHERE id = $1", [id]);
  await logEvent(u, 'update', 'user', id, 'Reset the authenticator app for ' + t.name);
  back('/team/edit?id=' + id, 'Authenticator reset for ' + t.name, true);
}

// Login page "Forgot password?": nobody resets their own password, so this only asks the Sr. Ops Manager.
export async function requestReset(fd) {
  const email = (s(fd, 'username') || s(fd, 'email')).toLowerCase();
  const done = 'If that username is on the team, the Sr. Ops Manager has been notified and will give you a new password.';
  const r = (await q('SELECT id, name, email FROM pc2_users WHERE (lower(username) = $1 OR lower(email) = $1) AND active', [email]))[0];
  if (r) {
    const msg = 'Password reset requested by ' + r.name + ' (' + r.email + ')';
    // One open request per person per hour, so the form cannot be used to flood notifications.
    const open = await q("SELECT 1 FROM pc2_notifications WHERE message = $1 AND created_at > now() - interval '1 hour' LIMIT 1", [msg]);
    if (!open[0]) {
      await notifyRoles(['om'], msg, '/team', r.id);
      await notifyUser(r.id, 'Your password reset request has been sent to the Sr. Ops Manager.', '/');
    }
  }
  back('/login', done, true);
}

// Sr. Ops Manager only: open someone's account without their password or code. Silent, logged, 30 minutes.
export async function viewAs(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  if (id === u.id) back('/team', 'That is your own account');
  const t = (await q('SELECT id, name, role FROM pc2_users WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!t || t.role === 'om') back('/team', 'That account cannot be opened this way');
  await startImpersonation(u.id, t.id);
  await logEvent(u, 'update', 'user', t.id, 'Signed in as ' + t.name + ' (view as)');
  redirect(t.role === 'guard' ? '/attendance' : '/');
}

export async function stopViewAs() {
  const u = await getUser();
  await stopImpersonation();
  if (u && u.impersonatedBy) {
    await logEvent({ id: u.impersonatedBy.id, name: u.impersonatedBy.name, role: 'om' }, 'update', 'user', u.id, 'Returned to own account from ' + u.name + ' (view as)');
  }
  redirect('/team');
}

// Cash handed back to Accounts. The Sr. OM returns from the pool, the Sr. SO from the cash they hold.
export async function returnToAccounts(fd) {
  const u = await need(['om', 'sso']);
  const fund = s(fd, 'fund');
  const amount = amt(fd);
  const on = s(fd, 'returned_on');
  if (!FUNDS[fund]) back('/advances', 'Pick a fund');
  if (!Number.isInteger(amount) || amount <= 0) back('/advances', 'Enter the amount returned');
  if (badDate(on)) back('/advances', 'Choose a valid date');
  const held = u.role === 'om' ? (await fundSummary()).rows.find((r) => r.key === fund).pool : await custodyFor(u.id, fund);
  if (amount > held) back('/advances', 'You hold only ' + pkr(Math.max(0, held)) + ' of ' + FUNDS[fund] + ' to return');
  const reference = s(fd, 'reference');
  const note = s(fd, 'note');
  const r = await q('INSERT INTO pc2_returns (fund, amount, returned_on, reference, note, returned_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [fund, amount, on, reference, note, u.id]);
  await logEvent(u, 'create', 'return', r[0].id, 'Returned ' + pkr(amount) + ' (' + FUNDS[fund] + ') to Accounts' + (reference ? ' - ' + reference : ''), null, { fund, amount, returned_on: on, reference, note });
  if (u.role !== 'om') await notifyRoles(['om'], u.name + ' returned ' + pkr(amount) + ' (' + FUNDS[fund] + ') to Accounts', '/advances', u.id);
  back('/advances', pkr(amount) + ' returned to Accounts', true);
}

export async function deleteReturn(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const r = (await q('DELETE FROM pc2_returns WHERE id = $1 RETURNING fund, amount, returned_on', [Number.isInteger(id) ? id : 0]))[0];
  if (r) await logEvent(u, 'delete', 'return', id, 'Removed return of ' + pkr(r.amount) + ' (' + FUNDS[r.fund] + ') to Accounts', { fund: r.fund, amount: r.amount }, null);
  back('/advances', 'Return removed', true);
}

// Several expenses pasted from Excel in one go. Same rules as adding one expense at a time.
export async function addExpensesBulk(fd) {
  const u = await need();
  const spentOn = s(fd, 'spent_on');
  if (badDate(spentOn)) back('/expenses', 'Pick a valid date');
  let rows = [];
  try {
    rows = JSON.parse(s(fd, 'rows') || '[]');
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows) || rows.length === 0) back('/expenses', 'Paste at least one row first');
  if (rows.length > 200) back('/expenses', 'Please paste at most 200 rows at a time');
  const clean = [];
  for (const r of rows) {
    const amount = Math.round(Number(r && r.a));
    const category = String((r && r.c) || '');
    const description = String((r && r.d) || '').trim().slice(0, 200);
    const on = r && r.on && !badDate(String(r.on)) ? String(r.on) : spentOn;
    if (!(amount > 0) || !CATEGORIES.includes(category)) back('/expenses', 'Every row needs an amount above zero and a category. Check the preview.');
    clean.push({ amount, category, description, on });
  }
  const total = clean.reduce((a, r) => a + r.amount, 0);

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
    if (total > Number(i.remaining)) back('/expenses', 'These rows total ' + pkr(total) + ', more than your cash in hand (' + pkr(i.remaining) + ')');
    fund = i.fund;
    issueId = i.id;
    status = 'draft';
  } else {
    if (!FUNDS[fund]) back('/expenses', 'Pick a fund');
    status = u.role === 'om' ? 'approved' : 'submitted';
    if (u.role === 'om') {
      const o = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
      if (o) {
        officeId = o.id;
        officeCode = o.code;
      }
    }
  }

  const decided = u.role === 'om';
  const when = decided ? new Date().toISOString() : null;
  const vals = [];
  const params = [];
  for (const r of clean) {
    const b = params.length;
    params.push(officeId, fund, r.category, r.description, r.amount, r.on, status, u.id, issueId, decided ? u.id : null, when);
    vals.push('(' + Array.from({ length: 11 }, (_, k) => '$' + (b + k + 1)).join(',') + ')');
  }
  await q(`INSERT INTO pc2_expenses (office_id, fund, category, description, amount, spent_on, status, submitted_by, issue_id, decided_by, decided_at) VALUES ${vals.join(',')}`, params);
  await logEvent(u, 'create', 'expense', null, 'Added ' + clean.length + ' expenses from Excel totalling ' + pkr(total) + ' (' + officeCode + ', ' + FUNDS[fund] + ')', null,
    { count: clean.length, total, office: officeCode, fund, status });

  const msg = u.name + ' added ' + clean.length + ' expenses from Excel totalling ' + pkr(total);
  if (u.role === 'so') await notifyRoles(['om', 'sso'], msg + ' (kept with them until submitted)', '/expenses?status=draft', u.id);
  else if (u.role === 'sso') await notifyRoles(['om'], msg, '/expenses?status=submitted', u.id);
  back('/expenses', clean.length + ' expenses added (' + pkr(total) + ')' + (u.role === 'so' ? '. They stay with you until you submit your expenses.' : ''), true);
}

// Sr. Ops Manager approves every expense in the list currently shown (only those awaiting review).
export async function approveAll(fd) {
  const u = await need(['om']);
  const ids = s(fd, 'ids').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);
  if (!ids.length) back('/expenses', 'Nothing to approve');
  const done = await q(
    `UPDATE pc2_expenses SET status = 'approved', decided_by = $1, decided_at = now() WHERE id = ANY($2::int[]) AND status IN ('submitted', 'verified') RETURNING id, amount, submitted_by`,
    [u.id, ids]
  );
  if (!done.length) back('/expenses', 'Nothing was waiting for approval');
  const total = done.reduce((a, d) => a + Number(d.amount), 0);
  await logEvent(u, 'decision', 'expense', null, 'Approved ' + done.length + ' expenses together (' + pkr(total) + '): #' + done.map((d) => d.id).join(', #'), { status: 'submitted' }, { status: 'approved' });
  const by = {};
  done.forEach((d) => {
    by[d.submitted_by] = (by[d.submitted_by] || 0) + Number(d.amount);
  });
  for (const [uid, sum] of Object.entries(by)) {
    if (Number(uid) !== u.id) await notifyUser(Number(uid), u.name + ' approved your expenses totalling ' + pkr(sum), '/expenses');
  }
  back('/expenses', done.length + ' expenses approved (' + pkr(total) + '). Submit them to Accounts from the Accounts page.', true);
}
