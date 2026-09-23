import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseQuery, validGtin, rankCandidates} from '../dist/index.js';
test('Amazon URL, ASIN and names are classified',()=>{
 assert.equal(parseQuery('https://www.amazon.it/dp/B09SY5QHHJ?tag=x').value,'B09SY5QHHJ');
 assert.equal(parseQuery('b09sy5qhhj').kind,'asin');
 assert.equal(parseQuery('siero viso 100 ml').kind,'name');
 assert.throws(()=>parseQuery('https://example.com/dp/B09SY5QHHJ'));
});
test('EAN checksum and mismatched variants',()=>{
 assert.equal(validGtin('8054383070350'),true);
 assert.equal(validGtin('8054383070351'),false);
 const result=rankCandidates(parseQuery('Siero viso 100 ml'),[{gtin:'8054383070350',title:'Siero viso 50 ml',evidence:{provider:'fixture',url:'https://example.org',title:'Siero viso 50 ml'}}]);
 assert.equal(result[0].confidence,'low');
 assert.match(result[0].reasons.join(' '),/diverso/);
});
