import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getCategory, useServiceCategories } from '@/lib/categories';
import { useTT } from '@/lib/i18n';
import CategoryIcon from '@/components/CategoryIcon';
import { type Product, type Shop, watchProducts, watchShops } from '@/lib/shop';
import { type Job, watchAllJobs } from '@/lib/jobs';
import { type TechCard, watchTechnicians } from '@/lib/users';
import { colors, font, radius, shadow } from '@/lib/theme';

// Bilingual, tolerant matching: lowercase + NFC; a query matches when EVERY
// whitespace-separated token appears in the item's combined Lao+English text.
const norm = (s: string | undefined | null) => (s ?? '').toString().toLowerCase().normalize('NFC');
const hay = (...parts: (string | undefined | null)[]) => norm(parts.filter(Boolean).join('  '));
const matchAll = (tokens: string[], haystack: string) => tokens.every((t) => haystack.includes(t));

/**
 * Shared search results panel — used inline on the home screen (type-in-place,
 * no navigation) and on the dedicated /search screen. Renders nothing until the
 * query is non-empty. Self-contained data subscriptions (mount only while a
 * search is active).
 */
export default function SearchResults({ query, onNavigate }: { query: string; onNavigate?: () => void }) {
  const tt = useTT();
  const serviceCats = useServiceCategories();
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [techs, setTechs] = useState<TechCard[]>([]);

  useEffect(() => {
    const u1 = watchProducts(setProducts);
    const u2 = watchShops(setShops);
    const u3 = watchAllJobs(setJobs);
    const u4 = watchTechnicians(setTechs);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  const go = (path: string) => { onNavigate?.(); router.push(path as any); };

  const r = useMemo(() => {
    if (tokens.length === 0) return { services: [], products: [], shops: [], techs: [], jobs: [] };
    const catNames = (value?: string) => {
      const c = value ? getCategory(value) : undefined;
      return c ? `${c.lao} ${c.en} ${c.value}` : (value ?? '');
    };
    return {
      services: serviceCats.filter((c) => matchAll(tokens, hay(c.lao, c.en, c.value))).slice(0, 12),
      // rating → visibility (Slice 6): higher-rated products/techs surface first
      products: products.filter((p) => matchAll(tokens, hay(p.name, p.description, p.categoryLao, p.category, p.unit, p.shopName))).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 24),
      shops: shops.filter((s) => matchAll(tokens, hay(s.name, s.address, (s as any).description))).slice(0, 12),
      techs: techs.filter((t) => matchAll(tokens, hay(t.name, t.roleDescription, (t.specialties ?? []).map((sp) => `${sp} ${catNames(sp)}`).join(' ')))).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 12),
      jobs: jobs.filter((j) => j.status === 'open' && matchAll(tokens, hay(j.title, j.description, catNames(j.category)))).slice(0, 12),
    };
  }, [tokens, serviceCats, products, shops, techs, jobs]);

  if (tokens.length === 0) return null;

  const total = r.services.length + r.products.length + r.shops.length + r.techs.length + r.jobs.length;

  if (total === 0) {
    return (
      <View style={styles.noResult}>
        <Text style={styles.noResultIcon}>🔍</Text>
        <Text style={styles.hint}>{tt('search', 'ບໍ່ພົບຜົນສຳລັບ «')}{query}»</Text>
        <Text style={styles.noResultHint}>{tt('search', 'ລອງ ຄຳ ອື່ນ — ຊື່ສິນຄ້າ, ໝວດ ບໍລິການ ຫຼື ຊື່ຮ້ານ')}</Text>
      </View>
    );
  }

  return (
    <View>
      {r.products.length > 0 && (
        <>
          <Text style={styles.section}>{tt('search', '🛍️ ສິນຄ້າ')} ({r.products.length})</Text>
          {r.products.map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => go(`/products/${p.id}`)}>
              <Image source={{ uri: p.images?.[0] }} style={[styles.thumb, { borderRadius: 10 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.meta}>{(p.price ?? 0).toLocaleString()}{tt('search', ' ກີບ / ')}{p.unit} · {p.categoryLao ?? p.category}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
      {r.services.length > 0 && (
        <>
          <Text style={styles.section}>{tt('search', '🧰 ບໍລິການ')} ({r.services.length})</Text>
          <View style={styles.chipWrap}>
            {r.services.map((c) => (
              <Pressable key={c.value} style={styles.chip} onPress={() => go(`/(tabs)/explore?cat=${c.value}`)}>
                <CategoryIcon icon={c.icon} size={14} color={colors.primary} />
                <Text style={styles.chipText}>{c.lao}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {r.techs.length > 0 && (
        <>
          <Text style={styles.section}>{tt('search', '👷 ຊ່າງ · ຜູ້ໃຫ້ບໍລິການ')} ({r.techs.length})</Text>
          {r.techs.map((t) => (
            <Pressable key={t.uid} style={styles.row} onPress={() => go(`/users/${t.uid}`)}>
              {t.image ? (
                <Image source={{ uri: t.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon]}><Text style={{ fontSize: 22 }}>👷</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
                {(t.roleDescription || (t.specialties && t.specialties.length > 0)) && (
                  <Text style={styles.meta} numberOfLines={1}>{t.roleDescription || (t.specialties ?? []).map((sp) => getCategory(sp)?.lao ?? sp).join(' · ')}{typeof t.rating === 'number' ? ` · ⭐ ${t.rating.toFixed(1)}` : ''}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </>
      )}
      {r.shops.length > 0 && (
        <>
          <Text style={styles.section}>{tt('search', '🏬 ຮ້ານ')} ({r.shops.length})</Text>
          {r.shops.map((s) => (
            <Pressable key={s.id} style={styles.row} onPress={() => go(`/shop/${s.id}`)}>
              {s.image ? (
                <Image source={{ uri: s.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon]}><Text style={{ fontSize: 22 }}>🏬</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
                {!!s.address && <Text style={styles.meta} numberOfLines={1}>📍 {s.address}</Text>}
              </View>
            </Pressable>
          ))}
        </>
      )}
      {r.jobs.length > 0 && (
        <>
          <Text style={styles.section}>{tt('search', '🛠️ ງານເປີດຮັບ')} ({r.jobs.length})</Text>
          {r.jobs.map((j) => {
            const c = getCategory(j.category);
            return (
              <Pressable key={j.id} style={styles.row} onPress={() => go(`/jobs/${j.id}`)}>
                <View style={[styles.thumb, styles.thumbIcon]}><CategoryIcon icon={c?.icon || '🛠️'} size={22} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{j.title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{c?.lao ?? j.category}{j.budget !== undefined ? ` · 💰 ${j.budget.toLocaleString()}` : ''}</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, marginBottom: 8, ...shadow.card },
  thumb: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2 },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  meta: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8, ...shadow.card },
  chipText: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
  hint: { textAlign: 'center', color: colors.text3, fontSize: font.sm, marginTop: 6 },
  noResult: { alignItems: 'center', marginTop: 30, gap: 6 },
  noResultIcon: { fontSize: 40 },
  noResultHint: { textAlign: 'center', color: colors.text3, fontSize: font.xs, marginTop: 2 },
});
