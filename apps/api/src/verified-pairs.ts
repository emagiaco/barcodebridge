import type {ProductQuery, RawCandidate} from '@barcodebridge/core';

// Small, reviewable collection of product identifiers checked against linked pages.
// Add a record only when a page explicitly shows both the ASIN and the barcode.
const pairs = [
  {
    asin: 'B09SY5QHHJ',
    gtin: '8054383070350',
    title: 'Luminer Cosmetics Siero Viso Acido Ialuronico 100 ml',
    brand: 'Luminer',
    quantity: '100 ml',
    checkedOn: '2026-09-23',
    sources: [
      {provider: 'eBay', url: 'https://www.ebay.it/itm/316417343976'},
      {provider: 'Bigamart', url: 'https://bigamart.com/product/luminer-100ml-face-serum-with-hyaluronic-acid-natural-anti-wrinkle-formula-enriched-with-snail-slime-aloe-vera-and-vitamin-c-e-moisturizing-and-plumping-eye-contour/'},
    ],
  },
];

export function verifiedPairs(query: ProductQuery): RawCandidate[] {
  if (query.kind === 'name') return [];
  return pairs.filter(pair => query.value === (query.kind === 'asin' ? pair.asin : pair.gtin))
    .flatMap(pair => pair.sources.map(source => ({
      gtin: pair.gtin,
      asin: pair.asin,
      title: pair.title,
      brand: pair.brand,
      quantity: pair.quantity,
      evidence: {
        provider: `Verificato · ${source.provider}`,
        url: source.url,
        title: pair.title,
        brand: pair.brand,
        quantity: pair.quantity,
        asin: pair.asin,
        checkedOn: pair.checkedOn,
      },
    })));
}
