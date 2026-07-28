// POST /api/paystack-webhook
// Paystack calls this when a charge succeeds. This is the AUTHORITATIVE source
// of truth for fulfillment — it does not depend on the buyer's browser.
const { isValidPaystackSignature, json } = require('./_shared/lib');
const { fulfillOrder } = require('./_shared/fulfill');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // Netlify gives us the raw body string; verify the signature against it.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';

  const signature = event.headers['x-paystack-signature'] || event.headers['X-Paystack-Signature'];
  if (!isValidPaystackSignature(rawBody, signature)) {
    return json(401, { error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  // Always ack 200 quickly for events we don't act on, so Paystack stops retrying.
  if (payload.event !== 'charge.success') {
    return json(200, { received: true });
  }

  const reference = payload.data?.reference;
  try {
    await fulfillOrder(reference);
  } catch (e) {
    console.error('Webhook fulfillment failed:', e);
    // Return 500 so Paystack retries later.
    return json(500, { error: 'Fulfillment failed' });
  }

  return json(200, { received: true });
};
