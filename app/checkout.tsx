import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { type Coupon, redeemCoupon, validateCoupon, watchAllCoupons } from '@/lib/coupons';
import { useTT } from '@/lib/i18n';
import { pickActiveOrg, watchMyOrgs, type Org } from '@/lib/orgs';
import PhotoPicker from '@/components/PhotoPicker';
import {
  type BankAccount,
  computeTotals,
  type DeliveryMethod,
  getOrderWithItems,
  placeOrder,
  seedBankAccountIfEmpty,
  updateOrderStatus,
  watchBankAccounts,
} from '@/lib/orders';
import {
  type PaymentProvider,
  paymentMethodFor,
  requiresSlip,
  seedPaymentProvidersIfEmpty,
  watchEnabledPaymentProviders,
} from '@/lib/paymentProviders';
import {
  type LogisticsProvider,
  LOGISTICS_TIER_LABEL,
  resolveDeliveryFee,
  seedLogisticsProvidersIfEmpty,
  watchEnabledLogisticsProviders,
} from '@/lib/logisticsProviders';
import { earnPointsFor, maxRedeemable, reservePoints, useLoyalty } from '@/lib/loyalty';
import { customerBalance, spendFromWallet, watchMySpends, watchMyTopups, type WalletSpend, type WalletTopup } from '@/lib/customerWallet';
import { buyerGroup, memberGroupLabel, memberUnitPrice, resolveMemberPct } from '@/lib/memberPricing';
import { getShopById, saleInfo, type Shop } from '@/lib/shop';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import LocationPicker from '@/components/LocationPicker';
import { distanceKm, feeForDistance, tierLabel } from '@/lib/geo';
import AmountInput from '@/components/AmountInput';
import { newAddressId, type SavedAddress, saveUserAddresses } from '@/lib/addresses';
import AppFooter from '@/components/AppFooter';

const PICKUP = 'pickup';

