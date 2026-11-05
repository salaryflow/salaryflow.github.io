import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deductionFromHighlights,buildCandidate,verifyStatutes} from './collect-arizona-candidate.mjs';
const previous=JSON.parse(readFileSync('data/arizona-2026.json','utf8'));
const snippet=(year,a,b,c)=>'<html><h2>'+year+' Arizona Standard Deduction Amounts Adjusted</h2><ul>'+
'<li>$ '+a+' for a single taxpayer or a married taxpayer filing a separate return;</li>'+
'<li>$ '+b+' for a married couple filing a joint return; and</li>'+
'<li>$ '+c+' for individuals filing a head of household return.</li></ul></html>';
const statute='<h2>43-1041 - Optional standard deduction</h2><p>The department shall adjust the dollar amounts prescribed for inflation.</p><p>$1,000 and $2,000</p>';
const rate='<h2>43-1011 - Taxes and tax rates</h2><p>the tax is 2.5% of taxable income</p>';
assert.equal(deductionFromHighlights(snippet(2025,'15,750','31,500','23,625'),2027),null);
assert.deepEqual(deductionFromHighlights(snippet(2027,'16,000','32,000','24,000'),2027),
 {single:16000,mfs:16000,mfj:32000,hoh:24000});
assert.equal(buildCandidate(snippet(2025,'15,750','31,500','23,625'),2027,previous,statute,rate),null);
const candidate=buildCandidate(snippet(2027,'16,000','32,000','24,000'),2027,previous,statute,rate);
assert.equal(candidate.taxYear,2027);
assert.equal(candidate.rate,.025);
assert.equal(candidate.charityMax.single,1000);
assert.throws(()=>buildCandidate(snippet(2027,'99,000','198,000','148,500'),2027,previous,statute,rate));
assert.throws(()=>buildCandidate(snippet(2027,'16,000','32,000','24,000'),2027,previous,statute,'wrong rate'));
assert.throws(()=>deductionFromHighlights(snippet(2027,'16,000','33,000','24,000'),2027));
console.log('PASS Arizona official-year gate, source checks, full brackets, year regression');
