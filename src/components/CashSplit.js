import { pkr } from '@/lib/fmt';

// Where the remaining cash physically sits right now.
export default function CashSplit({ pool, sso, so }) {
  return (
    <ul className='split'>
      <li><span>With SOM</span><b>{pkr(pool)}</b></li>
      <li><span>With Sr. SO</span><b>{pkr(sso)}</b></li>
      <li><span>With SO</span><b>{pkr(so)}</b></li>
    </ul>
  );
}
