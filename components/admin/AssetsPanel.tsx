import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { groupThousands } from '@/lib/format';
import { colors, font, radius } from '@/lib/theme';
import DynamicFields from '@/components/DynamicFields';
import { watchAllSites, type Site } from '@/lib/sites';
import { watchSiteConfig, DEFAULT_SITE_CONFIG, type AssetCategory, type SiteConfig } from '@/lib/siteConfig';
import {
  addAssetHistory,
  computeScrap,
  createAsset,
  deleteAsset,
  updateAsset,
  warrantyStatus,
  watchAssetsForSite,
  HISTORY_META,
  newHistoryId,
  newParamId,
  type Asset,
  type AssetHistoryType,
  type AssetParam,
  type ScrapMode,
} from '@/lib/assets';

function parseDate(s: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}
function fmt(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString('lo-LA'); } catch { return new Date(ms).toISOString().slice(0, 10); }
}

export default function AssetsPanel() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [siteId, setSiteId] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [editing, setEditing] = useState<Asset | 'new' | null>(null);

  useEffect(() => watchAllSites(setSites), []);
  useEffect(() => watchSiteConfig(setCfg), []);
  useEffect(() => { if (siteId) return watchAssetsForSite(siteId, setAssets); setAssets([]); }, [siteId]);

  const site = sites?.find((s) => s.id === siteId);
  const adminName = profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'admin';

  if (sites === null) return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.h1}>🔩 {tt('admAssets', 'ທະບຽນ ຊັບສິນ / ເຄື່ອງໃຊ້')}</Text>
      <Text style={styles.sub}>{tt('admAssets', 'ເລືອກ ສະຖານທີ່ ກ່ອນ → ເພີ່ມ ເຄື່ອງ + ບັນທຶກ ປະຫວັດ ຕິດຕັ້ງ/ບຳລຸງ/ສ້ອມ')}</Text>

      {sites.length === 0 ? (
        <Text style={styles.empty}>{tt('admAssets', 'ຍັງ ບໍ່ ມີ ສະຖານທີ່ — ສ້າງ ຢູ່ ແທັບ "ອາຄານ & ຊັບສິນ → ສະຖານທີ່" ກ່ອນ')}</Text>
      ) : (
        <View style={styles.chips}>
          {sites.map((s) => {
            const on = s.id === siteId;
            return (
              <Pressable key={s.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setSiteId(on ? '' : s.id)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>🏠 {s.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {site && (
        <>
          <View style={styles.head}>
            <Text style={styles.secTitle}>{tt('admAssets', 'ຊັບສິນ ໃນ')} {site.name} ({assets.length})</Text>
            <Pressable style={styles.addBtn} onPress={() => setEditing('new')}><Text style={styles.addBtnText}>＋ {tt('admAssets', 'ເພີ່ມ ຊັບສິນ')}</Text></Pressable>
          </View>
          {assets.length === 0 && <Text style={styles.empty}>{tt('admAssets', 'ຍັງ ບໍ່ ມີ ຊັບສິນ')}</Text>}
          {assets.map((a) => {
            const cat = cfg.assetCategories.find((c) => c.key === a.category);
            const w = warrantyStatus(a);
            return (
              <Pressable key={a.id} style={styles.card} onPress={() => setEditing(a)}>
                <Text style={styles.cardTitle}>{cat?.icon ? cat.icon + ' ' : ''}{[a.brand, a.model].filter(Boolean).join(' ') || cat?.label}</Text>
                <Text style={styles.cardMeta}>{cat?.label}{a.serial ? ` · ${a.serial}` : ''}{a.roomName ? ` · ${a.roomName}` : ''}</Text>
                <View style={styles.badges}>
                  {w.state !== 'none' && <Text style={[styles.badge, w.state === 'active' ? styles.badgeOk : styles.badgeExp]}>🛡️ {w.state === 'active' ? tt('admAssets', 'ຮັບປະກັນ') : tt('admAssets', 'ໝົດ ຮັບປະກັນ')}</Text>}
                  {a.history.length > 0 && <Text style={styles.badge}>📜 {a.history.length}</Text>}
                  {typeof a.scrapValue === 'number' && <Text style={styles.badge}>💰 {a.scrapValue.toLocaleString()}</Text>}
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {editing && site && (
        <AssetEditor
          asset={editing === 'new' ? null : editing}
          site={site}
          cfg={cfg}
          uid={fbUser?.uid}
          byName={adminName}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

/** Seed instance parameters from a category's factory-spec template. */
function templateParams(cat?: AssetCategory): AssetParam[] {
  return (cat?.paramTemplate ?? []).map((t) => ({ id: newParamId(), label: t.label, unit: t.unit, factory: t.factory, install: undefined }));
}

export function AssetEditor({ asset, site, cfg, uid, byName, onClose }: { asset: Asset | null; site: Site; cfg: SiteConfig; uid?: string; byName: string; onClose: () => void }) {
  const tt = useTT();
  const [category, setCategory] = useState(asset?.category ?? cfg.assetCategories[0]?.key ?? 'other');
  const [roomId, setRoomId] = useState(asset?.roomId ?? '');
  const [brand, setBrand] = useState(asset?.brand ?? '');
  const [model, setModel] = useState(asset?.model ?? '');
  const [serial, setSerial] = useState(asset?.serial ?? '');
  const [installedAt, setInstalledAt] = useState(asset?.installedAt ? fmt(asset.installedAt) : '');
  const [installedBy, setInstalledBy] = useState(asset?.installedBy ?? '');
  const [warrantyMonths, setWarrantyMonths] = useState(asset?.warrantyMonths ? String(asset.warrantyMonths) : '');
  const [fields, setFields] = useState<Record<string, any>>(asset?.fields ?? {});
  const [parameters, setParameters] = useState<AssetParam[]>(asset?.parameters ?? templateParams(cfg.assetCategories.find((c) => c.key === (asset?.category ?? cfg.assetCategories[0]?.key))));
  const [scrapMode, setScrapMode] = useState<ScrapMode>(asset?.scrapMode ?? 'manual');
  const [scrapValue, setScrapValue] = useState(asset?.scrapValue ? String(asset.scrapValue) : '');
  const [scrapMaterial, setScrapMaterial] = useState(asset?.scrapMaterial ?? '');
  const [scrapWeight, setScrapWeight] = useState(asset?.scrapWeightKg ? String(asset.scrapWeightKg) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // history add-form
  const [hType, setHType] = useState<AssetHistoryType>('maintain');
  const [hDate, setHDate] = useState('');
  const [hNote, setHNote] = useState('');
  const [hJob, setHJob] = useState('');

  const refScrap = useMemo(
    () => computeScrap({ mode: 'reference', material: scrapMaterial, weightKg: scrapWeight ? Number(scrapWeight) : undefined }, cfg.scrapRates),
    [scrapMaterial, scrapWeight, cfg.scrapRates],
  );
  const effScrap = scrapMode === 'reference' ? refScrap : (scrapValue ? Number(scrapValue) : undefined);
  const room = site.rooms.find((r) => r.id === roomId);
  const catObj = cfg.assetCategories.find((c) => c.key === category);
  const catFields = catObj?.fields ?? [];
  const [readings, setReadings] = useState<Record<string, string>>({});

  // seed the parameter baseline from the category template whenever the current
  // list is empty (new asset, category switch, or an asset created before the
  // template existed) — never overwrites already-recorded parameters
  useEffect(() => {
    setParameters((cur) => (cur.length === 0 ? templateParams(catObj) : cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const base = {
        siteId: site.id, siteName: site.name, roomId: roomId || undefined, roomName: room?.name || undefined,
        ownerId: site.ownerId, sharedWith: site.sharedWith, category, brand: brand.trim() || undefined,
        model: model.trim() || undefined, serial: serial.trim() || undefined, installedAt: parseDate(installedAt),
        installedBy: installedBy.trim() || undefined, warrantyMonths: warrantyMonths ? Number(warrantyMonths) : undefined,
        fields, parameters,
        scrapMode, scrapValue: effScrap, scrapMaterial: scrapMode === 'reference' ? (scrapMaterial || undefined) : undefined,
        scrapWeightKg: scrapMode === 'reference' && scrapWeight ? Number(scrapWeight) : undefined,
      };
      if (asset) await updateAsset(asset.id, base as any);
      else await createAsset({ ...base, createdBy: uid, createdByName: byName } as any);
      onClose();
    } catch (e: any) { setErr(e?.message ?? String(e)); setSaving(false); }
  };

  const addHistory = async () => {
    if (!asset) { setErr(tt('admAssets', 'ບັນທຶກ ຊັບສິນ ກ່ອນ ຈຶ່ງ ເພີ່ມ ປະຫວັດ')); return; }
    const rd = parameters.map((p) => ({ label: p.label, value: (readings[p.id] ?? '').trim() })).filter((r) => r.value);
    const entry = { id: newHistoryId(), type: hType, date: parseDate(hDate) ?? Date.now(), note: hNote.trim() || undefined, jobId: hJob.trim() || undefined, by: uid, byName, readings: rd.length ? rd : undefined };
    try { await addAssetHistory(asset.id, entry as any); setHNote(''); setHDate(''); setHJob(''); setReadings({}); } catch (e: any) { setErr(e?.message ?? String(e)); }
  };

  const remove = async () => {
    if (!asset) return;
    if (typeof window !== 'undefined' && !window.confirm(tt('admAssets', 'ລຶບ ຊັບສິນ ນີ້?'))) return;
    setSaving(true);
    try { await deleteAsset(asset.id); onClose(); } catch (e: any) { setErr(e?.message ?? String(e)); setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHd}>
            <Text style={styles.sheetTitle}>{asset ? tt('admAssets', 'ແກ້ໄຂ ຊັບສິນ') : tt('admAssets', 'ເພີ່ມ ຊັບສິນ')}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            <Text style={styles.label}>{tt('admAssets', 'ປະເພດ')}</Text>
            <View style={styles.chips}>
              {cfg.assetCategories.map((c) => {
                const on = category === c.key;
                return <Pressable key={c.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setCategory(c.key)}><Text style={[styles.chipText, on && styles.chipTextOn]}>{c.icon ? c.icon + ' ' : ''}{c.label}</Text></Pressable>;
              })}
            </View>

            {site.rooms.length > 0 && (
              <>
                <Text style={styles.label}>{tt('admAssets', 'ຫ້ອງ (ບໍ່ ບັງຄັບ)')}</Text>
                <View style={styles.chips}>
                  <Pressable style={[styles.chip, !roomId && styles.chipOn]} onPress={() => setRoomId('')}><Text style={[styles.chipText, !roomId && styles.chipTextOn]}>—</Text></Pressable>
                  {site.rooms.map((r) => {
                    const on = r.id === roomId;
                    return <Pressable key={r.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setRoomId(r.id)}><Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name || tt('admAssets', 'ຫ້ອງ')}</Text></Pressable>;
                  })}
                </View>
              </>
            )}

            <Text style={styles.label}>{tt('admAssets', 'ຍີ່ຫໍ້')}</Text>
            <TextInput value={brand} onChangeText={setBrand} placeholder="Daikin" placeholderTextColor="#999" style={styles.input} />
            <Text style={styles.label}>{tt('admAssets', 'ລຸ່ນ')}</Text>
            <TextInput value={model} onChangeText={setModel} placeholder="FTKC24" placeholderTextColor="#999" style={styles.input} />
            <Text style={styles.label}>{tt('admAssets', 'ຊີຣຽວ / ນໍ້າເບີ')}</Text>
            <TextInput value={serial} onChangeText={setSerial} placeholder="SN-…" placeholderTextColor="#999" style={styles.input} />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{tt('admAssets', 'ຕິດຕັ້ງ (ປປປປ-ດດ-ວວ)')}</Text>
                <TextInput value={installedAt} onChangeText={setInstalledAt} placeholder="2026-01-03" placeholderTextColor="#999" style={styles.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{tt('admAssets', 'ຮັບປະກັນ (ເດືອນ)')}</Text>
                <TextInput value={warrantyMonths} onChangeText={setWarrantyMonths} placeholder="12" placeholderTextColor="#999" keyboardType="numeric" style={styles.input} />
              </View>
            </View>
            <Text style={styles.label}>{tt('admAssets', 'ຕິດຕັ້ງ ໂດຍ')}</Text>
            <TextInput value={installedBy} onChangeText={setInstalledBy} placeholder={tt('admAssets', 'ຊື່ ຊ່າງ / ຮ້ານ')} placeholderTextColor="#999" style={styles.input} />

            {(catFields.length > 0 || cfg.assetFields.length > 0) && (
              <View style={styles.secCard}>
                <Text style={styles.secTitle}>{tt('admAssets', 'ຂໍ້ມູນ ເຄື່ອງ')} {catObj?.icon ? `· ${catObj.icon} ${catObj.label}` : ''}</Text>
                {catFields.length > 0 && <DynamicFields fields={catFields} values={fields} onChange={setFields} />}
                {cfg.assetFields.length > 0 && <DynamicFields fields={cfg.assetFields} values={fields} onChange={setFields} />}
              </View>
            )}

            {/* parameters — factory baseline vs install value */}
            {parameters.length > 0 && (
              <View style={styles.secCard}>
                <Text style={styles.secTitle}>📐 {tt('admAssets', 'ຄ່າ ພາຣາມິເຕີ (ໂຮງງານ ທຽບ ຕິດຕັ້ງ)')}</Text>
                <View style={styles.pHeadRow}>
                  <Text style={[styles.pCell, styles.pLabel]}>{tt('admAssets', 'ພາຣາມິເຕີ')}</Text>
                  <Text style={[styles.pCell, styles.pHead]}>{tt('admAssets', 'ໂຮງງານ')}</Text>
                  <Text style={[styles.pCell, styles.pHead]}>{tt('admAssets', 'ຕິດຕັ້ງ')}</Text>
                </View>
                {parameters.map((p, i) => (
                  <View key={p.id} style={styles.pRow}>
                    <Text style={[styles.pCell, styles.pLabel]}>{p.label}{p.unit ? ` (${p.unit})` : ''}</Text>
                    <Text style={[styles.pCell, styles.pFactory]}>{p.factory ?? '—'}</Text>
                    <TextInput
                      value={p.install ?? ''}
                      onChangeText={(t) => setParameters((ps) => ps.map((x, idx) => idx === i ? { ...x, install: t } : x))}
                      placeholder="—" placeholderTextColor="#999" style={styles.pInput}
                    />
                  </View>
                ))}
                <Text style={styles.hintSmall}>{tt('admAssets', 'ຄ່າ ໂຮງງານ ຈາກ template ຕໍ່ ປະເພດ · ຊ່າງ ຕື່ມ ຄ່າ ຕິດຕັ້ງ = baseline')}</Text>
              </View>
            )}

            {/* scrap */}
            <View style={styles.secCard}>
              <Text style={styles.secTitle}>💰 {tt('admAssets', 'ຕີ ລາຄາ ເສດ')}</Text>
              <View style={[styles.chips, { marginTop: 6 }]}>
                <Pressable style={[styles.chip, scrapMode === 'manual' && styles.chipOn]} onPress={() => setScrapMode('manual')}><Text style={[styles.chipText, scrapMode === 'manual' && styles.chipTextOn]}>✍️ {tt('admAssets', 'ໃສ່ ເອງ')}</Text></Pressable>
                <Pressable style={[styles.chip, scrapMode === 'reference' && styles.chipOn]} onPress={() => setScrapMode('reference')}><Text style={[styles.chipText, scrapMode === 'reference' && styles.chipTextOn]}>📊 {tt('admAssets', 'ອ້າງ ອີງ')}</Text></Pressable>
              </View>
              {scrapMode === 'manual' ? (
                <TextInput value={groupThousands(scrapValue)} onChangeText={(t) => setScrapValue(t.replace(/\D/g, ''))} placeholder="450,000" placeholderTextColor="#999" keyboardType="numeric" style={[styles.input, { marginTop: 8 }]} />
              ) : (
                <>
                  <View style={[styles.chips, { marginTop: 8 }]}>
                    {cfg.scrapRates.map((r) => {
                      const on = scrapMaterial === r.material;
                      return <Pressable key={r.material} style={[styles.chip, on && styles.chipOn]} onPress={() => setScrapMaterial(r.material)}><Text style={[styles.chipText, on && styles.chipTextOn]}>{r.material} · {r.ratePerKg.toLocaleString()}/kg</Text></Pressable>;
                    })}
                  </View>
                  <TextInput value={scrapWeight} onChangeText={setScrapWeight} placeholder={tt('admAssets', 'ນ້ຳໜັກ (kg)')} placeholderTextColor="#999" keyboardType="numeric" style={[styles.input, { marginTop: 8 }]} />
                </>
              )}
              {effScrap !== undefined && <Text style={styles.scrapOut}>💰 ~{effScrap.toLocaleString()} {tt('common', 'ກີບ')}</Text>}
            </View>

            {/* history */}
            {asset && (
              <View style={styles.secCard}>
                <Text style={styles.secTitle}>📜 {tt('admAssets', 'ປະຫວັດ')} ({asset.history.length})</Text>
                {[...asset.history].sort((a, b) => b.date - a.date).map((h) => {
                  const m = HISTORY_META[h.type];
                  return (
                    <View key={h.id} style={styles.hRow}>
                      <Text style={styles.hTitle}>{m.icon} {m.label} · {fmt(h.date)}{h.jobId ? ` · 🔗${h.jobId}` : ''}</Text>
                      {!!h.note && <Text style={styles.hNote}>{h.note}{h.byName ? ` — ${h.byName}` : ''}</Text>}
                      {!!h.readings?.length && <Text style={styles.hNote}>📐 {h.readings.map((r) => `${r.label} ${r.value}`).join(' · ')}</Text>}
                    </View>
                  );
                })}
                <View style={styles.addHist}>
                  <View style={styles.chips}>
                    {(Object.keys(HISTORY_META) as AssetHistoryType[]).map((t) => {
                      const on = hType === t;
                      return <Pressable key={t} style={[styles.chip, on && styles.chipOn]} onPress={() => setHType(t)}><Text style={[styles.chipText, on && styles.chipTextOn]}>{HISTORY_META[t].icon} {HISTORY_META[t].label}</Text></Pressable>;
                    })}
                  </View>
                  <View style={styles.row2}>
                    <TextInput value={hDate} onChangeText={setHDate} placeholder={tt('admAssets', 'ວັນທີ 2026-06-05')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                    <TextInput value={hJob} onChangeText={setHJob} placeholder={tt('admAssets', 'ຜູກ ວຽກ # (optional)')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                  </View>
                  <TextInput value={hNote} onChangeText={setHNote} placeholder={tt('admAssets', 'ໝາຍເຫດ')} placeholderTextColor="#999" style={[styles.input, { marginTop: 6 }]} />
                  {parameters.length > 0 && (
                    <View style={{ marginTop: 4, gap: 4 }}>
                      <Text style={styles.hintSmall}>📐 {tt('admAssets', 'ຄ່າ ວັດ ຄັ້ງ ນີ້ (ບໍ່ ບັງຄັບ)')}</Text>
                      {parameters.map((p) => (
                        <View key={p.id} style={styles.rdRow}>
                          <Text style={styles.rdLabel}>{p.label}{p.unit ? ` (${p.unit})` : ''}</Text>
                          <TextInput value={readings[p.id] ?? ''} onChangeText={(t) => setReadings((r) => ({ ...r, [p.id]: t }))} placeholder={p.factory ?? '—'} placeholderTextColor="#999" style={styles.rdInput} />
                        </View>
                      ))}
                    </View>
                  )}
                  <Pressable style={styles.histBtn} onPress={addHistory}><Text style={styles.histBtnText}>＋ {tt('admAssets', 'ເພີ່ມ ປະຫວັດ')}</Text></Pressable>
                </View>
              </View>
            )}

            {!!err && <Text style={styles.err}>❌ {err}</Text>}
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}><Text style={styles.saveBtnText}>{saving ? tt('admAssets', 'ກຳລັງ ບັນທຶກ...') : tt('admAssets', '💾 ບັນທຶກ ຊັບສິນ')}</Text></Pressable>
            {!asset && <Text style={styles.hintSmall}>{tt('admAssets', 'ບັນທຶກ ກ່ອນ ຈຶ່ງ ເພີ່ມ ປະຫວັດ ໄດ້')}</Text>}
            {asset && <Pressable style={styles.delBtn} onPress={remove}><Text style={styles.delBtnText}>{tt('admAssets', 'ລຶບ ຊັບສິນ')}</Text></Pressable>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.xs, color: colors.text2 },
  empty: { color: colors.text2, fontSize: font.sm, paddingVertical: 16, textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  secTitle: { fontSize: font.sm, fontWeight: '800', color: colors.text },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12 },
  cardTitle: { fontSize: font.md, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  badge: { fontSize: 12, fontWeight: '700', color: '#3730a3', backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeOk: { color: '#065f46', backgroundColor: '#dcfce7' },
  badgeExp: { color: '#92400e', backgroundColor: '#fef3c7' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  chipTextOn: { color: colors.white },
  // editor
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '94%' },
  sheetHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: font.md, fontWeight: '800', color: colors.text },
  x: { fontSize: 15, color: colors.text2 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  row2: { flexDirection: 'row', gap: 8, marginTop: 0 },
  secCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginTop: 12 },
  scrapOut: { marginTop: 8, fontSize: font.md, fontWeight: '800', color: '#1e3a8a', backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  hRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  hTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  hNote: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  addHist: { marginTop: 10, backgroundColor: '#f8fafc', borderRadius: radius.md, padding: 10, gap: 6 },
  histBtn: { backgroundColor: '#eff6ff', borderRadius: radius.md, paddingVertical: 9, alignItems: 'center', marginTop: 4 },
  histBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  err: { color: colors.error, fontSize: font.sm, marginTop: 10 },
  saveBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: font.md },
  hintSmall: { fontSize: font.xs, color: colors.text2, marginTop: 6 },
  pHeadRow: { flexDirection: 'row', marginTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  pRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pCell: { flex: 1, fontSize: font.xs },
  pLabel: { flex: 1.4, color: colors.text, fontWeight: '700', textAlign: 'left' },
  pHead: { color: colors.text2, fontWeight: '800', textAlign: 'center' },
  pFactory: { color: colors.text2, textAlign: 'center' },
  pInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, fontSize: font.xs, color: colors.text, backgroundColor: colors.surface, textAlign: 'center' },
  rdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rdLabel: { flex: 1, fontSize: font.xs, color: colors.text2 },
  rdInput: { width: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, fontSize: font.xs, color: colors.text, backgroundColor: colors.surface },
  delBtn: { padding: 12, alignItems: 'center', marginTop: 4 },
  delBtnText: { color: colors.error, fontSize: font.sm, fontWeight: '600' },
});
