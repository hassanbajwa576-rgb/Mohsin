import { requireUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/fmt';
import { can } from '@/lib/perms';

const TERMS_OPS = [
  ['Advances', 'Funds received from the Accounts team (Petty Cash, BRC and Others). It counts the money that came in during the period you selected.'],
  ['Expenses', 'Everything spent and recorded, excluding rejected items. It counts spending dated inside the selected period.'],
  ['CIH', 'Cash In Hand: the cash that should be available today. It is all Advances minus all Expenses, up to the end of the selected period. The three lines under it show who is holding the cash.'],
  ['Advances Outstanding', 'Advances not yet cleared with Accounts: Advances minus the expenses already submitted to Accounts. It goes down only when a batch is submitted to Accounts, not when money is spent.'],
  ['Submitted to Accounts', 'Expenses already sent to Accounts in a batch. This is the amount that clears the outstanding advance.'],
  ['With Sr. Ops Manager / Sr. SO / SO', 'Where the CIH physically sits: still with the Sr. Ops Manager, handed to the Sr. SO, or issued to a Support Officer and not yet spent.'],
];

const TERMS_SO = [
  ['Advances', 'Cash issued to you by the Sr. Support Officer or the Sr. Ops Manager.'],
  ['Expenses', 'Everything you have spent and recorded so far, whether submitted yet or not.'],
  ['Advances Outstanding', 'The advance still held at your end. It reduces only when you submit your expenses.'],
  ['CIH', 'Cash In Hand: the cash you should physically have now. It is your Advances minus all your Expenses.'],
];

const STAGES = [
  ['Not yet submitted', 'The Support Officer has added the expense but is still holding it. It counts against their advance until they submit.'],
  ['Awaiting SOM review', 'Submitted by the Support Officer (or added by the Sr. SO). The Sr. Ops Manager reviews it and approves or rejects it.'],
  ['Ready for Accounts', 'Approved by the Sr. Ops Manager. It waits to be included in the next batch for Accounts.'],
  ['Sent to Accounts', 'Included in a batch submitted to Accounts. This is final.'],
  ['Rejected', 'Turned down by the Sr. Ops Manager. It is ignored in every total.'],
];

const CASH_NEW = [
  ['Paid from', 'A Support Officer picks Petty Cash or BRC when adding an expense. The expense is taken from the oldest advance first and, if one advance is not enough, from the next one. The Sr. Ops Manager sees it as one line with the total.'],
  ['Cash in hand colours', 'Cash in hand shows in red on a light red background when a person holds less than 20% of the cash issued to them, and in green when they hold 20% or more. It appears on the dashboard, the Advances page and the Support Officer dashboard.'],
  ['Approvals page', 'The Sr. Ops Manager sees everything waiting for a decision on one page: expenses, time off requests and visitor delete requests. The number next to Approvals in the top bar shows how many are waiting.'],
];

const ATT_NEW = [
  ['Add Entry', 'Pick the office, the entry type and the employee, then add it. Tick "Include employees from the other office" to record a visiting employee. The entry is counted at the office where the person is working that day.'],
  ['Entries', 'The entries you can still change or delete, with Office and Department filters.'],
  ["Today's board and Dashboard", 'Who is on duty, on a break or out, with a Department filter. A visiting employee shows in the office they checked in at.'],
  ['Day log', 'Every entry of one day. Filter by office, department or employee name. Imported times are underlined.'],
  ['Reports and Analysis', 'One row per shift, with filters for period, office, departments and a single employee. Excel and CSV downloads use the same filters. A check in with no check out shows as "no check out" with no worked hours.'],
  ['Import from Excel', 'For people with Import access. Upload the weekly attendance sheet and the break timing sheet and choose the dates. You see a preview first: times that already match are left alone, missing times are added, and days with different times need your decision. Days you do not settle stay on a Needs review list with a count on the Employees tab. Times that came from Excel are underlined.'],
  ['Reconciliation', 'For people with Reconciliation access. It lists shifts over 16 hours, check ins with no check out and entries that do not fit together. Press Review to correct the entries in a popup, then Mark reviewed so the item does not come up again.'],
];

const VISIT_NEW = [
  ['Visitor Entry', 'Record who came, their type of visit (Candidate, Bank visit, Associate, Client, Vendor, Delivery, Ex-Employee, Guest or Other), who they are meeting and the time in. Everyone who uses the app can do this for their own office.'],
  ['Inside now', 'Everyone still in the office, with how long they have been there and a Check out button.'],
  ['Visitor Log', 'For the Sr. Ops Manager, the Sr. Support Officer and anyone given Visitor log access: every visitor with the time spent, filters, totals and an Excel download.'],
  ['Changing a record', 'The person who checked a visitor in can edit the record for 36 hours. To delete one, they send a request with a reason, and it is deleted only after the Sr. Ops Manager approves it.'],
];

const ROSTER_NEW = [
  ['Roster', 'The Support team time off grid for the month: who is off and when, with PTO, PTO-M, Bereavement PTO, C-PTO, Unpaid and Other types. Time off can be in days or in hours. The list at the top shows who is off in the next 14 days and upcoming birthdays.'],
  ['Time Off Request', 'Anyone can ask for time off for a Support team member. The Sr. Ops Manager or the Sr. Support Officer approves or declines it and you are told the result.'],
  ['Time-off Balance', 'Days used and days left for each person against the yearly allowance, plus a yearly summary per type. Hours count as part of a day and holidays are not counted. Nothing carries forward.'],
  ['OPD', 'Every Support team member has Rs 120,000 of OPD a year (1 January to 31 December, no carry forward). Claims are recorded with the amount and the available balance updates. The Sr. Ops Manager and the Sr. Support Officer are alerted at 80% used and when the limit is reached.'],
  ['Setup', 'Yearly allowances, hours in one working day, the minimum people in for each office, and the holidays. A day with fewer people than the minimum is marked red on the roster.'],
  ['Support team details', 'Name, role, phone, joining date and birthday for each team member, with Edit and Remove.'],
];

const ALL = ['om', 'sso', 'so'];
const PAGES = [
  { n: 'Dashboard', roles: ALL, d: 'The overall picture: headline numbers, each fund, the expense pipeline, what needs your attention, charts and recent expenses. Use the Year and Month filter to look at a period.', so: 'Your advances, your expenses and what is waiting to be submitted or reviewed.' },
  { n: 'Expenses', roles: ALL, d: 'Add expenses and follow them through the stages. Filter by office, stage, fund and month. The Sr. Ops Manager reviews, edits and deletes here.', so: 'Add each expense you make, and press Submit expenses to hand them over for review. You can remove an expense until it is reviewed.' },
  { n: 'Advances', roles: ALL, d: 'Top part: funds received from Accounts. Bottom part: cash issued to team members, what they have spent and what is still in their hand.', so: 'The advances issued to you, how much you have spent from each and what is left in your hand.' },
  { n: 'Accounts', roles: ['om', 'sso'], d: 'Approved expenses wait here. The Sr. Ops Manager or the Sr. Support Officer submits them to Accounts as a batch and can download it as an Excel file.' },
  { n: 'Team', roles: ['om'], d: 'Sr. Ops Manager only: add people, change role, office and details, reset passwords, switch people on or off, download the team list.' },
  { n: 'Audit Log', roles: ['om'], d: 'Sr. Ops Manager only: a record of every change - who did it, when, and what changed.' },
  { n: 'Approvals', roles: ['om'], d: 'Sr. Ops Manager only: everything waiting for your decision in one place, with a count in the top bar.' },
  { n: 'Guide', roles: ALL, d: 'This page.' },
  { n: 'Bell (top right)', roles: ALL, d: 'Shows new messages such as a new expense or advance. A pop-up appears when something new arrives.' },
  { n: 'Your name (top right)', roles: ALL, d: 'Opens My profile, where you can change your password.', rest: 'Opens My profile, where you can see your details.' },
];

const RULES = [
  ['Add an expense', 'Yes', 'Yes', 'Yes'],
  ['Submit own expenses for review', '-', '-', 'Yes'],
  ['Approve or reject expenses', 'Yes', '-', '-'],
  ['Edit or delete entries', 'Yes', '-', 'Own un-reviewed only'],
  ['Record funds received from Accounts', 'Yes', '-', '-'],
  ['Issue advance to Support Officer', 'Yes', 'Yes', '-'],
  ['Issue funds to the Sr. SO', 'Yes', '-', '-'],
  ['Record cash returned', 'Yes', 'Yes', '-'],
  ['Submit to Accounts', 'Yes', 'Yes', '-'],
  ['Team management and Audit Log', 'Yes', '-', '-'],
  ['Approvals page', 'Yes', '-', '-'],
  ['Support roster, time off balance and OPD', 'Yes', 'Yes', '-'],
  ['Ask for time off', 'Yes', 'Yes', 'Yes'],
  ['Record visitors', 'Yes', 'Yes', 'Yes'],
  ['See both offices dashboard', 'Yes', 'Yes', 'Own only'],
];

const YOU = {
  om: 'You lead the process. Record funds received from Accounts, hand cash to the Sr. SO or Support Officers, review and approve every expense, then submit approved expenses to Accounts. You also manage the team, see the Audit Log and the Approvals page, and approve time off, visitor delete requests and OPD alerts.',
  sso: 'You run day-to-day cash: issue advances to Support Officers, record cash they return, add your own expenses and submit the approved batch to Accounts together with the Sr. Ops Manager. You can see both offices but you cannot approve, edit, delete or manage the team.',
  so: 'You spend from the advances issued to you. Add each expense, then press Submit expenses to hand them over for review. Only then does your advance reduce.',
};

const EXAMPLE_OPS = [
  'Accounts sends PKR 100,000 (Petty Cash). The Sr. Ops Manager records it: Advances 100,000, CIH 100,000, Advances Outstanding 100,000.',
  'PKR 10,000 is issued to the Support Officer. The total CIH is unchanged, but With SO shows 10,000.',
  'The Support Officer spends 3,000 and adds the expenses: Expenses 3,000, CIH 97,000. The outstanding advance is still 100,000 and their own advance still shows 10,000.',
  'They submit the expenses. Their advance at their end falls to 7,000. The Sr. Ops Manager approves them.',
  'The Sr. Ops Manager or Sr. SO submits the batch to Accounts: Submitted to Accounts 3,000 and Advances Outstanding falls to 97,000.',
  'Accounts reimburses 3,000, recorded as new Advances: CIH and Advances Outstanding are both back to 100,000.',
];

const EXAMPLE_SO = [
  'You are issued PKR 10,000. Advances 10,000, CIH 10,000, Advances Outstanding 10,000.',
  'You spend 3,000 and add the expenses. Expenses 3,000, CIH 7,000. Advances Outstanding is still 10,000 because they are not submitted yet.',
  'You press Submit expenses. Advances Outstanding falls to 7,000, which matches your CIH.',
  'The Sr. Ops Manager reviews and approves them. If one is rejected you will see it in your list with a note.',
];

function Table({ head, rows }) {
  return (
    <div className='tablewrap'>
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>{r.map((c, i) => (i === 0 ? <td key={i}><b>{c}</b></td> : <td key={i}>{c}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function GuidePage() {
  const user = await requireUser();
  const isSO = user.role === 'so';
  const isOM = user.role === 'om';
  const pages = PAGES.filter((p) => p.roles.includes(user.role)).map((p) => {
    let d = p.d;
    if (isSO && p.so) d = p.so;
    else if (!isOM && p.rest) d = p.rest;
    return [p.n, d];
  });

  return (
    <>
      <div className='head'>
        <div>
          <h1>Guide</h1>
          <p className='muted'>{isSO ? 'How OpsTrack works for you' : 'How OpsTrack works - what each heading means and who does what'}</p>
        </div>
      </div>

      <details className='card' open>
        <summary>About OpsTrack</summary>
        <p className='flow'>OpsTrack has three modules. PettyTrack handles petty cash, advances, expenses and submissions to Accounts. AttendTrack records employee check in, check out and breaks, and holds the Support team roster. VisitTrack records office visitors. The switch next to the logo shows where you are. On a wide screen, Approvals, Team, Audit Log and Guide are in the top bar.</p>
      </details>

      <div className='card guide-you'>
        <h3>Your role: {ROLE_LABEL[user.role]}</h3>
        <p>{YOU[user.role]}</p>
      </div>

      {!isSO ? (
        <details className='card' open>
          <summary>The flow in one line</summary>
          <p className='flow'>Accounts sends funds, the Sr. Ops Manager records them as Advances, cash is issued to the team, expenses are added and submitted, the Sr. Ops Manager approves, and approved expenses are submitted back to Accounts. Accounts then reimburses, which is recorded as new Advances.</p>
        </details>
      ) : null}

      <details className='card' open>
        <summary>{isSO ? 'Your dashboard headings' : 'Dashboard headings'}</summary>
        <Table head={['Heading', 'What it means']} rows={isSO ? TERMS_SO : TERMS_OPS} />
      </details>

      <details className='card' open>
        <summary>Expense stages (the pipeline)</summary>
        <Table head={['Stage', 'What it means']} rows={STAGES} />
      </details>

      <details className='card'>
        <summary>Worked example</summary>
        <ol className='guide-list'>
          {(isSO ? EXAMPLE_SO : EXAMPLE_OPS).map((s) => <li key={s}>{s}</li>)}
        </ol>
      </details>

      <details className='card'>
        <summary>Attendance entries (AttendTrack)</summary>
        <Table
          head={['Entry', 'What it means']}
          rows={[
            ['Check In', 'The employee arrives and starts work. Status becomes On duty.'],
            ['Break Out', 'The employee goes out for a break. Status becomes On break.'],
            ['Break In', 'The employee comes back from the break. Status becomes On duty again.'],
            ['Check Out', 'The employee finishes work and leaves. Status becomes Off duty.'],
          ]}
        />
      </details>

      <details className='card'>
        <summary>What is new in PettyTrack</summary>
        <Table head={['Feature', 'What it means']} rows={isOM ? CASH_NEW : CASH_NEW.filter((r) => r[0] !== 'Approvals page')} />
      </details>

      <details className='card'>
        <summary>What is new in AttendTrack</summary>
        <Table head={['Feature', 'What it means']} rows={ATT_NEW.filter((r) => (r[0] !== 'Import from Excel' || can(user, 'att_import')) && (r[0] !== 'Reconciliation' || can(user, 'att_reconcile')))} />
      </details>

      <details className='card'>
        <summary>VisitTrack (visitors)</summary>
        <Table head={['Feature', 'What it means']} rows={VISIT_NEW} />
      </details>

      {user.role === 'om' || user.role === 'sso' ? (
        <details className='card'>
          <summary>Support team roster, time off and OPD</summary>
          <p className='flow'>Only the Sr. Ops Manager and the Sr. Support Officer can see the roster, balances, OPD and setup.</p>
          <Table head={['Feature', 'What it means']} rows={ROSTER_NEW} />
        </details>
      ) : (
        <details className='card'>
          <summary>Time off requests</summary>
          <p className='flow'>Use the Time Off Request tab in AttendTrack to ask for time off for a Support team member. The Sr. Ops Manager or the Sr. Support Officer approves or declines it and you are told the result.</p>
        </details>
      )}

      <details className='card'>
        <summary>Pages and menus</summary>
        <Table head={['Where', 'What it does']} rows={pages} />
      </details>

      {isOM ? (
        <details className='card'>
          <summary>Who can do what</summary>
          <Table head={['Action', 'Sr. Ops Manager', 'Sr. SO', 'Support Officer']} rows={RULES} />
        </details>
      ) : null}
    </>
  );
}
