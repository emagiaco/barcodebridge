import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {RawCandidate} from '@barcodebridge/core';
const filename=resolve(process.env.BARCODEBRIDGE_DB_PATH||'./data/barcodebridge.sqlite');
mkdirSync(dirname(filename),{recursive:true});
const db=new DatabaseSync(filename);
db.exec('CREATE TABLE IF NOT EXISTS search_cache (query TEXT PRIMARY KEY, candidates TEXT NOT NULL, expires_at INTEGER NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS shared_quota (day TEXT PRIMARY KEY, count INTEGER NOT NULL)');
export function reserveSharedSearch():boolean {
 const day=new Date().toISOString().slice(0,10);
 db.prepare('INSERT OR IGNORE INTO shared_quota(day,count) VALUES(?,0)').run(day);
 return !!db.prepare('UPDATE shared_quota SET count=count+1 WHERE day=? AND count<25 RETURNING count').get(day);
}
export function cached(query:string):RawCandidate[]|null {
 const row=db.prepare('SELECT candidates FROM search_cache WHERE query = ? AND expires_at > ?').get(query,Date.now()) as {candidates:string}|undefined;
 try{return row?JSON.parse(row.candidates):null}catch{return null}
}
export function cache(query:string,items:RawCandidate[]) {
 if(!items.length)return;
 db.prepare('INSERT OR REPLACE INTO search_cache(query,candidates,expires_at) VALUES(?,?,?)').run(query,JSON.stringify(items),Date.now()+7*86400_000);
}
