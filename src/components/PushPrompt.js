'use client';

import { useEffect, useState } from 'react';

const toKey = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
const post = (sub) => fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });

// Asks once to switch on phone notifications. After that, new messages arrive like any other app's notifications,
// even when OpsTrack is closed.
export default function PushPrompt() {
  const [state, setState] = useState('hidden');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    (async () => {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === 'granted' && sub) {
        post(sub).catch(() => {});
        return;
      }
      if (Notification.permission === 'denied') return;
      try {
        if (localStorage.getItem('pushDismissed') === '1') return;
      } catch {
        // storage can be blocked; ask anyway
      }
      setState('ask');
    })().catch(() => {});
  }, []);

  async function turnOn() {
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState('hidden');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = (await (await fetch('/api/push/key')).json()).key;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
      await post(sub);
      setState('done');
      setTimeout(() => setState('hidden'), 4000);
    } catch {
      setState('hidden');
    }
  }

  function later() {
    try {
      localStorage.setItem('pushDismissed', '1');
    } catch {
      // ignore
    }
    setState('hidden');
  }

  if (state === 'hidden') return null;
  return (
    <div className='pushbar'>
      {state === 'done' ? (
        <span>Notifications are on for this device.</span>
      ) : (
        <>
          <span>Get OpsTrack notifications on this device, even when the app is closed.</span>
          <button type='button' className='btn primary' onClick={turnOn} disabled={state === 'busy'}>{state === 'busy' ? 'Turning on...' : 'Turn on'}</button>
          <button type='button' className='btn ghost' onClick={later}>Not now</button>
        </>
      )}
    </div>
  );
}