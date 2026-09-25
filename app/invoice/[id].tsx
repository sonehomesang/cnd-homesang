import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getJob, JOB_STATUS_LABEL, type Job, PAYMENT_METHOD_LABEL, setJobSignature } from '@/lib/jobs';
import SignaturePad from '@/components/SignaturePad';
import { type Bid, getAcceptedBid, type QuoteItem } from '@/lib/bids';
import { type JobVariation, watchVariationsForJob } from '@/lib/variations';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { PLATFORM_FEE_RATE } from '@/lib/wallet';
import { useTT } from '@/lib/i18n';
import { computeMargin, DEFAULT_PRICING_CONFIG, type PricingConfig, watchPricingConfig } from '@/lib/pricingConfig';
import { itemUrl } from '@/lib/share';
import { codeForUid } from '@/lib/referrals';
import ShareCardSheet from '@/components/ShareCardSheet';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

interface Party {
  name: string;
  phone?: string;
}

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);
  const [customer, setCustomer] = useState<Party | null>(null);
  const [tech, setTech] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardOpen, setCardOpen] = useState(false);
  const [pcfg, setPcfg] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [signing, setSigning] = useState(false);
  const [variations, setVariations] = useState<JobVariation[]>([]);
  const tt = useTT();

  useEffect(() => watchPricingConfig(setPcfg), []);

  useEffect(() => {
    if (!id) return;
    return watchVariationsForJob(id, setVariations);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const j = await getJob(id);
        setJob(j);
        if (j) {
          setBid(await getAcceptedBid(id));
          // Counterparty name+phone come from a server callable that only
          // answers a genuine party of this job — `users` is no longer readable
          // cross-user. Falls back to the denormalized name on the job.
          try {
            const res: any = await httpsCallable(functions, 'getJobContacts')({ jobId: id });
            const { customer: cc, tech: tc } = res.data || {};
            setCustomer({ name: cc?.name || tt('invoice', 'ລູກຄ້າ'), phone: cc?.phone || undefined });
            setTech(tc
              ? { name: tc.name || j.assignedProviderName || tt('invoice', 'ຊ່າງ'), phone: tc.phone || undefined }
              : { name: j.assignedProviderName ?? tt('invoice', 'ຊ່າງ') });
          } catch {
            setCustomer({ name: tt('invoice', 'ລູກຄ້າ') });
            setTech({ name: j.assignedProviderName ?? tt('invoice', 'ຊ່າງ') });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('invoice', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!job || !job.assignedProviderId || job.finalPrice == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('invoice', 'ໃບເກັບເງິນ ຍັງບໍ່ພ້ອມ — ງານຕ້ອງມີຊ່າງ ແລະ ລາຄາ ກ່ອນ')}</Text>
        <BackButton />
      </View>
    );
  }

  const isOwner = fbUser?.uid === job.customerId;
  const isTech = fbUser?.uid === job.assignedProviderId;
  const isAdmin = profile?.isSuperAdmin || profile?.roles?.includes('admin');
  if (!isOwner && !isTech && !isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('invoice', 'ບໍ່ມີສິດເບິ່ງໃບເກັບເງິນນີ້')}</Text>
        <BackButton />
      </View>
    );
  }

  const cat = getCategory(job.category);
  const invNo = `INV-${job.id.slice(0, 6).toUpperCase()}`;
  const issued = job.completedAt ?? job.assignedAt ?? job.createdAt;
  const paid = job.status === 'completed';

  // line items: from the accepted quotation, or a single service line
  const items: QuoteItem[] =
    bid?.items && bid.items.length > 0
      ? bid.items
      : [{ desc: `${tt('invoice', 'ຄ່າບໍລິການ —')} ${job.title}`, qty: 1, unit: tt('invoice', 'ງານ'), unitPrice: job.finalPrice }];
  const subtotal = bid?.subtotal ?? items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const discount = bid?.discount ?? 0;
  const vat = bid?.vat ?? 0;
  // approved mid-job change-orders add to the base quote total
  const approvedVars = variations.filter((v) => v.status === 'approved');
  const varsTotal = approvedVars.reduce((s, v) => s + v.total, 0);
  const baseTotal = bid?.total !== undefined ? bid.total : job.finalPrice - varsTotal;
  const total = baseTotal + varsTotal;
  const fee = Math.round(total * PLATFORM_FEE_RATE);
  const net = total - fee;

  const doPrint = () => {
    if (Platform.OS === 'web') {
      try { (window as any).print(); } catch {}
    }
  };

  // web export — capture the watermarked sheet and download as JPG / PDF
  const capture = async () => {
    const el = (typeof document !== 'undefined') && document.getElementById('quote-sheet');
    if (!el) throw new Error(tt('invoice', 'ບໍ່ພົບເອກະສານ'));
    const h2c = (await import('html2canvas')).default;
    return await h2c(el as HTMLElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
    });
  };
  const exportJpg = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      const a = document.createElement('a');
      a.href = c.toDataURL('image/jpeg', 0.92);
      a.download = `${invNo}.jpg`;
      a.click();
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const exportPdf = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      const img = c.toDataURL('image/jpeg', 0.92);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      let w = pw, h = (c.height * pw) / c.width;
      if (h > ph) { h = ph; w = (c.width * ph) / c.height; }
      pdf.addImage(img, 'JPEG', (pw - w) / 2, 0, w, h);
      pdf.save(`${invNo}.pdf`);
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const shareDoc = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      c.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `${invNo}.jpg`, { type: 'image/jpeg' });
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: invNo });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${invNo}.jpg`; a.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/jpeg', 0.92);
    } catch (e: any) { alert('Share error: ' + (e?.message ?? String(e))); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sheet} nativeID="quote-sheet">
          {/* watermark — issuer name + document status (shows in export too) */}
          <View pointerEvents="none" style={styles.watermark}>
            <Text style={styles.wmBig}>{paid ? tt('invoice', 'ໃບຮັບເງິນ') : tt('invoice', 'ໃບສະເໜີລາຄາ')}</Text>
            <Text style={styles.wmSub}>{tech?.name ?? tt('invoice', 'ຊ່າງ')} · HomeSang</Text>
            <Text style={styles.wmStatus}>{tt('jobStatus', JOB_STATUS_LABEL[job.status].lao)}</Text>
          </View>

          {/* header */}
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>🏠 HomeSang</Text>
              <Text style={styles.brandSub}>{tt('invoice', 'ໂຮມຊ່າງ · ຕະຫຼາດ ບໍລິການ ແລະ ສິນຄ້າ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.docType}>{paid ? tt('invoice', 'ໃບຮັບເງິນ') : tt('invoice', 'ໃບສະເໜີ')}</Text>
              <Text style={styles.invNo}>{invNo}</Text>
              <View style={[styles.payPill, paid ? styles.payPaid : styles.payDue]}>
                <Text style={[styles.payText, { color: paid ? '#065f46' : '#92400e' }]}>
                  {paid ? tt('invoice', '✓ ຊຳລະແລ້ວ') : tt('invoice', 'ລໍຊຳລະ')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* parties */}
          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('invoice', 'ຮຽກເກັບຈາກ (ລູກຄ້າ)')}</Text>
              <Text style={styles.partyName}>{customer?.name}</Text>
              {!!customer?.phone && <Text style={styles.partyMeta}>📞 {customer.phone}</Text>}
              {!!job.address && <Text style={styles.partyMeta}>📍 {job.address}</Text>}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('invoice', 'ຜູ້ໃຫ້ບໍລິການ (ຊ່າງ)')}</Text>
              <Text style={styles.partyName}>{tech?.name}</Text>
              {!!tech?.phone && <Text style={styles.partyMeta}>📞 {tech.phone}</Text>}
            </View>
          </View>

          {/* job ref */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{tt('invoice', 'ງານ:')} <CategoryIcon icon={cat?.icon} size={14} color={colors.text2} /> {job.title}</Text>
            <Text style={styles.metaText}>{tt('invoice', 'ວັນທີ:')} {new Date(issued).toLocaleDateString('lo-LA')}</Text>
          </View>

          {/* payment method / settlement */}
          {job.paymentMethod && (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {tt('invoice', 'ວິທີຊຳລະ:')} {PAYMENT_METHOD_LABEL[job.paymentMethod].icon} {tt('payment', PAYMENT_METHOD_LABEL[job.paymentMethod].lao)}
              </Text>
              <Text style={styles.metaText}>
                {paid ? tt('invoice', '✓ ຮັບເງິນແລ້ວ') : job.paidByCustomerAt ? tt('invoice', 'ລູກຄ້າແຈ້ງຈ່າຍ · ລໍຢືນຢັນ') : tt('invoice', 'ລໍຊຳລະ')}
              </Text>
            </View>
          )}

          {/* items table */}
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colDesc]}>{tt('invoice', 'ລາຍການ')}</Text>
            <Text style={[styles.th, styles.colQty]}>{tt('invoice', 'ຈຳນວນ')}</Text>
            <Text style={[styles.th, styles.colPrice]}>{tt('invoice', 'ລາຄາ/ໜ່ວຍ')}</Text>
            <Text style={[styles.th, styles.colAmt]}>{tt('invoice', 'ລວມ')}</Text>
          </View>
          {items.map((it, idx) => (
            <View key={idx}>
              <View style={styles.tr}>
                <Text style={[styles.td, styles.colDesc]}>{it.desc}</Text>
                <Text style={[styles.td, styles.colQty]}>{it.qty} {it.unit}</Text>
                <Text style={[styles.td, styles.colPrice]}>{it.unitPrice.toLocaleString()}</Text>
                <Text style={[styles.td, styles.colAmt]}>{(it.qty * it.unitPrice).toLocaleString()}</Text>
              </View>
              {(it.photos?.length ?? 0) > 0 && (
                <View style={styles.linePhotoRow}>
                  {it.photos!.map((u) => (
                    <Image key={u} source={{ uri: u }} style={styles.linePhoto} />
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* approved mid-job change-orders */}
          {approvedVars.length > 0 && (
            <View style={styles.varsBlock}>
              <Text style={styles.varsHead}>🧰 {tt('invoice', 'ວຽກເພີ່ມ ທີ່ ອະນຸມັດ')}</Text>
              {approvedVars.map((v) =>
                v.items.map((it, i) => (
                  <View key={`${v.id}-${i}`} style={styles.tr}>
                    <Text style={[styles.td, styles.colDesc]}>{it.desc}</Text>
                    <Text style={[styles.td, styles.colQty]}>{it.qty} {it.unit}</Text>
                    <Text style={[styles.td, styles.colPrice]}>{it.unitPrice.toLocaleString()}</Text>
                    <Text style={[styles.td, styles.colAmt]}>{(it.qty * it.unitPrice).toLocaleString()}</Text>
                  </View>
                )),
              )}
            </View>
          )}

          {/* totals */}
          <View style={styles.totals}>
            <Row label={tt('invoice', 'ລວມຍ່ອຍ')} value={`${subtotal.toLocaleString()} ${tt('common', 'ກີບ')}`} />
            {discount > 0 && <Row label={tt('invoice', 'ສ່ວນຫຼຸດ')} value={`- ${discount.toLocaleString()} ${tt('common', 'ກີບ')}`} />}
            {vat > 0 && <Row label={`VAT (${bid?.vatRate ?? 0}%)`} value={`${vat.toLocaleString()} ${tt('common', 'ກີບ')}`} />}
            {varsTotal > 0 && <Row label={tt('invoice', 'ວຽກເພີ່ມ (ອະນຸມັດ)')} value={`+ ${varsTotal.toLocaleString()} ${tt('common', 'ກີບ')}`} />}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{tt('invoice', 'ລວມທັງໝົດ')}</Text>
              <Text style={styles.grandValue}>{total.toLocaleString()} {tt('common', 'ກີບ')}</Text>
            </View>
          </View>

          {/* fee split — only to technician / admin */}
          {(isTech || isAdmin) && (
            <View style={styles.feeBox}>
              <Text style={styles.feeTitle}>{tt('invoice', 'ການແບ່ງລາຍຮັບ')}</Text>
              <Row label={`${tt('invoice', 'ຄ່າທຳນຽມ HomeSang')} (${Math.round(PLATFORM_FEE_RATE * 100)}%)`} value={`- ${fee.toLocaleString()} ${tt('common', 'ກີບ')}`} small />
              <View style={styles.between}>
                <Text style={styles.netLabel}>{tt('invoice', 'ຮັບສຸດທິ (ຊ່າງ)')}</Text>
                <Text style={styles.netValue}>{net.toLocaleString()} {tt('common', 'ກີບ')}</Text>
              </View>
            </View>
          )}

          {/* back-office margin / commission (partner materials) — gated by config visibility */}
          {(() => {
            const m = computeMargin(bid?.items ?? [], pcfg);
            const canSee = isAdmin || (isTech && !pcfg.hideFromTech) || (isOwner && !pcfg.hideFromCustomer);
            if (m.margin <= 0 || !canSee) return null;
            return (
              <View style={styles.marginBox}>
                <Text style={styles.marginTitle}>{tt('invoice', '🔒 ຫຼັງບ້ານ (margin/ຄອມມິຊັ່ນ)')}</Text>
                <Row label={tt('invoice', 'margin ລວມ')} value={`${m.margin.toLocaleString()} ${tt('common', 'ກີບ')}`} small />
                <Row label="HomeSang" value={`${m.toHomesang.toLocaleString()} ${tt('common', 'ກີບ')}`} small />
                <Row label={tt('invoice', 'ຊ່າງ')} value={`${m.toTech.toLocaleString()} ${tt('common', 'ກີບ')}`} small />
              </View>
            );
          })()}

          {((bid?.surveyChecklist?.length ?? 0) > 0 ||
            (bid?.surveyPhotos?.length ?? 0) > 0 ||
            !!bid?.surveyNote) && (
            <View style={styles.surveySection}>
              <Text style={styles.surveyHead}>{tt('invoice', '🔍 ການສຳຫຼວດໜ້າງານ')}</Text>
              {bid?.surveyChecklist?.map((c, i) => (
                <Text key={i} style={styles.surveyLine}>
                  {c.checked ? '✓' : '○'} {c.label}{c.note ? ` — ${c.note}` : ''}
                </Text>
              ))}
              {!!bid?.surveyNote && <Text style={styles.surveyLine}>📝 {bid.surveyNote}</Text>}
              {(bid?.surveyPhotos?.length ?? 0) > 0 && (
                <View style={styles.photoRow}>
                  {bid!.surveyPhotos!.map((u) => (
                    <Image key={u} source={{ uri: u }} style={styles.surveyImg} />
                  ))}
                </View>
              )}
            </View>
          )}

          {job.signatureUrl && (
            <View style={styles.sigBlock}>
              <Text style={styles.sigLabel}>{tt('invoice', 'ລາຍເຊັນ ຮັບໃບສະເໜີ')}</Text>
              <Image source={{ uri: job.signatureUrl }} style={styles.sigImg} resizeMode="contain" />
              <Text style={styles.sigBy}>
                ✍️ {job.signedByName ?? customer?.name ?? ''}
                {job.signedAt ? ` · ${new Date(job.signedAt).toLocaleDateString('lo-LA')}` : ''}
              </Text>
            </View>
          )}

          <Text style={styles.foot}>
            {tt('invoice', 'ສະຖານະງານ:')} {tt('jobStatus', JOB_STATUS_LABEL[job.status].lao)} {tt('invoice', '· ສ້າງໂດຍ HomeSang')}
          </Text>
        </View>

        {Platform.OS === 'web' && (
          <View style={styles.exportRow}>
            <Pressable style={[styles.expBtn, styles.expPrimary]} onPress={exportPdf}>
              <Text style={styles.expPrimaryText}>📄 PDF</Text>
            </Pressable>
            <Pressable style={styles.expBtn} onPress={exportJpg}>
              <Text style={styles.expText}>🖼️ JPG</Text>
            </Pressable>
            <Pressable style={styles.expBtn} onPress={shareDoc}>
              <Text style={styles.expText}>{tt('invoice', '📤 ແບ່ງປັນ')}</Text>
            </Pressable>
            <Pressable style={styles.expBtn} onPress={doPrint}>
              <Text style={styles.expText}>{tt('invoice', '🖨️ ພິມ')}</Text>
            </Pressable>
          </View>
        )}

        {/* customer-facing shareable quote CARD (compact, branded) */}
        <Pressable style={styles.cardShareBtn} onPress={() => setCardOpen(true)}>
          <Text style={styles.cardShareText}>📇 {tt('invoice', 'ແຊຣ໌ ບັດ ໃບສະເໜີລາຄາ')}</Text>
        </Pressable>
        {cardOpen && (
          <ShareCardSheet
            data={{
              kind: 'quote',
              title: job.title,
              lines: items.map((it) => ({ desc: it.desc, total: it.qty * it.unitPrice })),
              total,
              techName: tech?.name,
              validUntil: typeof (bid as any)?.validUntil === 'number'
                ? new Date((bid as any).validUntil).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' })
                : undefined,
              url: itemUrl('jobs', job.id, fbUser ? codeForUid(fbUser.uid) : undefined),
            }}
            filename={invNo}
            authorId={fbUser?.uid}
            authorName={tech?.name}
            onClose={() => setCardOpen(false)}
          />
        )}
        {isOwner && !job.signatureUrl && (
          <Pressable style={styles.signBtn} onPress={() => setSigning(true)}>
            <Text style={styles.signText}>{tt('invoice', '✍️ ເຊັນຮັບ ໃບສະເໜີ')}</Text>
          </Pressable>
        )}
        <BackButton />
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      {signing && (
        <SignaturePad
          onCancel={() => setSigning(false)}
          onSave={async (dataUrl) => {
            try {
              const url = await setJobSignature(job.id, dataUrl, customer?.name ?? tt('invoice', 'ລູກຄ້າ'));
              setJob({ ...job, signatureUrl: url, signedByName: customer?.name ?? tt('invoice', 'ລູກຄ້າ'), signedAt: Date.now() });
            } catch (e: any) {
              alert('Error: ' + (e?.message ?? String(e)));
            }
            setSigning(false);
          }}
        />
      )}
    </View>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.between}>
      <Text style={[styles.totLabel, small && styles.totSmall]}>{label}</Text>
      <Text style={[styles.totValue, small && styles.totSmall]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  muted: { color: colors.text3, textAlign: 'center' },
  sheet: { width: '100%', maxWidth: 720, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, overflow: 'hidden', position: 'relative', ...shadow.card },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.07, transform: [{ rotate: '-30deg' }] },
  wmBig: { fontSize: 40, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  wmSub: { fontSize: 20, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 4 },
  wmStatus: { fontSize: 15, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 2 },
  surveySection: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  surveyHead: { fontSize: font.sm, fontWeight: '700', color: colors.text, marginBottom: 6 },
  surveyLine: { fontSize: font.sm, color: colors.text2, marginTop: 2, lineHeight: 19 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  surveyImg: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surface2 },
  cardShareBtn: { marginTop: space.md, alignSelf: 'center', backgroundColor: '#0a54a5', borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 20 },
  cardShareText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.lg, justifyContent: 'center' },
  expBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.surface },
  expPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  expPrimaryText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  expText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: font.xl, fontWeight: '800', color: colors.primary },
  brandSub: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  docType: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  invNo: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  payPill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  payPaid: { backgroundColor: '#d1fae5' },
  payDue: { backgroundColor: '#fef3c7' },
  payText: { fontSize: font.xs, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  parties: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  party: { flex: 1, minWidth: 200 },
  partyLabel: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  partyName: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 4 },
  partyMeta: { fontSize: font.sm, color: colors.text2, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: space.lg, marginBottom: space.sm },
  metaText: { fontSize: font.sm, color: colors.text2 },
  tableHead: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 8, marginTop: space.sm },
  th: { fontSize: font.xs, fontWeight: '700', color: colors.text2 },
  tr: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: font.sm, color: colors.text },
  colDesc: { flex: 1 },
  colQty: { width: 70, textAlign: 'center' },
  colPrice: { width: 90, textAlign: 'right' },
  colAmt: { width: 90, textAlign: 'right', fontWeight: '600' },
  varsBlock: { marginTop: space.md },
  varsHead: { fontSize: font.sm, fontWeight: '700', color: '#b45309', marginBottom: 4 },
  linePhotoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  linePhoto: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  totals: { marginTop: space.md, alignSelf: 'flex-end', width: '100%', maxWidth: 320, gap: 4 },
  totLabel: { fontSize: font.sm, color: colors.text2 },
  totValue: { fontSize: font.sm, color: colors.text },
  totSmall: { fontSize: font.xs, color: colors.text3 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 2, borderTopColor: colors.text, marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: font.md, fontWeight: '700', color: colors.text },
  grandValue: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeBox: { marginTop: space.lg, backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, gap: 4 },
  feeTitle: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  netLabel: { fontSize: font.sm, fontWeight: '700', color: colors.accent },
  netValue: { fontSize: font.md, fontWeight: '800', color: colors.accent },
  marginBox: { marginTop: space.md, backgroundColor: '#fef9c3', borderRadius: radius.md, padding: space.md, gap: 4, borderWidth: 1, borderColor: '#fde68a' },
  marginTitle: { fontSize: font.xs, color: '#854d0e', fontWeight: '700', marginBottom: 2 },
  sigBlock: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, alignItems: 'flex-start' },
  sigLabel: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  sigImg: { width: 200, height: 90, backgroundColor: '#fff' },
  sigBy: { fontSize: font.sm, color: colors.text2, marginTop: 4 },
  signBtn: { alignSelf: 'center', backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 28, marginTop: space.md, ...shadow.card },
  signText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  foot: { fontSize: font.xs, color: colors.text3, textAlign: 'center', marginTop: space.lg },
  printBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 13, paddingHorizontal: 28, marginTop: space.lg, ...shadow.card },
  printText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
