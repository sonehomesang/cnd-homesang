import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { type Bid, computeQuote, watchBid } from '@/lib/bids';
import { buildInstallments, getJob, type Job } from '@/lib/jobs';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import AppFooter from '@/components/AppFooter';

const BID_STATUS_LAO: Record<string, string> = {
  pending: 'ລໍ ຕອບ', accepted: 'ຕົກລົງ ແລ້ວ', rejected: 'ປະຕິເສດ', withdrawn: 'ຖອນ ແລ້ວ',
};

/**
 * Shareable quotation document for ANY bid (not just accepted ones) — a tech can
 * export a clean, watermarked PDF/image to send a customer before acceptance.
 * Customer-facing: NO back-office fee/margin here (that stays on /invoice).
 */
export default function QuoteDocScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const tt = useTT();
  const [bid, setBid] = useState<Bid | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [now] = useState(Date.now());

  useEffect(() => { if (id) return watchBid(String(id), (b) => { setBid(b); setLoading(false); }); }, [id]);
  useEffect(() => { if (bid?.jobId) getJob(bid.jobId).then(setJob).catch(() => setJob(null)); }, [bid?.jobId]);

  const items = bid?.items?.length
    ? bid.items
    : bid ? [{ desc: job?.title ?? tt('quoteDoc', 'ຄ່າ ບໍລິການ'), qty: 1, unit: tt('quoteDoc', 'ຄັ້ງ'), unitPrice: bid.price }] : [];
  const discount = bid?.discount ?? 0;
  const vatRate = bid?.vatRate ?? 0;
  const q = computeQuote(items as any, discount, vatRate);
  const total = bid?.total ?? bid?.price ?? q.total;
  const expired = typeof bid?.validUntil === 'number' && bid.validUntil < now;
  const docNo = bid ? `QT-${bid.id.slice(0, 6).toUpperCase()}` : 'QT';
  const statusText = expired ? tt('quoteDoc', 'ໝົດ ອາຍຸ') : tt('quoteDoc', BID_STATUS_LAO[bid?.status ?? 'pending'] ?? 'ລໍ ຕອບ');
  const accepted = bid?.status === 'accepted';
  const plan = bid?.paymentPlan;
  const schedule = plan && plan.type !== 'full' ? buildInstallments(total, plan) : [];

  // web export — capture the watermarked sheet, download as JPG / PDF, or share
  const capture = async () => {
    const el = (typeof document !== 'undefined') && document.getElementById('quote-doc-sheet');
    if (!el) throw new Error(tt('quoteDoc', 'ບໍ່ ພົບ ເອກະສານ'));
    const h2c = (await import('html2canvas')).default;
    return await h2c(el as HTMLElement, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  };
  const exportPdf = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      const img = c.toDataURL('image/jpeg', 0.92);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      let w = pw, h = (c.height * pw) / c.width;
      if (h > ph) { h = ph; w = (c.width * ph) / c.height; }
      pdf.addImage(img, 'JPEG', (pw - w) / 2, 0, w, h);
      pdf.save(`${docNo}.pdf`);
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const exportJpg = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      const a = document.createElement('a');
      a.href = c.toDataURL('image/jpeg', 0.92); a.download = `${docNo}.jpg`; a.click();
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const shareDoc = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      c.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `${docNo}.jpg`, { type: 'image/jpeg' });
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) await nav.share({ files: [file], title: docNo });
        else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${docNo}.jpg`; a.click(); URL.revokeObjectURL(url); }
      }, 'image/jpeg', 0.92);
    } catch (e: any) { alert('Share error: ' + (e?.message ?? String(e))); }
  };

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('quoteDoc', 'ກຳລັງ ໂຫຼດ...')}</Text></View>;
  if (!bid) return <View style={styles.center}><BackButton /><Text style={styles.muted}>{tt('quoteDoc', 'ບໍ່ ພົບ ໃບ ສະເໜີ')}</Text></View>;

  const techName = bid.technicianName || (profile as any)?.name || tt('quoteDoc', 'ຊ່າງ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.topBar}><BackButton /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sheet} nativeID="quote-doc-sheet">
          {/* watermark — issuer + status, shows in the export too */}
          <View pointerEvents="none" style={styles.watermark}>
            <Text style={styles.wmBig}>{tt('quoteDoc', 'ໃບ ສະເໜີ ລາຄາ')}</Text>
            <Text style={styles.wmSub}>{techName} · HomeSang</Text>
            <Text style={styles.wmStatus}>{statusText}</Text>
          </View>

          {/* header */}
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>🏠 HomeSang</Text>
              <Text style={styles.brandSub}>{tt('quoteDoc', 'ໂຮມຊ່າງ · ຕະຫຼາດ ບໍລິການ ແລະ ສິນຄ້າ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.docType}>{tt('quoteDoc', 'ໃບ ສະເໜີ')}</Text>
              <Text style={styles.invNo}>{docNo}{bid.version ? ` · v${bid.version}` : ''}</Text>
              <View style={[styles.payPill, accepted ? styles.payPaid : expired ? styles.payExp : styles.payDue]}>
                <Text style={[styles.payText, { color: accepted ? '#065f46' : expired ? '#991b1b' : '#92400e' }]}>{statusText}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* parties */}
          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('quoteDoc', 'ສະເໜີ ໃຫ້ (ລູກຄ້າ)')}</Text>
              <Text style={styles.partyName}>{job?.customerName ?? tt('quoteDoc', 'ລູກຄ້າ')}</Text>
              {!!job?.address && <Text style={styles.partyMeta}>📍 {job.address}</Text>}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('quoteDoc', 'ຜູ້ ສະເໜີ (ຊ່າງ)')}</Text>
              <Text style={styles.partyName}>{techName}</Text>
              {typeof bid.technicianRating === 'number' && bid.technicianRating > 0 && (
                <Text style={styles.partyMeta}>⭐ {bid.technicianRating.toFixed(1)}{bid.technicianReviewCount ? ` (${bid.technicianReviewCount})` : ''}</Text>
              )}
            </View>
          </View>

          {/* job ref + dates */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{tt('quoteDoc', 'ງານ:')} {job?.title ?? '—'}</Text>
            <Text style={styles.metaText}>{tt('quoteDoc', 'ວັນທີ:')} {new Date(bid.createdAt || now).toLocaleDateString('lo-LA')}</Text>
          </View>
          {typeof bid.validUntil === 'number' && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, expired && styles.expiredText]}>
                {expired ? '⚠️ ' : ''}{tt('quoteDoc', 'ໃຊ້ ໄດ້ ຮອດ:')} {new Date(bid.validUntil).toLocaleDateString('lo-LA')}
                {expired ? ` · ${tt('quoteDoc', 'ໝົດ ອາຍຸ ແລ້ວ')}` : ''}
              </Text>
            </View>
          )}

          {/* items */}
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colDesc]}>{tt('quoteDoc', 'ລາຍການ')}</Text>
            <Text style={[styles.th, styles.colQty]}>{tt('quoteDoc', 'ຈຳນວນ')}</Text>
            <Text style={[styles.th, styles.colPrice]}>{tt('quoteDoc', 'ລາຄາ/ໜ່ວຍ')}</Text>
            <Text style={[styles.th, styles.colAmt]}>{tt('quoteDoc', 'ລວມ')}</Text>
          </View>
          {items.map((it: any, idx: number) => (
            <View key={idx}>
              <View style={styles.tr}>
                <Text style={[styles.td, styles.colDesc]}>{it.desc}</Text>
                <Text style={[styles.td, styles.colQty]}>{it.qty} {it.unit}</Text>
                <Text style={[styles.td, styles.colPrice]}>{Number(it.unitPrice).toLocaleString()}</Text>
                <Text style={[styles.td, styles.colAmt]}>{(Number(it.qty) * Number(it.unitPrice)).toLocaleString()}</Text>
              </View>
              {(it.photos?.length ?? 0) > 0 && (
                <View style={styles.linePhotoRow}>
                  {it.photos.map((u: string) => <Image key={u} source={{ uri: u }} style={styles.linePhoto} />)}
                </View>
              )}
            </View>
          ))}

          {/* totals */}
          <View style={styles.totals}>
            <Row label={tt('quoteDoc', 'ລວມ ຍ່ອຍ')} value={`${q.subtotal.toLocaleString()} ${tt('common', 'ກີບ')}`} />
            {discount > 0 && <Row label={tt('quoteDoc', 'ສ່ວນ ຫຼຸດ')} value={`- ${discount.toLocaleString()} ${tt('common', 'ກີບ')}`} />}
            {q.vat > 0 && <Row label={`VAT (${vatRate}%)`} value={`${q.vat.toLocaleString()} ${tt('common', 'ກີບ')}`} />}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{tt('quoteDoc', 'ລວມ ທັງໝົດ')}</Text>
              <Text style={styles.grandValue}>{total.toLocaleString()} {tt('common', 'ກີບ')}</Text>
            </View>
          </View>

          {/* payment plan */}
          {schedule.length > 0 && (
            <View style={styles.planBox}>
              <Text style={styles.planTitle}>💳 {tt('quoteDoc', 'ແຜນ ຊຳລະ')}</Text>
              {schedule.map((s, i) => (
                <View key={i} style={styles.between}>
                  <Text style={styles.planLabel}>{s.label}</Text>
                  <Text style={styles.planVal}>{s.amount.toLocaleString()} {tt('common', 'ກີບ')}</Text>
                </View>
              ))}
            </View>
          )}

          {!!bid.note && <Text style={styles.note}>📝 {bid.note}</Text>}

          <Text style={styles.foot}>{tt('quoteDoc', 'ໃບ ສະເໜີ ນີ້ ອອກ ຜ່ານ ລະບົບ HomeSang · ລາຄາ ອາດ ປ່ຽນ ຕາມ ໜ້າ ງານ ຕົວ ຈິງ')}</Text>
        </View>

        {/* export actions (web) */}
        {Platform.OS === 'web' && (
          <View style={styles.exportRow}>
            <Pressable style={[styles.expBtn, styles.expPrimary]} onPress={exportPdf}><Text style={styles.expPrimaryText}>📄 PDF</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={exportJpg}><Text style={styles.expText}>🖼️ JPG</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={shareDoc}><Text style={styles.expText}>📤 {tt('quoteDoc', 'ແຊຣ໌')}</Text></Pressable>
          </View>
        )}
      </ScrollView>
      <AppFooter />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.between}><Text style={styles.totLabel}>{label}</Text><Text style={styles.totValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 8, paddingTop: 8 },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  muted: { color: colors.text3, textAlign: 'center' },
  sheet: { width: '100%', maxWidth: 720, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, overflow: 'hidden', position: 'relative', ...shadow.card },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.07, transform: [{ rotate: '-30deg' }] },
  wmBig: { fontSize: 40, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  wmSub: { fontSize: 20, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 4 },
  wmStatus: { fontSize: 15, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 2 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: font.xl, fontWeight: '800', color: colors.primary },
  brandSub: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  docType: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  invNo: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  payPill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  payPaid: { backgroundColor: '#d1fae5' }, payDue: { backgroundColor: '#fef3c7' }, payExp: { backgroundColor: '#fee2e2' },
  payText: { fontSize: font.xs, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  parties: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  party: { flex: 1, minWidth: 200 },
  partyLabel: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  partyName: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 4 },
  partyMeta: { fontSize: font.sm, color: colors.text2, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: space.md, marginBottom: space.sm },
  metaText: { fontSize: font.sm, color: colors.text2 },
  expiredText: { color: '#b91c1c', fontWeight: '700' },
  tableHead: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 8, marginTop: space.sm },
  th: { fontSize: font.xs, fontWeight: '700', color: colors.text2 },
  tr: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: font.sm, color: colors.text },
  colDesc: { flex: 1 }, colQty: { width: 70, textAlign: 'center' }, colPrice: { width: 90, textAlign: 'right' }, colAmt: { width: 90, textAlign: 'right', fontWeight: '600' },
  linePhotoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  linePhoto: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  totals: { marginTop: space.md, alignSelf: 'flex-end', width: '100%', maxWidth: 320, gap: 4 },
  totLabel: { fontSize: font.sm, color: colors.text2 }, totValue: { fontSize: font.sm, color: colors.text },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 2, borderTopColor: colors.text, marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: font.md, fontWeight: '700', color: colors.text },
  grandValue: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planBox: { marginTop: space.lg, backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, gap: 4 },
  planTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text, marginBottom: 2 },
  planLabel: { fontSize: font.sm, color: colors.text2 }, planVal: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
  note: { fontSize: font.sm, color: colors.text2, marginTop: space.lg, lineHeight: 20 },
  foot: { fontSize: font.xs, color: colors.text3, textAlign: 'center', marginTop: space.lg },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.lg, justifyContent: 'center' },
  expBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.surface },
  expPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  expPrimaryText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  expText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
