import { pkr } from '@/lib/fmt';

// Where the remaining cash physically sits right now.
export default function CashSplit({ pool, sso, so, payee }) {
  return (
    <ul className='split'>
      <li>With Sr. Ops Manager - <b>{pkr(pool)}</b></li>
      <li>With Sr. SO - <b>{pkr(sso)}</b></li>
      <li>With SO - <b>{pkr(so)}</b></li>
      {payee > 0 ? <li>With advance-only team members - <b>{pkr(payee)}</b></li> : null}
    </ul>
  );
}
