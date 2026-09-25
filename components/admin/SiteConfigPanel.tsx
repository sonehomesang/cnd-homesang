import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import { groupThousands } from '@/lib/format';
import {
  DEFAULT_SITE_CONFIG,
  saveSiteConfig,
  watchSiteConfig,
  type AssetCategory,
  type AssetParamDef,
  type ServiceRateRef,
  type SparePart,
  type TroubleItem,
  type FieldDef,
  type FieldType,
  type RoomTypeOption,
  type SectionDef,
  type SiteConfig,
} from '@/lib/siteConfig';

const TYPES: { key: FieldType; label: string }[] = [
  { key: 'text', label: 'ຂໍ້ຄວາມ' },
  { key: 'number', label: 'ຕົວເລກ' },
  { key: 'select', label: 'ເລືອກ 1' },
  { key: 'multiselect', label: 'ເລືອກ ຫຼາຍ' },
  { key: 'toggle', label: 'ຕິກ' },
];

function slug(label: string): string {
  return 'f' + Math.abs(label.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36) + Date.now().toString(36).slice(-3);
}

/** Editor for one FieldDef[] (reused for a section's fields + room fields). */
function FieldListEditor({ fields, onChange }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void }) {
  const tt = useTT();
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');

  const add = () => {
    if (!newLabel.trim()) return;
    onChange([...fields, { key: slug(newLabel), label: newLabel.trim(), type: newType }]);
    setNewLabel('');
  };
  const patch = (i: number, p: Partial<FieldDef>) => onChange(fields.map((f, idx) => idx === i ? { ...f, ...p } : f));
  const del = (i: number) => onChange(fields.filter((_, idx) => idx !== i));

  return (
    <View style={{ gap: 6 }}>
      {fields.map((f, i) => (
        <View key={f.key} style={styles.fieldRow}>
          <View style={styles.head}>
            <TextInput value={f.label} onChangeText={(t) => patch(i, { label: t })} placeholder={tt('admSiteConfig', 'ຊື່ ຊ່ອງ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
            <Text style={styles.typeTag}>{tt('admSiteConfig', TYPES.find((t) => t.key === f.type)?.label ?? f.type)}</Text>
            {f.factors?.length ? <Text style={styles.computedTag}>📐 auto</Text> : null}
            <Pressable onPress={() => del(i)} hitSlop={8}><Text style={styles.del}>🗑</Text></Pressable>
          </View>
          {f.type === 'number' && !f.factors?.length && (
            <TextInput value={f.unit ?? ''} onChangeText={(t) => patch(i, { unit: t || undefined })} placeholder={tt('admSiteConfig', 'ໜ່ວຍ (ມ, ຕ.ມ...)')} placeholderTextColor="#999" style={styles.inputSm} />
          )}
          {(f.type === 'select' || f.type === 'multiselect') && (
            <TextInput
              value={(f.options ?? []).join(', ')}
              onChangeText={(t) => patch(i, { options: t.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder={tt('admSiteConfig', 'ຕົວເລືອກ ຂັ້ນ ດ້ວຍ ,')}
              placeholderTextColor="#999"
              style={styles.inputSm}
            />
          )}
        </View>
      ))}
      <View style={styles.addField}>
        <TextInput value={newLabel} onChangeText={setNewLabel} placeholder={tt('admSiteConfig', '＋ ຊື່ ຊ່ອງ ໃໝ່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <View style={styles.typeChips}>
          {TYPES.map((t) => (
            <Pressable key={t.key} style={[styles.typeChip, newType === t.key && styles.typeChipOn]} onPress={() => setNewType(t.key)}>
              <Text style={[styles.typeChipText, newType === t.key && styles.typeChipTextOn]}>{tt('admSiteConfig', t.label)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Editor for a RoomTypeOption[] (room categories / component types). */
function TypeListEditor({ types, onChange }: { types: RoomTypeOption[]; onChange: (t: RoomTypeOption[]) => void }) {
  const tt = useTT();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const add = () => {
    if (!label.trim()) return;
    onChange([...types, { key: 't' + Date.now().toString(36), label: label.trim(), icon: icon.trim() || undefined }]);
    setLabel(''); setIcon('');
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.chipsWrap}>
        {types.map((t, i) => (
          <View key={t.key} style={styles.typePill}>
            <Text style={styles.typePillText}>{t.icon ? t.icon + ' ' : ''}{t.label}</Text>
            <Pressable onPress={() => onChange(types.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.pillX}>✕</Text></Pressable>
          </View>
        ))}
      </View>
      <View style={styles.head}>
        <TextInput value={icon} onChangeText={setIcon} placeholder="🪟" placeholderTextColor="#999" style={styles.iconInput} />
        <TextInput value={label} onChangeText={setLabel} placeholder={tt('admSiteConfig', '＋ ປະເພດ ໃໝ່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Editor for scrap-material rates (material + ກີບ/kg). */
function ScrapRatesEditor({ rates, onChange }: { rates: { material: string; ratePerKg: number }[]; onChange: (r: { material: string; ratePerKg: number }[]) => void }) {
  const tt = useTT();
  const [mat, setMat] = useState('');
  const [rate, setRate] = useState('');
  const add = () => {
    if (!mat.trim() || !rate) return;
    onChange([...rates, { material: mat.trim(), ratePerKg: Number(rate) }]);
    setMat(''); setRate('');
  };
  return (
    <View style={{ gap: 6 }}>
      {rates.map((r, i) => (
        <View key={i} style={styles.head}>
          <TextInput value={r.material} onChangeText={(t) => onChange(rates.map((x, idx) => idx === i ? { ...x, material: t } : x))} style={[styles.input, { flex: 1 }]} placeholderTextColor="#999" />
          <TextInput value={groupThousands(String(r.ratePerKg))} onChangeText={(t) => onChange(rates.map((x, idx) => idx === i ? { ...x, ratePerKg: Number(t.replace(/[^\d]/g, '')) } : x))} keyboardType="numeric" style={[styles.input, { width: 96 }]} placeholder={tt('admSiteConfig', 'ກີບ/kg')} placeholderTextColor="#999" />
          <Pressable onPress={() => onChange(rates.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.del}>🗑</Text></Pressable>
        </View>
      ))}
      <View style={styles.head}>
        <TextInput value={mat} onChangeText={setMat} placeholder={tt('admSiteConfig', '＋ ວັດສະດຸ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <TextInput value={groupThousands(rate)} onChangeText={(t) => setRate(t.replace(/[^\d]/g, ''))} placeholder={tt('admSiteConfig', 'ກີບ/kg')} placeholderTextColor="#999" keyboardType="numeric" style={[styles.input, { width: 96 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Editor for a category's factory-spec parameter template (label/unit/factory). */
function ParamTemplateEditor({ params, onChange }: { params: AssetParamDef[]; onChange: (p: AssetParamDef[]) => void }) {
  const tt = useTT();
  const [label, setLabel] = useState('');
  const add = () => { if (!label.trim()) return; onChange([...params, { key: slug(label), label: label.trim() }]); setLabel(''); };
  const patch = (i: number, p: Partial<AssetParamDef>) => onChange(params.map((x, idx) => idx === i ? { ...x, ...p } : x));
  return (
    <View style={{ gap: 6 }}>
      {params.map((p, i) => (
        <View key={p.key} style={styles.head}>
          <TextInput value={p.label} onChangeText={(t) => patch(i, { label: t })} placeholder={tt('admSiteConfig', 'ພາຣາມິເຕີ')} placeholderTextColor="#999" style={[styles.input, { flex: 1.4 }]} />
          <TextInput value={p.unit ?? ''} onChangeText={(t) => patch(i, { unit: t || undefined })} placeholder={tt('admSiteConfig', 'ໜ່ວຍ')} placeholderTextColor="#999" style={[styles.input, { width: 64 }]} />
          <TextInput value={p.factory ?? ''} onChangeText={(t) => patch(i, { factory: t || undefined })} placeholder={tt('admSiteConfig', 'ໂຮງງານ')} placeholderTextColor="#999" style={[styles.input, { width: 80 }]} />
          <Pressable onPress={() => onChange(params.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.del}>🗑</Text></Pressable>
        </View>
      ))}
      <View style={styles.head}>
        <TextInput value={label} onChangeText={setLabel} placeholder={tt('admSiteConfig', '＋ ພາຣາມິເຕີ ໃໝ່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Name/label + price rows (spare parts / service rates). */
function PriceRows({ items, field, placeholder, onChange }: { items: any[]; field: 'name' | 'label'; placeholder: string; onChange: (x: any[]) => void }) {
  const tt = useTT();
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const add = () => { if (!text.trim()) return; onChange([...items, { key: slug(text), [field]: text.trim(), price: price ? Number(price) : undefined }]); setText(''); setPrice(''); };
  const patch = (i: number, p: any) => onChange(items.map((x, idx) => idx === i ? { ...x, ...p } : x));
  return (
    <View style={{ gap: 6 }}>
      {items.map((it, i) => (
        <View key={it.key} style={styles.head}>
          <TextInput value={it[field] ?? ''} onChangeText={(t) => patch(i, { [field]: t })} placeholder={placeholder} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
          <TextInput value={it.price != null ? groupThousands(String(it.price)) : ''} onChangeText={(t) => patch(i, { price: t ? Number(t.replace(/[^\d]/g, '')) : undefined })} keyboardType="numeric" placeholder={tt('admSiteConfig', 'ລາຄາ')} placeholderTextColor="#999" style={[styles.input, { width: 92 }]} />
          <Pressable onPress={() => onChange(items.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.del}>🗑</Text></Pressable>
        </View>
      ))}
      <View style={styles.head}>
        <TextInput value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <TextInput value={groupThousands(price)} onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ''))} keyboardType="numeric" placeholder={tt('admSiteConfig', 'ລາຄາ')} placeholderTextColor="#999" style={[styles.input, { width: 92 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Troubleshooting editor: symptom → cause → fix (+ ballpark estimate). */
function TroubleEditor({ items, onChange }: { items: TroubleItem[]; onChange: (x: TroubleItem[]) => void }) {
  const tt = useTT();
  const [symptom, setSymptom] = useState('');
  const add = () => { if (!symptom.trim()) return; onChange([...items, { key: slug(symptom), symptom: symptom.trim() }]); setSymptom(''); };
  const patch = (i: number, p: Partial<TroubleItem>) => onChange(items.map((x, idx) => idx === i ? { ...x, ...p } : x));
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View key={t.key} style={styles.fieldRow}>
          <View style={styles.head}>
            <TextInput value={t.symptom} onChangeText={(v) => patch(i, { symptom: v })} placeholder={tt('admSiteConfig', 'ອາການ')} placeholderTextColor="#999" style={[styles.input, { flex: 1, fontWeight: '700' }]} />
            <Pressable onPress={() => onChange(items.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.del}>🗑</Text></Pressable>
          </View>
          <TextInput value={t.cause ?? ''} onChangeText={(v) => patch(i, { cause: v || undefined })} placeholder={tt('admSiteConfig', 'ສາເຫດ')} placeholderTextColor="#999" style={styles.inputSm} />
          <TextInput value={t.fix ?? ''} onChangeText={(v) => patch(i, { fix: v || undefined })} placeholder={tt('admSiteConfig', 'ວິທີ ແກ້')} placeholderTextColor="#999" style={styles.inputSm} />
          <TextInput value={t.est ?? ''} onChangeText={(v) => patch(i, { est: v || undefined })} placeholder={tt('admSiteConfig', 'ຄາດ ຄ່າ (~200,000–380,000 ກີບ)')} placeholderTextColor="#999" style={styles.inputSm} />
        </View>
      ))}
      <View style={styles.head}>
        <TextInput value={symptom} onChangeText={setSymptom} placeholder={tt('admSiteConfig', '＋ ອາການ ໃໝ່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

/** Editor for asset categories, each expandable to edit its fields + param template. */
function AssetCategoryEditor({ cats, onChange }: { cats: AssetCategory[]; onChange: (c: AssetCategory[]) => void }) {
  const tt = useTT();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const patch = (i: number, p: Partial<AssetCategory>) => onChange(cats.map((c, idx) => idx === i ? { ...c, ...p } : c));
  const add = () => { if (!label.trim()) return; onChange([...cats, { key: 'a' + Date.now().toString(36), label: label.trim(), icon: icon.trim() || undefined }]); setLabel(''); setIcon(''); };
  return (
    <View style={{ gap: 8 }}>
      {cats.map((c, i) => {
        const open = openKey === c.key;
        return (
          <View key={c.key} style={styles.catCard}>
            <View style={styles.head}>
              <TextInput value={c.icon ?? ''} onChangeText={(t) => patch(i, { icon: t || undefined })} placeholder="🔩" placeholderTextColor="#999" style={styles.iconInput} />
              <TextInput value={c.label} onChangeText={(t) => patch(i, { label: t })} placeholder={tt('admSiteConfig', 'ຊື່ ປະເພດ')} placeholderTextColor="#999" style={[styles.input, { flex: 1, fontWeight: '700' }]} />
              <Pressable style={styles.expandBtn} onPress={() => setOpenKey(open ? null : c.key)}>
                <Text style={styles.expandText}>{open ? '▲' : `▼ ${(c.fields?.length ?? 0)}+${(c.paramTemplate?.length ?? 0)}`}</Text>
              </Pressable>
              <Pressable onPress={() => onChange(cats.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.del}>🗑</Text></Pressable>
            </View>
            {open && (
              <View style={{ marginTop: 8, gap: 10 }}>
                <View>
                  <Text style={styles.subLabel}>{tt('admSiteConfig', 'ຊ່ອງ ຂໍ້ມູນ (ຕໍ່ ປະເພດ)')}</Text>
                  <FieldListEditor fields={c.fields ?? []} onChange={(fields) => patch(i, { fields })} />
                </View>
                <View>
                  <Text style={styles.subLabel}>📐 {tt('admSiteConfig', 'ພາຣາມິເຕີ template (ຄ່າ ໂຮງງານ)')}</Text>
                  <ParamTemplateEditor params={c.paramTemplate ?? []} onChange={(paramTemplate) => patch(i, { paramTemplate })} />
                </View>
                <View>
                  <Text style={styles.subLabel}>🔧 {tt('admSiteConfig', 'ອາໄລ່ + ລາຄາ ອ້າງ ອີງ')}</Text>
                  <PriceRows items={c.spareParts ?? []} field="name" placeholder={tt('admSiteConfig', 'ຊື່ ອາໄລ່')} onChange={(spareParts) => patch(i, { spareParts: spareParts as SparePart[] })} />
                </View>
                <View>
                  <Text style={styles.subLabel}>💵 {tt('admSiteConfig', 'ອັດຕາ ຄ່າ ບໍລິການ')}</Text>
                  <PriceRows items={c.serviceRates ?? []} field="label" placeholder={tt('admSiteConfig', 'ບໍລິການ')} onChange={(serviceRates) => patch(i, { serviceRates: serviceRates as ServiceRateRef[] })} />
                </View>
                <View>
                  <Text style={styles.subLabel}>🩺 {tt('admSiteConfig', 'ແກ້ ບັນຫາ (ອາການ→ສາເຫດ→ວິທີ)')}</Text>
                  <TroubleEditor items={c.troubleshooting ?? []} onChange={(troubleshooting) => patch(i, { troubleshooting })} />
                </View>
              </View>
            )}
          </View>
        );
      })}
      <View style={styles.head}>
        <TextInput value={icon} onChangeText={setIcon} placeholder="🔩" placeholderTextColor="#999" style={styles.iconInput} />
        <TextInput value={label} onChangeText={setLabel} placeholder={tt('admSiteConfig', '＋ ປະເພດ ໃໝ່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>{tt('admSiteConfig', 'ເພີ່ມ')}</Text></Pressable>
      </View>
    </View>
  );
}

export default function SiteConfigPanel() {
  const tt = useTT();
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => watchSiteConfig((c) => setCfg((prev) => (prev && dirty ? prev : c))), [dirty]);

  if (!cfg) return <Text style={{ padding: 20, color: colors.text2 }}>{tt('admSiteConfig', 'ກຳລັງໂຫຼດ...')}</Text>;

  const update = (next: Partial<SiteConfig>) => { setCfg({ ...cfg, ...next }); setDirty(true); setStatus(''); };
  const patchSection = (i: number, p: Partial<SectionDef>) => update({ sections: cfg.sections.map((s, idx) => idx === i ? { ...s, ...p } : s) });

  const save = async () => {
    setStatus('saving');
    try { await saveSiteConfig(cfg); setDirty(false); setStatus('saved'); } catch (e: any) { setStatus('err:' + (e?.message ?? e)); }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.h1}>⚙️ {tt('admSiteConfig', 'ໂຄງ ຂໍ້ມູນ ອາຄານ (ເພີ່ມ ໝວດ / ຊ່ອງ ເອງ)')}</Text>
      <Text style={styles.sub}>{tt('admSiteConfig', 'ໝວດ + ຊ່ອງ ທີ່ ນິຍາມ ບ່ອນ ນີ້ ຈະ ຂຶ້ນ ໃນ ຟອມ ສ້າງ ສະຖານທີ່ + Dossier ອັດຕະໂນມັດ')}</Text>

      {/* site-level sections */}
      {cfg.sections.map((sec, i) => (
        <View key={sec.key} style={styles.secCard}>
          <View style={styles.head}>
            <TextInput value={sec.icon ?? ''} onChangeText={(t) => patchSection(i, { icon: t || undefined })} placeholder="🔧" placeholderTextColor="#999" style={styles.iconInput} />
            <TextInput value={sec.label} onChangeText={(t) => patchSection(i, { label: t })} placeholder={tt('admSiteConfig', 'ຊື່ ໝວດ')} placeholderTextColor="#999" style={[styles.input, { flex: 1, fontWeight: '700' }]} />
            <Pressable onPress={() => update({ sections: cfg.sections.filter((_, idx) => idx !== i) })} hitSlop={8}><Text style={styles.del}>🗑</Text></Pressable>
          </View>
          <FieldListEditor fields={sec.fields} onChange={(fields) => patchSection(i, { fields })} />
        </View>
      ))}
      <Pressable style={styles.addSec} onPress={() => update({ sections: [...cfg.sections, { key: 'sec' + Date.now().toString(36), label: 'ໝວດ ໃໝ່', icon: '🧱', fields: [] }] })}>
        <Text style={styles.addSecText}>＋ {tt('admSiteConfig', 'ເພີ່ມ ໝວດ ໃໝ່ (ເຊັ່ນ ກຳແພງ / ຮົ້ວ)')}</Text>
      </Pressable>

      {/* room field template */}
      <View style={[styles.secCard, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}>
        <Text style={styles.secLabel}>🚪 {tt('admSiteConfig', 'ຊ່ອງ ຂໍ້ມູນ ຫ້ອງ (ທຸກ ຫ້ອງ ໃຊ້ template ນີ້)')}</Text>
        <Text style={styles.note}>📐 {tt('admSiteConfig', 'ເນື້ອທີ່/ບໍລິມາດ ຄຳນວນ ອັດຕະໂນມັດ (auto) — ບໍ່ ຕ້ອງ ແກ້')}</Text>
        <FieldListEditor fields={cfg.roomFields} onChange={(roomFields) => update({ roomFields })} />
      </View>

      {/* room component types (Phase 2) */}
      <View style={[styles.secCard, { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' }]}>
        <Text style={styles.secLabel}>🧩 {tt('admSiteConfig', 'ປະເພດ ອົງປະກອບ ຫ້ອງ')}</Text>
        <Text style={styles.note}>{tt('admSiteConfig', 'ພື້ນ · ຝາ · ແພດານ · ປະຕູ ... admin ເພີ່ມ ໄດ້ (ເຊັ່ນ ບັນໄດ)')}</Text>
        <TypeListEditor types={cfg.componentTypes} onChange={(componentTypes) => update({ componentTypes })} />
      </View>

      {/* component field template (Phase 2) */}
      <View style={[styles.secCard, { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' }]}>
        <Text style={styles.secLabel}>🧱 {tt('admSiteConfig', 'ຊ່ອງ ຂໍ້ມູນ ອົງປະກອບ')}</Text>
        <Text style={styles.note}>{tt('admSiteConfig', 'ວັດສະດຸ · ສະພາບ · ຈຳນວນ ... ໃຊ້ ກັບ ທຸກ ອົງປະກອບ')}</Text>
        <FieldListEditor fields={cfg.componentFields} onChange={(componentFields) => update({ componentFields })} />
      </View>

      {/* asset categories + per-category fields & param template (Phase 3+) */}
      <View style={[styles.secCard, { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' }]}>
        <Text style={styles.secLabel}>🔩 {tt('admSiteConfig', 'ປະເພດ ຊັບສິນ (ຊ່ອງ + param ຕໍ່ ປະເພດ)')}</Text>
        <Text style={styles.note}>{tt('admSiteConfig', 'ກົດ ▼ ເພື່ອ ຕັ້ງ ຊ່ອງ (ເຊັ່ນ ແອ → Inverter/Refrigerant) + ຄ່າ ໂຮງງານ ຂອງ ແຕ່ລະ ປະເພດ')}</Text>
        <AssetCategoryEditor cats={cfg.assetCategories} onChange={(assetCategories) => update({ assetCategories })} />
      </View>

      {/* scrap rates (Phase 3) */}
      <View style={[styles.secCard, { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' }]}>
        <Text style={styles.secLabel}>📊 {tt('admSiteConfig', 'ອັດຕາ ລາຄາ ເສດ (ວັດສະດຸ · ກີບ/kg)')}</Text>
        <Text style={styles.note}>{tt('admSiteConfig', 'ໃຊ້ ຕອນ "ຕີ ລາຄາ ເສດ" ແບບ ອ້າງ ອີງ (ວັດສະດຸ × ນ້ຳໜັກ)')}</Text>
        <ScrapRatesEditor rates={cfg.scrapRates} onChange={(scrapRates) => update({ scrapRates })} />
      </View>

      {/* common asset fields — apply to EVERY category (Phase 3) */}
      <View style={[styles.secCard, { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' }]}>
        <Text style={styles.secLabel}>🧱 {tt('admSiteConfig', 'ຊ່ອງ ລວມ (ທຸກ ປະເພດ ຊັບສິນ)')}</Text>
        <Text style={styles.note}>{tt('admSiteConfig', 'ແຮງດັນ ... ຂຶ້ນ ກັບ ທຸກ ປະເພດ (ຊ່ອງ ສະເພາະ ຕັ້ງ ຢູ່ ແຕ່ລະ ປະເພດ ຂ້າງ ເທິງ)')}</Text>
        <FieldListEditor fields={cfg.assetFields} onChange={(assetFields) => update({ assetFields })} />
      </View>

      {!!status && status !== 'saving' && (
        <Text style={[styles.status, status.startsWith('err') && { color: colors.error }]}>
          {status === 'saved' ? tt('admSiteConfig', '✅ ບັນທຶກ ແລ້ວ') : status}
        </Text>
      )}
      <View style={styles.head}>
        <Pressable style={[styles.saveBtn, !dirty && { opacity: 0.5 }]} onPress={save} disabled={!dirty || status === 'saving'}>
          <Text style={styles.saveBtnText}>{status === 'saving' ? tt('admSiteConfig', 'ກຳລັງ ບັນທຶກ...') : tt('admSiteConfig', '💾 ບັນທຶກ ໂຄງ')}</Text>
        </Pressable>
        <Pressable style={styles.resetBtn} onPress={() => update({ ...DEFAULT_SITE_CONFIG })}>
          <Text style={styles.resetText}>↺ {tt('admSiteConfig', 'ຄ່າ ເລີ່ມຕົ້ນ')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.xs, color: colors.text2 },
  secCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, gap: 8 },
  secLabel: { fontSize: font.sm, fontWeight: '800', color: colors.text },
  note: { fontSize: font.xs, color: '#059669' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.sm, color: colors.text, backgroundColor: colors.surface },
  inputSm: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 6, fontSize: font.xs, color: colors.text, backgroundColor: '#fafafa', marginTop: 4 },
  iconInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.md, width: 46, textAlign: 'center', backgroundColor: colors.surface },
  fieldRow: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, padding: 8 },
  typeTag: { fontSize: 12, fontWeight: '700', color: '#3730a3', backgroundColor: '#eef2ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12 },
  computedTag: { fontSize: 12, fontWeight: '700', color: '#1e40af' },
  del: { fontSize: 15 },
  addField: { backgroundColor: '#eff6ff', borderRadius: radius.md, padding: 8, gap: 6 },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  typeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  typeChipTextOn: { color: colors.white },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  typePillText: { fontSize: 12, fontWeight: '700', color: '#5b21b6' },
  pillX: { fontSize: 12, color: '#9ca3af', fontWeight: '700' },
  catCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1fae5', borderRadius: radius.md, padding: 8 },
  expandBtn: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#ecfdf5', borderRadius: radius.sm },
  expandText: { fontSize: 12, fontWeight: '700', color: '#065f46' },
  subLabel: { fontSize: font.xs, fontWeight: '800', color: '#334155', marginBottom: 4 },
  addSec: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.lg, padding: 12, alignItems: 'center' },
  addSecText: { color: colors.primary, fontWeight: '700', fontSize: font.sm },
  status: { fontSize: font.sm, color: '#059669', fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: colors.primary, padding: 13, borderRadius: radius.md, alignItems: 'center' },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: font.md },
  resetBtn: { padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  resetText: { color: colors.text2, fontWeight: '600', fontSize: font.sm },
});
