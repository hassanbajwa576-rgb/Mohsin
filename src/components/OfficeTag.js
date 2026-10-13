import { pkr } from '@/lib/fmt';

// Small uppercase office tag (LHR gold, ISB slate) used wherever an item belongs to an office.
export default function OfficeTag({ o }) {
  if (!o) return null;
  return <span className={'otag ' + String(o).toLowerCase()}>{o}</span>;
}

// Per-office amounts in the same quiet box the CIH card uses. rows: [{ label: 'LHR', value }]
export function OfficeSplit({ rows }) {
  const get = (c) => Number((rows.find((r) => r.label === c) || {}).value || 0);
  return (
    <ul className='split office'>
      {['LHR', 'ISB'].map((c) => (
        <li key={c}><OfficeTag o={c} /><b>{pkr(get(c))}</b></li>
      ))}
    </ul>
  );
}
