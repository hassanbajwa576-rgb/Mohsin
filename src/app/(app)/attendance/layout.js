import './attendance.css';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, canSeeTimes } from '@/lib/att';
import AttTabs from '@/components/AttTabs';

export default async function AttendanceLayout({ children }) {
  const u = await requireUser(ATT_ROLES);
  const tabs = [['/attendance', 'Add entry']];
  if (u.role === 'om') tabs.push(['/attendance/logs', 'Logs']);
  if (canSeeTimes(u)) tabs.push(['/attendance/reports', 'Reports']);
  if (u.role === 'om') tabs.push(['/attendance/staff', 'Employees']);
  return (
    <>
      {tabs.length > 1 ? <AttTabs tabs={tabs} /> : null}
      {children}
    </>
  );
}
