(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas = $("visual"), ctx = canvas.getContext("2d", { alpha: false }), audio = $("audio");
let audioURL = null, cover = null, coverURL = null, audioCtx = null, analyser = null, source = null;
let data = null, waveform = null, style = "spectrum", accent = "blue", size = "normal";
let exportBusy = false, deferredInstall = null, showingEnd = false, coverScale = 1.25, intensity = 1;
let cinemaMode = false, cinemaStyle = "spectrum", cinemaTarget = "spectrum";
let cinemaLastSwitch = 0, cinemaTransitionAt = 0, smoothedEnergy = 0;
let aiDirectorMode=false, aiPlan=[], aiPlanIndex=-1, aiIntensity=1, aiLastStyle="spectrum";
let bgCanvas = null, bgCtx = null;
const colors = { blue:["#4fa8ff","#9c62ff"], violet:["#a96bff","#5a7cff"], cyan:["#5af0ff","#4f8bff"], pink:["#ff65cb","#8b68ff"], gold:["#ffd36a","#ff7b54"], green:["#54f0b2","#43a4ff"] };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const TAU = Math.PI * 2;
function roundedRect(c,x,y,w,h,r){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);}
function glowText(c,text,x,y,font,color,blur=18){c.save();c.font=font;c.textAlign="center";c.textBaseline="middle";c.shadowColor=color;c.shadowBlur=blur;c.fillStyle=color;c.fillText(text,x,y);c.restore();}
function prepareCoverBackground(){
  if(!cover)return;
  const w=canvas.width||1920,h=canvas.height||1080;
  if(!bgCanvas){bgCanvas=document.createElement("canvas");bgCtx=bgCanvas.getContext("2d");}
  bgCanvas.width=Math.max(640,Math.round(w/2));bgCanvas.height=Math.max(360,Math.round(h/2));
  const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height;
  const scale=Math.max(bgCanvas.width/iw,bgCanvas.height/ih),dw=iw*scale,dh=ih*scale;
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);bgCtx.save();bgCtx.filter="blur(22px) brightness(.68) saturate(1.25)";
  bgCtx.drawImage(cover,(bgCanvas.width-dw)/2,(bgCanvas.height-dh)/2,dw,dh);bgCtx.restore();
}
function drawBackground(c,w,h,cols,t){
  if(bgCanvas){c.save();c.globalAlpha=.78;c.drawImage(bgCanvas,0,0,w,h);c.restore();}
  else {const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,"#101d42");g.addColorStop(.52,"#21133d");g.addColorStop(1,"#050713");c.fillStyle=g;c.fillRect(0,0,w,h);}
  const wash=c.createLinearGradient(0,0,w,h);wash.addColorStop(0,"#03081799");wash.addColorStop(.52,"#08051b66");wash.addColorStop(1,"#020510aa");c.fillStyle=wash;c.fillRect(0,0,w,h);
  const pulse=.035+.025*Math.sin(t*1.2);const vignette=c.createRadialGradient(w*.5,h*.43,Math.min(w,h)*.08,w*.5,h*.43,Math.max(w,h)*.72);vignette.addColorStop(0,`rgba(5,8,20,${pulse})`);vignette.addColorStop(1,"rgba(1,2,8,.72)");c.fillStyle=vignette;c.fillRect(0,0,w,h);
  c.save();c.globalAlpha=.12;c.strokeStyle=cols[0];c.lineWidth=1;for(let i=0;i<6;i++){const r=Math.min(w,h)*(.16+i*.085)+Math.sin(t*.5+i)*5;c.beginPath();c.arc(w*.5,h*.46,r,0,TAU);c.stroke();}c.restore();
}
function drawCoverCard(c,w,h,cols,level){
  if(!cover)return null;
  const unit=Math.min(w,h), maxW=w*.66,maxH=h*.52;
  const box=Math.min(maxW,maxH,unit*.66)*.8*coverScale;
  const s=Math.min(box,maxW,maxH),x=(w-s)/2;
  const cy=h*(h>w?0.445:(w/h>1.5?.455:.46)),y=cy-s/2;
  c.save();
  c.shadowColor=cols[0];c.shadowBlur=28+level*25;c.strokeStyle=cols[0]+"bb";c.lineWidth=Math.max(2,unit*.003);roundedRect(c,x-5,y-5,s+10,s+10,Math.max(12,unit*.018));c.stroke();c.shadowBlur=0;
  c.fillStyle="#050713";roundedRect(c,x-9,y-9,s+18,s+18,Math.max(14,unit*.02));c.fill();
  c.save();roundedRect(c,x,y,s,s,Math.max(10,unit*.012));c.clip();c.drawImage(cover,x,y,s,s);
  const shine=c.createLinearGradient(x,y,x+s,y+s);shine.addColorStop(0,"#ffffff18");shine.addColorStop(.45,"#ffffff00");shine.addColorStop(1,cols[1]+"22");c.fillStyle=shine;c.fillRect(x,y,s,s);c.restore();
  c.restore();return {x,y,s,cy};
}
function getLevel(){if(!data)return .18;let sum=0,n=Math.min(36,data.length);for(let i=0;i<n;i++)sum+=data[i];return clamp(sum/(n*255),0,1);}
function drawSpectrum(c,w,h,cols,t,level,layout){
 const n=100,gap=w*.0025,total=w*.82,bw=total/n-gap,left=(w-total)/2,base=h*.91,amp=h*(h>w?.15:.23);
 for(let i=0;i<n;i++){let v=data?data[Math.min(data.length-1,Math.floor(i/n*data.length))]/255:.12+.1*Math.abs(Math.sin(i*.27+t));let env=.22+.78*Math.pow(Math.sin(i/n*Math.PI),.65);let hh=Math.max(4,(v*.86+.025)*amp*env*intensity);const gr=c.createLinearGradient(0,base-hh,0,base);gr.addColorStop(0,cols[1]);gr.addColorStop(1,cols[0]);c.shadowColor=cols[0];c.shadowBlur=8+level*13;c.fillStyle=gr;roundedRect(c,left+i*(bw+gap),base-hh,bw,hh,Math.max(2,bw*.38));c.fill();}
 c.shadowBlur=0;
}
function drawWave(c,w,h,cols,t,level){const mid=h*.83,amp=h*(size==="large"?.10:size==="subtle"?.045:.075)*intensity;
 for(let layer=0;layer<4;layer++){c.beginPath();for(let x=0;x<=w;x+=3){const idx=waveform?Math.min(waveform.length-1,Math.floor(x/w*waveform.length)):0;const v=waveform?(waveform[idx]-128)/128:Math.sin(x*.018+t*2)*.35+Math.sin(x*.047-t)*.2;const y=mid+v*amp*(1-layer*.17)+Math.sin(x*.006+t+layer)*amp*.16;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=cols[layer%2];c.lineWidth=layer===0?4:2;c.globalAlpha=1-layer*.18;c.shadowColor=cols[layer%2];c.shadowBlur=14-layer*2;c.stroke();}c.globalAlpha=1;c.shadowBlur=0;
}
function drawRadial(c,w,h,cols,t,level,coverInfo){const cx=w/2,cy=coverInfo?coverInfo.cy: h*.48,r0=coverInfo?coverInfo.s*.67:Math.min(w,h)*.24;const count=128;
 c.save();c.lineCap="round";for(let i=0;i<count;i++){const a=i/count*TAU-Math.PI/2;const v=data?data[Math.floor(i/count*data.length)]/255:.15+.1*Math.sin(t*2+i);const r1=r0+v*Math.min(w,h)*.095*intensity;const x1=cx+Math.cos(a)*r0,y1=cy+Math.sin(a)*r0,x2=cx+Math.cos(a)*r1,y2=cy+Math.sin(a)*r1;c.strokeStyle=i%2?cols[0]:cols[1];c.lineWidth=Math.max(2,Math.min(w,h)*.003);c.globalAlpha=.55+v*.45;c.shadowColor=c.strokeStyle;c.shadowBlur=12;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}c.restore();
}
function drawParticles(c,w,h,cols,t,level){const count=230;for(let i=0;i<count;i++){const seed=i*12.9898;const x=(Math.sin(seed)*.5+.5)*w,y=(Math.cos(seed*1.7)*.5+.5)*h;const drift=Math.sin(t*.35+i)*18;const v=data?data[(i*13)%data.length]/255:.2;const rr=(.8+(i%4)*.65)*(1+v*intensity*2);c.fillStyle=i%3?cols[0]:cols[1];c.globalAlpha=.18+(i%7)*.055+v*.3;c.shadowColor=c.fillStyle;c.shadowBlur=5+v*14;c.beginPath();c.arc(x+drift,y+Math.cos(t+i)*8,rr,0,TAU);c.fill();}c.globalAlpha=1;c.shadowBlur=0;
}
function drawNeuralSpace(c,w,h,cols,t,level){const pts=[];const count=58;for(let i=0;i<count;i++){const a=i*2.399+t*.025,r=(.08+(i%13)/13*.42)*Math.min(w,h);const x=w*.5+Math.cos(a)*r+Math.sin(t*.2+i)*18,y=h*.48+Math.sin(a)*r*.62+Math.cos(t*.17+i)*14;const v=data?data[(i*7)%data.length]/255:.2;pts.push({x,y,v});}c.save();c.lineWidth=1.4;for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<Math.min(w,h)*.19){c.globalAlpha=(1-d/(Math.min(w,h)*.19))*.24;c.strokeStyle=(i+j)%2?cols[0]:cols[1];c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}}for(let i=0;i<pts.length;i++){const p=pts[i],r=2+p.v*7*intensity;c.globalAlpha=.45+p.v*.5;c.fillStyle=i%2?cols[0]:cols[1];c.shadowColor=c.fillStyle;c.shadowBlur=8+p.v*18;c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fill();}c.restore();
}
function drawHologram(c,w,h,cols,t,level){const cx=w/2,cy=h*.83,r=Math.min(w,h)*.21;c.save();for(let ring=0;ring<5;ring++){c.beginPath();c.ellipse(cx,cy,r*(1+ring*.16),r*(.22+ring*.045),0,0,TAU);c.strokeStyle=ring%2?cols[1]:cols[0];c.globalAlpha=.22+level*.18;c.lineWidth=2;c.shadowColor=c.strokeStyle;c.shadowBlur=14;c.stroke();}c.globalAlpha=1;c.shadowBlur=0;
 for(let i=0;i<72;i++){const a=i/72*TAU+t*.12,v=data?data[i%data.length]/255:.2;const rr=r*(.9+v*.35*intensity);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.25;c.fillStyle=i%2?cols[0]:cols[1];c.globalAlpha=.8;c.fillRect(x-2,y-2,4+v*8,4+v*8);}c.restore();
}
function drawFlow(c,w,h,cols,t,level){c.save();for(let layer=0;layer<7;layer++){c.beginPath();for(let x=0;x<=w;x+=4){const u=x/w;const v=data?data[Math.floor(u*(data.length-1))]/255:.2;const y=h*(.77+layer*.025)+Math.sin(u*9+t*(.7+layer*.05)+layer)*h*.025*intensity+Math.sin(u*21-t*.5+layer)*h*.008+v*h*.035*intensity;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=layer%2?cols[1]:cols[0];c.globalAlpha=.45-layer*.035;c.lineWidth=2+level*2;c.shadowColor=c.strokeStyle;c.shadowBlur=16;c.stroke();}c.restore();
}
function averageBand(from,to){
 if(!data||!data.length)return 0;
 const a=Math.max(0,Math.floor(from*data.length)),b=Math.min(data.length,Math.max(a+1,Math.floor(to*data.length)));
 let sum=0;for(let i=a;i<b;i++)sum+=data[i]/255;
 return sum/(b-a);
}
function chooseCinemaStyle(){
 const bass=averageBand(0,.12),mid=averageBand(.12,.48),high=averageBand(.48,1);
 const energy=clamp(bass*.42+mid*.35+high*.23,0,1);
 smoothedEnergy=smoothedEnergy*.82+energy*.18;
 // Choose a visual language from the current spectral balance and dynamics.
 if(smoothedEnergy<.105)return high<.10?"space":"flow";
 if(bass>mid*1.18&&bass>.17)return high>.24?"particles":"radial";
 if(high>mid*1.12&&high>.16)return "spectrum";
 if(mid>high*1.05)return "wave";
 return energy>.27?"hologram":"space";
}
function updateCinema(){
 if(!cinemaMode)return;
 const now=performance.now();
 if(now-cinemaLastSwitch<7200)return;
 cinemaLastSwitch=now;
 const next=chooseCinemaStyle();
 if(next!==cinemaStyle){cinemaTarget=next;cinemaTransitionAt=now;cinemaStyle=next;style=next;document.querySelectorAll(".style").forEach(b=>b.classList.toggle("active",b.dataset.style===next));}
}
function classifyDirectorFrame(energy,brightness,previousEnergy){
 const rising=energy-previousEnergy;
 let section="РАЗВИТИЕ",visual="wave",power=clamp(.72+energy*1.45,.65,1.65);
 if(energy<.075){section="АТМОСФЕРНОЕ ВСТУПЛЕНИЕ";visual=brightness>.18?"flow":"space";power=.68;}
 else if(energy<.145){section="СПОКОЙНЫЙ ФРАГМЕНТ";visual=brightness>.22?"flow":"space";power=.78;}
 else if(energy>.29&&rising>.018){section="НАРАСТАНИЕ";visual=brightness>.25?"particles":"radial";power=1.22;}
 else if(energy>.34){section="ЭНЕРГИЧНЫЙ ФРАГМЕНТ";visual=brightness>.28?"spectrum":"hologram";power=1.42;}
 else if(energy>.22){section="ПЛОТНЫЙ ФРАГМЕНТ";visual=brightness>.24?"wave":"radial";power=1.12;}
 else {section="МЕЛОДИЧЕСКАЯ ПАУЗА";visual="flow";power=.86;}
 return {section,style:visual,intensity:power,energy,brightness};
}
async function buildDirectorPlan(file){
 if(!file)throw new Error("Сначала загрузи аудиофайл.");
 const button=$("analyzeTrackBtn");button.disabled=true;button.textContent="Анализируем звук…";
 try{
  const bytes=await file.arrayBuffer();
  const decoder=new(window.AudioContext||window.webkitAudioContext)();
  let buffer;try{buffer=await decoder.decodeAudioData(bytes.slice(0));}finally{await decoder.close();}
  const channel=buffer.getChannelData(0),sr=buffer.sampleRate,step=Math.max(1,Math.floor(sr*2)),raw=[];
  for(let start=0;start<channel.length;start+=step){
   const end=Math.min(channel.length,start+step);let sum=0, crossings=0,prev=channel[start]||0;
   for(let i=start;i<end;i+=4){const v=channel[i];sum+=v*v;if((v>=0&&prev<0)||(v<0&&prev>=0))crossings++;prev=v;}
   const count=Math.max(1,Math.ceil((end-start)/4));raw.push({time:start/sr,energy:Math.sqrt(sum/count),brightness:crossings/count});
  }
  const smooth=raw.map((x,i)=>{let total=0,n=0;for(let j=Math.max(0,i-2);j<=Math.min(raw.length-1,i+2);j++){total+=raw[j].energy;n++;}return {...x,energy:total/n};});
  const max=Math.max(.001,...smooth.map(x=>x.energy));
  const normalized=smooth.map(x=>({...x,energy:x.energy/max,brightness:clamp(x.brightness*7,0,1)}));
  const scenes=[];let prev=0;
  normalized.forEach((x,i)=>{const c=classifyDirectorFrame(x.energy,x.brightness,prev);prev=x.energy;const last=scenes[scenes.length-1];
   if(last&&last.section===c.section&&last.style===c.style){last.end=(i+1)*2;last.intensity=(last.intensity+c.intensity)/2;}
   else scenes.push({start:x.time,end:Math.min(buffer.duration,(i+1)*2),...c});
  });
  // Merge very short adjacent scenes to avoid distracting flicker.
  for(let i=0;i<scenes.length-1;i++){if(scenes[i].end-scenes[i].start<6){scenes[i].end=scenes[i+1].end;scenes[i].section=scenes[i+1].section;scenes[i].style=scenes[i+1].style;scenes[i].intensity=scenes[i+1].intensity;scenes.splice(i+1,1);i--;}}
  aiPlan=scenes;aiPlanIndex=-1;aiDirectorMode=true;cinemaMode=false;$("cinemaMode").checked=false;$("aiDirectorMode").checked=true;setCinemaLabel();
  const list=$("directorScenes");list.innerHTML="";
  scenes.forEach((s,i)=>{const row=document.createElement("div");row.className="director-scene";const mins=t=>`${String(Math.floor(t/60)).padStart(2,"0")}:${String(Math.floor(t%60)).padStart(2,"0")}`;row.innerHTML=`<span class="scene-time">${mins(s.start)}–${mins(s.end)}</span><b>${s.section}</b><small>${s.style.toUpperCase()}</small>`;list.appendChild(row);});
  $("directorResult").hidden=false;$("directorSummary").textContent=`Найдено сцен: ${scenes.length} · длительность ${Math.floor(buffer.duration/60)}:${String(Math.floor(buffer.duration%60)).padStart(2,"0")}`;
  $("directorState").textContent="СЦЕНАРИЙ СОЗДАН · РЕЖИССЁР ВКЛЮЧЁН";
 }finally{button.disabled=false;button.textContent="✦ Проанализировать песню и создать сценарий";}
}
function updateAiDirector(){
 if(!aiDirectorMode||!aiPlan.length||!audio||!Number.isFinite(audio.currentTime))return;
 const time=audio.currentTime;let idx=aiPlan.findIndex(s=>time>=s.start&&time<s.end);if(idx<0)idx=aiPlan.length-1;
 const scene=aiPlan[idx];if(!scene)return;
 if(idx!==aiPlanIndex){aiPlanIndex=idx;style=scene.style;aiIntensity=scene.intensity;cinemaTransitionAt=performance.now();document.querySelectorAll(".style").forEach(b=>b.classList.toggle("active",b.dataset.style===style));$("directorCurrent").textContent=`${scene.section} · ${scene.style.toUpperCase()}`;}
}
function drawFrame(c,w,h,phase=0,end=false){
 const cols=colors[accent]||colors.blue,t=performance.now()/1000,level=getLevel();c.save();c.clearRect(0,0,w,h);drawBackground(c,w,h,cols,t);
 if(end){for(let i=0;i<90;i++){const x=(Math.sin(i*93.1+t*.13)*.5+.5)*w,y=(Math.cos(i*17.7+t*.11)*.5+.5)*h;c.fillStyle=cols[i%2]+"bb";c.beginPath();c.arc(x,y,1+(i%3),0,TAU);c.fill();}glowText(c,"NeuroCord",w/2,h*.48,`800 ${Math.round(Math.min(w,h)*.09)}px system-ui`,"#e8efff",42);glowText(c,"SOUND MADE VISIBLE",w/2,h*.57,`600 ${Math.round(Math.min(w,h)*.022)}px system-ui`,cols[0],18);c.restore();return;}
 const title=$("trackTitle").value.trim()||"Название трека",artist=$("artist").value.trim()||"NeuroCord",unit=Math.min(w,h);
 glowText(c,title,w/2,h*.105,`750 ${Math.round(unit*.045)}px system-ui`,"#ffffff",16);glowText(c,artist,w/2,h*.155,`550 ${Math.round(unit*.024)}px system-ui`,cols[0],12);
 const coverInfo=drawCoverCard(c,w,h,cols,level);
 const savedIntensity=intensity;
 intensity=aiDirectorMode?clamp(savedIntensity*aiIntensity,.45,2.15):(cinemaMode?clamp(savedIntensity*(.72+smoothedEnergy*1.35),.45,2.15):savedIntensity);
 c.save();
 if(cinemaMode&&cinemaTransitionAt){
   const progress=clamp((performance.now()-cinemaTransitionAt)/1250,0,1);
   c.globalAlpha=progress<.5?1-progress*1.5:.25+(progress-.5)*1.5;
   if(progress>=1)cinemaTransitionAt=0;
 }
 if(style==="spectrum")drawSpectrum(c,w,h,cols,t,level,coverInfo);
 else if(style==="wave")drawWave(c,w,h,cols,t,level);
 else if(style==="space")drawNeuralSpace(c,w,h,cols,t,level);
 else if(style==="particles")drawParticles(c,w,h,cols,t,level);
 else if(style==="radial")drawRadial(c,w,h,cols,t,level,coverInfo);
 else if(style==="hologram")drawHologram(c,w,h,cols,t,level);
 else if(style==="flow")drawFlow(c,w,h,cols,t,level);
 c.restore();intensity=savedIntensity;
 if($("showLogo").checked){c.save();c.textAlign="right";c.textBaseline="alphabetic";c.font=`800 ${Math.round(unit*.023)}px system-ui`;c.fillStyle="#e4ebff";c.shadowColor=cols[0];c.shadowBlur=12;c.fillText("NeuroCord",w*.96,h*.975);c.restore();}
 c.restore();
}
function fmt(s){if(!isFinite(s))return"00:00";return`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;}
function setStatus(s){$("status").textContent=s;}
const formats={landscape:{w:1920,h:1080,label:"1920 × 1080",ratio:"16:9"},portrait:{w:1080,h:1920,label:"1080 × 1920",ratio:"9:16"},square:{w:1080,h:1080,label:"1080 × 1080",ratio:"1:1"}};
function setFormat(key){const f=formats[key]||formats.landscape;canvas.width=f.w;canvas.height=f.h;const stage=$("stage");stage.classList.remove("stage-landscape","stage-portrait","stage-square");stage.classList.add(`stage-${key in formats?key:"landscape"}`);stage.style.aspectRatio=`${f.w} / ${f.h}`;$("exportDimensions").textContent=f.label;$("exportRatio").textContent=f.ratio;prepareCoverBackground();drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);}
$("format").addEventListener("change",e=>setFormat(e.target.value));
function setupAudioGraph(){if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();source=audioCtx.createMediaElementSource(audio);analyser=audioCtx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.82;source.connect(analyser);analyser.connect(audioCtx.destination);data=new Uint8Array(analyser.frequencyBinCount);waveform=new Uint8Array(analyser.fftSize);}}
audio.addEventListener("play",async()=>{try{setupAudioGraph();await audioCtx.resume();}catch(e){console.warn(e);}});
audio.addEventListener("timeupdate",()=>{$("timeLabel").textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;});
function renderLoop(){if(analyser){analyser.getByteFrequencyData(data);analyser.getByteTimeDomainData(waveform);}updateAiDirector();updateCinema();drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);requestAnimationFrame(renderLoop);}renderLoop();
$("audioFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;aiPlan=[];aiPlanIndex=-1;aiDirectorMode=false;$("aiDirectorMode").checked=false;$("directorResult").hidden=true;$("directorState").textContent="СЦЕНАРИЙ НЕ СОЗДАН";if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(f);audio.src=audioURL;$("stageHint").hidden=true;setStatus("АУДИО ЗАГРУЖЕНО");audio.load();});
$("coverFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=URL.createObjectURL(f);const img=new Image();img.onload=()=>{cover=img;prepareCoverBackground();$("stageHint").hidden=true;};img.src=coverURL;});
document.querySelectorAll(".style").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".style").forEach(x=>x.classList.remove("active"));b.classList.add("active");style=b.dataset.style;cinemaStyle=style;cinemaTarget=style;aiDirectorMode=false;$("aiDirectorMode").checked=false;$("cinemaMode").checked=false;cinemaMode=false;setCinemaLabel();$("directorState").textContent="РУЧНОЙ РЕЖИМ";}));
$("accent").addEventListener("change",e=>accent=e.target.value);$("visualSize").addEventListener("change",e=>size=e.target.value);
function setCinemaLabel(){const el=$("cinemaState");if(el)el.textContent=cinemaMode?"АВТОРЕЖИМ ВКЛЮЧЁН":"РУЧНОЙ ВЫБОР";}
if($("cinemaMode"))$("cinemaMode").addEventListener("change",e=>{cinemaMode=e.target.checked;if(cinemaMode){aiDirectorMode=false;$("aiDirectorMode").checked=false;cinemaLastSwitch=0;cinemaStyle=style;cinemaTarget=style;cinemaTransitionAt=performance.now();}setCinemaLabel();});
$("analyzeTrackBtn").addEventListener("click",async()=>{try{await buildDirectorPlan($("audioFile").files[0]);}catch(err){console.error(err);alert("Не удалось проанализировать аудио: "+(err.message||err));}});
$("aiDirectorMode").addEventListener("change",e=>{aiDirectorMode=e.target.checked&&aiPlan.length>0;if(aiDirectorMode){cinemaMode=false;$("cinemaMode").checked=false;aiPlanIndex=-1;updateAiDirector();}else if(!aiPlan.length)e.target.checked=false;setCinemaLabel();});
if($("coverScale"))$("coverScale").addEventListener("input",e=>{coverScale=Number(e.target.value)/100;$("coverScaleValue").textContent=`${e.target.value}%`;});
if($("intensity"))$("intensity").addEventListener("input",e=>{intensity=Number(e.target.value)/100;$("intensityValue").textContent=`${e.target.value}%`;});
async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function bestMime(){for(const m of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]){if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m))return m;}return"";}
function showDownload(blob,name){const link=$("downloadLink");if(link.dataset.url)URL.revokeObjectURL(link.dataset.url);const url=URL.createObjectURL(blob);link.dataset.url=url;link.href=url;link.download=name;link.textContent=`⬇ Скачать видео (${(blob.size/1024/1024).toFixed(1)} МБ)`;link.hidden=false;}
$("exportBtn").addEventListener("click",async()=>{
 if(exportBusy)return;if(!audio.src){alert("Сначала загрузи аудиофайл.");return;}if(!window.MediaRecorder||!canvas.captureStream){alert("Этот браузер не поддерживает запись видео. Попробуй Chrome на Android или актуальный Chrome/Edge на компьютере.");return;}
 exportBusy=true;$("exportBtn").disabled=true;$("downloadLink").hidden=true;$("mp4Btn").hidden=true;$("progressBox").hidden=false;$("progressBar").style.width="0%";let stream=null,rec=null,chunks=[],audioStream=null;
 try{setupAudioGraph();await audioCtx.resume();audio.pause();audio.currentTime=0;const canvasStream=canvas.captureStream(30);const dest=audioCtx.createMediaStreamDestination();source.connect(dest);audioStream=dest.stream;stream=new MediaStream([...canvasStream.getVideoTracks(),...audioStream.getAudioTracks()]);const mime=bestMime();if(!mime)throw new Error("В этом браузере нет доступного формата записи видео.");rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:192000});rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error("Ошибка записи"));});rec.start(1000);setStatus("ЗАПИСЬ ВИДЕО");await audio.play();const duration=Number.isFinite(audio.duration)?audio.duration:0;if(!duration)throw new Error("Не удалось определить длительность аудио.");while(audio.currentTime<duration&&!audio.ended){const p=clamp(audio.currentTime/duration*100,0,100);$("progressBar").style.width=p+"%";$("progressText").textContent=`Запись: ${Math.floor(p)}% · ${fmt(audio.currentTime)} / ${fmt(duration)}`;await wait(250);}audio.pause();if($("endCard").checked){showingEnd=true;const start=performance.now();while(performance.now()-start<5000){$("progressText").textContent="Записываем финальную заставку…";await wait(33);}showingEnd=false;}rec.stop();await done;const type=mime.split(";")[0],blob=new Blob(chunks,{type}),isMp4=type==="video/mp4";const title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");showDownload(blob,`${title}-NeuroCord.${isMp4?"mp4":"webm"}`);$("progressBar").style.width="100%";$("progressText").textContent=isMp4?"Готово: MP4 создан.":"Готово: создан WebM. Для MP4 используй конвертацию ниже.";if(!isMp4)$("mp4Btn").hidden=false;setStatus("ГОТОВО");showingEnd=false;
 }catch(err){console.error(err);alert("Не удалось экспортировать видео: "+(err.message||err));setStatus("ОШИБКА");}
 finally{if(rec&&rec.state!=="inactive"){try{rec.stop()}catch{}}if(stream)stream.getTracks().forEach(t=>t.stop());if(audioStream)audioStream.getTracks().forEach(t=>t.stop());audio.pause();exportBusy=false;$("exportBtn").disabled=false;}
});
$("mp4Btn").addEventListener("click",async()=>{const link=$("downloadLink");if(!link.dataset.url){alert("Сначала создай видео.");return;}const btn=$("mp4Btn"),old=btn.textContent;btn.disabled=true;btn.textContent="Загружаем конвертер…";$("progressBox").hidden=false;$("progressText").textContent="Загрузка FFmpeg.wasm — может потребоваться время и память.";try{const {FFmpeg}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");const {toBlobURL}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");const ffmpeg=new FFmpeg();ffmpeg.on("progress",({progress})=>{$("progressBar").style.width=Math.round(progress*100)+"%";$("progressText").textContent=`Конвертация в MP4: ${Math.round(progress*100)}%`;});await ffmpeg.load({coreURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js","text/javascript"),wasmURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm","application/wasm")});const sourceBlob=await(await fetch(link.dataset.url)).blob(),inputName=sourceBlob.type.includes("mp4")?"input.mp4":"input.webm";await ffmpeg.writeFile(inputName,new Uint8Array(await sourceBlob.arrayBuffer()));await ffmpeg.exec(["-i",inputName,"-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","output.mp4"]);const out=await ffmpeg.readFile("output.mp4"),blob=new Blob([out.buffer],{type:"video/mp4"}),title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");showDownload(blob,`${title}-NeuroCord.mp4`);$("progressText").textContent="Готово: MP4 создан.";setStatus("MP4 ГОТОВ");await ffmpeg.terminate();}catch(err){console.error(err);alert("Конвертация не удалась. На телефоне может не хватить памяти или CDN недоступен. WebM-файл всё ещё можно скачать.");$("progressText").textContent="Конвертация не удалась; WebM доступен для скачивания.";}finally{btn.disabled=false;btn.textContent=old;}});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall){alert("Открой меню Chrome (⋮) и выбери «Установить приложение» или «Добавить на главный экран».");return;}deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;});
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
setFormat($("format").value||"landscape");
})();
