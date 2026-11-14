'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Search box for a team member: type to filter the names, pick one to show that person only.
export default function DkPersonPicker({ people, selected, everyoneHref }) {
  const router = useRouter();
  const current = people.find((p) => p.id === selected);
  const [text, setText] = useState(current ? current.name : '');
  const go = (val) => {
    const hit = people.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
    if (hit) router.push(hit.href);
  };
  return (
    <div className='dka-pick'>
      <input
        type='search'
        list='dka-people'
        value={text}
        placeholder='Search staff name'
        autoComplete='off'
        aria-label='Search staff name'
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value && selected) router.push(everyoneHref);
          else go(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            go(text);
          }
        }}
      />
      <datalist id='dka-people'>
        {people.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>
      <Link className={'chip' + (!selected ? ' on' : '')} href={everyoneHref}>Everyone</Link>
    </div>
  );
}
