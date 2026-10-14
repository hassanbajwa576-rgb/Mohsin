import { pkr } from '@/lib/fmt';
import CashSplit from './CashSplit';

// One fund at a glance. See the Guide page for what each heading means.
export default function FundCard({ f }) {
  return (
    <div className='card fund'>
      <div className='fund-h'><b>{f.label}</b></div>
      <dl className='cih'>
        <div><dt>Advances</dt><dd>{pkr(f.received)}</dd></div>
        <div><dt>Expenses</dt><dd>{pkr(f.spent)}</dd></div>
        <div><dt>Submitted to Accounts</dt><dd>{pkr(f.sent)}</dd></div>
        <div><dt>Returned to Accounts</dt><dd>{pkr(f.returned)}</dd></div>
        <div><dt>Advances Outstanding</dt><dd>{pkr(f.outstanding)}</dd></div>
        <div className={'total' + (f.remaining < 0 ? ' neg' : '')}><dt>CIH</dt><dd>{pkr(f.remaining)}</dd></div>
      </dl>
      <CashSplit pool={f.pool} sso={f.ssoCash} so={f.soCash} />
    </div>
  );
}
