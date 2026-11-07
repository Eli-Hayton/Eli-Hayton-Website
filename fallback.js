// A dependency-free, isometric backup view used only when the 3D library cannot load.
// The main Three.js experience in main.js takes priority whenever available.
import { profile, islands } from './data.js';

let stopFallback = null;
window.__ARCHIPELAGO_FALLBACK_DESTROY = () => { if (stopFallback) stopFallback(); };
window.__ARCHIPELAGO_FALLBACK_START = bootFallback;
setTimeout(() => {
  if (window.__ARCHIPELAGO_3D_READY) return;
  bootFallback();
}, 2600);

function bootFallback() {
  if (window.__ARCHIPELAGO_3D_READY || stopFallback) return;
  const $ = s => document.querySelector(s);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  $('#world').appendChild(canvas);
  const start = {x:-1.3,z:10.7};
  const ship = {...start, dir: -0.1};
  let destination = null, route=null, last = performance.now(), active=null;
  const keys = new Set();
  const labels = new Map();
  let frame = 0, stopped=false, zoom=1;
  let topStatus='FREE TO EXPLORE';
  let width=0,height=0,unit=16,cx=0,cy=0;
  let toastTimer;
  const icons=['⚔','◇','⚓','△','✦'];
  const colorMix=(a,b,t)=>{
    const parse=c=>[1,3,5].map(i=>parseInt(c.substring(i,i+2),16));
    const p=parse(a),q=parse(b);
    return `rgb(${p.map((c,i)=>Math.round(c*(1-t)+q[i]*t)).join(',')})`;
  };
  function project(x,y,z) {return {x:cx+(x*.86-z*.51)*unit,y:cy+(x*.30+z*.54-y*.92)*unit};}
  const rng=(seed)=>{let x=seed;return ()=>((x=(x*1664525+1013904223)>>>0)/4294967296);};
  const random=rng(84);
  const waves=Array.from({length:220},()=>({x:(random()-.5)*100,z:(random()-.5)*95,r:random(),p:random()*7}));
  function resize(){
    width=canvas.clientWidth; height=canvas.clientHeight;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    unit=Math.max(10,Math.min(width/78,height/42))*zoom;
    cx=width*.62;cy=height*.52;
  }
  function poly(points,fill,stroke){
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }
  function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
  function line(points,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
  function worldLine(points,stroke,width=1){line(points.map(p=>project(p[0],p[1],p[2])),stroke,width);}
  function prism(x,z,w,h,d,tint,y=0){
    const P=(X,Y,Z)=>project(X,Y,Z);
    const v=[P(x-w/2,y,z-d/2),P(x+w/2,y,z-d/2),P(x+w/2,y,z+d/2),P(x-w/2,y,z+d/2)];
    const t=[P(x-w/2,y+h,z-d/2),P(x+w/2,y+h,z-d/2),P(x+w/2,y+h,z+d/2),P(x-w/2,y+h,z+d/2)];
    poly([v[1],v[2],t[2],t[1]],colorMix(tint,'#062c40',.28));
    poly([v[2],v[3],t[3],t[2]],colorMix(tint,'#062c40',.13));
    poly(t,colorMix(tint,'#ffffff',.12));
  }
  function pyramid(x,z,rad,h,tint,y=0,sides=5){
    const base=Array.from({length:sides},(_,i)=>project(x+Math.cos(i*2*Math.PI/sides)*rad,y,z+Math.sin(i*2*Math.PI/sides)*rad));
    const peak=project(x,y+h,z);
    for(let i=0;i<sides;i++)poly([base[i],base[(i+1)%sides],peak],colorMix(tint, i%2?'#ffffff':'#0c3a54',i%2?.09:.18));
  }
  function tree(x,z,size=1){
    prism(x,z,.14,.85*size,.16,'#87664b',.55);
    pyramid(x,z,.7*size,1.50*size,'#4b9578',1.15*size,6);
    pyramid(x,z,.5*size,1.28*size,'#67b18b',1.90*size,6);
  }
  const detailSeeds=islands.map((i,idx)=>{
    const rand=rng(145+idx*31);
    return Array.from({length:8},()=>({a:rand()*6.283,r:2.15+rand()*1.1,s:.55+rand()*.6}));
  });
  function islandShape(x,z,r,y,offset=0){
    return Array.from({length:13},(_,k)=>{
      const angle=k/13*Math.PI*2;
      const rr=r*(.94+.06*Math.sin(k*2.6+offset));
      return project(x+Math.cos(angle)*rr,y,z+Math.sin(angle)*rr);
    });
  }
  function drawIsland(island, index) {
    const x=island.position.x,z=island.position.z;
    const shadow=project(x,-1,z);
    ellipse(shadow.x,shadow.y+7,5.7*unit,2.45*unit,'rgba(5,49,69,.18)');
    const upper=islandShape(x,z,4.8,.14,index);
    const lower=islandShape(x,z,5.0,-1.15,index);
    for(let k=0;k<upper.length;k++){
      const j=(k+1)%upper.length;
      poly([upper[k],upper[j],lower[j],lower[k]],k%2?'#77968a':'#64877e');
    }
    poly(upper,'#e1c391','#ceb28a');
    poly(islandShape(x,z,3.81,.61,index+1),index%2?'#86b99c':'#85c09c','#78ac8c');
    detailSeeds[index].forEach(t=>{
      const tx=x+Math.cos(t.a)*t.r,tz=z+Math.sin(t.a)*t.r;
      tree(tx,tz,t.s*.73);
    });
    // Each destination has a different low-poly landmark.
    if(island.id==='games'){
      prism(x,z,3.0,2.2,2.8,'#d9b19b',.55);
      for(const dx of [-1.55,1.55])for(const dz of [-1.45,1.45]){
        prism(x+dx,z+dz,.88,3.05,.88,'#c69d97',.56);
        pyramid(x+dx,z+dz,.75,1.24,'#c87f76',3.61,4);
      }
      worldLine([[x,4,z],[x,5.7,z]],'#f4e5c9',3);
      prism(x+.45,z,.85,.55,.08,'#ffb77c',5.05);
    }else if(island.id==='software'){
      prism(x,z,2.3,3.1,2.0,'#768bab',.55);
      pyramid(x,z,1.55,3.5,'#b3a7f2',3.65,5);
      pyramid(x+2,z+1.3,.9,2.4,'#d8c8ff',.7,5);
      pyramid(x-2,z+1.3,.8,2,'#949fe0',.7,5);
    }else if(island.id==='qa'){
      prism(x,z,1.75,4.15,1.7,'#f5e7cf',.55);
      prism(x,z,2.0,.55,1.9,'#eaa1a0',2.2);
      prism(x,z,2.4,.67,2.35,'#a96d70',4.25);
      pyramid(x,z,1.45,1.28,'#e38a7b',4.90,5);
      prism(x,z,1.5,.56,1.45,'#ffe3ab',4.2);
      // Chair and small pinboard make this more than just a generic QA tower.
      prism(x-2.4,z-.2,.72,1.8,.77,'#bc926e',.62);
      prism(x-2.4,z-.2,1.13,.20,1.02,'#f0d8b1',2.2);
      prism(x+2.4,z-.5,1.10,1.38,.18,'#ead5ae',.7);
    }else if(island.id==='skills'){
      pyramid(x-1,z,.0+2.25,5.25,'#8baaa4',.56,5);
      pyramid(x+1.2,z+.6,2.12,4.15,'#729a9b',.56,5);
      pyramid(x-1,z,1.00,1.40,'#eff4e7',4.45,5);
      for(let k=0;k<3;k++)prism(x+2,z+2.5,.9,.16,.7,['#d2a57c','#a2b5bd','#d8c4a7'][k],.7+k*.18);
    }else if(island.id==='certs'){
      for(const dx of [-1,1])for(const dz of [-1,1])prism(x+dx,z+dz,.18,2.5,.18,'#b48262',.6);
      prism(x,z,2.4,.28,2.35,'#e2b18a',2.5);
      prism(x,z,2.6,.18,2.6,'#eed4ae',3.84);
      pyramid(x,z,1.85,1.45,'#da9777',4,4);
      worldLine([[x+1.25,4.3,z],[x+1.25,6.3,z]],'#fbf4e2',3);
      prism(x+1.72,z,.95,.62,.08,'#e47878',5.49);
    }
    // Wooden boardwalk visible from the water.
    const dock=island.dock;
    const len=Math.hypot(dock.x-x,dock.z-z);
    for(let j=0;j<6;j++){
      const t=(3.7+j*.54)/len;
      const bx=x+(dock.x-x)*t,bz=z+(dock.z-z)*t;
      prism(bx,bz,1.2,.12,1.3,'#c79673',-.16);
    }
  }
  function drawHome(){
    const x=-4.6,z=14.7;
    const upper=islandShape(x,z,2.35,.12,1),lower=islandShape(x,z,2.5,-.65,1);
    for(let i=0;i<upper.length;i++)poly([upper[i],upper[(i+1)%upper.length],lower[(i+1)%upper.length],lower[i]],'#76948c');
    poly(upper,'#edca96');
    prism(x,z,1.2,2.0,1.2,'#f1e2ce',.15);
    pyramid(x,z,.85,.88,'#d58f7b',2.15,5);
    tree(x-1,z-.1,.7);
  }
  function drawBoat(){
    const x=ship.x,z=ship.z,dir=ship.dir;
    const v=(right,forward,y)=>{
      const rx=Math.cos(dir)*right-Math.sin(dir)*(-forward);
      const rz=Math.sin(dir)*right+Math.cos(dir)*(-forward);
      return project(x+rx,y+Math.sin(x*.37+z*.13-frame*.018)*.13+Math.sin(x*.14-z*.32+frame*.014)*.08,z+rz);
    };
    const p=[v(-.7,1,.15),v(.7,1,.15),v(.6,-.8,.15),v(0,-1.6,.15),v(-.6,-.8,.15)];
    ellipse(project(x,0,z).x,project(x,0,z).y+4,unit*1.6,unit*.46,'rgba(3,64,78,.26)');
    poly(p,'#b96e5e','#7a4b50');
    line([v(-.3,1,.33),v(-.3,-.6,.33)],'#edc693',3);
    line([v(.4,1,.33),v(.4,-.6,.33)],'#edc693',3);
    const mast=v(0,0,.34);
    const top=v(0,0,3.4);
    line([mast,top],'#805744',4);
    poly([top,v(0,0,.83),v(1.2,0,1.0)],'#fff1d8','#ffe8bd');
    poly([v(0,0,3),v(0,0,.95),v(-.87,0,1.15)],'#f2e5cf');
    poly([v(0,0,3.4),v(.7,0,3.1),v(.7,0,2.75)],'#ffa878');
  }
  function drawOcean(){
    // Painterly water: layered current lines, moving glints, and foamy shallows.
    const grad=ctx.createRadialGradient(width*.73,height*.28,20,width*.60,height*.53,Math.max(width,height)*.9);
    grad.addColorStop(0,'#419a9a');grad.addColorStop(.48,'#17687c');grad.addColorStop(1,'#092f4c');
    ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
    const time=frame*.014;
    const tide=ctx.createLinearGradient(0,0,width,height);
    tide.addColorStop(0,'rgba(161,226,202,.025)');tide.addColorStop(.5,'rgba(161,226,202,.06)');tide.addColorStop(1,'rgba(161,226,202,0)');
    ctx.fillStyle=tide;ctx.fillRect(0,0,width,height);
    for(const island of islands){
      const c=project(island.position.x,-.40,island.position.z);
      const r=unit*6.2;
      const lagoon=ctx.createRadialGradient(c.x,c.y,unit*2.0,c.x,c.y,r);
      lagoon.addColorStop(0,'rgba(123,218,188,.11)');
      lagoon.addColorStop(.65,'rgba(102,209,187,.09)');
      lagoon.addColorStop(1,'rgba(102,209,187,0)');
      ctx.save();ctx.translate(c.x,c.y);ctx.scale(1,.58);ctx.translate(-c.x,-c.y);
      ctx.fillStyle=lagoon;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const wave of waves){
      const h=Math.sin(wave.x*.37+wave.z*.13-time)*.15;
      const p=project(wave.x,-.40+h,wave.z);
      const xx=p.x+Math.sin(time*.6+wave.p)*5;
      if(xx<0||xx>width||p.y<0||p.y>height)continue;
      const length=unit*(.28+wave.r*.68);
      ctx.beginPath();
      ctx.moveTo(xx-length*.5,p.y);
      ctx.bezierCurveTo(xx-length*.13,p.y-2.5,xx+length*.13,p.y-2,xx+length*.5,p.y);
      ctx.strokeStyle=`rgba(207,246,226,${.10+wave.r*.18})`;
      ctx.lineWidth=1.25;ctx.stroke();
    }
    const w=project(ship.x,-.44,ship.z);
    const movement=route?1:(keys.size>0?.85:.06);
    for(let k=0;k<4;k++){
      ctx.save();ctx.translate(w.x,w.y+8);
      ctx.rotate(-.3);
      ctx.strokeStyle=`rgba(228,251,237,${movement*(.35-k*.07)})`;
      ctx.lineWidth=1.4;
      ctx.beginPath();ctx.ellipse(0,0,unit*(1.4+k*.6),unit*(.48+k*.18),0,.10,Math.PI-.1);ctx.stroke();ctx.restore();
    }
    const halo=ctx.createRadialGradient(width*.76,height*.08,10,width*.77,height*.08,width*.42);
    halo.addColorStop(0,'rgba(255,232,177,.11)');halo.addColorStop(1,'rgba(255,232,177,0)');
    ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
  }
  function paint(){
    if(stopped)return;
    frame++;
    ctx.clearRect(0,0,width,height);
    drawOcean();
    const ordered=[...islands.map((island,i)=>({island,i,depth:island.position.x*.30+island.position.z*.54})),{island:null,depth:-4,i:10}].sort((a,b)=>a.depth-b.depth);
    for(const o of ordered){if(o.island)drawIsland(o.island,o.i);else drawHome();}
    drawBoat();
    for(const island of islands){
      const label=labels.get(island.id);
      const p=project(island.position.x,6.8,island.position.z);
      label.style.left=`${p.x}px`;label.style.top=`${p.y}px`;
      label.classList.toggle('hidden',p.x<360&&p.y>100&&width>800 || p.x<10||p.x>width-8||p.y<90||p.y>height-50||$('#islandPanel').classList.contains('open')&&p.x>width-420);
    }
  }
  function escape(s){return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  const nav=$('#destinationList');
  $('#introText').textContent=profile.intro;
  $('#aboutNote').textContent=profile.availability;
  nav.innerHTML=islands.map((i,k)=>`<button class="destination" data-id="${i.id}"><span class="destination-num">${i.number}</span><span class="destination-icon" style="background:${i.color};font-size:17px">${icons[k]}</span><span class="destination-copy"><strong>${escape(i.name)}</strong><small>${escape(i.subtitle)}</small></span><span class="destination-arrow">↗</span></button>`).join('');
  const links=[];
  if(profile.email)links.push(`<a href="mailto:${escape(profile.email)}">Email ↗</a>`);
  if(profile.github)links.push(`<a href="${escape(profile.github)}">GitHub ↗</a>`);
  if(profile.linkedin)links.push(`<a href="${escape(profile.linkedin)}">LinkedIn ↗</a>`);
  if(profile.resume)links.push(`<a href="${escape(profile.resume)}">Résumé ↗</a>`);
  $('#contactLinks').innerHTML=links.join('');
  islands.forEach(i=>{
    const label=document.createElement('button');
    label.className='world-label';
    label.innerHTML=`<span class="island-dot" style="background:${i.color}"></span><strong>${escape(i.shortName)}</strong><span class="label-arrow">↗</span>`;
    label.setAttribute('aria-label',`Sail to ${i.name}`);
    label.addEventListener('click',()=>sail(i.id));
    $('#worldLabels').appendChild(label);labels.set(i.id,label);
  });
  const panel=$('#islandPanel');
  function clearPanel(){panel.classList.remove('open');panel.inert=true;panel.setAttribute('aria-hidden','true');}
  function showPanel(id){
    const i=islands.find(v=>v.id===id);if(!i)return;
    active=id;
    $('#panelNumeral').textContent=`ISLAND ${i.number} / 05`;
    $('#panelTag').textContent=i.tag;
    $('#panelTitle').textContent=i.name;
    $('#panelSubtitle').textContent=i.subtitle;
    $('#panelSummary').textContent=i.summary;
    $('#itemCount').textContent=`0${i.items.length}`;
    $('#projectList').innerHTML=i.items.map((p,n)=>`<article class="project-card ${n===0?'open':''}"><button class="project-trigger" aria-expanded="${n===0}"><span><strong>${escape(p.title)}</strong><small>${escape(p.type)}</small></span><span class="accordion-icon">+</span></button><div class="project-preview"><p>${escape(p.description)}</p><div class="chip-row">${p.chips.map(c=>`<span class="chip">${escape(c)}</span>`).join('')}</div><div class="project-more">${escape(p.detail||'')}${p.url?`<a class="project-url" href="${escape(p.url)}" target="_blank">View project ↗</a>`:''}</div></div></article>`).join('');
    $('#projectList').querySelectorAll('.project-trigger').forEach(b=>b.addEventListener('click',()=>{const open=b.closest('.project-card').classList.toggle('open');b.setAttribute('aria-expanded',String(open));}));
    $('#nextIsland').dataset.next=islands[(islands.indexOf(i)+1)%islands.length].id;
    $('#nextIslandName').textContent=islands[(islands.indexOf(i)+1)%islands.length].name;
    panel.classList.add('open');panel.inert=false;panel.setAttribute('aria-hidden','false');panel.querySelector('.panel-scroll').scrollTop=0;
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
  }
  function toast(msg){clearTimeout(toastTimer);$('#toast').textContent=msg;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2100);}
  function sail(id){
    const i=islands.find(i=>i.id===id);if(!i)return;
    clearPanel();closeAbout();destination=id;
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
    route={a:{...ship},b:{...i.dock},t:0,duration:2.5};
    topStatus=`SAILING TO ${i.shortName.toUpperCase()}`;
    $('#seaStatus').textContent=topStatus;
    toast(`Setting sail to ${i.name} ⛵`);
  }
  function reset(){route=null;destination=null;active=null;clearPanel();$('#seaStatus').textContent='FREE TO EXPLORE';nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));}
  function openAbout(){reset();$('#aboutOverlay').inert=false;$('#aboutOverlay').setAttribute('aria-hidden','false');$('#aboutOverlay').classList.add('open');}
  function closeAbout(){$('#aboutOverlay').classList.remove('open');$('#aboutOverlay').inert=true;$('#aboutOverlay').setAttribute('aria-hidden','true');}
  function step(now){
    if(stopped)return;
    const dt=Math.min((now-last)/1000,.06);last=now;
    if(route){
      route.t=Math.min(1,route.t+dt/route.duration);
      const t=route.t*route.t*(3-2*route.t);
      ship.x=route.a.x+(route.b.x-route.a.x)*t;
      ship.z=route.a.z+(route.b.z-route.a.z)*t;
      ship.dir=Math.atan2(-(route.b.x-route.a.x),-(route.b.z-route.a.z));
      if(route.t>=1){const ended=destination;route=null;if(ended){showPanel(ended);$('#seaStatus').textContent='NOW DOCKED';}else $('#seaStatus').textContent='FREE TO EXPLORE';}
    }else{
      const throttle=(keys.has('w')||keys.has('arrowup')||keys.has('forward')?1:0)-(keys.has('s')||keys.has('arrowdown')||keys.has('back')?.65:0);
      if(keys.has('a')||keys.has('arrowleft')||keys.has('left'))ship.dir+=dt*1.5;
      if(keys.has('d')||keys.has('arrowright')||keys.has('right'))ship.dir-=dt*1.5;
      const dx=-Math.sin(ship.dir)*throttle*5.4*dt,dz=-Math.cos(ship.dir)*throttle*5.4*dt;
      if(Math.abs(ship.x+dx)<45&&Math.abs(ship.z+dz)<45&&!islands.some(i=>Math.hypot(i.position.x-ship.x-dx,i.position.z-ship.z-dz)<3.2)){
        ship.x+=dx;ship.z+=dz;
      }
    }
    paint();requestAnimationFrame(step);
  }
  const listeners=[];
  function on(el,type,fn,opts){el.addEventListener(type,fn,opts);listeners.push([el,type,fn,opts]);}
  on(window,'resize',resize);
  on(nav,'click',e=>{const b=e.target.closest('button[data-id]');if(b)sail(b.dataset.id);});
  on($('#nextIsland'),'click',e=>sail(e.currentTarget.dataset.next));
  on($('#closePanel'),'click',clearPanel);
  on($('#aboutButton'),'click',openAbout);
  on($('#aboutClose'),'click',closeAbout);
  on($('#aboutDismiss'),'click',closeAbout);
  on($('#aboutBackdrop'),'click',closeAbout);
  on($('#homeButton'),'click',()=>{reset();closeAbout();route={a:{...ship},b:{...start},t:0,duration:2};toast('Heading back to starting harbor');});
  on($('#zoomIn'),'click',()=>{zoom=Math.min(1.5,zoom+.13);resize();});
  on($('#zoomOut'),'click',()=>{zoom=Math.max(.72,zoom-.13);resize();});
  on($('#resetCamera'),'click',()=>{zoom=1;resize();reset();});
  on(canvas,'click',e=>{
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const ranked=islands.map(i=>({id:i.id,dist:Math.hypot(project(i.position.x,3,i.position.z).x-x,project(i.position.x,3,i.position.z).y-y)})).sort((a,b)=>a.dist-b.dist);
    if(ranked[0].dist<115)sail(ranked[0].id);
  });
  on(window,'keydown',e=>{
    const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
    if(k==='escape'){clearPanel();closeAbout();}
    if(k>='1'&&k<='5')sail(islands[+k-1].id);
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){if(route)reset();keys.add(k);}
  });
  on(window,'keyup',e=>keys.delete(e.key.toLowerCase()));
  on(window,'blur',()=>keys.clear());
  document.querySelectorAll('.touch-key').forEach(b=>{
    on(b,'pointerdown',e=>{e.preventDefault();if(route)reset();keys.add(b.dataset.steer);b.setPointerCapture(e.pointerId);});
    on(b,'pointerup',()=>keys.delete(b.dataset.steer));
    on(b,'pointercancel',()=>keys.delete(b.dataset.steer));
  });
  resize();last=performance.now();requestAnimationFrame(step);
  $('#loadingCover').classList.add('loaded');
  toast('You are in lightweight map mode · connect to the internet for full 3D');
  stopFallback=()=>{
    stopped=true;
    listeners.forEach(([el,type,fn,opts])=>el.removeEventListener(type,fn,opts));
    labels.forEach(label=>label.remove());
    canvas.remove();
    nav.innerHTML='';
    reset();
    stopFallback=null;
  };
}
