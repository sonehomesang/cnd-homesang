import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { countdownLabel, getProduct, getProductsByCategory, getShopById, type Product, saleInfo, type Shop } from '@/lib/shop';
import { itemUrl } from '@/lib/share';
import { gbCountdown, gbState, type GroupBuy, joinGroupBuy, watchGroupBuyForProduct } from '@/lib/groupBuys';
import { buyerGroup, type MemberDiscountRule, memberGroupLabel, memberUnitPrice, resolveMemberPct } from '@/lib/memberPricing';
import { watchAppSettings } from '@/lib/appSettings';
import { type BnplConfig, DEFAULT_BNPL, bnplFromPerMonth } from '@/lib/bnpl';
import { codeForUid, ensureMyCode } from '@/lib/referrals';
import { type Reel, watchReelsForProduct } from '@/lib/reels';
import ShareCardSheet from '@/components/ShareCardSheet';
import SharePlatforms from '@/components/SharePlatforms';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';
import RichText from '@/components/RichText';
import VideoEmbed from '@/components/VideoEmbed';
import { hasRichContent } from '@/lib/richtext';
import { useCart } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';
import FavoriteButton from '@/components/FavoriteButton';
import RatingModal from '@/components/RatingModal';
import { getCompare, inCompare, pushRecent, toggleCompare } from '@/lib/recentlyViewed';
import { createProductReview, type ProductReview, watchProductReviews } from '@/lib/productReviews';
import { useTT } from '@/lib/i18n';

