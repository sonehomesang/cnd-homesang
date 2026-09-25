import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import { type AppSettings, DEFAULT_SETTINGS, saveAppSettings, sectionOn, TOGGLEABLE_SECTIONS, watchAppSettings } from '@/lib/appSettings';
import { BNPL_MODE_LABEL, type BnplMode } from '@/lib/bnpl';

const PAGE_LABELS: Record<string, string> = {
  home: 'ໜ້າຫຼັກ', 'find-tech': 'ໂຮມຊ່າງ', explore: 'ໂຮມວຽກ', shop: 'ໂຮມເຄື່ອງ',
  community: 'ໂຮມເພື່ອນ', 'tech-profile': 'ໂປຣຟາຍ ຊ່າງ', 'job-detail': 'ລາຍລະອຽດ ງານ', product: 'ໜ້າ ສິນຄ້າ',
};
import { useTT } from '@/lib/i18n';
import PhotoPicker from '@/components/PhotoPicker';
import { useSectionPerms } from '@/lib/permissions-context';
import { purgeSampleData } from '@/lib/sampleData';
import { seedAllSampleData } from '@/lib/sampleSeed';
import { clearAllMockData } from '@/lib/mock';
import { useAuth } from '@/lib/auth-context';
import { fetchPublicIp } from '@/lib/clientIp';

