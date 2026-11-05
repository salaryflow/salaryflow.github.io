import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const script=html.slice(html.indexOf('<script>',html.indexOf('</style>'))+8,html.lastIndexOf('</script>'));
assert.doesNotThrow(()=>new vm.Script(script),'Entire inline SalaryFlow script must parse');

const begin=script.indexOf('let activeSelectMenu=null');
const end=script.indexOf('// Generated from active data/manifest.json.',begin);
assert(begin>0&&end>begin,'Custom dropdown controller missing');
const source=script.slice(begin,end);
assert(source.includes("select.dispatchEvent(new Event('change',{bubbles:true}))"),'Dropdown must preserve native change events');
assert(source.includes("document.addEventListener('pointerdown'"),'Outside-click dismissal required');
assert(source.includes("document.addEventListener('keydown'"),'Keyboard navigation required');
assert(source.includes("event.key==='Escape'"),'Escape dismissal required');
assert(source.includes("event.key==='ArrowDown'"),'Arrow navigation required');
assert(source.includes("event.key==='Home'"),'Home/End navigation required');
assert(source.includes("event.key==='Enter'"),'Enter selection required');
assert(source.includes('trigger.setAttribute(\'aria-expanded\',\'true\')'),'Expanded ARIA state required');
assert(source.includes("menu.setAttribute('role','listbox')"),'Accessible listbox role required');
assert(source.includes("button.setAttribute('role','option')"),'Accessible options required');
assert(html.includes("closeCustomSelect();const el=$('#jobs')"),'Close stale dropdown when jobs rebuild');
assert(html.includes('translateTree(el);enhanceSelects(el);'),'Enhance dynamic job selects after localization');
assert(html.includes('drawJobs();enhanceSelects(document);refreshLanguage()'),'Enhance global selects');
assert(html.includes('syncCustomSelect(chosen);'),'Custom overtime multiplier must sync both presentations');
assert(html.includes('  syncCustomSelects();'),'Programmatic select changes must sync when static inputs refresh');
assert(html.includes('.sf-select-menu{position:fixed;z-index:10000;'),'Popup must escape clipped cards');
assert(html.includes('.sf-native-select{position:absolute!important'),'Native select popup must not show');

const callbacks={};
const listeners={};
class E{
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.attributes=new Map();this.dataset={};this.style={};
  this.classList={add:()=>{},toggle:()=>{},contains:()=>false};
  this.textContent='';this.disabled=false;this.tabIndex=0;this.isConnected=true;
 }
 append(...items){this.children.push(...items);for(const x of items)x.parentNode=this;}
 appendChild(x){this.append(x);return x;}
 setAttribute(k,v){this.attributes.set(k,String(v));}
 getAttribute(k){return this.attributes.get(k)||null;}
 removeAttribute(k){this.attributes.delete(k);}
 addEventListener(name,fn){(this.listeners??={})[name]=fn;}
 querySelectorAll(sel){
  if(sel==='.sf-select-option')return this.children.filter(e=>e.className==='sf-select-option');
  return [];
 }
 querySelector(sel){return this.children.find(e=>e.className===sel.slice(1))||null;}
 closest(){return null;}
 remove(){this.isConnected=false;this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
 getBoundingClientRect(){return {left:30,right:230,top:40,bottom:85,width:200};}
 get scrollHeight(){return 150;}
 get offsetHeight(){return 150;}
 scrollIntoView(){}
 focus(){this.focused=true;}
 contains(x){return x===this||this.children.some(c=>c.contains(x));}
 click(){this.listeners?.click?.();}
}
const document={
 body:new E('body'),
 createElement:tag=>new E(tag),
 addEventListener:(name,fn)=>callbacks['document:'+name]=fn,
};
const window={innerWidth:1024,innerHeight:768,addEventListener:(name,fn)=>callbacks['window:'+name]=fn};
const ctx={document,window,Event:class{constructor(name,params){this.type=name;this.bubbles=params.bubbles;}}};
vm.createContext(ctx);
vm.runInContext(source+';globalThis.popup={openCustomSelect,closeCustomSelect,syncCustomSelect};',ctx);
function makeSelect(){
 const select=new E('select');
 const options=['0×','1×','1.5×','2×','Custom'].map((text,i)=>({value:['0','1','1.5','2','custom'][i],textContent:text,selected:i===2,disabled:false}));
 select.options=options;select.value='1.5';select.selectedIndex=2;
 select.dispatchEvent=event=>{listeners.change=event;};
 select.getAttribute=()=>null;select.labels=[];
 return select;
}
const select=makeSelect(),trigger=new E('button');
ctx.popup.openCustomSelect(select,trigger);
assert.equal(trigger.getAttribute('aria-expanded'),'true');
assert.equal(document.body.children.length,1,'Open creates one portal menu');
let menu=document.body.children[0];
assert.equal(menu.querySelectorAll('.sf-select-option').length,5);
let ev={key:'ArrowDown',preventDefault(){this.prevented=true}};
callbacks['document:keydown'](ev);
assert(ev.prevented,'ArrowDown handled');
ev={key:'Enter',preventDefault(){}};
callbacks['document:keydown'](ev);
assert.equal(select.value,'2','Arrow + Enter selects next option');
assert.equal(listeners.change.type,'change');
assert.equal(document.body.children.length,0,'Selection closes popup');
assert.equal(trigger.focused,true,'Focus returns to trigger');
ctx.popup.openCustomSelect(select,trigger);
ev={key:'Escape',preventDefault(){}};
callbacks['document:keydown'](ev);
assert.equal(trigger.getAttribute('aria-expanded'),'false');
assert.equal(document.body.children.length,0);
console.log('PASS: full script syntax, accessible dropdown, arrow/enter/escape, native change, portal lifecycle and UI integration');
