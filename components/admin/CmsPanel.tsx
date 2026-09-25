import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type CmsContent, DEFAULT_CMS, saveCms, watchCms } from '@/lib/cms';
import PhotoPicker from '@/components/PhotoPicker';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

export default function CmsPanel() {
  const { canEdit } = useSectionPerms('cms');
  const [c, setC] = useState<CmsContent>(DEFAULT_CMS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const tt = useTT();

  useEffect(() => watchCms(setC), []);

  const setLink = (i: number, field: 'label' | 'url', v: string) => {
    setSaved(false);
    setC((p) => ({ ...p, footerLinks: p.footerLinks.map((l, idx) => idx === i ? { ...l, [field]: v } : l) }));
  };
  const addLink = () => setC((p) => ({ ...p, footerLinks: [...p.footerLinks, { label: '', url: '' }] }));
  const removeLink = (i: number) => setC((p) => ({ ...p, footerLinks: p.footerLinks.filter((_, idx) => idx !== i) }));

  const setPartner = (i: number, field: 'name' | 'logoUrl' | 'url', v: string) => {
    setSaved(false);
    setC((p) => ({ ...p, partners: p.partners.map((pt, idx) => idx === i ? { ...pt, [field]: v } : pt) }));
  };
  const addPartner = () => setC((p) => ({ ...p, partners: [...p.partners, { name: '', logoUrl: '', url: '' }] }));
  const removePartner = (i: number) => setC((p) => ({ ...p, partners: p.partners.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      await saveCms({
        ...c,
        footerLinks: c.footerLinks.filter((l) => l.label.trim() && l.url.trim()),
        partners: c.partners.filter((pt) => pt.logoUrl.trim()),
      });
      setSaved(true);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admCms','📄 ເນື້ອຫາ ໜ້າເວັບ · CMS')}</Text>
      <Text style={styles.sub}>{tt('admCms','ແກ້ໄຂ ລິ້ງ footer ແລະ ຂໍ້ຄວາມ ທ້າຍໜ້າ (ສະແດງໃນ ໜ້າຕ້ອນຮັບ)')}</Text>

      <Text style={styles.label}>{tt('admCms','ລິ້ງ Footer')}</Text>
      {c.footerLinks.map((l, i) => (
        <View key={i} style={styles.linkRow}>
          <TextInput value={l.label} onChangeText={(v) => setLink(i, 'label', v)} placeholder={tt('admCms','ຊື່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
          <TextInput value={l.url} onChangeText={(v) => setLink(i, 'url', v)} placeholder={tt('admCms','/legal/terms ຫຼື https://…')} placeholderTextColor="#999" style={[styles.input, { flex: 2 }]} />
          {canEdit && <Pressable style={styles.del} onPress={() => removeLink(i)}><Text style={styles.delText}>✕</Text></Pressable>}
        </View>
      ))}
      {canEdit && <Pressable style={styles.addBtn} onPress={addLink}><Text style={styles.addBtnText}>{tt('admCms','+ ເພີ່ມ ລິ້ງ')}</Text></Pressable>}

      <Text style={styles.label}>{tt('admCms','🤝 ຄູ່ຮ່ວມທຸລະກິດ (logo + ຊື່ + link)')}</Text>
      {c.partners.map((pt, i) => (
        <View key={i} style={styles.partnerCard}>
          <View style={styles.partnerTop}>
            {pt.logoUrl ? <Image source={{ uri: pt.logoUrl }} style={styles.partnerLogo} /> : <View style={[styles.partnerLogo, styles.partnerLogoEmpty]}><Text style={{ fontSize: 16 }}>🏢</Text></View>}
            <View style={{ flex: 1, gap: 6 }}>
              <TextInput value={pt.name} onChangeText={(v) => setPartner(i, 'name', v)} placeholder={tt('admCms','ຊື່ ຄູ່ຮ່ວມ')} placeholderTextColor="#999" style={styles.input} />
              <TextInput value={pt.url ?? ''} onChangeText={(v) => setPartner(i, 'url', v)} placeholder={tt('admCms','link (ບໍ່ບັງຄັບ) https://…')} placeholderTextColor="#999" style={styles.input} />
            </View>
            {canEdit && <Pressable style={styles.del} onPress={() => removePartner(i)}><Text style={styles.delText}>✕</Text></Pressable>}
          </View>
          <PhotoPicker photos={pt.logoUrl ? [pt.logoUrl] : []} onChange={(urls) => setPartner(i, 'logoUrl', urls[0] ?? '')} pathPrefix="banners" mode="avatar" />
        </View>
      ))}
      {canEdit && <Pressable style={styles.addBtn} onPress={addPartner}><Text style={styles.addBtnText}>{tt('admCms','+ ເພີ່ມ ຄູ່ຮ່ວມ')}</Text></Pressable>}

      <Text style={styles.label}>{tt('admCms','ຂໍ້ຄວາມ ທ້າຍໜ້າ')}</Text>
      <TextInput value={c.footerNote} onChangeText={(v) => { setSaved(false); setC((p) => ({ ...p, footerNote: v })); }} style={styles.input} placeholderTextColor="#999" />

      {canEdit && <Pressable style={[styles.saveBtn, saving && styles.off]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? tt('admCms','ກຳລັງບັນທຶກ...') : tt('admCms','💾 ບັນທຶກ')}</Text>
      </Pressable>}
      {saved && <Text style={styles.saved}>{tt('admCms','✓ ບັນທຶກແລ້ວ')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 16 },
  label: { fontSize: 12, color: '#374151', fontWeight: '600', marginTop: 14, marginBottom: 6 },
  linkRow: { flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  del: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  delText: { color: '#dc2626', fontWeight: '700' },
  addBtn: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  addBtnText: { color: '#0066CC', fontWeight: '600', fontSize: 12 },
  saveBtn: { backgroundColor: '#0066CC', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 18 },
  off: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saved: { color: '#16a34a', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  partnerCard: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 8 },
  partnerTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  partnerLogo: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#f1f5f9' },
  partnerLogoEmpty: { alignItems: 'center', justifyContent: 'center' },
});
