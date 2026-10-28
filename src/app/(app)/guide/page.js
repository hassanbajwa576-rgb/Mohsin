import { requireUser } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/fmt';
import { can, ROLE_PERMS } from '@/lib/perms';
import { PAGE_GROUPS, defaultPages } from '@/lib/pages';

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
  ['Expenses with no cash in hand', 'A Support Officer can record an expense even when no cash is left on the advance. Whatever the advances cannot cover is recorded without an advance behind it, and the expense still goes through review.'],
  ['One entry, even when paid from two advances', 'An expense taken from more than one advance is shown as a single entry with the full amount on the Expenses, Accounts and dashboard pages, and counted once.'],
  ['Paste from Excel', 'On Expenses, open "Paste from Excel" and paste your rows. You can paste the full sheet columns (Cost Center, Expense Type, Detail, Amount, Payment Mode, Office): the detail and amount are picked out, the category is guessed from the type, and an Office column (ISB or LHR) puts that row in that office. The Sr. Ops Manager and the Sr. Support Officer can also pick the office for a single expense.'],
  ['Names', 'Anywhere you type a name, the first letter of each word becomes a capital letter by itself.'],
];

// Only for the Sr. Ops Manager and the Sr. Support Officer (Accounts page).
const ACCOUNTS_NEW = [
  ['Search by amount', 'On Accounts, type an amount in the search box above the ready expenses to find it, tick it and submit.'],
];

