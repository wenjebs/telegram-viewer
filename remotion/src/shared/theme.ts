import { loadFont } from '@remotion/google-fonts/Manrope'

const { fontFamily } = loadFont()

export const theme = {
  fontFamily,
  colors: {
    background: '#0a0a0a',
    surface: '#111111',
    border: '#222222',
    text: '#ffffff',
    textMuted: '#888888',
    textSubtle: '#666666',
    accent: '#0284c7',
    accentGlow: 'rgba(2, 132, 199, 0.4)',
    bracketSearch: 'rgba(255, 255, 255, 0.3)',
  },
  radii: {
    card: 12,
    button: 8,
    avatar: 999,
  },
} as const
