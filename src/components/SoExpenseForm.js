'use client';

import { useState } from 'react';

const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Add expense for a Support Officer. "Automatic" pays from the oldest advance first and splits the expense across
// advances when one is not enough; a single advance can still be picked by hand.
export default function SoExpenseForm({ action, advances, funds, categories, today }) {
  const first = Object.keys(funds).find((k) => advances.some((a) => a.fund === k)) || Object.keys(funds)[0] || '';
  const [pick, setPick] = useState('auto:' + first);
  const [amount, setAmount] = useState('');
  const n = Number(amount) || 0;

  const byFund = (fund) => advances
    .filter((a) => a.fund === fund)
    .slice()
    .sort((x, y) => String(x.issued_on).localeCompare(String(y.issued_on)) || x.id - y.id);
  // Every fund is offered, even with no cash in hand: an expense can always be recorded.
  const fundKeys = Object.keys(funds);

  // What the amount would be paid from.
  let plan = [];
  let short = 0;
  let held = 0;
  if (pick.startsWith('auto:')) {
    const list = byFund(pick.slice(5));
    held = list.reduce((s, a) => s + a.left, 0);
    let left = n;
    for (const a of list) {
      if (left <= 0) break;
      const take = Math.min(left, a.left);
      if (take > 0) {
        plan.push([a.id, take]);
        left -= take;
      }
    }
    short = left > 0 ? left : 0;
  } else {
    const a = advances.find((x) => String(x.id) === pick);
    held = a ? a.left : 0;
    if (a && n > 0) {
      if (n <= a.left) plan = [[a.id, n]];
      else short = n - a.left;
    }
  }
  const fundOfPick = pick.startsWith('auto:') ? pick.slice(5) : (advances.find((x) => String(x.id) === pick) || {}).fund;

  return (
    <form action={action} className='form'>
      <div className='holdbar wide'>
        {fundKeys.map((k) => (
          <div key={k}>
            <b>You hold {pkr(byFund(k).reduce((s, a) => s + a.left, 0))}</b> on {funds[k]}
          </div>
        ))}
      </div>
      <label>Date<input type='date' name='spent_on' defaultValue={today} required /></label>
      <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Category
        <select name='category' required>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label>Paid from
        <select name='issue_id' required value={pick} onChange={(e) => setPick(e.target.value)}>
          {fundKeys.map((k) => (
            <option key={k} value={'auto:' + k}>{funds[k]} - in hand {pkr(byFund(k).reduce((s, a) => s + a.left, 0))}</option>
          ))}
        </select>
      </label>
      <label className='wide'>Description<input name='description' placeholder='What was it for?' /></label>

      {n > 0 && short === 0 ? (
        <p className='okline wide'>{pkr(n)} will be taken from your {funds[fundOfPick] || ''} cash in hand ({pkr(held)} available).</p>
      ) : null}
      {n > 0 && short > 0 ? (
        <p className='okline wide'>
          {held > 0 ? pkr(held) + ' will be taken from your cash in hand and ' + pkr(short) + ' is recorded without an advance behind it.' : 'You have no cash in hand on ' + (funds[fundOfPick] || 'this fund') + '. The expense is still recorded.'}
        </p>
      ) : null}
      <button className='btn primary' type='submit'>Add expense</button>
    </form>
  );
}
