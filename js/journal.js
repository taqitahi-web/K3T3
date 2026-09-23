/* journal.js — entry data model, dashboard/timeline/year/month/favorites/
   on-this-day/stats/detail views, the entry editor, autosave, demo data,
   and draft recovery. */

let ENTRIES = [];      // all entries, denormalized with _photos/_audio, sorted desc
let SETTINGS = {theme:'colorful', lastBackup:null, pin:null, syncCode:'', lastSync:null};
let CURRENT_ROUTE = 'home';
let CURRENT_PARAMS = {};

async function loadAll(){
  ENTRIES = await DB.all('entries');
  ENTRIES.sort((a,b)=> (b.date+b.time) < (a.date+a.time) ? -1 : 1);
  const s = await DB.get('settings','app');
  if(s) SETTINGS = Object.assign(SETTINGS, s.value);
  applyTheme();
}
function saveSettings(){ return DB.put('settings', {key:'app', value:SETTINGS}); }

const THEME_VALUES = ['light','dark','colorful','dusk-berry','monsoon-green','rangpur-morning'];
function applyTheme(){
  const root = document.documentElement;
  if(THEME_VALUES.includes(SETTINGS.theme)){
    root.setAttribute('data-theme', SETTINGS.theme);
  } else {
    root.removeAttribute('data-theme'); // 'system'
  }
}

async function loadAllWithMedia(){
  await loadAll();
  const allPhotos = await DB.all('photos');
  const allAudio = await DB.all('audio');
  const photosByEntry = {}; allPhotos.forEach(p=>{ (photosByEntry[p.entryId]=photosByEntry[p.entryId]||[]).push(p); });
  const audioByEntry = {}; allAudio.forEach(a=>{ (audioByEntry[a.entryId]=audioByEntry[a.entryId]||[]).push(a); });
  ENTRIES.forEach(e=>{ e._photos = photosByEntry[e.id]||[]; e._audio = audioByEntry[e.id]||[]; });
}
function stripDenorm(e){ const {_photos,_audio,...rest} = e; return rest; }

/* ---------------- Dashboard / lists ---------------- */
function view_home(){
  const d = new Date();
  const todayEntries = ENTRIES.filter(e=>e.date===todayStr());
  const pinned = ENTRIES.filter(e=>e.pinned);
  const recent = ENTRIES.slice(0,8);
  $('#topbar-title').textContent = 'Pages From My Life';
  return `
    <div>
      <div class="serif" style="font-size:1.6rem; margin-bottom:2px;">Pages From My Life</div>
      <div class="muted">${d.toLocaleDateString(undefined,{weekday:'long'})}<br>${d.toLocaleDateString(undefined,{day:'numeric', month:'long', year:'numeric'})}</div>

      <div class="quick-actions">
        <button class="btn" data-action="new-entry"><span class="emoji">✍️</span>New Entry</button>
        <button class="btn" data-action="new-voice"><span class="emoji">🎙️</span>Voice Entry</button>
        <button class="btn" data-action="new-photo"><span class="emoji">📷</span>Add Photo</button>
        <button class="btn" data-action="new-quick"><span class="emoji">⚡</span>Quick Note</button>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div><div class="muted" style="font-size:0.75rem;">TODAY</div><div>${fmtDateLong(todayStr())}</div></div>
          <div><div class="muted" style="font-size:0.75rem;">ENTRIES TODAY</div><div>${todayEntries.length}</div></div>
        </div>
      </div>

      ${pinned.length? `<h3 style="margin-bottom:10px;">📌 Pinned</h3><div class="grid grid-2" style="margin-bottom:24px;">${pinned.map(entryCardHtml).join('')}</div>` : ''}

      <h3 style="margin-bottom:10px;">Recent Entries</h3>
      ${recent.length? `<div class="grid grid-2">${recent.map(entryCardHtml).join('')}</div>` :
        emptyState('No entries yet.', 'Every ordinary day has a story. Write your first page.')}
    </div>
  `;
}

