// GET /api/verify?reference=...
// Called by success.html right after the buyer returns from Paystack.
// Independently verifies the transaction with Paystack, fulfills if needed,
// and returns the download links to show on the page.
const { paystack, json } = require('./_shared/lib');
const { fulfillOrder } = require('./_shared/fulfill');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const reference = event.queryStringParameters?.reference;
  if (!reference) return json(400, { error: 'Missing reference' });

  try {
    const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (result.data.status !== 'success') {
      return json(200, { paid: false, status: result.data.status });
    }

    // Payment confirmed — fulfill (idempotent) and return the links.
    const { grants } = await fulfillOrder(reference);
    return json(200, {
      paid: true,
      downloads: grants.map((g) => ({
        fileName: g.fileName,
        url: `/api/download?token=${encodeURIComponent(g.token)}`,
      })),
    });
  } catch (e) {
    console.error('verify failed:', e);
    return json(500, { error: 'Could not verify payment. If you were charged, check your email.' });
  }
};
