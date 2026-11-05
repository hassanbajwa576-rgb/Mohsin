// Days of the week used by routines and reminders: 1 = Monday ... 7 = Sunday.
export const WEEKDAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
export const WD_NAME = Object.fromEntries(WEEKDAYS);

// 1 (Monday) to 7 (Sunday) for a YYYY-MM-DD date.
export const isoDay = (dateKey) => {
  const d = new Date(dateKey + 'T00:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
};

// "1,3" -> "Mon, Wed"
export const daysText = (csv) => String(csv || '').split(',').filter(Boolean).map((d) => WD_NAME[d]).filter(Boolean).join(', ');
