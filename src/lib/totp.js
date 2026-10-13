import 'server-only';
import { createHmac, randomBytes } from 'crypto';

// Time-based one-time passwords (RFC 6238): the 6-digit codes Google / Microsoft Authenticator show.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(buf) {
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of buf) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function fromBase32(s) {
  let bits = 0;
  let val = 0;
  const out = [];
  for (const c of s.toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    val = ((val << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newSecret() {
  return toBase32(randomBytes(20));
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', fromBase32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

// Accepts the current 30 second code and the one before / after it (clock drift).
export function verifyTotp(secret, code, now = Date.now()) {
  const c = String(code || '').split(' ').join('');
  if (!secret || c.length !== 6 || !/^[0-9]{6}$/.test(c)) return false;
  const step = Math.floor(now / 30000);
  for (let d = -1; d <= 1; d++) {
    if (hotp(secret, step + d) === c) return true;
  }
  return false;
}

export function otpauthUrl(label, secret) {
  return 'otpauth://totp/' + encodeURIComponent('OpsTrack:' + label) + '?secret=' + secret + '&issuer=OpsTrack';
}

// One-time recovery codes, shown once at setup, stored only as hashes.
export function newRecoveryCodes(n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = randomBytes(5).toString('hex');
    out.push(h.slice(0, 5) + '-' + h.slice(5));
  }
  return out;
}
