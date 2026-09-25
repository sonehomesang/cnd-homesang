import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useServiceCategories } from '@/lib/categories';
import { useTT } from '@/lib/i18n';
import CategoryIcon from '@/components/CategoryIcon';
import SearchResults from '@/components/SearchResults';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';
import { colors, font, radius, shadow } from '@/lib/theme';

/**
 * Dedicated search screen (shop-tab 🔍 + deep links). The home screen searches
 * inline; this page reuses the same <SearchResults> panel so behaviour matches.
 */
export default function SearchScreen() {
  const tt = useTT();
  const serviceCats = useServiceCategories();
  const [q, setQ] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const searching = q.trim() !== '';

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          placeholder={tt('search', 'ຄົ້ນຫາ ສິນຄ້າ · ບໍລິການ · ຮ້ານ · ຊ່າງ · ງານ')}
          placeholderTextColor="#999"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.input}
        />
        {q !== '' && (
          <Pressable onPress={() => { setQ(''); inputRef.current?.focus(); }} hitSlop={8}><Text style={styles.clear}>✕</Text></Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.wrap}>
          {!searching ? (
            <>
              <Text style={styles.hint}>{tt('search', 'ພິມ ເພື່ອຄົ້ນຫາ ສິນຄ້າ, ບໍລິການ, ຮ້ານ, ຊ່າງ ຫຼື ງານ')}</Text>
              {serviceCats.length > 0 && (
                <>
                  <Text style={styles.section}>{tt('search', '🧰 ບໍລິການ ຍອດນິຍົມ')}</Text>
                  <View style={styles.chipWrap}>
                    {serviceCats.slice(0, 12).map((c) => (
                      <Pressable key={c.value} style={styles.chip} onPress={() => router.push(`/(tabs)/explore?cat=${c.value}` as any)}>
                        <CategoryIcon icon={c.icon} size={14} color={colors.primary} />
                        <Text style={styles.chipText}>{c.lao}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <SearchResults query={q} />
          )}

          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, margin: 14, marginBottom: 4, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  searchIcon: { fontSize: 15 },
  input: { flex: 1, paddingVertical: 10, fontSize: font.md, color: colors.text, outlineStyle: 'none' } as any,
  clear: { fontSize: 15, color: colors.text3 },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  hint: { textAlign: 'center', color: colors.text3, fontSize: font.sm, marginTop: 40 },
  section: { fontSize: font.md, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8, ...shadow.card },
  chipText: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
});
