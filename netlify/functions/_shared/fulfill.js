// ---------------------------------------------------------------------------
// Fulfillment: turn a PAID order into a single access grant (for the gallery)
// + a delivery email. Idempotent — safe to call from the webhook and verify,
// and safe to call twice (Paystack may deliver a webhook more than once).
// ---------------------------------------------------------------------------

const { supabase, sendEmail, randomToken, siteUrl } = require('./lib');

const GRANT_TTL_HOURS = 24 * 365; // gallery link stays valid ~1 year
const MAX_DOWNLOADS = 5000;       // generous: per-page downloads across revisits

// Returns { order, token } — token is the buyer's gallery access token.
async function fulfillOrder(reference) {
  const db = supabase();

  const { data: order, error } = await db
    .from('orders')
    .select('*')
    .eq('reference', reference)
    .single();
  if (error || !order) throw new Error(`Order not found: ${reference}`);

  // Already fulfilled? Reuse the existing access grant (idempotent).
  const { data: existing } = await db
    .from('download_grants')
    .select('*')
    .eq('order_id', order.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return { order, token: existing[0].token, alreadyFulfilled: true };
  }

  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + GRANT_TTL_HOURS * 3600 * 1000).toISOString();

  // One access grant per order. Access is scoped by the order's product_ids,
  // so storage_path/file_name here are just placeholders the schema requires.
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

  await db
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id);

  await sendDeliveryEmail(order.email, token).catch((e) =>
    console.error('Delivery email failed (order still fulfilled):', e)
  );

  return { order, token, alreadyFulfilled: false };
}

function libraryUrl(token) {
  return `${siteUrl()}/library.html?token=${encodeURIComponent(token)}`;
}

async function sendDeliveryEmail(to, token) {
  const url = libraryUrl(token);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1E212B">
      <h2 style="color:#FF9427">Thank you for your purchase! 🎨</h2>
      <p>Your KidSpark download library is ready. Open it to download each page
      individually, or grab the whole pack as a ZIP:</p>
      <p style="margin:26px 0">
        <a href="${url}" style="background:#FF9427;color:#1E212B;font-weight:700;
           padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">
          Open my downloads →
        </a>
      </p>
      <p style="font-size:13px;color:#6B7280">Bookmark this link — it stays active
      so you can keep downloading pages one at a time. Lost it? Visit our site and
      use "Retrieve my downloads" with this email address.
      Having trouble? Just reply to this email.</p>
      <p style="font-size:13px;color:#6B7280">— The KidSpark Team</p>
    </div>`;

  return sendEmail({ to, subject: 'Your KidSpark downloads are ready 🎨', html });
}

module.exports = { fulfillOrder, sendDeliveryEmail, libraryUrl, GRANT_TTL_HOURS, MAX_DOWNLOADS };
