/* export.js — backup export/import as a single JSON file.
   Note: the `window.claude` download-confirmation path only exists when this
   app happens to be running inside a Claude artifact preview; on a normal
   host (e.g. GitHub Pages) window.claude is undefined and the code below
   falls straight through to a standard browser download link. */

async function exportJournal(){
  toast('Preparing export…');
  const entries = await DB.all('entries');
  const photos = await DB.all('photos');
  const audio = await DB.all('audio');
  const payload = {app:'pages-from-my-life', version:1, exportedAt:new Date().toISOString(), entries, photos, audio};
  const json = JSON.stringify(payload);
  const blob = new Blob([json], {type:'application/json'});
  try{
    const downloads = (typeof window!=='undefined' && window.claude) ? await window.claude.use('downloads') : null;
    if(downloads){
      await downloads.save({filename:`pages-from-my-life-backup-${todayStr()}.json`, data:blob});
      SETTINGS.lastBackup = new Date().toISOString();
      await saveSettings();
      toast('✓ Backup exported');
      if(CURRENT_ROUTE==='settings') render();
      return;
    }
  }catch(err){
    if(err && err.code==='declined'){ return; }
    // fall through to link fallback
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download = `pages-from-my-life-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  SETTINGS.lastBackup = new Date().toISOString();
  await saveSettings();
  toast('✓ Backup exported');
  if(CURRENT_ROUTE==='settings') render();
}

function importJournalFile(file){
  const reader = new FileReader();
  reader.onload = async ()=>{
    let data;
    try{ data = JSON.parse(reader.result); }
    catch(e){ toast('Invalid backup file'); return; }
    if(!data || !Array.isArray(data.entries)){ toast('This file is not a valid journal backup'); return; }
    confirmDialog('Import journal?', `This will add ${data.entries.length} entries to your journal. Existing entries with the same ID will be overwritten.`, async ()=>{
      for(const p of (data.photos||[])) await DB.put('photos', p);
      for(const a of (data.audio||[])) await DB.put('audio', a);
      for(const e of data.entries) await DB.put('entries', e);
      await loadAllWithMedia();
      renderYearNav();
      toast('✓ Journal restored');
      navigate('home');
    });
  };
  reader.readAsText(file);
}
