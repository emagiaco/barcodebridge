import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {app} from '../dist/server.js';
import {extractWebCandidates} from '../dist/web-search.js';

test('known ASIN resolves without external APIs or a name hint', async () => {
  const reply = await app.inject({method:'POST', url:'/api/resolve', payload:{input:'B09SY5QHHJ'}});
  assert.equal(reply.statusCode, 200);
  const body = reply.json();
  assert.equal(body.results[0].gtin, '8054383070350');
  assert.equal(body.results[0].confidence, 'high');
  assert.equal(body.results[0].evidence.length, 2);
  assert.equal(body.needsNameHint, false);
});

test('web candidate needs ASIN and labelled barcode on the same search result', () => {
  const query = {kind:'asin',value:'B09SY5QHHJ'};
  const results = extractWebCandidates(query, [
    {url:'https://seller.example/product',title:'Luminer B09SY5QHHJ',description:'EAN 8054383070350'},
    {url:'https://other.example/product',title:'Different product',description:'EAN 8054383070350'},
    {url:'javascript:alert(1)',title:'B09SY5QHHJ',description:'EAN 8054383070350'},
    {url:'https://seller.example/unlabelled',title:'B09SY5QHHJ',description:'8054383070350'},
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].gtin, '8054383070350');
});
