import { Image, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

export interface ProductCardData {
  kind: 'product';
  name: string;
  price: number;
  unit: string;
  image?: string;
  shopName?: string;
  shopLogo?: string;
  rating?: number;
  soldCount?: number;
  isPartner?: boolean;
  url: string;
  refCode?: string;
  productId?: string;
  shopId?: string;
}

export interface QuoteCardData {
  kind: 'quote';
  title: string;
  lines: { desc: string; total: number }[];
  total: number;
  techName?: string;
  techRating?: number;
  validUntil?: string;
  url: string;
}

export type ShareCardData = ProductCardData | QuoteCardData;

/**
 * A branded, shareable card (product or quote). Rendered with a `nativeID` so
 * html2canvas can capture it to an image on web (see lib/share.shareNodeImage).
 * Fixed 300px width for a consistent social-post aspect.
 */
export default function ShareCard({ data, nodeId }: { data: ShareCardData; nodeId: string }) {
  const tt = useTT();
  return (
    <View nativeID={nodeId} style={styles.card}>
      {/* top brand bar */}
      <View style={styles.top}>
        <Text style={styles.wm}>ໂຮມ<Text style={styles.wmO}>ຊ່າງ</Text></Text>
        <Text style={styles.kind}>{data.kind === 'product' ? tt('share', '🛍️ ສິນຄ້າ') : tt('share', '📝 ໃບສະເໜີລາຄາ')}</Text>
      </View>

      {data.kind === 'product' ? (
        <>
          {data.image ? (
            <Image source={{ uri: data.image }} style={styles.img} />
          ) : (
            <View style={[styles.img, styles.imgEmpty]}><Text style={{ fontSize: 30 }}>🛍️</Text></View>
          )}
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={2}>{data.name}</Text>
            <Text style={styles.price}>{data.price.toLocaleString()} <Text style={styles.priceUnit}>{tt('share', 'ກີບ')} / {data.unit}</Text></Text>
            <View style={styles.shopRow}>
              {data.shopLogo ? (
                <Image source={{ uri: data.shopLogo }} style={styles.shopLogo} />
              ) : (
                <View style={[styles.shopLogo, styles.shopLogoEmpty]}><Text style={{ fontSize: 14 }}>🏬</Text></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.shopNameRow}>
                  <Text style={styles.shopName} numberOfLines={1}>{data.shopName ?? 'HomeSang'}</Text>
                  {data.isPartner && <Text style={styles.partner}>🤝 Partner</Text>}
                </View>
                <Text style={styles.shopMeta} numberOfLines={1}>
                  {typeof data.rating === 'number' && data.rating > 0 ? `⭐ ${data.rating.toFixed(1)}` : ''}
                  {data.soldCount ? `${data.rating ? ' · ' : ''}${tt('share', 'ຂາຍແລ້ວ')} ${data.soldCount.toLocaleString()}` : ''}
                </Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>{data.title}</Text>
          <View style={{ marginTop: 8 }}>
            {data.lines.slice(0, 4).map((l, i) => (
              <View key={i} style={styles.ql}>
                <Text style={styles.qlDesc} numberOfLines={1}>{l.desc}</Text>
                <Text style={styles.qlVal}>{l.total.toLocaleString()}</Text>
              </View>
            ))}
          </View>
          <View style={styles.qtotal}>
            <Text style={styles.qtotalL}>{tt('share', 'ລວມ')}</Text>
            <Text style={styles.qtotalV}>{data.total.toLocaleString()} ₭</Text>
          </View>
          <View style={styles.techRow}>
            <View style={styles.techAv}><Text style={{ fontSize: 13 }}>👷</Text></View>
            <View>
              <Text style={styles.shopName}>{data.techName ?? tt('share', 'ຊ່າງ')}</Text>
              <Text style={styles.shopMeta}>
                {typeof data.techRating === 'number' && data.techRating > 0 ? `⭐ ${data.techRating.toFixed(1)}` : ''}
                {data.validUntil ? `${data.techRating ? ' · ' : ''}${tt('share', 'ໃຊ້ໄດ້ຮອດ')} ${data.validUntil}` : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.qwm}>HOMESANG · {tt('share', 'ໃບສະເໜີລາຄາ')}</Text>
        </View>
      )}

      {/* foot: link + referral */}
      <View style={styles.foot}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.footL}>{data.kind === 'product' ? tt('share', 'ສັ່ງຊື້ທີ່') : tt('share', 'ຕິດຕໍ່ / ຢືນຢັນ ທີ່')}</Text>
          <Text style={styles.footUrl}>homesang.pro</Text>
          {data.kind === 'product' && data.refCode ? <Text style={styles.ref}>{tt('share', 'ແນະນຳໂດຍ')} {data.refCode}</Text> : null}
        </View>
        <View style={styles.qr} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 300, borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#0a54a5' },
  wm: { fontSize: 15, fontWeight: '800', color: '#fff' },
  wmO: { color: '#ffd9b3' },
  kind: { fontSize: 12, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  img: { width: '100%', height: 210, backgroundColor: '#eef2ff' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14 },
  name: { fontSize: 15, fontWeight: '800', color: '#111' },
  price: { fontSize: 15, fontWeight: '900', color: '#f97316', marginTop: 4 },
  priceUnit: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f3f6' },
  shopLogo: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#dbeafe' },
  shopLogoEmpty: { alignItems: 'center', justifyContent: 'center' },
  shopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shopName: { fontSize: 12, fontWeight: '700', color: '#111' },
  shopMeta: { fontSize: 12, color: '#6b7280' },
  partner: { fontSize: 12, backgroundColor: '#fef3c7', color: '#92400e', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden' },
  ql: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f1f3f6', gap: 8 },
  qlDesc: { flex: 1, fontSize: 12, color: '#374151' },
  qlVal: { fontSize: 12, color: '#111', fontWeight: '600' },
  qtotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  qtotalL: { fontSize: 15, fontWeight: '800', color: '#111' },
  qtotalV: { fontSize: 15, fontWeight: '800', color: '#f97316' },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  techAv: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  qwm: { textAlign: 'center', fontSize: 12, color: '#cbd5e1', fontWeight: '700', letterSpacing: 2, marginTop: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#eef0f3' },
  footL: { fontSize: 12, color: '#6b7280' },
  footUrl: { fontSize: 13, color: '#0a84ff', fontWeight: '800' },
  ref: { fontSize: 12, color: '#059669', fontWeight: '700', marginTop: 2 },
  qr: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#111', opacity: 0.08 },
});
