// Usage: node scripts/prepare-data-pr.mjs tax|us|world YEAR
// Candidate files must be reviewed source datasets placed in candidates/<type>-<YEAR>.json.
// This script does not fetch or invent any statistical values.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {existsSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const [kind,yearText]=process.argv.slice(2);
assert(['tax','us','world'].includes(kind),'Select tax, us or world');
assert(/^20\d{2}$/.test(yearText||''),'Provide a 4-digit year');
const year=Number(yearText);
const mf=read('data/manifest.json');
const current=read(mf[kind].path);
const candidatePath='candidates/'+kind+'-'+year+'.json';
assert(existsSync(candidatePath),'Candidate missing: '+candidatePath+'; add verified source data first');
const candidate=read(candidatePath);
assert.equal(candidate.schema,1,'Invalid schema');
assert.equal(candidate[kind==='tax'?'taxYear':kind==='us'?'editionYear':'incomeYear'],year,'Wrong candidate year');
assert(year>mf[kind].year,'Only newer datasets may be proposed');
assert(/^https:\/\//.test(candidate.source||''),'Candidate requires HTTPS source URL');
assert(candidate.retrieval&&candidate.retrieval.length>=12,'Candidate requires retrieval methodology');
const rise=(a,n)=>Array.isArray(a)&&a.length===n&&a.every((v,i)=>Number.isFinite(v)&&v>0&&(i===0||v>a[i-1]));
const stats=[];
const compare=(name,a,b)=>{
 assert(Number.isFinite(a)&&Number.isFinite(b)&&b>0,'Invalid '+name);
 const change=(b-a)/a*100;
 stats.push({name,before:a,after:b,change});
};
if(kind==='tax'){
 assert.deepEqual(Object.keys(candidate.values).sort(),Object.keys(current.values).sort(),'Filing statuses changed');
 for(const status of Object.keys(current.values)){
  const a=current.values[status],b=candidate.values[status];
  assert(rise(b.br,6),'Invalid brackets: '+status);
  assert(Number.isFinite(b.ded)&&b.ded>=0,'Invalid deduction: '+status);
  compare(status+'.ded',a.ded,b.ded);
  b.br.forEach((v,i)=>compare(status+'.br['+i+']',a.br[i],v));
 }
}else if(kind==='us'){
 assert.equal(candidate.incomeYear,year-1,'US series must declare preceding income year');
 assert.deepEqual(Object.keys(candidate.values).sort(),Object.keys(current.values).sort(),'State codes changed');
 for(const state of Object.keys(current.values)){
  const b=candidate.values[state];
  assert(rise(b,4),'Invalid percentiles: '+state);
  b.forEach((v,i)=>compare(state+'.p'+i,current.values[state][i],v));
 }
}else{
 assert.deepEqual(Object.keys(candidate.values).sort(),Object.keys(current.values).sort(),'Country codes changed');
 for(const country of Object.keys(current.values)){
  const a=current.values[country],b=candidate.values[country];
  assert.equal(b.currency,a.currency,'Currency changed for '+country);
  assert(b.name&&b.ko,'Missing label '+country);
  assert(rise(b.points,6),'Invalid percentiles '+country);
  b.points.forEach((v,i)=>compare(country+'.p'+i,a.points[i],v));
 }
}
const sorted=[...stats].sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
const anomalous=sorted.filter(x=>Math.abs(x.change)>25);
const unchanged=stats.filter(x=>x.change===0);
// All three official collectors are eligible for staging auto-merge after strict source,
// structure, continuity, numeric-change and live snapshot checks. Extraordinary changes
// remain a review PR rather than silently replacing a working baseline.
const sourceIsOfficialIrs=kind==='tax'&&/^https:\/\/www\.irs\.gov\/irb\/20\d{2}-\d{2}_irb(?:\?.*)?$/i.test(candidate.source);
const officialSource=sourceIsOfficialIrs||
 (kind==='us'&&candidate.source==='https://dqydj.com/income-by-state/'&&candidate.incomeYear===year-1)||
 (kind==='world'&&candidate.source==='https://wid.world/data/');
const standardDeductionNormal=kind!=='tax'||Object.values(candidate.values).every(v=>v.ded>0);
const maxAbsChange=sorted.length?Math.abs(sorted[0].change):Infinity;
const maxAutoPercent=kind==='tax'?10:25;
const autoSafe=officialSource&&standardDeductionNormal&&maxAbsChange<=maxAutoPercent&&unchanged.length!==stats.length;
if(process.env.GITHUB_OUTPUT){
 const {appendFileSync}=await import('node:fs');
 appendFileSync(process.env.GITHUB_OUTPUT,'auto_safe='+(autoSafe?'true':'false')+'\n');
}

assert(unchanged.length!==stats.length,'Identical old and new values; candidate not a data update');
const outputPath='data/'+(kind==='world'?'income-world-':kind==='us'?'income-us-':'tax-')+year+'.json';
writeFileSync(outputPath,JSON.stringify(candidate,null,2)+'\n');
mf[kind].path=outputPath;
mf[kind].year=year;
if(kind==='us')mf.us.incomeYear=candidate.incomeYear;
writeFileSync('data/manifest.json',JSON.stringify(mf,null,2)+'\n');
const lines=[
 '# Salary Flow data review: '+kind+' '+year,
 '',
 '@mooyoungoh — New reference-data PR. Please review the report below. GitHub email notifications depend on your notification settings.',
 '',
 'Every candidate creates a PR and leaves a history trail. Passing numeric checks alone does not prove source accuracy.',
 '',
 '- Source: '+candidate.source,
 '- Retrieval method: '+candidate.retrieval,
 '- Previous year: '+current[kind==='tax'?'taxYear':kind==='us'?'editionYear':'incomeYear'],
 '- Candidate year: '+year,
 '- Compared values: '+stats.length,
 '- Values unchanged: '+unchanged.length,
 '- Changes above 25%: '+anomalous.length,
 '- Maximum absolute change: '+maxAbsChange.toFixed(2)+'%',
 '- Automatic merge decision: **'+(autoSafe?'ELIGIBLE (verified source and within '+maxAutoPercent+'% per field)':'REVIEW REQUIRED: source, unusually large change, or no data change')+'**',
 '',
 '## Ten largest changes',
 '',
 '| Field | Previous | Candidate | Change |',
 '|---|---:|---:|---:|',
 ...sorted.slice(0,10).map(x=>'| '+x.name+' | '+x.before+' | '+x.after+' | '+x.change.toFixed(2)+'% |'),
 '',
 '## Reviewer checklist',
 '',
 '- [ ] Compare values directly against the cited authoritative dataset',
 '- [ ] Confirm age/population and pre-tax income definitions for WID',
 '- [ ] Confirm the same geographic and percentile definitions for US data',
 '- [ ] Verify IRS tax year, filing status and deduction eligibility for taxes',
 '- [ ] Investigate all differences above 25%, including revisions to historical data',
 '- [ ] Verify tax take-home estimates and income rankings on the staging website',
 '- [ ] Verified official-source changes within their configured per-field threshold can auto-merge on staging; exceptional changes require review.',
 '- [ ] Production organization stays unchanged regardless of staging merge.',
 ''
];
writeFileSync('data-review-report.md',lines.join('\n'));
console.log(lines.slice(0,18).join('\n'));
