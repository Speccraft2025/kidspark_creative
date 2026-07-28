// POST /api/recover   body: { email }
// Buyer self-service: given the email they paid with, find their most recent
// PAID order, ensure a valid gallery token exists (reuse or regenerate), then
// return the gallery link AND email it. This makes access recoverable forever,
// even if a link expired or the buyer cleared their browser.
const { supabase, randomToken, json } = require('./_shared/lib');
const { sendDeliveryEmail, GRANT_TTL_HOURS, MAX_DOWNLOADS } = require('./_shared/fulfill');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const email = (payload.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return json(400, { error: 'Please enter a valid email address.' });

  const db = supabase();
  try {
    // Most recent paid order for this email (case-insensitive).
    const { data: orders } = await db
      .from('orders')
      .select('*')
      .ilike('email', email)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1);

    const order = orders && orders[0];
    if (!order) {
      return json(200, { found: false });
    }

    // Reuse a still-valid grant, otherwise mint a fresh one.
    const nowIso = new Date().toISOString();
    const { data: grants } = await db
      .from('download_grants')
      .select('*')
      .eq('order_id', order.id)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1);

    let token = grants && grants[0] && grants[0].token;
    if (!token) {
      token = randomToken(24);
      const expiresAt = new Date(Date.now() + GRANT_TTL_HOURS * 3600 * 1000).toISOString();
      const { error: insErr } = await db.from('download_grants').insert({
        order_id: order.id,
        product_id: (order.product_ids || []).join(','),
        token,
        file_name: 'LIBRARY',
        storage_path: 'LIBRARY',
        expires_at: expiresAt,
        max_downloads: MAX_DOWNLOADS,
        downloads_used: 0,
      });
      if (insErr) throw insErr;
    }

    await sendDeliveryEmail(order.email, token).catch((e) =>
      console.error('Recover email failed (link still returned):', e)
    );

    return json(200, { found: true, libraryUrl: `/library.html?token=${encodeURIComponent(token)}` });
  } catch (e) {
    console.error('recover failed:', e);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
