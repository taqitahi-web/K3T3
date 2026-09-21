/* voice.js — browser-based voice diary recording (MediaRecorder API). */

let mediaRecorder = null, recordedChunks = [], recordStart = 0, recordTimerInt = null;

function renderVoiceBox(state, seconds){
  const box = $('#editor-voice'); if(!box) return;
  if(state==='idle' && !editorState.audio.length){
    box.innerHTML = '';
  } else if(state==='recording'){
    box.innerHTML = `<div class="voice-box"><span class="rec-dot"></span> Recording... ${seconds}s <button class="btn btn-sm" id="btn-stop-voice" style="margin-left:auto;">Stop</button></div>`;
  } else if(editorState.audio.length){
    box.innerHTML = editorState.audio.map((a,i)=>`
      <div class="voice-box" style="margin-bottom:8px;">
        <audio controls src="${a.dataUrl}" style="flex:1;"></audio>
        <button class="btn btn-sm btn-danger" data-rm-audio="${i}">Delete</button>
      </div>`).join('');
  }
}

async function startVoiceRecording(){
  if(!navigator.mediaDevices || !window.MediaRecorder){ toast('Voice recording is not supported in this browser'); return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = ev=>{ if(ev.data.size>0) recordedChunks.push(ev.data); };
    mediaRecorder.onstop = async ()=>{
      clearInterval(recordTimerInt);
      const blob = new Blob(recordedChunks, {type:'audio/webm'});
      const dataUrl = await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob); });
      editorState.audio.push({id:uid(), dataUrl});
      renderVoiceBox('done');
      bindVoiceBoxEvents();
      stream.getTracks().forEach(t=>t.stop());
      scheduleAutosave();
    };
    mediaRecorder.start();
    recordStart = Date.now();
    recordTimerInt = setInterval(()=>{
      renderVoiceBox('recording', Math.floor((Date.now()-recordStart)/1000));
      bindStopBtn();
    }, 500);
    renderVoiceBox('recording', 0);
    bindStopBtn();
  }catch(err){
    toast('Microphone permission denied or unavailable');
  }
}
function bindStopBtn(){
  const b = $('#btn-stop-voice');
  if(b) b.onclick = ()=>{ if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop(); };
}
function bindVoiceBoxEvents(){
  $$('#editor-voice [data-rm-audio]').forEach(b=> b.onclick = ()=>{
    editorState.audio.splice(Number(b.dataset.rmAudio),1); renderVoiceBox('idle'); bindVoiceBoxEvents(); scheduleAutosave();
  });
}
