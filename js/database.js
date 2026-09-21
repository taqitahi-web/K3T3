/* database.js — IndexedDB persistence layer.
   Stores: entries, photos, audio, settings, drafts. */

const DB_NAME = 'pages-from-my-life';
const DB_VERSION = 1;
let dbInstance = null;

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('entries')){
        const s = db.createObjectStore('entries', {keyPath:'id'});
        s.createIndex('date','date');
        s.createIndex('favorite','favorite');
        s.createIndex('pinned','pinned');
      }
      if(!db.objectStoreNames.contains('photos')){
        const s = db.createObjectStore('photos', {keyPath:'id'});
        s.createIndex('entryId','entryId');
      }
      if(!db.objectStoreNames.contains('audio')){
        const s = db.createObjectStore('audio', {keyPath:'id'});
        s.createIndex('entryId','entryId');
      }
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings', {keyPath:'key'});
      }
      if(!db.objectStoreNames.contains('drafts')){
        db.createObjectStore('drafts', {keyPath:'key'});
      }
    };
    req.onsuccess = e=> resolve(e.target.result);
    req.onerror = e=> reject(e.target.error);
  });
}

function tx(store, mode='readonly'){
  return dbInstance.transaction(store, mode).objectStore(store);
}
function reqToPromise(req){
  return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
}

const DB = {
  async put(store, obj){ return reqToPromise(tx(store,'readwrite').put(obj)); },
  async get(store, id){ return reqToPromise(tx(store).get(id)); },
  async delete(store, id){ return reqToPromise(tx(store,'readwrite').delete(id)); },
  async all(store){ return reqToPromise(tx(store).getAll()); },
  async byIndex(store, index, value){ return reqToPromise(tx(store).index(index).getAll(value)); }
};
