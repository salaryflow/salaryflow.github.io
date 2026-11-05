import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
for(const id of ['referenceStatusPanel','referenceStatusGrid','referenceStatusHeading','referenceStatusNote']){
 assert(html.includes('id="'+id+'"'),'Missing reference UI '+id);
}
assert(html.includes('const REFERENCE_DETAILS={};'),'Missing reference metadata storage');
assert(html.includes('REFERENCE_DETAILS[k]={year:'),'Metadata must use selected reference value');
assert(html.includes('const info=REFERENCE_DETAILS[key]'),'Status renderer must use selected reference metadata');
assert(html.includes("REFERENCE_SOURCES[key]||'default'"),'Missing source fallback');
assert(html.includes("grid.replaceChildren()"),'Status render must not duplicate rows');
assert(html.includes("function refreshLanguage(){renderReferenceStatus();"),'Status must respond to language switch');
assert(html.includes("const secure=url.protocol==='https:'"),'Source URLs require safe HTTPS origin');
assert(html.indexOf('const REFERENCE_DETAILS={};')<html.indexOf('async function loadReferenceData()'),'Metadata store defined after loader');
assert(html.indexOf('const REFERENCE_DATA=await loadReferenceData()')<html.indexOf('function renderReferenceStatus()'),'Status UI requires data initialized');
assert(html.includes('if(!value){value=REFERENCE_BASELINE[k]'),'Offline safe default must remain');
assert(html.includes('const ARIZONA_RULES=REFERENCE_DATA.arizona;'),'Arizona default tax rule remains');
console.log('PASS: tax reference UI, safe links, loaded metadata, fallback, localization');
