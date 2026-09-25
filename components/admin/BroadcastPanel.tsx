import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AdminUser, watchAllUsers } from '@/lib/admin';
import { useTT } from '@/lib/i18n';
import { broadcastNotification } from '@/lib/notifications';
import { useSectionPerms } from '@/lib/permissions-context';

type Target = 'all' | 'technician' | 'customer';

const TARGET_LABEL: Record<Target, string> = {
  all: '📣 ທຸກຄົນ',
  technician: '👷 ຊ່າງ',
  customer: '🙋 ລູກຄ້າ',
};

export default function BroadcastPanel() {
  const { canCreate } = useSectionPerms('broadcast');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [target, setTarget] = useState<Target>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const tt = useTT();

  useEffect(() => watchAllUsers(setUsers), []);

  const recipients = useMemo(() => {
    return users.filter((u) => {
      if (target === 'all') return true;
      return (u.roles ?? []).includes(target);
    });
  }, [users, target]);

  const send = async () => {
    setMsg('');
    if (title.trim() === '') { setMsg(tt('admBroadcast','❌ ໃສ່ ຫົວຂໍ້')); return; }
    if (recipients.length === 0) { setMsg(tt('admBroadcast','❌ ບໍ່ມີ ຜູ້ຮັບ')); return; }
    if (!confirm(`${tt('admBroadcast','ສົ່ງ ຫາ')} ${recipients.length} ${tt('admBroadcast','ຄົນ')} (${tt('admBroadcast', TARGET_LABEL[target])})?`)) return;
    setBusy(true);
    try {
      const ids = recipients.map((u) => u.uid).filter(Boolean) as string[];
      const n = await broadcastNotification(ids, {
        title: title.trim(),
        body: body.trim() || undefined,
        link: link.trim() || undefined,
      });
      setMsg(`✅ ${tt('admBroadcast','ສົ່ງ ສຳເລັດ')} ${n} ${tt('admBroadcast','ຄົນ')}`);
      setTitle(''); setBody(''); setLink('');
    } catch (e: any) {
      setMsg('❌ ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admBroadcast','📢 ແຈ້ງເຕືອນ ລວມ · Broadcast')}</Text>
      <Text style={styles.sub}>{tt('admBroadcast','ສົ່ງ ຂໍ້ຄວາມ ແຈ້ງເຕືອນ ຫາ ຜູ້ໃຊ້ ທັງໝົດ ຫຼື ກຸ່ມ ໃດໜຶ່ງ')}</Text>

      <Text style={styles.label}>{tt('admBroadcast','ກຸ່ມ ຜູ້ຮັບ')}</Text>
      <View style={styles.chips}>
        {(Object.keys(TARGET_LABEL) as Target[]).map((t) => (
          <Pressable key={t} style={[styles.chip, target === t && styles.chipOn]} onPress={() => setTarget(t)}>
            <Text style={[styles.chipText, target === t && styles.chipTextOn]}>{tt('admBroadcast', TARGET_LABEL[t])}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.count}>{tt('admBroadcast','👥 ຜູ້ຮັບ:')} {recipients.length} {tt('admBroadcast','ຄົນ')}</Text>

      <Text style={styles.label}>{tt('admBroadcast','ຫົວຂໍ້')}</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder={tt('admBroadcast','ເຊັ່ນ: ໂປຣໂມຊັ່ນ ເດືອນ ນີ້ 🎉')} placeholderTextColor="#999" style={styles.input} />

      <Text style={styles.label}>{tt('admBroadcast','ເນື້ອຫາ (ບໍ່ບັງຄັບ)')}</Text>
      <TextInput value={body} onChangeText={setBody} placeholder={tt('admBroadcast','ລາຍລະອຽດ ຂໍ້ຄວາມ')} placeholderTextColor="#999" style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline />

      <Text style={styles.label}>{tt('admBroadcast','ລິ້ງ (ບໍ່ບັງຄັບ — ເຊັ່ນ /shop)')}</Text>
      <TextInput value={link} onChangeText={setLink} placeholder="/shop" placeholderTextColor="#999" style={styles.input} autoCapitalize="none" />

      {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
      {canCreate ? (
        <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={send} disabled={busy}>
          <Text style={styles.btnText}>{busy ? tt('admBroadcast','ກຳລັງສົ່ງ...') : `📢 ${tt('admBroadcast','ສົ່ງ ຫາ')} ${recipients.length} ${tt('admBroadcast','ຄົນ')}`}</Text>
        </Pressable>
      ) : (
        <Text style={styles.roHint}>{tt('admBroadcast','👁 ເບິ່ງ ຢ່າງ ດຽວ — ບໍ່ ມີ ສິດ ສົ່ງ')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  label: { fontSize: 12, color: '#6b7280', marginTop: 12, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  count: { fontSize: 12, color: '#0066CC', fontWeight: '600', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  msg: { fontSize: 12, marginTop: 12, color: '#374151' },
  btn: { backgroundColor: '#0066CC', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  roHint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', marginTop: 16 },
});
