import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd, kip } from '@/lib/cnd/theme';
import { watchMyCndOrders, type CndOrder } from '@/lib/cnd/orders';
import { cndSendOtp, cndVerifyOtp, cndQuickSignIn, claimMyCndOrders, type CndOtpMode } from '@/lib/cnd/customerAuth';
import { otpErrorMessage } from '@/lib/otp';
import { useTT } from '@/lib/i18n';

const OSTAT: Record<string, { lao: string; bg: string; fg: string }> = {
  new: { lao: 'ໃໝ່', bg: '#E4EEFB', fg: '#0066CC' },
  confirmed: { lao: 'ຢືນຢັນ ແລ້ວ', bg: '#E4EEFB', fg: '#0066CC' },
  packing: { lao: 'ກຳລັງ ຈັດ', bg: '#FDF3D6', fg: '#9A6B00' },
  delivering: { lao: 'ກຳລັງ ສົ່ງ', bg: '#FDF3D6', fg: '#9A6B00' },
  done: { lao: 'ສຳ ເລັດ', bg: '#DEF7E8', fg: '#1F9D57' },
  cancelled: { lao: 'ຍົກ ເລີກ', bg: '#F3D6D6', fg: '#B23A3A' },
};

export default function CndMyOrders() {
  const { fbUser, loading } = useAuth();
  const tt = useTT();
  const uid = fbUser?.uid || null;

  if (loading) return <View style={styles.root}><View style={styles.top}><Text style={styles.topT}>{tt('cndOrder', 'ອໍເດີ ຂອງ ຂ້ອຍ')}</Text></View><View style={styles.center}><ActivityIndicator color={cnd.brand} /></View></View>;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.replace('/cnd' as any)}><Text style={styles.topBack}>‹</Text></Pressable>
        <Text style={styles.topT}>{tt('cndOrder', 'ອໍເດີ ຂອງ ຂ້ອຍ')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {uid ? <OrderList uid={uid} tt={tt} /> : <LoginGate tt={tt} />}
    </View>
  );
}

