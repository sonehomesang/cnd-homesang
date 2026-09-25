import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getRegistry, onRegistry, registerStrings, ttStatic, type TEntry, useCatalog, useTT } from '@/lib/i18n';
import { CND_SEED_STRINGS } from '@/lib/cnd/i18nSeed';
import { migrateCndMojibake } from '@/lib/cnd/i18nMigrate';
import { cnd } from '@/lib/cnd/theme';

/**
 * CND translation / text-correction page. Every CND hardcoded string is wrapped
 * with useTT('cnd…', 'ລາວ') so it AUTO-REGISTERS the moment it renders — this
 * panel lists all registered cnd* strings by category, lets the owner fix the Lao
 * (and add EN/ไทย), and persists overrides to translations/{key} (live everywhere).
 * "🔄 ດຶງ ຄຳ ໃໝ່" persists any freshly-seen source strings so they stay listed.
 */

// page prefix (before the first ".") = the category
const categoryOf = (k: string) => { const i = k.indexOf('.'); return i > 0 ? k.slice(0, i) : 'ອື່ນໆ'; };
const CAT_LABEL: Record<string, string> = {
  cndNav: '🧭 ເມນູ / ນຳທາງ',
  cndStore: '🏪 ໜ້າ ຮ້ານ',
  cndCart: '🛒 ຕະກ້າ',
  cndCheckout: '💳 ຈ່າຍ ເງິນ',
  cndProduct: '📦 ໜ້າ ສິນຄ້າ',
  cndBook: '📅 ຈອງ ຄິວ',
  cndUrgent: '🚨 ຊ່າງ ດ່ວນ',
  cndAdmin: '🧰 ຫຼັງ ບ້ານ',
  cndPos: '🖥️ POS',
  cndOrder: '🧾 ອໍເດີ',
  cndI18n: '🌐 ໜ້າ ແປ ຄຳ',
  cndCommon: '🔤 ຄຳ ຮ່ວມ (ໜ່ວຍ)',
};
const catLabel = (c: string) => { const l = CAT_LABEL[c]; return l ? ttStatic('cndI18n', l) : c; };
const isCnd = (k: string) => k.startsWith('cnd');

