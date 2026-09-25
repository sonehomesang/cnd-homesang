import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import TechEarningsDashboard from '@/components/TechEarningsDashboard';
import { ttStatic, useTT } from '@/lib/i18n';
import BottomSheet from '@/components/BottomSheet';
import {
  computeBalance,
  type Credit,
  type Earning,
  requestWithdrawal,
  watchCredits,
  watchEarnings,
  watchWithdrawals,
  type Withdrawal,
} from '@/lib/wallet';
import { codOutstanding, type DeliveryTask, watchMyDeliveryTasks, watchRiderEarnings } from '@/lib/riders';
import { watchBrokerEarnings } from '@/lib/orders';
import { type Referral, watchMyReferrals, watchReferralsToMe } from '@/lib/referrals';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import LoyaltyCard from '@/components/LoyaltyCard';
import {
  customerBalance,
  requestTopup,
  type WalletSpend,
  type WalletTopup,
  watchMySpends,
  watchMyTopups,
} from '@/lib/customerWallet';
import PhotoPicker from '@/components/PhotoPicker';
import AmountInput from '@/components/AmountInput';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const WSTATUS: Record<string, { lao: string; cls: 'ok' | 'wait' | 'no' }> = {
  pending: { lao: ttStatic('wallet', 'ລໍກວດ'), cls: 'wait' },
  completed: { lao: ttStatic('wallet', 'ສຳເລັດ'), cls: 'ok' },
  rejected: { lao: ttStatic('wallet', 'ປະຕິເສດ'), cls: 'no' },
};

function fmt(n: number): string {
  return (n || 0).toLocaleString('en-US');
}
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

