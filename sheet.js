// Export to the original "Budgeting + First Home Super Sacrifice" workbook.
// budget-template.xlsx is that workbook. We write the app's inputs into its input cells and keep every
// formula, style and tab, so Excel or Google Sheets recalculates it into the same spreadsheet.
import { toMonthly } from './budget.js';
import { FUNDS } from './funds.js';

const colNum = ref => [...ref.match(/^[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// A value is a number, text, tick box (boolean), { f: formula } or null for an empty cell.
function cellXml(ref, s, v) {
  if (v == null || v === '') return `<c r="${ref}"${s}/>`;
  if (typeof v === 'object') return `<c r="${ref}"${s}><f>${xmlEsc(v.f)}</f></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${+v}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

// Write values into a worksheet's XML, keeping each cell's style.
export function setCells(xml, cells) {
  for (const [ref, v] of Object.entries(cells)) {
    const cell = new RegExp(`<c r="${ref}"( s="\\d+")?[^>]*?(/>|>[\\s\\S]*?</c>)`);
    if (cell.test(xml)) { xml = xml.replace(cell, (_, s = '') => cellXml(ref, s, v)); continue; }
    const r = +ref.match(/\d+$/)[0], row = new RegExp(`<row r="${r}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
    if (row.test(xml)) {
      xml = xml.replace(row, (_, attrs, kids = '') => {
        const next = [...kids.matchAll(/<c r="([A-Z]+)\d+"/g)].find(m => colNum(m[1]) > colNum(ref));
        const at = next ? next.index : kids.length;
        return `<row r="${r}"${attrs}>${kids.slice(0, at)}${cellXml(ref, '', v)}${kids.slice(at)}</row>`;
      });
    } else {
      const add = `<row r="${r}">${cellXml(ref, '', v)}</row>`, after = [...xml.matchAll(/<row r="(\d+)"/g)].find(m => +m[1] > r);
      xml = after ? xml.slice(0, after.index) + add + xml.slice(after.index) : xml.replace(/<\/sheetData>|<sheetData\/>/, m => (m === '<sheetData/>' ? `<sheetData>${add}</sheetData>` : `${add}</sheetData>`));
    }
  }
  // Drop cached formula results: they belong to the old inputs, and without them every app recalculates.
  return xml.replace(/(<c [^>]*?)(?: t="(?:str|n|b|e)")?>(<f[^>]*?(?:\/>|>[^<]*<\/f>))<v>[^<]*<\/v>/g, '$1>$2');
}

// --- zip: an .xlsx is a zip of XML parts. Built-in (de)compression streams keep this dependency-free.
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

// files: Map of part name → string or bytes.
export async function zip(files) {
  const parts = [], dir = [];
  let offset = 0;
  for (const [name, raw] of files) {
    const data = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
    const body = await pipe(data, new CompressionStream('deflate-raw')), nm = new TextEncoder().encode(name);
    const header = (size, sig, at) => { // local (at 4) and central (at 6) headers share these fields
      const h = new DataView(new ArrayBuffer(size));
      h.setUint32(0, sig, true); h.setUint16(4, 20, true);
      h.setUint16(at, 20, true); h.setUint16(at + 4, 8, true); h.setUint16(at + 8, 0x21, true); // deflate, dated 1980-01-01
      h.setUint32(at + 10, crc32(data), true); h.setUint32(at + 14, body.length, true); h.setUint32(at + 18, data.length, true);
      h.setUint16(at + 22, nm.length, true);
      return h;
    };
    const cen = header(46, 0x02014b50, 6);
    cen.setUint32(42, offset, true);
    parts.push(header(30, 0x04034b50, 4).buffer, nm, body);
    dir.push(cen.buffer, nm);
    offset += 30 + nm.length + body.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.size, true); end.setUint16(10, files.size, true);
  end.setUint32(12, dir.reduce((a, b) => a + b.byteLength, 0), true); end.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...dir, end.buffer]).arrayBuffer());
}

// Map of part name → bytes.
export async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = new Map();
  let eocd = bytes.length - 22;
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  for (let i = 0, p = dv.getUint32(eocd + 16, true); i < dv.getUint16(eocd + 10, true); i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), n = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
    files.set(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + n)), method ? await pipe(data, new DecompressionStream('deflate-raw')) : data);
    p += 46 + n + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return files;
}

// Fill the template's tabs with cells { tab name: { ref: value } } and return the new .xlsx bytes.
export async function fillWorkbook(template, cellsBySheet) {
  const files = await unzip(template), text = name => new TextDecoder().decode(files.get(name));
  const targets = Object.fromEntries([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*/g)]
    .map(([r]) => [r.match(/Id="([^"]+)"/)[1], r.match(/Target="([^"]+)"/)[1]]));
  for (const [, name, id] of text('xl/workbook.xml').matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const path = `xl/${targets[id].replace(/^\/?xl\//, '')}`;
    files.set(path, setCells(text(path), cellsBySheet[name.replace(/&amp;/g, '&')] ?? {}));
  }
  files.set('xl/workbook.xml', text('xl/workbook.xml').replace(/<calcPr[^>]*?(\/>|>[\s\S]*?<\/calcPr>)/, '<calcPr fullCalcOnLoad="1"/>'));
  return zip(files);
}

// The workbook's fixed slots; anything past the last slot is summed into it.
const slots = (list, n) => list.length <= n ? list
  : [...list.slice(0, n - 1), { name: `Other (${list.length - n + 1})`, amount: list.slice(n - 1).reduce((a, x) => a + x.amount, 0) }];

