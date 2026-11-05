'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/weekdays';

// Add a reminder: what, for whom, when (once, every day, chosen days, the 15th, last working day) and at what hour.
export default function ReminderForm({ action, people = [], meId = '' }) {
  const [kind, setKind] = useState('once');
  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const label = (h) => (h === 12 ? '12:00 PM' : h > 12 ? h - 12 + ':00 PM' : h + ':00 AM');
  return (
    <form action={action} className='form'>
      {people.length ? (
        <label className='wide'>Remind
          <select name='assign_to' defaultValue={String(meId)}>
            <option value={meId}>Me</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className='wide'>What to remember<input name='title' maxLength={200} placeholder='For example: Send the attendance update' required autoComplete='off' /></label>
      <label className='wide'>Note (optional)<input name='note' maxLength={300} autoComplete='off' /></label>
      <label>When
        <select name='kind' value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value='once'>Once, on a date</option>
          <option value='daily'>Every day</option>
          <option value='days'>On chosen days of the week</option>
          <option value='m15'>On the 15th of every month</option>
          <option value='mend'>Last working day of every month</option>
        </select>
      </label>
      <label>At
        <select name='hour' defaultValue='9'>{hours.map((h) => <option key={h} value={h}>{label(h)}</option>)}</select>
      </label>
      {kind === 'once' ? <label>Date<input type='date' name='on_date' required /></label> : null}
      {kind === 'days' ? (
        <fieldset className='wide tkdays'>
          <legend>Days</legend>
          {WEEKDAYS.map(([k, l]) => <label key={k} className='daychk'><input type='checkbox' name='days' value={k} />{l}</label>)}
        </fieldset>
      ) : null}
      <button className='btn primary' type='submit'>Add reminder</button>
    </form>
  );
}
