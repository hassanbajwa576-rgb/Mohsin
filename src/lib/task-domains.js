// The areas a task can belong to, in the order they are shown (the first is the default for a new task).
// Kept free of any server code so the header menu can use it too.
export const DOMAINS = [
  ['operations', 'Operations'],
  ['hr', 'HR'],
  ['accounts', 'Accounts'],
  ['bolddastarkhawan', 'BOLDDastarkhawan'],
  ['boldbus', 'BOLDBus'],
  ['it', 'IT'],
];
export const DOMAIN = Object.fromEntries(DOMAINS);
export const DOMAIN_ORDER = DOMAINS.map(([k]) => k);
