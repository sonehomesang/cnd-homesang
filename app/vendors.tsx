import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT, ttStatic } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { groupThousands } from '@/lib/format';
import { pickActiveOrg, watchMyOrgs, watchSitesForOrg, type Org } from '@/lib/orgs';
import type { Site } from '@/lib/sites';
import {
  VENDOR_TRADES, addQuote, addVendor, awardRfq, clearMockVendorData, closeRfq, createRfq,
  deleteRfq, removeVendor, seedMockVendorData, watchRfqs, watchVendors, type OrgVendor, type Rfq,
} from '@/lib/vendors';
import { isMock, useMockEnabled } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import BackButton from '@/components/BackButton';

const kip = (n?: number) => (n ? n.toLocaleString('en-US') : '0') + ' ' + ttStatic('vendors', 'ກີບ');

export default function VendorsScreen() {
  const { fbUser } = useAuth();
  const tt = useTT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [vendors, setVendors] = useState<OrgVendor[]>([]);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [tab, setTab] = useState<'vendors' | 'rfq'>('vendors');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Rfq | null>(null);

  useEffect(() => { if (!fbUser) { router.replace('/sign-in' as any); return; } return watchMyOrgs(fbUser.uid, (o) => { setOrgs(o); setLoaded(true); }); }, [fbUser]);
  const org = pickActiveOrg(orgs);
  useEffect(() => { if (!org) { setVendors([]); setRfqs([]); setSites([]); return; } const a = watchVendors(org.id, setVendors); const b = watchRfqs(org.id, setRfqs); const c = watchSitesForOrg(org.id, setSites); return () => { a(); b(); c(); }; }, [org?.id]);

  // keep the open detail modal in sync with live quote/award updates
  useEffect(() => { if (detail) { const fresh = rfqs.find((r) => r.id === detail.id); if (fresh) setDetail(fresh); } }, [rfqs]);

  const hasMock = useMemo(() => vendors.some(isMock) || rfqs.some(isMock), [vendors, rfqs]);
  const mockEnabled = useMockEnabled();

  const seed = async () => { if (!org || !fbUser) return; setBusy(true); try { await seedMockVendorData(org.id, fbUser.uid); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const clearMock = async () => { if (!org) return; if (!confirm(tt('vendors', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງ ໝົດ?'))) return; setBusy(true); try { await clearMockVendorData(org.id); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  // guest / still loading — render just the header (redirect handled in effect)
  if (!fbUser || !loaded) {
    return <View style={styles.root}><View style={styles.top}><BackButton /><Text style={styles.topT}>🤝 {tt('vendors', 'ຊ່າງ ປະຈຳ & RFQ')}</Text></View></View>;
  }

  // signed in but no company yet → prompt to create/join one
  if (!org) {
    return (
      <View style={styles.root}>
        <View style={styles.top}><BackButton /><Text style={styles.topT}>🤝 {tt('vendors', 'ຊ່າງ ປະຈຳ & RFQ')}</Text></View>
        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.cardH}>{tt('vendors', 'ຕ້ອງ ມີ ບໍລິສັທ ກ່ອນ')}</Text>
            <Text style={styles.cardSub}>{tt('vendors', 'ຊ່າງ ປະຈຳ ແລະ RFQ ແມ່ນ ຂອງ ບໍລິສັທ. ສ້າງ ຫຼື ເຂົ້າ ຮ່ວມ ບໍລິສັທ ກ່ອນ.')}</Text>
            <Pressable style={styles.btn} onPress={() => router.replace('/company' as any)}><Text style={styles.btnTx}>🏢 {tt('vendors', 'ໄປ ໜ້າ ບໍລິສັທ')}</Text></Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}><BackButton /><Text style={styles.topT}>🤝 {tt('vendors', 'ຊ່າງ ປະຈຳ & RFQ')}</Text></View>

      {/* tabs */}
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'vendors' && styles.tabOn]} onPress={() => setTab('vendors')}><Text style={[styles.tabTx, tab === 'vendors' && styles.tabTxOn]}>👷 {tt('vendors', 'ຊ່າງ ປະຈຳ')} ({vendors.length})</Text></Pressable>
        <Pressable style={[styles.tab, tab === 'rfq' && styles.tabOn]} onPress={() => setTab('rfq')}><Text style={[styles.tabTx, tab === 'rfq' && styles.tabTxOn]}>📩 RFQ ({rfqs.length})</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* sample-data controls — hidden when admin turns mock mode off (go-live) */}
        {(mockEnabled || hasMock) && (
        <View style={styles.mockBar}>
          {!hasMock ? (
            <Pressable style={[styles.mockBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={seed}><Text style={styles.mockBtnTx}>🧪 {tt('vendors', 'ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text></Pressable>
          ) : (
            <Pressable style={[styles.mockBtn, styles.mockBtnClear, busy && { opacity: 0.5 }]} disabled={busy} onPress={clearMock}><Text style={[styles.mockBtnTx, { color: colors.error }]}>🧹 {tt('vendors', 'ລຶບ ຕົວຢ່າງ')}</Text></Pressable>
          )}
          <Text style={styles.mockHint}>{tt('vendors', 'ຕົວຢ່າງ = ຂໍ້ມູນ ທົດລອງ, ລຶບ ໄດ້')}</Text>
        </View>
        )}

        {tab === 'vendors'
          ? <VendorsTab vendors={vendors} orgId={org.id} uid={fbUser.uid} tt={tt} />
          : <RfqTab rfqs={rfqs} vendors={vendors} sites={sites} orgId={org.id} uid={fbUser.uid} tt={tt} onOpen={setDetail} />}
      </ScrollView>

      {detail && <RfqDetail rfq={detail} vendors={vendors} tt={tt} onClose={() => setDetail(null)} />}
    </View>
  );
}

// ── Vendor pool tab ──────────────────────────────────────────────────────────
function VendorsTab({ vendors, orgId, uid, tt }: { vendors: OrgVendor[]; orgId: string; uid: string; tt: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState<string>(VENDOR_TRADES[0]);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => { if (!name.trim()) return; setBusy(true); try { await addVendor(orgId, uid, { name, trade, phone, note }); setName(''); setPhone(''); setNote(''); setOpen(false); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  return (
    <>
      <Pressable style={styles.addToggle} onPress={() => setOpen((v) => !v)}><Text style={styles.addToggleTx}>{open ? '✕ ' + tt('vendors', 'ຍົກເລີກ') : '＋ ' + tt('vendors', 'ເພີ່ມ ຊ່າງ ປະຈຳ')}</Text></Pressable>
      {open && (
        <View style={styles.card}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={tt('vendors', 'ຊື່ ຊ່າງ / ຮ້ານ')} placeholderTextColor="#9ca3af" />
          <View style={styles.chips}>{VENDOR_TRADES.map((t) => <Pressable key={t} style={[styles.chip, trade === t && styles.chipOn]} onPress={() => setTrade(t)}><Text style={[styles.chipTx, trade === t && styles.chipTxOn]}>{t}</Text></Pressable>)}</View>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={tt('vendors', 'ເບີ ໂທ (ບໍ່ ບັງຄັບ)')} placeholderTextColor="#9ca3af" keyboardType="phone-pad" />
          <TextInput style={[styles.input, { height: 60 }]} value={note} onChangeText={setNote} placeholder={tt('vendors', 'ໝາຍເຫດ (ຄວາມ ຊ່ຽວຊານ...)')} placeholderTextColor="#9ca3af" multiline />
          <Pressable style={[styles.btn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.btnTx}>{tt('vendors', 'ບັນທຶກ')}</Text></Pressable>
        </View>
      )}
      {vendors.length === 0 ? <Text style={styles.empty}>{tt('vendors', 'ຍັງ ບໍ່ ມີ ຊ່າງ ປະຈຳ — ເພີ່ມ ຫຼື ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text> : vendors.map((v) => (
        <View key={v.id} style={styles.vRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.vHead}><Text style={styles.vName} numberOfLines={1}>{v.name}</Text>{isMock(v) && <MockBadge small />}</View>
            <Text style={styles.vMeta}>🔧 {v.trade}{v.rating ? `  ·  ⭐ ${v.rating}` : ''}{v.phone ? `  ·  📱 ${v.phone}` : ''}</Text>
            {!!v.note && <Text style={styles.vNote} numberOfLines={2}>{v.note}</Text>}
          </View>
          <Pressable onPress={() => removeVendor(v.id).catch(() => {})} hitSlop={8} style={styles.rm}><Text style={{ color: colors.error }}>✕</Text></Pressable>
        </View>
      ))}
    </>
  );
}

// ── RFQ tab ──────────────────────────────────────────────────────────────────
const STATUS: Record<string, { lao: string; bg: string; fg: string }> = {
  open: { lao: ttStatic('vendors', 'ເປິດ ຮັບ ໃບ ສະເໜີ'), bg: '#e7f0fb', fg: '#0066CC' },
  awarded: { lao: ttStatic('vendors', 'ເລືອກ ແລ້ວ'), bg: '#e2f6ea', fg: '#1f9d57' },
  closed: { lao: ttStatic('vendors', 'ປິດ'), bg: '#f1f5f9', fg: '#64748b' },
};

function RfqTab({ rfqs, vendors, sites, orgId, uid, tt, onOpen }: { rfqs: Rfq[]; vendors: OrgVendor[]; sites: Site[]; orgId: string; uid: string; tt: any; onOpen: (r: Rfq) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<string>(VENDOR_TRADES[0]);
  const [desc, setDesc] = useState('');
  const [budget, setBudget] = useState('');
  const [siteId, setSiteId] = useState<string>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const create = async () => {
    if (!title.trim()) return; setBusy(true);
    try {
      const site = sites.find((s) => s.id === siteId);
      await createRfq(orgId, uid, { title, category: cat, description: desc, budget: Number(budget.replace(/\D/g, '')) || undefined, siteId: siteId || undefined, siteName: site?.name, vendorIds: picked });
      setTitle(''); setDesc(''); setBudget(''); setPicked([]); setSiteId(''); setOpen(false);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Pressable style={styles.addToggle} onPress={() => setOpen((v) => !v)}><Text style={styles.addToggleTx}>{open ? '✕ ' + tt('vendors', 'ຍົກເລີກ') : '＋ ' + tt('vendors', 'ສ້າງ RFQ (ຂໍ ໃບ ສະເໜີ)')}</Text></Pressable>
      {open && (
        <View style={styles.card}>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={tt('vendors', 'ຫົວຂໍ້ ວຽກ (ເຊ່ນ ປ່ຽນ ແອຣ໌ ຫ້ອງ ປະຊຸມ)')} placeholderTextColor="#9ca3af" />
          <Text style={styles.lbl}>{tt('vendors', 'ໝວດ')}</Text>
          <View style={styles.chips}>{VENDOR_TRADES.map((t) => <Pressable key={t} style={[styles.chip, cat === t && styles.chipOn]} onPress={() => setCat(t)}><Text style={[styles.chipTx, cat === t && styles.chipTxOn]}>{t}</Text></Pressable>)}</View>
          <TextInput style={[styles.input, { height: 70 }]} value={desc} onChangeText={setDesc} placeholder={tt('vendors', 'ລາຍລະອຽດ ວຽກ / ຂອບເຂຕ')} placeholderTextColor="#9ca3af" multiline />
          <TextInput style={styles.input} value={groupThousands(budget)} onChangeText={(t) => setBudget(t.replace(/\D/g, ''))} placeholder={tt('vendors', 'ງບ ປະມານ ກີບ (ບໍ່ ບັງຄັບ)')} placeholderTextColor="#9ca3af" keyboardType="number-pad" />
          {sites.length > 0 && (
            <>
              <Text style={styles.lbl}>{tt('vendors', 'ອາຄານ (ບໍ່ ບັງຄັບ)')}</Text>
              <View style={styles.chips}>
                <Pressable style={[styles.chip, !siteId && styles.chipOn]} onPress={() => setSiteId('')}><Text style={[styles.chipTx, !siteId && styles.chipTxOn]}>—</Text></Pressable>
                {sites.map((s) => <Pressable key={s.id} style={[styles.chip, siteId === s.id && styles.chipOn]} onPress={() => setSiteId(s.id)}><Text style={[styles.chipTx, siteId === s.id && styles.chipTxOn]} numberOfLines={1}>📍 {s.name}</Text></Pressable>)}
              </View>
            </>
          )}
          <Text style={styles.lbl}>{tt('vendors', 'ເຊີນ ຊ່າງ ໃຫ້ ສະເໜີ ລາຄາ')} ({picked.length})</Text>
          {vendors.length === 0 ? <Text style={styles.cardSub}>{tt('vendors', 'ຍັງ ບໍ່ ມີ ຊ່າງ — ເພີ່ມ ໃນ ແທ໋ບ ຊ່າງ ປະຈຳ ກ່ອນ')}</Text> : (
            <View style={styles.chips}>{vendors.map((v) => <Pressable key={v.id} style={[styles.chip, picked.includes(v.id) && styles.chipOn]} onPress={() => toggle(v.id)}><Text style={[styles.chipTx, picked.includes(v.id) && styles.chipTxOn]} numberOfLines={1}>{picked.includes(v.id) ? '✓ ' : ''}{v.name}</Text></Pressable>)}</View>
          )}
          <Pressable style={[styles.btn, (busy || !title.trim()) && { opacity: 0.5 }]} disabled={busy || !title.trim()} onPress={create}><Text style={styles.btnTx}>{tt('vendors', 'ສ້າງ RFQ')}</Text></Pressable>
        </View>
      )}
      {rfqs.length === 0 ? <Text style={styles.empty}>{tt('vendors', 'ຍັງ ບໍ່ ມີ RFQ')}</Text> : rfqs.map((r) => {
        const low = r.quotes.length ? Math.min(...r.quotes.map((q) => q.price)) : 0;
        const st = STATUS[r.status];
        return (
          <Pressable key={r.id} style={styles.rfqRow} onPress={() => onOpen(r)}>
            <View style={styles.rfqHead}>
              <Text style={styles.rfqTitle} numberOfLines={1}>{r.title}</Text>
              {isMock(r) && <MockBadge small />}
            </View>
            <View style={styles.rfqMetaRow}>
              <Text style={[styles.stPill, { backgroundColor: st.bg, color: st.fg }]}>{st.lao}</Text>
              <Text style={styles.rfqMeta}>🔧 {r.category}  ·  📩 {r.quotes.length} {tt('vendors', 'ໃບ ສະເໜີ')}</Text>
            </View>
            {r.quotes.length > 0 && <Text style={styles.rfqLow}>{tt('vendors', 'ຕ່ຳ ສຸດ')}: {kip(low)}</Text>}
            <Text style={styles.go}>›</Text>
          </Pressable>
        );
      })}
    </>
  );
}

// ── RFQ detail modal (quote comparison + award) ──────────────────────────────
function RfqDetail({ rfq, vendors, tt, onClose }: { rfq: Rfq; vendors: OrgVendor[]; tt: any; onClose: () => void }) {
  const invited = vendors.filter((v) => rfq.vendorIds.includes(v.id));
  const quoted = new Set(rfq.quotes.map((q) => q.vendorId));
  const pending = invited.filter((v) => !quoted.has(v.id));
  const sorted = [...rfq.quotes].sort((a, b) => a.price - b.price);
  const best = sorted[0]?.price;

  const [addFor, setAddFor] = useState<OrgVendor | null>(null);
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [qnote, setQnote] = useState('');
  const [busy, setBusy] = useState(false);

  const submitQuote = async () => {
    if (!addFor || !price.replace(/\D/g, '')) return; setBusy(true);
    try { await addQuote(rfq.id, { vendorId: addFor.id, vendorName: addFor.name, price: Number(price.replace(/\D/g, '')), days: Number(days) || undefined, note: qnote }); setAddFor(null); setPrice(''); setDays(''); setQnote(''); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mBack}>
        <View style={styles.mCard}>
          <View style={styles.mHead}><Text style={styles.mTitle} numberOfLines={2}>{rfq.title}</Text>{isMock(rfq) && <MockBadge small />}<Pressable onPress={onClose} hitSlop={10}><Text style={styles.mX}>✕</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
            <Text style={[styles.stPill, { alignSelf: 'flex-start', backgroundColor: STATUS[rfq.status].bg, color: STATUS[rfq.status].fg }]}>{STATUS[rfq.status].lao}</Text>
            <Text style={styles.dMeta}>🔧 {rfq.category}{rfq.siteName ? `  ·  📍 ${rfq.siteName}` : ''}{rfq.budget ? `  ·  ${tt('vendors', 'ງບ')}: ${kip(rfq.budget)}` : ''}</Text>
            {!!rfq.description && <Text style={styles.dDesc}>{rfq.description}</Text>}

            <Text style={styles.dSec}>📊 {tt('vendors', 'ປຽບທຽບ ໃບ ສະເໜີ')} ({sorted.length})</Text>
            {sorted.length === 0 && <Text style={styles.cardSub}>{tt('vendors', 'ຍັງ ບໍ່ ມີ ໃບ ສະເໜີ')}</Text>}
            {sorted.map((q) => {
              const isBest = q.price === best;
              const isWon = rfq.awardedVendorId === q.vendorId;
              return (
                <View key={q.vendorId + q.at} style={[styles.qCard, isWon && styles.qWon, isBest && !isWon && styles.qBest]}>
                  <View style={styles.qTop}>
                    <Text style={styles.qName} numberOfLines={1}>{q.vendorName}</Text>
                    {isBest && <Text style={styles.qBestTag}>{tt('vendors', 'ຕ່ຳ ສຸດ')}</Text>}
                    {isWon && <Text style={styles.qWonTag}>✓ {tt('vendors', 'ເລືອກ')}</Text>}
                  </View>
                  <Text style={styles.qPrice}>{kip(q.price)}</Text>
                  <Text style={styles.qSub}>{q.days ? `⏱ ${q.days} ${tt('vendors', 'ວັນ')}` : ''}{q.note ? `${q.days ? '  ·  ' : ''}${q.note}` : ''}</Text>
                  {rfq.status === 'open' && <Pressable style={styles.awardBtn} onPress={() => awardRfq(rfq.id, q.vendorId).catch(() => {})}><Text style={styles.awardTx}>🏆 {tt('vendors', 'ເລືອກ ຊ່າງ ນີ້')}</Text></Pressable>}
                </View>
              );
            })}

            {/* log a quote for an invited vendor who quoted by phone/LINE */}
            {rfq.status === 'open' && pending.length > 0 && (
              <>
                <Text style={styles.dSec}>➕ {tt('vendors', 'ບັນທຶກ ໃບ ສະເໜີ')}</Text>
                {!addFor ? (
                  <View style={styles.chips}>{pending.map((v) => <Pressable key={v.id} style={styles.chip} onPress={() => setAddFor(v)}><Text style={styles.chipTx} numberOfLines={1}>＋ {v.name}</Text></Pressable>)}</View>
                ) : (
                  <View style={styles.card}>
                    <Text style={styles.lbl}>{addFor.name}</Text>
                    <TextInput style={styles.input} value={groupThousands(price)} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} placeholder={tt('vendors', 'ລາຄາ ກີບ')} placeholderTextColor="#9ca3af" keyboardType="number-pad" />
                    <TextInput style={styles.input} value={days} onChangeText={(t) => setDays(t.replace(/\D/g, ''))} placeholder={tt('vendors', 'ໃຊ້ ເວລາ (ວັນ)')} placeholderTextColor="#9ca3af" keyboardType="number-pad" />
                    <TextInput style={styles.input} value={qnote} onChangeText={setQnote} placeholder={tt('vendors', 'ໝາຍເຫດ')} placeholderTextColor="#9ca3af" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable style={[styles.btn, { flex: 1 }, (busy || !price) && { opacity: 0.5 }]} disabled={busy || !price} onPress={submitQuote}><Text style={styles.btnTx}>{tt('vendors', 'ບັນທຶກ')}</Text></Pressable>
                      <Pressable style={[styles.btn, styles.btnAlt, { flex: 0.5 }]} onPress={() => setAddFor(null)}><Text style={[styles.btnTx, { color: colors.primary }]}>{tt('vendors', 'ຍົກເລີກ')}</Text></Pressable>
                    </View>
                  </View>
                )}
                {pending.length > 0 && <Text style={styles.cardSub}>{tt('vendors', 'ລໍ ຖ້າ')}: {pending.map((v) => v.name).join(', ')}</Text>}
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              {rfq.status === 'open' && <Pressable style={[styles.btn, styles.btnAlt, { flex: 1 }]} onPress={() => { closeRfq(rfq.id).catch(() => {}); onClose(); }}><Text style={[styles.btnTx, { color: colors.text2 }]}>{tt('vendors', 'ປິດ RFQ')}</Text></Pressable>}
              <Pressable style={styles.delBtn} onPress={() => { if (confirm(tt('vendors', 'ລຶບ RFQ ນີ້?'))) { deleteRfq(rfq.id).catch(() => {}); onClose(); } }}><Text style={styles.delTx}>🗑 {tt('vendors', 'ລຶບ')}</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topT: { fontSize: 15, fontWeight: '800', color: colors.text },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabTx: { fontSize: 13, fontWeight: '700', color: colors.text3 },
  tabTxOn: { color: colors.primary },
  body: { padding: 12, paddingBottom: 60, gap: 10 },
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
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: colors.surface, maxWidth: 200 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTx: { fontSize: 12.5, color: colors.text2, fontWeight: '600' },
  chipTxOn: { color: '#fff' },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  btnTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  addToggle: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#e7f0fb' },
  addToggleTx: { fontSize: 13, fontWeight: '800', color: colors.primary },
  empty: { fontSize: 13, color: colors.text3, textAlign: 'center', paddingVertical: 24 },
  // vendor row
  vRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  vHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vName: { fontSize: 14, fontWeight: '800', color: colors.text, flexShrink: 1 },
  vMeta: { fontSize: 12.5, color: colors.text2, marginTop: 3 },
  vNote: { fontSize: 12, color: colors.text3, marginTop: 3 },
  rm: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fdecec', alignItems: 'center', justifyContent: 'center' },
  // rfq row
  rfqRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, gap: 6 },
  rfqHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 20 },
  rfqTitle: { fontSize: 14, fontWeight: '800', color: colors.text, flexShrink: 1 },
  rfqMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rfqMeta: { fontSize: 12, color: colors.text2 },
  rfqLow: { fontSize: 13, fontWeight: '800', color: colors.success },
  stPill: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  go: { position: 'absolute', right: 12, top: 13, fontSize: 20, color: colors.text3, fontWeight: '800' },
  // modal
  mBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  mCard: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  mHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  mX: { fontSize: 20, color: colors.text3, fontWeight: '800' },
  dMeta: { fontSize: 12.5, color: colors.text2 },
  dDesc: { fontSize: 13, color: colors.text, lineHeight: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11 },
  dSec: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 6 },
  qCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 4 },
  qBest: { borderColor: colors.success, borderWidth: 1.5 },
  qWon: { borderColor: '#1f9d57', borderWidth: 1.5, backgroundColor: '#f2fbf6' },
  qTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qName: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  qBestTag: { fontSize: 12, fontWeight: '800', color: colors.success, backgroundColor: '#e2f6ea', borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden' },
  qWonTag: { fontSize: 12, fontWeight: '800', color: '#fff', backgroundColor: '#1f9d57', borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden' },
  qPrice: { fontSize: 15, fontWeight: '900', color: colors.text },
  qSub: { fontSize: 12, color: colors.text3 },
  awardBtn: { marginTop: 6, backgroundColor: '#e2f6ea', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  awardTx: { fontSize: 12.5, fontWeight: '800', color: '#1f9d57' },
  delBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fdecec' },
  delTx: { color: colors.error, fontWeight: '800', fontSize: 13 },
});