export default function CheckoutScreen() {
  const { fbUser, profile } = useAuth();
  const { items: allItems, clear, clearShop } = useCart();
  const { shop: shopParam } = useLocalSearchParams<{ shop?: string }>();
  const tt = useTT();
  // check out ONE shop at a time (multi-shop cart → one order per shop)
  const items = useMemo(
    () => (shopParam ? allItems.filter((i) => i.product.shopId === shopParam) : allItems),
    [allItems, shopParam],
  );
  // B2B — bill this purchase to a company (auto-invoice on completion)
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [billOrgId, setBillOrgId] = useState<string | null>(null);
  useEffect(() => { if (fbUser) return watchMyOrgs(fbUser.uid, setOrgs); }, [fbUser]);
  const [address, setAddress] = useState(profile?.address ?? '');
  // saved delivery addresses (tied to the account) + new-address entry
  const savedAddrs: SavedAddress[] = profile?.savedAddresses ?? [];
  const [addrMode, setAddrMode] = useState<'saved' | 'new'>('new');
  const [selAddrId, setSelAddrId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saveNew, setSaveNew] = useState(true);
  const [slip, setSlip] = useState<string[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [payProviders, setPayProviders] = useState<PaymentProvider[]>([]);
  const [logiProviders, setLogiProviders] = useState<LogisticsProvider[]>([]);
  const [payId, setPayId] = useState<string>('');
  // customer HomeSang-wallet balance (for the "pay from wallet" option)
  const [wTopups, setWTopups] = useState<WalletTopup[]>([]);
  const [wSpends, setWSpends] = useState<WalletSpend[]>([]);
  const [deliveryChoice, setDeliveryChoice] = useState<string>(''); // logistics provider id OR 'pickup'
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false); // order placed → don't bounce to cart
  const [error, setError] = useState('');
  // loyalty / store-credit
  const { summary: loyalty, earnPct, maxRedeemPct, enabled: loyaltyEnabled } = useLoyalty(fbUser?.uid);
  const [redeemOn, setRedeemOn] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  // delivery pin (optional) → real distance → admin-configured rate tier
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [showMap, setShowMap] = useState(false);
  // member / account-group pricing
  const [shop, setShop] = useState<Shop | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => watchAppSettings(setSettings), []);
  useEffect(() => watchAllCoupons(setCoupons), []);
  useEffect(() => {
    const shopId = items[0]?.product.shopId;
    if (!shopId) { setShop(null); return; }
    getShopById(shopId).then(setShop).catch(() => setShop(null));
  }, [items]);

  useEffect(() => {
    seedBankAccountIfEmpty().catch(() => {});
    seedPaymentProvidersIfEmpty().catch(() => {});
    seedLogisticsProvidersIfEmpty().catch(() => {});
    const u1 = watchBankAccounts(setBanks);
    const u2 = watchEnabledPaymentProviders(setPayProviders);
    const u3 = watchEnabledLogisticsProviders(setLogiProviders);
    return () => { u1(); u2(); u3(); };
  }, []);

  // customer wallet balance — powers the "ຈ່າຍ ຈາກ ກະເປົາ" option
  useEffect(() => {
    if (!fbUser) { setWTopups([]); setWSpends([]); return; }
    const a = watchMyTopups(fbUser.uid, setWTopups);
    const b = watchMySpends(fbUser.uid, setWSpends);
    return () => { a(); b(); };
  }, [fbUser]);
  const cwBalance = customerBalance(wTopups, wSpends);

  useEffect(() => {
    if (!fbUser) router.replace('/sign-in');
    // empty shop-subset → back to cart, but NOT once an order was just placed
    // (that empties the cart and we're already navigating to /orders)
    if (items.length === 0 && !submitting && !placed) router.replace('/cart' as any);
  }, [fbUser, items.length, submitting, placed]);

  // Payment options: enabled providers, else fall back to legacy bank accounts + COD.
  const payOptions: PaymentProvider[] = useMemo(() => {
    const base: PaymentProvider[] = payProviders.length
      ? [...payProviders]
      : [
          ...banks.map((b, i): PaymentProvider => ({
            id: `bank_${b.id}`, name: b.bankName, type: 'bank_transfer',
            bankName: b.bankName, accountName: b.accountName, accountNumber: b.accountNumber,
            enabled: true, order: i,
          })),
          { id: 'cod', name: tt('checkout', 'ເກັບເງິນປາຍທາງ (COD)'), type: 'cod', enabled: true, order: 99 },
        ];
    // A signed-in buyer can pay instantly from their HomeSang wallet — listed
    // first. The balance + sufficiency are shown/enforced at render + submit.
    if (fbUser) {
      base.unshift({ id: 'wallet', name: tt('checkout', 'ກະເປົາ ເງິນ HomeSang'), type: 'wallet', enabled: true, order: -1 });
    }
    return base;
  }, [payProviders, banks, tt, fbUser]);

  // default-select the first payment option once loaded
  useEffect(() => {
    if (!payId && payOptions.length) setPayId(payOptions[0].id);
  }, [payOptions, payId]);
  // default-select the first delivery layer once loaded
  useEffect(() => {
    if (!deliveryChoice && logiProviders.length) setDeliveryChoice(logiProviders[0].id);
  }, [logiProviders, deliveryChoice]);

  // default to the first saved address once the profile loads
  useEffect(() => {
    if (savedAddrs.length && !selAddrId) {
      const a = savedAddrs[0];
      setAddrMode('saved');
      setSelAddrId(a.id);
      setAddress(a.address);
      if (a.lat != null && a.lng != null) setDest({ lat: a.lat, lng: a.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddrs.length]);
  const pickSaved = (a: SavedAddress) => {
    setAddrMode('saved'); setSelAddrId(a.id);
    setAddress(a.address);
    setDest(a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
  };
  const pickNew = () => { setAddrMode('new'); setSelAddrId(''); setAddress(''); setDest(null); };

  const selectedPay = payOptions.find((p) => p.id === payId) ?? null;
  const isPickup = deliveryChoice === PICKUP;
  const selectedLogi = logiProviders.find((l) => l.id === deliveryChoice) ?? null;
  const deliveryMethod: DeliveryMethod = isPickup ? 'pickup' : 'delivery';
  // distance shop → drop pin (only when BOTH ends have coordinates)
  const tripKm = (!isPickup && dest && shop?.lat != null && shop?.lng != null)
    ? distanceKm({ lat: shop.lat, lng: shop.lng }, dest)
    : undefined;
  // fee: pickup 0; a chosen provider prices by distance using the ADMIN-set
  // rate tiers (falls back to its flat fee when no pin / no tiers); else legacy.
  const feeOverride = isPickup ? 0 : selectedLogi ? feeForDistance(selectedLogi, tripKm) : undefined;
  const kmTier = tripKm != null ? tierLabel(selectedLogi?.deliveryRates, tripKm) : '';
  // member/group discount: best-price-wins per item, from the buyer's group +
  // product/shop/global rules (all admin-configurable). Applied pre-tax.
  const memGroup = buyerGroup(profile as any);
  const memberDiscount = items.reduce((sum, i) => {
    const { pct } = resolveMemberPct(i.product, memGroup, shop?.memberDiscountRules, settings?.memberDiscounts);
    // The member price is derived from the ORIGINAL unit price, which must
    // include the chosen variant's delta — the cart only stores the effective
    // unitPrice, so recover the delta as (effective − sale-effective base).
    // Passing the bare product.price (as before) made a variant product look far
    // cheaper than the line actually is and massively over-discounted it:
    // base 100k + variant 50k at 10% off gave 60k off instead of 15k.
    const base = saleInfo(i.product).price;
    const variantDelta = Math.max(0, i.unitPrice - base);
    const origUnit = (i.product.price ?? i.unitPrice) + variantDelta;
    const finalUnit = memberUnitPrice(i.unitPrice, origUnit, pct);
    return sum + Math.max(0, i.unitPrice - finalUnit) * i.qty;
  }, 0);

  // loyalty redemption: cap by balance AND maxRedeemPct of the POST-member goods
  const subtotalOnly = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const maxRedeem = maxRedeemable(Math.max(0, subtotalOnly - memberDiscount), loyalty.balance, maxRedeemPct);
  const pointsUsed = redeemOn ? Math.min(parseInt(redeemInput.replace(/\D/g, ''), 10) || 0, maxRedeem) : 0;
  // promo/discount code — re-validated every render so an expired/limit-hit code
  // silently stops discounting (and the applied banner drops it).
  const couponRes = appliedCoupon ? validateCoupon(appliedCoupon.code, coupons, { subtotal: subtotalOnly, phone: (profile as any)?.phone }) : null;
  const couponDiscount = couponRes?.ok ? couponRes.discount : 0;
  const t = computeTotals(items, deliveryMethod, feeOverride, pointsUsed, memberDiscount, couponDiscount);
  const willEarn = earnPointsFor(Math.max(0, t.subtotal - memberDiscount - pointsUsed), earnPct);

  const applyCoupon = () => {
    const res = validateCoupon(couponInput, coupons, { subtotal: subtotalOnly, phone: (profile as any)?.phone });
    if (res.ok && res.coupon) { setAppliedCoupon(res.coupon); setCouponMsg(''); }
    else { setAppliedCoupon(null); setCouponMsg(res.reason || tt('checkout', 'ໃຊ້ ລະຫັດ ບໍ່ ໄດ້')); }
  };
  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput(''); setCouponMsg(''); };

  const submit = async () => {
    if (!fbUser || !selectedPay) return;
    if (deliveryMethod === 'delivery' && !address) {
      setError(tt('checkout', 'ກະລຸນາໃສ່ທີ່ຢູ່ສົ່ງ'));
      return;
    }
    if (requiresSlip(selectedPay.type) && slip.length === 0) {
      setError(tt('checkout', 'ກະລຸນາອັບໂຫຼດສະລິບໂອນເງິນ'));
      return;
    }
    if (selectedPay.minAmount && t.grandTotal < selectedPay.minAmount) {
      setError(tt('checkout', 'ຍອດຕ່ຳກວ່າ ຂັ້ນຕ່ຳ ຂອງ ຊ່ອງທາງນີ້'));
      return;
    }
    if (selectedPay.maxAmount && t.grandTotal > selectedPay.maxAmount) {
      setError(tt('checkout', 'ຍອດເກີນ ຂັ້ນສູງ ຂອງ ຊ່ອງທາງນີ້'));
      return;
    }
    // wallet: make sure the balance covers the total before we place anything
    // (the server re-checks authoritatively when it debits).
    if (selectedPay.type === 'wallet' && cwBalance < t.grandTotal) {
      setError(`${tt('checkout', 'ຍອດ ໃນ ກະເປົາ ບໍ່ ພຽງພໍ')} — ${tt('checkout', 'ເຫຼືອ')} ${cwBalance.toLocaleString('en-US')} / ${t.grandTotal.toLocaleString('en-US')} ${tt('checkout', 'ກີບ')}`);
      return;
    }
    setSubmitting(true);
    setError('');
    // broker affiliate: a ?ref code stashed from a shared link attributes this sale
    let brokerCode: string | undefined;
    try { brokerCode = (typeof window !== 'undefined' ? window.localStorage?.getItem('hs_ref') : null) || undefined; } catch { /* ignore */ }
    try {
      // Commit the points FIRST: the reservation is transactional and bounded by
      // the server-written ledger, so two checkouts sent at once can't both spend
      // the same balance. If this throws, the order is never placed.
      if (pointsUsed > 0) {
        try {
          await reservePoints(fbUser.uid, pointsUsed);
        } catch {
          setError(tt('checkout', 'ຄະແນນ ສະສົມ ບໍ່ ພຽງພໍ ແລ້ວ — ໂຫຼດ ໜ້າ ໃໝ່ ແລ້ວ ລອງ ອີກ ຄັ້ງ'));
          setSubmitting(false);
          return;
        }
      }
      const orderId = await placeOrder({
        customerId: fbUser.uid,
        orgId: billOrgId || undefined,
        items,
        paymentMethod: paymentMethodFor(selectedPay.type),
        paymentProviderId: selectedPay.id.startsWith('bank_') ? undefined : selectedPay.id,
        paymentProviderName: selectedPay.name,
        deliveryMethod,
        deliveryAddress: deliveryMethod === 'delivery' ? address : undefined,
        logisticsProviderId: selectedLogi?.id,
        logisticsProviderName: selectedLogi?.name,
        logisticsTier: selectedLogi?.tier,
        deliveryFee: feeOverride,
        slipUrl: slip[0],
        brokerCode,
        pointsRedeemed: pointsUsed > 0 ? pointsUsed : undefined,
        memberDiscount: memberDiscount > 0 ? memberDiscount : undefined,
        memberGroup: memberDiscount > 0 ? memGroup : undefined,
        couponDiscount: couponDiscount > 0 ? couponDiscount : undefined,
        couponCode: couponDiscount > 0 ? appliedCoupon?.code : undefined,
        customerPhone: (profile as any)?.phone || undefined,
        deliveryLat: dest?.lat,
        deliveryLng: dest?.lng,
        distanceKm: tripKm != null ? Math.round(tripKm * 10) / 10 : undefined,
      });
      // Log the coupon redemption (who/when/order) + bump its usedCount — best-effort.
      if (appliedCoupon && couponDiscount > 0 && fbUser) {
        redeemCoupon(appliedCoupon, { userId: fbUser.uid, userPhone: (profile as any)?.phone, orderId, discount: couponDiscount });
      }
      // Pay from the HomeSang wallet: the server debits the balance AND marks
      // this order paid (paymentVerified) in one authoritative step, so the
      // customer never self-verifies. If it fails we must not cancel a debit
      // that actually went through — re-read the order and only roll back when
      // it's genuinely still unpaid (a rare insufficient-balance race).
      if (selectedPay.type === 'wallet') {
        try {
          await spendFromWallet(t.grandTotal, 'order', orderId);
        } catch (spendErr: any) {
          let paid = false;
          try { paid = !!(await getOrderWithItems(orderId))?.order.paymentVerified; } catch { /* ignore */ }
          if (!paid) {
            try { await updateOrderStatus(orderId, 'cancelled'); } catch { /* best-effort */ }
            setError(spendErr?.message ?? tt('checkout', 'ຈ່າຍ ຈາກ ກະເປົາ ບໍ່ ສຳເລັດ'));
            setSubmitting(false);
            return;
          }
          // otherwise the debit did land — fall through to the success path
        }
      }
      // rider-served layers spawn a delivery task; the onDeliveryTaskCreated
      // Cloud Function pings every approved rider server-side (the client no
      // longer reads the private `riders` collection to do this).
      try { if (brokerCode && typeof window !== 'undefined') window.localStorage?.removeItem('hs_ref'); } catch { /* ignore */ }
      // remember a new delivery address on the account for next time
      if (deliveryMethod === 'delivery' && addrMode === 'new' && saveNew && address.trim()) {
        try {
          const na: SavedAddress = { id: newAddressId(), label: newLabel.trim() || undefined, address: address.trim(), lat: dest?.lat, lng: dest?.lng, phone: (profile as any)?.phone };
          await saveUserAddresses(fbUser.uid, [...savedAddrs, na]);
        } catch { /* best-effort */ }
      }
      // clear ONLY this shop's items — other shops stay in the cart for their own order
      setPlaced(true);
      const orderShopId = shopParam || items[0]?.product.shopId;
      if (orderShopId) clearShop(orderShopId); else clear();
      router.replace('/orders' as any);
    } catch (e: any) {
      console.error('placeOrder:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('checkout', '💳 ຊຳລະເງິນ')}</Text>

        {/* ===== 1 · Delivery layer ===== */}
        <Text style={styles.label}>{tt('checkout', 'ວິທີຮັບສິນຄ້າ')}</Text>
        {logiProviders.length > 0 ? (
          <>
            {logiProviders.map((l) => {
              const on = deliveryChoice === l.id;
              // quote each layer at the measured distance when a pin exists
              const fee = dest && shop?.lat != null && shop?.lng != null
                ? feeForDistance(l, distanceKm({ lat: shop.lat, lng: shop.lng }, dest))
                : resolveDeliveryFee(l);
              return (
                <Pressable key={l.id} style={[styles.layer, on && styles.layerSel]} onPress={() => setDeliveryChoice(l.id)}>
                  <Text style={[styles.layerH, on && styles.layerHSel]}>{LOGISTICS_TIER_LABEL[l.tier]?.split(' ')[0] ?? '📦'} {l.name}</Text>
                  <Text style={styles.layerD}>{l.coverage ?? ''}{l.speed ? ` · ${l.speed}` : ''} · {fee > 0 ? `${fee.toLocaleString()} ${tt('checkout', 'ກີບ')}` : tt('checkout', 'ຟຣີ')}{l.codSupported ? ' · COD' : ''}</Text>
                </Pressable>
              );
            })}
            <Pressable style={[styles.layer, isPickup && styles.layerSel]} onPress={() => setDeliveryChoice(PICKUP)}>
              <Text style={[styles.layerH, isPickup && styles.layerHSel]}>🏬 {tt('checkout', 'ມາຮັບເອງ')}</Text>
              <Text style={styles.layerD}>{tt('checkout', 'ຮັບທີ່ຮ້ານ · ບໍ່ເສຍຄ່າສົ່ງ')}</Text>
            </Pressable>
          </>
        ) : (
          // fallback: legacy delivery|pickup toggle (providers not seeded yet)
          <View style={styles.opts}>
            <Pressable style={[styles.opt, !isPickup && styles.optSel]} onPress={() => setDeliveryChoice('')}>
              <Text style={[styles.optText, !isPickup && styles.optTextSel]}>{tt('checkout', '🚚 ສົ່ງເຖິງບ້ານ')}</Text>
            </Pressable>
            <Pressable style={[styles.opt, isPickup && styles.optSel]} onPress={() => setDeliveryChoice(PICKUP)}>
              <Text style={[styles.optText, isPickup && styles.optTextSel]}>{tt('checkout', '🏬 ມາຮັບເອງ')}</Text>
            </Pressable>
          </View>
        )}

        {deliveryMethod === 'delivery' && (
          <>
            <Text style={styles.label}>{tt('checkout', 'ທີ່ຢູ່ ສົ່ງ')}</Text>

            {/* saved addresses tied to the account */}
            {savedAddrs.map((a) => {
              const on = addrMode === 'saved' && selAddrId === a.id;
              return (
                <Pressable key={a.id} style={[styles.addrCard, on && styles.addrCardOn]} onPress={() => pickSaved(a)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.addrLabel}>📍 {a.label || tt('checkout', 'ທີ່ຢູ່')}{a.lat != null ? ` · ${tt('checkout', 'ມີ ໝຸດ')}` : ''}</Text>
                    <Text style={styles.addrText} numberOfLines={2}>{a.address}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
            <Pressable style={[styles.addrCard, addrMode === 'new' && styles.addrCardOn]} onPress={pickNew}>
              <Text style={styles.addrNew}>＋ {tt('checkout', savedAddrs.length ? 'ໃຊ້ ທີ່ຢູ່ ໃໝ່' : 'ໃສ່ ທີ່ຢູ່ ຈັດສົ່ງ')}</Text>
              <View style={[styles.radio, addrMode === 'new' && styles.radioOn]}>{addrMode === 'new' ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>

            {addrMode === 'new' && (
              <>
                <TextInput value={newLabel} onChangeText={setNewLabel} placeholder={tt('checkout', 'ຊື່ ທີ່ຢູ່ (ບ້ານ / ຫ້ອງການ) — ບໍ່ບັງຄັບ')} placeholderTextColor="#999" style={[styles.input, { marginTop: 8 }]} />
                <TextInput value={address} onChangeText={setAddress} placeholder={tt('checkout', 'ບ້ານ ເມືອງ ແຂວງ')} placeholderTextColor="#999" style={[styles.input, styles.textarea, { marginTop: 8 }]} multiline />
                <Pressable style={styles.pinToggle} onPress={() => setShowMap((s) => !s)}>
                  <Text style={styles.pinToggleText}>
                    {dest ? `📌 ${tt('checkout', 'ປັກໝຸດ ແລ້ວ')}${tripKm != null ? ` · ${tripKm.toFixed(1)} ${tt('checkout', 'ກມ')}` : ''} — ${tt('checkout', 'ແກ້ໄຂ')}` : `📍 ${tt('checkout', 'ປັກໝຸດ ຈຸດສົ່ງ (ໃຫ້ຄ່າສົ່ງແມ່ນຢຳ)')}`}
                  </Text>
                </Pressable>
                {showMap && <LocationPicker value={dest} onChange={setDest} />}
                <Pressable style={styles.saveToggle} onPress={() => setSaveNew((s) => !s)}>
                  <View style={[styles.sw, saveNew && styles.swOn]}><View style={[styles.swDot, saveNew && styles.swDotOn]} /></View>
                  <Text style={styles.saveToggleTx}>💾 {tt('checkout', 'ບັນທຶກ ທີ່ຢູ່ ນີ້ ໄວ້ ໃຊ້ ຄັ້ງ ໜ້າ')}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ===== 2 · Payment provider ===== */}
        <Text style={styles.label}>{tt('checkout', 'ວິທີຈ່າຍ')}</Text>
        {payOptions.map((p) => {
          const on = payId === p.id;
          return (
            <Pressable key={p.id} style={[styles.pp, on && styles.ppSel]} onPress={() => setPayId(p.id)}>
              <View style={styles.ppHead}>
                <Text style={styles.ppLogo}>{p.type === 'cod' ? '💵' : p.type === 'wallet' ? '👛' : p.type === 'qr_static' ? '📷' : '🏦'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ppName}>
                    {p.name
                      || (p.type === 'cod' ? tt('checkout', 'ເກັບເງິນ ປາຍທາງ (COD)')
                        : p.type === 'qr_static' ? tt('checkout', 'ຈ່າຍ ຜ່ານ QR')
                        : p.type === 'bank_transfer' ? (p.bankName || tt('checkout', 'ໂອນ ທະນາຄານ'))
                        : tt('checkout', 'ຊ່ອງທາງ ຈ່າຍເງິນ'))}
                  </Text>
                  {!!p.instructions && <Text style={styles.ppSubtle} numberOfLines={2}>{p.instructions}</Text>}
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </View>
              {on && p.type === 'wallet' && (
                <View style={styles.ppBody}>
                  <Text style={styles.bankRow}>
                    {tt('checkout', 'ຍອດ ໃນ ກະເປົາ:')}{' '}
                    <Text style={[styles.bankB, cwBalance < t.grandTotal && { color: '#c0392b' }]}>
                      {cwBalance.toLocaleString('en-US')} {tt('checkout', 'ກີບ')}
                    </Text>
                  </Text>
                  {cwBalance < t.grandTotal ? (
                    <Pressable onPress={() => router.push('/wallet' as any)}>
                      <Text style={styles.walletTopupLink}>
                        ⚠️ {tt('checkout', 'ຍອດ ບໍ່ ພຽງພໍ')} — {tt('checkout', 'ແຕະ ເພື່ອ ເຕີມ ເງິນ')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.ppSubtle}>{tt('checkout', 'ຫັກ ຈາກ ຍອດ ທັນທີ — ບໍ່ ຕ້ອງ ອັບ ສະລິບ')}</Text>
                  )}
                </View>
              )}
              {on && p.type !== 'cod' && p.type !== 'wallet' && (
                <View style={styles.ppBody}>
                  {!!p.qrImage && <Text style={styles.qrHint}>📷 {tt('checkout', 'ສະແກນ QR ນີ້ ເພື່ອ ໂອນ ຈ່າຍ')}</Text>}
                  {!!p.qrImage && <Image source={{ uri: p.qrImage }} style={styles.qr} resizeMode="contain" />}
                  {!!p.bankName && <Text style={styles.bankRow}>{tt('checkout', 'ທະນາຄານ:')} <Text style={styles.bankB}>{p.bankName}</Text></Text>}
                  {!!p.accountName && <Text style={styles.bankRow}>{tt('checkout', 'ຊື່ບັນຊີ:')} <Text style={styles.bankB}>{p.accountName}</Text></Text>}
                  {!!p.accountNumber && <Text style={styles.bankRow}>{tt('checkout', 'ເລກບັນຊີ:')} <Text style={styles.bankB}>{p.accountNumber}</Text></Text>}
                  {requiresSlip(p.type) && (
                    <>
                      <Text style={styles.label}>{tt('checkout', '📎 ສະລິບໂອນເງິນ')}</Text>
                      {fbUser && <PhotoPicker photos={slip} onChange={setSlip} pathPrefix={`slips/${fbUser.uid}`} max={1} />}
                    </>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}

        {/* ===== Loyalty / store-credit redemption ===== */}
        {loyaltyEnabled && loyalty.balance > 0 && maxRedeem > 0 && (
          <View style={styles.redeem}>
            <Pressable style={styles.redeemTop} onPress={() => {
              const next = !redeemOn;
              setRedeemOn(next);
              if (next && redeemInput === '') setRedeemInput(String(maxRedeem)); // default: use max
            }}>
              <Text style={styles.redeemLogo}>💎</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.redeemName}>{tt('checkout', 'ໃຊ້ແຕ້ມສະສົມ')}</Text>
                <Text style={styles.redeemSub}>{tt('checkout', 'ມີ')} {loyalty.balance.toLocaleString()} {tt('checkout', 'ແຕ້ມ')} · {tt('checkout', 'ໃຊ້ໄດ້ສູງສຸດ')} {maxRedeem.toLocaleString()}</Text>
              </View>
              <View style={[styles.sw, redeemOn && styles.swOn]}><View style={[styles.swDot, redeemOn && styles.swDotOn]} /></View>
            </Pressable>
            {redeemOn && (
              <View style={styles.redeemBody}>
                <Text style={styles.redeemUse}>{tt('checkout', 'ໃຊ້ (ແຕ້ມ)')}</Text>
                <AmountInput
                  value={redeemInput ? Number(redeemInput) : 0}
                  onChangeValue={(n) => setRedeemInput(String(Math.min(n, maxRedeem)))}
                  placeholder="0"
                  placeholderTextColor="#999"
                  style={styles.redeemInput}
                />
                <Pressable onPress={() => setRedeemInput(String(maxRedeem))}><Text style={styles.redeemMax}>{tt('checkout', 'ໃຊ້ສູງສຸດ')}</Text></Pressable>
              </View>
            )}
          </View>
        )}

        {orgs.length > 0 && (
          <View style={styles.orgCard}>
            <Pressable style={styles.orgToggle} onPress={() => setBillOrgId((v) => (v ? null : (pickActiveOrg(orgs)?.id ?? orgs[0].id)))}>
              <Text style={styles.orgCheck}>{billOrgId ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgTitle}>🏢 {tt('checkout', 'ຊື້ ໃນ ນາມ ບໍລິສັທ')}</Text>
                <Text style={styles.orgSub}>{tt('checkout', 'ອອກ ໃບ ບິນ ໃຫ້ ບໍລິສັທ ອັດຕະໂນມັດ ຕອນ ຮັບ ເຄື່ອງ')}</Text>
              </View>
            </Pressable>
            {billOrgId && orgs.length > 1 && (
              <View style={styles.orgChips}>
                {orgs.map((o) => (
                  <Pressable key={o.id} style={[styles.orgChip, billOrgId === o.id && styles.orgChipOn]} onPress={() => setBillOrgId(o.id)}>
                    <Text style={[styles.orgChipTx, billOrgId === o.id && styles.orgChipTxOn]} numberOfLines={1}>{o.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ===== Discount / promo code ===== */}
        <View style={styles.coupon}>
          <Text style={styles.couponLabel}>🎟️ {tt('checkout', 'ລະຫັດ ສ່ວນ ຫຼຸດ')}</Text>
          {appliedCoupon && couponDiscount > 0 ? (
            <View style={styles.couponOk}>
              <Text style={styles.couponOkT}>✅ {appliedCoupon.code} · −{couponDiscount.toLocaleString()} LAK</Text>
              <Pressable onPress={removeCoupon}><Text style={styles.couponRemove}>{tt('checkout', 'ເອົາ ອອກ')}</Text></Pressable>
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput value={couponInput} onChangeText={(tx) => setCouponInput(tx.toUpperCase())} autoCapitalize="characters" placeholder={tt('checkout', 'ໃສ່ ລະຫັດ...')} placeholderTextColor="#999" style={styles.couponInput} />
              <Pressable style={styles.couponBtn} onPress={applyCoupon}><Text style={styles.couponBtnT}>{tt('checkout', 'ໃຊ້')}</Text></Pressable>
            </View>
          )}
          {couponMsg !== '' && <Text style={styles.couponErr}>⚠️ {couponMsg}</Text>}
        </View>

        <View style={styles.summary}>
          <View style={styles.srow}><Text style={styles.srowL}>{tt('checkout', 'ລວມຍ່ອຍ')}</Text><Text style={styles.srowL}>{t.subtotal.toLocaleString()} LAK</Text></View>
          {t.memberDiscount > 0 && (
            <View style={styles.srow}><Text style={styles.memL}>👥 {tt('checkout', 'ສ່ວນຫຼຸດສະມາຊິກ')} ({memberGroupLabel(memGroup)})</Text><Text style={styles.memL}>−{t.memberDiscount.toLocaleString()} LAK</Text></View>
          )}
          {t.couponDiscount > 0 && (
            <View style={styles.srow}><Text style={styles.discL}>🎟️ {tt('checkout', 'ຫຼຸດ ຈາກ ລະຫັດ')}{appliedCoupon ? ` (${appliedCoupon.code})` : ''}</Text><Text style={styles.discL}>−{t.couponDiscount.toLocaleString()} LAK</Text></View>
          )}
          <View style={styles.srow}>
            <Text style={styles.srowL}>{tt('checkout', 'ຄ່າສົ່ງ')}{tripKm != null ? ` (${tripKm.toFixed(1)} ${tt('checkout', 'ກມ')}${kmTier ? ` · ${kmTier}` : ''})` : ''}</Text>
            <Text style={styles.srowL}>{t.deliveryFee.toLocaleString()} LAK</Text>
          </View>
          <View style={styles.srow}><Text style={styles.srowL}>VAT {t.vatRate}%</Text><Text style={styles.srowL}>{t.vat.toLocaleString()} LAK</Text></View>
          {t.pointsDiscount > 0 && (
            <View style={styles.srow}><Text style={styles.discL}>💎 {tt('checkout', 'ຫຼຸດຈາກແຕ້ມ')}</Text><Text style={styles.discL}>−{t.pointsDiscount.toLocaleString()} LAK</Text></View>
          )}
          <View style={styles.srow}><Text style={styles.totalL}>{tt('checkout', 'ລວມທັງໝົດ')}</Text><Text style={styles.totalV}>{t.grandTotal.toLocaleString()} LAK</Text></View>
          {loyaltyEnabled && willEarn > 0 && (
            <Text style={styles.earnNote}>🎁 {tt('checkout', 'ຈະໄດ້ຄືນ')} ~{willEarn.toLocaleString()} {tt('checkout', 'ແຕ້ມ ຕອນສົ່ງສຳເລັດ')}</Text>
          )}
        </View>

        <Pressable style={[styles.btn, submitting && styles.btnDisabled]} onPress={submit} disabled={submitting}>
          <Text style={styles.btnText}>{submitting ? tt('checkout', 'ກຳລັງສັ່ງ...') : tt('checkout', 'ຢືນຢັນສັ່ງຊື້')}</Text>
        </Pressable>
        {error !== '' && <View style={styles.errBox}><Text style={styles.errText}>❌ {error}</Text></View>}

        <Pressable style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>{tt('checkout', '← ກັບກະຕ່າ')}</Text>
        </Pressable>
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, alignItems: 'center', paddingBottom: 60 },
  wrap: { width: '100%', maxWidth: 640 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  label: { fontSize: 12, color: '#4b5563', marginTop: 14, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  opts: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: '#fff' },
  optSel: { borderColor: '#0066CC', backgroundColor: '#EAF2FB' },
  optText: { fontSize: 12, color: '#374151' },
  optTextSel: { color: '#0066CC', fontWeight: '600' },
  // delivery layer cards
  layer: { borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10, padding: 11, marginBottom: 8, backgroundColor: '#fff' },
  layerSel: { borderColor: '#0066CC', backgroundColor: '#f8fbff' },
  layerH: { fontSize: 13, fontWeight: '700', color: '#111' },
  layerHSel: { color: '#0066CC' },
  layerD: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  // payment provider cards
  pp: { borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: '#fff' },
  ppSel: { borderColor: '#0066CC', backgroundColor: '#f8fbff' },
  ppHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ppLogo: { fontSize: 22, width: 30, textAlign: 'center' },
  ppName: { fontSize: 14, fontWeight: '700', color: '#111' },
  ppSubtle: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#0066CC' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0066CC' },
  ppBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#eef0f3', paddingTop: 10 },
  qrHint: { fontSize: 12, color: '#0e7490', fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  qr: { width: 200, height: 200, alignSelf: 'center', marginBottom: 8, backgroundColor: '#fff' },
  bankRow: { fontSize: 12, color: '#4b5563', marginBottom: 4 },
  bankB: { color: '#111', fontWeight: '700' },
  walletTopupLink: { fontSize: 12, color: '#c0392b', fontWeight: '700', marginTop: 2 },
  redeem: { borderWidth: 1, borderColor: '#a5f3fc', backgroundColor: '#ecfeff', borderRadius: 12, padding: 12, marginTop: 16 },
  redeemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  redeemLogo: { fontSize: 20, width: 26, textAlign: 'center' },
  redeemName: { fontSize: 14, fontWeight: '700', color: '#0e7490' },
  redeemSub: { fontSize: 12, color: '#0891b2', marginTop: 1 },
  sw: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#cbd5e1', padding: 3, justifyContent: 'center' },
  swOn: { backgroundColor: '#0891b2' },
  swDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  swDotOn: { alignSelf: 'flex-end' },
  redeemBody: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: '#a5f3fc', paddingTop: 10 },
  redeemUse: { fontSize: 12, color: '#0e7490' },
  redeemInput: { flex: 1, borderWidth: 1, borderColor: '#a5f3fc', borderRadius: 8, padding: 8, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  redeemMax: { fontSize: 12, color: '#0891b2', fontWeight: '700' },
  discL: { fontSize: 14, color: '#0891b2', fontWeight: '600' },
  memL: { fontSize: 14, color: '#7c3aed', fontWeight: '600' },
  addrCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: '#fff' },
  addrCardOn: { borderColor: '#0066CC', backgroundColor: '#f8fbff' },
  addrLabel: { fontSize: 13, fontWeight: '700', color: '#111' },
  addrText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  addrNew: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0066CC' },
  saveToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  saveToggleTx: { fontSize: 13, color: '#374151', fontWeight: '600' },
  pinToggle: { borderWidth: 1, borderColor: '#a5f3fc', backgroundColor: '#ecfeff', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  pinToggleText: { color: '#0e7490', fontSize: 13, fontWeight: '700' },
  earnNote: { fontSize: 12, color: '#0e7490', backgroundColor: '#ecfeff', borderRadius: 8, padding: 8, marginTop: 10, textAlign: 'center' },
  orgCard: { borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 10, padding: 12, marginTop: 16, backgroundColor: '#e7f0fb', gap: 10 },
  orgToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orgCheck: { fontSize: 20, color: '#0066CC' },
  orgTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  orgSub: { fontSize: 12, color: '#475569', marginTop: 1 },
  orgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  orgChip: { borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff', maxWidth: 200 },
  orgChipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  orgChipTx: { fontSize: 12.5, color: '#475569', fontWeight: '700' },
  orgChipTxOn: { color: '#fff' },
  coupon: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 16, backgroundColor: '#fff' },
  couponLabel: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 8 },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  couponBtn: { paddingHorizontal: 18, borderRadius: 8, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  couponBtnT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  couponOk: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ecfdf3', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  couponOkT: { fontSize: 13, color: '#166534', fontWeight: '700', flex: 1 },
  couponRemove: { fontSize: 12, color: '#166534', fontWeight: '700', textDecorationLine: 'underline' },
  couponErr: { fontSize: 12, color: '#dc2626', marginTop: 8 },
  summary: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginTop: 16, backgroundColor: '#fff' },
  srow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  srowL: { fontSize: 14, color: '#4b5563' },
  totalL: { fontSize: 15, fontWeight: '700', color: '#111' },
  totalV: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
  btn: { backgroundColor: '#0066CC', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  errBox: { marginTop: 12, padding: 12, backgroundColor: '#fee', borderRadius: 8 },
  errText: { color: '#c00', fontSize: 12 },
  linkBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  linkText: { color: '#6b7280', fontSize: 12 },
});