// The Budgeting tab holds two Variations side by side. Per block: name and amount columns for Shared Costs,
// Member 1 and Member 2, then the settings columns. Costs fill rows 4–14, monthly.
const BLOCKS = [['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']];
const ALLOC_ROWS = { cost: [19, 21], saving: [23, 25, 27, 29] }; // spending rows, then saving rows

function budgeting(S) {
  const cells = {}, [m1, m2] = S.members, known = new Set(S.members.map(m => m.id));
  BLOCKS.forEach(([fn, fa, n1, a1, n2, a2, s1, s2], b) => {
    const sc = S.scenarios[b];
    cells[`${fn}2`] = sc?.name ?? '';
    cells[`${n1}3`] = m1?.name ?? 'P1';
    cells[`${n2}3`] = m2?.name ?? 'P2';
    const costs = (sc?.costs ?? []).map(c => ({ name: c.name, owner: known.has(c.owner) ? c.owner : '', amount: toMonthly(+c.amount || 0, c.cycle) }));
    for (const [nc, ac, owner] of [[fn, fa, ''], [n1, a1, m1?.id], [n2, a2, m2?.id]]) {
      const list = slots(costs.filter(c => c.owner === (owner ?? '-')), 11);
      for (let i = 0; i < 11; i++) { cells[`${nc}${4 + i}`] = list[i]?.name ?? null; cells[`${ac}${4 + i}`] = list[i]?.amount ?? null; }
    }
    // Settings: All Joint, Income Ratio (else 50/50), No Roommate, Add roommate rent to income (else off costs).
    const rm = sc?.roommate ?? { mode: 'none' };
    Object.assign(cells, { [`${s1}10`]: !!sc?.pool, [`${s2}10`]: (sc?.split ?? 'income') === 'income', [`${s1}13`]: rm.mode === 'none', [`${s2}13`]: rm.mode === 'income' });
    for (let r = 14; r <= 24; r++) cells[`${s2}${r}`] = r === 14 && rm.mode !== 'none' ? toMonthly(+rm.amount || 0, rm.cycle) : null;
    for (const [kind, rows] of Object.entries(ALLOC_ROWS)) {
      const list = slots((sc?.allocations ?? []).filter(a => a.kind === kind).map(a => ({ name: a.name, amount: +a.amount || 0 })), rows.length);
      rows.forEach((r, i) => Object.assign(cells, {
        [`${fa}${r}`]: list[i]?.amount ?? null, [`${n1}${r}`]: list[i]?.name ?? null, [`${n2}${r}`]: list[i]?.name ?? null,
        [`${a1}${r}`]: { f: `IF(${s2}10,${fa}${r}*${s1}7,${fa}${r}*0.5)` },
        [`${a2}${r}`]: { f: `IF(${s2}10,${fa}${r}*${s2}7,${fa}${r}*0.5)*12/26` },
      }));
    }
  });
  return cells;
}

// Every input cell of the workbook, from the app's state. saving: { member id: monthly Savings Goals share }.
export function workbookCells(S, saving) {
  const income = {}, basic = {}, advanced = {};
  S.members.slice(0, 2).forEach((m, i) => {
    const s = n => n + i * 17; // savings tabs: Member 2 sits 17 rows below
    basic[`G${s(13)}`] = saving[m.id] ?? 0;
    Object.assign(advanced, {
      [`J${s(5) - i}`]: m.name, [`G${s(3)}`]: m.bankRate, [`F${s(6)}`]: !!m.taxInterest,
      [`F${s(9)}`]: (FUNDS[m.fund] ?? FUNDS[0]).name.replace(/ \((Active|Passive)\)$/, ''), // the sheet lists funds by brand
      [`G${s(12)}`]: m.bankStart, [`G${s(14)}`]: m.superStart,
    });
    const r = n => n + i * 18; // Member 2's block sits 18 rows below Member 1's
    const hecs = `ROUND(D${r(5)}*0.035,0)`; // the sheet's flat HECS / HELP approximation
    Object.assign(income, {
      [`K${r(4)}`]: m.salaryPackage, [`K${r(8)}`]: m.sacrifice, [`J${r(16)}`]: m.name,
      [`F${r(5)}`]: { f: m.hecs ? `E${r(5)}-${hecs}` : `E${r(5)}` }, [`F${r(6)}`]: { f: m.hecs ? hecs : '0' },
      [`F${r(9)}`]: { f: m.hecs ? `E${r(9)}-${hecs}` : `E${r(9)}` }, [`F${r(10)}`]: { f: m.hecs ? hecs : '0' },
    });
  });
  const h = S.house, x = +S.goals.extra || 0;
  return {
    Budgeting: budgeting(S), Income: income, 'Basic Savings': basic, 'Advanced Savings': advanced,
    'Housing Costs': {
      B3: h.value, B5: { f: `B3*${h.depositPct}` }, C5: { f: `B3*${h.govPct}` }, D13: !!h.firstHome, D15: h.years, D17: h.rate,
      E4: h.rego, E6: h.title, E7: h.conveyancing, G7: h.stocks, G9: h.gift, G11: h.extras, G13: h.cushion,
    },
    // Mortgage options as [repayments, savings] per month: all to repayments, all to offset, half each.
    'Goals & Options': { C4: S.goals.emergencyMonths, J4: x, J6: 0, J12: 0, J14: x, J20: x / 2, J22: x / 2, L7: x, M7: 0, N7: 0, O7: x, P7: x / 2, Q7: x / 2 },
  };
}
