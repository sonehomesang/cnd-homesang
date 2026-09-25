import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';
import PhotoPicker from '@/components/PhotoPicker';
import { addSiteEvidence, canViewSite, componentSurface, watchSite, type Site } from '@/lib/sites';
import { watchSiteConfig, DEFAULT_SITE_CONFIG, formatFieldValue, computeValue, type SiteConfig } from '@/lib/siteConfig';
import { watchJobsForSite, type Job } from '@/lib/jobs';
import { addAssetHistory, paramComparison, warrantyStatus, watchAssetsForSite, HISTORY_META, newHistoryId, type Asset, type AssetHistoryType } from '@/lib/assets';
import CategoryKnowledge from '@/components/CategoryKnowledge';
import AppFooter from '@/components/AppFooter';

function fmtDate(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString('lo-LA'); } catch { return new Date(ms).toISOString().slice(0, 10); }
}
function fmtDateTime(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString('lo-LA', { dateStyle: 'short', timeStyle: 'short' }); } catch { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}

export default function SiteDossierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const { isAdmin } = usePermissions();
  const tt = useTT();
  const myName = profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('siteDossier', 'ຜູ້ໃຊ້');
  const [site, setSite] = useState<Site | null | undefined>(undefined);
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pendingEv, setPendingEv] = useState<string[]>([]);
  const [tab, setTab] = useState<string>('__building');

  useEffect(() => { if (id) return watchSite(id, setSite); }, [id]);
  useEffect(() => watchSiteConfig(setCfg), []);
  useEffect(() => { if (id) return watchJobsForSite(id, setJobs); }, [id]);
  useEffect(() => { if (id) return watchAssetsForSite(id, setAssets); }, [id]);

  const tabs = useMemo(() => {
    const t = cfg.sections.map((s) => ({ key: s.key, label: (s.icon ? s.icon + ' ' : '') + s.label }));
    t.push({ key: '__rooms', label: tt('siteDossier', '🚪 ຫ້ອງ') });
    t.push({ key: '__assets', label: tt('siteDossier', '🔩 ຊັບສິນ') });
    t.push({ key: '__jobs', label: tt('siteDossier', '🔧 ວຽກ') });
    t.push({ key: '__evidence', label: tt('siteDossier', '📷 ຫຼັກຖານ') });
    t.push({ key: '__audit', label: tt('siteDossier', '📜 ປະຫວັດແກ້') });
    return t;
  }, [cfg, tt]);

  useEffect(() => { if (cfg.sections[0]) setTab(cfg.sections[0].key); }, [cfg.sections.length]);

  if (site === undefined) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (site === null) return <View style={styles.center}><Text style={styles.muted}>{tt('siteDossier', 'ບໍ່ ພົບ ສະຖານທີ່')}</Text></View>;

  const allowed = canViewSite(site, fbUser?.uid, isAdmin);
  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockTitle}>{tt('siteDossier', 'ຂໍ້ມູນ ສະຖານທີ່ ນີ້ ເປັນ ສ່ວນຕົວ')}</Text>
        <Text style={styles.muted}>{tt('siteDossier', 'ຕ້ອງ ໄດ້ ຮັບ ອະນຸຍາດ ຈາກ ເຈົ້າຂອງ ຈຶ່ງ ເຫັນ ໄດ້')}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Text style={styles.backText}>{tt('siteDossier', '← ກັບ')}</Text></Pressable>
      </View>
    );
  }

  const bt = site.fields?.building?.buildingType;
  const activeSection = cfg.sections.find((s) => s.key === tab);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.colWrap}>
      {/* header */}
      <View style={styles.card}>
        <Text style={styles.title}>🏠 {site.name}</Text>
        <Text style={styles.muted}>📍 {site.address || '—'}</Text>
        <View style={styles.badges}>
          {!!bt && <Text style={styles.badge}>{bt}</Text>}
          <Text style={styles.badge}>{site.rooms.length} {tt('siteDossier', 'ຫ້ອງ')}</Text>
          <Text style={styles.badge}>🔧 {jobs.length} {tt('siteDossier', 'ວຽກ')}</Text>
        </View>
        <Text style={styles.meta}>👤 {site.ownerName || '—'} · {tt('siteDossier', 'ສ້າງ ໂດຍ')} {site.createdByName || 'admin'}{site.updatedByName ? ` · ${tt('siteDossier', 'ແກ້:')} ${site.updatedByName}` : ''}</Text>
      </View>

      {/* tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tabs.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* section tab */}
      {activeSection && (
        <View style={styles.card}>
          {activeSection.fields.map((f) => (
            <View key={f.key} style={styles.row}>
              <Text style={styles.k}>{f.label}</Text>
              <Text style={styles.v}>{formatFieldValue(f, site.fields?.[activeSection.key] ?? {})}</Text>
            </View>
          ))}
        </View>
      )}

      {/* rooms tab */}
      {tab === '__rooms' && (
        <View style={{ gap: 10 }}>
          {site.rooms.length === 0 && <Text style={styles.emptyCard}>{tt('siteDossier', 'ຍັງ ບໍ່ ໄດ້ ບັນທຶກ ຫ້ອງ')}</Text>}
          {site.rooms.map((room) => {
            const rt = cfg.roomTypes.find((x) => x.key === room.typeKey);
            const areaDef = cfg.roomFields.find((f) => f.key === 'area');
            const volDef = cfg.roomFields.find((f) => f.key === 'volume');
            const area = areaDef ? computeValue(areaDef, room.fields ?? {}) : undefined;
            const vol = volDef ? computeValue(volDef, room.fields ?? {}) : undefined;
            return (
              <View key={room.id} style={styles.card}>
                <Text style={styles.roomTitle}>{rt?.icon ? rt.icon + ' ' : ''}{room.name || rt?.label}</Text>
                {(area !== undefined || vol !== undefined) && (
                  <View style={styles.computedBar}>
                    {area !== undefined && <Text style={styles.computedTxt}>📐 {area} {tt('siteDossier', 'ຕ.ມ')}</Text>}
                    {vol !== undefined && <Text style={styles.computedTxt}>📦 {vol} {tt('siteDossier', 'ມ³')}</Text>}
                  </View>
                )}
                {cfg.roomFields.filter((f) => !f.factors?.length).map((f) => {
                  const val = formatFieldValue(f, room.fields ?? {});
                  if (val === '—') return null;
                  return (
                    <View key={f.key} style={styles.row}>
                      <Text style={styles.k}>{f.label}</Text>
                      <Text style={styles.v}>{val}</Text>
                    </View>
                  );
                })}
                {(room.components ?? []).length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.compHead}>{tt('siteDossier', '🧩 ອົງປະກອບ')}</Text>
                    {(room.components ?? []).map((comp) => {
                      const ct = cfg.componentTypes.find((x) => x.key === comp.typeKey);
                      const surf = componentSurface(comp.typeKey, room);
                      const parts = cfg.componentFields.map((f) => formatFieldValue(f, comp.fields ?? {})).filter((v) => v !== '—');
                      return (
                        <View key={comp.id} style={styles.compRow}>
                          <Text style={styles.compName}>{ct?.icon ? ct.icon + ' ' : ''}{ct?.label}</Text>
                          <Text style={styles.compMeta}>{parts.join(' · ') || '—'}{surf !== undefined ? ` · ~${surf} ${tt('siteDossier', 'ຕ.ມ')}` : ''}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* assets tab */}
      {tab === '__assets' && (
        <View style={{ gap: 10 }}>
          {assets.length === 0 && <Text style={styles.emptyCard}>{tt('siteDossier', 'ຍັງ ບໍ່ ມີ ຊັບສິນ ບັນທຶກ ໄວ້')}</Text>}
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} cfg={cfg} byName={myName} />
          ))}
        </View>
      )}

      {/* jobs tab */}
      {tab === '__jobs' && (
        <View style={{ gap: 8 }}>
          {jobs.length === 0 && <Text style={styles.emptyCard}>{tt('siteDossier', 'ຍັງ ບໍ່ ມີ ວຽກ ຜູກ ກັບ ສະຖານທີ່ ນີ້')}</Text>}
          {jobs.map((j) => (
            <Pressable key={j.id} style={styles.jobRow} onPress={() => router.push(`/jobs/${j.id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobTitle}>{j.title}</Text>
                <Text style={styles.muted}>{fmtDate(j.createdAt)}{j.roomName ? ` · ${j.roomName}` : ''} · {j.status}</Text>
              </View>
              {!!j.finalPrice && <Text style={styles.jobPrice}>{j.finalPrice.toLocaleString()} {tt('siteDossier', 'ກີບ')}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {/* evidence roll-up tab */}
      {tab === '__evidence' && (
        <EvidenceTab
          site={site} jobs={jobs} assets={assets} cfg={cfg}
          pending={pendingEv} setPending={setPendingEv} siteId={id!}
          onSave={async () => {
            for (const url of pendingEv) await addSiteEvidence(id!, { url, by: fbUser?.uid, byName: myName, at: Date.now() });
            setPendingEv([]);
          }}
        />
      )}

      {/* audit roll-up tab */}
      {tab === '__audit' && <AuditTab site={site} jobs={jobs} assets={assets} cfg={cfg} />}

      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

interface EvItem { url: string; label: string }

function openUrl(url: string) {
  if (typeof window !== 'undefined') window.open(url, '_blank');
}

function EvidenceGrid({ title, items }: { title: string; items: EvItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.evSrc}>{title} ({items.length})</Text>
      <View style={styles.evGrid}>
        {items.map((it, i) => (
          <Pressable key={i} style={styles.evThumbWrap} onPress={() => openUrl(it.url)}>
            <Image source={{ uri: it.url }} style={styles.evThumb} />
            <Text style={styles.evLabel} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Evidence roll-up: photos/docs pulled from jobs + assets + site uploads. */
function EvidenceTab({ site, jobs, assets, cfg, pending, setPending, siteId, onSave }: {
  site: Site; jobs: Job[]; assets: Asset[]; cfg: SiteConfig;
  pending: string[]; setPending: (p: string[]) => void; siteId: string; onSave: () => void;
}) {
  const { fbUser } = useAuth();
  const tt = useTT();
  const jobImgs: EvItem[] = [];
  const docs: EvItem[] = [];
  jobs.forEach((j) => {
    (j.photos ?? []).forEach((u) => jobImgs.push({ url: u, label: j.title }));
    (j.completionPhotos ?? []).forEach((u) => jobImgs.push({ url: u, label: `${j.title} ${tt('siteDossier', '(ຫຼັງ)')}` }));
    if (j.acceptanceSignatureUrl) docs.push({ url: j.acceptanceSignatureUrl, label: `${tt('siteDossier', 'ລາຍເຊັນ ຮັບ ມອບ ·')} ${j.title}` });
    if (j.signatureUrl) docs.push({ url: j.signatureUrl, label: `${tt('siteDossier', 'ລາຍເຊັນ ໃບສະເໜີ ·')} ${j.title}` });
    if (j.manualUrl) docs.push({ url: j.manualUrl, label: `${tt('siteDossier', 'ຄູ່ມື ·')} ${j.title}` });
  });
  const assetImgs: EvItem[] = [];
  assets.forEach((a) => {
    const cat = cfg.assetCategories.find((c) => c.key === a.category);
    (a.photos ?? []).forEach((u) => assetImgs.push({ url: u, label: [a.brand, a.model].filter(Boolean).join(' ') || cat?.label || tt('siteDossier', 'ຊັບສິນ') }));
  });
  const siteEv: EvItem[] = (site.evidence ?? []).map((e) => ({ url: e.url, label: e.caption || (e.byName ? `${tt('siteDossier', 'ອັບ ໂດຍ')} ${e.byName}` : tt('siteDossier', 'ຫຼັກຖານ')) }));
  const total = jobImgs.length + docs.length + assetImgs.length + siteEv.length;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.card}>
        <Text style={styles.compHead}>{tt('siteDossier', '＋ ອັບໂຫລດ ຫຼັກຖານ (ລະດັບ ສະຖານທີ່)')}</Text>
        {fbUser ? <PhotoPicker photos={pending} onChange={setPending} pathPrefix={`sites/${siteId}`} max={6} /> : <Text style={styles.muted}>{tt('siteDossier', 'ເຂົ້າ ລະບົບ ເພື່ອ ອັບ')}</Text>}
        {pending.length > 0 && (
          <Pressable style={styles.evSaveBtn} onPress={onSave}><Text style={styles.evSaveText}>{tt('siteDossier', '💾 ບັນທຶກ')} {pending.length} {tt('siteDossier', 'ຮູບ ເຂົ້າ ສະຖານທີ່')}</Text></Pressable>
        )}
      </View>
      <EvidenceGrid title={tt('siteDossier', '🖼️ ອັບ ໃນ ສະຖານທີ່')} items={siteEv} />
      <EvidenceGrid title={tt('siteDossier', '📷 ຮູບ ວຽກ (ກ່ອນ/ຫຼັງ)')} items={jobImgs} />
      <EvidenceGrid title={tt('siteDossier', '📄 ຮັບ ມອບ · ລາຍເຊັນ · ຄູ່ມື')} items={docs} />
      <EvidenceGrid title={tt('siteDossier', '🔩 ຮູບ ຊັບສິນ')} items={assetImgs} />
      {total === 0 && <Text style={styles.emptyCard}>{tt('siteDossier', 'ຍັງ ບໍ່ ມີ ຫຼັກຖານ — ອັບ ຮູບ ຫຼື ຜູກ ວຽກ/ຊັບສິນ ທີ່ ມີ ຮູບ')}</Text>}
    </View>
  );
}

interface AuditRow { at: number; who?: string; title: string; tag: string }

/** Audit roll-up: site edits + asset add/history + jobs posted, sorted by time. */
function AuditTab({ site, jobs, assets, cfg }: { site: Site; jobs: Job[]; assets: Asset[]; cfg: SiteConfig }) {
  const tt = useTT();
  const rows: AuditRow[] = [];
  (site.changeLog ?? []).forEach((c) => rows.push({ at: c.at, who: c.byName, title: c.action + (c.detail ? `: ${c.detail}` : ''), tag: tt('siteDossier', 'ສະຖານທີ່') }));
  assets.forEach((a) => {
    const cat = cfg.assetCategories.find((x) => x.key === a.category);
    const nm = [a.brand, a.model].filter(Boolean).join(' ') || cat?.label || tt('siteDossier', 'ຊັບສິນ');
    rows.push({ at: a.createdAt, who: a.createdByName, title: `${tt('siteDossier', 'ເພີ່ມ ຊັບສິນ')} ${nm}`, tag: tt('siteDossier', 'ຊັບສິນ') });
    (a.history ?? []).forEach((h) => rows.push({ at: h.date, who: h.byName, title: `${HISTORY_META[h.type].label} ${nm}`, tag: tt('siteDossier', 'ຊັບສິນ') }));
  });
  jobs.forEach((j) => rows.push({ at: j.createdAt, who: j.customerName, title: `${tt('siteDossier', 'ໂພສ ວຽກ')} "${j.title}"`, tag: tt('siteDossier', 'ວຽກ') }));
  rows.sort((a, b) => b.at - a.at);

  return (
    <View style={styles.card}>
      <Text style={styles.compHead}>{tt('siteDossier', '📜 ໃຜ ເຮັດ ຫຍັງ ຕອນ ໃດ (ລວມ ທຸກ ຢ່າງ)')}</Text>
      {rows.length === 0 && <Text style={styles.emptyCard}>{tt('siteDossier', 'ຍັງ ບໍ່ ມີ ປະຫວັດ')}</Text>}
      {rows.map((r, i) => (
        <View key={i} style={styles.auditRow}>
          <View style={styles.auditDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.auditTitle}>{r.title} <Text style={styles.auditTag}>{r.tag}</Text></Text>
            <Text style={styles.muted}>{r.who || '—'} · {fmtDateTime(r.at)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Asset card in the Dossier: details + warranty + scrap + history + inline add-record. */
function AssetCard({ asset, cfg, byName }: { asset: Asset; cfg: SiteConfig; byName: string }) {
  const tt = useTT();
  const [open, setOpen] = useState(false);
  const [hType, setHType] = useState<AssetHistoryType>('maintain');
  const [hDate, setHDate] = useState('');
  const [hNote, setHNote] = useState('');
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showKb, setShowKb] = useState(false);
  const cat = cfg.assetCategories.find((c) => c.key === asset.category);
  const w = warrantyStatus(asset);
  const rows = paramComparison(asset);
  const assetName = [asset.brand, asset.model].filter(Boolean).join(' ') || cat?.label || tt('siteDossier', 'ເຄື່ອງ');
  const hasKb = !!(cat && ((cat.spareParts?.length ?? 0) || (cat.serviceRates?.length ?? 0) || (cat.troubleshooting?.length ?? 0)));
  const reportRepair = (symptom: string) =>
    router.push({ pathname: '/post-job', params: { title: `${tt('siteDossier', 'ສ້ອມ')} ${assetName}: ${symptom}`, siteId: asset.siteId, assetId: asset.id } } as any);

  const params = asset.parameters ?? [];
  const add = async () => {
    setBusy(true);
    try {
      const t = hDate ? Date.parse(hDate) : Date.now();
      const rd = params.map((p) => ({ label: p.label, value: (readings[p.id] ?? '').trim() })).filter((r) => r.value);
      await addAssetHistory(asset.id, { id: newHistoryId(), type: hType, date: Number.isFinite(t) ? t : Date.now(), note: hNote.trim() || undefined, byName, readings: rd.length ? rd : undefined } as any);
      setHNote(''); setHDate(''); setReadings({}); setOpen(false);
    } catch { /* rule may block a non-authorized viewer */ }
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.roomTitle}>{cat?.icon ? cat.icon + ' ' : ''}{[asset.brand, asset.model].filter(Boolean).join(' ') || cat?.label}</Text>
      <Text style={styles.muted}>{cat?.label}{asset.serial ? ` · ${asset.serial}` : ''}{asset.roomName ? ` · ${asset.roomName}` : ''}</Text>
      {(asset.installedAt || asset.installedBy) && (
        <Text style={styles.muted}>🔩 {tt('siteDossier', 'ຕິດຕັ້ງ')} {asset.installedAt ? fmtDate(asset.installedAt) : ''}{asset.installedBy ? ` · ${tt('siteDossier', 'ໂດຍ')} ${asset.installedBy}` : ''}</Text>
      )}
      <View style={styles.badges}>
        {w.state !== 'none' && <Text style={[styles.badge, w.state === 'active' ? styles.badgeOk : styles.badgeExp]}>🛡️ {w.state === 'active' ? `${tt('siteDossier', 'ຮັບປະກັນ ຮອດ')} ${fmtDate(w.endMs)}` : tt('siteDossier', 'ໝົດ ຮັບປະກັນ')}</Text>}
        {typeof asset.scrapValue === 'number' && <Text style={styles.badge}>💰 ~{asset.scrapValue.toLocaleString()} {tt('siteDossier', 'ກີບ')}</Text>}
      </View>
      {rows.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View style={styles.pHeadRow}>
            <Text style={[styles.pCell, styles.pLabelCell]}>{tt('siteDossier', '📐 ພາຣາມິເຕີ')}</Text>
            <Text style={[styles.pCell, styles.pHeadCell]}>{tt('siteDossier', 'ໂຮງງານ')}</Text>
            <Text style={[styles.pCell, styles.pHeadCell]}>{tt('siteDossier', 'ຕິດຕັ້ງ')}</Text>
            <Text style={[styles.pCell, styles.pHeadCell]}>{tt('siteDossier', 'ຫຼ້າສຸດ')}</Text>
          </View>
          {rows.map((r) => (
            <View key={r.label} style={styles.pRow}>
              <Text style={[styles.pCell, styles.pLabelCell]}>{r.label}{r.unit ? ` (${r.unit})` : ''}</Text>
              <Text style={[styles.pCell, styles.pValCell]}>{r.factory ?? '—'}</Text>
              <Text style={[styles.pCell, styles.pValCell]}>{r.install ?? '—'}</Text>
              <Text style={[styles.pCell, styles.pValCell, r.latest ? styles.pLatest : null]}>{r.latest ?? '—'}</Text>
            </View>
          ))}
        </View>
      )}
      {hasKb && cat && (
        <View style={{ marginTop: 8 }}>
          <Pressable style={styles.kbBtn} onPress={() => setShowKb((s) => !s)}>
            <Text style={styles.kbBtnText}>{tt('siteDossier', '📖 ຄູ່ມື · ອາໄລ່ · ແກ້ ບັນຫາ')} {showKb ? '▲' : '▼'}</Text>
          </Pressable>
          {showKb && <View style={{ marginTop: 8 }}><CategoryKnowledge category={cat} onReport={reportRepair} /></View>}
        </View>
      )}

      {asset.history.length > 0 && (
        <View style={{ marginTop: 8 }}>
          {[...asset.history].sort((a, b) => b.date - a.date).map((h) => {
            const m = HISTORY_META[h.type];
            return (
              <View key={h.id} style={styles.hRow}>
                <Text style={styles.hTitle}>{m.icon} {m.label} · {fmtDate(h.date)}{h.jobId ? ` · 🔗${h.jobId}` : ''}</Text>
                {!!h.note && <Text style={styles.muted}>{h.note}{h.byName ? ` — ${h.byName}` : ''}</Text>}
                {!!h.readings?.length && <Text style={styles.muted}>📐 {h.readings.map((r) => `${r.label} ${r.value}`).join(' · ')}</Text>}
              </View>
            );
          })}
        </View>
      )}
      {open ? (
        <View style={styles.addBox}>
          <View style={styles.badges}>
            {(Object.keys(HISTORY_META) as AssetHistoryType[]).map((t) => (
              <Pressable key={t} style={[styles.hChip, hType === t && styles.hChipOn]} onPress={() => setHType(t)}>
                <Text style={[styles.hChipText, hType === t && styles.hChipTextOn]}>{HISTORY_META[t].icon} {HISTORY_META[t].label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={hDate} onChangeText={setHDate} placeholder={tt('siteDossier', 'ວັນທີ 2026-06-05')} placeholderTextColor="#999" style={styles.hInput} />
          <TextInput value={hNote} onChangeText={setHNote} placeholder={tt('siteDossier', 'ໝາຍເຫດ')} placeholderTextColor="#999" style={styles.hInput} />
          {params.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={styles.rdHint}>{tt('siteDossier', '📐 ຄ່າ ວັດ ຄັ້ງ ນີ້ (ບໍ່ ບັງຄັບ)')}</Text>
              {params.map((p) => (
                <View key={p.id} style={styles.rdRow}>
                  <Text style={styles.rdLabel}>{p.label}{p.unit ? ` (${p.unit})` : ''}</Text>
                  <TextInput value={readings[p.id] ?? ''} onChangeText={(t) => setReadings((r) => ({ ...r, [p.id]: t }))} placeholder={p.factory ?? '—'} placeholderTextColor="#999" style={styles.rdInput} />
                </View>
              ))}
            </View>
          )}
          <View style={styles.badges}>
            <Pressable style={[styles.addRecBtn, busy && { opacity: 0.6 }]} onPress={add} disabled={busy}><Text style={styles.addRecText}>{busy ? '...' : tt('siteDossier', '💾 ບັນທຶກ')}</Text></Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)}><Text style={styles.cancelText}>{tt('siteDossier', 'ຍົກເລີກ')}</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.addRecOutline} onPress={() => setOpen(true)}><Text style={styles.addRecOutlineText}>{tt('siteDossier', '＋ ເພີ່ມ ປະຫວັດ (ຕິດຕັ້ງ/ບຳລຸງ/ສ້ອມ)')}</Text></Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  colWrap: { width: '100%', maxWidth: 720, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  title: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.xs, color: colors.text2 },
  meta: { fontSize: font.xs, color: colors.text2, marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  badge: { fontSize: 12, fontWeight: '700', color: '#3730a3', backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tabRow: { gap: 6, paddingVertical: 2 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabSoon: { opacity: 0.4 },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  tabTextOn: { color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  k: { fontSize: font.sm, color: colors.text2 },
  v: { fontSize: font.sm, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  roomTitle: { fontSize: font.md, fontWeight: '800', color: colors.text, marginBottom: 6 },
  compHead: { fontSize: font.xs, fontWeight: '800', color: '#334155', marginBottom: 4 },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 10 },
  compName: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  compMeta: { fontSize: font.xs, color: colors.text2, flexShrink: 1, textAlign: 'right' },
  badgeOk: { color: '#065f46', backgroundColor: '#dcfce7' },
  badgeExp: { color: '#92400e', backgroundColor: '#fef3c7' },
  hRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  hTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  pHeadRow: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  pRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pCell: { flex: 1, fontSize: font.xs, textAlign: 'center' },
  pLabelCell: { flex: 1.5, textAlign: 'left', fontWeight: '700', color: colors.text },
  pHeadCell: { color: colors.text2, fontWeight: '800' },
  pValCell: { color: colors.text2 },
  pLatest: { color: '#1e3a8a', fontWeight: '800' },
  kbBtn: { backgroundColor: '#eef2ff', borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' },
  kbBtnText: { color: '#3730a3', fontWeight: '800', fontSize: font.xs },
  rdHint: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  rdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rdLabel: { flex: 1, fontSize: font.xs, color: colors.text2 },
  rdInput: { width: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, fontSize: font.xs, color: colors.text, backgroundColor: colors.surface },
  evSrc: { fontSize: font.xs, fontWeight: '800', color: '#334155', marginBottom: 8 },
  evGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evThumbWrap: { width: '31%' },
  evThumb: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#eef2ff' },
  evLabel: { fontSize: 12, color: colors.text2, marginTop: 3 },
  evSaveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  evSaveText: { color: colors.white, fontWeight: '700', fontSize: font.xs },
  auditRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  auditDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5 },
  auditTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  auditTag: { fontSize: 12, fontWeight: '800', color: '#5b21b6' },
  addBox: { marginTop: 10, backgroundColor: '#f8fafc', borderRadius: radius.md, padding: 10, gap: 6 },
  hChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.surface },
  hChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  hChipText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  hChipTextOn: { color: colors.white },
  hInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.sm, color: colors.text, backgroundColor: colors.surface },
  addRecBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 9 },
  addRecText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { color: colors.text2, fontWeight: '600', fontSize: 13 },
  addRecOutline: { marginTop: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  addRecOutlineText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  computedBar: { flexDirection: 'row', gap: 10, backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  computedTxt: { fontSize: font.sm, fontWeight: '800', color: '#1e3a8a' },
  emptyCard: { textAlign: 'center', color: colors.text2, fontSize: font.sm, padding: 20 },
  jobRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, gap: 8 },
  jobTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  jobPrice: { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  lockIcon: { fontSize: 40 },
  lockTitle: { fontSize: font.md, fontWeight: '800', color: colors.text },
  backBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary },
  backText: { color: colors.white, fontWeight: '700' },
  footNote: { fontSize: font.xs, color: '#9aa4b2', textAlign: 'center', marginTop: 6 },
});
