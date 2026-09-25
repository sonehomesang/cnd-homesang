import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CategoryIcon, { VECTOR_PREFIX } from './CategoryIcon';
import { useTT } from '@/lib/i18n';

// Vector icons: pull VALID names straight from the bundled glyph map, keep the
// ones relevant to construction/home/hardware/services. Stored as "mci:<name>".
const MCI_KEYWORDS = [
  'wrench', 'hammer', 'screw', 'saw', 'tool', 'ladder', 'nail', 'axe', 'drill', 'pliers', 'nut', 'cog', 'magnet',
  'water', 'pipe', 'shower', 'toilet', 'bath', 'faucet', 'tap', 'valve', 'pump', 'hydro',
  'air-condition', 'snowflake', 'fire', 'thermometer', 'fan', 'weather', 'heat', 'radiator',
  'light', 'lamp', 'power', 'plug', 'socket', 'lightning', 'flash', 'battery', 'solar', 'transmission', 'electric', 'led',
  'wall', 'floor', 'home', 'house', 'office-building', 'warehouse', 'store', 'factory', 'school', 'hospital', 'city', 'crane', 'excavat', 'bulldoz', 'dump-truck', 'hard-hat', 'roofing', 'stairs', 'window', 'door', 'garage', 'fence', 'gate',
  'paint', 'brush', 'palette', 'roller', 'spray', 'format-color', 'texture',
  'broom', 'vacuum', 'bucket', 'trash', 'recycle', 'bottle-tonic', 'liquid-spot',
  'tree', 'flower', 'grass', 'leaf', 'sprout', 'nature', 'shovel', 'watering', 'pine', 'shovel', 'pot',
  'sofa', 'bed', 'mirror', 'chair', 'table-furniture', 'desk', 'dresser', 'wardrobe', 'curtain', 'fridge', 'stove', 'washing', 'microwave', 'television', 'oven', 'blender', 'toaster', 'kettle', 'iron',
  'shield', 'lock', 'key', 'cctv', 'camera', 'security', 'safe', 'extinguisher', 'alarm', 'bell',
  'package', 'truck', 'delivery', 'cart', 'moped', 'motorbike', 'dolly', 'cube', 'layers', 'ruler', 'compass', 'pencil', 'clipboard', 'map-marker', 'speaker', 'antenna', 'radio-tower', 'phone', 'cellphone', 'router',
];
const VECTOR_ICONS: string[] = (() => {
  const all = Object.keys(MaterialCommunityIcons.glyphMap);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of all) {
    if (MCI_KEYWORDS.some((k) => n.includes(k)) && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
})();

// Curated icons for construction / home services / hardware & materials.
const ICONS: { ic: string; kw: string }[] = [
  // electrical / lighting / tech
  { ic: '⚡', kw: 'electric ໄຟຟ້າ power' },
  { ic: '💡', kw: 'light bulb ໄຟ ຫຼອດ' },
  { ic: '🔌', kw: 'plug socket ປລັກ' },
  { ic: '🔋', kw: 'battery ແບັດ' },
  { ic: '🔦', kw: 'torch ໄຟສາຍ flashlight' },
  { ic: '🕯️', kw: 'candle ທຽນ' },
  { ic: '🪫', kw: 'battery low ແບັດ' },
  { ic: '🔔', kw: 'bell ກະດິ່ງ doorbell' },
  { ic: '🚨', kw: 'alarm ສັນຍານ siren' },
  { ic: '📡', kw: 'antenna satellite ຈານ' },
  { ic: '📺', kw: 'tv ໂທລະທັດ' },
  { ic: '📻', kw: 'radio ວິທະຍຸ' },
  { ic: '🔊', kw: 'speaker ລຳໂພງ sound' },
  { ic: '🎛️', kw: 'control panel ຄວບຄຸມ' },
  { ic: '💻', kw: 'computer ຄອມ laptop' },
  { ic: '🖥️', kw: 'monitor ຈໍ desktop' },
  { ic: '📱', kw: 'phone ໂທລະສັບ mobile' },
  { ic: '☎️', kw: 'telephone ໂທລະສັບ' },
  { ic: '🔭', kw: 'telescope ກ້ອງ' },
  // plumbing / water / sanitary
  { ic: '💧', kw: 'water ນ້ຳ ປະປາ plumbing' },
  { ic: '🚰', kw: 'tap water ກ໊ອກນ້ຳ' },
  { ic: '🚿', kw: 'shower ຝັກບົວ' },
  { ic: '🛁', kw: 'bath ອ່າງ' },
  { ic: '🚽', kw: 'toilet ສຸຂະພັນ ໂຖ' },
  { ic: '🧻', kw: 'tissue paper ເຈ້ຍ' },
  { ic: '🪠', kw: 'plunger ດູດ' },
  { ic: '💦', kw: 'water drops ນ້ຳ' },
  { ic: '🌊', kw: 'wave water ນ້ຳ' },
  // climate / ac / heat
  { ic: '❄️', kw: 'ac cold ແອ ເຢັນ cooling' },
  { ic: '🌡️', kw: 'temperature ອຸນຫະພູມ' },
  { ic: '🔥', kw: 'fire heat ໄຟ ຄວາມຮ້ອນ' },
  { ic: '☀️', kw: 'sun solar ແສງ ໂຊລ້າ' },
  { ic: '💨', kw: 'air wind ລົມ ພັດລົມ' },
  { ic: '🌀', kw: 'fan spiral ພັດ' },
  { ic: '🌬️', kw: 'wind blow ລົມ' },
  { ic: '🧊', kw: 'ice glass ນ້ຳກ້ອນ ແກ້ວ' },
  { ic: '♨️', kw: 'hot steam ຮ້ອນ' },
  // construction / materials
  { ic: '🏗️', kw: 'construction ກໍ່ສ້າງ crane' },
  { ic: '🧱', kw: 'brick ດິນຈີ່ wall ກຳແພງ' },
  { ic: '🪵', kw: 'wood ໄມ້ log timber' },
  { ic: '🪨', kw: 'rock stone ຫີນ' },
  { ic: '⛰️', kw: 'mountain ພູ stone' },
  { ic: '🧊', kw: 'glass ແກ້ວ block' },
  { ic: '🚧', kw: 'barrier ກັ້ນ roadwork' },
  { ic: '🏚️', kw: 'old house ເຮືອນເກົ່າ ໂຮມ' },
  { ic: '🪟', kw: 'window ປ່ອງຢ້ຽມ glass ຕົກແຕ່ງ' },
  { ic: '🚪', kw: 'door ປະຕູ' },
  { ic: '🪜', kw: 'ladder ຂັ້ນໄດ' },
  { ic: '🧗', kw: 'climb ປີນ' },
  // tools / hardware
  { ic: '🧰', kw: 'toolbox ກ່ອງເຄື່ອງມື' },
  { ic: '🛠️', kw: 'tools ເຄື່ອງມື' },
  { ic: '⚒️', kw: 'hammer pick ເຄື່ອງມື' },
  { ic: '🔧', kw: 'wrench ກະແຈ spanner' },
  { ic: '🔨', kw: 'hammer ຄ້ອນ carpenter ຊ່າງໄມ້' },
  { ic: '🪛', kw: 'screwdriver ໄຂຄວງ' },
  { ic: '🔩', kw: 'bolt nut ນັອດ screw metal ໂລຫະ' },
  { ic: '🪚', kw: 'saw ເລື່ອຍ' },
  { ic: '🪓', kw: 'axe ຂວານ' },
  { ic: '⛏️', kw: 'pick ຈົກ' },
  { ic: '🪝', kw: 'hook ຕະຂໍ' },
  { ic: '⚙️', kw: 'gear ເຟືອງ' },
  { ic: '🧲', kw: 'magnet ແມ່ເຫຼັກ' },
  { ic: '🔗', kw: 'chain link ໂສ້' },
  { ic: '⛓️', kw: 'chains ໂສ້' },
  { ic: '🪤', kw: 'trap ກັບ' },
  { ic: '✂️', kw: 'scissors ກັນໄກ cut' },
  { ic: '🔪', kw: 'knife ມີດ blade' },
  // measure / plan
  { ic: '📐', kw: 'ruler ໄມ້ບັນທັດ triangle measure' },
  { ic: '📏', kw: 'ruler measure ວັດແທກ straight' },
  { ic: '🧮', kw: 'abacus ຄິດໄລ່' },
  { ic: '📋', kw: 'clipboard ໃບງານ survey ສຳຫຼວດ' },
  { ic: '📝', kw: 'note ຂຽນ document' },
  { ic: '✏️', kw: 'pencil ດິນສໍ draw' },
  { ic: '🗺️', kw: 'map ແຜນທີ່' },
  { ic: '🧭', kw: 'compass ເຂັມທິດ' },
  // paint / decoration
  { ic: '🎨', kw: 'paint ສີ ທາສີ palette' },
  { ic: '🖌️', kw: 'brush ແປງ paint' },
  { ic: '🖍️', kw: 'crayon ສີ' },
  { ic: '🖼️', kw: 'frame ຮູບ decoration ຕົກແຕ່ງ' },
  { ic: '🪞', kw: 'mirror ແວ່ນ ກະຈົກ' },
  { ic: '🏮', kw: 'lantern ໂຄມ' },
  { ic: '🎀', kw: 'ribbon ໂບ decoration' },
  { ic: '🪅', kw: 'decoration ຕົກແຕ່ງ' },
  { ic: '💐', kw: 'flowers ດອກໄມ້' },
  // cleaning
  { ic: '✨', kw: 'clean ສະອາດ sparkle' },
  { ic: '🧹', kw: 'broom ໄມ້ກວາດ clean' },
  { ic: '🧽', kw: 'sponge ຟອງນ້ຳ' },
  { ic: '🧴', kw: 'bottle ນ້ຳຢາ soap' },
  { ic: '🧼', kw: 'soap ສະບູ' },
  { ic: '🪣', kw: 'bucket ຖັງ' },
  { ic: '🧯', kw: 'extinguisher ດັບເພີງ' },
  { ic: '🗑️', kw: 'trash ຂີ້ເຫຍື້ອ bin' },
  // garden / outdoor
  { ic: '🌿', kw: 'garden ສວນ plant ພືດ' },
  { ic: '🌳', kw: 'tree ຕົ້ນໄມ້' },
  { ic: '🌲', kw: 'pine tree ຕົ້ນໄມ້' },
  { ic: '🪴', kw: 'potted plant ຕົ້ນໄມ້ ກະຖາງ' },
  { ic: '🌻', kw: 'flower ດອກໄມ້ sun' },
  { ic: '🌷', kw: 'tulip ດອກໄມ້' },
  { ic: '🍃', kw: 'leaves ໃບໄມ້' },
  { ic: '🌾', kw: 'grain ເຂົ້າ rice' },
  { ic: '🚜', kw: 'tractor ລົດໄຖ farm' },
  // furniture / home
  { ic: '🪑', kw: 'chair ຕັ່ງ furniture ເຟີນິເຈີ' },
  { ic: '🛋️', kw: 'sofa ໂຊຟາ couch furniture' },
  { ic: '🛏️', kw: 'bed ຕຽງ bedroom' },
  { ic: '🗄️', kw: 'cabinet ຕູ້ drawer' },
  { ic: '🚪', kw: 'door wardrobe ຕູ້' },
  { ic: '🧺', kw: 'basket ກະຕ່າ laundry' },
  { ic: '🪟', kw: 'curtain ຜ້າມ່ານ window' },
  // kitchen / appliances
  { ic: '🍽️', kw: 'plate kitchen ຄົວ dish' },
  { ic: '🥄', kw: 'spoon ບ່ວງ' },
  { ic: '🍴', kw: 'fork knife ຄົວ' },
  { ic: '🫙', kw: 'jar ຂວດ' },
  { ic: '🧊', kw: 'fridge ຕູ້ເຢັນ ice' },
  { ic: '⏲️', kw: 'timer ໂມງ' },
  // buildings
  { ic: '🏠', kw: 'house ເຮືອນ home' },
  { ic: '🏡', kw: 'house garden ເຮືອນ' },
  { ic: '🏢', kw: 'building ຕຶກ ອາຄານ office' },
  { ic: '🏬', kw: 'store ຫ້າງ mall ຮ້ານ' },
  { ic: '🏪', kw: 'shop ຮ້ານ store' },
  { ic: '🏭', kw: 'factory ໂຮງງານ' },
  { ic: '🏘️', kw: 'houses ໝູ່ບ້ານ village' },
  { ic: '🏫', kw: 'school ໂຮງຮຽນ institution ສະຖາບັນ' },
  { ic: '🏥', kw: 'hospital ໂຮງໝໍ clinic' },
  { ic: '🏨', kw: 'hotel ໂຮງແຮມ' },
  { ic: '🏛️', kw: 'institution ສະຖາບັນ government' },
  { ic: '🌉', kw: 'bridge ຂົວ' },
  // safety / security
  { ic: '🦺', kw: 'safety vest ເສື້ອກັນໄພ' },
  { ic: '⛑️', kw: 'helmet ໝວກ safety' },
  { ic: '🪖', kw: 'helmet ໝວກ' },
  { ic: '🛡️', kw: 'shield ປ້ອງກັນ protect' },
  { ic: '🔒', kw: 'lock ລັອກ ກະແຈ security' },
  { ic: '🔑', kw: 'key ກະແຈ' },
  { ic: '🗝️', kw: 'key ກະແຈ old' },
  { ic: '⚠️', kw: 'warning ເຕືອນ' },
  { ic: '📹', kw: 'cctv camera ກ້ອງ security' },
  { ic: '📷', kw: 'camera ກ້ອງຖ່າຍຮູບ' },
  // vehicles / delivery / products
  { ic: '📦', kw: 'box ກ່ອງ product ສິນຄ້າ parcel' },
  { ic: '🏷️', kw: 'tag price ປ້າຍ label' },
  { ic: '🚚', kw: 'truck ລົດ ຂົນສົ່ງ delivery' },
  { ic: '🚛', kw: 'truck ລົດໃຫຍ່ lorry' },
  { ic: '🛵', kw: 'scooter ລົດ delivery' },
  { ic: '🏍️', kw: 'motorbike ລົດຈັກ' },
  { ic: '🛻', kw: 'pickup ລົດກະບະ' },
  { ic: '🛒', kw: 'cart ກະຕ່າ shopping ຊື້' },
  { ic: '💰', kw: 'money ເງິນ price' },
  // misc
  { ic: '🔧', kw: 'repair ສ້ອມ maintenance' },
  { ic: '🧵', kw: 'thread ດ້າຍ sewing' },
  { ic: '🪡', kw: 'needle ເຂັມ' },
  { ic: '🧶', kw: 'yarn ດ້າຍ' },
  { ic: '🔖', kw: 'bookmark ປ້າຍ tag' },
];

/** Emoji palette for picking a category icon. Click to set; supports search. */
export default function IconPicker({ value, onPick }: { value?: string; onPick: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'vector'>('emoji');
  const [q, setQ] = useState('');
  const tt = useTT();
  const emojiShown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ICONS.filter((i) => i.kw.toLowerCase().includes(s) || i.ic === s) : ICONS;
  }, [q]);
  const vectorShown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? VECTOR_ICONS.filter((n) => n.includes(s)) : VECTOR_ICONS;
    return list.slice(0, 240); // cap render (ScrollView isn't virtualized) — search narrows
  }, [q]);
  return (
    <View>
      <Pressable style={styles.toggle} onPress={() => setOpen((o) => !o)}>
        <View style={styles.togglePreview}><CategoryIcon icon={value} size={20} color="#374151" /></View>
        <Text style={styles.toggleText}>{open ? tt('iconPicker','ປິດ ▲') : tt('iconPicker','ເລືອກ ໄອຄອນ ▾')}</Text>
      </Pressable>
      {open && (
        <View style={styles.panel}>
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, tab === 'emoji' && styles.tabOn]} onPress={() => setTab('emoji')}><Text style={[styles.tabText, tab === 'emoji' && styles.tabTextOn]}>😀 Emoji</Text></Pressable>
            <Pressable style={[styles.tab, tab === 'vector' && styles.tabOn]} onPress={() => setTab('vector')}><Text style={[styles.tabText, tab === 'vector' && styles.tabTextOn]}>{tt('iconPicker','🎯 ໄອຄອນ')} ({VECTOR_ICONS.length})</Text></Pressable>
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder={tab === 'emoji' ? tt('iconPicker','🔍 ຄົ້ນ (ໄຟ, ນ້ຳ, ໄມ້, ສີ ...)') : tt('iconPicker','🔍 ຄົ້ນ ຄຳ EN (wrench, water, home ...)')} placeholderTextColor="#999" style={styles.search} />
          <ScrollView style={styles.grid} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <View style={styles.gridInner}>
              {tab === 'emoji' ? (
                <>
                  {emojiShown.map(({ ic }) => (
                    <Pressable key={ic} style={[styles.cell, value === ic && styles.cellOn]} onPress={() => { onPick(ic); setOpen(false); setQ(''); }}>
                      <Text style={styles.cellIcon}>{ic}</Text>
                    </Pressable>
                  ))}
                  {emojiShown.length === 0 && <Text style={styles.empty}>{tt('iconPicker','ບໍ່ ພົບ — ຫຼື ພິມ emoji ເອງ ໃນ ຊ່ອງ ໄອຄອນ')}</Text>}
                </>
              ) : (
                <>
                  {vectorShown.map((n) => {
                    const val = VECTOR_PREFIX + n;
                    return (
                      <Pressable key={n} style={[styles.cell, value === val && styles.cellOn]} onPress={() => { onPick(val); setOpen(false); setQ(''); }}>
                        <MaterialCommunityIcons name={n as any} size={21} color="#374151" />
                      </Pressable>
                    );
                  })}
                  {vectorShown.length === 0 && <Text style={styles.empty}>{tt('iconPicker','ບໍ່ ພົບ — ລອງ ຄຳ EN (wrench, pipe, fan ...)')}</Text>}
                </>
              )}
            </View>
          </ScrollView>
          {tab === 'vector' && <Text style={styles.hintNote}>{tt('iconPicker','ໄອຄອນ vector = ສີ ດຽວ (ຕາມ ພື້ນ) · ຝັງ ໃນ ແອັບ (offline)')}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', alignSelf: 'flex-start' },
  togglePreview: { width: 24, alignItems: 'center' },
  toggleText: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  panel: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 6, backgroundColor: '#fff', padding: 6, maxWidth: 360 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: '#f1f5f9' },
  tabOn: { backgroundColor: '#0066CC' },
  tabText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  hintNote: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 6 },
  search: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111', marginBottom: 6 },
  grid: { maxHeight: 168 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  cellOn: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#0066CC' },
  cellIcon: { fontSize: 21 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', padding: 8 },
});
