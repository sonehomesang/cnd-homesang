import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import {
  acceptTask,
  becomeRider,
  codOutstanding,
  type DeliveryTask,
  riderStats,
  releaseTask,
  requestCodRemit,
  type RiderProfile,
  setRiderActive,
  updateRiderLocation,
  updateTaskStatus,
  watchMyDeliveryTasks,
  watchMyRider,
  watchOpenDeliveryTasks,
  watchRiderEarnings,
} from '@/lib/riders';
import { PLATFORM_FEE_RATE, type Earning } from '@/lib/wallet';
import PhotoPicker from '@/components/PhotoPicker';
import { currentPosition, directionsUrl, distanceKm } from '@/lib/geo';
import BottomSheet from '@/components/BottomSheet';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const VEHICLES = ['🛵 ລົດຈັກ', '🚗 ລົດເກງ', '🚚 ລົດກະບະ', '🚲 ຖີບ'];
const STEPS: { key: DeliveryTask['status']; label: string; icon: string }[] = [
  { key: 'accepted', label: 'ຮັບງານ', icon: '✓' },
  { key: 'picked_up', label: 'ຮັບເຄື່ອງ', icon: '📦' },
  { key: 'delivered', label: 'ສົ່ງຮອດ', icon: '🏠' },
];
const stepIndex = (s: DeliveryTask['status']) => STEPS.findIndex((x) => x.key === s);

