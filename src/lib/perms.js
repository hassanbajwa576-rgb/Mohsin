// Attendance access that the Sr. Ops Manager can switch on for individual team members.
// Roles carry a default set; anything granted on top is stored per person (users.perms).
export const PERMS = [
  ['att_own', 'See the entries they have made', 'Shows the time of every entry this person added.'],
  ['att_view', "See everyone's attendance and times", "Today's board with check in, check out and break times."],
  ['att_reports', 'Attendance reports and Excel download', 'Reports page and the Excel / CSV downloads.'],
  ['att_logs', 'Attendance logs', 'Every entry of a day, with who added it.'],
  ['att_staff', 'Manage employees and Excel upload', 'Add, edit and upload the employee list.'],
  ['att_import', 'Import attendance from Excel', 'Fill in missing days from the weekly sheets, review the differences and correct times.'],
  ['fuel_use', 'FuelTrack: record fuel and top-ups', 'Shows FuelTrack. Mohsin and Imran see every card; for anyone else, which cards they see is set on the Fuel Setup page.'],
  ['vis_log', 'Visitor log and Excel download', 'See all visitors, filter them and download the visitor log (everyone can check visitors in and out).'],
  ['att_reconcile', 'Reconciliation', 'Run the check for long shifts, missing check outs and entries that do not fit, and mark them reviewed.'],
  ['guard_duty', 'Guard duty log', 'Record temporary guards (name, mobile, CNIC, card number, who they replace, duty dates, pictures) and see the guard duty list.'],
  ['tasks', 'My Tasks page', 'A page to record important tasks with due dates and priority. Each person sees their own tasks and tasks given to them. The Sr. Ops Manager can give tasks to others and follow them; the Sr. SO can do the same for Support Officers.'],
];

// Money and approval actions. Only the Sr. Ops Manager can do these by default; a role can be given any of them.
export const ACTION_PERMS = [
  ['exp_approve', 'Approve or reject expenses', 'Approve all, approve selected, and reject. Needs a role that sees both offices.'],
  ['exp_delete', 'Delete expenses', 'Delete any expense that has not been sent to Accounts, one by one or in bulk.'],
  ['adv_issue', 'Issue advances', 'Issue cash to team members and to advance-only team members.'],
  ['adv_return', 'Record cash returned on an advance', 'Record unspent cash handed back by the person the advance was issued to.'],
  ['adv_manage', 'Edit, move and delete advances', 'Correct the amount or date of an advance, move it to someone else, or remove it.'],
  ['acct_submit', 'Accounts: submit, receive and return', 'Send approved expenses to Accounts, record funds received from Accounts and cash returned to Accounts.'],
];

// What each built-in role can do today, so the built-in roles start out exactly as the app always worked.
export const DEFAULT_ACTIONS = {
  om: ['exp_approve', 'exp_delete', 'adv_issue', 'adv_return', 'adv_manage', 'acct_submit'],
  sso: ['adv_issue', 'adv_return', 'acct_submit'],
  so: [],
  guard: [],
};
export const ALL_PERMS = [...PERMS, ...ACTION_PERMS];

// What a new role can be based on: it behaves like this built-in role, then the checklist adds to it.
export const BASES = [
  ['sso', 'Sr. Support Officer - sees both offices, can add expenses and issue to Support Officers'],
  ['so', 'Support Officer - works from advances issued to them and sees only their own entries'],
  ['guard', 'Guard - attendance only'],
];

export const PERM_SHORT = {
  att_own: 'own entries',
  att_view: 'all times',
  att_reports: 'reports',
  att_logs: 'logs',
  att_staff: 'employees',
  att_import: 'import',
  att_reconcile: 'reconciliation',
  vis_log: 'visitor log',
  guard_duty: 'guard duty',
  tasks: 'my tasks',
  fuel_use: 'fuel cards',
  roster_edit: 'Support roster',
  exp_approve: 'approve expenses',
  exp_delete: 'delete expenses',
  adv_issue: 'issue advances',
  adv_return: 'record returns',
  adv_manage: 'edit advances',
  acct_submit: 'Accounts',
};

// What each role has without any extra grant.
export const ROLE_PERMS = {
  om: ['att_own', 'att_view', 'att_reports', 'att_logs', 'att_staff', 'att_import', 'att_reconcile', 'vis_log', 'roster_edit', 'fuel_use', 'guard_duty'],
  sso: ['att_own', 'att_view', 'att_reports', 'vis_log', 'roster_edit', 'fuel_use', 'guard_duty', 'tasks'],
  so: [],
  guard: ['guard_duty'],
};

// The permissions a role carries without any extra grant: the built-in role's own plus, for a created role, its checklist.
export function basePerms(role, rolePerms = []) {
  return [...(ROLE_PERMS[role] || []), ...rolePerms];
}

export function can(user, key) {
  if (!user) return false;
  if (user.role === 'om') return true;
  if ((ROLE_PERMS[user.role] || []).includes(key)) return true;
  return Array.isArray(user.perms) && user.perms.includes(key);
}
