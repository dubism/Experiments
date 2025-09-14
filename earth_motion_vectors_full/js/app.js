// Earth Motion Vectors — Lean Static App
const D2R = Math.PI/180, R2D = 180/Math.PI, TAU = Math.PI*2;
function normRad(a){a%=TAU; return a<0?a+TAU:a}
function jdFromMs(ms){return ms/86400000 + 2440587.5}
function nowTimes(){const d=new Date(), ms=d.getTime(); return { d, ms, jdUTC: jdFromMs(ms), jdTT: jdFromMs(ms+69000) };}
function obliquity(jdTT){const T=(jdTT-2451545)/36525; const e=84381.406-46.836769*T-0.0001831*T*T+0.00200340*T*T*T; return (e/3600)*D2R;}
function sunEcliptic(jdTT){
  const T=(jdTT-2451545)/36525;
  const L0=(280.46646+36000.76983*T+0.0003032*T*T)*D2R;
  const M =(357.52911+35999.05029*T-0.0001537*T*T)*D2R;
  const Cdeg=(1.914602-0.004817*T-0.000014*T*T)*Math.sin(M)
            +(0.019993-0.000101*T)*Math.sin(2*M)
            +0.000289*Math.sin(3*M);
  return normRad(L0 + Cdeg*D2R);
}
function eraFromJDUTC(jdUTC){const d=jdUTC-2451545.0; let f=0.7790572732640+1.00273781191135448*d; f=f-Math.floor(f); return TAU*(f<0?f+1:f);}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,c,-s,0,s,c]}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1]}
function mul3(A,B){return[
A[0]*B[0]+A[1]*B[3]+A[2]*B[6], A[0]*B[1]+A[1]*B[4]+A[2]*B[7], A[0]*B[2]+A[1]*B[5]+A[2]*B[8],
A[3]*B[0]+A[4]*B[3]+A[5]*B[6], A[3]*B[1]+A[4]*B[4]+A[5]*B[7], A[3]*B[2]+A[4]*B[5]+A[5]*B[8],
A[6]*B[0]+A[7]*B[3]+A[8]*B[6], A[6]*B[1]+A[7]*B[4]+A[8]*B[7], A[6]*B[2]+A[7]*B[5]+A[8]*B[8]
]}
function tr3(M){return[M[0],M[3],M[6],M[1],M[4],M[7],M[2],M[5],M[8]]}
function apply3(M,v){return[ M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2] ]}
function sphToCart(lon, lat){const cl=Math.cos(lon),sl=Math.sin(lon),cb=Math.cos(lat),sb=Math.sin(lat);return[cb*cl,cb*sl,sb]}
function enuAltAz(v){const [E,N,U]=v, L=Math.hypot(E,N,U)||1, alt=Math.asin(U/L), az=Math.atan2(E,N); return {alt,az}}
function fmtDeg(x){return x.toFixed(3)+'°'}
function fmtAA(alt,az){return `${(alt*R2D).toFixed(2)}°, ${((az*R2D+360)%360).toFixed(2)}°`}

const R_ECI_from_GAL=[-0.0548755604,-0.8734370902,-0.4838350155, 0.4941094279,-0.4448296300,0.7469822445, -0.8676661490,-0.1980763734,0.4559837762];

const state={ lat:null, lon:null, h:0, headingAcc:NaN, yawBias: parseFloat(localStorage.getItem('yawBias')||'0'), trueNorth:true };

// Permission overlay logic
const overlay = document.getElementById('permOverlay');
const enableMotionBtn = document.getElementById('enableMotion');
const enableGeoBtn = document.getElementById('enableGeo');
enableMotionBtn?.addEventListener('click', async()=>{
  try{
    // iOS Safari requires this explicit permission flow
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function'){
      const r1 = await DeviceMotionEvent.requestPermission();
    }
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function'){
      const r2 = await DeviceOrientationEvent.requestPermission();
    }
    hideOverlayIfReady();
  }catch(e){ alert('Motion permission error: '+e); }
});
enableGeoBtn?.addEventListener('click', ()=>{
  navigator.geolocation.getCurrentPosition(()=>{ hideOverlayIfReady(); }, (e)=>alert('Location error: '+e.message), {enableHighAccuracy:true, timeout:10000, maximumAge:2000});
});

function hideOverlayIfReady(){
  // We keep overlay until at least geolocation is granted or motion requested; relax rule for dev
  overlay?.classList.add('hidden');
}

