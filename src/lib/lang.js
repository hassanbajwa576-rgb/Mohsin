import { cookies } from 'next/headers';

// The chosen interface language is kept in a cookie: 'en' (default) or 'ur'.
export async function getLang() {
  const jar = await cookies();
  return jar.get('pt_lang')?.value === 'ur' ? 'ur' : 'en';
}
