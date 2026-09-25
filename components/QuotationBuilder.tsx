import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import PhotoPicker from '@/components/PhotoPicker';
import { computeQuote, type QuoteItem } from '@/lib/bids';
import { incrementSurveyUsage, rateSurveyTemplate, type SurveyCheck, type SurveyTemplate, watchSurveyTemplatesForCategory } from '@/lib/surveyTemplates';
import { type PriceItem, PRICE_KIND_LABEL, watchPriceItems } from '@/lib/priceCatalog';
import { type Product, type Shop, watchAllProducts, watchShops } from '@/lib/shop';
import { type BomTemplate, watchBomTemplates } from '@/lib/bomTemplates';
import { DEFAULT_PRICING_CONFIG, type PricingConfig, resolveCommissionPct, watchPricingConfig } from '@/lib/pricingConfig';
import { deleteQuoteTemplate, type QuoteTemplate, saveQuoteTemplate, watchMyQuoteTemplates } from '@/lib/quoteTemplates';
import { DEFAULT_SERVICE_CONFIG, type ServiceConfig, watchServiceConfig } from '@/lib/serviceConfig';
import type { PaymentPlan } from '@/lib/jobs';
import { type AppSettings, DEFAULT_SETTINGS, watchAppSettings } from '@/lib/appSettings';
import { useTT } from '@/lib/i18n';

export interface QuoteDraft {
  items: QuoteItem[];
  discount: number;
  vatRate: number;
  surveyNote?: string;
  surveyPhotos: string[];
  surveyChecklist?: SurveyCheck[];
  surveyTemplateId?: string;
  workType?: string;
  workContinuity?: string;
  workContinuityNote?: string;
  paymentPlan?: PaymentPlan;
  validUntil?: number;
  subtotal: number;
  vat: number;
  total: number;
}

function fmt(n: number): string {
  return (n || 0).toLocaleString('en-US');
}

