// Strictly parse the "Tax Rate Tables" and "Standard Deduction" sections of an IRS revenue procedure.
// No heuristics are allowed to fill missing values. Return a candidate for human review, never publish.
const entities={'&nbsp;':' ','&#160;':' ','&amp;':'&','&sect;':'§','&#167;':'§','&ndash;':'-','&mdash;':'-','&rsquo;':"'",'&ldquo;':'"','&rdquo;':'"'};
const decode=s=>s.replace(/&(?:nbsp|amp|sect|ndash|mdash|rsquo|ldquo|rdquo|#160|#167);/g,t=>entities[t]||t).replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Number(x)));
export function htmlToLines(html){
 const text=html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<\/(?:tr|p|div|h[1-6]|table|li|section)>/gi,'\n')
  .replace(/<(?:br|hr)\s*\/?>/gi,'\n')
  .replace(/<\/(?:td|th)>/gi,' | ')
  .replace(/<[^>]+>/g,' ');
 return decode(text).split('\n').map(x=>x.replace(/\s+/g,' ').replace(/\s*\|\s*$/,'').trim()).filter(Boolean);
}
const getAmounts=t=>[...t.matchAll(/\$\s*([0-9][0-9,]*)/g)].map(x=>Number(x[1].replace(/,/g,'')));
function parseTaxRows(lines){
 const result=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(!/^(?:Not over|Over )\s*\$/i.test(line))continue;
  let combined=line;
  for(let j=i+1;j<Math.min(i+7,lines.length);j++){
   if(/\b(10|12|22|24|32|35|37)%/.test(combined)||/^(?:Not over|Over )\s*\$/i.test(lines[j]))break;
   combined+=' '+lines[j];
  }
  const amounts=getAmounts(line.split('|')[0]);
  if(!amounts.length)throw Error('IRS tax row has no monetary boundaries: '+line);
  const rate=combined.match(/\b(10|12|22|24|32|35|37)%/);
  if(!rate)throw Error('IRS tax rate missing: '+combined);
  result.push({upper:amounts.at(-1),rate:Number(rate[1])});
  if(result.length===7)break;
 }
 if(result.length!==7)throw Error('Expected seven IRS rate rows, found '+result.length+': '+JSON.stringify(result)+' | '+JSON.stringify(lines.filter(x=>/^(Not over|Over )/.test(x)).slice(0,18)));
 const expected=[10,12,22,24,32,35,37];
 if(result.some((r,i)=>r.rate!==expected[i]))throw Error('Unexpected rate sequence');
 return result.slice(0,6).map((r,i)=>{if(i&&r.upper<=result[i-1].upper)throw Error('Non-increasing limits');return r.upper});
}
const headings=[
 {status:'mfj',name:/Married Individuals Filing Joint Returns/i},
 {status:'hoh',name:/Heads of Households/i},
 {status:'single',name:/Unmarried Individuals/i},
 {status:'mfs',name:/Married Individuals Filing Separate Returns/i}
];
export function parseIrsBulletin(html,year,source){
 if(!/^https:\/\/www\.irs\.gov\/irb\/20\d\d-\d{2}_IRB(?:\?.*)?$/i.test(source))throw Error('Must use an IRS Internal Revenue Bulletin URL');
 const lines=htmlToLines(html);
 const section=lines.findLastIndex(t=>new RegExp('SECTION\\s+4\\.\\s+'+year+'\\s+ADJUSTED ITEMS','i').test(t));
 if(section<0)throw Error('IRS bulletin does not contain requested tax year section');
 const adjusted=lines.slice(section);
 const taxIndex=adjusted.findIndex(t=>/\.01\s+Tax Rate Tables/i.test(t));
 const stdIndex=adjusted.findIndex(t=>/\.14\s+Standard Deduction/i.test(t));
 if(taxIndex<0||stdIndex<taxIndex)throw Error('Missing tax schedule or standard deduction section');
 const nextTaxSection=adjusted.findIndex((t,i)=>i>taxIndex&&/^\.02\s/.test(t));
 const taxLines=adjusted.slice(taxIndex,nextTaxSection>taxIndex&&nextTaxSection<stdIndex?nextTaxSection:stdIndex);
 const result={};
 for(let i=0;i<4;i++){
  const marker=new RegExp('^TABLE\\s+'+(i+1)+'\\s*[-–]\\s*Section\\s+1\\(j\\)\\(2\\)','i');
  const start=taxLines.findIndex(t=>marker.test(t));
  if(start<0)throw Error('Missing IRS TABLE '+(i+1));
  const finish=i===3?taxLines.length:taxLines.findIndex((t,j)=>j>start&&/^TABLE\s+[1-4]\s*[-–]\s*Section\s+1\(j\)\(2\)/i.test(t));
  if(i<3&&finish<0)throw Error('Cannot find table boundary');
  result[headings[i].status]={br:parseTaxRows(taxLines.slice(start+1,finish).filter(x=>!/^If Taxable Income Is/i.test(x)))};
 }
 const std=adjusted.slice(stdIndex+1,stdIndex+60);
 for(const {status,name} of headings){
  const i=std.findIndex(x=>name.test(x));
  if(i<0)throw Error('Missing standard deduction row for '+status+': '+JSON.stringify(std.slice(0,25)));
  let nums=[];
  for(let j=i;j<Math.min(i+5,std.length);j++){
   nums=getAmounts(std[j]);
   if(nums.length)break;
  }
  if(nums.length!==1)throw Error('Ambiguous standard deduction for '+status);
  result[status].ded=nums[0];
 }
 return {schema:1,taxYear:year,source,retrieval:'IRS Internal Revenue Bulletin section 4 tax rate tables and section 4.14 standard deductions; extracted with strict format validation',values:result};
}
