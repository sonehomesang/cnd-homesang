import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import { watchSitesForOwner, type Site } from '@/lib/sites';
import { watchSiteConfig, DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/siteConfig';
import { watchAssetsForSite, warrantyStatus, type Asset } from '@/lib/assets';
import { SiteEditor } from '@/components/admin/SitesPanel';
import { AssetEditor } from '@/components/admin/AssetsPanel';
import AppFooter from '@/components/AppFooter';

/** Assets under one property (own listener so counts/badges stay live). */
function SiteCard({
  site, cfg, onAddAsset, onEditAsset, onEditSite,
}: {
  site: Site; cfg: SiteConfig;
  onAddAsset: () => void; onEditAsset: (a: Asset) => void; onEditSite: () => void;
}) {
  const tt = useTT();
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => watchAssetsForSite(site.id, setAssets), [site.id]);
  const bt = site.fields?.building?.buildingType;

  return (
    <View style={styles.card}>
      <View style={styles.propRow}>
        <View style={styles.pic}><Text style={{ fontSize: 20 }}>🏠</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.propName}>{site.name}</Text>
          <Text style={styles.mut}>{site.address || '—'}{bt ? ` · ${bt}` : ''} · 🔩 {assets.length} {tt('myProperties', 'ເຄື່ອງ')}</Text>
        </View>
        <Pressable onPress={onEditSite} hitSlop={8}><Text style={styles.editLink}>{tt('myProperties', 'ແກ້ໄຂ')}</Text></Pressable>
      </View>

      {assets.map((a) => {
        const ac = cfg.assetCategories.find((c) => c.key === a.category);
        const w = warrantyStatus(a);
        return (
          <Pressable key={a.id} style={styles.assetRow} onPress={() => onEditAsset(a)}>
            <Text style={{ fontSize: 15 }}>{ac?.icon ?? '🔩'}</Text>
            <Text style={styles.assetName}>{[a.brand, a.model].filter(Boolean).join(' ') || ac?.label}</Text>
            <View style={{ flexDirection: 'row', gap: 5, marginLeft: 'auto' }}>
              {w.state !== 'none' && <Text style={[styles.badge, w.state === 'active' ? styles.badgeOk : styles.badgeExp]}>🛡️</Text>}
              {a.history.length > 0 && <Text style={styles.badge}>📜 {a.history.length}</Text>}
            </View>
          </Pressable>
        );
      })}

      <View style={styles.btnRow}>
        <Pressable style={[styles.btnO, { flex: 1 }]} onPress={onAddAsset}><Text style={styles.btnOText}>{tt('myProperties', '＋ ເພີ່ມ ເຄື່ອງ')}</Text></Pressable>
        <Pressable style={[styles.btnO, { flex: 1 }]} onPress={() => router.push(`/site/${site.id}` as any)}><Text style={styles.btnOText}>📖 Dossier</Text></Pressable>
      </View>
    </View>
  );
}

export default function MyPropertiesScreen() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [editingSite, setEditingSite] = useState<Site | 'new' | null>(null);
  const [assetEdit, setAssetEdit] = useState<{ site: Site; asset: Asset | null } | null>(null);

  const myName = (profile as any)?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('myProperties', 'ຂ້ອຍ');

  useEffect(() => { if (fbUser) return watchSitesForOwner(fbUser.uid, setSites); }, [fbUser]);
  useEffect(() => watchSiteConfig(setCfg), []);

  if (!fbUser) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 40 }}>🏠</Text>
        <Text style={styles.centerTitle}>{tt('myProperties', 'ອາຄານ & ເຄື່ອງ ຂອງ ຂ້ອຍ')}</Text>
        <Text style={styles.mut}>{tt('myProperties', 'ເຂົ້າ ສູ່ ລະບົບ ເພື່ອ ບັນທຶກ ເຮືອນ + ເຄື່ອງໃຊ້ ຂອງ ທ່ານ')}</Text>
        <Pressable style={styles.btnP} onPress={() => router.push('/sign-in')}><Text style={styles.btnPText}>{tt('myProperties', 'ເຂົ້າ ສູ່ ລະບົບ')}</Text></Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.colWrap}>
      <View style={styles.intro}>
        <Text style={styles.introText}>
          {tt('myProperties', 'ບັນທຶກ ເຮືອນ/ອາຄານ + ເຄື່ອງໃຊ້ ຂອງ ທ່ານ ໄວ້ → ຕອນ ແຈ້ງ ສ້ອມ ຊ່າງ ໄດ້ ຂໍ້ມູນ ຄົບ + ເກັບ ປະຫວັດ ອັດຕະໂນມັດ.')} <Text style={{ fontWeight: '800' }}>{tt('myProperties', 'ບໍ່ ບັງຄັບ')}</Text> {tt('myProperties', '— ຢາກ ໂພສ ວຽກ ເສີຍໆ ກໍ ໄດ້.')}
        </Text>
        <Pressable style={styles.btnP} onPress={() => setEditingSite('new')}><Text style={styles.btnPText}>{tt('myProperties', '＋ ເພີ່ມ ອາຄານ / ສະຖານທີ່')}</Text></Pressable>
      </View>

      {sites === null ? (
        <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : sites.length === 0 ? (
        <Text style={styles.empty}>{tt('myProperties', 'ຍັງ ບໍ່ ມີ ອາຄານ — ກົດ "＋ ເພີ່ມ ອາຄານ / ສະຖານທີ່"')}</Text>
      ) : (
        sites.map((s) => (
          <SiteCard
            key={s.id} site={s} cfg={cfg}
            onEditSite={() => setEditingSite(s)}
            onAddAsset={() => setAssetEdit({ site: s, asset: null })}
            onEditAsset={(a) => setAssetEdit({ site: s, asset: a })}
          />
        ))
      )}
      </View>

      {editingSite && (
        <SiteEditor
          site={editingSite === 'new' ? null : editingSite}
          cfg={cfg}
          adminUid={fbUser.uid}
          adminName={myName}
          lockedOwner={{ uid: fbUser.uid, name: myName }}
          onClose={() => setEditingSite(null)}
        />
      )}
      {assetEdit && (
        <AssetEditor
          asset={assetEdit.asset}
          site={assetEdit.site}
          cfg={cfg}
          uid={fbUser.uid}
          byName={myName}
          onClose={() => setAssetEdit(null)}
        />
      )}
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  colWrap: { width: '100%', maxWidth: 720 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8, backgroundColor: colors.background },
  centerTitle: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  intro: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  introText: { fontSize: font.sm, color: colors.text2, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginBottom: 12, ...shadow.card },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pic: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  propName: { fontSize: font.md, fontWeight: '700', color: colors.text },
  mut: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  editLink: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  assetName: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
  badge: { fontSize: 12, fontWeight: '700', color: '#3730a3', backgroundColor: '#eef2ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeOk: { color: '#065f46', backgroundColor: '#dcfce7' },
  badgeExp: { color: '#92400e', backgroundColor: '#fef3c7' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnO: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface },
  btnOText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  btnP: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnPText: { color: colors.white, fontWeight: '800', fontSize: font.md },
  empty: { color: colors.text2, fontSize: font.sm, textAlign: 'center', paddingVertical: 30 },
});
