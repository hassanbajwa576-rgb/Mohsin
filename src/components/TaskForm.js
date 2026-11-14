import Link from 'next/link';
import { PRIORITY, DOMAINS, REPEAT } from '@/lib/tasks';
import { WEEKDAYS } from '@/lib/weekdays';

// Add or edit one task. The same form is used for both. view/show/who remember what the list was showing.
// people: who the task can be given to besides the person using the form (empty when nobody).
export default function TaskForm({ action, task, view = '', show = '', who = '', defaultDomain = 'operations', people = [], defaultOwner = '', meId = '', label = 'Add task' }) {
  const t = task || {};
  return (
    <form action={action} className='form'>
      {task ? <input type='hidden' name='id' value={task.id} /> : null}
      <input type='hidden' name='view_domain' value={view} />
      <input type='hidden' name='show' value={show} />
      <input type='hidden' name='view_who' value={who} />
      {people.length ? (
        <label className='wide'>Task for
          <select name='assign_to' defaultValue={String(t.user_id || defaultOwner || meId)}>
            <option value={meId}>Me</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className='wide'>Task<input name='title' defaultValue={t.title || ''} maxLength={200} placeholder='What needs to be done?' required autoComplete='off' /></label>
      <label>Area
        <select name='domain' defaultValue={t.domain || defaultDomain}>{DOMAINS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label>Due date<input type='date' name='due_on' defaultValue={t.due_on || ''} /></label>
      <label>Priority
        <select name='priority' defaultValue={t.priority || 'medium'}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label>Repeat
        <select name='repeat_every' defaultValue={t.repeat_every || ''}>{Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      {task ? null : (
        <fieldset className='wide tkdays'>
          <legend>Routine: make this task appear again on these days</legend>
          {WEEKDAYS.map(([k, l]) => <label key={k} className='daychk'><input type='checkbox' name='routine_days' value={k} />{l}</label>)}
          <small className='muted'>Leave empty for a normal task. Ticked days create the task each of those days for the person chosen above.</small>
        </fieldset>
      )}
      {task ? (
        <label>Status
          <select name='status' defaultValue={t.status || 'open'}><option value='open'>Open</option><option value='done'>Done</option></select>
        </label>
      ) : null}
      <label className='wide'>Details<textarea name='details' rows={4} defaultValue={t.details || ''} maxLength={1000} placeholder={'Optional: who, what, a reference.\nPress Enter to start a new line.'} /></label>
      <button className='btn primary' type='submit'>{label}</button>
      {task ? <Link href='/tasks' className='btn ghost'>Cancel</Link> : null}
    </form>
  );
}
