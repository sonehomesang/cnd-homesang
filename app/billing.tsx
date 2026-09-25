import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT, ttStatic } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { groupThousands } from '@/lib/format';
import { pickActiveOrg, updateOrgCredit, watchMyOrgs, watchSitesForOrg, type Org } from '@/lib/orgs';
import type { Site } from '@/lib/sites';
import { VENDOR_TRADES, watchRfqs, type Rfq } from '@/lib/vendors';
import {
  TERMS, type Terms, type OrgInvoice, createInvoice, deleteInvoice, isOverdue, markPaid,
  reopenInvoice, seedMockInvoices, clearMockInvoices, spendBySite, summarize, termsLabel,
  voidInvoice, watchInvoices,
} from '@/lib/billing';
import { isMock, useMockEnabled } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import BackButton from '@/components/BackButton';

const kip = (n?: number) => (n ? n.toLocaleString('en-US') : '0') + ' ' + ttStatic('billing', 'ກີບ');
const dateLao = (ms: number) => { if (!ms) return ''; const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };

export default function BillingScreen() {
  const { fbUser } = useAuth();
  const tt = useTT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inv, setInv] = useState<OrgInvoice[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!fbUser) { router.replace('/sign-in' as any); return; } return watchMyOrgs(fbUser.uid, (o) => { setOrgs(o); setLoaded(true); }); }, [fbUser]);
  const org = pickActiveOrg(orgs);
  const isOwner = !!org && org.ownerId === fbUser?.uid;
  useEffect(() => { if (!org) { setInv([]); setSites([]); setRfqs([]); return; } const a = watchInvoices(org.id, setInv); const b = watchSitesForOrg(org.id, setSites); const c = watchRfqs(org.id, setRfqs); return () => { a(); b(); c(); }; }, [org?.id]);

  const sum = useMemo(() => summarize(inv, org?.creditLimit ?? 0), [inv, org?.creditLimit]);
  const bySite = useMemo(() => spendBySite(inv), [inv]);
  const hasMock = useMemo(() => inv.some(isMock), [inv]);
  const mockEnabled = useMockEnabled();

  const seed = async () => { if (!org || !fbUser) return; setBusy(true); try { await seedMockInvoices(org.id, fbUser.uid); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const clearMock = async () => { if (!org) return; if (!confirm(tt('billing', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງ ໝົດ?'))) return; setBusy(true); try { await clearMockInvoices(org.id); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  if (!fbUser || !loaded) return <View style={styles.root}><View style={styles.top}><BackButton /><Text style={styles.topT}>🧾 {tt('billing', 'ໃບ ບິນ & ເຄຣດິຕ')}</Text></View></View>;

  if (!org) {
    return (
      <View style={styles.root}>
        <View style={styles.top}><BackButton /><Text style={styles.topT}>🧾 {tt('billing', 'ໃບ ບິນ & ເຄຣດິຕ')}</Text></View>
        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.cardH}>{tt('billing', 'ຕ້ອງ ມີ ບໍລິສັທ ກ່ອນ')}</Text>
            <Text style={styles.cardSub}>{tt('billing', 'ໃບ ບິນ ບໍລິສັທ ແລະ ເຄຣດິຕ ແມ່ນ ຂອງ ບໍລິສັທ. ສ້າງ ຫຼື ເຂົ້າ ຮ່ວມ ບໍລິສັທ ກ່ອນ.')}</Text>
            <Pressable style={styles.btn} onPress={() => router.replace('/company' as any)}><Text style={styles.btnTx}>🏢 {tt('billing', 'ໄປ ໜ້າ ບໍລິສັທ')}</Text></Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}><BackButton /><Text style={styles.topT}>🧾 {tt('billing', 'ໃບ ບິນ & ເຄຣດິຕ')}</Text></View>
      <ScrollView contentContainerStyle={styles.body}>
        {/* credit summary */}
        <View style={styles.sumWrap}>
          <View style={[styles.sumCard, { borderColor: sum.overdue > 0 ? colors.error : colors.border }]}>
            <Text style={styles.sumLbl}>{tt('billing', 'ຄ້າງ ຈ່າຍ')}</Text>
            <Text style={styles.sumBig}>{kip(sum.outstanding)}</Text>
            {sum.overdue > 0 && <Text style={styles.sumOver}>⚠ {tt('billing', 'ເລີຍ ກຳ ນົດ')} {kip(sum.overdue)}</Text>}
          </View>
          <View style={styles.sumCard}>
            <Text style={styles.sumLbl}>{tt('billing', 'ວົງ ເງິນ ເຄຣດິຕ')}</Text>
            <Text style={styles.sumMid}>{kip(sum.limit)}</Text>
            <Text style={styles.sumSub}>{tt('billing', 'ຍັງ ໃຊ້ ໄດ້')}: {kip(sum.available)}</Text>
          </View>
          <View style={styles.sumCard}>
            <Text style={styles.sumLbl}>{tt('billing', 'ຈ່າຍ ແລ້ວ')}</Text>
            <Text style={[styles.sumMid, { color: colors.success }]}>{kip(sum.paid)}</Text>
          </View>
        </View>

        {/* statement / ໃບ ແຈ້ງ ໜີ້ (PDF export) */}
        <Pressable style={styles.stmtBtn} onPress={() => router.push('/statement' as any)}>
          <Text style={styles.stmtTx}>📄 {tt('billing', 'ໃບ ແຈ້ງ ໜີ້ / Statement (ສົ່ງ ອອກ PDF)')}</Text>
          <Text style={styles.go}>›</Text>
        </Pressable>

        {/* mock bar — hidden when admin turns mock mode off (go-live) */}
        {(mockEnabled || hasMock) && (
        <View style={styles.mockBar}>
          {!hasMock
            ? <Pressable style={[styles.mockBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={seed}><Text style={styles.mockBtnTx}>🧪 {tt('billing', 'ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text></Pressable>
            : <Pressable style={[styles.mockBtn, styles.mockBtnClear, busy && { opacity: 0.5 }]} disabled={busy} onPress={clearMock}><Text style={[styles.mockBtnTx, { color: colors.error }]}>🧹 {tt('billing', 'ລຶບ ຕົວຢ່າງ')}</Text></Pressable>}
          <Text style={styles.mockHint}>{tt('billing', 'ຕົວຢ່າງ = ຂໍ້ມູນ ທົດລອງ, ລຶບ ໄດ້')}</Text>
        </View>
        )}

        {isOwner && <CreditSettings org={org} tt={tt} />}
        <NewInvoice org={org} uid={fbUser.uid} sites={sites} rfqs={rfqs} inv={inv} tt={tt} />

        {/* invoices */}
        <Text style={styles.secT}>📄 {tt('billing', 'ໃບ ບິນ')} ({inv.length})</Text>
        {inv.length === 0 ? <Text style={styles.empty}>{tt('billing', 'ຍັງ ບໍ່ ມີ ໃບ ບິນ')}</Text> : inv.map((i) => <InvoiceRow key={i.id} i={i} tt={tt} />)}

        {/* spend by building */}
        {bySite.length > 0 && (
          <>
            <Text style={styles.secT}>🏠 {tt('billing', 'ຄ່າ ໃຊ້ ຈ່າຍ ຕໍ່ ອາຄານ')}</Text>
            {bySite.map((s) => (
              <View key={s.key} style={styles.siteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siteN} numberOfLines={1}>📍 {s.name}</Text>
                  <Text style={styles.siteSub}>{s.count} {tt('billing', 'ໃບ')} · {tt('billing', 'ຄ້າງ')} {kip(s.outstanding)} · {tt('billing', 'ຈ່າຍ ແລ້ວ')} {kip(s.paid)}</Text>
                </View>
                <Text style={styles.siteTotal}>{kip(s.total)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Credit settings (owner) ──────────────────────────────────────────────────
function CreditSettings({ org, tt }: { org: Org; tt: any }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(org.creditLimit ?? ''));
  const [terms, setTerms] = useState<Terms>((org.defaultTerms as Terms) ?? 'net30');
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await updateOrgCredit(org.id, Number(limit.replace(/\D/g, '')) || 0, terms); setOpen(false); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <Pressable style={styles.addToggle} onPress={() => setOpen((v) => !v)}><Text style={styles.addToggleTx}>{open ? '✕ ' + tt('billing', 'ຍົກເລີກ') : '⚙️ ' + tt('billing', 'ຕັ້ງ ຄ່າ ເຄຣດິຕ')}</Text></Pressable>
      {open && (
        <View style={styles.card}>
          <Text style={styles.lbl}>{tt('billing', 'ວົງ ເງິນ ເຄຣດິຕ (ກີບ)')}</Text>
          <TextInput style={styles.input} value={groupThousands(limit)} onChangeText={(t) => setLimit(t.replace(/\D/g, ''))} placeholder="0" placeholderTextColor="#9ca3af" keyboardType="number-pad" />
          <Text style={styles.lbl}>{tt('billing', 'ເງື່ອນ ໄຂ ຈ່າຍ ມາດຕະຖານ')}</Text>
          <View style={styles.chips}>{TERMS.map((t) => <Pressable key={t.key} style={[styles.chip, terms === t.key && styles.chipOn]} onPress={() => setTerms(t.key)}><Text style={[styles.chipTx, terms === t.key && styles.chipTxOn]}>{t.lao}</Text></Pressable>)}</View>
          <Pressable style={[styles.btn, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}><Text style={styles.btnTx}>{tt('billing', 'ບັນທຶກ')}</Text></Pressable>
        </View>
      )}
    </>
  );
}

// ── New invoice ──────────────────────────────────────────────────────────────
function NewInvoice({ org, uid, sites, rfqs, inv, tt }: { org: Org; uid: string; sites: Site[]; rfqs: Rfq[]; inv: OrgInvoice[]; tt: any }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [terms, setTerms] = useState<Terms>((org.defaultTerms as Terms) ?? 'net30');
  const [note, setNote] = useState('');
  const [src, setSrc] = useState<{ type: 'rfq'; id: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // awarded RFQs not yet invoiced → one-tap prefill
  const invoicedRfq = new Set(inv.filter((i) => i.sourceType === 'rfq').map((i) => i.sourceId));
  const awardable = rfqs.filter((r) => r.status === 'awarded' && !invoicedRfq.has(r.id));

  const fromRfq = (r: Rfq) => {
    const q = r.quotes.find((x) => x.vendorId === r.awardedVendorId);
    setTitle(r.title); setAmount(String(q?.price ?? '')); setCat(r.category); setSiteId(r.siteId ?? ''); setSrc({ type: 'rfq', id: r.id }); setOpen(true);
  };
  const reset = () => { setTitle(''); setAmount(''); setCat(''); setSiteId(''); setNote(''); setSrc(null); };
  const create = async () => {
    if (!title.trim() || !amount.replace(/\D/g, '')) return; setBusy(true);
    try {
      const site = sites.find((s) => s.id === siteId);
      await createInvoice(org.id, uid, { title, amount: Number(amount.replace(/\D/g, '')), terms, category: cat || undefined, siteId: siteId || undefined, siteName: site?.name, note, sourceType: src?.type ?? 'manual', sourceId: src?.id });
      reset(); setOpen(false);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Pressable style={styles.addToggle} onPress={() => { if (open) reset(); setOpen((v) => !v); }}><Text style={styles.addToggleTx}>{open ? '✕ ' + tt('billing', 'ຍົກເລີກ') : '＋ ' + tt('billing', 'ອອກ ໃບ ບິນ ໃໝ່')}</Text></Pressable>
      {!open && awardable.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardSub}>⚡ {tt('billing', 'ອອກ ບິນ ຈາກ ວຽກ ທີ່ ເລືອກ ຊ່າງ ແລ້ວ (RFQ):')}</Text>
          <View style={styles.chips}>{awardable.map((r) => <Pressable key={r.id} style={styles.chip} onPress={() => fromRfq(r)}><Text style={styles.chipTx} numberOfLines={1}>＋ {r.title}</Text></Pressable>)}</View>
        </View>
      )}
      {open && (
        <View style={styles.card}>
          {src && <Text style={styles.fromTag}>⚡ {tt('billing', 'ຈາກ RFQ')}</Text>}
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={tt('billing', 'ລາຍການ / ວຽກ')} placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} value={groupThousands(amount)} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} placeholder={tt('billing', 'ຈຳ ນວນ ເງິນ (ກີບ)')} placeholderTextColor="#9ca3af" keyboardType="number-pad" />
          <Text style={styles.lbl}>{tt('billing', 'ໝວດ (ບໍ່ ບັງຄັບ)')}</Text>
          <View style={styles.chips}><Pressable style={[styles.chip, !cat && styles.chipOn]} onPress={() => setCat('')}><Text style={[styles.chipTx, !cat && styles.chipTxOn]}>—</Text></Pressable>{VENDOR_TRADES.map((t) => <Pressable key={t} style={[styles.chip, cat === t && styles.chipOn]} onPress={() => setCat(t)}><Text style={[styles.chipTx, cat === t && styles.chipTxOn]}>{t}</Text></Pressable>)}</View>
          {sites.length > 0 && (
            <>
              <Text style={styles.lbl}>{tt('billing', 'ອາຄານ (ບໍ່ ບັງຄັບ)')}</Text>
              <View style={styles.chips}><Pressable style={[styles.chip, !siteId && styles.chipOn]} onPress={() => setSiteId('')}><Text style={[styles.chipTx, !siteId && styles.chipTxOn]}>—</Text></Pressable>{sites.map((s) => <Pressable key={s.id} style={[styles.chip, siteId === s.id && styles.chipOn]} onPress={() => setSiteId(s.id)}><Text style={[styles.chipTx, siteId === s.id && styles.chipTxOn]} numberOfLines={1}>📍 {s.name}</Text></Pressable>)}</View>
            </>
          )}
          <Text style={styles.lbl}>{tt('billing', 'ເງື່ອນ ໄຂ ຈ່າຍ')}</Text>
          <View style={styles.chips}>{TERMS.map((t) => <Pressable key={t.key} style={[styles.chip, terms === t.key && styles.chipOn]} onPress={() => setTerms(t.key)}><Text style={[styles.chipTx, terms === t.key && styles.chipTxOn]}>{t.lao}</Text></Pressable>)}</View>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={tt('billing', 'ໝາຍເຫດ (ບໍ່ ບັງຄັບ)')} placeholderTextColor="#9ca3af" />
          <Pressable style={[styles.btn, (busy || !title.trim() || !amount) && { opacity: 0.5 }]} disabled={busy || !title.trim() || !amount} onPress={create}><Text style={styles.btnTx}>{tt('billing', 'ອອກ ໃບ ບິນ')}</Text></Pressable>
        </View>
      )}
    </>
  );
}

// ── Invoice row ──────────────────────────────────────────────────────────────
function InvoiceRow({ i, tt }: { i: OrgInvoice; tt: any }) {
  const overdue = isOverdue(i);
  const st = i.status === 'paid' ? { lao: tt('billing', 'ຈ່າຍ ແລ້ວ'), bg: '#e2f6ea', fg: '#1f9d57' }
    : i.status === 'void' ? { lao: tt('billing', 'ຍົກເລີກ'), bg: '#f1f5f9', fg: '#64748b' }
    : overdue ? { lao: tt('billing', 'ເລີຍ ກຳ ນົດ'), bg: '#fdecec', fg: colors.error }
    : { lao: tt('billing', 'ຄ້າງ ຈ່າຍ'), bg: '#fff4e5', fg: colors.warning };
  return (
    <View style={styles.iRow}>
      <View style={styles.iHead}>
        <Text style={styles.iNum}>{i.number}</Text>
        {isMock(i) && <MockBadge small />}
        <Text style={[styles.stPill, { backgroundColor: st.bg, color: st.fg }]}>{st.lao}</Text>
      </View>
      <Text style={styles.iTitle} numberOfLines={1}>{i.title}</Text>
      <Text style={styles.iAmt}>{kip(i.amount)}</Text>
      <Text style={styles.iMeta}>{termsLabel(i.terms)} · {tt('billing', 'ຄົບ ກຳ ນົດ')} {dateLao(i.dueAt)}{i.siteName ? ` · 📍 ${i.siteName}` : ''}{i.category ? ` · ${i.category}` : ''}</Text>
      <View style={styles.iActions}>
        {i.status === 'sent' && <Pressable style={[styles.actBtn, styles.actPay]} onPress={() => markPaid(i.id).catch(() => {})}><Text style={styles.actPayTx}>✓ {tt('billing', 'ໝາຍ ຈ່າຍ ແລ້ວ')}</Text></Pressable>}
        {i.status === 'paid' && <Pressable style={styles.actBtn} onPress={() => reopenInvoice(i.id).catch(() => {})}><Text style={styles.actTx}>↩ {tt('billing', 'ຍົກເລີກ ຈ່າຍ')}</Text></Pressable>}
        {i.status !== 'void' && <Pressable style={styles.actBtn} onPress={() => voidInvoice(i.id).catch(() => {})}><Text style={styles.actTx}>{tt('billing', 'ຍົກເລີກ ບິນ')}</Text></Pressable>}
        <Pressable style={styles.actBtn} onPress={() => { if (confirm(tt('billing', 'ລຶບ ໃບ ບິນ ນີ້?'))) deleteInvoice(i.id).catch(() => {}); }}><Text style={[styles.actTx, { color: colors.error }]}>🗑</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topT: { fontSize: 15, fontWeight: '800', color: colors.text },
  body: { padding: 12, paddingBottom: 60, gap: 10 },
  sumWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sumCard: { flex: 1, minWidth: 100, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 2 },
  sumLbl: { fontSize: 12, color: colors.text3, fontWeight: '700' },
  sumBig: { fontSize: 15, fontWeight: '900', color: colors.text },
  sumMid: { fontSize: 14, fontWeight: '800', color: colors.text },
  sumSub: { fontSize: 12, color: colors.text3, marginTop: 1 },
  sumOver: { fontSize: 12, color: colors.error, fontWeight: '800', marginTop: 1 },
  stmtBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e7f0fb', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  stmtTx: { flex: 1, fontSize: 13.5, fontWeight: '800', color: colors.primary },
  go: { fontSize: 20, color: colors.primary, fontWeight: '800' },
  mockBar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  mockBtn: { backgroundColor: '#fffbeb', borderColor: '#f59e0b', borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  mockBtnClear: { backgroundColor: '#fdecec', borderColor: colors.error },
  mockBtnTx: { fontSize: 12.5, fontWeight: '800', color: '#b45309' },
  mockHint: { fontSize: 12, color: colors.text3, flex: 1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 },
  cardH: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardSub: { fontSize: 12.5, color: colors.text2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  lbl: { fontSize: 12.5, fontWeight: '700', color: colors.text2, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: colors.surface, maxWidth: 220 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTx: { fontSize: 12.5, color: colors.text2, fontWeight: '600' },
  chipTxOn: { color: '#fff' },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  addToggle: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e7f0fb' },
  addToggleTx: { fontSize: 13, fontWeight: '800', color: colors.primary },
  fromTag: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '800', color: '#7c3aed', backgroundColor: '#f3e8ff', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  empty: { fontSize: 13, color: colors.text3, textAlign: 'center', paddingVertical: 20 },
  secT: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 8 },
  iRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, gap: 4 },
  iHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iNum: { fontSize: 12, fontWeight: '800', color: colors.text3, flexShrink: 1 },
  iTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  iAmt: { fontSize: 15, fontWeight: '900', color: colors.text },
  iMeta: { fontSize: 12, color: colors.text3 },
  stPill: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden', marginLeft: 'auto' },
  iActions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 6 },
  actBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.surface },
  actTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  actPay: { backgroundColor: '#e2f6ea', borderColor: '#a7e0c0' },
  actPayTx: { fontSize: 12, fontWeight: '800', color: '#1f9d57' },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  siteN: { fontSize: 14, fontWeight: '800', color: colors.text },
  siteSub: { fontSize: 12, color: colors.text3, marginTop: 2 },
  siteTotal: { fontSize: 14, fontWeight: '900', color: colors.text },
});
