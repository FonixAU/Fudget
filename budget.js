// Domain maths for the budget. Terms follow CONTEXT.md.

const PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 };

function perYear(cycle) {
  const n = PER_YEAR[cycle.trim().toLowerCase()];
  if (!n) throw new Error(`Unknown Cycle: "${cycle}"`);
  return n;
}

export const toMonthly = (amount, cycle) => (amount * perYear(cycle)) / 12;
export const fromMonthly = (amount, cycle) => (amount * 12) / perYear(cycle);

// Divide a Shared Cost between Members. incomes: { member: monthly Income }.
export function splitCost(amount, incomes, method) {
  const members = Object.keys(incomes);
  if (method === 'none') return {};
  const total = Object.values(incomes).reduce((a, b) => a + b, 0);
  if (method === 'equal' || !total) return Object.fromEntries(members.map(m => [m, amount / members.length]));
  return Object.fromEntries(Object.entries(incomes).map(([m, inc]) => [m, (amount * inc) / total]));
}

const FIELD = { income: 'income', cost: 'costs', saving: 'savings' };

// Each entry converted to monthly, with the share every Member carries.
// entry: { kind: 'income'|'cost'|'saving', owner: Member name or null for Shared, amount, cycle }.
// Shared Costs and Savings Goals reach Members via `split`; Shared Income via `sharedIncome`
// ('none' keeps it at Household level). `pool` splits Members' own Costs and Savings Goals too.
// Splits weigh Members by their own Income only.
export function shares(entries, { split, sharedIncome = 'none', pool = false }) {
  const monthly = entries.map(e => ({ ...e, monthly: toMonthly(e.amount, e.cycle) }));
  const incomes = {};
  for (const e of monthly) if (e.owner) incomes[e.owner] = (incomes[e.owner] ?? 0) + (e.kind === 'income' ? e.monthly : 0);
  return monthly.map(e => ({
    ...e,
    byMember: e.owner && !(pool && e.kind !== 'income') ? { [e.owner]: e.monthly } : splitCost(e.monthly, incomes, e.kind === 'income' ? sharedIncome : split),
  }));
}

// Flow every entry into Household and Member totals, ending in Left Over.
export function summarize(entries, options) {
  const blank = () => ({ income: 0, costs: 0, savings: 0, leftOver: 0 });
  const household = blank(), members = {};
  for (const e of shares(entries, options)) {
    household[FIELD[e.kind]] += e.monthly;
    for (const [m, amt] of Object.entries(e.byMember)) (members[m] ??= blank())[FIELD[e.kind]] += amt;
  }
  for (const t of [household, ...Object.values(members)]) t.leftOver = t.income - t.costs - t.savings;
  return { household, members };
}

// Tax-year rates. 2024-25 mirrors the original spreadsheet; 2026-27 is current law.
// ponytail: Medicare low-income threshold and Division 293 ignored; add if incomes near those edges matter.
export const RATES = {
  '2024-25': {
    super: 0.115,
    brackets: [[18200, 0.16], [45000, 0.30], [135000, 0.37], [190000, 0.45]],
    hecs: base => base * 0.035, // the sheet's flat approximation
  },
  '2026-27': {
    super: 0.12,
    brackets: [[18200, 0.15], [45000, 0.30], [135000, 0.37], [190000, 0.45]],
    // Marginal HELP repayments; thresholds are 2025-26's (latest published when written).
    hecs: inc => (inc <= 67000 ? 0 : inc <= 125000 ? (inc - 67000) * 0.15 : 8700 + (inc - 125000) * 0.17),
  },
};

const cents = n => Math.round(n * 100) / 100;

function incomeTax(taxable, brackets) {
  let tax = 0;
  brackets.forEach(([from, rate], i) => {
    const to = brackets[i + 1]?.[0] ?? Infinity;
    if (taxable > from) tax += (Math.min(taxable, to) - from) * rate;
  });
  return tax;
}

const lito = inc => (inc <= 37500 ? 700 : inc <= 45000 ? 700 - (inc - 37500) * 0.05 : inc <= 66667 ? 325 - (inc - 45000) * 0.015 : 0);

// Yearly figures for one Member. salaryPackage includes super; sacrifice is monthly Salary Sacrifice into super.
export function takeHome({ salaryPackage = 0, hecs = false, sacrifice = 0 }, year) {
  const r = RATES[year];
  const base = salaryPackage / (1 + r.super);
  const taxable = base - sacrifice * 12;
  const gross = incomeTax(taxable, r.brackets);
  const offset = Math.min(lito(taxable), gross); // LITO is non-refundable
  const out = {
    base,
    superGross: base * r.super + sacrifice * 12,
    tax: gross,
    lito: offset,
    medicare: taxable * 0.02,
    hecs: hecs ? r.hecs(base) : 0, // HELP income adds sacrificed super back, so use base
  };
  out.superNet = out.superGross * 0.85;
  out.takeHome = taxable - gross + offset - out.medicare - out.hecs;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, cents(v)]));
}

// Balance after `years` of monthly deposits made at the start of each month.
// Interest is taxed at taxRate; yearlyFee(balance) is charged at each year end (super fund fees).
export function project({ monthly, start = 0, annualRate, taxRate = 0, years, yearlyFee = () => 0 }) {
  const r = (annualRate / 12) * (1 - taxRate);
  let bal = start;
  for (let m = 1; m <= years * 12; m++) {
    bal = (bal + monthly) * (1 + r);
    if (m % 12 === 0) bal -= yearlyFee(bal);
  }
  return cents(bal);
}

// Yearly fees for a super fund at a balance. cap limits only the % admin fee; null means no cap.
export const superFee = (f, bal) => cents(f.fixed + Math.min(f.pctAUM * bal, f.cap ?? Infinity) + f.investFee * bal);

// Victorian land transfer duty. First home buyers pay none to $600k, then a sliding share to full duty at $750k.
// ponytail: VIC only, no principal-place-of-residence or off-the-plan concessions; add a state selector if you move.
export function stampDuty(value, firstHome) {
  const duty = value <= 25000 ? value * 0.014 : value <= 130000 ? 350 + (value - 25000) * 0.024
    : value <= 960000 ? 2870 + (value - 130000) * 0.06 : value * 0.055;
  if (!firstHome || value > 750000) return cents(duty);
  return value <= 600000 ? 0 : cents((duty * (value - 600000)) / 150000);
}
// Monthly payment that clears `loan` over `years` at `rate` p.a.
const pmt = (loan, rate, years) => {
  const r = rate / 12, n = years * 12;
  return r ? (loan * r) / (1 - (1 + r) ** -n) : loan / n;
};
export const repayment = (loan, rate, years) => cents(pmt(loan, rate, years));
// Month-by-month loan with optional extra repayments and monthly deposits into an offset account.
// Ends when the offset can clear the balance. `left` is what stays in the offset after paying out.
export function payoff({ loan, rate, years, extra = 0, offset = 0 }) {
  const pay = pmt(loan, rate, years), r = rate / 12;
  let bal = loan, off = 0, interest = 0, months = 0;
  while (bal - off > 0.005 && months < 1200) { // half a cent absorbs float drift
    const i = Math.max(bal - off, 0) * r;
    interest += i;
    bal += i - pay - extra;
    off += offset;
    months++;
  }
  return { months, interest: cents(interest), left: cents(off - Math.max(bal, 0)) };
}
