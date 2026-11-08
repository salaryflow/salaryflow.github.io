import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

process.env.TZ = 'America/Phoenix';
const html = readFileSync('index.html', 'utf8');
const slice = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to, a);
  assert(a >= 0 && b > a, 'Missing block ' + from);
  return html.slice(a, b);
};
const paydayBlock = slice('// Paydays: weekly/biweekly', 'const TAX_STATES=');
const otBlock = slice('// No Tax on Overtime', 'function progressive(');

// ---------- paydays ----------
const ctx = {startDay: d => new Date(d.getFullYear(), d.getMonth(), d.getDate())};
vm.createContext(ctx);
vm.runInContext(paydayBlock + ';globalThis.around=paydaysAround;', ctx);
const iso = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const check = (job, now, prev, next, label) => {
  const r = ctx.around(job, now);
  assert.equal(iso(r.next), next, label + ' next');
  assert.equal(iso(r.prev), prev, label + ' prev');
};

// Biweekly from a reference payday, before/on/after payday; anchor can be in the future.
const bi = {frequency: 'biweekly', payAnchor: '2026-11-13', hireDate: '2024-01-01'};
check(bi, new Date(2026, 10, 8, 14), '2026-10-30', '2026-11-13', 'biweekly before');
check(bi, new Date(2026, 10, 13, 9), '2026-10-30', '2026-11-13', 'biweekly on payday');
check(bi, new Date(2026, 10, 14, 9), '2026-11-13', '2026-11-27', 'biweekly after payday');
check({...bi, payAnchor: '2027-03-05'}, new Date(2026, 10, 8), '2026-10-30', '2026-11-13', 'future anchor');
// Without an anchor: first Friday on/after hire date.
check({frequency: 'weekly', payAnchor: '', hireDate: '2026-11-02'}, new Date(2026, 10, 8), '2026-11-06', '2026-11-13', 'weekly default');
// Semimonthly default: 15th and month end; 2026-11-15 is a Sunday -> Friday 11/13.
check({frequency: 'semimonthly'}, new Date(2026, 10, 8), '2026-10-30', '2026-11-13', 'semimonthly weekend 15th');
check({frequency: 'semimonthly'}, new Date(2026, 10, 14), '2026-11-13', '2026-11-30', 'semimonthly month end');
// Custom days 5 and 20: 2026-12-05 is a Saturday -> Friday 12/04.
const j1 = {frequency: 'semimonthly', payDays: [5, 20]};
check(j1, new Date(2026, 10, 8), '2026-11-05', '2026-11-20', 'semimonthly 5/20');
check(j1, new Date(2026, 10, 21), '2026-11-20', '2026-12-04', 'semimonthly 5/20 Saturday');
// Bank holidays move back to the previous business day.
check({frequency: 'semimonthly', payDays: [11, 26]}, new Date(2026, 10, 2), '2026-10-26', '2026-11-10', 'Veterans Day (Wed 11/11)');
check({frequency: 'semimonthly', payDays: [11, 26]}, new Date(2026, 10, 12), '2026-11-10', '2026-11-25', 'Thanksgiving (Thu 11/26)');
check({frequency: 'monthly', payDays: [1]}, new Date(2026, 11, 20), '2026-12-01', '2026-12-31', 'New Year (Fri 1/1/2027) -> 12/31');
check({frequency: 'monthly', payDays: [5]}, new Date(2027, 6, 1), '2027-06-04', '2027-07-02', 'July 4 observed Mon 7/5/2027 -> Fri 7/2');
// Saturday holiday is not observed by the Fed: 2027-12-25 is Saturday -> weekend rule -> Friday 12/24.
check({frequency: 'monthly', payDays: [25]}, new Date(2027, 11, 1), '2027-11-24', '2027-12-24', 'Christmas on Saturday (11/25 is Thanksgiving)');
// A biweekly Friday payday that is a holiday moves to Thursday (2026-12-25 Fri).
check({frequency: 'biweekly', payAnchor: '2026-12-11'}, new Date(2026, 11, 20), '2026-12-11', '2026-12-24', 'biweekly holiday Friday');
// Monthly: default month end (2026-10-31 is a Saturday), or the reference day clamped to short months.
check({frequency: 'monthly', payAnchor: ''}, new Date(2026, 10, 8), '2026-10-30', '2026-11-30', 'monthly default');
check({frequency: 'monthly', payAnchor: '2026-01-31'}, new Date(2027, 1, 10), '2027-01-29', '2027-02-26', 'monthly clamp to Feb');
// DST: Phoenix has none, but the arithmetic must be DST-safe elsewhere too.
process.env.TZ = 'America/New_York';
check(bi, new Date(2026, 2, 9), '2026-03-06', '2026-03-20', 'biweekly across DST');

