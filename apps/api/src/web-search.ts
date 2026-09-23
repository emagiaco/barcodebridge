import type {ProductQuery, RawCandidate} from '@barcodebridge/core';

type SearchResult = {title?:string; url?:string; description?:string; extra_snippets?:string[]};

export function extractWebCandidates(query: ProductQuery, results: SearchResult[]): RawCandidate[] {
  if (query.kind !== 'asin') return [];
  return results.slice(0, 20).flatMap(result => {
    let url: URL;
    try { url = new URL(result.url || ''); } catch { return []; }
    if (url.protocol !== 'https:') return [];
    const body = [result.title, result.description, ...(result.extra_snippets || [])].join(' ');
    if (!(body + ' ' + url.pathname).toUpperCase().includes(query.value)) return [];
    const codes = [...body.matchAll(/\b(?:EAN(?:-?13)?|UPC(?:-?A)?|GTIN(?:-?13)?)\s*[:#-]?\s*(\d{12,13})\b/gi)]
      .map(match => match[1]);
    return [...new Set(codes)].map(gtin => ({
      gtin,
      asin: query.value,
      title: result.title || 'Risultato web da verificare',
      evidence: {provider: `Web · ${url.hostname}`, url: url.href, title: result.title || 'Risultato web da verificare', asin: query.value},
    }));
  });
}

export async function searchWeb(query: ProductQuery): Promise<RawCandidate[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key || query.kind !== 'asin') return [];
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', `"${query.value}" EAN barcode`);
  url.searchParams.set('count', '20');
  url.searchParams.set('extra_snippets', 'true');
  const response = await fetch(url, {
    headers: {'Accept':'application/json', 'X-Subscription-Token':key},
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as {web?:{results?:SearchResult[]}};
  return extractWebCandidates(query, payload.web?.results || []);
}
