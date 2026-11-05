import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('function drawJobs(){');
const end=html.indexOf(" document.querySelectorAll('.job').forEach",start);
assert(start>=0&&end>start,'Could not find Job renderer');
const draw=html.slice(start,end);
assert(draw.includes(".join('')}</div></div></div><section class=\"overtime-panel\""),'Close workday field and schedule grid before overtime panel');
assert(draw.includes('<section class="overtime-panel" aria-label='),'Use dedicated overtime panel');
assert(draw.includes('<div class="overtime-grid">'),'Overtime requires its own grid');
assert(draw.includes('</p></div></div></section><section class="overtime-recurring"'),'Today overtime panel closes before recurring settings');
assert(draw.includes('</p></div></section><p class="job-note">예상 연간 보너스:'),'Recurring overtime panel closes before compensation summary');
assert(draw.includes('data-weekly-day=')&&draw.includes('data-weekly-ot="enabled"'),'Recurring controls must be rendered');
assert(draw.includes("tr('오늘 초과근무 사용','Enable today’s overtime')"),'Toggle label is explicit');
assert(draw.includes('data-ot="enabled" type="checkbox" role="switch"'),'Overtime uses accessible toggle');
assert(draw.includes('data-ot-details'),'Optional overtime fields are grouped');
assert(draw.includes('data-ot-state'),'Toggle shows current state');
assert(html.includes('.overtime-details[hidden]{display:none!important}'),'Closed toggle must hide fields');
for(const control of ['enabled','startTime','hours','multiplier','custom']){
 assert(draw.includes('data-ot="'+control+'"'),'Missing overtime '+control+' control');
}
assert(html.includes('.overtime-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'),'Desktop: two columns');
assert(html.includes('@media(max-width:520px){.overtime-panel{padding:13px}.overtime-grid{grid-template-columns:1fr}'),'Mobile: one column');
assert(html.includes('.overtime-grid .field{min-width:0}'),'Prevent overflow');
assert(html.includes('background:linear-gradient(135deg,#e8f7ee,#edf6ff)'),'Overtime panel must contrast with surrounding Job settings');
assert(draw.includes("tr('초과근무 시작 시각','Overtime start time')"),'Start time needs an explicit labeled field');
assert(draw.includes('data-ot="startTime" type="time"'),'Overtime start should use a time picker');
assert(draw.includes("tr('직접 배수 입력 (0~10×)','Enter multiplier (0–10×)')"),'Custom multiplier should be clearly labeled');
assert(!draw.includes("!todaysOvertime(j).enabled||[0,1,1.5,2].includes"),'Custom multiplier must not be locked by preset');
const overtimeMarkup=draw.slice(draw.indexOf('<section class="overtime-panel"'),draw.indexOf('</section>')+10);
assert(!overtimeMarkup.includes('<div class="form">'),'Avoid nested generic form grid');
console.log('PASS: isolated overtime panel, responsive grid, preserved controls');
