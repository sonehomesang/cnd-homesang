import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import ShareCard, { type ShareCardData } from '@/components/ShareCard';
import { copyLink, postToCommunity, shareItem, shareNodeImage } from '@/lib/share';
import { useTT } from '@/lib/i18n';

const NODE_ID = 'hs-share-card';

/**
 * Customer-facing share sheet: shows a branded ShareCard preview + actions —
 * share the card as an image (web html2canvas → Web Share/download; native →
 * link share fallback), copy link, or post to the community feed.
 */
export default function ShareCardSheet({
  data,
  filename,
  authorId,
  authorName,
  onClose,
}: {
  data: ShareCardData;
  filename: string;
  authorId?: string;
  authorName?: string;
  onClose: () => void;
}) {
  const tt = useTT();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const title = data.kind === 'product' ? data.name : data.title;
  const text = data.kind === 'product'
    ? `${data.name} — ${data.price.toLocaleString()} ${tt('share', 'ກີບ')}`
    : `${data.title} — ${data.total.toLocaleString()} ${tt('share', 'ກີບ')}`;
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1800); };

  const shareImage = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const r = await shareNodeImage(NODE_ID, filename, text);
        if (r === 'shared') flash(tt('share', '✓ ແຊຣ໌ ບັດ ແລ້ວ'));
        else if (r === 'downloaded') flash(tt('share', '✓ ດາວໂຫຼດ ບັດ ແລ້ວ (.jpg)'));
        else flash(tt('share', 'ແຊຣ໌ ບໍ່ໄດ້ — ລອງ ກັອບ ລິ້ງ'));
      } else {
        const r = await shareItem({ url: data.url, title, text });
        flash(r === 'copied' ? tt('share', '✓ ກັອບ ລິ້ງ ແລ້ວ') : tt('share', '✓ ແຊຣ໌ ແລ້ວ'));
      }
    } finally { setBusy(false); }
  };

  const doCopy = async () => {
    const ok = await copyLink(data.url);
    flash(ok ? tt('share', '✓ ກັອບ ລິ້ງ ແລ້ວ') : tt('share', 'ກັອບ ບໍ່ໄດ້'));
  };

  const doPost = async () => {
    if (!authorId) return;
    setBusy(true);
    try {
      await postToCommunity({
        authorId,
        authorName: authorName ?? 'HomeSang',
        title,
        url: data.url,
        price: data.kind === 'product' ? data.price : data.total,
        image: data.kind === 'product' ? data.image : undefined,
        ...(data.kind === 'product' ? { productId: data.productId, productUnit: data.unit, shopId: data.shopId } : {}),
      });
      flash(tt('share', '✓ ໂພສ ເຂົ້າ ໂຮມເພື່ອນ ແລ້ວ'));
      setTimeout(onClose, 900);
    } catch (e: any) {
      flash(tt('share', 'ໂພສ ບໍ່ໄດ້: ') + (e?.message ?? ''));
    } finally { setBusy(false); }
  };

  return (
    <BottomSheet visible onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>↗ {tt('share', 'ແຊຣ໌')} {data.kind === 'product' ? tt('share', 'ສິນຄ້າ') : tt('share', 'ໃບສະເໜີລາຄາ')}</Text>
        <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.cardWrap}>
          <ShareCard data={data} nodeId={NODE_ID} />
        </View>

        <Pressable style={[styles.act, busy && styles.actOff]} onPress={shareImage} disabled={busy}>
          <View style={[styles.ic, styles.icImg]}><Text style={styles.icTx}>📷</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actT}>{tt('share', 'ແຊຣ໌ ບັດ (ຮູບ)')}</Text>
            <Text style={styles.actS}>{Platform.OS === 'web' ? tt('share', 'ອອກເປັນ .jpg → Facebook / WhatsApp') : tt('share', 'ແຊຣ໌ ລິ້ງ + ຂໍ້ຄວາມ')}</Text>
          </View>
        </Pressable>

        <Pressable style={styles.act} onPress={doCopy}>
          <View style={[styles.ic, styles.icLink]}><Text style={styles.icTx}>🔗</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actT}>{tt('share', 'ກັອບ ລິ້ງ')}</Text>
            <Text style={styles.actS} numberOfLines={1}>{data.url}</Text>
          </View>
        </Pressable>

        {authorId && (
          <Pressable style={[styles.act, busy && styles.actOff]} onPress={doPost} disabled={busy}>
            <View style={[styles.ic, styles.icComm]}><Text style={styles.icTx}>📣</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actT}>{tt('share', 'ໂພສ ໂຮມເພື່ອນ')}</Text>
              <Text style={styles.actS}>{tt('share', 'ໂພສ ບັດ ເຂົ້າ community feed')}</Text>
            </View>
          </Pressable>
        )}

        {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  close: { fontSize: 15, color: '#6b7280' },
  scroll: { paddingBottom: 8 },
  cardWrap: { alignItems: 'center', paddingVertical: 14 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8, backgroundColor: '#fff' },
  actOff: { opacity: 0.55 },
  ic: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icImg: { backgroundColor: '#eff6ff' },
  icLink: { backgroundColor: '#ecfdf5' },
  icComm: { backgroundColor: '#fef3c7' },
  icTx: { fontSize: 15 },
  actT: { fontSize: 13, fontWeight: '700', color: '#111' },
  actS: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  msg: { textAlign: 'center', color: '#059669', fontSize: 12, fontWeight: '600', marginTop: 6 },
});
