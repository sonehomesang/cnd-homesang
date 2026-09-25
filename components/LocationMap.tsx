import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LocationMapProps } from './LocationMap.web';
import { useTT } from '@/lib/i18n';

// Native fallback: static box + "open in maps" link.
export default function LocationMap({ lat, lng, height = 200 }: LocationMapProps) {
  const tt = useTT();
  const openMaps = () => {
    Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`);
  };
  return (
    <View style={[styles.box, { height }]}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.coords}>📍 {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      <Pressable style={styles.btn} onPress={openMaps}>
        <Text style={styles.btnText}>{tt('locationMap', 'ເປີດໃນແຜນທີ່')} · Open in maps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: { fontSize: 32 },
  coords: { fontSize: 14, color: '#4338ca', fontWeight: '600' },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0066CC',
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
