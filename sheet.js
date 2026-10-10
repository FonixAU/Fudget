// RFC 4180 CSV -> array of rows. Google's CSV export always quotes fields with , " or newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "$1,200.50" -> 1200.5, "(500)" -> -500, "12%" -> 12, text/blank -> null.
export function toNumber(cell) {
  const s = cell.trim().replace(/[$,%\s]/g, '');
  const neg = /^\(.*\)$/.test(s);
  const n = neg ? s.slice(1, -1) : s;
  if (!/^-?\d*\.?\d+$/.test(n)) return null;
  return neg ? -Number(n) : Number(n);
}