// Sensors (lean stubs; we only surface accuracy for HUD). Real yaw/AR not required for dome rendering.
if ('AbsoluteOrientationSensor' in window){
  try{ const s=new AbsoluteOrientationSensor({frequency:30, referenceFrame:'screen'});
    s.addEventListener('reading',()=>{ state.headingAcc=5; });
    s.start();
  }catch(e){ console.warn('AbsOrient failed', e); }
}
window.addEventListener('deviceorientation', e=>{ state.headingAcc = e.absolute?6:10; }, {passive:true});

// Geolocation (prompts the user)
navigator.geolocation.getCurrentPosition(pos=>{
  state.lat=pos.coords.latitude; state.lon=pos.coords.longitude; state.h=pos.coords.altitude||0;
  document.getElementById('coord').textContent = `${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`;
}, err=> console.warn(err), {enableHighAccuracy:true, timeout:10000, maximumAge:2000});

// Frames
function makeFrames(lat, lon, jdUTC, eps){
  const R_en2ef = mul3( rotZ(lon*D2R), rotX((90-lat)*D2R) ); // ENU->ECEF
  const R_ef2ec = rotZ(eraFromJDUTC(jdUTC));                 // ECEF->ECI
  const R_ec2en = tr3( mul3(R_ef2ec, R_en2ef) );             // ECI->ENU
  const R_ecl2ec= rotX(eps);                                 // ECI<-ECL
  const toENU = v => apply3(R_ec2en, v);

  const vSpin_ECI=[0,0,1];
  function vOrbit_ECI(lam){ const t=lam+Math.PI/2; const v_ecl=[Math.cos(t),Math.sin(t),0]; return apply3(R_ecl2ec, v_ecl); }
  const vLSR_ECI  = apply3(R_ECI_from_GAL, [0,1,0]);
  const vApex_ECI = apply3(R_ECI_from_GAL, sphToCart(57*D2R, 23*D2R));

  function sunVecENU(lam){ const s_ecl=[Math.cos(lam),Math.sin(lam),0]; const s_eci=apply3(R_ecl2ec,s_ecl); return toENU(s_eci); }

  return { toENU, vSpin_ECI, vOrbit_ECI, vLSR_ECI, vApex_ECI, sunVecENU };
}

// Rendering
const canvas=document.getElementById('sky'); const ctx=canvas.getContext('2d');
function resize(){
  const dpr=window.devicePixelRatio||1;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener('resize', resize, {passive:true}); resize();

function drawDome(){
  const w=canvas.width/(window.devicePixelRatio||1), h=canvas.height/(window.devicePixelRatio||1);
  const r=Math.min(w,h)*0.42, cx=w/2, cy=h*0.55;
  ctx.clearRect(0,0,w,h);
  ctx.save(); ctx.translate(cx,cy);
  // Horizon
  ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.strokeStyle='#8ca1bb'; ctx.lineWidth=1.2; ctx.stroke();
  // Alt rings
  for(let alt=15;alt<=75;alt+=15){ const rr=r*Math.cos(alt*D2R); ctx.beginPath(); ctx.arc(0,0,rr,0,TAU); ctx.strokeStyle='#2a3948'; ctx.lineWidth=1; ctx.stroke(); }
  // Cardinals
  ctx.font='12px system-ui';
  const tick=(deg,label)=>{ const a=deg*D2R; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*Math.sin(a), -r*Math.cos(a)); ctx.strokeStyle='#203040'; ctx.stroke();
    ctx.fillStyle='#c0cada'; ctx.fillText(label, r*Math.sin(a)*1.03-6, -r*Math.cos(a)*1.03+4); };
  tick(0,'N'); tick(90,'E'); tick(180,'S'); tick(270,'W');
  ctx.restore();
  return {w,h,r,cx,cy};
}
function enuToScreen(vENU, geom){
  const {alt,az}=enuAltAz(vENU); if (alt < -5*D2R) return null;
  const rho = geom.r*Math.cos(Math.PI/2 - alt);
  const x = geom.cx + rho*Math.sin(az);
  const y = geom.cy - rho*Math.cos(az);
  return {x,y,alt,az};
}
function drawVector(vENU, color, geom){
  const p = enuToScreen(vENU, geom); if (!p) return;
  ctx.beginPath(); ctx.moveTo(geom.cx,geom.cy); ctx.lineTo(p.x,p.y);
  ctx.lineWidth=2; ctx.strokeStyle=color; ctx.stroke();
  const ang=Math.atan2(p.y-geom.cy, p.x-geom.cx), ah=10, aw=5;
  ctx.beginPath();
  ctx.moveTo(p.x,p.y);
  ctx.lineTo(p.x - ah*Math.cos(ang) + aw*Math.sin(ang), p.y - ah*Math.sin(ang) - aw*Math.cos(ang));
  ctx.lineTo(p.x - ah*Math.cos(ang) - aw*Math.sin(ang), p.y - ah*Math.sin(ang) + aw*Math.cos(ang));
  ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  return p;
}

