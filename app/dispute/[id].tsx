import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { getJob, type Job } from '@/lib/jobs';
import {
  canDisputeJob,
  createDispute,
  DISPUTE_STATUS_LABEL,
  type Dispute,
  watchDisputesForJob,
} from '@/lib/disputes';
import PhotoPicker from '@/components/PhotoPicker';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<Dispute[]>([]);
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    getJob(id).then((j) => { setJob(j); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchDisputesForJob(id, setExisting);
  }, [id]);

  if (loading) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('dispute','ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!job || !fbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{!fbUser ? tt('dispute','ກະລຸນາເຂົ້າສູ່ລະບົບ') : tt('dispute','ບໍ່ພົບງານ')}</Text>
        <BackButton />
      </View>
    );
  }

  const isOwner = fbUser.uid === job.customerId;
  const isTech = fbUser.uid === job.assignedProviderId;
  if (!isOwner && !isTech) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('dispute','ສະເພາະ ຄູ່ກໍລະນີ ໃນງານນີ້ ເທົ່ານັ້ນ')}</Text>
        <BackButton />
      </View>
    );
  }

  const raiserRole = isOwner ? 'customer' : 'technician';
  const counterpartyId = isOwner ? job.assignedProviderId : job.customerId;
  const myOpen = existing.find((d) => d.raisedBy === fbUser.uid && d.status === 'open');

  const win = canDisputeJob(job);

  const submit = async () => {
    if (reason.trim().length < 5) { setError(tt('dispute','ກະລຸນາ ອະທິບາຍ ບັນຫາ ຢ່າງໜ້ອຍ 5 ຕົວອັກສອນ')); return; }
    setSubmitting(true);
    setError('');
    try {
      await createDispute({
        jobId: job.id,
        jobTitle: job.title,
        raisedBy: fbUser.uid,
        raiserName: profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('dispute','ຜູ້ໃຊ້'),
        raiserRole,
        counterpartyId: counterpartyId ?? undefined,
        reason: reason.trim(),
        photos: photos.length > 0 ? photos : undefined,
      });
      setDone(true);
      setReason('');
      setPhotos([]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('dispute','ແຈ້ງບັນຫາ / ຂໍ້ຂັດແຍ່ງ')}</Text>
        <Text style={styles.sub}>{tt('dispute','ງານ:')} {job.title}</Text>

        {/* existing disputes */}
        {existing.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{tt('dispute','ປະຫວັດ')}</Text>
            {existing.map((d) => (
              <View key={d.id} style={styles.histRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histReason} numberOfLines={2}>{d.reason}</Text>
                  <Text style={styles.histMeta}>
                    {d.raiserRole === 'customer' ? tt('dispute','ລູກຄ້າ') : tt('dispute','ຊ່າງ')} · {new Date(d.createdAt).toLocaleDateString('lo-LA')}
                  </Text>
                  {!!d.adminNote && <Text style={styles.adminNote}>👑 {d.adminNote}</Text>}
                </View>
                <View style={[styles.statusPill, d.status === 'open' ? styles.pillOpen : d.status === 'resolved' ? styles.pillOk : styles.pillNo]}>
                  <Text style={styles.statusText}>{tt('disputeStatus', DISPUTE_STATUS_LABEL[d.status])}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {done || myOpen ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>
              {tt('dispute','✓ ສົ່ງເລື່ອງແລ້ວ — ທີມງານ HomeSang ກຳລັງກວດ. ເຮົາຈະແຈ້ງເຕືອນ ເມື່ອມີຄວາມຄືບໜ້າ.')}
            </Text>
          </View>
        ) : !win.ok ? (
          <View style={styles.card}>
            <Text style={styles.muted}>🔒 {win.reason}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{tt('dispute','ອະທິບາຍ ບັນຫາ')}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder={tt('dispute','ເກີດຫຍັງຂຶ້ນ? ບອກລາຍລະອຽດ ເພື່ອໃຫ້ ທີມງານ ຊ່ວຍແກ້ໄຂ...')}
              placeholderTextColor={colors.text3}
              style={styles.textarea}
            />
            <Text style={[styles.cardLabel, { marginTop: space.md }]}>{tt('dispute','ຮູບ (ຖ້າມີ — ຊ່ວຍ ໃຫ້ ກວດ ໄວ ຂຶ້ນ)')}</Text>
            <PhotoPicker photos={photos} onChange={setPhotos} pathPrefix={`jobs/${job.id}`} max={4} />

            {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
            <Pressable style={[styles.btn, submitting && styles.btnOff]} onPress={submit} disabled={submitting}>
              <Text style={styles.btnText}>{submitting ? tt('dispute','ກຳລັງສົ່ງ...') : tt('dispute','⚠️ ສົ່ງເລື່ອງ')}</Text>
            </Pressable>
          </View>
        )}

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  muted: { color: colors.text3, textAlign: 'center' },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, marginTop: space.lg, ...shadow.card },
  cardLabel: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  textarea: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: font.md, color: colors.text, minHeight: 100, textAlignVertical: 'top', backgroundColor: colors.surface },
  error: { color: colors.error, fontSize: font.sm, marginTop: space.sm },
  btn: { backgroundColor: colors.secondary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: space.lg },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  okBox: { backgroundColor: '#ecfdf5', borderRadius: radius.lg, padding: space.lg, marginTop: space.lg, borderWidth: 1, borderColor: '#a7f3d0' },
  okText: { color: '#065f46', fontSize: font.sm, lineHeight: 22 },
  histRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  histReason: { fontSize: font.sm, color: colors.text },
  histMeta: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  adminNote: { fontSize: font.xs, color: colors.primary, marginTop: 4 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  pillOpen: { backgroundColor: '#fef3c7' },
  pillOk: { backgroundColor: '#d1fae5' },
  pillNo: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: font.xs, fontWeight: '700', color: colors.text2 },
});
