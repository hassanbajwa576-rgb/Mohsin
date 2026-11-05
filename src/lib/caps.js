// Capital letters for what people type. Only the first letter is changed; the rest of the text is left exactly as typed
// (so "McDonald" and "AlphaBOLD" stay as they are).

// Names: every word starts with a capital, also after a hyphen or an apostrophe ("muhammad al-hassan" -> "Muhammad Al-Hassan").
export function properName(s) {
  return String(s).replace(/(^|[\s\-'’(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

// Sentences: the text, every new line and every sentence after . ! ? starts with a capital.
export function sentence(s) {
  return String(s).replace(/(^|[\n\r]\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

// Form fields that hold a person, company or place name, and fields that hold sentences. Everything else is left alone.
export const NAME_FIELDS = ['name', 'cname', 'in_place_of', 'company', 'vendor', 'dept', 'label', 'location', 'host', 'emp_name', 'visitor_name', 'guest'];
export const SENTENCE_FIELDS = ['description', 'details', 'detail', 'note', 'remarks', 'resolution', 'resp_note', 'reason', 'why', 'purpose', 'title'];
