import { ttStatic } from '../i18n';

// CND (Home Hardware) brand tokens — orange + steel, distinct from HomeSang blue.
export const cnd = {
  brand: '#E8551E',
  brandDark: '#C4400F',
  brandSoft: '#FDEADF',
  steel: '#2B3A4A',
  steel2: '#3D5063',
  yellow: '#F4B400',
  yellowSoft: '#FDF3D6',
  green: '#1F9D57',
  greenSoft: '#E2F5EA',
  blue: '#0066CC',
  blueSoft: '#E4EEFB',
  bg: '#F1F3F6',
  surface: '#FFFFFF',
  surface2: '#EEF1F5',
  ink: '#1A2231',
  ink2: '#556072',
  ink3: '#8B95A5',
  line: '#DDE2EA',
  line2: '#CBD3DE',
  error: '#DC2626',
  white: '#FFFFFF',
};

/** kip formatter for CND screens */
export const kip = (n?: number) => (n ? Math.round(n).toLocaleString('en-US') : '0');
/** kip amount + the translatable "ກີບ" unit (shared cndCommon key → translate once,
 *  applies to every price/total across the CND app). Use in place of `${kip(n)} ກີບ`. */
export const kipT = (n?: number) => `${kip(n)} ${ttStatic('cndCommon', 'ກີບ')}`;
/** Translatable sale unit (ໜ່ວຍ/ຊຸດ/ກ່ອງ/…). Standard units resolve to their override
 *  under the shared cndCommon key; a custom unit passes through unchanged. */
export const unitT = (u?: string) => (u ? ttStatic('cndCommon', u) : '');
