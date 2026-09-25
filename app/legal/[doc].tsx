import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, font } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';

type Doc = { title: string; sections: { h: string; p: string }[] };

const DOCS: Record<string, Doc> = {
  terms: {
    title: 'ຂໍ້ກຳນົດການນຳໃຊ້',
    sections: [
      { h: '1. ການຍອມຮັບ', p: 'ການນຳໃຊ້ HomeSang (ໂຮມຊ່າງ) ໝາຍຄວາມວ່າ ທ່ານຍອມຮັບຂໍ້ກຳນົດເຫຼົ່ານີ້. ຖ້າບໍ່ຍອມຮັບ ກະລຸນາຢຸດການນຳໃຊ້.' },
      { h: '2. ບໍລິການ', p: 'HomeSang ເປັນຕະຫຼາດເຊື່ອມຕໍ່ ລູກຄ້າ ກັບ ຊ່າງ ແລະ ຮ້ານຄ້າ. ເຮົາບໍ່ແມ່ນຜູ້ໃຫ້ບໍລິການໂດຍກົງ ແລະ ບໍ່ຮັບຜິດຊອບຄຸນນະພາບງານ ຫຼື ສິນຄ້າຂອງຄູ່ຄ້າ.' },
      { h: '3. ບັນຊີຜູ້ໃຊ້', p: 'ທ່ານຕ້ອງໃຫ້ຂໍ້ມູນທີ່ຖືກຕ້ອງ ແລະ ຮັກສາຄວາມລັບຂອງລະຫັດຜ່ານ. ທ່ານຮັບຜິດຊອບກິດຈະກຳທັງໝົດ ພາຍໃຕ້ບັນຊີຂອງທ່ານ.' },
      { h: '4. ການຈ່າຍເງິນ ແລະ ຄ່າທຳນຽມ', p: 'ການເຮັດທຸລະກຳ ອາດມີຄ່າທຳນຽມແພລດຟອມ. ລາຄາ ແລະ ການຈ່າຍ ເປັນໄປຕາມທີ່ສະແດງໃນແອັບ.' },
      { h: '5. ການຍົກເລີກ', p: 'ການຍົກເລີກງານ ຫຼື ການສັ່ງຊື້ ເປັນໄປຕາມເງື່ອນໄຂ ແລະ ການຕົກລົງ ລະຫວ່າງຄູ່ກໍລະນີ.' },
      { h: '6. ຄ່າສຳຫຼວດໜ້າງານ', p: 'ເມື່ອລູກຄ້າຮ້ອງຂໍໃຫ້ສຳຫຼວດໜ້າງານ ອາດມີຄ່າສຳຫຼວດຕາມທີ່ລະບົບກຳນົດ. ຖ້າລູກຄ້າຕົກລົງຮັບໃບສະເໜີ ຄ່າສຳຫຼວດຈະຫັກຄືນເປັນສ່ວນຫຼຸດ. ຖ້າລູກຄ້າບໍ່ດຳເນີນຕໍ່ຫຼັງການສຳຫຼວດ ຄ່າສຳຫຼວດຈະບໍ່ຄືນ (ຊົດເຊີຍເວລາ ແລະ ການເດີນທາງຂອງຊ່າງ). ລູກຄ້າຍອມຮັບເງື່ອນໄຂນີ້ຕອນຮ້ອງຂໍ.' },
      { h: '7. ເພດານຄວາມຮັບຜິດ', p: 'ຄວາມຮັບຜິດສູງສຸດຂອງຊ່າງ/ຜູ້ໃຫ້ບໍລິການ ຕໍ່ຄວາມເສຍຫາຍໂດຍກົງທີ່ເກີດຈາກງານ = 2 ເທົ່າ ຂອງຄ່າບໍລິການໃນໃບສະເໜີ ໂດຍບໍ່ລວມຄວາມເສຍຫາຍທາງອ້ອມ. HomeSang ເປັນຕົວກາງເຊື່ອມຕໍ່ ບໍ່ຮັບຜິດແທນຄູ່ສັນຍາ.' },
      { h: '8. ການປ່ຽນແປງ', p: 'ເຮົາອາດປັບປຸງຂໍ້ກຳນົດເຫຼົ່ານີ້ເປັນແຕ່ລະໄລຍະ. ການນຳໃຊ້ຕໍ່ໄປ ໝາຍເຖິງການຍອມຮັບການປ່ຽນແປງ.' },
    ],
  },
  privacy: {
    title: 'ນະໂຍບາຍຄວາມເປັນສ່ວນຕົວ',
    sections: [
      { h: '1. ຂໍ້ມູນທີ່ເກັບ', p: 'ເຮົາເກັບ ເບີໂທ, ຊື່, ທີ່ຢູ່, ຕຳແໜ່ງ (ເມື່ອອະນຸຍາດ), ຮູບ ແລະ ຂໍ້ມູນທີ່ທ່ານໃສ່ ເພື່ອໃຫ້ບໍລິການ.' },
      { h: '2. ການນຳໃຊ້', p: 'ໃຊ້ເພື່ອ ເຊື່ອມຕໍ່ທ່ານກັບ ຊ່າງ/ຮ້ານ, ປະມວນຜົນການສັ່ງຊື້, ແຈ້ງເຕືອນ ແລະ ປັບປຸງບໍລິການ.' },
      { h: '3. ການແບ່ງປັນ', p: 'ເຮົາແບ່ງປັນຂໍ້ມູນທີ່ຈຳເປັນ ກັບຄູ່ຄ້າ (ຊ່າງ/ຮ້ານ) ເພື່ອໃຫ້ບໍລິການສຳເລັດ. ເຮົາບໍ່ຂາຍຂໍ້ມູນສ່ວນຕົວ.' },
      { h: '4. ຄວາມປອດໄພ', p: 'ຂໍ້ມູນເກັບໄວ້ໃນ Firebase (Google) ດ້ວຍມາດຕະການຄວາມປອດໄພ. ຢ່າງໃດກໍ່ຕາມ ບໍ່ມີລະບົບໃດປອດໄພ 100%.' },
      { h: '5. ສິດຂອງທ່ານ', p: 'ທ່ານສາມາດ ເບິ່ງ, ແກ້ໄຂ ຫຼື ຂໍລຶບ ຂໍ້ມູນຂອງທ່ານ ໂດຍຕິດຕໍ່ພວກເຮົາ.' },
      { h: '6. ຕິດຕໍ່', p: 'ສຳລັບຄຳຖາມ ກ່ຽວກັບຄວາມເປັນສ່ວນຕົວ ກະລຸນາຕິດຕໍ່ ທີມງານ HomeSang.' },
    ],
  },
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const tt = useTT();
  const data = DOCS[doc] ?? DOCS.terms;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.updated}>{tt('legal','ອັບເດດ 2026')}</Text>
        {data.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.h}>{s.h}</Text>
            <Text style={styles.p}>{s.p}</Text>
          </View>
        ))}
        <Text style={styles.footer}>{tt('legal','© 2026 HomeSang · ໂຮມຊ່າງ')}</Text>
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 720 },
  title: { fontSize: font.xxl, fontWeight: '700', color: colors.text },
  updated: { fontSize: font.xs, color: colors.text3, marginTop: 2, marginBottom: 16 },
  section: { marginBottom: 16 },
  h: { fontSize: font.md, fontWeight: '700', color: colors.text, marginBottom: 4 },
  p: { fontSize: font.sm, color: colors.text2, lineHeight: 22 },
  footer: { fontSize: font.xs, color: colors.text3, marginTop: 12, textAlign: 'center' },
});
