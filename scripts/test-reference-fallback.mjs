// Execute the exact browser loader in a VM with deterministic network/cache failures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const begin=html.indexOf('const REFERENCE_BASELINE=');
const end=html.indexOf('const REFERENCE_DATA=await loadReferenceData();',begin);
assert(begin>0&&end>begin,'Browser reference loader missing');
const loader=html.slice(begin,end);
const manifest=JSON.parse(readFileSync('data/manifest.json','utf8'));
const keys=['tax','payroll','arizona'];
const types=[...keys,'us','world'];
const files=Object.fromEntries(types.map(k=>[manifest[k].path,JSON.parse(readFileSync(manifest[k].path,'utf8'))]));
const baselineYear=manifest.tax.year;
const clone=v=>JSON.parse(JSON.stringify(v));
const futureManifest=clone(manifest),futureFiles=clone(files);
for(const k of keys){
 const data=clone(files[manifest[k].path]);
 data.taxYear=baselineYear+1;
 futureManifest[k]={path:'data/'+k+'-'+data.taxYear+'.json',year:data.taxYear};
 futureFiles[futureManifest[k].path]=data;
}
futureFiles[futureManifest.tax.path].values.single.ded+=100;
futureFiles[futureManifest.payroll.path].socialSecurityWageBase+=7800;
futureFiles[futureManifest.arizona.path].standardDeduction.single+=250;
const futureBundle=Object.fromEntries(keys.map(k=>[k,futureFiles[futureManifest[k].path]]));
const currentBundle=Object.fromEntries(keys.map(k=>[k,files[manifest[k].path]]));
const priorKey='salary-flow-reference-last-good-v1';
const bundleKey='salary-flow-tax-bundle-last-good-v2';

async function scenario(name,config={}){
 const {activeManifest=manifest,networkFiles=files,down=[],bad={},storedLegacy=null,storedBundle=null,
  taxSource='live',taxYear=baselineYear,usSource='live',worldSource='live',persistedYear=null}=config;
 const saved=new Map();
 if(storedLegacy)saved.set(priorKey,JSON.stringify(storedLegacy));
 if(storedBundle)saved.set(bundleKey,JSON.stringify(storedBundle));
 const ctx={
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  console:{warn:()=>{}},
  AbortController,setTimeout,clearTimeout,
  fetch:async url=>{
   if(down.includes('*')||down.includes(url))throw Error('Network unavailable '+url);
   if(url==='./data/manifest.json')return{ok:true,json:async()=>clone(activeManifest)};
   const path=url.replace(/^\.\//,'');
   if(Object.hasOwn(bad,path))return{ok:true,json:async()=>clone(bad[path])};
   if(!networkFiles[path])throw Error('No fixture '+path);
   return{ok:true,json:async()=>clone(networkFiles[path])};
  }
 };
 vm.createContext(ctx);
 vm.runInContext(loader+';globalThis.runLoader=loadReferenceData;globalThis.sources=REFERENCE_SOURCES;',ctx);
 const actual=await ctx.runLoader();
 const source=JSON.parse(JSON.stringify(ctx.sources));
 for(const k of keys){
  assert.equal(source[k],taxSource,name+': '+k+' source must match bundle');
  assert.equal(actual.years[k],taxYear,name+': '+k+' year must match bundle');
 }
 assert.equal(source.us,usSource,name+': US source');
 assert.equal(source.world,worldSource,name+': WID source');
 assert.equal(actual.years.us,manifest.us.year);
 assert.equal(actual.years.world,manifest.world.year);
 const persisted=JSON.parse(saved.get(bundleKey)||'null');
 assert.equal(persisted?.tax.taxYear??null,persistedYear,name+': validated bundle cache must be updated atomically');
 console.log('PASS '+name);
}

await scenario('all-current-live',{persistedYear:baselineYear});
await scenario('fully-published-next-year',{activeManifest:futureManifest,networkFiles:futureFiles,taxYear:baselineYear+1,persistedYear:baselineYear+1});
await scenario('one-failed-file-falls-back-to-complete-old-cache',{
 activeManifest:futureManifest,networkFiles:futureFiles,down:['./'+futureManifest.arizona.path],
 storedBundle:currentBundle,taxSource:'cached',persistedYear:baselineYear
});
await scenario('one-failed-file-uses-matching-new-cache',{
 activeManifest:futureManifest,networkFiles:futureFiles,down:['./'+futureManifest.payroll.path],
 storedBundle:futureBundle,taxSource:'cached',taxYear:baselineYear+1,persistedYear:baselineYear+1
});
await scenario('corrupt-single-file-never-mixes-years',{
 activeManifest:futureManifest,networkFiles:futureFiles,bad:{[futureManifest.arizona.path]:{...futureBundle.arizona,taxYear:baselineYear}},
 taxSource:'default',persistedYear:null
});
await scenario('manifest-states-mismatched-years-reject-all-live',{
 activeManifest:{...futureManifest,arizona:manifest.arizona},networkFiles:futureFiles,
 taxSource:'default',persistedYear:null
});
await scenario('legacy-three-way-cache-migrated-only-when-coherent',{
 activeManifest:futureManifest,networkFiles:futureFiles,down:['./'+futureManifest.tax.path],
 storedLegacy:currentBundle,taxSource:'cached',persistedYear:baselineYear
});
await scenario('legacy-mixed-year-cache-is-rejected',{
 activeManifest:futureManifest,networkFiles:futureFiles,down:['./'+futureManifest.tax.path],
 storedLegacy:{...currentBundle,payroll:futureBundle.payroll},taxSource:'default',persistedYear:null
});
await scenario('offline-uses-complete-cache',{
 down:['*'],storedBundle:currentBundle,taxSource:'cached',usSource:'default',worldSource:'default',persistedYear:baselineYear
});
await scenario('offline-without-cache-uses-built-in-triple',{
 down:['*'],taxSource:'default',usSource:'default',worldSource:'default',persistedYear:null
});
await scenario('WID-can-fail-without-affecting-tax-bundle',{
 down:['./'+manifest.world.path],taxSource:'live',worldSource:'default',persistedYear:baselineYear
});
await scenario('US-can-use-cache-independently',{
 down:['./'+manifest.us.path],storedLegacy:{us:files[manifest.us.path]},
 taxSource:'live',usSource:'cached',persistedYear:baselineYear
});
