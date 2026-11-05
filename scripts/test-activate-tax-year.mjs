import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNextYear,planTransition} from './activate-tax-year.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8')),clone=x=>structuredClone(x);
const manifest=read('data/manifest.json'),kinds=['tax','payroll','arizona'];
const active=Object.fromEntries(kinds.map(k=>[k,read(manifest[k].path)]));
const year=manifest.tax.year+1,date=new Date(Date.UTC(year,0,2));
const proposed={
 tax:{...clone(active.tax),taxYear:year,source:'https://www.irs.gov/irb/2026-45_IRB',retrieval:'Reviewed official IRS annual tax bulletin'},
 payroll:{...clone(active.payroll),taxYear:year,source:'https://www.ssa.gov/oact/cola/cbb.html',retrieval:'Reviewed SSA wage base and COLA'},
 arizona:{...clone(active.arizona),taxYear:year,source:'https://www.azleg.gov/test',retrieval:'Reviewed Arizona enacted state tax law'}
};
proposed.payroll.socialSecurityWageBase+=7800;
assert.equal(validateNextYear(manifest,active,proposed,new Date(Date.UTC(year-1,11,31))).ready,false);
for(const k of kinds){const partial=clone(proposed);delete partial[k];assert.equal(validateNextYear(manifest,active,partial,date).ready,false);}
const wrong=clone(proposed);wrong.arizona.taxYear=year-1;assert.throws(()=>validateNextYear(manifest,active,wrong,date));
const bad=clone(proposed);bad.tax.values.single.br[0]=0;assert.throws(()=>validateNextYear(manifest,active,bad,date));
const source=clone(proposed);source.arizona.source='https://example.com';assert.throws(()=>validateNextYear(manifest,active,source,date));
const plan=planTransition(manifest,active,proposed,date);
assert(plan.state.ready);
for(const k of kinds)assert.equal(plan.manifest[k].year,year);
assert.equal(plan.manifest.world.year,manifest.world.year);
assert.equal(plan.manifest.us.year,manifest.us.year);
assert.equal(manifest.tax.year,year-1);
assert.equal(Object.keys(plan.files).length,3);
console.log('PASS: atomic transition, missing candidates, future dates, source and value regressions');
