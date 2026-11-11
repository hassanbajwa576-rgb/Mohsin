import { pkr } from '@/lib/fmt';

// Offices and sites that have their own colour in the stylesheet. Any other site name (added later on the Sites page)
// gets one of six spare colours, always the same one for the same name.
const KNOWN = ['lhr', 'isb', 'remote', 'apl', 'oka'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);

// Small uppercase tag: an office (LHR gold, ISB slate) or a Dastarkhawan site (APL blue, OKA green, "N sites" teal...).
export default function OfficeTag({ o }) {
  if (!o) return null;
  const key = String(o).trim().toLowerCase();
  const cls = KNOWN.includes(key) ? key : /^\d+ sites?$/.test(key) ? 'manysites' : 'tc' + (hash(key) % 6);
  return <span className={'otag ' + cls}>{o}</span>;
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
