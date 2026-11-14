const PREFIX = /^(muhammad|mohammad|mohammed|muhammed|mohd|md)\.?$/i;

/** The name people go by: the first word, skipping a leading "Muhammad" ("Mohsin Ghazanfar" -> Mohsin, "Muhammad Zubair" -> Zubair). */
export function firstName(full) {
  const w = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return w.length > 1 && PREFIX.test(w[0]) ? w[1] : w[0];
}
