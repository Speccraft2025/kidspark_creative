// GET /api/download?token=...&path=<storagePath>
// Validates the buyer's gallery token, checks the requested path belongs to a
// product they bought, then 302-redirects to a short-lived Supabase signed URL.
// The buyer never sees a public URL, and can only reach files they purchased.
const { supabase, createSignedUrl, json } = require('./_shared/lib');
const { pathAllowed } = require('./_shared/products');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const token = event.queryStringParameters?.token;
  const path = event.queryStringParameters?.path;
  if (!token || !path) return json(400, { error: 'Missing token or path.' });

  const db = supabase();
  const { data: grant, error } = await db
    .from('download_grants')
    .select('*')
    .eq('token', token)
    .single();
  if (error || !grant) return json(404, { error: 'Invalid download link.' });

  if (new Date(grant.expires_at).getTime() < Date.now()) {
    return json(410, { error: 'This download link has expired. Please contact support.' });
  }

  const { data: order } = await db.from('orders').select('*').eq('id', grant.order_id).single();
  if (!order || order.status !== 'paid') return json(403, { error: 'Order not found.' });

  // Path must belong to a product this order actually bought.
  if (!pathAllowed(order.product_ids, path)) {
    return json(403, { error: 'That file is not part of your purchase.' });
  }

  if (grant.downloads_used >= grant.max_downloads) {
    return json(429, { error: 'Download limit reached. Please contact support.' });
  }

  try {
    const signedUrl = await createSignedUrl(path, 120);
    // Best-effort usage counter (a rare double count is harmless).
    await db.from('download_grants').update({ downloads_used: grant.downloads_used + 1 }).eq('id', grant.id);
    return { statusCode: 302, headers: { Location: signedUrl }, body: '' };
  } catch (e) {
    console.error('download failed:', e);
    return json(500, { error: 'Could not generate the download. Please try again.' });
  }
};
