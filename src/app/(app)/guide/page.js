import { requireUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/fmt';

const TERMS = [
  ['Advances', 'Funds received from the Accounts team (Petty Cash, BRC and Others). It counts the money that came in during the period you selected.'],
  ['Expenses', 'Everything spent and recorded, excluding rejected items. It counts spending dated inside the selected period.'],
  ['CIH', 'Cash In Hand: the cash that should be available today. It is all Advances minus all Expenses, up to the end of the selected period. The three lines under it show who is holding the cash.'],
  ['Advances Outstanding', 'Advances not yet cleared with Accounts: Advances minus the expenses already submitted to Accounts. It goes down only when a batch is submitted to Accounts, not when money is spent.'],
  ['Submitted to Accounts', 'Expenses already sent to Accounts in a batch. This is the amount that clears the outstanding advance.'],
  ['With Ops Manager / SSO / SO', 'Where the CIH physically sits: still with the Ops Manager, handed to the SSO, or issued to a Support Officer and not yet spent.'],
];

const STAGES = [
  ['Not yet submitted', 'The Support Officer has added the expense but is still holding it. It counts against their advance until they submit.'],
  ['Awaiting OM review', 'Submitted by the Support Officer (or added by the SSO). The Operations Manager reviews it and approves or rejects it.'],
  ['Ready for Accounts', 'Approved by the Operations Manager. It waits to be included in the next batch for Accounts.'],
  ['Sent to Accounts', 'Included in a batch submitted to Accounts. This is final.'],
  ['Rejected', 'Turned down by the Operations Manager. It is ignored in every total.'],
];

const PAGES = [
  ['Dashboard', 'The overall picture: headline numbers, each fund, the expense pipeline, what needs your attention, charts and recent expenses. Use the Year and Month filter to look at a period.'],
  ['Expenses', 'Add expenses and follow them through the stages. Filter by office, stage, fund and month. The Operations Manager reviews, edits and deletes here.'],
  ['Advances', 'Top part: funds received from Accounts. Bottom part: cash issued to team members, what they have spent and what is still in their hand.'],
  ['Accounts', 'Approved expenses wait here. The Operations Manager or the Senior Support Officer submits them to Accounts as a batch and can download it as an Excel file.'],
  ['Team', 'Operations Manager only: add people, change role, office and details, reset passwords, switch people on or off, download the team list.'],
  ['Logs', 'Operations Manager only: a record of every change - who did it, when, and what changed.'],
  ['Guide', 'This page.'],
  ['Bell (top right)', 'Shows new messages such as a new expense or advance. A pop-up appears when something new arrives.'],
  ['Your name (top right)', 'Opens My profile, where you can change your password.'],
];

const RULES = [
  ['Add an expense', 'Yes', 'Yes', 'Yes'],
  ['Submit own expenses for review', '-', '-', 'Yes'],
  ['Approve or reject expenses', 'Yes', '-', '-'],
  ['Edit or delete entries', 'Yes', '-', 'Own un-reviewed only'],
  ['Record funds received from Accounts', 'Yes', '-', '-'],
  ['Issue advance to Support Officer', 'Yes', 'Yes', '-'],
  ['Issue funds to the SSO', 'Yes', '-', '-'],
  ['Record cash returned', 'Yes', 'Yes', '-'],
  ['Submit to Accounts', 'Yes', 'Yes', 'Never'],
  ['Team management and Logs', 'Yes', '-', '-'],
  ['See both offices dashboard', 'Yes', 'Yes', 'Own only'],
];

const YOU = {
  om: 'You lead the process. Record funds received from Accounts, hand cash to the SSO or Support Officers, review and approve every expense, then submit approved expenses to Accounts. You also manage the team and can see the Logs.',
  sso: 'You run day-to-day cash: issue advances to Support Officers, record cash they return, add your own expenses and submit the approved batch to Accounts together with the Operations Manager. You can see both offices but you cannot approve, edit, delete or manage the team.',
  so: 'You spend from the advances issued to you. Add each expense, then press Submit expenses to hand them over for review. Only then does your advance reduce. You can never submit to Accounts yourself.',
};

export default async function GuidePage() {
  const user = await requireUser();
  return (
    <>
      <div className='head'>
        <div>
          <h1>Guide</h1>
          <p className='muted'>How PettyTrack works - what each heading means and who does what</p>
        </div>
      </div>

      <div className='card guide-you'>
        <h3>Your role: {ROLE_LABEL[user.role]}</h3>
        <p>{YOU[user.role]}</p>
      </div>

      <details className='card' open>
        <summary>The flow in one line</summary>
        <p className='flow'>Accounts sends funds, the Operations Manager records them as Advances, cash is issued to the team, expenses are added and submitted, the Operations Manager approves, and approved expenses are submitted back to Accounts. Accounts then reimburses, which is recorded as new Advances.</p>
      </details>

      <details className='card' open>
        <summary>Dashboard headings</summary>
        <div className='tablewrap'>
          <table>
            <thead><tr><th>Heading</th><th>What it means</th></tr></thead>
            <tbody>{TERMS.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className='card' open>
        <summary>Expense stages (the pipeline)</summary>
        <div className='tablewrap'>
          <table>
            <thead><tr><th>Stage</th><th>What it means</th></tr></thead>
            <tbody>{STAGES.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className='card'>
        <summary>Support Officer account (Zubair)</summary>
        <ul className='guide-list'>
          <li><b>Advances</b> - total cash issued to the Support Officer by the SSO or Operations Manager.</li>
          <li><b>Expenses</b> - everything spent so far, submitted or not.</li>
          <li><b>Advances Outstanding</b> - the advance still held at their end. It reduces only when they submit their expenses.</li>
          <li><b>CIH</b> - the cash physically in hand: Advances minus all Expenses.</li>
        </ul>
      </details>

      <details className='card'>
        <summary>Worked example</summary>
        <ol className='guide-list'>
          <li>Accounts sends PKR 100,000 (Petty Cash). The Operations Manager records it: Advances 100,000, CIH 100,000, Advances Outstanding 100,000.</li>
          <li>PKR 10,000 is issued to the Support Officer. The total CIH is unchanged, but With SO shows 10,000.</li>
          <li>The Support Officer spends 3,000 and adds the expenses: Expenses 3,000, CIH 97,000. The outstanding advance is still 100,000 and their own advance still shows 10,000.</li>
          <li>They submit the expenses. Their advance at their end falls to 7,000. The Operations Manager approves them.</li>
          <li>The Operations Manager or SSO submits the batch to Accounts: Submitted to Accounts 3,000 and Advances Outstanding falls to 97,000.</li>
          <li>Accounts reimburses 3,000, recorded as new Advances: CIH and Advances Outstanding are both back to 100,000.</li>
        </ol>
      </details>

      <details className='card'>
        <summary>Pages and menus</summary>
        <div className='tablewrap'>
          <table>
            <thead><tr><th>Where</th><th>What it does</th></tr></thead>
            <tbody>{PAGES.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className='card'>
        <summary>Who can do what</summary>
        <div className='tablewrap'>
          <table>
            <thead><tr><th>Action</th><th>Ops Manager</th><th>SSO</th><th>Support Officer</th></tr></thead>
            <tbody>{RULES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
