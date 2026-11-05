'use client';

import { useRouter } from 'next/navigation';

// Goes back to the page you came from; opens the fallback page when there is nothing to go back to.
export default function BackButton({ fallback = '/', label = 'Back' }) {
  const router = useRouter();
  return (
    <button type='button' className='btn ghost backbtn' onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}>
      &larr; {label}
    </button>
  );
}