// soft tinted section cards (bordered) — one tone per info tab, like the safety box
const TONE = {
  blue: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  slate: { bg: '#f8fafc', border: '#e2e8f0', fg: '#334155' },
  green: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
  purple: { bg: '#faf5ff', border: '#e9d5ff', fg: '#7c3aed' },
  sky: { bg: '#f0f9ff', border: '#bae6fd', fg: '#0369a1' },
  amber: { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' },
};
function Section({ tone, title, children }: { tone: { bg: string; border: string; fg: string }; title: string; children: ReactNode }) {
  return (
    <View style={[styles.panel, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.panelTitle, { color: tone.fg }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem } = useCart();
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [tab, setTab] = useState<string>('info');
  const [sel, setSel] = useState<Record<number, number>>({}); // groupIdx -> optionIdx
  const [compareCount, setCompareCount] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [now, setNow] = useState(Date.now());
  const [gb, setGb] = useState<GroupBuy | null>(null);
  const [joining, setJoining] = useState(false);
  const [globalMemberRules, setGlobalMemberRules] = useState<MemberDiscountRule[]>([]);
  const [bnplCfg, setBnplCfg] = useState<BnplConfig>(DEFAULT_BNPL);
  useEffect(() => watchAppSettings((s) => { setGlobalMemberRules(s.memberDiscounts ?? []); setBnplCfg(s.bnpl); }), []);

  useEffect(() => {
    if (!id) return;
    return watchGroupBuyForProduct(id, setGb);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    return watchReelsForProduct(id, setReels);
  }, [id]);

  const gbEndsAt = gb?.endsAt;
  useEffect(() => {
    const saleLive = product?.saleEndsAt && product.saleEndsAt > Date.now();
    const gbLive = gbEndsAt && gbEndsAt > Date.now();
    if (!saleLive && !gbLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [product?.saleEndsAt, gbEndsAt]);

  useEffect(() => {
    if (!id) return;
    getProduct(id).then((p) => {
      setProduct(p);
      setLoading(false);
      if (p) {
        pushRecent({ id: p.id, name: p.name, price: p.price, unit: p.unit, image: p.images?.[0], shopName: p.shopName, category: p.categoryLao ?? p.category });
        setComparing(inCompare(p.id));
        setCompareCount(getCompare().length);
        if (p.shopId) getShopById(p.shopId).then(setShop).catch(() => {});
        if (p.category) getProductsByCategory(p.category, p.id).then(setSimilar).catch(() => {});
      }
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchProductReviews(id, setReviews);
  }, [id]);

  const submitProductReview = async (rating: number, comment: string) => {
    if (!fbUser || !product) return;
    const name = (profile as any)?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('product', 'ຜູ້ໃຊ້');
    await createProductReview({
      productId: product.id,
      raterId: fbUser.uid,
      raterName: name,
      raterImage: profile?.image,
      rating,
      comment: comment || undefined,
    });
  };

  if (loading) {
    return <View style={styles.center}><Text>{tt('product', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('product', 'ບໍ່ພົບສິນຄ້າ')}</Text>
        <BackButton />
      </View>
    );
  }

  const images = product.images?.length ? product.images : [''];
  const groups = product.variants ?? [];
  const allChosen = groups.every((_, gi) => sel[gi] !== undefined);
  const deltaSum = groups.reduce((s, g, gi) => s + (sel[gi] !== undefined ? g.options[sel[gi]].priceDelta ?? 0 : 0), 0);
  const sale = saleInfo(product, now);
  const gbSt = gb ? gbState(gb, now) : null;
  const gbUnlockedPrice = gbSt?.unlocked ? gb!.groupPrice : undefined;
  const effectiveBase = gbUnlockedPrice != null ? Math.min(sale.price, gbUnlockedPrice) : sale.price;
  const unitPrice = effectiveBase + deltaSum;
  const origUnitPrice = (product.price ?? 0) + deltaSum;
  const joined = !!(fbUser && gb?.joinerIds?.includes(fbUser.uid));

  const memGroup = buyerGroup(profile as any);
  const memPct = resolveMemberPct(product, memGroup, shop?.memberDiscountRules, globalMemberRules).pct;
  const memberUnit = memPct > 0 ? memberUnitPrice(unitPrice, origUnitPrice, memPct) : unitPrice;
  const showMember = memPct > 0 && memberUnit < unitPrice;

  const doJoinGroup = async () => {
    if (!gb) return;
    if (!fbUser) { router.push('/sign-in' as any); return; }
    setJoining(true);
    try {
      const r = await joinGroupBuy(gb, fbUser.uid);
      if (r === 'unlocked') alert(tt('product', '🎉 ຄົບເປົ້າແລ້ວ — ປົດລັອກ ລາຄາກຸ່ມ!'));
    } catch (e: any) {
      alert(tt('product', 'ຮ່ວມກຸ່ມ ບໍ່ສຳເລັດ') + ': ' + (e?.message ?? String(e)));
    } finally {
      setJoining(false);
    }
  };
  const variantLabel = groups.length
    ? groups.map((g, gi) => (sel[gi] !== undefined ? g.options[sel[gi]].label : '?')).join(' / ')
    : undefined;

  const stockNum = product.stock;
  const outOfStock = stockNum === 0;
  const lowStock = stockNum !== undefined && stockNum > 0 && stockNum <= 5;
  const soldCount = product.soldCount ?? 0;
  const hasSpecs = hasRichContent(product.specs);
  const hasUsage = hasRichContent(product.usage);
  const hasExamples = hasRichContent(product.usageExamples);
  const hasInstall = hasRichContent(product.installGuide);
  const hasSafety = hasRichContent(product.safetyNotes);
  // full rich body, falling back to the legacy plain description
  const descHtml = hasRichContent(product.descriptionHtml) ? product.descriptionHtml! : (product.description || '');

  const myRef = fbUser ? codeForUid(fbUser.uid) : undefined;
  const shareUrl = itemUrl('products', product.id, myRef);
  const shareText = `${product.name} — ${unitPrice.toLocaleString()} ${tt('product', 'ກີບ')}`;

  // tabs (only show the ones that have content; core tabs always present)
  const TABS = [
    { key: 'info', label: tt('product', 'ຂໍ້ມູນ'), show: true },
    { key: 'tech', label: tt('product', 'ເຕັກນິກ'), show: hasSpecs || !!product.brand || !!product.model },
    { key: 'usage', label: tt('product', 'ການນຳໃຊ້'), show: hasUsage },
    { key: 'examples', label: tt('product', 'ຕົວຢ່າງ'), show: hasExamples },
    { key: 'install', label: tt('product', 'ຕິດຕັ້ງ & ຄວາມປອດໄພ'), show: hasInstall || hasSafety },
    { key: 'video', label: `${tt('product', 'ວີດີໂອ')}${reels.length ? ` ${reels.length}` : ''}`, show: true },
    { key: 'compare', label: tt('product', 'ປຽບທຽບ'), show: true },
    { key: 'reviews', label: `${tt('product', 'ລີວິວ')} ${product.reviewCount ?? 0}`, show: true },
  ].filter((t) => t.show);
  const activeTab = TABS.some((t) => t.key === tab) ? tab : 'info';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.gallery}>
          <Image source={{ uri: images[activeImg] }} style={styles.main} />
          <View style={styles.favPos}>
            <FavoriteButton type="product" targetId={product.id} meta={{ name: product.name, image: product.images?.[0] }} />
          </View>
          {images.length > 1 && (
            <View style={styles.thumbs}>
              {images.map((u, i) => (
                <Pressable key={i} onPress={() => setActiveImg(i)}>
                  <Image source={{ uri: u }} style={[styles.thumb, i === activeImg && styles.thumbActive]} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.name}>{product.name}</Text>
        {(product.brand || product.model || product.categoryLao || product.category) && (
          <Text style={styles.brandLine}>
            {product.brand ? <>{tt('product', 'ຍີ່ຫໍ້')} <Text style={styles.brandB}>{product.brand}</Text></> : null}
            {product.brand && product.model ? ' · ' : ''}
            {product.model ? <>{tt('product', 'ລຸ້ນ')} <Text style={styles.brandB}>{product.model}</Text></> : null}
            {(product.brand || product.model) ? ' · ' : ''}
            {product.categoryLao ?? product.category}
          </Text>
        )}

        {sale.onSale ? (
          <>
            <View style={styles.saleBand}>
              <Text style={styles.salePrice}>{unitPrice.toLocaleString()} <Text style={styles.priceUnit}>LAK / {product.unit}</Text></Text>
              <Text style={styles.saleOrig}>{origUnitPrice.toLocaleString()}</Text>
              <Text style={styles.salePct}>-{sale.pct}%</Text>
            </View>
            {sale.endsAt && countdownLabel(sale.endsAt, now) !== '' && (
              <View style={styles.saleClock}>
                <Text style={styles.saleClockLabel}>⚡ {tt('product', 'FLASH DEAL — ເຫຼືອ')}</Text>
                <Text style={styles.saleClockTime}>{countdownLabel(sale.endsAt, now)}</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.price}>
            {unitPrice.toLocaleString()}{' '}
            <Text style={styles.priceUnit}>LAK / {product.unit}</Text>
          </Text>
        )}

        {showMember && (
          <View style={styles.memberBand}>
            <Text style={styles.memberLabel}>👥 {tt('product', 'ລາຄາສະມາຊິກ')} ({memberGroupLabel(memGroup)})</Text>
            <Text style={styles.memberPrice}>{memberUnit.toLocaleString()} <Text style={styles.priceUnit}>LAK / {product.unit}</Text></Text>
            <Text style={styles.memberPct}>-{memPct}%</Text>
          </View>
        )}

        {(() => {
          const from = bnplFromPerMonth(unitPrice, bnplCfg, bnplCfg.defaultMode);
          if (!from) return null;
          return (
            <Pressable style={styles.bnplBadge} onPress={() => router.push(`/bnpl/${product.id}` as any)}>
              <Text style={styles.bnplIco}>💳</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bnplTitle}>
                  {tt('product', 'ຜ່ອນ ໄດ້ — ເລີ່ມ')} <Text style={styles.bnplFrom}>{from.perMonth.toLocaleString()}</Text>{tt('product', '/ເດືອນ')}
                </Text>
                <Text style={styles.bnplSub}>{from.tenor} {tt('product', 'ງວດ · ຫັກ ຈາກ ກະເປົາ · ແຕະ ເພື່ອ ເລືອກ ແຜນ')}</Text>
              </View>
              <Text style={styles.bnplGo}>›</Text>
            </Pressable>
          );
        })()}

        {gb && gbSt && (
          <View style={[styles.gbPanel, gbSt.unlocked && styles.gbPanelDone]}>
            <View style={styles.gbRow1}>
              <Text style={[styles.gbBig, gbSt.unlocked && styles.gbBigDone]}>
                {gb.groupPrice.toLocaleString()} <Text style={styles.priceUnit}>LAK / {product.unit}</Text>
              </Text>
              <Text style={styles.gbWas}>{gb.origPrice.toLocaleString()}</Text>
              <Text style={[styles.gbSave, gbSt.unlocked && styles.gbSaveDone]}>
                {gbSt.unlocked ? tt('product', '✅ ປົດລັອກ') : `-${Math.round((1 - gb.groupPrice / Math.max(1, gb.origPrice)) * 100)}%`}
              </Text>
            </View>
            <Text style={[styles.gbProg, gbSt.unlocked && styles.gbProgDone]}>
              {gbSt.unlocked
                ? `🎉 ${tt('product', 'ຄົບເປົ້າແລ້ວ')} ${gbSt.count}/${gb.target} — ${tt('product', 'ຊື້ລາຄາກຸ່ມໄດ້ເລີຍ')}`
                : `👥 ${tt('product', 'ຮ່ວມແລ້ວ')} ${gbSt.count}/${gb.target} — ${tt('product', 'ຂາດອີກ')} ${gbSt.remaining} ${tt('product', 'ຄົນ ເພື່ອປົດລັອກ')}`}
            </Text>
            <View style={styles.gbBar}><View style={[styles.gbBarFill, { width: `${gbSt.pct}%` }]} /></View>
            {!gbSt.unlocked && gbCountdown(gb.endsAt, now) !== '' && (
              <View style={styles.gbClock}>
                <Text style={styles.gbClockLabel}>⏳ {tt('product', 'ໝົດເວລາ ໃນ')}</Text>
                <Text style={styles.gbClockTime}>{gbCountdown(gb.endsAt, now)}</Text>
              </View>
            )}
            {!gbSt.unlocked && (
              joined ? (
                <View style={styles.gbJoined}><Text style={styles.gbJoinedText}>✓ {tt('product', 'ຮ່ວມກຸ່ມແລ້ວ — ຊວນເພື່ອນ ໃຫ້ຄົບໄວ')}</Text></View>
              ) : (
                <Pressable style={[styles.gbJoin, joining && styles.btnDisabled]} disabled={joining} onPress={doJoinGroup}>
                  <Text style={styles.gbJoinText}>{joining ? '...' : tt('product', '👥 ຮ່ວມກຸ່ມ (ຟຣີ — ຈ່າຍຕອນປົດລັອກ)')}</Text>
                </Pressable>
              )
            )}
            {(!gbSt.unlocked) && (
              <Pressable style={styles.gbShare} onPress={() => setShareOpen(true)}>
                <Text style={styles.gbShareText}>↗ {tt('product', 'ຊວນເພື່ອນ')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* delivery availability */}
        <View style={styles.deliv}>
          <Text style={styles.delivIcon}>🚚</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.delivT}>{tt('product', 'ມີ ບໍລິການ ຈັດສົ່ງ ເຖິງ ບ້ານ')}</Text>
            <Text style={styles.delivS}>
              {product.deliveryFee
                ? `${tt('product', 'ຄ່າສົ່ງ')} ${product.deliveryFee.toLocaleString()} ${tt('product', 'ກີບ')}`
                : tt('product', 'ຄິດ ຄ່າສົ່ງ ຕາມ ໄລຍະທາງ ຕອນ ສັ່ງຊື້')}
              {' · '}{tt('product', 'ຕິດຕາມ ໄຣເດີ້ ໄດ້ ຫຼັງ ສັ່ງ')}
            </Text>
          </View>
        </View>

        <Pressable style={styles.shopCard} onPress={() => product.shopId && router.push(`/shop/${product.shopId}` as any)}>
          {shop?.image ? (
            <Image source={{ uri: shop.image }} style={styles.shopLogo} />
          ) : (
            <View style={[styles.shopLogo, styles.shopLogoEmpty]}><Text style={styles.shopLogoTx}>🏬</Text></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.shopNameRow}>
              <Text style={styles.shopName} numberOfLines={1}>{shop?.name ?? product.shopName ?? tt('product', 'ຮ້ານ')}</Text>
              {shop?.isPartner && <Text style={styles.partnerBadge}>🛡️ {tt('product', 'ພັນທະມິດ')}</Text>}
            </View>
            <Text style={styles.shopSub} numberOfLines={1}>{shop?.address ? `📍 ${shop.address}` : (product.categoryLao ?? product.category)}</Text>
          </View>
          <Text style={styles.shopGo}>{tt('product', 'ເບິ່ງ ຮ້ານ')} ›</Text>
        </Pressable>

        {(product.reviewCount ?? 0) > 0 && (
          <Text style={styles.ratingLine}>⭐ {(product.rating ?? 0).toFixed(1)} ({product.reviewCount} {tt('product', 'ລີວິວ')})</Text>
        )}

        <View style={styles.trustRow}>
          <Text style={[styles.tChip, styles.tCod]}>💵 {tt('product', 'ຈ່າຍ ປາຍທາງ ໄດ້')}</Text>
          {soldCount > 0 && <Text style={[styles.tChip, styles.tSold]}>🔥 {tt('product', 'ຂາຍ ແລ້ວ')} {soldCount.toLocaleString()}</Text>}
          {outOfStock ? (
            <Text style={[styles.tChip, styles.tOut]}>{tt('product', 'ໝົດ ສະຕັອກ')}</Text>
          ) : lowStock ? (
            <Text style={[styles.tChip, styles.tLow]}>⚠️ {tt('product', 'ໃກ້ ໝົດ')} ({stockNum})</Text>
          ) : stockNum !== undefined ? (
            <Text style={[styles.tChip, styles.tIn]}>✓ {tt('product', 'ມີ ສິນຄ້າ')}</Text>
          ) : null}
        </View>

        {groups.map((g, gi) => (
          <View key={gi} style={styles.vGroup}>
            <Text style={styles.vName}>{g.name}</Text>
            <View style={styles.vOpts}>
              {g.options.map((o, oi) => (
                <Pressable key={oi} style={[styles.vChip, sel[gi] === oi && styles.vChipOn]} onPress={() => setSel((p) => ({ ...p, [gi]: oi }))}>
                  <Text style={[styles.vChipText, sel[gi] === oi && styles.vChipTextOn]}>
                    {o.label}{o.priceDelta ? ` (+${o.priceDelta.toLocaleString()})` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.btn, ((groups.length > 0 && !allChosen) || outOfStock) && styles.btnDisabled]}
          disabled={(groups.length > 0 && !allChosen) || outOfStock}
          onPress={() => {
            // multi-shop cart: items from other shops are kept (grouped per shop),
            // so no destructive "clear the cart?" prompt. Just add + review.
            addItem(product, { variantLabel, unitPrice });
            router.push('/cart' as any);
          }}>
          <Text style={styles.btnText}>
            {outOfStock ? tt('product', 'ໝົດ ສະຕັອກ')
              : groups.length > 0 && !allChosen ? tt('product', 'ເລືອກຕົວເລືອກກ່ອນ')
              : tt('product', '🛒 ເພີ່ມໃສ່ກະຕ່າ')}
          </Text>
        </Pressable>
        {/* share: platform icons + branded card */}
        <SharePlatforms url={shareUrl} text={shareText} />
        <Pressable style={styles.shareBtn} onPress={() => { if (fbUser) ensureMyCode(fbUser.uid).catch(() => {}); setShareOpen(true); }}>
          <Text style={styles.shareBtnText}>🖼️ {tt('product', 'ແຊຣ໌ ເປັນ ບັດ (ຮູບ) / ໂພສ ໂຮມເພື່ອນ')}</Text>
        </Pressable>
        {shareOpen && (
          <ShareCardSheet
            data={{
              kind: 'product', name: product.name, price: unitPrice, unit: product.unit,
              image: product.images?.[0], shopName: shop?.name ?? product.shopName, shopLogo: shop?.image,
              rating: product.rating, soldCount, isPartner: shop?.isPartner,
              url: shareUrl, refCode: myRef, productId: product.id, shopId: product.shopId,
            }}
            filename={`product-${product.id.slice(0, 6)}`}
            authorId={fbUser?.uid}
            authorName={profile?.firstName || (profile as any)?.name}
            onClose={() => setShareOpen(false)}
          />
        )}
      </View>

      {/* ===== TABS ===== */}
      <View style={styles.card}>
        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={[styles.tab, activeTab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabTx, activeTab === t.key && styles.tabTxOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabBody}>
          {activeTab === 'info' && (
            descHtml
              ? <Section tone={TONE.blue} title={`📄 ${tt('product', 'ຂໍ້ມູນ ສິນຄ້າ')}`}><RichText html={descHtml} /></Section>
              : <Text style={styles.emptyTab}>{tt('product', 'ຍັງ ບໍ່ ມີ ລາຍລະອຽດ')}</Text>
          )}

          {activeTab === 'tech' && (
            <Section tone={TONE.slate} title={`📋 ${tt('product', 'ຂໍ້ມູນ ເຕັກນິກ')}`}>
              {(product.brand || product.model) && (
                <View style={styles.kvBox}>
                  {product.brand && <View style={styles.kvRow}><Text style={styles.kvK}>{tt('product', 'ຍີ່ຫໍ້')}</Text><Text style={styles.kvV}>{product.brand}</Text></View>}
                  {product.model && <View style={styles.kvRow}><Text style={styles.kvK}>{tt('product', 'ລຸ້ນ')}</Text><Text style={styles.kvV}>{product.model}</Text></View>}
                </View>
              )}
              {hasSpecs ? <RichText html={product.specs!} />
                : (!product.brand && !product.model) && <Text style={styles.emptyTab}>{tt('product', 'ຍັງ ບໍ່ ມີ ຂໍ້ມູນ ເຕັກນິກ')}</Text>}
            </Section>
          )}

          {activeTab === 'usage' && (
            <Section tone={TONE.green} title={`✅ ${tt('product', 'ການ ນຳໃຊ້ ທີ່ ເໝາະສົມ')}`}>
              <RichText html={product.usage!} />
            </Section>
          )}

          {activeTab === 'examples' && (
            <Section tone={TONE.purple} title={`🖼️ ${tt('product', 'ຕົວຢ່າງ ການ ນຳໃຊ້')}`}>
              <RichText html={product.usageExamples!} />
            </Section>
          )}

          {activeTab === 'install' && (
            <>
              {hasInstall && (
                <Section tone={TONE.sky} title={`🔧 ${tt('product', 'ເຕັກນິກ / ຄູ່ມື ການ ຕິດຕັ້ງ')}`}>
                  <RichText html={product.installGuide!} />
                </Section>
              )}
              {hasSafety && (
                <Section tone={TONE.amber} title={`⚠️ ${tt('product', 'ຄວາມ ປອດໄພ')}`}>
                  <RichText html={product.safetyNotes!} />
                </Section>
              )}
            </>
          )}

          {activeTab === 'video' && (
            <>
              <Text style={styles.secTitle}>🎬 {tt('product', 'ຄລິບ ການ ໃຊ້ງານ / ຣີວິວ')}</Text>
              {reels.length === 0 && <Text style={styles.emptyTab}>{tt('product', 'ຍັງ ບໍ່ ມີ ຄລິບ ສຳລັບ ສິນຄ້ານີ້')}</Text>}
              {reels.map((r) => (
                <View key={r.id} style={styles.vid}>
                  <VideoEmbed clip={{ videoType: r.videoType, videoUrl: r.videoUrl, thumbnail: r.thumbnail } as any} />
                  <View style={styles.vidMeta}>
                    {r.authorImage ? <Image source={{ uri: r.authorImage }} style={styles.vidAv} /> : <View style={[styles.vidAv, styles.vidAvEmpty]}><Text>🔧</Text></View>}
                    <Text style={styles.vidName} numberOfLines={1}>{r.authorName}</Text>
                    <Text style={styles.vidLike}>❤️ {r.likeCount ?? 0}</Text>
                  </View>
                  {!!r.caption && <Text style={styles.vidCap}>{r.caption}</Text>}
                </View>
              ))}
              <Pressable style={styles.makeClip} onPress={() => { if (!fbUser) { router.push('/sign-in' as any); return; } router.push(`/reels?attach=${product.id}` as any); }}>
                <Text style={styles.makeClipT}>📹 {tt('product', 'ເປັນ ຊ່າງ / ຜູ້ຊ່ຽວຊານ?')}</Text>
                <Text style={styles.makeClipS}>{tt('product', 'ນຳ ສິນຄ້າ ນີ້ ໄປ ສ້າງ ຄລິບ ຂອງ ເຈົ້າ — ໂປຣໂມດ ການຂາຍ + ໂພສ ລົງ ໂຊຊຽວ (ຕິດ ສິນຄ້າ ໃຫ້ ຊື້ ໄດ້ ເລີຍ)')}</Text>
                <View style={styles.makeClipBtn}><Text style={styles.makeClipBtnTx}>＋ {tt('product', 'ສ້າງ ຄລິບ ຈາກ ສິນຄ້ານີ້')}</Text></View>
              </Pressable>
            </>
          )}

          {activeTab === 'compare' && (
            <>
              <Pressable
                style={[styles.compareBtn, comparing && styles.compareBtnOn]}
                onPress={() => {
                  const next = toggleCompare({ id: product.id, name: product.name, price: product.price, unit: product.unit, image: product.images?.[0], shopName: product.shopName, category: product.categoryLao ?? product.category });
                  setComparing(next.some((x) => x.id === product.id));
                  setCompareCount(next.length);
                }}>
                <Text style={[styles.compareText, comparing && styles.compareTextOn]}>
                  {comparing ? tt('product', '✓ ຢູ່ໃນລາຍການປຽບທຽບ') : tt('product', '⚖️ ເພີ່ມ ອັນນີ້ ເຂົ້າ ປຽບທຽບ')}
                </Text>
              </Pressable>
              {compareCount >= 2 && (
                <Pressable style={styles.cartLink} onPress={() => router.push('/compare' as any)}>
                  <Text style={styles.cartLinkText}>{tt('product', '⚖️ ເປີດ ຕາຕະລາງ ປຽບທຽບ')} ({compareCount}) →</Text>
                </Pressable>
              )}
              <Text style={styles.secTitle}>{tt('product', 'ສິນຄ້າ ປະເພດ ດຽວກັນ')}</Text>
              {similar.length === 0 ? (
                <Text style={styles.emptyTab}>{tt('product', 'ບໍ່ ພົບ ສິນຄ້າ ໃກ້ຄຽງ')}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simRow}>
                  {similar.map((s) => (
                    <View key={s.id} style={styles.simCard}>
                      <Pressable onPress={() => router.push(`/products/${s.id}` as any)}>
                        <Image source={{ uri: s.images?.[0] || '' }} style={styles.simImg} />
                        <Text style={styles.simName} numberOfLines={2}>{s.name}</Text>
                        {(s.brand || s.model) ? <Text style={styles.simBrand} numberOfLines={1}>{[s.brand, s.model].filter(Boolean).join(' ')}</Text> : null}
                        {(s.reviewCount ?? 0) > 0 && <Text style={styles.simStar}>⭐ {(s.rating ?? 0).toFixed(1)}</Text>}
                        <Text style={styles.simPrice}>{s.price.toLocaleString()} <Text style={styles.simUnit}>/ {s.unit}</Text></Text>
                      </Pressable>
                      <Pressable style={styles.simCmp} onPress={() => {
                        const next = toggleCompare({ id: s.id, name: s.name, price: s.price, unit: s.unit, image: s.images?.[0], shopName: s.shopName, category: s.categoryLao ?? s.category });
                        setCompareCount(next.length);
                      }}>
                        <Text style={styles.simCmpTx}>{inCompare(s.id) ? '✓ ' : '⚖️ '}{tt('product', 'ປຽບທຽບ')}</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {activeTab === 'reviews' && (
            <>
              <View style={styles.reviewsHead}>
                <Text style={styles.reviewsTitle}>{tt('product', 'ລີວິວ ສິນຄ້າ')} ({product.reviewCount ?? 0})</Text>
                {fbUser && (
                  <Pressable style={styles.rateBtn} onPress={() => setRatingOpen(true)}>
                    <Text style={styles.rateBtnText}>{tt('product', '★ ໃຫ້ຄະແນນ')}</Text>
                  </Pressable>
                )}
              </View>
              {reviews.length === 0 ? (
                <Text style={styles.noRev}>{tt('product', 'ຍັງບໍ່ມີລີວິວ — ເປັນຄົນທຳອິດ')}</Text>
              ) : (
                reviews.map((r) => (
                  <View key={r.id} style={styles.revItem}>
                    <View style={styles.revTop}>
                      <Text style={styles.revName} numberOfLines={1}>{r.raterName ?? tt('product', 'ຜູ້ໃຊ້')}</Text>
                      <Text style={styles.revStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                    </View>
                    {!!r.comment && <Text style={styles.revComment}>{r.comment}</Text>}
                  </View>
                ))
              )}
            </>
          )}
        </View>

        <BackButton />
      </View>

      <AppFooter page="product" />

      {ratingOpen && (
        <RatingModal
          title={tt('product', 'ໃຫ້ຄະແນນ ສິນຄ້າ')}
          subtitle={product.name}
          onSubmit={submitProductReview}
          onClose={() => setRatingOpen(false)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, paddingBottom: 0, alignItems: 'center' },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, width: '100%', maxWidth: 640, marginBottom: 8 },
  gallery: { flexDirection: 'row', gap: 8 },
  favPos: { position: 'absolute', top: 8, left: 8 },
  main: { flex: 1, height: 240, borderRadius: 10, backgroundColor: '#f3f4f6' },
  thumbs: { gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: '#0066CC' },
  name: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 14 },
  brandLine: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  brandB: { color: '#0066CC', fontWeight: '700' },
  price: { fontSize: 15, fontWeight: '700', color: '#0066CC', marginTop: 8 },
  priceUnit: { fontSize: 12, color: '#6b7280', fontWeight: 'normal' },
  bnplBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderWidth: 1.5, borderColor: '#fdba74', backgroundColor: '#fff7ed', borderRadius: 14 },
  bnplIco: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f97316', color: '#fff', textAlign: 'center', lineHeight: 34, fontSize: 15 },
  bnplTitle: { fontSize: 14, fontWeight: '800', color: '#9a3412' },
  bnplFrom: { fontSize: 15, fontWeight: '900', color: '#ea580c' },
  bnplSub: { fontSize: 12, color: '#b45309', marginTop: 2 },
  bnplGo: { fontSize: 20, fontWeight: '900', color: '#ea580c' },
  saleBand: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  salePrice: { fontSize: 15, fontWeight: '900', color: '#dc2626' },
  saleOrig: { fontSize: 14, color: '#9ca3af', textDecorationLine: 'line-through' },
  salePct: { marginLeft: 'auto', backgroundColor: '#dc2626', color: '#fff', fontSize: 12, fontWeight: '800', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8, overflow: 'hidden' },
  saleClock: { alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  saleClockLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 3 },
  saleClockTime: { fontSize: 15, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  memberBand: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 },
  memberLabel: { fontSize: 12, color: '#6b21a8', fontWeight: '700' },
  memberPrice: { fontSize: 15, fontWeight: '900', color: '#7c3aed', marginLeft: 'auto' },
  memberPct: { backgroundColor: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 7, overflow: 'hidden' },
  gbPanel: { backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 12, padding: 14, marginTop: 10 },
  gbPanelDone: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  gbRow1: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  gbBig: { fontSize: 15, fontWeight: '900', color: '#7c3aed' },
  gbBigDone: { color: '#15803d' },
  gbWas: { fontSize: 14, color: '#9ca3af', textDecorationLine: 'line-through' },
  gbSave: { marginLeft: 'auto', backgroundColor: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: '800', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8, overflow: 'hidden' },
  gbSaveDone: { backgroundColor: '#16a34a' },
  gbProg: { fontSize: 12, color: '#6b21a8', fontWeight: '700', marginTop: 10 },
  gbProgDone: { color: '#15803d' },
  gbBar: { height: 10, backgroundColor: '#ede9fe', borderRadius: 8, marginTop: 5, overflow: 'hidden' },
  gbBarFill: { height: '100%', backgroundColor: '#7c3aed' },
  gbClock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111827', borderRadius: 10, paddingVertical: 8, marginTop: 10 },
  gbClockLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  gbClockTime: { fontSize: 15, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  gbJoin: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  gbJoinText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  gbJoined: { backgroundColor: '#ede9fe', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  gbJoinedText: { color: '#6b21a8', fontSize: 13, fontWeight: '700' },
  gbShare: { borderWidth: 1, borderColor: '#7c3aed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  gbShareText: { color: '#7c3aed', fontSize: 13, fontWeight: '700' },
  deliv: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 11, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 12 },
  delivIcon: { fontSize: 20 },
  delivT: { fontSize: 12, fontWeight: '700', color: '#166534' },
  delivS: { fontSize: 12, color: '#4b8a5f', marginTop: 1 },
  shopCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginTop: 10 },
  shopLogo: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#e5e7eb' },
  shopLogoEmpty: { alignItems: 'center', justifyContent: 'center' },
  shopLogoTx: { fontSize: 20 },
  shopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopName: { fontSize: 13, fontWeight: '700', color: '#111', flexShrink: 1 },
  partnerBadge: { fontSize: 12, fontWeight: '700', color: '#15803d', backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  shopSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  shopGo: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tChip: { fontSize: 12, fontWeight: '600', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  tCod: { color: '#1d4ed8', backgroundColor: '#EAF2FB' },
  tSold: { color: '#b45309', backgroundColor: '#fef3c7' },
  tIn: { color: '#15803d', backgroundColor: '#dcfce7' },
  tLow: { color: '#b45309', backgroundColor: '#ffedd5' },
  tOut: { color: '#991b1b', backgroundColor: '#fee2e2' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#fff' },
  shareBtnText: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
  desc: { fontSize: 14, color: '#374151', lineHeight: 21 },
  vGroup: { marginTop: 14 },
  vName: { fontSize: 12, fontWeight: '700', color: '#111', marginBottom: 6 },
  vOpts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  vChipOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  vChipText: { fontSize: 12, color: '#475569' },
  vChipTextOn: { color: '#0066CC', fontWeight: '700' },
  // tabs
  // wrapping pill tabs — every tab is visible without horizontal scrolling
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f5f9' },
  tabOn: { backgroundColor: '#0066CC' },
  tabTx: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  tabTxOn: { color: '#fff' },
  tabBody: { paddingTop: 16, minHeight: 120 },
  emptyTab: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 8 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14 },
  panelTitle: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  kvBox: { marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 8, paddingHorizontal: 10 },
  kvRow: { flexDirection: 'row', paddingVertical: 7, borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.06)' },
  kvK: { width: 90, fontSize: 12, color: '#64748b', fontWeight: '600' },
  kvV: { flex: 1, fontSize: 13, color: '#111', fontWeight: '600' },
  secTitle: { fontSize: 13, fontWeight: '800', color: '#0066CC', marginBottom: 10 },
  specTable: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
  specRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  specLabel: { fontSize: 12, color: '#6b7280', width: 120 },
  specValue: { flex: 1, fontSize: 12, color: '#111', fontWeight: '500' },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bulletDot: { fontSize: 14, color: '#0066CC', lineHeight: 20 },
  bulletTx: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
  exa: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 10 },
  exaTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  exaNote: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 18 },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EAF2FB', color: '#0066CC', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 22, overflow: 'hidden' },
  safetyBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginTop: 10 },
  safetyTitle: { fontSize: 12, fontWeight: '800', color: '#92400e', marginBottom: 6 },
  safetyTx: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 19 },
  vid: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  vidMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  vidAv: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0e7ff' },
  vidAvEmpty: { alignItems: 'center', justifyContent: 'center' },
  vidName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#111' },
  vidLike: { fontSize: 12, color: '#6b7280' },
  vidCap: { fontSize: 12, color: '#374151', paddingHorizontal: 10, paddingBottom: 10, lineHeight: 18 },
  makeClip: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#f97316', backgroundColor: '#fff7ed', borderRadius: 12, padding: 14, alignItems: 'center' },
  makeClipT: { fontSize: 13, fontWeight: '800', color: '#ea580c' },
  makeClipS: { fontSize: 12, color: '#9a6a43', marginTop: 3, lineHeight: 16, textAlign: 'center' },
  makeClipBtn: { marginTop: 10, backgroundColor: '#f97316', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 9 },
  makeClipBtnTx: { color: '#fff', fontSize: 13, fontWeight: '700' },
  compareBtn: { padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#fff' },
  compareBtnOn: { backgroundColor: '#EAF2FB' },
  compareText: { color: '#0066CC', fontSize: 14, fontWeight: '600' },
  compareTextOn: { color: '#0066CC', fontWeight: '700' },
  simRow: { gap: 10, paddingRight: 8, paddingTop: 4 },
  simCard: { width: 140, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 8 },
  simImg: { width: '100%', height: 96, borderRadius: 10, backgroundColor: '#f3f4f6' },
  simName: { fontSize: 12, color: '#111', fontWeight: '600', marginTop: 6, minHeight: 32 },
  simBrand: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  simStar: { fontSize: 12, color: '#F59E0B', fontWeight: '700', marginTop: 2 },
  simPrice: { fontSize: 13, color: '#0066CC', fontWeight: '700', marginTop: 2 },
  simUnit: { fontSize: 12, color: '#9ca3af', fontWeight: 'normal' },
  simCmp: { marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingVertical: 5, alignItems: 'center' },
  simCmpTx: { fontSize: 12, color: '#475569', fontWeight: '600' },
  btn: { backgroundColor: '#0066CC', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  cartLink: { padding: 10, alignItems: 'center' },
  cartLinkText: { color: '#16a34a', fontWeight: '600', fontSize: 12 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  ratingLine: { fontSize: 14, color: '#F59E0B', fontWeight: '700', marginTop: 8 },
  reviewsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewsTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  rateBtn: { borderWidth: 1, borderColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  rateBtnText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
  noRev: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  revItem: { borderTopWidth: 1, borderTopColor: '#f6f7f9', paddingVertical: 10 },
  revTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  revName: { fontSize: 12, fontWeight: '600', color: '#111', flex: 1 },
  revStars: { fontSize: 12, color: '#F59E0B' },
  revComment: { fontSize: 12, color: '#374151', marginTop: 4, lineHeight: 19 },
});
