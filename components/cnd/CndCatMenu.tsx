import { useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cnd } from '@/lib/cnd/theme';
import { catChildren, catProductCount, type CndCategory, type CndProduct } from '@/lib/cnd/catalog';
import { useTT } from '@/lib/i18n';

/**
 * dohome-style burger / category menu — a slide-in drawer showing the full
 * category tree (main → sub → sub2) as expandable accordions. Tapping a category
 * filters the storefront to it (and all its descendants) and closes.
 */
export default function CndCatMenu({ visible, cats, products, selected, onSelect, onClose }: {
  visible: boolean; cats: CndCategory[]; products: CndProduct[];
  selected: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const tt = useTT();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const pick = (id: string) => { onSelect(id); onClose(); };

  const node = (c: CndCategory, depth: number): ReactElement => {
    const kids = catChildren(cats, c.id);
    const cnt = catProductCount(cats, products, c.id);
    const isOpen = !!open[c.id];
    const on = selected === c.id;
    return (
      <View key={c.id}>
        <View style={[styles.row, on && styles.rowOn]}>
          <Pressable style={styles.rowMain} onPress={() => (kids.length ? toggle(c.id) : pick(c.id))}>
            <Text style={{ width: depth * 16 }} />
            <Text style={styles.icon}>{depth > 0 ? '↳ ' : ''}{c.icon ?? '📦'}</Text>
            <Text style={[styles.name, depth === 0 && styles.nameMain, on && styles.nameOn]} numberOfLines={1}>{c.name}</Text>
            {cnt > 0 && <Text style={styles.cnt}>{cnt}</Text>}
            {kids.length > 0 && <Text style={styles.arw}>{isOpen ? '▾' : '▸'}</Text>}
          </Pressable>
          {kids.length > 0 && <Pressable style={styles.allBtn} onPress={() => pick(c.id)}><Text style={styles.allTx}>{tt('cndStore', 'ເບິ່ງ ໝົດ')}</Text></Pressable>}
        </View>
        {kids.length > 0 && isOpen && kids.map((k) => node(k, depth + 1))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.headTx}>🧭 {tt('cndStore', 'ໝວດ ສິນຄ້າ')}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.x}>✕</Text></Pressable>
          </View>
          <ScrollView>
            <Pressable style={[styles.row, selected === 'all' && styles.rowOn]} onPress={() => pick('all')}>
              <Text style={styles.icon}>🏬</Text><Text style={[styles.name, styles.nameMain, selected === 'all' && styles.nameOn]}>{tt('cndStore', 'ສິນຄ້າ ທັງ ໝົດ')}</Text>
            </Pressable>
            {catChildren(cats, null).map((c) => node(c, 0))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(10,16,26,.45)', flexDirection: 'row' },
  drawer: { width: '86%', maxWidth: 360, backgroundColor: cnd.surface, flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.steel, paddingHorizontal: 15, paddingVertical: 13 },
  headTx: { color: cnd.white, fontSize: 15, fontWeight: '900' },
  x: { color: cnd.white, fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: cnd.line, paddingRight: 10 },
  rowOn: { backgroundColor: cnd.brandSoft },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingLeft: 15 },
  icon: { fontSize: 15 },
  name: { flex: 1, fontSize: 13.5, color: cnd.ink2, fontWeight: '600' },
  nameMain: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  nameOn: { color: cnd.brandDark },
  cnt: { fontSize: 12, color: cnd.ink3, fontWeight: '700' },
  arw: { fontSize: 13, color: cnd.ink3, width: 16, textAlign: 'center' },
  allBtn: { backgroundColor: cnd.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  allTx: { fontSize: 12, fontWeight: '800', color: cnd.brandDark },
});
