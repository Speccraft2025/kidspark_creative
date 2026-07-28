// GET /api/library?token=...
// Lists the pages a buyer can download, grouped by pack, for their gallery.
const { supabase, json, SUPABASE_BUCKET } = require('./_shared/lib');
const { deliveryForOrder } = require('./_shared/products');

// Resolve a gallery token to a valid, unexpired order. Returns { grant, order }.
async function resolveToken(token) {
  const db = supabase();
  const { data: grant } = await db.from('download_grants').select('*').eq('token', token).single();
  if (!grant) return { error: 'Invalid or expired link.' };
  if (new Date(grant.expires_at).getTime() < Date.now()) return { error: 'This link has expired.' };
  const { data: order } = await db.from('orders').select('*').eq('id', grant.order_id).single();
  if (!order || order.status !== 'paid') return { error: 'Order not found.' };
  return { grant, order };
}

function dl(token, path) {
  return `/api/download?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
}

function pageLabel(filename) {
  const m = filename.match(/(\d+)(?=\.\w+$)/);
  return m ? `Page ${parseInt(m[1], 10)}` : filename.replace(/\.[^.]+$/, '');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const token = event.queryStringParameters?.token;
  if (!token) return json(400, { error: 'Missing token' });

  const { error, order } = await resolveToken(token);
  if (error) return json(403, { error });

  try {
    const db = supabase();
    const { sections, bundleZip } = deliveryForOrder(order.product_ids);

    const out = [];
    for (const section of sections) {
      const { data: files, error: listErr } = await db
        .storage.from(SUPABASE_BUCKET)
        .list(section.pagesPrefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (listErr) throw listErr;

      const pages = (files || [])
        .filter((f) => f.name && /\.(pdf|png|jpg|jpeg)$/i.test(f.name))
        .map((f) => ({
          label: pageLabel(f.name),
          key: `${section.id}/${f.name}`,
          url: dl(token, `${section.pagesPrefix}/${f.name}`),
        }));

      out.push({
        id: section.id,
        name: section.name,
        zipUrl: dl(token, section.zipPath),
        pages,
      });
    }

    return json(200, {
      sections: out,
      bundleZipUrl: bundleZip ? dl(token, bundleZip.zipPath) : null,
    });
  } catch (e) {
    console.error('library failed:', e);
    return json(500, { error: 'Could not load your library. Please try again.' });
  }
};
