import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { todayKey } from '@/lib/att';
import { routineRows, taskPeople, taskRows, attentionRows, domainCounts, peopleCounts, daysFrom, DOMAIN } from '@/lib/tasks';
import { addTask, toggleRule, deleteRule } from '@/lib/task-actions';
import { runRoutines } from '@/lib/task-rules';
import { daysText } from '@/lib/weekdays';
import TaskForm from '@/components/TaskForm';
import TaskTable from '@/components/TaskTable';
import TaskAddPanel from '@/components/TaskAddPanel';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { firstName } from '@/lib/names';

export const dynamic = 'force-dynamic';

// "Muhammad Imran" -> "Imran"
const short = firstName;

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
  await runRoutines(); // routine tasks for today, if they have not been made yet
  // One of the summary boxes was clicked: only those tasks are listed.
  const fil = ['today', 'overdue', 'high'].includes(sp.f) ? sp.f : '';
  const FIL = { today: 'Due today', overdue: 'Overdue', high: 'High priority' };
  const [rows, soon, counts, perPerson, routines] = await Promise.all([
    taskRows(ids, fil ? 'open' : show, domain, fil, today),
    attentionRows(ids, today),
    domainCounts(ids, today),
    people.length ? peopleCounts(everyone, today) : Promise.resolve({}),
    routineRows(ids),
  ]);
  const remN = Number((await q('SELECT COUNT(*)::int AS n FROM pc2_reminders WHERE user_id = $1 AND active', [user.id]))[0].n);
  const keep = show === 'open' ? '' : show;
  const link = (w, d, s, f) => {
    const p = new URLSearchParams({ ...(w ? { who: w } : {}), ...(d ? { domain: d } : {}), ...(s ? { show: s } : {}), ...(f ? { f } : {}) }).toString();
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
          <div className='tkhead'>
            <h1>{title}</h1>
            <TaskAddPanel title={'Add a task' + (viewing ? ' for ' + short(viewing.name) : '')}>
              <TaskForm action={addTask} view={domain} show={keep} who={who} defaultDomain={domain || 'operations'} people={people} defaultOwner={viewing ? viewing.id : ''} meId={user.id} />
            </TaskAddPanel>
            <Link href='/reminders' className='btn ghost tk-rem'>&#128276; Reminders{remN ? <span className='tk-chipn'>{remN}</span> : null}</Link>
          </div>
          <p className='muted'>{viewing ? 'What ' + short(viewing.name) + ' has pending, and what needs attention soon.' : who === 'all' ? 'Everything pending for you and your team.' : 'What is pending in each area, and what needs you soon.'}</p>
        </div>
        {people.length ? (
          <div className='chips tkwho' aria-label='Whose tasks'>
            {personChip('', 'Mine', perPerson[user.id])}
            {people.map((p) => personChip(String(p.id), short(p.name), perPerson[p.id]))}
            {people.length > 1 ? personChip('all', 'Everyone', null) : null}
          </div>
        ) : null}
      </div>
      <Flash sp={sp} />

      <div className='tkgrid'>
        <div className='tkmain'>
          <div className='kpis kpis-4'>
            <Link href={link(who, domain, keep, '')} className={'card kpi kpibtn' + (!fil ? ' on' : '')}><span>Open</span><b>{counts.total.open}</b></Link>
            <Link href={link(who, domain, '', 'today')} className={'card kpi alt kpibtn' + (fil === 'today' ? ' on' : '')}><span>Due today</span><b>{counts.total.today}</b></Link>
            <Link href={link(who, domain, '', 'overdue')} className={'card kpi alt kpibtn' + (counts.total.overdue ? ' neg' : '') + (fil === 'overdue' ? ' on' : '')}><span>Overdue</span><b>{counts.total.overdue}</b></Link>
            <Link href={link(who, domain, '', 'high')} className={'card kpi alt kpibtn' + (counts.total.high ? ' hi' : '') + (fil === 'high' ? ' on' : '')}><span>High priority</span><b>{counts.total.high}</b></Link>
          </div>

          {fil ? null : <div className='card'>
            <h3 style={{ marginTop: 0 }}>Needs attention soon</h3>
            <p className='muted' style={{ marginTop: 0 }}>Late, due in the next 7 days, or marked high priority{late ? ' - ' + late + ' already late' : ''}.</p>
            {soon.length ? <TaskTable rows={soon} {...tableProps} /> : <p className='muted'>Nothing urgent. Well done.</p>}
          </div>}

          <div className='card'>
            <h3 style={{ marginTop: 0 }}>{fil ? FIL[fil] + (domain ? ' - ' + DOMAIN[domain] : '') : domain ? DOMAIN[domain] : 'All'}</h3>
            {fil ? <div className='chips' style={{ marginBottom: 10 }}><Link className='chip' href={link(who, domain, '', '')}>Show all open tasks</Link></div> : <div className='chips' style={{ marginBottom: 10 }}>{chip('open', 'Open')}{chip('done', 'Done')}{chip('all', 'All')}</div>}
            {rows.length ? <TaskTable rows={rows} {...tableProps} /> : <p className='muted'>{show === 'done' ? 'No finished tasks here yet.' : 'Nothing pending here. Use Add a task at the top.'}</p>}
          </div>
          {routines.length ? (
            <div className='card'>
              <h3 style={{ marginTop: 0 }}>Routines</h3>
              <p className='muted' style={{ marginTop: 0 }}>These create a fresh task on the days shown. Pause one to stop it for a while.</p>
              <div className='tablewrap'>
                <table className='tx'>
                  <tbody>
                    {routines.map((r) => (
                      <tr key={r.id} className={r.active ? '' : 'tk-row-done'}>
                        <td className='c-title'><b>{r.title}</b>{r.user_id !== user.id ? <span className='tk-own'>For {short(r.owner_name)}</span> : null}{r.active ? null : <span className='tk-own'>Paused</span>}</td>
                        <td className='c-meta'>Every {daysText(r.weekdays)}</td>
                        <td className='act tk-act'>
                          <form action={toggleRule} className='inline'>
                            <input type='hidden' name='id' value={r.id} /><input type='hidden' name='view_who' value={who} /><input type='hidden' name='view_domain' value={domain} />
                            <button className='btn' type='submit'>{r.active ? 'Pause' : 'Resume'}</button>
                          </form>
                          {canRemove(r) ? (
                            <form action={deleteRule} className='inline'>
                              <input type='hidden' name='id' value={r.id} /><input type='hidden' name='view_who' value={who} /><input type='hidden' name='view_domain' value={domain} />
                              <ConfirmButton className='btn ghost' message='Remove this routine? Tasks it already made stay.'>Remove</ConfirmButton>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}        </div>
      </div>
    </>
  );
}
