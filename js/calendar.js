/* calendar.js — month calendar view with entry indicators. */

function view_calendar(){
  const now = new Date();
  const y = CURRENT_PARAMS.y ?? now.getFullYear();
  const m = CURRENT_PARAMS.m ?? now.getMonth(); // 0-indexed
  $('#topbar-title').textContent = 'Calendar';
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const entriesByDay = {};
  ENTRIES.forEach(e=>{
    const d = new Date(e.date+'T00:00:00');
    if(d.getFullYear()===y && d.getMonth()===m) entriesByDay[d.getDate()] = (entriesByDay[d.getDate()]||0)+1;
  });
  let cells = '';
  for(let i=0;i<startDow;i++) cells += `<div class="cal-day empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const isToday = todayStr()===`${y}-${pad2(m+1)}-${pad2(day)}`;
    const has = entriesByDay[day];
    cells += `<div class="cal-day ${has?'has-entry':''} ${isToday?'today':''}" data-cal-day="${y}-${pad2(m+1)}-${pad2(day)}">
      <div>${day}</div>${has?'<div class="dot"></div>':''}
    </div>`;
  }
  const monthLabel = first.toLocaleDateString(undefined,{month:'long', year:'numeric'});
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
      <button class="btn btn-sm" data-cal-nav="-1">‹ Prev</button>
      <h3 style="margin:0;">${monthLabel}</h3>
      <button class="btn btn-sm" data-cal-nav="1">Next ›</button>
    </div>
    <div class="cal-grid">
      ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div id="cal-day-detail" style="margin-top:20px;"></div>
  `;
}
