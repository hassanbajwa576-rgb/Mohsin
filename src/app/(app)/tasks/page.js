import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey } from '@/lib/att';
import { taskRows, attentionRows, domainCounts, daysFrom, DOMAIN, DOMAIN_ORDER } from '@/lib/tasks';
import { addTask } from '@/lib/task-actions';
import TaskForm from '@/components/TaskForm';
import TaskTable from '@/components/TaskTable';
import TaskAddPanel from '@/components/TaskAddPanel';
import BackButton from '@/components/BackButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function TasksPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  if (!can(user, 'tasks')) redirect('/');
  const sp = await searchParams;
  const domain = DOMAIN[sp.domain] ? sp.domain : '';
  const show = ['done', 'all'].includes(sp.show) ? sp.show : 'open';
  const today = todayKey();
  const [rows, soon, counts] = await Promise.all([taskRows(user.id, show, domain), attentionRows(user.id, today), domainCounts(user.id, today)]);
  const keep = show === 'open' ? '' : show;
  const link = (d, s) => '/tasks' + (d || s ? '?' + new URLSearchParams({ ...(d ? { domain: d } : {}), ...(s ? { show: s } : {}) }).toString() : '');
  const chip = (k, label) => <Link key={k} className={'chip' + (show === k ? ' on' : '')} href={link(domain, k === 'open' ? '' : k)}>{label}</Link>;
  const late = soon.filter((t) => t.due_on && daysFrom(today, t.due_on) < 0).length;

  return (
    <>
      <div className='head'>
        <div>
          <BackButton fallback='/' />
          <h1>My Tasks</h1>
          <p className='muted'>What is pending in each area, and what needs you soon. Only you can see your tasks.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='tkgrid'>
        <aside className='tkside'>
          <TaskAddPanel title={'Add a task' + (domain ? ' to ' + DOMAIN[domain] : '')}>
            <TaskForm action={addTask} view={domain} show={keep} defaultDomain={domain || 'operations'} />
          </TaskAddPanel>
        </aside>

        <div className='tkmain'>
          <div className='kpis kpis-3'>
            <div className='card kpi'><span>Open</span><b>{counts.total.open}</b></div>
            <div className='card kpi alt'><span>Due today</span><b>{counts.total.today}</b></div>
            <div className={'card kpi alt' + (counts.total.overdue ? ' neg' : '')}><span>Overdue</span><b>{counts.total.overdue}</b></div>
          </div>

          <div className='tkdoms'>
            <Link href={link('', '')} className={'tkdom' + (!domain ? ' on' : '')}>
              <b>All</b>
              <span>{counts.total.open} open</span>
              {counts.total.overdue ? <small className='tk-late'>{counts.total.overdue} overdue</small> : <small>&nbsp;</small>}
            </Link>
            {DOMAIN_ORDER.map((k) => {
              const c = counts.by[k] || { open: 0, overdue: 0 };
              return (
                <Link key={k} href={link(k, '')} className={'tkdom' + (domain === k ? ' on' : '')}>
                  <b>{DOMAIN[k]}</b>
                  <span>{c.open} open</span>
                  {c.overdue ? <small className='tk-late'>{c.overdue} overdue</small> : <small>&nbsp;</small>}
                </Link>
              );
            })}
          </div>

          <div className='card'>
            <h3 style={{ marginTop: 0 }}>Needs attention soon</h3>
            <p className='muted' style={{ marginTop: 0 }}>Late, due in the next 7 days, or marked high priority{late ? ' - ' + late + ' already late' : ''}.</p>
            {soon.length ? <TaskTable rows={soon} today={today} view={domain} show={keep} /> : <p className='muted'>Nothing urgent. Well done.</p>}
          </div>

          <div className='card'>
            <h3 style={{ marginTop: 0 }}>{domain ? DOMAIN[domain] : 'All'}</h3>
            <div className='chips' style={{ marginBottom: 10 }}>{chip('open', 'Open')}{chip('done', 'Done')}{chip('all', 'All')}</div>
            {rows.length ? <TaskTable rows={rows} today={today} view={domain} show={keep} /> : <p className='muted'>{show === 'done' ? 'No finished tasks here yet.' : 'Nothing pending here. Add a task on the right.'}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
