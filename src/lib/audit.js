import 'server-only';
import { q } from './db';
import { FUNDS } from './fmt';

// Record one change in the audit log (who, when, what, before and after).
export async function logEvent(user, action, entity, entityId, summary, before = null, after = null) {
  await q(
    `INSERT INTO pc2_audit (actor_id, actor_name, actor_role, action, entity, entity_id, summary, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
    [
      user ? user.id : null,
      user ? user.name : 'System',
      user ? user.role : '',
      action,
      entity,
      entityId ?? null,
      summary,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ]
  );
}

const LABELS = {
  office: 'Office',
  fund: 'Fund',
  category: 'Category',
  description: 'Description',
  amount: 'Amount',
  spent_on: 'Date',
  received_on: 'Date',
  issued_on: 'Date',
  reference: 'Reference',
  note: 'Note',
  phone: 'Phone',
  shift: 'Shift',
  role: 'Role',
};

// Human-readable list of what changed between two snapshots.
export function diff(before, after) {
  const out = [];
  for (const k of Object.keys(after)) {
    const nice = (v) => (k === 'fund' && FUNDS[v] ? FUNDS[v] : String(v ?? ''));
    const a = nice(before[k]);
    const b = nice(after[k]);
    if (a !== b) out.push((LABELS[k] || k) + ': ' + (a || '-') + ' -> ' + (b || '-'));
  }
  return out;
}
