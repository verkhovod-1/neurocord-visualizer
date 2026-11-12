(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas = $("visual"), ctx = canvas.getContext("2d", { alpha: false }), audio = $("audio");
let audioURL = null, cover = null, coverURL = null, audioCtx = null, analyser = null, source = null;
let data = null, waveform = null, style = "spectrum", accent = "blue", size = "normal";
let exportBusy = false, deferredInstall = null, showingEnd = false, coverScale = 1.00, intensity = 1;
let cinemaMode = false, cinemaStyle = "spectrum", cinemaTarget = "spectrum";
let cinemaLastSwitch = 0, cinemaTransitionAt = 0, smoothedEnergy = 0;
let cinemaBands = { bass: 0, mid: 0, high: 0 }, cinemaPreviousStyle = "spectrum", cinemaSceneCount = 0, cinemaBaseStyle = "spectrum";
let aiDirectorMode=false, aiPlan=[], aiPlanIndex=-1, aiIntensity=1, aiLastStyle="spectrum";
let bgCanvas = null, bgCtx = null;
let layerBackground=null, layerSubject=null, layerForeground=null, layerURLs={background:null,subject:null,foreground:null}, depthStrength=1;
let layerVisibility={background:true,subject:true,foreground:true};
let backgroundDarkness = 0, barCount = 72, barDepth = 3, barGlow = .70, barBass = 1, barPeakDecay = .80;
let barPeaks = new Float32Array(128), lastAnalysisAt = 0, lastPreviewAt = 0, lastExportAt = 0;
let exportCanvas = null, exportCtx = null, outputWidth = 1920, outputHeight = 1080, exportAudioDestination = null;
const lowPowerDevice = matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const targetFps = lowPowerDevice ? 24 : 30, frameInterval = 1000 / targetFps;
const colors = { blue:["#4fa8ff","#9c62ff"], violet:["#a96bff","#5a7cff"], cyan:["#5af0ff","#4f8bff"], pink:["#ff65cb","#8b68ff"], gold:["#ffd36a","#ff7b54"], green:["#54f0b2","#43a4ff"] };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const TAU = Math.PI * 2;
function roundedRect(c,x,y,w,h,r){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);}
function glowText(c,text,x,y,font,color,blur=18){c.save();c.font=font;c.textAlign="center";c.textBaseline="middle";c.shadowColor=color;c.shadowBlur=blur;c.fillStyle=color;c.fillText(text,x,y);c.restore();}
function prepareCoverBackground(){
  if(!cover)return;
  const w=outputWidth||1920,h=outputHeight||1080;
  if(!bgCanvas){bgCanvas=document.createElement("canvas");bgCtx=bgCanvas.getContext("2d",{alpha:false});}
  // Keep the cover at the export canvas resolution. Crop-to-fill, never stretch or blur.
  bgCanvas.width=w;bgCanvas.height=h;
  const iw=cover.naturalWidth||cover.width,ih=cover.naturalHeight||cover.height;
  const scale=Math.max(w/iw,h/ih)*coverScale,dw=iw*scale,dh=ih*scale;
  bgCtx.clearRect(0,0,w,h);
  bgCtx.imageSmoothingEnabled=true;bgCtx.imageSmoothingQuality="high";
  bgCtx.drawImage(cover,(w-dw)/2,(h-dh)/2,dw,dh);
}
function drawLayerCover(c,img,w,h,dx=0,dy=0,zoom=1){
  if(!img)return;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  const scale=Math.max(w/iw,h/ih)*zoom,dw=iw*scale,dh=ih*scale;c.drawImage(img,(w-dw)/2+dx,(h-dh)/2+dy,dw,dh);
}
function loadDepthLayer(kind,file){if(!file)return;if(layerURLs[kind])URL.revokeObjectURL(layerURLs[kind]);const url=URL.createObjectURL(file),img=new Image();layerURLs[kind]=url;img.onload=()=>{if(kind==='background')layerBackground=img;else if(kind==='subject')layerSubject=img;else layerForeground=img;drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);setStatus('3D-СЛОИ ЗАГРУЖЕНЫ');};img.onerror=()=>{setStatus('ОШИБКА СЛОЯ');alert('Не удалось открыть изображение слоя. Используй PNG.');};img.src=url;}

