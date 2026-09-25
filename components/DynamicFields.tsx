import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppSwitch from '@/components/AppSwitch';
import { colors, font, radius } from '@/lib/theme';
import { computeValue, isComputed, type FieldDef } from '@/lib/siteConfig';
import { groupThousands, isMoneyField } from '@/lib/format';

/**
 * Renders an editable form for a schema-driven FieldDef[] against a `values`
 * object. Computed fields (area/volume) show read-only, auto-derived. Used by
 * the site registry form, the room editor, and anywhere admin-defined fields
 * need editing — so a new field/category needs zero UI code.
 */
export default function DynamicFields({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
  const set = (key: string, v: any) => onChange({ ...values, [key]: v });

  return (
    <View style={{ gap: 2 }}>
      {fields.map((f) => {
        if (isComputed(f)) {
          const v = computeValue(f, values);
          return (
            <View key={f.key} style={styles.computedRow}>
              <Text style={styles.computedLabel}>📐 {f.label}</Text>
              <Text style={styles.computedVal}>
                {v === undefined ? '—' : `${v}${f.unit ? ' ' + f.unit : ''}`}
              </Text>
            </View>
          );
        }

        if (f.type === 'toggle') {
          return (
            <View key={f.key} style={styles.toggleRow}>
              <Text style={styles.label}>{f.label}</Text>
              <AppSwitch value={!!values[f.key]} onValueChange={(b) => set(f.key, b)} />
            </View>
          );
        }

        if (f.type === 'select') {
          return (
            <View key={f.key} style={styles.block}>
              <Text style={styles.label}>{f.label}</Text>
              <View style={styles.chips}>
                {(f.options ?? []).map((opt) => {
                  const on = values[f.key] === opt;
                  return (
                    <Pressable key={opt} style={[styles.chip, on && styles.chipOn]} onPress={() => set(f.key, on ? undefined : opt)}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }

        if (f.type === 'multiselect') {
          const arr: string[] = Array.isArray(values[f.key]) ? values[f.key] : [];
          const toggle = (opt: string) => set(f.key, arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
          return (
            <View key={f.key} style={styles.block}>
              <Text style={styles.label}>{f.label}</Text>
              <View style={styles.chips}>
                {(f.options ?? []).map((opt) => {
                  const on = arr.includes(opt);
                  return (
                    <Pressable key={opt} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(opt)}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }

        // number | text — a number whose wording says "money" (ລາຄາ/ມູນຄ່າ/ເງິນ/
        // ກີບ…) groups its thousands live; a plain measurement keeps decimals.
        const money = f.type === 'number' && isMoneyField(f.key, f.label, f.unit);
        const raw = values[f.key] !== undefined && values[f.key] !== null ? String(values[f.key]) : '';
        return (
          <View key={f.key} style={styles.block}>
            <Text style={styles.label}>{f.label}{f.unit ? ` (${f.unit})` : ''}</Text>
            <TextInput
              value={money ? groupThousands(raw) : raw}
              onChangeText={(t) => set(f.key, f.type === 'number'
                ? (t === '' ? undefined : Number(t.replace(money ? /[^\d]/g : /[^\d.]/g, '')))
                : t)}
              keyboardType={f.type === 'number' ? 'numeric' : 'default'}
              placeholder={f.type === 'number' ? '0' : '—'}
              placeholderTextColor="#999"
              style={styles.input}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 8 },
  label: { fontSize: font.xs, color: colors.text2, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  chipTextOn: { color: colors.white },
  computedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  computedLabel: { fontSize: font.xs, fontWeight: '700', color: '#1e40af' },
  computedVal: { fontSize: font.sm, fontWeight: '800', color: '#1e3a8a' },
});
