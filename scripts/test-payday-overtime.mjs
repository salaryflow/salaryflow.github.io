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
const whBlock = slice('// Multi-job withholding', '// Paydays: weekly/biweekly');

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

// ---------- company holidays move paydays ----------
check({frequency: 'semimonthly', payDays: [5, 20], holidays: ['2026-11-20']}, new Date(2026, 10, 8), '2026-11-05', '2026-11-19', 'company holiday on payday');
check({frequency: 'semimonthly', payDays: [5, 20], holidays: ['2026-11-20', '2026-11-19']}, new Date(2026, 10, 8), '2026-11-05', '2026-11-18', 'consecutive company holidays');
check({frequency: 'semimonthly', payDays: [5, 20], holidays: ['bogus']}, new Date(2026, 10, 8), '2026-11-05', '2026-11-20', 'invalid holiday ignored');
process.env.TZ = 'America/Phoenix';
const left = vm.runInContext('remainingPaydaysThisYear', ctx);
assert.equal(left({frequency: 'semimonthly', payDays: [5, 20]}, new Date(2026, 10, 8)), 3, '11/20, 12/4, 12/18 remain');

// ---------- multi-job withholding ----------
const wctx = {
  TAX2026: brackets, progressive, num: (v, max = 1e9) => Math.max(0, Math.min(max, Number(v) || 0)),
  PAYROLL_RULES: {socialSecurityWageBase: 184500, socialSecurityRate: .062, medicareRate: .0145, additionalMedicareRate: .009, additionalMedicareThresholds: {single: 200000, mfj: 250000, mfs: 125000, hoh: 200000}},
  annualBonus: j => Number(j.gross) * Number(j.aipPercent || 0) / 100 + Number(j.extraBonus || 0),
  pretax401Annual: j => Number(j.pretax401 || 0), remainingPaydaysThisYear: () => 4,
  config: {filing: 'single', w4Status: 'match', w4Step2: false, w4Extra: 0, hsa: 0, extraDeduction: 0, outside: 0,
    jobs: [{name: 'J1', gross: 120000}, {name: 'J2', gross: 120000}]},
};
wctx.totalComp = j => Number(j.gross) + wctx.annualBonus(j);
vm.createContext(wctx);
vm.runInContext(whBlock + ';globalThis.wh=withholdingCheck;', wctx);
const fed = progressive(240000 - 16100, brackets.single.br);
let w = wctx.wh({gross: 240000, federal: fed});
const perJob = progressive(120000 - 16100, brackets.single.br);
assert(Math.abs(w.withheld - 2 * perJob) < 1e-6, 'Each employer withholds as if it were the only job');
assert(Math.abs(w.ssCredit - (2 * 120000 - 184500) * .062) < 1e-6, 'Excess Social Security comes back as a credit');
assert(Math.abs(w.federal - (fed + 40000 * .009)) < 1e-6, 'Additional Medicare not withheld by either employer is owed');
assert(Math.abs(w.balance - (fed + 360 - 2 * perJob - 3441)) < 1e-6, 'Balance = tax - withholding - SS credit');
assert(w.balance > 0 && Math.abs(w.perCheck - w.balance / 4) < 1e-9, 'Shortfall spread over remaining paychecks');
// Step 2(c) halves the brackets and deduction for each job, which closes most of the gap.
wctx.config.w4Step2 = true;
const w2 = wctx.wh({gross: 240000, federal: fed});
assert(w2.withheld > w.withheld && Math.abs(w2.balance) < Math.abs(w.balance), 'Step 2 increases withholding');
// Extra 4(c) withholding reduces the balance one-for-one; bonuses use 22%.
wctx.config.w4Step2 = false; wctx.config.w4Extra = 1000;
assert(Math.abs(wctx.wh({gross: 240000, federal: fed}).balance - (w.balance - 1000)) < 1e-6, '4(c) extra withholding');
wctx.config.w4Extra = 0; wctx.config.jobs = [{name: 'J1', gross: 100000, extraBonus: 10000}];
const wb = wctx.wh({gross: 110000, federal: 0});
assert(Math.abs(wb.withheld - (progressive(100000 - 16100, brackets.single.br) + 2200)) < 1e-6, 'Bonus at the 22% supplemental rate');

console.log('PASS: paydays (frequencies, weekends, bank and company holidays, DST), multi-job withholding, and No Tax on Overtime cap, phase-out, MFS, sunset');
