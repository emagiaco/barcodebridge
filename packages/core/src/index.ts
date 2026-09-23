export type InputKind = 'asin' | 'name' | 'gtin';
export type ProductQuery = { kind: InputKind; value: string; nameHint?: string };
export type Evidence = { provider: string; url: string; title: string; brand?: string; quantity?: string; asin?: string };
export type RawCandidate = { gtin: string; title: string; brand?: string; quantity?: string; asin?: string; evidence: Evidence };
export type Result = { gtin: string; format: 'EAN-13' | 'UPC-A' | 'EAN-8'; title: string; brand?: string; quantity?: string; confidence: 'high' | 'medium' | 'low'; reasons: string[]; evidence: Evidence[] };

export function parseQuery(raw: string, nameHint?: string): ProductQuery {
  const value = raw.trim();
  if (!value || value.length > 250) throw new Error('Inserisci un identificatore o un nome (massimo 250 caratteri).');
  let token = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!/(^|\.)amazon\.[a-z.]+$/i.test(url.hostname)) throw new Error('Sono supportati solo URL Amazon.');
    const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
    if (!match) throw new Error('Non trovo un ASIN in questo URL Amazon.');
    token = match[1];
  }
  if (/^B[A-Z0-9]{9}$/i.test(token)) return {kind:'asin',value:token.toUpperCase(),nameHint:nameHint?.trim().slice(0,160)};
  if (/^\d{8}$|^\d{12}$|^\d{13}$/.test(token)) return {kind:'gtin',value:token};
  if (/^https?:\/\//i.test(token)) throw new Error('Inserisci un URL Amazon valido.');
  if (token.length < 3) throw new Error('Scrivi almeno tre caratteri.');
  return {kind:'name',value:token};
}

export function validGtin(code: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = [...code].map(Number); const check = digits.pop()!;
  const sum = digits.reverse().reduce((total,digit,index)=>total+digit*(index%2===0?3:1),0);
  return (10-sum%10)%10===check;
}
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const tokens = (s: string) => new Set(normalize(s).split(' ').filter(x=>x.length>2));
function similarity(a: string,b:string) { const x=tokens(a), y=tokens(b); return x.size ? [...x].filter(t=>y.has(t)).length/x.size : 0; }
const quantity = (s: string) => [...normalize(s).matchAll(/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|g|kg|pcs|pezzi|x)\b/g)].map(x=>x[0].replace(/\s+/g,''));

export function rankCandidates(query: ProductQuery, raw: RawCandidate[]): Result[] {
  const grouped = new Map<string,RawCandidate[]>();
  for (const item of raw) if(validGtin(item.gtin)) {
    // A leading-zero EAN and the equivalent UPC represent one physical symbol.
    const key = item.gtin.length===13 && item.gtin.startsWith('0') ? item.gtin.slice(1) : item.gtin;
    grouped.set(key,[...(grouped.get(key)||[]),item]);
  }
  return [...grouped].map(([gtin,items])=>{
    const best=items[0], providers=new Set(items.map(x=>x.evidence.provider));
    const reference=query.kind==='name'?query.value:query.nameHint||'';
    const sim=reference?Math.max(...items.map(x=>similarity(reference,x.title))):0;
    const expected=quantity(reference), actual=quantity(items.map(x=>[x.title,x.quantity].filter(Boolean).join(' ')).join(' '));
    const mismatch=expected.length>0 && actual.length>0 && !expected.some(x=>actual.includes(x));
    const asinMatched=query.kind==='asin' && items.some(x=>x.asin?.toUpperCase()===query.value);
    const reasons=['Cifra di controllo valida'];
    if(asinMatched) reasons.push('ASIN associato esplicitamente alla fonte');
    if(sim>=.65) reasons.push('Nome del prodotto compatibile');
    if(expected.length && !mismatch && expected.some(x=>actual.includes(x))) reasons.push('Formato corrispondente');
    if(providers.size>1) reasons.push(`${providers.size} fonti distinte concordano`);
    if(mismatch) reasons.push('Attenzione: il formato potrebbe essere diverso');
    let score=.12 + (asinMatched ? .52 : 0) + (sim>=.65 ? .30 : sim>=.35 ? .13 : 0) + (providers.size>1 ? .25 : 0) + (expected.length&&!mismatch&&actual.length ? .13 : 0) - (mismatch ? .45 : 0);
    score=Math.max(0,Math.min(1,score));
    return {gtin,format:gtin.length===8?'EAN-8':gtin.length===12?'UPC-A':'EAN-13',title:best.title,brand:best.brand,quantity:best.quantity,confidence:score>=.72?'high':score>=.40?'medium':'low',reasons,evidence:items.map(x=>x.evidence)} as Result;
  }).sort((a,b)=>({high:3,medium:2,low:1}[b.confidence]-{high:3,medium:2,low:1}[a.confidence] || b.evidence.length-a.evidence.length));
}
