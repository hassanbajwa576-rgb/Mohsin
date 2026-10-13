// Attendance access that the Sr. Ops Manager can switch on for individual team members.
// Roles carry a default set; anything granted on top is stored per person (users.perms).
export const PERMS = [
  ['att_own', 'See the entries they have made', 'Shows the time of every entry this person added.'],
  ['att_view', "See everyone's attendance and times", "Today's board with check in, check out and break times."],
  ['att_reports', 'Attendance reports and Excel download', 'Reports page and the Excel / CSV downloads.'],
  ['att_logs', 'Attendance logs', 'Every entry of a day, with who added it.'],
  ['att_staff', 'Manage employees and Excel upload', 'Add, edit and upload the employee list.'],
];

export const PERM_SHORT = {
  att_own: 'own entries',
  att_view: 'all times',
  att_reports: 'reports',
  att_logs: 'logs',
  att_staff: 'employees',
};

// What each role has without any extra grant.
export const ROLE_PERMS = {
  om: ['att_own', 'att_view', 'att_reports', 'att_logs', 'att_staff'],
  sso: ['att_own', 'att_view', 'att_reports'],
  so: [],
  guard: [],
};

export function can(user, key) {
  if (!user) return false;
  if ((ROLE_PERMS[user.role] || []).includes(key)) return true;
  return Array.isArray(user.perms) && user.perms.includes(key);
}
