'use client';

// Switches the whole interface between English and Urdu.
export default function LangToggle({ lang }) {
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
