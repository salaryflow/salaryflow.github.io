import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const inlineStart=html.lastIndexOf('<script',html.indexOf('const REFERENCE_BASELINE='));
const inlineBody=html.slice(html.indexOf('>',inlineStart)+1,html.indexOf('</script>',inlineStart));
new vm.Script('(async()=>{'+inlineBody+'})()');
const helpers=html.slice(html.indexOf('const num=('),html.indexOf('const TAX_STATES='));
const saveSource=html.slice(html.indexOf('let hidden=new Set()'),html.indexOf('const num=('));
const privacySource=html.slice(html.indexOf('const MONEY_ELEMENTS={}'),html.indexOf('function syncPaychecks(){'));
assert(helpers.includes('function cachedTodayWorkClock('),'Work clock cache missing');
assert(html.includes('todayRaw=item.clock.today(ts)'),'Live ticker must use daily cache');
assert(html.includes('const active=item.clock.active(ts)'),'Active shift must use daily cache');
assert(html.includes("window.addEventListener('pagehide'"),'Pending settings must flush on pagehide');

const ctx={};
vm.createContext(ctx);
vm.runInContext(helpers+';globalThis.clocks={elapsedWork,cachedTodayWorkClock};',ctx);
const jobs=[
 {weekdays:[1,2,3,4,5],start:'09:00',hours:8,breakMinutes:60,breakMode:'unpaid',breakStart:'12:00'},
 {weekdays:[1,2,3,4,5],start:'09:00',hours:8,breakMinutes:60,breakMode:'paid',breakStart:'12:00'},
 {weekdays:[2,3,4],start:'23:00',hours:5,breakMinutes:30,breakMode:'unpaid',breakStart:'02:00'},
 {weekdays:[0,6],start:'01:30',hours:12,breakMinutes:45,breakMode:'unpaid',breakStart:'06:00'},
 {weekdays:[0,1,2,3,4,5,6],start:'20:30',hours:24,breakMinutes:240,breakMode:'unpaid',breakStart:'23:00'}
];
let cases=0;
for(const date of [new Date(2026,10,4),new Date(2026,10,8),new Date(2026,10,1),new Date(2026,2,8),new Date(2026,10,1),new Date(2027,0,1)]){
 for(const job of jobs){
  const clock=ctx.clocks.cachedTodayWorkClock(date,job);
  const start=date.getTime()/1000;
  for(const hours of [0,1,5,9,12,17,23,23.999]){
   const to=start+hours*3600;
   const original=ctx.clocks.elapsedWork(start,to,job);
   const cached=clock.today(to);
   assert(Math.abs(original-cached)<1e-5,'Day work mismatch '+date+' '+hours+'h: '+original+' vs '+cached);
   const active=ctx.clocks.elapsedWork(to-1,to,job);
   const cachedActive=clock.active(to);
   assert(Math.abs(active-cachedActive)<1e-5,'Active shift mismatch '+date+' '+hours+'h: '+active+' vs '+cachedActive);
   cases++;
  }
 }
}
console.log('PASS: '+cases+' cached shift scenarios match full work-time calculator');

let stored=0,revisions=0,callbacks={},clockId=0;
const timers=new Map(),storage=new Map();
const storeCtx={
 KEY:'salary-flow-public-v1',config:{jobs:[{gross:90000}]},
 localStorage:{setItem:(key,value)=>{stored++;storage.set(key,value)}},
 document:{hidden:false,addEventListener:(name,fn)=>callbacks['doc:'+name]=fn},
 window:{addEventListener:(name,fn)=>callbacks['window:'+name]=fn},
 setTimeout:(fn,delay)=>{assert.equal(delay,300);const id=++clockId;timers.set(id,fn);return id},
 clearTimeout:id=>timers.delete(id)
};
vm.createContext(storeCtx);
vm.runInContext(saveSource+';globalThis.api={save,flushSave,getRevision:()=>earningsRevision};',storeCtx);
for(let i=0;i<10;i++){
 storeCtx.config.jobs[0].gross=100000+i;
 storeCtx.api.save();
}
assert.equal(stored,0,'Do not write localStorage on each keystroke');
assert.equal(storeCtx.api.getRevision(),10,'Recompute must invalidate immediately');
assert.equal(timers.size,1,'Debounce must keep one timer');
for(const fn of [...timers.values()])fn();
assert.equal(stored,1,'Save once after typing settles');
assert.equal(JSON.parse(storage.get(storeCtx.KEY)).jobs[0].gross,100009);
storeCtx.api.save();
storeCtx.config.jobs[0].gross=200000;
storeCtx.document.hidden=true;
callbacks['doc:visibilitychange']();
assert.equal(stored,2,'Hidden-tab transition must flush the latest value');
assert.equal(JSON.parse(storage.get(storeCtx.KEY)).jobs[0].gross,200000);
storeCtx.api.save();callbacks['window:pagehide']();
assert.equal(stored,3,'Navigation must flush pending settings');
console.log('PASS: 300ms debounced storage, synchronous revision, hidden/pagehide persistence');

const fields=new Map(),writes={text:0,html:0};
function element(){
 return {
  _text:'',_html:'',dataset:{},classList:{contains:()=>false,toggle(){}},
  get textContent(){return this._text;},set textContent(value){writes.text++;this._text=value;},
  get innerHTML(){return this._html;},set innerHTML(value){writes.html++;this._html=value;}
 };
}
const uiCtx={
 moneyKeys:[],hidden:new Set(),$:id=>{if(!fields.has(id))fields.set(id,element());return fields.get(id)},
 money:v=>'$'+v.toFixed(2),tr:(a)=>a,
};
vm.createContext(uiCtx);
vm.runInContext(privacySource+';globalThis.api={updateText,updateHtml,setMoney};',uiCtx);
uiCtx.api.updateText('#worked','5.00');
uiCtx.api.updateText('#worked','5.00');
uiCtx.api.updateHtml('#status','<b>On</b>');
uiCtx.api.updateHtml('#status','<b>On</b>');
uiCtx.api.setMoney('today',1);uiCtx.api.setMoney('today',1);
assert.equal(writes.text,2,'A static label and money value must each update just once');
assert.equal(writes.html,1,'Unchanged HTML must not be reassigned');
console.log('PASS: unchanged text, HTML and money skip DOM writes');
