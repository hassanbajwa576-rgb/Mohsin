'use client';

import { useEffect, useState } from 'react';

const toKey = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
const send = (method, sub) => fetch('/api/push/subscribe', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });

// Turn phone notifications on or off for this device.
export default function PushToggle() {
  const [state, setState] = useState('checking'); // checking | unsupported | on | off | blocked | busy

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    (async () => {
      if (Notification.permission === 'denied') {
        setState('blocked');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('off'));
  }, []);

  async function turnOn() {
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'blocked' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = (await (await fetch('/api/push/key')).json()).key;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
      await send('POST', sub);
      try {
        localStorage.removeItem('pushDismissed');
      } catch {
        // ignore
      }
      setState('on');
    } catch {
      setState('off');
    }
  }

  async function turnOff() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await send('DELETE', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      try {
        localStorage.setItem('pushDismissed', '1');
      } catch {
        // ignore
      }
      setState('off');
    } catch {
      setState('on');
    }
  }

  if (state === 'checking') return null;
  return (
    <div className='card pushtoggle'>
      <div>
        <b>Phone notifications on this device: {state === 'on' ? 'On' : state === 'busy' ? '...' : 'Off'}</b>
        <div className='muted'>
          {state === 'unsupported' ? 'This browser cannot show phone notifications. On an iPhone, add OpsTrack to the home screen first.' : null}
          {state === 'blocked' ? 'Notifications are blocked for this site in the phone or browser settings. Allow them there, then come back here.' : null}
          {state === 'on' ? 'New messages arrive as notifications even when the app is closed.' : null}
          {state === 'off' ? 'You will only see new messages when you open OpsTrack.' : null}
        </div>
      </div>
      {state === 'on' ? <button type='button' className='btn' onClick={turnOff}>Turn off</button> : null}
      {state === 'off' ? <button type='button' className='btn primary' onClick={turnOn}>Turn on</button> : null}
    </div>
  );
}