/** Parse YYYY-MM-DD → epoch millis (or undefined). */
function parseDate(s: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const t = new Date(s + 'T00:00:00').getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Fields that can pre-fill the builder when revising an existing quote. */
export interface QuoteInitial {
  items?: QuoteItem[];
  discount?: number;
  vatRate?: number;
  surveyNote?: string;
  surveyPhotos?: string[];
  surveyChecklist?: SurveyCheck[];
  workType?: string;
  workContinuity?: string;
  workContinuityNote?: string;
  validUntil?: number;
  paymentPlan?: PaymentPlan;
}

/** epoch ms → YYYY-MM-DD (local) for the validUntil text field. */
function isoDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function QuotationBuilder({
  pathPrefix,
  category,
  surveyRequested,
  initial,
  ownerId,
  travelKm,
  onChange,
}: {
  pathPrefix: string;
  category?: string;
  surveyRequested?: boolean;
  initial?: QuoteInitial;
  ownerId?: string; // technician id — enables save/load of personal quote templates
  travelKm?: number; // distance tech→site; enables the "add travel fee" line (quick-win 2)
  onChange: (q: QuoteDraft) => void;
}) {
  const tt = useTT();
  const [items, setItems] = useState<QuoteItem[]>(() =>
    initial?.items?.length ? initial.items : [{ desc: '', qty: 1, unit: tt('quoteBuilder', 'ອັນ'), unitPrice: 0 }],
  );
  const [discount, setDiscount] = useState(() => initial?.discount ?? 0);
  const [vatRate, setVatRate] = useState(() => initial?.vatRate ?? 10);
  const [surveyNote, setSurveyNote] = useState(() => initial?.surveyNote ?? '');
  const [surveyPhotos, setSurveyPhotos] = useState<string[]>(() => initial?.surveyPhotos ?? []);
  const [svcCfg, setSvcCfg] = useState<ServiceConfig>(DEFAULT_SERVICE_CONFIG);
  const [workType, setWorkType] = useState(() => initial?.workType ?? '');
  const [workContinuity, setWorkContinuity] = useState(() => initial?.workContinuity ?? '');
  const [workContinuityNote, setWorkContinuityNote] = useState(() => initial?.workContinuityNote ?? '');
  const [validUntilStr, setValidUntilStr] = useState(() => isoDate(initial?.validUntil));
  const [planType, setPlanType] = useState<'full' | 'deposit' | 'installments'>(() => initial?.paymentPlan?.type ?? 'full');
  const [depositPct, setDepositPct] = useState(() => String((initial?.paymentPlan as any)?.depositPct ?? 30));
  const [installmentCount, setInstallmentCount] = useState(() => String((initial?.paymentPlan as any)?.installmentCount ?? 3));
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [selTplId, setSelTplId] = useState<string>('');
  const [rated, setRated] = useState(0);
  const [checks, setChecks] = useState<SurveyCheck[]>([]);
  const [catalog, setCatalog] = useState<PriceItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [showShop, setShowShop] = useState(false);
  const [boms, setBoms] = useState<BomTemplate[]>([]);
  const [showBom, setShowBom] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [priceCfg, setPriceCfg] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [appCfg, setAppCfg] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => watchAppSettings(setAppCfg), []);
  const [photoOpen, setPhotoOpen] = useState<Record<number, boolean>>(() => {
    // auto-expand any line that already carries photos (when revising)
    const o: Record<number, boolean> = {};
    (initial?.items ?? []).forEach((it, i) => { if (it.photos?.length) o[i] = true; });
    return o;
  });
  const [myTpls, setMyTpls] = useState<QuoteTemplate[]>([]);
  const [showTpl, setShowTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const [namingTpl, setNamingTpl] = useState(false);
  const [tplSearch, setTplSearch] = useState('');

  useEffect(() => {
    if (!ownerId) return;
    return watchMyQuoteTemplates(ownerId, setMyTpls);
  }, [ownerId]);

  // the currently-selected payment plan, in stored shape
  const currentPlan = (): PaymentPlan | undefined =>
    planType === 'deposit'
      ? { type: 'deposit', depositPct: Number(depositPct) || 30 }
      : planType === 'installments'
      ? { type: 'installments', installmentCount: Number(installmentCount) || 2 }
      : undefined;

  // load a whole saved quote into the builder (replaces the current draft)
  const applyTemplate = (t: QuoteTemplate) => {
    setItems(t.items.length ? t.items.map((it) => ({ ...it })) : [{ desc: '', qty: 1, unit: tt('quoteBuilder', 'ອັນ'), unitPrice: 0 }]);
    setDiscount(t.discount ?? 0);
    setVatRate(t.vatRate ?? 10);
    const p = t.paymentPlan;
    if (p?.type === 'deposit') { setPlanType('deposit'); setDepositPct(String((p as any).depositPct ?? 30)); }
    else if (p?.type === 'installments') { setPlanType('installments'); setInstallmentCount(String((p as any).installmentCount ?? 3)); }
    else setPlanType('full');
    setPhotoOpen({});
    setShowTpl(false);
  };

  const saveTemplate = async () => {
    if (!ownerId) return;
    const usable = items.filter((it) => it.desc.trim() !== '' || it.unitPrice > 0);
    if (!usable.length) return;
    setSavingTpl(true);
    try {
      await saveQuoteTemplate({
        ownerId,
        name: tplName.trim() || (category ? `${category} · ${usable.length} ${tt('quoteBuilder', 'ລາຍການ')}` : `${tt('quoteBuilder', 'ໃບສະເໜີ')} · ${usable.length} ${tt('quoteBuilder', 'ລາຍການ')}`),
        category,
        items: usable,
        discount: discount > 0 ? discount : undefined,
        vatRate,
        paymentPlan: currentPlan(),
      });
      setNamingTpl(false);
      setTplName('');
    } catch (e: any) {
      console.error('saveTemplate:', e);
    } finally {
      setSavingTpl(false);
    }
  };

  useEffect(() => watchServiceConfig(setSvcCfg), []);
  useEffect(() => watchPriceItems(setCatalog), []);
  useEffect(() => watchAllProducts(setProducts), []);
  useEffect(() => watchBomTemplates(setBoms), []);
  useEffect(() => watchShops(setShops), []);
  useEffect(() => watchPricingConfig(setPriceCfg), []);

  // commission % for a product: per-product override → shop rule → global default
  const resolvePct = (p: Product): number => {
    const shop = shops.find((s) => s.id === p.shopId);
    return resolveCommissionPct(p, shop?.commissionRules, undefined, priceCfg).pct;
  };

  const bomsForJob = boms.filter((b) => b.active && (!b.category || !category || b.category === category));
  const applyBom = (b: BomTemplate) => {
    const lines: QuoteItem[] = b.items
      .filter((it) => it.selected !== false && (it.name.trim() !== '' || it.productId))
      .map((it) => {
        // linked shop product → pull its current price / cost / commission
        if (it.productId) {
          const p = products.find((x) => x.id === it.productId);
          if (p) {
            const line: QuoteItem = { desc: p.name, qty: it.qty || 1, unit: p.unit, unitPrice: p.price, sourceShopId: p.shopId };
            if (p.costPrice != null) line.costPrice = p.costPrice;
            line.commissionPct = resolvePct(p);
            return line;
          }
        }
        return { desc: it.name, qty: it.qty || 1, unit: it.unit, unitPrice: it.unitPrice || 0 };
      });
    if (!lines.length) return;
    setItems((prev) => (prev.length === 1 && !prev[0].desc && !prev[0].unitPrice ? lines : [...prev, ...lines]));
    setShowBom(false);
  };

  const shopItems = products.filter((p) => p.quotable && p.active && p.approved);
  const addFromProduct = (p: Product) => {
    const line: QuoteItem = { desc: p.name, qty: 1, unit: p.unit, unitPrice: p.price, sourceShopId: p.shopId };
    if (p.costPrice != null) line.costPrice = p.costPrice;
    line.commissionPct = resolvePct(p);
    setItems((prev) => {
      if (prev.length === 1 && !prev[0].desc && !prev[0].unitPrice) return [line];
      return [...prev, line];
    });
  };

  const catalogForJob = catalog.filter(
    (p) => p.active && (!p.category || !category || p.category === category),
  );
  const addFromCatalog = (p: PriceItem) => {
    const line: QuoteItem = { desc: p.name, qty: 1, unit: p.unit, unitPrice: p.price };
    setItems((prev) => {
      // replace the initial blank row, otherwise append
      if (prev.length === 1 && !prev[0].desc && !prev[0].unitPrice) return [line];
      return [...prev, line];
    });
  };

  const { subtotal, vat, total } = computeQuote(items, discount, vatRate);

  // load the category's survey templates (one per sub-category)
  useEffect(() => {
    if (!category) { setTemplates([]); return; }
    return watchSurveyTemplatesForCategory(category, setTemplates);
  }, [category]);

  // default-select the first (most-used) template for this category
  useEffect(() => {
    if (templates.length && !templates.some((t) => t.id === selTplId)) setSelTplId(templates[0].id);
    if (!templates.length) setSelTplId('');
    setRated(0);
  }, [templates, selTplId]);

  const tpl = templates.find((t) => t.id === selTplId) ?? null;

  // seed checklist rows from the template, preserving any ticks/notes by label
  useEffect(() => {
    if (!tpl) { setChecks([]); return; }
    setChecks((prev) =>
      tpl.items.map((label) => prev.find((c) => c.label === label) ?? { label, checked: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selTplId, templates]);

  const checklistOn = !!tpl && checks.length > 0;

  const toggleCheck = (i: number) =>
    setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c)));
  const setCheckNote = (i: number, note: string) =>
    setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, note } : c)));

  useEffect(() => {
    // drop empty per-line photo arrays so Firestore never stores `photos: []`
    const cleanItems = items.map((it) => {
      if (it.photos && it.photos.length === 0) {
        const copy = { ...it };
        delete copy.photos;
        return copy;
      }
      return it;
    });
    onChange({
      items: cleanItems,
      discount,
      vatRate,
      surveyNote: surveyNote || undefined,
      surveyPhotos,
      surveyChecklist: checklistOn ? checks.filter((c) => c.checked || (c.note ?? '').trim()) : undefined,
      surveyTemplateId: checklistOn ? tpl?.id : undefined,
      workType: workType || undefined,
      workContinuity: workContinuity || undefined,
      workContinuityNote: workContinuity === 'continued' ? (workContinuityNote.trim() || undefined) : undefined,
      paymentPlan:
        planType === 'deposit'
          ? { type: 'deposit', depositPct: Number(depositPct) || 30 }
          : planType === 'installments'
          ? { type: 'installments', installmentCount: Number(installmentCount) || 2 }
          : undefined,
      validUntil: parseDate(validUntilStr),
      subtotal,
      vat,
      total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, discount, vatRate, surveyNote, surveyPhotos, validUntilStr, checks, checklistOn, selTplId, planType, depositPct, installmentCount, workType, workContinuity, workContinuityNote]);

  const setItem = (i: number, patch: Partial<QuoteItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((prev) => [...prev, { desc: '', qty: 1, unit: tt('quoteBuilder', 'ອັນ'), unitPrice: 0 }]);
  const removeItem = (i: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // quick-win 2: transparent travel fee, computed from the tech→site distance and
  // the admin's free-radius + per-km rate (feature dormant until the rate is set).
  const TRAVEL_LABEL = tt('quoteBuilder', 'ຄ່າ ເດີນທາງ');
  const travelFee =
    travelKm != null && appCfg.techTravelPerKm > 0
      ? Math.max(0, Math.round(travelKm - (appCfg.techTravelFreeKm || 0))) * appCfg.techTravelPerKm
      : 0;
  const hasTravel = items.some((it) => (it.desc ?? '').startsWith(TRAVEL_LABEL));
  const addTravelFee = () =>
    setItems((prev) => [...prev, {
      desc: `${TRAVEL_LABEL} (${Math.round(travelKm!)} ${tt('quoteBuilder', 'ກມ')})`,
      qty: 1,
      unit: tt('quoteBuilder', 'ຄັ້ງ'),
      unitPrice: travelFee,
    }]);

  return (
    <View>
      {/* work classification */}
      <Text style={styles.block}>{tt('quoteBuilder','ປະເພດ ວຽກ')}</Text>
      <View style={styles.wtRow}>
        {svcCfg.workTypes.map((o) => (
          <Pressable key={o.key} style={[styles.wtChip, workType === o.key && styles.wtChipOn]} onPress={() => setWorkType(workType === o.key ? '' : o.key)}>
            <Text style={[styles.wtChipText, workType === o.key && styles.wtChipTextOn]}>{o.icon ? `${o.icon} ` : ''}{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.block, { marginTop: 8 }]}>{tt('quoteBuilder','ຄວາມ ຕໍ່ເນື່ອງ ຂອງ ວຽກ')}</Text>
      <View style={styles.wtRow}>
        {svcCfg.continuity.map((o) => (
          <Pressable key={o.key} style={[styles.wtChip, workContinuity === o.key && styles.wtChipOn]} onPress={() => setWorkContinuity(workContinuity === o.key ? '' : o.key)}>
            <Text style={[styles.wtChipText, workContinuity === o.key && styles.wtChipTextOn]}>{o.icon ? `${o.icon} ` : ''}{o.label}</Text>
          </Pressable>
        ))}
      </View>
      {workContinuity === 'continued' && (
        <TextInput
          value={workContinuityNote}
          onChangeText={setWorkContinuityNote}
          placeholder={tt('quoteBuilder','ສະພາບ ເດີມ / ວຽກ ຄ້າງ ຈາກ ຊ່າງ ອື່ນ...')}
          placeholderTextColor="#999"
          style={[styles.input, { marginTop: 6 }]}
          multiline
        />
      )}

      {/* survey */}
      <Text style={styles.block}>
        {tt('quoteBuilder','ສຳຫຼວດໜ້າງານ')} {surveyRequested ? '' : tt('quoteBuilder','(ບໍ່ບັງຄັບ)')}
      </Text>
      {surveyRequested && (
        <Text style={styles.surveyAsk}>🔍 {tt('quoteBuilder','ລູກຄ້າ ຮ້ອງຂໍ ໃຫ້ສຳຫຼວດໜ້າງານ')}</Text>
      )}

      {/* pick which survey template (per sub-category) */}
      {templates.length > 1 && (
        <View style={styles.tplPickRow}>
          {templates.map((t) => (
            <Pressable key={t.id} style={[styles.tplChip, t.id === selTplId && styles.tplChipOn]} onPress={() => setSelTplId(t.id)}>
              <Text style={[styles.tplChipText, t.id === selTplId && styles.tplChipTextOn]}>{t.subName || t.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* category checklist */}
      {checklistOn && (
        <View style={styles.checklist}>
          {checks.map((c, i) => (
            <View key={c.label} style={styles.checkItem}>
              <Pressable style={styles.checkRow} onPress={() => toggleCheck(i)}>
                <View style={[styles.box, c.checked && styles.boxOn]}>
                  {c.checked && <Text style={styles.boxTick}>✓</Text>}
                </View>
                <Text style={[styles.checkLabel, c.checked && styles.checkLabelOn]}>{c.label}</Text>
              </Pressable>
              {c.checked && (
                <TextInput
                  value={c.note ?? ''}
                  onChangeText={(v) => setCheckNote(i, v)}
                  placeholder={tt('quoteBuilder','ໝາຍເຫດ (ບໍ່ບັງຄັບ)')}
                  placeholderTextColor="#999"
                  style={styles.checkNote}
                />
              )}
            </View>
          ))}
        </View>
      )}

      {checklistOn && tpl && (
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>{tt('quoteBuilder','ໃຫ້ ຄະແນນ ແບບ ນີ້:')}</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => { rateSurveyTemplate(tpl.id, n); setRated(n); }} hitSlop={4}>
              <Text style={styles.star}>{n <= rated ? '★' : '☆'}</Text>
            </Pressable>
          ))}
          {rated > 0 && <Text style={styles.rateThanks}>✓ {tt('quoteBuilder','ຂອບໃຈ')}</Text>}
        </View>
      )}

      <TextInput
        value={surveyNote}
        onChangeText={setSurveyNote}
        placeholder={tt('quoteBuilder','ສະພາບ / ສິ່ງທີ່ພົບ / ສິ່ງທີ່ຕ້ອງເຮັດ')}
        placeholderTextColor="#999"
        style={[styles.input, styles.textarea]}
        multiline
      />
      <View style={{ marginTop: 8 }}>
        <PhotoPicker
          photos={surveyPhotos}
          onChange={setSurveyPhotos}
          pathPrefix={pathPrefix}
          max={4}
        />
      </View>

      {/* items */}
      <View style={styles.itemsHead}>
        <Text style={styles.block}>{tt('quoteBuilder','ລາຍການ')}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {!!ownerId && myTpls.length > 0 && (
            <Pressable style={styles.tplBtn} onPress={() => setShowTpl((s) => !s)}>
              <Text style={styles.tplBtnText}>📋 {tt('quoteBuilder','ແມ່ແບບ')}</Text>
            </Pressable>
          )}
          {bomsForJob.length > 0 && (
            <Pressable style={styles.bomBtn} onPress={() => setShowBom((s) => !s)}>
              <Text style={styles.bomBtnText}>📦 {tt('quoteBuilder','ຊຸດ BOM')}</Text>
            </Pressable>
          )}
          {catalogForJob.length > 0 && (
            <Pressable style={styles.catalogBtn} onPress={() => setShowCatalog((s) => !s)}>
              <Text style={styles.catalogBtnText}>💲 {tt('quoteBuilder','ລາຄາກາງ')}</Text>
            </Pressable>
          )}
          {shopItems.length > 0 && (
            <Pressable style={styles.shopBtn} onPress={() => setShowShop((s) => !s)}>
              <Text style={styles.shopBtnText}>🏬 {tt('quoteBuilder','ສິນຄ້າຮ້ານ')}</Text>
            </Pressable>
          )}
          {travelFee > 0 && !hasTravel && (
            <Pressable style={styles.travelBtn} onPress={addTravelFee}>
              <Text style={styles.travelBtnText}>🚗 {tt('quoteBuilder','ຄ່າ ເດີນທາງ')} {fmt(travelFee)} ({Math.round(travelKm!)} {tt('quoteBuilder','ກມ')})</Text>
            </Pressable>
          )}
          <Pressable style={styles.addBtn} onPress={addItem}>
            <Text style={styles.addBtnText}>＋ {tt('quoteBuilder','ເພີ່ມ')}</Text>
          </Pressable>
        </View>
      </View>

      {showTpl && !!ownerId && myTpls.length > 0 && (
        <View style={styles.tplBox}>
          <Text style={styles.catalogHint}>{tt('quoteBuilder','ກົດ ເພື່ອ ດຶງ ໃບສະເໜີ ທັງໃບ ກັບມາໃຊ້')}</Text>
          {myTpls.length > 5 && (
            <TextInput
              value={tplSearch}
              onChangeText={setTplSearch}
              placeholder={tt('quoteBuilder','🔍 ຄົ້ນ ຫາ ແມ່ແບບ (ຊື່ / ໝວດ)')}
              placeholderTextColor="#999"
              style={[styles.input, { marginBottom: 8 }]}
            />
          )}
          {myTpls
            .filter((t) => {
              const s = tplSearch.trim().toLowerCase();
              return !s || t.name.toLowerCase().includes(s) || (t.category ?? '').toLowerCase().includes(s);
            })
            .map((t) => (
            <View key={t.id} style={styles.catalogItem}>
              <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => applyTemplate(t)}>
                <Text style={styles.shopTag}>📋</Text>
                <Text style={styles.catalogName} numberOfLines={1}>{t.name} · {t.items.length} {tt('quoteBuilder','ລາຍການ')}</Text>
                <Text style={styles.catalogAdd}>＋</Text>
              </Pressable>
              <Pressable onPress={() => deleteQuoteTemplate(t.id)} hitSlop={6} style={{ paddingHorizontal: 4 }}>
                <Text style={{ color: '#dc2626', fontSize: 14 }}>🗑</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {showBom && bomsForJob.length > 0 && (
        <View style={styles.bomBox}>
          <Text style={styles.catalogHint}>{tt('quoteBuilder','ກົດ ເພື່ອດຶງ ທຸກລາຍການ ເຂົ້າໃບສະເໜີ')}</Text>
          {bomsForJob.map((b) => (
            <Pressable key={b.id} style={styles.catalogItem} onPress={() => applyBom(b)}>
              <Text style={styles.shopTag}>📦</Text>
              <Text style={styles.catalogName} numberOfLines={1}>{b.name} · {b.items.filter((it) => it.selected !== false).length} {tt('quoteBuilder','ລາຍການ')}</Text>
              <Text style={styles.catalogAdd}>＋</Text>
            </Pressable>
          ))}
        </View>
      )}

      {showShop && shopItems.length > 0 && (
        <View style={styles.shopBox}>
          <Text style={styles.catalogHint}>{tt('quoteBuilder','ສິນຄ້າ ຮ້ານພັນທະມິດ — ກົດ ເພື່ອເພີ່ມ')}</Text>
          {shopItems.map((p) => (
            <Pressable key={p.id} style={styles.catalogItem} onPress={() => addFromProduct(p)}>
              <Text style={styles.shopTag}>🏬</Text>
              <Text style={styles.catalogName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.catalogPrice}>{p.price.toLocaleString('en-US')}/{p.unit}</Text>
              <Text style={styles.catalogAdd}>＋</Text>
            </Pressable>
          ))}
        </View>
      )}

      {showCatalog && catalogForJob.length > 0 && (
        <View style={styles.catalogBox}>
          <Text style={styles.catalogHint}>{tt('quoteBuilder','ກົດ ເພື່ອເພີ່ມ ເຂົ້າໃບສະເໜີ')}</Text>
          {catalogForJob.map((p) => (
            <Pressable key={p.id} style={styles.catalogItem} onPress={() => addFromCatalog(p)}>
              <Text style={styles.catalogKind}>{tt('priceKind', PRICE_KIND_LABEL[p.kind])}</Text>
              <Text style={styles.catalogName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.catalogPrice}>{p.price.toLocaleString('en-US')}/{p.unit}</Text>
              <Text style={styles.catalogAdd}>＋</Text>
            </Pressable>
          ))}
        </View>
      )}

      {items.map((it, i) => (
        <View key={i} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <TextInput
              value={it.desc}
              onChangeText={(v) => setItem(i, { desc: v })}
              placeholder={tt('quoteBuilder','ລາຍລະອຽດ')}
              placeholderTextColor="#999"
              style={[styles.input, { flex: 1 }]}
            />
            {items.length > 1 && (
              <Pressable style={styles.rm} onPress={() => removeItem(i)}>
                <Text style={styles.rmText}>✕</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>{tt('quoteBuilder','ຈ.ນ')}</Text>
              <AmountInput
                value={it.qty}
                onChangeValue={(n) => setItem(i, { qty: n })}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>{tt('quoteBuilder','ໜ່ວຍ')}</Text>
              <TextInput
                value={it.unit}
                onChangeText={(v) => setItem(i, { unit: v })}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.miniLabel}>{tt('quoteBuilder','ລາຄາ/ໜ່ວຍ')}</Text>
              <AmountInput
                value={it.unitPrice}
                onChangeValue={(n) => setItem(i, { unitPrice: n })}
                placeholder="0"
                placeholderTextColor="#999"
                style={styles.input}
              />
            </View>
          </View>
          <View style={styles.lineFooter}>
            <Pressable onPress={() => setPhotoOpen((o) => ({ ...o, [i]: !o[i] }))} hitSlop={6}>
              <Text style={styles.linePhotoToggle}>
                📷 {tt('quoteBuilder','ຮູບ')}{it.photos?.length ? ` (${it.photos.length})` : ''} {photoOpen[i] ? '▲' : '▼'}
              </Text>
            </Pressable>
            <Text style={styles.lineTotal}>
              = {fmt((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))} {tt('common','ກີບ')}
            </Text>
          </View>
          {photoOpen[i] && (
            <View style={styles.linePhotos}>
              <PhotoPicker
                photos={it.photos ?? []}
                onChange={(photos) => setItem(i, { photos })}
                pathPrefix={`${pathPrefix}/lines`}
                max={3}
              />
            </View>
          )}
        </View>
      ))}

      {/* discount + vat */}
      <View style={styles.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.miniLabel}>{tt('quoteBuilder','ສ່ວນຫຼຸດ (ກີບ)')}</Text>
          <AmountInput
            value={discount}
            onChangeValue={(n) => setDiscount(n)}
            placeholder="0"
            placeholderTextColor="#999"
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.miniLabel}>VAT %</Text>
          <TextInput
            value={String(vatRate)}
            onChangeText={(v) => setVatRate(Number(v.replace(/\D/g, '')) || 0)}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>
      </View>

      {/* totals */}
      <View style={styles.totals}>
        <View style={styles.totRow}>
          <Text style={styles.totLabel}>{tt('quoteBuilder','ລວມຍ່ອຍ')}</Text>
          <Text style={styles.totVal}>{fmt(subtotal)}</Text>
        </View>
        {discount > 0 && (
          <View style={styles.totRow}>
            <Text style={styles.totLabel}>{tt('quoteBuilder','ສ່ວນຫຼຸດ')}</Text>
            <Text style={styles.totVal}>-{fmt(discount)}</Text>
          </View>
        )}
        <View style={styles.totRow}>
          <Text style={styles.totLabel}>VAT {vatRate}%</Text>
          <Text style={styles.totVal}>{fmt(vat)}</Text>
        </View>
        <View style={[styles.totRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>{tt('quoteBuilder','ລວມທັງໝົດ')}</Text>
          <Text style={styles.grandVal}>{fmt(total)} {tt('common','ກີບ')}</Text>
        </View>
      </View>

      {/* payment plan */}
      <Text style={styles.block}>{tt('quoteBuilder','ແຜນຈ່າຍ')}</Text>
      <View style={styles.planRow}>
        {([
          ['full', 'ຈ່າຍເຕັມ'],
          ['deposit', 'ມັດຈຳ%'],
          ['installments', 'ແບ່ງງວດ'],
        ] as const).map(([v, label]) => (
          <Pressable
            key={v}
            style={[styles.planChip, planType === v && styles.planChipOn]}
            onPress={() => setPlanType(v)}>
            <Text style={[styles.planChipText, planType === v && styles.planChipTextOn]}>{tt('quoteBuilder', label)}</Text>
          </Pressable>
        ))}
      </View>
      {planType === 'deposit' && (
        <View style={styles.planDetail}>
          <Text style={styles.miniLabel}>{tt('quoteBuilder','ມັດຈຳ %')}</Text>
          <TextInput
            value={depositPct}
            onChangeText={(v) => setDepositPct(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            style={[styles.input, { width: 90 }]}
          />
          <Text style={styles.planHint}>
            {tt('quoteBuilder','ມັດຈຳ')} {fmt(Math.round((total * (Number(depositPct) || 0)) / 100))} · {tt('quoteBuilder','ສ່ວນເຫຼືອ')} {fmt(total - Math.round((total * (Number(depositPct) || 0)) / 100))}
          </Text>
        </View>
      )}
      {planType === 'installments' && (
        <View style={styles.planDetail}>
          <Text style={styles.miniLabel}>{tt('quoteBuilder','ຈຳນວນງວດ')}</Text>
          <TextInput
            value={installmentCount}
            onChangeText={(v) => setInstallmentCount(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            style={[styles.input, { width: 90 }]}
          />
          <Text style={styles.planHint}>
            {Math.max(2, Number(installmentCount) || 2)} {tt('quoteBuilder','ງວດ')} × ~{fmt(Math.floor(total / Math.max(2, Number(installmentCount) || 2)))}
          </Text>
        </View>
      )}

      {/* valid until */}
      <Text style={styles.miniLabel}>{tt('quoteBuilder','ໃຊ້ໄດ້ຮອດ (ປປປປ-ດດ-ວວ)')}</Text>
      <TextInput
        value={validUntilStr}
        onChangeText={setValidUntilStr}
        placeholder="2026-07-05"
        placeholderTextColor="#999"
        style={styles.input}
      />

      {/* save the whole draft as a personal reusable template */}
      {!!ownerId && (
        namingTpl ? (
          <View style={styles.saveTplBox}>
            <TextInput
              value={tplName}
              onChangeText={setTplName}
              placeholder={tt('quoteBuilder','ຊື່ ແມ່ແບບ (ເຊັ່ນ: ຕິດຕັ້ງ ໄຟ 2 ຈຸດ)')}
              placeholderTextColor="#999"
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable style={[styles.saveTplBtn, savingTpl && { opacity: 0.5 }]} onPress={saveTemplate} disabled={savingTpl}>
              <Text style={styles.saveTplBtnText}>{savingTpl ? '...' : tt('quoteBuilder','ບັນທຶກ')}</Text>
            </Pressable>
            <Pressable style={styles.saveTplCancel} onPress={() => { setNamingTpl(false); setTplName(''); }}>
              <Text style={styles.saveTplCancelText}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.saveTplLink} onPress={() => setNamingTpl(true)}>
            <Text style={styles.saveTplLinkText}>💾 {tt('quoteBuilder','ບັນທຶກ ໃບນີ້ ເປັນ ແມ່ແບບ')}</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 14, marginBottom: 6 },
  wtRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wtChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  wtChipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  wtChipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  wtChipTextOn: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  surveyAsk: { fontSize: 12, color: '#0066CC', fontWeight: '600', marginBottom: 6 },
  tplPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tplChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tplChipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  tplChipText: { fontSize: 12, color: '#374151' },
  tplChipTextOn: { color: '#fff', fontWeight: '700' },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  rateLabel: { fontSize: 12, color: '#6b7280', marginRight: 4 },
  star: { fontSize: 20, color: '#f59e0b' },
  rateThanks: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginLeft: 6 },
  checklist: { borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f0f9ff', borderRadius: 10, padding: 10, marginBottom: 10 },
  checkItem: { marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  boxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkLabel: { fontSize: 12, color: '#4b5563', flex: 1 },
  checkLabelOn: { color: '#111', fontWeight: '600' },
  checkNote: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 7, fontSize: 12, color: '#111', backgroundColor: '#fff', marginTop: 5, marginLeft: 28 },
  itemsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#0066CC', fontSize: 12, fontWeight: '600' },
  travelBtn: { borderWidth: 1, borderColor: '#0369a1', backgroundColor: '#f0f9ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  travelBtnText: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
  catalogBtn: { borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  catalogBtnText: { color: '#16a34a', fontSize: 12, fontWeight: '600' },
  bomBtn: { borderWidth: 1, borderColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  bomBtnText: { color: '#7c3aed', fontSize: 12, fontWeight: '600' },
  tplBtn: { borderWidth: 1, borderColor: '#0891b2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tplBtnText: { color: '#0891b2', fontSize: 12, fontWeight: '600' },
  tplBox: { borderWidth: 1, borderColor: '#cffafe', backgroundColor: '#ecfeff', borderRadius: 10, padding: 8, marginTop: 8 },
  saveTplLink: { marginTop: 12, alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 8 },
  saveTplLinkText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  saveTplBox: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 },
  saveTplBtn: { backgroundColor: '#0891b2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center' },
  saveTplBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  saveTplCancel: { paddingHorizontal: 8, paddingVertical: 10 },
  saveTplCancelText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  bomBox: { borderWidth: 1, borderColor: '#ede9fe', backgroundColor: '#faf5ff', borderRadius: 10, padding: 8, marginTop: 8 },
  shopBtn: { borderWidth: 1, borderColor: '#ca8a04', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  shopBtnText: { color: '#ca8a04', fontSize: 12, fontWeight: '600' },
  shopBox: { borderWidth: 1, borderColor: '#fef3c7', backgroundColor: '#fffbeb', borderRadius: 10, padding: 8, marginTop: 8 },
  shopTag: { fontSize: 12 },
  catalogBox: { borderWidth: 1, borderColor: '#dcfce7', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 8, marginTop: 8 },
  catalogHint: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  catalogItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e7f5ec' },
  catalogKind: { fontSize: 12, color: '#15803d', backgroundColor: '#dcfce7', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  catalogName: { fontSize: 12, color: '#111', flex: 1 },
  catalogPrice: { fontSize: 12, color: '#6b7280' },
  catalogAdd: { fontSize: 15, color: '#16a34a', fontWeight: '700', width: 20, textAlign: 'center' },
  itemCard: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fafbfc' },
  itemRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 6 },
  miniLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  rm: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  lineTotal: { fontSize: 12, color: '#0066CC', textAlign: 'right', fontWeight: '600' },
  lineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  linePhotoToggle: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  linePhotos: { marginTop: 8 },
  planRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  planChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  planChipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  planChipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  planChipTextOn: { color: '#fff' },
  planDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  planHint: { fontSize: 12, color: '#6b7280', flex: 1 },
  totals: { backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, marginTop: 12 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totLabel: { fontSize: 12, color: '#4b5563' },
  totVal: { fontSize: 12, color: '#111' },
  grandRow: { borderTopWidth: 1, borderTopColor: '#bae6fd', marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  grandVal: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
});
