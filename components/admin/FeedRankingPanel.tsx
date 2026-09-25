import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { saveAppSettings, watchAppSettings } from '@/lib/appSettings';
import { DEFAULT_FEED_CONFIG, FEED_KEYS, type FeedMode, type FeedRankConfig } from '@/lib/freshness';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

// Feeds wired to the engine so far (the rest render disabled "coming soon").
const ACTIVE = new Set<string>(['products', 'posts', 'jobs', 'techs']);
// feeds where the OLD bucket keeps distance ("nearby") order — mode toggle N/A
const DISTANCE_FEEDS = new Set<string>(['jobs', 'techs']);

export default function FeedRankingPanel() {
  const { canEdit } = useSectionPerms('feedrank');
  const tt = useTT();
  const [ranking, setRanking] = useState<Record<string, FeedRankConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => watchAppSettings((s) => setRanking(s.feedRanking ?? {})), []);

  const cfgOf = (k: string): FeedRankConfig => ranking[k] ?? DEFAULT_FEED_CONFIG;
  const patch = (k: string, p: Partial<FeedRankConfig>) => {
    setSaved(false);
    setRanking((r) => ({ ...r, [k]: { ...cfgOf(k), ...p } }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveAppSettings({ feedRanking: ranking });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admFeedRank', '🔀 ຈັດລຽງ Feed ຕາມຄວາມສົດ')}</Text>
      <Text style={styles.sub}>
        {tt('admFeedRank', 'ຂອງໃໝ່ຂຶ້ນເທິງສຸດ ໃນ N ວັນທຳອິດ (ປ້າຍ “ໃໝ່”), ຫຼັງຈາກນັ້ນຈັດຕາມ mode ທີ່ເລືອກ.')}
      </Text>

      {FEED_KEYS.map((f) => {
        const on = ACTIVE.has(f.key);
        const cfg = cfgOf(f.key);
        return (
          <View key={f.key} style={[styles.card, on ? styles.cardOn : styles.cardSoon]}>
            <View style={styles.rowTop}>
              <Text style={styles.feedName}>{f.icon} {tt('admFeedRank', f.lao)}</Text>
              <Text style={[styles.tag, on ? styles.tagOn : styles.tagSoon]}>
                {on ? tt('admFeedRank', 'ໃຊ້ງານ') : tt('admFeedRank', 'ຈະຂະຫຍາຍ')}
              </Text>
            </View>

            {on && (
              <View style={styles.ctl}>
                <View style={styles.fld}>
                  <Text style={styles.fldLabel}>{tt('admFeedRank', 'ໄລຍະໃໝ່')}</Text>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} disabled={!canEdit} onPress={() => patch(f.key, { freshDays: Math.max(1, cfg.freshDays - 1) })}>
                      <Text style={styles.stepTxt}>−</Text>
                    </Pressable>
                    <Text style={styles.stepVal}>{cfg.freshDays}</Text>
                    <Pressable style={styles.stepBtn} disabled={!canEdit} onPress={() => patch(f.key, { freshDays: Math.min(90, cfg.freshDays + 1) })}>
                      <Text style={styles.stepTxt}>＋</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.unit}>{tt('admFeedRank', 'ວັນ')}</Text>
                </View>

                <View style={styles.fld}>
                  <Text style={styles.fldLabel}>{tt('admFeedRank', 'ຫຼັງໝົດ')}</Text>
                  {DISTANCE_FEEDS.has(f.key) ? (
                    <Text style={styles.distNote}>{tt('admFeedRank', '📍 ໃກ້ຕົວ (ໄລຍະທາງ)')}</Text>
                  ) : (
                    <View style={styles.seg}>
                      {(['random', 'priority'] as FeedMode[]).map((m) => (
                        <Pressable
                          key={m}
                          disabled={!canEdit}
                          style={[styles.segBtn, cfg.mode === m && styles.segBtnOn]}
                          onPress={() => patch(f.key, { mode: m })}>
                          <Text style={[styles.segTxt, cfg.mode === m && styles.segTxtOn]}>
                            {m === 'random' ? tt('admFeedRank', '🔀 ໝູນວຽນ') : tt('admFeedRank', '📌 ຈັດເອງ')}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.note}>
        <Text style={styles.noteTxt}>
          {tt('admFeedRank', 'Priority (ຈັດເອງ) ສຳລັບສິນຄ້າ = ໃຊ້ 📌 “ສິນຄ້າເດ່ນ” ທີ່ຕັ້ງໃນໜ້າສິນຄ້າ — ຂອງເດ່ນຂຶ້ນກ່ອນ, ຕໍ່ດ້ວຍໃໝ່ສຸດ.')}
        </Text>
      </View>

      {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
      {canEdit && (
        <Pressable style={[styles.btn, saving && styles.btnOff]} onPress={save} disabled={saving}>
          <Text style={styles.btnText}>{saving ? tt('admFeedRank', 'ກຳລັງບັນທຶກ...') : tt('admFeedRank', '💾 ບັນທຶກ')}</Text>
        </Pressable>
      )}
      {saved && <Text style={styles.saved}>{tt('admFeedRank', '✓ ບັນທຶກແລ້ວ')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardOn: { borderColor: '#0066CC', backgroundColor: '#F8FBFF' },
  cardSoon: { borderColor: '#e5e7eb', backgroundColor: '#fff', opacity: 0.6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedName: { fontSize: 14, fontWeight: '700', color: '#111' },
  tag: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  tagOn: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  tagSoon: { backgroundColor: '#F1F5F9', color: '#64748B' },
  ctl: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 18, marginTop: 12 },
  fld: { gap: 6 },
  fldLabel: { fontSize: 12, color: '#374151', fontWeight: '600' },
  unit: { fontSize: 12, color: '#9ca3af' },
  distNote: { fontSize: 12, color: '#0066CC', fontWeight: '600', paddingVertical: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, overflow: 'hidden' },
  stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  stepTxt: { fontSize: 15, color: '#0066CC', fontWeight: '700' },
  stepVal: { minWidth: 46, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#111' },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  segBtnOn: { backgroundColor: '#0066CC' },
  segTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  segTxtOn: { color: '#fff' },
  note: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 12, padding: 11, marginTop: 6, marginBottom: 4 },
  noteTxt: { fontSize: 12, color: '#9A3412', lineHeight: 18 },
  error: { color: '#dc2626', fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: '#0066CC', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saved: { color: '#16a34a', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
});
