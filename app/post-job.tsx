import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AppSwitch from '@/components/AppSwitch';
import { useAuth } from '@/lib/auth-context';
import { useServiceCategories } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { createJob } from '@/lib/jobs';
import { customerBalance, spendFromWallet, watchMySpends, watchMyTopups, type WalletSpend, type WalletTopup } from '@/lib/customerWallet';
import { type AppSettings, DEFAULT_SETTINGS, watchAppSettings } from '@/lib/appSettings';
import { type PriceItem, PRICE_KIND_LABEL, watchPriceItems } from '@/lib/priceCatalog';
import { useTT } from '@/lib/i18n';
import MapPicker from '@/components/MapPicker';
import PhotoPicker from '@/components/PhotoPicker';
import { colors, font, radius, shadow } from '@/lib/theme';
import AmountInput from '@/components/AmountInput';
import { watchSitesForOwner, roomSpecSnapshot, type Site } from '@/lib/sites';
import { watchSiteConfig, DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/siteConfig';
import { watchAssetsForSite, warrantyStatus, type Asset } from '@/lib/assets';
import AppFooter from '@/components/AppFooter';

type Status = 'idle' | 'saving' | 'error';

function parseDate(s: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

export default function PostJobScreen() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();

  const params = useLocalSearchParams<{ title?: string; siteId?: string; roomId?: string; assetId?: string }>();
  const [category, setCategory] = useState<string>('electrical');
  const serviceCats = useServiceCategories();
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [surveyRequested, setSurveyRequested] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => watchAppSettings(setSettings), []);
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  useEffect(() => watchPriceItems(setPriceItems), []);
  // indicative reference prices for the picked category (customer-facing preview)
  const refPrices = priceItems.filter((p) => p.active && (p.category === category || !p.category)).slice(0, 6);
  const [agreedSurvey, setAgreedSurvey] = useState(false);
  const surveyFeeOn = surveyRequested && settings.surveyFeeMode !== 'off' && (settings.surveyFeeAmount ?? 0) > 0;
  const surveyPrepay = surveyFeeOn && settings.surveyFeeMode === 'prepay';
  // customer wallet balance — prepay debits the survey fee from it at post time
  const [wTopups, setWTopups] = useState<WalletTopup[]>([]);
  const [wSpends, setWSpends] = useState<WalletSpend[]>([]);
  useEffect(() => {
    if (!fbUser) { setWTopups([]); setWSpends([]); return; }
    const a = watchMyTopups(fbUser.uid, setWTopups);
    const b = watchMySpends(fbUser.uid, setWSpends);
    return () => { a(); b(); };
  }, [fbUser]);
  const cwBalance = customerBalance(wTopups, wSpends);
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [locDetecting, setLocDetecting] = useState(false);
  // optional link to a registered Site + specific room (Building Registry)
  const [mySites, setMySites] = useState<Site[]>([]);
  const [siteCfg, setSiteCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [siteId, setSiteId] = useState<string>(typeof params.siteId === 'string' ? params.siteId : '');
  const [roomId, setRoomId] = useState<string>(typeof params.roomId === 'string' ? params.roomId : '');
  const [siteAssets, setSiteAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<string>(typeof params.assetId === 'string' ? params.assetId : '');

  useEffect(() => { if (fbUser) return watchSitesForOwner(fbUser.uid, setMySites); }, [fbUser]);
  useEffect(() => watchSiteConfig(setSiteCfg), []);
  useEffect(() => { if (siteId) return watchAssetsForSite(siteId, setSiteAssets); setSiteAssets([]); }, [siteId]);

  // Set state AND mirror into the URL params so the link survives a screen
  // re-mount (picker state would otherwise reset to '' and the posted job would
  // lose the link). Done in the click handlers (never in an effect — an effect
  // that calls setParams can re-mount → re-fire → infinite loop that flickers
  // the UI). router.setParams merges, so unrelated params (title) are kept.
  const pickSite = (id: string) => { setSiteId(id); setRoomId(''); setAssetId(''); router.setParams({ siteId: id || undefined, roomId: undefined, assetId: undefined } as any); };
  const pickRoom = (id: string) => { setRoomId(id); router.setParams({ roomId: id || undefined } as any); };
  const pickAsset = (id: string) => { setAssetId(id); router.setParams({ assetId: id || undefined } as any); };

  const pickedSite = mySites.find((s) => s.id === siteId);
  const pickedRoom = pickedSite?.rooms.find((r) => r.id === roomId);
  const pickedAsset = siteAssets.find((a) => a.id === assetId);

  const latNum = lat ? parseFloat(lat) : undefined;
  const lngNum = lng ? parseFloat(lng) : undefined;
  const onMapChange = (la: number, ln: number) => {
    setLat(la.toFixed(6));
    setLng(ln.toFixed(6));
  };

  useEffect(() => {
    // Pre-fill location from profile if set
    if (profile?.address && !address) setAddress(profile.address);
    if (profile?.lat !== undefined && !lat) setLat(String(profile.lat));
    if (profile?.lng !== undefined && !lng) setLng(String(profile.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const useProfileLocation = () => {
    if (profile?.address) setAddress(profile.address);
    if (profile?.lat !== undefined) setLat(String(profile.lat));
    if (profile?.lng !== undefined) setLng(String(profile.lng));
  };

  const detectLocation = () => {
    setLocDetecting(true);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(6));
          setLng(pos.coords.longitude.toFixed(6));
          setLocDetecting(false);
        },
        (err) => {
          setErrorMsg(err.message);
          setLocDetecting(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setErrorMsg(tt('postJob', 'ຍັງບໍ່ຮອງຮັບ native — Phase 4'));
      setLocDetecting(false);
    }
  };

  const submit = async () => {
    if (!fbUser) {
      router.push('/sign-in');
      return;
    }
    if (!title || !description) {
      setStatus('error');
      setErrorMsg(tt('postJob', 'ກະລຸນາຕື່ມຫົວຂໍ້ + ລາຍລະອຽດ'));
      return;
    }
    if (surveyFeeOn && !agreedSurvey) {
      setStatus('error');
      setErrorMsg(tt('postJob', 'ກະລຸນາ ຍອມຮັບ ເງື່ອນໄຂ ຄ່າ ສຳຫຼວດ ກ່ອນ'));
      return;
    }
    // prepay: the survey fee is debited from the wallet — block up front if the
    // balance can't cover it (the server re-checks authoritatively on debit).
    if (surveyPrepay && cwBalance < (settings.surveyFeeAmount ?? 0)) {
      setStatus('error');
      setErrorMsg(`${tt('postJob', 'ຍອດ ໃນ ກະເປົາ ບໍ່ ພຽງພໍ ສຳລັບ ຄ່າ ສຳຫຼວດ')} — ${tt('postJob', 'ເຫຼືອ')} ${cwBalance.toLocaleString('en-US')} / ${(settings.surveyFeeAmount ?? 0).toLocaleString('en-US')} ${tt('postJob', 'ກີບ')}. ${tt('postJob', 'ໄປ ເຕີມ ເງິນ ໃນ ໜ້າ ກະເປົາ ກ່ອນ')}`);
      return;
    }
    setStatus('saving');
    setErrorMsg('');
    try {
      const budgetNum = budget ? parseInt(budget, 10) : undefined;
      const posterName =
        (profile as any)?.name ||
        [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
        undefined;
      const jobId = await createJob({
        customerId: fbUser.uid,
        customerName: posterName,
        category,
        title: title.trim(),
        description: description.trim(),
        address: address || undefined,
        lat: latNum !== undefined && Number.isFinite(latNum) ? latNum : undefined,
        lng: lngNum !== undefined && Number.isFinite(lngNum) ? lngNum : undefined,
        budget: Number.isFinite(budgetNum as number) ? budgetNum : undefined,
        preferredDate: parseDate(preferredDate),
        closeAt: parseDate(closeDate),
        surveyRequested: surveyRequested || undefined,
        urgent: settings.urgentEnabled && urgent ? true : undefined,
        urgentFee: settings.urgentEnabled && urgent && (settings.urgentFeeKip ?? 0) > 0 ? settings.urgentFeeKip : undefined,
        surveyFee: surveyFeeOn ? settings.surveyFeeAmount : undefined,
        surveyFeeMode: surveyFeeOn ? (settings.surveyFeeMode as 'prepay' | 'agree') : undefined,
        photos: photos.length > 0 ? photos : undefined,
        siteId: siteId || undefined,
        roomId: roomId || undefined,
        roomName: pickedRoom?.name || undefined,
        roomSpecs: pickedRoom ? roomSpecSnapshot(pickedRoom, siteCfg.roomFields) : undefined,
        assetId: assetId || undefined,
        assetName: pickedAsset ? ([pickedAsset.brand, pickedAsset.model].filter(Boolean).join(' ') || undefined) : undefined,
      });
      // prepay: debit the survey fee from the wallet (the server verifies the job
      // + amount and marks surveyFeePaid). A rare post-create failure — balance
      // is pre-checked — just leaves the fee uncollected; the job still posts and
      // settlement is a no-op, so no money is at risk. It's later refunded to the
      // customer on completion, or forfeited to the tech if the customer cancels.
      if (surveyPrepay) {
        try { await spendFromWallet(settings.surveyFeeAmount ?? 0, 'surveyFee', jobId); }
        catch (e) { console.error('surveyFee spend:', e); }
      }
      router.replace('/');
    } catch (e: any) {
      console.error('createJob:', e);
      setStatus('error');
      setErrorMsg(e?.message ?? String(e));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{tt('postJob', 'ໂພສງານໃໝ່')}</Text>
        <Text style={styles.subtitle}>{tt('postJob', 'ບອກລາຍລະອຽດ — ຊ່າງຈະສະເໜີລາຄາ')}</Text>

        <Text style={styles.label}>{tt('postJob', 'ໝວດງານ')}</Text>
        <View style={styles.catGrid}>
          {serviceCats.map((c) => (
            <Pressable
              key={c.value}
              style={[styles.cat, category === c.value && styles.catActive]}
              onPress={() => setCategory(c.value)}>
              <Text style={styles.catIcon}><CategoryIcon icon={c.icon} size={18} /></Text>
              <Text style={styles.catLabel}>{c.lao}</Text>
            </Pressable>
          ))}
        </View>

        {refPrices.length > 0 && (
          <View style={styles.refCard}>
            <Text style={styles.refTitle}>💡 {tt('postJob', 'ລາຄາ ໂດຍ ປະມານ (ອ້າງອີງ)')}</Text>
            {refPrices.map((p) => (
              <View key={p.id} style={styles.refRow}>
                <Text style={styles.refName} numberOfLines={1}>{PRICE_KIND_LABEL[p.kind]} · {p.name}</Text>
                <Text style={styles.refPrice}>{p.price.toLocaleString()} {tt('postJob', 'ກີບ')}/{p.unit}</Text>
              </View>
            ))}
            <Text style={styles.refNote}>{tt('postJob', 'ລາຄາ ຈິງ ຕາມ ໜ້າ ງານ — ຊ່າງ ຈະ ສະເໜີ ໃບ ລາຄາ ໃຫ້')}</Text>
          </View>
        )}

        <Text style={styles.label}>{tt('postJob', 'ຫົວຂໍ້')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={tt('postJob', 'ເຊັ່ນ: ປ່ຽນຫຼອດໄຟ ຫ້ອງນອນ')}
          placeholderTextColor="#999"
          style={styles.input}
        />

        <Text style={styles.label}>{tt('postJob', 'ລາຍລະອຽດ')}</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={tt('postJob', 'ຮູບແບບງານ, ສະຖານທີ່, ເງື່ອນໄຂ')}
          placeholderTextColor="#999"
          style={[styles.input, styles.textarea]}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>{tt('postJob', 'ທີ່ຢູ່')}</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={tt('postJob', 'ບ້ານ ເມືອງ ແຂວງ')}
          placeholderTextColor="#999"
          style={styles.input}
        />

        {mySites.length > 0 && (
          <View style={styles.siteBox}>
            <Text style={styles.siteHead}>{tt('postJob', '🏠 ສະຖານທີ່ ທີ່ ບັນທຶກ ໄວ້ (ບໍ່ ບັງຄັບ)')}</Text>
            <View style={styles.siteChips}>
              <Pressable style={[styles.siteChip, !siteId && styles.siteChipOn]} onPress={() => pickSite('')}>
                <Text style={[styles.siteChipText, !siteId && styles.siteChipTextOn]}>{tt('postJob', 'ຂ້າມ')}</Text>
              </Pressable>
              {mySites.map((s) => {
                const on = s.id === siteId;
                return (
                  <Pressable key={s.id} style={[styles.siteChip, on && styles.siteChipOn]} onPress={() => {
                    pickSite(s.id);
                    if (!address && s.address) setAddress(s.address);
                    if (s.lat !== undefined && !lat) setLat(String(s.lat));
                    if (s.lng !== undefined && !lng) setLng(String(s.lng));
                  }}>
                    <Text style={[styles.siteChipText, on && styles.siteChipTextOn]}>🏠 {s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {pickedSite && pickedSite.rooms.length > 0 && (
              <>
                <Text style={styles.siteSub}>{tt('postJob', 'ຫ້ອງ (ສົ່ງ ຂະໜາດ ໃຫ້ ຊ່າງ)')}</Text>
                <View style={styles.siteChips}>
                  {pickedSite.rooms.map((r) => {
                    const on = r.id === roomId;
                    const rt = siteCfg.roomTypes.find((x) => x.key === r.typeKey);
                    return (
                      <Pressable key={r.id} style={[styles.siteChip, on && styles.siteChipOn]} onPress={() => pickRoom(on ? '' : r.id)}>
                        <Text style={[styles.siteChipText, on && styles.siteChipTextOn]}>{rt?.icon ? rt.icon + ' ' : ''}{r.name || rt?.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {pickedRoom && (
              <View style={styles.specBox}>
                {roomSpecSnapshot(pickedRoom, siteCfg.roomFields).map((sp) => (
                  <Text key={sp.label} style={styles.specText}>• {sp.label}: <Text style={{ fontWeight: '700' }}>{sp.value}</Text></Text>
                ))}
              </View>
            )}
            {pickedSite && siteAssets.length > 0 && (
              <>
                <Text style={styles.siteSub}>{tt('postJob', '🔩 ຊັບສິນ ທີ່ ກ່ຽວ (ຊ່າງ ໄດ້ ຂໍ້ມູນ + ບັນທຶກ ປະຫວັດ)')}</Text>
                <View style={styles.siteChips}>
                  <Pressable style={[styles.siteChip, !assetId && styles.siteChipOn]} onPress={() => pickAsset('')}>
                    <Text style={[styles.siteChipText, !assetId && styles.siteChipTextOn]}>{tt('postJob', 'ຂ້າມ')}</Text>
                  </Pressable>
                  {siteAssets.map((a) => {
                    const on = a.id === assetId;
                    const ac = siteCfg.assetCategories.find((c) => c.key === a.category);
                    return (
                      <Pressable key={a.id} style={[styles.siteChip, on && styles.siteChipOn]} onPress={() => pickAsset(on ? '' : a.id)}>
                        <Text style={[styles.siteChipText, on && styles.siteChipTextOn]}>{ac?.icon ? ac.icon + ' ' : ''}{[a.brand, a.model].filter(Boolean).join(' ') || ac?.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {pickedAsset && (
              <View style={styles.specBox}>
                {!!pickedAsset.serial && <Text style={styles.specText}>• {tt('postJob', 'ຊີຣຽວ')}: <Text style={{ fontWeight: '700' }}>{pickedAsset.serial}</Text></Text>}
                {warrantyStatus(pickedAsset).state !== 'none' && (
                  <Text style={styles.specText}>• {tt('postJob', 'ຮັບປະກັນ')}: <Text style={{ fontWeight: '700' }}>{warrantyStatus(pickedAsset).state === 'active' ? tt('postJob', 'ຍັງ ຮັບປະກັນ') : tt('postJob', 'ໝົດ ຮັບປະກັນ')}</Text></Text>
                )}
                {(pickedAsset.parameters ?? []).slice(0, 3).map((p) => (
                  <Text key={p.id} style={styles.specText}>• {p.label}: <Text style={{ fontWeight: '700' }}>{p.factory ?? '—'} ({tt('postJob', 'ໂຮງງານ')})</Text></Text>
                ))}
                <Text style={styles.specText}>📜 {tt('postJob', 'ປະຫວັດ')} {pickedAsset.history.length} {tt('postJob', 'ລາຍການ · ຕອນ ຈົບ ວຽກ ຈະ ບັນທຶກ ເພີ່ມ')}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.label}>{tt('postJob', '📍 ຕຳແໜ່ງເທິງແຜນທີ່')}</Text>
        <View style={styles.locActions}>
          <Pressable
            style={[styles.locBtn, styles.locBtnPrimary]}
            onPress={detectLocation}
            disabled={locDetecting}>
            <Text style={styles.locBtnTextPrimary}>
              {locDetecting ? '...' : tt('postJob', '🎯 ກວດຫາຕຳແໜ່ງ')}
            </Text>
          </Pressable>
          <Pressable style={styles.locBtn} onPress={useProfileLocation}>
            <Text style={styles.locBtnText}>{tt('postJob', '📍 ໃຊ້ profile')}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 8 }}>
          <MapPicker lat={latNum} lng={lngNum} onChange={onMapChange} height={220} />
        </View>
        <Text style={styles.coordsHint}>
          {latNum !== undefined && lngNum !== undefined
            ? `📍 ${latNum.toFixed(4)}, ${lngNum.toFixed(4)} — ${tt('postJob', 'ກົດ/ລາກ pin ເພື່ອປ່ຽນ')}`
            : tt('postJob', 'ກົດປຸ່ມ "ກວດຫາຕຳແໜ່ງ" ຫຼື ກົດເທິງແຜນທີ່')}
        </Text>

        <Text style={styles.label}>{tt('postJob', '📷 ຮູບງານ')}</Text>
        {fbUser && (
          <PhotoPicker
            photos={photos}
            onChange={setPhotos}
            pathPrefix={`jobs/${fbUser.uid}`}
            max={3}
          />
        )}

        <Text style={styles.label}>{tt('postJob', 'ງົບປະມານ')}</Text>
        <AmountInput
          value={budget ? Number(budget) : 0}
          onChangeValue={(n) => setBudget(n ? String(n) : '')}
          placeholder="100,000"
          placeholderTextColor="#999"
          style={styles.input}
        />

        <View style={styles.surveyRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.surveyTitle}>{tt('postJob', '🔍 ໃຫ້ຊ່າງສຳຫຼວດໜ້າງານ ກ່ອນສະເໜີລາຄາ')}</Text>
            <Text style={styles.surveyHint}>
              {budget && parseInt(budget, 10) > 0 && parseInt(budget, 10) < 500000
                ? tt('postJob', 'ງານນ້ອຍ — ມັກບໍ່ຈຳເປັນ ແຕ່ເລືອກໄດ້')
                : tt('postJob', 'ເໝາະກັບງານໃຫຍ່ / ຕ້ອງປະເມີນໜ້າງານ')}
            </Text>
          </View>
          <AppSwitch value={surveyRequested} onValueChange={setSurveyRequested} />
        </View>

        {settings.urgentEnabled && (
          <View style={[styles.surveyRow, urgent && { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.surveyTitle}>🚨 {tt('postJob', 'ດ່ວນ / ສຸກເສີນ')}</Text>
              <Text style={styles.surveyHint}>
                {tt('postJob', 'ແຈ້ງ ຊ່າງ ທັນທີ + ລອຍ ຂຶ້ນ ເທິງ ສຸດ')}
                {(settings.urgentFeeKip ?? 0) > 0 ? ` · ${tt('postJob', 'ຄ່າ ດ່ວນ')} ${settings.urgentFeeKip.toLocaleString()} ${tt('postJob', 'ກີບ')}` : ''}
              </Text>
            </View>
            <AppSwitch value={urgent} onValueChange={setUrgent} />
          </View>
        )}

        {surveyFeeOn && (
          <View style={styles.surveyFeeCard}>
            <Text style={styles.surveyFeeTitle}>🧾 {tt('postJob', 'ຄ່າ ສຳຫຼວດ ໜ້າ ງານ')}: {settings.surveyFeeAmount.toLocaleString()} {tt('postJob', 'ກີບ')}</Text>
            <Text style={styles.surveyFeeText}>
              {surveyPrepay
                ? tt('postJob', 'ຫັກ ຈາກ ກະເປົາ ເງິນ ຕອນ ໂພສ · ຄືນ ເຂົ້າ ກະເປົາ ຖ້າ ງານ ສຳເລັດ · ຖ້າ ທ່ານ ຍົກເລີກ ຫຼັງ ມີ ຊ່າງ ຮັບ ແລ້ວ ຄ່າ ນີ້ ຕົກ ເປັນ ຂອງ ຊ່າງ')
                : tt('postJob', 'ຫັກ ຄືນ ຖ້າ ຕົກລົງ ຮັບ ໃບ ສະເໜີ · ຖ້າ ບໍ່ ດຳເນີນ ຕໍ່ ຈະ ບໍ່ ຄືນ')}
            </Text>
            {surveyPrepay && (
              <Text style={[styles.surveyFeeText, { fontWeight: '700' }, cwBalance < (settings.surveyFeeAmount ?? 0) && { color: '#c0392b' }]}>
                {tt('postJob', '👛 ຍອດ ໃນ ກະເປົາ:')} {cwBalance.toLocaleString('en-US')} {tt('postJob', 'ກີບ')}
                {cwBalance < (settings.surveyFeeAmount ?? 0) ? ` · ${tt('postJob', 'ບໍ່ ພຽງພໍ — ໄປ ເຕີມ ເງິນ ກ່ອນ')}` : ''}
              </Text>
            )}
            <Pressable style={styles.surveyTick} onPress={() => setAgreedSurvey((v) => !v)}>
              <Text style={styles.surveyTickBox}>{agreedSurvey ? '☑' : '☐'}</Text>
              <Text style={styles.surveyTickText}>{tt('postJob', 'ຂ້ອຍ ຍອມຮັບ ເງື່ອນໄຂ ຄ່າ ສຳຫຼວດ (ຕາມ ຂໍ້ຕົກລົງ)')}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>{tt('postJob', 'ວັນທີຕ້ອງການ')}</Text>
        {Platform.OS === 'web' ? (
          // @ts-ignore - web only
          <input
            type="date"
            value={preferredDate}
            onChange={(e: any) => setPreferredDate(e.target.value)}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 15,
              color: colors.text,
              backgroundColor: colors.surface,
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <TextInput
            value={preferredDate}
            onChangeText={setPreferredDate}
            placeholder="2026-05-20"
            placeholderTextColor="#999"
            style={styles.input}
          />
        )}

        <Text style={styles.label}>{tt('postJob', 'ມື້ປິດຮັບສະໝັກ (ບໍ່ບັງຄັບ — ຄ່າເລີ່ມຕົ້ນ 7 ມື້)')}</Text>
        {Platform.OS === 'web' ? (
          // @ts-ignore - web only
          <input
            type="date"
            value={closeDate}
            onChange={(e: any) => setCloseDate(e.target.value)}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 15,
              color: colors.text,
              backgroundColor: colors.surface,
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <TextInput
            value={closeDate}
            onChangeText={setCloseDate}
            placeholder="2026-07-02"
            placeholderTextColor="#999"
            style={styles.input}
          />
        )}

        <Pressable
          style={[styles.btn, status === 'saving' && styles.btnDisabled]}
          onPress={submit}
          disabled={status === 'saving'}>
          <Text style={styles.btnText}>
            {status === 'saving'
              ? tt('postJob', 'ກຳລັງໂພສ...')
              : !fbUser
              ? tt('postJob', '🔒 ເຂົ້າສູ່ລະບົບເພື່ອໂພສ')
              : tt('postJob', 'ໂພສງານ')}
          </Text>
        </Pressable>

        {status === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {errorMsg}</Text>
          </View>
        )}

        <Pressable style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>{tt('postJob', 'ຍົກເລີກ')}</Text>
        </Pressable>
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 640,
    gap: 4,
    ...shadow.card,
  },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.text2, marginBottom: 12 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 14, marginBottom: 6 },
  refCard: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 12, marginTop: 10 },
  refTitle: { fontSize: 13, fontWeight: '800', color: '#1e40af', marginBottom: 6 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  refName: { flex: 1, fontSize: 12.5, color: '#334155' },
  refPrice: { fontSize: 12.5, fontWeight: '700', color: '#1e3a8a' },
  refNote: { fontSize: 12, color: '#64748b', marginTop: 6, fontStyle: 'italic' },
  surveyFeeCard: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, padding: 12, marginTop: 10 },
  surveyFeeTitle: { fontSize: 13, fontWeight: '800', color: '#9a3412' },
  surveyFeeText: { fontSize: 12, color: '#b45309', marginTop: 4, lineHeight: 18 },
  surveyTick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  surveyTickBox: { fontSize: 20, color: '#0066CC' },
  surveyTickText: { flex: 1, fontSize: 12.5, color: '#374151', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  siteBox: { marginTop: 14, padding: 12, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: radius.md, gap: 6 },
  siteHead: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  siteSub: { fontSize: font.xs, color: colors.text2, marginTop: 4 },
  siteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  siteChip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: colors.surface },
  siteChipOn: { backgroundColor: '#0a7d33', borderColor: '#0a7d33' },
  siteChipText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  siteChipTextOn: { color: colors.white },
  specBox: { backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: '#d1fae5', padding: 10, gap: 2 },
  specText: { fontSize: font.xs, color: colors.text },
  surveyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, padding: 12, borderWidth: 1, borderColor: '#bcd6f5', backgroundColor: '#EAF2FB', borderRadius: radius.md },
  surveyTitle: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  surveyHint: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  cat: {
    width: '23.5%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  catActive: { borderColor: colors.primary, backgroundColor: '#EAF2FB' },
  catIcon: { fontSize: 15, lineHeight: 22 },
  catLabel: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 3 },
  locActions: { flexDirection: 'row', gap: 8 },
  locBtn: {
    flex: 1,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  locBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  locBtnText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  locBtnTextPrimary: { color: colors.white, fontSize: font.sm, fontWeight: '600' },
  coordsHint: { fontSize: font.xs, color: colors.primary, marginTop: 6 },
  btn: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnText: { color: colors.white, fontSize: font.md, fontWeight: '700' },
  linkBtn: { padding: 12, alignItems: 'center' },
  linkText: { color: colors.text2, fontSize: font.sm },
  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: font.sm },
});
