const {chromium}=require('playwright');
const R=300, INK='#0E1013', W='#FFFFFF', O='#FF5A1F';
const t=(s,x,y,size,fill)=>`<text x="${x}" y="${y}" font-family="JBM" font-weight="700" font-size="${size}" letter-spacing="${-0.04*size}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
// (1) half: left half-ring is the frame, right half is the block
function half({split=318,B=26,size=150,dy=-8}){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <clipPath id="c"><circle cx="300" cy="300" r="300"/></clipPath><g clip-path="url(#c)">
  <rect width="600" height="600" fill="${INK}"/>
  <rect x="${split}" width="${600-split}" height="600" fill="${O}"/>
  <path d="M${split} 0 H0 V600 H${split}" fill="none"/>
  <clipPath id="l"><rect width="${split}" height="600"/></clipPath>
  <circle cx="300" cy="300" r="${R-B/2}" fill="none" stroke="${W}" stroke-width="${B}" clip-path="url(#l)"/>
  ${t('eth',(B+split)/2+6,300+dy,size,W)}${t('lo',(split+600)/2-8,300+dy,size,INK)}
  </g></svg>`;}
// (2) band: C1 as a horizontal band across the circle; the circle closes the frame (arc) and the block
function band({h=250,split=330,B=20,size=165,arc=true,dy=-6,ex=14,lx=-14}){
  const y0=300-h/2,y1=300+h/2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <clipPath id="c"><circle cx="300" cy="300" r="300"/></clipPath><clipPath id="b"><rect width="${split}" y="${y0}" height="${h}"/></clipPath><g clip-path="url(#c)">
  <rect width="600" height="600" fill="${INK}"/>
  <rect x="${split}" y="${y0}" width="${600-split}" height="${h}" fill="${O}"/>
  <rect x="0" y="${y0}" width="${split}" height="${B}" fill="${W}"/><rect x="0" y="${y1-B}" width="${split}" height="${B}" fill="${W}"/>
  ${arc?`<circle cx="300" cy="300" r="${R-B/2}" fill="none" stroke="${W}" stroke-width="${B}" clip-path="url(#b)"/>`:''}
  ${t('eth',split/2+ex,300+dy,size,W)}${t('lo',(split+600)/2+lx,300+dy,size,INK)}
  </g></svg>`;}
const A={now:band({arc:false}), b320:band({arc:false,h:320,size:192,B:24,split:336}), b320a:band({arc:false,h:320,size:182,B:24,split:338,ex:4,lx:-2}), b320b:band({arc:false,h:310,size:176,B:22,split:340,ex:0,lx:0})};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:600,height:600}});
await p.goto('file://'+__dirname+'/blank.html');
for(const [k,svg] of Object.entries(A)){await p.setContent(`<style>@font-face{font-family:JBM;src:url(JetBrainsMono.ttf);font-weight:100 800}html,body{margin:0;background:transparent}</style>`+svg,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(100);await p.screenshot({path:`av-${k}.png`,omitBackground:true});}
const names=Object.keys(A);
const cell=n=>`<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:300px"><img src="av-${n}.png" style="width:260px;height:260px;border-radius:50%;box-shadow:0 0 0 1px #30363d"><div style="display:flex;gap:16px;align-items:center"><img src="av-${n}.png" style="width:40px;border-radius:50%;box-shadow:0 0 0 1px #30363d"><img src="av-${n}.png" style="width:20px;border-radius:50%;box-shadow:0 0 0 1px #30363d"></div><div style="color:#8b949e;font:600 18px sans-serif">${n}</div></div>`;
await p.setViewportSize({width:1260,height:400});await p.goto('file://'+__dirname+'/blank.html');
await p.setContent(`<body style="margin:0;background:#0d1117;padding:30px;display:flex">${names.map(cell).join('')}</body>`,{waitUntil:'load'});await p.waitForTimeout(300);await p.screenshot({path:'mock5.png'});
await p.setContent(`<body style="margin:0;background:#ffffff;padding:30px;display:flex">${names.map(cell).join('')}</body>`,{waitUntil:'load'});await p.waitForTimeout(300);await p.screenshot({path:'mock5-light.png'});await b.close()})()
