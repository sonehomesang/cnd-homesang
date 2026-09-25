import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getJob, type Job, setJobHandoverAcceptance, setJobInspection } from '@/lib/jobs';
import { type Bid, getAcceptedBid } from '@/lib/bids';
import { fetchInspectionTemplate, type InspectionTemplate, paramOk } from '@/lib/inspectionTemplates';
import { DEFAULT_SERVICE_CONFIG, labelOf, type ServiceConfig, watchServiceConfig } from '@/lib/serviceConfig';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import BeforeAfter from '@/components/BeforeAfter';
import SignaturePad from '@/components/SignaturePad';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

interface Party { name: string; phone?: string }
type ParamRow = { key: string; unit?: string; standard?: string; actual?: string; ok?: boolean; custom?: boolean };

/** Default HomeSang warranty (seed — refined per category in group C). */
const DEFAULT_WARRANTY_MONTHS = 12;

export default function HandoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);
  const [customer, setCustomer] = useState<Party | null>(null);
  const [tech, setTech] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  // inspection
  const [tpl, setTpl] = useState<InspectionTemplate | null>(null);
  const [svcCfg, setSvcCfg] = useState<ServiceConfig>(DEFAULT_SERVICE_CONFIG);
  const [checks, setChecks] = useState<{ label: string; pass: boolean; note?: string }[]>([]);
  const [params, setParams] = useState<ParamRow[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [editingInsp, setEditingInsp] = useState(false);
  const tt = useTT();

  const load = async () => {
    if (!id) { setLoading(false); return; }
    try {
      const j = await getJob(id);
      setJob(j);
      if (j) {
        setBid(await getAcceptedBid(id).catch(() => null));
        fetchInspectionTemplate(j.category).then((t) => {
          setTpl(t);
          if (t && !j.inspection) {
            setChecks(t.items.map((label) => ({ label, pass: true })));
            setParams((t.params ?? []).map((p) => ({ key: p.key, unit: p.unit, standard: p.standard, actual: '' })));
          }
        });
        // Counterparty name+phone via a server callable that only answers a
        // genuine party of this job — `users` is no longer readable cross-user.
        try {
          const res: any = await httpsCallable(functions, 'getJobContacts')({ jobId: id });
          const { customer: cc, tech: tc } = res.data || {};
          setCustomer({ name: cc?.name || tt('handover', 'ລູກຄ້າ'), phone: cc?.phone || undefined });
          setTech(tc
            ? { name: tc.name || j.assignedProviderName || tt('handover', 'ຊ່າງ'), phone: tc.phone || undefined }
            : { name: j.assignedProviderName ?? tt('handover', 'ຊ່າງ') });
        } catch {
          setCustomer({ name: tt('handover', 'ລູກຄ້າ') });
          setTech({ name: j.assignedProviderName ?? tt('handover', 'ຊ່າງ') });
        }
      }
    } catch (e) {
      console.error('handover load:', e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => watchServiceConfig(setSvcCfg), []);

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('handover', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!job || !job.assignedProviderId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('handover', 'ໃບ ມອບຮັບ ຍັງບໍ່ພ້ອມ — ງານຕ້ອງມີຊ່າງ ກ່ອນ')}</Text>
        <BackButton />
      </View>
    );
  }

  const isOwner = fbUser?.uid === job.customerId;
  const isTech = fbUser?.uid === job.assignedProviderId;
  const isAdmin = profile?.isSuperAdmin || profile?.roles?.includes('admin');
  if (!isOwner && !isTech && !isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('handover', 'ບໍ່ມີສິດເບິ່ງ')}</Text>
        <BackButton />
      </View>
    );
  }

  const cat = getCategory(job.category);
  const docNo = `HO-${job.id.slice(0, 6).toUpperCase()}`;
  // before = survey/quote photos + per-line photos · after = completion photos
  const before = [
    ...(bid?.surveyPhotos ?? []),
    ...((bid?.items ?? []).flatMap((it) => it.photos ?? [])),
  ];
  const after = job.completionPhotos ?? [];
  const accepted = !!job.acceptedAt;
  const workDone = !!job.techDoneAt || job.status === 'pending_payment' || job.status === 'completed';
  // acceptance can be signed once the work is flagged done
  const canAccept = isOwner && !accepted && workDone;
  // technician records the inspection once work is done (before/until stamped)
  const canInspect = isTech && !job.inspection && workDone;
  const showInspForm = (canInspect || editingInsp) && (checks.length > 0 || params.length > 0);

  // re-open the inspection form seeded from the saved data (tech may correct it)
  const startEditInspection = () => {
    setChecks((job.inspection?.items ?? []).map((it) => ({ label: it.label, pass: it.pass, note: it.note })));
    const saved = job.parameters ?? [];
    const tplKeys = new Set((tpl?.params ?? []).map((tp) => tp.key));
    const merged: ParamRow[] = (tpl?.params ?? []).map((tp) => {
      const s = saved.find((x) => x.key === tp.key);
      return { key: tp.key, unit: tp.unit, standard: tp.standard, actual: s?.actual ?? '', ok: s?.ok, custom: false };
    });
    // preserve previously-recorded standard readings whose key is no longer in
    // the template (param renamed/removed, or template deleted) so re-saving the
    // inspection never silently wipes them
    const orphans: ParamRow[] = saved
      .filter((s) => !s.custom && !tplKeys.has(s.key))
      .map((s) => ({ key: s.key, unit: s.unit, standard: s.standard, actual: s.actual ?? '', ok: s.ok, custom: false }));
    const customs: ParamRow[] = saved.filter((s) => s.custom).map((s) => ({ ...s }));
    setParams([...merged, ...orphans, ...customs]);
    setManualUrl(job.manualUrl ?? '');
    setEditingInsp(true);
  };
  const warrantyMonths = job.warrantyMonths ?? tpl?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS;
  const warrantyTerms = job.warrantyTerms ?? tpl?.warrantyTerms ?? '';

  const doPrint = () => { if (Platform.OS === 'web') { try { (window as any).print(); } catch {} } };
  const capture = async () => {
    const el = (typeof document !== 'undefined') && document.getElementById('handover-sheet');
    if (!el) throw new Error(tt('handover', 'ບໍ່ພົບເອກະສານ'));
    const h2c = (await import('html2canvas')).default;
    return await h2c(el as HTMLElement, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: false, logging: false });
  };
  const exportPdf = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const c = await capture();
      const img = c.toDataURL('image/jpeg', 0.92);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      let w = pw, h = (c.height * pw) / c.width;
      if (h > ph) { h = ph; w = (c.width * ph) / c.height; }
      pdf.addImage(img, 'JPEG', (pw - w) / 2, 0, w, h);
      pdf.save(`${docNo}.pdf`);
    } catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };
  const exportJpg = async () => {
    if (Platform.OS !== 'web') return;
    try { const c = await capture(); const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', 0.92); a.download = `${docNo}.jpg`; a.click(); }
    catch (e: any) { alert('Export error: ' + (e?.message ?? String(e))); }
  };

  const saveAcceptance = async (signatureDataUrl?: string) => {
    setSaving(true);
    try {
      await setJobHandoverAcceptance(job.id, { comment, signatureDataUrl, name: customer?.name ?? tt('handover', 'ລູກຄ້າ'), warrantyMonths, warrantyTerms: warrantyTerms || undefined });
      await load();
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSaving(false); setSigning(false); }
  };

  const toggleCheck = (i: number) => setChecks((p) => p.map((c, idx) => (idx === i ? { ...c, pass: !c.pass } : c)));
  const setParamActual = (i: number, actual: string) =>
    setParams((p) => p.map((row, idx) => (idx === i ? { ...row, actual, ok: paramOk(row.standard, actual) } : row)));
  const setParamField = (i: number, patch: Partial<ParamRow>) =>
    setParams((p) => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addCustomParam = () => setParams((p) => [...p, { key: '', unit: '', standard: '', actual: '', custom: true }]);
  const removeParam = (i: number) => setParams((p) => p.filter((_, idx) => idx !== i));
  const saveInspection = async () => {
    setInspecting(true);
    try {
      await setJobInspection(job.id, {
        items: checks,
        parameters: params.filter((p) => (p.actual ?? '').trim() !== '' && p.key.trim() !== ''),
        warrantyMonths: tpl?.warrantyMonths,
        warrantyTerms: tpl?.warrantyTerms,
        manualUrl: manualUrl || tpl?.manualUrl,
      });
      setEditingInsp(false);
      await load();
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setInspecting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ===== the document sheet ===== */}
        <View style={styles.sheet} nativeID="handover-sheet">
          <View pointerEvents="none" style={styles.watermark}>
            <Text style={styles.wmBig}>{tt('handover', 'ໃບ ມອບຮັບ ວຽກ')}</Text>
            <Text style={styles.wmSub}>{tech?.name ?? tt('handover', 'ຊ່າງ')} · HomeSang</Text>
            {accepted && <Text style={styles.wmStatus}>{tt('handover', '✓ ຮັບ ມອບ ແລ້ວ')}</Text>}
          </View>

          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>🏠 HomeSang</Text>
              <Text style={styles.brandSub}>{tt('handover', 'ໂຮມຊ່າງ · ໃບ ມອບຮັບ ວຽກ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.docType}>{tt('handover', 'ໃບ ມອບຮັບ ວຽກ')}</Text>
              <Text style={styles.docNo}>{docNo}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('handover', 'ລູກຄ້າ')}</Text>
              <Text style={styles.partyName}>{customer?.name}</Text>
              {!!job.address && <Text style={styles.partyMeta}>📍 {job.address}</Text>}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>{tt('handover', 'ຜູ້ໃຫ້ບໍລິການ')}</Text>
              <Text style={styles.partyName}>{tech?.name}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{tt('handover', 'ງານ:')} <CategoryIcon icon={cat?.icon} size={14} color={colors.text2} /> {job.title}</Text>
          </View>
          <View style={styles.metaRow}>
            {job.finalPrice != null && <Text style={styles.metaText}>{tt('handover', 'ຍອດ:')} <Text style={{ fontWeight: '800' }}>{job.finalPrice.toLocaleString()} {tt('common', 'ກີບ')}</Text></Text>}
            <Text style={styles.metaText}>{tt('handover', 'ຮັບປະກັນ:')} {warrantyMonths} {tt('handover', 'ເດືອນ')}</Text>
          </View>
          {(!!bid?.workType || !!bid?.workContinuity) && (
            <View style={styles.badgeRow}>
              {(() => { const w = labelOf(svcCfg.workTypes, bid?.workType); return w ? <View style={styles.wtBadge}><Text style={styles.wtBadgeText}>{w.icon ?? ''} {w.label}</Text></View> : null; })()}
              {(() => { const c = labelOf(svcCfg.continuity, bid?.workContinuity); return c ? <View style={styles.wtBadge}><Text style={styles.wtBadgeText}>{c.icon ?? ''} {c.label}</Text></View> : null; })()}
            </View>
          )}
          {!!bid?.workContinuityNote && <Text style={styles.metaText}>🔗 {bid.workContinuityNote}</Text>}

          {(before.length > 0 || after.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.secHead}>📸 {tt('handover', 'ຫຼັກຖານ ກ່ອນ / ຫຼັງ')}</Text>
              <BeforeAfter before={before} after={after} />
            </View>
          )}

          {job.inspection && (
            <View style={styles.section}>
              <Text style={styles.secHead}>✅ {tt('handover', 'ໃບກວດງານ')}</Text>
              {job.inspection.items.map((it, i) => (
                <Text key={i} style={styles.inspLine}>{it.pass ? '✓' : '✕'} {it.label}{it.note ? ` — ${it.note}` : ''}</Text>
              ))}
              <Text style={styles.inspResult}>{tt('handover', 'ຜົນ: ຜ່ານ')} {job.inspection.passCount}/{job.inspection.total}</Text>
            </View>
          )}

          {job.parameters && job.parameters.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.secHead}>📐 {tt('handover', 'ຄ່າ ພາຣາມິເຕີ (ທຽບ ມາດຕະຖານ)')}</Text>
              <View style={styles.pTh}>
                <Text style={[styles.pThText, { flex: 1.4 }]}>{tt('handover', 'ພາຣາມິເຕີ')}</Text>
                <Text style={[styles.pThText, styles.pCol, styles.rgt]}>{tt('handover', 'ມາດຕະຖານ')}</Text>
                <Text style={[styles.pThText, styles.pCol, styles.rgt]}>{tt('handover', 'ຄ່າ ຈິງ')}</Text>
                <Text style={{ width: 22 }} />
              </View>
              {job.parameters.map((p, i) => (
                <View key={i} style={styles.pTr}>
                  <Text style={[styles.pTd, { flex: 1.4 }]}>{p.key}{p.custom ? ' *' : ''}</Text>
                  <Text style={[styles.pTd, styles.pCol, styles.rgt]}>{p.standard || '—'}{p.unit ? ` ${p.unit}` : ''}</Text>
                  <Text style={[styles.pTd, styles.pCol, styles.rgt, { fontWeight: '700' }]}>{p.actual}{p.unit ? ` ${p.unit}` : ''}</Text>
                  <Text style={[styles.pTd, { width: 22, textAlign: 'center' }, p.ok === false ? styles.bad : styles.good]}>
                    {p.ok === false ? '✕' : p.ok ? '✓' : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {warrantyMonths > 0 && (
            <View style={styles.section}>
              <Text style={styles.secHead}>🛡️ {tt('handover', 'ໃບຮັບປະກັນ')}</Text>
              <View style={styles.warrBox}>
                <View style={styles.between}>
                  <Text style={styles.warrLabel}>{tt('handover', 'ໄລຍະ ຮັບປະກັນ')}</Text>
                  <Text style={styles.warrBig}>{warrantyMonths} {tt('handover', 'ເດືອນ')}</Text>
                </View>
                {!!warrantyTerms && <Text style={styles.warrTerms}>{warrantyTerms}</Text>}
              </View>
            </View>
          )}

          {(job.manualUrl || job.manualNote) && (
            <View style={styles.section}>
              <Text style={styles.secHead}>📘 {tt('handover', 'ຄູ່ມື / ຄຳແນະນຳ')}</Text>
              {!!job.manualUrl && <Text style={styles.manualLink}>🔗 {job.manualUrl}</Text>}
              {!!job.manualNote && <Text style={styles.manualNote}>{job.manualNote}</Text>}
            </View>
          )}

          {job.termsAcceptedAt && (
            <View style={styles.section}>
              <Text style={styles.secHead}>📜 {tt('handover', 'ການ ຍອມຮັບ ເງື່ອນໄຂ')}</Text>
              <Text style={styles.inspLine}>
                ✅ {tt('handover', 'ລູກຄ້າ')} {job.termsAcceptedByName ?? customer?.name} {tt('handover', 'ໄດ້ ອ່ານ ແລະ ຍອມຮັບ ເງື່ອນໄຂ ບໍລິການ / ຮັບປະກັນ / ຈ່າຍເງິນ')} · {new Date(job.termsAcceptedAt).toLocaleDateString('lo-LA')}
              </Text>
            </View>
          )}

          {accepted ? (
            <View style={styles.section}>
              <Text style={styles.secHead}>💬 {tt('handover', 'ຄຳ ຍອມຮັບ ຂອງ ລູກຄ້າ')}</Text>
              <View style={styles.acceptBox}>
                {!!job.acceptanceComment && <Text style={styles.acceptText}>&ldquo;{job.acceptanceComment}&rdquo;</Text>}
                <Text style={styles.acceptBy}>
                  ✍️ {job.acceptanceSignedByName ?? customer?.name}
                  {job.acceptedAt ? ` · ${new Date(job.acceptedAt).toLocaleDateString('lo-LA')}` : ''}
                </Text>
                {!!job.acceptanceSignatureUrl && <Image source={{ uri: job.acceptanceSignatureUrl }} style={styles.sigImg} resizeMode="contain" />}
              </View>
              <View style={styles.seal}>
                <Text style={styles.sealBig}>HomeSang</Text>
                <Text style={styles.sealSmall}>{tt('handover', 'ຮັບ ມອບ ແລ້ວ')}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.pendingText}>{tt('handover', '⏳ ຍັງ ບໍ່ ໄດ້ ຮັບ ມອບ — ລໍ ລູກຄ້າ ຢືນຢັນ')}</Text>
            </View>
          )}

          <Text style={styles.foot}>{tt('handover', 'ສ້າງໂດຍ HomeSang · ໂຮມຊ່າງ')}</Text>
        </View>

        {/* technician: re-open the saved inspection to correct it / add params */}
        {isTech && job.inspection && !editingInsp && (
          <Pressable style={[styles.btn, styles.btnGhost, { alignSelf: 'center', marginTop: space.md }]} onPress={startEditInspection}>
            <Text style={styles.btnGhostText}>✎ {tt('handover', 'ແກ້ ໃບກວດງານ / ໃສ່ ຄ່າ ພາຣາມິເຕີ')}</Text>
          </Pressable>
        )}

        {/* ===== inspection form (technician) ===== */}
        {showInspForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>✅ {tt('handover', 'ໃບກວດງານ (ຊ່າງ ຕື່ມ ຕອນ ສົ່ງມອບ)')}</Text>
            {checks.map((c, i) => (
              <View key={i} style={styles.inspRow}>
                <Pressable onPress={() => toggleCheck(i)} style={[styles.passBtn, c.pass ? styles.passOn : styles.failOn]}>
                  <Text style={styles.passBtnText}>{c.pass ? '✓' : '✕'}</Text>
                </Pressable>
                <Text style={styles.inspFormLabel}>{c.label}</Text>
              </View>
            ))}

            <Text style={styles.paramHead}>📐 {tt('handover', 'ຄ່າ ພາຣາມິເຕີ (ໃສ່ ຄ່າ ຈິງ ທີ່ ວັດ ໄດ້)')}</Text>
            {params.map((p, i) => (
              <View key={i} style={styles.paramRow}>
                {p.custom ? (
                  <TextInput value={p.key} onChangeText={(v) => setParamField(i, { key: v })} placeholder={tt('handover', 'ຊື່')} placeholderTextColor="#999" style={[styles.input, styles.pKeyIn]} />
                ) : (
                  <Text style={styles.pKeyLabel} numberOfLines={1}>{p.key}<Text style={styles.pStdInline}>{p.standard && p.standard !== '—' ? `  (${p.standard})` : ''}</Text></Text>
                )}
                <TextInput value={p.actual} onChangeText={(v) => setParamActual(i, v)} placeholder={tt('handover', 'ຄ່າ')} placeholderTextColor="#999" keyboardType="numeric" style={[styles.input, styles.pActIn]} />
                {p.custom ? (
                  <TextInput value={p.unit} onChangeText={(v) => setParamField(i, { unit: v })} placeholder={tt('handover', 'ໜ່ວຍ')} placeholderTextColor="#999" style={[styles.input, styles.pUnitIn]} />
                ) : (
                  <Text style={styles.pUnitLabel}>{p.unit}</Text>
                )}
                <Text style={[styles.pMark, p.ok === false ? styles.bad : styles.good]}>{p.ok === false ? '✕' : p.ok ? '✓' : ''}</Text>
                {p.custom && <Pressable onPress={() => removeParam(i)} hitSlop={6}><Text style={styles.pRmText}>✕</Text></Pressable>}
              </View>
            ))}
            <Pressable onPress={addCustomParam}><Text style={styles.addParam}>＋ {tt('handover', 'ເພີ່ມ ພາຣາມິເຕີ ພິເສດ (ສະເພາະ ງານ ນີ້)')}</Text></Pressable>

            <Text style={styles.formHint}>🛡️ {tt('handover', 'ຮັບປະກັນ')} {tpl?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS} {tt('handover', 'ເດືອນ (ຈາກ ມາດຕະຖານ ໝວດ)')}</Text>
            <TextInput
              value={manualUrl}
              onChangeText={setManualUrl}
              placeholder={tt('handover', '🔗 ລິ້ງ ຄູ່ມື / ຄຳແນະນຳ (ບໍ່ບັງຄັບ)')}
              placeholderTextColor="#999"
              style={styles.linkInput}
              autoCapitalize="none"
            />
            <Pressable style={[styles.btn, styles.btnGreen, { marginTop: 10 }, inspecting && styles.btnDim]} onPress={saveInspection} disabled={inspecting}>
              <Text style={styles.btnText}>{inspecting ? tt('handover', 'ກຳລັງ...') : tt('handover', '✓ ຢືນຢັນ ໃບກວດງານ')}</Text>
            </Pressable>
          </View>
        )}
        {canInspect && checks.length === 0 && (
          <Text style={styles.seedHint}>{tt('handover', '⚠️ ໝວດ ນີ້ ຍັງ ບໍ່ ມີ ມາດຕະຖານ ໃບກວດງານ — admin ກົດ seed ໃນ ຫຼັງບ້ານ ກ່ອນ')}</Text>
        )}

        {/* ===== acceptance form (owner, once work done) ===== */}
        {canAccept && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>✍️ {tt('handover', 'ຮັບ ມອບ ວຽກ')}</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={tt('handover', 'ຄຳ ຍອມຮັບ / ຄິດເຫັນ ຕໍ່ ວຽກ (ເຊັ່ນ: ຮັບ ມອບ ວຽກ ຮຽບຮ້ອຍ, ພໍໃຈ)')}
              placeholderTextColor="#999"
              style={styles.ta}
              multiline
            />
            <Text style={styles.formHint}>{tt('handover', 'ຊື່ ຈາກ ໂປຣຟາຍລ໌:')} <Text style={{ fontWeight: '700' }}>{customer?.name}</Text> {tt('handover', '→ ກາຍ ເປັນ ສະແຕັມ ໃນ ໃບ')}</Text>
            <View style={styles.formBtns}>
              <Pressable style={[styles.btn, styles.btnGreen, { flex: 1 }, saving && styles.btnDim]} onPress={() => setSigning(true)} disabled={saving}>
                <Text style={styles.btnText}>{tt('handover', '✍️ ເຊັນ + ຢືນຢັນ ຮັບ ມອບ')}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost, saving && styles.btnDim]} onPress={() => saveAcceptance(undefined)} disabled={saving}>
                <Text style={styles.btnGhostText}>{tt('handover', 'ຮັບ ໂດຍ ບໍ່ ເຊັນ')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {Platform.OS === 'web' && (
          <View style={styles.exportRow}>
            <Pressable style={[styles.expBtn, styles.expPrimary]} onPress={exportPdf}><Text style={styles.expPrimaryText}>📄 PDF</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={exportJpg}><Text style={styles.expText}>🖼️ JPG</Text></Pressable>
            <Pressable style={styles.expBtn} onPress={doPrint}><Text style={styles.expText}>{tt('handover', '🖨️ ພິມ')}</Text></Pressable>
          </View>
        )}
        <BackButton />
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      {signing && (
        <SignaturePad onCancel={() => setSigning(false)} onSave={(dataUrl) => saveAcceptance(dataUrl)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  muted: { color: colors.text3, textAlign: 'center' },
  sheet: { width: '100%', maxWidth: 720, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, overflow: 'hidden', position: 'relative', ...shadow.card },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.07, transform: [{ rotate: '-28deg' }] },
  wmBig: { fontSize: 36, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  wmSub: { fontSize: 15, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 4 },
  wmStatus: { fontSize: 15, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 2 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: font.xl, fontWeight: '800', color: colors.primary },
  brandSub: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  docType: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  docNo: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  parties: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  party: { flex: 1, minWidth: 180 },
  partyLabel: { fontSize: font.xs, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },
  partyName: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 4 },
  partyMeta: { fontSize: font.sm, color: colors.text2, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  metaText: { fontSize: font.sm, color: colors.text2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  wtBadge: { backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  wtBadgeText: { fontSize: font.xs, fontWeight: '700', color: '#5b21b6' },
  section: { marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  secHead: { fontSize: font.sm, fontWeight: '700', color: colors.text, marginBottom: 8 },
  acceptBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: radius.md, padding: space.md },
  acceptText: { fontSize: font.md, color: '#14532d', fontStyle: 'italic' },
  acceptBy: { fontSize: font.sm, color: '#166534', marginTop: 6, fontWeight: '700' },
  sigImg: { width: 180, height: 70, backgroundColor: '#fff', marginTop: 8, alignSelf: 'flex-start' },
  seal: { alignSelf: 'flex-end', marginTop: 10, width: 96, height: 96, borderWidth: 3, borderColor: '#0a54a5', borderRadius: 48, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], opacity: 0.85 },
  sealBig: { fontSize: 13, fontWeight: '800', color: '#0a54a5' },
  sealSmall: { fontSize: 12, color: '#0a54a5' },
  pendingText: { fontSize: font.sm, color: '#b45309', fontWeight: '700' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inspLine: { fontSize: font.sm, color: colors.text2, marginTop: 3, lineHeight: 19 },
  inspResult: { fontSize: font.sm, fontWeight: '800', color: colors.text, marginTop: 6 },
  warrBox: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: radius.md, padding: space.md },
  warrLabel: { fontSize: font.sm, color: colors.text2 },
  warrBig: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  warrTerms: { fontSize: font.xs, color: colors.text2, marginTop: 6, lineHeight: 17 },
  manualLink: { fontSize: font.sm, color: colors.primary, marginTop: 2 },
  manualNote: { fontSize: font.sm, color: colors.text2, marginTop: 4 },
  inspRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  passBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  passOn: { backgroundColor: '#16a34a' },
  failOn: { backgroundColor: '#dc2626' },
  passBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  inspFormLabel: { flex: 1, fontSize: font.sm, color: colors.text },
  good: { color: '#16a34a' },
  bad: { color: '#dc2626' },
  // doc parameter table
  pTh: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 6, marginTop: 4 },
  pThText: { fontSize: font.xs, fontWeight: '700', color: colors.text2 },
  pCol: { width: 84 },
  rgt: { textAlign: 'right' },
  pTr: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  pTd: { fontSize: font.sm, color: colors.text },
  // form parameter rows
  paramHead: { fontSize: font.sm, fontWeight: '700', color: '#0369a1', marginTop: 14, marginBottom: 4 },
  paramRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  pKeyLabel: { flex: 1, fontSize: font.sm, color: colors.text },
  pStdInline: { fontSize: font.xs, color: colors.text3 },
  pKeyIn: { flex: 1, paddingVertical: 7, fontSize: font.sm },
  pActIn: { width: 66, paddingVertical: 7, fontSize: font.sm, textAlign: 'center' },
  pUnitLabel: { width: 40, fontSize: font.xs, color: colors.text2 },
  pUnitIn: { width: 52, paddingVertical: 7, fontSize: font.xs, textAlign: 'center' },
  pMark: { width: 18, textAlign: 'center', fontSize: font.md, fontWeight: '800' },
  pRmText: { color: '#dc2626', fontSize: 14, fontWeight: '700', paddingHorizontal: 2 },
  addParam: { color: '#0369a1', fontSize: font.sm, fontWeight: '700', marginTop: 8 },
  linkInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: font.sm, color: colors.text, marginTop: 10, backgroundColor: colors.surface },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7, fontSize: font.sm, color: colors.text, backgroundColor: colors.surface },
  seedHint: { fontSize: font.sm, color: '#b45309', textAlign: 'center', marginTop: space.md, paddingHorizontal: 16 },
  foot: { fontSize: font.xs, color: colors.text3, textAlign: 'center', marginTop: space.lg },
  formCard: { width: '100%', maxWidth: 720, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, marginTop: space.md, borderWidth: 1.5, borderColor: '#bbf7d0' },
  formTitle: { fontSize: font.md, fontWeight: '800', color: colors.text, marginBottom: 8 },
  ta: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: font.md, color: colors.text, minHeight: 70, textAlignVertical: 'top', backgroundColor: colors.surface },
  formHint: { fontSize: font.xs, color: colors.text3, marginTop: 8 },
  formBtns: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGreen: { backgroundColor: colors.accent },
  btnText: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  btnGhostText: { color: colors.text2, fontSize: font.sm, fontWeight: '700' },
  btnDim: { opacity: 0.5 },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.lg, justifyContent: 'center' },
  expBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.surface },
  expPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  expPrimaryText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  expText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
