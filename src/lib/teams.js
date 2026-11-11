// The two teams that share the roster: the Support team and the Dastarkhawan team.
// Dastarkhawan people belong to a site (a list managed on the Sites tab), not to an office.
export const teamOf = (v) => (v === 'dast' ? 'dast' : 'support');
export const TEAM_NAME = { support: 'Support Team', dast: 'Dastarkhawan Team' };
export const TEAM_SHORT = { support: 'Support', dast: 'Dastarkhawan' };