// ---------- No Tax on Overtime ----------
const brackets = {single: {ded: 16100, br: [12400, 50400, 105700, 201775, 256225, 640600]}, mfj: {ded: 32200, br: [24800, 100800, 211400, 403550, 512450, 768700]}, mfs: {ded: 16100, br: [12400, 50400, 105700, 201775, 256225, 384350]}};
const progressive = (value, limits) => {const rates = [.10, .12, .22, .24, .32, .35, .37]; let x = Math.max(0, value), prev = 0, total = 0; for (let i = 0; i < rates.length; i++) {const upper = i < limits.length ? limits[i] : Infinity; total += Math.max(0, Math.min(x, upper) - prev) * rates[i]; prev = upper; if (x <= upper) break} return total};
let windows = [];
const ot = {
  REFERENCE_DATA: {years: {tax: 2026}}, TAX2026: brackets, progressive, earningsRevision: 0,
  num: (v, max = 1e9) => Math.max(0, Math.min(max, Number(v) || 0)), paidHours: j => j.hours,
  overtimeWindows: () => windows, config: {filing: 'single', outside: 0, flsaOvertime: true, jobs: [{gross: 104000, weekdays: [1, 2, 3, 4, 5], hours: 8}]},
};
vm.createContext(ot);
vm.runInContext(otBlock + ';globalThis.deduct=overtimeDeduction;globalThis.bump=()=>earningsRevision++;', ot);
// $104,000 / 2080h = $50/h. 200h at 1.5x = $15,000 OT gross, $5,000 premium.
const hourly = h => {const now = new Date(2026, 5, 1).getTime() / 1000; return [{start: now, end: now + h * 3600, multiplier: 1.5}]};
windows = hourly(200);
let r = ot.deduct({gross: 104000, pretax: 0});
assert(Math.abs(r.gross - 15000) < 1e-6 && Math.abs(r.premium - 5000) < 1e-6, 'Premium is only the extra 0.5x');
assert(Math.abs(r.deduction - 5000) < 1e-6, 'Under cap and threshold: full premium');
const base = 104000 + 15000 - 16100;
assert(Math.abs(r.saving - (progressive(base, brackets.single.br) - progressive(base - 5000, brackets.single.br))) < 1e-6, 'Saving uses marginal federal brackets');

// Cap: 1,000h premium = $25,000 > $12,500 single cap.
windows = hourly(1000); ot.bump();
r = ot.deduct({gross: 104000, pretax: 0});
assert.equal(r.capped, 12500, 'Single cap $12,500');
// Phase-out: MAGI = 104,000 + 75,000 = 179,000 -> reduction 2,900.
assert(Math.abs(r.deduction - (12500 - 2900)) < 1e-6, 'Phase-out reduces by 10% of MAGI over $150k');

// MFJ: $25,000 cap, $300k threshold.
ot.config.filing = 'mfj'; ot.bump();
r = ot.deduct({gross: 104000, pretax: 0});
assert.equal(r.deduction, 25000, 'MFJ cap $25,000, no phase-out under $300k');
// MFS: not allowed.
ot.config.filing = 'mfs'; ot.bump();
assert.equal(ot.deduct({gross: 104000, pretax: 0}).deduction, 0, 'MFS cannot claim');
// Toggle off and out-of-range years.
ot.config.filing = 'single'; ot.config.flsaOvertime = false; ot.bump();
assert.equal(ot.deduct({gross: 104000, pretax: 0}).deduction, 0, 'Off unless the user opts in');
ot.config.flsaOvertime = true; ot.REFERENCE_DATA.years.tax = 2029; ot.bump();
assert.equal(ot.deduct({gross: 104000, pretax: 0}).deduction, 0, 'Sunsets after 2028');
// Straight-time "overtime" (1.0x) has no premium.
ot.REFERENCE_DATA.years.tax = 2026; windows = [{...hourly(100)[0], multiplier: 1}]; ot.bump();
assert.equal(ot.deduct({gross: 104000, pretax: 0}).premium, 0, '1.0x has no premium');

console.log('PASS: paydays (weekly/biweekly/semimonthly/monthly, weekends, DST) and No Tax on Overtime cap, phase-out, MFS, sunset');