function view_timeline(){
  $('#topbar-title').textContent = 'Timeline';
  const sortDir = CURRENT_PARAMS.sort || 'newest';
  let list = [...ENTRIES];
  if(sortDir==='oldest') list.reverse();
  if(!list.length) return emptyState('No entries yet.', 'Your timeline will appear here as you write.');
  const groups = [];
  let lastKey = null;
  list.forEach(e=>{
    const key = e.date.slice(0,7);
    if(key!==lastKey){ groups.push({key, label: new Date(e.date+'T00:00:00').toLocaleDateString(undefined,{month:'long', year:'numeric'}), items:[]}); lastKey=key; }
    groups[groups.length-1].items.push(e);
  });
  return `
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:14px;">
      <button class="btn btn-sm ${sortDir==='newest'?'btn-primary':''}" data-timeline-sort="newest">Newest</button>
      <button class="btn btn-sm ${sortDir==='oldest'?'btn-primary':''}" data-timeline-sort="oldest">Oldest</button>
    </div>
    ${groups.map(g=>`
      <h3 style="margin:20px 0 10px;">${g.label}</h3>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${g.items.map(e=>`
          <div class="card entry-card" data-open-entry="${e.id}" style="flex-direction:row; align-items:center; gap:14px;">
            <div style="min-width:70px; text-align:center;">
              <div style="font-size:1.3rem; font-family:var(--serif);">${e.date.slice(8,10)}</div>
              <div class="muted" style="font-size:0.72rem;">${fmtTime12(e.time)}</div>
            </div>
            <div style="flex:1; min-width:0;">
              <h3 style="margin-bottom:2px;">${escapeHTML(e.title)||'(Untitled)'}</h3>
              <div class="meta-line">
                ${(e._photos||[]).length? `<span>📷 ${e._photos.length} photo${e._photos.length>1?'s':''}</span>`:''}
                ${e.mood? `<span>${moodEmoji(e.mood)} ${e.mood}</span>`:''}
                ${(e.tags||[]).map(tagChipHtml).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('')}
  `;
}

function view_photos(){
  $('#topbar-title').textContent = 'Photos';
  const all = [];
  ENTRIES.forEach(e=> (e._photos||[]).forEach(p=> all.push({...p, entry:e})));
  all.sort((a,b)=> (b.entry.date) < (a.entry.date) ? -1:1);
  if(!all.length) return emptyState('No photos yet.', 'The first photograph is waiting.');
  return `<div class="grid grid-photos">
    ${all.map(p=>`
      <div class="photo-thumb" data-lightbox='${JSON.stringify({src:p.dataUrl, caption:p.caption||'', date:p.entry.date, entryId:p.entry.id}).replace(/'/g,"&apos;")}'>
        <img src="${p.dataUrl}" alt="${escapeHTML(p.caption||'')}" loading="lazy">
      </div>
    `).join('')}
  </div>`;
}

function view_favorites(){
  $('#topbar-title').textContent = 'Favorites';
  const favs = ENTRIES.filter(e=>e.favorite);
  return favs.length? `<div class="grid grid-2">${favs.map(entryCardHtml).join('')}</div>` : emptyState('No favorite memories yet.', 'Tap the star on any entry to save it here.');
}

function view_onthisday(){
  $('#topbar-title').textContent = 'On This Day';
  const now = new Date();
  const mm = pad2(now.getMonth()+1), dd = pad2(now.getDate());
  const matches = ENTRIES.filter(e=> e.date.slice(5,7)===mm && e.date.slice(8,10)===dd && e.date.slice(0,4)!==String(now.getFullYear()));
  matches.sort((a,b)=> b.date < a.date ? -1:1);
  if(!matches.length) return emptyState('No memories yet for this day.', 'Come back next year — this page fills in over time.');
  return `<h3 style="margin-bottom:4px;">${now.toLocaleDateString(undefined,{day:'numeric', month:'long'})}</h3>
    <div class="grid grid-2" style="margin-top:14px;">${matches.map(e=>{
      const years = now.getFullYear() - Number(e.date.slice(0,4));
      return `<div class="card entry-card" data-open-entry="${e.id}">
        <div class="meta-line"><span>${e.date.slice(0,4)} · ${years} year${years>1?'s':''} ago</span></div>
        <h3>${escapeHTML(e.title)||'(Untitled)'}</h3>
        <p>${escapeHTML((e.content||'').slice(0,140))}</p>
      </div>`;
    }).join('')}</div>`;
}

