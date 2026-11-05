// Activate annual IRS, SSA and Arizona figures atomically, never independently.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const KINDS=['tax','payroll','arizona'];
const STATUS=['hoh','mfj','mfs','single'];
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const rising=(a,n)=>Array.isArray(a)&&a.length===n&&a.every((v,i)=>Number.isSafeInteger(v)&&v>0&&(i===0||v>a[i-1]));
const acceptable=(v,old,delta)=>Number.isFinite(v)&&v>=0&&v>=old*(1-delta)&&v<=old*(1+delta);
const sourceOk=(kind,url)=>{
 if(typeof url!=='string')return false;
 const patterns={
  tax:/^https:\/\/www\.irs\.gov\/irb\/20\d{2}-\d{2}_irb(?:\?.*)?$/i,
  payroll:/^https:\/\/www\.ssa\.gov\//i,
  arizona:/^https:\/\/(www\.)?(azleg\.gov|azdor\.gov)\//i
 };
 return patterns[kind].test(url);
};
const sameStatus=x=>x&&JSON.stringify(Object.keys(x).sort())===JSON.stringify(STATUS);
export function validateNextYear(manifest,active,candidates,today=new Date()){
 const year=manifest.tax.year+1;
 assert.equal(manifest.payroll.year,manifest.tax.year,'Active payroll year differs from IRS');
 assert.equal(manifest.arizona.year,manifest.tax.year,'Active Arizona year differs from IRS');
 assert(today instanceof Date&&!Number.isNaN(today.valueOf()),'Invalid date');
 if(today.getUTCFullYear()<year)return {ready:false,year,reason:'Effective year has not started'};
 const missing=KINDS.filter(k=>!candidates[k]);
 if(missing.length)return {ready:false,year,reason:'Missing candidate: '+missing.join(', ')};
 for(const k of KINDS){
  const v=candidates[k],prior=active[k];
  assert.equal(v.schema,1,k+': schema mismatch');
  assert.equal(v.taxYear,year,k+': wrong tax year');
  assert.equal(prior.taxYear,year-1,k+': active comparison year mismatch');
  assert(sourceOk(k,v.source),k+': invalid source');
  assert(typeof v.retrieval==='string'&&v.retrieval.length>=20,k+': no provenance');
 }
 assert(sameStatus(candidates.tax.values),'IRS filing status mismatch');
 for(const k of STATUS){
  const curr=candidates.tax.values[k],prev=active.tax.values[k];
  assert(rising(curr.br,6),k+': invalid brackets');
  assert(Number.isSafeInteger(curr.ded)&&acceptable(curr.ded,prev.ded,.20),k+': deduction change too large');
  for(let i=0;i<6;i++)assert(acceptable(curr.br[i],prev.br[i],.20),k+': bracket change too large');
 }
 const payroll=candidates.payroll,oldPayroll=active.payroll;
 assert(Number.isSafeInteger(payroll.socialSecurityWageBase)&&payroll.socialSecurityWageBase%300===0
  &&payroll.socialSecurityWageBase>=oldPayroll.socialSecurityWageBase
  &&payroll.socialSecurityWageBase<=oldPayroll.socialSecurityWageBase*1.15,'SSA wage base out of bounds');
 for(const key of ['socialSecurityRate','medicareRate','additionalMedicareRate','additionalMedicareThresholds'])
  assert.deepEqual(payroll[key],oldPayroll[key],'Unexpected change to '+key);
 const az=candidates.arizona,oldAz=active.arizona;
 assert(sameStatus(az.standardDeduction)&&sameStatus(az.charityMax),'Arizona statuses missing');
 assert(Number.isFinite(az.rate)&&az.rate>0&&az.rate<.1&&Math.abs(az.rate-oldAz.rate)<=.005,'Arizona rate needs manual review');
 for(const key of ['standardDeduction','charityMax'])
  for(const status of STATUS)
   assert(Number.isSafeInteger(az[key][status])&&acceptable(az[key][status],oldAz[key][status],.30),'Arizona '+key+'.'+status+' out of bounds');
 return {ready:true,year,reason:'All three official-source candidate datasets verified'};
}
export function planTransition(manifest,active,candidates,today){
 const state=validateNextYear(manifest,active,candidates,today);
 if(!state.ready)return {state};
 const next=structuredClone(manifest),files={};
 for(const k of KINDS){
  const path='data/'+k+'-'+state.year+'.json';
  next[k]={path,year:state.year};
  files[path]=candidates[k];
 }
 return {state,manifest:next,files};
}
async function run(){
 const mode=process.argv[2];
 assert(['--check','--apply'].includes(mode),'Usage: --check or --apply');
 const manifest=read('data/manifest.json');
 const active=Object.fromEntries(KINDS.map(k=>[k,read(manifest[k].path)]));
 const year=manifest.tax.year+1;
 const candidates=Object.fromEntries(KINDS.map(k=>{
  const path='data/candidates/'+k+'-'+year+'.json';
  return [k,existsSync(path)?read(path):null];
 }));
 const plan=planTransition(manifest,active,candidates,new Date());
 console.log((plan.state.ready?'READY':'SKIP')+' '+year+': '+plan.state.reason);
 if(mode==='--apply'&&plan.state.ready){
  for(const [path,value] of Object.entries(plan.files)){
   if(existsSync(path))assert.deepEqual(read(path),value,path+' conflicts with candidate');
   else writeFileSync(path,JSON.stringify(value,null,2)+'\n');
  }
  writeFileSync('data/manifest.json',JSON.stringify(plan.manifest,null,2)+'\n');
  const {syncContent}=await import('./sync-reference-baseline.mjs');
  const currentHtml=readFileSync('index.html','utf8');
  const activeReference=Object.fromEntries(['tax','us','world','payroll','arizona'].map(k=>[k,read(plan.manifest[k].path)]));
  const nextHtml=syncContent(currentHtml,plan.manifest,activeReference);
  if(nextHtml!==currentHtml)writeFileSync('index.html',nextHtml);
  console.log('Activated IRS, SSA, Arizona together; synchronized built-in fallback.');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await run();