function OrderList({ uid, tt }: { uid: string; tt: (m: string, s: string) => string }) {
  const [orders, setOrders] = useState<CndOrder[] | null>(null);
  useEffect(() => watchMyCndOrders(uid, setOrders), [uid]);
  // pull in any guest orders placed with this phone before logging in
  useEffect(() => { void claimMyCndOrders(); }, [uid]);

  if (orders === null) return <View style={styles.center}><ActivityIndicator color={cnd.brand} /></View>;
  if (orders.length === 0) return (
    <View style={styles.center}>
      <Text style={{ fontSize: 46 }}>🧾</Text>
      <Text style={styles.emptyT}>{tt('cndOrder', 'ຍັງ ບໍ່ ມີ ອໍເດີ')}</Text>
      <Text style={styles.emptyS}>{tt('cndOrder', 'ອໍເດີ ທີ່ ສັ່ງ ຕອນ ເຂົ້າ ສູ່ ລະບົບ ຈະ ຂຶ້ນ ຢູ່ ນີ້')}</Text>
      <Pressable style={styles.shopBtn} onPress={() => router.replace('/cnd' as any)}><Text style={styles.shopTx}>{tt('cndOrder', 'ໄປ ຊື້ ເຄື່ອງ')}</Text></Pressable>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 8, gap: 8 }}>
      {orders.map((o) => {
        const st = OSTAT[o.status] || OSTAT.new;
        return (
          <Pressable key={o.id} style={styles.card} onPress={() => router.push(`/cnd/track/${o.id}` as any)}>
            <View style={styles.cardHead}>
              <Text style={styles.num}>#{o.number}</Text>
              <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillTx, { color: st.fg }]}>{tt('cndOrder', st.lao)}</Text></View>
            </View>
            <Text style={styles.items} numberOfLines={1}>{o.items.map((i) => i.name).join(', ')}</Text>
            <View style={styles.cardFoot}>
              <Text style={styles.total}>{kip(o.total)}</Text>
              {!!o.install && <Text style={styles.instTag}>🔧 {tt('cndOrder', 'ມີ ຕິດຕັ້ງ')}</Text>}
              <Text style={styles.go}>{tt('cndOrder', 'ຕິດຕາມ / ແຊັດ')} ›</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function LoginGate({ tt }: { tt: (m: string, s: string) => string }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<CndOtpMode | null>(null);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const phoneOk = useMemo(() => phone.replace(/\D/g, '').length >= 8, [phone]);

  const send = async () => {
    if (!phoneOk || busy) return;
    setBusy(true); setErr('');
    try {
      // same device that ordered before? try silent sign-in first (no SMS).
      if (await cndQuickSignIn(phone)) return;   // auth state flips → screen shows orders
      const m = await cndSendOtp(phone);
      setMode(m); setStep('code');
    } catch (e: any) { setErr(otpErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (code.trim().length < 4 || !mode || busy) return;
    setBusy(true); setErr('');
    try { await cndVerifyOtp(phone, code.trim(), mode); }   // auth state flips → orders
    catch (e: any) { setErr(otpErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.gate}>
      <Text style={{ fontSize: 46 }}>📦</Text>
      <Text style={styles.gateT}>{tt('cndOrder', 'ຕິດຕາມ ອໍເດີ + ແຊັດ ກັບ ຮ້ານ')}</Text>
      <Text style={styles.gateS}>{tt('cndOrder', 'ຢືນຢັນ ເບີ ໂທ ດ້ວຍ ລະຫັດ OTP ຄັ້ງ ດຽວ — ບໍ່ ຕ້ອງ ຕັ້ງ ລະຫັດ ຜ່ານ')}</Text>

      {step === 'phone' ? (
        <>
          <TextInput style={styles.gInput} value={phone} onChangeText={setPhone} placeholder={tt('cndOrder', 'ເບີ ໂທ (020…)')} placeholderTextColor={cnd.ink3} keyboardType="phone-pad" autoFocus />
          {!!err && <Text style={styles.err}>{err}</Text>}
          <Pressable style={[styles.gBtn, (!phoneOk || busy) && { opacity: 0.5 }]} disabled={!phoneOk || busy} onPress={send}>
            <Text style={styles.gBtnTx}>{busy ? tt('cndOrder', 'ກຳລັງ ສົ່ງ…') : tt('cndOrder', 'ສົ່ງ ລະຫັດ OTP')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.sentTo}>{tt('cndOrder', 'ສົ່ງ ລະຫັດ ໄປ ທີ່')} {phone}</Text>
          <TextInput style={[styles.gInput, { textAlign: 'center', letterSpacing: 6, fontSize: 22 }]} value={code} onChangeText={setCode} placeholder="••••••" placeholderTextColor={cnd.line2} keyboardType="number-pad" maxLength={6} autoFocus />
          {!!err && <Text style={styles.err}>{err}</Text>}
          <Pressable style={[styles.gBtn, (code.trim().length < 4 || busy) && { opacity: 0.5 }]} disabled={code.trim().length < 4 || busy} onPress={verify}>
            <Text style={styles.gBtnTx}>{busy ? tt('cndOrder', 'ກຳລັງ ກວດ…') : tt('cndOrder', 'ຢືນຢັນ + ເຂົ້າ ສູ່ ລະບົບ')}</Text>
          </Pressable>
          <Pressable onPress={() => { setStep('phone'); setCode(''); setErr(''); }}><Text style={styles.changeNum}>{tt('cndOrder', '‹ ປ່ຽນ ເບີ ໂທ')}</Text></Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.surface2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.brand, paddingTop: 46, paddingBottom: 12, paddingHorizontal: 12 },
  topT: { color: '#fff', fontWeight: '900', fontSize: 15 },
  topBack: { color: '#fff', fontSize: 30, lineHeight: 30, fontWeight: '900', width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  emptyS: { fontSize: 13, color: cnd.ink3, textAlign: 'center' },
  shopBtn: { marginTop: 8, backgroundColor: cnd.brand, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 22 },
  shopTx: { color: '#fff', fontWeight: '900' },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  num: { fontWeight: '900', color: cnd.ink, fontSize: 15 },
  pill: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  pillTx: { fontSize: 12, fontWeight: '800' },
  items: { color: cnd.ink2, fontSize: 13 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  total: { fontWeight: '900', color: cnd.brand, fontSize: 15 },
  instTag: { fontSize: 12, color: cnd.blue, fontWeight: '700' },
  go: { marginLeft: 'auto', color: cnd.ink3, fontSize: 12, fontWeight: '700' },
  gate: { padding: 24, alignItems: 'center', gap: 10 },
  gateT: { fontSize: 15, fontWeight: '900', color: cnd.ink, textAlign: 'center', marginTop: 4 },
  gateS: { fontSize: 13, color: cnd.ink3, textAlign: 'center', marginBottom: 8, lineHeight: 19 },
  gInput: { alignSelf: 'stretch', borderWidth: 1, borderColor: cnd.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: cnd.ink, backgroundColor: cnd.surface },
  gBtn: { alignSelf: 'stretch', backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  gBtnTx: { color: '#fff', fontWeight: '900', fontSize: 15 },
  err: { color: '#B23A3A', fontSize: 13, alignSelf: 'stretch' },
  sentTo: { color: cnd.ink2, fontSize: 13 },
  changeNum: { color: cnd.blue, fontSize: 13, fontWeight: '700', marginTop: 10 },
});
