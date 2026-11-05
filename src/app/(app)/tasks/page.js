import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey } from '@/lib/att';
import { taskPeople, taskRows, attentionRows, domainCounts, peopleCounts, daysFrom, DOMAIN } from '@/lib/tasks';
import { addTask } from '@/lib/task-actions';
import TaskForm from '@/components/TaskForm';
import TaskTable from '@/components/TaskTable';
import TaskAddPanel from '@/components/TaskAddPanel';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// "Muhammad Imran" -> "Imran"
const short = (n) => String(n || '').trim().split(/\s+/).slice(-1)[0];

export default async function TasksPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  if (!can(user, 'tasks')) redirect('/');
  const sp = await searchParams;
  const people = await taskPeople(user);
  const everyone = [user.id, ...people.map((p) => p.id)];
  // Whose tasks the page shows: your own (default), one person's, or everyone's you can follow.
  let who = '';
  let ids = [user.id];
  if (sp.who === 'all' && people.length) {
    who = 'all';
    ids = everyone;
  } else if (people.some((p) => String(p.id) === sp.who)) {
    who = sp.who;
    ids = [Number(sp.who)];
  }
  const viewing = who && who !== 'all' ? people.find((p) => String(p.id) === who) : null;
  const domain = DOMAIN[sp.domain] ? sp.domain : '';
  const show = ['done', 'all'].includes(sp.show) ? sp.show : 'open';
  const today = todayKey();
  const [rows, soon, counts, perPerson] = await Promise.all([
    taskRows(ids, show, domain),
    attentionRows(ids, today),
    domainCounts(ids, today),
    people.length ? peopleCounts(everyone, today) : Promise.resolve({}),
  ]);
  const keep = show === 'open' ? '' : show;
  const link = (w, d, s) => {
    const p = new URLSearchParams({ ...(w ? { who: w } : {}), ...(d ? { domain: d } : {}), ...(s ? { show: s } : {}) }).toString();
    return '/tasks' + (p ? '?' + p : '');
  };
  const chip = (k, label) => <Link key={k} className={'chip' + (show === k ? ' on' : '')} href={link(who, domain, k === 'open' ? '' : k)}>{label}</Link>;
  const late = soon.filter((t) => t.due_on && daysFrom(today, t.due_on) < 0).length;
  const title = viewing ? short(viewing.name) + "'s Tasks" : who === 'all' ? 'All Tasks' : 'My Tasks';
  const canRemove = (t) => t.created_by === user.id || user.role === 'om';
  const tableProps = { today, me: user.id, view: domain, show: keep, who, canRemove };
  const personChip = (w, label, c) => (
    <Link key={w || 'me'} href={link(w, domain, keep)} className={'chip' + (who === w ? ' on' : '')}>
      {label}{c && c.open ? <small className={'tk-chipn' + (c.overdue ? ' late' : '')}>{c.open}</small> : null}
    </Link>
  );

  return (
    <>
      <div className='head'>
        <div>
          <h1>{title}</h1>
          <p className='muted'>{viewing ? 'What ' + short(viewing.name) + ' has pending, and what needs attention soon.' : who === 'all' ? 'Everything pending for you and your team.' : 'What is pending in each area, and what needs you soon.'}</p>
        </div>
      </div>
      <Flash sp={sp} />

      {people.length ? (
        <div className='chips tkwho' aria-label='Whose tasks'>
          {personChip('', 'Mine', perPerson[user.id])}
          {people.map((p) => personChip(String(p.id), short(p.name), perPerson[p.id]))}
          {people.length > 1 ? personChip('all', 'Everyone', null) : null}
        </div>
      ) : null}

      <div className='tkgrid'>
        <aside className='tkside'>
          <TaskAddPanel title={'Add a task' + (viewing ? ' for ' + short(viewing.name) : '')}>
            <TaskForm action={addTask} view={domain} show={keep} who={who} defaultDomain={domain || 'operations'} people={people} defaultOwner={viewing ? viewing.id : ''} meId={user.id} />
          </TaskAddPanel>
        </aside>

        <div className='tkmain'>
          <div className='kpis kpis-3'>
            <div className='card kpi'><span>Open</span><b>{counts.total.open}</b></div>
            <div className='card kpi alt'><span>Due today</span><b>{counts.total.today}</b></div>
            <div className={'card kpi alt' + (counts.total.overdue ? ' neg' : '')}><span>Overdue</span><b>{counts.total.overdue}</b></div>
          </div>

          <div className='card'>
            <h3 style={{ marginTop: 0 }}>Needs attention soon</h3>
            <p className='muted' style={{ marginTop: 0 }}>Late, due in the next 7 days, or marked high priority{late ? ' - ' + late + ' already late' : ''}.</p>
            {soon.length ? <TaskTable rows={soon} {...tableProps} /> : <p className='muted'>Nothing urgent. Well done.</p>}
          </div>

          <div className='card'>
            <h3 style={{ marginTop: 0 }}>{domain ? DOMAIN[domain] : 'All'}</h3>
            <div className='chips' style={{ marginBottom: 10 }}>{chip('open', 'Open')}{chip('done', 'Done')}{chip('all', 'All')}</div>
            {rows.length ? <TaskTable rows={rows} {...tableProps} /> : <p className='muted'>{show === 'done' ? 'No finished tasks here yet.' : 'Nothing pending here. Add a task on the right.'}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
