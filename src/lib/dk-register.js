// The paper attendance register of the Dastarkhawan team, January to October 2026, as read from the scan.
// given: PTO days allocated in each month; taken: leave days taken in each month. The handwritten sums on the register are the checks.
export const REGISTER_YEAR = 2026;

export const REGISTER = [
  { name: 'Faizan Ali', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [1, 0, 2, 0, 0, 5, 1, 2, 0, 0], balance: 29 },
  { name: 'Muhammad Shahbaz', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [0, 4, 0, 0, 0, 0, 1, 0, 0, 0], balance: 35 },
  { name: 'Javed Hussain', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [2, 0, 0, 0, 0, 0, 0, 0, 0, 2], balance: 36 },
  { name: 'Rizwan Ahmad', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [0, 8, 4, 0, 3, 8, 0, 0, 1, 6], balance: 10 },
  { name: 'Muhammad Yasir', given: [4, 4, 4, 4, 4, 1, 0, 0, 3, 4], taken: [4, 0, 2, 9, 5, 2, 0, 0, 0, 3], balance: 3 },
  { name: 'Mohsin Ali', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [3, 4, 0, 4, 4, 5, 4, 4, 4, 3], balance: 5 },
  { name: 'Muhammad Bilal', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [4, 4, 0, 4, 0, 2, 0, 0, 0, 4], balance: 22 },
  { name: 'Muhammad Faisal', given: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], taken: [2, 4, 2, 3, 0, 1, 1, 4, 2, 4], balance: 17 },
  { name: 'Muhammad Irfan', given: [4, 4, 4, 4, 4, 4, 4, 4, 1, 3], taken: [4, 1, 5, 6, 4, 2, 1, 6, 2, 6], balance: -1 },
];

export const sum = (a) => a.reduce((t, v) => t + v, 0);