export default function RiderScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [ridersLoaded, setRidersLoaded] = useState(false);
  const [openTasks, setOpenTasks] = useState<DeliveryTask[]>([]);
  const [myTasks, setMyTasks] = useState<DeliveryTask[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);

  // onboarding form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [zone, setZone] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [plate, setPlate] = useState('');
  const [licenseImg, setLicenseImg] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'queue' | 'mine'>('queue');

  // proof-of-delivery sheet
  const [proofFor, setProofFor] = useState<DeliveryTask | null>(null);
  const [proofImg, setProofImg] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [proofErr, setProofErr] = useState('');
  // live location sharing (opt-in, only while carrying work)
  const [sharing, setSharing] = useState(false);
  const [sharePos, setSharePos] = useState<{ lat: number; lng: number } | null>(null);
  // COD remittance sheet
  const [remitOpen, setRemitOpen] = useState(false);
  const [remitMethod, setRemitMethod] = useState('ໂອນ ເຂົ້າ ບັນຊີ ບໍລິສັດ');
  const [remitProof, setRemitProof] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    const u = watchMyRider(fbUser.uid, (r) => { setRider(r); setRidersLoaded(true); });
    return u;
  }, [fbUser]);

  useEffect(() => {
    setName(profile?.firstName || (profile as any)?.name || '');
    setPhone((profile as any)?.phone || '');
  }, [profile]);

  const active = rider?.active !== false && !!rider;
  const approved = rider?.approved === true;

  // MY tasks + earnings are always watched (a paused / de-approved rider must
  // still be able to see and finish work already in their hands). Only the OPEN
  // queue is hidden while paused.
  useEffect(() => {
    if (!fbUser || !rider) return;
    const u2 = watchMyDeliveryTasks(fbUser.uid, setMyTasks);
    const u3 = watchRiderEarnings(fbUser.uid, setEarnings);
    return () => { u2(); u3(); };
  }, [fbUser, rider]);

  useEffect(() => {
    if (!fbUser || !active || !approved) { setOpenTasks([]); return; }
    return watchOpenDeliveryTasks(setOpenTasks);
  }, [fbUser, active, approved]);

  const riderName = profile?.firstName || (profile as any)?.name || rider?.name || tt('rider', 'Rider');
  const activeMine = useMemo(() => myTasks.filter((t) => t.status !== 'delivered' && t.status !== 'cancelled'), [myTasks]);
  const doneCount = myTasks.filter((t) => t.status === 'delivered').length;
  const netTotal = earnings.reduce((s, e) => s + e.net, 0);

  // COD cash the rider is holding (delivered, not yet confirmed remitted)
  const codOwed = codOutstanding(myTasks);
  const myStats = riderStats(myTasks);
  const owedTasks = myTasks.filter((t) => t.status === 'delivered' && !t.codRemitted && (t.codAmount ?? 0) > 0);
  const remitPending = owedTasks.some((t) => t.remitRequested);

  // push the position onto every in-hand task every 20s while sharing is on.
  // Stops by itself when the rider has no active task or turns sharing off.
  useEffect(() => {
    if (!sharing || activeMine.length === 0) return;
    let stopped = false;
    const push = async () => {
      try {
        const p = await currentPosition();
        if (stopped) return;
        setSharePos(p);
        await Promise.all(activeMine.map((t) => updateRiderLocation(t.id, p)));
      } catch { /* permission denied / unavailable — keep quiet */ }
    };
    push();
    const iv = setInterval(push, 20000);
    return () => { stopped = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, activeMine.map((t) => t.id).join(',')]);

  // sharing is meaningless with nothing in hand — switch it off automatically
  useEffect(() => {
    if (sharing && activeMine.length === 0) setSharing(false);
  }, [sharing, activeMine.length]);

  // distance from the rider to each pickup, for the "near me" queue ordering
  const queueSorted = useMemo(() => {
    const list = [...openTasks];
    if (!sharePos) return list; // no position → keep newest-first
    const d = (t: DeliveryTask) => (t.pickupLat != null && t.pickupLng != null
      ? distanceKm(sharePos, { lat: t.pickupLat, lng: t.pickupLng })
      : Number.POSITIVE_INFINITY);
    return list.sort((a, b) => d(a) - d(b));
  }, [openTasks, sharePos]);

  const openProof = (t: DeliveryTask) => {
    setProofFor(t); setProofImg([]); setRecipient(''); setCodeInput(''); setProofErr('');
  };
  const submitProof = async () => {
    if (!proofFor) return;
    if (proofImg.length === 0 && !recipient.trim()) {
      setProofErr(tt('rider', 'ຕ້ອງ ແນບ ຮູບ ຫຼື ໃສ່ ຊື່ ຜູ້ຮັບ ຢ່າງໜ້ອຍ 1 ຢ່າງ'));
      return;
    }
    const expected = proofFor.handoverCode;
    if (expected && codeInput.trim() && codeInput.trim() !== expected) {
      setProofErr(tt('rider', 'ລະຫັດ ຢືນຢັນ ບໍ່ ຖືກ — ຖາມ ລູກຄ້າ ອີກ ຄັ້ງ'));
      return;
    }
    setBusy(true);
    try {
      await updateTaskStatus(proofFor.id, 'delivered', proofFor.orderId, {
        proofImage: proofImg[0],
        recipientName: recipient.trim() || undefined,
        handoverOk: expected ? codeInput.trim() === expected : undefined,
      });
      setProofFor(null);
    } catch (e: any) {
      setProofErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const submitRemit = async () => {
    setBusy(true);
    try {
      await requestCodRemit(owedTasks.map((t) => t.id), { method: remitMethod, proof: remitProof[0] });
      setRemitOpen(false); setRemitProof([]);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const submitOptIn = async () => {
    if (!fbUser || !name.trim()) return;
    setBusy(true);
    try {
      await becomeRider(fbUser.uid, { name: name.trim(), phone: phone.trim(), vehicle, zone: zone.trim(), licenseNo: licenseNo.trim() || undefined, plate: plate.trim() || undefined, licenseImage: licenseImg[0] });
    } catch (e) { console.error('becomeRider:', e); } finally { setBusy(false); }
  };

  if (loading || !fbUser || !ridersLoaded) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('rider', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  // ===== onboarding (not yet a rider) =====
  if (!rider) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          <View style={styles.hero}>
            <Text style={styles.heroBig}>🛵</Text>
            <Text style={styles.heroTitle}>{tt('rider', 'ສະໝັກເປັນ HomeSang Rider')}</Text>
            <Text style={styles.heroSub}>{tt('rider', 'ຮັບງານສົ່ງໃກ້ຕົວ · ເລືອກເວລາເອງ · ຄ່າສົ່ງເຂົ້າ wallet')}</Text>
          </View>
          <Text style={styles.perk}>✅ {tt('rider', 'ບໍ່ຕ້ອງ ປ່ຽນປະເພດບັນຊີ — ເປັນ rider ຄຽງຄູ່ ບົດບາດເກົ່າ')}</Text>
          <Text style={styles.perk}>💰 {tt('rider', 'ໄດ້ຄ່າສົ່ງ ຫັກທຳນຽມ 10% · ຖອນຜ່ານ wallet')}</Text>

          <Text style={styles.label}>{tt('rider', 'ຊື່ ສະແດງ')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={tt('rider', 'ຊື່')} placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>{tt('rider', 'ເບີໂທ ຕິດຕໍ່')}</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="020 ..." placeholderTextColor="#999" keyboardType="phone-pad" style={styles.input} />
          <Text style={styles.label}>{tt('rider', 'ພາຫະນະ')}</Text>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Pressable key={v} style={[styles.chip, vehicle === v && styles.chipOn]} onPress={() => setVehicle(v)}>
                <Text style={[styles.chipText, vehicle === v && styles.chipTextOn]}>{v}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{tt('rider', 'ເຂດ ໃຫ້ບໍລິການ (ບໍ່ບັງຄັບ)')}</Text>
          <TextInput value={zone} onChangeText={setZone} placeholder={tt('rider', 'ນະຄອນຫຼວງ — ສີໂຄດ, ໄຊເສດຖາ')} placeholderTextColor="#999" style={styles.input} />

          <View style={styles.verifyBox}>
            <Text style={styles.verifyTitle}>🪪 {tt('rider', 'ຢືນຢັນຕົວຕົນ (ໃຫ້ admin ກວດ)')}</Text>
            <Text style={styles.label}>{tt('rider', 'ເລກ ໃບຂັບຂີ່')}</Text>
            <TextInput value={licenseNo} onChangeText={setLicenseNo} placeholder={tt('rider', 'ເລກ ໃບຂັບຂີ່')} placeholderTextColor="#999" style={styles.input} />
            <Text style={styles.label}>{tt('rider', 'ປ້າຍ ທະບຽນ ລົດ (ບໍ່ບັງຄັບ)')}</Text>
            <TextInput value={plate} onChangeText={setPlate} placeholder={tt('rider', 'ກຂ 1234')} placeholderTextColor="#999" style={styles.input} />
            <Text style={styles.label}>{tt('rider', '📷 ຮູບ ໃບຂັບຂີ່')}</Text>
            <PhotoPicker photos={licenseImg} onChange={setLicenseImg} pathPrefix={`riders/${fbUser?.uid ?? 'anon'}`} max={1} />
          </View>

          <Pressable style={[styles.btn, (busy || !name.trim()) && styles.btnOff]} onPress={submitOptIn} disabled={busy || !name.trim()}>
            <Text style={styles.btnText}>{busy ? tt('rider', 'ກຳລັງສະໝັກ...') : tt('rider', '🛵 ສະໝັກ (ລໍ admin ອະນຸມັດ)')}</Text>
          </Pressable>
          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>
    );
  }

  // ===== rider dashboard =====
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        {/* verification status */}
        {approved ? (
          <View style={styles.verOk}><Text style={styles.verOkText}>✓ {tt('rider', 'ໄຣເດີ້ ຢືນຢັນແລ້ວ — ຮັບງານໄດ້')}</Text></View>
        ) : (
          <View style={styles.verPend}>
            <Text style={styles.verPendTitle}>⏳ {tt('rider', 'ລໍ admin ອະນຸມັດ')}</Text>
            <Text style={styles.verPendText}>{tt('rider', 'admin ກຳລັງ ກວດ ໃບຂັບຂີ່ ຂອງ ທ່ານ. ຮັບງານ ໄດ້ ຫຼັງ ອະນຸມັດ.')}</Text>
          </View>
        )}

        {/* earnings summary */}
        <View style={styles.earnCard}>
          <View style={styles.earnRow}>
            <View><Text style={styles.earnLabel}>{tt('rider', 'ລາຍໄດ້ ຈັດສົ່ງ (net)')}</Text><Text style={styles.earnBig}>{netTotal.toLocaleString()} ₭</Text></View>
            <View style={styles.earnStat}><Text style={styles.earnStatV}>{doneCount}</Text><Text style={styles.earnStatL}>{tt('rider', 'ສົ່ງສຳເລັດ')}</Text></View>
          </View>
          <Pressable style={styles.walletBtn} onPress={() => router.push('/wallet' as any)}>
            <Text style={styles.walletBtnText}>🏦 {tt('rider', 'ໄປ wallet · ຖອນເງິນ')}</Text>
          </Pressable>
        </View>

        {/* COD cash held — a debt to the platform until admin confirms receipt */}
        {codOwed > 0 && (
          <View style={styles.codCard}>
            <Text style={styles.codLabel}>💵 {tt('rider', 'ເງິນສົດ COD ທີ່ຖືຢູ່ (ຍັງບໍ່ນຳສົ່ງ)')}</Text>
            <Text style={styles.codBig}>{codOwed.toLocaleString()} ₭</Text>
            {remitPending ? (
              <View style={styles.codPend}><Text style={styles.codPendText}>⏳ {tt('rider', 'ແຈ້ງນຳສົ່ງແລ້ວ — ລໍ admin ຢືນຢັນ')}</Text></View>
            ) : (
              <Pressable style={styles.codBtn} onPress={() => setRemitOpen(true)}>
                <Text style={styles.codBtnText}>💵 {tt('rider', 'ແຈ້ງ ນຳສົ່ງ ເງິນ')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* quality stats — derived from my own tasks */}
        <View style={styles.statRow}>
          <View style={styles.statBox}><Text style={[styles.statV, { color: '#16a34a' }]}>{myStats.delivered}</Text><Text style={styles.statL}>{tt('rider', 'ສົ່ງ ສຳເລັດ')}</Text></View>
          <View style={styles.statBox}><Text style={[styles.statV, { color: '#0891b2' }]}>{myStats.avgMinutes ?? '—'}</Text><Text style={styles.statL}>{tt('rider', 'ນາທີ ສະເລ່ຍ')}</Text></View>
          <View style={styles.statBox}><Text style={[styles.statV, { color: '#f59e0b' }]}>{myStats.active}</Text><Text style={styles.statL}>{tt('rider', 'ກຳລັງ ເຮັດ')}</Text></View>
          <View style={styles.statBox}><Text style={[styles.statV, { color: '#16a34a' }]}>{myStats.tips.toLocaleString()}</Text><Text style={styles.statL}>{tt('rider', 'ທິບ ₭')}</Text></View>
        </View>

        {/* live location sharing — only offered while carrying work */}
        {activeMine.length > 0 && (
          <View style={[styles.shareCard, sharing && styles.shareCardOn]}>
            <View style={styles.statusRow2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>📡 {tt('rider', 'ແບ່ງປັນ ຕຳແໜ່ງ ສົດ')}</Text>
                <Text style={styles.shareSub}>{tt('rider', 'ລູກຄ້າ ຈະ ເຫັນ ເຈົ້າ ເທິງ ແຜນທີ່')}</Text>
              </View>
              <Pressable style={[styles.toggle, sharing ? styles.tgOn : styles.tgOff]} onPress={() => setSharing((s) => !s)}>
                <View style={styles.knob} />
              </Pressable>
            </View>
            {sharing && (
              <Text style={styles.shareOk}>
                ✓ {tt('rider', 'ກຳລັງ ແບ່ງປັນ · ອັບເດດ ທຸກ 20 ວິນາທີ · ຢຸດ ເມື່ອ ສົ່ງ ຮອດ')}
                {sharePos ? `\n📌 ${sharePos.lat.toFixed(5)}, ${sharePos.lng.toFixed(5)}` : ''}
              </Text>
            )}
          </View>
        )}

        {/* active toggle */}
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{active ? tt('rider', '🟢 ກຳລັງຮັບງານ') : tt('rider', '⚪ ພັກ (ບໍ່ຮັບງານ)')}</Text>
          <Pressable style={[styles.toggle, active ? styles.tgOn : styles.tgOff]} onPress={() => setRiderActive(fbUser.uid, !active)}>
            <View style={[styles.knob, active ? styles.knobOn : styles.knobOff]} />
          </Pressable>
        </View>

        <View style={styles.seg}>
          <Pressable style={[styles.segB, tab === 'queue' && styles.segOn]} onPress={() => setTab('queue')}>
            <Text style={[styles.segText, tab === 'queue' && styles.segTextOn]}>{tt('rider', 'ຄິວ ຫວ່າງ')} ({openTasks.length})</Text>
          </Pressable>
          <Pressable style={[styles.segB, tab === 'mine' && styles.segOn]} onPress={() => setTab('mine')}>
            <Text style={[styles.segText, tab === 'mine' && styles.segTextOn]}>{tt('rider', 'ວຽກຂ້ອຍ')} ({activeMine.length})</Text>
          </Pressable>
        </View>

        {tab === 'queue' ? (
          openTasks.length === 0 ? (
            <Text style={styles.empty}>{tt('rider', 'ຍັງບໍ່ມີງານ ຫວ່າງ ຕອນນີ້')}</Text>
          ) : (
            queueSorted.map((t) => (
              <View key={t.id} style={[styles.task, styles.taskOpen]}>
                <View style={styles.trow}>
                  <Text style={styles.tnum}>{t.orderNumber ? `#${t.orderNumber}` : t.id.slice(0, 6)}</Text>
                  <Text style={styles.fee}>+{Math.round((t.fee ?? 0) * (1 - PLATFORM_FEE_RATE)).toLocaleString()} ₭</Text>
                </View>
                <Text style={styles.km}>
                  {sharePos && t.pickupLat != null && t.pickupLng != null
                    ? `📍 ${tt('rider', 'ຫ່າງ ຈາກ ເຈົ້າ')} ${distanceKm(sharePos, { lat: t.pickupLat, lng: t.pickupLng }).toFixed(1)} ${tt('rider', 'ກມ')}   ` : ''}
                  {t.distanceKm != null ? `📏 ${tt('rider', 'ໄລຍະ ສົ່ງ')} ${t.distanceKm.toFixed(1)} ${tt('rider', 'ກມ')}` : ''}
                </Text>
                <Text style={styles.tmeta}>📦 {tt('rider', 'ຮັບຈາກ')}: {t.shopName ?? '—'}{t.pickupAddress ? `\n📍 ${t.pickupAddress}` : ''}</Text>
                <Text style={styles.tmeta}>🏠 {tt('rider', 'ສົ່ງໄປ')}: {t.dropoffAddress ?? '—'}</Text>
                {t.codAmount ? <Text style={styles.cod}>💵 {tt('rider', 'ເກັບ COD')} {t.codAmount.toLocaleString()} ₭</Text> : null}
                <Pressable style={[styles.btn, !approved && styles.btnOff]} disabled={!approved} onPress={() => acceptTask(t.id, fbUser.uid, riderName)}>
                  <Text style={styles.btnText}>{approved ? `✋ ${tt('rider', 'ຮັບງານນີ້')}` : `🔒 ${tt('rider', 'ລໍ ອະນຸມັດ ກ່ອນ')}`}</Text>
                </Pressable>
              </View>
            ))
          )
        ) : activeMine.length === 0 ? (
          <Text style={styles.empty}>{tt('rider', 'ບໍ່ມີວຽກ ກຳລັງເຮັດ')}</Text>
        ) : (
          activeMine.map((t) => {
            const si = stepIndex(t.status);
            return (
              <View key={t.id} style={styles.task}>
                <View style={styles.trow}>
                  <Text style={styles.tnum}>{t.orderNumber ? `#${t.orderNumber}` : t.id.slice(0, 6)}</Text>
                  <Text style={styles.fee}>+{Math.round((t.fee ?? 0) * (1 - PLATFORM_FEE_RATE)).toLocaleString()} ₭</Text>
                </View>
                {t.distanceKm != null && <Text style={styles.km}>📏 {t.distanceKm.toFixed(1)} {tt('rider', 'ກມ')}</Text>}
                <Text style={styles.tmeta}>📦 {tt('rider', 'ຮັບຈາກ')}: {t.shopName ?? '—'}{t.pickupAddress ? `\n📍 ${t.pickupAddress}` : ''}</Text>
                {!!t.shopPhone && <Text style={styles.phone} onPress={() => Linking.openURL(`tel:${t.shopPhone}`)}>📞 {tt('rider', 'ໂທ ຮ້ານ')}: {t.shopPhone}</Text>}
                <Text style={styles.tmeta}>🏠 {tt('rider', 'ສົ່ງໄປ')}: {t.dropoffAddress ?? '—'}</Text>
                {!!t.customerPhone && <Text style={styles.phone} onPress={() => Linking.openURL(`tel:${t.customerPhone}`)}>📞 {tt('rider', 'ໂທ ລູກຄ້າ')}: {t.customerPhone}</Text>}
                {t.codAmount ? <Text style={styles.cod}>💵 {tt('rider', 'ເກັບ COD')} {t.codAmount.toLocaleString()} ₭</Text> : null}
                <View style={styles.steps}>
                  {STEPS.map((s, i) => {
                    const done = i < si || t.status === 'delivered';
                    const cur = i === si && t.status !== 'delivered';
                    return (
                      <View key={s.key} style={styles.step}>
                        <View style={[styles.dot, done && styles.dotDone, cur && styles.dotCur]}><Text style={styles.dotText}>{done ? '✓' : s.icon}</Text></View>
                        <Text style={[styles.stepLabel, (done || cur) && styles.stepLabelOn]}>{tt('rider', s.label)}</Text>
                      </View>
                    );
                  })}
                </View>
                {(t.pickupLat != null || t.dropoffLat != null) && (
                  <View style={styles.navRow}>
                    {t.pickupLat != null && t.pickupLng != null && (
                      <Pressable style={styles.navBtn} onPress={() => Linking.openURL(directionsUrl({ lat: t.pickupLat!, lng: t.pickupLng! }))}>
                        <Text style={styles.navBtnText}>🧭 {tt('rider', 'ໄປ ຮ້ານ')}</Text>
                      </Pressable>
                    )}
                    {t.dropoffLat != null && t.dropoffLng != null && (
                      <Pressable style={[styles.navBtn, styles.navBtnGreen]} onPress={() => Linking.openURL(directionsUrl({ lat: t.dropoffLat!, lng: t.dropoffLng! }))}>
                        <Text style={styles.navBtnText}>🧭 {tt('rider', 'ໄປ ຈຸດສົ່ງ')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {t.status === 'accepted' && (
                  <Pressable style={[styles.btn, styles.amber]} onPress={() => updateTaskStatus(t.id, 'picked_up', t.orderId)}>
                    <Text style={styles.btnText}>📦 {tt('rider', 'ໝາຍ: ຮັບເຄື່ອງແລ້ວ')}</Text>
                  </Pressable>
                )}
                {t.status === 'picked_up' && (
                  <Pressable style={[styles.btn, styles.green]} onPress={() => openProof(t)}>
                    <Text style={styles.btnText}>🏠 {tt('rider', 'ໝາຍ: ສົ່ງຮອດແລ້ວ')}</Text>
                  </Pressable>
                )}
                {(t.status === 'accepted' || t.status === 'picked_up') && (
                  <Pressable style={styles.releaseBtn} onPress={() => {
                    if (typeof confirm !== 'function' || confirm(tt('rider', 'ປ່ອຍ ວຽກ ນີ້ ຄືນ ຄິວ? ຄົນ ອື່ນ ຈະ ຮັບ ໄດ້.'))) releaseTask(t.id);
                  }}>
                    <Text style={styles.releaseText}>↩ {tt('rider', 'ປ່ອຍ ວຽກ ຄືນ ຄິວ')}</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>

      {/* proof of delivery */}
      <BottomSheet visible={!!proofFor} onClose={() => setProofFor(null)}>
        {proofFor && (
          <View>
            <Text style={styles.sheetTitle}>📸 {tt('rider', 'ຫຼັກຖານ ການ ສົ່ງ')}</Text>
            <Text style={styles.sheetSub}>#{proofFor.orderNumber ?? proofFor.id.slice(0, 6)} · {tt('rider', 'ແນບ ຮູບ ຫຼື ຊື່ ຜູ້ຮັບ ຢ່າງໜ້ອຍ 1 ຢ່າງ')}</Text>
            <Text style={styles.label}>{tt('rider', '📷 ຮູບ ຕອນ ສົ່ງ')}</Text>
            <PhotoPicker photos={proofImg} onChange={setProofImg} pathPrefix={`riders/${fbUser.uid}`} max={1} />
            <Text style={styles.label}>{tt('rider', 'ຊື່ ຜູ້ຮັບ')}</Text>
            <TextInput value={recipient} onChangeText={setRecipient} placeholder={tt('rider', 'ຊື່ ຄົນ ທີ່ ຮັບ ເຄື່ອງ')} placeholderTextColor="#999" style={styles.input} />
            {!!proofFor.handoverCode && (
              <>
                <Text style={styles.label}>{tt('rider', '🔑 ລະຫັດ ຢືນຢັນ ຈາກ ລູກຄ້າ (4 ໂຕ)')}</Text>
                <TextInput value={codeInput} onChangeText={(v) => setCodeInput(v.replace(/\D/g, '').slice(0, 4))} placeholder="1234" placeholderTextColor="#999" keyboardType="number-pad" maxLength={4} style={[styles.input, { letterSpacing: 6, textAlign: 'center', fontWeight: '700' }]} />
              </>
            )}
            {!!proofFor.codAmount && (
              <View style={styles.codRemind}><Text style={styles.codRemindText}>💵 {tt('rider', 'ເກັບ ເງິນສົດ')} {proofFor.codAmount.toLocaleString()} ₭ — {tt('rider', 'ຈະ ກາຍ ເປັນ ເງິນ ທີ່ ຕ້ອງ ນຳສົ່ງ')}</Text></View>
            )}
            {proofErr !== '' && <Text style={styles.err}>❌ {proofErr}</Text>}
            <Pressable style={[styles.btn, styles.green, busy && styles.btnOff]} onPress={submitProof} disabled={busy}>
              <Text style={styles.btnText}>{busy ? '...' : `✓ ${tt('rider', 'ຢືນຢັນ ສົ່ງ ຮອດ')}`}</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>

      {/* COD remittance */}
      <BottomSheet visible={remitOpen} onClose={() => setRemitOpen(false)}>
        <View>
          <Text style={styles.sheetTitle}>💵 {tt('rider', 'ແຈ້ງ ນຳສົ່ງ ເງິນສົດ')}</Text>
          <Text style={styles.sheetSub}>{tt('rider', 'ລວມ')} {codOwed.toLocaleString()} ₭ · {owedTasks.length} {tt('rider', 'ອໍເດີ')}</Text>
          <Text style={styles.label}>{tt('rider', 'ວິທີ ນຳສົ່ງ')}</Text>
          <TextInput value={remitMethod} onChangeText={setRemitMethod} style={styles.input} />
          <Text style={styles.label}>{tt('rider', '📎 ຫຼັກຖານ (ສະລິບ / ຮູບ)')}</Text>
          <PhotoPicker photos={remitProof} onChange={setRemitProof} pathPrefix={`riders/${fbUser.uid}`} max={1} />
          <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={submitRemit} disabled={busy}>
            <Text style={styles.btnText}>{busy ? '...' : `📤 ${tt('rider', 'ສົ່ງ ໃຫ້ admin ກວດ')}`}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#9ca3af' },
  hero: { backgroundColor: '#0066CC', borderRadius: 14, padding: 22, alignItems: 'center' },
  heroBig: { fontSize: 40 },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 6 },
  heroSub: { color: '#dbeafe', fontSize: 12, marginTop: 4, textAlign: 'center' },
  perk: { fontSize: 12, color: '#374151', marginTop: 10 },
  verifyBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginTop: 16, backgroundColor: '#fafbfc' },
  verifyTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  verOk: { backgroundColor: '#d1fae5', borderRadius: 10, padding: 12, marginBottom: 12 },
  verOkText: { color: '#065f46', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  verPend: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginBottom: 12 },
  verPendTitle: { color: '#92400e', fontSize: 13, fontWeight: '800' },
  verPendText: { color: '#92400e', fontSize: 12, marginTop: 4, lineHeight: 17 },
  label: { fontSize: 12, color: '#4b5563', fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextOn: { color: '#0066CC', fontWeight: '700' },
  btn: { backgroundColor: '#0066CC', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  amber: { backgroundColor: '#f59e0b', marginTop: 10 },
  green: { backgroundColor: '#059669', marginTop: 10 },
  earnCard: { backgroundColor: '#111827', borderRadius: 12, padding: 16 },
  earnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earnLabel: { color: '#9ca3af', fontSize: 12 },
  earnBig: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2 },
  earnStat: { alignItems: 'center' },
  earnStatV: { color: '#34d399', fontSize: 15, fontWeight: '800' },
  earnStatL: { color: '#9ca3af', fontSize: 12 },
  walletBtn: { backgroundColor: '#1f2937', borderRadius: 9, padding: 11, alignItems: 'center', marginTop: 12 },
  walletBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginTop: 12 },
  statusText: { fontSize: 13, fontWeight: '600', color: '#111' },
  toggle: { width: 46, height: 26, borderRadius: 13, padding: 2, flexDirection: 'row' },
  tgOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  tgOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: {}, knobOff: {},
  seg: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  segB: { flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#EAF2FB', borderColor: '#bcd6f5' },
  segText: { fontSize: 12, color: '#4b5563' },
  segTextOn: { color: '#0066CC', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  task: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 13, marginBottom: 10 },
  taskOpen: { borderColor: '#bfdbfe', backgroundColor: '#f8fbff' },
  trow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tnum: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  fee: { fontSize: 15, fontWeight: '800', color: '#059669' },
  tmeta: { fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 18 },
  cod: { fontSize: 12, color: '#991b1b', fontWeight: '700', marginTop: 6 },
  phone: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 4 },
  km: { fontSize: 12, color: '#0e7490', fontWeight: '800', marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  statBox: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 8, alignItems: 'center' },
  statV: { fontSize: 15, fontWeight: '900' },
  statL: { fontSize: 12, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  shareCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginTop: 12 },
  shareCardOn: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  statusRow2: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareTitle: { fontSize: 13, fontWeight: '800', color: '#111' },
  shareSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  shareOk: { fontSize: 12, color: '#166534', marginTop: 8, lineHeight: 16, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  navBtn: { flex: 1, backgroundColor: '#0891b2', borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  navBtnGreen: { backgroundColor: '#16a34a' },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  releaseBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 8 },
  releaseText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
  codCard: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 14, marginTop: 12 },
  codLabel: { fontSize: 12, color: '#991b1b', fontWeight: '600' },
  codBig: { fontSize: 15, fontWeight: '900', color: '#dc2626', marginTop: 2 },
  codBtn: { backgroundColor: '#f59e0b', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 },
  codBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  codPend: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginTop: 10 },
  codPendText: { color: '#92400e', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  codRemind: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca', borderRadius: 9, padding: 10, marginTop: 12 },
  codRemindText: { color: '#991b1b', fontSize: 12, fontWeight: '600' },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sheetSub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 4 },
  err: { color: '#c00', fontSize: 12, marginTop: 10 },
  steps: { flexDirection: 'row', gap: 4, marginTop: 12 },
  step: { flex: 1, alignItems: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dotDone: { backgroundColor: '#059669' },
  dotCur: { backgroundColor: '#0066CC' },
  dotText: { fontSize: 12, color: '#fff' },
  stepLabel: { fontSize: 12, color: '#9ca3af' },
  stepLabelOn: { color: '#111', fontWeight: '600' },
});