function view_stats(){
  $('#topbar-title').textContent = 'Statistics';
  const totalPhotos = ENTRIES.reduce((n,e)=> n + (e._photos||[]).length, 0);
  const totalAudio = ENTRIES.reduce((n,e)=> n + (e._audio||[]).length, 0);
  const favCount = ENTRIES.filter(e=>e.favorite).length;
  const tagCounts = {};
  ENTRIES.forEach(e=> (e.tags||[]).forEach(t=> tagCounts[t]=(tagCounts[t]||0)+1));
  const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const monthCounts = {};
  ENTRIES.forEach(e=>{ const k = e.date.slice(0,7); monthCounts[k]=(monthCounts[k]||0)+1; });
  const topMonth = Object.entries(monthCounts).sort((a,b)=>b[1]-a[1])[0];
  const maxMonthCount = Math.max(1, ...Object.values(monthCounts));
  const monthBars = Object.entries(monthCounts).sort((a,b)=> a[0]<b[0]?-1:1).slice(-12);
  return `
    <div class="grid grid-2" style="margin-bottom:20px;">
      <div class="card"><div class="muted" style="font-size:0.75rem;">TOTAL ENTRIES</div><div style="font-size:1.6rem; font-family:var(--serif);">${ENTRIES.length}</div></div>
      <div class="card"><div class="muted" style="font-size:0.75rem;">TOTAL PHOTOS</div><div style="font-size:1.6rem; font-family:var(--serif);">${totalPhotos}</div></div>
      <div class="card"><div class="muted" style="font-size:0.75rem;">VOICE NOTES</div><div style="font-size:1.6rem; font-family:var(--serif);">${totalAudio}</div></div>
      <div class="card"><div class="muted" style="font-size:0.75rem;">FAVORITES</div><div style="font-size:1.6rem; font-family:var(--serif);">${favCount}</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="muted" style="font-size:0.75rem; margin-bottom:10px;">MONTHLY ACTIVITY</div>
      <div style="display:flex; align-items:flex-end; gap:6px; height:100px;">
        ${monthBars.map(([k,v])=>`<div style="flex:1; background:var(--accent); border-radius:3px 3px 0 0; height:${Math.max(6,(v/maxMonthCount)*100)}%;" title="${k}: ${v}"></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="muted" style="font-size:0.75rem; margin-bottom:8px;">MOST USED TAGS</div>
      <div class="meta-line">${topTags.length? topTags.map(([t,c])=>`<span class="chip tag-chip" style="--hue:${tagHue(t)}">#${escapeHTML(t)} · ${c}</span>`).join(''):'<span class="muted">No tags yet</span>'}</div>
      ${topMonth? `<div class="muted" style="font-size:0.75rem; margin-top:14px;">MOST ACTIVE MONTH</div><div>${topMonth[0]} (${topMonth[1]} entries)</div>`:''}
    </div>
  `;
}

function view_year(){
  const year = CURRENT_PARAMS.year;
  $('#topbar-title').textContent = year;
  const months = Array.from({length:12}, (_,i)=>i);
  const counts = months.map(m=> ENTRIES.filter(e=> e.date.slice(0,4)===year && Number(e.date.slice(5,7))-1===m).length);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `<h3 style="margin-bottom:14px;">My ${year}</h3>
    <div style="display:flex; flex-direction:column; gap:2px;">
      ${months.map(m=> counts[m]>0 ? `
        <div class="navlink" style="display:flex; justify-content:space-between; padding:10px 12px; border-radius:8px; cursor:pointer;" data-open-month="${year}-${pad2(m+1)}">
          <span>${monthNames[m]}</span><span class="muted">${counts[m]} entries</span>
        </div>` : `
        <div style="display:flex; justify-content:space-between; padding:10px 12px; color:var(--muted); opacity:0.5;">
          <span>${monthNames[m]}</span><span>0 entries</span>
        </div>`
      ).join('')}
    </div>
  `;
}

function view_month(){
  const ym = CURRENT_PARAMS.ym;
  const list = ENTRIES.filter(e=> e.date.slice(0,7)===ym);
  $('#topbar-title').textContent = new Date(ym+'-01T00:00:00').toLocaleDateString(undefined,{month:'long', year:'numeric'});
  return `
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;"><button class="btn btn-sm" data-print-month="${ym}">🖨️ Print month</button></div>
    <div class="grid grid-2">${list.map(entryCardHtml).join('') || emptyState('No entries this month.','')}</div>
  `;
}

function view_settings(){
  $('#topbar-title').textContent = 'Settings';
  return `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Appearance</h3>
      <div class="field">
        <label>Theme</label>
        <select id="theme-select">
          <option value="system" ${SETTINGS.theme==='system'?'selected':''}>System</option>
          <option value="light" ${SETTINGS.theme==='light'?'selected':''}>Light</option>
          <option value="dark" ${SETTINGS.theme==='dark'?'selected':''}>Dark</option>
          <option value="colorful" ${SETTINGS.theme==='colorful'?'selected':''}>Colorful — Sunset</option>
          <option value="dusk-berry" ${SETTINGS.theme==='dusk-berry'?'selected':''}>Colorful — Dusk Berry</option>
          <option value="monsoon-green" ${SETTINGS.theme==='monsoon-green'?'selected':''}>Colorful — Monsoon Green</option>
          <option value="rangpur-morning" ${SETTINGS.theme==='rangpur-morning'?'selected':''}>Colorful — Rangpur Morning</option>
        </select>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Backup &amp; Restore</h3>
      <p class="muted" style="font-size:0.85rem;">Last backup: ${SETTINGS.lastBackup ? fmtDateLong(SETTINGS.lastBackup.slice(0,10)) : 'Never backed up'}</p>
      ${!SETTINGS.lastBackup ? `<p style="font-size:0.85rem; color:var(--danger);">Your journal has not been backed up. Export a backup to keep your memories safe.</p>`:''}
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-export">Export Journal</button>
        <button class="btn" id="btn-import-trigger">Import Journal</button>
        <input type="file" id="import-file" accept=".json" class="file-input-hidden">
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Security</h3>
      <p class="muted" style="font-size:0.85rem;">A PIN is asked for whenever an entry is added, edited, or deleted.</p>
      <div class="row" style="max-width:320px;">
        <div class="field"><label>New PIN</label><input type="password" inputmode="numeric" id="pin-new" placeholder="••••"></div>
        <div class="field"><label>Confirm PIN</label><input type="password" inputmode="numeric" id="pin-confirm" placeholder="••••"></div>
      </div>
      <button class="btn" id="btn-save-pin">Save PIN</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Cloud Sync (Firebase)</h3>
      <p class="muted" style="font-size:0.85rem;">Optional. Set a Sync Code once, and after that it's automatic: every add/edit/delete pushes to your own Firebase project right away, and opening the app on any device with the same code pulls in what's new. Off by default; your diary stays local-only until you set a code here.</p>
      <div class="field" style="max-width:340px;">
        <label>Sync Code</label>
        <input type="text" id="sync-code" placeholder="choose a private code/passphrase" value="${escapeHTML(SETTINGS.syncCode||'')}">
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button class="btn" id="btn-save-synccode">Save Code</button>
        <span class="muted" style="font-size:0.8rem;">${escapeHTML(syncStatusLine())}</span>
      </div>
      <p class="muted" style="font-size:0.78rem; margin-top:10px; margin-bottom:0;">The Sync Code is a shared secret, not a login — anyone who knows it can read/write that code's data, so keep it as private as a password. See README.md for the one-time Firebase console setup (enable Anonymous sign-in, set the security rules).</p>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">Demo Data</h3>
      <div style="display:flex; gap:10px;">
        <button class="btn" id="btn-load-demo">Load Demo Data</button>
        <button class="btn btn-danger" id="btn-clear-demo">Clear Demo Data</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Privacy</h3>
      <p style="font-size:0.85rem;">Your journal is stored locally on this device, in this browser's storage.<br><br>
      Nothing is uploaded automatically. There is no analytics or tracking. Journal data only leaves this device if you explicitly export it, or if you turn on Cloud Sync above with your own Sync Code (in which case it goes to your own Firebase project, nowhere else).</p>
    </div>
    <div class="muted" style="font-size:0.72rem; margin-top:18px;">Keyboard shortcuts: Ctrl/Cmd+N new entry · Ctrl/Cmd+K search · Esc close</div>
  `;
}

const LANG_LABEL = {en:'English', zh:'中文'};

function view_entry_detail(){
  const e = ENTRIES.find(x=>x.id===CURRENT_PARAMS.id);
  if(!e) return emptyState('Entry not found', '');
  const tab = CURRENT_PARAMS.tab || 'original';
  $('#topbar-title').textContent = e.title || 'Entry';

  const tabsBar = `
    <div class="translate-bar" style="display:flex; gap:8px; margin-bottom:14px;">
      <button class="btn btn-sm ${tab==='original'?'btn-primary':''}" data-entry-tab="original">Original</button>
      <button class="btn btn-sm ${tab==='en'?'btn-primary':''}" data-entry-tab="en">🌐 English</button>
      <button class="btn btn-sm ${tab==='zh'?'btn-primary':''}" data-entry-tab="zh">🌐 中文</button>
    </div>
  `;

  let bodyHtml;
  if(tab==='original'){
    bodyHtml = `
      <h1 class="serif" style="margin:6px 0 10px;">${escapeHTML(e.title)||'(Untitled)'}</h1>
      <hr style="border:none; border-top:1px solid var(--border);">
      <div style="white-space:pre-wrap; line-height:1.8; font-family:var(--serif); font-size:1.05rem; padding:18px 0;">${escapeHTML(e.content)}</div>
      <hr style="border:none; border-top:1px solid var(--border);">
      ${(e._photos&&e._photos.length)? `
        <h3 style="margin-top:20px;">Photos</h3>
        <div class="grid grid-photos">${e._photos.map(p=>`
          <div class="photo-thumb" data-lightbox='${JSON.stringify({src:p.dataUrl, caption:p.caption||'', date:e.date}).replace(/'/g,"&apos;")}'>
            <img src="${p.dataUrl}" alt="${escapeHTML(p.caption||'')}">
            ${p.caption? `<div class="cap">${escapeHTML(p.caption)}</div>`:''}
          </div>
        `).join('')}</div>`:''}
      ${(e._audio&&e._audio.length)? `
        <h3 style="margin-top:20px;">Voice Note</h3>
        ${e._audio.map(a=>`<audio controls src="${a.dataUrl}" style="width:100%; margin-bottom:8px;"></audio>`).join('')}
      `:''}
      ${(e.people&&e.people.length)? `<h3 style="margin-top:20px;">People</h3><div class="meta-line">${e.people.map(p=>`<span class="chip">${escapeHTML(p)}</span>`).join('')}</div>`:''}
      <div class="muted" style="font-size:0.75rem; margin-top:24px;">Created ${fmtDateLong(e.createdAt.slice(0,10))}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;">
        <button class="btn" data-edit-entry="${e.id}">✏️ Edit</button>
        <button class="btn" data-fav-entry="${e.id}">${e.favorite?'⭐ Unfavorite':'☆ Favorite'}</button>
        <button class="btn" data-pin-entry="${e.id}">${e.pinned?'📌 Unpin':'📌 Pin'}</button>
        <button class="btn" data-print-entry="${e.id}">🖨️ Print</button>
        <button class="btn" data-share-link="${e.id}">🔗 Share Link</button>
        <button class="btn" data-share-file="${e.id}">📄 Share as File</button>
        <button class="btn btn-danger" data-delete-entry="${e.id}">🗑️ Delete</button>
      </div>
    `;
  } else {
    const tr = (e.translations && e.translations[tab]) || null;
    const editing = !tr || CURRENT_PARAMS.editTab;
    if(editing){
      bodyHtml = `
        <p class="muted" style="font-size:0.85rem; margin-top:0;">Paste or type your own ${LANG_LABEL[tab]} translation of this entry below, then save it. It's kept with this entry for next time.</p>
        <div class="field">
          <label>Title (${LANG_LABEL[tab]})</label>
          <input type="text" id="tr-title" value="${escapeHTML(tr? tr.title : '')}" placeholder="${escapeHTML(e.title)}">
        </div>
        <div class="field">
          <label>Entry text (${LANG_LABEL[tab]})</label>
          <textarea id="tr-content" style="min-height:260px; font-family:var(--serif); line-height:1.7;" placeholder="Paste your translation here...">${escapeHTML(tr? tr.content : '')}</textarea>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" data-save-translation="${tab}">Save ${LANG_LABEL[tab]} translation</button>
          ${tr? `<button class="btn" data-entry-tab="${tab}">Cancel</button>`:''}
        </div>
      `;
    } else {
      bodyHtml = `
        <h1 class="serif" style="margin:6px 0 10px;">${escapeHTML(tr.title)||'(Untitled)'}</h1>
        <hr style="border:none; border-top:1px solid var(--border);">
        <div style="white-space:pre-wrap; line-height:1.8; font-family:var(--serif); font-size:1.05rem; padding:18px 0;">${escapeHTML(tr.content)}</div>
        <hr style="border:none; border-top:1px solid var(--border);">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;">
          <button class="btn" data-edit-translation="${tab}">✏️ Edit translation</button>
          <button class="btn btn-danger" data-delete-translation="${tab}">🗑️ Remove translation</button>
        </div>
      `;
    }
  }

  return `
    <div class="editor-wrap">
      <div class="muted">${fmtDateLong(e.date)} · ${fmtTime12(e.time)}</div>
      <div class="meta-line" style="margin:6px 0 16px;">
        ${e.weather? `<span>${weatherEmoji(e.weather)} ${e.temperature? e.temperature+'°C':''}</span>`:''}
        ${e.mood? `<span>${moodEmoji(e.mood)} ${e.mood}</span>`:''}
        ${e.location? `<span>📍 ${escapeHTML(e.location)}</span>`:''}
        ${(e.tags||[]).map(tagChipHtml).join('')}
      </div>
      ${tabsBar}
      ${bodyHtml}
    </div>
  `;
}

/* ---------------- Editor ---------------- */
let editorState = null; // {id, isNew, photos:[{id,dataUrl,caption}], audio:[{id,dataUrl}], tags:[], people:[]}

function view_editor(){
  const existing = CURRENT_PARAMS.id ? ENTRIES.find(x=>x.id===CURRENT_PARAMS.id) : null;
  if(!editorState || editorState.id !== (existing? existing.id : CURRENT_PARAMS._newId)){
    if(existing){
      editorState = {
        id: existing.id, isNew:false,
        photos: (existing._photos||[]).map(p=>({...p})),
        audio: (existing._audio||[]).map(a=>({...a})),
        tags: [...(existing.tags||[])], people:[...(existing.people||[])],
      };
    } else {
      editorState = { id: CURRENT_PARAMS._newId, isNew:true, photos:[], audio:[], tags:[], people:[] };
    }
  }
  const e = existing || {date:todayStr(), time:nowTimeStr(), title:'', content:'', mood:'', weather:'', temperature:'', location:''};
  $('#topbar-title').textContent = existing? 'Edit Entry' : 'New Entry';

  return `
    <div class="editor-wrap">
      <div class="editor-toolbar">
        <div class="row" style="max-width:320px;">
          <input type="date" id="f-date" value="${e.date}">
          <input type="time" id="f-time" value="${e.time}">
        </div>
        <div style="flex:1"></div>
        <span class="save-indicator" id="save-indicator">✓ Saved</span>
      </div>
      <input type="text" id="f-title" placeholder="A Quiet Walk Before Sunrise" style="font-family:var(--serif); font-size:1.3rem; border:none; background:transparent; padding:4px 0; margin-bottom:8px;" value="${escapeHTML(e.title)}">
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <label class="btn btn-sm" id="btn-add-photo-editor" for="photo-file-input">📷 Add Photo</label>
        <button class="btn btn-sm" id="btn-record-voice">🎙️ Voice</button>
        <input type="file" id="photo-file-input" accept="image/*" multiple class="file-input-hidden">
      </div>
      <textarea id="f-content" placeholder="Today I went for my morning walk...">${escapeHTML(e.content)}</textarea>

      <div id="editor-photos" class="grid grid-photos" style="margin:14px 0;">
        ${editorState.photos.map((p,i)=>`
          <div class="photo-thumb">
            <img src="${p.dataUrl}">
            <button class="rm" data-rm-photo="${i}">✕</button>
            <input class="cap" data-cap-photo="${i}" placeholder="Caption" value="${escapeHTML(p.caption||'')}" style="border:none; width:100%;">
          </div>
        `).join('')}
      </div>

      <div id="editor-voice"></div>

      <div class="optional-fields">
        <div class="row">
          <div class="field">
            <label>Mood</label>
            <select id="f-mood"><option value="">—</option>${MOODS.map(m=>`<option value="${m.v}" ${e.mood===m.v?'selected':''}>${m.e} ${m.l}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Weather</label>
            <select id="f-weather"><option value="">—</option>${WEATHERS.map(w=>`<option value="${w.v}" ${e.weather===w.v?'selected':''}>${w.e} ${w.l}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Temp (°C)</label>
            <input type="number" id="f-temp" value="${escapeHTML(e.temperature||'')}">
          </div>
        </div>
        <div class="field">
          <label>📍 Location</label>
          <input type="text" id="f-location" value="${escapeHTML(e.location||'')}" placeholder="Saidpur">
        </div>
        <div class="field">
          <label>Tags (press Enter to add)</label>
          <input type="text" id="f-tag-input" placeholder="#Morning">
          <div class="tag-input-list" id="tag-list">${editorState.tags.map((t,i)=>`<span class="chip">#${escapeHTML(t)}<button data-rm-tag="${i}">✕</button></span>`).join('')}</div>
        </div>
        <div class="field">
          <label>People (press Enter to add)</label>
          <input type="text" id="f-people-input" placeholder="Father">
          <div class="tag-input-list" id="people-list">${editorState.people.map((p,i)=>`<span class="chip">${escapeHTML(p)}<button data-rm-person="${i}">✕</button></span>`).join('')}</div>
        </div>
      </div>

      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn btn-primary" id="btn-save-entry">Save Entry</button>
        <button class="btn" id="btn-cancel-entry">Cancel</button>
      </div>
    </div>
  `;
}

async function collectEditorFields(){
  return {
    date: $('#f-date').value || todayStr(),
    time: $('#f-time').value || nowTimeStr(),
    title: $('#f-title').value,
    content: $('#f-content').value,
    mood: $('#f-mood') ? $('#f-mood').value : '',
    weather: $('#f-weather') ? $('#f-weather').value : '',
    temperature: $('#f-temp') ? $('#f-temp').value : '',
    location: $('#f-location') ? $('#f-location').value : '',
  };
}

async function saveEntry(navigateAway){
  const fields = await collectEditorFields();
  const existing = ENTRIES.find(x=>x.id===editorState.id);
  const now = new Date().toISOString();
  const entry = {
    id: editorState.id,
    date: fields.date, time: fields.time, title: fields.title, content: fields.content,
    mood: fields.mood, weather: fields.weather, temperature: fields.temperature, location: fields.location,
    tags: editorState.tags, people: editorState.people,
    photoIds: editorState.photos.map(p=>p.id),
    audioIds: editorState.audio.map(a=>a.id),
    favorite: existing? existing.favorite : false,
    pinned: existing? existing.pinned : false,
    // Manually-entered translations keyed by language code, e.g.
    // {en:{title,content}, zh:{...}}. Cleared whenever the title/content
    // actually changes so a stale translation is never shown for edited text.
    translations: (existing && existing.translations && existing.title===fields.title && existing.content===fields.content)
      ? existing.translations : {},
    createdAt: existing? existing.createdAt : now,
    updatedAt: now
  };
  await DB.put('entries', entry);
  for(const p of editorState.photos){ await DB.put('photos', {id:p.id, entryId:entry.id, dataUrl:p.dataUrl, caption:p.caption||''}); }
  for(const a of editorState.audio){ await DB.put('audio', {id:a.id, entryId:entry.id, dataUrl:a.dataUrl}); }
  await DB.delete('drafts', 'current').catch(()=>{});
  await loadAllWithMedia();
  renderYearNav();
  const savedEntry = ENTRIES.find(x=>x.id===entry.id);
  if(savedEntry) autoPushEntry(savedEntry); // fire-and-forget; see sync.js
  if(navigateAway!==false){ navigate('entry',{id:entry.id}); toast('✓ Entry saved'); }
  else { setSaveIndicator('✓ Saved'); }
}

const scheduleAutosave = debounce(async ()=>{
  if(CURRENT_ROUTE!=='editor') return;
  setSaveIndicator('Saving...');
  try{
    const fields = await collectEditorFields();
    await DB.put('drafts', {key:'current', id:editorState.id, fields, photos:editorState.photos, audio:editorState.audio, tags:editorState.tags, people:editorState.people, savedAt:Date.now()});
    setSaveIndicator('✓ Saved');
  }catch(err){ setSaveIndicator('Save failed'); }
}, 1200);

function bindEditorEvents(){
  $$('input,textarea,select').forEach(el=>{
    if(['f-date','f-time','f-title','f-content','f-mood','f-weather','f-temp','f-location'].includes(el.id)){
      el.addEventListener('input', scheduleAutosave);
    }
  });
  const photoInput = $('#photo-file-input');
  photoInput.addEventListener('change', async ()=>{
    for(const file of photoInput.files){
      const raw = await readFileAsDataURL(file);
      const compressed = await compressImage(raw);
      editorState.photos.push({id:uid(), dataUrl:compressed, caption:''});
    }
    photoInput.value='';
    rerenderEditorPhotos();
    scheduleAutosave();
  });
  $('#btn-record-voice').addEventListener('click', startVoiceRecording);
  renderVoiceBox(editorState.audio.length? 'done':'idle');
  bindVoiceBoxEvents();
  rerenderEditorPhotosBind();

  const tagInput = $('#f-tag-input');
  tagInput.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const v = tagInput.value.trim().replace(/^#/,'');
      if(v && !editorState.tags.includes(v)){ editorState.tags.push(v); tagInput.value=''; rerenderTagList(); scheduleAutosave(); }
    }
  });
  const peopleInput = $('#f-people-input');
  peopleInput.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const v = peopleInput.value.trim();
      if(v && !editorState.people.includes(v)){ editorState.people.push(v); peopleInput.value=''; rerenderPeopleList(); scheduleAutosave(); }
    }
  });

  $('#btn-save-entry').addEventListener('click', async ()=>{
    const ok = await promptPin(editorState.isNew ? 'Enter your PIN to save this new entry.' : 'Enter your PIN to save these changes.');
    if(ok) saveEntry(true);
  });
  $('#btn-cancel-entry').addEventListener('click', ()=> navigate('home'));
}
function rerenderTagList(){
  $('#tag-list').innerHTML = editorState.tags.map((t,i)=>`<span class="chip">#${escapeHTML(t)}<button data-rm-tag="${i}">✕</button></span>`).join('');
  $$('[data-rm-tag]').forEach(b=> b.addEventListener('click', ()=>{ editorState.tags.splice(Number(b.dataset.rmTag),1); rerenderTagList(); scheduleAutosave(); }));
}
function rerenderPeopleList(){
  $('#people-list').innerHTML = editorState.people.map((p,i)=>`<span class="chip">${escapeHTML(p)}<button data-rm-person="${i}">✕</button></span>`).join('');
  $$('[data-rm-person]').forEach(b=> b.addEventListener('click', ()=>{ editorState.people.splice(Number(b.dataset.rmPerson),1); rerenderPeopleList(); scheduleAutosave(); }));
}

function openNewEntry(kind, date){
  editorState = {id: uid(), isNew:true, photos:[], audio:[], tags:[], people:[]};
  navigate('editor', {_newId: editorState.id});
  if(date && $('#f-date')) $('#f-date').value = date;
  if(kind==='photo'){ const b = $('#btn-add-photo-editor'); if(b) b.click(); }
  else if(kind==='voice'){ const b = $('#btn-record-voice'); if(b) b.click(); }
  else if(kind==='quick'){ const c = $('#f-content'); if(c) c.focus(); }
}

/* ---------------- Demo data ---------------- */
const DEMO_TAG = '__demo__';
async function loadDemoData(){
  const samples = [
    {title:'A Quiet Walk Before Sunrise', content:'Woke up early and walked toward the fields before the sun came up. The road was unusually quiet.', mood:'peaceful', weather:'clearnight', daysAgo:0},
    {title:'A Long Ride After Work', content:'Took the bike out along the river road. Legs were tired but the sky made it worth it.', mood:'happy', weather:'sunny', daysAgo:2, tags:['Cycling']},
    {title:'Cycling Through the Village', content:'Rode through the old village road, stopped to talk with an old friend.', mood:'grateful', weather:'cloudy', daysAgo:6, tags:['Cycling','Village']},
    {title:'A Walk After Isha', content:'Walked back from the mosque with father. We talked about the harvest.', mood:'peaceful', weather:'clearnight', daysAgo:9, people:['Father']},
    {title:'Rain Kept Us Indoors', content:'Heavy rain all day. Spent the afternoon reading and drinking tea.', mood:'thoughtful', weather:'rainy', daysAgo:15},
    {title:'Market Day', content:'Went to check on the shops at the market. Business was steady this week.', mood:'good', weather:'sunny', daysAgo:22, tags:['Work']},
    {title:'Children Visiting', content:'The children came over in the evening. The house felt full again.', mood:'happy', weather:'sunny', daysAgo:31, people:['Daughter']},
    {title:'A Funny Afternoon', content:'The goat got loose again and led everyone on a chase around the yard.', mood:'funny', weather:'sunny', daysAgo:40}
  ];
  for(const s of samples){
    const d = new Date(); d.setDate(d.getDate()-s.daysAgo);
    const dateStr = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    const entry = {
      id:'demo-'+uid(), date:dateStr, time:'19:30', title:s.title, content:s.content,
      mood:s.mood||'', weather:s.weather||'', temperature:'', location:'',
      tags:[...(s.tags||[]), DEMO_TAG], people:s.people||[], photoIds:[], audioIds:[],
      favorite:false, pinned:false, createdAt:d.toISOString(), updatedAt:d.toISOString()
    };
    await DB.put('entries', entry);
  }
  await loadAllWithMedia();
  renderYearNav();
  toast('✓ Demo data loaded');
  navigate('home');
}
async function clearDemoData(){
  const demo = ENTRIES.filter(e=> (e.tags||[]).includes(DEMO_TAG));
  for(const e of demo) await DB.delete('entries', e.id);
  await loadAllWithMedia();
  renderYearNav();
  toast('Demo data cleared');
  navigate('home');
}

/* ---------------- Draft recovery ---------------- */
async function checkDraftRecovery(){
  const draft = await DB.get('drafts','current');
  if(draft && draft.fields && (draft.fields.title || draft.fields.content)){
    showModal(`
      <h3>Restore unsaved draft?</h3>
      <p class="muted">You have an unsaved entry from earlier: "${escapeHTML(draft.fields.title||'(untitled)')}"</p>
      <div class="modal-actions">
        <button class="btn" id="draft-discard">Discard</button>
        <button class="btn btn-primary" id="draft-restore">Restore</button>
      </div>
    `);
    $('#draft-discard').onclick = async ()=>{ await DB.delete('drafts','current'); closeModal(); };
    $('#draft-restore').onclick = ()=>{
      closeModal();
      editorState = {id:draft.id, isNew:true, photos:draft.photos||[], audio:draft.audio||[], tags:draft.tags||[], people:draft.people||[]};
      navigate('editor', {_newId:draft.id});
      setTimeout(()=>{
        if($('#f-title')) $('#f-title').value = draft.fields.title||'';
        if($('#f-content')) $('#f-content').value = draft.fields.content||'';
        if($('#f-date')) $('#f-date').value = draft.fields.date||todayStr();
        if($('#f-time')) $('#f-time').value = draft.fields.time||nowTimeStr();
      }, 30);
    };
  }
}
