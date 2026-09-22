/* share.js — two ways to share a single entry with someone who has no
   copy of this diary on their own device (this app has no server, so
   there is nothing else to "give" a reader except what's embedded in
   what you send them):

   1. SHARE LINK — the entry's text (title, date, mood/weather/tags,
      body) is encoded straight into the URL after "#share=". Opening
      that link runs this same page in a special read-only mode that
      decodes and displays it, without touching IndexedDB at all — the
      reader needs nothing else. Deliberately excludes photos/audio,
      since embedding those would make the URL too large to share
      reliably through chat apps.

   2. SHARE AS FILE — builds one small, fully self-contained .html file
      for that entry (photos/voice notes embedded as base64), which can
      be sent as a normal file attachment and opened by anyone, offline,
      no server needed either. */

function utf8ToBase64(str){ return btoa(unescape(encodeURIComponent(str))); }
function base64ToUtf8(str){ return decodeURIComponent(escape(atob(str))); }

function buildShareLinkUrl(entry){
  const payload = {
    v:1, title:entry.title||'', date:entry.date, time:entry.time,
    mood:entry.mood||'', weather:entry.weather||'', temperature:entry.temperature||'',
    location:entry.location||'', tags:entry.tags||[], people:entry.people||[],
    content:entry.content||''
  };
  const encoded = encodeURIComponent(utf8ToBase64(JSON.stringify(payload)));
  return location.origin + location.pathname + '#share=' + encoded;
}

async function shareEntryLink(id){
  const e = ENTRIES.find(x=>x.id===id);
  if(!e) return;
  const url = buildShareLinkUrl(e);
  if(url.length > 6000) toast("This entry is long — the link may get cut off in some apps. \"Share as File\" is safer for long entries.");

  if(navigator.share){
    try{ await navigator.share({title:e.title||'A diary entry', text:'A page from my diary', url}); return; }
    catch(err){ if(err && err.name==='AbortError') return; /* fall through to copy */ }
  }
  try{
    await navigator.clipboard.writeText(url);
    toast('✓ Link copied — paste it anywhere to share');
  }catch(err){
    showModal(`
      <h3>Share Link</h3>
      <p class="muted">Copy this link to share the entry:</p>
      <textarea readonly style="min-height:90px;">${escapeHTML(url)}</textarea>
      <div class="modal-actions"><button class="btn btn-primary" id="modal-cancel">Close</button></div>
    `);
    $('#modal-cancel').onclick = closeModal;
  }
}

function buildStandaloneEntryHtml(entry){
  const photosHtml = (entry._photos||[]).map(p=>`
    <figure style="margin:0 0 16px;">
      <img src="${p.dataUrl}" style="max-width:100%; border-radius:8px; display:block;">
      ${p.caption? `<figcaption style="font-size:0.85rem; color:#8a7a6a; margin-top:6px;">${escapeHTML(p.caption)}</figcaption>`:''}
    </figure>`).join('');
  const audioHtml = (entry._audio||[]).map(a=>`<audio controls src="${a.dataUrl}" style="width:100%; margin-bottom:12px;"></audio>`).join('');
  const metaBits = [];
  if(entry.weather) metaBits.push(`${weatherEmoji(entry.weather)} ${entry.temperature? entry.temperature+'°C':''}`.trim());
  if(entry.mood) metaBits.push(`${moodEmoji(entry.mood)} ${entry.mood}`);
  if(entry.location) metaBits.push(`📍 ${entry.location}`);
  const tagsHtml = (entry.tags||[]).map(t=>`<span style="display:inline-block; background:#f2e9da; color:#6b5a44; border-radius:999px; padding:2px 10px; font-size:0.78rem; margin:0 6px 6px 0;">#${escapeHTML(t)}</span>`).join('');
  const peopleHtml = (entry.people||[]).length ? `<p style="color:#8a7a6a; font-size:0.85rem;">With: ${entry.people.map(escapeHTML).join(', ')}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(entry.title || 'A diary entry')}</title>
<style>
  body{font-family:Georgia,'Noto Serif Bengali',serif; background:#f6f1e9; color:#2c2620; margin:0; padding:32px 18px;}
  .page{max-width:640px; margin:0 auto; background:#fffdf9; border:1px solid #e3dac9; border-radius:12px; padding:32px;}
  h1{font-size:1.6rem; margin:8px 0 4px;}
  .date{color:#8a7a6a; font-size:0.9rem;}
  .meta{color:#6b5a44; font-size:0.9rem; margin:10px 0 16px;}
  .content{white-space:pre-wrap; line-height:1.8; font-size:1.05rem;}
  hr{border:none; border-top:1px solid #e3dac9; margin:20px 0;}
  .footer{color:#a99d8c; font-size:0.75rem; margin-top:28px; text-align:center;}
</style>
</head>
<body>
  <div class="page">
    <div class="date">${fmtDateLong(entry.date)} · ${fmtTime12(entry.time)}</div>
    <h1>${escapeHTML(entry.title || '(Untitled)')}</h1>
    <div class="meta">${metaBits.join(' &nbsp;·&nbsp; ')}</div>
    <div>${tagsHtml}</div>
    <hr>
    <div class="content">${escapeHTML(entry.content || '')}</div>
    ${photosHtml? `<hr>${photosHtml}`:''}
    ${audioHtml? `<hr>${audioHtml}`:''}
    ${peopleHtml? `<hr>${peopleHtml}`:''}
    <div class="footer">Shared from Pages From My Life</div>
  </div>
</body>
</html>`;
}

