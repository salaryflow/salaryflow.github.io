import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf("box.querySelectorAll('[data-ot]').forEach(input=>{");
const end=html.indexOf("box.querySelectorAll('[data-day]')",start);
assert(start>0&&end>start,'Missing overtime input event handlers');
const source=html.slice(start,end);
const values={
 enabled:'off',
 startTime:'18:00',
 hours:'2',
 multiplier:'1.5',
 custom:'1.5'
};
const inputs={};
for(const [key,value] of Object.entries(values)){
 inputs[key]={
  dataset:{ot:key},value,disabled:key!=='enabled',
  callbacks:{},
  addEventListener(name,fn){this.callbacks[name]=fn}
 };
}
inputs.enabled.checked=false;
inputs.enabled.setAttribute=(name,value)=>{inputs.enabled.ariaChecked=String(value)};
const details={hidden:true},state={textContent:'OFF'};
const box={
 querySelectorAll(selector){assert.equal(selector,'[data-ot]');return Object.values(inputs)},
 querySelector(selector){
  if(selector==='[data-ot-details]')return details;
  if(selector==='[data-ot-state]')return state;
  const match=selector.match(/\[data-ot="([^"]+)"\]/);
  assert(match,'Bad selector '+selector);
  return inputs[match[1]];
 }
};
const job={overtimeRecords:{}};
let saves=0,renders=0;
const ctx={
 box,j:job,save:()=>saves++,render:()=>renders++,
 overtimeDate:()=> '2026-11-04',todaysOvertime:()=>({enabled:false,hours:0,multiplier:1.5}),syncCustomSelect:()=>{},
 overtimeMultiplier:r=>Number.isFinite(Number(r?.multiplier))?Math.max(0,Math.min(10,Number(r.multiplier))):1.5
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const invoke=(name,event,value)=>{
 if(name==='enabled'&&value!==undefined)inputs[name].checked=value==='on';
 else if(value!==undefined)inputs[name].value=value;
 const fn=inputs[name].callbacks[event];
 assert.equal(typeof fn,'function',name+' '+event+' listener absent');
 fn();
};
invoke('enabled','change','on');
assert.equal(inputs.custom.disabled,false,'Custom multiplier must unlock whenever OT is ON');
assert.equal(details.hidden,false,'ON must reveal overtime detail fields');
assert.equal(state.textContent,'ON');
assert.equal(inputs.enabled.ariaChecked,'true');
assert.equal(inputs.startTime.disabled,false,'Overtime start must unlock when enabled');
assert.equal(job.overtimeRecords['2026-11-04'].startTime,'18:00');
invoke('custom','input','2.75');
assert.equal(inputs.multiplier.value,'custom','Unlisted custom multiplier selects Custom option');
assert.equal(job.overtimeRecords['2026-11-04'].multiplier,2.75);
invoke('custom','input','2');
assert.equal(inputs.multiplier.value,'2','Entering a standard rate auto-selects that preset');
invoke('custom','input','1.5');
assert.equal(inputs.multiplier.value,'1.5');
invoke('multiplier','change','0');
assert.equal(inputs.custom.value,0,'Dropdown change synchronizes freeform input to 0');
invoke('multiplier','change','2');
assert.equal(inputs.custom.value,2,'Dropdown change synchronizes freeform input to 2');
assert.equal(inputs.custom.disabled,false,'Custom remains editable after selecting a preset');
invoke('multiplier','change','custom');
assert.equal(inputs.custom.value,2.5,'Custom dropdown picks explicit non-preset rate');
invoke('startTime','change','19:45');
assert.equal(job.overtimeRecords['2026-11-04'].startTime,'19:45','Entered clock time persists');
invoke('enabled','change','off');
assert.equal(inputs.custom.disabled,true,'Turning OT off disables OT controls');
assert.equal(details.hidden,true,'OFF must conceal overtime detail fields');
assert.equal(state.textContent,'OFF');
assert.equal(inputs.enabled.ariaChecked,'false');
assert.equal(inputs.startTime.disabled,true);
assert.equal(job.overtimeRecords['2026-11-04'].startTime,'19:45','Disabling OT retains time for later same-day reuse');
assert(saves>=8&&renders>=8,'Changed settings should save and refresh immediately');
console.log('PASS: start-time entry, dropdown/custom multiplier two-way sync and enable/disable controls');
