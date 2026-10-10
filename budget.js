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

// Flow every entry, converted to monthly, into Household and Member totals.
// entry: { kind: 'income'|'cost'|'saving', owner: Member name or null for Shared, amount, cycle }.
// Shared Costs and Savings Goals reach Members via `split`; Shared Income via `sharedIncome`
// ('none' keeps it at Household level). Splits weigh Members by their own Income only.
export function summarize(entries, { split, sharedIncome = 'none' }) {
  const blank = () => ({ income: 0, costs: 0, savings: 0, leftOver: 0 });
  const household = blank(), members = {};
  const field = { income: 'income', cost: 'costs', saving: 'savings' };
  const monthly = entries.map(e => ({ ...e, amount: toMonthly(e.amount, e.cycle) }));

  for (const e of monthly) {
    household[field[e.kind]] += e.amount;
    if (e.owner) (members[e.owner] ??= blank())[field[e.kind]] += e.amount;
  }
  const incomes = Object.fromEntries(Object.entries(members).map(([m, t]) => [m, t.income]));
  for (const e of monthly) {
    if (e.owner) continue;
    const method = e.kind === 'income' ? sharedIncome : split;
    for (const [m, share] of Object.entries(splitCost(e.amount, incomes, method))) members[m][field[e.kind]] += share;
  }
  for (const t of [household, ...Object.values(members)]) t.leftOver = t.income - t.costs - t.savings;
  return { household, members };
}