async function shareEntryAsFile(id){
  const e = ENTRIES.find(x=>x.id===id);
  if(!e) return;
  toast('Preparing file…');
  const html = buildStandaloneEntryHtml(e);
  const filename = `diary-${e.date}-${(e.title||'entry').toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/gi,'-').slice(0,40).replace(/^-+|-+$/g,'')||'entry'}.html`;
  const blob = new Blob([html], {type:'text/html'});

  // Best mobile experience: hand the file straight to the native share
  // sheet (WhatsApp, email, etc.) when the browser supports it.
  if(navigator.canShare){
    try{
      const file = new File([blob], filename, {type:'text/html'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:e.title||'A diary entry'});
        return;
      }
    }catch(err){ if(err && err.name==='AbortError') return; /* fall through to download */ }
  }

  try{
    const downloads = (typeof window!=='undefined' && window.claude) ? await window.claude.use('downloads') : null;
    if(downloads){
      await downloads.save({filename, data:blob});
      toast('✓ File ready — find it in your downloads to share');
      return;
    }
  }catch(err){
    if(err && err.code==='declined') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('✓ File downloaded — share it from your downloads');
}

/* ---------------- Reading a shared link (recipient side) ---------------- */
// Called once from app.js's init(), before anything else touches
// IndexedDB or the normal app shell — a shared link should work for a
// reader who has never opened this app before.
function tryRenderSharedEntry(){
  const hash = location.hash;
  if(!hash.startsWith('#share=')) return false;
  let data;
  try{ data = JSON.parse(base64ToUtf8(decodeURIComponent(hash.slice(7)))); }
  catch(err){ return false; }
  if(!data || typeof data.content !== 'string') return false;

  const metaBits = [];
  if(data.weather) metaBits.push(`${weatherEmoji(data.weather)} ${data.temperature? data.temperature+'°C':''}`.trim());
  if(data.mood) metaBits.push(`${moodEmoji(data.mood)} ${data.mood}`);
  if(data.location) metaBits.push(`📍 ${escapeHTML(data.location)}`);
  const tagsHtml = (data.tags||[]).map(tagChipHtml).join('');
  const peopleHtml = (data.people||[]).length? `<p class="muted">With: ${data.people.map(escapeHTML).join(', ')}</p>` : '';

  document.body.innerHTML = `
    <div style="min-height:100vh; display:flex; justify-content:center; padding:32px 16px;">
      <div class="editor-wrap" style="max-width:640px; width:100%;">
        <div class="muted">${fmtDateLong(data.date)} · ${fmtTime12(data.time)}</div>
        <h1 class="serif" style="margin:6px 0 10px;">${escapeHTML(data.title)||'(Untitled)'}</h1>
        <div class="meta-line" style="margin-bottom:16px;">${metaBits.map(m=>`<span>${m}</span>`).join('')}${tagsHtml}</div>
        <hr style="border:none; border-top:1px solid var(--border);">
        <div style="white-space:pre-wrap; line-height:1.8; font-family:var(--serif); font-size:1.05rem; padding:18px 0;">${escapeHTML(data.content)}</div>
        <hr style="border:none; border-top:1px solid var(--border);">
        ${peopleHtml}
        <p class="muted" style="font-size:0.8rem; margin-top:24px;">This is a shared, read-only page from someone's <strong>Pages From My Life</strong> diary — not your own diary. <a href="${location.origin}${location.pathname}">Open the app</a> to write your own.</p>
      </div>
    </div>
  `;
  document.title = data.title ? `${data.title} — Pages From My Life` : 'Shared entry — Pages From My Life';
  return true;
}
