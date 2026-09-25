import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULTS, getRegistry, onRegistry, type TEntry, useCatalog, useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';

// The part of a key before the first "." is its page/section (e.g. profile.*).
const categoryOf = (k: string) => { const i = k.indexOf('.'); return i > 0 ? k.slice(0, i) : 'ອື່ນໆ'; };
const CAT_LABEL: Record<string, string> = {
  // ── ໝວດ ຫຼັງບ້ານ (admin panels) ──
  admAssets: 'ຊັບສິນ', admAudit: 'ບັນທຶກ ການ ກວດ', admBanners: 'ປ້າຍ ໂຄສະນາ',
  admBom: 'ລາຍການ ວັດສະດຸ', admBroadcast: 'ແຈ້ງເຕືອນ ລວມ', admCategories: 'ໝວດ ສິນຄ້າ',
  admClaims: 'ຄືນ ເງິນ', admCms: 'ເນື້ອຫາ ໜ້າ ເວັບ', admCod: 'ເງິນ ສົດ COD',
  admCommerce: 'ສິນຄ້າ-ຮ້ານຄ້າ', admCommission: 'ຄອມມິຊັ່ນ', admCoupons: 'ລະຫັດ ສ່ວນຫຼຸດ',
  admDashboard: 'ໜ້າ ພາບ ລວມ', admData: 'ຂໍ້ມູນ ດິບ', admDisputes: 'ຂໍ້ ຂັດແຍ້ງ',
  admEditor: 'ຕົວ ແກ້ໄຂ', admErrors: 'ບັນທຶກ ຂໍ້ ຜິດພາດ', admFeeRates: 'ອັດຕາ ຄ່າ ທຳນຽມ',
  admFeedRank: 'ຈັດ ລຳດັບ ຟີດ', admFinance: 'ການ ເງິນ', admFollow: 'ການ ຕິດຕາມ',
  admGroups: 'ກຸ່ມ ຜູ້ໃຊ້', admHub: 'ສູນ ລວມ', admIncome: 'ລາຍ ຮັບ',
  admInsp: 'ແບບ ກວດ ກາ', admJobs: 'ວຽກ', admLayout: 'ໂຄງ ໜ້າ',
  admLearn: 'ຄວາມ ຮູ້', admLogi: 'ຂົນ ສົ່ງ', admMemberPricing: 'ລາຄາ ສະມາຊິກ',
  admMemberships: 'ສະມາຊິກ', admOrders: 'ການ ສັ່ງ ຊື້', admOtp: 'OTP/SMS',
  admPaginator: 'ການ ແບ່ງ ໜ້າ', admPay: 'ການ ຈ່າຍ', admPayments: 'ການ ຈ່າຍ ເງິນ',
  admPlatformFees: 'ຄ່າ ບໍລິການ VA', admPrices: 'ລາຄາ ອ້າງອີງ', admProducts: 'ສິນຄ້າ',
  admQuotations: 'ໃບ ສະເໜີ ລາຄາ', admRecordEditor: 'ຕົວ ແກ້ໄຂ ຂໍ້ມູນ', admReviews: 'ຣີວິວ',
  admReviewsModal: 'ຣີວິວ (ປັອບອັບ)', admRider: 'ໄຮເດີ້', admRoles: 'ບົດບາດ & ສິດ',
  admSettings: 'ການ ຕັ້ງຄ່າ', admShare: 'ການ ແບ່ງປັນ', admShops: 'ຮ້ານຄ້າ',
  admSiteConfig: 'ຕັ້ງຄ່າ ເວັບໄຊ', admSites: 'ອາຄານ & ສະຖານທີ່', admSurvey: 'ການ ສຳຫຼວດ',
  admSvc: 'ບໍລິການ', admTranslations: 'ການ ແປ', admUnits: 'ຫົວໜ່ວຍ',
  admUsers: 'ຜູ້ໃຊ້ງານ', admUsersHub: 'ຜູ້ໃຊ້ງານ & ສິດ', admWallet: 'ກະເປົາ ເງິນ',
  admin: 'ຫຼັງບ້ານ',
  // ── ໝວດ ໜ້າ ຜູ້ໃຊ້ (user-facing pages) ──
  becomeTech: 'ມາ ເປັນ ຊ່າງ', bidStatus: 'ສະຖານະ ໃບ ສະເໜີ', billing: 'ໃບ ບິນ',
  bnpl: 'ຜ່ອນ ສິນຄ້າ', book: 'ການ ຈອງ', broker: 'ນາຍໜ້າ', cart: 'ກະຕ່າ',
  catKnowledge: 'ຄວາມ ຮູ້ ໝວດ', chat: 'ແຊັດ', checkout: 'ຊຳລະ ເງິນ', claim: 'ຄືນ ເງິນ',
  cndAccount: 'CND ບັນຊີ', cndAdmin: 'CND ຫຼັງບ້ານ',cndBook: 'CND ຈອງ', cndCart: 'CND ກະຕ່າ',
  cndCheckout: 'CND ຊຳລະ', cndCommon: 'CND ທົ່ວໄປ', cndNav: 'CND ເມນູ',
  cndOrder: 'CND ສັ່ງ ຊື້', cndPos: 'CND POS', cndProduct: 'CND ສິນຄ້າ',
  cndStore: 'CND ໜ້າ ຮ້ານ', cndUrgent: 'CND ດ່ວນ', common: 'ທົ່ວໄປ',
  community: 'ຊຸມຊົນ', communityPost: 'ໂພສ ຊຸມຊົນ', company: 'ບໍລິສັດ',
  compare: 'ປຽບທຽບ', costType: 'ປະເພດ ຄ່າໃຊ້ຈ່າຍ', deliveryTask: 'ວຽກ ຈັດ ສົ່ງ',
  dispute: 'ຂໍ້ ຂັດແຍ້ງ', disputeStatus: 'ສະຖານະ ຂໍ້ ຂັດແຍ້ງ', drawer: 'ເມນູ ຂ້າງ',
  explore: 'ຄົ້ນຫາ', favorites: 'ລາຍການ ມັກ', feed: 'ຟີດ', findtech: 'ຫາ ຊ່າງ',
  flash: 'ຂາຍ ດ່ວນ', footer: 'ສ່ວນ ທ້າຍ', forgot: 'ລືມ ລະຫັດ', groupBuy: 'ຊື້ ເປັນ ກຸ່ມ',
  handover: 'ສົ່ງ ມອບ ວຽກ', history: 'ປະຫວັດ', home: 'ໜ້າ ຫຼັກ', iconPicker: 'ເລືອກ ໄອຄອນ',
  invoice: 'ໃບ ບິນ', jobDetail: 'ລາຍລະອຽດ ວຽກ', jobStatus: 'ສະຖານະ ວຽກ',
  jobTimeline: 'ໄທມ໌ໄລນ໌ ວຽກ', landing: 'ໜ້າ ຕ້ອນຮັບ', learn: 'ຄວາມ ຮູ້', legal: 'ກົດໝາຍ',
  liveMap: 'ແຜນທີ່ ສົດ', locPicker: 'ເລືອກ ທີ່ຕັ້ງ', locationMap: 'ແຜນທີ່', loyalty: 'ສະສົມ ແຕ້ມ',
  maint: 'ບຳລຸງ ຮັກສາ', maintenance: 'ບຳລຸງ ຮັກສາ', map: 'ແຜນທີ່', mapPicker: 'ເລືອກ ແຜນທີ່',
  membership: 'ສະມາຊິກ', messages: 'ຂໍ້ຄວາມ', mk: 'ການ ຕະຫຼາດ', mock: 'ຕົວຢ່າງ',
  myJobs: 'ວຽກ ຂອງ ຂ້ອຍ', myProperties: 'ອາຄານ ຂອງ ຂ້ອຍ', myWork: 'ວຽກ ຂອງ ຂ້ອຍ',
  notifications: 'ການ ແຈ້ງເຕືອນ', onboarding: 'ເລີ່ມ ຕົ້ນ', orderStatus: 'ສະຖານະ ຄຳ ສັ່ງ',
  orderTimeline: 'ໄທມ໌ໄລນ໌ ຄຳ ສັ່ງ', orders: 'ຄຳ ສັ່ງ ຊື້', payment: 'ການ ຈ່າຍ ເງິນ',
  pending: 'ລໍ ຖ້າ', photo: 'ຮູບ', pillar: 'ເສົາ ຫຼັກ', portfolio: 'ຜົນ ງານ',
  postJob: 'ລົງ ວຽກ', priceKind: 'ປະເພດ ລາຄາ', product: 'ສິນຄ້າ', profile: 'ໂປຣໄຟລ໌',
  profileMenu: 'ເມນູ ໂປຣໄຟລ໌', profileScreen: 'ໜ້າ ໂປຣໄຟລ໌', profileSetup: 'ຕັ້ງ ໂປຣໄຟລ໌',
  quick: 'ທາງ ລັດ', quoteBuilder: 'ສ້າງ ໃບ ສະເໜີ', quoteDoc: 'ໃບ ສະເໜີ ລາຄາ',
  quoteHistory: 'ປະຫວັດ ໃບ ສະເໜີ', rating: 'ການ ໃຫ້ ຄະແນນ', reels: 'ວີດີໂອ ສັ້ນ',
  referral: 'ແນະນຳ ເພື່ອນ', rider: 'ໄຮເດີ້', riderPromo: 'ໂປຣໂມ ໄຮເດີ້',
  riderSection: 'ພາກ ໄຮເດີ້', roleAction: 'ການ ກະທຳ ບົດບາດ', search: 'ຄົ້ນຫາ',
  setPassword: 'ຕັ້ງ ລະຫັດ', settings: 'ການ ຕັ້ງຄ່າ', share: 'ການ ແບ່ງປັນ',
  shop: 'ຮ້ານຄ້າ', shopIncome: 'ລາຍ ຮັບ ຮ້ານ', shopManage: 'ຈັດການ ຮ້ານ',
  shopOrders: 'ຄຳ ສັ່ງ ຮ້ານ', shopPage: 'ໜ້າ ຮ້ານ', shopTab: 'ແຖບ ຮ້ານ', shops: 'ຮ້ານຄ້າ',
  showcase: 'ໂຊວ໌ເຄສ', signature: 'ລາຍເຊັນ', signin: 'ເຂົ້າ ລະບົບ', signup: 'ສະໝັກ',
  siteDossier: 'ແຟ້ມ ອາຄານ', tab: 'ແຖບ ລຸ່ມ', techEarn: 'ລາຍ ຮັບ ຊ່າງ',
  techQuiz: 'ຂໍ້ ສອບ ຊ່າງ', terms: 'ເງື່ອນໄຂ', time: 'ເວລາ', userProfile: 'ໂປຣໄຟລ໌ ຜູ້ໃຊ້',
  vendors: 'ຜູ້ ສະໜອງ', wallet: 'ກະເປົາ ເງິນ',
};
const catLabel = (c: string) => CAT_LABEL[c] ?? c;

