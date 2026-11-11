'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@/lib/weekdays';

// Which sites a Dastarkhawan person works at. Tick each site; pick the weekdays for it, or none for every day.
// An incharge who visits every site can tick them all and give each its days.
export default function SiteMap({ sites, selected = [] }) {
  const days0 = Object.fromEntries(selected.map((x) => [x.site, x.days ? x.days.split(',') : []]));
  const [on, setOn] = useState(() => new Set(selected.map((x) => x.site)));
  const flip = (name) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  if (!sites.length) return <p className='muted' style={{ gridColumn: '1/-1' }}>Add a site first (Sites tab).</p>;
  return (
    <div className='sitemap' style={{ gridColumn: '1/-1' }}>
      <span className='att-lbl'>Sites (tick each site this person works at; choose the days if not every day)</span>
      {sites.map((name) => (
        <div className='smrow' key={name}>
          <label className='smname'><input type='checkbox' name='site' value={name} checked={on.has(name)} onChange={() => flip(name)} /> {name}</label>
          {on.has(name) ? (
            <span className='smdays'>
              {WEEKDAYS.map(([k, l]) => (
                <label key={k} className='daychk'><input type='checkbox' name={'days_' + name} value={k} defaultChecked={(days0[name] || []).includes(k)} />{l}</label>
              ))}
              <small className='muted'>none ticked = every day</small>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
