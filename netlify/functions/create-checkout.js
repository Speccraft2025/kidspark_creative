// POST /api/create-checkout
// Body: { email: string, productIds: string[] }
// Initializes a Paystack transaction with a SERVER-computed amount and returns
// the hosted checkout URL for the browser to redirect to.
const { resolveCart } = require('./_shared/products');
const { paystack, supabase, randomToken, json, siteUrl } = require('./_shared/lib');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { email, productIds } = payload;
  if (!isValidEmail(email)) return json(400, { error: 'A valid email is required.' });

  let cart;
  try {
    cart = resolveCart(productIds); // { items, amountMinor } — authoritative
  } catch (e) {
    return json(400, { error: e.message });
  }

  // Our own reference so we can reconcile the order later.
  const reference = `ks_${Date.now()}_${randomToken(6)}`;

  try {
    // Record the order as pending BEFORE sending the buyer to Paystack.
    const { error: dbError } = await supabase().from('orders').insert({
      reference,
      email,
      amount_kobo: cart.amountMinor, // column keeps legacy name; value is minor units
      product_ids: cart.items.map((p) => p.id),
      status: 'pending',
    });
    if (dbError) throw dbError;

    const init = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: cart.amountMinor, // minor units (KES cents)
        reference,
        currency: process.env.CURRENCY || 'KES',
        callback_url: `${siteUrl()}/success.html`,
        metadata: {
          product_ids: cart.items.map((p) => p.id),
          custom_fields: [
            {
              display_name: 'Products',
              variable_name: 'products',
              value: cart.items.map((p) => p.name).join(', '),
            },
          ],
        },
      }),
    });

    return json(200, {
      authorization_url: init.data.authorization_url,
      reference,
    });
  } catch (e) {
    console.error('create-checkout failed:', e);
    // Paystack rejects malformed emails — surface that clearly so buyers can fix it.
    if (/email/i.test(e.message || '')) {
      return json(400, { error: 'That email address looks invalid — please double-check it and try again.' });
    }
    return json(500, { error: 'Could not start checkout. Please try again.' });
  }
};
