import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native';

// A category icon is stored either as a plain emoji ("🔧") or a vector-icon
// reference ("mci:wrench" → MaterialCommunityIcons). Vector fonts are bundled
// into the app (offline; no CDN). This renders whichever kind is stored.
export const VECTOR_PREFIX = 'mci:';
export const isVectorIcon = (icon?: string): boolean => !!icon && icon.startsWith(VECTOR_PREFIX);
/** For string labels / HTML (can't render a component): emoji as-is, vector → '' . */
export const emojiOnly = (icon?: string): string => (isVectorIcon(icon) ? '' : (icon ?? ''));

/**
 * Renders a category icon. Categories should always show SOMETHING — so when the
 * stored icon is missing or an invalid "mci:" name, we fall back to `fallback`
 * (default 🔧) instead of returning null. Returning null was leaving blank tiles
 * on the home grid (icon in its own box) for admin-added categories. Pass
 * fallback="" to opt back into the old null behaviour.
 */
export default function CategoryIcon({
  icon,
  size = 18,
  color = '#374151',
  fallback = '🔧',
}: { icon?: string; size?: number; color?: string; fallback?: string }) {
  if (icon && icon.startsWith(VECTOR_PREFIX)) {
    const name = icon.slice(VECTOR_PREFIX.length);
    if ((MaterialCommunityIcons.glyphMap as any)[name] != null) {
      return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    }
    // invalid vector reference → fall through to the fallback below
  } else if (icon) {
    return <Text style={{ fontSize: size, color }}>{icon}</Text>;
  }
  return fallback ? <Text style={{ fontSize: size, color }}>{fallback}</Text> : null;
}
