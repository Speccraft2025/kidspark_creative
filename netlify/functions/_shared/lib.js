// ---------------------------------------------------------------------------
// Shared helpers for the KidSpark serverless functions.
// Nothing here ever runs in the browser — it uses secret keys.
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const {
  PAYSTACK_SECRET_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET = 'printables',
  RESEND_API_KEY,
  EMAIL_FROM,
  SITE_URL,
} = process.env;

// Fail loudly at cold start if a required secret is missing.
function requireEnv(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// --- Supabase (service role — full access, server only) --------------------
let _supabase;
function supabase() {
  if (!_supabase) {
    _supabase = createClient(
      requireEnv('SUPABASE_URL', SUPABASE_URL),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}

// --- Paystack --------------------------------------------------------------
async function paystack(path, options = {}) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY', PAYSTACK_SECRET_KEY)}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok || data.status === false) {
    throw new Error(`Paystack error (${path}): ${data.message || res.status}`);
  }
  return data;
}

// Verify the webhook signature so we only trust real Paystack calls.
function isValidPaystackSignature(rawBody, signatureHeader) {
  const secret = requireEnv('PAYSTACK_SECRET_KEY', PAYSTACK_SECRET_KEY);
  const hash = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  return Boolean(signatureHeader) && hash === signatureHeader;
}

// --- Supabase storage: create a short-lived signed URL for one object ------
async function createSignedUrl(storagePath, expiresInSeconds = 120) {
  const { data, error } = await supabase()
    .storage.from(SUPABASE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

// --- Resend transactional email --------------------------------------------
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.warn('Email not sent: RESEND_API_KEY / EMAIL_FROM not configured.');
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error: ${res.status} ${body}`);
  }
  return res.json();
}

// --- Misc ------------------------------------------------------------------
function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function siteUrl() {
  return (SITE_URL || '').replace(/\/$/, '');
}

module.exports = {
  supabase,
  paystack,
  isValidPaystackSignature,
  createSignedUrl,
  sendEmail,
  randomToken,
  json,
  siteUrl,
  SUPABASE_BUCKET,
};
