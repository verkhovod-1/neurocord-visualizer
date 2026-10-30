(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas=$("visual"), ctx=canvas.getContext("2d",{alpha:false}), audio=$("audio");
let audioURL=null, cover=null, coverURL=null, audioCtx=null, analyser=null, source=null, data=null, waveform=null, raf=0, style="spectrum", accent="blue", size="normal", exportBusy=false, deferredInstall=null, showingEnd=false;
const colors={blue:["#4fa8ff","#9c62ff"],violet:["#a96bff","#5a7cff"],cyan:["#5af0ff","#4f8bff"],pink:["#ff65cb","#8b68ff"]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):(c.rect(x,y,w,h));}
function coverDraw(c,w,h,alpha=0.78){
 c.save(); if(cover){const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height,scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;c.globalAlpha=alpha;c.drawImage(cover,(w-dw)/2,(h-dh)/2,dw,dh);}else{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,"#111c3d");g.addColorStop(.5,"#211443");g.addColorStop(1,"#050713");c.fillStyle=g;c.fillRect(0,0,w,h);}c.restore();
}
function glowText(c,text,x,y,font,color,blur=18){c.save();c.font=font;c.textAlign="center";c.shadowColor=color;c.shadowBlur=blur;c.fillStyle=color;c.fillText(text,x,y);c.restore();}
function drawFrame(c,w,h,phase=0,end=false){
 const cols=colors[accent]||colors.blue, t=performance.now()/1000;
 c.save();c.clearRect(0,0,w,h);coverDraw(c,w,h,0.78);
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#05081755");bg.addColorStop(.5,"#09051d66");bg.addColorStop(1,"#03061188");c.fillStyle=bg;c.fillRect(0,0,w,h);
 const vignette=c.createRadialGradient(w*.5,h*.45,20,w*.5,h*.45,w*.75);vignette.addColorStop(0,"#11152a11");vignette.addColorStop(1,"#02030bcf");c.fillStyle=vignette;c.fillRect(0,0,w,h);
 if(end){
   for(let i=0;i<70;i++){let x=(Math.sin(i*93.1+t*.13)*.5+.5)*w,y=(Math.cos(i*17.7+t*.11)*.5+.5)*h;c.fillStyle=cols[i%2]+"99";c.beginPath();c.arc(x,y,1+(i%3),0,Math.PI*2);c.fill();}
   glowText(c,"NeuroCord",w/2,h*.48,`800 ${Math.round(w*.075)}px system-ui`, "#dce8ff",38);
   glowText(c,"SOUND MADE VISIBLE",w/2,h*.57,`500 ${Math.round(w*.018)}px system-ui`,cols[0],16);
   c.restore();return;
 }
 const scale=size==="large"?1.25:size==="subtle"?.65:1;
 if(style==="spectrum"){
   const n=100, gap=w*.003, total=w*.76, bw=total/n-gap, left=(w-total)/2, base=h*.72;
   for(let i=0;i<n;i++){
     let v=data?data[Math.floor(i/n*data.length)]/255:0.12+0.12*Math.abs(Math.sin(i*.27+t*1.5));
     let env=(.2+.8*Math.pow(Math.sin(i/n*Math.PI),.5));let hh=Math.max(5,(v*0.9+.025)*h*.36*env*scale);
     const gr=c.createLinearGradient(0,base-hh,0,base);gr.addColorStop(0,cols[1]);gr.addColorStop(1,cols[0]);
     c.shadowColor=cols[0];c.shadowBlur=10;c.fillStyle=gr;roundedRect(c,left+i*(bw+gap),base-hh,bw,hh,Math.max(2,bw*.3));c.fill();c.shadowBlur=0;
   }
 } else if(style==="wave"){
   const mid=h*.66, amp=h*(size==="large"?.16:size==="subtle"?.07:.11);
   for(let layer=0;layer<3;layer++){
     c.beginPath();let arr=waveform;
     for(let x=0;x<=w;x+=3){let idx=arr?Math.floor(x/w*arr.length):0;let v=arr?(arr[idx]-128)/128:Math.sin(x*.018+t*2)*.35+Math.sin(x*.047-t)*.2;let y=mid+v*amp*(1-layer*.22)+Math.sin(x*.006+t+layer)*amp*.15;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}
     c.strokeStyle=cols[layer%2];c.lineWidth=layer===0?4:2;c.globalAlpha=1-layer*.22;c.shadowColor=cols[layer%2];c.shadowBlur=18-layer*4;c.stroke();c.shadowBlur=0;
   }c.globalAlpha=1;
 } else {
   const cx=w/2,cy=h*.62;
   for(let i=0;i<125;i++){const a=i*2.399+t*(.08+(i%4)*.012),r=(.05+(i%17)/17*.46)*Math.min(w,h),pulse=1+(data?data[(i*13)%data.length]/255:Math.sin(t+i)*.1)*.15;const x=cx+Math.cos(a)*r*pulse,y=cy+Math.sin(a)*r*.55*pulse;c.fillStyle=cols[i%2];c.globalAlpha=.3+(i%7)/10;c.beginPath();c.arc(x,y,1+(i%3),0,Math.PI*2);c.fill();if(i%5===0){c.strokeStyle=cols[i%2];c.globalAlpha=.12;c.beginPath();c.moveTo(x,y);const j=(i+7)%125,a2=j*2.399+t*.1,r2=(.05+(j%17)/17*.46)*Math.min(w,h);c.lineTo(cx+Math.cos(a2)*r2,cy+Math.sin(a2)*r2*.55);c.stroke();}}
   c.globalAlpha=1;
 }
 const title=$("trackTitle").value.trim()||"Название трека",artist=$("artist").value.trim()||"NeuroCord",unit=Math.min(w,h);
 glowText(c,title,w/2,h*.19,`700 ${Math.round(unit*.052)}px system-ui`,"#ffffff",14);
 glowText(c,artist,w/2,h*.245,`500 ${Math.round(unit*.027)}px system-ui`,cols[0],10);
 if($("showLogo").checked){c.save();c.textAlign="right";c.font=`800 ${Math.round(unit*.025)}px system-ui`;c.fillStyle="#d9e4ff";c.shadowColor=cols[0];c.shadowBlur=10;c.fillText("NeuroCord",w*.96,h*.93);c.restore();}
 c.restore();
}
function loop(){drawFrame(ctx,canvas.width,canvas.height);raf=requestAnimationFrame(loop);}
function fmt(s){if(!isFinite(s))return"00:00";return`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;}
function setStatus(s){$("status").textContent=s;}
const formats={landscape:{w:1920,h:1080,label:"1920 × 1080",ratio:"16:9"},portrait:{w:1080,h:1920,label:"1080 × 1920",ratio:"9:16"},square:{w:1080,h:1080,label:"1080 × 1080",ratio:"1:1"}};
function setFormat(key){const f=formats[key]||formats.landscape;canvas.width=f.w;canvas.height=f.h;$("stage").style.aspectRatio=`${f.w} / ${f.h}`;$("exportDimensions").textContent=f.label;$("exportRatio").textContent=f.ratio;drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);}
$("format").addEventListener("change",e=>setFormat(e.target.value));
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