import { markHireArrived } from '@/lib/hire-actions';
import TimePick from '@/components/TimePick';

// "Arrived" for a new hire: opens a small form to confirm the time they came in (it starts at the time now).
export default function HireArrived({ id, role, today, nowTime }) {
  return (
    <details className='mark'>
      <summary className='btn primary'>Arrived</summary>
      <form action={markHireArrived} className='markform'>
        <input type='hidden' name='id' value={id} />
        <label>Date<input type='date' name='date' defaultValue={today} max={today} required /></label>
        <label>Time came in<TimePick role={role} name='time' defaultValue={nowTime} required /></label>
        <button className='btn primary' type='submit'>Save arrival</button>
      </form>
    </details>
  );
}
