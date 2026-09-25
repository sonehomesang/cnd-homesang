import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import Brand from '@/components/Brand';
import { type AppSettings, sectionOn, watchAppSettings } from '@/lib/appSettings';
import { useTT } from '@/lib/i18n';

/** Normalise a stored Lao phone to a full international number for wa.me
 *  (adds the 856 country code + 20 mobile prefix when they're missing). */
function waNumber(phone?: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('856')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.startsWith('20')) return '856' + d;
  return '85620' + d; // bare 8-digit Lao mobile
}
/** Accept a full URL, or a bare Line ID / Telegram @username, and build a link. */
function lineUrl(v?: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  return /^https?:\/\//.test(s) ? s : `https://line.me/ti/p/~${encodeURIComponent(s.replace(/^~/, ''))}`;
}
function tgUrl(v?: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  return /^https?:\/\//.test(s) ? s : `https://t.me/${s.replace(/^@/, '')}`;
}
/** Social links: accept a full URL or a bare handle, build the platform URL. */
function fbUrl(v?: string): string {
  const s = (v || '').trim();
  return !s ? '' : /^https?:\/\//.test(s) ? s : `https://facebook.com/${s.replace(/^@/, '')}`;
}
function tiktokUrl(v?: string): string {
  const s = (v || '').trim();
  return !s ? '' : /^https?:\/\//.test(s) ? s : `https://tiktok.com/@${s.replace(/^@/, '')}`;
}
function ytUrl(v?: string): string {
  const s = (v || '').trim();
  return !s ? '' : /^https?:\/\//.test(s) ? s : `https://youtube.com/@${s.replace(/^@/, '')}`;
}

/** Site footer for standalone pages (product/shop/etc.) — carries the HomeSang
 * identity with a balanced two-column menu, contact block and legal bar, so a
 * shared/preview page reads clearly (and professionally) as part of the app. */
