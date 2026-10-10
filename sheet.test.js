import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toNumber } from './sheet.js';

test('parseCsv handles quoted commas, escaped quotes and newlines', () => {
  const csv = 'Item,Budget\n"Tiles, floor","$1,200.50"\n"Say ""hi""","line1\nline2"\n';
  assert.deepEqual(parseCsv(csv), [
    ['Item', 'Budget'],
    ['Tiles, floor', '$1,200.50'],
    ['Say "hi"', 'line1\nline2'],
  ]);
});

test('toNumber reads money cells and rejects text', () => {
  assert.deepEqual(
    ['$1,200.50', '(500)', '-3', '12%', '', 'Tiles'].map(toNumber),
    [1200.5, -500, -3, 12, null, null],
  );
});
