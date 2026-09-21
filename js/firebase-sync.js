/* firebase-sync.js — optional cloud sync using YOUR Firebase project,
   via the Realtime Database (Firestore + Cloud Storage were dropped
   because Firebase now requires a paid Blaze plan just to enable
   Storage, even for free-tier usage — Realtime Database stays free on
   the Spark plan). Anonymous Auth is used only so the security rules
   below can require "must be signed in".

   This file is loaded as a native ES module:
     <script type="module" src="js/firebase-sync.js"></script>
   Modules have their own scope (they do NOT share globals with the
   classic <script> files the rest of the app uses), so everything
   useful here is attached to `window.cloudSync` — see js/sync.js for
   the plain-JS orchestration that calls it.

   IMPORTANT — one-time setup (also see README.md):
   1. Firebase console → Realtime Database → Create Database (Spark/free
      plan is fine — no billing needed).
   2. Copy the databaseURL Firebase shows you (looks like
      https://<project>-default-rtdb.<region>.firebasedatabase.app) into
      firebaseConfig.databaseURL below.
   3. Authentication → Sign-in method → Anonymous → Enable.
   4. Realtime Database → Rules → paste the JSON rules from README.md.
   Without step 4 your data is wide open to the internet; with only
   that, anyone who learns your "Sync Code" (set in Settings → Cloud
   Sync) can read/write that code's data — the code is a shared secret,
   not a login. Keep it private, the same way you'd keep a shared
   folder link private. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, get, remove }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWvX2LgPOuDygfmXdyIbfQD_d0z0njvb4",
  authDomain: "k3t3-e89c0.firebaseapp.com",
  projectId: "k3t3-e89c0",
  storageBucket: "k3t3-e89c0.firebasestorage.app",
  messagingSenderId: "629317146848",
  appId: "1:629317146848:web:ce27c836c75bf33af09885",
  // ⬇️ REQUIRED for Realtime Database — paste the URL Firebase shows you
  // right after you create the database (Firebase console → Realtime
  // Database → top of the Data tab). Looks like:
  // "https://k3t3-e89c0-default-rtdb.asia-southeast1.firebasedatabase.app"
  databaseURL: "https://k3t3-e89c0-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const authReady = new Promise(resolve=>{
  onAuthStateChanged(auth, user=>{
    if(user) resolve(user);
    else signInAnonymously(auth).catch(err=>{ console.error('Firebase sign-in failed', err); resolve(null); });
  });
});

function entriesPath(code){ return `syncCodes/${code}/entries`; }
function entryPath(code, id){ return `syncCodes/${code}/entries/${id}`; }

async function pushEntry(code, entry){
  await authReady;
  const photos = (entry._photos||[]).map(p=>({id:p.id, dataUrl:p.dataUrl, caption:p.caption||''}));
  const audio = (entry._audio||[]).map(a=>({id:a.id, dataUrl:a.dataUrl}));
  const payload = {
    date: entry.date, time: entry.time, title: entry.title||'', content: entry.content||'',
    mood: entry.mood||'', weather: entry.weather||'', temperature: entry.temperature||'', location: entry.location||'',
    tags: entry.tags||[], people: entry.people||[], favorite: !!entry.favorite, pinned: !!entry.pinned,
    translations: entry.translations||{}, photos, audio,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt
  };
  await set(ref(db, entryPath(code, entry.id)), payload);
}

async function pushAll(code, entries){
  let count = 0;
  for(const e of entries){ await pushEntry(code, e); count++; }
  return count;
}

async function deleteRemoteEntry(code, id){
  await authReady;
  await remove(ref(db, entryPath(code, id))).catch(()=>{});
}

async function pullAll(code){
  await authReady;
  const snap = await get(ref(db, entriesPath(code)));
  const out = [];
  if(snap.exists()){
    const val = snap.val();
    for(const id of Object.keys(val)) out.push(Object.assign({id}, val[id]));
  }
  return out;
}

window.cloudSync = {
  ready: authReady.then(u=> !!u).catch(()=>false),
  pushAll, pullAll, deleteRemoteEntry
};
