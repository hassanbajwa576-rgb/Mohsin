'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { todayPlan } from './undo-today';

// Sr. Ops Manager: put today's expense changes back as they were. The plan is worked out again here, never taken from the screen.
export async function undoToday() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (u.role !== 'om' || u.impersonatedBy) redirect('/accounts');
  const p = await todayPlan(u.id);
  if (p.empty) redirect('/accounts/undo?err=' + encodeURIComponent('Nothing from today to undo'));

  // 0. expenses deleted today come back, as they were, for the person who added them
  for (const r of p.bring) {
    const off = (await q('SELECT id FROM pc2_offices WHERE code = $1', [r.office]))[0];
    if (!off) continue;
    await q(
      'INSERT INTO pc2_expenses (id, office_id, fund, category, description, amount, spent_on, status, submitted_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, now())) ON CONFLICT (id) DO NOTHING',
      [r.id, off.id, r.fund, r.category, r.description || '', Math.round(Number(r.amount)), r.spent_on, r.status === 'sent' ? 'approved' : r.status || 'submitted', r.creator_id, r.made_at || null]
    );
  }
  // 1. edits go back to their earlier values
  for (const r of p.restore) {
    const b = r.before;
    const off = b.office ? (await q('SELECT id FROM pc2_offices WHERE code = $1', [b.office]))[0] : null;
    await q(
      'UPDATE pc2_expenses SET office_id = COALESCE($1, office_id), fund = COALESCE($2, fund), category = COALESCE($3, category), description = COALESCE($4, description), amount = COALESCE($5, amount), spent_on = COALESCE($6::date, spent_on) WHERE id = $7',
      [off ? off.id : null, b.fund ?? null, b.category ?? null, b.description ?? null, b.amount ?? null, b.spent_on ?? null, r.id]
    );
  }
  // 2. batches sent to Accounts today are taken apart; their expenses are ready to submit again
  const batchIds = p.batches.map((b) => b.id);
  if (batchIds.length) {
    await q("UPDATE pc2_expenses SET status = 'approved', batch_id = NULL WHERE batch_id = ANY($1::int[])", [batchIds]);
    await q('DELETE FROM pc2_batches WHERE id = ANY($1::int[])', [batchIds]);
  }
  // 3. approvals and rejections made today go back to waiting for review
  const decidedIds = p.decided.map((r) => r.id);
  if (decidedIds.length) {
    await q("UPDATE pc2_expenses SET status = 'submitted', decided_by = NULL, decided_at = NULL, decision_note = '', batch_id = NULL WHERE id = ANY($1::int[])", [decidedIds]);
  }
  // 4. expenses added today are removed
  const createdIds = p.created.map((r) => r.id);
  if (createdIds.length) {
    await q('UPDATE pc2_expenses SET batch_id = NULL WHERE id = ANY($1::int[])', [createdIds]);
    await q('DELETE FROM pc2_expenses WHERE id = ANY($1::int[])', [createdIds]);
  }
  const summary = [
    batchIds.length ? batchIds.length + ' batch(es) taken back from Accounts' : '',
    decidedIds.length ? decidedIds.length + ' decision(s) reversed' : '',
    createdIds.length ? createdIds.length + ' added expense(s) removed' : '',
    p.restore.length ? p.restore.length + ' edit(s) reverted' : '',
    p.bring.length ? p.bring.length + ' deleted expense(s) brought back' : '',
  ].filter(Boolean).join(', ');
  // The audit entry keeps what was removed, so nothing is lost for good.
  await logEvent(u, 'delete', 'expense', null, "Undid today's expense changes: " + summary, { batches: p.batches, removed: p.created, reversed: p.decided, edits: p.restore, restored: p.bring.map((r) => r.id) }, null);
  redirect('/accounts?ok=' + encodeURIComponent("Today's expense changes were undone: " + summary));
}

// Sr. Ops Manager: join expenses that are ready for Accounts into one entry. Each keeps its own amount and advance; they are linked
// so every screen shows them as a single expense.
export async function mergeExpenses(fd) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (u.role !== 'om' || u.impersonatedBy) redirect('/accounts');
  const fail = (m) => redirect('/accounts?err=' + encodeURIComponent(m));
  const ids = String(fd.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length < 2) fail('Tick at least two expenses to merge');
  const rows = await q("SELECT id, fund, office_id, submitted_by, category, spent_on::text AS d, amount::float8 AS amount, split_group FROM pc2_expenses WHERE id = ANY($1::int[]) AND status = 'approved' AND batch_id IS NULL ORDER BY id", [ids]);
  if (rows.length !== ids.length) fail('Only expenses that are ready for Accounts can be merged');
  if (rows.some((r) => r.split_group)) fail('One of these is already part of a joined entry');
  const same = (k) => rows.every((r) => r[k] === rows[0][k]);
  if (!same('fund') || !same('office_id') || !same('submitted_by') || !same('category')) fail('Only expenses with the same person, office, fund and category can be merged');
  const group = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  for (let k = 0; k < rows.length; k++) {
    await q('UPDATE pc2_expenses SET split_group = $1, split_part = $2, split_total = $3 WHERE id = $4', [group, k + 1, rows.length, rows[k].id]);
  }
  const total = rows.reduce((a, r) => a + r.amount, 0);
  await logEvent(u, 'edit', 'expense', null, 'Merged expenses #' + rows.map((r) => r.id).join(' + #') + ' into one entry of PKR ' + Math.round(total).toLocaleString('en-US'), null, { ids: rows.map((r) => r.id), total });
  redirect('/accounts?ok=' + encodeURIComponent('Merged into one entry of PKR ' + Math.round(total).toLocaleString('en-US')));
}
