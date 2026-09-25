import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cnd, kip, unitT } from '@/lib/cnd/theme';
import { watchCndCategories, watchCndProducts, catChildren, catWithDescendants, catPath, catProductCount, type CndCategory, type CndProduct } from '@/lib/cnd/catalog';
import CndCatMenu from '@/components/cnd/CndCatMenu';
import CndAccountMenu from '@/components/cnd/CndAccountMenu';
import { useCndIdentity } from '@/lib/cnd/identity';
import { groupThousands } from '@/lib/format';
import { useCndCart, cndCartAdd } from '@/lib/cnd/cart';
import { useCndConfig, type CndConfig } from '@/lib/cnd/config';
import { watchCndBanners, type CndBanner as CndBannerT } from '@/lib/cnd/banners';
import { watchCndReviewCards, type CndReviewCard } from '@/lib/cnd/publicCards';
import { useTT } from '@/lib/i18n';

// centre the storefront and cap it so product images stay proportionate on wide
// desktop monitors instead of stretching each card (and its square image) huge.
const CONTENT_MAX = 1180;

// CND storefront — a partner hardware store ("Home Hardware shop & services") at
// cnd.homesang.pro. Public browse; the CND admin (separate) manages the catalog.
export default function CndStore() {
  const tt = useTT();
  // who is signed in — owner / staff (custom claim, set on first admin visit) / customer.
  // Drives the header account chip and the staff-only shortcuts; staff PII is never read.
  const me = useCndIdentity();
  const isAdmin = me.kind === 'owner' || me.kind === 'staff';
  const { width } = useWindowDimensions();
  const eff = Math.min(width, CONTENT_MAX);       // width the grid actually occupies
  const [cats, setCats] = useState<CndCategory[]>([]);
  const [products, setProducts] = useState<CndProduct[]>([]);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);          // burger / category menu
  const [filterOpen, setFilterOpen] = useState(false);      // filter sheet
  const [sort, setSort] = useState<'new' | 'priceAsc' | 'priceDesc'>('new');
  const [brand, setBrand] = useState('');                   // '' = all brands
  const [pMin, setPMin] = useState('');
  const [pMax, setPMax] = useState('');
  const cart = useCndCart();
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cfg = useCndConfig();
  // storefront grid columns — admin-tunable (fewer = bigger, more vivid cards)
  const colWide = Math.max(2, Math.min(6, cfg.gridColsWide || 4));
  const colMob = Math.max(1, Math.min(3, cfg.gridColsMobile || 2));
  const cols = eff >= 1000 ? colWide : eff >= 640 ? Math.max(colMob, colWide - 1) : colMob;
  const [toast, setToast] = useState<string | null>(null);   // "✓ added to cart" feedback
  const [railFiltersOpen, setRailFiltersOpen] = useState(false);   // desktop rail: filters collapsed by default
  const toastT = useRef<any>(null);
  const addToCart = (p: CndProduct) => {
    cndCartAdd({ productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: 1, installable: !!p.installable, install: false, feePct: 0, warrantyDays: p.warrantyDays });
    setToast(`✅ ${tt('cndStore', 'ເພີ່ມ ໃສ່ ຕະກ້າ ແລ້ວ')} · ${p.name}`);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2500);
  };
  const [cndBanners, setCndBanners] = useState<CndBannerT[]>([]);
  useEffect(() => watchCndBanners(setCndBanners), []);
  const slides = cndBanners.filter((b) => b.active);
  const [reviews, setReviews] = useState<CndReviewCard[]>([]);
  useEffect(() => watchCndReviewCards(setReviews), []);
  const works = reviews.filter((r) => !!r.afterPhoto);

  useEffect(() => watchCndCategories(setCats), []);
  useEffect(() => watchCndProducts(setProducts), []);

  const catSet = useMemo(() => (cat === 'all' ? null : catWithDescendants(cats, cat)), [cats, cat]);
  // brands available within the current category scope (for the filter)
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => { if ((!catSet || catSet.has(p.categoryId)) && p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products, catSet]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lo = Number(pMin.replace(/\D/g, '')) || 0;
    const hi = Number(pMax.replace(/\D/g, '')) || Infinity;
    let arr = products.filter((p) =>
      (!catSet || catSet.has(p.categoryId)) &&
      (!brand || (p.brand ?? '') === brand) &&
      (p.price >= lo && p.price <= hi) &&
      (!t || p.name.toLowerCase().includes(t) || (p.brand ?? '').toLowerCase().includes(t)));
    if (sort === 'priceAsc') arr = [...arr].sort((a, b) => a.price - b.price);
    else if (sort === 'priceDesc') arr = [...arr].sort((a, b) => b.price - a.price);
    return arr;
  }, [products, catSet, q, brand, pMin, pMax, sort]);
  const activeFilters = (brand ? 1 : 0) + (pMin || pMax ? 1 : 0) + (sort !== 'new' ? 1 : 0);
  const clearFilters = () => { setBrand(''); setPMin(''); setPMax(''); setSort('new'); };
  const desktop = width >= 900;                    // show a persistent left filter rail (dohome-style)
  const brandCounts = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => { if ((!catSet || catSet.has(p.categoryId)) && p.brand) m[p.brand] = (m[p.brand] || 0) + 1; });
    return m;
  }, [products, catSet]);
  const curMain = cat === 'all' ? null : catPath(cats, cat)[0];
  const railCats = curMain ? catChildren(cats, curMain.id) : catChildren(cats, null);
  const catTitle = cat === 'all' ? tt('cndStore', '🛒 ສິນຄ້າ ທັງ ໝົດ') : catPath(cats, cat).map((x) => `${x.icon ?? ''} ${x.name}`.trim()).join(' › ');
  const productCards = shown.map((p) => {
    const disc = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return (
      <Pressable key={p.id} style={[styles.card, { width: `${100 / cols}%` }]} onPress={() => router.push(`/cnd/product/${p.id}` as any)}>
        <View style={styles.cardInner}>
          <View style={styles.imgBox}>
            {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={styles.imgReal} resizeMode="cover" /> : <View style={styles.imgIconChip}><Text style={styles.imgEmoji}>{catIcon(cats, p.categoryId)}</Text></View>}
            {p.installable && <Text style={styles.instTag}>{tt('cndStore', '🔧 ຕິດຕັ້ງ')}</Text>}
            {disc > 0 && <Text style={styles.discTag}>-{disc}%</Text>}
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              {!!p.brand && <Text style={styles.brand} numberOfLines={1}>{p.brand}</Text>}
              <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
            </View>
            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.price}>{kip(p.price)} <Text style={styles.unit}>{tt('cndCommon', 'ກີບ')}/{unitT(p.unit)}</Text></Text>
                {disc > 0 && <Text style={styles.old}>{kip(p.oldPrice)}</Text>}
              </View>
              <Pressable hitSlop={6} style={styles.add} onPress={(e) => { (e as any).stopPropagation?.(); addToCart(p); }} accessibilityLabel={tt('cndStore', 'ເພີ່ມ ໃສ່ ຕະກ້າ')}>
                <Ionicons name="cart" size={16} color={cnd.white} />
                <Text style={styles.addPlus}>＋</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    );
  });

  return (
    <View style={styles.root}>
      {/* ── header: utility strip + main bar ── */}
      <View style={styles.utility}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.utilRow}>
          <Text style={styles.utilTx}>📞 {cfg.phone || '020 5555 0000'}</Text>
          <Text style={styles.utilDot}>·</Text>
          <Text style={styles.utilTx}>🕗 {cfg.hours || 'ຈ-ອາ 8:00–18:00'}</Text>
          <Text style={styles.utilDot}>·</Text>
          <Text style={styles.utilTx}>{tt('cndStore', '🚚 ສົ່ງ ເຖິງ ບ້ານ + 🔧 ຊ່າງ ຕິດຕັ້ງ')}</Text>
        </ScrollView>
      </View>
      <View style={styles.top}>
        <Pressable style={styles.burger} onPress={() => setMenuOpen(true)} accessibilityLabel="ໝວດ ສິນຄ້າ"><Text style={styles.burgerTx}>☰</Text></Pressable>
        <Pressable onPress={() => setCat('all')}><Text style={styles.logo}>C<Text style={{ color: cnd.yellow }}>N</Text>D</Text></Pressable>
        <View style={styles.search}>
          <Text style={{ color: cnd.ink3, fontSize: 13 }}>🔍</Text>
          <TextInput value={q} onChangeText={setQ} placeholder={tt('cndStore', 'ຄົ້ນຫາ ສິນຄ້າ...')} placeholderTextColor={cnd.ink3} style={styles.searchIn} />
        </View>
        <Pressable style={styles.cartBtn} onPress={() => router.push('/cnd/cart' as any)}>
          <Text style={{ fontSize: 17 }}>🛒</Text>
          {cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeTx}>{cartCount > 9 ? '9+' : cartCount}</Text></View>}
        </Pressable>
        <CndAccountMenu identity={me} variant="store" />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* banner slider (dohome-style) — admin-managed, falls back to defaults */}
        <CndBanner cats={cats} onCat={(id) => setCat(id)} slides={slides} />

        {/* ninesang: book a slot / urgent call-out */}
        {(cfg.bookingEnabled || cfg.urgentEnabled) && (
          <View style={styles.svcCtaRow}>
            {cfg.bookingEnabled && (
              <Pressable style={[styles.svcCta, styles.svcBook]} onPress={() => router.push('/cnd/book' as any)}>
                <Text style={styles.svcCtaIcon}>📅</Text>
                <View style={{ flex: 1 }}><Text style={styles.svcCtaT}>{tt('cndStore', 'ຈອງ ຄິວ ຊ່າງ')}</Text><Text style={styles.svcCtaS}>{tt('cndStore', 'ນັດ ວັນ + ເວລາ ລ່ວງ ໜ້າ')}</Text></View>
              </Pressable>
            )}
            {cfg.urgentEnabled && (
              <Pressable style={[styles.svcCta, styles.svcUrgent]} onPress={() => router.push('/cnd/urgent' as any)}>
                <Text style={styles.svcCtaIcon}>🚨</Text>
                <View style={{ flex: 1 }}><Text style={[styles.svcCtaT, { color: '#fff' }]}>{tt('cndStore', 'ຊ່າງ ດ່ວນ')}</Text><Text style={[styles.svcCtaS, { color: 'rgba(255,255,255,0.85)' }]}>{tt('cndStore', 'ມີ ເຫດ · ຫາ ຊ່າງ ໄວ')}</Text></View>
              </Pressable>
            )}
          </View>
        )}

        {/* trust strip — one slim muted line */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trust}>
          {['🚚 ສົ່ງ ເຖິງ ບ້ານ', '🔧 ຊ່າງ ຕິດຕັ້ງ', '🛡️ ຮັບປະກັນ ວຽກ', '💵 ເງິນ ສົດ / QR'].map((t, i) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {i > 0 && <Text style={styles.trustDot}>·</Text>}
              <Text style={styles.trustItem}>{tt('cndStore', t)}</Text>
            </View>
          ))}
        </ScrollView>

        {/* categories — MOBILE only (desktop uses the left rail; avoids duplicate nav) */}
        {!desktop && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable style={styles.menuChip} onPress={() => setMenuOpen(true)}><Text style={styles.menuChipTx}>☰ {tt('cndStore', 'ໝວດ')}</Text></Pressable>
            <Pressable style={[styles.chip, cat === 'all' && styles.chipOn]} onPress={() => setCat('all')}><Text style={[styles.chipTx, cat === 'all' && styles.chipTxOn]}>{tt('cndStore', 'ທັງໝົດ')}</Text></Pressable>
            {catChildren(cats, null).map((c) => (
              <Pressable key={c.id} style={[styles.chip, catPath(cats, cat)[0]?.id === c.id && styles.chipOn]} onPress={() => setCat(c.id)}>
                <Text style={[styles.chipTx, catPath(cats, cat)[0]?.id === c.id && styles.chipTxOn]}>{c.icon ? c.icon + ' ' : ''}{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* products */}
        {products.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>🏪</Text>
            <Text style={styles.emptyT}>{tt('cndStore', 'ຮ້ານ ຍັງ ບໍ່ ມີ ສິນຄ້າ')}</Text>
            {isAdmin
              ? <Pressable style={styles.seedBtn} onPress={() => router.push('/cnd/admin' as any)}><Text style={styles.seedTx}>{tt('cndStore', '⚙️ ໄປ ໜ້າ ຈັດການ → ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text></Pressable>
              : <Text style={styles.emptyH}>{tt('cndStore', 'ກຳລັງ ຈັດ ຮ້ານ — ກັບ ມາ ໃໝ່')}</Text>}
          </View>
        ) : desktop ? (
          <View style={styles.shopRow}>
            {/* ── dohome-style left filter rail ── */}
            <View style={styles.rail}>
              <Text style={styles.railH}>{tt('cndStore', 'ໝວດ ສິນຄ້າ')}</Text>
              <Pressable style={styles.railRow} onPress={() => setCat(curMain ? curMain.id : 'all')}>
                <Text style={[styles.railTx, (cat === 'all' || (curMain && cat === curMain.id)) && styles.railOn]} numberOfLines={1}>{curMain ? `${curMain.icon ?? ''} ${tt('cndStore', 'ທັງ ໝົດ ໃນ ໝວດ')}` : tt('cndStore', 'ທັງໝົດ')}</Text>
              </Pressable>
              {railCats.map((c) => (
                <Pressable key={c.id} style={styles.railRow} onPress={() => setCat(c.id)}>
                  <Text style={[styles.railTx, catPath(cats, cat).some((x) => x.id === c.id) && styles.railOn]} numberOfLines={1}>{c.icon ? c.icon + ' ' : ''}{c.name}</Text>
                  <Text style={styles.railN}>{catProductCount(cats, products, c.id)}</Text>
                </Pressable>
              ))}

              {/* filters collapse into one toggle so the rail stays short */}
              <Pressable style={styles.railToggle} onPress={() => setRailFiltersOpen((o) => !o)}>
                <Text style={styles.railToggleTx}>🎚️ {tt('cndStore', 'ຕົວ ກັ່ນຕອງ')}{activeFilters > 0 ? ` (${activeFilters})` : ''}</Text>
                <Text style={styles.railToggleCh}>{railFiltersOpen ? '▾' : '▸'}</Text>
              </Pressable>
              {railFiltersOpen && (
                <>
                  <Text style={styles.railH}>{tt('cndStore', 'ຮຽງ ຕາມ')}</Text>
                  {([['new', 'ໃໝ່ ລ່າສຸດ'], ['priceAsc', 'ລາຄາ ຕ່ຳ → ສູງ'], ['priceDesc', 'ລາຄາ ສູງ → ຕ່ຳ']] as const).map(([k, l]) => (
                    <Pressable key={k} style={styles.railRow} onPress={() => setSort(k)}><Text style={[styles.railTx, sort === k && styles.railOn]}>{sort === k ? '● ' : '○ '}{tt('cndStore', l)}</Text></Pressable>
                  ))}

                  <Text style={styles.railH}>{tt('cndStore', 'ຊ່ວງ ລາຄາ (ກີບ)')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput style={styles.railIn} value={groupThousands(pMin)} onChangeText={(t) => setPMin(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={tt('cndStore', 'ຕ່ຳ')} placeholderTextColor={cnd.ink3} />
                    <Text style={{ color: cnd.ink3 }}>–</Text>
                    <TextInput style={styles.railIn} value={groupThousands(pMax)} onChangeText={(t) => setPMax(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={tt('cndStore', 'ສູງ')} placeholderTextColor={cnd.ink3} />
                  </View>

                  {Object.keys(brandCounts).length > 0 && (
                    <>
                      <Text style={styles.railH}>{tt('cndStore', 'ແບຣນດ໌')}</Text>
                      <Pressable style={styles.railRow} onPress={() => setBrand('')}><Text style={[styles.railTx, brand === '' && styles.railOn]}>{brand === '' ? '☑ ' : '☐ '}{tt('cndStore', 'ທັງໝົດ')}</Text></Pressable>
                      {Object.keys(brandCounts).sort().map((bn) => (
                        <Pressable key={bn} style={styles.railRow} onPress={() => setBrand(brand === bn ? '' : bn)}><Text style={[styles.railTx, brand === bn && styles.railOn]} numberOfLines={1}>{brand === bn ? '☑ ' : '☐ '}{bn}</Text><Text style={styles.railN}>{brandCounts[bn]}</Text></Pressable>
                      ))}
                    </>
                  )}
                  {activeFilters > 0 && <Pressable style={styles.railClear} onPress={clearFilters}><Text style={styles.railClearTx}>{tt('cndStore', '✕ ລ້າງ ຕົວ ກັ່ນຕອງ')}</Text></Pressable>}
                </>
              )}
            </View>
            {/* ── grid column ── */}
            <View style={{ flex: 1 }}>
              <View style={styles.secRow}><View style={{ flex: 1 }}><Text style={styles.secTitle} numberOfLines={1}>{catTitle}</Text><Text style={styles.secCount}>{shown.length} {tt('cndStore', 'ລາຍການ')}</Text></View></View>
              <View style={styles.grid}>{productCards}{shown.length === 0 && <Text style={styles.emptyH}>{tt('cndStore', 'ບໍ່ ພົບ ສິນຄ້າ')}</Text>}</View>
            </View>
          </View>
        ) : (
          <>
          <View style={styles.secRow}>
            <View style={{ flex: 1 }}><Text style={styles.secTitle} numberOfLines={1}>{catTitle}</Text><Text style={styles.secCount}>{shown.length} {tt('cndStore', 'ລາຍການ')}</Text></View>
            <Pressable style={[styles.filterBtn, activeFilters > 0 && styles.filterOn]} onPress={() => setFilterOpen(true)}>
              <Text style={[styles.filterTx, activeFilters > 0 && { color: cnd.white }]}>🎚️ {tt('cndStore', 'ກັ່ນຕອງ')}{activeFilters > 0 ? ` (${activeFilters})` : ''}</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>{productCards}{shown.length === 0 && <Text style={styles.emptyH}>{tt('cndStore', 'ບໍ່ ພົບ ສິນຄ້າ')}</Text>}</View>
          </>
        )}
        {works.length > 0 && (
          <View style={styles.reviewSec}>
            <Text style={styles.reviewH}>{tt('cndStore', '🛠️ ຜົນ ງານ ຊ່າງ CND (ກ່ອນ → ຫຼັງ)')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
              {works.slice(0, 12).map((r) => (
                <View key={r.id} style={styles.workCard}>
                  <View style={styles.workPair}>
                    <View style={styles.workImgBox}>
                      {r.beforePhoto ? <Image source={{ uri: r.beforePhoto }} style={styles.workImg} /> : <View style={[styles.workImg, styles.workImgEmpty]}><Text style={styles.workImgEmptyTx}>—</Text></View>}
                      <Text style={styles.workTag}>{tt('cndStore', 'ກ່ອນ')}</Text>
                    </View>
                    <Text style={styles.workArrow}>→</Text>
                    <View style={styles.workImgBox}>
                      <Image source={{ uri: r.afterPhoto }} style={styles.workImg} />
                      <Text style={[styles.workTag, styles.workTagAfter]}>{tt('cndStore', 'ຫຼັງ')}</Text>
                    </View>
                  </View>
                  {!!r.work && <Text style={styles.workName} numberOfLines={1}>{r.work}</Text>}
                  <Text style={styles.workMeta} numberOfLines={1}>{'★'.repeat(r.rating)}<Text style={{ color: cnd.line2 }}>{'★'.repeat(5 - r.rating)}</Text>{r.techName ? `  · ${tt('cndCommon', 'ຊ່າງ')} ${r.techName}` : ''}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        {reviews.length > 0 && (
          <View style={styles.reviewSec}>
            <Text style={styles.reviewH}>{tt('cndStore', '⭐ ລີວິວ ຈາກ ລູກຄ້າ')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
              {reviews.slice(0, 12).map((r) => (
                <View key={r.id} style={styles.reviewCard}>
                  <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}<Text style={{ color: cnd.line2 }}>{'★'.repeat(5 - r.rating)}</Text>{r.featured ? '  📌' : ''}</Text>
                  {!!r.review && <Text style={styles.reviewBody} numberOfLines={4}>“{r.review}”</Text>}
                  <Text style={styles.reviewWho}>— {r.customerFirst || 'ລູກຄ້າ'}{r.techName ? ` · ${tt('cndCommon', 'ຊ່າງ')} ${r.techName}` : ''}</Text>
                  {!!r.reply && <Text style={styles.reviewReply} numberOfLines={3}>↳ CND: {r.reply}</Text>}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        <CndFooter cats={cats} isAdmin={isAdmin} onCat={(id) => setCat(id)} cfg={cfg} />
      </ScrollView>

      <CndCatMenu visible={menuOpen} cats={cats} products={products} selected={cat} onSelect={setCat} onClose={() => setMenuOpen(false)} />
      <CndFilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} brands={brands} brand={brand} setBrand={setBrand} pMin={pMin} setPMin={setPMin} pMax={pMax} setPMax={setPMax} sort={sort} setSort={setSort} onClear={clearFilters} count={shown.length} tt={tt} />
      {!!toast && (
        <Pressable style={styles.toast} onPress={() => router.push('/cnd/cart' as any)}>
          <Text style={styles.toastTx}>{toast}</Text>
          <Text style={styles.toastGo}>{tt('cndStore', 'ເບິ່ງ ຕະກ້າ ›')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function catIcon(cats: CndCategory[], id: string): string { return cats.find((c) => c.id === id)?.icon ?? '📦'; }

// ── promo banner carousel (auto-slide + dots + swipe, dohome-style) ───────────
const BANNERS: { id: string; c1: string; c2: string; icon: string; kicker: string; title: string; sub: string; hint?: string }[] = [
  { id: 'b1', c1: '#E8551E', c2: '#C4400F', icon: '🏗️', kicker: 'ໂປຣ ເດືອນ ນີ້', title: 'ຫຼຸດ ສູງສຸດ 20%', sub: 'ວັດສະດຸ ກໍ່ສ້າງ ທຸກ ຊະນິດ', hint: 'ກໍ່ສ້າງ' },
  { id: 'b2', c1: '#2B3A4A', c2: '#3D5063', icon: '🔧', kicker: 'ບໍລິການ ຄົບ ວົງຈອນ', title: 'ຊື້ + ຕິດຕັ້ງ ຈົບ ບ່ອນ ດຽວ', sub: 'ຊ່າງ CND ໄປ ຕິດຕັ້ງ ເຖິງ ບ້ານ', hint: 'ບໍລິການ' },
  { id: 'b3', c1: '#0E7490', c2: '#0891B2', icon: '❄️', kicker: 'ຮັບ ໜ້າ ຮ້ອນ', title: 'ແອຣ໌ Inverter ລາຄາ ພິເສດ', sub: 'ພ້ອມ ຄ່າ ຕິດຕັ້ງ ພິເສດ', hint: 'ແອ' },
  { id: 'b4', c1: '#166534', c2: '#16A34A', icon: '🚚', kicker: 'ບໍລິການ ຈັດ ສົ່ງ', title: 'ສົ່ງ ໄວ ທົ່ວ ວຽງຈັນ', sub: 'ສັ່ງ ມື້ ນີ້ ຮັບ ໄວ ທັນ ໃຈ' },
];
function bannerBg(c1: string, c2: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='800' height='300' fill='url(#g)'/><circle cx='690' cy='40' r='150' fill='rgba(255,255,255,0.10)'/><circle cx='760' cy='250' r='95' fill='rgba(255,255,255,0.07)'/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function CndBanner({ cats, onCat, slides }: { cats: CndCategory[]; onCat: (id: string) => void; slides: { id?: string; c1: string; c2: string; icon: string; kicker: string; title: string; sub: string; hint?: string }[] }) {
  const { width } = useWindowDimensions();
  const tt = useTT();
  const ref = useRef<ScrollView>(null);
  const [measured, setMeasured] = useState(0);
  const bw = measured || Math.max(1, Math.min(width, CONTENT_MAX) - 24); // body padding 12 each side; capped-window fallback
  const [idx, setIdx] = useState(0);
  const usingDefaults = !slides.length;          // admin banners are DATA; only the built-in fallbacks are translatable
  const items = usingDefaults ? BANNERS : slides;
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((p) => { const n = (p + 1) % items.length; ref.current?.scrollTo({ x: n * bw, animated: true }); return n; });
    }, 4500);
    return () => clearInterval(t);
  }, [bw, items.length]);
  const onEnd = (e: any) => setIdx(Math.round(e.nativeEvent.contentOffset.x / (bw || 1)));
  const tap = (hint?: string) => { const c = hint ? cats.find((x) => x.name.includes(hint)) : undefined; onCat(c?.id ?? 'all'); };
  return (
    <View style={styles.bannerWrap} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      {bw > 0 && (
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd}>
          {items.map((b, i) => (
            <Pressable key={b.id ?? String(i)} style={[styles.slide, { width: bw }]} onPress={() => tap(b.hint)}>
              <Image source={{ uri: bannerBg(b.c1, b.c2) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={styles.slideBody}>
                <Text style={styles.slideKicker}>{usingDefaults ? tt('cndStore', b.kicker) : b.kicker}</Text>
                <Text style={styles.slideTitle}>{usingDefaults ? tt('cndStore', b.title) : b.title}</Text>
                <Text style={styles.slideSub}>{usingDefaults ? tt('cndStore', b.sub) : b.sub}</Text>
                <View style={styles.slideCta}><Text style={styles.slideCtaTx}>{tt('cndStore', 'ຊື້ ເລີຍ →')}</Text></View>
              </View>
              <Text style={styles.slideIcon}>{b.icon}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.dots}>
        {items.map((b, i) => <View key={b.id ?? String(i)} style={[styles.dot, i === idx && styles.dotOn]} />)}
      </View>
    </View>
  );
}

/** Full storefront footer — brand, category links, services, contact, payment. */
function CndFooter({ cats, isAdmin, onCat, cfg }: { cats: CndCategory[]; isAdmin: boolean; onCat: (id: string) => void; cfg: CndConfig }) {
  const tt = useTT();
  return (
    <View style={styles.footer}>
      <View style={styles.footBrandRow}>
        <Text style={styles.footLogo}>C<Text style={{ color: cnd.yellow }}>N</Text>D</Text>
        <Text style={styles.footTag}>{cfg.tagline || 'Home Hardware & Services'}</Text>
      </View>
      <Text style={styles.footAbout}>{tt('cndStore', 'ຮ້ານ ຂາຍ ວັດສະດຸ ກໍ່ສ້າງ · ເຄື່ອງ ໃຊ້ ໄຟຟ້າ ພ້ອມ ບໍລິການ ຊ່າງ ຕິດຕັ້ງ ເຖິງ ບ້ານ. ຄູ່ ຮ່ວມ ຢ່າງ ເປັນ ທາງ ການ ຂອງ HomeSang.')}</Text>
      <View style={styles.footCols}>
        <View style={styles.footCol}>
          <Text style={styles.footH}>{tt('cndStore', 'ໝວດ ສິນຄ້າ')}</Text>
          {cats.slice(0, 6).map((c) => (
            <Pressable key={c.id} onPress={() => onCat(c.id)}><Text style={styles.footLink}>{c.icon} {c.name}</Text></Pressable>
          ))}
        </View>
        <View style={styles.footCol}>
          <Text style={styles.footH}>{tt('cndStore', 'ບໍລິການ')}</Text>
          <Text style={styles.footItem}>{tt('cndStore', '🔧 ຊ່າງ ຕິດຕັ້ງ (ຄິດ %)')}</Text>
          <Text style={styles.footItem}>{tt('cndStore', '🚚 ສົ່ງ ເຖິງ ບ້ານ')}</Text>
          <Text style={styles.footItem}>{tt('cndStore', '🛡️ ຮັບປະກັນ ວຽກ')}</Text>
          <Text style={styles.footItem}>{tt('cndStore', '🏬 ຮັບ ເອງ ໜ້າ ຮ້ານ')}</Text>
        </View>
        <View style={styles.footCol}>
          <Text style={styles.footH}>{tt('cndStore', 'ຕິດຕໍ່')}</Text>
          <Text style={styles.footItem}>📞 {cfg.phone || '020 5555 0000'}</Text>
          <Text style={styles.footItem}>📍 {cfg.address || 'ນະຄອນຫຼວງ ວຽງຈັນ'}</Text>
          <Text style={styles.footItem}>🕗 {cfg.hours || 'ຈ-ອາ 8:00–18:00'}</Text>
          {isAdmin
            ? <Pressable onPress={() => router.push('/cnd/admin' as any)}><Text style={styles.footLink}>{tt('cndStore', '⚙️ ໜ້າ ຈັດການ')}</Text></Pressable>
            : <Pressable onPress={() => router.push('/sign-in?next=/cnd/admin' as any)}><Text style={styles.footLink}>{tt('cndStore', '🔑 ຈັດການ ຮ້ານ CND (ເຂົ້າ ສູ່ ລະບົບ)')}</Text></Pressable>}
        </View>
      </View>
      <View style={styles.footPay}>
        <Text style={styles.footPayTx}>{tt('cndStore', '💵 ເງິນ ສົດ')}</Text>
        <Text style={styles.footPayTx}>{tt('cndStore', '📱 QR ໂອນ')}</Text>
        <Text style={styles.footPayTx}>{tt('cndStore', '🔧 ຕິດຕັ້ງ ໂດຍ ຊ່າງ')}</Text>
      </View>
      <Text style={styles.footCopy}>{tt('cndStore', '© 2026 CND Home Hardware · powered by ໂຮມຊ່າງ (HomeSang)')}</Text>
    </View>
  );
}

// ── filter / sort sheet (price · brand · sort) ────────────────────────────────
function CndFilterSheet({ visible, onClose, brands, brand, setBrand, pMin, setPMin, pMax, setPMax, sort, setSort, onClear, count, tt }: {
  visible: boolean; onClose: () => void; brands: string[];
  brand: string; setBrand: (s: string) => void; pMin: string; setPMin: (s: string) => void; pMax: string; setPMax: (s: string) => void;
  sort: 'new' | 'priceAsc' | 'priceDesc'; setSort: (s: 'new' | 'priceAsc' | 'priceDesc') => void; onClear: () => void; count: number; tt: (p: string, s: string) => string;
}) {
  const SORTS: { k: 'new' | 'priceAsc' | 'priceDesc'; label: string }[] = [
    { k: 'new', label: tt('cndStore', 'ໃໝ່ ລ່າສຸດ') }, { k: 'priceAsc', label: tt('cndStore', 'ລາຄາ ຕ່ຳ → ສູງ') }, { k: 'priceDesc', label: tt('cndStore', 'ລາຄາ ສູງ → ຕ່ຳ') },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.fScrim} onPress={onClose}>
        <Pressable style={styles.fSheet} onPress={() => {}}>
          <View style={styles.fHead}><Text style={styles.fTitle}>🎚️ {tt('cndStore', 'ກັ່ນຕອງ / ຮຽງ')}</Text><Pressable onPress={onClose} hitSlop={10}><Text style={styles.fX}>✕</Text></Pressable></View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 6 }}>
            <Text style={styles.fLbl}>{tt('cndStore', 'ຮຽງ ຕາມ')}</Text>
            <View style={styles.fWrap}>{SORTS.map((s) => <Pressable key={s.k} style={[styles.fChip, sort === s.k && styles.fOn]} onPress={() => setSort(s.k)}><Text style={[styles.fChipTx, sort === s.k && styles.fChipTxOn]}>{s.label}</Text></Pressable>)}</View>

            <Text style={styles.fLbl}>{tt('cndStore', 'ຊ່ວງ ລາຄາ (ກີບ)')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput style={styles.fIn} value={groupThousands(pMin)} onChangeText={(t) => setPMin(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={tt('cndStore', 'ຕ່ຳ ສຸດ')} placeholderTextColor={cnd.ink3} />
              <Text style={{ color: cnd.ink3 }}>–</Text>
              <TextInput style={styles.fIn} value={groupThousands(pMax)} onChangeText={(t) => setPMax(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={tt('cndStore', 'ສູງ ສຸດ')} placeholderTextColor={cnd.ink3} />
            </View>

            {brands.length > 0 && <>
              <Text style={styles.fLbl}>{tt('cndStore', 'ແບຣນດ໌')}</Text>
              <View style={styles.fWrap}>
                <Pressable style={[styles.fChip, brand === '' && styles.fOn]} onPress={() => setBrand('')}><Text style={[styles.fChipTx, brand === '' && styles.fChipTxOn]}>{tt('cndStore', 'ທັງໝົດ')}</Text></Pressable>
                {brands.map((b) => <Pressable key={b} style={[styles.fChip, brand === b && styles.fOn]} onPress={() => setBrand(b)}><Text style={[styles.fChipTx, brand === b && styles.fChipTxOn]}>{b}</Text></Pressable>)}
              </View>
            </>}
          </ScrollView>
          <View style={styles.fFoot}>
            <Pressable style={styles.fClear} onPress={onClear}><Text style={styles.fClearTx}>{tt('cndStore', 'ລ້າງ')}</Text></Pressable>
            <Pressable style={styles.fApply} onPress={onClose}><Text style={styles.fApplyTx}>{tt('cndStore', 'ເບິ່ງ')} {count} {tt('cndStore', 'ລາຍການ')}</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  burger: { width: 38, height: 38, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  burgerTx: { color: cnd.white, fontSize: 20, fontWeight: '900' },
  menuChip: { backgroundColor: cnd.steel, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  menuChipTx: { color: cnd.white, fontSize: 12.5, fontWeight: '800' },
  filterBtn: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 11, alignSelf: 'flex-start' },
  filterOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  filterTx: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2 },
  shopRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  rail: { width: 236, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12 },
  railH: { fontSize: 12.5, fontWeight: '900', color: cnd.ink, marginTop: 12, marginBottom: 5, borderTopWidth: 1, borderTopColor: cnd.line, paddingTop: 10 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  railToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, borderTopWidth: 1, borderTopColor: cnd.line, paddingTop: 12 },
  railToggleTx: { fontSize: 12.5, fontWeight: '800', color: cnd.ink },
  railToggleCh: { fontSize: 13, color: cnd.ink3, fontWeight: '800' },
  railTx: { flex: 1, fontSize: 12.5, color: cnd.ink2, fontWeight: '600' },
  railOn: { color: cnd.brandDark, fontWeight: '800' },
  railN: { fontSize: 12, color: cnd.ink3, fontWeight: '700' },
  railIn: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, fontSize: 13, color: cnd.ink, backgroundColor: cnd.surface, textAlign: 'center' },
  railClear: { marginTop: 12, backgroundColor: cnd.surface2, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  railClearTx: { fontSize: 12, fontWeight: '800', color: cnd.error },
  fScrim: { flex: 1, backgroundColor: 'rgba(10,16,26,.45)', justifyContent: 'flex-end' },
  fSheet: { backgroundColor: cnd.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '86%' },
  fHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: cnd.line },
  fTitle: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  fX: { fontSize: 15, color: cnd.ink3, fontWeight: '800' },
  fLbl: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2, marginTop: 12, marginBottom: 4 },
  fWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: cnd.surface2 },
  fOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  fChipTx: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  fChipTxOn: { color: cnd.white },
  fIn: { flex: 1, borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 10, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface, textAlign: 'center' },
  fFoot: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: cnd.line },
  fClear: { flex: 1, backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  fClearTx: { color: cnd.ink2, fontWeight: '800', fontSize: 14 },
  fApply: { flex: 2, backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  fApplyTx: { color: cnd.white, fontWeight: '800', fontSize: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: cnd.steel },
  logo: { fontSize: 22, fontWeight: '900', color: cnd.white, letterSpacing: 1 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 9, paddingHorizontal: 10, height: 36 },
  searchIn: { flex: 1, color: cnd.white, fontSize: 13, padding: 0 },
  adminBtn: { backgroundColor: cnd.brand, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  adminTx: { color: cnd.white, fontWeight: '800', fontSize: 12 },
  cartBtn: { width: 36, height: 36, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: cnd.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: cnd.steel },
  badgeTx: { color: cnd.white, fontSize: 12, fontWeight: '900' },
  body: { padding: 12, gap: 12, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' },
  bannerWrap: { height: 172, borderRadius: 14, overflow: 'hidden', backgroundColor: cnd.surface2, position: 'relative' },
  slide: { height: 172, justifyContent: 'center', paddingHorizontal: 20, position: 'relative', overflow: 'hidden' },
  slideBody: { maxWidth: '74%' },
  slideKicker: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '800', marginBottom: 5 },
  slideTitle: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 27 },
  slideSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4 },
  svcCtaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  svcCta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1 },
  svcBook: { backgroundColor: cnd.blueSoft, borderColor: '#bcd6f5' },
  svcUrgent: { backgroundColor: '#D64545', borderColor: '#D64545' },
  svcCtaIcon: { fontSize: 22 },
  svcCtaT: { fontSize: 13.5, fontWeight: '900', color: cnd.ink },
  svcCtaS: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  slideCta: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14 },
  slideCtaTx: { color: cnd.ink, fontWeight: '900', fontSize: 12.5 },
  slideIcon: { position: 'absolute', right: 16, bottom: 8, fontSize: 76 },
  dots: { position: 'absolute', bottom: 9, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
  // slim single muted line (redesign 2026-09-14) — no cards, just a light reassurance strip
  trust: { gap: 4, paddingVertical: 2, alignItems: 'center' },
  trustItem: { fontSize: 11.5, fontWeight: '600', color: cnd.ink3 },
  trustDot: { fontSize: 11.5, color: cnd.line2 },
  promo: { backgroundColor: cnd.brand, borderRadius: 14, padding: 16, position: 'relative', overflow: 'hidden' },
  promoGlow: { position: 'absolute', top: -34, right: -24, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.10)' },
  promoKicker: { color: '#ffe0d0', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  promoBig: { color: cnd.white, fontSize: 15, fontWeight: '900' },
  promoSub: { color: '#ffe0d0', fontSize: 12.5, marginTop: 3 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  heroBadge: { color: cnd.white, fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' },
  utility: { backgroundColor: '#1E2A38', paddingVertical: 5, paddingHorizontal: 12 },
  utilRow: { alignItems: 'center', gap: 8 },
  utilTx: { color: '#cdd7e2', fontSize: 12, fontWeight: '600' },
  utilDot: { color: cnd.steel2, fontSize: 12 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  secTitle: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  secCount: { fontSize: 12, color: cnd.ink3, fontWeight: '700' },
  footer: { marginTop: 18, marginHorizontal: -12, backgroundColor: cnd.steel, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, borderTopWidth: 3, borderTopColor: cnd.brand },
  footBrandRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  footLogo: { fontSize: 22, fontWeight: '900', color: cnd.white, letterSpacing: 1 },
  footTag: { color: '#cdd7e2', fontSize: 12, fontWeight: '700' },
  footAbout: { color: '#9fb0c2', fontSize: 12, lineHeight: 18, marginTop: 8 },
  footCols: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 14, marginTop: 16 },
  footCol: { gap: 6, flexGrow: 1, flexBasis: 120 },
  footH: { color: cnd.white, fontSize: 12.5, fontWeight: '800', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  footLink: { color: cnd.yellow, fontSize: 12.5, fontWeight: '600', paddingVertical: 1 },
  footItem: { color: '#cdd7e2', fontSize: 12.5, paddingVertical: 1 },
  footPay: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: cnd.steel2 },
  footPayTx: { color: '#cdd7e2', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 7, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' },
  footCopy: { color: '#7d8da0', fontSize: 12, marginTop: 14, textAlign: 'center' },
  reviewSec: { marginTop: 6 },
  reviewH: { fontSize: 15, fontWeight: '900', color: cnd.ink, marginBottom: 8 },
  reviewCard: { width: 250, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 13, gap: 4 },
  workCard: { width: 260, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 10, gap: 6 },
  workPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  workImgBox: { flex: 1, position: 'relative' },
  workImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: cnd.surface2 },
  workImgEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: cnd.line, borderStyle: 'dashed' },
  workImgEmptyTx: { color: cnd.ink3, fontSize: 15 },
  workArrow: { color: cnd.brand, fontWeight: '900', fontSize: 15 },
  workTag: { position: 'absolute', left: 5, top: 5, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  workTagAfter: { backgroundColor: cnd.brand },
  workName: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  workMeta: { fontSize: 12, color: '#EAB308' },
  reviewStars: { fontSize: 15, color: cnd.yellow, fontWeight: '900', letterSpacing: 1 },
  reviewBody: { fontSize: 13, fontStyle: 'italic', color: cnd.ink, lineHeight: 18 },
  reviewWho: { fontSize: 12, color: cnd.ink3, fontWeight: '700', marginTop: 2 },
  reviewReply: { fontSize: 12, color: cnd.green, backgroundColor: cnd.greenSoft, borderRadius: 7, padding: 6, marginTop: 2 },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: cnd.surface },
  chipOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  chipTx: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  chipTxOn: { color: cnd.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { padding: 6 },
  cardInner: { flex: 1, backgroundColor: cnd.surface, borderRadius: 13, borderWidth: 1, borderColor: cnd.line, overflow: 'hidden', shadowColor: '#0b1e2e', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  // no-image placeholder: soft tint + a small rounded icon chip, not a big box emoji
  imgBox: { aspectRatio: 1, backgroundColor: '#F4F7FB', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  imgIconChip: { width: 52, height: 52, borderRadius: 14, backgroundColor: cnd.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#0b1e2e', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  imgEmoji: { fontSize: 26 },
  imgReal: { width: '100%', height: '100%' },
  instTag: { position: 'absolute', top: 6, left: 6, fontSize: 12, fontWeight: '800', backgroundColor: cnd.yellow, color: '#3a2c00', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6, overflow: 'hidden' },
  discTag: { position: 'absolute', top: 6, right: 6, fontSize: 12, fontWeight: '800', backgroundColor: cnd.brand, color: cnd.white, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6, overflow: 'hidden' },
  cardBody: { flex: 1, padding: 9, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: cnd.line },
  cardTop: { gap: 2 },
  brand: { fontSize: 12, fontWeight: '800', color: cnd.ink3, letterSpacing: 0.3 },
  name: { fontSize: 12, fontWeight: '600', color: cnd.ink, lineHeight: 16, minHeight: 32 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 },
  price: { fontSize: 13.5, fontWeight: '900', color: cnd.brandDark },
  unit: { fontSize: 12, fontWeight: '600', color: cnd.ink3 },
  old: { fontSize: 12, color: cnd.ink3, textDecorationLine: 'line-through' },
  add: { flexDirection: 'row', minWidth: 40, height: 30, paddingHorizontal: 6, borderRadius: 9, backgroundColor: cnd.brand, alignItems: 'center', justifyContent: 'center', gap: 1, shadowColor: cnd.brand, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  addPlus: { color: cnd.white, fontSize: 13, fontWeight: '900', lineHeight: 14, marginTop: -1 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 20, backgroundColor: cnd.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, maxWidth: 520, alignSelf: 'center', width: '100%' },
  toastTx: { color: cnd.white, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  toastGo: { color: cnd.brandSoft, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 50 },
  emptyT: { fontSize: 15, fontWeight: '800', color: cnd.ink2 },
  emptyH: { fontSize: 13, color: cnd.ink3, textAlign: 'center', width: '100%', paddingVertical: 20 },
  seedBtn: { backgroundColor: cnd.brand, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18 },
  seedTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
});
