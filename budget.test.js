import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly, fromMonthly, splitCost, summarize, takeHome } from './budget.js';

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
