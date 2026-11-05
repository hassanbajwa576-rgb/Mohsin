'use client';

import { useEffect } from 'react';
import { NAME_FIELDS, SENTENCE_FIELDS, properName, sentence } from '@/lib/caps';

// Makes names and sentences start with capital letters wherever they are typed in the app:
// phones are asked to capitalise as you type, and the text is tidied when you leave the field or press save.
export default function AutoCaps() {
  useEffect(() => {
    const kind = (el) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !el.name) return '';
      if (el instanceof HTMLInputElement && !['text', 'search', ''].includes(el.type)) return '';
      return NAME_FIELDS.includes(el.name) ? 'name' : SENTENCE_FIELDS.includes(el.name) ? 'sentence' : '';
    };
    const setValue = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const fix = (el) => {
      const k = kind(el);
      if (!k || !el.value) return;
      const v = k === 'name' ? properName(el.value) : sentence(el.value);
      if (v !== el.value) setValue(el, v);
    };
    const onFocusIn = (e) => {
      const k = kind(e.target);
      if (k) e.target.setAttribute('autocapitalize', k === 'name' ? 'words' : 'sentences');
    };
    const onFocusOut = (e) => fix(e.target);
    const onSubmit = (e) => { for (const el of e.target.elements || []) fix(el); };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}
