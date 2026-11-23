import { createTheme } from '@mui/material/styles';

// Design tokens. The :root block in src/components/ctdv.css mirrors these
// values for plain HTML elements; keep the two in sync.
export const tokens = {
  bg: '#FBF5EC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFDF9',
  border: '#EADFCF',
  text: '#3B2A20',
  textMuted: '#7A6657',
  accent: '#BF4A26',
  onAccent: '#FFFFFF',
  accentSoft: '#FBE3D6',
  accentStrong: '#8F3415',
  accentHover: '#A8401F',
  accentSoftHover: '#F7D3C0',
  error: '#B3261E',
  snackbar: '#3B2A20',
  overlay: 'rgba(40, 25, 15, 0.45)',
  fontBody: "Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontTitle: "Georgia, 'Times New Roman', serif",
} as const;

const focusRing = {
  outline: `2px solid ${tokens.accent}`,
  outlineOffset: 2,
};

// Disabled controls keep their enabled colours and are only faded. MUI's own
// disabled rules set colour, background and border, so each case restates them.
const disabledFade = {
  opacity: 0.45,
  boxShadow: 'none',
};

// White button with a 1px border: neutral buttons and the small pill buttons.
const outlined = (color: string) => ({
  backgroundColor: tokens.surface,
  borderColor: tokens.border,
  color,
  '&:hover': {
    backgroundColor: tokens.bg,
    borderColor: tokens.border,
    '@media (hover: none)': {
      backgroundColor: tokens.surface,
    },
  },
  '&.Mui-disabled': {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    color,
  },
});

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: tokens.accent,
      dark: tokens.accentHover,
      contrastText: tokens.onAccent,
    },
    secondary: {
      main: tokens.accentSoft,
      dark: tokens.accentSoftHover,
      contrastText: tokens.accentStrong,
    },
    error: { main: tokens.error },
    text: { primary: tokens.text, secondary: tokens.textMuted },
    background: { default: tokens.bg, paper: tokens.surface },
    divider: tokens.border,
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: tokens.fontBody,
    button: { textTransform: 'none', fontWeight: 700, fontSize: '15px' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 48,
          borderRadius: 14,
          '&.Mui-focusVisible': focusRing,
          '&.Mui-disabled': disabledFade,
        },
        sizeSmall: {
          minHeight: 40,
          borderRadius: 999,
          fontSize: '13px',
          padding: '0 14px',
        },
        // Primary: Copy, sheet Assign.
        containedPrimary: {
          '&.Mui-disabled': {
            backgroundColor: tokens.accent,
            color: tokens.onAccent,
          },
        },
        // Tonal: AI gen.
        containedSecondary: {
          '&.Mui-disabled': {
            backgroundColor: tokens.accentSoft,
            color: tokens.accentStrong,
          },
        },
        // Neutral: Replicate, Cancel.
        outlinedInherit: outlined(tokens.text),
        // Pill: Append, Assign opener.
        outlinedPrimary: outlined(tokens.accentStrong),
        // Muted pill: Reload.
        outlinedSecondary: outlined(tokens.textMuted),
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 14,
          padding: '6px 8px',
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.border}`,
          color: tokens.text,
          textTransform: 'none',
          fontSize: '14px',
          fontWeight: 500,
          lineHeight: 1.25,
          '&:hover': {
            backgroundColor: tokens.bg,
            '@media (hover: none)': {
              backgroundColor: tokens.surface,
            },
          },
          '&.Mui-focusVisible': focusRing,
          '&.Mui-selected': {
            backgroundColor: tokens.accentSoft,
            borderColor: tokens.accent,
            color: tokens.accentStrong,
            '&:hover': {
              backgroundColor: tokens.accentSoft,
              '@media (hover: none)': {
                backgroundColor: tokens.accentSoft,
              },
            },
          },
          '&.Mui-disabled': {
            ...disabledFade,
            border: `1px solid ${tokens.border}`,
            color: tokens.text,
          },
          '&.Mui-selected.Mui-disabled': {
            backgroundColor: tokens.accentSoft,
            borderColor: tokens.accent,
            color: tokens.accentStrong,
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          width: '100%',
          borderRadius: 12,
          fontSize: '14px',
          fontWeight: 500,
        },
        filledSuccess: {
          backgroundColor: tokens.snackbar,
          color: tokens.onAccent,
        },
        filledError: {
          backgroundColor: tokens.error,
          color: tokens.onAccent,
        },
      },
    },
  },
});
