import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cnd } from '@/lib/cnd/theme';
import { sendCndMessage, watchCndMessages, type CndMessage, type CndMsgFrom } from '@/lib/cnd/orders';
import { ttStatic } from '@/lib/i18n';

/**
 * ninesang P4 — order chat thread (customer ↔ shop/tech). One component for both
 * sides: pass `as` to say who is posting. Customer sees their own bubbles right;
 * shop/admin sees shop bubbles right. Realtime via watchCndMessages.
 */
export default function OrderChat({ orderId, as, senderName, title }: {
  orderId: string; as: CndMsgFrom; senderName?: string; title?: string;
}) {
  const [msgs, setMsgs] = useState<CndMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scRef = useRef<ScrollView>(null);

  useEffect(() => watchCndMessages(orderId, setMsgs), [orderId]);
  useEffect(() => { if (msgs && msgs.length) setTimeout(() => scRef.current?.scrollToEnd({ animated: true }), 60); }, [msgs?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setText('');
    try { await sendCndMessage(orderId, as, body, senderName); }
    catch (e: any) { setText(body); if (typeof alert === 'function') alert(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>{title || ttStatic('cndOrder', '💬 ຂໍ້ຄວາມ')}</Text>
      <View style={styles.thread}>
        {msgs === null ? (
          <View style={styles.center}><ActivityIndicator color={cnd.brand} /></View>
        ) : msgs.length === 0 ? (
          <Text style={styles.empty}>{ttStatic('cndOrder', 'ຍັງ ບໍ່ ມີ ຂໍ້ຄວາມ — ພິມ ຄຳ ຖາມ ຫາ ຮ້ານ / ຊ່າງ ໄດ້ ເລີຍ')}</Text>
        ) : (
          <ScrollView ref={scRef} style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, padding: 4 }}>
            {msgs.map((m) => {
              const mine = m.from === as;
              return (
                <View key={m.id} style={[styles.row, mine ? styles.rowMine : styles.rowThem]}>
                  <View style={[styles.bubble, mine ? styles.bubMine : styles.bubThem]}>
                    {!mine && <Text style={styles.who}>{m.senderName || (m.from === 'shop' ? ttStatic('cndOrder', 'CND / ຊ່າງ') : ttStatic('cndOrder', 'ລູກຄ້າ'))}</Text>}
                    <Text style={[styles.body, mine && styles.bodyMine]}>{m.text}</Text>
                    <Text style={[styles.time, mine && styles.timeMine]}>{fmtTime(m.at)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={ttStatic('cndOrder', 'ພິມ ຂໍ້ຄວາມ…')}
          placeholderTextColor={cnd.ink3}
          multiline
          onSubmitEditing={send}
        />
        <Pressable style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} disabled={!text.trim() || busy} onPress={send}>
          <Text style={styles.sendTx}>{busy ? '…' : ttStatic('cndOrder', 'ສົ່ງ')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function fmtTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${d.getDate()}/${d.getMonth() + 1}`;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 8, marginTop: 10 },
  h: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  thread: { backgroundColor: cnd.surface2, borderRadius: 10, minHeight: 70 },
  center: { padding: 18, alignItems: 'center' },
  empty: { color: cnd.ink3, fontSize: 13, padding: 14, textAlign: 'center' },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 },
  bubMine: { backgroundColor: cnd.brand, borderBottomRightRadius: 3 },
  bubThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: cnd.line, borderBottomLeftRadius: 3 },
  who: { fontSize: 12, fontWeight: '800', color: cnd.blue, marginBottom: 2 },
  body: { fontSize: 14, color: cnd.ink, lineHeight: 20 },
  bodyMine: { color: '#fff' },
  time: { fontSize: 12, color: cnd.ink3, marginTop: 3, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface, maxHeight: 100 },
  sendBtn: { backgroundColor: cnd.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sendTx: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
