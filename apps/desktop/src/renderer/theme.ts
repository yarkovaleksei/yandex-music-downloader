import { createTheme } from '@mui/material/styles';
/** Токены минимального экрана соответствуют docs/brand/brandbook.md. */
export const theme = createTheme({
  palette: {
    primary: { main: '#5B5FEF', dark: '#4247D9', light: '#818CF8' },
    secondary: { main: '#10B981' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
    info: { main: '#3B82F6' },
    background: { default: '#F7F8FC', paper: '#FFFFFF' },
    text: { primary: '#0F172A', secondary: '#64748B' },
    divider: '#E2E8F0',
    action: { hover: '#F1F5F9', selected: '#EEF2FF' },
  },
  typography: {
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: 24, fontWeight: 700, lineHeight: '32px' },
    h2: { fontSize: 20, fontWeight: 600, lineHeight: '28px' },
    h3: { fontSize: 16, fontWeight: 600, lineHeight: '24px' },
    body1: { fontSize: 14, lineHeight: '20px' },
    body2: { fontSize: 13, lineHeight: '18px' },
    button: { fontSize: 14, fontWeight: 600, textTransform: 'none' },
    caption: { fontSize: 12, lineHeight: '16px' },
  },
  spacing: 8,
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: { root: { borderRadius: 8, boxShadow: 'none' } },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 8 }, message: { width: '100%' } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { height: 5, borderRadius: 4 } },
    },
    MuiPaper: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});

/** REQ-058 и brandbook §19: palette собирается заново, чтобы dark не наследовал
 * разрешённые светлые action/text цвета. Активная навигация сохраняет контраст текста.
 */
export const darkTheme = createTheme({
  ...theme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#818CF8',
      dark: '#6366F1',
      light: '#A5B4FC',
      contrastText: '#0F172A',
    },
    secondary: { main: '#10B981' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
    info: { main: '#3B82F6' },
    background: { default: '#0B1120', paper: '#111827' },
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
    divider: '#263248',
    action: {
      active: '#F8FAFC',
      hover: '#1E293B',
      selected: '#222849',
      disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
  },
});
