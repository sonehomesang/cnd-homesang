import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd, kip } from '@/lib/cnd/theme';
import { useCndConfig } from '@/lib/cnd/config';
import { watchCndProducts, type CndProduct } from '@/lib/cnd/catalog';
import { createCndBooking } from '@/lib/cnd/orders';
import { cndSlotAvailability, slotRemaining, bookingDays, slotToMs, type SlotAvail } from '@/lib/cnd/booking';
import { guessTrade } from '@/lib/ninesang';
import { useTT } from '@/lib/i18n';

export default function CndBook() {
  const tt = useTT();
  const cfg = useCndConfig();
  const { fbUser } = useAuth();
  const [products, setProducts] = useState<CndProduct[]>([]);
  useEffect(() => watchCndProducts(setProducts), []);
  const services = useMemo(() => products.filter((p) => p.isService), [products]);

  const days = useMemo(() => bookingDays(cfg.bookingDays || 14), [cfg.bookingDays]);
  const slots = cfg.bookingSlots || [];

  const [svcId, setSvcId] = useState('');
  const [dayMs, setDayMs] = useState(days[0]?.ms ?? 0);
  const [slot, setSlot] = useState('');
  const [avail, setAvail] = useState<SlotAvail | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const svc = services.find((s) => s.id === svcId);
  const trade = svc ? guessTrade([svc.name]) : undefined;

  // load availability whenever the day (or trade) changes
  useEffect(() => {
    if (!dayMs) return;
    let alive = true;
    setAvail(null);
    cndSlotAvailability(dayMs, trade).then((a) => { if (alive) setAvail(a); });
    return () => { alive = false; };
  }, [dayMs, trade]);

  useEffect(() => { if (days.length && !days.some((d) => d.ms === dayMs)) setDayMs(days[0].ms); }, [days]);

  if (!cfg.bookingEnabled) {
    return <Shell tt={tt}><View style={styles.center}><Text style={styles.off}>{tt('cndBook', 'ການ ຈອງ ຄິວ ຍັງ ບໍ່ ເປີດ ໃຫ້ ບໍລິການ')}</Text></View></Shell>;
  }

  if (done) {
    return (
      <Shell tt={tt}>
        <View style={styles.center}>
          <Text style={{ fontSize: 54 }}>✅</Text>
          <Text style={styles.doneT}>{tt('cndBook', 'ຈອງ ຄິວ ສຳ ເລັດ!')}</Text>
          <Text style={styles.doneS}>{tt('cndBook', 'CND ຈະ ຈັດ ຊ່າງ + ຢືນຢັນ ຄິວ ຜ່ານ ໂທ/ແຊທ')}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace((fbUser && done ? `/cnd/track/${done}` : '/cnd/my') as any)}><Text style={styles.primaryTx}>{tt('cndBook', '📦 ຕິດຕາມ ຄິວ + ແຊທ')}</Text></Pressable>
          <Pressable style={styles.ghost} onPress={() => router.replace('/cnd' as any)}><Text style={styles.ghostTx}>{tt('cndBook', 'ກັບ ໜ້າ ຮ້ານ')}</Text></Pressable>
        </View>
      </Shell>
    );
  }

  const book = async () => {
    if (!svc) { alert(tt('cndBook', 'ເລືອກ ບໍລິການ ກ່ອນ')); return; }
    if (!slot) { alert(tt('cndBook', 'ເລືອກ ຊ່ວງ ເວລາ')); return; }
    if (phone.replace(/\D/g, '').length < 8) { alert(tt('cndBook', 'ໃສ່ ເບີ ໂທ')); return; }
    if (!address.trim()) { alert(tt('cndBook', 'ໃສ່ ທີ່ຢູ່')); return; }
    setBusy(true);
    try {
      const id = await createCndBooking({
        service: { productId: svc.id, name: svc.name, unit: svc.unit, price: svc.price },
        trade, slot, scheduledAt: slotToMs(dayMs, slot), warrantyDays: svc.warrantyDays,
        customerName: name, phone, address, note,
      });
      setDone(id);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Shell tt={tt}>
      <ScrollView contentContainerStyle={{ padding: 10, gap: 12 }}>
        {/* 1 · service */}
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndBook', '① ເລືອກ ບໍລິການ')}</Text>
          {services.length === 0 ? (
            <Text style={styles.muted}>{tt('cndBook', 'ຍັງ ບໍ່ ມີ ບໍລິການ — ໄປ ໜ້າ ຮ້ານ ໝວດ ບໍລິການ ຊ່າງ')}</Text>
          ) : (
            <View style={styles.wrap}>
              {services.map((s) => (
                <Pressable key={s.id} style={[styles.chip, svcId === s.id && styles.chipOn]} onPress={() => setSvcId(s.id)}>
                  <Text style={[styles.chipTx, svcId === s.id && styles.chipTxOn]} numberOfLines={1}>{s.name.replace('ບໍລິການ ', '')} · {kip(s.price)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* 2 · day */}
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndBook', '② ເລືອກ ວັນ')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {days.map((d) => (
              <Pressable key={d.ms} style={[styles.day, dayMs === d.ms && styles.dayOn]} onPress={() => { setDayMs(d.ms); setSlot(''); }}>
                <Text style={[styles.dayD, dayMs === d.ms && styles.dayOnTx]}>{d.d}</Text>
                <Text style={[styles.dayM, dayMs === d.ms && styles.dayOnTx]}>{d.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* 3 · slot */}
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndBook', '③ ເລືອກ ຊ່ວງ ເວລາ')}</Text>
          {avail === null ? <View style={{ paddingVertical: 10 }}><ActivityIndicator color={cnd.brand} /></View> : (
            <View style={styles.slots}>
              {slots.map((s) => {
                const booked = avail.bySlot[s] || 0;
                const rem = slotRemaining(cfg, avail.techCount, booked);
                const full = rem <= 0;
                const on = slot === s;
                return (
                  <Pressable key={s} disabled={full} style={[styles.slot, on && styles.slotOn, full && styles.slotFull]} onPress={() => setSlot(s)}>
                    <Text style={[styles.slotTx, on && styles.slotOnTx, full && styles.slotFullTx]}>{s}</Text>
                    <Text style={[styles.slotCap, on && styles.slotOnTx, full && styles.slotFullTx]}>{full ? tt('cndBook', 'ເຕັມ ແລ້ວ') : rem === Infinity ? tt('cndBook', 'ວ່າງ') : `${tt('cndBook', 'ວ່າງ')} ${rem}`}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 4 · contact */}
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndBook', '④ ຕິດຕໍ່')}</Text>
          {!fbUser && <Text style={styles.muted}>{tt('cndBook', 'ໃສ່ ເບີ ໄດ້ ເລີຍ · login ໜ້າ 📦 ພາຍ ຫຼັງ ເພື່ອ ຕິດຕາມ+ແຊທ')}</Text>}
          <TextInput style={styles.in} value={name} onChangeText={setName} placeholder={tt('cndBook', 'ຊື່')} placeholderTextColor={cnd.ink3} />
          <TextInput style={styles.in} value={phone} onChangeText={setPhone} placeholder={tt('cndBook', 'ເບີ ໂທ (020…)')} placeholderTextColor={cnd.ink3} keyboardType="phone-pad" />
          <TextInput style={[styles.in, { height: 54 }]} value={address} onChangeText={setAddress} placeholder={tt('cndBook', 'ທີ່ຢູ່ ໜ້າ ງານ')} placeholderTextColor={cnd.ink3} multiline />
          <TextInput style={[styles.in, { height: 48 }]} value={note} onChangeText={setNote} placeholder={tt('cndBook', 'ໝາຍ ເຫດ (ບໍ່ ບັງຄັບ)')} placeholderTextColor={cnd.ink3} multiline />
        </View>

        <View style={styles.ready}><Text style={styles.readyTx}>🧑‍🔧 {tt('cndBook', 'CND ຈະ ຈັດ ຊ່າງ ທີ່ ເໝາະ ໃຫ້ ຕາມ ຄິວ · ຊຳລະ ຕອນ ຊ່າງ ໄປ ຮອດ')}</Text></View>
        <Pressable style={[styles.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={book}>
          <Text style={styles.primaryTx}>{busy ? tt('cndBook', 'ກຳລັງ ຈອງ...') : `${tt('cndBook', '📅 ຢືນຢັນ ຈອງ ຄິວ')}${svc ? ` · ${kip(svc.price)}` : ''}`}</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </Shell>
  );
}

function Shell({ children, tt }: { children: React.ReactNode; tt: (m: string, s: string) => string }) {
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/cnd' as any))}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.topT}>{tt('cndBook', '📅 ຈອງ ຄິວ ຊ່າງ')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.surface2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.brand, paddingTop: 46, paddingBottom: 12, paddingHorizontal: 12 },
  topT: { color: '#fff', fontWeight: '900', fontSize: 15 },
  back: { color: '#fff', fontSize: 30, lineHeight: 30, fontWeight: '900', width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, gap: 8 },
  off: { color: cnd.ink3, fontSize: 15, textAlign: 'center' },
  doneT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  doneS: { fontSize: 13, color: cnd.ink3, textAlign: 'center', marginBottom: 6 },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 8 },
  h: { fontSize: 14, fontWeight: '900', color: cnd.brandDark },
  muted: { fontSize: 12, color: cnd.ink3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: cnd.surface, maxWidth: '100%' },
  chipOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  chipTx: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  chipTxOn: { color: '#fff' },
  day: { width: 58, alignItems: 'center', borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingVertical: 8, backgroundColor: cnd.surface },
  dayOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  dayD: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  dayM: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  dayOnTx: { color: '#fff' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  slot: { width: '48%', borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: cnd.surface },
  slotOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  slotFull: { backgroundColor: '#f4d7d7', borderColor: '#e6b8b8', opacity: 0.7 },
  slotTx: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  slotCap: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  slotOnTx: { color: '#fff' },
  slotFullTx: { color: '#9a3a3a' },
  in: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 11, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  ready: { backgroundColor: '#F0F9F4', borderWidth: 1, borderColor: '#B7E4C7', borderRadius: 10, padding: 11 },
  readyTx: { fontSize: 12.5, color: cnd.ink2, lineHeight: 18 },
  primary: { backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryTx: { color: '#fff', fontWeight: '900', fontSize: 15 },
  ghost: { paddingVertical: 12, alignItems: 'center' },
  ghostTx: { color: cnd.ink3, fontWeight: '800' },
});
