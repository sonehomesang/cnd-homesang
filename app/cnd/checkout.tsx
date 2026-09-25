import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { cnd, kip, kipT } from '@/lib/cnd/theme';
import { useCndConfig } from '@/lib/cnd/config';
import { cndCartClear, cndCartTotals, useCndCart } from '@/lib/cnd/cart';
import { createCndOrder } from '@/lib/cnd/orders';
import { watchCndTechs, type CndTech } from '@/lib/cnd/techs';
import TechBadge from '@/components/ninesang/TechBadge';
import { SERVICE_TERMS, guessTrade } from '@/lib/ninesang';
import { bookingDays, slotToMs, cndSlotAvailability, slotRemaining, type SlotAvail } from '@/lib/cnd/booking';
import { validateCoupon, watchCndCoupons, type CndCoupon } from '@/lib/cnd/coupons';
import { getCndCustomerCard, type CndCustomerCard } from '@/lib/cnd/publicCards';
import { watchCndZones, type CndZone } from '@/lib/cnd/zones';
import { addSavedAddress, getSavedAddresses, type CndSavedAddress } from '@/lib/cnd/addressBook';
import PhotoPicker from '@/components/PhotoPicker';
import { watchCndBanks, type CndBank } from '@/lib/cnd/banks';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';

