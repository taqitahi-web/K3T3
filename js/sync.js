/* sync.js — orchestrates a manual "Sync Now" (push local changes, then
   pull anything new from other devices) using window.cloudSync, which
   js/firebase-sync.js (a separate ES module) attaches once Firebase has
   loaded. This file stays plain, dependency-free JS so the rest of the
   app doesn't need to care whether Firebase loaded successfully.

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
  return SETTINGS.lastSync ? `Last synced: ${fmtDateLong(SETTINGS.lastSync.slice(0,10))} ${fmtTime12(SETTINGS.lastSync.slice(11,16))}` : 'Never synced yet.';
}

async function syncNow(){
  if(!SETTINGS.syncCode){ toast('Set a Sync Code first'); return; }
  if(cloudSyncUnavailable){ toast("Cloud sync isn't reachable in this Claude preview — use the self-hosted copy"); return; }
  if(!window.cloudSync){ toast('Still connecting to Firebase — try again in a moment'); return; }
  const ok = await window.cloudSync.ready;
  if(!ok){ toast('Could not sign in to Firebase — check your Firebase project setup'); return; }

  toast('Syncing…');
  try{
    // 1. Push every local entry (cheap: media already uploaded once is skipped).
    await window.cloudSync.pushAll(SETTINGS.syncCode, ENTRIES);

    // 2. Pull everything from the cloud and merge in anything newer.
    const remoteEntries = await window.cloudSync.pullAll(SETTINGS.syncCode);
    let pulled = 0;
    for(const r of remoteEntries){
      const local = ENTRIES.find(e=>e.id===r.id);
      if(local && new Date(local.updatedAt) >= new Date(r.updatedAt)) continue; // local is same or newer — keep it
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
        if(!existing) await DB.put('photos', {id:p.id, entryId:r.id, dataUrl:p.url, caption:p.caption||''});
      }
      for(const a of (r.audio||[])){
        const existing = await DB.get('audio', a.id);
        if(!existing) await DB.put('audio', {id:a.id, entryId:r.id, dataUrl:a.url});
      }
      pulled++;
    }

    SETTINGS.lastSync = new Date().toISOString();
    await saveSettings();
    await loadAllWithMedia();
    renderYearNav();
    if(CURRENT_ROUTE==='settings') render();
    toast(pulled? `✓ Synced (${pulled} updated from cloud)` : '✓ Synced');
  }catch(err){
    console.error('Sync failed', err);
    toast('Sync failed — check your Firestore/Storage rules (see README)');
  }
}
