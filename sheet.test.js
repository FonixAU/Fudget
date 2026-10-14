import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCells, zip, unzip, fillWorkbook, workbookCells } from './sheet.js';

const sheet = '<worksheet><sheetData><row r="4"><c r="B4" s="29" t="s"><v>21</v></c><c r="C4" s="31"><v>3331.36</v></c><c r="H4" s="43"><f>SUM(C4,1)</f><v>3332.36</v></c></row></sheetData></worksheet>';

test('setCells writes an input into the workbook cell, keeping its style', () => {
  assert.equal(setCells(sheet, { C4: 2400 }).match(/<c r="C4".*?<\/c>/)[0], '<c r="C4" s="31"><v>2400</v></c>');
});

test('setCells writes text, ticks, formulas and blanks, and drops stale formula results so they recalculate', () => {
  const out = setCells(sheet, { B4: 'Rent & bills', C4: { f: 'B3*0.05' }, B5: true });
  assert.match(out, /<c r="B4" s="29" t="inlineStr"><is><t xml:space="preserve">Rent &amp; bills<\/t><\/is><\/c>/);
  assert.match(out, /<c r="C4" s="31"><f>B3\*0.05<\/f><\/c>/);
  assert.match(out, /<c r="H4" s="43"><f>SUM\(C4,1\)<\/f><\/c>/);
  assert.match(setCells(sheet, { C4: null }), /<c r="C4" s="31"\/>/);
});

test('setCells adds cells the sheet has never used, in column and row order', () => {
  const out = setCells(sheet, { D4: 7, A9: 'x', A2: 1 });
  assert.match(out, /<sheetData><row r="2"><c r="A2"><v>1<\/v><\/c><\/row><row r="4">.*<c r="C4" s="31">.*?<\/c><c r="D4"><v>7<\/v><\/c><c r="H4"/);
  assert.match(out, /<\/row><row r="9"><c r="A9" t="inlineStr">.*<\/c><\/row><\/sheetData>/);
});

test('zip and unzip round-trip the parts of an xlsx', async () => {
  const parts = new Map([['xl/workbook.xml', '<workbook/>'.repeat(50)], ['[Content_Types].xml', '<Types/>']]);
  const back = await unzip(await zip(parts));
  assert.deepEqual([...back].map(([n, b]) => [n, new TextDecoder().decode(b)]), [...parts]);
});

test('fillWorkbook writes cells into the tab with that name and asks Excel to recalculate on open', async () => {
  const book = await zip(new Map([
    ['xl/workbook.xml', '<workbook><sheets><sheet state="visible" name="Goals &amp; Options" sheetId="2" r:id="rId6"/></sheets><definedNames/><calcPr/></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId6" Type="x" Target="worksheets/sheet2.xml"/></Relationships>'],
    ['xl/worksheets/sheet2.xml', sheet],
  ]));
  const out = await unzip(await fillWorkbook(book, { 'Goals & Options': { C4: 8 } }));
  const text = name => new TextDecoder().decode(out.get(name));
  assert.match(text('xl/worksheets/sheet2.xml'), /<c r="C4" s="31"><v>8<\/v><\/c>/);
  assert.match(text('xl/workbook.xml'), /<calcPr fullCalcOnLoad="1"\/>/);
});

