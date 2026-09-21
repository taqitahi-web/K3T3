/* app.js — router, main render dispatcher, global event binding,
   mobile FAB, and application bootstrap. Loaded last: everything it
   calls is a function declaration already defined by the scripts
   loaded before it, and init() below is the one thing that actually
   runs at load time. */

function navigate(route, params={}){
  CURRENT_ROUTE = route; CURRENT_PARAMS = params;
  $$('.navlink').forEach(b=> b.classList.toggle('active', b.dataset.route===route));
  $$('.bottom-nav button[data-route]').forEach(b=> b.classList.toggle('active', b.dataset.route===route));
  render();
  $('.content-scroll').scrollTop = 0;
  closeFabMenu();
}

function renderYearNav(){
  const years = {};
  ENTRIES.forEach(e=>{ const y = e.date.slice(0,4); years[y]=(years[y]||0)+1; });
  const sorted = Object.keys(years).sort((a,b)=>b-a);
  $('#year-nav').innerHTML = sorted.map(y=>
    `<button class="navlink" data-route="year" data-year="${y}">${y} <span class="muted" style="margin-left:auto">${years[y]}</span></button>`
  ).join('') || `<div class="muted" style="padding:6px 12px; font-size:0.8rem;">No entries yet</div>`;
  $$('#year-nav .navlink').forEach(b=> b.addEventListener('click', ()=> navigate('year',{year:b.dataset.year})));
}

function render(){
  let html = '';
  switch(CURRENT_ROUTE){
    case 'home': html = view_home(); break;
    case 'timeline': html = view_timeline(); break;
    case 'calendar': html = view_calendar(); break;
    case 'photos': html = view_photos(); break;
    case 'favorites': html = view_favorites(); break;
    case 'onthisday': html = view_onthisday(); break;
    case 'stats': html = view_stats(); break;
    case 'settings': html = view_settings(); break;
    case 'year': html = view_year(); break;
    case 'month': html = view_month(); break;
    case 'search': html = view_search(); break;
    case 'entry': html = view_entry_detail(); break;
    case 'editor': html = view_editor(); break;
    default: html = view_home();
  }
  $('#main-content').innerHTML = html;
  bindDynamicEvents();
}

