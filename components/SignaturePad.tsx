import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

export interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * Native stub — on-device signature drawing isn't wired yet (web-first).
 * Lets the customer dismiss; web build uses SignaturePad.web.tsx (canvas).
 */
export default function SignaturePad({ onCancel }: SignaturePadProps) {
  const tt = useTT();
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{tt('signature', '✍️ ເຊັນຮັບ')}</Text>
        <Text style={styles.msg}>{tt('signature', 'ການເຊັນ ຮອງຮັບ ຢູ່ເວັບກ່ອນ — ເປີດ homesang.pro ເພື່ອເຊັນ')}</Text>
        <Pressable style={styles.btn} onPress={onCancel}><Text style={styles.btnText}>{tt('signature', 'ປິດ')}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420, gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  msg: { fontSize: 12, color: '#6b7280' },
  btn: { alignSelf: 'flex-end', backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
