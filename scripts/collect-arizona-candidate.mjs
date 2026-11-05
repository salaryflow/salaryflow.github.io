// Conservative Arizona candidate collector: no inferred tax-year numbers.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const HIGHLIGHTS='https://azdor.gov/forms/individual-income-tax-highlights';
const STATUTE='https://www.azleg.gov/ars/43/01041.htm';
const TAX_STATUTE='https://www.azleg.gov/ars/43/01011.htm';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function plainText(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<[^>]+>/g,' ')
 .replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&')
 .replace(/\s+/g,' ').trim();
}
export function deductionFromHighlights(html,year){
 const text=plainText(html);
 // The heading must refer to the actual TARGET TAX YEAR, not the publication year.
 const heading=new RegExp('\\b'+year+'\\s+Arizona\\s+Standard\\s+Deduction\\s+Amounts(?:\\s+Adjusted)?\\b','i');
 const match=heading.exec(text);
 if(!match)return null;
 const section=text.slice(match.index+match[0].length,match.index+match[0].length+650);
 const single=section.match(/\$\s*([\d,]+)\s+for\s+a\s+single\s+taxpayer\s+or\s+a\s+married\s+taxpayer\s+filing\s+a\s+separate\s+return/i);
 const mfj=section.match(/\$\s*([\d,]+)\s+for\s+a\s+married\s+couple\s+filing\s+a\s+joint\s+return/i);
 const hoh=section.match(/\$\s*([\d,]+)\s+for\s+individuals\s+filing\s+a\s+head\s+of\s+household\s+return/i);
 if(!single||!mfj||!hoh)throw Error('Arizona deduction heading found but complete amounts could not be parsed');
 const n=x=>Number(x[1].replaceAll(',',''));
 const amounts={single:n(single),mfs:n(single),mfj:n(mfj),hoh:n(hoh)};
 assert(Object.values(amounts).every(Number.isSafeInteger),'Invalid Arizona amounts');
 assert(amounts.mfj===amounts.single*2,'Married deduction not twice single');
 assert(amounts.hoh*2===amounts.mfj*1.5,'Head of household deduction ratio unexpected');
 return amounts;
}
export function verifyStatutes(deductionHtml,rateHtml,previous){
 const ded=plainText(deductionHtml),rate=plainText(rateHtml);
 assert(/43-1041[\s\S]{0,220}Optional standard deduction/i.test(ded),'Not AZ standard deduction statute');
 assert(/department shall adjust the dollar amounts[\s\S]{0,250}for inflation/i.test(ded),'Inflation statute missing');
 for(const amount of [1000,2000]){
  assert(ded.includes('$'+amount.toLocaleString('en-US')),'Charity cap absent from statute');
 }
 assert(/43-1011[\s\S]{0,150}Taxes and tax rates/i.test(rate),'Not AZ tax rate statute');
 assert(/tax is 2\.5% of taxable income/i.test(rate),'Arizona 2.5% flat rate not confirmed');
 assert(previous.rate===0.025,'Current Arizona rate changed; manual review required');
}
export function buildCandidate(html,year,previous,statute,rateStatute){
 const deduction=deductionFromHighlights(html,year);
 if(!deduction)return null;
 verifyStatutes(statute,rateStatute,previous);
 for(const [status,value] of Object.entries(deduction)){
  const old=previous.standardDeduction[status];
  assert(value>=old&&value<=old*1.20,'Arizona '+status+' standard deduction change exceeds bounds');
 }
 return {...previous,taxYear:year,source:HIGHLIGHTS,
  retrieval:'Arizona Department of Revenue tax-year-specific Individual Income Tax Highlights; inflation adjustment under A.R.S. 43-1041, charity limits cross-checked with A.R.S. 43-1041 and flat rate with A.R.S. 43-1011. Candidate not active until all three tax sources pass.',
  standardDeduction:deduction};
}
async function fetchOfficial(url){
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),20000);
 try{
  const response=await fetch(url,{headers:{Accept:'text/html','User-Agent':'SalaryFlowArizonaReferenceMonitor/1.0'},signal:ctrl.signal});
  if(!response.ok)throw Error('Official page HTTP '+response.status+' ('+url+')');
  return await response.text();
 }finally{clearTimeout(timeout)}
}
export async function main(){
 const manifest=read('data/manifest.json');
 const year=manifest.arizona.year+1;
 const previous=read(manifest.arizona.path);
 let highlights;
 try{highlights=await fetchOfficial(HIGHLIGHTS);}
 catch(error){console.warn('Arizona highlights temporarily unavailable; no tax update:',error.message);return}
 if(!deductionFromHighlights(highlights,year)){
  console.log('Arizona DOR has not published a complete '+year+' standard deduction section; no candidate.');
  return;
 }
 // Never bypass secondary official-source confirmation.
 const [statute,rateStatute]=await Promise.all([fetchOfficial(STATUTE),fetchOfficial(TAX_STATUTE)]);
 const candidate=buildCandidate(highlights,year,previous,statute,rateStatute);
 mkdirSync('data/candidates',{recursive:true});
 const file='data/candidates/arizona-'+year+'.json';
 writeFileSync(file,JSON.stringify(candidate,null,2)+'\n');
 console.log('Verified official Arizona '+year+' candidate: '+file+'; active manifest unchanged');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
