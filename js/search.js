/* search.js — full-journal search across title, content, tags,
   location, people and photo captions. */

function view_search(){
  const q = (CURRENT_PARAMS.q||'').toLowerCase().trim();
  $('#topbar-title').textContent = 'Search';
  let results = [];
  if(q){
    results = ENTRIES.filter(e=>{
      const hay = [e.title, e.content, e.location, (e.tags||[]).join(' '), (e.people||[]).join(' '), (e._photos||[]).map(p=>p.caption).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  return `
    <div class="field" style="max-width:420px;">
      <input type="search" id="search-input" placeholder="Search your life..." value="${escapeHTML(CURRENT_PARAMS.q||'')}" autofocus>
    </div>
    ${q? `<p class="muted">Results: ${results.length} entr${results.length===1?'y':'ies'}</p>`:''}
    <div class="grid grid-2">${results.map(entryCardHtml).join('')}</div>
    ${q && !results.length? emptyState('No matches found.', 'Try a different word or phrase.') : ''}
  `;
}

function openSearchPrompt(){
  navigate('search',{q:''});
  setTimeout(()=>{ const i=$('#search-input'); if(i) i.focus(); }, 30);
}
