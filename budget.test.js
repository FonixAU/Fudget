import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly, fromMonthly, splitCost, summarize, takeHome, project, superFee, stampDuty, repayment, payoff, fhssRelease, marginalRate, novatedLease } from './budget.js';

test('toMonthly converts each Cycle to a monthly amount', () => {
  assert.deepEqual(
    ['weekly', 'Fortnightly', 'monthly', 'quarterly', 'yearly'].map(c => toMonthly(1200, c)),
    [5200, 2600, 1200, 400, 100],
  );
});

test('splitCost by income divides a Shared Cost in proportion to each Member\'s Income', () => {
  assert.deepEqual(splitCost(1000, { Alex: 6000, Sam: 4000 }, 'income'), { Alex: 600, Sam: 400 });
});

test('splitCost equal gives every Member the same share regardless of Income', () => {
  assert.deepEqual(splitCost(900, { Alex: 6000, Sam: 4000, Jo: 0 }, 'equal'), { Alex: 300, Sam: 300, Jo: 300 });
});

test('splitCost none leaves the Shared Cost at Household level, charging no Member', () => {
  assert.deepEqual(splitCost(900, { Alex: 6000, Sam: 4000 }, 'none'), {});
});

test('splitCost by income falls back to equal when no Member has Income', () => {
  assert.deepEqual(splitCost(500, { Alex: 0, Sam: 0 }, 'income'), { Alex: 250, Sam: 250 });
});

test('summarize flows Income through Costs, Savings Goals and Splits to Left Over', () => {
  const entries = [
    { kind: 'income', owner: 'Alex', amount: 6000, cycle: 'monthly' },
    { kind: 'income', owner: 'Sam', amount: 12000, cycle: 'quarterly' }, // 4000/month
    { kind: 'income', owner: null, amount: 500, cycle: 'monthly' }, // Shared Income (rent received)
    { kind: 'cost', owner: null, amount: 2000, cycle: 'monthly' }, // Shared Cost, split 60/40
    { kind: 'cost', owner: 'Alex', amount: 50, cycle: 'monthly' },
    { kind: 'saving', owner: null, amount: 1200, cycle: 'yearly' }, // 100/month, split 60/40
  ];
  assert.deepEqual(summarize(entries, { split: 'income' }), {
    household: { income: 10500, costs: 2050, savings: 100, leftOver: 8350 },
    members: {
      Alex: { income: 6000, costs: 1250, savings: 60, leftOver: 4690 },
      Sam: { income: 4000, costs: 800, savings: 40, leftOver: 3160 },
    },
  });
});

test('summarize can share Shared Income out to Members by the chosen Split', () => {
  const entries = [
    { kind: 'income', owner: 'Alex', amount: 6000, cycle: 'monthly' },
    { kind: 'income', owner: 'Sam', amount: 4000, cycle: 'monthly' },
    { kind: 'income', owner: null, amount: 500, cycle: 'monthly' },
  ];
  const { household, members } = summarize(entries, { split: 'income', sharedIncome: 'equal' });
  assert.equal(household.income, 10500);
  assert.equal(members.Alex.income, 6250);
  assert.equal(members.Sam.leftOver, 4250);
});

test('fromMonthly shows a monthly amount in any Cycle', () => {
  assert.deepEqual(
    ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'].map(c => fromMonthly(5200, c)),
    [1200, 2400, 5200, 15600, 62400],
  );
});

test('takeHome runs a Salary Package through super, tax, LITO, Medicare and HECS for a tax year', () => {
  assert.deepEqual(takeHome({ salaryPackage: 112000, hecs: true }, '2026-27'), {
    base: 100000, superGross: 12000, superNet: 10200, tax: 20520, lito: 0, medicare: 2000, hecs: 4950, takeHome: 72530,
  });
});

test('takeHome never pays out LITO beyond the tax owed, so no income means no tax', () => {
  assert.equal(takeHome({ salaryPackage: 0 }, '2026-27').takeHome, 0);
  assert.equal(takeHome({ salaryPackage: 33600 }, '2026-27').takeHome, 28330); // 1770 tax - 700 LITO - 600 Medicare
});

test('takeHome with Salary Sacrifice lowers taxable income and moves the money into super', () => {
  const r = takeHome({ salaryPackage: 112000, hecs: true, sacrifice: 500 }, '2026-27');
  assert.deepEqual([r.tax, r.medicare, r.hecs, r.takeHome, r.superGross, r.superNet], [18720, 1880, 4950, 68450, 18000, 15300]);
});

test('takeHome with salary packaging: pre-tax lowers taxable income, post-tax comes out after tax, reportable benefits raise HELP income', () => {
  const r = takeHome({ salaryPackage: 112000, hecs: true, preTax: 10000, postTax: 2000, rfba: 5000 }, '2026-27');
  // taxable 90k: tax 17,520, Medicare 1,800; HELP income 100k - 10k + 5k = 95k -> 4,200
  assert.deepEqual([r.tax, r.medicare, r.hecs, r.takeHome, r.superGross], [17520, 1800, 4200, 64480, 12000]);
});

