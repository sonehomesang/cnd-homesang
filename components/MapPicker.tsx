import { StyleSheet, Text, View } from 'react-native';
import type { MapPickerProps } from './MapPicker.web';
import { useTT } from '@/lib/i18n';

// Native fallback: no Leaflet on native. Shows current coords; the parent
// screen still provides the "detect location" + manual lat/lng inputs.
// (Phase 4+ can swap in react-native-maps here.)
export default function MapPicker({ lat, lng, height = 240 }: MapPickerProps) {
  const tt = useTT();
  return (
    <View style={[styles.box, { height }]}>
      <Text style={styles.icon}>🗺️</Text>
      <Text style={styles.text}>
        {lat !== undefined && lng !== undefined
          ? `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`
          : tt('mapPicker', 'ໃຊ້ປຸ່ມ "ກວດຫາຕຳແໜ່ງ" ຫຼື ໃສ່ lat/lng ດ້ານລຸ່ມ')}
      </Text>
      <Text style={styles.note}>{tt('mapPicker', '(ແຜນທີ່ interactive ມີໃນ web — native ໃຊ້ react-native-maps ພາຍຫຼັງ)')}</Text>
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
    padding: 16,
    gap: 6,
  },
  icon: { fontSize: 32 },
  text: { fontSize: 14, color: '#4338ca', fontWeight: '600' },
  note: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
});