export default function CndTranslations() {
  const tt = useTT();                        // this panel's OWN labels are translatable too
  const catalog = useCatalog();
  const registry = getRegistry();
  const [regTick, setRegTick] = useState(0);
  useEffect(() => onRegistry(() => setRegTick((x) => x + 1)), []);
  // list EVERY wrapped CND string up-front (incl. ones behind rare UI branches),
  // so the owner never has to hunt for a string by first triggering its screen.
  useEffect(() => { registerStrings(CND_SEED_STRINGS); }, []);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');       // '' = all cnd pages
  const [syncing, setSyncing] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  // one-time: move any translation saved under an old (Thai-mojibake) key to the
  // cleaned Lao key, so cleaning the source text never drops existing translations.
  const migrate = async () => {
    setMigrating(true);
    try {
      const r = await migrateCndMojibake();
      alert(`${tt('cndI18n', 'ຍ້າຍ ຄຳ ແປ ສຳເລັດ')}: ${r.moved} (${tt('cndI18n', 'ຂ້າມ')} ${r.skipped})`);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setMigrating(false); }
  };

  const allKeys = useMemo(
    () => Array.from(new Set([...Object.keys(catalog), ...registry.keys()])).filter(isCnd).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, registry, regTick],
  );

  const categories = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of allKeys) m[categoryOf(k)] = (m[categoryOf(k)] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allKeys]);

  // Source value (persisted catalog + registered code Lao). Search matches THIS,
  // never in-progress edits, so typing never re-filters the list.
  const srcVal = useCallback((key: string, field: keyof TEntry): string => {
    const c = (catalog[key]?.[field] as string) ?? '';
    if (c) return c;
    if (field === 'lo') return registry.get(key)?.lo ?? '';
    return '';
  }, [catalog, registry]);

  // Lao is written with inconsistent spacing, so match space-INSENSITIVELY: strip
  // all whitespace from both the query and the source before comparing. This makes
  // "ເກັບເງິນປາຍທາງ" find "ເກັບ ເງິນ ປາຍ ທາງ" (the #1 "can't find it" cause).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const keys = useMemo(() => {
    const f = norm(q.trim());
    return allKeys.filter((k) => {
      if (cat && categoryOf(k) !== cat) return false;
      if (!f) return true;
      return norm(k).includes(f) || norm(srcVal(k, 'lo')).includes(f) || norm(srcVal(k, 'en')).includes(f);
    });
  }, [allKeys, q, cat, srcVal]);

  const saveEntry = useCallback(async (key: string, v: TEntry) => {
    await setDoc(doc(db, 'translations', key), { lo: v.lo ?? '', en: v.en ?? '', th: v.th ?? '', updatedAt: Date.now() });
  }, []);

  // Persist freshly-registered source strings so they stay listed (all devices).
  const sync = async (page: string | '*') => {
    setSyncing(page);
    try {
      const writes: Promise<unknown>[] = [];
      registry.forEach((r, key) => {
        if (!isCnd(key) || catalog[key]) return;         // skip already-persisted
        if (page !== '*' && r.page !== page) return;
        writes.push(setDoc(doc(db, 'translations', key), { lo: r.lo, en: '', th: '', updatedAt: Date.now() }));
      });
      await Promise.all(writes);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSyncing(null); }
  };

  // cap how many editable rows render at once — the full CND set is ~750 strings,
  // and mounting every Row (3 inputs each) at once would jank the panel. Pick a
  // category chip or search to narrow; the cap almost never bites once filtered.
  const LIMIT = 150;
  const shownKeys = keys.slice(0, LIMIT);
  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const k of shownKeys) (g[categoryOf(k)] ??= []).push(k);
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shownKeys]);

  return (
    <View>
      <Text style={styles.title}>{tt('cndI18n', '🌐 ແປ / ແກ້ ຄຳ · Translations')}</Text>
      <Text style={styles.sub}>{tt('cndI18n', '💡 ຄຳ ທຸກ ຄຳ ໃນ ແອັບ ຂຶ້ນ ມາ ທີ່ ນີ້ ຄົບ ແລ້ວ — ເລືອກ ໝວດ ຫຼື ພິມ ຄົ້ນຫາ ເພື່ອ ຫາ ຄຳ, ແກ້ ຄຳ ລາວ ທີ່ ຜິດ ໄດ້ ເລີຍ (ຫຼື ເພີ່ມ EN/ไทย). ບັນທຶກ ແລ້ວ ມີ ຜົນ ທັນທີ.')}</Text>

      <TextInput value={q} onChangeText={setQ} placeholder={tt('cndI18n', '🔍 ຄົ້ນຫາ ຄຳ ຫຼື key')} placeholderTextColor={cnd.ink3} style={[styles.input, styles.search]} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        <Chip label={`${tt('cndI18n', 'ທັງໝົດ')} (${allKeys.length})`} on={cat === ''} onPress={() => setCat('')} />
        {categories.map(([c, n]) => <Chip key={c} label={`${catLabel(c)} (${n})`} on={cat === c} onPress={() => setCat(c)} />)}
      </ScrollView>

      <Pressable style={[styles.syncAllBtn, syncing === '*' && styles.syncOff]} disabled={!!syncing} onPress={() => sync('*')}>
        <Text style={styles.syncAllText}>{syncing === '*' ? tt('cndI18n', 'ກຳລັງ ດຶງ...') : tt('cndI18n', '🔄 ດຶງ ຄຳ ໃໝ່ ທັງໝົດ (ບັນທຶກ ໃຫ້ ຄົງທີ່)')}</Text>
      </Pressable>

      <Pressable style={[styles.migrateBtn, migrating && styles.syncOff]} disabled={migrating} onPress={migrate}>
        <Text style={styles.migrateText}>{migrating ? tt('cndI18n', 'ກຳລັງ ຍ້າຍ...') : tt('cndI18n', '🧹 ຍ້າຍ ຄຳ ແປ ຫຼັງ ແກ້ ໄທ ປົນ ລາວ (ກົດ 1 ຄັ້ງ)')}</Text>
      </Pressable>

      <Text style={styles.count}>{keys.length} {tt('cndI18n', 'ຄຳ')}{cat ? ` · ${catLabel(cat)}` : ''}</Text>

      {grouped.map(([c, ks]) => (
        <View key={c}>
          <View style={styles.catHeadRow}>
            <Text style={styles.catHead}>{catLabel(c)} · {ks.length}</Text>
            <Pressable style={[styles.syncBtn, syncing === c && styles.syncOff]} disabled={!!syncing} onPress={() => sync(c)}>
              <Text style={styles.syncText}>{syncing === c ? '...' : tt('cndI18n', '🔄 ດຶງ')}</Text>
            </Pressable>
          </View>
          {ks.map((k) => (
            <Row key={k} k={k} catEntry={catalog[k]} srcLo={registry.get(k)?.lo ?? ''} onSave={saveEntry} />
          ))}
        </View>
      ))}
      {keys.length > LIMIT && <Text style={styles.more}>{tt('cndI18n', 'ສະແດງ')} {LIMIT}/{keys.length} — {tt('cndI18n', 'ພິມ ຄົ້ນຫາ ຫຼື ເລືອກ ໝວດ ເພື່ອ ຫາ ຄຳ ທີ່ ຕ້ອງການ')}</Text>}
      {keys.length === 0 && <Text style={styles.empty}>{q ? tt('cndI18n', '— ບໍ່ ພົບ ຄຳ ທີ່ ຄົ້ນຫາ (ລ້າງ ຊ່ອງ ຄົ້ນຫາ ເພື່ອ ເຫັນ ຄົບ) —') : tt('cndI18n', '— ຍັງ ບໍ່ ພົບ ຄຳ (ເປີດ ໜ້າ ໃນ ແອັບ ກ່ອນ) —')}</Text>}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}><Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text></Pressable>;
}

