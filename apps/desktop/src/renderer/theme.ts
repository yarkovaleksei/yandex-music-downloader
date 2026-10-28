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
    MuiButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});
