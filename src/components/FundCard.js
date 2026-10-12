import { pkr } from '@/lib/fmt';
import CashSplit from './CashSplit';

// One fund at a glance. Advances stay outstanding until expenses are submitted to Accounts.
export default function FundCard({ f }) {
  return (
    <div className='card fund'>
      <div className='fund-h'><b>{f.label}</b></div>
      <dl className='cih'>
        <div><dt>Advances received</dt><dd>{pkr(f.received)}</dd></div>
        <div><dt>Expenses so far</dt><dd>{pkr(f.spent)}</dd></div>
        <div><dt>Submitted to Accounts</dt><dd>{pkr(f.sent)}</dd></div>
        <div><dt>Advances outstanding</dt><dd>{pkr(f.outstanding)}</dd></div>
        <div className={'total' + (f.remaining < 0 ? ' neg' : '')}><dt>Remaining CIH till today</dt><dd>{pkr(f.remaining)}</dd></div>
      </dl>
      <CashSplit pool={f.pool} sso={f.ssoCash} so={f.soCash} />
    </div>
  );
}
