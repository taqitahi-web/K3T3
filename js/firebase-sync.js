/* firebase-sync.js — optional cloud sync using YOUR Firebase project
   (Firestore for entry data, Storage for photos/voice notes, Anonymous
   Auth just to satisfy security rules that require request.auth != null).

   This file is loaded as a native ES module:
     <script type="module" src="js/firebase-sync.js"></script>
   Modules have their own scope (they do NOT share globals with the
   classic <script> files the rest of the app uses), so everything
   useful here is attached to `window.cloudSync` — see js/sync.js for
   the plain-JS orchestration that calls it.

   IMPORTANT — read before turning this on (also see README.md):
   1. In the Firebase console, enable Authentication → Sign-in method →
      Anonymous.
   2. Set Firestore rules and Storage rules to require request.auth !=
      null (exact rules are in README.md). Without this, your data is
      wide open to the internet; with only this, anyone who learns your
      "Sync Code" (set in Settings → Cloud Sync) can read/write that
      code's data — the code is a shared secret, not a login. Keep it
      private, the same way you'd keep a shared folder link private. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, getDocs, collection }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWvX2LgPOuDygfmXdyIbfQD_d0z0njvb4",
  authDomain: "k3t3-e89c0.firebaseapp.com",
  projectId: "k3t3-e89c0",
  storageBucket: "k3t3-e89c0.firebasestorage.app",
  messagingSenderId: "629317146848",
  appId: "1:629317146848:web:ce27c836c75bf33af09885"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const authReady = new Promise(resolve=>{
  onAuthStateChanged(auth, user=>{
    if(user) resolve(user);
    else signInAnonymously(auth).catch(err=>{ console.error('Firebase sign-in failed', err); resolve(null); });
  });
});

function entriesCol(code){ return collection(db, 'syncCodes', code, 'entries'); }
function entryDoc(code, id){ return doc(db, 'syncCodes', code, 'entries', id); }

// Uploads a local base64 photo/audio item to Storage the first time
// (its dataUrl still starts with "data:"); an item already synced once
// carries an https URL and is returned as-is, so re-syncing is cheap.
async function uploadMediaIfLocal(code, item, kind){
  if(!item.dataUrl || !item.dataUrl.startsWith('data:')) return item.dataUrl;
  const path = `syncCodes/${code}/${kind}/${item.id}`;
  const r = ref(storage, path);
  await uploadString(r, item.dataUrl, 'data_url');
  return await getDownloadURL(r);
}

async function pushEntry(code, entry){
  await authReady;
  const photos = [];
  for(const p of (entry._photos||[])){
    const url = await uploadMediaIfLocal(code, p, 'photos');
    photos.push({id:p.id, url, caption:p.caption||''});
  }
  const audio = [];
  for(const a of (entry._audio||[])){
    const url = await uploadMediaIfLocal(code, a, 'audio');
    audio.push({id:a.id, url});
  }
  const payload = {
    date: entry.date, time: entry.time, title: entry.title||'', content: entry.content||'',
    mood: entry.mood||'', weather: entry.weather||'', temperature: entry.temperature||'', location: entry.location||'',
    tags: entry.tags||[], people: entry.people||[], favorite: !!entry.favorite, pinned: !!entry.pinned,
    translations: entry.translations||{}, photos, audio,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt
  };
  await setDoc(entryDoc(code, entry.id), payload);
}

async function pushAll(code, entries){
  let count = 0;
  for(const e of entries){ await pushEntry(code, e); count++; }
  return count;
}

async function deleteRemoteEntry(code, id){
  await authReady;
  await deleteDoc(entryDoc(code, id)).catch(()=>{});
}

async function pullAll(code){
  await authReady;
  const snap = await getDocs(entriesCol(code));
  const out = [];
  snap.forEach(d=> out.push(Object.assign({id:d.id}, d.data())));
  return out;
}

window.cloudSync = {
  ready: authReady.then(u=> !!u).catch(()=>false),
  pushAll, pullAll, deleteRemoteEntry
};
