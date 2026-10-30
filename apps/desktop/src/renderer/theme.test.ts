import { expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { darkTheme, theme } from './theme.js';
it('тема соответствует brandbook без собственного UI kit', () => {
  expect(theme.palette.primary.main).toBe('#5B5FEF');
  expect(theme.palette.background.default).toBe('#F7F8FC');
  expect(theme.typography.fontFamily).toContain('Inter');
  expect(theme.typography.h1.fontSize).toBe(24);
  expect(theme.spacing(1)).toBe('8px');
  expect(theme.shape.borderRadius).toBe(12);
});

it('REQ-058: тёмная тема сохраняет контраст primary на карточке и активной навигации без чёрных disabled цветов', () => {
  expect(darkTheme.palette.primary.main).toBe('#818CF8');
  expect(
    getContrastRatio(
      darkTheme.palette.primary.main,
      darkTheme.palette.background.paper,
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    getContrastRatio(
      darkTheme.palette.primary.main,
      darkTheme.palette.action.selected,
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(darkTheme.palette.action.disabled).toBe('rgba(255, 255, 255, 0.3)');
  expect(darkTheme.palette.action.disabledBackground).toBe(
    'rgba(255, 255, 255, 0.12)',
  );
});
