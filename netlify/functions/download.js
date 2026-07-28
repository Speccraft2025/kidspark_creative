// GET /api/download?token=...
// Validates a download grant (not expired, not over the limit), then redirects
// to a fresh, short-lived Supabase signed URL. The real storage URL is never
// exposed for longer than ~2 minutes, and access requires a paid grant.
const { supabase, createSignedUrl, json } = require('./_shared/lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const token = event.queryStringParameters?.token;
  if (!token) return json(400, { error: 'Missing token' });

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
  if (grant.downloads_used >= grant.max_downloads) {
    return json(429, { error: 'Download limit reached for this link. Please contact support.' });
  }

  try {
    const signedUrl = await createSignedUrl(grant.storage_path, 120);

    // Count the download. (Best-effort; a rare double-count is harmless.)
    await db
      .from('download_grants')
      .update({ downloads_used: grant.downloads_used + 1 })
      .eq('id', grant.id);

    return { statusCode: 302, headers: { Location: signedUrl }, body: '' };
  } catch (e) {
    console.error('download failed:', e);
    return json(500, { error: 'Could not generate the download. Please try again.' });
  }
};
