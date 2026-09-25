import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  becomeRider,
  type RiderProfile,
  updateRiderProfile,
  watchMyRider,
  watchRiderEarnings,
} from '@/lib/riders';
import type { Earning } from '@/lib/wallet';
import PhotoPicker from '@/components/PhotoPicker';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';

const VEHICLES = ['🛵 ລົດຈັກ', '🚗 ລົດເກງ', '🚚 ລົດກະບະ', '🚲 ຖີບ'];

/**
 * Profile "🛵 ຣາຍເດີ້" section — the single place a user opts in to / manages
 * being a rider. Reads & writes riders/{uid} directly (the ONE source of truth
 * — no user sub-type). States: not-a-rider (CTA + form) → pending (⏳) →
 * verified (✓ + earnings + queue/wallet links). Any group (general/technician)
 * can be a rider without changing their account type.
 */
export default function ProfileRiderSection({ uid, name }: { uid: string; name?: string }) {
  const tt = useTT();
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [open, setOpen] = useState(false); // form expanded (signup or edit)
  const [busy, setBusy] = useState(false);

  // form
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [zone, setZone] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [plate, setPlate] = useState('');
  const [licenseImg, setLicenseImg] = useState<string[]>([]);

  useEffect(() => watchMyRider(uid, (r) => { setRider(r); setLoaded(true); }), [uid]);
  useEffect(() => watchRiderEarnings(uid, setEarnings), [uid]);

  const seedForm = (r: RiderProfile | null) => {
    setVehicle(r?.vehicle || VEHICLES[0]);
    setZone(r?.zone || '');
    setLicenseNo(r?.licenseNo || '');
    setPlate(r?.plate || '');
    setLicenseImg(r?.licenseImage ? [r.licenseImage] : []);
  };

  const startSignup = () => { seedForm(null); setOpen(true); };
  const startEdit = () => { seedForm(rider); setOpen(true); };

  const submit = async () => {
    setBusy(true);
    try {
      const info = { vehicle, zone: zone.trim() || undefined, licenseNo: licenseNo.trim() || undefined, plate: plate.trim() || undefined, licenseImage: licenseImg[0] };
      if (rider) await updateRiderProfile(uid, info);
      else await becomeRider(uid, { name: (name || '').trim() || 'Rider', ...info });
      setOpen(false);
    } catch (e: any) {
      alert(tt('riderSection', 'ບໍ່ສຳເລັດ') + ': ' + (e?.message ?? String(e)));
    } finally { setBusy(false); }
  };

  if (!loaded) return null;
  const approved = rider?.approved === true;
  const netTotal = earnings.reduce((s, e) => s + e.net, 0);
  const doneCount = earnings.length;

  return (
    <View style={styles.group}>
      <View style={styles.head}>
        <Text style={styles.title}>🛵 {tt('riderSection', 'ຣາຍເດີ້ ຈັດສົ່ງ')}</Text>
        {rider && !open && <Pressable onPress={startEdit}><Text style={styles.edit}>✏️ {tt('riderSection', 'ແກ້ໄຂ')}</Text></Pressable>}
        {open && <Pressable onPress={() => setOpen(false)}><Text style={styles.cancel}>✕ {tt('riderSection', 'ຍົກເລີກ')}</Text></Pressable>}
      </View>

      {/* form (signup or edit) */}
      {open ? (
        <View>
          <Text style={styles.label}>{tt('riderSection', 'ພາຫະນະ')}</Text>
          <View style={styles.chips}>
            {VEHICLES.map((v) => (
              <Pressable key={v} style={[styles.chip, vehicle === v && styles.chipOn]} onPress={() => setVehicle(v)}>
                <Text style={[styles.chipText, vehicle === v && styles.chipTextOn]}>{v}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{tt('riderSection', 'ເຂດ ໃຫ້ບໍລິການ')}</Text>
          <TextInput value={zone} onChangeText={setZone} placeholder={tt('riderSection', 'ນະຄອນຫຼວງ — ໄຊເສດຖາ, ສີໂຄດ')} placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>🪪 {tt('riderSection', 'ເລກ ໃບຂັບຂີ່')}</Text>
          <TextInput value={licenseNo} onChangeText={setLicenseNo} placeholder={tt('riderSection', 'ເລກ ໃບຂັບຂີ່')} placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>🚗 {tt('riderSection', 'ປ້າຍ ທະບຽນ')}</Text>
          <TextInput value={plate} onChangeText={setPlate} placeholder={tt('riderSection', 'ກຂ 1234')} placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>📷 {tt('riderSection', 'ຮູບ ໃບຂັບຂີ່')}</Text>
          <PhotoPicker photos={licenseImg} onChange={setLicenseImg} pathPrefix={`riders/${uid}`} max={1} />
          <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={submit} disabled={busy}>
            <Text style={styles.btnText}>{busy ? '...' : rider ? tt('riderSection', '💾 ບັນທຶກ') : tt('riderSection', '🛵 ສະໝັກ (ລໍ admin ອະນຸມັດ)')}</Text>
          </Pressable>
        </View>
      ) : !rider ? (
        // not yet a rider — CTA
        <View style={styles.cta}>
          <Text style={styles.ctaEmoji}>🛵</Text>
          <Text style={styles.ctaTitle}>{tt('riderSection', 'ຫາ ລາຍໄດ້ ເສີມ ເປັນ ຣາຍເດີ້')}</Text>
          <Text style={styles.ctaSub}>{tt('riderSection', 'ຮັບ ງານ ສົ່ງ ໃກ້ ຕົວ · ເລືອກ ເວລາ ເອງ · ບໍ່ ຕ້ອງ ປ່ຽນ ປະເພດ ບັນຊີ')}</Text>
          <Pressable style={styles.btn} onPress={startSignup}>
            <Text style={styles.btnText}>🛵 {tt('riderSection', 'ສະໝັກ ເປັນ ຣາຍເດີ້')}</Text>
          </Pressable>
        </View>
      ) : (
        // existing rider — status + details
        <View>
          {approved ? (
            <View style={styles.stOk}><Text style={styles.stOkText}>✓ {tt('riderSection', 'ຣາຍເດີ້ ຢືນຢັນແລ້ວ — ຮັບ ງານ ໄດ້')}</Text></View>
          ) : (
            <View style={styles.stPend}>
              <Text style={styles.stPendTitle}>⏳ {tt('riderSection', 'ລໍ admin ອະນຸມັດ')}</Text>
              <Text style={styles.stPendText}>{tt('riderSection', 'admin ກຳລັງ ກວດ ໃບຂັບຂີ່ — ຮັບ ງານ ໄດ້ ຫຼັງ ອະນຸມັດ')}</Text>
            </View>
          )}
          <Row label={tt('riderSection', 'ພາຫະນະ')} value={`${rider.vehicle || '🛵'}${rider.plate ? ` · ${rider.plate}` : ''}`} />
          {!!rider.licenseNo && <Row label={tt('riderSection', '🪪 ໃບຂັບຂີ່')} value={`${rider.licenseNo}${approved ? ' ✓' : ''}`} />}
          {!!rider.zone && <Row label={tt('riderSection', 'ເຂດ')} value={rider.zone} />}

          {approved && (
            <>
              <View style={styles.earn}>
                <View><Text style={styles.earnLabel}>{tt('riderSection', 'ລາຍໄດ້ ຈັດສົ່ງ (net)')}</Text><Text style={styles.earnBig}>{netTotal.toLocaleString()} ₭</Text></View>
                <View style={{ alignItems: 'center' }}><Text style={styles.earnStat}>{doneCount}</Text><Text style={styles.earnLabel}>{tt('riderSection', 'ສົ່ງ ສຳເລັດ')}</Text></View>
              </View>
              <Pressable style={styles.queueBtn} onPress={() => router.push('/rider' as any)}>
                <Text style={styles.queueBtnText}>📦 {tt('riderSection', 'ໄປ ຄິວ ຈັດສົ່ງ · ຮັບ ງານ')}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (<View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowVal}>{value}</Text></View>);
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 14, marginBottom: 12, ...shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: font.md, fontWeight: '700', color: colors.text },
  edit: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  cancel: { color: colors.text3, fontSize: font.sm, fontWeight: '600' },
  cta: { alignItems: 'center', paddingVertical: 4 },
  ctaEmoji: { fontSize: 34 },
  ctaTitle: { fontSize: font.md, fontWeight: '800', color: colors.primary, marginTop: 6 },
  ctaSub: { fontSize: font.xs, color: colors.text2, textAlign: 'center', marginTop: 4, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 12, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
  chipOn: { backgroundColor: '#EAF2FB', borderColor: colors.primary },
  chipText: { fontSize: font.sm, color: colors.text2 },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 13, alignItems: 'center', marginTop: 14 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  stOk: { backgroundColor: '#dcfce7', borderRadius: radius.md, padding: 11, marginBottom: 8 },
  stOkText: { color: '#065f46', fontSize: font.sm, fontWeight: '700', textAlign: 'center' },
  stPend: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: radius.md, padding: 11, marginBottom: 8 },
  stPendTitle: { color: '#92400e', fontSize: font.sm, fontWeight: '800' },
  stPendText: { color: '#92400e', fontSize: font.xs, marginTop: 3, lineHeight: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowLabel: { fontSize: font.sm, color: colors.text3 },
  rowVal: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
  earn: { backgroundColor: '#111827', borderRadius: radius.lg, padding: 14, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earnLabel: { color: '#9ca3af', fontSize: 12 },
  earnBig: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2 },
  earnStat: { color: '#34d399', fontSize: 15, fontWeight: '800' },
  queueBtn: { backgroundColor: '#16a34a', borderRadius: radius.md, padding: 12, alignItems: 'center', marginTop: 8 },
  queueBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
});
