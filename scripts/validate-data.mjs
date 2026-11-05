// Public snapshot structural checks and regression guardrails. Run: node scripts/validate-data.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const mf=load('data/manifest.json');
assert.equal(mf.schema,1);
const types=['tax','us','world','payroll','arizona'];
for(const type of types){
 assert(mf[type]&&/^data\/[a-z0-9-]+\.json$/.test(mf[type].path), 'Bad manifest path: '+type);
 assert(Number.isInteger(mf[type].year),'Bad dataset year: '+type);
}
const tax=load(mf.tax.path),us=load(mf.us.path),wid=load(mf.world.path),payroll=load(mf.payroll.path),arizona=load(mf.arizona.path);
const rising=(a,n)=>Array.isArray(a)&&a.length===n&&a.every((v,i)=>Number.isFinite(v)&&v>0&&(i===0||v>a[i-1]));
assert.equal(tax.schema,1);
assert.equal(tax.taxYear,mf.tax.year);
assert.deepEqual(Object.keys(tax.values).sort(),['hoh','mfj','mfs','single']);
for(const [k,v] of Object.entries(tax.values)){
 assert(Number.isFinite(v.ded)&&v.ded>=0,'Invalid deduction: '+k);
 assert(rising(v.br,6),'Invalid bracket thresholds: '+k);
}
assert.equal(us.schema,1);
assert.equal(us.editionYear,mf.us.year);
assert.equal(us.incomeYear,mf.us.incomeYear);
assert.equal(Object.keys(us.values).length,52,'Expected 50 states, DC and US');
for(const [code,v] of Object.entries(us.values))assert(rising(v,4),'Invalid US percentile thresholds: '+code);
assert.equal(wid.schema,1);
assert.equal(wid.incomeYear,mf.world.year);
assert.equal(Object.keys(wid.values).length,9);
for(const [code,v] of Object.entries(wid.values)){
 assert(v.name&&v.ko&&/^[A-Z]{3}$/.test(v.currency),'Invalid country metadata: '+code);
 assert(rising(v.points,6),'Invalid WID percentile thresholds: '+code);
}
assert.equal(payroll.schema,1);
assert.equal(payroll.taxYear,mf.payroll.year);
assert(mf.payroll.year<=mf.tax.year,'SSA payroll year cannot be ahead of active federal tax year');
assert(payroll.socialSecurityWageBase>100000&&payroll.socialSecurityWageBase<500000,'Invalid SSA taxable maximum');
assert.equal(payroll.socialSecurityRate,.062);
assert.equal(payroll.medicareRate,.0145);
assert.equal(payroll.additionalMedicareRate,.009);
assert.deepEqual(payroll.additionalMedicareThresholds,{single:200000,mfj:250000,mfs:125000,hoh:200000});
if(payroll.taxYear===2026)assert.equal(payroll.socialSecurityWageBase,184500,'2026 SSA baseline mismatch');
assert.equal(arizona.schema,1);
assert.equal(arizona.taxYear,mf.arizona.year);
assert(mf.arizona.year<=mf.tax.year,'Arizona reference cannot lead the active federal tax year');
assert.equal(arizona.rate,0.025,'Arizona flat tax rate regression');
assert.deepEqual(Object.keys(arizona.standardDeduction).sort(),['hoh','mfj','mfs','single']);
for(const v of Object.values(arizona.standardDeduction))assert(Number.isSafeInteger(v)&&v>=0&&v<100000);
if(arizona.taxYear===2026)assert.deepEqual(arizona.standardDeduction,{single:15750,mfs:15750,mfj:31500,hoh:23625},'Enacted 2026 Arizona statutory deduction mismatch');
const federal=(taxable,limits)=>{
 const rates=[.10,.12,.22,.24,.32,.35,.37];
 let result=0,prev=0;
 for(let i=0;i<rates.length;i++){
  const upper=i<limits.length?limits[i]:Infinity;
  result+=Math.max(0,Math.min(taxable,upper)-prev)*rates[i];
  prev=upper;
  if(taxable<=upper)break;
 }
 return result;
};
assert.equal(federal(0,tax.values.single.br),0);
const first=tax.values.single.br[0],second=tax.values.single.br[1];
assert.equal(federal(first,tax.values.single.br),first*0.10);
assert(Math.abs(federal(first+1,tax.values.single.br)-(first*.10+.12))<1e-8);
assert(Math.abs(federal(second,tax.values.single.br)-(first*.10+(second-first)*.12))<1e-8);
if(mf.tax.year===2026)assert.equal(tax.values.single.ded,16100,'2026 tax baseline mismatch');
if(mf.us.year===2026)assert.equal(us.values.US[1],55584,'2026 US median baseline mismatch');
if(mf.world.year===2024)assert.equal(wid.values.KR.points[1],33572879,'2024 KR median baseline mismatch');
console.log('PASS: JSON structure, manifest references and 2026/2024 regression samples');
