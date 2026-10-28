import { editEntry } from '@/lib/att-actions';
import { KIND_LABEL, fmtTime, dateKey } from '@/lib/att';
import TimePick from '@/components/TimePick';

// "Edit" button that opens a small form to change the type, date and time of one entry.
export default function EntryEdit({ m, back = '/attendance' }) {
  return (
    <details className='entry-edit'>
      <summary className='btn'>Edit</summary>
      <form action={editEntry} className='entry-edit-form'>
        <input type='hidden' name='id' value={m.id} />
        <input type='hidden' name='back' value={back} />
        <label>Type
          <select name='kind' defaultValue={m.kind}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Date<input type='date' name='date' defaultValue={dateKey(m.ms)} required /></label>
        <label>Time<TimePick name='time' defaultValue={fmtTime(m.ms)} required /></label>
        <button className='btn primary' type='submit'>Save</button>
      </form>
    </details>
  );
}
