import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { copyLink, itemUrl, postToCommunity, shareItem } from '@/lib/share';
import { useTT } from '@/lib/i18n';

/** Share a product/job: copy link, native share, or post to the community feed. */
export default function ShareSheet({
  kind,
  id,
  title,
  image,
  price,
  authorId,
  authorName,
  onClose,
}: {
  kind: 'products' | 'jobs';
  id: string;
  title: string;
  image?: string;
  price?: number;
  authorId: string;
  authorName: string;
  onClose: () => void;
}) {
  const tt = useTT();
  const url = itemUrl(kind, id);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    const r = await shareItem({ url, title });
    setMsg(r === 'shared' ? tt('admShare','✅ ແຊຣ໌ແລ້ວ') : r === 'copied' ? tt('admShare','✅ ກອບປີ້ link ແລ້ວ') : r === 'cancel' ? '' : tt('admShare','⚠️ ບໍ່ຮອງຮັບ'));
  };
  const onCopy = async () => setMsg((await copyLink(url)) ? tt('admShare','✅ ກອບປີ້ link ແລ້ວ') : tt('admShare','⚠️ ກອບປີ້ບໍ່ໄດ້'));
  const onCommunity = async () => {
    setBusy(true);
    setMsg('');
    try {
      await postToCommunity({ authorId, authorName, title, url, price, image });
      setMsg(tt('admShare','✅ ໂພສຕ໌ ເຂົ້າ ໂຮມເພື່ອນ ແລ້ວ'));
    } catch (e: any) {
      setMsg('❌ ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>{tt('admShare','🔗 ແຊຣ໌ ·')} {title}</Text>
            <Pressable onPress={onClose} style={styles.close} hitSlop={8}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>

          <Text style={styles.linkLabel}>Link</Text>
          <Text style={styles.link} numberOfLines={2}>{url}</Text>

          <Pressable style={[styles.btn, styles.primary]} onPress={onShare}><Text style={styles.btnText}>{tt('admShare','📤 ແຊຣ໌ ໄປ social')}</Text></Pressable>
          <Pressable style={[styles.btn, styles.ghost]} onPress={onCopy}><Text style={styles.ghostText}>{tt('admShare','📋 ກອບປີ້ link')}</Text></Pressable>
          <Pressable style={[styles.btn, styles.ghost]} onPress={onCommunity} disabled={busy}><Text style={styles.ghostText}>{busy ? '...' : tt('admShare','👥 ໂພສຕ໌ ເຂົ້າ ໂຮມເພື່ອນ')}</Text></Pressable>

          {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeTxt: { fontSize: 14, color: '#374151', fontWeight: '700' },
  linkLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  link: { fontSize: 12, color: '#0066CC', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 9, marginTop: 4, marginBottom: 12, fontFamily: 'monospace' },
  btn: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  primary: { backgroundColor: '#0066CC' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC' },
  ghostText: { color: '#0066CC', fontSize: 14, fontWeight: '600' },
  msg: { fontSize: 13, color: '#374151', textAlign: 'center', marginTop: 12 },
});
