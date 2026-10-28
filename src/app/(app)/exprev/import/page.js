import { requireUser } from '@/lib/auth';
import { erStatus } from '@/lib/exprev';
import { importWorkbook } from '@/lib/exprev-actions';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function ExpRevImport({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const st = await erStatus();
  const [at, name] = st.imported.split('|');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Load the workbook</h1>
          <p className='muted'>Reads the Ops Expenses Dashboard file: the Expenditures list, the dashboard layout, Budget vs Actual and the profit and loss.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <h3>Now in ExpRev</h3>
        <p className='muted'>{st.entries ? st.entries.toLocaleString('en-US') + ' entries, ' + st.first + ' to ' + st.last + (at ? '. Last loaded ' + at.slice(0, 10) + (name ? ' from ' + name : '') + '.' : '.') : 'Nothing yet.'}</p>
        <form action={importWorkbook} className='er-form'>
          <label className='wide'>Ops Expenses Dashboard file (.xlsm or .xlsx)<input type='file' name='file' accept='.xlsm,.xlsx' required /></label>
          <ConfirmButton className='btn primary' message='This replaces everything in ExpRev, including entries added here, with what is in the file. Continue?'>Load and replace</ConfirmButton>
        </form>
        <p className='muted'>Loading again replaces all entries and the budget and profit and loss layouts with the file's contents. Entries added in the app that are not in the file are removed.</p>
      </div>
    </>
  );
}
