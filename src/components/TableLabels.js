'use client';

import { useEffect } from 'react';

// Copies each table header into its cells so tables can turn into stacked cards on a phone.
export default function TableLabels() {
  useEffect(() => {
    const label = () => {
      document.querySelectorAll('table').forEach((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((h) => h.textContent.trim());
        // Body and Total rows; cells that span columns push the following labels along.
        t.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
          const foot = !!tr.closest('tfoot');
          let col = 0;
          Array.from(tr.children).forEach((td, i) => {
            const h = foot && i === 0 && /^total/i.test(td.textContent.trim()) ? '' : heads[col];
            if (h !== undefined && td.getAttribute('data-label') !== h) td.setAttribute('data-label', h);
            col += td.colSpan || 1;
          });
        });
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
