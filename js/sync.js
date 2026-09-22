/* sync.js — cloud sync orchestration using window.cloudSync, which
   js/firebase-sync.js (a separate ES module) attaches once Firebase has
   loaded. This file stays plain, dependency-free JS so the rest of the
   app doesn't need to care whether Firebase loaded successfully.

   Sync is AUTOMATIC once a Sync Code is set (see journal.js/app.js):
   - Every entry save/delete pushes just that one change to the cloud
     right away (journal.js calls autoPushEntry, app.js calls
     window.cloudSync.deleteRemoteEntry directly on delete).
   - Opening the app pulls anything newer from the cloud once, in the
     background (app.js's init() calls autoPullOnStartup).
   The "Sync Now" button in Settings still exists as a manual fallback
   (e.g. to catch up an entry that failed to push while offline).

   Note: Firebase's SDK is fetched from https://www.gstatic.com — the
   Claude artifact preview's content-security policy does not allow
   scripts from that host, so cloud sync only actually connects when
   this app is self-hosted (e.g. GitHub Pages), not on the claude.ai
   artifact link. We detect that case below instead of saying
   "connecting…" forever. */

let cloudSyncUnavailable = false;
setTimeout(()=>{ if(!window.cloudSync) cloudSyncUnavailable = true; }, 4000);

function syncStatusLine(){
  if(!SETTINGS.syncCode) return 'Cloud sync is off — set a Sync Code below to turn it on.';
  if(cloudSyncUnavailable) return "Cloud sync isn't reachable here (this Claude preview blocks Firebase's CDN) — it works from the self-hosted copy, e.g. GitHub Pages.";
  if(!window.cloudSync) return 'Connecting to Firebase…';
  return SETTINGS.lastSync ? `Auto-syncing. Last activity: ${fmtDateLong(SETTINGS.lastSync.slice(0,10))} ${fmtTime12(SETTINGS.lastSync.slice(11,16))}` : 'Auto-syncing — nothing pushed yet.';
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
// a save should never feel slow or fail because the network is down;
// if this doesn't go through, the next "Sync Now" (or the next
// successful auto-push) catches it up since pushEntry always sends the
// full current entry, not a diff.
async function autoPushEntry(entry){
  if(!SETTINGS.syncCode || cloudSyncUnavailable || !window.cloudSync) return;
  try{
    const ok = await window.cloudSync.ready;
    if(!ok) return;
    await window.cloudSync.pushEntry(SETTINGS.syncCode, entry);
    SETTINGS.lastSync = new Date().toISOString();
    saveSettings();
  }catch(err){
    console.warn('Auto-push failed (will retry on next save or manual Sync Now):', err);
  }
}

// Called once from app.js's init(). Waits a moment for the Firebase
// module to load, then pulls anything newer from the cloud — silent
// unless something actually changed, so it doesn't nag on every launch.
async function autoPullOnStartup(){
  if(!SETTINGS.syncCode) return;
  for(let i=0;i<20 && !window.cloudSync && !cloudSyncUnavailable;i++) await new Promise(r=>setTimeout(r,250));
  if(!window.cloudSync) return;
  try{
    const ok = await window.cloudSync.ready;
    if(!ok) return;
    const remoteEntries = await window.cloudSync.pullAll(SETTINGS.syncCode);
    const pulled = await mergeRemoteEntries(remoteEntries);
    if(pulled){
      await loadAllWithMedia();
      renderYearNav();
      if(CURRENT_ROUTE==='home' || CURRENT_ROUTE==='timeline') render();
      toast(`✓ ${pulled} ${pulled===1?'entry':'entries'} synced from the cloud`);
    }
  }catch(err){
    console.warn('Startup pull failed:', err);
  }
}

// Manual fallback button in Settings — pushes everything, then pulls,
// with visible feedback. Useful for a first sync, or to force a retry.
async function syncNow(){
  if(!SETTINGS.syncCode){ toast('Set a Sync Code first'); return; }
  if(cloudSyncUnavailable){ toast("Cloud sync isn't reachable in this Claude preview — use the self-hosted copy"); return; }
  if(!window.cloudSync){ toast('Still connecting to Firebase — try again in a moment'); return; }
  const ok = await window.cloudSync.ready;
  if(!ok){ toast('Could not sign in to Firebase — check your Firebase project setup'); return; }

  toast('Syncing…');
  try{
    await window.cloudSync.pushAll(SETTINGS.syncCode, ENTRIES);
    const remoteEntries = await window.cloudSync.pullAll(SETTINGS.syncCode);
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
