import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd, kip } from '@/lib/cnd/theme';
import { useCndConfig } from '@/lib/cnd/config';
import { createCndUrgent } from '@/lib/cnd/orders';
import PhotoPicker from '@/components/PhotoPicker';
import { useTT } from '@/lib/i18n';

const PROBLEMS: { icon: string; label: string; trade: string }[] = [
  { icon: '💡', label: 'ໄຟຟ້າ ຂັດ', trade: 'ໄຟຟ້າ' },
  { icon: '🚿', label: 'ນ້ຳ ຮົ່ວ / ຕັນ', trade: 'ປະປາ' },
  { icon: '❄️', label: 'ແອ ບໍ່ ເຢັນ', trade: 'ແອ' },
  { icon: '🔧', label: 'ອື່ນໆ', trade: 'ທົ່ວ ໄປ' },
];

export default function CndUrgent() {
  const tt = useTT();
  const cfg = useCndConfig();
  const { fbUser } = useAuth();
  const [pi, setPi] = useState(0);
  const [desc, setDesc] = useState('');
  const [photo, setPhoto] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const fee = Math.max(0, Math.round(cfg.urgentFee || 0));
  const p = PROBLEMS[pi];

  if (!cfg.urgentEnabled) {
    return <Shell tt={tt}><View style={styles.center}><Text style={styles.off}>{tt('cndUrgent', 'ບໍລິການ ຊ່າງ ດ່ວນ ຍັງ ບໍ່ ເປີດ')}</Text></View></Shell>;
  }
  if (done) {
    return (
      <Shell tt={tt}>
        <View style={styles.center}>
          <Text style={{ fontSize: 54 }}>🚨</Text>
          <Text style={styles.doneT}>{tt('cndUrgent', 'ສົ່ງ ຄຳ ຂໍ ດ່ວນ ແລ້ວ!')}</Text>
          <Text style={styles.doneS}>{tt('cndUrgent', 'CND ກຳລັງ ຫາ ຊ່າງ ໃກ້ ສຸດ · ຈະ ໂທ/ແຊທ ຢືນຢັນ ETA ໄວ ໆ ນີ້')}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace((fbUser && done ? `/cnd/track/${done}` : '/cnd/my') as any)}><Text style={styles.primaryTx}>{tt('cndUrgent', '📦 ຕິດຕາມ + ແຊທ')}</Text></Pressable>
          <Pressable style={styles.ghost} onPress={() => router.replace('/cnd' as any)}><Text style={styles.ghostTx}>{tt('cndUrgent', 'ກັບ ໜ້າ ຮ້ານ')}</Text></Pressable>
        </View>
      </Shell>
    );
  }

  const send = async () => {
    if (phone.replace(/\D/g, '').length < 8) { alert(tt('cndUrgent', 'ໃສ່ ເບີ ໂທ')); return; }
    if (!address.trim()) { alert(tt('cndUrgent', 'ໃສ່ ທີ່ຢູ່')); return; }
    setBusy(true);
    try {
      const id = await createCndUrgent({ problemType: p.label, trade: p.trade, description: desc, photo: photo || undefined, urgentFee: fee, customerName: name, phone, address });
      setDone(id);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Shell tt={tt}>
      <ScrollView contentContainerStyle={{ padding: 10, gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndUrgent', '① ບັນຫາ ຫຍັງ?')}</Text>
          <View style={styles.wrap}>
            {PROBLEMS.map((x, i) => (
              <Pressable key={x.label} style={[styles.chip, pi === i && styles.chipOn]} onPress={() => setPi(i)}>
                <Text style={[styles.chipTx, pi === i && styles.chipTxOn]}>{x.icon} {tt('cndUrgent', x.label)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndUrgent', '② ອະທິບາຍ + ຮູບ')}</Text>
          <TextInput style={[styles.in, { height: 64 }]} value={desc} onChangeText={setDesc} placeholder={tt('cndUrgent', 'ເລ່າ ອາການ ... (ເຊ່ນ ໄຟ ໃນ ເຮືອນ ດັບ ໝົດ)')} placeholderTextColor={cnd.ink3} multiline />
          <PhotoPicker photos={photo ? [photo] : []} onChange={(u) => setPhoto(u[0] || '')} pathPrefix="cnd/urgent" max={1} aspect={[4, 3]} />
        </View>

        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndUrgent', '③ ທີ່ຢູ່ + ເບີ')}</Text>
          {!fbUser && <Text style={styles.muted}>{tt('cndUrgent', 'ໃສ່ ເບີ ໄດ້ ເລີຍ · login ໜ້າ 📦 ພາຍ ຫຼັງ ເພື່ອ ຕິດຕາມ+ແຊທ')}</Text>}
          <TextInput style={styles.in} value={name} onChangeText={setName} placeholder={tt('cndUrgent', 'ຊື່')} placeholderTextColor={cnd.ink3} />
          <TextInput style={styles.in} value={phone} onChangeText={setPhone} placeholder={tt('cndUrgent', 'ເບີ ໂທ (020…)')} placeholderTextColor={cnd.ink3} keyboardType="phone-pad" />
          <TextInput style={[styles.in, { height: 54 }]} value={address} onChangeText={setAddress} placeholder={tt('cndUrgent', 'ທີ່ຢູ່ ໜ້າ ງານ (ບອກ ຈຸດ ສັງເກດ)')} placeholderTextColor={cnd.ink3} multiline />
        </View>

        <View style={styles.fee}>
          <Text style={styles.feeTx}>⚡ <Text style={{ fontWeight: '900', color: cnd.brandDark }}>{tt('cndUrgent', 'ຄ່າ ບໍລິການ ດ່ວນ')} +{kip(fee)} {tt('cndUrgent', 'ກີບ')}</Text> {tt('cndUrgent', '(ຄ່າ ໄປ ຮອດ ໄວ) · ຄ່າ ແຮງ/ອຸປະກອນ ຄິດ ຕາມ ໜ້າ ງານ')}{cfg.urgentHours ? ` · ${tt('cndUrgent', 'ບໍລິການ')} ${cfg.urgentHours}` : ''}</Text>
        </View>
        <View style={styles.ready}><Text style={styles.readyTx}>🧑‍🔧 {tt('cndUrgent', 'CND ຈະ ຫາ ຊ່າງ ໃກ້ ສຸດ + ວ່າງ ໃຫ້ ໄວ ທີ່ ສຸດ → ໂທ/ແຊທ ຢືນຢັນ ETA')}</Text></View>
        <Pressable style={[styles.primaryR, busy && { opacity: 0.5 }]} disabled={busy} onPress={send}>
          <Text style={styles.primaryTx}>{busy ? tt('cndUrgent', 'ກຳລັງ ສົ່ງ...') : tt('cndUrgent', '🚨 ສົ່ງ ຄຳ ຂໍ ດ່ວນ')}</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </Shell>
  );
}

function Shell({ children, tt }: { children: React.ReactNode; tt: (m: string, s: string) => string }) {
  return (
    <View style={styles.root}>
      <View style={styles.topR}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/cnd' as any))}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.topT}>{tt('cndUrgent', '🚨 ເອິ້ນ ຊ່າງ ດ່ວນ')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.surface2 },
  topR: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#D64545', paddingTop: 46, paddingBottom: 12, paddingHorizontal: 12 },
  topT: { color: '#fff', fontWeight: '900', fontSize: 15 },
  back: { color: '#fff', fontSize: 30, lineHeight: 30, fontWeight: '900', width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, gap: 8 },
  off: { color: cnd.ink3, fontSize: 15, textAlign: 'center' },
  doneT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  doneS: { fontSize: 13, color: cnd.ink3, textAlign: 'center', marginBottom: 6 },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 8 },
  h: { fontSize: 14, fontWeight: '900', color: '#B23A3A' },
  muted: { fontSize: 12, color: cnd.ink3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: cnd.surface },
  chipOn: { backgroundColor: '#D64545', borderColor: '#D64545' },
  chipTx: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  chipTxOn: { color: '#fff' },
  in: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 11, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  fee: { backgroundColor: '#fff4e5', borderWidth: 1, borderColor: '#ffd9a8', borderRadius: 10, padding: 11 },
  feeTx: { fontSize: 12.5, color: cnd.ink2, lineHeight: 19 },
  ready: { backgroundColor: '#F0F9F4', borderWidth: 1, borderColor: '#B7E4C7', borderRadius: 10, padding: 11 },
  readyTx: { fontSize: 12.5, color: cnd.ink2, lineHeight: 18 },
  primary: { backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryR: { backgroundColor: '#D64545', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryTx: { color: '#fff', fontWeight: '900', fontSize: 15 },
  ghost: { paddingVertical: 12, alignItems: 'center' },
  ghostTx: { color: cnd.ink3, fontWeight: '800' },
});
