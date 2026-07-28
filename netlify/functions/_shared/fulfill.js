// ---------------------------------------------------------------------------
// Fulfillment: turn a PAID order into download grants + a delivery email.
// Idempotent — safe to call from both the webhook and the verify endpoint,
// and safe to call twice (Paystack may deliver a webhook more than once).
// ---------------------------------------------------------------------------

const { byId } = require('./products');
const { supabase, sendEmail, randomToken, siteUrl } = require('./lib');

const GRANT_TTL_HOURS = 72; // download link stays valid for 3 days
const MAX_DOWNLOADS = 5; // per file, generous for re-downloads

// Returns { order, grants } where grants is [{ token, fileName, productId }].
async function fulfillOrder(reference) {
  const db = supabase();

  const { data: order, error } = await db
    .from('orders')
    .select('*')
    .eq('reference', reference)
    .single();
  if (error || !order) throw new Error(`Order not found: ${reference}`);

  // If we've already fulfilled, just return the existing grants (idempotent).
  const { data: existing } = await db
    .from('download_grants')
    .select('*')
    .eq('order_id', order.id);

  if (existing && existing.length > 0) {
    return { order, grants: existing.map(mapGrant), alreadyFulfilled: true };
  }

  // Build one grant per deliverable file across all purchased products.
  const expiresAt = new Date(Date.now() + GRANT_TTL_HOURS * 3600 * 1000).toISOString();
  const rows = [];
  for (const productId of order.product_ids) {
    const product = byId.get(productId);
    if (!product) continue;
    for (const file of product.files) {
      rows.push({
        order_id: order.id,
        product_id: productId,
        token: randomToken(24),
        file_name: file.name,
        storage_path: file.storagePath,
        expires_at: expiresAt,
        max_downloads: MAX_DOWNLOADS,
        downloads_used: 0,
      });
    }
  }

  const { data: inserted, error: insErr } = await db
    .from('download_grants')
    .insert(rows)
    .select('*');
  if (insErr) throw insErr;

  await db
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', order.id);

  const grants = inserted.map(mapGrant);
  await sendDeliveryEmail(order.email, grants).catch((e) =>
    console.error('Delivery email failed (order still fulfilled):', e)
  );

  return { order, grants, alreadyFulfilled: false };
}

function mapGrant(g) {
  return { token: g.token, fileName: g.file_name, productId: g.product_id };
}

function downloadUrl(token) {
  return `${siteUrl()}/api/download?token=${encodeURIComponent(token)}`;
}

async function sendDeliveryEmail(to, grants) {
  const links = grants
    .map(
      (g) =>
        `<li style="margin:8px 0"><a href="${downloadUrl(g.token)}" style="color:#FF8427;font-weight:600">${g.fileName}</a></li>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1E212B">
      <h2 style="color:#FF8427">Thank you for your purchase! 🎨</h2>
      <p>Your KidSpark downloads are ready. Tap any file below to download:</p>
      <ul style="padding-left:18px">${links}</ul>
      <p style="font-size:13px;color:#6B7280">These links stay active for 72 hours and can be used a few times each.
      Having trouble? Just reply to this email.</p>
      <p style="font-size:13px;color:#6B7280">— The KidSpark Team</p>
    </div>`;

  return sendEmail({ to, subject: 'Your KidSpark downloads are ready 🎨', html });
}

module.exports = { fulfillOrder };