export default function SettingsPanel() {
  const { canEdit, canDelete } = useSectionPerms('settings');
  const { fbUser } = useAuth();
  const tt = useTT();
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [clearingMock, setClearingMock] = useState(false);
  const [mockMsg, setMockMsg] = useState('');
  const [newIp, setNewIp] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => watchAppSettings(setS), []);

  const addIp = (ip: string) => {
    const v = ip.trim();
    if (!v) return;
    setSaved(false);
    setS((p) => ({ ...p, maintenanceAllowedIps: Array.from(new Set([...(p.maintenanceAllowedIps ?? []), v])) }));
    setNewIp('');
  };
  const removeIp = (ip: string) => {
    setSaved(false);
    setS((p) => ({ ...p, maintenanceAllowedIps: (p.maintenanceAllowedIps ?? []).filter((x) => x !== ip) }));
  };
  const scanIp = async () => {
    setScanning(true);
    setError('');
    try {
      const ip = await fetchPublicIp(true);
      if (ip) addIp(ip);
      else setError(tt('admSettings','ສະແກນ IP ບໍ່ ສຳເລັດ — ລອງ ໃໝ່ ຫຼື ໃສ່ ດ້ວຍ ມື'));
    } finally {
      setScanning(false);
    }
  };

  const seed = async () => {
    if (!fbUser) return;
    setSeeding(true);
    setSeedMsg('');
    try {
      const r = await seedAllSampleData(fbUser.uid);
      setSeedMsg(tt('admSettings','✓ ເຕີມແລ້ວ: ') + Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · '));
    } catch (e: any) {
      setSeedMsg('❌ ' + (e?.message ?? String(e)));
    } finally {
      setSeeding(false);
    }
  };

  const purge = async () => {
    if (!confirm(tt('admSettings','ລ້າງ ຂໍ້ມູນ ຕົວຢ່າງ (claims/disputes/posts ທີ່ seed ໄວ້)? ບໍ່ ສາມາດ ກູ້ ຄືນ.'))) return;
    setPurging(true);
    setPurgeMsg('');
    try {
      const r = await purgeSampleData();
      setPurgeMsg(tt('admSettings','✓ ລຶບ: ') + Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · '));
    } catch (e: any) {
      setPurgeMsg('❌ ' + (e?.message ?? String(e)));
    } finally {
      setPurging(false);
    }
  };

  // go-live: flip mock mode (persists immediately) — hides every 🧪 seed button
  const toggleMock = async () => {
    const v = !s.mockEnabled;
    setS((p) => ({ ...p, mockEnabled: v }));
    try { await saveAppSettings({ mockEnabled: v }); } catch (e: any) { setError(e?.message ?? String(e)); }
  };
  const clearMockAll = async () => {
    if (typeof confirm === 'function' && !confirm(tt('admSettings','ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງ ໝົດ (ຊ່າງ ປະຈຳ · ໃບ ບິນ · MK Plan)? ບໍ່ ສາມາດ ກູ້ ຄືນ.'))) return;
    setClearingMock(true);
    setMockMsg('');
    try { const n = await clearAllMockData(); setMockMsg(`✓ ${tt('admSettings','ລຶບ ແລ້ວ')} ${n}`); }
    catch (e: any) { setMockMsg('❌ ' + (e?.message ?? String(e))); }
    finally { setClearingMock(false); }
  };

  const set = (k: keyof AppSettings, v: string) => {
    setSaved(false);
    if (k === 'techMinRating') {
      setS((p) => ({ ...p, [k]: Number(v.replace(/[^\d.]/g, '')) || 0 }));
    } else if (k === 'platformFeePct' || k === 'minWithdrawalKip' || k === 'searchRadiusKm' || k === 'referralRewardKip' || k === 'brokerCommissionPct' || k === 'loyaltyEarnPct' || k === 'loyaltyMaxRedeemPct' || k === 'escrowAutoReleaseDays' || k === 'techTravelFreeKm' || k === 'techTravelPerKm' || k === 'surveyFeeAmount' || k === 'liabilityCapMultiplier' || k === 'urgentFeeKip' || k === 'homeJobCols' || k === 'homeJobCount' || k === 'shopColsMobile' || k === 'shopColsWide') {
      setS((p) => ({ ...p, [k]: Number(v.replace(/[^\d]/g, '')) || 0 }));
    } else {
      setS((p) => ({ ...p, [k]: v }));
    }
  };
  const setNum = (k: 'minWithdrawalKip' | 'referralRewardKip' | 'referralRefereeRewardKip', n: number) => {
    setSaved(false);
    setS((p) => ({ ...p, [k]: n }));
  };
  // BNPL config is a nested object — merge patches into s.bnpl
  const setBnpl = (patch: Partial<AppSettings['bnpl']>) => {
    setSaved(false);
    setS((p) => ({ ...p, bnpl: { ...p.bnpl, ...patch } }));
  };
  const setBnplNum = (k: keyof AppSettings['bnpl'], v: string) =>
    setBnpl({ [k]: Number(v.replace(/[^\d]/g, '')) || 0 } as Partial<AppSettings['bnpl']>);
  const setBnplPlan = (idx: number, patch: Partial<AppSettings['bnpl']['plans'][number]>) => {
    setSaved(false);
    setS((p) => ({ ...p, bnpl: { ...p.bnpl, plans: p.bnpl.plans.map((pl, i) => (i === idx ? { ...pl, ...patch } : pl)) } }));
  };
  const toggleBnplMode = (m: BnplMode) => {
    const has = s.bnpl.modes.includes(m);
    // keep at least one mode enabled
    const modes = has ? s.bnpl.modes.filter((x) => x !== m) : [...s.bnpl.modes, m];
    if (modes.length) setBnpl({ modes, defaultMode: modes.includes(s.bnpl.defaultMode) ? s.bnpl.defaultMode : modes[0] });
  };
  // set a section's visibility for a page ('all' = the master default)
  const setSection = (key: string, page: string, val: boolean) => {
    setSaved(false);
    setS((p) => {
      const sections = { ...(p.sections ?? {}) };
      sections[key] = { ...(sections[key] ?? {}), [page]: val };
      return { ...p, sections };
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveAppSettings(s);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admSettings','⚙️ ຕັ້ງຄ່າທົ່ວໄປ · App settings')}</Text>
      <Text style={styles.sub}>{tt('admSettings','ຂໍ້ມູນ ແລະ ຄ່າ ທີ່ໃຊ້ ທົ່ວແອັບ')}</Text>

      <Text style={styles.groupTitle}>{tt('admSettings','📱 ຂໍ້ມູນ ແອັບ')}</Text>
      <Text style={styles.label}>{tt('admSettings','ໂລໂກ້ (ປ່ອຍວ່າງ = ໃຊ້ໂລໂກ້ມາດຕະຖານ)')}</Text>
      <PhotoPicker
        photos={s.logoUrl ? [s.logoUrl] : []}
        onChange={(urls) => { setSaved(false); setS((p) => ({ ...p, logoUrl: urls[0] ?? '' })); }}
        pathPrefix="banners"
        mode="avatar"
      />

      <Field label={tt('admSettings','ຊື່ແອັບ')} value={s.appName} onChange={(v) => set('appName', v)} />
      <Field label={tt('admSettings','ປະກາດ (ສະແດງເທິງໜ້າຫຼັກ)')} value={s.announcement} onChange={(v) => set('announcement', v)} multiline placeholder={tt('admSettings','ເຊັ່ນ: ໂປຣໂມຊັ່ນ ເດືອນນີ້...')} />
      <Text style={styles.groupTitle}>{tt('admSettings','📞 ຕິດຕໍ່ & Social (ໄອຄອນ footer)')}</Text>
      <Field label={tt('admSettings','ເບີຕິດຕໍ່ ທີມງານ')} value={s.supportPhone} onChange={(v) => set('supportPhone', v)} placeholder="020 xxxx xxxx" />
      <Field label={tt('admSettings','ອີເມວ ທີມງານ')} value={s.supportEmail} onChange={(v) => set('supportEmail', v)} placeholder="support@homesang.la" />
      <Field label={tt('admSettings','Line (ID ຫຼື ລິ້ງ)')} value={s.supportLine} onChange={(v) => set('supportLine', v)} placeholder={tt('admSettings','@homesang ຫຼື https://line.me/...')} />
      <Field label={tt('admSettings','Telegram (@username ຫຼື ລິ້ງ)')} value={s.supportTelegram} onChange={(v) => set('supportTelegram', v)} placeholder={tt('admSettings','@homesang ຫຼື https://t.me/...')} />
      <Field label={tt('admSettings','Facebook (ລິ້ງ ຫຼື username)')} value={s.facebook} onChange={(v) => set('facebook', v)} placeholder="https://facebook.com/homesang" />
      <Field label={tt('admSettings','TikTok (@username ຫຼື ລິ້ງ)')} value={s.tiktok} onChange={(v) => set('tiktok', v)} placeholder="@homesang" />
      <Field label={tt('admSettings','YouTube (ລິ້ງ ຫຼື @channel)')} value={s.youtube} onChange={(v) => set('youtube', v)} placeholder="@homesang" />
      <Text style={styles.groupTitle}>{tt('admSettings','💰 ການເງິນ & ຄ່າທຳນຽມ')}</Text>
      <Field label={tt('admSettings','ຄ່າທຳນຽມ (%) — ສະແດງ')} value={String(s.platformFeePct)} onChange={(v) => set('platformFeePct', v)} keyboard />
      <MoneyField label={tt('admSettings','ຖອນເງິນ ຂັ້ນຕ່ຳ (ກີບ)')} value={s.minWithdrawalKip} onChange={(n) => setNum('minWithdrawalKip', n)} />
      <MoneyField label={tt('admSettings','ລາງວັນ ແນະນຳເພື່ອນ — ຝ່າຍ ຊວນ / 1 ຄົນ (ກີບ)')} value={s.referralRewardKip} onChange={(n) => setNum('referralRewardKip', n)} />
      <MoneyField label={tt('admSettings','ລາງວັນ ແນະນຳເພື່ອນ — ໝູ່ ໃໝ່ ຕ້ອນຮັບ (ກີບ, 0=ປິດ)')} value={s.referralRefereeRewardKip} onChange={(n) => setNum('referralRefereeRewardKip', n)} />
      <Field label={tt('admSettings','ຄ່າ commission ນາຍໜ້າ (%) ຕໍ່ ການຂາຍ')} value={String(s.brokerCommissionPct)} onChange={(v) => set('brokerCommissionPct', v)} keyboard />
      <Field label={tt('admSettings','ແຕ້ມສະສົມ — ໄດ້ຄືນ (% ຂອງ order ສຳເລັດ, 0=ປິດ)')} value={String(s.loyaltyEarnPct)} onChange={(v) => set('loyaltyEarnPct', v)} keyboard />
      <Field label={tt('admSettings','ແຕ້ມສະສົມ — ໃຊ້ໄດ້ສູງສຸດ (% ຂອງ order)')} value={String(s.loyaltyMaxRedeemPct)} onChange={(v) => set('loyaltyMaxRedeemPct', v)} keyboard />
      <Field label={tt('admSettings','Escrow — ຢືນຢັນ ອັດຕະໂນມັດ ຫຼັງ ສົ່ງ ເຖິງ (ມື້, 0=ປິດ)')} value={String(s.escrowAutoReleaseDays)} onChange={(v) => set('escrowAutoReleaseDays', v)} keyboard />
      <Text style={styles.groupTitle}>{tt('admSettings','📍 ຄົ້ນຫາ & ພື້ນທີ່')}</Text>
      <View style={styles.mtRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.label}>{tt('admSettings','📍 ຈຳກັດ ການເຫັນ ຕາມ ລັດສະໝີ')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ເປີດ = ຊ່າງ/ງານ/ຮ້ານ ເຫັນ ສະເພາະ ໃນ ລັດສະໝີ ຂ້າງລຸ່ມ · ປິດ = ເຫັນ ໝົດ ທຸກ ໄລຍະ (ຍັງ ບອກ ໄລຍະ ເປັນ ກມ)')}</Text>
        </View>
        <Pressable style={[styles.toggle, s.radiusVisibilityEnabled ? styles.tgOn : styles.tgOff]} onPress={() => { setSaved(false); setS((p) => ({ ...p, radiusVisibilityEnabled: !p.radiusVisibilityEnabled })); }}>
          <View style={styles.knob} />
        </Pressable>
      </View>
      <Field label={tt('admSettings','ລັດສະໝີຄົ້ນຫາ ໃກ້ຕົວ (ກມ)')} value={String(s.searchRadiusKm)} onChange={(v) => set('searchRadiusKm', v)} keyboard />

      <Text style={styles.groupTitle}>{tt('admSettings','🧩 ການ ສະແດງ ສິນຄ້າ / ວຽກ')}</Text>
      <Text style={styles.hint}>{tt('admSettings','ກຳນົດ ຈຳນວນ ຖັນ (ຄໍລຳ) ແລະ ຈຳນວນ ທີ່ ສະແດງ ໃນ ໜ້າ ຫຼັກ / ໜ້າ ຮ້ານ ໄດ້ ເອງ')}</Text>
      <Field label={tt('admSettings','ໜ້າ ຫຼັກ · ວຽກ ຫຼ້າສຸດ — ຖັນ (1–2)')} value={String(s.homeJobCols ?? 2)} onChange={(v) => set('homeJobCols', v)} keyboard />
      <Field label={tt('admSettings','ໜ້າ ຫຼັກ · ວຽກ ຫຼ້າສຸດ — ສະແດງ ຈັກ ອັນ')} value={String(s.homeJobCount ?? 4)} onChange={(v) => set('homeJobCount', v)} keyboard />
      <Field label={tt('admSettings','ໜ້າ ຮ້ານ · ສິນຄ້າ — ຖັນ ໃນ ມືຖື (2–3)')} value={String(s.shopColsMobile ?? 2)} onChange={(v) => set('shopColsMobile', v)} keyboard />
      <Field label={tt('admSettings','ໜ້າ ຮ້ານ · ສິນຄ້າ — ຖັນ ໃນ ຈໍ ກວ້າງ (3–6)')} value={String(s.shopColsWide ?? 5)} onChange={(v) => set('shopColsWide', v)} keyboard />

      <Text style={styles.groupTitle}>{tt('admSettings','🔧 ຊ່າງ — ຄ່າ ເດີນທາງ & ຄະແນນ')}</Text>
      <Field label={tt('admSettings','ຄ່າ ເດີນທາງ ຊ່າງ — ຟຣີ ພາຍໃນ (ກມ)')} value={String(s.techTravelFreeKm ?? 0)} onChange={(v) => set('techTravelFreeKm', v)} keyboard />
      <MoneyField label={tt('admSettings','ຄ່າ ເດີນທາງ ຊ່າງ — ຕໍ່ ກມ (ກີບ, 0 = ປິດ)')} value={s.techTravelPerKm ?? 0} onChange={(n) => set('techTravelPerKm', String(n))} />
      <Field label={tt('admSettings','ຄະແນນ ຂັ້ນຕ່ຳ ຊ່າງ (0–5, 0 = ປິດ; ຕ່ຳ ກວ່າ ນີ້ ຫຼຸດ ການ ເຫັນ)')} value={String(s.techMinRating ?? 0)} onChange={(v) => set('techMinRating', v)} keyboard />

      <Text style={styles.groupTitle}>{tt('admSettings','🧾 ຄ່າ ສຳຫຼວດ ໜ້າ ງານ')}</Text>
      <Text style={styles.label}>{tt('admSettings','ຮູບແບບ')}</Text>
      <View style={styles.segRow}>
        {([['off','ປິດ'],['prepay','ຈ່າຍ ກ່ອນ'],['agree','ຕົກລົງ ໄວ້']] as const).map(([m, lbl]) => (
          <Pressable
            key={m}
            style={[styles.seg, s.surveyFeeMode === m && styles.segOn]}
            onPress={() => { setSaved(false); setS((p) => ({ ...p, surveyFeeMode: m })); }}>
            <Text style={[styles.segTxt, s.surveyFeeMode === m && styles.segTxtOn]}>{tt('admSettings', lbl)}</Text>
          </Pressable>
        ))}
      </View>
      <MoneyField label={tt('admSettings','ຄ່າ ສຳຫຼວດ (ກີບ)')} value={s.surveyFeeAmount ?? 0} onChange={(n) => set('surveyFeeAmount', String(n))} />
      <Field label={tt('admSettings','ເພດານ ຄວາມ ຮັບຜິດ (ເທົ່າ ຂອງ ຄ່າ ບໍລິການ)')} value={String(s.liabilityCapMultiplier ?? 2)} onChange={(v) => set('liabilityCapMultiplier', v)} keyboard />

      <Text style={styles.groupTitle}>{tt('admSettings','🚨 ບໍລິການ ດ່ວນ / ສຸກເສີນ')}</Text>
      <View style={styles.mtRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.label}>{tt('admSettings','ເປີດ ໃຫ້ ໂພສ ງານ ດ່ວນ')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ງານ ດ່ວນ ລອຍ ຂຶ້ນ ເທິງ ສຸດ + ແຈ້ງ ຊ່າງ ທັນທີ (ບໍ່ ຕ້ອງ ຈອງ ຄິວ)')}</Text>
        </View>
        <Pressable style={[styles.toggle, s.urgentEnabled ? styles.tgOn : styles.tgOff]} onPress={() => { setSaved(false); setS((p) => ({ ...p, urgentEnabled: !p.urgentEnabled })); }}>
          <View style={styles.knob} />
        </Pressable>
      </View>
      <MoneyField label={tt('admSettings','ຄ່າ ດ່ວນ (ກີບ, 0 = ຟຣີ · ຊ່ວຍ ກັນ ໃຊ້ ພຳ)')} value={s.urgentFeeKip ?? 0} onChange={(n) => set('urgentFeeKip', String(n))} />

      <Text style={styles.groupTitle}>{tt('admSettings','💳 ຜ່ອນ ສິນຄ້າ (BNPL)')}</Text>
      <View style={styles.mtRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.label}>{tt('admSettings','ເປີດ ໃຊ້ ຜ່ອນ ສິນຄ້າ')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ໃຫ້ ລູກຄ້າ ຜ່ອນ ຊຳລະ ສິນຄ້າ — ຫັກ ຈາກ ກະເປົາ ເງິນ')}</Text>
        </View>
        <Pressable style={[styles.toggle, s.bnpl.enabled ? styles.tgOn : styles.tgOff]} onPress={() => setBnpl({ enabled: !s.bnpl.enabled })}>
          <View style={styles.knob} />
        </Pressable>
      </View>
      <Text style={styles.label}>{tt('admSettings','ໂໝດ ທີ່ ເປີດ (ເລືອກ ໄດ້ ຫຼາຍ)')}</Text>
      <View style={styles.segRow}>
        {(['layaway','bnpl'] as BnplMode[]).map((m) => (
          <Pressable key={m} style={[styles.seg, s.bnpl.modes.includes(m) && styles.segOn]} onPress={() => toggleBnplMode(m)}>
            <Text style={[styles.segTxt, s.bnpl.modes.includes(m) && styles.segTxtOn]}>{tt('admSettings', BNPL_MODE_LABEL[m])}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{tt('admSettings','ຈອງ-ຜ່ອນ-ຮັບ = ຈ່າຍ ຄົບ ຈຶ່ງ ສົ່ງ (ບໍ່ ມີ ຄວາມ ສ່ຽງ) · ຮັບ ກ່ອນ ຜ່ອນ = ວາງ ດາວນ໌ ແລ້ວ ຮັບ ຂອງ ເລີຍ')}</Text>
      <Text style={styles.label}>{tt('admSettings','ໂໝດ ຕັ້ງຕົ້ນ')}</Text>
      <View style={styles.segRow}>
        {s.bnpl.modes.map((m) => (
          <Pressable key={m} style={[styles.seg, s.bnpl.defaultMode === m && styles.segOn]} onPress={() => setBnpl({ defaultMode: m })}>
            <Text style={[styles.segTxt, s.bnpl.defaultMode === m && styles.segTxtOn]}>{tt('admSettings', BNPL_MODE_LABEL[m])}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>{tt('admSettings','ໃຜ ອອກ ຄ່າ ບໍລິການ ຜ່ອນ')}</Text>
      <View style={styles.segRow}>
        {([['customer','ລູກຄ້າ ຈ່າຍ'],['merchant','ຮ້ານ ອອກ (0% ໃຫ້ ຜູ້ ຊື້)']] as const).map(([m, lbl]) => (
          <Pressable key={m} style={[styles.seg, s.bnpl.feePayer === m && styles.segOn]} onPress={() => setBnpl({ feePayer: m })}>
            <Text style={[styles.segTxt, s.bnpl.feePayer === m && styles.segTxtOn]}>{tt('admSettings', lbl)}</Text>
          </Pressable>
        ))}
      </View>
      <Field label={tt('admSettings','ດາວນ໌ ຂັ້ນ ຕ່ຳ (% — ໂໝດ ຮັບ ກ່ອນ ຜ່ອນ)')} value={String(s.bnpl.downPct)} onChange={(v) => setBnplNum('downPct', v)} keyboard />
      <Text style={styles.label}>{tt('admSettings','ແຜນ ງວດ + ຄ່າ ບໍລິການ (%)')}</Text>
      {s.bnpl.plans.map((pl, i) => (
        <View key={pl.tenor} style={styles.planRow}>
          <Text style={styles.planTenor}>{pl.tenor} {tt('admSettings','ງວດ')}</Text>
          <TextInput
            style={styles.planFee}
            value={String(pl.feePct)}
            onChangeText={(v) => setBnplPlan(i, { feePct: Number(v.replace(/[^\d.]/g, '')) || 0 })}
            keyboardType="numeric"
            placeholder="0"
          />
          <Text style={styles.planPct}>%</Text>
          <Pressable style={[styles.toggle, pl.enabled !== false ? styles.tgOn : styles.tgOff]} onPress={() => setBnplPlan(i, { enabled: pl.enabled === false })}>
            <View style={styles.knob} />
          </Pressable>
        </View>
      ))}
      <MoneyField label={tt('admSettings','ວົງເງິນ ຜ່ອນ ຕໍ່ ຄົນ (ກີບ)')} value={s.bnpl.creditLimitKip} onChange={(n) => setBnpl({ creditLimitKip: n })} />
      <MoneyField label={tt('admSettings','ລາຄາ ຂັ້ນ ຕ່ຳ ທີ່ ຜ່ອນ ໄດ້ (ກີບ)')} value={s.bnpl.minOrderKip} onChange={(n) => setBnpl({ minOrderKip: n })} />
      <MoneyField label={tt('admSettings','ລາຄາ ຂັ້ນ ສູງ ທີ່ ຜ່ອນ ໄດ້ (ກີບ)')} value={s.bnpl.maxOrderKip} onChange={(n) => setBnpl({ maxOrderKip: n })} />
      <Field label={tt('admSettings','ອາຍຸ ບັນຊີ ຂັ້ນ ຕ່ຳ (ວັນ)')} value={String(s.bnpl.minAccountAgeDays)} onChange={(v) => setBnplNum('minAccountAgeDays', v)} keyboard />
      <Field label={tt('admSettings','ຕ້ອງ ຊື້ ສຳເລັດ ມາ ກ່ອນ (ຄັ້ງ — ໂໝດ ຮັບ ກ່ອນ ຜ່ອນ)')} value={String(s.bnpl.minCompletedOrders)} onChange={(v) => setBnplNum('minCompletedOrders', v)} keyboard />
      <Field label={tt('admSettings','ໄລຍະ ຜ່ອນຜັນ ກ່ອນ ຄິດ ຄ່າ ປັບ (ວັນ)')} value={String(s.bnpl.graceDays)} onChange={(v) => setBnplNum('graceDays', v)} keyboard />
      <Field label={tt('admSettings','ຄ່າ ປັບ ຊ້າ (% ຕໍ່ ງວດ ຄ້າງ)')} value={String(s.bnpl.lateFeePct)} onChange={(v) => setBnplNum('lateFeePct', v)} keyboard />
      <Field label={tt('admSettings','ອາຍັດ BNPL ຖ້າ ຄ້າງ ເກີນ (ວັນ)')} value={String(s.bnpl.freezeAfterDays)} onChange={(v) => setBnplNum('freezeAfterDays', v)} keyboard />

      <Text style={styles.groupTitle}>{tt('admSettings','🔔 ການແຈ້ງເຕືອນ (Push)')}</Text>
      <Field label="VAPID key (Web Push — Firebase Console → Cloud Messaging)" value={s.vapidKey} onChange={(v) => set('vapidKey', v)} placeholder="BNxxxx... (Web Push certificate)" />

      <Text style={styles.groupTitle}>{tt('admSettings','👁️ ການ ສະແດງ ສ່ວນ (ເປີດ/ປິດ ຕາມ ໜ້າ)')}</Text>
      <Text style={styles.hint}>{tt('admSettings','ສະວິດ ຫຼັກ = ທຸກ ໜ້າ · chip ດ້ານລຸ່ມ = ຕັ້ງ ຕໍ່ ໜ້າ (ຂຽວ=ສະແດງ / ແດງ=ເຊື່ອງ)')}</Text>
      {TOGGLEABLE_SECTIONS.map((sec) => (
        <View key={sec.key} style={styles.secBox}>
          <View style={styles.mtRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.label}>{sec.lao}</Text>
            </View>
            <Pressable style={[styles.toggle, sectionOn(s, sec.key, '') ? styles.tgOn : styles.tgOff]} onPress={() => setSection(sec.key, 'all', !sectionOn(s, sec.key, ''))}>
              <View style={styles.knob} />
            </Pressable>
          </View>
          {sec.pages.length > 1 && (
            <View style={styles.pageGrid}>
              {sec.pages.map((pg) => {
                const on = sectionOn(s, sec.key, pg);
                return (
                  <Pressable key={pg} style={[styles.pageChip, on ? styles.pageOn : styles.pageOff]} onPress={() => setSection(sec.key, pg, !on)}>
                    <Text style={[styles.pageChipTx, on && styles.pageChipTxOn]}>{on ? '✓ ' : '✕ '}{tt('admSettings', PAGE_LABELS[pg] ?? pg)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ))}

      <Text style={styles.groupTitle}>{tt('admSettings','🛠️ ລະບົບ & ບຳລຸງຮັກສາ')}</Text>
      <View style={styles.mtRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.label}>{tt('admSettings','🛠️ ໂໝດ ປັບປຸງ (Maintenance)')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ເປີດ = ຜູ້ໃຊ້ ທົ່ວໄປ ເຫັນ ໜ້າ ປັບປຸງ · admin ຍັງ ໃຊ້ ໄດ້')}</Text>
        </View>
        <Pressable style={[styles.toggle, s.maintenanceMode ? styles.tgOn : styles.tgOff]} onPress={() => { setSaved(false); setS((p) => ({ ...p, maintenanceMode: !p.maintenanceMode })); }}>
          <View style={styles.knob} />
        </Pressable>
      </View>
      {s.maintenanceMode && (
        <>
          <Field label={tt('admSettings','ຂໍ້ຄວາມ ໜ້າ ປັບປຸງ')} value={s.maintenanceMessage} onChange={(v) => set('maintenanceMessage', v)} multiline />

          <Field label={tt('admSettings','🔑 ລະຫັດ preview (ຄົນ ອື່ນ ໃສ່ ລະຫັດ ນີ້ ເພື່ອ ເບິ່ງ ໄດ້)')} value={s.maintenancePreviewCode} onChange={(v) => set('maintenancePreviewCode', v)} placeholder={tt('admSettings','ເຊັ່ນ: homesang2026 (ວ່າງ = ບໍ່ ໃຊ້)')} />

          <Text style={styles.label}>{tt('admSettings','🌐 IP ທີ່ ອະນຸຍາດ (ໃສ່ ໄດ້ ຫຼາຍ ອັນ)')}</Text>
          <Text style={styles.hint}>{tt('admSettings','⚠️ IP 5G/ມືຖື ປ່ຽນ ເລື້ອຍ + ໃຊ້ ຮ່ວມ ກັນ — ລະຫັດ preview ໝັ້ນຄົງ ກວ່າ. (admin login ຜ່ານ ໄດ້ ສະເໝີ)')}</Text>
          {(s.maintenanceAllowedIps ?? []).map((ip) => (
            <View key={ip} style={styles.ipRow}>
              <Text style={styles.ipText}>{ip}</Text>
              <Pressable onPress={() => removeIp(ip)} style={styles.ipRemoveBtn}><Text style={styles.ipRemove}>✕</Text></Pressable>
            </View>
          ))}
          {(s.maintenanceAllowedIps ?? []).length === 0 && <Text style={styles.hint}>{tt('admSettings','— ຍັງ ບໍ່ ມີ IP —')}</Text>}
          <View style={styles.ipAddRow}>
            <TextInput value={newIp} onChangeText={setNewIp} placeholder={tt('admSettings','ໃສ່ IP ດ້ວຍ ມື')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} onSubmitEditing={() => addIp(newIp)} />
            <Pressable style={styles.ipAddBtn} onPress={() => addIp(newIp)}><Text style={styles.ipAddText}>{tt('admSettings','+ ເພີ່ມ')}</Text></Pressable>
          </View>
          <Pressable style={[styles.scanBtn, scanning && styles.btnOff]} onPress={scanIp} disabled={scanning}>
            <Text style={styles.scanText}>{scanning ? tt('admSettings','ກຳລັງ ສະແກນ...') : tt('admSettings','🔍 ສະແກນ IP ຂອງ ຂ້ອຍ ຕອນ ນີ້')}</Text>
          </Pressable>
          <Text style={styles.hint}>{tt('admSettings','ຢ່າ ລືມ ກົດ 💾 ບັນທຶກ ຫຼັງ ເພີ່ມ/ລຶບ IP')}</Text>
        </>
      )}

      {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
      {canEdit && (
        <Pressable style={[styles.btn, saving && styles.btnOff]} onPress={save} disabled={saving}>
          <Text style={styles.btnText}>{saving ? tt('admSettings','ກຳລັງບັນທຶກ...') : tt('admSettings','💾 ບັນທຶກ')}</Text>
        </Pressable>
      )}
      {saved && <Text style={styles.saved}>{tt('admSettings','✓ ບັນທຶກແລ້ວ')}</Text>}

      {canEdit && (
        <View style={styles.sample}>
          <Text style={styles.sampleTitle}>{tt('admSettings','🧪 ໂໝດ ຂໍ້ມູນ ຕົວຢ່າງ (Mock)')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ຄຸມ ປຸ່ມ "🧪 ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ" ໃນ ໜ້າ ຊ່າງ ປະຈຳ · ໃບ ບິນ · MK Plan. ປິດ ຕອນ Go-Live → ປຸ່ມ seed ຫາຍ ໝົດ (ຂໍ້ມູນ ຈິງ ບໍ່ ກະທົບ).')}</Text>
          <View style={styles.mtRow}>
            <Text style={[styles.label, { flex: 1 }]}>{s.mockEnabled ? tt('admSettings','🧪 ເປີດ (ໂຊ ປຸ່ມ seed)') : tt('admSettings','🔒 ປິດ (Go-Live)')}</Text>
            <Pressable style={[styles.toggle, s.mockEnabled ? styles.tgOn : styles.tgOff]} onPress={toggleMock}>
              <View style={styles.knob} />
            </Pressable>
          </View>
          {canDelete && (
            <Pressable style={[styles.purgeBtn, clearingMock && styles.btnOff]} onPress={clearMockAll} disabled={clearingMock}>
              <Text style={styles.purgeText}>{clearingMock ? tt('admSettings','ກຳລັງລ້າງ...') : tt('admSettings','🧹 ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງ ໝົດ (ທຸກ ໂມດູນ)')}</Text>
            </Pressable>
          )}
          {mockMsg !== '' && <Text style={styles.purgeMsg}>{mockMsg}</Text>}
        </View>
      )}

      {canEdit && (
        <View style={styles.sample}>
          <Text style={styles.sampleTitle}>{tt('admSettings','🌱 ຂໍ້ມູນ ຕົວຢ່າງ (ທົດສອບ)')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ເຕີມ ຮ້ານ/ສິນຄ້າ/flash deal/ຊື້ເປັນກຸ່ມ/reels/ໂພສ/ຄ່າບໍລິການ + order ຕົວຢ່າງ ເຂົ້າ ລະບົບ ໃຫ້ ກວດ ແລະ ແກ້ໄຂ ໄດ້. ເປີດ loyalty/referral/broker ໃຫ້ນຳ. ລຶບ ໄດ້ ດ້ວຍ ປຸ່ມ ລ້າງ ຂ້າງລຸ່ມ.')}</Text>
          <Pressable style={[styles.seedBtn, seeding && styles.btnOff]} onPress={seed} disabled={seeding}>
            <Text style={styles.seedText}>{seeding ? tt('admSettings','ກຳລັງເຕີມ...') : tt('admSettings','🌱 ເຕີມ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text>
          </Pressable>
          {seedMsg !== '' && <Text style={styles.purgeMsg}>{seedMsg}</Text>}
        </View>
      )}

      {canDelete && (
        <View style={styles.danger}>
          <Text style={styles.dangerTitle}>{tt('admSettings','🧹 ກຽມ Go-Live')}</Text>
          <Text style={styles.hint}>{tt('admSettings','ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງໝົດ ທີ່ ລະບົບ seed ໄວ້ (ຮ້ານ/ສິນຄ້າ/ຊື້ເປັນກຸ່ມ/reels/ໂພສ/order/claims/disputes ຕົວຢ່າງ). ໃຊ້ ກ່ອນ ເປີດ ຈິງ.')}</Text>
          <Pressable style={[styles.purgeBtn, purging && styles.btnOff]} onPress={purge} disabled={purging}>
            <Text style={styles.purgeText}>{purging ? tt('admSettings','ກຳລັງລ້າງ...') : tt('admSettings','🧹 ລ້າງ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text>
          </Pressable>
          {purgeMsg !== '' && <Text style={styles.purgeMsg}>{purgeMsg}</Text>}
        </View>
      )}
    </View>
  );
}

function MoneyField({ label, value, onChange }: {
  label: string; value: number; onChange: (n: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <AmountInput
        value={value}
        onChangeValue={onChange}
        placeholderTextColor="#999"
        style={styles.input}
      />
    </View>
  );
}

function Field({ label, value, onChange, multiline, keyboard, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; keyboard?: boolean; placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboard ? 'number-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor="#999"
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: '#374151', fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: '#dc2626', fontSize: 12, marginBottom: 8 },
  btn: { backgroundColor: '#0066CC', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saved: { color: '#16a34a', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  mtRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 14, marginTop: 6 },
  toggle: { width: 44, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  tgOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  tgOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  groupTitle: { fontSize: 14, fontWeight: '800', color: '#111', marginTop: 22, marginBottom: 4 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  segTxt: { fontSize: 12, fontWeight: '800', color: '#4b5563' },
  segTxtOn: { color: '#fff' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  planTenor: { flex: 1, fontSize: 13, fontWeight: '800', color: '#0f172a' },
  planFee: { width: 70, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13, fontWeight: '800', color: '#0f172a', textAlign: 'right', backgroundColor: '#fff' },
  planPct: { fontSize: 13, fontWeight: '800', color: '#6b7280' },
  secBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginTop: 10 },
  pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pageChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  pageOn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  pageOff: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  pageChipTx: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  pageChipTxOn: { color: '#047857' },
  sample: { borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 20 },
  sampleTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 4 },
  seedBtn: { backgroundColor: '#16a34a', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 10 },
  seedText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  danger: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fffbfb', borderRadius: 10, padding: 12, marginTop: 20 },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  purgeBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 10 },
  purgeText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
  purgeMsg: { fontSize: 12, color: '#374151', marginTop: 8 },
  ipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, backgroundColor: '#f8fafc' },
  ipText: { fontSize: 13, color: '#111', fontWeight: '600' },
  ipRemoveBtn: { paddingHorizontal: 6 },
  ipRemove: { fontSize: 14, color: '#dc2626', fontWeight: '700' },
  ipAddRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  ipAddBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  ipAddText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scanBtn: { borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 8 },
  scanText: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
});

