'use client';
import { useEffect, useState } from 'react';
import { pkr } from '@/lib/fmt';

const SEL = 'input[data-bulk-row]';

// Bar above the expense list: tick expenses (or all of them), then approve or delete them in one go.
// The row checkboxes live in the table and point at this form through the form attribute.
export default function BulkApprove({ approveAction, deleteAction, canApprove }) {
  const [n, setN] = useState(0);
  const [sum, setSum] = useState(0);
  const [appr, setAppr] = useState(0);

  useEffect(() => {
    const read = () => {
      const boxes = document.querySelectorAll(SEL);
      const on = [...boxes].filter((c) => c.checked);
      setN(on.length);
      setSum(on.reduce((a, c) => a + Number(c.dataset.amount || 0), 0));
      setAppr(on.filter((c) => c.dataset.approvable === '1').length);
      const all = document.querySelector('input[data-bulk-all]');
      if (all) {
        all.checked = boxes.length > 0 && on.length === boxes.length;
        all.indeterminate = on.length > 0 && on.length < boxes.length;
      }
    };
    const onChange = (e) => {
      if (e.target.matches('input[data-bulk-all]')) document.querySelectorAll(SEL).forEach((c) => { c.checked = e.target.checked; });
      if (e.target.matches('input[data-bulk-all], ' + SEL)) read();
    };
    document.addEventListener('change', onChange);
    read();
    return () => document.removeEventListener('change', onChange);
  }, []);

  const setAll = (v) => {
    const boxes = document.querySelectorAll(SEL);
    boxes.forEach((c) => { c.checked = v; });
    boxes[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const ask = (e) => {
    const kind = e.nativeEvent.submitter?.dataset.kind;
    const msg = kind === 'delete'
      ? 'Delete ' + n + ' selected expense(s) (' + pkr(sum) + ')? This cannot be undone.'
      : 'Approve ' + appr + ' selected expense(s) waiting for approval?';
    if (!window.confirm(msg)) e.preventDefault();
  };

  return (
    <form id='bulk-approve' action={approveAction} className='submitbar' onSubmit={ask}>
      <div>
        <b>Select expenses to {canApprove ? 'approve or delete' : 'delete'}</b>
        <div className='muted'>{n ? n + ' selected - ' + pkr(sum) : 'Tick the expenses you want, or use Select all. Use Reject on a row for any you do not accept.'}</div>
      </div>
      <div className='inline'>
        <button type='button' className='btn' onClick={() => setAll(true)}>Select all</button>
        {n ? <button type='button' className='btn ghost' onClick={() => setAll(false)}>Clear</button> : null}
        {canApprove ? <button className='btn ok' type='submit' data-kind='approve' disabled={!appr}>Approve selected{appr ? ' (' + appr + ')' : ''}</button> : null}
        <button className='btn bad' type='submit' formAction={deleteAction} data-kind='delete' disabled={!n}>Delete selected{n ? ' (' + n + ')' : ''}</button>
      </div>
    </form>
  );
}