export default function TranslationsPanel() {
  const { canCreate, canEdit } = useSectionPerms('translations');
  const tt = useTT();
  const catalog = useCatalog();
  const registry = getRegistry();
  const [regTick, setRegTick] = useState(0);
  useEffect(() => onRegistry(() => setRegTick((x) => x + 1)), []);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState(''); // '' = all pages
  const [added, setAdded] = useState<string[]>([]); // manually-added keys (not yet in catalog/registry)
  const [syncing, setSyncing] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');

  // horizontal-scroll overflow hints for the category chip row
  const [contentW, setContentW] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [sx, setSx] = useState(0);
  const moreRight = contentW - boxW - sx > 6;
  const moreLeft = sx > 6;

  const allKeys = useMemo(
    () => Array.from(new Set([...Object.keys(catalog), ...registry.keys(), ...added])).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, registry, regTick, added],
  );

  const categories = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of allKeys) m[categoryOf(k)] = (m[categoryOf(k)] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allKeys]);

  // Source value only (persisted catalog + registered code Lao). Search matches
  // THIS — never the in-progress edits — so typing never re-filters the list.
  const srcVal = useCallback((key: string, field: keyof TEntry): string => {
    const c = (catalog[key]?.[field] as string) ?? '';
    if (c) return c;
    if (field === 'lo') return registry.get(key)?.lo ?? ''; // source Lao from code
    return '';
  }, [catalog, registry]);

  const keys = useMemo(() => {
    const f = q.trim().toLowerCase();
    return allKeys.filter((k) => {
      if (cat && categoryOf(k) !== cat) return false;
      if (!f) return true;
      return k.toLowerCase().includes(f) ||
        srcVal(k, 'lo').toLowerCase().includes(f) ||
        srcVal(k, 'en').toLowerCase().includes(f);
    });
  }, [allKeys, q, cat, srcVal]);

  // Persist a single edited entry. Stable identity so memoized rows never
  // re-render just because the parent did.
  const saveEntry = useCallback(async (key: string, v: TEntry) => {
    await setDoc(doc(db, 'translations', key), {
      lo: v.lo ?? '', en: v.en ?? '', th: v.th ?? '', updatedAt: Date.now(),
    });
  }, []);

  // persist a page's newly-registered source strings so they stay listed even
  // without re-visiting the page (and for other admins).
  const syncPage = async (page: string) => {
    setSyncing(page);
    try {
      const writes: Promise<unknown>[] = [];
      registry.forEach((r, key) => {
        if (r.page !== page || catalog[key]) return; // skip if already persisted
        writes.push(setDoc(doc(db, 'translations', key), { lo: r.lo, en: '', th: '', updatedAt: Date.now() }));
      });
      await Promise.all(writes);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSyncing(null);
    }
  };

  // persist EVERY registered source string at once (so the list is the same on
  // all devices — otherwise each device only lists what it has rendered).
  const syncAll = async () => {
    setSyncing('*');
    try {
      const writes: Promise<unknown>[] = [];
      registry.forEach((r, key) => {
        if (catalog[key]) return;
        writes.push(setDoc(doc(db, 'translations', key), { lo: r.lo, en: '', th: '', updatedAt: Date.now() }));
      });
      await Promise.all(writes);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSyncing(null);
    }
  };

  const addKey = () => {
    const k = newKey.trim();
    if (!k) return;
    setAdded((p) => (p.includes(k) ? p : [...p, k]));
    setNewKey(''); setQ(k); setCat('');
  };

  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const k of keys) (g[categoryOf(k)] ??= []).push(k);
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [keys]);

  return (
    <View>
      <Text style={styles.title}>{tt('admTranslations', '🌐 ການແປ · Translations')}</Text>
      <Text style={styles.sub}>{tt('admTranslations', '💡 ເປີດ ໜ້າ ຕ່າງໆ ໃນ ແອັບ → ຄຳ ຂອງ ໜ້າ ນັ້ນ ຂຶ້ນ ມາ ທີ່ ນີ້ → ກົດ 🔄 ອັບເດດ ຕໍ່ ໝວດ ເພື່ອ ບັນທຶກ ໄວ້ · ບັນທຶກ ຄຳ ແປ ແລ້ວ ມີ ຜົນ ທັນທີ.')}</Text>

      <TextInput value={q} onChangeText={setQ} placeholder={tt('admTranslations', '🔍 ຄົ້ນຫາ key ຫຼື ຂໍ້ຄວາມ')} placeholderTextColor="#999" style={[styles.input, styles.search]} />

      <View style={styles.catWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setSx(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContentW(w)}
          contentContainerStyle={styles.catRow}>
          <Chip label={`${tt('admTranslations', 'ທັງໝົດ')} (${allKeys.length})`} on={cat === ''} onPress={() => setCat('')} />
          {categories.map(([c, n]) => (
            <Chip key={c} label={`${tt('admTranslations', catLabel(c))} (${n})`} on={cat === c} onPress={() => setCat(c)} />
          ))}
        </ScrollView>
        {moreLeft && <View style={[styles.chint, styles.chintL]} pointerEvents="none"><Text style={styles.chintTx}>‹</Text></View>}
        {moreRight && <View style={[styles.chint, styles.chintR]} pointerEvents="none"><Text style={styles.chintTx}>›</Text></View>}
      </View>

      {canCreate && (
        <Pressable style={[styles.syncAllBtn, syncing === '*' && styles.syncOff]} disabled={syncing === '*'} onPress={syncAll}>
          <Text style={styles.syncAllText}>{syncing === '*' ? tt('admTranslations', 'ກຳລັງ ບັນທຶກ...') : tt('admTranslations', '🔄 ອັບເດດ ທັງໝົດ (ບັນທຶກ ຄຳ ທີ່ ເຫັນ ໄວ້ ໃຫ້ ຄົງທີ່)')}</Text>
        </Pressable>
      )}
      {canCreate && (
        <View style={styles.addRow}>
          <TextInput value={newKey} onChangeText={setNewKey} placeholder={tt('admTranslations', 'key ໃໝ່ (ເຊັ່ນ home.tagline)')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
          <Pressable style={styles.addBtn} onPress={addKey}><Text style={styles.addBtnText}>{tt('admTranslations', '+ ເພີ່ມ')}</Text></Pressable>
        </View>
      )}

      <Text style={styles.count}>{keys.length} key{cat ? ` · ${tt('admTranslations', catLabel(cat))}` : ''}</Text>

      {grouped.map(([c, ks]) => (
        <View key={c}>
          <View style={styles.catHeadRow}>
            <Text style={styles.catHead}>{tt('admTranslations', catLabel(c))} · {ks.length}</Text>
            {canCreate && (
              <Pressable style={[styles.syncBtn, syncing === c && styles.syncOff]} disabled={syncing === c} onPress={() => syncPage(c)}>
                <Text style={styles.syncText}>{syncing === c ? '...' : tt('admTranslations', '🔄 ອັບເດດ')}</Text>
              </Pressable>
            )}
          </View>
          {ks.map((k) => (
            <Row
              key={k}
              k={k}
              catEntry={catalog[k]}
              srcLo={registry.get(k)?.lo ?? ''}
              isDefault={!!DEFAULTS[k]}
              canEdit={canEdit}
              onSave={saveEntry}
            />
          ))}
        </View>
      ))}
      {keys.length === 0 && <Text style={styles.empty}>{tt('admTranslations', '— ບໍ່ ພົບ (ເປີດ ໜ້າ ໃນ ແອັບ ກ່ອນ) —')}</Text>}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// One editable translation row. Edit state lives HERE (local), so typing
// re-renders only this row — the parent's search/filter/grouping never recompute
// mid-edit, and the list stays perfectly still until you press 💾 ບັນທຶກ.
const Row = memo(function Row({
  k, catEntry, srcLo, isDefault, canEdit, onSave,
}: {
  k: string;
  catEntry?: TEntry;
  srcLo: string;
  isDefault: boolean;
  canEdit: boolean;
  onSave: (key: string, v: TEntry) => Promise<void>;
}) {
  const tt = useTT();
  const pLo = catEntry?.lo ?? srcLo ?? '';
  const pEn = catEntry?.en ?? '';
  const pTh = catEntry?.th ?? '';
  const persisted = !!catEntry;

  const [edit, setEdit] = useState<TEntry | null>(null); // null = mirror persisted (not editing)
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cur: TEntry = edit ?? { lo: pLo, en: pEn, th: pTh };
  const dirty = !!edit && (cur.lo !== pLo || (cur.en ?? '') !== pEn || (cur.th ?? '') !== pTh);

  const set = (field: keyof TEntry, v: string) => {
    setSaved(false);
    setEdit((e) => ({ lo: pLo, en: pEn, th: pTh, ...(e ?? {}), [field]: v }));
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await onSave(k, cur);
      setEdit(null);
      setSaved(true);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.keyRow}>
        <Text style={styles.key}>{k}</Text>
        {!persisted && <Text style={styles.newBadge}>{tt('admTranslations', 'ໃໝ່')}</Text>}
        {persisted && !isDefault && <Text style={styles.custom}>custom</Text>}
      </View>
      <Field label={tt('admTranslations', 'ລາວ')} value={cur.lo} onChange={(v) => set('lo', v)} />
      <Field label="EN" value={cur.en ?? ''} onChange={(v) => set('en', v)} />
      <Field label="ไทย" value={cur.th ?? ''} onChange={(v) => set('th', v)} />
      <View style={styles.cardFoot}>
        {saved && <Text style={styles.saved}>{tt('admTranslations', '✓ ບັນທຶກແລ້ວ')}</Text>}
        {canEdit && <Pressable
          style={[styles.saveBtn, !dirty && styles.saveOff]}
          onPress={doSave}
          disabled={!dirty || saving}>
          <Text style={styles.saveText}>{saving ? '...' : tt('admTranslations', '💾 ບັນທຶກ')}</Text>
        </Pressable>}
      </View>
    </View>
  );
});

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input} placeholderTextColor="#999" />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14, lineHeight: 18 },
  search: { marginBottom: 8 },
  catWrap: { position: 'relative', marginBottom: 8 },
  catRow: { gap: 6, paddingVertical: 4, paddingRight: 22 },
  chint: { position: 'absolute', top: 0, bottom: 0, width: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  chintL: { left: 0 },
  chintR: { right: 0 },
  chintTx: { fontSize: 15, color: '#0066CC', fontWeight: '900' },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  syncAllBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  syncAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  count: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  catHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, marginBottom: 6 },
  catHead: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  syncBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  syncOff: { opacity: 0.5 },
  syncText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 10 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  key: { fontSize: 12, fontWeight: '700', color: '#0066CC', fontFamily: 'monospace' },
  custom: { fontSize: 12, color: '#7c3aed', backgroundColor: '#f3e8ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  newBadge: { fontSize: 12, color: '#ea580c', backgroundColor: '#ffedd5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  field: { marginTop: 6 },
  fLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 3 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  cardFoot: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 },
  saved: { color: '#16a34a', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  empty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
