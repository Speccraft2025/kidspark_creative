// GET /api/catalog — public product list for the storefront to render.
const { publicCatalog } = require('./_shared/products');
const { json } = require('./_shared/lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify({
      currency: process.env.CURRENCY || 'KES',
      currencySymbol: process.env.CURRENCY_SYMBOL || 'KSh',
      products: publicCatalog(),
    }),
  };
};
