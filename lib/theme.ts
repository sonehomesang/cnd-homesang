import { useWindowDimensions } from 'react-native';

// ============ DESIGN TOKENS (based on A0-final, extended for responsive) ============
export const colors = {
  primary: '#0066CC',
  primaryDark: '#004A99',
  primaryLight: '#3385FF',
  secondary: '#FF6B35',
  secondaryLight: '#FFB399',
  accent: '#10B981',
  accentLight: '#6EE7B7',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#F1F5F9',
  text: '#0F172A',
  text2: '#475569',
  text3: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  error: '#DC2626',
  success: '#16A34A',
  warning: '#EA580C',
  pending: '#F59E0B',
  white: '#FFFFFF',
  black: '#000000',
  disabled: '#CBD5E1',
};

export const radius = { sm: 3, md: 5, lg: 8, xl: 10, xxl: 14, full: 8 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const weight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

/**
 * App-wide Lao type scale (approved 2026-09-14 "draft 2", compact).
 * Everything sits in 12–15 px so hierarchy leans on WEIGHT + COLOR, not size —
 * which suits Lao script on a phone. Every role ships a line-height, because Lao
 * stacks vowels/tone marks above and below and needs the extra leading to look
 * right. Use the whole object as a style: `style={[type.title, { color }]}`.
 * Icons are exempt (they size via the icon `size` prop, not fontSize).
 */
export const type = {
  display:  { fontSize: 15,   lineHeight: 24, fontWeight: '800' as const }, // stat / price number
  h1:       { fontSize: 15,   lineHeight: 24, fontWeight: '700' as const }, // page title
  header:   { fontSize: 14,   lineHeight: 22, fontWeight: '700' as const }, // nav / section header
  title:    { fontSize: 13.5, lineHeight: 21, fontWeight: '700' as const }, // card title
  subtitle: { fontSize: 13,   lineHeight: 20, fontWeight: '600' as const },
  body:     { fontSize: 13,   lineHeight: 20, fontWeight: '400' as const }, // default content
  label:    { fontSize: 12.5, lineHeight: 18, fontWeight: '600' as const }, // button / field label
  caption:  { fontSize: 12,   lineHeight: 17, fontWeight: '400' as const }, // meta / helper
  micro:    { fontSize: 12,   lineHeight: 15, fontWeight: '600' as const }, // badge / smallest
} as const;

/**
 * Numeric size ramp aligned to the type scale above — for the 500+ existing
 * `fontSize: font.*` call-sites. Kept monotonic within the 12–15 band.
 */
export const font = { xs: 12, sm: 13, md: 14, lg: 15, xl: 15, xxl: 15, xxxl: 15 };

export const shadow = {
  card: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  lifted: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
};

// Role → accent color (A0 convention)
export const roleColor: Record<string, string> = {
  technician: colors.secondary,
  shop: colors.accent,
  customer: colors.primary,
  admin: colors.primaryDark,
};

/**
 * Responsive helper: breakpoints + a centered content max-width so the
 * mobile-first A0 layout scales cleanly to tablet/desktop instead of
 * stretching edge-to-edge.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isPhone = width < 768;
  // content column: phone = full, tablet ~720, desktop ~960
  const maxWidth = isDesktop ? 960 : isTablet ? 720 : width;
  // how many columns a card grid should use
  const gridCols = isDesktop ? 4 : isTablet ? 3 : 2;
  return { width, height, isPhone, isTablet, isDesktop, maxWidth, gridCols };
}