test('summarize with pool treats every Member\'s own Costs as Shared Costs (the sheet\'s "All Joint")', () => {
  const entries = [
    { kind: 'income', owner: 'Alex', amount: 6000, cycle: 'monthly' },
    { kind: 'income', owner: 'Sam', amount: 4000, cycle: 'monthly' },
    { kind: 'cost', owner: 'Alex', amount: 100, cycle: 'monthly' },
  ];
  const { members } = summarize(entries, { split: 'income', pool: true });
  assert.deepEqual([members.Alex.costs, members.Sam.costs], [60, 40]);
});

test('project grows monthly deposits (made at the start of each month) with interest net of tax', () => {
  assert.equal(project({ monthly: 1000, annualRate: 0.06, years: 1 }), 12397.24);
  assert.equal(project({ monthly: 1000, start: 5000, annualRate: 0.06, taxRate: 0.3, years: 1 }), 17490.62);
});

test('superFee matches a fund\'s published total fees at different balances', () => {
  const aware = { fixed: 52, pctAUM: 0.0015, cap: 750, investFee: 0.0078 };
  assert.deepEqual([100000, 500000].map(b => superFee(aware, b)), [982, 4702]);
});

test('stampDuty uses VIC rates, with the first home buyer exemption to $600k and sliding concession to $750k', () => {
  assert.equal(stampDuty(520000, false), 26270); // 2870 + 6% over 130k
  assert.equal(stampDuty(520000, true), 0);
  assert.equal(stampDuty(675000, true), 17785); // half of 35570
  assert.equal(stampDuty(800000, true), 43070);
  assert.equal(stampDuty(1000000, false), 55000);
});

test('repayment is the standard monthly loan payment', () => {
  assert.equal(repayment(400000, 0.06, 30), 2398.2);
});

test('payoff: extra repayments and offset savings clear the loan in the same NPER month', () => {
  const loan = { loan: 400000, rate: 0.06, years: 30 };
  assert.equal(payoff(loan).months, 360);
  const extra = payoff({ ...loan, extra: 500 }), offset = payoff({ ...loan, offset: 500 });
  assert.equal(extra.months, 235);
  assert.equal(offset.months, 235);
  assert.ok(Math.abs(extra.interest - offset.interest) < 1);
});

test('fhssRelease caps sacrificed contributions at $15k a year and $50k total, released after 15% tax', () => {
  assert.deepEqual([[1000, 3], [1000, 5], [1500, 2]].map(([m, y]) => fhssRelease(m, y)), [30600, 42500, 25500]);
});

test('marginalRate is the tax bracket rate a taxable income falls in', () => {
  assert.deepEqual([10000, 30000, 100000, 200000].map(i => marginalRate(i, '2026-27')), [0, 0.15, 0.3, 0.45]);
});

test('novatedLease: GST credit off the price, ATO minimum residual, payments in advance that leave exactly the residual', () => {
  const car = { price: 55000, kind: 'ev', years: 5, rate: 0.08, fuel: 1100, service: 550, insurance: 1650, rego: 900, fee: 550 };
  const l = novatedLease(car, '2026-27');
  assert.equal(l.gstCredit, 5000);
  assert.equal(l.residual, 14065); // 28.13% of the 50k financed
  assert.equal(l.payout, 15471.5); // residual + GST
  let bal = 50000;
  for (let m = 0; m < 60; m++) bal = (bal - l.payment) * (1 + 0.08 / 12);
  assert.ok(Math.abs(bal - l.residual) < 1);
  // running costs ex GST (rego has none) + fee ex GST
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.1, `${a} vs ${b}`); // payment is rounded to cents
  near(l.packageCost, l.payment * 12 + 3000 + 900 + 500);
  near(l.loanYearly, l.loanPayment * 12 + 4200);
});

test('novatedLease: an FBT-exempt EV is all pre-tax with a reportable benefit; other cars pay FBT away post-tax (ECM)', () => {
  const car = { price: 55000, years: 5, rate: 0.08, fuel: 1100, service: 550, insurance: 1650, rego: 900, fee: 550 };
  const ev = novatedLease({ ...car, kind: 'ev' }, '2026-27');
  assert.deepEqual([ev.preTax, ev.postTax, ev.rfba], [ev.packageCost, 0, 20754.8]); // 20% statutory value x 1.8868 gross-up
  const ice = novatedLease({ ...car, kind: 'ice' }, '2026-27');
  assert.deepEqual([ice.preTax, ice.postTax, ice.rfba], [Math.round((ice.packageCost - 10000) * 100) / 100, 11000, 0]);
  const ev25 = novatedLease({ ...car, kind: 'ev25' }, '2026-27');
  assert.deepEqual([ev25.postTax, ev25.rfba], [8250, 0]); // 25% FBT discount on EVs leased from April 2027 over $75k
  assert.equal(novatedLease({ ...car, price: 110000, kind: 'ice' }, '2026-27').gstCredit, 6353); // capped at the car limit
});

test('payoff: an existing offset balance counts against the loan from the first month', () => {
  const loan = { loan: 400000, rate: 0.06, years: 30 };
  const r = payoff({ ...loan, offsetStart: 50000 });
  assert.ok(r.months < 360);
  assert.equal(r.offset, 50000);
  assert.equal(payoff({ ...loan, offsetStart: 400000 }).months, 0);
});