function bindDynamicEvents(){
  $$('[data-open-entry]').forEach(el=> el.addEventListener('click', ()=> navigate('entry',{id:el.dataset.openEntry})));
  $$('[data-open-month]').forEach(el=> el.addEventListener('click', ()=> navigate('month',{ym:el.dataset.openMonth})));

  const qa = $('[data-action="new-entry"]'); if(qa) qa.addEventListener('click', ()=>openNewEntry('full'));
  const qv = $('[data-action="new-voice"]'); if(qv) qv.addEventListener('click', ()=>openNewEntry('voice'));
  const qp = $('[data-action="new-photo"]'); if(qp) qp.addEventListener('click', ()=>openNewEntry('photo'));
  const qq = $('[data-action="new-quick"]'); if(qq) qq.addEventListener('click', ()=>openNewEntry('quick'));

  $$('[data-timeline-sort]').forEach(b=> b.addEventListener('click', ()=> navigate('timeline',{sort:b.dataset.timelineSort})));

  $$('[data-cal-nav]').forEach(b=> b.addEventListener('click', ()=>{
    const now = new Date();
    let y = CURRENT_PARAMS.y ?? now.getFullYear(), m = CURRENT_PARAMS.m ?? now.getMonth();
    m += Number(b.dataset.calNav);
    if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
    navigate('calendar', {y,m});
  }));
  $$('[data-cal-day]').forEach(el=> el.addEventListener('click', ()=>{
    const date = el.dataset.calDay;
    const dayEntries = ENTRIES.filter(e=>e.date===date);
    const box = $('#cal-day-detail');
    box.innerHTML = `<h3>${fmtDateLong(date)}</h3>` + (dayEntries.length? `<div class="grid grid-2">${dayEntries.map(entryCardHtml).join('')}</div>` : `<p class="muted">No entries on this day. <button class="btn btn-sm" id="cal-add-entry">+ Add one</button></p>`);
    $$('[data-open-entry]', box).forEach(el2=> el2.addEventListener('click', ()=> navigate('entry',{id:el2.dataset.openEntry})));
    const addBtn = $('#cal-add-entry', box);
    if(addBtn) addBtn.addEventListener('click', ()=> openNewEntry('full', date));
  }));

  $$('[data-entry-tab]').forEach(b=> b.addEventListener('click', ()=> navigate('entry',{id:CURRENT_PARAMS.id, tab:b.dataset.entryTab})));
  $$('[data-edit-translation]').forEach(b=> b.addEventListener('click', ()=> navigate('entry',{id:CURRENT_PARAMS.id, tab:b.dataset.editTranslation, editTab:true})));
  $$('[data-save-translation]').forEach(b=> b.addEventListener('click', async ()=>{
    const lang = b.dataset.saveTranslation;
    const e = ENTRIES.find(x=>x.id===CURRENT_PARAMS.id);
    const title = $('#tr-title').value;
    const content = $('#tr-content').value;
    if(!content.trim()){ toast('Nothing to save yet'); return; }
    e.translations = e.translations || {};
    e.translations[lang] = {title, content};
    await DB.put('entries', stripDenorm(e));
    await loadAllWithMedia();
    toast('✓ Translation saved');
    navigate('entry', {id:e.id, tab:lang});
  }));
  $$('[data-delete-translation]').forEach(b=> b.addEventListener('click', ()=>{
    const lang = b.dataset.deleteTranslation;
    confirmDialog('Remove this translation?', 'You can paste it in again later.', async ()=>{
      const e = ENTRIES.find(x=>x.id===CURRENT_PARAMS.id);
      if(e.translations) delete e.translations[lang];
      await DB.put('entries', stripDenorm(e));
      await loadAllWithMedia();
      toast('Translation removed');
      navigate('entry', {id:e.id, tab:lang});
    });
  }));

  $$('[data-lightbox]').forEach(el=> el.addEventListener('click', ()=>{
    try{ showLightbox(JSON.parse(el.dataset.lightbox.replace(/&apos;/g,"'"))); }catch(e){}
  }));

  const si = $('#search-input');
  if(si) si.addEventListener('input', debounce(()=> navigate('search',{q:si.value}), 250));

  $$('[data-edit-entry]').forEach(b=> b.addEventListener('click', ()=>{ editorState=null; navigate('editor',{id:b.dataset.editEntry}); }));
  $$('[data-fav-entry]').forEach(b=> b.addEventListener('click', async ()=>{
    const e = ENTRIES.find(x=>x.id===b.dataset.favEntry); e.favorite=!e.favorite; await DB.put('entries', stripDenorm(e)); await loadAllWithMedia(); render();
  }));
  $$('[data-pin-entry]').forEach(b=> b.addEventListener('click', async ()=>{
    const e = ENTRIES.find(x=>x.id===b.dataset.pinEntry); e.pinned=!e.pinned; await DB.put('entries', stripDenorm(e)); await loadAllWithMedia(); render();
  }));
  $$('[data-print-entry]').forEach(b=> b.addEventListener('click', ()=> window.print()));
  $$('[data-print-month]').forEach(b=> b.addEventListener('click', ()=> window.print()));
  $$('[data-delete-entry]').forEach(b=> b.addEventListener('click', async ()=>{
    const ok = await promptPin('Enter your PIN to delete this entry.');
    if(!ok) return;
    confirmDialog('Delete this entry?', 'This action cannot be undone.', async ()=>{
      const id = b.dataset.deleteEntry;
      const e = ENTRIES.find(x=>x.id===id);
      for(const p of (e._photos||[])) await DB.delete('photos', p.id);
      for(const a of (e._audio||[])) await DB.delete('audio', a.id);
      await DB.delete('entries', id);
      if(SETTINGS.syncCode && window.cloudSync) window.cloudSync.deleteRemoteEntry(SETTINGS.syncCode, id).catch(()=>{});
      await loadAllWithMedia(); renderYearNav();
      toast('Entry deleted');
      navigate('home');
    });
  }));

  if(CURRENT_ROUTE==='editor') bindEditorEvents();

  const themeSel = $('#theme-select');
  if(themeSel) themeSel.addEventListener('change', async ()=>{ SETTINGS.theme = themeSel.value; applyTheme(); await saveSettings(); });
  const btnExport = $('#btn-export'); if(btnExport) btnExport.addEventListener('click', exportJournal);
  const btnImportT = $('#btn-import-trigger'); if(btnImportT) btnImportT.addEventListener('click', ()=> $('#import-file').click());
  const importFile = $('#import-file'); if(importFile) importFile.addEventListener('change', ()=>{ if(importFile.files[0]) importJournalFile(importFile.files[0]); });
  const btnDemo = $('#btn-load-demo'); if(btnDemo) btnDemo.addEventListener('click', loadDemoData);
  const btnClearDemo = $('#btn-clear-demo'); if(btnClearDemo) btnClearDemo.addEventListener('click', clearDemoData);

  const btnSavePin = $('#btn-save-pin');
  if(btnSavePin) btnSavePin.addEventListener('click', async ()=>{
    const a = $('#pin-new').value.trim(), b = $('#pin-confirm').value.trim();
    if(!a || a.length<4){ toast('PIN should be at least 4 digits'); return; }
    if(a!==b){ toast("PINs don't match"); return; }
    SETTINGS.pin = a; await saveSettings(); toast('✓ PIN updated'); $('#pin-new').value=''; $('#pin-confirm').value='';
  });

  const btnSaveSyncCode = $('#btn-save-synccode');
  if(btnSaveSyncCode) btnSaveSyncCode.addEventListener('click', async ()=>{
    SETTINGS.syncCode = $('#sync-code').value.trim();
    await saveSettings();
    toast(SETTINGS.syncCode? '✓ Sync Code saved' : 'Sync Code cleared — cloud sync is off');
    if(CURRENT_ROUTE==='settings') render();
  });
  const btnSyncNow = $('#btn-sync-now');
  if(btnSyncNow) btnSyncNow.addEventListener('click', syncNow);
}

