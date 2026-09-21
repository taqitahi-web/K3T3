/* photos.js — reading/compressing images, and rendering the
   "insert photos while writing" strip inside the entry editor. */

function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxDim=1600, quality=0.82){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      let {width,height} = img;
      if(width>maxDim || height>maxDim){
        if(width>height){ height = Math.round(height*maxDim/width); width = maxDim; }
        else { width = Math.round(width*maxDim/height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      canvas.getContext('2d').drawImage(img,0,0,width,height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = ()=> resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* Renders the photo thumbnails inside the editor (uses global editorState
   from journal.js) and (re)binds their remove/caption controls. */
function rerenderEditorPhotosBind(){
  $$('[data-rm-photo]').forEach(b=> b.addEventListener('click', ()=>{
    editorState.photos.splice(Number(b.dataset.rmPhoto),1);
    rerenderEditorPhotos();
    scheduleAutosave();
  }));
  $$('[data-cap-photo]').forEach(inp=> inp.addEventListener('input', ()=>{
    editorState.photos[Number(inp.dataset.capPhoto)].caption = inp.value;
    scheduleAutosave();
  }));
}
function rerenderEditorPhotos(){
  const box = $('#editor-photos');
  box.innerHTML = editorState.photos.map((p,i)=>`
    <div class="photo-thumb">
      <img src="${p.dataUrl}">
      <button class="rm" data-rm-photo="${i}">✕</button>
      <input class="cap" data-cap-photo="${i}" placeholder="Caption" value="${escapeHTML(p.caption||'')}" style="border:none; width:100%;">
    </div>
  `).join('');
  rerenderEditorPhotosBind();
}
