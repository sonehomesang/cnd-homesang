import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/lib/theme';

const LOGO = require('../assets/images/logo.png');

/** App logo + wordmark. Pass logoUrl (from admin settings) to override the bundled
 * logo; onDark renders the "ໂຮມ" half in white so it stays legible on the blue header. */
export default function Brand({ logoUrl, size = 34, onDark }: { logoUrl?: string; size?: number; onDark?: boolean }) {
  return (
    <View style={styles.row}>
      <Image source={logoUrl ? { uri: logoUrl } : LOGO} style={{ width: size, height: size }} resizeMode="contain" />
      <Text style={styles.word}>
        <Text style={onDark ? styles.bDark : styles.b}>ໂຮມ</Text>
        <Text style={styles.o}>ຊ່າງ</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontSize: font.lg, fontWeight: '800', letterSpacing: -0.3 },
  b: { color: colors.primary },
  bDark: { color: colors.white },
  o: { color: colors.secondary },
});