// HUD interactions
document.getElementById('trueNorth').addEventListener('change', e=>{ state.trueNorth=e.target.checked; });
document.getElementById('sunLock').addEventListener('click', ()=>{
  if (state.lat==null || state.lon==null){ alert('Need location first.'); return; }
  const t=nowTimes(), lam=sunEcliptic(t.jdTT), eps=obliquity(t.jdTT);
  const F=makeFrames(state.lat, state.lon, t.jdUTC, eps);
  const sENU=F.sunVecENU(lam); const sunAz=Math.atan2(sENU[0], sENU[1]);
  const deviceAz=0; // placeholder unless wiring real yaw
  const bias=normRad(sunAz-deviceAz); state.yawBias=bias; localStorage.setItem('yawBias', String(bias));
  toast('Sun-lock stored');
});

document.body.addEventListener('click', (ev)=>{
  const t=ev.target;
  if (t.tagName==='BUTTON' || t.tagName==='INPUT' || t.closest('#hudLayer') || t.closest('#permOverlay')) return;
  document.body.classList.toggle('hide-hud');
  document.getElementById('hint').style.display='none';
}, {passive:true});

function toast(msg){
  const el=document.createElement('div');
  el.textContent=msg;
  el.style.cssText='position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#132034ee;color:#dfe9f7;border:1px solid #25405a;border-radius:12px;padding:8px 12px;z-index:30';
  document.body.appendChild(el); setTimeout(()=>el.remove(), 1400);
}

// Main loop
function loop(){
  const t=nowTimes(); const eps=obliquity(t.jdTT); const lam=sunEcliptic(t.jdTT); const theta=eraFromJDUTC(t.jdUTC);
  document.getElementById('utc').textContent = t.d.toISOString().replace('T',' ').replace('Z',' UTC');
  document.getElementById('jdU').textContent = t.jdUTC.toFixed(6);
  document.getElementById('jdT').textContent = t.jdTT.toFixed(6);
  document.getElementById('era').textContent = (theta*R2D).toFixed(3)+'°';
  document.getElementById('eps').textContent = (eps*R2D).toFixed(3)+'°';
  document.getElementById('lam').textContent = (lam*R2D).toFixed(3)+'°';
  document.getElementById('acc').textContent = isFinite(state.headingAcc)? `±${state.headingAcc.toFixed(1)}°` : '—';

  if (state.lat!=null && state.lon!=null){
    document.getElementById('coord').textContent = `${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`;
    const F=makeFrames(state.lat, state.lon, t.jdUTC, eps);
    const vSpin_ENU=F.toENU(F.vSpin_ECI);
    const vOrbit_ENU=F.toENU(F.vOrbit_ECI(lam));
    const vLSR_ENU=F.toENU(F.vLSR_ECI);
    const vApex_ENU=F.toENU(F.vApex_ECI);
    const geom = drawDome();
    drawVector(vSpin_ENU , getCSS('--spin')  || '#4cd3ff', geom);
    drawVector(vOrbit_ENU, getCSS('--orbit') || '#ffbf3a', geom);
    drawVector(vLSR_ENU  , getCSS('--lsr')   || '#b18bff', geom);
    drawVector(vApex_ENU , getCSS('--apex')  || '#ff69b4', geom);
    // HUD vector readouts
    const sA=enuAltAz(vSpin_ENU), oA=enuAltAz(vOrbit_ENU), lA=enuAltAz(vLSR_ENU), aA=enuAltAz(vApex_ENU);
    document.getElementById('spinAA').textContent=fmtAA(sA.alt,sA.az);
    document.getElementById('orbAA').textContent =fmtAA(oA.alt,oA.az);
    document.getElementById('lsrAA').textContent =fmtAA(lA.alt,lA.az);
    document.getElementById('apxAA').textContent =fmtAA(aA.alt,aA.az);
  } else {
    drawDome();
  }
  requestAnimationFrame(loop);
}
function getCSS(varName){return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();}
loop();

// PWA (optional, cache core assets)
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
