import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

export default function LanguageSwitcher() {
  const { lang, setLang, langs } = useLang();
  return (
    <View style={styles.row}>
      {langs.map((l) => (
        <Pressable
          key={l.code}
          style={[styles.btn, lang === l.code && styles.btnOn]}
          onPress={() => setLang(l.code)}>
          <Text style={[styles.text, lang === l.code && styles.textOn]}>
            {l.flag} {l.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface2, borderRadius: radius.full, padding: 3 },
  btn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.full },
  btnOn: { backgroundColor: colors.primary },
  text: { fontSize: font.sm, color: colors.text2, fontWeight: '600' },
  textOn: { color: '#fff' },
});