// v7.1: corrected mask compositing and preview cover placement. Local manual-assisted cover segmentation. The user paints semantic masks;
// the app builds transparent foreground planes and a softly reconstructed background.
let maskCanvas=null, maskCtx=null, subjectMask=null, foregroundMask=null, subjectTint=null, foregroundTint=null, editorSource=null, painting=false, lastPaintPoint=null;
function initLayerEditor(){
 maskCanvas=$("maskEditor"); if(!maskCanvas)return; maskCtx=maskCanvas.getContext("2d");
 $("openLayerEditor").addEventListener("click",()=>{
  if(!cover){alert("Сначала загрузи обложку.");return;}
  const scale=Math.min(1,1200/(cover.naturalWidth||cover.width),900/(cover.naturalHeight||cover.height));
  const w=Math.max(1,Math.round((cover.naturalWidth||cover.width)*scale)),h=Math.max(1,Math.round((cover.naturalHeight||cover.height)*scale));
  maskCanvas.width=w;maskCanvas.height=h;maskCtx.clearRect(0,0,w,h);maskCtx.drawImage(cover,0,0,w,h);
  subjectMask=document.createElement("canvas");subjectMask.width=w;subjectMask.height=h;
  foregroundMask=document.createElement("canvas");foregroundMask.width=w;foregroundMask.height=h;
  subjectTint=document.createElement("canvas");subjectTint.width=w;subjectTint.height=h;
  foregroundTint=document.createElement("canvas");foregroundTint.width=w;foregroundTint.height=h;
  editorSource={w,h};$("layerEditor").hidden=false;$("layerEditorStatus").textContent=`Обложка ${w} × ${h} · закрашивай объект`;
 });
 $("cancelLayerEditor").addEventListener("click",()=>$("layerEditor").hidden=true);
 $("brushSize").addEventListener("input",e=>$("brushSizeValue").textContent=e.target.value);
 $("clearMask").addEventListener("click",()=>{if(!editorSource)return;const target=$("maskTarget").value,cn=target==="subject"?subjectMask:foregroundMask;cn.getContext("2d").clearRect(0,0,cn.width,cn.height);redrawMaskEditor();});
 maskCanvas.addEventListener("pointerdown",e=>{if(!editorSource)return;painting=true;lastPaintPoint=maskPoint(e);maskCanvas.setPointerCapture(e.pointerId);paintMask(lastPaintPoint,lastPaintPoint);});
 maskCanvas.addEventListener("pointermove",e=>{if(!painting)return;const pt=maskPoint(e);paintMask(lastPaintPoint,pt);lastPaintPoint=pt;});
 const stop=()=>{painting=false;lastPaintPoint=null;};maskCanvas.addEventListener("pointerup",stop);maskCanvas.addEventListener("pointercancel",stop);maskCanvas.addEventListener("lostpointercapture",stop);
 $("buildDepthLayers").addEventListener("click",buildPaintedDepthLayers);
}
function maskPoint(e){const r=maskCanvas.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*maskCanvas.width,0,maskCanvas.width),y:clamp((e.clientY-r.top)/r.height*maskCanvas.height,0,maskCanvas.height)};}
function paintMask(a,b){const target=$("maskTarget").value,cn=target==="subject"?subjectMask:foregroundMask,m=cn.getContext("2d"),radius=Number($("brushSize").value)/2*(maskCanvas.width/maskCanvas.getBoundingClientRect().width);m.save();m.lineCap="round";m.lineJoin="round";m.lineWidth=radius*2;m.globalCompositeOperation=$("eraseMask").checked?"destination-out":"source-over";m.strokeStyle="#fff";m.fillStyle="#fff";m.beginPath();m.moveTo(a.x,a.y);m.lineTo(b.x,b.y);m.stroke();m.beginPath();m.arc(b.x,b.y,radius,0,TAU);m.fill();m.restore();redrawMaskEditor();}
function tintMask(mask,tint,color){
 const tc=tint.getContext("2d");tc.clearRect(0,0,tint.width,tint.height);tc.drawImage(mask,0,0);
 tc.globalCompositeOperation="source-in";tc.fillStyle=color;tc.fillRect(0,0,tint.width,tint.height);tc.globalCompositeOperation="source-over";
}
function redrawMaskEditor(){
 if(!editorSource)return;
 const w=maskCanvas.width,h=maskCanvas.height;
 maskCtx.clearRect(0,0,w,h);maskCtx.globalCompositeOperation="source-over";maskCtx.globalAlpha=1;
 maskCtx.drawImage(cover,0,0,w,h);
 // Tint is built on transparent offscreen canvases. Never use source-in on the
 // already opaque photograph, otherwise the whole editor gets painted.
 tintMask(subjectMask,subjectTint,"#35d8ff");tintMask(foregroundMask,foregroundTint,"#ffb84d");
 maskCtx.save();maskCtx.globalAlpha=.48;maskCtx.drawImage(subjectTint,0,0);maskCtx.restore();
 maskCtx.save();maskCtx.globalAlpha=.52;maskCtx.drawImage(foregroundTint,0,0);maskCtx.restore();
}
function maskToImage(mask){const c=document.createElement("canvas");c.width=mask.width;c.height=mask.height;const x=c.getContext("2d");x.drawImage(cover,0,0,c.width,c.height);x.globalCompositeOperation="destination-in";x.drawImage(mask,0,0);const im=new Image();return new Promise((resolve,reject)=>{im.onload=()=>resolve(im);im.onerror=reject;im.src=c.toDataURL("image/png");});}
async function buildPaintedDepthLayers(){
 if(!editorSource||!cover)return;
 const btn=$("buildDepthLayers");btn.disabled=true;btn.textContent="Собираем слои…";
 try{
  const w=editorSource.w,h=editorSource.h;
  const hasPaint=cn=>{const d=cn.getContext("2d").getImageData(0,0,cn.width,cn.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>16)return true;return false;};
  if(!hasPaint(subjectMask)&&!hasPaint(foregroundMask)){alert("Сначала выдели хотя бы один объект кистью.");return;}
  // Combine both independent masks. The background is the original image outside
  // the union, with a soft local fill underneath the removed objects.
  const union=document.createElement("canvas");union.width=w;union.height=h;
  const uc=union.getContext("2d");uc.drawImage(subjectMask,0,0);uc.drawImage(foregroundMask,0,0);
  const sharp=document.createElement("canvas");sharp.width=w;sharp.height=h;
  sharp.getContext("2d").drawImage(cover,0,0,w,h);
  const blur=document.createElement("canvas");blur.width=w;blur.height=h;
  const blc=blur.getContext("2d");blc.filter=`blur(${Math.max(8,Math.round(Math.min(w,h)*.025))}px)`;blc.drawImage(sharp,0,0);blc.filter="none";
  const background=document.createElement("canvas");background.width=w;background.height=h;
  const bc=background.getContext("2d");bc.drawImage(sharp,0,0);
  // Replace only painted pixels with the softened local approximation.
  const fill=document.createElement("canvas");fill.width=w;fill.height=h;
  const fc=fill.getContext("2d");fc.drawImage(blur,0,0);fc.globalCompositeOperation="destination-in";fc.drawImage(union,0,0);
  bc.globalCompositeOperation="destination-out";bc.drawImage(union,0,0);
  bc.globalCompositeOperation="destination-over";bc.drawImage(fill,0,0);
  const [bgImg,subImg,fgImg]=await Promise.all([
   new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=background.toDataURL("image/png");}),
   maskToImage(subjectMask),maskToImage(foregroundMask)
  ]);
  layerBackground=bgImg;layerSubject=subImg;layerForeground=fgImg;
  layerVisibility={background:true,subject:true,foreground:true};
  ["showLayerBackground","showLayerSubject","showLayerForeground"].forEach(id=>{const el=$(id);if(el)el.checked=true;});
  $("layerEditor").hidden=true;drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);setStatus("3D-СЛОИ СОЗДАНЫ");
  alert("Три слоя созданы и подключены. Фон под объектами восстановлен мягкой локальной заливкой — это приближение, не AI-инпейтинг.");
 }catch(err){console.error(err);alert("Не удалось собрать слои: "+(err.message||err));}
 finally{btn.disabled=false;btn.textContent="Создать 3D-слои";}
}

