import Link from 'next/link';
import { fmtDay } from '@/lib/att';
import { CLABEL, PLABEL, refOf } from '@/lib/support';
import OfficeTag from '@/components/OfficeTag';

// One row per complaint. The whole title is a link to the complaint.
export default function ComplaintTable({ rows, empty = 'No complaints.' }) {
  if (!rows.length) return <p className='muted'>{empty}</p>;
  return (
    <div className='tablewrap'>
      <table className='tx'>
        <thead><tr><th>Ref</th><th>Complaint</th><th>Category</th><th>Priority</th><th>Due</th><th>Handling</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={c.status === 'resolved' ? 'rowdone' : ''}>
              <td className='nw c-meta'>{refOf(c.id)}</td>
              <td className='c-title'>
                <OfficeTag o={c.office} />
                <b><Link href={'/support/view?id=' + c.id}>{c.title}</Link></b>
                <div className='muted'>Raised by {c.raised_name || '-'}, {fmtDay(c.created_ms)}</div>
              </td>
              <td className='c-meta'>{CLABEL[c.category]}</td>
              <td className='c-meta'><span className={'pri pri-' + c.priority}>{PLABEL[c.priority]}</span></td>
              <td className='nw c-meta'>{c.status === 'open' ? <span className={c.overdue ? 'over-t' : ''}>{c.due_on}{c.overdue ? ' (overdue)' : ''}</span> : '-'}</td>
              <td className='c-meta'>{c.assigned_name || <span className='muted'>Not assigned</span>}</td>
              <td className='c-meta'>{c.status === 'open' ? <span className='tag open'>Open</span> : <span className='tag ok'>Resolved</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
