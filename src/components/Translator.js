'use client';

import { useEffect } from 'react';
import { UR } from '@/lib/ur';

// Translates the interface text to Urdu in the browser. Only text found in the dictionary is
// replaced, longest phrases first; names and descriptions that people typed are left as they are.
const KEYS = Object.keys(UR).sort((a, b) => b.length - a.length);
const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
const ATTRS = ['placeholder', 'title', 'aria-label'];
// Last text we wrote into each node. Some translations contain their own English key (for example
// CIH), so without this the observer would keep re-translating its own output.
const DONE = new WeakMap();

function isLetter(c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

function hasLatin(s) {
  for (let i = 0; i < s.length; i++) if (isLetter(s[i])) return true;
  return false;
}

// Replace whole-word occurrences of key in s.
function replaceWord(s, key, val) {
  let res = '';
  let i = 0;
  for (;;) {
    const j = s.indexOf(key, i);
    if (j === -1) {
      res += s.slice(i);
      break;
    }
    const before = j === 0 ? '' : s[j - 1];
    const after = s[j + key.length] || '';
    if (isLetter(before) || isLetter(after)) {
      res += s.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    res += s.slice(i, j) + val;
    i = j + key.length;
  }
  return res;
}

function translate(text) {
  const trimmed = text.trim();
  if (UR[trimmed]) return text.replace(trimmed, () => UR[trimmed]);
  let out = text;
  for (const k of KEYS) {
    if (out.indexOf(k) !== -1) out = replaceWord(out, k, UR[k]);
  }
  return out;
}

function fixNode(n) {
  if (n.nodeType === 3) {
    if (n.parentNode && SKIP[n.parentNode.nodeName]) return;
    const t = n.nodeValue;
    if (!t || !hasLatin(t)) return;
    if (DONE.get(n) === t) return;
    const o = translate(t);
    DONE.set(n, o);
    if (o !== t) n.nodeValue = o;
  } else if (n.nodeType === 1) {
    if (SKIP[n.nodeName]) return;
    ATTRS.forEach((a) => {
      const v = n.getAttribute(a);
      if (v && hasLatin(v)) {
        const o = translate(v);
        if (o !== v) n.setAttribute(a, o);
      }
    });
    n.childNodes.forEach(fixNode);
  }
}

export default function Translator() {
  useEffect(() => {
    fixNode(document.body);
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'characterData') fixNode(m.target);
        m.addedNodes.forEach(fixNode);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
