import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const helpers=html.slice(html.indexOf('const num=('),html.indexOf('const TAX_STATES='));
const render=html.slice(html.indexOf('// Cache calendar-period'),html.indexOf("\ndocument.querySelectorAll('[data-hide]')"));
assert(helpers.includes('function elapsedWork(')&&render.includes('function render(){'));
assert(render.includes('snapshot.weekBase+periodEarned'),'Period totals must retain overnight work');
assert(render.includes('const staticChanged=staticKey!==lastStaticKey'),'Static content must not refresh each tick');
assert(html.includes("document.addEventListener('visibilitychange',resumeTicker)"),'Hidden tab must pause ticker');
assert(!html.includes('setInterval(render,200);document.addEventListener'),'Old unconditional ticker must be removed');

const jobs=[
 {id:'day',name:'Day',weekdays:[1,2,3,4,5],start:'09:00',hours:8,breakMinutes:60,breakMode:'unpaid',breakStart:'12:00',rate:.013},
 {id:'night',name:'Night',weekdays:[2],start:'23:00',hours:3,breakMinutes:0,breakMode:'unpaid',rate:.02}
];
let nowMs=0,staticCalls=0;
class TestDate extends Date{
 constructor(...args){super(...(args.length?args:[nowMs]))}
 static now(){return nowMs}
}
const values=new Map(),nodes=new Map();
const $=selector=>{
 if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',style:{},classList:{toggle(){},contains(){return false}},dataset:{}});
 return nodes.get(selector);
};
const context={
 Date:TestDate,config:{jobs,mode:'gross'},lang:'ko',globalFx:{currency:'USD',rate:1,error:false},
 activeCurrency:'USD',fxRate:1,fxPending:false,earningsRevision:0,REFERENCE_DATA:{years:{tax:2026}},
 $,
 yearlyRate:j=>j.rate,
 career:(j,now)=>context.calcElapsed(new TestDate(2026,0,1).getTime()/1000,now.getTime()/1000,j)*j.rate,
 hireTime:j=>new TestDate(2026,0,1).getTime(),
 renderRankings:()=>staticCalls++,renderCountryRank:()=>staticCalls++,displayTax:()=>staticCalls++,syncPaychecks:()=>staticCalls++,
 drawJobs:()=>{},
 syncCustomSelects:()=>{},
 setMoney:(k,v)=>values.set(k,v),applyPrivacy:()=>{},updateText:(k,v)=>{if($(k).textContent!==v)$(k).textContent=v},updateHtml:(k,v)=>{if($(k).innerHTML!==v)$(k).innerHTML=v},escaped:x=>x,
 tr:(ko,en)=>context.lang==='en'?en:ko,
};
vm.createContext(context);
vm.runInContext(helpers+'\n'+render+'\nglobalThis.tick=render;globalThis.calcElapsed=elapsedWork;globalThis.bump=()=>earningsRevision++;',context);

function verify(when){
 nowMs=new TestDate(...when).getTime();
 context.tick();
 const now=new TestDate(),ts=nowMs/1000,day=new TestDate(now.getFullYear(),now.getMonth(),now.getDate());
 const dayS=day.getTime()/1000,monday=new TestDate(day);monday.setDate(monday.getDate()-(now.getDay()+6)%7);
 const periods={week:monday.getTime()/1000,month:new TestDate(now.getFullYear(),now.getMonth(),1).getTime()/1000,year:new TestDate(now.getFullYear(),0,1).getTime()/1000};
 let today=0,target=0,lifetime=0;
 for(const job of context.config.jobs){
  const tgt=job.weekdays.includes(now.getDay())?(job.hours+(job.breakMode==='paid'?job.breakMinutes/60:0))*3600:0;
  today+=Math.min(tgt,context.calcElapsed(dayS,ts,job))*job.rate;
  target+=tgt*job.rate;
  lifetime+=context.career(job,now);
 }
 const tolerance=1e-5;
 for(const [key,expected] of Object.entries({today,target,lifetime,
  week:context.config.jobs.reduce((sum,j)=>sum+context.calcElapsed(periods.week,ts,j)*j.rate,0),
  month:context.config.jobs.reduce((sum,j)=>sum+context.calcElapsed(periods.month,ts,j)*j.rate,0),
  year:context.config.jobs.reduce((sum,j)=>sum+context.calcElapsed(periods.year,ts,j)*j.rate,0)})){
  const allowed=key==='today'||key==='target'?tolerance:context.config.jobs.reduce((sum,j)=>sum+j.rate,0)+tolerance;
  assert(Math.abs(values.get(key)-expected)<allowed,key+' mismatch at '+now.toISOString()+' '+values.get(key)+' vs '+expected);
 }
}
verify([2026,10,4,9,15,0]);
const first=staticCalls;
verify([2026,10,4,9,15,0,200]);
assert.equal(staticCalls,first,'Static calculations must not rerun on 200ms tick');
verify([2026,10,4,12,30,0]); // Unpaid break
verify([2026,10,4,18,0,0]); // Past day shift
verify([2026,10,4,0,15,0]); // Previous-night shift crossing midnight
context.bump();
verify([2026,10,4,0,15,0]);
assert(staticCalls>first,'Settings changes must refresh static calculations');
verify([2026,10,5,9,45,0]); // Rollover to next day
verify([2026,11,1,9,45,0]); // Month rollover
verify([2027,0,1,9,45,0]); // Year rollover
context.config.jobs[0].hours=4;context.bump();
verify([2027,0,1,10,0,0]);
console.log('PASS: cached money matches original for day/overnight/break/month/year/settings; 200ms avoids static work');
