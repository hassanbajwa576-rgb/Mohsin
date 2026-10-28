'use client';

import { useEffect } from 'react';

// Name fields: the first letter of every word (first, middle and last name) becomes a capital as you type.
// Only lower case first letters are raised; the rest of the word is left as typed ("McDonald", "BOLDBus").
const FIELDS = new Set(['name', 'cname']);
const raise = (v) => v.replace(/(^|[\s-])(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());

export default function NameCase() {
  useEffect(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const onInput = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== 'text' || !FIELDS.has(el.name) || e.isComposing) return;
      const next = raise(el.value);
      if (next === el.value) return;
      const at = el.selectionStart;
      set.call(el, next);
      try {
        el.setSelectionRange(at, at);
      } catch {
        /* some inputs have no caret */
      }
      // Controlled fields need to hear about the new value.
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.addEventListener('input', onInput, true);
    return () => document.removeEventListener('input', onInput, true);
  }, []);
  return null;
}
