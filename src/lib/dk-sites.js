// How Dastarkhawan sites are ordered and named on the attendance page.
export const SITE_ORDER = ['ISB', 'LHR', 'OKA', 'APL'];
const rank = (c) => {
  const i = SITE_ORDER.indexOf(c);
  return i < 0 ? SITE_ORDER.length : i;
};

/** Site codes in the usual order (ISB, LHR, OKA, APL, then any others A-Z). */
export const sortSites = (codes) => [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

/** "ISB · LHR", or "All sites" when the person is mapped to every active site. */
export function siteLabel(codes, allSites) {
  const c = sortSites(codes || []);
  if (c.length > 1 && allSites.length > 1 && allSites.every((s) => c.includes(s))) return 'All sites';
  return c.join(' · ');
}

/** Row order: by the person's first site (ISB, LHR, OKA, APL), people with more sites first within a site, then by name. */
export function comparePeople(a, b) {
  const ca = sortSites(a.codes || []);
  const cb = sortSites(b.codes || []);
  const ra = ca.length ? rank(ca[0]) : SITE_ORDER.length + 1;
  const rb = cb.length ? rank(cb[0]) : SITE_ORDER.length + 1;
  return ra - rb || cb.length - ca.length || String(a.name).localeCompare(String(b.name));
}

/** The tag text for a person on every list: the site ("ISB"), "All sites" when they are on every active site, otherwise "3 sites". */
export function siteTag(codes, allSites = []) {
  const c = [...new Set(codes || [])];
  if (!c.length) return '';
  if (c.length === 1) return c[0];
  if (allSites.length > 1 && allSites.every((x) => c.includes(x))) return 'All sites';
  return c.length + ' sites';
}

/** Turns the site text of the facial app ("BOLDDastarkhawan Lahore", "OKA") into one of our site codes, or '' when it cannot be told. */
export function matchSite(text, allSites = []) {
  const t = String(text || '').toLowerCase();
  if (!t) return '';
  const hit = allSites.find((c) => new RegExp('\\b' + c.toLowerCase() + '\\b').test(t));
  if (hit) return hit;
  const alias = { lahore: 'LHR', okara: 'OKA', islamabad: 'ISB' };
  for (const [w, c] of Object.entries(alias)) if (t.includes(w) && allSites.includes(c)) return c;
  return '';
}
