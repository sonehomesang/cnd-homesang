import { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { type Job, JOB_STATUS_LABEL, watchAllJobs } from '@/lib/jobs';
import { type CmsContent, DEFAULT_CMS, watchCms } from '@/lib/cms';
import Pillars from '@/components/Pillars';
import BannerCarousel from '@/components/BannerCarousel';
import Brand from '@/components/Brand';
import ProductShowcase from '@/components/ProductShowcase';
import { colors, font, radius, shadow } from '@/lib/theme';
import { useTT } from '@/lib/i18n';

const MAX_W = 1100;

export default function LandingPage() {
  const tt = useTT();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cms, setCms] = useState<CmsContent>(DEFAULT_CMS);

  useEffect(() => {
    const u2 = watchAllJobs(setJobs);
    const u3 = watchCms(setCms);
    return () => { u2(); u3(); };
  }, []);

  const openLink = (url: string) => {
    if (/^https?:\/\//.test(url)) {
      if (typeof window !== 'undefined') window.open(url, '_blank');
    } else {
      router.push(url as any);
    }
  };

  // first-run onboarding (web)
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        if (!localStorage.getItem('hs_onboarded')) router.push('/onboarding' as any);
      } catch {}
    }
  }, []);

  const openJobs = jobs.filter((j) => j.status === 'open').slice(0, 4);
  const activeJobs = jobs.filter((j) => ['assigned', 'in_progress'].includes(j.status)).slice(0, 4);
  const doneJobs = jobs.filter((j) => ['completed', 'paid', 'reviewed'].includes(j.status)).slice(0, 4);

  const gotoLogin = () => router.push('/sign-in');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        {/* Top bar */}
        <View style={styles.topbar}>
          <Brand />
          <View style={styles.topnav}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={() => router.push('/(tabs)/shop' as any)}>
              <Text style={styles.ghostText}>{tt('landing', 'ເບິ່ງສິນຄ້າ')}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={gotoLogin}>
              <Text style={styles.btnText}>{tt('landing', 'ເຂົ້າສູ່ລະບົບ')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.h1}>{tt('landing', 'ໂຮມຊ່າງ')}</Text>
          <Text style={styles.tag}>
            {tt('landing', 'ຫາຊ່າງ · ຊື້ວັດສະດຸ · ຄົບໃນບ່ອນດຽວ')}{'\n'}{tt('landing', 'ຕະຫຼາດບໍລິການ ແລະ ສິນຄ້າ ສຳລັບເຮືອນ')}
          </Text>
          <View style={styles.ctas}>
            <Pressable style={[styles.btn, styles.big]} onPress={gotoLogin}>
              <Text style={styles.btnText}>{tt('landing', 'ເລີ່ມໃຊ້ ຟຣີ')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.ghost, styles.big]} onPress={() => router.push('/(tabs)/shop' as any)}>
              <Text style={styles.ghostText}>{tt('landing', 'ເບິ່ງສິນຄ້າ')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Pillars */}
        <View style={styles.pillarsWrap}>
          <Pillars />
        </View>

        {/* Promo banners */}
        <View style={styles.section}>
          <BannerCarousel />
        </View>

        {/* Product showcase (new / best / recommended / by-category) */}
        <View style={styles.section}>
          <ProductShowcase byCategory />
        </View>

        {/* Jobs showcase */}
        {openJobs.length > 0 && (
          <Section title={tt('landing', 'ງານເປີດຮັບ')}>
            {openJobs.map((j) => <JobRow key={j.id} job={j} onPress={gotoLogin} />)}
          </Section>
        )}
        {activeJobs.length > 0 && (
          <Section title={tt('landing', 'ກຳລັງດຳເນີນການ')}>
            {activeJobs.map((j) => <JobRow key={j.id} job={j} onPress={gotoLogin} />)}
          </Section>
        )}
        {doneJobs.length > 0 && (
          <Section title={tt('landing', 'ງານສຳເລັດ')}>
            {doneJobs.map((j) => <JobRow key={j.id} job={j} onPress={gotoLogin} />)}
          </Section>
        )}

        {/* Login gate banner */}
        <Pressable style={styles.gate} onPress={gotoLogin}>
          <Text style={styles.gateText}>{tt('landing', '🔒 ເຂົ້າສູ່ລະບົບ ເພື່ອ ໂພສງານ · ສະເໜີລາຄາ · ຊື້ສິນຄ້າ · ເບິ່ງລາຍລະອຽດ')}</Text>
          <Text style={styles.gateBtn}>{tt('landing', 'ເຂົ້າສູ່ລະບົບ / ລົງທະບຽນ →')}</Text>
        </Pressable>

        {/* Partners */}
        {cms.partners.length > 0 && (
          <View style={styles.partners}>
            <Text style={styles.partnersTitle}>{tt('landing', '🤝 ຄູ່ຮ່ວມທຸລະກິດ')}</Text>
            <Text style={styles.partnersSub}>{tt('landing', 'ຮ້ານຄ້າ ແລະ ຜູ້ສະໜັບສະໜູນ ຂອງເຮົາ')}</Text>
            <View style={styles.plogos}>
              {cms.partners.map((pt, i) => (
                <Pressable key={i} style={styles.plogoWrap} onPress={() => pt.url && openLink(pt.url)}>
                  <Image source={{ uri: pt.logoUrl }} style={styles.plogo} resizeMode="contain" />
                  {!!pt.name && <Text style={styles.plogoName} numberOfLines={1}>{pt.name}</Text>}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Brand />
          <Text style={styles.footerBrand}>{tt('landing', 'ໂຮມຊ່າງ')}</Text>
          <View style={styles.footerLinks}>
            {cms.footerLinks.map((l, i) => (
              <View key={i} style={styles.footerLinkWrap}>
                {i > 0 && <Text style={styles.footerSmall}> · </Text>}
                <Pressable onPress={() => openLink(l.url)}>
                  <Text style={styles.footerLink}>{l.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Text style={styles.footerSmall}>{cms.footerNote}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Section({ title, children, onMore }: { title: string; children: React.ReactNode; onMore?: () => void }) {
  const tt = useTT();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onMore && <Pressable onPress={onMore}><Text style={styles.more}>{tt('landing', 'ເບິ່ງທັງໝົດ →')}</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

function JobRow({ job, onPress }: { job: Job; onPress: () => void }) {
  const tt = useTT();
  const c = getCategory(job.category);
  const label = JOB_STATUS_LABEL[job.status];
  return (
    <Pressable style={styles.jrow} onPress={onPress}>
      <Text style={styles.jcat}><CategoryIcon icon={c?.icon} size={13} color={colors.primary} /> {c?.lao ?? job.category}</Text>
      <Text style={styles.jtitle} numberOfLines={1}>{job.title}</Text>
      <View style={styles.jmeta}>
        {job.budget !== undefined && <Text style={styles.jmetaText}>💰 {job.budget.toLocaleString()} LAK</Text>}
        <Text style={styles.jmetaText}>· {label ? tt('jobStatus', label.lao) : job.status}</Text>
        <Text style={styles.jlock}>{tt('landing', '🔒 ລາຍລະອຽດ')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { width: '100%' },
  wrap: { width: '100%', maxWidth: MAX_W, alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  topnav: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  ghostText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  hero: { padding: 40, alignItems: 'center', backgroundColor: '#EAF2FB' },
  h1: { fontSize: font.xxxl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tag: { fontSize: font.md, color: colors.text2, marginTop: 10, textAlign: 'center', lineHeight: 22 },
  ctas: { flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' },
  big: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: radius.lg },
  pillarsWrap: { padding: 20 },
  section: { paddingHorizontal: 20, paddingVertical: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  more: { fontSize: font.sm, color: colors.primary },
  prow: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  pcard: { width: 138, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  pimg: { width: '100%', height: 104, backgroundColor: colors.surface2 },
  pbadge: { position: 'absolute', top: 6, left: 6, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
  pbadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pname: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginTop: 6, paddingHorizontal: 8, minHeight: 36 },
  pprice: { fontSize: font.sm, fontWeight: '700', color: colors.primary, paddingHorizontal: 8, paddingBottom: 8 },
  punit: { fontSize: font.xs, color: colors.text3, fontWeight: 'normal' },
  catGroupLabel: { fontSize: font.sm, fontWeight: '700', color: colors.primary, backgroundColor: '#EAF2FB', alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  partners: { padding: 24, alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  partnersTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  partnersSub: { fontSize: font.xs, color: colors.text3, marginTop: 2, marginBottom: 14 },
  plogos: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  plogoWrap: { alignItems: 'center', width: 96 },
  plogo: { width: 90, height: 52, borderRadius: radius.md, backgroundColor: colors.surface2 },
  plogoName: { fontSize: font.xs, color: colors.text2, marginTop: 4 },
  jrow: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 8, ...shadow.card },
  jcat: { fontSize: font.xs, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  jtitle: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginTop: 2 },
  jmeta: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' },
  jmetaText: { fontSize: font.xs, color: colors.text3 },
  jlock: { fontSize: font.xs, color: colors.text3 },
  gate: { margin: 20, padding: 18, backgroundColor: colors.text, borderRadius: radius.lg, alignItems: 'center' },
  gateText: { color: '#CBD5E1', fontSize: font.sm, textAlign: 'center' },
  gateBtn: { color: colors.white, fontSize: font.md, fontWeight: '700', marginTop: 10 },
  footer: { padding: 24, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12 },
  footerBrand: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  footerLinks: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  footerLinkWrap: { flexDirection: 'row', alignItems: 'center' },
  footerLink: { fontSize: font.xs, color: colors.primary, textDecorationLine: 'underline' },
  footerSmall: { fontSize: font.xs, color: colors.text3, marginTop: 6 },
});
