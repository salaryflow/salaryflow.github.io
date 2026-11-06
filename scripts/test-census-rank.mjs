import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
assert(html.includes('const CENSUS_RANK')||html.includes('let CENSUS_RANK=null'),'Census rank storage required');
assert(html.includes("fetch('./data/income-census-2024.json'"),'Must fetch Census generated data');
assert(html.includes("const band=censusRankBucket(gross,pts)"),'US ranks must use census percentile buckets');
assert(html.includes('legacy four-point interpolation is disabled'),'No legacy interpolation when Census dataset missing');
assert(html.includes("link.href='https://www.census.gov/programs-surveys/acs/microdata/access/2024.html'"),'UI must link original Census source');
assert(!html.includes('const share=rankTopShare(gross,pts)'),'Four-point interpolation must not power ranked cards');
const from=html.indexOf('let CENSUS_RANK=null'),end=html.indexOf('\nconst GLOBAL_COUNTRIES=',from);
assert(from>0&&end>from,'Census rank helpers not found');
const source=html.slice(from,end);
const ctx={fetch:async()=>({ok:false,status:404}),console:{warn:()=>{}},renderRankings:()=>{}};
vm.createContext(ctx);
vm.runInContext(source+';globalThis.valid=validCensusRank;globalThis.bucket=censusRankBucket;',ctx);
const values=Array.from({length:99},(_,i)=>(i+1)*1000);
const data={schema:2,incomeYear:2024,metric:'PERNP',weight:'PWGTP',inflationAdjuster:'ADJINC',
 source:'https://www.census.gov/programs-surveys/acs/microdata/access/2024.html',
 percentiles:Array.from({length:99},(_,i)=>i+1),
 values:Object.fromEntries(['US',...Array.from({length:51},(_,i)=>'S'+i)].map(s=>[s,values]))};
assert(ctx.valid(data),'Valid 52-jurisdiction dataset should be accepted');
assert.equal(ctx.bucket(99500,values)[0],0,'Income exceeding P99 must remain top 1%, never fake 0.1%');
assert.deepEqual(Array.from(ctx.bucket(81500,values)),[18,19],'Use empirical P81-P82 bracket for top 18-19%');
assert.equal(ctx.valid({...data,values:{US:values}}),false,'Incomplete states must fail closed');
assert.equal(ctx.valid({...data,source:'https://example.com/'}),false,'Unverified origin must fail closed');
assert.equal(ctx.valid({...data,values:{...data.values,US:[...values.slice(0,30),0,...values.slice(31)]}}),false,'Nonmonotone thresholds must fail');
console.log('PASS: Census rank provenance checks, integer percentile bands and fail-closed behavior');
