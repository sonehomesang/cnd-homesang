import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { type Category, watchCategories } from '@/lib/refdata';
import {
  createProduct,
  createShop,
  resolveMyShop,
  type Product,
  type ProductVariantGroup,
  saleInfo,
  setProductActive,
  setProductMemberDiscounts,
  setProductSale,
  type Shop,
  watchMyProducts,
} from '@/lib/shop';
import { MEMBER_GROUPS, type MemberDiscount } from '@/lib/memberPricing';
import ShopMemberPricing from '@/components/ShopMemberPricing';
import AmountInput from '@/components/AmountInput';
import RichTextEditor from '@/components/RichTextEditor';
import { htmlToPlain } from '@/lib/richtext';
import PhotoPicker from '@/components/PhotoPicker';
import BottomSheet from '@/components/BottomSheet';
import CategoryIcon from '@/components/CategoryIcon';
import ShopOrdersQueue from '@/components/ShopOrdersQueue';
import ShopIncomeDashboard from '@/components/ShopIncomeDashboard';
import ShopGroupBuys from '@/components/ShopGroupBuys';
import { colors, font, radius, shadow } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function ManageShopScreen() {
  const { fbUser, loading, profile } = useAuth();
  const { can } = usePermissions();
  const tt = useTT();
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopRole, setShopRole] = useState<'owner' | 'admin' | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [stab, setStab] = useState<'products' | 'orders' | 'income' | 'groupbuy' | 'members'>('products');

  // create-shop form
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sAddr, setSAddr] = useState('');
  const [savingShop, setSavingShop] = useState(false);

  // add-product sheet
  const [adding, setAdding] = useState(false);
  const [pName, setPName] = useState('');
  const [pCat, setPCat] = useState<Category | null>(null);
  const [pPrice, setPPrice] = useState('');
  const [pUnit, setPUnit] = useState('ອັນ');
  const [pStock, setPStock] = useState('');
  const [pDesc, setPDesc] = useState(''); // rich-text HTML
  const [pBrand, setPBrand] = useState('');
  const [pModel, setPModel] = useState('');
  const [pSpecs, setPSpecs] = useState('');
  const [pUsage, setPUsage] = useState('');
  const [pExamples, setPExamples] = useState('');
  const [pInstall, setPInstall] = useState('');
  const [pSafety, setPSafety] = useState('');
  const [pImages, setPImages] = useState<string[]>([]);
  const [pVariants, setPVariants] = useState<ProductVariantGroup[]>([]);
  const [savingP, setSavingP] = useState(false);
  const [err, setErr] = useState('');

  // ⚡ flash-deal editor (per existing product)
  const DEAL_DAYS = [
    { label: tt('shopManage', '6 ຊົ່ວໂມງ'), ms: 6 * 3600_000 },
    { label: tt('shopManage', '1 ມື້'), ms: 86_400_000 },
    { label: tt('shopManage', '3 ມື້'), ms: 3 * 86_400_000 },
    { label: tt('shopManage', '7 ມື້'), ms: 7 * 86_400_000 },
  ];
  const [dealFor, setDealFor] = useState<Product | null>(null);
  const [dPrice, setDPrice] = useState('');
  const [dDurIdx, setDDurIdx] = useState(1);
  const [dSaving, setDSaving] = useState(false);
  const [dErr, setDErr] = useState('');

  const openDeal = (p: Product) => {
    const s = saleInfo(p);
    setDealFor(p);
    setDPrice(s.onSale ? String(s.price) : '');
    setDDurIdx(1);
    setDErr('');
  };
  const saveDeal = async () => {
    if (!dealFor) return;
    const sp = parseInt(dPrice.replace(/\D/g, ''), 10);
    if (!Number.isFinite(sp) || sp <= 0 || sp >= (dealFor.price ?? 0)) {
      setDErr(tt('shopManage', 'ລາຄາ Flash ຕ້ອງ ຕ່ຳກວ່າ ລາຄາປົກກະຕິ'));
      return;
    }
    setDSaving(true); setDErr('');
    try {
      await setProductSale(dealFor.id, sp, Date.now() + DEAL_DAYS[dDurIdx].ms);
      setDealFor(null);
    } catch (e: any) { setDErr(e?.message ?? String(e)); } finally { setDSaving(false); }
  };
  const clearDeal = async () => {
    if (!dealFor) return;
    setDSaving(true); setDErr('');
    try {
      await setProductSale(dealFor.id, null, null);
      setDealFor(null);
    } catch (e: any) { setDErr(e?.message ?? String(e)); } finally { setDSaving(false); }
  };

  // 🏷️ per-product member-discount override
  const [memFor, setMemFor] = useState<Product | null>(null);
  const [memPcts, setMemPcts] = useState<Record<string, string>>({});
  const [mSaving, setMSaving] = useState(false);
  const openMem = (p: Product) => {
    setMemFor(p);
    const cur: Record<string, string> = {};
    (p.memberDiscounts ?? []).forEach((d) => { cur[d.group] = String(d.pct); });
    setMemPcts(cur);
  };
  const saveMem = async () => {
    if (!memFor) return;
    setMSaving(true);
    try {
      const discounts: MemberDiscount[] = MEMBER_GROUPS
        .map((g) => ({ group: g.key, pct: parseInt((memPcts[g.key] ?? '').replace(/\D/g, ''), 10) || 0 }))
        .filter((d) => d.pct > 0);
      await setProductMemberDiscounts(memFor.id, discounts);
      setMemFor(null);
    } finally { setMSaving(false); }
  };

  const addGroup = () => setPVariants((p) => [...p, { name: '', options: [{ label: '', priceDelta: 0 }] }]);
  const rmGroup = (gi: number) => setPVariants((p) => p.filter((_, i) => i !== gi));
  const setGroupName = (gi: number, name: string) =>
    setPVariants((p) => p.map((g, i) => (i === gi ? { ...g, name } : g)));
  const addOpt = (gi: number) =>
    setPVariants((p) => p.map((g, i) => (i === gi ? { ...g, options: [...g.options, { label: '', priceDelta: 0 }] } : g)));
  const setOpt = (gi: number, oi: number, patch: Partial<{ label: string; priceDelta: number }>) =>
    setPVariants((p) =>
      p.map((g, i) =>
        i === gi ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : g,
      ),
    );

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    resolveMyShop(fbUser.uid, { shopId: (profile as any)?.shopId, shopRole: (profile as any)?.shopRole }).then((r) => {
      setShop(r?.shop ?? null);
      setShopRole(r?.role ?? null);
      setShopLoading(false);
    });
  }, [fbUser, profile]);

  useEffect(() => {
    if (!shop) return;
    return watchMyProducts(shop.id, setProducts);
  }, [shop]);

  useEffect(() => watchCategories('product', setCats), []);

  const makeShop = async () => {
    if (!fbUser || sName.trim() === '') return;
    setSavingShop(true);
    try {
      const id = await createShop(fbUser.uid, {
        name: sName.trim(),
        phone: sPhone || undefined,
        address: sAddr || undefined,
      });
      setShop({ id, ownerId: fbUser.uid, name: sName.trim(), phone: sPhone, address: sAddr, createdAt: Date.now() });
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSavingShop(false);
    }
  };

  const resetP = () => {
    setPName(''); setPCat(null); setPPrice(''); setPUnit('ອັນ'); setPStock(''); setPDesc(''); setPSpecs(''); setPImages([]); setPVariants([]); setErr('');
    setPBrand(''); setPModel(''); setPUsage(''); setPExamples(''); setPInstall(''); setPSafety('');
  };

  const addProduct = async () => {
    if (!shop) return;
    const priceNum = parseInt(pPrice.replace(/\D/g, ''), 10);
    if (pName.trim() === '' || !pCat || !Number.isFinite(priceNum) || priceNum <= 0) {
      setErr(tt('shopManage','ໃສ່ ຊື່ · ໝວດ · ລາຄາ'));
      return;
    }
    const cleanedVariants = pVariants
      .map((g) => ({
        name: g.name.trim(),
        options: g.options
          .filter((o) => o.label.trim() !== '')
          .map((o) => ({ label: o.label.trim(), priceDelta: o.priceDelta || undefined })),
      }))
      .filter((g) => g.name !== '' && g.options.length > 0);
    setSavingP(true);
    setErr('');
    try {
      await createProduct({
        shopId: shop.id,
        shopName: shop.name,
        category: pCat.nameEn,
        categoryLao: pCat.nameLao,
        name: pName.trim(),
        description: pDesc ? htmlToPlain(pDesc) || undefined : undefined,
        descriptionHtml: pDesc || undefined,
        brand: pBrand.trim() || undefined,
        model: pModel.trim() || undefined,
        specs: pSpecs || undefined,
        usage: pUsage.trim() || undefined,
        usageExamples: pExamples.trim() || undefined,
        installGuide: pInstall.trim() || undefined,
        safetyNotes: pSafety.trim() || undefined,
        price: priceNum,
        unit: pUnit || 'ອັນ',
        stock: pStock ? parseInt(pStock.replace(/\D/g, ''), 10) : undefined,
        images: pImages,
        variants: cleanedVariants.length > 0 ? cleanedVariants : undefined,
      });
      resetP();
      setAdding(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSavingP(false);
    }
  };

  if (loading || shopLoading) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('shopManage','ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  // sell capability OR a shop-staff link (shopId) grants access to shop management
  const isShopStaff = !!(profile as any)?.shopId;
  if (fbUser && !can('sell') && !isShopStaff) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('shopManage','ບັນຊີຂອງເຈົ້າ ບໍ່ມີສິດຂາຍສິນຄ້າ')}</Text>
        <BackButton />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          {!shop ? (
            <View style={styles.card}>
              <Text style={styles.title}>{tt('shopManage','🏬 ສ້າງຮ້ານ')}</Text>
              <Text style={styles.sub}>{tt('shopManage','ເປີດຮ້ານ ເພື່ອລົງຂາຍສິນຄ້າ')}</Text>
              <Text style={styles.label}>{tt('shopManage','ຊື່ຮ້ານ *')}</Text>
              <TextInput value={sName} onChangeText={setSName} placeholder={tt('shopManage','ຮ້ານ ວັດສະດຸ ...')} placeholderTextColor="#999" style={styles.input} />
              <Text style={styles.label}>{tt('shopManage','ເບີໂທ')}</Text>
              <TextInput value={sPhone} onChangeText={setSPhone} placeholder="020 ..." placeholderTextColor="#999" keyboardType="phone-pad" style={styles.input} />
              <Text style={styles.label}>{tt('shopManage','ທີ່ຢູ່')}</Text>
              <TextInput value={sAddr} onChangeText={setSAddr} placeholder={tt('shopManage','ບ້ານ ເມືອງ ແຂວງ')} placeholderTextColor="#999" style={styles.input} />
              <Pressable style={[styles.btn, (savingShop || !sName) && styles.btnOff]} onPress={makeShop} disabled={savingShop || !sName}>
                <Text style={styles.btnText}>{savingShop ? '...' : tt('shopManage','🏬 ສ້າງຮ້ານ')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.shopHead}>
                <Text style={styles.shopName}>🏬 {shop.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {shopRole && (
                    <Text style={styles.roleTag}>{shopRole === 'owner' ? tt('shopManage','👑 ເຈົ້າຂອງ') : tt('shopManage','🛠️ ແອັດມິນ ຮ້ານ')}</Text>
                  )}
                  <Text style={styles.shopMeta}>{products.length}{tt('shopManage',' ສິນຄ້າ')}</Text>
                </View>
              </View>

              <View style={styles.stabs}>
                <Pressable style={[styles.stab, stab === 'products' && styles.stabOn]} onPress={() => setStab('products')}>
                  <Text style={[styles.stabText, stab === 'products' && styles.stabTextOn]}>🛍️ {tt('shopManage','ສິນຄ້າ')} ({products.length})</Text>
                </Pressable>
                <Pressable style={[styles.stab, stab === 'orders' && styles.stabOn]} onPress={() => setStab('orders')}>
                  <Text style={[styles.stabText, stab === 'orders' && styles.stabTextOn]}>📦 {tt('shopManage','ອໍເດີ')}</Text>
                </Pressable>
                <Pressable style={[styles.stab, stab === 'income' && styles.stabOn]} onPress={() => setStab('income')}>
                  <Text style={[styles.stabText, stab === 'income' && styles.stabTextOn]}>💰 {tt('shopManage','ລາຍຮັບ')}</Text>
                </Pressable>
                <Pressable style={[styles.stab, stab === 'groupbuy' && styles.stabOn]} onPress={() => setStab('groupbuy')}>
                  <Text style={[styles.stabText, stab === 'groupbuy' && styles.stabTextOn]}>👥 {tt('shopManage','ຊື້ກຸ່ມ')}</Text>
                </Pressable>
                <Pressable style={[styles.stab, stab === 'members' && styles.stabOn]} onPress={() => setStab('members')}>
                  <Text style={[styles.stabText, stab === 'members' && styles.stabTextOn]}>🏷️ {tt('shopManage','ສະມາຊິກ')}</Text>
                </Pressable>
              </View>

              {stab === 'orders' ? (
                <ShopOrdersQueue shopId={shop.id} />
              ) : stab === 'income' ? (
                <ShopIncomeDashboard shopId={shop.id} />
              ) : stab === 'groupbuy' ? (
                <ShopGroupBuys shopId={shop.id} products={products} uid={fbUser!.uid} />
              ) : stab === 'members' ? (
                <ShopMemberPricing shop={shop} />
              ) : (
              <>
              <Pressable style={styles.addBtn} onPress={() => setAdding(true)}>
                <Text style={styles.addBtnText}>{tt('shopManage','＋ ເພີ່ມສິນຄ້າ')}</Text>
              </Pressable>

              {products.length === 0 ? (
                <Text style={styles.empty}>{tt('shopManage','ຍັງບໍ່ມີສິນຄ້າ — ກົດ «＋ ເພີ່ມສິນຄ້າ»')}</Text>
              ) : (
                products.map((p) => {
                  const sale = saleInfo(p);
                  return (
                  <View key={p.id} style={styles.pRow}>
                    <Image source={{ uri: p.images?.[0] }} style={styles.pThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>{p.name}</Text>
                      <Text style={styles.pMeta}>{p.price.toLocaleString()}{tt('shopManage',' ກີບ / ')}{p.unit} · stock {p.stock ?? '—'}</Text>
                      <View style={styles.badges}>
                        <Text style={[styles.badge, p.approved ? styles.bOk : styles.bPend]}>{p.approved ? tt('shopManage','✓ ອະນຸມັດ') : tt('shopManage','⏳ ລໍກວດ')}</Text>
                        {!p.active && <Text style={[styles.badge, styles.bOff]}>{tt('shopManage','ປິດ')}</Text>}
                        {sale.onSale && <Text style={[styles.badge, styles.bSale]}>⚡ -{sale.pct}%</Text>}
                        {!!p.memberDiscounts?.length && <Text style={[styles.badge, styles.bMem]}>🏷️ {tt('shopManage','ສະມາຊິກ')}</Text>}
                      </View>
                    </View>
                    <View style={styles.pActions}>
                      <View style={styles.pActRow}>
                        <Pressable style={[styles.miniBtn, sale.onSale && styles.dealBtnOn]} onPress={() => openDeal(p)}>
                          <Text style={[styles.miniBtnText, sale.onSale && styles.dealBtnTextOn]}>⚡</Text>
                        </Pressable>
                        <Pressable style={[styles.miniBtn, !!p.memberDiscounts?.length && styles.memBtnOn]} onPress={() => openMem(p)}>
                          <Text style={[styles.miniBtnText, !!p.memberDiscounts?.length && styles.dealBtnTextOn]}>🏷️</Text>
                        </Pressable>
                      </View>
                      <Pressable style={[styles.toggle, { backgroundColor: p.active ? '#16a34a' : '#64748b' }]} onPress={() => setProductActive(p.id, !p.active)}>
                        <Text style={styles.toggleText}>{p.active ? tt('shopManage','ເປີດ') : tt('shopManage','ປິດ')}</Text>
                      </Pressable>
                    </View>
                  </View>
                  );
                })
              )}
              </>
              )}
            </>
          )}

          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      <BottomSheet visible={adding} onClose={() => { resetP(); setAdding(false); }}>
        <View>
          <Text style={styles.sheetTitle}>{tt('shopManage','＋ ເພີ່ມສິນຄ້າ')}</Text>
          <Text style={styles.label}>{tt('shopManage','ຊື່ສິນຄ້າ *')}</Text>
          <TextInput value={pName} onChangeText={setPName} placeholder={tt('shopManage','ເຊັ່ນ: ປູນຊີມັງ')} placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>{tt('shopManage','ໝວດ *')}</Text>
          <View style={styles.catChips}>
            {cats.filter((c) => c.active !== false).map((c) => (
              <Pressable key={c.id} style={[styles.chip, pCat?.id === c.id && styles.chipOn]} onPress={() => setPCat(c)}>
                <Text style={[styles.chipText, pCat?.id === c.id && styles.chipTextOn]}><CategoryIcon icon={c.icon} size={13} color={pCat?.id === c.id ? '#fff' : colors.text2} /> {c.nameLao}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rowG}>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.label}>{tt('shopManage','ລາຄາ (ກີບ) *')}</Text>
              <TextInput value={pPrice ? Number(pPrice.replace(/\D/g, '')).toLocaleString('en-US') : ''} onChangeText={(v) => setPPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt('shopManage','ຫົວໜ່ວຍ')}</Text>
              <TextInput value={pUnit} onChangeText={setPUnit} placeholder={tt('shopManage','ອັນ')} placeholderTextColor="#999" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>stock</Text>
              <TextInput value={pStock === '' ? '' : Number(pStock).toLocaleString('en-US')} onChangeText={(v) => setPStock(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.input} />
            </View>
          </View>
          <Text style={styles.label}>{tt('shopManage','ລາຍລະອຽດ')}</Text>
          <RichTextEditor value={pDesc} onChange={setPDesc} placeholder={tt('shopManage','ລາຍລະອຽດສິນຄ້າ (ໜາ / ຫົວຂໍ້ / ບຸລິດ ໄດ້)')} />

          <View style={styles.rowG}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt('shopManage','ຍີ່ຫໍ້')}</Text>
              <TextInput value={pBrand} onChangeText={setPBrand} placeholder={tt('shopManage','ເຊັ່ນ: COTTO')} placeholderTextColor="#999" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt('shopManage','ລຸ້ນ / ລະຫັດ')}</Text>
              <TextInput value={pModel} onChangeText={setPModel} placeholder={tt('shopManage','ເຊັ່ນ: CT1063')} placeholderTextColor="#999" style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>{tt('shopManage','📋 ຂໍ້ມູນ ເຕັກນິກ')}</Text>
          <RichTextEditor value={pSpecs} onChange={setPSpecs} placeholder={tt('shopManage','ວັດສະດຸ · ຂະໜາດ · ຮັບປະກັນ...')} />

          <Text style={styles.label}>{tt('shopManage','✅ ການນຳໃຊ້ ທີ່ເໝາະສົມ')}</Text>
          <RichTextEditor value={pUsage} onChange={setPUsage} placeholder={tt('shopManage','ໃຊ້ ກັບ ອ່າງ ລ້າງໜ້າ...')} />

          <Text style={styles.label}>{tt('shopManage','🖼️ ຕົວຢ່າງ ການນຳໃຊ້')}</Text>
          <RichTextEditor value={pExamples} onChange={setPExamples} placeholder={tt('shopManage','ຫ້ອງນ້ຳ ບ້ານ · ໂຮງແຮມ...')} />

          <Text style={styles.label}>{tt('shopManage','🔧 ເຕັກນິກ / ຄູ່ມື ການຕິດຕັ້ງ')}</Text>
          <RichTextEditor value={pInstall} onChange={setPInstall} placeholder={tt('shopManage','ຂັ້ນຕອນ ການ ຕິດຕັ້ງ...')} />

          <Text style={styles.label}>{tt('shopManage','⚠️ ຄວາມປອດໄພ')}</Text>
          <RichTextEditor value={pSafety} onChange={setPSafety} placeholder={tt('shopManage','ຂໍ້ ຄວນ ລະວັງ...')} />

          <View style={styles.vHead}>
            <Text style={styles.label}>{tt('shopManage','ຕົວເລືອກ (variants) — ບໍ່ບັງຄັບ')}</Text>
            <Pressable onPress={addGroup}><Text style={styles.vAdd}>{tt('shopManage','＋ ກຸ່ມ')}</Text></Pressable>
          </View>
          {pVariants.map((g, gi) => (
            <View key={gi} style={styles.vBox}>
              <View style={styles.vRow}>
                <TextInput value={g.name} onChangeText={(t) => setGroupName(gi, t)} placeholder={tt('shopManage','ຊື່ກຸ່ມ (ເຊັ່ນ ຂະໜາດ/ສີ)')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                <Pressable onPress={() => rmGroup(gi)} style={styles.vRm}><Text style={styles.vRmText}>✕</Text></Pressable>
              </View>
              {g.options.map((o, oi) => (
                <View key={oi} style={styles.vRow}>
                  <TextInput value={o.label} onChangeText={(t) => setOpt(gi, oi, { label: t })} placeholder={tt('shopManage','ຕົວເລືອກ')} placeholderTextColor="#999" style={[styles.input, { flex: 1.4 }]} />
                  <AmountInput value={o.priceDelta ?? 0} onChangeValue={(n) => setOpt(gi, oi, { priceDelta: n })} placeholder={tt('shopManage','+ລາຄາ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                </View>
              ))}
              <Pressable onPress={() => addOpt(gi)} style={styles.vOptAdd}><Text style={styles.vAdd}>{tt('shopManage','＋ ຕົວເລືອກ')}</Text></Pressable>
            </View>
          ))}

          <Text style={styles.label}>{tt('shopManage','ຮູບ')}</Text>
          <PhotoPicker photos={pImages} onChange={setPImages} pathPrefix={`products/${fbUser?.uid ?? 'anon'}`} max={3} />
          {err !== '' && <Text style={styles.err}>❌ {err}</Text>}
          <Pressable style={[styles.btn, savingP && styles.btnOff]} onPress={addProduct} disabled={savingP}>
            <Text style={styles.btnText}>{savingP ? tt('shopManage','ກຳລັງບັນທຶກ...') : tt('shopManage','💾 ບັນທຶກ (ລໍ admin ອະນຸມັດ)')}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!dealFor} onClose={() => setDealFor(null)}>
        {dealFor && (
          <View>
            <Text style={styles.sheetTitle}>⚡ {tt('shopManage','ຕັ້ງ Flash deal')}</Text>
            <Text style={styles.dealName}>{dealFor.name}</Text>
            <Text style={styles.dealHint}>{tt('shopManage','ລາຄາປົກກະຕິ')}: {(dealFor.price ?? 0).toLocaleString()} {tt('shopManage','ກີບ')}</Text>

            <Text style={styles.label}>{tt('shopManage','ລາຄາ Flash (ກີບ)')}</Text>
            <TextInput
              value={dPrice ? Number(dPrice.replace(/\D/g, '')).toLocaleString('en-US') : ''}
              onChangeText={(v) => setDPrice(v.replace(/\D/g, ''))}
              keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.input}
            />
            <Text style={styles.label}>{tt('shopManage','ໄລຍະເວລາ')}</Text>
            <View style={styles.durs}>
              {DEAL_DAYS.map((d, i) => (
                <Pressable key={d.label} style={[styles.dur, dDurIdx === i && styles.durOn]} onPress={() => setDDurIdx(i)}>
                  <Text style={[styles.durText, dDurIdx === i && styles.durTextOn]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
            {dErr !== '' && <Text style={styles.err}>❌ {dErr}</Text>}
            <Pressable style={[styles.btn, dSaving && styles.btnOff]} onPress={saveDeal} disabled={dSaving}>
              <Text style={styles.btnText}>{dSaving ? '...' : tt('shopManage','💾 ຕັ້ງ deal')}</Text>
            </Pressable>
            {saleInfo(dealFor).onSale && (
              <Pressable style={styles.clearDealBtn} onPress={clearDeal} disabled={dSaving}>
                <Text style={styles.clearDealText}>🗑️ {tt('shopManage','ລຶບ deal')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!memFor} onClose={() => setMemFor(null)}>
        {memFor && (
          <View>
            <Text style={styles.sheetTitle}>🏷️ {tt('shopManage','ລາຄາສະມາຊິກ ຂອງ ສິນຄ້ານີ້')}</Text>
            <Text style={styles.dealName}>{memFor.name}</Text>
            <Text style={styles.dealHint}>{tt('shopManage','ຕັ້ງ ສ່ວນຫຼຸດ % ຕໍ່ ກຸ່ມ (ທັບ ຄ່າ ຮ້ານ/ທົ່ວລະບົບ). ວ່າງ/0 = ບໍ່ຕັ້ງ.')}</Text>
            {MEMBER_GROUPS.map((g) => (
              <View key={g.key} style={styles.memRow}>
                <Text style={styles.memGroup}>{g.icon} {g.label}</Text>
                <TextInput
                  value={memPcts[g.key] ?? ''}
                  onChangeText={(v) => setMemPcts((p) => ({ ...p, [g.key]: v.replace(/\D/g, '') }))}
                  keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.memPct}
                />
                <Text style={styles.pMemUnit}>%</Text>
              </View>
            ))}
            <Pressable style={[styles.btn, mSaving && styles.btnOff]} onPress={saveMem} disabled={mSaving}>
              <Text style={styles.btnText}>{mSaving ? '...' : tt('shopManage','💾 ບັນທຶກ')}</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  muted: { color: colors.text3, textAlign: 'center' },
  card: { backgroundColor: colors.surface, padding: 20, borderRadius: radius.xl, ...shadow.card },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginBottom: 8 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  btn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 16 },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  shopHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  shopName: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  shopMeta: { fontSize: font.sm, color: colors.text3 },
  roleTag: { fontSize: font.sm, fontWeight: '700', color: '#5b21b6', backgroundColor: '#ede9fe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  stabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  stab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stabOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  stabText: { fontSize: font.sm, color: colors.text2, fontWeight: '600' },
  stabTextOn: { color: '#0066CC', fontWeight: '700' },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, padding: 13, alignItems: 'center', marginBottom: 14 },
  addBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  empty: { fontSize: font.sm, color: colors.text3, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  pRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 8, ...shadow.card },
  pThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surface2 },
  pName: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  pMeta: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  bOk: { backgroundColor: '#d1fae5', color: '#065f46' },
  bPend: { backgroundColor: '#fef3c7', color: '#92400e' },
  bOff: { backgroundColor: '#fee2e2', color: '#991b1b' },
  bSale: { backgroundColor: '#fef2f2', color: '#dc2626', fontWeight: '800' },
  bMem: { backgroundColor: '#faf5ff', color: '#7c3aed', fontWeight: '800' },
  pActions: { alignItems: 'flex-end', gap: 6 },
  pActRow: { flexDirection: 'row', gap: 6 },
  miniBtn: { borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  miniBtnText: { fontSize: font.sm, color: colors.text2, fontWeight: '700' },
  dealBtnOn: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  memBtnOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  dealBtnTextOn: { color: '#fff' },
  memRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  memGroup: { flex: 1, fontSize: font.sm, color: colors.text },
  memPct: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.md, color: colors.text, textAlign: 'center' },
  pMemUnit: { fontSize: font.md, color: colors.text2 },
  toggle: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7 },
  toggleText: { fontSize: font.xs, color: '#fff', fontWeight: '600' },
  dealName: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 2 },
  dealHint: { fontSize: font.xs, color: colors.text3, marginTop: 4 },
  durs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dur: { flexGrow: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  durOn: { backgroundColor: '#fef2f2', borderColor: '#dc2626' },
  durText: { fontSize: font.sm, color: colors.text2, fontWeight: '600' },
  durTextOn: { color: '#dc2626', fontWeight: '700' },
  clearDealBtn: { borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#dc2626' },
  clearDealText: { color: '#dc2626', fontSize: font.sm, fontWeight: '700' },
  sheetTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text, marginBottom: 4 },
  catChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  rowG: { flexDirection: 'row', gap: 8 },
  vHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vAdd: { color: colors.primary, fontSize: font.xs, fontWeight: '700', marginTop: 12 },
  vBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, marginTop: 6, gap: 6, backgroundColor: '#fafbfc' },
  vRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  vRm: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  vRmText: { color: colors.error, fontSize: 15, fontWeight: '700' },
  vOptAdd: { alignSelf: 'flex-start' },
  err: { color: colors.error, fontSize: font.sm, marginTop: 10 },
});
