import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
assert(html.includes('.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),'Desktop should show two columns');
assert(html.includes('@media(max-width:400px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))'),'Mobile must retain two columns');
assert(!html.includes('.stats,.form{grid-template-columns:1fr}'),'Mobile must not collapse stats to one column');
for(const type of ['week','month','year','day'])assert(html.includes('data-money="'+type+'"'),'Missing '+type+' card');
console.log('PASS: four earnings stats form a 2x2 grid across desktop/mobile');
