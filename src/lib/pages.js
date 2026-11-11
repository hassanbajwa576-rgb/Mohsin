export const PAGE_GROUPS = [
  { key: 'petty', label: 'Petty', pages: [['/', 'Dashboard'], ['/expenses', 'Expenses'], ['/advances', 'Advances'], ['/accounts', 'Accounts']] },
  { key: 'attendance', label: 'Attendance', pages: [['/attendance', 'Add Entry'], ['/attendance/entries', 'Entries'], ['/attendance/logs', 'Day log'], ['/attendance/board', "Today's board"], ['/attendance/dashboard', 'Dashboard'], ['/attendance/reports', 'Reports'], ['/attendance/analysis', 'Analysis'], ['/attendance/staff', 'Employees'], ['/attendance/hk-roster', 'Teams'], ['/attendance/hk-roster/request', 'Time Off Request'], ['/attendance/import', 'Import'], ['/attendance/reconcile', 'Reconciliation']] },
  { key: 'visitors', label: 'Guest and Hire', pages: [['/visitors', 'Visitor Entry'], ['/visitors/log', 'Visitor Log'], ['/visitors/guards', 'Guard Duty'], ['/visitors/hires', 'New Hires']] },
  { key: 'fuel', label: 'Fuel', pages: [['/fuel', 'Fuel Entry'], ['/fuel/log', 'Fuel Log'], ['/fuel/setup', 'Setup']] },
  { key: 'support', label: 'Complaints', pages: [['/support', 'Dashboard'], ['/support/new', 'Record Complaint'], ['/support/list', 'All Complaints'], ['/support/people', 'By Person']] },
  { key: 'exprev', label: 'ExpRev', pages: [['/exprev', 'Dashboard'], ['/exprev/entries', 'Expenditures'], ['/exprev/budget', 'Budget vs Actual'], ['/exprev/analysis', 'Analysis'], ['/exprev/import', 'Import']] },
  { key: 'general', label: 'Manager pages', pages: [['/approvals', 'Approvals'], ['/team', 'Team'], ['/logs', 'Audit log'], ['/tasks', 'Tasks'], ['/guide', 'Guide']] },
];
export const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages.map(([h]) => h));

// A page that also needs one of the attendance / visitor / fuel permissions to show its data.
export const PAGE_NEEDS = {
  '/attendance/logs': 'att_logs',
  '/attendance/board': 'att_view',
  '/attendance/dashboard': 'att_view',
  '/attendance/reports': 'att_reports',
  '/attendance/analysis': 'att_reports',
  '/attendance/staff': 'att_staff',
  '/attendance/import': 'att_import',
  '/attendance/reconcile': 'att_reconcile',
  '/visitors/log': 'vis_log',
  '/visitors/guards': 'guard_duty',
  '/visitors/hires': 'hire_view',
  '/tasks': 'tasks',
  '/fuel': 'fuel_use',
  '/fuel/log': 'fuel_use',
  '/fuel/setup': 'fuel_use',
};

// Pages a person gets from their role and extra permissions when nobody has picked pages for them.
export function defaultPages(role, perms = [], rolePerms = {}) {
  const can = (k) => (rolePerms[role] || []).includes(k) || perms.includes(k);
  const om = role === 'om';
  const sso = role === 'sso';
  const guard = role === 'guard';
  const L = [];
  if (!guard) L.push('/', '/expenses', '/advances');
  if (!guard && role !== 'so') L.push('/accounts');
  L.push('/attendance', '/attendance/entries');
  if (can('att_logs')) L.push('/attendance/logs');
  if (can('att_view')) L.push('/attendance/board', '/attendance/dashboard');
  if (can('att_reports')) L.push('/attendance/reports', '/attendance/analysis');
  if (can('att_staff')) L.push('/attendance/staff');
  if (!guard) L.push(om || sso ? '/attendance/hk-roster' : '/attendance/hk-roster/request');
  if (can('att_import')) L.push('/attendance/import');
  if (can('att_reconcile')) L.push('/attendance/reconcile');
  L.push('/visitors');
  if (can('vis_log')) L.push('/visitors/log');
  if (can('guard_duty')) L.push('/visitors/guards');
  if (can('hire_view')) L.push('/visitors/hires');
  if (can('tasks')) L.push('/tasks');
  if (can('fuel_use')) {
    L.push('/fuel', '/fuel/log');
    if (om) L.push('/fuel/setup');
  }
  if (!guard) {
    L.push('/support', '/support/new', '/support/list');
    if (om || sso) L.push('/support/people');
    L.push('/guide');
  }
  if (om) L.push('/exprev', '/exprev/entries', '/exprev/budget', '/exprev/analysis', '/exprev/import', '/approvals', '/team', '/logs');
  return L;
}

// The page in the list that a path belongs to (the longest match), or '' for pages that are not in it (profile, security...).
export function pageOf(path) {
  let best = '';
  for (const h of ALL_PAGES) {
    if (h === '/') {
      if (path === '/') best = '/';
      continue;
    }
    if ((path === h || path.indexOf(h + '/') === 0) && h.length > best.length) best = h;
  }
  return best;
}
