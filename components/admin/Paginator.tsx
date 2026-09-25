import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

/**
 * Client-side pagination for admin lists: returns the current page slice plus
 * a ready-to-render prev/next bar, so a panel shows one page (no long scroll).
 */
export function usePaged<T>(all: T[], pageSize = 8) {
  const tt = useTT();
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [all.length]); // reset on filter/tab change

  const total = Math.max(1, Math.ceil(all.length / pageSize));
  const cur = Math.min(page, total - 1);
  const items = all.slice(cur * pageSize, cur * pageSize + pageSize);

  const bar =
    total > 1 ? (
      <View style={styles.bar}>
        <Pressable style={[styles.btn, cur === 0 && styles.dis]} disabled={cur === 0} onPress={() => setPage(cur - 1)}>
          <Text style={[styles.btnText, cur === 0 && styles.disText]}>{tt('admPaginator','◀ ກ່ອນ')}</Text>
        </Pressable>
        <Text style={styles.info}>{tt('admPaginator','ໜ້າ')} {cur + 1}/{total} · {all.length} {tt('admPaginator','ລາຍການ')}</Text>
        <Pressable style={[styles.btn, cur >= total - 1 && styles.dis]} disabled={cur >= total - 1} onPress={() => setPage(cur + 1)}>
          <Text style={[styles.btnText, cur >= total - 1 && styles.disText]}>{tt('admPaginator','ຕໍ່ໄປ ▶')}</Text>
        </Pressable>
      </View>
    ) : null;

  return { items, bar, page: cur, total, setPage };
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, marginBottom: 6 },
  btn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  dis: { backgroundColor: '#e5e7eb' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disText: { color: '#9ca3af' },
  info: { fontSize: 12, color: '#6b7280' },
});