const state = {
  members: [
    { id: 'p1', name: 'Alex', salaryPackage: 90000, hecs: false, sacrifice: 100, bankStart: 10000, bankRate: 0.05, taxInterest: true, fund: 0, superStart: 0 },
    { id: 'p2', name: 'Sam', salaryPackage: 70000, hecs: true, sacrifice: 0, bankStart: 5000, bankRate: 0.04, taxInterest: false, fund: 5, superStart: 2000 },
  ],
  active: 0,
  scenarios: [{
    name: 'Current Budget', split: 'income', pool: false, roommate: { mode: 'income', amount: 200, cycle: 'weekly' },
    costs: [
      { name: 'Rent', owner: '', amount: 2400, cycle: 'monthly' },
      { name: 'Groceries', owner: '', amount: 250, cycle: 'weekly' },
      { name: 'Car rego', owner: 'p1', amount: 900, cycle: 'yearly' },
    ],
    allocations: [{ name: 'General', amount: 600, kind: 'cost' }, { name: 'Savings', amount: 1500, kind: 'saving' }],
  }],
  house: { value: 600000, depositPct: 0.05, govPct: 0, firstHome: true, rate: 0.0549, years: 30, rego: 121.4, title: 36.2, conveyancing: 2000, stocks: 0, gift: 0, extras: 0, cushion: 0 },
  goals: { emergencyMonths: 6, extra: 1000 },
};

test('workbookCells lays each Variation out in a Budgeting block: Shared Costs, each Member\'s Costs, Allocations and settings', () => {
  const b = workbookCells(state, { p1: 900, p2: 600 }).Budgeting;
  assert.deepEqual([b.K2, b.D3, b.F3, b.B4, b.C4, b.B5, b.C5, b.B6, b.D4, b.E4, b.F4], ['', 'Alex', 'Sam', 'Rent', 2400, 'Groceries', 250 * 52 / 12, null, 'Car rego', 75, null]);
  assert.deepEqual([b.B2, b.H10, b.I10, b.H13, b.I13, b.I14], ['Current Budget', false, true, false, true, 200 * 52 / 12]);
  assert.deepEqual([b.C19, b.D19, b.C21, b.C23, b.F23, b.C25], [600, 'General', null, 1500, 'Savings', null]);
  assert.deepEqual(b.E23, { f: 'IF(I10,C23*H7,C23*0.5)' });
});

test('workbookCells fills each Member\'s Income block, leaving HECS out of the formulas for a Member without a debt', () => {
  const i = workbookCells(state, { p1: 900, p2: 600 }).Income;
  assert.deepEqual([i.K4, i.K8, i.J16, i.K22, i.K26, i.J34], [90000, 100, 'Alex', 70000, 0, 'Sam']);
  assert.deepEqual([i.F5, i.F6, i.F9, i.F10], [{ f: 'E5' }, { f: '0' }, { f: 'E9' }, { f: '0' }]);
  assert.deepEqual([i.F23, i.F24, i.F27, i.F28], [{ f: 'E23-ROUND(D23*0.035,0)' }, { f: 'ROUND(D23*0.035,0)' }, { f: 'E27-ROUND(D23*0.035,0)' }, { f: 'ROUND(D23*0.035,0)' }]);
});

test('workbookCells fills both savings tabs: monthly Savings Goals, bank, interest tax and super fund per Member', () => {
  const c = workbookCells(state, { p1: 900, p2: 600 });
  assert.deepEqual([c['Basic Savings'].G13, c['Basic Savings'].G30], [900, 600]);
  const a = c['Advanced Savings'];
  assert.deepEqual([a.J5, a.G3, a.F6, a.F9, a.G12, a.G14], ['Alex', 0.05, true, 'Aware Super', 10000, 0]);
  assert.deepEqual([a.J21, a.G20, a.F23, a.F26, a.G29, a.G31], ['Sam', 0.04, false, 'Rest', 5000, 2000]);
});

test('workbookCells fills the House inputs and the three mortgage options: all to repayments, all to offset, half each', () => {
  const c = workbookCells(state, {}), h = c['Housing Costs'], g = c['Goals & Options'];
  assert.deepEqual([h.B3, h.B5, h.C5, h.D13, h.D15, h.D17, h.E4, h.E6, h.E7, h.G13], [600000, { f: 'B3*0.05' }, { f: 'B3*0' }, true, 30, 0.0549, 121.4, 36.2, 2000, 0]);
  assert.deepEqual([g.C4, g.L7, g.M7, g.N7, g.O7, g.P7, g.Q7], [6, 1000, 0, 0, 1000, 500, 500]);
});