// One editable row. Edit state is LOCAL so typing re-renders only this row — the
// list stays still until 💾 ບັນທຶກ.
const Row = memo(function Row({ k, catEntry, srcLo, onSave }: { k: string; catEntry?: TEntry; srcLo: string; onSave: (key: string, v: TEntry) => Promise<void>; }) {
  const tt = useTT();
  const pLo = catEntry?.lo ?? srcLo ?? '';
  const pEn = catEntry?.en ?? '';
  const pTh = catEntry?.th ?? '';
  const persisted = !!catEntry;

  const [edit, setEdit] = useState<TEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cur: TEntry = edit ?? { lo: pLo, en: pEn, th: pTh };
  const dirty = !!edit && (cur.lo !== pLo || (cur.en ?? '') !== pEn || (cur.th ?? '') !== pTh);
  const set = (field: keyof TEntry, v: string) => { setSaved(false); setEdit((e) => ({ lo: pLo, en: pEn, th: pTh, ...(e ?? {}), [field]: v })); };

  const doSave = async () => {
    setSaving(true);
    try { await onSave(k, cur); setEdit(null); setSaved(true); }
    catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.keyRow}>
        <Text style={styles.key}>{k}</Text>
        {!persisted && <Text style={styles.newBadge}>{tt('cndI18n', 'ໃໝ່')}</Text>}
        {persisted && <Text style={styles.custom}>{tt('cndI18n', 'ແກ້ ແລ້ວ')}</Text>}
      </View>
      <Field label={tt('cndI18n', 'ລາວ')} value={cur.lo} onChange={(v) => set('lo', v)} />
      <Field label="EN" value={cur.en ?? ''} onChange={(v) => set('en', v)} />
      <Field label={tt('cndI18n', 'ไทย')} value={cur.th ?? ''} onChange={(v) => set('th', v)} />
      <View style={styles.cardFoot}>
        {saved && <Text style={styles.saved}>{tt('cndI18n', '✓ ບັນທຶກແລ້ວ')}</Text>}
        <Pressable style={[styles.saveBtn, !dirty && styles.saveOff]} onPress={doSave} disabled={!dirty || saving}>
          <Text style={styles.saveText}>{saving ? '...' : tt('cndI18n', '💾 ບັນທຶກ')}</Text>
        </Pressable>
      </View>
    </View>
  );
});

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={styles.input} placeholderTextColor={cnd.ink3} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '800', color: cnd.ink },
  sub: { fontSize: 12, color: cnd.ink2, marginTop: 2, marginBottom: 14, lineHeight: 18 },
  search: { marginBottom: 8 },
  catRow: { gap: 6, paddingVertical: 4, marginBottom: 8 },
  chip: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  chipText: { fontSize: 12, color: cnd.ink2 },
  chipTextOn: { color: cnd.white, fontWeight: '700' },
  syncAllBtn: { backgroundColor: cnd.steel, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  syncAllText: { color: cnd.white, fontSize: 12, fontWeight: '800' },
  migrateBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: cnd.brand, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  migrateText: { color: cnd.brandDark, fontSize: 12, fontWeight: '800' },
  count: { fontSize: 12, color: cnd.ink2, marginBottom: 8 },
  more: { fontSize: 12, color: cnd.brandDark, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  catHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, marginBottom: 6 },
  catHead: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  syncBtn: { backgroundColor: cnd.brand, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  syncOff: { opacity: 0.5 },
  syncText: { color: cnd.white, fontSize: 12, fontWeight: '800' },
  card: { borderWidth: 1, borderColor: cnd.line, borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: cnd.surface },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  key: { fontSize: 12, fontWeight: '700', color: cnd.brand, fontFamily: 'monospace' },
  custom: { fontSize: 12, color: cnd.green, backgroundColor: '#e7f6ee', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  newBadge: { fontSize: 12, color: cnd.brandDark, backgroundColor: '#ffedd5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  field: { marginTop: 6 },
  fLabel: { fontSize: 12, color: cnd.ink3, marginBottom: 3 },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 8, padding: 9, fontSize: 14, color: cnd.ink, backgroundColor: cnd.white },
  cardFoot: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 },
  saved: { color: cnd.green, fontSize: 12, fontWeight: '700' },
  saveBtn: { backgroundColor: cnd.brand, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveOff: { opacity: 0.4 },
  saveText: { color: cnd.white, fontWeight: '700', fontSize: 12 },
  empty: { fontSize: 13, color: cnd.ink3, textAlign: 'center', paddingVertical: 20 },
});
