// Attendance access that the Sr. Ops Manager can switch on for individual team members.
// Roles carry a default set; anything granted on top is stored per person (users.perms).
export const PERMS = [
  ['att_own', 'See the entries they have made', 'Shows the time of every entry this person added.'],
  ['att_view', "See everyone's attendance and times", "Today's board with check in, check out and break times."],
  ['att_reports', 'Attendance reports and Excel download', 'Reports page and the Excel / CSV downloads.'],
  ['att_logs', 'Attendance logs', 'Every entry of a day, with who added it.'],
  ['att_staff', 'Manage employees and Excel upload', 'Add, edit and upload the employee list.'],
  ['att_import', 'Import attendance from Excel', 'Fill in missing days from the weekly sheets, review the differences and correct times.'],
  ['roster_edit', 'Time-off roster: add and remove time off', 'Record who will be off and when; everyone can view the roster.'],
  ['vis_log', 'Visitor log and Excel download', 'See all visitors, filter them and download the visitor log (everyone can check visitors in and out).'],
  ['att_reconcile', 'Reconciliation', 'Run the check for long shifts, missing check outs and entries that do not fit, and mark them reviewed.'],
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
  roster_edit: 'roster',
};

// What each role has without any extra grant.
export const ROLE_PERMS = {
  om: ['att_own', 'att_view', 'att_reports', 'att_logs', 'att_staff', 'att_import', 'att_reconcile', 'vis_log', 'roster_edit'],
  sso: ['att_own', 'att_view', 'att_reports', 'vis_log', 'roster_edit'],
  so: [],
  guard: [],
};

export function can(user, key) {
  if (!user) return false;
  if ((ROLE_PERMS[user.role] || []).includes(key)) return true;
  return Array.isArray(user.perms) && user.perms.includes(key);
}