/* ---------------- Mobile FAB (quick capture) ---------------- */
function closeFabMenu(){ $('#fab-menu').style.display='none'; }
function toggleFabMenu(){
  const menu = $('#fab-menu');
  if(menu.style.display==='flex'){ menu.style.display='none'; return; }
  menu.innerHTML = `
    <button data-fab="full">✍️ Write</button>
    <button data-fab="photo">📷 Photo</button>
    <button data-fab="voice">🎙️ Voice</button>
    <button data-fab="quick">⚡ Quick Note</button>
  `;
  menu.style.display='flex';
  $$('#fab-menu button').forEach(b=> b.addEventListener('click', ()=>{ closeFabMenu(); openNewEntry(b.dataset.fab); }));
}

/* ---------------- Static (one-time) bindings ---------------- */
function bindStaticEvents(){
  $$('.navlink[data-route]').forEach(b=> b.addEventListener('click', ()=> navigate(b.dataset.route)));
  $$('.bottom-nav button[data-route]').forEach(b=> b.addEventListener('click', ()=> navigate(b.dataset.route)));
  $('#btn-new-top').addEventListener('click', ()=> openNewEntry('full'));
  $('#btn-search').addEventListener('click', openSearchPrompt);
  $('#btn-search-mobile').addEventListener('click', openSearchPrompt);
  $('#fab-btn').addEventListener('click', toggleFabMenu);
  $('#fab-toggle-mobile').addEventListener('click', toggleFabMenu);

  document.addEventListener('keydown', e=>{
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key.toLowerCase()==='n'){ e.preventDefault(); openNewEntry('full'); }
    else if(mod && e.key.toLowerCase()==='k'){ e.preventDefault(); openSearchPrompt(); }
    else if(mod && e.key.toLowerCase()==='s' && CURRENT_ROUTE==='editor'){
      e.preventDefault();
      promptPin(editorState.isNew ? 'Enter your PIN to save this new entry.' : 'Enter your PIN to save these changes.').then(ok=>{ if(ok) saveEntry(true); });
    }
    else if(e.key==='Escape'){ closeModal(); closeFabMenu(); const lb=$('.lightbox'); if(lb) lb.remove(); }
  });
}

/* ---------------- Bootstrap ---------------- */
async function init(){
  dbInstance = await openDatabase();
  await loadAllWithMedia();
  renderYearNav();
  bindStaticEvents();
  navigate('home');
  checkDraftRecovery();

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{ /* offline install is optional */ });
  }
}
init();
