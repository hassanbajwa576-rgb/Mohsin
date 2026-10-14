import { q } from '@/lib/db';
import { pkr } from '@/lib/fmt';
import { fundOfficeSpend } from '@/lib/queries';
import FundMatrix, { buildMatrix } from './FundMatrix';

function Bars({ rows }) {
  if (!rows.length) return <p className='muted'>Nothing recorded yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className='bars'>
      {rows.map((r) => (
        <div className='bar' key={r.label}>
          <div className='bar-top'><span>{r.label}</span><b>{pkr(r.value)}</b></div>
          <div className='track'><div className='fill' style={{ width: (r.value / max) * 100 + '%' }} /></div>
        </div>
      ))}
    </div>
  );
}

const num = (rows) => rows.map((r) => ({ label: r.label, value: Number(r.value) }));

// Spending analysis (all offices): fund x office tables and the category, office and month charts.
export default async function ExpenseInsights() {
  const month = new Date().toISOString().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const monthEnd = month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  const live = `WHERE e.status <> 'rejected'`;
  const from = `FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id`;
  const [spentMonth, spentAll, cats, offs, months] = await Promise.all([
    fundOfficeSpend({ from: month + '-01', to: monthEnd }),
    fundOfficeSpend({}),
    q(`SELECT e.category AS label, SUM(e.amount)::float8 AS value ${from} ${live} GROUP BY e.category ORDER BY value DESC LIMIT 8`),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value ${from} ${live} GROUP BY o.code ORDER BY o.code`),
    q(`SELECT to_char(e.spent_on, 'YYYY-MM') AS label, SUM(e.amount)::float8 AS value ${from} ${live} AND e.spent_on >= (date_trunc('month', now()) - interval '5 months')::date GROUP BY 1 ORDER BY 1`),
  ]);
  return (
    <details className='card'>
      <summary>Insights - spending by fund, office, category and month</summary>
      <div className='grid2' style={{ marginTop: 14 }}>
        <FundMatrix title={'Spent this month (' + month + ')'} cols={['LHR', 'ISB']} rows={buildMatrix(spentMonth, 'office', ['LHR', 'ISB'])} />
        <FundMatrix title='Spent in total' cols={['LHR', 'ISB']} rows={buildMatrix(spentAll, 'office', ['LHR', 'ISB'])} />
      </div>
      <div className='grid2'>
        <div className='card'><h3>Spend by office</h3><Bars rows={num(offs)} /></div>
        <div className='card'><h3>Spend by category</h3><Bars rows={num(cats)} /></div>
        <div className='card'><h3>Last 6 months</h3><Bars rows={num(months)} /></div>
      </div>
    </details>
  );
}
