/* ui.js — small reusable UI helpers: DOM shortcuts, formatting,
   toast notifications, modal component, lightbox, entry card renderer. */

const $ = (sel,el)=> (el||document).querySelector(sel);
const $$ = (sel,el)=> Array.from((el||document).querySelectorAll(sel));
const escapeHTML = s => (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const pad2 = n => String(n).padStart(2,'0');

function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function nowTimeStr(){ const d=new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDateLong(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  return d.toLocaleDateString(undefined,{weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function fmtDateShort(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  return d.toLocaleDateString(undefined,{day:'numeric', month:'short'});
}
function fmtTime12(t){
  if(!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ampm = h>=12?'PM':'AM'; let hh = h%12; if(hh===0) hh=12;
  return `${hh}:${pad2(m)} ${ampm}`;
}
function toast(msg){
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className='toast'; el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>el.remove(), 2400);
}
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

const MOODS = [
  {v:'happy', e:'😊', l:'Happy'}, {v:'good', e:'🙂', l:'Good'}, {v:'peaceful', e:'😌', l:'Peaceful'},
  {v:'normal', e:'😐', l:'Normal'}, {v:'thoughtful', e:'🤔', l:'Thoughtful'}, {v:'tired', e:'😴', l:'Tired'},
  {v:'sad', e:'😔', l:'Sad'}, {v:'funny', e:'😂', l:'Funny'}, {v:'grateful', e:'❤️', l:'Grateful'}
];
const WEATHERS = [
  {v:'sunny', e:'☀️', l:'Sunny'}, {v:'cloudy', e:'☁️', l:'Cloudy'}, {v:'rainy', e:'🌧️', l:'Rainy'},
  {v:'foggy', e:'🌫️', l:'Foggy'}, {v:'stormy', e:'⛈️', l:'Stormy'}, {v:'clearnight', e:'🌙', l:'Clear Night'}
];
function moodEmoji(v){ const m = MOODS.find(x=>x.v===v); return m? m.e:''; }
function weatherEmoji(v){ const w = WEATHERS.find(x=>x.v===v); return w? w.e:''; }

/* Deterministic hue per tag string, so the same tag always gets the same
   color across the app (used for the small colorful tag-chip touch). */
function tagHue(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) % 360;
  return h;
}
function tagChipHtml(t){
  return `<span class="chip tag-chip" style="--hue:${tagHue(t)}">#${escapeHTML(t)}</span>`;
}

function entryCardHtml(e){
  return `
  <div class="card entry-card" data-open-entry="${e.id}">
    <div class="meta-line">
      <span>${fmtDateShort(e.date)} · ${fmtTime12(e.time)}</span>
      ${e.mood? `<span>${moodEmoji(e.mood)}</span>`:''}
      ${e.favorite? `<span>⭐</span>`:''}
      ${e.pinned? `<span>📌</span>`:''}
    </div>
    <h3>${escapeHTML(e.title) || '(Untitled)'}</h3>
    <p>${escapeHTML((e.content||'').slice(0,140))}</p>
    ${e.tags && e.tags.length? `<div class="meta-line">${e.tags.map(tagChipHtml).join('')}</div>`:''}
  </div>`;
}
function emptyState(title, sub){
  return `<div class="empty-state"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(sub)}</p></div>`;
}

/* ---- Modal component ---- */
function showModal(html){
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal">${html}</div></div>`;
  $('#modal-backdrop').addEventListener('click', e=>{ if(e.target.id==='modal-backdrop') closeModal(); });
}
function closeModal(){ $('#modal-root').innerHTML=''; }

function confirmDialog(title, body, onConfirm){
  showModal(`
    <h3>${escapeHTML(title)}</h3>
    <p class="muted">${escapeHTML(body)}</p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger" id="modal-confirm">Delete</button>
    </div>
  `);
  $('#modal-cancel').onclick = closeModal;
  $('#modal-confirm').onclick = ()=>{ closeModal(); onConfirm(); };
}

/* ---- Lightbox component ---- */
function showLightbox(data){
  const el = document.createElement('div');
  el.className='lightbox';
  el.innerHTML = `<button class="lb-close" aria-label="Close">✕</button><img src="${data.src}"><div class="lb-cap">${escapeHTML(data.caption||'')}${data.date? `<div class="muted" style="margin-top:4px;">${fmtDateLong(data.date)}</div>`:''}</div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el || e.target.classList.contains('lb-close')) el.remove(); });
}

function setSaveIndicator(text){
  const el = $('#save-indicator'); if(el) el.textContent = text;
}

/* ---- PIN gate ----
   Used before adding, editing, or deleting an entry (see journal.js /
   app.js). Returns a Promise<boolean>: true if the correct PIN was
   entered, false if the person cancelled. */
const DEFAULT_PIN = '9625';
function getPin(){ return (SETTINGS && SETTINGS.pin) ? SETTINGS.pin : DEFAULT_PIN; }
function promptPin(message){
  return new Promise(resolve=>{
    showModal(`
      <h3>Enter PIN</h3>
      <p class="muted">${escapeHTML(message||'Enter your PIN to continue.')}</p>
      <input type="password" inputmode="numeric" id="pin-entry" placeholder="••••" autofocus>
      <p id="pin-error" style="color:var(--danger); font-size:0.8rem; min-height:1.1em; margin:6px 0 0;"></p>
      <div class="modal-actions">
        <button class="btn" id="pin-cancel">Cancel</button>
        <button class="btn btn-primary" id="pin-confirm">Confirm</button>
      </div>
    `);
    const input = $('#pin-entry');
    const finish = ok=>{ closeModal(); resolve(ok); };
    const tryConfirm = ()=>{
      if(input.value === getPin()) finish(true);
      else { $('#pin-error').textContent = 'Incorrect PIN.'; input.value=''; input.focus(); }
    };
    $('#pin-cancel').onclick = ()=> finish(false);
    $('#pin-confirm').onclick = tryConfirm;
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); tryConfirm(); } });
  });
}
