// Synchronize built-in offline reference data with the manifest's validated datasets.
// Operates on all five datasets; check-only mode makes CI fail on stale defaults.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const TYPES=['tax','us','world','payroll','arizona'];
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const encode=x=>JSON.stringify(x).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
export function expectedInline(html,manifest,datasets){
 const first='const REFERENCE_BASELINE=';
 const begin=html.indexOf(first);
 assert(begin>=0,'Reference fallback constant missing');
 const end=html.indexOf('\nconst REFERENCE_CACHE_KEY=',begin);
 assert(end>=0,'Reference fallback section end missing');
 const tax=datasets.tax,us=datasets.us,world=datasets.world,payroll=datasets.payroll,arizona=datasets.arizona;
 for(const type of TYPES){
  const data=datasets[type],entry=manifest[type];
  assert(data?.schema===1,'Invalid '+type+' schema');
  assert(entry?.path&&/^data\/[a-z0-9-]+\.json$/.test(entry.path),'Invalid '+type+' manifest path');
  const yr=type==='us'?data.editionYear:type==='world'?data.incomeYear:data.taxYear;
  assert(entry.year===yr,'Year mismatch '+type);
 }
 assert(us.incomeYear===manifest.us.incomeYear,'US statistics income year mismatch');
 // Only this block is generated; preserve everything else byte-for-byte.
 const payload=encode({tax,us,world});
 const replacement='// Generated from active data/manifest.json. Update only via scripts/sync-reference-baseline.mjs.\n'
  +'const REFERENCE_BASELINE='+payload+';\n'
  +'REFERENCE_BASELINE.payroll='+encode(payroll)+';\n'
  +'REFERENCE_BASELINE.arizona='+encode(arizona)+';';
 const oldStart=html.lastIndexOf('\n',begin)+1;
 // Replace the adjacent baseline comment as well to prevent misleading dated annotations.
 const previousLineStart=html.lastIndexOf('\n',oldStart-2)+1;
 const preceding=html.slice(previousLineStart,oldStart);
 const prefix=/^\/\/ (?:Fixed, versioned |Generated from active data\/manifest\.json\.)/.test(preceding) ? previousLineStart : oldStart;
 return html.slice(0,prefix)+replacement+html.slice(end);
}
export function syncContent(html,manifest,datasets){
 return expectedInline(html,manifest,datasets);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const flag=process.argv[2]||'--check';
 assert(['--check','--write'].includes(flag),'Use --check or --write');
 const mf=read('data/manifest.json');
 const datasets=Object.fromEntries(TYPES.map(k=>[k,read(mf[k].path)]));
 const html=readFileSync('index.html','utf8');
 const revised=syncContent(html,mf,datasets);
 if(flag==='--check')assert.equal(html,revised,'Outdated HTML reference fallback: run node scripts/sync-reference-baseline.mjs --write');
 else if(html!==revised)writeFileSync('index.html',revised);
 console.log('PASS: embedded offline reference matches all active datasets');
}
