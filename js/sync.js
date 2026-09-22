/* sync.js — cloud sync orchestration using window.cloudSync, which
   js/firebase-sync.js (a separate ES module) attaches once Firebase has
   loaded. This file stays plain, dependency-free JS so the rest of the
   app doesn't need to care whether Firebase loaded successfully.

   Sync is fully AUTOMATIC once a Sync Code is set (see journal.js/app.js):
   - Saving the Sync Code the first time runs one full push+pull (see
     syncNow() below) to catch up whatever already exists locally/remotely.
   - Every entry save/delete after that pushes just that one change to
     the cloud right away (journal.js calls autoPushEntry, app.js calls
     window.cloudSync.deleteRemoteEntry directly on delete).
   - Opening the app pulls anything newer from the cloud once, in the
     background (app.js's init() calls autoPullOnStartup).
   There is no button for any of this — failures are surfaced as a
   toast instead of failing silently, since a silent cloud-sync failure
   is very hard to notice otherwise.

   Note: Firebase's SDK is fetched from https://www.gstatic.com — the
   Claude artifact preview's content-security policy does not allow
   scripts from that host, so cloud sync only ever connects when this
   app is self-hosted (e.g. GitHub Pages), never on the claude.ai
   artifact link.

   Every push/pull below does its OWN short wait-and-retry for
   window.cloudSync via waitForCloudSync() rather than trusting a single
   shared "is it available" flag computed once — a slow connection
   loading three chained Firebase modules from gstatic.com could easily
   take longer than a few seconds, and a flag that gets set to "gone"
   after one short timeout would then silently disable sync forever
   even once the module finishes loading a moment later.

   Remember: the Sync Code itself is local to each device/browser — it
   does NOT come from the cloud. A second device needs the exact same
   code typed into its own Settings → Cloud Sync before it will pull
   anything down. */

// Polls for window.cloudSync up to maxWaitMs. Resolves with it once
// found, or null if it never shows up in time.
function waitForCloudSync(maxWaitMs){
  return new Promise(resolve=>{
    const start = Date.now();
    (function poll(){
      if(window.cloudSync) return resolve(window.cloudSync);
      if(Date.now() - start >= maxWaitMs) return resolve(null);
      setTimeout(poll, 200);
    })();
  });
}

// Only for the Settings status line (a synchronous render — can't
// await there). Purely informational; push/pull never rely on this.
let cloudSyncLikelyBlocked = false;
setTimeout(()=>{ if(!window.cloudSync) cloudSyncLikelyBlocked = true; }, 10000);

function syncStatusLine(){
  if(!SETTINGS.syncCode) return 'Cloud sync is off — set a Sync Code below to turn it on.';
  if(window.cloudSync) return SETTINGS.lastSync ? `Auto-syncing. Last activity: ${fmtDateLong(SETTINGS.lastSync.slice(0,10))} ${fmtTime12(SETTINGS.lastSync.slice(11,16))}` : 'Auto-syncing — nothing pushed yet.';
  if(cloudSyncLikelyBlocked) return "Cloud sync isn't reachable here (this Claude preview blocks Firebase's CDN, or your connection is slow) — it works from the self-hosted copy, e.g. GitHub Pages.";
  return 'Connecting to Firebase…';
}

// Merges a batch of remote entries into local storage: anything missing
// locally, or newer than the local copy, is written in; anything the
// same or older locally is left alone. Returns how many were pulled in.
async function mergeRemoteEntries(remoteEntries){
  let pulled = 0;
  for(const r of remoteEntries){
    const local = ENTRIES.find(e=>e.id===r.id);
    if(local && new Date(local.updatedAt) >= new Date(r.updatedAt)) continue;
    const entry = {
      id:r.id, date:r.date, time:r.time, title:r.title, content:r.content,
      mood:r.mood, weather:r.weather, temperature:r.temperature, location:r.location,
      tags:r.tags||[], people:r.people||[], favorite:!!r.favorite, pinned:!!r.pinned,
      translations:r.translations||{},
      photoIds:(r.photos||[]).map(p=>p.id), audioIds:(r.audio||[]).map(a=>a.id),
      createdAt:r.createdAt, updatedAt:r.updatedAt
    };
    await DB.put('entries', entry);
    for(const p of (r.photos||[])){
      const existing = await DB.get('photos', p.id);
      if(!existing) await DB.put('photos', {id:p.id, entryId:r.id, dataUrl:p.dataUrl, caption:p.caption||''});
    }
    for(const a of (r.audio||[])){
      const existing = await DB.get('audio', a.id);
      if(!existing) await DB.put('audio', {id:a.id, entryId:r.id, dataUrl:a.dataUrl});
    }
    pulled++;
  }
  return pulled;
}