export default function WalletScreen() {
  const { fbUser, loading, profile } = useAuth();
  const tt = useTT();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [riderEarnings, setRiderEarnings] = useState<Earning[]>([]);
  const [myTasks, setMyTasks] = useState<DeliveryTask[]>([]);
  const [brokerEarnings, setBrokerEarnings] = useState<Earning[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [refereeRefs, setRefereeRefs] = useState<Referral[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tab, setTab] = useState<'earn' | 'withdraw'>('earn');

  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // customer spendable wallet
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [spends, setSpends] = useState<WalletSpend[]>([]);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmt, setTopupAmt] = useState('');
  const [topupSlip, setTopupSlip] = useState<string[]>([]);
  const cwBalance = customerBalance(topups, spends);
  useEffect(() => { if (fbUser) return watchMyTopups(fbUser.uid, setTopups); }, [fbUser]);
  useEffect(() => { if (fbUser) return watchMySpends(fbUser.uid, setSpends); }, [fbUser]);

  const submitTopup = async () => {
    const amt = Number(String(topupAmt).replace(/[^\d]/g, ''));
    if (!fbUser || !amt) return;
    setBusy(true);
    try {
      await requestTopup(fbUser.uid, amt, topupSlip[0]);
      setTopupOpen(false); setTopupAmt(''); setTopupSlip([]);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setBusy(false); }
  };
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => watchAppSettings(setSettings), []);
  const minWithdrawal = settings?.minWithdrawalKip ?? 0;

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    const u1 = watchEarnings(fbUser.uid, setEarnings);
    const u2 = watchWithdrawals(fbUser.uid, setWithdrawals);
    const u3 = watchCredits(fbUser.uid, setCredits);
    const u4 = watchRiderEarnings(fbUser.uid, setRiderEarnings);
    const u5 = watchMyReferrals(fbUser.uid, setReferrals);
    const u5b = watchReferralsToMe(fbUser.uid, setRefereeRefs);
    const u6 = watchBrokerEarnings(fbUser.uid, setBrokerEarnings);
    const u7 = watchMyDeliveryTasks(fbUser.uid, setMyTasks);
    return () => { u1(); u2(); u3(); u4(); u5(); u5b(); u6(); u7(); };
  }, [fbUser]);

  // referral rewards are DERIVED (like earnings): each successful referral is
  // worth the admin-set reward — no ledger write needed.
  const rewardKip = settings?.referralRewardKip ?? 0;
  const referralEarnings: Earning[] = rewardKip > 0
    ? referrals.map((r) => ({ jobId: `ref-${r.id}`, title: `🎁 ${tt('wallet', 'ແນະນຳເພື່ອນ')}${r.refereeName ? ' · ' + r.refereeName : ''}`, gross: rewardKip, fee: 0, net: rewardKip, at: r.createdAt }))
    : [];
  // welcome reward to the invited new friend — derived the same way (one per
  // referral doc where I am the referee), gated by the admin-set amount.
  const refereeKip = settings?.referralRefereeRewardKip ?? 0;
  const refereeEarnings: Earning[] = refereeKip > 0
    ? refereeRefs.map((r) => ({ jobId: `refee-${r.id}`, title: `🎉 ${tt('wallet', 'ເຄຣດິດ ຕ້ອນຮັບ (ຖືກຊວນ)')}`, gross: refereeKip, fee: 0, net: refereeKip, at: r.createdAt }))
    : [];

  // technician job + rider delivery + referral + broker affiliate earnings pool
  // into one wallet (per uid)
  const allEarnings = [...earnings, ...riderEarnings, ...referralEarnings, ...refereeEarnings, ...brokerEarnings].sort((a, b) => b.at - a.at);
  const rawBal = computeBalance(allEarnings, withdrawals, credits);
  // COD cash a rider still holds is the platform's money — it must not be
  // withdrawable, so it is held back from the available balance until admin
  // confirms the remittance.
  const codHeld = codOutstanding(myTasks);
  const bal = { ...rawBal, available: Math.max(0, rawBal.available - codHeld) };

  const submit = async () => {
    if (!fbUser) return;
    const amt = parseInt(amount.replace(/\D/g, ''), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(tt('wallet','ໃສ່ຈຳນວນເງິນ'));
      return;
    }
    if (minWithdrawal > 0 && amt < minWithdrawal) {
      setError(`${tt('wallet', 'ຖອນຂັ້ນຕ່ຳ')} ${fmt(minWithdrawal)} ${tt('common', 'ກີບ')}`);
      return;
    }
    if (amt > bal.available) {
      setError(tt('wallet','ເກີນຍອດທີ່ຖອນໄດ້'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestWithdrawal(fbUser.uid, amt, bank.trim());
      setAmount('');
      setBank('');
      setModal(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text>{tt('wallet','ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          <View style={styles.cwCard}>
            <Text style={styles.cwLabel}>💳 {tt('wallet', 'ກະເປົາ ເງິນ ຂອງ ຂ້ອຍ')}</Text>
            <Text style={styles.cwBalance}>{fmt(cwBalance)} <Text style={styles.cwUnit}>{tt('wallet', 'ກີບ')}</Text></Text>
            <Pressable style={styles.cwTopupBtn} onPress={() => setTopupOpen(true)}>
              <Text style={styles.cwTopupText}>＋ {tt('wallet', 'ເຕີມ ເງິນ')}</Text>
            </Pressable>
            {topups.some((t) => t.status === 'pending') && (
              <Text style={styles.cwPending}>⏳ {tt('wallet', 'ຄຳ ຂໍ ເຕີມ ລໍ admin ກວດ')}: {topups.filter((t) => t.status === 'pending').length}</Text>
            )}
          </View>
          <LoyaltyCard uid={fbUser.uid} />
          {(profile as any)?.roles?.includes('technician') && (
            <TechEarningsDashboard
              earnings={earnings}
              rating={(profile as any)?.rating}
              reviewCount={(profile as any)?.reviewCount}
            />
          )}
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>{tt('wallet','ຍອດຖອນໄດ້')}</Text>
            <Text style={styles.balBig}>{fmt(bal.available)} ₭</Text>
            <View style={styles.balRow}>
              <Text style={styles.balSub}>{tt('wallet','ລາຍຮັບລວມ')} {fmt(bal.totalEarned)}</Text>
              <Text style={styles.balSub}>{tt('wallet','ລໍຖອນ')} {fmt(bal.pending)}</Text>
            </View>
            {codHeld > 0 && (
              <Text style={styles.codHold}>💵 {tt('wallet','ຫັກໄວ້: ເງິນສົດ COD ຄ້າງນຳສົ່ງ')} {fmt(codHeld)} ₭</Text>
            )}
            <Pressable
              style={[styles.wBtn, bal.available <= 0 && styles.wBtnOff]}
              onPress={() => bal.available > 0 && setModal(true)}>
              <Text style={styles.wBtnText}>{tt('wallet','↗ ຖອນເງິນ')}</Text>
            </Pressable>
          </View>

          <View style={styles.seg}>
            <Pressable style={[styles.segB, tab === 'earn' && styles.segOn]} onPress={() => setTab('earn')}>
              <Text style={[styles.segText, tab === 'earn' && styles.segTextOn]}>{tt('wallet','ລາຍຮັບ')} ({allEarnings.length + credits.length})</Text>
            </Pressable>
            <Pressable style={[styles.segB, tab === 'withdraw' && styles.segOn]} onPress={() => setTab('withdraw')}>
              <Text style={[styles.segText, tab === 'withdraw' && styles.segTextOn]}>{tt('wallet','ຖອນເງິນ')} ({withdrawals.length})</Text>
            </Pressable>
          </View>

          {tab === 'earn' ? (
            allEarnings.length === 0 && credits.length === 0 ? (
              <Text style={styles.empty}>{tt('wallet','ຍັງບໍ່ມີລາຍຮັບ — ຮັບງານ ແລະ ເຮັດໃຫ້ສຳເລັດ')}</Text>
            ) : (
              <>
                {credits.map((c) => (
                  <View key={c.id} style={styles.tx}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txTitle} numberOfLines={1}>⚖️ {c.reason}</Text>
                      <Text style={styles.txSub}>{shortDate(c.at)} · {tt('wallet','ໄກ່ເກ່ຍ')}</Text>
                    </View>
                    <Text style={styles.plus}>+{fmt(c.amount)}</Text>
                  </View>
                ))}
                {allEarnings.map((e) => (
                  <View key={e.jobId} style={styles.tx}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.txSub}>{shortDate(e.at)} · −{fmt(e.fee)} {tt('wallet','ທຳນຽມ')}</Text>
                    </View>
                    <Text style={styles.plus}>+{fmt(e.net)}</Text>
                  </View>
                ))}
              </>
            )
          ) : withdrawals.length === 0 ? (
            <Text style={styles.empty}>{tt('wallet','ຍັງບໍ່ມີການຖອນເງິນ')}</Text>
          ) : (
            withdrawals.map((w) => {
              const st = WSTATUS[w.status] ?? WSTATUS.pending;
              return (
                <View key={w.id} style={styles.tx}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle}>{tt('wallet','ຖອນເງິນ')}</Text>
                    <Text style={styles.txSub}>{shortDate(w.createdAt)}{w.bankInfo ? ` · ${w.bankInfo}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.minus}>−{fmt(w.amount)}</Text>
                    <View style={[styles.pill, styles[st.cls]]}>
                      <Text style={[styles.pillText, styles[`${st.cls}Text` as const]]}>{tt('wallet', st.lao)}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      <BottomSheet visible={modal} onClose={() => setModal(false)}>
          <View>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{tt('wallet','↗ ຖອນເງິນ')}</Text>
              <Pressable onPress={() => setModal(false)}><Text style={styles.close}>✕</Text></Pressable>
            </View>
            <Text style={styles.maxText}>
              {tt('wallet','ຖອນໄດ້ສູງສຸດ')} {fmt(bal.available)} ₭{minWithdrawal > 0 ? ` · ${tt('wallet', 'ຂັ້ນຕ່ຳ')} ${fmt(minWithdrawal)} ₭` : ''}
            </Text>
            <Text style={styles.label}>{tt('wallet','ຈຳນວນເງິນ (ກີບ)')}</Text>
            <AmountInput
              value={amount ? Number(amount) : 0}
              onChangeValue={(n) => setAmount(n ? String(n) : '')}
              placeholder="500,000"
              placeholderTextColor="#999"
              style={styles.input}
            />
            <Text style={styles.label}>{tt('wallet','ບັນຊີ / BCEL One')}</Text>
            <TextInput
              value={bank}
              onChangeText={setBank}
              placeholder={tt('wallet','ຊື່ບັນຊີ + ເລກບັນຊີ')}
              placeholderTextColor="#999"
              style={styles.input}
            />
            {error !== '' && <Text style={styles.err}>❌ {error}</Text>}
            <Pressable style={[styles.submit, busy && styles.wBtnOff]} onPress={submit} disabled={busy}>
              <Text style={styles.submitText}>{busy ? tt('wallet','ກຳລັງສົ່ງ...') : tt('wallet','↗ ສົ່ງຄຳຂໍຖອນ')}</Text>
            </Pressable>
            <Text style={styles.note}>{tt('wallet','admin ກວດ ແລະ ໂອນ → ສະຖານະປ່ຽນເປັນ «ສຳເລັດ»')}</Text>
          </View>
      </BottomSheet>

      <BottomSheet visible={topupOpen} onClose={() => setTopupOpen(false)}>
        <View>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{tt('wallet', '＋ ເຕີມ ເງິນ ເຂົ້າ ກະເປົາ')}</Text>
            <Pressable onPress={() => setTopupOpen(false)}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <Text style={styles.label}>{tt('wallet', 'ຈຳນວນເງິນ (ກີບ)')}</Text>
          <AmountInput
            value={topupAmt ? Number(topupAmt) : 0}
            onChangeValue={(n) => setTopupAmt(n ? String(n) : '')}
            placeholder="100,000"
            placeholderTextColor="#999"
            style={styles.input}
          />
          <Text style={styles.label}>{tt('wallet', '📎 ອັບ ສະລິບ ໂອນ (admin ຈະ ກວດ ກ່ອນ ເຂົ້າ ຍອດ)')}</Text>
          <PhotoPicker photos={topupSlip} onChange={setTopupSlip} pathPrefix={`walletTopups/${fbUser.uid}`} max={1} />
          <Pressable style={[styles.submit, (busy || !topupAmt) && styles.wBtnOff]} onPress={submitTopup} disabled={busy || !topupAmt}>
            <Text style={styles.submitText}>{busy ? tt('wallet', 'ກຳລັງສົ່ງ...') : tt('wallet', 'ສົ່ງ ຄຳ ຂໍ ເຕີມ')}</Text>
          </Pressable>
          <Text style={styles.note}>{tt('wallet', 'ພໍ admin ກວດ ສະລິບ → ຍອດ ຈະ ເຂົ້າ ກະເປົາ ໃຫ້ ໃຊ້ ຈ່າຍ ໄດ້')}</Text>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  cwCard: { backgroundColor: '#0066CC', borderRadius: 16, padding: 18, marginBottom: 12 },
  cwLabel: { color: '#cfe0f5', fontSize: 13, fontWeight: '700' },
  cwBalance: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 4 },
  cwUnit: { fontSize: 14, fontWeight: '700', color: '#cfe0f5' },
  cwTopupBtn: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 },
  cwTopupText: { color: '#0066CC', fontSize: 14, fontWeight: '800' },
  cwPending: { color: '#ffe08a', fontSize: 12, fontWeight: '700', marginTop: 8 },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  balCard: { backgroundColor: '#0066CC', borderRadius: 10, padding: 18 },
  balLabel: { color: '#fff', fontSize: 12, opacity: 0.85 },
  balBig: { color: '#fff', fontSize: 15, fontWeight: '800', marginVertical: 4 },
  balRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  balSub: { color: '#fff', fontSize: 12, opacity: 0.95 },
  codHold: { color: '#fecaca', fontSize: 12, fontWeight: '700', marginTop: 8 },
  wBtn: { backgroundColor: '#fff', borderRadius: 9, padding: 11, alignItems: 'center', marginTop: 14 },
  wBtnOff: { opacity: 0.5 },
  wBtnText: { color: '#0066CC', fontSize: 14, fontWeight: '700' },
  seg: { flexDirection: 'row', gap: 6, marginVertical: 14 },
  segB: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  segText: { fontSize: 12, color: '#4b5563' },
  segTextOn: { color: '#3730a3', fontWeight: '600' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  tx: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  txTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  txSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  plus: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
  minus: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  pillText: { fontSize: 12, fontWeight: '600' },
  ok: { backgroundColor: '#dcfce7' },
  okText: { color: '#166534' },
  wait: { backgroundColor: '#fef9c3' },
  waitText: { color: '#854d0e' },
  no: { backgroundColor: '#fee2e2' },
  noText: { color: '#991b1b' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  close: { fontSize: 15, color: '#6b7280' },
  maxText: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  label: { fontSize: 12, color: '#6b7280', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111' },
  err: { color: '#c00', fontSize: 12, marginTop: 10 },
  submit: { backgroundColor: '#16a34a', borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  note: { fontSize: 12, color: '#9a3412', backgroundColor: '#fff7ed', borderRadius: 8, padding: 8, marginTop: 12 },
});
