import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseIrsBulletin} from './irs-tax-parser.mjs';
const original=JSON.parse(readFileSync(new URL('../data/tax-2026.json',import.meta.url)));
const sets=[['mfj','Married Individuals Filing Joint Returns and Surviving Spouses'],['hoh','Heads of Households'],['single','Unmarried Individuals (other than Surviving Spouses and Heads of Households)'],['mfs','Married Individuals Filing Separate Returns']];
const rates=[10,12,22,24,32,35,37];
const table=(status,index,title)=>{
 const limits=original.values[status].br;
 const lines=[
 '<h3>TABLE '+index+' - Section 1(j)(2)('+String.fromCharCode(64+index)+') - '+title+'</h3>',
 '<table><tr><th>If Taxable Income Is:</th><th>The Tax Is:</th></tr>'
 ];
 let previous=0;
 for(let i=0;i<7;i++){
  const upper=limits[i];
  const range=i===0?'Not over $'+upper.toLocaleString('en-US'):i===6?'Over $'+previous.toLocaleString('en-US'):'Over $'+previous.toLocaleString('en-US')+' but not over $'+upper.toLocaleString('en-US');
  lines.push('<tr><td>'+range+'</td><td>'+rates[i]+'% of taxable income</td></tr>');
  previous=upper??previous;
 }
 lines.push('</table>');
 return lines.join('\n');
};
// Actual IRS headings map TABLE 1 MFJ, TABLE 2 HOH, TABLE 3 Single, TABLE 4 MFS.
const html=['<main><h2>SECTION 4. 2026 ADJUSTED ITEMS</h2>',
 '<p>.01 Tax Rate Tables. For taxable years beginning in 2026</p>',
 ...sets.map(([s,t],i)=>table(s,i+1,t)),
 '<p>.14 Standard Deduction.</p><p>(1) In general. For taxable years beginning in 2026</p>',
 '<table><tr><th>Filing Status</th><th>Standard Deduction</th></tr>',
 ...sets.map(([s,t])=>'<tr><td>'+t+'</td><td>$'+original.values[s].ded.toLocaleString('en-US')+'</td></tr>'),
 '</table></main>'].join('\n');
const url='https://www.irs.gov/irb/2025-45_IRB';
const candidate=parseIrsBulletin(html,2026,url);
assert.deepEqual(candidate.values,original.values,'2026 official-format tax extraction must match historical reference exactly');
assert.throws(()=>parseIrsBulletin(html,2027,url));
assert.throws(()=>parseIrsBulletin(html.replace('Over $24,800 but not over $100,800','MALFORMED'),2026,url));
assert.throws(()=>parseIrsBulletin(html,2026,'https://example.com/fake'));
console.log('PASS: IRS 2026 tax table parser matches all 28 reference values');
console.log('PASS: wrong year, corrupted rows, and non-IRS sources rejected');
