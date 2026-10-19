export const FUNDS = { petty: 'Petty Cash', brc: 'BRC', other: 'Others' };
export const CATEGORIES = ['Tea & Refreshments', 'Stationery', 'Utilities', 'Cleaning & Maintenance', 'Courier & Postage', 'Transport & Fuel', 'Repairs', 'Printing', 'Staff Welfare', 'Other'];
export const ROLE_LABEL = { om: 'Sr. Ops Manager', sso: 'Sr. SO', so: 'Support Officer', guard: 'Security Guard' };
export const STATUS_LABEL = {
  draft: 'Not yet submitted',
  submitted: 'Awaiting SOM review',
  approved: 'Ready for Accounts',
  sent: 'Sent to Accounts',
  rejected: 'Rejected',
};
export const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');
export const today = () => new Date().toISOString().slice(0, 10);

// Parts of one expense that was paid from several advances show as a single line (amounts added, every part id kept).
export function mergeSplits(rows) {
  const out = [];
  const at = new Map();
  for (const r of rows) {
    if (r.ids || !r.split_group) {
      out.push(r);
      continue;
    }
    const k = r.split_group + '|' + r.status;
    const i = at.get(k);
    if (i === undefined) {
      at.set(k, out.length);
      out.push({ ...r, ids: [r.id], amount: Number(r.amount) });
    } else {
      out[i].ids.push(r.id);
      out[i].amount += Number(r.amount);
    }
  }
  return out;
}
