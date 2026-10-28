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
  ].filter(Boolean).join(', ');
  // The audit entry keeps what was removed, so nothing is lost for good.
  await logEvent(u, 'delete', 'expense', null, "Undid today's expense changes: " + summary, { batches: p.batches, removed: p.created, reversed: p.decided, edits: p.restore }, null);
  redirect('/accounts?ok=' + encodeURIComponent("Today's expense changes were undone: " + summary));
}
