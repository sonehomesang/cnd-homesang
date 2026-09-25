import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppSwitch from '@/components/AppSwitch';
import AmountInput from '@/components/AmountInput';
import {
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
  resolveCommissionPct,
  savePricingConfig,
  watchPricingConfig,
} from '@/lib/pricingConfig';
import { type Product, type Shop, setProductBackOffice, watchAllProducts, watchShops } from '@/lib/shop';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

const SOURCE_LABEL: Record<'product' | 'rule' | 'default', { t: string; c: string; bg: string }> = {
  product: { t: 'ຕັ້ງເອງ', c: '#0066CC', bg: '#eaf2fb' },
  rule: { t: 'ກົດ ໝວດ', c: '#7c3aed', bg: '#ede9fe' },
  default: { t: 'default', c: '#6b7280', bg: '#f1f5f9' },
};

export default function CommissionPanel() {
  const { canEdit } = useSectionPerms('finance');
  const tt = useTT();
  const [cfg, setCfg] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [filter, setFilter] = useState<'configured' | 'all'>('configured');

  useEffect(() => watchPricingConfig((c) => { if (!dirty) setCfg(c); }), [dirty]);
  useEffect(() => watchAllProducts(setProducts), []);
  useEffect(() => watchShops(setShops), []);

  const set = (patch: Partial<PricingConfig>) => { setCfg((c) => ({ ...c, ...patch })); setDirty(true); setSaved(false); };
  const save = async () => {
    try { await savePricingConfig(cfg); setDirty(false); setSaved(true); }
    catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
  };

  const techPct = Math.max(0, 100 - (cfg.marginToHomesangPct || 0));
  const shopMap = useMemo(() => Object.fromEntries(shops.map((s) => [s.id, s])), [shops]);

  // configured = has a back-office value set (quotable / cost / commission)
  const isConfigured = (p: Product) => !!p.quotable || p.costPrice != null || p.commissionPct != null;

  // group the shown products by shop
  const groups = useMemo(() => {
    const shown = filter === 'configured' ? products.filter(isConfigured) : products;
    const byShop = new Map<string, Product[]>();
    for (const p of shown) {
      const key = p.shopId || '—';
      (byShop.get(key) ?? byShop.set(key, []).get(key)!).push(p);
    }
    return Array.from(byShop.entries()).map(([shopId, items]) => ({
      shopId,
      shop: shopMap[shopId] as Shop | undefined,
      name: items[0]?.shopName || shopMap[shopId]?.name || tt('admCommission', 'ບໍ່ລະບຸ ຮ້ານ'),
      items,
    }));
  }, [products, filter, shopMap]);

  const configuredCount = products.filter(isConfigured).length;

  return (
    <View>
      <Text style={styles.title}>💰 {tt('admCommission', 'ຄອມມິຊັ່ນ / ລາຄາ · Pricing engine')}</Text>
      <Text style={styles.sub}>{tt('admCommission', 'ໄລ່ ຄອມ ແບບ ຊັ້ນ: ຕໍ່ສິນຄ້າ → ກົດ ໝວດ/ປະເພດລູກຄ້າ (ຮ້ານ) → ຄ່າ ເລີ່ມຕົ້ນ.')}</Text>

      {/* A — price model */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tt('admCommission', 'ໂມເດລ ລາຄາ')}</Text>
        <Toggle
          label={tt('admCommission', 'ລາຄາສົ່ງ / margin (A1)')}
          hint={tt('admCommission', 'ລູກຄ້າເຫັນ retail · (retail − cost) = margin')}
          value={cfg.wholesaleEnabled}
          onChange={(v) => set({ wholesaleEnabled: v })}
        />
        <Toggle
          label={tt('admCommission', 'ຄອມມິຊັ່ນ % (A2)')}
          hint={tt('admCommission', 'ຮ້ານຈ່າຍ % ຕໍ່ການຂາຍ — ໃຊ້ ກັບ ໃບສະເໜີ ແລະ ຄຳສັ່ງຊື້ ສິນຄ້າ')}
          value={cfg.commissionEnabled}
          onChange={(v) => set({ commissionEnabled: v })}
        />
        {cfg.commissionEnabled && (
          <View style={styles.inlineRow}>
            <Text style={styles.inlineLabel}>{tt('admCommission', 'ຄອມມິຊັ່ນ ເລີ່ມຕົ້ນ %')}</Text>
            <TextInput
              value={String(cfg.defaultCommissionPct)}
              onChangeText={(v) => set({ defaultCommissionPct: Number(v.replace(/\D/g, '')) || 0 })}
              keyboardType="number-pad"
              style={styles.numInput}
            />
          </View>
        )}
        <Text style={styles.note}>{tt('admCommission', 'ເປີດທັງສອງ = A3 (ມີທັງ margin ແລະ commission)')}</Text>
      </View>

      {/* B — split */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tt('admCommission', 'ແບ່ງ margin / commission (B)')}</Text>
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>{tt('admCommission', 'ໃຫ້ HomeSang %')}</Text>
          <TextInput
            value={String(cfg.marginToHomesangPct)}
            onChangeText={(v) => set({ marginToHomesangPct: Math.min(100, Number(v.replace(/\D/g, '')) || 0) })}
            keyboardType="number-pad"
            style={styles.numInput}
          />
        </View>
        <Text style={styles.note}>{tt('admCommission', 'ຊ່າງໄດ້')} {techPct}% · {tt('admCommission', '(100=ທັງໝົດ HomeSang · 0=ທັງໝົດຊ່າງ)')}</Text>
      </View>

      {/* C — visibility */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tt('admCommission', 'ການເຊື່ອງ ຫຼັງບ້ານ (C)')}</Text>
        <Toggle label={tt('admCommission', 'ເຊື່ອງ ຈາກ ລູກຄ້າ')} hint={tt('admCommission', 'ລາຄາທຶນ/margin ບໍ່ສະແດງໃຫ້ລູກຄ້າ')} value={cfg.hideFromCustomer} onChange={(v) => set({ hideFromCustomer: v })} />
        <Toggle label={tt('admCommission', 'ເຊື່ອງ ຈາກ ຊ່າງ')} hint={tt('admCommission', 'ມີແຕ່ admin ເຫັນ margin')} value={cfg.hideFromTech} onChange={(v) => set({ hideFromTech: v })} />
      </View>

      {canEdit && (
        <View style={styles.saveRow}>
          {saved && <Text style={styles.savedTag}>✓ {tt('admCommission', 'ບັນທຶກແລ້ວ')}</Text>}
          <Pressable style={[styles.saveBtn, !dirty && styles.saveOff]} onPress={save} disabled={!dirty}>
            <Text style={styles.saveText}>💾 {tt('admCommission', 'ບັນທຶກ config')}</Text>
          </Pressable>
        </View>
      )}

      {/* aggregated per-product commission list, grouped by shop */}
      <View style={styles.listHead}>
        <Text style={styles.cardTitle}>{tt('admCommission', 'ຄອມ ຕໍ່ ສິນຄ້າ')} ({configuredCount} {tt('admCommission', 'ຕັ້ງ ແລ້ວ')} · {products.length} {tt('admCommission', 'ທັງໝົດ')})</Text>
        <View style={styles.filterRow}>
          {(['configured', 'all'] as const).map((f) => (
            <Pressable key={f} style={[styles.filterChip, filter === f && styles.filterOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f === 'configured' ? tt('admCommission', 'ຕັ້ງ ແລ້ວ') : tt('admCommission', 'ທັງໝົດ')}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={styles.note}>{tt('admCommission', 'ເປີດ "ດຶງໄດ້" + ໃສ່ ລາຄາທຶນ / ຄອມ%. ຄ່າ % ທີ່ ໃຊ້ ຈິງ ສະແດງ ດ້ານ ຂວາ.')}</Text>

      {groups.length === 0 ? (
        <Text style={styles.empty}>{filter === 'configured' ? tt('admCommission', 'ຍັງ ບໍ່ ມີ ສິນຄ້າ ທີ່ ຕັ້ງ ຄອມ') : tt('admCommission', 'ຍັງບໍ່ມີສິນຄ້າ')}</Text>
      ) : (
        groups.map((g) => (
          <View key={g.shopId} style={styles.shopGroup}>
            <View style={styles.shopHead}>
              <Text style={styles.shopName} numberOfLines={1}>🏬 {g.name}</Text>
              {(g.shop?.commissionRules?.length ?? 0) > 0 && (
                <Text style={styles.rulesTag}>📋 {g.shop!.commissionRules!.length} {tt('admCommission', 'ກົດ ໝວດ')}</Text>
              )}
            </View>
            {g.items.map((p) => {
              const eff = resolveCommissionPct(p, g.shop?.commissionRules, undefined, cfg);
              const src = SOURCE_LABEL[eff.source];
              return (
                <View key={p.id} style={styles.prod}>
                  <View style={styles.prodHead}>
                    <Text style={styles.prodName} numberOfLines={1}>{p.name}</Text>
                    <View style={[styles.effBadge, { backgroundColor: src.bg }]}>
                      <Text style={[styles.effText, { color: src.c }]}>{eff.pct}% · {tt('admCommission', src.t)}</Text>
                    </View>
                    <AppSwitch value={!!p.quotable} onValueChange={(v) => { if (canEdit) setProductBackOffice(p.id, { quotable: v }); }} disabled={!canEdit} />
                  </View>
                  <Text style={styles.prodRetail}>retail {(p.price ?? 0).toLocaleString('en-US')}/{p.unit ?? '—'}</Text>
                  {p.quotable && canEdit && (
                    <View style={styles.prodInputs}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>{tt('admCommission', 'ລາຄາທຶນ (cost)')}</Text>
                        <AmountInput
                          value={p.costPrice ?? 0}
                          onChangeValue={(n) => setProductBackOffice(p.id, { costPrice: n })}
                          placeholder="0" placeholderTextColor="#999"
                          style={styles.input}
                        />
                      </View>
                      <View style={{ width: 90 }}>
                        <Text style={styles.miniLabel}>{tt('admCommission', 'ຄອມ %')}</Text>
                        <TextInput
                          value={p.commissionPct != null ? String(p.commissionPct) : ''}
                          onChangeText={(v) => setProductBackOffice(p.id, { commissionPct: Number(v.replace(/\D/g, '')) || 0 })}
                          keyboardType="number-pad" placeholder="def" placeholderTextColor="#999"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.tLabel}>{label}</Text>
        {!!hint && <Text style={styles.tHint}>{hint}</Text>}
      </View>
      <AppSwitch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 6, marginTop: 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f6f7f9' },
  tLabel: { fontSize: 12, color: '#111', fontWeight: '600' },
  tHint: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  inlineLabel: { fontSize: 12, color: '#374151' },
  numInput: { width: 70, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 14, color: '#111', textAlign: 'center', backgroundColor: '#fff' },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 18 },
  savedTag: { color: '#16a34a', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  saveOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  filterOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  filterText: { fontSize: 12, color: '#475569' },
  filterTextOn: { color: '#fff', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 10 },
  shopGroup: { marginTop: 14 },
  shopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  shopName: { fontSize: 13, fontWeight: '700', color: '#111', flex: 1 },
  rulesTag: { fontSize: 12, color: '#7c3aed', fontWeight: '600', backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  prod: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginTop: 8 },
  prodHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prodName: { flex: 1, fontSize: 12, fontWeight: '600', color: '#111' },
  effBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  effText: { fontSize: 12, fontWeight: '700' },
  prodRetail: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  prodInputs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  miniLabel: { fontSize: 12, color: '#6b7280', marginBottom: 3 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 12, color: '#111', backgroundColor: '#fff' },
});