export default function AppFooter({ page = 'other' }: { page?: string }) {
  const tt = useTT();
  const [s, setS] = useState<AppSettings | null>(null);
  useEffect(() => watchAppSettings(setS), []);
  const hasSocial = !!(s?.facebook || s?.tiktok || s?.youtube);

  const COL1: { label: string; to: string }[] = [
    { label: tt('footer', 'ໜ້າຫຼັກ'), to: '/' },
    { label: 'ໂຮມຊ່າງ', to: '/find-tech' },
    { label: 'ໂຮມວຽກ', to: '/explore' },
    { label: 'ໂຮມເຄື່ອງ', to: '/shop' },
  ];
  const COL2: { label: string; to: string }[] = [
    { label: 'ໂຮມເພື່ອນ', to: '/community' },
    { label: tt('footer', 'ຮ້ານຄ້າ'), to: '/shops' },
    { label: tt('footer', 'ປຽບທຽບ ສິນຄ້າ'), to: '/compare' },
  ];
  const COL3: { label: string; to: string }[] = [
    { label: tt('footer', 'ຂໍ້ກຳນົດ ການໃຊ້'), to: '/legal/terms' },
    { label: tt('footer', 'ຄວາມເປັນສ່ວນຕົວ'), to: '/legal/privacy' },
  ];

  const Col = ({ title, items }: { title: string; items: { label: string; to: string }[] }) => (
    <View style={styles.col}>
      <Text style={styles.colTitle}>{title}</Text>
      {items.map((l) => (
        <Pressable key={l.to} onPress={() => router.push(l.to as any)} style={styles.linkRow} hitSlop={4}>
          <Text style={styles.link}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.accent} />
      <View style={styles.inner}>
        {/* main row: brand+slogan | ຕິດຕໍ່ | ຕິດຕາມ — three compact columns in one row */}
        <View style={styles.mainRow}>
          <View style={styles.brandCol}>
            <Brand logoUrl={s?.logoUrl || undefined} size={30} />
            <Text style={styles.tag}>{tt('footer', 'ຕະຫຼາດ ຊ່າງ · ວັດສະດຸ · ບໍລິການ ຄົບ ວົງຈອນ ໃນ ບ່ອນ ດຽວ')}</Text>
          </View>
          {sectionOn(s, 'footerContact', page) && (
            <View style={styles.col}>
              <Text style={styles.colTitle}>{tt('footer', 'ຕິດຕໍ່ ພວກເຮົາ')}</Text>
              <View style={styles.iconRow}>
                {!!s?.supportPhone && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#25D366' }]} accessibilityLabel="WhatsApp"
                    onPress={() => Linking.openURL(`https://wa.me/${waNumber(s.supportPhone)}`)}>
                    <FontAwesome5 name="whatsapp" brand size={22} color="#fff" />
                  </Pressable>
                )}
                {!!s?.supportLine && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#06C755' }]} accessibilityLabel="Line"
                    onPress={() => Linking.openURL(lineUrl(s.supportLine))}>
                    <FontAwesome5 name="line" brand size={22} color="#fff" />
                  </Pressable>
                )}
                {!!s?.supportTelegram && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#229ED9' }]} accessibilityLabel="Telegram"
                    onPress={() => Linking.openURL(tgUrl(s.supportTelegram))}>
                    <FontAwesome5 name="telegram-plane" brand size={22} color="#fff" />
                  </Pressable>
                )}
                {!!s?.supportEmail && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#334155' }]} accessibilityLabel="Email"
                    onPress={() => Linking.openURL(`mailto:${s.supportEmail}?subject=${encodeURIComponent(tt('footer', 'ຕິດຕໍ່ ຈາກ ແອັບ ໂຮມຊ່າງ'))}`)}>
                    <FontAwesome5 name="envelope" solid size={20} color="#fff" />
                  </Pressable>
                )}
              </View>
            </View>
          )}
          {sectionOn(s, 'footerSocial', page) && hasSocial && (
            <View style={styles.col}>
              <Text style={styles.colTitle}>{tt('footer', 'ຕິດຕາມ ພວກເຮົາ')}</Text>
              <View style={styles.iconRow}>
                {!!s?.facebook && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#1877F2' }]} accessibilityLabel="Facebook"
                    onPress={() => Linking.openURL(fbUrl(s.facebook))}>
                    <FontAwesome5 name="facebook-f" brand size={22} color="#fff" />
                  </Pressable>
                )}
                {!!s?.tiktok && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#000' }]} accessibilityLabel="TikTok"
                    onPress={() => Linking.openURL(tiktokUrl(s.tiktok))}>
                    <FontAwesome5 name="tiktok" brand size={20} color="#fff" />
                  </Pressable>
                )}
                {!!s?.youtube && (
                  <Pressable style={[styles.iconBtn, { backgroundColor: '#FF0000' }]} accessibilityLabel="YouTube"
                    onPress={() => Linking.openURL(ytUrl(s.youtube))}>
                    <FontAwesome5 name="youtube" brand size={22} color="#fff" />
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>

        {/* menu columns — hidden by default (redundant with the ☰ burger); admin-toggleable per page */}
        {sectionOn(s, 'footerMenu', page) && (
          <View style={styles.cols}>
            <Col title={tt('footer', 'ສຳຫຼວດ')} items={COL1} />
            <Col title={tt('footer', 'ຊຸມຊົນ & ຮ້ານ')} items={COL2} />
            <Col title={tt('footer', 'ຊ່ວຍເຫຼືອ')} items={COL3} />
          </View>
        )}

        {/* bottom bar */}
        <View style={styles.bottom}>
          <Text style={styles.copy}>© 2026 {s?.appName || 'HomeSang'} · {tt('footer', 'ສະຫງວນ ລິຂະສິດ')}</Text>
          <Text style={styles.made}>🇱🇦 {tt('footer', 'ນະຄອນຫຼວງ ວຽງຈັນ, ລາວ')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: '#0f172a' },
  accent: { height: 3, backgroundColor: '#FF6B35' },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  // three compact columns in one row: brand+slogan | ຕິດຕໍ່ | ຕິດຕາມ
  mainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  brandCol: { flex: 1.6, minWidth: 190 },
  tag: { color: '#94a3b8', fontSize: 12, marginTop: 6, lineHeight: 16 },
  cols: { flexDirection: 'row', gap: 12, marginTop: 14, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 12 },
  col: { flex: 1, minWidth: 110 },
  colTitle: { color: '#f1f5f9', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },
  linkRow: { paddingVertical: 5 },
  link: { color: '#cbd5e1', fontSize: 12.5, fontWeight: '600' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bottom: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  copy: { color: '#64748b', fontSize: 12 },
  made: { color: '#64748b', fontSize: 12 },
});