// Called right after an entry is saved (journal.js). Fire-and-forget —
// a save should never feel slow because the network is slow; it just
// waits up to 8s in the background for the Firebase module, then pushes.
async function autoPushEntry(entry){
  if(!SETTINGS.syncCode) return;
  const cloudSync = await waitForCloudSync(8000);
  if(!cloudSync){ toast("Saved locally, but couldn't reach the cloud sync module — it'll retry on the next save"); return; }
  try{
    const ok = await cloudSync.ready;
    if(!ok){ toast('Saved locally, but cloud sign-in failed — check Firebase Anonymous auth is enabled'); return; }
    await cloudSync.pushEntry(SETTINGS.syncCode, entry);
    SETTINGS.lastSync = new Date().toISOString();
    saveSettings();
  }catch(err){
    console.warn('Auto-push failed:', err);
    toast('Saved locally, but cloud push failed — check Realtime Database rules (see README)');
  }
}

// Called once from app.js's init(). Waits for the Firebase module, then
// pulls anything newer from the cloud — silent unless something
// actually changed, so it doesn't nag on every launch.
async function autoPullOnStartup(){
  if(!SETTINGS.syncCode) return;
  const cloudSync = await waitForCloudSync(8000);
  if(!cloudSync) return; // likely the artifact preview (CSP-blocked) — Settings explains this
  try{
    const ok = await cloudSync.ready;
    if(!ok){ toast('Cloud sign-in failed — check Firebase Anonymous auth is enabled'); return; }
    const remoteEntries = await cloudSync.pullAll(SETTINGS.syncCode);
    const pulled = await mergeRemoteEntries(remoteEntries);
    if(pulled){
      await loadAllWithMedia();
      renderYearNav();
      if(CURRENT_ROUTE==='home' || CURRENT_ROUTE==='timeline') render();
      toast(`✓ ${pulled} ${pulled===1?'entry':'entries'} synced from the cloud`);
    }
  }catch(err){
    console.warn('Startup pull failed:', err);
    toast('Cloud pull failed — check Realtime Database rules (see README)');
  }
}

// Internal full sync: pushes everything, then pulls, with visible
// feedback. Called once automatically right after a Sync Code is saved
// (see app.js), to catch up whatever already existed before syncing began.
async function syncNow(){
  if(!SETTINGS.syncCode){ toast('Set a Sync Code first'); return; }
  const cloudSync = await waitForCloudSync(8000);
  if(!cloudSync){ toast("Couldn't reach the cloud sync module — check your connection, or this may be the Claude preview (self-hosted only)"); return; }
  const ok = await cloudSync.ready;
  if(!ok){ toast('Could not sign in to Firebase — check your Firebase project setup'); return; }

  toast('Syncing…');
  try{
    await cloudSync.pushAll(SETTINGS.syncCode, ENTRIES);
    const remoteEntries = await cloudSync.pullAll(SETTINGS.syncCode);
    const pulled = await mergeRemoteEntries(remoteEntries);

    SETTINGS.lastSync = new Date().toISOString();
    await saveSettings();
    await loadAllWithMedia();
    renderYearNav();
    render();
    toast(pulled? `✓ Synced (${pulled} updated from cloud)` : '✓ Synced');
  }catch(err){
    console.error('Sync failed', err);
    toast('Sync failed — check your Realtime Database rules (see README)');
  }
}
