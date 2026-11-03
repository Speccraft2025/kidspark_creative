// ---------------------------------------------------------------------------
// Babotap play codes.
//
// A play code unlocks the full Babotap game on kidspark.cc. Codes are signed,
// so they can be checked without a database lookup:
//
//     <id>-<signature>      e.g. K7QXM-R2D9TA
//
// id        = 5 characters derived from the order reference (stable per order)
// signature = 6 characters of HMAC-SHA256(secret, id)
//
// The secret is PLAY_CODE_SECRET if set, otherwise it is derived from the
// Supabase service key (already configured on Netlify), so no new setting is
// needed. Changing the secret invalidates every code issued so far.
// ---------------------------------------------------------------------------
const crypto = require('crypto');

// 32 characters: no 0/O or 1/I, so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Products whose buyers get a play code.
const PLAY_CODE_PRODUCTS = ['complete-bundle'];

function secretKey() {
  const base = process.env.PLAY_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('Missing PLAY_CODE_SECRET / SUPABASE_SERVICE_ROLE_KEY');
  return crypto.createHash('sha256').update('babotap-play-code:v1:' + base).digest();
}

// 256 is a multiple of 32, so byte % 32 is unbiased.
function encode(buf, n) {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[buf[i] % 32];
  return out;
}

function signature(id) {
  return encode(crypto.createHmac('sha256', secretKey()).update(id).digest(), 6);
}

function playCodeFor(reference) {
  const id = encode(crypto.createHash('sha256').update('order:' + String(reference)).digest(), 5);
  return `${id}-${signature(id)}`;
}

function orderIncludesPlayCode(productIds) {
  return (productIds || []).some((id) => PLAY_CODE_PRODUCTS.includes(id));
}

function verifyPlayCode(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 11) return false;
  if ([...clean].some((c) => !ALPHABET.includes(c))) return false;
  const id = clean.slice(0, 5), sig = clean.slice(5);
  const expected = Buffer.from(signature(id));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { playCodeFor, verifyPlayCode, orderIncludesPlayCode, PLAY_CODE_PRODUCTS };
