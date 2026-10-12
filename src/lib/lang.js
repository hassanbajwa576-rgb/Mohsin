import { cookies } from 'next/headers';

// The chosen interface language is kept in a cookie: 'en' (default) or 'ur'.
// Urdu is switched off for now. Set ENABLED to true (here and in components/LangToggle.js) to bring it back.
const ENABLED = false;

export async function getLang() {
  if (!ENABLED) return 'en';
  const jar = await cookies();
  return jar.get('pt_lang')?.value === 'ur' ? 'ur' : 'en';
}
