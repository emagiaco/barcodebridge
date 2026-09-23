import Fastify from 'fastify';
import {fileURLToPath} from 'node:url';
import {parseQuery,rankCandidates,type ProductQuery,type RawCandidate} from '@barcodebridge/core';
import {resolveWithSearch,type SearchDiagnostics} from './search-ai.js';
import {cached,cache,reserveSharedSearch} from './cache.js';
export const app=Fastify({logger:false});
const timeout=5000;
async function getJson(url:URL) {
 const response=await fetch(url,{headers:{'User-Agent':'BarcodeBridge/0.1 (open source; contact: https://github.com)'},signal:AbortSignal.timeout(timeout)});
 if(!response.ok) throw new Error(`HTTP ${response.status}`);
 return response.json() as Promise<any>;
}
function searchTerm(query:ProductQuery) {return query.kind==='gtin'?query.value:query.kind==='asin'?(query.nameHint||query.value):query.value;}
async function upcitemdb(query:ProductQuery):Promise<RawCandidate[]> {
 const term=searchTerm(query), byCode=query.kind==='gtin';
 const url=new URL(`https://api.upcitemdb.com/prod/trial/${byCode?'lookup':'search'}`);
 url.searchParams.set(byCode?'upc':'s',term);
 // UPCitemdb may return 404 when its catalogue has no match for a text search.
 // This does not indicate that the Tavily search failed.
 let data:any;
 try {data=await getJson(url)} catch(error){if((error as Error).message==='HTTP 404')return [];throw error}
 return (data.items||[]).slice(0,10).map((item:any)=>({gtin:String(item.ean||item.upc||''),title:String(item.title||''),brand:item.brand||undefined,quantity:item.size||undefined,evidence:{provider:'UPCitemdb',url:`https://www.upcitemdb.com/upc/${encodeURIComponent(String(item.ean||item.upc||''))}`,title:String(item.title||''),brand:item.brand||undefined,quantity:item.size||undefined}}));
}
async function openFacts(query:ProductQuery,host:string,label:string):Promise<RawCandidate[]> {
 // Open Facts offers product lookup by code and a full-text search endpoint.
 const url=query.kind==='gtin'?new URL(`https://${host}/api/v2/product/${query.value}.json`):new URL(`https://${host}/cgi/search.pl`);
 if(query.kind!=='gtin') {url.searchParams.set('search_terms',searchTerm(query));url.searchParams.set('search_simple','1');url.searchParams.set('action','process');url.searchParams.set('json','1');url.searchParams.set('page_size','10');}
 url.searchParams.set('fields','code,product_name,brands,quantity');
 const data=await getJson(url);const products=query.kind==='gtin'?(data.status===1?[data.product]:[]):(data.products||[]);
 return products.slice(0,10).map((p:any)=>({gtin:String(p.code||''),title:String(p.product_name||''),brand:p.brands||undefined,quantity:p.quantity||undefined,evidence:{provider:label,url:`https://${host}/product/${encodeURIComponent(String(p.code||''))}`,title:String(p.product_name||''),brand:p.brands||undefined,quantity:p.quantity||undefined}}));
}
async function barcodeLookup(query:ProductQuery):Promise<RawCandidate[]> {
 const key=process.env.BARCODELOOKUP_API_KEY;if(!key)return [];
 const url=new URL('https://api.barcodelookup.com/v3/products');
 url.searchParams.set('key',key);url.searchParams.set(query.kind==='gtin'?'barcode':query.kind==='asin'?'asin':'search',query.kind==='asin'?query.value:searchTerm(query));
 const data=await getJson(url);
 return (data.products||[]).slice(0,10).map((p:any)=>({gtin:String(p.barcode_number||''),title:String(p.title||''),brand:p.brand||undefined,asin:p.asin||undefined,evidence:{provider:'Barcode Lookup',url:`https://www.barcodelookup.com/${encodeURIComponent(String(p.barcode_number||''))}`,title:String(p.title||''),brand:p.brand||undefined,asin:p.asin||undefined}}));
}
const providers=[{name:'UPCitemdb',run:upcitemdb},{name:'Open Beauty Facts',run:(q:ProductQuery)=>openFacts(q,'world.openbeautyfacts.org','Open Beauty Facts')},{name:'Open Food Facts',run:(q:ProductQuery)=>openFacts(q,'world.openfoodfacts.org','Open Food Facts')},{name:'Barcode Lookup',run:barcodeLookup}];
const attempts=new Map<string,{count:number;until:number}>();
function allow(ip:string) {
 const now=Date.now(),entry=attempts.get(ip);
 if(!entry||entry.until<now){attempts.set(ip,{count:1,until:now+60_000});return true}
 if(entry.count>=10)return false;
 entry.count++;return true;
}
app.get('/api/health',async()=>({ok:true}));
app.post<{Body:{input?:string;nameHint?:string;keys?:{tavily?:string;gemini?:string}}}>('/api/resolve', {bodyLimit:4096}, async(request,reply)=>{
 if(!allow(request.ip)) return reply.code(429).send({error:'Troppe ricerche. Riprova tra un minuto.'});
 let query:ProductQuery;try{query=parseQuery(request.body?.input||'',request.body?.nameHint);}catch(error){return reply.code(400).send({error:(error as Error).message});}
 const userKeys=request.body?.keys||{};
 if([userKeys.tavily,userKeys.gemini].some(key=>key!==undefined&&(typeof key!=='string'||key.length>256)))return reply.code(400).send({error:'Chiave API non valida.'});
 const key=userKeys.tavily||process.env.TAVILY_API_KEY;
 const gemini=userKeys.gemini||process.env.GEMINI_API_KEY;
 const searchCacheKey=JSON.stringify({kind:query.kind,value:query.value,nameHint:query.nameHint||''});
 let searchCandidates=cached(searchCacheKey);
 const searchDiagnostics:SearchDiagnostics={searches:0,pages:0,asinPages:0,verifiedCodes:0};
 const errors:string[]=[];
 if(!searchCandidates && key && query.kind!=='gtin') {
  try{searchCandidates=await resolveWithSearch(query,{tavily:key,gemini},()=>!!userKeys.tavily||reserveSharedSearch(),searchDiagnostics);cache(searchCacheKey,searchCandidates)}
  catch(error){errors.push((error as Error).message);searchCandidates=[]}
 }
 const active=query.kind==='asin'&&!query.nameHint
  ? providers.filter(p=>p.name==='Barcode Lookup')
  : providers;
 const settled=await Promise.allSettled(active.map(p=>p.run(query)));
 const candidates=[...(searchCandidates||[]),...settled.flatMap(x=>x.status==='fulfilled'?x.value:[])];
 errors.push(...settled.flatMap((x,i)=>x.status==='rejected'?[`${active[i].name}: ${(x.reason as Error).message}`]:[]));
 const results=rankCandidates(query,candidates).slice(0,15);
 return {query,results,providerErrors:errors,needsNameHint:query.kind==='asin'&&!query.nameHint&&!results.length,searchAvailable:!!key,searchDiagnostics};
});
const port=Number(process.env.PORT||3001);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
 app.listen({port,host:'0.0.0.0'}).catch(err=>{console.error(err);process.exit(1)});
}
