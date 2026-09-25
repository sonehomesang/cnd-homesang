import { ComponentType, Suspense, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

export interface PanelTab {
  key: string;
  label: string; // Lao source (wrapped with tt here)
  Comp: ComponentType<any>;
}

/**
 * Groups several admin panels under one nav entry, switching between them with an
 * inline tab bar. Each tab renders its ORIGINAL panel component unchanged, so all
 * existing content/behaviour is preserved — this is purely a consolidation shell.
 *
 * The tab row scrolls horizontally and shows a ›/‹ hint when there are more tabs
 * off-screen, so a long tab set never silently overflows the page edge.
 */
export default function TabbedPanel({ tabs }: { tabs: PanelTab[] }) {
  const tt = useTT();
  const [active, setActive] = useState(tabs[0]?.key);
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];
  const Comp = cur?.Comp;

  // scroll-overflow hints
  const [contentW, setContentW] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [x, setX] = useState(0);
  const moreRight = contentW - boxW - x > 6;
  const moreLeft = x > 6;

  return (
    <View>
      <View style={styles.barWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContentW(w)}
          contentContainerStyle={styles.tabs}>
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <Pressable key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setActive(t.key)}>
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{tt('admHub', t.label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {moreLeft && <View style={[styles.hint, styles.hintLeft]} pointerEvents="none"><Text style={styles.hintTx}>‹</Text></View>}
        {moreRight && <View style={[styles.hint, styles.hintRight]} pointerEvents="none"><Text style={styles.hintTx}>›</Text></View>}
      </View>
      <View style={styles.body}>
        <Suspense fallback={<View style={styles.fallback}><ActivityIndicator color="#0066CC" /></View>}>
          {Comp ? <Comp /> : null}
        </Suspense>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'relative' },
  tabs: { gap: 6, paddingBottom: 14, paddingRight: 18, alignItems: 'center' },
  tab: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  tabText: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  // ›/‹ overflow hints — a soft chip at the edge so the user knows more tabs exist
  hint: { position: 'absolute', top: 0, bottom: 14, width: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.92)' },
  hintLeft: { left: 0 },
  hintRight: { right: 0 },
  hintTx: { fontSize: 15, color: '#0066CC', fontWeight: '900' },
  body: { borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14 },
  fallback: { paddingVertical: 40, alignItems: 'center' },
});
