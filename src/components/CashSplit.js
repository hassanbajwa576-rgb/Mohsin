import { pkr } from '@/lib/fmt';

// Where the remaining cash physically sits right now.
export default function CashSplit({ pool, sso, so }) {
  return (
    <ul className='split'>
      <li>With Senior Ops Manager - <b>{pkr(pool)}</b></li>
      <li>With SSO - <b>{pkr(sso)}</b></li>
      <li>With SO - <b>{pkr(so)}</b></li>
    </ul>
  );
}
