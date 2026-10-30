(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas=$("visual"), ctx=canvas.getContext("2d",{alpha:false}), audio=$("audio");
let audioURL=null, cover=null, coverURL=null, audioCtx=null, analyser=null, source=null, data=null, waveform=null, raf=0, style="spectrum", accent="blue", size="normal", exportBusy=false, deferredInstall=null, showingEnd=false;
const colors={blue:["#4fa8ff","#9c62ff"],violet:["#a96bff","#5a7cff"],cyan:["#5af0ff","#4f8bff"],pink:["#ff65cb","#8b68ff"]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):(c.rect(x,y,w,h));}
function coverDraw(c,w,h,alpha=0.45){
 c.save(); if(cover){const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height,scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;c.globalAlpha=alpha;c.drawImage(cover,(w-dw)/2,(h-dh)/2,dw,dh);}else{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,"#111c3d");g.addColorStop(.5,"#211443");g.addColorStop(1,"#050713");c.fillStyle=g;c.fillRect(0,0,w,h);}c.restore();
}
function glowText(c,text,x,y,font,color,blur=18){c.save();c.font=font;c.textAlign="center";c.shadowColor=color;c.shadowBlur=blur;c.fillStyle=color;c.fillText(text,x,y);c.restore();}
function drawFrame(c,w,h,phase=0,end=false){
 const cols=colors[accent]||colors.blue, t=performance.now()/1000;
 c.save();c.clearRect(0,0,w,h);
 // Rich but restrained backdrop: the cover remains atmospheric, never the main cover image.
 coverDraw(c,w,h,0.23);
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#050817b8");bg.addColorStop(.48,"#09051d9c");bg.addColorStop(1,"#030611c7");c.fillStyle=bg;c.fillRect(0,0,w,h);
 const vignette=c.createRadialGradient(w*.5,h*.48,10,w*.5,h*.48,w*.74);vignette.addColorStop(0,"#11152a00");vignette.addColorStop(1,"#02030b9c");c.fillStyle=vignette;c.fillRect(0,0,w,h);
 if(end){
   for(let i=0;i<110;i++){let x=(Math.sin(i*93.1+t*.13)*.5+.5)*w,y=(Math.cos(i*17.7+t*.11)*.5+.5)*h;c.fillStyle=cols[i%2]+"aa";c.beginPath();c.arc(x,y,1+(i%3),0,Math.PI*2);c.fill();}
   glowText(c,"NeuroCord",w/2,h*.48,`800 ${Math.round(w*.075)}px system-ui`,"#f0f4ff",38);
   glowText(c,"SOUND MADE VISIBLE",w/2,h*.57,`500 ${Math.round(w*.018)}px system-ui`,cols[0],16);
   c.restore();return;
 }
 const title=$("trackTitle").value.trim()||"Название трека",artist=$("artist").value.trim()||"NeuroCord";
 const scale=size==="large"?1.22:size==="subtle"?.72:1;
 // Title hierarchy with a crisp, high-contrast artist line.
 glowText(c,title,w/2,h*.105,`800 ${Math.round(w*.034)}px system-ui`,"#ffffff",18);
 glowText(c,artist,w/2,h*.158,`600 ${Math.round(w*.018)}px system-ui`,cols[0],12);
 const cx=w*.5, cy=h*.49;
 const coverSize=Math.min(h*.39,w*.23);
 const ringR=coverSize*.72;
 // Moving orbit lines make the artwork feel like a designed music release.
 for(let ring=0;ring<3;ring++){
   c.save();c.beginPath();c.ellipse(cx,cy,ringR+ring*coverSize*.10,(ringR+ring*coverSize*.10)*.82,t*.06*(ring%2? -1:1),0,Math.PI*2);
   c.strokeStyle=cols[ring%2];c.globalAlpha=.23-ring*.045;c.lineWidth=ring===0?3:1.5;c.shadowColor=cols[ring%2];c.shadowBlur=14;c.stroke();c.restore();
 }
 if(style==="spectrum"){
   // Radial spectrum around the artwork.
   const n=96;
   for(let i=0;i<n;i++){
     const a=i/n*Math.PI*2-t*.10;
     const bin=data?data[Math.min(data.length-1,Math.floor(i/n*data.length))]/255:0.16+0.12*Math.sin(i*.4+t*2);
     const len=(12+bin*h*.105)*scale;
     const r1=ringR+coverSize*.12,r2=r1+len;
     const x1=cx+Math.cos(a)*r1,y1=cy+Math.sin(a)*r1*.82,x2=cx+Math.cos(a)*r2,y2=cy+Math.sin(a)*r2*.82;
     c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=cols[i%2];c.lineWidth=Math.max(2,w*.0018);c.globalAlpha=.5+bin*.5;c.shadowColor=cols[i%2];c.shadowBlur=10;c.stroke();
   }
   c.globalAlpha=1;c.shadowBlur=0;
   // A second low, wide equalizer gives the frame motion even when the cover is square.
   const n2=112,gap=w*.0022,total=w*.78,bw=total/n2-gap,left=(w-total)/2,base=h*.88;
   for(let i=0;i<n2;i++){
     const v=data?data[Math.floor(i/n2*data.length)]/255:.12+.1*Math.abs(Math.sin(i*.27+t*1.5));
     const env=.18+.82*Math.pow(Math.sin(i/n2*Math.PI),.6),hh=Math.max(4,(v*.75+.018)*h*.12*env*scale);
     const gr=c.createLinearGradient(0,base-hh,0,base);gr.addColorStop(0,cols[1]);gr.addColorStop(1,cols[0]);
     c.fillStyle=gr;c.shadowColor=cols[0];c.shadowBlur=7;roundedRect(c,left+i*(bw+gap),base-hh,bw,hh,Math.max(2,bw*.35));c.fill();c.shadowBlur=0;
   }
 } else if(style==="wave"){
   // Layered sound ribbons flow behind the artwork.
   for(let layer=0;layer<5;layer++){
     c.beginPath();
     for(let x=0;x<=w;x+=3){
       const arr=waveform,idx=arr?Math.min(arr.length-1,Math.floor(x/w*arr.length)):0;
       const v=arr?(arr[idx]-128)/128:Math.sin(x*.018+t*2)*.35+Math.sin(x*.047-t)*.2;
       const y=h*.77+v*h*(.075+layer*.008)*scale+Math.sin(x*.005+t*(layer%2?1:-1)+layer)*h*.018;
       if(x===0)c.moveTo(x,y);else c.lineTo(x,y);
     }
     c.strokeStyle=cols[layer%2];c.globalAlpha=.78-layer*.11;c.lineWidth=layer===0?4:2;c.shadowColor=cols[layer%2];c.shadowBlur=18-layer*2;c.stroke();
   }
   c.globalAlpha=1;c.shadowBlur=0;
 } else if(style==="living"){
   // Cinematic living artwork: slow camera movement, audio-reactive light and orbiting particles.
   const beat=data?data.slice(2,42).reduce((a,b)=>a+b,0)/(40*255):.25+.12*Math.sin(t*2.4);
   const pulse=1+beat*.055+Math.sin(t*1.15)*.012;
   const card=Math.min(h*.59,w*.34), cw=card*pulse, ch=card*pulse;
   // Wide luminous halo behind the artwork.
   const halo=c.createRadialGradient(cx,cy,card*.12,cx,cy,card*1.35);
   halo.addColorStop(0,cols[0]+"55");halo.addColorStop(.48,cols[1]+"25");halo.addColorStop(1,"#05071300");
   c.fillStyle=halo;c.beginPath();c.arc(cx,cy,card*1.35,0,Math.PI*2);c.fill();
   // Rotating broken rings and fine orbit lines.
   for(let k=0;k<5;k++){
     c.save();c.translate(cx,cy);c.rotate(t*(k%2?-.12:.09)+k*.7);
     c.beginPath();c.ellipse(0,0,card*(.72+k*.105),card*(.72+k*.105)*.83,0,.25+k*.42,Math.PI*1.55+k*.42);
     c.strokeStyle=cols[k%2];c.globalAlpha=.3-k*.035;c.lineWidth=k===0?4:1.5;c.shadowColor=cols[k%2];c.shadowBlur=18;c.stroke();c.restore();
   }
   // Audio-reactive light ribbons orbit the cover.
   for(let band=0;band<4;band++){
     c.beginPath();
     for(let j=0;j<=240;j++){
       const a=j/240*Math.PI*2,bin=data?data[(j*3+band*17)%data.length]/255:beat;
       const rr=card*(.78+band*.095)+Math.sin(a*5-t*1.8+band)*card*(.025+bin*.045);
       const x=cx+Math.cos(a+t*(band%2?-.12:.12))*rr;
       const y=cy+Math.sin(a+t*(band%2?-.12:.12))*rr*.82;
       if(j===0)c.moveTo(x,y);else c.lineTo(x,y);
     }
     c.strokeStyle=cols[band%2];c.globalAlpha=.5-band*.08;c.lineWidth=2+band*.5;c.shadowColor=cols[band%2];c.shadowBlur=16;c.stroke();
   }
   // Floating sparks, distributed around the artwork.
   for(let i=0;i<95;i++){
     const a=i*2.399+t*(.08+(i%4)*.018),rr=card*(.9+(i%13)/13*.85);
     const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.78;
     const tw=.35+.65*(.5+.5*Math.sin(t*2+i*1.7));
     c.globalAlpha=tw;c.fillStyle=cols[i%2];c.shadowColor=cols[i%2];c.shadowBlur=9;c.beginPath();c.arc(x,y,1+(i%3)*.65,0,Math.PI*2);c.fill();
   }
   c.globalAlpha=1;c.shadowBlur=0;
   if(cover){
     const x=cx-cw/2,y=cy-ch/2,rad=card*.035;
     c.save();c.shadowColor=cols[0];c.shadowBlur=48+beat*35;c.fillStyle="#050713";roundedRect(c,x-10,y-10,cw+20,ch+20,rad+10);c.fill();c.restore();
     c.save();roundedRect(c,x,y,cw,ch,rad);c.clip();
     const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height;
     const zoom=Math.max(cw/iw,ch/ih)*(1.035+Math.sin(t*.65)*.018);
     const dw=iw*zoom,dh=ih*zoom,driftX=Math.sin(t*.31)*card*.018,driftY=Math.cos(t*.27)*card*.018;
     c.drawImage(cover,x+(cw-dw)/2+driftX,y+(ch-dh)/2+driftY,dw,dh);c.restore();
     // Soft glass sheen, not enough to obscure the cover.
     const sheen=c.createLinearGradient(x,y,x+cw*.8,y+ch);sheen.addColorStop(0,"#ffffff22");sheen.addColorStop(.35,"#ffffff00");sheen.addColorStop(1,"#8acbff10");
     c.save();roundedRect(c,x,y,cw,ch,rad);c.clip();c.fillStyle=sheen;c.fillRect(x,y,cw,ch);c.restore();
     c.save();roundedRect(c,x,y,cw,ch,rad);c.strokeStyle="#ffffffdd";c.lineWidth=3;c.shadowColor=cols[0];c.shadowBlur=22;c.stroke();c.restore();
   }else{
     const orb=c.createRadialGradient(cx-card*.2,cy-card*.2,4,cx,cy,card*.7);orb.addColorStop(0,cols[0]);orb.addColorStop(.55,cols[1]+"99");orb.addColorStop(1,"#06081900");c.fillStyle=orb;c.beginPath();c.arc(cx,cy,card*.7,0,Math.PI*2);c.fill();glowText(c,"NC",cx,cy+card*.12,`900 ${Math.round(card*.42)}px system-ui`,"#ffffff",30);
   }
   // A restrained bass pulse line anchors the composition.
   c.save();c.globalAlpha=.65;c.strokeStyle=cols[0];c.lineWidth=2;c.shadowColor=cols[0];c.shadowBlur=12;c.beginPath();
   for(let x=w*.12;x<=w*.88;x+=4){const v=data?data[Math.floor((x/w)*data.length)]/255:beat;const y=h*.865+Math.sin(x*.018+t*2.2)*h*(.006+v*.012);if(x===w*.12)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();c.restore();
 } else {
   // Neural constellation: animated nodes and connecting filaments.
   const nodes=[];const count=155;
   for(let i=0;i<count;i++){
     const a=i*2.399+t*(.035+(i%5)*.009),r=(.20+(i%23)/23*.49)*Math.min(w,h);
     const pulse=1+(data?data[(i*13)%data.length]/255:Math.sin(t+i)*.1)*.12;
     nodes.push({x:cx+Math.cos(a)*r*pulse,y:cy+Math.sin(a)*r*.58*pulse,rr:1+(i%3)});
   }
   for(let i=0;i<nodes.length;i++){
     const a=nodes[i],b=nodes[(i+7)%nodes.length];c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle=cols[i%2];c.globalAlpha=.12;c.lineWidth=1;c.stroke();
     c.globalAlpha=.4+(i%6)*.08;c.fillStyle=cols[i%2];c.beginPath();c.arc(a.x,a.y,a.rr,0,Math.PI*2);c.fill();
   }
   c.globalAlpha=1;
 }
 // Draw the cover as a real foreground artwork card, not just a dim background.
 if(cover){
   const x=cx-coverSize/2,y=cy-coverSize/2,rad=coverSize*.045;
   c.save();c.shadowColor=cols[0];c.shadowBlur=38;c.fillStyle="#050713";roundedRect(c,x-8,y-8,coverSize+16,coverSize+16,rad+8);c.fill();c.restore();
   c.save();roundedRect(c,x,y,coverSize,coverSize,rad);c.clip();
   const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height,sc=Math.max(coverSize/iw,coverSize/ih),dw=iw*sc,dh=ih*sc;
   c.drawImage(cover,x+(coverSize-dw)/2,y+(coverSize-dh)/2,dw,dh);c.restore();
   c.save();roundedRect(c,x,y,coverSize,coverSize,rad);c.strokeStyle="#ffffffcc";c.lineWidth=3;c.shadowColor=cols[0];c.shadowBlur=18;c.stroke();c.restore();
 }else{
   const orb=c.createRadialGradient(cx-coverSize*.1,cy-coverSize*.1,4,cx,cy,coverSize*.72);orb.addColorStop(0,cols[0]+"dd");orb.addColorStop(.55,cols[1]+"77");orb.addColorStop(1,"#06081900");c.fillStyle=orb;c.beginPath();c.arc(cx,cy,coverSize*.72,0,Math.PI*2);c.fill();
   glowText(c,"NC",cx,cy+coverSize*.12,`900 ${Math.round(coverSize*.42)}px system-ui`,"#ffffff",26);
 }
 if($("showLogo").checked){
   c.save();c.textAlign="right";c.font=`800 ${Math.round(w*.016)}px system-ui`;c.fillStyle="#eaf0ff";c.shadowColor=cols[0];c.shadowBlur=14;c.fillText("NeuroCord",w*.96,h*.965);c.restore();
 }
 c.restore();
}
function loop(){drawFrame(ctx,canvas.width,canvas.height);raf=requestAnimationFrame(loop);}
function fmt(s){if(!isFinite(s))return"00:00";return`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;}
function setStatus(s){$("status").textContent=s;}
function setupAudioGraph(){
 if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();source=audioCtx.createMediaElementSource(audio);analyser=audioCtx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.82;source.connect(analyser);analyser.connect(audioCtx.destination);data=new Uint8Array(analyser.frequencyBinCount);waveform=new Uint8Array(analyser.fftSize);}
}
audio.addEventListener("play",async()=>{try{setupAudioGraph();await audioCtx.resume();}catch(e){console.warn(e)}});
audio.addEventListener("timeupdate",()=>{$("timeLabel").textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;});
const oldDrawFrame=drawFrame;
// Pull live analyser data immediately before drawing.
const originalLoop=loop;
function renderLoop(){if(analyser){analyser.getByteFrequencyData(data);analyser.getByteTimeDomainData(waveform);}drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);raf=requestAnimationFrame(renderLoop);}
cancelAnimationFrame(raf);renderLoop();
$("audioFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(f);audio.src=audioURL;$("stageHint").hidden=true;setStatus("АУДИО ЗАГРУЖЕНО");audio.load();});
$("coverFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=URL.createObjectURL(f);cover=new Image();cover.onload=()=>{$("stageHint").hidden=true;};cover.src=coverURL;});
document.querySelectorAll(".style").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".style").forEach(x=>x.classList.remove("active"));b.classList.add("active");style=b.dataset.style;}));
$("accent").addEventListener("change",e=>accent=e.target.value);$("visualSize").addEventListener("change",e=>size=e.target.value);
async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function bestMime(){for(const m of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]){if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m))return m;}return"";}
function blobToUrl(blob){return URL.createObjectURL(blob);}
function showDownload(blob,name,mime){const link=$("downloadLink");if(link.dataset.url)URL.revokeObjectURL(link.dataset.url);const url=blobToUrl(blob);link.dataset.url=url;link.href=url;link.download=name;link.textContent=`⬇ Скачать видео (${(blob.size/1024/1024).toFixed(1)} МБ)`;link.hidden=false;}
$("exportBtn").addEventListener("click",async()=>{
 if(exportBusy)return;if(!audio.src){alert("Сначала загрузи аудиофайл.");return;}if(!window.MediaRecorder||!canvas.captureStream){alert("Этот браузер не поддерживает запись видео. Попробуй Chrome на Android или актуальный Chrome/Edge на компьютере.");return;}
 exportBusy=true;$("exportBtn").disabled=true;$("downloadLink").hidden=true;$("mp4Btn").hidden=true;$("progressBox").hidden=false;$("progressBar").style.width="0%";
 let stream=null,rec=null,chunks=[],audioStream=null,mix=null;
 try{
  setupAudioGraph();await audioCtx.resume();audio.pause();audio.currentTime=0;
  const canvasStream=canvas.captureStream(30);
  // Capture the Web Audio destination so the recorded file contains the actual song.
  const dest=audioCtx.createMediaStreamDestination();source.connect(dest);audioStream=dest.stream;
  stream=new MediaStream([...canvasStream.getVideoTracks(),...audioStream.getAudioTracks()]);
  const mime=bestMime();if(!mime)throw new Error("В этом браузере нет доступного формата записи видео.");
  rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:192000});
  rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  const done=new Promise((resolve,reject)=>{rec.onstop=()=>resolve();rec.onerror=e=>reject(e.error||new Error("Ошибка записи"));});
  rec.start(1000);setStatus("ЗАПИСЬ ВИДЕО");await audio.play();
  const duration=Number.isFinite(audio.duration)?audio.duration:0;if(!duration)throw new Error("Не удалось определить длительность аудио.");
  while(audio.currentTime<duration&&!audio.ended){const p=clamp(audio.currentTime/duration*100,0,100);$("progressBar").style.width=p+"%";$("progressText").textContent=`Запись: ${Math.floor(p)}% · ${fmt(audio.currentTime)} / ${fmt(duration)}`;await wait(250);}
  audio.pause();
  if($("endCard").checked){showingEnd=true;const start=performance.now();while(performance.now()-start<5000){$("progressText").textContent="Записываем финальную заставку…";await wait(33);}showingEnd=false;}
  rec.stop();await done;
  const type=mime.split(";")[0],blob=new Blob(chunks,{type});const isMp4=type==="video/mp4";const title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");
  showDownload(blob,`${title}-NeuroCord.${isMp4?"mp4":"webm"}`,type);$("progressBar").style.width="100%";$("progressText").textContent=isMp4?"Готово: MP4 создан.":"Готово: создан WebM. Для MP4 используй конвертацию ниже.";if(!isMp4)$("mp4Btn").hidden=false;setStatus("ГОТОВО");showingEnd=false;drawFrame(ctx,canvas.width,canvas.height);
 }catch(err){console.error(err);alert("Не удалось экспортировать видео: "+(err.message||err));setStatus("ОШИБКА");}
 finally{if(rec&&rec.state!=="inactive"){try{rec.stop()}catch{}}if(stream)stream.getTracks().forEach(t=>t.stop());if(audioStream)audioStream.getTracks().forEach(t=>t.stop());audio.pause();exportBusy=false;$("exportBtn").disabled=false;}
});
$("mp4Btn").addEventListener("click",async()=>{
 const link=$("downloadLink");if(!link.dataset.url){alert("Сначала создай видео.");return;}
 const btn=$("mp4Btn"),old=btn.textContent;btn.disabled=true;btn.textContent="Загружаем конвертер…";$("progressBox").hidden=false;$("progressText").textContent="Загрузка FFmpeg.wasm — может потребоваться время и память.";
 try{
  // Load the official FFmpeg.wasm wrapper and single-thread core from public CDN.
  const {FFmpeg}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
  const {toBlobURL}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");
  const ffmpeg=new FFmpeg();ffmpeg.on("progress",({progress})=>{$("progressBar").style.width=Math.round(progress*100)+"%";$("progressText").textContent=`Конвертация в MP4: ${Math.round(progress*100)}%`;});
  await ffmpeg.load({coreURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js","text/javascript"),wasmURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm","application/wasm")});
  const sourceBlob=await(await fetch(link.dataset.url)).blob();const inputName=sourceBlob.type.includes("mp4")?"input.mp4":"input.webm";
  await ffmpeg.writeFile(inputName,new Uint8Array(await sourceBlob.arrayBuffer()));
  await ffmpeg.exec(["-i",inputName,"-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","output.mp4"]);
  const out=await ffmpeg.readFile("output.mp4");const blob=new Blob([out.buffer],{type:"video/mp4"});const title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");showDownload(blob,`${title}-NeuroCord.mp4`,"video/mp4");$("progressText").textContent="Готово: MP4 создан.";setStatus("MP4 ГОТОВ");await ffmpeg.terminate();
 }catch(err){console.error(err);alert("Конвертация не удалась. На телефоне может не хватить памяти или CDN недоступен. WebM-файл всё ещё можно скачать.");$("progressText").textContent="Конвертация не удалась; WebM доступен для скачивания.";}
 finally{btn.disabled=false;btn.textContent=old;}
});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall){alert("Открой меню Chrome (⋮) и выбери «Установить приложение» или «Добавить на главный экран».");return;}deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;});
if("serviceWorker" in navigator && location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
})();