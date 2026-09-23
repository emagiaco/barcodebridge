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
test('ASIN search retries once with a marketplace query when the first snippets lack an EAN',async()=>{
 const original=global.fetch, calls=[];
 const uniqueAsin='B'+(Date.now()+1).toString(36).toUpperCase().padStart(9,'0').slice(-9);
 global.fetch=async(_url,options)=>{
  const term=JSON.parse(options.body).query;calls.push(term);
  return new Response(JSON.stringify({results:term.includes('ebay')?[{url:'https://www.ebay.it/itm/123',title:`Luminer ${uniqueAsin}`,content:'EAN 8054383070350'}]:[]}),{status:200});
 };
 try {
  const response=await app.inject({method:'POST',url:'/api/resolve',payload:{input:uniqueAsin,keys:{tavily:'personal-test-key'}}});
  assert.equal(response.json().results[0].gtin,'8054383070350');
  assert.equal(calls.length,2);
  assert.match(calls[1],/EAN ebay/);
 } finally {global.fetch=original}
});
