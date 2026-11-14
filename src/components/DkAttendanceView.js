import Link from 'next/link';
import { hm, OT_BLOCK_H } from '@/lib/dk-hours';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import DkPersonPicker from '@/components/DkPersonPicker';
import OfficeTag from '@/components/OfficeTag';
import DkRefresh from '@/components/DkRefresh';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // one letter in the grid header keeps the columns narrow
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const h1 = (v) => String(Math.round(v * 10) / 10);
const pct = (m) => Math.max(0, Math.min(100, (m / 720) * 100)); // the bar runs 0 to 12 hours; the line sits at 8

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'dka-kpi' + (tone ? ' ' + tone : '')}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function DkAttendanceView({ sp, month, prev, next, who, team, people, om, convert, save, clear, fix, today, view, from, to, custom, dates, siteDays, siteOpts, siteStats, multi, canAll = false, leaveDays = {}, leaveCount = {}, plan = {}, planView = null, hasPlan = false }) {
  const qs = (o) => {
    const e = { ...(custom ? { from, to } : { m: month }), ...(view !== 'grid' ? { v: view } : {}), ...(who ? { who: String(who) } : {}), ...o };
    return new URLSearchParams(Object.entries(e).filter(([, x]) => x !== '')).toString();
  };
  const multiSet = new Set(multi);
  const tTotal = people.reduce((a, p) => a + p.total, 0);
  const tOver = people.reduce((a, p) => a + p.over, 0);
  const tShort = people.reduce((a, p) => a + p.short, 0);
  const tLeft = people.reduce((a, p) => a + p.bank.left, 0);
  const tDays = people.reduce((a, p) => a + p.bank.days, 0);
  const open = true;
  const period = custom ? from + ' to ' + to : month;
  const per = custom ? 'in this period' : 'this month';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Attendance</h1>
          <p className='muted'>Duty hours per day from the facial attendance app (or typed in by hand). <b className='dka-t g'>Green</b> is a full duty day or more (8 hours, or the person's own duty hours), <b className='dka-t r'>red</b> is under it. Time beyond the duty hours is overtime; every {OT_BLOCK_H} overtime hours convert to 1 PTO day. Click a name to see check in and check out times.</p>
        </div>
        <DkRefresh back='attendance' canAll={canAll} from={from} to={to} />
      </div>
      <Flash sp={sp} />

      <div className='chips dka-tabs'>
        {[['grid', 'Overview'], ['sites', 'Days per site'], ...(hasPlan ? [['plan', 'Plan vs actual']] : []), ['ot', 'Overtime and PTO']].map(([k, l]) => <Link key={k} className={'chip' + (view === k ? ' on' : '')} href={'?' + qs({ v: k === 'grid' ? '' : k })}>{l}</Link>)}
      </div>

      <div className='chips' style={{ marginBottom: 12, alignItems: 'center' }}>
        {custom ? (
          <>
            <b style={{ padding: '0 8px' }}>{from} to {to}</b>
            <Link className='chip' href={'?' + new URLSearchParams(Object.entries({ m: month, ...(view !== 'grid' ? { v: view } : {}), ...(who ? { who: String(who) } : {}) })).toString()}>Back to months</Link>
          </>
        ) : (
          <>
            <Link className='chip' href={'?' + qs({ m: prev })}>&larr; {prev}</Link>
            <b style={{ padding: '0 8px' }}>{month}</b>
            <Link className='chip' href={'?' + qs({ m: next })}>{next} &rarr;</Link>
          </>
        )}
        <DkPersonPicker people={team.map((p) => ({ id: p.id, name: p.name, href: '?' + qs({ who: String(p.id) }) }))} selected={who} everyoneHref={'?' + qs({ who: '' })} />
        <form method='get' className='dka-range' title='Show custom dates'>
          {view !== 'grid' ? <input type='hidden' name='v' value={view} /> : null}
          {who ? <input type='hidden' name='who' value={who} /> : null}
          <label>From<input type='date' name='from' required defaultValue={from} /></label>
          <label>To<input type='date' name='to' required defaultValue={to} /></label>
          <button type='submit' className='btn'>Show</button>
        </form>
      </div>

      <details id='addtime' className='dka-card' open={!!fix.p}>
        <summary>+ Add or correct a time by hand</summary>
        <p className='muted' style={{ margin: '8px 0' }}>For when the facial app has no time or a wrong one. A time typed here replaces the facial-app time for that day; leave a field empty to keep the facial-app value. It is saved separately, so the facial app never overwrites it, and it counts as present on the roster. For an incharge who works at several sites, also pick the site they were at that day (the site alone can be saved without any time).</p>
        <form action={save} className='dka-form'>
          <input type='hidden' name='m' value={month} />
          {custom ? <input type='hidden' name='from' value={from} /> : null}
          {custom ? <input type='hidden' name='to' value={to} /> : null}
          <input type='hidden' name='v' value={view === 'grid' ? '' : view} />
          <label>Team member
            <select name='id' required defaultValue={fix.p || ''}>
              <option value='' disabled>Pick a person</option>
              {team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Date<input type='date' name='day' required max={today} defaultValue={fix.d || ''} /></label>
          <label>Check in<input type='time' name='in' defaultValue={fix.in || ''} /></label>
          <label>Check out<input type='time' name='out' defaultValue={fix.out || ''} /></label>
          {siteOpts.length ? (
            <label>Site (incharges)
              <select name='site' defaultValue={fix.site || ''}>
                <option value=''>No change</option>
                {siteOpts.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value='-'>Remove the site</option>
              </select>
            </label>
          ) : null}
          <label style={{ flex: '1 1 180px' }}>Note (optional)<input name='note' maxLength={200} placeholder='e.g. facial app was down' defaultValue={fix.note || ''} /></label>
          <button type='submit' className='btn'>Save time</button>
        </form>
      </details>

      {people.length ? (
        <>
          {view === 'grid' ? (
            <>
          <div className='dka-kpis'>
            <Kpi label='Team duty time' value={hm(tTotal)} sub={people.length + ' ' + (people.length === 1 ? 'person' : 'people') + ' ' + (custom ? 'in this period' : 'in ' + month)} />
            <Kpi label={'Overtime ' + per} value={tOver ? hm(tOver) : '-'} sub='time beyond 8 h a day' tone={tOver ? 'good' : ''} />
            <Kpi label={'Short ' + per} value={tShort ? hm(tShort) : '-'} sub='time under 8 h a day' tone={tShort ? 'bad' : ''} />
            <Kpi label='Overtime to convert' value={h1(tLeft) + ' h'} sub={tDays ? '= ' + tDays + ' PTO day' + (tDays === 1 ? '' : 's') + ' ready' : 'under ' + OT_BLOCK_H + ' h each'} tone={tDays ? 'good' : ''} />
          </div>

          
          <div className='dkg-wrap'>
            <table className='dkg'>
              <thead>
                <tr>
                  <th className='rn'>Team member</th>
                  {dates.map((key) => <th key={key} title={DOW[dow(key)] + ' ' + key.slice(8)} className={(dow(key) === 0 || dow(key) === 6 ? 'we ' : '') + (key === today ? 'tod' : '')}>{custom && (key === dates[0] || key.slice(8) === '01') ? <span className='mo'>{MON[Number(key.slice(5, 7)) - 1]}</span> : null}{Number(key.slice(8))}<small>{DOW1[dow(key)]}</small></th>)}
                  <th className='sum' title='Days with a check in'>Days</th>
                  <th className='sum' title='Full days of approved leave'>Leave</th>
                  <th className='sum' title='Total duty time'>Total</th>
                  <th className='sum' title='Overtime (time beyond 8 hours a day)'>OT</th>
                  <th className='sum' title='Short (time under 8 hours a day)'>Short</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const by = new Map(p.days.map((d) => [d.day, d]));
                  return (
                    <tr key={p.id}>
                      <td className='rn'>
                        {p.site ? <span title={(p.codes || []).join(' \u00b7 ')}><OfficeTag o={p.site} /></span> : null}
                        <Link href={'?' + qs({ who: String(p.id) })} title='Open the in and out times of this person'><b>{p.name}</b></Link>
                      </td>
                      {dates.map((key) => {
                        const d = by.get(key);
                        const lv = leaveDays[p.id + '|' + key];
                        const pl = plan[p.id + '|' + key]; // where the rotation puts this person today (a site code, or T for a travel-only day)
                        const we = dow(key) === 0 || dow(key) === 6;
                        const site = multiSet.has(p.id) ? siteDays[p.id + '|' + key] : '';
                        let cls = '';
                        let txt = '';
                        let tip = p.name + ', ' + DOW[dow(key)] + ' ' + key.slice(8) + (site ? ' at ' + site : '');
                        if (d) {
                          if (d.mins == null) {
                            cls = 'am';
                            txt = '..';
                            tip += ': in ' + d.check_in + ', no check out yet';
                          } else {
                            cls = d.mins >= d.duty ? 'g' : 'r';
                            txt = (d.mins / 60).toFixed(1);
                            tip += ': ' + d.check_in + ' to ' + d.check_out + ' = ' + hm(d.mins) + (d.mins > d.duty ? ' (+' + hm(d.mins - d.duty) + ' overtime)' : '');
                          }
                          tip += d.manual ? ' (typed by hand' + (d.note ? ': ' + d.note : '') + ')' : ' (facial app)';
                        } else if (lv && lv.hours == null) {
                          cls = 'lv';
                          txt = 'L';
                          tip += ': on leave (' + lv.label + ')';
                        } else {
                          if (site) cls = 'sg';
                          if (key <= today) tip += ': no time. Click to add one.';
                        }
                        // Rotation: planned site shown in the tip; a check-in at another site than planned gets an amber outline; a planned travel-only day with no time shows T.
                        let mismatch = false;
                        if (pl) {
                          tip += '. Planned: ' + (pl === 'T' ? 'travel-only day' : pl);
                          if (d && pl !== 'T' && site && site !== pl) { mismatch = true; tip += ' (was at ' + site + ')'; }
                          if (!d && !lv && pl === 'T') cls = 'tv';
                        }
                        if (lv && d) tip += '. Also on leave' + (lv.hours != null ? ' for ' + lv.hours + ' h' : '') + ' (' + lv.label + ')';
                        if (lv && !d && lv.hours != null) tip += '. Leave for ' + lv.hours + ' h (' + lv.label + ')';
                        return (
                          <td key={key} className={'c ' + cls + (we ? ' we' : '') + (d && d.manual ? ' man' : '') + (mismatch ? ' pm' : '')} title={tip}>
                            {key <= today ? <Link href={'?' + qs({ p: String(p.id), d: key }) + '#addtime'}>{pl && !d && !lv ? <span className='plc'>{pl}</span> : <>{txt || (site ? '' : '\u00a0')}{site ? <small className='st'>{site}</small> : null}</>}</Link> : pl && !lv ? <span className='plc fut'>{pl}</span> : null}
                          </td>
                        );
                      })}
                      <td className='sum'>{p.present || '-'}</td>
                      <td className='sum'>{leaveCount[p.id] || '-'}</td>
                      <td className='sum'>{p.total ? h1(p.total / 60) : '-'}</td>
                      <td className={'sum' + (p.over ? ' dka-t g' : '')}>{p.over ? h1(p.over / 60) : '-'}</td>
                      <td className={'sum' + (p.short ? ' dka-t r' : '')}>{p.short ? h1(p.short / 60) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className='dkg-legend'>
            <span><i className='g' />8 h or more</span>
            <span><i className='r' />under 8 h</span>
            <span><i className='lv' />L = on leave</span>
            <span><i className='tv' />T = travel-only day (rotation)</span>
            <span><i className='pm' />checked in at another site than planned</span>
            <span><i className='am' />no check out yet</span>
            <span><i className='man' />typed by hand</span>
            <span><i className='sg' />site only, no time</span>
            <span className='muted'>Numbers are duty hours; the small code under them is the site an incharge was at. Click any day to add or correct a time or pick a site; click a name for in and out times. Totals are in hours.</span>
          </div>

          {who ? <h2 className='dka-h'>In and out times</h2> : null}
          {who ? people.map((p) => (
            <details key={p.id} className='dka-person' open={open}>
              <summary>
                <b>{p.name}</b>
                {p.site ? <span title={(p.codes || []).join(' \u00b7 ')}><OfficeTag o={p.site} /></span> : null}
                <span className='dka-stat'>{p.present} day{p.present === 1 ? '' : 's'}</span>
                <span className='dka-stat'>{hm(p.total)} total</span>
                {p.over ? <span className='dka-stat dka-t g'>+{hm(p.over)} overtime</span> : null}
                {p.short ? <span className='dka-stat dka-t r'>-{hm(p.short)} short</span> : null}
              </summary>
              <div className='dka-row dka-head'>
                <span>Date</span><span>Check in &rarr; out</span><span>Duty time (line = 8 h)</span><span>Overtime</span><span>Source</span><span></span>
              </div>
              {p.days.map((d) => {
                const tone = d.mins == null ? '' : d.mins >= d.duty ? 'g' : 'r';
                return (
                  <div key={d.day} className='dka-row'>
                    <span className='dka-date'><b>{d.day.slice(8)}</b> {DOW[dow(d.day)]}</span>
                    <span className='dka-times'>
                      <small className='dklbl'>In </small>{d.check_in || '-'} <i>&rarr;</i> <small className='dklbl'>Out </small>{d.check_out || <span className='dka-pill warn'>No check out</span>}
                    </span>
                    <span className='dka-barcell'>
                      {d.mins == null ? <span className='muted'>-</span> : (
                        <>
                          <span className='dka-bar'><i className={'dka-f ' + tone} style={{ width: pct(d.mins) + '%' }} /><u /></span>
                          <span className={'dka-t ' + tone}>{hm(d.mins)}</span>
                        </>
                      )}
                    </span>
                    <span className='dka-ot'>{d.mins != null && d.mins > d.duty ? <span className='dka-pill ok'>+{hm(d.mins - d.duty)}</span> : <span className='muted'>-</span>}</span>
                    <span className='dka-src'>
                      <span className={'dka-pill' + (d.manual ? ' man' : '')}>{d.manual ? (d.app_in || d.app_out ? 'App + manual' : 'Manual') : 'Facial app'}</span>
                      {d.manual && d.note ? <small className='muted'>{d.note}</small> : null}
                    </span>
                    <span className='dka-act'>
                      <Link href={'?' + qs({ p: String(p.id), d: d.day }) + '#addtime'}>{!d.check_out ? 'Add time' : 'Edit'}</Link>
                      {d.manual ? (
                        <form action={clear}>
                          <input type='hidden' name='id' value={p.id} />
                          <input type='hidden' name='day' value={d.day} />
                          <ConfirmButton className='btn sm' message={'Remove the hand-typed time of ' + p.name + ' on ' + d.day + '?'}>Remove</ConfirmButton>
                        </form>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </details>
          )) : null}

            </>
          ) : null}
          {view === 'ot' ? (
            <>
          <h2 className='dka-h'>Overtime and PTO</h2>
          <div className='rostable'>
            <table className='tx dka-sum'>
              <thead><tr><th>Team member</th><th>Overtime {per}</th><th>Already converted</th><th>Available overtime</th><th></th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className='c-title'><b>{p.name}</b>{p.site ? <span title={(p.codes || []).join(' \u00b7 ')}><OfficeTag o={p.site} /></span> : null}</td>
                    <td className={'c-meta dka-t ' + (p.over ? 'g' : '')}><small className='dklbl'>Overtime </small>{p.over ? hm(p.over) : '-'}</td>
                    <td className='c-meta'><small className='dklbl'>Converted </small>{p.bank.used ? h1(p.bank.used) + ' h' : '-'}</td>
                    <td className='c-meta'><small className='dklbl'>Available </small><b>{h1(p.bank.left)} h</b>{p.bank.days ? <span className='dka-pill ok'>= {p.bank.days} PTO day{p.bank.days === 1 ? '' : 's'}</span> : null}</td>
                    <td>
                      {om && p.bank.days >= 1 ? (
                        <form action={convert}>
                          <input type='hidden' name='id' value={p.id} />
                          <input type='hidden' name='m' value={month} />
                          <ConfirmButton className='btn' message={'Convert ' + p.bank.days * OT_BLOCK_H + ' overtime hours of ' + p.name + ' to ' + p.bank.days + ' PTO day(s)?'}>Convert to PTO</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          ) : null}
        </>
      ) : null}
      {view === 'sites' ? (
        <>
          <h2 className='dka-h'>Days per site</h2>
          {siteStats.length ? (
            <>
              <p className='muted' style={{ margin: '0 0 10px' }}>For people who work at several sites: the days {custom ? 'from ' + from + ' to ' + to : 'of ' + month} they spent at each site, as picked on the Overview (click a day and choose the site). {siteStats.some((r) => r.unset) ? 'Days they were present but no site was picked show under Not set.' : ''}</p>
              <div className='rostable'>
                <table className='tx dka-sum'>
                  <thead><tr><th>Team member</th>{siteOpts.map((c) => <th key={c}>{c}</th>)}<th>Days with a site</th><th>Not set</th><th title='Travel-only days in the rotation'>Travel days (plan)</th></tr></thead>
                  <tbody>
                    {siteStats.map((r) => (
                      <tr key={r.id}>
                        <td className='c-title'><b>{r.name}</b></td>
                        {siteOpts.map((c) => (
                          <td key={c} className={'c-meta' + (c in r.counts ? '' : ' hide-m')}>
                            <small className='dklbl'>{c} </small>
                            {c in r.counts ? <b className={'dka-days' + (r.counts[c] ? ' on' : '')}>{r.counts[c]}</b> : <span className='muted'>-</span>}{r.plan && c in r.counts ? <small className='muted'> of {r.plan.counts[c] || 0} planned</small> : null}
                          </td>
                        ))}
                        <td className='c-meta'><small className='dklbl'>With a site </small><b>{r.set}</b></td>
                        <td className='c-meta'>
                          <small className='dklbl'>Not set </small>
                          {r.unset ? <Link href={'?' + qs({ v: '', who: String(r.id) })} title='Open the Overview and click those days to pick the site'><span className='dka-pill warn'>{r.unset} day{r.unset === 1 ? '' : 's'}</span></Link> : <span className='muted'>-</span>}
                        </td>
                        <td className='c-meta hide-m'>{r.plan ? <b>{r.plan.travel}</b> : <span className='muted'>-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className='muted'>Nobody here is mapped to more than one site. Map an incharge to several sites on the roster to track the days they spend at each.</p>}
        </>
      ) : null}
      {view === 'plan' ? (
        planView ? (() => {
          const RES = { ok: ['As planned', 'ok'], diff: ['Other site', 'diff'], miss: ['No check-in', 'warn'], unknown: ['Site not known', ''], travel: ['Travel day', ''], travel_in: ['Checked in on a travel day', 'diff'], leave: ['On leave', 'leave'], pending: ['Not in yet', ''], future: ['', ''], extra: ['Not in the plan', ''] };
          const v = planView;
          const dd = (key) => Number(key.slice(8)) + ' ' + MON[Number(key.slice(5, 7)) - 1];
          const pastDuty = v.sofar.days - v.sofar.travel;
          return (
            <>
              <h2 className='dka-h'>Plan vs actual: {v.name}</h2>
              {v.options.length > 1 ? (
                <div className='chips'>{v.options.map((o) => <Link key={o.id} className={'chip' + (o.id === v.id ? ' on' : '')} href={'?' + qs({ who: String(o.id) })}>{o.name}</Link>)}</div>
              ) : null}
              <p className='muted' style={{ margin: '0 0 10px' }}>The rotation (day 1 is {v.start}: {v.pattern}) against what happened, {custom ? 'from ' + from + ' to ' + to : 'in ' + month}. The actual site is the site of the facial check-in, or the site you picked for that day. Only days before today are counted; today is shown but counted once it is over.</p>
              <div className='dka-kpis'>
                <Kpi label='As planned' value={v.ok} sub='checked in at the planned site' tone={v.ok ? 'good' : ''} />
                <Kpi label='At another site' value={v.diff} sub='checked in, but not where planned' tone={v.diff ? 'bad' : ''} />
                <Kpi label='No check-in' value={v.miss} sub='planned duty days with no time' tone={v.miss ? 'bad' : ''} />
                <Kpi label='Duty time so far' value={hm(v.hours)} sub={v.hoursPlanned ? 'of ' + hm(v.hoursPlanned) + ' for the planned duty days' : ''} />
              </div>
              <div className='rostable'>
                <table className='tx dka-sum'>
                  <thead><tr><th>Site</th><th>Planned (whole period)</th><th>Planned so far</th><th>Actual so far</th><th>Difference</th></tr></thead>
                  <tbody>
                    {v.sites.map((c) => {
                      const pl = v.planned.counts[c] || 0;
                      const ps = v.sofar.counts[c] || 0;
                      const ac = v.actual[c] || 0;
                      return (
                        <tr key={c}>
                          <td className='c-title'><OfficeTag o={c} /></td>
                          <td className='c-meta'><small className='dklbl'>Planned </small>{pl}</td>
                          <td className='c-meta'><small className='dklbl'>So far </small>{ps}</td>
                          <td className='c-meta'><small className='dklbl'>Actual </small><b>{ac}</b></td>
                          <td className='c-meta'><small className='dklbl'>Difference </small>{ac - ps === 0 ? <span className='muted'>0</span> : <span className={'dka-pill ' + (ac - ps > 0 ? 'ok' : 'warn')}>{ac - ps > 0 ? '+' : ''}{ac - ps}</span>}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className='c-title'><b>Travel-only days</b></td>
                      <td className='c-meta'>{v.planned.travel}</td>
                      <td className='c-meta'>{v.sofar.travel}</td>
                      <td className='c-meta'><small className='muted'>checked in on one: {v.travelIn}</small></td>
                      <td className='c-meta'></td>
                    </tr>
                    <tr>
                      <td className='c-title'><b>Days at a site, site not known</b></td>
                      <td className='c-meta'></td>
                      <td className='c-meta'></td>
                      <td className='c-meta'>{v.unknown ? <Link href={'?' + qs({ v: '' })} title='Open the Overview and click those days to pick the site'><span className='dka-pill warn'>{v.unknown}</span></Link> : <span className='muted'>0</span>}</td>
                      <td className='c-meta'></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3 className='dka-h' style={{ marginTop: 16 }}>Day by day</h3>
              <div className='rostable'>
                <table className='tx dka-sum'>
                  <thead><tr><th>Date</th><th>Planned</th><th>Actual site</th><th>In</th><th>Out</th><th>Hours</th><th>Result</th></tr></thead>
                  <tbody>
                    {v.days.filter((d) => d.plan || d.in).map((d) => {
                      const r = RES[d.res] || ['', ''];
                      return (
                        <tr key={d.day} className={d.day === today ? 'dka-today' : ''}>
                          <td className='c-title'><b>{dd(d.day)}</b> <small className='muted'>{DOW[dow(d.day)]}</small></td>
                          <td className='c-meta'>{d.plan === 'T' ? <span className='muted'>Travel day</span> : d.plan ? <OfficeTag o={d.plan} /> : <span className='muted'>-</span>}</td>
                          <td className='c-meta'>{d.site ? <OfficeTag o={d.site} /> : <span className='muted'>-</span>}</td>
                          <td className='c-meta nw'><small className='dklbl'>In </small>{d.in || <span className='muted'>-</span>}</td>
                          <td className='c-meta nw'><small className='dklbl'>Out </small>{d.out || <span className='muted'>-</span>}</td>
                          <td className={'c-meta nw' + (d.mins == null ? '' : d.mins >= v.dutyMin ? ' dka-t g' : ' dka-t r')}><small className='dklbl'>Hours </small>{d.mins == null ? '-' : hm(d.mins)}</td>
                          <td className='c-meta'>
                            {r[0] ? <span className={'dka-pill ' + r[1]}>{r[0]}{d.res === 'leave' && d.leave ? ' (' + d.leave + ')' : ''}</span> : null}
                            {d.day <= today && d.plan && d.plan !== 'T' && d.res !== 'leave' ? <Link className='dka-fix' href={'?' + qs({ p: String(v.id), d: d.day, v: '' }) + '#addtime'}>{d.in ? 'edit' : 'add time'}</Link> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className='muted'>{v.days.filter((d) => d.res === 'future').length} planned day(s) are still ahead. "Planned so far" counts days before today only.</p>
            </>
          );
        })() : <p className='muted'>No one has a site rotation yet. Switch it on for an incharge on Roster → Edit.</p>
      ) : null}
      {!people.length && view !== 'sites' && view !== 'plan' ? <p className='muted'>No check-ins for {period}. Use the form above to add a time by hand.</p> : null}
    </>
  );
}
