import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {app} from '../dist/server.js';
import {extractDirect,geminiExtract} from '../dist/search-ai.js';
const query={kind:'asin',value:'B09SY5QHHJ'};
const hits=[
 {url:'https://shop.example/serum',title:'Luminer siero 100 ml B09SY5QHHJ',content:'EAN: 8054383070350'},
 {url:'https://another.example/serum',title:'Un altro prodotto',content:'EAN: 8054383070350'},
 {url:'javascript:alert(1)',title:'B09SY5QHHJ',content:'EAN 8054383070350'},
];
test('ASIN and labelled EAN must appear on the same HTTPS search result',()=>{
 const found=extractDirect(query,hits);
 assert.equal(found.length,1);
 assert.equal(found[0].gtin,'8054383070350');
 assert.equal(found[0].evidence.url,'https://shop.example/serum');
});
test('Gemini cannot introduce a barcode missing from cited snippet',async()=>{
 const fetchOriginal=global.fetch;
 global.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({candidates:[{sourceIndex:0,gtin:'8054383070350',title:'Luminer'},{sourceIndex:0,gtin:'4006381333931',title:'Hallucinated'}]})}]}}]}),{status:200});
 try{const found=await geminiExtract(query,hits,'fake-key');assert.equal(found.length,1);assert.equal(found[0].gtin,'8054383070350')}
 finally{global.fetch=fetchOriginal}
});
test('API resolves an ASIN with one search call and a personal key',async()=>{
 const fetchOriginal=global.fetch;
 const calls=[];
 const uniqueAsin='B'+Date.now().toString(36).toUpperCase().padStart(9,'0').slice(-9);
 const hit={...hits[0],title:`Luminer siero 100 ml ${uniqueAsin}`};
 global.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({results:[hit]}),{status:200})};
 try{const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.statusCode,200);assert.equal(response.json().results[0].gtin,'8054383070350');
  assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer personal-test-key');
 }finally{global.fetch=fetchOriginal}
});
test('structured ASIN lookup is attempted before Tavily and skips search on a valid match',async()=>{
 const original=global.fetch,oldKey=process.env.BARCODELOOKUP_API_KEY,calls=[];
 process.env.BARCODELOOKUP_API_KEY='test-server-key';
 const uniqueAsin='B'+(Date.now()+9).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({products:[{asin:uniqueAsin,barcode_number:'4150193803301',title:'Siero 30 ml'}]}))};
 try{const response=await app.inject({method:'POST',url:'/api/resolve',remoteAddress:'10.0.0.30',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.json().results[0].gtin,'4150193803301');assert.equal(calls.length,1);
  assert.match(calls[0],/api\.barcodelookup\.com/);assert.equal(response.json().searchDiagnostics.searches,0);
 }finally{global.fetch=original;if(oldKey===undefined)delete process.env.BARCODELOOKUP_API_KEY;else process.env.BARCODELOOKUP_API_KEY=oldKey}
});
test('ASIN search retries once with an EAN query when the first snippets lack an EAN',async()=>{
 const original=global.fetch, calls=[];
 const uniqueAsin='B'+(Date.now()+1).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body),term=body.query;assert.equal(body.exact_match,undefined);calls.push(term);
  return new Response(JSON.stringify({results:term.endsWith(' EAN')?[{url:'https://www.ebay.it/itm/123',title:`Luminer ${uniqueAsin}`,content:'EAN 8054383070350'}]:[]}),{status:200});
 };
 try {
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.json().results[0].gtin,'8054383070350');
  assert.equal(calls.length,2);
  assert.equal(calls[0],uniqueAsin);
  assert.equal(calls[1],`${uniqueAsin} EAN`);
 } finally {global.fetch=original}
});
test('ASIN search uses full source text when the short snippet omits the barcode',async()=>{
 const original=global.fetch;
 const uniqueAsin='B'+(Date.now()+2).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 const calls=[];
 global.fetch=async(_url,options)=>{
  calls.push(JSON.parse(options.body));
  return new Response(JSON.stringify({results:[{url:'https://example.com/item',title:`Luminer ${uniqueAsin}`,content:'Siero 100 ml',raw_content:`Prodotto ${uniqueAsin}. EAN: 8054383070350`}]}),{status:200});
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.json().results[0].gtin,'8054383070350');
  assert.equal(response.json().searchDiagnostics.verifiedCodes,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].include_raw_content,'text');
 }finally{global.fetch=original}
});
test('reads a matching product page when the search preview omits its EAN',async()=>{
 const original=global.fetch,calls=[];
 const uniqueAsin='B'+(Date.now()+4).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 const url='https://www.odkarla.sk/serum-la-roche-posay-pre-vsetky-typy-pleti~p1838182';
 global.fetch=async(endpoint,options)=>{
  const body=JSON.parse(options.body);calls.push({endpoint:String(endpoint),body});
  if(String(endpoint).endsWith('/search'))return new Response(JSON.stringify({results:[{url,title:'La Roche-Posay C12 30 ml',content:`ASIN: ${uniqueAsin}` }]}));
  assert.equal(body.extract_depth,'basic');assert.deepEqual(body.urls,[url]);
  return new Response(JSON.stringify({results:[{url,raw_content:`Sérum La Roche-Posay 30 ml EAN: 4150193803301 ASIN: ${uniqueAsin}`}],failed_results:[]}));
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.statusCode,200);assert.equal(response.json().results[0].gtin,'4150193803301');
  assert.equal(calls.length,2);assert.ok(calls[1].endpoint.endsWith('/extract'));
  assert.equal(response.json().searchDiagnostics.extractAttempt.extracted,1);
 }finally{global.fetch=original}
});
test('ignores unrelated EANs elsewhere in an extracted page',async()=>{
 const original=global.fetch,calls=[];
 const uniqueAsin='B'+(Date.now()+5).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(endpoint,options)=>{
  calls.push(String(endpoint));
  if(String(endpoint).endsWith('/extract'))return new Response(JSON.stringify({results:[{url:'https://example.com/item',raw_content:`Product ${uniqueAsin} ${'details '.repeat(400)} Recommended product EAN: 4150193803301`}]}));
  return new Response(JSON.stringify({results:String(endpoint).endsWith('/search')&&JSON.parse(options.body).query===uniqueAsin?[{url:'https://example.com/item',title:'Product',content:uniqueAsin}]:[]}));
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.json().results.length,0);assert.equal(calls.length,3);
 }finally{global.fetch=original}
});
test('links an ASIN to a GTIN through the exact model with both sources and medium confidence',async()=>{
 const original=global.fetch,calls=[];
 const uniqueAsin='B'+(Date.now()+6).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(endpoint,options)=>{
  const body=JSON.parse(options.body);calls.push({endpoint:String(endpoint),body});
  if(String(endpoint).endsWith('/extract'))return new Response(JSON.stringify({results:[],failed_results:[]}));
  return new Response(JSON.stringify({results:body.query===uniqueAsin?[
   {url:'https://seller.example/lexar',title:'Lexar NS100 2TB LNS100-2TRB',content:`ASIN ${uniqueAsin} model LNS100-2TRB`},
   {url:'https://review.example/lexar',title:'Lexar NS100 2TB LNS100-2TRB',content:`ASIN ${uniqueAsin} model LNS100-2TRB`}
  ]:[{url:'https://catalog.example/lexar',title:'Lexar NS100 2TB LNS100-2TRB',content:'EAN: 0843367120758'}]}));
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  const result=response.json().results[0];
  assert.equal(calls[2].body.query,'LNS100-2TRB GTIN UPC');
  assert.equal(result.gtin,'843367120758');assert.equal(result.confidence,'medium');
  assert.equal(result.evidence.length,2);assert.match(result.reasons.join(' '),/modello LNS100-2TRB/);
  assert.ok(!result.reasons.includes('ASIN associato esplicitamente alla fonte'));
 }finally{global.fetch=original}
});
test('searches product name and size when ASIN has no model, preserving indirect evidence',async()=>{
 const original=global.fetch,calls=[];
 const uniqueAsin='B'+(Date.now()+7).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(endpoint,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  if(String(endpoint).endsWith('/extract'))return new Response(JSON.stringify({results:[]}));
  return new Response(JSON.stringify({results:body.query===uniqueAsin?[
   {url:`https://www.amazon.it/dp/${uniqueAsin}`,title:'Luminer Hyaluronic Acid Face Serum 100 ml',content:`ASIN: ${uniqueAsin}`}
  ]:[{url:'https://store.example/luminer',title:'Luminer Hyaluronic Acid Face Serum 100 ml',content:'EAN: 4150193803301'}]}));
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',remoteAddress:'10.0.0.23',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.match(calls[2].query,/luminer.*hyaluronic.*acid.*100ml.*GTIN/i);
  const result=response.json().results[0];assert.equal(result.gtin,'4150193803301');
  assert.equal(result.confidence,'medium');assert.equal(result.evidence.length,2);
  assert.match(result.reasons.join(' '),/indiretta per nome/);
 }finally{global.fetch=original}
});
test('does not link an ASIN to a different size of the same product',async()=>{
 const original=global.fetch;
 const uniqueAsin='B'+(Date.now()+8).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(endpoint,options)=>{
  const body=JSON.parse(options.body);
  if(String(endpoint).endsWith('/extract'))return new Response(JSON.stringify({results:[]}));
  return new Response(JSON.stringify({results:body.query===uniqueAsin?[
   {url:`https://www.amazon.it/dp/${uniqueAsin}`,title:'Luminer Hyaluronic Acid Face Serum 100 ml',content:`ASIN: ${uniqueAsin}`}
  ]:[{url:'https://store.example/luminer',title:'Luminer Hyaluronic Acid Face Serum 30 ml',content:'EAN: 4150193803301'}]}));
 };
 try{const response=await app.inject({method:'POST',url:'/api/resolve',remoteAddress:'10.0.0.24',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});assert.equal(response.json().results.length,0)}
 finally{global.fetch=original}
});
test('valid barcode input is rendered without depending on external catalogues',async()=>{
 const original=global.fetch;global.fetch=async()=>{throw new Error('No network expected')};
 try{const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:'8054383070350'}});
  assert.equal(response.statusCode,200);assert.equal(response.json().results[0].gtin,'8054383070350');
  assert.equal(response.json().results[0].evidence.length,0);
 }finally{global.fetch=original}
});
test('invalid characters in a personal Gemini key are explained without leaking it',async()=>{
 const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:'B09SY5QHHJ',keys:{gemini:'not-a-key-√'}}});
 assert.equal(response.statusCode,400);assert.match(response.json().error,/chiave Gemini contiene caratteri non validi/);
 assert.ok(!JSON.stringify(response.json()).includes('not-a-key'));
});
test('Tavily 400 diagnostics include the provider response without exposing the key',async()=>{
 const original=global.fetch;
 const personal='tvly-secret-test';
 const uniqueAsin='B'+(Date.now()+3).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.query,uniqueAsin);assert.equal(body.exact_match,undefined);
  return new Response(JSON.stringify({detail:`Invalid query; token ${personal}`}),{status:400});
 };
 try{
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:personal}}});
  const json=response.json();
  assert.equal(json.searchDiagnostics.attempts[0].httpStatus,400);
  assert.match(json.searchDiagnostics.attempts[0].error,/Invalid query/);
  assert.ok(!JSON.stringify(json).includes(personal));
 }finally{global.fetch=original}
});