export default function CndCheckout() {
  const tt = useTT();
  const { fbUser } = useAuth();
  const items = useCndCart();
  const config = useCndConfig();
  const { subtotal, installFeeTotal, installCount } = cndCartTotals(items);
  const hasInstall = installCount > 0;

  const [coupons, setCoupons] = useState<CndCoupon[]>([]);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number; id?: string } | null>(null);
  const [couponNote, setCouponNote] = useState('');   // why an applied code was dropped
  const [tierCard, setTierCard] = useState<CndCustomerCard | null>(null);
  const [zones, setZones] = useState<CndZone[]>([]);
  const [zoneId, setZoneId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cod' | 'qr'>('cod');
  const [banks, setBanks] = useState<CndBank[]>([]);
  const [bankId, setBankId] = useState<string>('');
  const [showQr, setShowQr] = useState(false);
  useEffect(() => watchCndBanks((b) => setBanks(b.filter((x) => x.active))), []);
  const bank = banks.find((b) => b.id === bankId);
  useEffect(() => watchCndCoupons(setCoupons), []);
  useEffect(() => watchCndZones((z) => setZones(z.filter((x) => x.active))), []);
  useEffect(() => { if (!zoneId && zones.length) setZoneId(zones[0].id); }, [zones, zoneId]);
  const applyCoupon = () => {
    if (!code.trim()) return;
    const r = validateCoupon(code, subtotal, coupons, { phone });
    if (!r.ok) { alert(r.reason ?? tt('cndCheckout', 'ໂຄ້ດ ບໍ່ ຖືກ ຕ້ອງ')); return; }
    setApplied({ code: code.trim().toUpperCase(), discount: r.discount, id: r.coupon?.id });
    setCouponNote('');
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [diffDelivery, setDiffDelivery] = useState(false);
  const [note, setNote] = useState('');
  // Re-check an applied coupon whenever what it depends on changes — cart total, the
  // phone (personal codes), or the admin closing/editing the code. The server
  // re-validates again when the order is created; this keeps the preview honest.
  useEffect(() => {
    if (!applied) return;
    const r = validateCoupon(applied.code, subtotal, coupons, { phone });
    if (!r.ok) { setApplied(null); setCouponNote(`${applied.code}: ${r.reason ?? tt('cndCheckout', 'ໂຄ້ດ ບໍ່ ຖືກ ຕ້ອງ')}`); return; }
    if (r.discount !== applied.discount || r.coupon?.id !== applied.id) setApplied({ code: applied.code, discount: r.discount, id: r.coupon?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, phone, coupons]);
  const [slip, setSlip] = useState('');
  const [saved, setSaved] = useState<CndSavedAddress[]>([]);
  useEffect(() => setSaved(getSavedAddresses()), []);
  const rememberAddr = () => { if (address.trim()) setSaved(addSavedAddress(tt('cndCheckout', 'ທີ່ຢູ່'), address)); };
  const [techs, setTechs] = useState<CndTech[]>([]);
  const [techId, setTechId] = useState<string>('');   // '' = ໃຫ້ CND ຈັດ ໃຫ້
  const [linked, setLinked] = useState(true);
  // ninesang: customer picks the install day + time-slot (unified with booking)
  const bkDays = useMemo(() => bookingDays(config.bookingDays || 14), [config.bookingDays]);
  const bkSlots = config.bookingSlots || [];
  const [schedDay, setSchedDay] = useState(0);
  const [schedSlot, setSchedSlot] = useState('');
  const [avail, setAvail] = useState<SlotAvail | null>(null);
  const installTrade = useMemo(() => hasInstall ? guessTrade(items.filter((i) => i.install).map((i) => i.name)) : undefined, [items, hasInstall]);
  useEffect(() => { if (bkDays.length && !schedDay) setSchedDay(bkDays[0].ms); }, [bkDays]);
  useEffect(() => {
    if (!hasInstall || !schedDay) { setAvail(null); return; }
    let alive = true; setAvail(null);
    cndSlotAvailability(schedDay, installTrade).then((a) => { if (alive) setAvail(a); });
    return () => { alive = false; };
  }, [hasInstall, schedDay, installTrade]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => watchCndTechs((t) => setTechs(t.filter((x) => x.active))), []);
  // returning-customer tier lookup by the phone they enter (public projection)
  useEffect(() => { let live = true; getCndCustomerCard(phone).then((c) => { if (live) setTierCard(c); }); return () => { live = false; }; }, [phone]);

  const zone = zones.find((z) => z.id === zoneId);
  const delivery = items.length ? (zone ? zone.fee : config.deliveryFee) : 0;
  const travelFee = hasInstall && zone?.techFee ? zone.techFee : 0;   // ninesang: tech travel fee
  const surveyMode = config.surveyFeeMode ?? 'off';
  const surveyFee = hasInstall && surveyMode === 'prepay' ? (config.surveyFee || 0) : 0;   // charged upfront only in prepay
  const couponDiscount = applied?.discount ?? 0;
  const tierDiscount = tierCard ? Math.round((subtotal * tierCard.discountPct) / 100) : 0;
  const discount = Math.min(couponDiscount + tierDiscount, subtotal);
  const taxPct = Math.max(0, config.taxPct || 0);
  const taxAmount = Math.round(((subtotal + installFeeTotal + travelFee + surveyFee + delivery - discount) * taxPct) / 100);
  const total = subtotal + installFeeTotal + travelFee + surveyFee + delivery - discount + taxAmount;
  const [termsOk, setTermsOk] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const place = async () => {
    if (!name.trim() || !phone.trim()) { alert(tt('cndCheckout', 'ໃສ່ ຊື່ + ເບີ ໂທ')); return; }
    if (hasInstall && !termsOk) { alert(tt('cndCheckout', 'ກະລຸນາ ຍອມຮັບ ເງື່ອນໄຂ ບໍລິການ ຊ່າງ')); return; }
    // final coupon check at the moment of ordering (phone or total may have changed)
    if (applied) {
      const r = validateCoupon(applied.code, subtotal, coupons, { phone });
      if (!r.ok) { setApplied(null); setCouponNote(`${applied.code}: ${r.reason ?? tt('cndCheckout', 'ໂຄ້ດ ບໍ່ ຖືກ ຕ້ອງ')}`); alert(r.reason ?? tt('cndCheckout', 'ໂຄ້ດ ບໍ່ ຖືກ ຕ້ອງ')); return; }
      if (r.discount !== applied.discount) { setApplied({ code: applied.code, discount: r.discount, id: r.coupon?.id }); alert(tt('cndCheckout', 'ສ່ວນ ຫຼຸດ ປ່ຽນ ແປງ — ກະລຸນາ ກວດ ຍອດ ຄືນ ກ່ອນ ສັ່ງ')); return; }
    }
    setBusy(true);
    try {
      const tech = techs.find((t) => t.id === techId);
      const oid = await createCndOrder({ items, deliveryFee: delivery, installTravelFee: travelFee, surveyFee: config.surveyFee, surveyFeeMode: surveyMode, deliveryZone: zone?.name, discount, couponCode: applied?.code, couponDiscount: couponDiscount || undefined, couponId: applied?.id, taxPct, paymentMethod: payMethod, paymentBank: payMethod === 'qr' ? bank?.name : undefined, paymentSlipUrl: slip || undefined, customerName: name, phone, address, deliveryAddress: diffDelivery ? deliveryAddress : undefined, note, techId: techId || undefined, techName: tech?.name, linkedToInvoice: linked, scheduledAt: (hasInstall && schedSlot) ? slotToMs(schedDay, schedSlot) : undefined, slot: (hasInstall && schedSlot) ? schedSlot : undefined, trade: hasInstall ? installTrade : undefined });
      setOrderId(oid);
      // coupon use is counted server-side (onCndOrderCreated) — guests included
      if (address.trim()) addSavedAddress(tt('cndCheckout', 'ທີ່ຢູ່'), address);   // remember for next time
      if (diffDelivery && deliveryAddress.trim()) addSavedAddress(tt('cndCheckout', 'ບ່ອນ ສົ່ງ'), deliveryAddress);
      cndCartClear();
      setDone(tt('cndCheckout', 'ສັ່ງ ຊື້ ສຳ ເລັດ!'));
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <View style={styles.root}>
        <View style={styles.top}><Text style={styles.topT}>{tt('cndCheckout', '✓ ສຳ ເລັດ')}</Text></View>
        <View style={styles.doneBox}>
          <Text style={{ fontSize: 54 }}>✅</Text>
          <Text style={styles.doneT}>{done}</Text>
          <Text style={styles.doneS}>{tt('cndCheckout', 'CND ຈະ ຕິດຕໍ່ ຢືນຢັນ + ນັດ ຈັດ ສົ່ງ')}{hasInstall ? tt('cndCheckout', ' ແລະ ນັດ ຊ່າງ ຕິດຕັ້ງ') : ''}</Text>
          <Pressable style={styles.trackBtn} onPress={() => router.replace((fbUser && orderId ? `/cnd/track/${orderId}` : '/cnd/my') as any)}>
            <Text style={styles.trackTx}>{tt('cndCheckout', '📦 ຕິດຕາມ ອໍເດີ + 💬 ແຊັດ ກັບ ຮ້ານ')}</Text>
          </Pressable>
          <Pressable style={styles.homeBtn} onPress={() => router.replace('/cnd' as any)}><Text style={styles.homeTx}>{tt('cndCheckout', 'ກັບ ໜ້າ ຮ້ານ')}</Text></Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/cnd/cart' as any))}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.topT}>{tt('cndCheckout', 'ຊຳລະ ເງິນ')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {/* customer */}
        <View style={styles.card}>
          <Text style={styles.cardH}>{tt('cndCheckout', '👤 ຂໍ້ມູນ ຜູ້ ຮັບ')}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={tt('cndCheckout', 'ຊື່')} placeholderTextColor={cnd.ink3} />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={tt('cndCheckout', 'ເບີ ໂທ')} placeholderTextColor={cnd.ink3} keyboardType="phone-pad" />
          {saved.length > 0 && (
            <View style={styles.addrWrap}>
              {saved.map((a) => <Pressable key={a.id} style={styles.addrChip} onPress={() => setAddress(a.text)}><Text style={styles.addrTx} numberOfLines={1}>📍 {a.text}</Text></Pressable>)}
            </View>
          )}
          <TextInput style={[styles.input, { height: 58 }]} value={address} onChangeText={setAddress} placeholder={tt('cndCheckout', 'ທີ່ ຢູ່ ຜູ້ ຮັບ')} placeholderTextColor={cnd.ink3} multiline />
          {!!address.trim() && <Pressable onPress={rememberAddr}><Text style={styles.saveAddr}>{tt('cndCheckout', '💾 ບັນທຶກ ທີ່ຢູ່ ນີ້ ໄວ້ ໃຊ້ ເທື່ອ ໜ້າ')}</Text></Pressable>}
          <TextInput style={[styles.input, { height: 52 }]} value={note} onChangeText={setNote} placeholder={tt('cndCheckout', '📝 ໝາຍ ເຫດ (ບໍ່ ບັງຄັບ)')} placeholderTextColor={cnd.ink3} multiline />
          {tierCard && (
            <View style={[styles.tierBanner, { borderColor: tierCard.tierColor }]}>
              <Text style={[styles.tierBannerTx, { color: tierCard.tierColor }]}>{tierCard.tierIcon} {tt('cndCheckout', 'ລູກຄ້າ ລະດັບ')} {tierCard.tierName}{tierCard.discountPct > 0 ? ` · ${tt('cndCheckout', 'ຮັບ ສ່ວນ ຫຼຸດ')} ${tierCard.discountPct}%` : ''}</Text>
            </View>
          )}
        </View>

        {/* separate delivery address */}
        <View style={styles.card}>
          <View style={styles.linkRow}>
            <View style={{ flex: 1 }}><Text style={styles.linkL}>{tt('cndCheckout', '🚚 ສົ່ງ ບ່ອນ ອື່ນ (ຕ່າງ ຈາກ ຜູ້ ຮັບ)')}</Text><Text style={styles.linkS}>{diffDelivery ? tt('cndCheckout', 'ໃສ່ ທີ່ຢູ່ ຈັດ ສົ່ງ ຕ່າງຫາກ') : tt('cndCheckout', 'ສົ່ງ ບ່ອນ ດຽວ ກັບ ຜູ້ ຮັບ')}</Text></View>
            <Switch value={diffDelivery} onValueChange={setDiffDelivery} trackColor={{ true: cnd.brand }} />
          </View>
          {diffDelivery && (
            <>
              {saved.length > 0 && <View style={styles.addrWrap}>{saved.map((a) => <Pressable key={a.id} style={styles.addrChip} onPress={() => setDeliveryAddress(a.text)}><Text style={styles.addrTx} numberOfLines={1}>📍 {a.text}</Text></Pressable>)}</View>}
              <TextInput style={[styles.input, { height: 58 }]} value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder={tt('cndCheckout', 'ທີ່ຢູ່ ຈັດ ສົ່ງ')} placeholderTextColor={cnd.ink3} multiline />
            </>
          )}
        </View>

        {/* install service */}
        {hasInstall && (
          <View style={[styles.card, { borderColor: cnd.yellow }]}>
            <Text style={styles.cardH}>{tt('cndCheckout', '🔧 ບໍລິການ ຕິດຕັ້ງ')} ({installCount} {tt('cndCheckout', 'ລາຍການ')} · +{kip(installFeeTotal)} {tt('cndCheckout', 'ກີບ')})</Text>
            <Text style={styles.lbl}>{tt('cndCheckout', 'ເລືອກ ຊ່າງ (CND ຈັດ ໃຫ້)')}</Text>
            <View style={styles.techWrap}>
              <Pressable style={[styles.techChip, techId === '' && styles.techOn]} onPress={() => setTechId('')}><Text style={[styles.techTx, techId === '' && styles.techTxOn]}>{tt('cndCheckout', 'ໃຫ້ CND ຈັດ ໃຫ້')}</Text></Pressable>
              {techs.map((t) => (
                <Pressable key={t.id} style={[styles.techChip, techId === t.id && styles.techOn]} onPress={() => setTechId(t.id)}>
                  <Text style={[styles.techTx, techId === t.id && styles.techTxOn]} numberOfLines={1}>{t.name} · {t.trade}</Text>
                  <View style={{ marginTop: 3 }}><TechBadge verified={t.verified} jobsDone={t.jobsDone ?? 0} ratingAvg={t.ratingAvg ?? 0} showRating compact /></View>
                </Pressable>
              ))}
              {techs.length === 0 && <Text style={styles.noTech}>{tt('cndCheckout', 'ຍັງ ບໍ່ ມີ ຊ່າງ ລົງ ທະບຽນ — CND ຈັດ ໃຫ້ ພາຍ ຫຼັງ')}</Text>}
            </View>

            {/* ninesang: pick install day + time-slot (shares the booking availability) */}
            {config.bookingEnabled !== false && bkSlots.length > 0 && (
              <>
                <Text style={styles.lbl}>{tt('cndCheckout', '📅 ນັດ ວັນ ຊ່າງ')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
                  {bkDays.map((d) => (
                    <Pressable key={d.ms} style={[styles.dayCk, schedDay === d.ms && styles.dayCkOn]} onPress={() => { setSchedDay(d.ms); setSchedSlot(''); }}>
                      <Text style={[styles.dayCkD, schedDay === d.ms && styles.dayCkOnTx]}>{d.d}</Text>
                      <Text style={[styles.dayCkM, schedDay === d.ms && styles.dayCkOnTx]}>{d.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.lbl}>{tt('cndCheckout', '⏰ ເລືອກ ຊ່ວງ ເວລາ')}</Text>
                <View style={styles.slotWrap}>
                  {bkSlots.map((s) => {
                    const booked = avail?.bySlot[s] || 0;
                    const rem = slotRemaining(config, avail?.techCount ?? 0, booked);
                    const full = rem <= 0;
                    const on = schedSlot === s;
                    return (
                      <Pressable key={s} disabled={full} style={[styles.slotCk, on && styles.slotCkOn, full && styles.slotCkFull]} onPress={() => setSchedSlot(s)}>
                        <Text style={[styles.slotCkT, on && { color: '#fff' }, full && { color: '#9a3a3a' }]}>{s}</Text>
                        <Text style={[styles.slotCkC, on && { color: '#fff' }, full && { color: '#9a3a3a' }]}>{full ? tt('cndCheckout', 'ເຕັມ') : rem === Infinity ? tt('cndCheckout', 'ວ່າງ') : `${tt('cndCheckout', 'ວ່າງ')} ${rem}`}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.schedHint}>{schedSlot ? `✓ ${tt('cndCheckout', 'ນັດ')} ${bkDays.find((d) => d.ms === schedDay)?.d}/${new Date(schedDay).getMonth() + 1} · ${schedSlot}` : tt('cndCheckout', 'ຖ້າ ບໍ່ ເລືອກ ເວລາ — CND ຈະ ນັດ ໃຫ້ ພາຍ ຫຼັງ')}</Text>
              </>
            )}

            <View style={styles.linkRow}>
              <View style={{ flex: 1 }}><Text style={styles.linkL}>{tt('cndCheckout', '🔗 ຜູກ ບໍລິການ ຕິດຕັ້ງ ກັບ ໃບ ບິນ ນີ້')}</Text><Text style={styles.linkS}>{linked ? tt('cndCheckout', 'ຢູ່ ໃນ ໃບ ບິນ ດຽວ ກັນ') : tt('cndCheckout', 'ແຍກ ເປັນ ບໍລິການ ຕ່າງຫາກ')}</Text></View>
              <Switch value={linked} onValueChange={setLinked} trackColor={{ true: cnd.blue }} />
            </View>
          </View>
        )}

        {/* delivery zone */}
        {zones.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardH}>{tt('cndCheckout', '🚚 ເຂດ ຈັດ ສົ່ງ')}</Text>
            <View style={styles.techWrap}>
              {zones.map((z) => (
                <Pressable key={z.id} style={[styles.techChip, zoneId === z.id && styles.techOn]} onPress={() => setZoneId(z.id)}>
                  <Text style={[styles.techTx, zoneId === z.id && styles.techTxOn]} numberOfLines={1}>{z.name} · {z.fee === 0 ? tt('cndCheckout', 'ຟຣີ') : kip(z.fee)}{z.eta ? ` · ${z.eta}` : ''}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* coupon */}
        <View style={styles.card}>
          <Text style={styles.cardH}>{tt('cndCheckout', '🎟️ ໂຄ້ດ ສ່ວນ ຫຼຸດ')}</Text>
          {applied ? (
            <View style={styles.couponApplied}>
              <Text style={styles.couponOk}>✓ {applied.code} · {tt('cndCheckout', 'ຫຼຸດ')} {kip(applied.discount)} {tt('cndCheckout', 'ກີບ')}</Text>
              <Pressable onPress={() => { setApplied(null); setCode(''); }}><Text style={{ color: cnd.error, fontWeight: '800' }}>{tt('cndCheckout', 'ລຶບ')}</Text></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder={tt('cndCheckout', 'ໃສ່ ໂຄ້ດ (ເຊັ່ນ HELLO10)')} placeholderTextColor={cnd.ink3} autoCapitalize="characters" />
              <Pressable style={styles.applyBtn} onPress={applyCoupon}><Text style={styles.applyTx}>{tt('cndCheckout', 'ໃຊ້')}</Text></Pressable>
            </View>
          )}
          {!!couponNote && !applied && <Text style={styles.couponNote}>⚠️ {couponNote}</Text>}
        </View>

        {/* payment method */}
        <View style={styles.card}>
          <Text style={styles.cardH}>{tt('cndCheckout', '💳 ວິທີ ຈ່າຍ ເງິນ')}</Text>
          <View style={styles.techWrap}>
            <Pressable style={[styles.techChip, payMethod === 'cod' && styles.techOn]} onPress={() => setPayMethod('cod')}><Text style={[styles.techTx, payMethod === 'cod' && styles.techTxOn]}>{tt('cndCheckout', '💵 ເກັບ ເງິນ ປາຍ ທາງ (COD)')}</Text></Pressable>
            <Pressable style={[styles.techChip, payMethod === 'qr' && styles.techOn]} onPress={() => setPayMethod('qr')}><Text style={[styles.techTx, payMethod === 'qr' && styles.techTxOn]}>{tt('cndCheckout', '📱 ໂອນ QR / ທະນາຄານ')}</Text></Pressable>
          </View>
          {payMethod === 'qr' && (
            <View style={{ gap: 8 }}>
              {banks.length > 0 ? (
                <>
                  <Text style={styles.lbl}>{tt('cndCheckout', 'ເລືອກ ທະນາຄານ')}</Text>
                  <View style={styles.techWrap}>
                    {banks.map((bk) => <Pressable key={bk.id} style={[styles.techChip, bankId === bk.id && styles.techOn]} onPress={() => { setBankId(bk.id); setShowQr(false); }}><Text style={[styles.techTx, bankId === bk.id && styles.techTxOn]}>{bk.name}</Text></Pressable>)}
                  </View>
                  {bank && !showQr && <Pressable style={styles.qrShowBtn} onPress={() => setShowQr(true)}><Text style={styles.qrShowTx}>{tt('cndCheckout', '📱 ສະແດງ QR')} — {bank.name}</Text></Pressable>}
                  {bank && showQr && (
                    <View style={styles.qrBox}>
                      {bank.qrUrl ? <Image source={{ uri: bank.qrUrl }} style={styles.qrImg} resizeMode="contain" /> : <Text style={styles.qrNote}>{tt('cndCheckout', 'ທະນາຄານ ນີ້ ຍັງ ບໍ່ ໄດ້ ໃສ່ ຮູບ QR')}</Text>}
                      {(bank.accountNo || bank.accountName) && <Text style={styles.qrBank}>{[bank.name, bank.accountNo, bank.accountName].filter(Boolean).join(' · ')}</Text>}
                      <Text style={styles.qrNote}>{tt('cndCheckout', 'ໂອນ ຕາມ ຍອດ ລວມ ແລ້ວ ຮ້ານ ຈະ ຢືນຢັນ ການ ຈ່າຍ')}</Text>
                    </View>
                  )}
                </>
              ) : (config.payQrUrl || config.bankAccount) ? (
                <View style={styles.qrBox}>
                  {!!config.payQrUrl && <Image source={{ uri: config.payQrUrl }} style={styles.qrImg} resizeMode="contain" />}
                  {(config.bankName || config.bankAccount) && <Text style={styles.qrBank}>{[config.bankName, config.bankAccount, config.bankAccountName].filter(Boolean).join(' · ')}</Text>}
                  <Text style={styles.qrNote}>{tt('cndCheckout', 'ໂອນ ຕາມ ຍອດ ລວມ ແລ້ວ ຮ້ານ ຈະ ຢືນຢັນ')}</Text>
                </View>
              ) : <Text style={styles.qrNote}>{tt('cndCheckout', 'ຮ້ານ ຍັງ ບໍ່ ໄດ້ ຕັ້ງ ບັນຊີ ຮັບ ໂອນ')}</Text>}
            </View>
          )}
          <Text style={styles.lbl}>{tt('cndCheckout', '📎 ແນບ ສລີບ ໂອນ (ຮູບ — ບໍ່ ບັງຄັບ)')}</Text>
          <PhotoPicker photos={slip ? [slip] : []} onChange={(u) => setSlip(u[0] || '')} pathPrefix="cnd/slips" max={1} />
        </View>

        {/* ninesang: survey-fee disclosure + service T&C (when install chosen) */}
        {hasInstall && (
          <View style={styles.card}>
            {surveyMode !== 'off' && (
              <View style={styles.surveyBox}>
                <Text style={styles.surveyH}>📐 {tt('cndCheckout', 'ຄ່າ ສຳຫຼວດ ໜ້າ ງານ')}{config.surveyFee ? ` · ${kip(config.surveyFee)} ${tt('cndCheckout', 'ກີບ')}` : ''}</Text>
                <Text style={styles.surveyS}>{surveyMode === 'prepay'
                  ? tt('cndCheckout', 'ຈ່າຍ ລ່ວງ ໜ້າ · ຄືນ ເປັນ ສ່ວນ ຫຼຸດ ເມື່ອ ຕົກລົງ ໃຊ້ ບໍລິການ')
                  : tt('cndCheckout', 'ວຽກ ໃຫຍ່ ອາດ ຕ້ອງ ສຳຫຼວດ ກ່ອນ · ຄິດ ຄ່າ ເມື່ອ ບໍ່ ດຳເນີນ ຕໍ່')}</Text>
              </View>
            )}
            <Pressable style={styles.termsRow} onPress={() => setTermsOk((v) => !v)}>
              <Text style={styles.termsBox}>{termsOk ? '☑' : '☐'}</Text>
              <Text style={styles.termsTx}>{tt('cndCheckout', 'ຂ້ອຍ ຍອມຮັບ ')}<Text style={styles.termsLink} onPress={() => setShowTerms((v) => !v)}>{tt('cndCheckout', 'ເງື່ອນໄຂ ບໍລິການ ຊ່າງ')}</Text></Text>
            </Pressable>
            {showTerms && <View style={styles.termsList}>{SERVICE_TERMS.map((t, i) => <Text key={i} style={styles.termsItem}>• {tt('cndCheckout', t)}</Text>)}</View>}
          </View>
        )}

        {/* totals */}
        <View style={styles.card}>
          <View style={styles.tr}><Text style={styles.trL}>{tt('cndCheckout', 'ລວມ ສິນຄ້າ')}</Text><Text style={styles.trV}>{kip(subtotal)} {tt('cndCheckout', 'ກີບ')}</Text></View>
          {installFeeTotal > 0 && <View style={styles.tr}><Text style={[styles.trL, { color: cnd.brandDark }]}>{tt('cndCheckout', 'ຄ່າ ຕິດຕັ້ງ')}</Text><Text style={[styles.trV, { color: cnd.brandDark }]}>+{kip(installFeeTotal)} {tt('cndCheckout', 'ກີບ')}</Text></View>}
          {travelFee > 0 && <View style={styles.tr}><Text style={[styles.trL, { color: cnd.brandDark }]}>{tt('cndCheckout', '🔧 ຄ່າ ເດີນທາງ ຊ່າງ')}</Text><Text style={[styles.trV, { color: cnd.brandDark }]}>+{kip(travelFee)} {tt('cndCheckout', 'ກີບ')}</Text></View>}
          {surveyFee > 0 && <View style={styles.tr}><Text style={[styles.trL, { color: cnd.brandDark }]}>{tt('cndCheckout', '📐 ຄ່າ ສຳຫຼວດ ໜ້າ ງານ')}</Text><Text style={[styles.trV, { color: cnd.brandDark }]}>+{kip(surveyFee)} {tt('cndCheckout', 'ກີບ')}</Text></View>}
          <View style={styles.tr}><Text style={styles.trL}>{tt('cndCheckout', 'ຄ່າ ສົ່ງ')}{zone ? ` (${zone.name})` : ''}</Text><Text style={styles.trV}>{delivery === 0 ? tt('cndCheckout', 'ຟຣີ') : kip(delivery) + ' ' + tt('cndCheckout', 'ກີບ')}</Text></View>
          {couponDiscount > 0 && <View style={styles.tr}><Text style={[styles.trL, { color: cnd.green }]}>{tt('cndCheckout', 'ຄູປອງ')} ({applied?.code})</Text><Text style={[styles.trV, { color: cnd.green }]}>−{kip(couponDiscount)} {tt('cndCheckout', 'ກີບ')}</Text></View>}
          {tierDiscount > 0 && <View style={styles.tr}><Text style={[styles.trL, { color: cnd.green }]}>{tt('cndCheckout', 'ສ່ວນ ຫຼຸດ ສະມາຊິກ')} ({tierCard?.tierName})</Text><Text style={[styles.trV, { color: cnd.green }]}>−{kip(tierDiscount)} {tt('cndCheckout', 'ກີບ')}</Text></View>}
          {taxAmount > 0 && <View style={styles.tr}><Text style={styles.trL}>VAT {taxPct}%</Text><Text style={styles.trV}>{kipT(taxAmount)}</Text></View>}
          <View style={styles.grand}><Text style={styles.grandL}>{tt('cndCheckout', 'ລວມ')}</Text><Text style={styles.grandV}>{kip(total)} {tt('cndCheckout', 'ກີບ')}</Text></View>
        </View>

        <Pressable style={[styles.place, (busy || items.length === 0) && { opacity: 0.5 }]} disabled={busy || items.length === 0} onPress={place}>
          <Text style={styles.placeTx}>{busy ? tt('cndCheckout', 'ກຳລັງ ສັ່ງ...') : `${tt('cndCheckout', 'ຢືນຢັນ ສັ່ງ ຊື້')}${hasInstall ? tt('cndCheckout', ' + ນັດ ຊ່າງ') : ''}`}</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: cnd.steel },
  back: { color: cnd.white, fontSize: 24, fontWeight: '800', width: 24 },
  topT: { color: cnd.white, fontSize: 15, fontWeight: '800' },
  body: { padding: 12, gap: 12 },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 14, gap: 9 },
  cardH: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 11, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  lbl: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  techWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  techChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: cnd.surface, maxWidth: 220 },
  techOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  techTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  techTxOn: { color: cnd.white },
  noTech: { fontSize: 12, color: cnd.ink3 },
  dayCk: { width: 52, alignItems: 'center', borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 6, backgroundColor: cnd.surface },
  dayCkOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  dayCkD: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  dayCkM: { fontSize: 12, color: cnd.ink3 },
  dayCkOnTx: { color: '#fff' },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slotCk: { width: '48%', borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 8, alignItems: 'center', backgroundColor: cnd.surface },
  slotCkOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  slotCkFull: { backgroundColor: '#f4d7d7', borderColor: '#e6b8b8', opacity: 0.7 },
  slotCkT: { fontSize: 12.5, fontWeight: '800', color: cnd.ink },
  slotCkC: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  schedHint: { fontSize: 12, color: cnd.ink2, marginTop: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.blueSoft, borderRadius: 9, padding: 10, marginTop: 2 },
  linkL: { fontSize: 12.5, fontWeight: '800', color: cnd.ink },
  linkS: { fontSize: 12, color: cnd.ink2, marginTop: 1 },
  tr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  trL: { fontSize: 13, color: cnd.ink2 },
  trV: { fontSize: 13, color: cnd.ink, fontWeight: '600' },
  addrWrap: { gap: 6 },
  addrChip: { backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  addrTx: { fontSize: 12.5, color: cnd.ink2, fontWeight: '600' },
  saveAddr: { fontSize: 12.5, color: cnd.blue, fontWeight: '800', paddingVertical: 2 },
  qrShowBtn: { backgroundColor: cnd.steel, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  qrShowTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  qrBox: { alignItems: 'center', gap: 6, backgroundColor: cnd.surface2, borderRadius: 10, padding: 12, marginTop: 4 },
  qrImg: { width: 150, height: 150, backgroundColor: cnd.white, borderRadius: 8 },
  qrBank: { fontSize: 13, fontWeight: '800', color: cnd.ink, textAlign: 'center' },
  qrNote: { fontSize: 12, color: cnd.ink2, textAlign: 'center' },
  surveyBox: { backgroundColor: cnd.yellowSoft, borderRadius: 9, padding: 10, marginBottom: 8 },
  surveyH: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  surveyS: { fontSize: 12, color: cnd.ink2, marginTop: 2 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termsBox: { fontSize: 15, color: cnd.brand },
  termsTx: { flex: 1, fontSize: 12.5, color: cnd.ink2 },
  termsLink: { color: cnd.blue, fontWeight: '800', textDecorationLine: 'underline' },
  termsList: { marginTop: 8, gap: 4, backgroundColor: cnd.surface2, borderRadius: 8, padding: 10 },
  termsItem: { fontSize: 12, color: cnd.ink2, lineHeight: 17 },
  tierBanner: { borderWidth: 1.5, borderRadius: 9, padding: 9, backgroundColor: cnd.surface2, marginTop: 2 },
  tierBannerTx: { fontSize: 12.5, fontWeight: '800' },
  couponApplied: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.greenSoft, borderRadius: 9, padding: 11 },
  couponOk: { fontSize: 13, fontWeight: '800', color: cnd.green },
  couponNote: { fontSize: 12, fontWeight: '700', color: cnd.error, marginTop: 8 },
  applyBtn: { backgroundColor: cnd.steel, borderRadius: 9, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  applyTx: { color: cnd.white, fontWeight: '800', fontSize: 14 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: cnd.ink, marginTop: 6, paddingTop: 8 },
  grandL: { fontSize: 15, fontWeight: '800', color: cnd.ink },
  grandV: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  place: { backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  placeTx: { color: cnd.white, fontWeight: '800', fontSize: 15 },
  doneBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  doneT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  doneS: { fontSize: 13.5, color: cnd.ink2, textAlign: 'center' },
  trackBtn: { backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 22, marginTop: 12, alignSelf: 'stretch', alignItems: 'center' },
  trackTx: { color: cnd.white, fontWeight: '900', fontSize: 14 },
  homeBtn: { borderRadius: 11, paddingVertical: 12, paddingHorizontal: 26, marginTop: 8 },
  homeTx: { color: cnd.ink3, fontWeight: '800', fontSize: 14 },
});
