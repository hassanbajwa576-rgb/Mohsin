'use client';

// Switches the whole interface between English and Urdu.
// Urdu is switched off for now. Set ENABLED to true (here and in lib/lang.js) to bring it back.
const ENABLED = false;

export default function LangToggle({ lang }) {
  if (!ENABLED) return null;
  const next = lang === 'ur' ? 'en' : 'ur';
  return (
    <button
      type='button'
      className='btn ghost lang'
      aria-label='Language'
      onClick={() => {
        document.cookie = 'pt_lang=' + next + '; path=/; max-age=31536000; samesite=lax';
        window.location.reload();
      }}
    >
      {lang === 'ur' ? 'English' : 'اردو'}
    </button>
  );
}
