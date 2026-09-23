type Keys={tavily:string;gemini:string};
type RecordValue={id:string;salt:number[];iv:number[];cipher:number[]};
const encoder=new TextEncoder();
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('barcodebridge-private',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('secrets',{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function readRecord():Promise<RecordValue|undefined>{
 const db=await openDb();return new Promise((resolve,reject)=>{
  const transaction=db.transaction('secrets','readonly'),req=transaction.objectStore('secrets').get('api-keys');
  req.onsuccess=()=>resolve(req.result as RecordValue|undefined);req.onerror=()=>reject(req.error);
  transaction.oncomplete=()=>db.close();
 });
}
async function derive(passphrase:string,salt:Uint8Array) {
 const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:new Uint8Array(salt),iterations:250_000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function hasSavedKeys(){return !!await readRecord()}
export async function saveKeys(keys:Keys,passphrase:string){
 if(passphrase.length<12)throw new Error('Usa una frase di almeno 12 caratteri.');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(passphrase,salt);
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(keys)));
 const db=await openDb();await new Promise<void>((resolve,reject)=>{
  const t=db.transaction('secrets','readwrite');t.objectStore('secrets').put({id:'api-keys',salt:[...salt],iv:[...iv],cipher:[...new Uint8Array(cipher)]});
  t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);
 });db.close();
}
export async function unlockKeys(passphrase:string):Promise<Keys>{
 const record=await readRecord();if(!record)throw new Error('Nessuna chiave salvata in questo browser.');
 try{const key=await derive(passphrase,new Uint8Array(record.salt));
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)},key,new Uint8Array(record.cipher));
  return JSON.parse(new TextDecoder().decode(bytes)) as Keys;
 }catch{throw new Error('Frase errata o dati non leggibili.');}
}
export async function removeKeys(){
 const db=await openDb();await new Promise<void>((resolve,reject)=>{
  const t=db.transaction('secrets','readwrite');t.objectStore('secrets').delete('api-keys');
  t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);
 });db.close();
}
