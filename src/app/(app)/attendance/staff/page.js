import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, shiftText, SHIFT_COLS, SHIFT_JOIN, loadPeriods, shiftOn, todayKey } from '@/lib/att';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { applyStaffDates } from '@/lib/staff-dates';
import { addStaff, toggleStaff, importStaff, deleteStaff, saveDeptShift, saveTempHours, endTempHours, deleteTempHours } from '@/lib/att-actions';
import ConfirmButton from '@/components/ConfirmButton';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import ShiftFields from '@/components/ShiftFields';
import DeptShiftForm from '@/components/DeptShiftForm';
import DeptPicker from '@/components/DeptPicker';
import ReasonFields from '@/components/ReasonFields';
import TempHoursForm from '@/components/TempHoursForm';

export const dynamic = 'force-dynamic';

export default async function AttendanceStaffPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_staff')) redirect('/attendance');
  const sp = await searchParams;
  await applyStaffDates(); // joiners and leavers whose date has arrived
  const rows = await q(
    `SELECT s.id, s.code, s.name, s.dept, ${SHIFT_COLS}, s.active, to_char(s.active_from, 'YYYY-MM-DD') AS active_from, to_char(s.active_to, 'YYYY-MM-DD') AS active_to, s.inactive_reason, o.code AS office, (SELECT COUNT(*)::int FROM pc2_attendance a WHERE a.staff_id = s.id) AS entries FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id ${allOffices(user) ? '' : 'WHERE s.office_id = ' + Number(user.office_id)} ORDER BY s.active DESC, o.code, s.name`
  );

  const depts = [...new Set(rows.map((r) => r.dept).filter(Boolean))].sort();
  const deptShifts = await q('SELECT dept, shift, shift_start, shift_end FROM pc2_dept_shifts ORDER BY dept');
  const today = todayKey();
  const periodsToday = await loadPeriods(today, today);
  const tempList = await q(
    `SELECT p.id, p.scope, p.dept, p.staff_id, s.name AS staff_name, p.shift_start, p.shift_end, to_char(p.from_date, 'YYYY-MM-DD') AS from_date, to_char(p.to_date, 'YYYY-MM-DD') AS to_date, p.note
     FROM pc2_shift_periods p LEFT JOIN pc2_staff s ON s.id = p.staff_id WHERE p.to_date >= current_date - 60 ORDER BY p.from_date DESC, p.id DESC`
  );
  const pickStaff = rows.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, dept: r.dept }));
  const fds = [].concat(sp.dept || []).filter((d) => depts.includes(d));
  const fo = allOffices(user) && ['LHR', 'ISB', 'REMOTE'].includes(sp.office) ? sp.office : '';
  const fs = ['active', 'inactive'].includes(sp.status) ? sp.status : '';
  const fh = ['morning', 'evening', 'night', 'none'].includes(sp.shift) ? sp.shift : '';
  const fq = String(sp.q || '').trim().slice(0, 60);
  const shown = rows.filter(
    (r) =>
      (!fds.length || fds.includes(r.dept)) &&
      (!fo || r.office === fo) &&
      (!fs || (fs === 'active') === r.active) &&
      (!fh || (fh === 'none' ? !r.shift : r.shift === fh)) &&
      (!fq || r.name.toLowerCase().includes(fq.toLowerCase()) || String(r.code).toLowerCase().includes(fq.toLowerCase()))
  );
  const nActive = shown.filter((r) => r.active).length;
  // Headcount of active employees (not narrowed by the filters below).
  const act = rows.filter((r) => r.active);
  const cnt = (code) => act.filter((r) => r.office === code).length;
  const nInactive = rows.length - act.length;
  const statusLink = (v) => {
    const p = new URLSearchParams([...fds.map((d) => ['dept', d]), ...(fo ? [['office', fo]] : []), ...(v ? [['status', v]] : []), ...(fh ? [['shift', fh]] : []), ...(fq ? [['q', fq]] : [])]).toString();
    return '/attendance/staff' + (p ? '?' + p : '');
  };

  return (
    <>
      <div className='head'>
        <div>
          <h1>Employees</h1>
          <p className='muted'>The people whose check in, check out and breaks are recorded. Guards and Support Officers are managed on the Team page.</p>
        </div>
        {can(user, 'att_import') || can(user, 'att_reconcile') ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {can(user, 'att_reconcile') ? <Link href='/attendance/reconcile' className='btn'>Reconciliation</Link> : null}
            {can(user, 'att_import') ? <Link href='/attendance/import' className='btn primary'>Import attendance from Excel</Link> : null}
          </div>
        ) : null}
      </div>
      <Flash sp={sp} />

      <div className='kpis kpis-4'>
        <div className='card kpi'><span>Total employees</span><b>{act.length}</b></div>
        <div className='card kpi alt'><span>LHR</span><b>{cnt('LHR')}</b></div>
        <div className='card kpi alt'><span>ISB</span><b>{cnt('ISB')}</b></div>
        <div className='card kpi alt'><span>Remote</span><b>{cnt('REMOTE')}</b></div>
      </div>

      <details className='card' open={rows.length === 0}>
        <summary>Add employee</summary>
        <form action={addStaff} className='form'>
          <label>Full name<input name='name' required /></label>
          <label>Department<input name='dept' list='dept-list' /></label>
          <datalist id='dept-list'>{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <label>Office
            <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option><option value='REMOTE'>Remote</option></select>
          </label>
          <label>Active from (optional)<input type='date' name='active_from' /></label>
          <p className='muted wide'>For an upcoming joiner, pick the joining date. They are added now and switch on by themselves on that day. Leave empty to start today.</p>
          <ShiftFields />
          <button className='btn primary' type='submit'>Add employee</button>
        </form>
      </details>

      <details className='card'>
        <summary>Department shifts{deptShifts.length ? ' (' + deptShifts.length + ' set)' : ''}</summary>
        <p className='muted'>Give one or more departments the same shift. Everyone in them follows it, unless you set a shift on that employee's own Edit page (their own shift always wins).</p>
        <DeptShiftForm depts={depts} action={saveDeptShift} />
        {deptShifts.length ? (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>Department</th><th>Shift</th><th>Employees</th></tr></thead>
              <tbody>
                {deptShifts.map((d) => (
                  <tr key={d.dept}>
                    <td><b>{d.dept}</b></td>
                    <td><span className='shiftpill'>{shiftText(d)}</span></td>
                    <td>{rows.filter((r) => r.dept === d.dept).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>

      <details className='card'>
        <summary>Temporary hours{tempList.some((t) => t.from_date <= today && t.to_date >= today) ? ' (active now)' : ''}</summary>
        <p className='muted'>Different start and end times for a date range, for departments, specific employees or everyone. They end by themselves after the last date, and everyone goes back to their normal shift. Temporary hours beat the normal shift: an employee's own period beats a department's, which beats everyone's.</p>
        <TempHoursForm depts={depts} staff={pickStaff} action={saveTempHours} today={today} />
        {tempList.length ? (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>Applies to</th><th>Dates</th><th>Hours</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tempList.map((t) => {
                  const live = t.from_date <= today && t.to_date >= today;
                  const upcoming = t.from_date > today;
                  const who = t.scope === 'everyone' ? 'Everyone' : t.scope === 'department' ? t.dept + ' (department)' : t.staff_name || 'Employee';
                  return (
                    <tr key={t.id}>
                      <td><b>{who}</b>{t.note ? <div className='muted'>{t.note}</div> : null}</td>
                      <td className='nw'>{t.from_date} to {t.to_date}</td>
                      <td className='nw'><span className='tmppill'>{shiftText({ shift: 'custom', shift_start: t.shift_start, shift_end: t.shift_end }).replace('Temporary ', '')}</span></td>
                      <td><span className={'badge ' + (live ? 'approved' : upcoming ? 'submitted' : 'rejected')}>{live ? 'Active now' : upcoming ? 'Starts ' + t.from_date : 'Finished'}</span></td>
                      <td className='act'>
                        <div className='staffact'>
                          {live ? (
                            <form action={endTempHours} className='inline'>
                              <input type='hidden' name='id' value={t.id} />
                              <button className='btn ghost' type='submit'>End today</button>
                            </form>
                          ) : null}
                          <form action={deleteTempHours} className='inline'>
                            <input type='hidden' name='id' value={t.id} />
                            <ConfirmButton className='btn ghost' message='Remove these temporary hours?'>Delete</ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>

      <details className='card'>
        <summary>Upload employees from Excel</summary>
        <p className='muted'>One row per employee with the columns <b>Name</b>, <b>Department</b>, <b>Office</b> (LHR, ISB or Remote) and an optional <b>Code</b>. People already in the list are skipped.</p>
        <form action={importStaff} className='form'>
          <label className='wide'>Excel file (.xlsx)<input type='file' name='file' accept='.xlsx' required /></label>
          <label>Office for rows without one
            <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option><option value='REMOTE'>Remote</option></select>
          </label>
          <button className='btn primary' type='submit'>Upload employees</button>
          <a className='btn ghost' href='/attendance/staff/template'>Download template</a>
        </form>
      </details>

      <form method='get' className='card filters compact'>
        <div className='fbar-field'>Department
          <DeptPicker depts={depts} selected={fds} tags={false} />
        </div>
        {allOffices(user) ? (
          <label>Office
            <select name='office' defaultValue={fo}><option value=''>All offices</option><option>LHR</option><option>ISB</option><option value='REMOTE'>Remote</option></select>
          </label>
        ) : null}
        <label>Status
          <select name='status' defaultValue={fs}>
            <option value=''>All</option>
            <option value='active'>Active</option>
            <option value='inactive'>Inactive</option>
          </select>
        </label>
        <label>Shift
          <select name='shift' defaultValue={fh}>
            <option value=''>All shifts</option>
            <option value='morning'>Morning</option>
            <option value='evening'>Evening</option>
            <option value='night'>Night</option>
            <option value='none'>No shift set</option>
          </select>
        </label>
        <label>Search<input name='q' defaultValue={fq} placeholder='Name or code' /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/attendance/staff' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        <div className='chips' style={{ marginBottom: 10 }} aria-label='Active or inactive'>
          <Link className={'chip' + (!fs ? ' on' : '')} href={statusLink('')}>All ({rows.length})</Link>
          <Link className={'chip' + (fs === 'active' ? ' on' : '')} href={statusLink('active')}>Active ({act.length})</Link>
          <Link className={'chip' + (fs === 'inactive' ? ' on' : '')} href={statusLink('inactive')}>Inactive ({nInactive})</Link>
        </div>
        {shown.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead>
                <tr><th className='hide-m'>Sr #</th><th>Name</th><th>Department</th><th>Office</th><th>Shift</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id}>
                    <td className='hide-m'>{i + 1}</td>
                    <td className='c-title'><b>{r.name}</b></td>
                    <td className='c-meta'>{r.dept || '-'}</td>
                    <td className='c-meta'><OfficeTag o={r.office} /></td>
                    <td className='c-meta'>{(() => {
                      const t = shiftOn(r, today, periodsToday);
                      if (t.shift_src === 'temporary') return <><span className='tmppill'>{shiftText(t)}</span><span className='srctag'>until {t.temp_to}{r.shift ? ', then ' + shiftText(r) : ''}</span></>;
                      return r.shift ? <><span className='shiftpill'>{shiftText(r)}</span>{r.shift_src === 'department' ? <span className='srctag'>from department</span> : null}</> : '-';
                    })()}</td>
                    <td className='c-stage'><span className={'badge ' + (r.active ? 'approved' : r.active_from ? 'submitted' : 'rejected')}>{r.active ? 'Active' : r.active_from ? 'Joins' : 'Inactive'}</span>{r.active_from ? <span className='srctag'>from {r.active_from}</span> : null}{r.active_to ? <span className='srctag'>leaves {r.active_to}</span> : null}{(!r.active || r.active_to) && r.inactive_reason ? <span className='srctag'>{r.inactive_reason}</span> : null}</td>
                    <td className='act'>
                      <div className='staffact'>
                        <a className='btn' href={'/attendance/staff/edit?id=' + r.id}>Edit</a>
                        {r.active ? (
                          <details className='mark'>
                            <summary className='btn ghost'>Deactivate</summary>
                            <form action={toggleStaff} className='markform'>
                              <input type='hidden' name='id' value={r.id} />
                              <ReasonFields />
                              <button className='btn primary' type='submit'>Deactivate {r.name.split(' ')[0]}</button>
                            </form>
                          </details>
                        ) : (
                          <form action={toggleStaff} className='inline'>
                            <input type='hidden' name='id' value={r.id} />
                            <button className='btn ghost' type='submit'>Activate</button>
                          </form>
                        )}
                        {user.role === 'om' ? (
                          <form action={deleteStaff} className='inline'>
                            <input type='hidden' name='id' value={r.id} />
                            <ConfirmButton className='btn ghost' message={'Delete ' + r.name + ' and all ' + r.entries + ' of their attendance entries? This cannot be undone.'}>Delete</ConfirmButton>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='muted'>{rows.length === 0 ? 'No employees yet. Add the first one above.' : 'No employees match these filters.'}</p>
        )}
        <p className='totals'>{shown.length} of {rows.length} employees shown ({nActive} active)</p>
      </div>
    </>
  );
}
