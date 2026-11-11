import { daysText } from './weekdays';

// The two teams that share the roster: the Support team and the Dastarkhawan team.
// Dastarkhawan people are mapped to one or more sites (a list managed on the Sites tab), each on chosen weekdays, not to an office.
export const teamOf = (v) => (v === 'dast' ? 'dast' : 'support');
export const TEAM_NAME = { support: 'Support Team', dast: 'Dastarkhawan Team' };
export const TEAM_SHORT = { support: 'Support', dast: 'Dastarkhawan' };

// [{ site: 'APL', days: '1,3' }, ...] -> "APL (Mon, Wed) · LHR". Days empty = every day.
export const siteText = (sites) => (sites || []).map((x) => x.site + (x.days ? ' (' + daysText(x.days) + ')' : '')).join(' · ');
