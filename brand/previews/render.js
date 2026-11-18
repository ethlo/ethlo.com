const {chromium}=require('playwright');const repos=require('./repos.json');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:640}});
await p.goto('file://'+__dirname+'/card.html');await p.evaluate(()=>document.fonts.ready);
for(const [name,desc,stack] of repos){
 await p.evaluate(([name,desc,stack])=>{document.querySelector('h1').textContent=name;document.querySelector('p').textContent=desc;
  document.querySelector('.stack').textContent=stack;document.querySelector('.url').textContent='github.com/ethlo/'+name;
  const h=document.querySelector('h1');let s=132;h.style.fontSize=s+'px';while(h.scrollWidth>1060&&s>60){s-=2;h.style.fontSize=s+'px'}
  const pb=document.querySelector('p').getBoundingClientRect().bottom, sb=document.querySelector('.stack').getBoundingClientRect().top; if(pb>sb-24) throw new Error(name+' overflows');
 },[name,desc,stack]);
 await p.waitForTimeout(50);await p.screenshot({path:'out-'+name+'.png'});}
await b.close()})()
