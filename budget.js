// Domain maths for the budget. Terms follow CONTEXT.md.

const PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 };

export function toMonthly(amount, cycle) {
  const n = PER_YEAR[cycle.trim().toLowerCase()];
  if (!n) throw new Error(`Unknown Cycle: "${cycle}"`);
  return (amount * n) / 12;
}

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
// Shared Income stays at Household level; Shared Costs and Savings Goals reach Members via the Split.
export function summarize(entries, split) {
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
    if (e.owner || e.kind === 'income') continue;
    for (const [m, share] of Object.entries(splitCost(e.amount, incomes, split))) members[m][field[e.kind]] += share;
  }
  for (const t of [household, ...Object.values(members)]) t.leftOver = t.income - t.costs - t.savings;
  return { household, members };
}
