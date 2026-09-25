import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT, ttStatic } from '@/lib/i18n';
import { colors, radius, shadow, space } from '@/lib/theme';
import { pickActiveOrg, watchMyOrgs, type Org } from '@/lib/orgs';
import {
  isOverdue, spendBySite, summarize, termsLabel, type OrgInvoice, watchInvoices,
} from '@/lib/billing';
import BackButton from '@/components/BackButton';

const kip = (n?: number) => (n ? n.toLocaleString('en-US') : '0') + ' ' + ttStatic('billing', 'ກີບ');
const dateLao = (ms: number) => { if (!ms) return '—'; const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };

// Company statement / ໃບ ແຈ້ງ ໜີ້ — a consolidated, printable bill of a company's
// invoices with a credit summary + spend-by-building, exportable to PDF/JPG on
// web (same html2canvas + jspdf pipeline as the job invoice sheet).
export default function StatementScreen() {
  const { fbUser } = useAuth();
  const tt = useTT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inv, setInv] = useState<OrgInvoice[]>([]);
  const [onlyDue, setOnlyDue] = useState(false);

  useEffect(() => { if (!fbUser) { router.replace('/sign-in' as any); return; } return watchMyOrgs(fbUser.uid, (o) => { setOrgs(o); setLoaded(true); }); }, [fbUser]);
  const org = pickActiveOrg(orgs);
  useEffect(() => { if (!org) { setInv([]); return; } return watchInvoices(org.id, setInv); }, [org?.id]);

  const sum = useMemo(() => summarize(inv, org?.creditLimit ?? 0), [inv, org?.creditLimit]);
  const bySite = useMemo(() => spendBySite(inv), [inv]);
  const rows = useMemo(() => inv.filter((i) => i.status !== 'void' && (!onlyDue || i.status === 'sent')), [inv, onlyDue]);

  const invNo = `STMT-${org?.id.slice(0, 6).toUpperCase() ?? ''}`;
  const capture = async () => {
    const el = (typeof document !== 'undefined') && document.getElementById('statement-sheet');
    if (!el) throw new Error('sheet not found');
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
      pdf.save(`${invNo}.pdf`);
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const exportJpg = async () => {
    if (Platform.OS !== 'web') return;
    try { const c = await capture(); const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', 0.92); a.download = `${invNo}.jpg`; a.click(); }
    catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const doPrint = () => { if (Platform.OS === 'web') { try { (window as any).print(); } catch {} } };

  if (!fbUser || !loaded) return <View style={styles.root}><View style={styles.top}><BackButton /><Text style={styles.topT}>📄 {tt('billing', 'ໃບ ແຈ້ງ ໜີ້')}</Text></View></View>;
  if (!org) {
    return (
      <View style={styles.root}>
        <View style={styles.top}><BackButton /><Text style={styles.topT}>📄 {tt('billing', 'ໃບ ແຈ້ງ ໜີ້')}</Text></View>
        <View style={{ padding: 16 }}><Text style={styles.muted}>{tt('billing', 'ຕ້ອງ ມີ ບໍລິສັທ ກ່ອນ')}</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}><BackButton /><Text style={styles.topT}>📄 {tt('billing', 'ໃບ ແຈ້ງ ໜີ້')} · Statement</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* filter */}
        <View style={styles.filterRow}>
          <Pressable style={[styles.fChip, !onlyDue && styles.fChipOn]} onPress={() => setOnlyDue(false)}><Text style={[styles.fChipTx, !onlyDue && styles.fChipTxOn]}>{tt('billing', 'ທັງໝົດ')}</Text></Pressable>
          <Pressable style={[styles.fChip, onlyDue && styles.fChipOn]} onPress={() => setOnlyDue(true)}><Text style={[styles.fChipTx, onlyDue && styles.fChipTxOn]}>{tt('billing', 'ຄ້າງ ຈ່າຍ')}</Text></Pressable>
        </View>

        {/* the printable sheet */}
        <View style={styles.sheet} nativeID="statement-sheet">
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>🏠 HomeSang</Text>
              <Text style={styles.brandSub}>{tt('billing', 'ໂຮມຊ່າງ · ຕະຫຼາດ ບໍລິການ ແລະ ສິນຄ້າ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.docType}>{tt('billing', 'ໃບ ແຈ້ງ ໜີ້')}</Text>
              <Text style={styles.invNo}>{invNo}</Text>
              <Text style={styles.invNo}>{dateLao(Date.now())}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          {/* bill-to + credit summary */}
          <View style={styles.parties}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={styles.partyLabel}>{tt('billing', 'ຮຽກ ເກັບ ຈາກ (ບໍລິສັທ)')}</Text>
              <Text style={styles.partyName}>🏢 {org.name}</Text>
              <Text style={styles.partyMeta}>{tt('billing', 'ເງື່ອນ ໄຂ ຈ່າຍ ມາດຕະຖານ')}: {termsLabel(org.defaultTerms)}</Text>
            </View>
            <View style={styles.creditBox}>
              <SumLine label={tt('billing', 'ຄ້າງ ຈ່າຍ')} value={kip(sum.outstanding)} strong />
              {sum.overdue > 0 && <SumLine label={tt('billing', 'ເລີຍ ກຳ ນົດ')} value={kip(sum.overdue)} danger />}
              <SumLine label={tt('billing', 'ຈ່າຍ ແລ້ວ')} value={kip(sum.paid)} />
              <SumLine label={tt('billing', 'ວົງ ເງິນ ເຄຣດິຕ')} value={kip(sum.limit)} />
              <SumLine label={tt('billing', 'ຍັງ ໃຊ້ ໄດ້')} value={kip(sum.available)} />
            </View>
          </View>

          {/* invoice table */}
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.cNo]}>{tt('billing', 'ເລກ')}</Text>
            <Text style={[styles.th, styles.cDesc]}>{tt('billing', 'ລາຍການ')}</Text>
            <Text style={[styles.th, styles.cDue]}>{tt('billing', 'ຄົບ ກຳ ນົດ')}</Text>
            <Text style={[styles.th, styles.cAmt]}>{tt('billing', 'ຈຳ ນວນ')}</Text>
            <Text style={[styles.th, styles.cSt]}>{tt('billing', 'ສະຖານະ')}</Text>
          </View>
          {rows.length === 0 && <Text style={styles.emptyRow}>{tt('billing', 'ບໍ່ ມີ ລາຍການ')}</Text>}
          {rows.map((i) => {
            const overdue = isOverdue(i);
            const stTx = i.status === 'paid' ? tt('billing', 'ຈ່າຍ ແລ້ວ') : overdue ? tt('billing', 'ເລີຍ ກຳ ນົດ') : tt('billing', 'ຄ້າງ');
            const stColor = i.status === 'paid' ? colors.success : overdue ? colors.error : colors.warning;
            return (
              <View key={i.id} style={styles.tr}>
                <Text style={[styles.td, styles.cNo]}>{i.number}</Text>
                <Text style={[styles.td, styles.cDesc]} numberOfLines={2}>{i.title}{i.siteName ? `\n📍 ${i.siteName}` : ''}</Text>
                <Text style={[styles.td, styles.cDue]}>{dateLao(i.dueAt)}</Text>
                <Text style={[styles.td, styles.cAmt]}>{i.amount.toLocaleString()}</Text>
                <Text style={[styles.td, styles.cSt, { color: stColor, fontWeight: '700' }]}>{stTx}</Text>
              </View>
            );
          })}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>{onlyDue ? tt('billing', 'ລວມ ຄ້າງ ຈ່າຍ') : tt('billing', 'ຄ້າງ ຈ່າຍ ທັງ ໝົດ')}</Text>
            <Text style={styles.grandValue}>{kip(sum.outstanding)}</Text>
          </View>

          {/* spend by building */}
          {bySite.length > 0 && (
            <View style={styles.spendBlock}>
              <Text style={styles.spendHead}>🏠 {tt('billing', 'ຄ່າ ໃຊ້ ຈ່າຍ ຕໍ່ ອາຄານ')}</Text>
              {bySite.map((s) => (
                <View key={s.key} style={styles.spendRow}>
                  <Text style={styles.spendName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.spendVal}>{kip(s.total)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.foot}>{tt('billing', 'ສ້າງ ໂດຍ HomeSang · ໂຮມຊ່າງ')} · {dateLao(Date.now())}</Text>
        </View>

        {Platform.OS === 'web' && (
          <View style={styles.exportRow}>
            <Pressable style={[styles.expBtn, styles.expPrimary]} onPress={exportPdf}><Text style={styles.expPrimaryText}>📄 PDF</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={exportJpg}><Text style={styles.expText}>🖼️ JPG</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={doPrint}><Text style={styles.expText}>🖨️ {tt('billing', 'ພິມ')}</Text></Pressable>
          </View>
        )}
        {Platform.OS !== 'web' && <Text style={styles.muted}>{tt('billing', 'ສົ່ງ ອອກ PDF ໄດ້ ຢູ່ ເວັບ')}</Text>}
        <BackButton />
      </ScrollView>
    </View>
  );
}

function SumLine({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <View style={styles.sumLine}>
      <Text style={[styles.sumLbl, danger && { color: colors.error }]}>{label}</Text>
      <Text style={[styles.sumVal, strong && styles.sumStrong, danger && { color: colors.error }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topT: { fontSize: 15, fontWeight: '800', color: colors.text },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  muted: { color: colors.text3, textAlign: 'center', marginTop: 10 },
  filterRow: { flexDirection: 'row', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 4, paddingBottom: 8 },
  fChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: colors.surface },
  fChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fChipTx: { fontSize: 12.5, color: colors.text2, fontWeight: '700' },
  fChipTxOn: { color: '#fff' },
  sheet: { width: '100%', maxWidth: 720, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, ...shadow.card },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: 20, fontWeight: '800', color: colors.primary },
  brandSub: { fontSize: 12, color: colors.text3, marginTop: 2 },
  docType: { fontSize: 15, fontWeight: '700', color: colors.text },
  invNo: { fontSize: 12, color: colors.text3, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  parties: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  partyLabel: { fontSize: 12, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  partyName: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  partyMeta: { fontSize: 12.5, color: colors.text2, marginTop: 4 },
  creditBox: { minWidth: 220, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12, gap: 3 },
  sumLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLbl: { fontSize: 12, color: colors.text2 },
  sumVal: { fontSize: 12.5, color: colors.text, fontWeight: '600' },
  sumStrong: { fontSize: 14, fontWeight: '900' },
  tableHead: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 6, marginTop: space.lg },
  th: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  tr: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'flex-start' },
  td: { fontSize: 12, color: colors.text },
  cNo: { width: 78 },
  cDesc: { flex: 1, paddingRight: 6 },
  cDue: { width: 70, textAlign: 'center' },
  cAmt: { width: 78, textAlign: 'right', fontWeight: '600' },
  cSt: { width: 58, textAlign: 'right' },
  emptyRow: { fontSize: 12.5, color: colors.text3, textAlign: 'center', paddingVertical: 16 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 2, borderTopColor: colors.text, marginTop: 8, paddingTop: 8 },
  grandLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  grandValue: { fontSize: 15, fontWeight: '900', color: colors.primary },
  spendBlock: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  spendHead: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  spendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  spendName: { fontSize: 12.5, color: colors.text2, flex: 1 },
  spendVal: { fontSize: 12.5, color: colors.text, fontWeight: '700' },
  foot: { fontSize: 12, color: colors.text3, textAlign: 'center', marginTop: space.lg },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.lg, justifyContent: 'center' },
  expBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.surface },
  expPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  expPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  expText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
