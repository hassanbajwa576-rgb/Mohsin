import { refreshDk } from '@/lib/roster-actions';

// Refresh from the facial attendance app: today (the quick one), the last 60 days, all time (Sr. Ops Manager only), or chosen dates.
export default function DkRefresh({ back = 'today', canAll = false, from = '', to = '' }) {
  return (
    <form action={refreshDk} className='dkr'>
      <input type='hidden' name='back' value={back} />
      <div className='dkr-main'>
        <button className='btn' type='submit' name='mode' value='today'>Refresh today</button>
        <details className='dkr-more'>
          <summary className='btn ghost'>More</summary>
          <div className='dkr-pop'>
            <button className='btn' type='submit' name='mode' value='days'>Last 60 days</button>
            {canAll ? <button className='btn' type='submit' name='mode' value='all' title='Loads everything the facial app has'>All time</button> : null}
            <div className='dkr-range'>
              <label>From<input type='date' name='from' defaultValue={from} /></label>
              <label>To<input type='date' name='to' defaultValue={to} /></label>
              <button className='btn' type='submit' name='mode' value='custom'>Load these dates</button>
            </div>
          </div>
        </details>
      </div>
    </form>
  );
}