const OM_PETTY = [
  ['Merge ticked into one entry', 'On Accounts, tick two or more ready expenses of the same person, office, fund and category and press "Merge ticked into one entry". They then show as one entry everywhere, including on the Support Officer\'s own account.'],
  ['Undo Today', 'On Accounts, "Undo today\'s changes" shows everything you did to expenses today (batches sent to Accounts, approvals, added, edited and deleted expenses) and puts it all back in one step. Nothing is lost: the Audit Log keeps a copy.'],
  ['Advance types', 'On Advances, the "Advance types" card lets you add another type (for example BOLDBus), rename one, or remove one that was never used. A new type shows in every dropdown and report straight away.'],
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

const VISIT_PLAN = [
  ['Expected visitors', 'Add a visitor before they come, with the day and time. The guard marks them Arrived or No show. Until then you can press Edit to change the name, who they meet, the office or the time, or Remove to cancel.'],
];
const VISIT_OM = [
  ['Remark tag', 'On a visitor you can set "Informed in WhatsApp by HR" or "Not informed in WhatsApp by HR", with a note, as a supporting record when HR missed the WhatsApp group.'],
];

const FUEL_NEW = [
  ['Fuel Entry and Fuel Log', 'Record fuel and top-ups against a fuel card, and look back at what was recorded. Which cards you see depends on your access.'],
];
const SUPPORT_NEW = [
  ['Support', 'Record a complaint, follow the list of all complaints and see the dashboard. The Sr. Ops Manager and the Sr. Support Officer also see By Person.'],
];

const EXPREV = [
  ['Dashboard', 'A grid like the workbook\'s Dashboard sheet: one row per cost center, a + to open the expense types under it, the subtotal, the advances and tax rows and the final total. The month headings stay under the top bar while you scroll. Choose All offices, LHR or ISB at the top; ISB and LHR totals by month are the last two rows.'],
  ['Expenditures', 'Every entry from the workbook, a page at a time, with quick ranges (this month, last month, this year, last year, all time), From and To dates, cost center, Office (LHR or ISB) and a search box.'],
  ['Budget vs Actual', 'Follows the workbook. For the months it has worked out (January to its last month) the budget, Actual by Ops and In QuickBooks are its own figures; later months show the budget only. It opens on year to date; use the month buttons or From and To. Variance is Budgeted minus Actual: red when over budget, green when under. Under the final total are "Variance with Budgeted" and "Variance with Bud + Non-Bud".'],
  ['Analysis', 'Total cost, Budgeted, LHR cost and ISB cost for the months you pick, a month-by-month chart and table with the LHR and ISB percentages, and every head with its total, share, LHR % and ISB %. Switches: With or Without BOLDBelief (it is not an operating cost); Split by headcount or As booked.'],
  ['Shared costs', 'BOLDBelief and Bank Fees can be divided between the offices by employees (active staff in the Attendance list). The Shared heads card at the bottom of Analysis chooses which heads are split. "As booked" keeps each cost with the office on its entry.'],
  ['Offices', 'An entry belongs to ISB when the Office column of the sheet says ISB; an entry with no office counts as LHR.'],
  ['Import', 'Upload the Ops Expenses Dashboard workbook after you update it. It replaces everything in ExpRev with what is in the file. Import is on the computer, not on the phone.'],
];

const PHONE = [
  ['Menu button', 'On a phone, Approvals, Team, Audit log and Guide are behind the Menu button next to Sign out.'],
  ['Wide tables', 'Wide grids, such as the ExpRev dashboard, scroll sideways with the names pinned on the left. Other lists turn into cards with every figure labelled.'],
];

const TEAM_PAGES = [
  ['Pages each person can open', 'On Team, press Edit on a person. "Pages this person can open" lists every module and page: untick one to hide it for them, tick one to add it. A page that needs a permission (for example Reports) switches that permission on when you save. Leave it unchanged to keep what their role gives.'],
  ['PK', 'Your office shows as PK in the top bar and on the welcome screen, because you cover both offices.'],
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
  // The pages this person can open: the ones picked for them on Team, otherwise what their role gives.
  const picked = isOM || !user.pagesList ? [] : user.pagesList;
  const allowed = picked.length ? picked : defaultPages(user.role, user.perms || [], ROLE_PERMS);
  const has = (h) => allowed.includes(h);
  const hasAny = (list) => list.some(has);
  const petty = hasAny(['/', '/expenses', '/advances', '/accounts']);
  const attend = hasAny(PAGE_GROUPS.find((g) => g.key === 'attendance').pages.map(([h]) => h));
  const visitors = hasAny(['/visitors', '/visitors/log']);
  const fuel = hasAny(['/fuel', '/fuel/log', '/fuel/setup']);
  const support = hasAny(['/support', '/support/new', '/support/list', '/support/people']);
  const exprev = isOM && hasAny(['/exprev', '/exprev/entries', '/exprev/budget', '/exprev/analysis', '/exprev/import']);
  const modules = [petty ? 'PettyTrack' : '', attend ? 'AttendTrack' : '', visitors ? 'VisitTrack' : '', fuel ? 'FuelTrack' : '', support ? 'Support' : '', exprev ? 'ExpRev' : ''].filter(Boolean);
  const mine = PAGE_GROUPS.map((g) => ({ label: g.label, names: g.pages.filter(([h]) => has(h)).map(([, l]) => l) })).filter((g) => g.names.length);
  const pages = PAGES.filter((p) => p.roles.includes(user.role)).map((p) => {
    let d = p.d;
    if (isSO && p.so) d = p.so;
    else if (!isOM && p.rest) d = p.rest;
    return [p.n, d];
  }).filter((r, i) => {
    const p = PAGES.filter((x) => x.roles.includes(user.role))[i];
    const need = { Dashboard: '/', Expenses: '/expenses', Advances: '/advances', Accounts: '/accounts', Team: '/team', 'Audit Log': '/logs', Approvals: '/approvals', Guide: '/guide' }[p.n];
    return !need || has(need);
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
        <p className='flow'>OpsTrack is AlphaBOLD Pakistan\'s operations app. You can open: {modules.length ? modules.join(', ') : 'the pages listed below'}. {petty ? 'PettyTrack handles petty cash, advances, expenses and submissions to Accounts. ' : ''}{attend ? 'AttendTrack records employee check in, check out and breaks. ' : ''}{visitors ? 'VisitTrack records office visitors. ' : ''}{fuel ? 'FuelTrack records fuel and top-ups. ' : ''}{support ? 'Support holds the Support team complaints and roster. ' : ''}{exprev ? 'ExpRev reviews expenditure, budget and cost by office. ' : ''}The switch next to the logo shows where you are.</p>
      </details>

      <details className='card' open>
        <summary>Pages you can open</summary>
        <Table head={['Module', 'Pages']} rows={mine.map((g) => [g.label, g.names.join(', ')])} />
        {isOM ? null : <p className='flow'>This list is set by the Sr. Ops Manager on the Team page. If you need another page, ask for it to be added.</p>}
      </details>

      <div className='card guide-you'>
        <h3>Your role: {ROLE_LABEL[user.role]}</h3>
        <p>{YOU[user.role]}</p>
      </div>

      {!isSO && petty ? (
        <details className='card' open>
          <summary>The flow in one line</summary>
          <p className='flow'>Accounts sends funds, the Sr. Ops Manager records them as Advances, cash is issued to the team, expenses are added and submitted, the Sr. Ops Manager approves, and approved expenses are submitted back to Accounts. Accounts then reimburses, which is recorded as new Advances.</p>
        </details>
      ) : null}

      {petty ? (
        <>
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
        </>
      ) : null}

      {attend ? (
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
      ) : null}

      {petty ? (
        <details className='card'>
          <summary>What is new in PettyTrack</summary>
          <Table
            head={['Feature', 'What it means']}
            rows={[
              ...CASH_NEW.filter((r) => (r[0] !== 'Approvals page' || isOM) && (r[0] !== 'Paste from Excel' || has('/expenses'))),
              ...(has('/accounts') ? ACCOUNTS_NEW : []),
              ...(isOM ? OM_PETTY : []),
            ]}
          />
        </details>
      ) : null}

      {attend ? (
        <details className='card'>
          <summary>What is new in AttendTrack</summary>
          <Table
            head={['Feature', 'What it means']}
            rows={ATT_NEW.filter((r) => {
              const need = { 'Add Entry': '/attendance', Entries: '/attendance/entries', "Today's board and Dashboard": '/attendance/board', 'Day log': '/attendance/logs', 'Reports and Analysis': '/attendance/reports', 'Import from Excel': '/attendance/import', Reconciliation: '/attendance/reconcile' }[r[0]];
              return (!need || has(need)) && (r[0] !== 'Import from Excel' || can(user, 'att_import')) && (r[0] !== 'Reconciliation' || can(user, 'att_reconcile'));
            })}
          />
        </details>
      ) : null}

      {visitors ? (
        <details className='card'>
          <summary>VisitTrack (visitors)</summary>
          <Table
            head={['Feature', 'What it means']}
            rows={[
              ...VISIT_NEW.filter((r) => r[0] !== 'Visitor Log' || has('/visitors/log')),
              ...(user.role !== 'guard' && has('/visitors') ? VISIT_PLAN : []),
              ...(isOM ? VISIT_OM : []),
            ]}
          />
        </details>
      ) : null}

      {fuel ? (
        <details className='card'>
          <summary>FuelTrack</summary>
          <Table head={['Feature', 'What it means']} rows={FUEL_NEW} />
        </details>
      ) : null}

      {support ? (
        <details className='card'>
          <summary>Support</summary>
          <Table head={['Feature', 'What it means']} rows={SUPPORT_NEW} />
        </details>
      ) : null}

      {exprev ? (
        <details className='card' open>
          <summary>ExpRev (expenditure review)</summary>
          <Table head={['Page', 'What it does']} rows={EXPREV.filter((r) => ({ Dashboard: '/exprev', Expenditures: '/exprev/entries', Budget: '/exprev/budget', Analysis: '/exprev/analysis', Shared: '/exprev/analysis', Import: '/exprev/import' }[r[0].split(' ')[0]] ? has({ Dashboard: '/exprev', Expenditures: '/exprev/entries', Budget: '/exprev/budget', Analysis: '/exprev/analysis', Shared: '/exprev/analysis', Import: '/exprev/import' }[r[0].split(' ')[0]]) : true))} />
        </details>
      ) : null}

      {attend && (has('/attendance/hk-roster') || has('/attendance/hk-roster/request')) ? (user.role === 'om' || user.role === 'sso') && has('/attendance/hk-roster') ? (
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
      ) : null}

      <details className='card'>
        <summary>On your phone</summary>
        <Table head={['Feature', 'What it means']} rows={isOM ? [...PHONE, ...TEAM_PAGES] : PHONE} />
      </details>

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
