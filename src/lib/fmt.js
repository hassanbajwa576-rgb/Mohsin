export const FUNDS = { petty: 'Petty Cash', brc: 'BRC', other: 'Others' };
export const CATEGORIES = ['Tea & Refreshments', 'Stationery', 'Utilities', 'Cleaning & Maintenance', 'Courier & Postage', 'Transport & Fuel', 'Repairs', 'Printing', 'Staff Welfare', 'Other'];
export const ROLE_LABEL = { om: 'Sr. Ops Manager', sso: 'Sr. Support Officer', so: 'Support Officer' };
export const STATUS_LABEL = {
  draft: 'Not yet submitted',
  submitted: 'Awaiting SOM review',
  approved: 'Ready for Accounts',
  sent: 'Sent to Accounts',
  rejected: 'Rejected',
};
export const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');
export const today = () => new Date().toISOString().slice(0, 10);
