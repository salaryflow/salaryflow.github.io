import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const checks=[
 ['Monthly dashboard stat', 'data-money="month"'],
 ['Monthly privacy button', 'data-hide="month"'],
 ['Month-to-date localization', '"이번 달 수입": "Earned this month"'],
 ['Month begins at local midnight on first day', 'new Date(now.getFullYear(),now.getMonth(),1).getTime()/1000'],
 ['Monthly earnings cache precomputes up to midnight', 'monthBase:elapsedWork(monthS,dayS,j)*sr'],
 ['Monthly total includes current calendar day', 'snapshot.monthBase+periodEarned'],
 ['Month display uses shared currency formatting', "setMoney('month',snapshot.monthBase+periodEarned,0)"],
 ['Month participates in hide all', "'lifetime','week','month','year','day'"],
 ['Week remains Monday start', 'monday.setDate(monday.getDate()-dow)'],
 ['Year remains January 1 start', 'new Date(now.getFullYear(),0,1).getTime()/1000']
];
for(const [label,value] of checks)assert(html.includes(value),label);
assert.equal((html.match(/data-money="month"/g)||[]).length,1,'Only one monthly amount card');
assert.equal((html.match(/data-hide="month"/g)||[]).length,1,'Only one monthly privacy control');
console.log('PASS: month-to-date, weekly/yearly scope, privacy and localization');