function drawBackground(c,w,h,cols,t){
  const motion=$("coverMotion")&&$("coverMotion").checked;
  const smart=$("smartCover")&&$("smartCover").checked;
  const demo=$("coverDemo")&&$("coverDemo").checked;
  const bass=demo&&!audio.currentTime?(.28+.22*Math.sin(t*2.1)):cinemaBands.bass;
  const mid=demo&&!audio.currentTime?(.22+.16*Math.sin(t*1.1+1)):cinemaBands.mid;
  const energy=smart?clamp(smoothedEnergy*.7+bass*.3,0,1):.25;
  if(bgCanvas||layerBackground){
    const active=motion?1:0,depth=depthStrength;
    const zoom=1+active*(.018+.026*energy+.012*bass)*(0.58+0.42*Math.sin(t*.31));
    const dx=active*w*(.010*Math.sin(t*.23)+.006*Math.sin(t*.71)*energy),dy=active*h*(.008*Math.cos(t*.19)+.006*Math.cos(t*.53)*bass);
    // Every full-canvas layer uses the exact same crop-to-fill coordinate system.
    // This prevents the background and transparent PNG objects drifting apart
    // when switching between 16:9 and 9:16 output formats.
    if(layerBackground&&layerVisibility.background)drawLayerCover(c,layerBackground,w,h,dx*.42,dy*.42,zoom);
    else if(bgCanvas&&layerVisibility.background)drawLayerCover(c,bgCanvas,w,h,dx*.42,dy*.42,zoom);
    if(layerSubject&&layerVisibility.subject){const sx=active*w*depth*(.010*Math.sin(t*.34+.8)+.006*bass),sy=active*h*depth*(.007*Math.cos(t*.27)),z=zoom*(1+active*depth*(.006+.008*energy));drawLayerCover(c,layerSubject,w,h,dx*.42+sx,dy*.42+sy,z);}
    if(layerForeground&&layerVisibility.foreground){const fx=active*w*depth*(.022*Math.sin(t*.43+1.7)+.009*bass),fy=active*h*depth*(.014*Math.cos(t*.37)),fz=zoom*(1+active*depth*(.012+.012*energy));drawLayerCover(c,layerForeground,w,h,dx*.42+fx,dy*.42+fy,fz);}
  } else {
    const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,"#17213b");g.addColorStop(.52,"#25203d");g.addColorStop(1,"#101629");c.fillStyle=g;c.fillRect(0,0,w,h);
  }
  if(backgroundDarkness>0){c.fillStyle=`rgba(0,0,0,${backgroundDarkness})`;c.fillRect(0,0,w,h);}
  if((bgCanvas||layerBackground)&&motion){
    // Широкая движущаяся полоса света поверх самой обложки — заметна и в предпросмотре, и в экспорте.
    const sweep=(t*.105)%1.6-.3, bandW=.18+.04*mid;
    const x=w*sweep, grad=c.createLinearGradient(x-w*bandW,0,x+w*bandW,h);
    grad.addColorStop(0,"rgba(255,255,255,0)");grad.addColorStop(.42,cols[0]+(smart?"30":"20"));
    grad.addColorStop(.5,"rgba(255,255,255,"+(smart?(.12+.13*energy):.07)+")");grad.addColorStop(.58,cols[1]+"24");grad.addColorStop(1,"rgba(255,255,255,0)");
    c.save();c.globalCompositeOperation="screen";c.globalAlpha=smart?(.72+.35*energy):.5;c.fillStyle=grad;c.fillRect(0,0,w,h);c.restore();
    const lx=w*(.5+.30*Math.sin(t*.24)),ly=h*(.5+.24*Math.cos(t*.18));
    const light=c.createRadialGradient(lx,ly,0,lx,ly,Math.min(w,h)*(.45+.12*bass));
    light.addColorStop(0,cols[0]+(smart?"35":"20"));light.addColorStop(.5,cols[1]+"12");light.addColorStop(1,"rgba(0,0,0,0)");
    c.save();c.globalCompositeOperation="screen";c.globalAlpha=.62;c.fillStyle=light;c.fillRect(0,0,w,h);c.restore();
    // Мягкая имитация глубины: два полупрозрачных световых слоя движутся с разной скоростью.
    if(smart){c.save();c.globalCompositeOperation="screen";c.globalAlpha=.10+.10*mid;c.fillStyle=cols[0];
      c.beginPath();c.ellipse(w*(.5+.035*Math.sin(t*.29)),h*(.48+.025*Math.cos(t*.21)),w*.22,h*.32,t*.025,0,TAU);c.fill();c.restore();}
  }
  c.save();c.globalAlpha=.045;c.strokeStyle=cols[0];c.lineWidth=Math.max(1,Math.min(w,h)*.001);
  for(let i=0;i<4;i++){const r=Math.min(w,h)*(.20+i*.11)+Math.sin(t*.5+i)*3;c.beginPath();c.arc(w*.5,h*.48,r,0,TAU);c.stroke();}
  c.restore();
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
 const n=lowPowerDevice?72:100,gap=w*.0025,total=w*.82,bw=total/n-gap,left=(w-total)/2,base=h*.91,amp=h*(h>w?.15:.23);
 for(let i=0;i<n;i++){let v=data?data[Math.min(data.length-1,Math.floor(i/n*data.length))]/255:.12+.1*Math.abs(Math.sin(i*.27+t));let env=.22+.78*Math.pow(Math.sin(i/n*Math.PI),.65);let hh=Math.max(4,(v*.86+.025)*amp*env*intensity);const gr=c.createLinearGradient(0,base-hh,0,base);gr.addColorStop(0,cols[1]);gr.addColorStop(1,cols[0]);c.shadowColor=cols[0];c.shadowBlur=8+level*13;c.fillStyle=gr;roundedRect(c,left+i*(bw+gap),base-hh,bw,hh,Math.max(2,bw*.38));c.fill();}
 c.shadowBlur=0;
}
function drawWave(c,w,h,cols,t,level){const mid=h*.83,amp=h*(size==="large"?.10:size==="subtle"?.045:.075)*intensity;
 for(let layer=0;layer<4;layer++){c.beginPath();for(let x=0;x<=w;x+=3){const idx=waveform?Math.min(waveform.length-1,Math.floor(x/w*waveform.length)):0;const v=waveform?(waveform[idx]-128)/128:Math.sin(x*.018+t*2)*.35+Math.sin(x*.047-t)*.2;const y=mid+v*amp*(1-layer*.17)+Math.sin(x*.006+t+layer)*amp*.16;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=cols[layer%2];c.lineWidth=layer===0?4:2;c.globalAlpha=1-layer*.18;c.shadowColor=cols[layer%2];c.shadowBlur=14-layer*2;c.stroke();}c.globalAlpha=1;c.shadowBlur=0;
}
function drawRadial(c,w,h,cols,t,level,coverInfo){const cx=w/2,cy=coverInfo?coverInfo.cy: h*.48,r0=coverInfo?coverInfo.s*.67:Math.min(w,h)*.24;const count=128;
 c.save();c.lineCap="round";for(let i=0;i<count;i++){const a=i/count*TAU-Math.PI/2;const v=data?data[Math.floor(i/count*data.length)]/255:.15+.1*Math.sin(t*2+i);const r1=r0+v*Math.min(w,h)*.095*intensity;const x1=cx+Math.cos(a)*r0,y1=cy+Math.sin(a)*r0,x2=cx+Math.cos(a)*r1,y2=cy+Math.sin(a)*r1;c.strokeStyle=i%2?cols[0]:cols[1];c.lineWidth=Math.max(2,Math.min(w,h)*.003);c.globalAlpha=.55+v*.45;c.shadowColor=c.strokeStyle;c.shadowBlur=12;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}c.restore();
}
function drawParticles(c,w,h,cols,t,level){const count=lowPowerDevice?115:190;for(let i=0;i<count;i++){const seed=i*12.9898;const x=(Math.sin(seed)*.5+.5)*w,y=(Math.cos(seed*1.7)*.5+.5)*h;const drift=Math.sin(t*.35+i)*18;const v=data?data[(i*13)%data.length]/255:.2;const rr=(.8+(i%4)*.65)*(1+v*intensity*2);c.fillStyle=i%3?cols[0]:cols[1];c.globalAlpha=.18+(i%7)*.055+v*.3;c.shadowColor=c.fillStyle;c.shadowBlur=5+v*14;c.beginPath();c.arc(x+drift,y+Math.cos(t+i)*8,rr,0,TAU);c.fill();}c.globalAlpha=1;c.shadowBlur=0;
}
function drawNeuralSpace(c,w,h,cols,t,level){const pts=[];const count=lowPowerDevice?34:48;for(let i=0;i<count;i++){const a=i*2.399+t*.025,r=(.08+(i%13)/13*.42)*Math.min(w,h);const x=w*.5+Math.cos(a)*r+Math.sin(t*.2+i)*18,y=h*.48+Math.sin(a)*r*.62+Math.cos(t*.17+i)*14;const v=data?data[(i*7)%data.length]/255:.2;pts.push({x,y,v});}c.save();c.lineWidth=1.4;for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<Math.min(w,h)*.19){c.globalAlpha=(1-d/(Math.min(w,h)*.19))*.24;c.strokeStyle=(i+j)%2?cols[0]:cols[1];c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}}for(let i=0;i<pts.length;i++){const p=pts[i],r=2+p.v*7*intensity;c.globalAlpha=.45+p.v*.5;c.fillStyle=i%2?cols[0]:cols[1];c.shadowColor=c.fillStyle;c.shadowBlur=8+p.v*18;c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fill();}c.restore();
}
function drawHologram(c,w,h,cols,t,level){const cx=w/2,cy=h*.83,r=Math.min(w,h)*.21;c.save();for(let ring=0;ring<5;ring++){c.beginPath();c.ellipse(cx,cy,r*(1+ring*.16),r*(.22+ring*.045),0,0,TAU);c.strokeStyle=ring%2?cols[1]:cols[0];c.globalAlpha=.22+level*.18;c.lineWidth=2;c.shadowColor=c.strokeStyle;c.shadowBlur=14;c.stroke();}c.globalAlpha=1;c.shadowBlur=0;
 for(let i=0;i<72;i++){const a=i/72*TAU+t*.12,v=data?data[i%data.length]/255:.2;const rr=r*(.9+v*.35*intensity);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.25;c.fillStyle=i%2?cols[0]:cols[1];c.globalAlpha=.8;c.fillRect(x-2,y-2,4+v*8,4+v*8);}c.restore();
}
function drawFlow(c,w,h,cols,t,level){c.save();for(let layer=0;layer<7;layer++){c.beginPath();for(let x=0;x<=w;x+=4){const u=x/w;const v=data?data[Math.floor(u*(data.length-1))]/255:.2;const y=h*(.77+layer*.025)+Math.sin(u*9+t*(.7+layer*.05)+layer)*h*.025*intensity+Math.sin(u*21-t*.5+layer)*h*.008+v*h*.035*intensity;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=layer%2?cols[1]:cols[0];c.globalAlpha=.45-layer*.035;c.lineWidth=2+level*2;c.shadowColor=c.strokeStyle;c.shadowBlur=16;c.stroke();}c.restore();
}
function drawBarLab(c,w,h,cols,t,level,mode){
 const count=barCount, total=w*.84, gap=total/count*.18, bw=total/count-gap, left=(w-total)/2, base=h*.89;
 if(mode==="bar-mirror"){
  const n=Math.min(count,96), span=w*.84, cell=span/n, barW=Math.max(2,cell*.72), mid=h*.53, amp=h*(h>w?.19:.23)*intensity, bassLevel=averageBand(0,.12)*barBass;
  c.save();c.lineCap="round";
  for(let i=0;i<n;i++){
   const bin=data?data[Math.min(data.length-1,Math.floor(i/n*data.length))]/255:.15+.12*Math.sin(t+i*.24);
   const v=clamp((bin*.78+bassLevel*.22)*(.35+.65*Math.sin((i+.5)/n*Math.PI)),0,1.35), bh=Math.max(2,v*amp);
   const x=left+i*cell+(cell-barW)/2, grad=c.createLinearGradient(0,mid-bh,0,mid+bh);grad.addColorStop(0,cols[1]);grad.addColorStop(.5,cols[0]);grad.addColorStop(1,cols[1]);
   c.shadowColor=cols[0];c.shadowBlur=barGlow*18;c.fillStyle=grad;roundedRect(c,x,mid-bh,barW,bh,Math.min(5,barW*.3));c.fill();
   c.globalAlpha=.52;c.fillRect(x,mid+3,barW,bh*.82);c.globalAlpha=1;
  }
  c.globalAlpha=.38;c.strokeStyle=cols[1];c.lineWidth=1;c.beginPath();c.moveTo(w*.08,mid);c.lineTo(w*.92,mid);c.stroke();c.restore();return;
 }
 if(mode==="bar-orbit"){
  const cx=w/2,cy=h*.48,r0=Math.min(w,h)*.235,n=Math.min(count,112),layers=lowPowerDevice?2:3,bassLevel=averageBand(0,.12)*barBass;
  c.save();c.lineCap="round";
  for(let layer=0;layer<layers;layer++){
   const radius=r0+layer*Math.min(w,h)*.075, direction=layer%2?-1:1;
   for(let i=0;i<n;i++){
    const a=i/n*TAU-Math.PI/2+t*(.045+layer*.018)*direction;
    const v=data?data[Math.floor(i/n*data.length)]/255:.16+.1*Math.sin(t*1.5+i*.2);
    const len=(.018+clamp(v*.075+bassLevel*.025,0,.12))*Math.min(w,h)*intensity;
    const x1=cx+Math.cos(a)*radius,y1=cy+Math.sin(a)*radius,x2=cx+Math.cos(a)*(radius+len),y2=cy+Math.sin(a)*(radius+len);
    c.strokeStyle=(i+layer)%3?cols[0]:cols[1];c.globalAlpha=.48+v*.48;c.lineWidth=Math.max(2,Math.min(w,h)*(.0025+v*.0015));c.shadowColor=c.strokeStyle;c.shadowBlur=barGlow*16;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
   }
  }
  c.restore();return;
 }
 const amp=h*(h>w?.22:.29)*intensity, segmentCount=mode==="bar-led"?14:1;
 const bass=averageBand(0,.12)*barBass;
 for(let i=0;i<count;i++){
  const bin=data?data[Math.min(data.length-1,Math.floor((i/count)*data.length*.82))]/255:.16+.1*Math.sin(t+i*.31);
  const env=.25+.75*Math.pow(Math.sin((i+.5)/count*Math.PI),.5);
  const value=clamp((bin*.82+bass*.18)*env,0,1.4), height=Math.max(3,value*amp);
  const x=left+i*(bw+gap), y=base-height;
  barPeaks[i]=Math.max(value,barPeaks[i]*barPeakDecay);
  c.save();
  c.shadowColor=cols[0];c.shadowBlur=barGlow*22;
  if(mode==="bar-led"){
   const segGap=Math.max(2,bw*.16),segH=(height-(segmentCount-1)*segGap)/segmentCount;
   for(let j=0;j<segmentCount;j++){
    const sy=base-(j+1)*(segH+segGap)+segGap;
    if(sy<y)continue;
    const hot=j/segmentCount>bin*.8;
    c.globalAlpha=hot ? .16:.55+.4*(j/segmentCount);c.fillStyle=j%3?cols[0]:cols[1];
    roundedRect(c,x,sy,bw,Math.max(2,segH),Math.max(1,bw*.18));c.fill();
   }
   c.globalAlpha=1;const py=base-barPeaks[i]*amp;
   c.fillStyle="#f4f7ff";c.shadowBlur=barGlow*25;c.fillRect(x,py,bw,Math.max(3,h*.004));
  }else{
   const grad=c.createLinearGradient(0,y,0,base);grad.addColorStop(0,cols[1]);grad.addColorStop(.55,cols[0]+"dd");grad.addColorStop(1,cols[0]+"66");
   c.fillStyle=grad;roundedRect(c,x,y,bw,height,Math.min(7,bw*.35));c.fill();
   if(mode==="bar-neon"){
    c.shadowBlur=0;c.strokeStyle="#ffffff88";c.lineWidth=Math.max(1,bw*.06);roundedRect(c,x+bw*.12,y+2,bw*.76,Math.max(2,height-4),Math.min(5,bw*.25));c.stroke();
   }
   if(mode==="bar-particles"&&value>.16){
    const sparks=Math.min(5,Math.round(value*5));c.shadowBlur=barGlow*12;
    for(let k=0;k<sparks;k++){const phase=(t*38+i*7+k*13)%34,px=x+bw*(.15+((i*17+k*11)%70)/100),py=y-phase;c.globalAlpha=clamp(1-phase/38,0,1)*.85;c.fillStyle=k%2?cols[1]:"#eaf6ff";c.beginPath();c.arc(px,py,1.5+(k%2),0,TAU);c.fill();}
   }
  }
  c.restore();
 }
 if(mode==="bar-tunnel"){
  // Receding rows add depth without a costly 3D engine.
  for(let row=1;row<barDepth;row++){
   const scale=1-row/(barDepth+1)*.72, yBase=h*(.30+row*.105), rowW=total*scale, rowGap=rowW/count*.22, rowBw=rowW/count-rowGap;
   c.save();c.globalAlpha=.30/(row*.65);c.shadowBlur=barGlow*10;
   for(let i=0;i<count;i+=2){const v=data?data[Math.floor(i/count*data.length)]/255:.2;const bh=Math.max(2,v*amp*scale*.45);c.fillStyle=i%4?cols[0]:cols[1];c.fillRect((w-rowW)/2+i*(rowBw+rowGap),yBase-bh,rowBw,bh);}
   c.restore();
  }
 }
}
function averageBand(from,to){
 if(!data||!data.length)return 0;
 const a=Math.max(0,Math.floor(from*data.length)),b=Math.min(data.length,Math.max(a+1,Math.floor(to*data.length)));
 let sum=0;for(let i=a;i<b;i++)sum+=data[i]/255;
 return sum/(b-a);
}
// Cinema FX are deliberately lightweight: no 3D engine, filters, or per-frame allocations.
const cinemaStyles = ["cinema-beams","cinema-dust","cinema-rings","cinema-rain","cinema-scan","cinema-shards","cinema-wave"];
function chooseCinemaStyle(){
 const bass=averageBand(0,.12),mid=averageBand(.12,.48),high=averageBand(.48,1);
 const energy=clamp(bass*.42+mid*.35+high*.23,0,1);
 smoothedEnergy=smoothedEnergy*.88+energy*.12;
 cinemaBands.bass=cinemaBands.bass*.72+bass*.28;
 cinemaBands.mid=cinemaBands.mid*.72+mid*.28;
 cinemaBands.high=cinemaBands.high*.72+high*.28;
 // Pick a visual scene from a broader palette, with musical character as the cue.
 if(smoothedEnergy<.10) return high>.08?"cinema-dust":"cinema-rain";
 if(cinemaBands.bass>cinemaBands.mid*1.22 && cinemaBands.bass>.15) return high>.20?"cinema-shards":"cinema-rings";
 if(cinemaBands.high>cinemaBands.mid*1.18 && cinemaBands.high>.13) return "cinema-beams";
 if(cinemaBands.mid>cinemaBands.high*1.12) return "cinema-wave";
 const choices=smoothedEnergy>.28?["cinema-beams","cinema-shards","cinema-scan","cinema-rings"]:["cinema-dust","cinema-rain","cinema-wave","cinema-scan"];
 // Avoid repeating the immediately previous scene.
 const available=choices.filter(x=>x!==cinemaStyle);
 return available[(cinemaSceneCount++)%available.length]||choices[0];
}
function updateCinema(){
 // Keep smoothed frequency bands available to independently enabled Cinema FX.
 if(!data||!data.length)return;
 const bass=averageBand(0,.12),mid=averageBand(.12,.48),high=averageBand(.48,1);
 const energy=clamp(bass*.42+mid*.35+high*.23,0,1);
 smoothedEnergy=smoothedEnergy*.88+energy*.12;
 cinemaBands.bass=cinemaBands.bass*.72+bass*.28;
 cinemaBands.mid=cinemaBands.mid*.72+mid*.28;
 cinemaBands.high=cinemaBands.high*.72+high*.28;
}

function drawCinemaFX(c,w,h,cols,t,level,mode,strength=1){
 const mobile=lowPowerDevice, unit=Math.min(w,h), bass=cinemaBands.bass, mid=cinemaBands.mid, high=cinemaBands.high;
 c.save(); c.lineCap="round"; c.lineJoin="round";
 if(mode==="cinema-beams"){
  const count=Math.max(3,Math.round((mobile?5:8)*(.72+strength*.28)));
  for(let i=0;i<count;i++){
   const x=w*(.08+i/(count-1)*.84), sway=Math.sin(t*.22+i*1.7)*w*.035;
   const width=unit*(.012+high*.025)*(.8+strength*.55), alpha=(.055+high*.12)*strength;
   const g=c.createLinearGradient(x+sway,0,x-sway+unit*.12,h);
   g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(.48,i%2?cols[0]+"55":cols[1]+"66");g.addColorStop(1,"rgba(255,255,255,0)");
   c.globalAlpha=Math.min(1,alpha*4);c.fillStyle=g;c.beginPath();c.moveTo(x-width+sway,0);c.lineTo(x+width+sway,0);c.lineTo(x+unit*.13-sway,h);c.lineTo(x-unit*.13-sway,h);c.closePath();c.fill();
  }
  // Brief light bloom follows bass, but remains translucent over the artwork.
  const glow=c.createRadialGradient(w*.5,h*.48,unit*.03,w*.5,h*.48,unit*.58);glow.addColorStop(0,cols[0]+"00");glow.addColorStop(1,cols[1]+"22");c.globalAlpha=Math.min(1,(.25+bass*.55)*strength);c.fillStyle=glow;c.fillRect(0,0,w,h);
 } else if(mode==="cinema-dust"){
  const count=Math.max(16,Math.round((mobile?38:68)*(.65+strength*.45)));
  for(let i=0;i<count;i++){
   const seed=i*17.13, x=((Math.sin(seed)*.5+.5)*w+Math.sin(t*.12+i)*unit*.018)%w;
   const y=(Math.cos(seed*1.31)*.5+.5)*h;
   const twinkle=.35+.65*(.5+.5*Math.sin(t*.7+i*2));
   c.globalAlpha=Math.min(1,(.38+high*.42)*twinkle*strength);c.fillStyle=i%3?"#ffffff":cols[0];
   const r=(1+(i%3)*.65)*(.8+strength*.45);c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
  }
 } else if(mode==="cinema-rings"){
  const cx=w*.5,cy=h*.5, rings=4;
  for(let i=0;i<rings;i++){
   const pulse=(t*(.13+.025*strength)+i/rings)%1, radius=unit*(.12+pulse*.52), alpha=(1-pulse)*(.12+bass*.28)*strength;
   c.globalAlpha=alpha;c.strokeStyle=i%2?cols[0]:cols[1];c.lineWidth=Math.max(1,unit*.0025*(.8+strength*.5));
   c.beginPath();c.ellipse(cx,cy,radius,radius*(h/w),0,0,TAU);c.stroke();
  }
  c.globalAlpha=Math.min(1,(.30+bass*.38)*strength);c.fillStyle=cols[0];c.beginPath();c.arc(w*.5,h*.5,unit*(.025+bass*.035),0,TAU);c.fill();
 } else if(mode==="cinema-rain"){
  const count=Math.max(16,Math.round((mobile?34:58)*(.7+strength*.4)));
  for(let i=0;i<count;i++){
   const x=((i*97.31+t*(12+i%5)*.8)%w), y=((i*173.7+t*(35+i%7)*1.8)%h);
   c.globalAlpha=Math.min(1,(.34+(mid*.34))*strength);c.strokeStyle=i%4?cols[0]:"#ffffff";c.lineWidth=(1+(i%3)*.4)*(.8+strength*.5);
   c.beginPath();c.moveTo(x,y);c.lineTo(x-unit*.008,y+unit*(.025+(i%4)*.012));c.stroke();
  }
 } else if(mode==="cinema-scan"){
  const gap=Math.max(12,Math.round(unit/(mobile?28:42))), offset=Math.floor(t*7)%gap;
  c.globalAlpha=Math.min(1,(.28+high*.24)*strength);c.strokeStyle=cols[0];c.lineWidth=1;
  for(let y=offset;y<h;y+=gap){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  const x=w*(.5+Math.sin(t*.18)*.32), beam=c.createLinearGradient(x-unit*.09,0,x+unit*.09,0);
  beam.addColorStop(0,"rgba(255,255,255,0)");beam.addColorStop(.5,cols[1]+"33");beam.addColorStop(1,"rgba(255,255,255,0)");
  c.globalAlpha=Math.min(1,.90*strength);c.fillStyle=beam;c.fillRect(x-unit*.09,0,unit*.18,h);
 } else if(mode==="cinema-shards"){
  const count=Math.max(7,Math.round((mobile?12:20)*(.72+strength*.28)));
  for(let i=0;i<count;i++){
   const a=i*2.399+t*(.025+(i%3)*.008), r=unit*(.18+(i%5)*.075), x=w*.5+Math.cos(a)*r, y=h*.5+Math.sin(a)*r*(h/w);
   const len=unit*(.018+bass*.045+(i%3)*.006)*(.8+strength*.55), width=unit*.003*(.8+strength*.5);
   c.globalAlpha=Math.min(1,(.38+high*.42)*strength);c.strokeStyle=i%2?cols[0]:"#ffffff";c.lineWidth=width;
   c.beginPath();c.moveTo(x-Math.cos(a)*len,y-Math.sin(a)*len);c.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();
  }
 } else if(mode==="cinema-wave"){
  const layers=Math.max(2,Math.round((mobile?3:5)*(.75+strength*.25)));
  for(let layer=0;layer<layers;layer++){
   c.beginPath();const base=h*(.68+layer*.055), amp=unit*(.018+mid*.035)*(.8+strength*.55);
   for(let x=0;x<=w;x+=Math.max(5,Math.round(w/180))){const u=x/w, bin=data?data[Math.floor(u*(data.length-1))]/255:.2;const y=base+Math.sin(u*8+t*(.25+layer*.035)+layer)*amp+bin*amp*.65;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}
   c.globalAlpha=Math.min(1,(.40+mid*.38-layer*.025)*strength);c.strokeStyle=layer%2?cols[0]:cols[1];c.lineWidth=Math.max(1.5,unit*.0025*(.8+strength*.5));c.stroke();
  }
 }
 c.restore();
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
  aiPlan=scenes;aiPlanIndex=-1;aiDirectorMode=true;cinemaMode=false;$("aiDirectorMode").checked=true;
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
 if($("showTrackTitle").checked)glowText(c,title,w/2,h*.105,`750 ${Math.round(unit*.045)}px system-ui`,"#ffffff",16);
 if($("showArtist").checked)glowText(c,artist,w/2,h*($("showTrackTitle").checked ? .155:.105),`550 ${Math.round(unit*.024)}px system-ui`,cols[0],12);
 const coverInfo=null;
 const savedIntensity=intensity;
 intensity=aiDirectorMode?clamp(savedIntensity*aiIntensity,.45,2.15):savedIntensity;
 c.save();
 if(aiDirectorMode&&cinemaTransitionAt){const p=clamp((performance.now()-cinemaTransitionAt)/700,0,1);c.globalAlpha=.35+.65*(p*p*(3-2*p));if(p>=1)cinemaTransitionAt=0;}
 if(style==="spectrum")drawSpectrum(c,w,h,cols,t,level,coverInfo);
 else if(style==="wave")drawWave(c,w,h,cols,t,level);
 else if(style==="space")drawNeuralSpace(c,w,h,cols,t,level);
 else if(style==="particles")drawParticles(c,w,h,cols,t,level);
 else if(style==="radial")drawRadial(c,w,h,cols,t,level,coverInfo);
 else if(style==="hologram")drawHologram(c,w,h,cols,t,level);
 else if(style==="flow")drawFlow(c,w,h,cols,t,level);
 else if(style.startsWith("bar-"))drawBarLab(c,w,h,cols,t,level,style);
 c.restore();
 // Cinema effects are independent overlays: they never replace the selected visualizer.
 const fxMap=[["fxBeams","cinema-beams"],["fxDust","cinema-dust"],["fxRings","cinema-rings"],["fxRain","cinema-rain"],["fxScan","cinema-scan"],["fxShards","cinema-shards"],["fxWave","cinema-wave"]];
 for(const [id,fxName] of fxMap){const control=$(id);if(control&&control.checked){c.save();const power=Number($(`${id}Power`)?.value||100)/100;
   drawCinemaFX(c,w,h,cols,t,level,fxName,clamp(intensity*power,.15,2.25));c.restore();}}
 intensity=savedIntensity;
 if($("showLogo").checked){c.save();c.textAlign="right";c.textBaseline="alphabetic";c.font=`800 ${Math.round(unit*.023)}px system-ui`;c.fillStyle="#e4ebff";c.shadowColor=cols[0];c.shadowBlur=12;c.fillText("NeuroCord",w*.96,h*.975);c.restore();}
 c.restore();
}
function fmt(s){if(!isFinite(s))return"00:00";return`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;}
function setStatus(s){$("status").textContent=s;}
const formats={landscape:{w:1920,h:1080,label:"1920 × 1080",ratio:"16:9"},portrait:{w:1080,h:1920,label:"1080 × 1920",ratio:"9:16"}};
function setFormat(key){const f=formats[key]||formats.landscape;outputWidth=f.w;outputHeight=f.h;const previewScale=Math.min(1,960/Math.max(f.w,f.h));canvas.width=Math.max(1,Math.round(f.w*previewScale));canvas.height=Math.max(1,Math.round(f.h*previewScale));const stage=$("stage");const safeKey=Object.prototype.hasOwnProperty.call(formats,key)?key:"landscape";stage.classList.remove("stage-landscape","stage-portrait");stage.classList.add(`stage-${safeKey}`);stage.style.aspectRatio=`${f.w} / ${f.h}`;$("exportDimensions").textContent=f.label;$("exportRatio").textContent=f.ratio;prepareCoverBackground();drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);}
$("format").addEventListener("change",e=>setFormat(e.target.value));
function setupAudioGraph(){if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();source=audioCtx.createMediaElementSource(audio);analyser=audioCtx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.82;source.connect(analyser);analyser.connect(audioCtx.destination);data=new Uint8Array(analyser.frequencyBinCount);waveform=new Uint8Array(analyser.fftSize);}}
audio.addEventListener("play",async()=>{try{setupAudioGraph();await audioCtx.resume();}catch(e){console.warn(e);}});
audio.addEventListener("timeupdate",()=>{$("timeLabel").textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;});
function renderLoop(now=performance.now()){
 if(analyser&&now-lastAnalysisAt>=125){analyser.getByteFrequencyData(data);analyser.getByteTimeDomainData(waveform);lastAnalysisAt=now;}
 updateAiDirector();updateCinema();
 if(!exportBusy&&now-lastPreviewAt>=frameInterval){drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);lastPreviewAt=now;}
 if(exportBusy&&exportCanvas&&now-lastExportAt>=frameInterval){drawFrame(exportCtx,exportCanvas.width,exportCanvas.height,0,showingEnd);lastExportAt=now;}
 requestAnimationFrame(renderLoop);
}renderLoop();
$("audioFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;aiPlan=[];aiPlanIndex=-1;aiDirectorMode=false;$("aiDirectorMode").checked=false;$("directorResult").hidden=true;$("directorState").textContent="СЦЕНАРИЙ НЕ СОЗДАН";if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(f);audio.src=audioURL;$("stageHint").hidden=true;setStatus("АУДИО ЗАГРУЖЕНО");audio.load();});
$("coverFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=URL.createObjectURL(f);const img=new Image();img.onload=()=>{cover=img;prepareCoverBackground();$("stageHint").hidden=true;drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);};img.src=coverURL;});
initLayerEditor();
$("layerBackground").addEventListener("change",e=>loadDepthLayer('background',e.target.files[0]));
$("layerSubject").addEventListener("change",e=>loadDepthLayer('subject',e.target.files[0]));
$("layerForeground").addEventListener("change",e=>loadDepthLayer('foreground',e.target.files[0]));
[["showLayerBackground","background"],["showLayerSubject","subject"],["showLayerForeground","foreground"]].forEach(([id,key])=>{const el=$(id);if(el)el.addEventListener("change",e=>{layerVisibility[key]=e.target.checked;drawFrame(ctx,canvas.width,canvas.height,0,showingEnd);});});
$("depthStrength").addEventListener("input",e=>{depthStrength=Number(e.target.value)/100;$("depthStrengthValue").textContent=e.target.value+'%';});
document.querySelectorAll(".style").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".style").forEach(x=>x.classList.remove("active"));b.classList.add("active");style=b.dataset.style;cinemaStyle=style;cinemaTarget=style;aiDirectorMode=false;$("aiDirectorMode").checked=false;cinemaMode=false;$("directorState").textContent="РУЧНОЙ РЕЖИМ";}));
$("accent").addEventListener("change",e=>accent=e.target.value);$("visualSize").addEventListener("change",e=>size=e.target.value);
function setCinemaLabel(){const el=$("cinemaState");if(el)el.textContent=cinemaMode?"АВТОРЕЖИМ ВКЛЮЧЁН":"РУЧНОЙ ВЫБОР";}
$("fxClear").addEventListener("click",()=>{["fxBeams","fxDust","fxRings","fxRain","fxScan","fxShards","fxWave"].forEach(id=>$(id).checked=false);});
["Beams","Dust","Rings","Rain","Scan","Shards","Wave"].forEach(name=>{
 const slider=$(`fx${name}Power`),output=$(`fx${name}Value`);
 if(slider&&output)slider.addEventListener("input",()=>output.textContent=`${slider.value}%`);
});
$("analyzeTrackBtn").addEventListener("click",async()=>{try{await buildDirectorPlan($("audioFile").files[0]);}catch(err){console.error(err);alert("Не удалось проанализировать аудио: "+(err.message||err));}});
$("aiDirectorMode").addEventListener("change",e=>{aiDirectorMode=e.target.checked&&aiPlan.length>0;if(aiDirectorMode){cinemaMode=false;aiPlanIndex=-1;updateAiDirector();}else if(!aiPlan.length)e.target.checked=false;});
if($("coverScale"))$("coverScale").addEventListener("input",e=>{coverScale=Number(e.target.value)/100;$("coverScaleValue").textContent=`${e.target.value}%`;prepareCoverBackground();});
if($("intensity"))$("intensity").addEventListener("input",e=>{intensity=Number(e.target.value)/100;$("intensityValue").textContent=`${e.target.value}%`;});
$("backgroundDarkness").addEventListener("input",e=>{backgroundDarkness=Number(e.target.value)/100;$("backgroundDarknessValue").textContent=`${e.target.value}%`;});
const barControls=[["barCount",v=>barCount=Number(v),"barCountValue",v=>v],["barDepth",v=>barDepth=Number(v),"barDepthValue",v=>v],["barGlow",v=>barGlow=Number(v)/100,"barGlowValue",v=>`${v}%`],["barBass",v=>barBass=Number(v)/100,"barBassValue",v=>`${v}%`],["barPeak",v=>barPeakDecay=Number(v)/100,"barPeakValue",v=>`${v}%`]];
barControls.forEach(([id,set,label,format])=>$(id).addEventListener("input",e=>{set(e.target.value);$(label).textContent=format(e.target.value);}));
async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function bestMime(){for(const m of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]){if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m))return m;}return"";}
function showDownload(blob,name){const link=$("downloadLink");if(link.dataset.url)URL.revokeObjectURL(link.dataset.url);const url=URL.createObjectURL(blob);link.dataset.url=url;link.href=url;link.download=name;link.textContent=`⬇ Скачать видео (${(blob.size/1024/1024).toFixed(1)} МБ)`;link.hidden=false;}
$("exportBtn").addEventListener("click",async()=>{
 if(exportBusy)return;if(!audio.src){alert("Сначала загрузи аудиофайл.");return;}if(!window.MediaRecorder||!canvas.captureStream){alert("Этот браузер не поддерживает запись видео. Попробуй Chrome на Android или актуальный Chrome/Edge на компьютере.");return;}
 exportBusy=true;$("exportBtn").disabled=true;$("format").disabled=true;$("downloadLink").hidden=true;$("mp4Btn").hidden=true;$("progressBox").hidden=false;$("progressBar").style.width="0%";let stream=null,rec=null,chunks=[],audioStream=null;
 try{setupAudioGraph();await audioCtx.resume();audio.pause();audio.currentTime=0;exportCanvas=document.createElement("canvas");exportCanvas.width=outputWidth;exportCanvas.height=outputHeight;exportCtx=exportCanvas.getContext("2d",{alpha:false});drawFrame(exportCtx,exportCanvas.width,exportCanvas.height,0,false);const canvasStream=exportCanvas.captureStream(targetFps);exportAudioDestination=audioCtx.createMediaStreamDestination();source.connect(exportAudioDestination);audioStream=exportAudioDestination.stream;stream=new MediaStream([...canvasStream.getVideoTracks(),...audioStream.getAudioTracks()]);const mime=bestMime();if(!mime)throw new Error("В этом браузере нет доступного формата записи видео.");rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:lowPowerDevice?5500000:8000000,audioBitsPerSecond:192000});rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error("Ошибка записи"));});rec.start(1000);setStatus("ЗАПИСЬ ВИДЕО");await audio.play();const duration=Number.isFinite(audio.duration)?audio.duration:0;if(!duration)throw new Error("Не удалось определить длительность аудио.");while(audio.currentTime<duration&&!audio.ended){const p=clamp(audio.currentTime/duration*100,0,100);$("progressBar").style.width=p+"%";$("progressText").textContent=`Запись: ${Math.floor(p)}% · ${fmt(audio.currentTime)} / ${fmt(duration)}`;await wait(250);}audio.pause();if($("endCard").checked){showingEnd=true;const start=performance.now();while(performance.now()-start<5000){$("progressText").textContent="Записываем финальную заставку…";await wait(33);}showingEnd=false;}rec.stop();await done;const type=mime.split(";")[0],blob=new Blob(chunks,{type}),isMp4=type==="video/mp4";const title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");showDownload(blob,`${title}-NeuroCord.${isMp4?"mp4":"webm"}`);$("progressBar").style.width="100%";$("progressText").textContent=isMp4?"Готово: MP4 создан.":"Готово: создан WebM. Для MP4 используй конвертацию ниже.";if(!isMp4)$("mp4Btn").hidden=false;setStatus("ГОТОВО");showingEnd=false;
 }catch(err){console.error(err);alert("Не удалось экспортировать видео: "+(err.message||err));setStatus("ОШИБКА");}
 finally{if(rec&&rec.state!=="inactive"){try{rec.stop()}catch{}}if(stream)stream.getTracks().forEach(t=>t.stop());if(audioStream)audioStream.getTracks().forEach(t=>t.stop());audio.pause();if(source&&exportAudioDestination){try{source.disconnect(exportAudioDestination)}catch{}}exportAudioDestination=null;exportBusy=false;exportCanvas=null;exportCtx=null;$("format").disabled=false;$("exportBtn").disabled=false;}
});
$("mp4Btn").addEventListener("click",async()=>{const link=$("downloadLink");if(!link.dataset.url){alert("Сначала создай видео.");return;}const btn=$("mp4Btn"),old=btn.textContent;btn.disabled=true;btn.textContent="Загружаем конвертер…";$("progressBox").hidden=false;$("progressText").textContent="Загрузка FFmpeg.wasm — может потребоваться время и память.";try{const {FFmpeg}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");const {toBlobURL}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");const ffmpeg=new FFmpeg();ffmpeg.on("progress",({progress})=>{$("progressBar").style.width=Math.round(progress*100)+"%";$("progressText").textContent=`Конвертация в MP4: ${Math.round(progress*100)}%`;});await ffmpeg.load({coreURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js","text/javascript"),wasmURL:await toBlobURL("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm","application/wasm")});const sourceBlob=await(await fetch(link.dataset.url)).blob(),inputName=sourceBlob.type.includes("mp4")?"input.mp4":"input.webm";await ffmpeg.writeFile(inputName,new Uint8Array(await sourceBlob.arrayBuffer()));await ffmpeg.exec(["-i",inputName,"-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","output.mp4"]);const out=await ffmpeg.readFile("output.mp4"),blob=new Blob([out.buffer],{type:"video/mp4"}),title=($("trackTitle").value.trim()||"NeuroCord").replace(/[\\/:*?"<>|]/g,"-");showDownload(blob,`${title}-NeuroCord.mp4`);$("progressText").textContent="Готово: MP4 создан.";setStatus("MP4 ГОТОВ");await ffmpeg.terminate();}catch(err){console.error(err);alert("Конвертация не удалась. На телефоне может не хватить памяти или CDN недоступен. WebM-файл всё ещё можно скачать.");$("progressText").textContent="Конвертация не удалась; WebM доступен для скачивания.";}finally{btn.disabled=false;btn.textContent=old;}});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall){alert("Открой меню Chrome (⋮) и выбери «Установить приложение» или «Добавить на главный экран».");return;}deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;});
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
setFormat($("format").value||"landscape");
})();
