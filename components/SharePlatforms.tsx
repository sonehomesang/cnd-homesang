import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { copyLink, openShare, type SharePlatform } from '@/lib/share';
import { useTT } from '@/lib/i18n';

const PF: { key: SharePlatform | 'copy'; label: string; icon: string; bg: string }[] = [
  { key: 'facebook', label: 'Facebook', icon: 'f', bg: '#1877F2' },
  { key: 'messenger', label: 'Messenger', icon: '💬', bg: '#0A7CFF' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '📱', bg: '#25D366' },
  { key: 'line', label: 'LINE', icon: 'L', bg: '#06C755' },
  { key: 'telegram', label: 'Telegram', icon: '✈', bg: '#229ED9' },
  { key: 'x', label: 'X', icon: '𝕏', bg: '#000' },
  { key: 'copy', label: 'ກັອບລິ້ງ', icon: '🔗', bg: '#64748b' },
];

/** Row of one-tap share targets (Facebook / Messenger / WhatsApp / LINE /
 * Telegram / X / copy-link). Opens each platform's web share composer. */
export default function SharePlatforms({ url, text, label }: { url: string; text: string; label?: string }) {
  const tt = useTT();
  const [copied, setCopied] = useState(false);
  const tap = (k: SharePlatform | 'copy') => {
    if (k === 'copy') { copyLink(url).then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }); return; }
    openShare(k, url, text);
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.lbl}>{label ?? `↗ ${tt('share', 'ແຊຣ໌ ສິນຄ້ານີ້ ໄປ')}`}{copied ? ` · ${tt('share', '✓ ກັອບ ລິ້ງ ແລ້ວ')}` : ''}</Text>
      <View style={styles.row}>
        {PF.map((p) => (
          <Pressable key={p.key} style={styles.pf} onPress={() => tap(p.key)}>
            <View style={[styles.ico, { backgroundColor: p.bg }]}><Text style={styles.icoTx}>{p.icon}</Text></View>
            <Text style={styles.cap} numberOfLines={1}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12 },
  lbl: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pf: { alignItems: 'center', gap: 5, width: 52 },
  ico: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  icoTx: { color: '#fff', fontSize: 20, fontWeight: '800' },
  cap: { fontSize: 12, color: '#6b7280' },
});
