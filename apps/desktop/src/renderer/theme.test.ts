import { expect, it } from 'vitest';
import { theme } from './theme.js';
it('тема соответствует brandbook без собственного UI kit', () => {
  expect(theme.palette.primary.main).toBe('#5B5FEF');
  expect(theme.palette.background.default).toBe('#F7F8FC');
  expect(theme.typography.fontFamily).toContain('Inter');
  expect(theme.typography.h1.fontSize).toBe(24);
  expect(theme.spacing(1)).toBe('8px');
  expect(theme.shape.borderRadius).toBe(12);
});
