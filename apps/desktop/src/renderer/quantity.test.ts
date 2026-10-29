import { expect, it } from 'vitest';
import { tracksQuantity } from './quantity.js';
it.each([
  [1, '1 трек'],
  [2, '2 трека'],
  [5, '5 треков'],
  [11, '11 треков'],
  [21, '21 трек'],
  [22, '22 трека'],
  [25, '25 треков'],
  [111, '111 треков'],
] as const)('REQ-057: склонение %s', (value, expected) => {
  expect(tracksQuantity(value)).toBe(expected);
});
