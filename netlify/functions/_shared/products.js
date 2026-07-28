// ---------------------------------------------------------------------------
// KidSpark product catalog — the SERVER-SIDE source of truth.
//
// Prices here are authoritative. The browser never sends a price; it only sends
// product ids, and the checkout function looks the price up in this file.
//
// priceMinor = price in the SMALLEST unit of your currency (i.e. amount x 100).
//   Currency is KES, so priceMinor is in CENTS:  KES 150 -> 15000.
//
// DELIVERY (gallery model): each pack is delivered as individual page PDFs plus
// a single "all pages" ZIP, stored in your PRIVATE Supabase bucket under:
//     library/<packId>/pages/...      (the individual page PDFs)
//     library/<packId>/<packId>-all.zip
// The bundle simply unlocks every pack folder + a master ZIP of all pages.
//
// TODO(kidspark): set your real KES prices before going live.
// ---------------------------------------------------------------------------

const PACK_IDS = ['alphabet', 'food', 'fruits', 'wildlife', 'mazes', 'dots'];

function packDelivery(id) {
  return {
    // folder prefix that a buyer of this product is allowed to download from
    allowPrefix: `library/${id}/`,
    // where the individual page PDFs live (listed at request time)
    pagesPrefix: `library/${id}/pages`,
    // the "all pages" zip for this pack
    zipPath: `library/${id}/${id}-all.zip`,
  };
}

const PRODUCTS = [
  {
    id: 'complete-bundle',
    name: 'KidSpark Complete Bundle',
    description: 'Every pack — Alphabet, Food, Fruits, Wildlife, Mazes & Join-the-Dots. Best value.',
    type: 'bundle',
    priceMinor: 60000, // KES 600  <-- PLACEHOLDER
    delivery: {
      includes: PACK_IDS,               // expands to every pack's pages
      allowPrefix: 'library/',          // may download anything under library/
      zipPath: 'library/bundle/kidspark-all-pages.zip',
    },
  },
  {
    id: 'alphabet',
    name: 'Alphabet Coloring Pack',
    description: 'Master the ABCs with fun, simple illustrations for every letter.',
    type: 'pack',
    priceMinor: 15000, // KES 150  <-- PLACEHOLDER
    delivery: packDelivery('alphabet'),
  },
  {
    id: 'food',
    name: 'Food Coloring Pack',
    description: 'Healthy snacks and yummy treats to bring to life with color.',
    type: 'pack',
    priceMinor: 15000, // PLACEHOLDER
    delivery: packDelivery('food'),
  },
  {
    id: 'fruits',
    name: 'Fruits Coloring Pack',
    description: 'A juicy set of fruit illustrations for little colorists.',
    type: 'pack',
    priceMinor: 15000, // PLACEHOLDER
    delivery: packDelivery('fruits'),
  },
  {
    id: 'wildlife',
    name: 'Wildlife Coloring Pack',
    description: 'Venture into the wild and bring majestic animals to life.',
    type: 'pack',
    priceMinor: 15000, // PLACEHOLDER
    delivery: packDelivery('wildlife'),
  },
  {
    id: 'mazes',
    name: 'Maze Activity Pack',
    description: '21 printable mazes to sharpen focus and problem-solving.',
    type: 'pack',
    priceMinor: 15000, // PLACEHOLDER
    delivery: packDelivery('mazes'),
  },
  {
    id: 'dots',
    name: 'Join-the-Dots Activity Pack',
    description: 'Connect-the-dots pages for counting and fine motor skills.',
    type: 'pack',
    priceMinor: 15000, // PLACEHOLDER
    delivery: packDelivery('dots'),
  },
];

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

// Public view — safe to expose to the browser (no storage paths).
function publicCatalog() {
  return PRODUCTS.map(({ id, name, description, type, priceMinor }) => ({
    id,
    name,
    description,
    type,
    priceMinor,
    priceMajor: priceMinor / 100,
  }));
}

// Look up a validated list of product ids and total them, server-side.
function resolveCart(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('Cart is empty.');
  const unique = [...new Set(ids)];
  const items = unique.map((id) => {
    const product = byId.get(id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    return product;
  });
  const amountMinor = items.reduce((sum, p) => sum + p.priceMinor, 0);
  return { items, amountMinor };
}

// Given the product ids on an order, return the flat list of "pack sections" a
// buyer can see in their gallery, plus the set of allowed download prefixes.
function deliveryForOrder(productIds) {
  const sections = new Map(); // packId -> { id, name, pagesPrefix, zipPath }
  const allowPrefixes = new Set();
  let bundleZip = null;

  for (const pid of productIds || []) {
    const product = byId.get(pid);
    if (!product) continue;
    allowPrefixes.add(product.delivery.allowPrefix);

    if (product.type === 'bundle') {
      if (product.delivery.zipPath) bundleZip = { name: 'Everything (all pages, ZIP)', zipPath: product.delivery.zipPath };
      for (const packId of product.delivery.includes) {
        const pack = byId.get(packId);
        if (pack) sections.set(packId, sectionFor(pack));
      }
    } else {
      sections.set(pid, sectionFor(product));
    }
  }

  return { sections: [...sections.values()], allowPrefixes: [...allowPrefixes], bundleZip };
}

function sectionFor(pack) {
  return {
    id: pack.id,
    name: pack.name,
    pagesPrefix: pack.delivery.pagesPrefix,
    zipPath: pack.delivery.zipPath,
  };
}

// Is this storage path allowed for an order with these product ids?
function pathAllowed(productIds, path) {
  if (typeof path !== 'string' || path.includes('..')) return false;
  const { allowPrefixes } = deliveryForOrder(productIds);
  return allowPrefixes.some((prefix) => path.startsWith(prefix));
}

module.exports = { PRODUCTS, byId, publicCatalog, resolveCart, deliveryForOrder, pathAllowed };
