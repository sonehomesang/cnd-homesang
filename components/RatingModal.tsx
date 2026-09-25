import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { useTT } from '@/lib/i18n';

export default function RatingModal({
  title,
  subtitle,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
}) {
  const tt = useTT();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (rating < 1) {
      setError(tt('rating', 'ເລືອກດາວ'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(rating, comment.trim());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible onClose={onClose}>
      <View>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Text style={[styles.star, n <= rating && styles.starOn]}>★</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{tt('rating', 'ຄຳເຫັນ (ບໍ່ບັງຄັບ)')}</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={tt('rating', 'ເຮັດວຽກດີ ກົງເວລາ...')}
          placeholderTextColor="#999"
          style={styles.input}
          multiline
        />

        {error !== '' && <Text style={styles.error}>❌ {error}</Text>}

        <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={submit} disabled={busy}>
          <Text style={styles.btnText}>{busy ? tt('rating', 'ກຳລັງສົ່ງ...') : tt('rating', '⭐ ສົ່ງຄະແນນ')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  close: { fontSize: 15, color: '#6b7280' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 18 },
  star: { fontSize: 15, color: '#d1d5db' },
  starOn: { color: '#f59e0b' },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', minHeight: 70, textAlignVertical: 'top' },
  error: { color: '#c00', fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: '#16a34a', borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 16 },
  btnOff: { backgroundColor: '#9fd9b3' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
