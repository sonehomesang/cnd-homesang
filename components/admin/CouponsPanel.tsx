import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import MockBadge from '@/components/MockBadge';
import {
  type Coupon,
  type CouponAudience,
  type CouponType,
  clearMockCoupons,
  createCoupon,
  deleteCoupon,
  seedCouponsIfEmpty,
  updateCoupon,
  watchAllCoupons,
  watchCouponRedemptions,
  type CouponRedemption,
} from '@/lib/coupons';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { logAdminAction } from '@/lib/auditLog';
import { isMock, useMockEnabled } from '@/lib/mock';
import { useSectionPerms } from '@/lib/permissions-context';

const P = 'admCoupons';
const fmt = (n?: number) => (Math.round(n || 0)).toLocaleString('en-US');
function parseDate(s: string): number | undefined {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}
function fmtDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function genCode(): string {
  let s = 'HS';
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export default function CouponsPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('coupons');
  const tt = useTT();
  const { fbUser, profile } = useAuth();
  const mockEnabled = useMockEnabled();
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [code, setCode] = useState('');
  const [audience, setAudience] = useState<CouponAudience>('public');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<CouponType>('pct');
  const [value, setValue] = useState(0);
  const [cap, setCap] = useState(0);
  const [minSpend, setMinSpend] = useState(0);
  const [expiry, setExpiry] = useState('');
  const [limit, setLimit] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [openRedeem, setOpenRedeem] = useState<string | null>(null);

  useEffect(() => watchAllCoupons(setCoupons), []);

  const reset = () => { setCode(''); setAudience('public'); setPhone(''); setType('pct'); setValue(0); setCap(0); setMinSpend(0); setExpiry(''); setLimit(0); };

  const add = async () => {
    setErr('');
    const c = code.trim().toUpperCase();
    if (!c) { setErr(tt(P, 'ໃສ່ ລະຫັດ ກ່ອນ')); return; }
    if (!value) { setErr(tt(P, 'ໃສ່ ຄ່າ ສ່ວນ ຫຼຸດ')); return; }
    if (coupons.some((x) => x.code === c)) { setErr(tt(P, 'ລະຫັດ ນີ້ ມີ ຢູ່ ແລ້ວ')); return; }
    if (audience === 'personal' && !phone.trim()) { setErr(tt(P, 'ໃສ່ ເບີ ໂທ ຂອງ ຄົນ ທີ່ ມອບ ໃຫ້')); return; }
    setSaving(true);
    try {
      const id = await createCoupon({
        code: c, type, value,
        cap: type === 'pct' && cap ? cap : undefined,
        minSpend: minSpend || undefined,
        audience,
        assignedToPhone: audience === 'personal' ? phone.trim() : undefined,
        expiresAt: parseDate(expiry),
        usageLimit: limit || undefined,
        createdBy: fbUser?.uid,
        createdByName: profile?.firstName || (profile as any)?.name || undefined,
      });
      logAdminAction({ action: 'create', collection: 'coupons', docId: id, after: { code: c, type, value, audience } });
      reset();
    } catch (e: any) { setErr(e?.message || 'error'); }
    finally { setSaving(false); }
  };

  const toggle = (c: Coupon) => {
    updateCoupon(c.id, { active: !c.active });
    logAdminAction({ action: 'update', collection: 'coupons', docId: c.id, before: { active: c.active }, after: { active: !c.active } });
  };
  const remove = (c: Coupon) => {
    deleteCoupon(c.id);
    logAdminAction({ action: 'delete', collection: 'coupons', docId: c.id, before: { code: c.code, value: c.value } });
  };

  const isExpired = (c: Coupon) => !!c.expiresAt && Date.now() > c.expiresAt;

  return (
    <View>
      <Text style={styles.title}>🎟️ {tt(P, 'ລະຫັດ ສ່ວນ ຫຼຸດ')} · Discount codes</Text>
      <Text style={styles.sub}>{tt(P, 'ສ້າງ ແລະ ຈັດ ການ ລະຫັດ ສ່ວນ ຫຼຸດ ສຳ ລັບ ໜ້າ ຮ້ານ ໂຮມຊ່າງ')}</Text>

      {canCreate && (
        <View style={styles.form}>
          <Text style={styles.label}>{tt(P, 'ລະຫັດ (code)')}</Text>
          <View style={styles.rowGap}>
            <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="NEWYEAR25" placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
            <Pressable style={styles.gen} onPress={() => setCode(genCode())}><Text style={styles.genT}>🎲 {tt(P, 'ສຸ່ມ')}</Text></Pressable>
          </View>

          <Text style={styles.label}>{tt(P, 'ໃຜ ໃຊ້ ໄດ້')}</Text>
          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, audience === 'public' && styles.segOn]} onPress={() => setAudience('public')}><Text style={[styles.segT, audience === 'public' && styles.segTOn]}>{tt(P, 'ສາທາລະນະ (ໃຜ ກໍ ໃຊ້ ໄດ້)')}</Text></Pressable>
            <Pressable style={[styles.segBtn, audience === 'personal' && styles.segOn]} onPress={() => setAudience('personal')}><Text style={[styles.segT, audience === 'personal' && styles.segTOn]}>{tt(P, 'ສ່ວນ ຕົວ (ສະ ເພາະ ຄົນ)')}</Text></Pressable>
          </View>
          {audience === 'personal' && (
            <TextInput value={phone} onChangeText={setPhone} placeholder={tt(P, 'ເບີ ໂທ ຂອງ ຄົນ ທີ່ ມອບ ໃຫ້')} placeholderTextColor="#999" keyboardType="phone-pad" style={styles.input} />
          )}

          <Text style={styles.label}>{tt(P, 'ປະ ເພດ ສ່ວນ ຫຼຸດ')}</Text>
          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, type === 'pct' && styles.segOn]} onPress={() => setType('pct')}><Text style={[styles.segT, type === 'pct' && styles.segTOn]}>% {tt(P, 'ເປີ ເຊັນ')}</Text></Pressable>
            <Pressable style={[styles.segBtn, type === 'amount' && styles.segOn]} onPress={() => setType('amount')}><Text style={[styles.segT, type === 'amount' && styles.segTOn]}>{tt(P, 'ກີບ ຈຳ ນວນ')}</Text></Pressable>
          </View>

          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{type === 'pct' ? tt(P, 'ຄ່າ (%)') : tt(P, 'ຄ່າ (ກີບ)')}</Text>
              <AmountInput value={value} onChangeValue={setValue} decimals={type === 'pct'} placeholder="0" placeholderTextColor="#999" style={styles.input} />
            </View>
            {type === 'pct' && (
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{tt(P, 'ຫຼຸດ ສູງ ສຸດ (ກີບ)')}</Text>
                <AmountInput value={cap} onChangeValue={setCap} placeholder={tt(P, 'ບໍ່ ຈຳ ກັດ')} placeholderTextColor="#999" style={styles.input} />
              </View>
            )}
          </View>

          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt(P, 'ຍອດ ຂັ້ນ ຕໍ່າ (ກີບ)')}</Text>
              <AmountInput value={minSpend} onChangeValue={setMinSpend} placeholder="0" placeholderTextColor="#999" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt(P, 'ວັນ ໝົດ ອາຍຸ')}</Text>
              <TextInput value={expiry} onChangeText={setExpiry} placeholder="2026-12-31" placeholderTextColor="#999" style={styles.input} />
            </View>
          </View>

          <Text style={styles.label}>{tt(P, 'ຈຳ ກັດ ຈຳ ນວນ ຄັ້ງ ໃຊ້ (ທັງ ໝົດ)')}</Text>
          <AmountInput value={limit} onChangeValue={setLimit} placeholder={tt(P, 'ບໍ່ ຈຳ ກັດ')} placeholderTextColor="#999" style={styles.input} />
          {audience === 'personal' && <Text style={styles.hint}>{tt(P, '* ລະຫັດ ສ່ວນ ຕົວ ໃຊ້ ໄດ້ ຄັ້ງ ດຽວ ຖ້າ ບໍ່ ລະບຸ')}</Text>}

          {err !== '' && <Text style={styles.err}>⚠️ {err}</Text>}
          <Pressable style={[styles.btn, saving && styles.btnOff]} onPress={add} disabled={saving}>
            <Text style={styles.btnText}>{saving ? '...' : tt(P, '＋ ບັນທຶກ ລະຫັດ')}</Text>
          </Pressable>
        </View>
      )}

      {coupons.length === 0 && <Text style={styles.empty}>{tt(P, 'ຍັງ ບໍ່ ມີ ລະຫັດ')}</Text>}
      {coupons.map((c) => {
        const val = c.type === 'pct' ? `${c.value}%` : `${fmt(c.value)} ${tt(P, 'ກີບ')}`;
        const meta: string[] = [];
        if (c.minSpend) meta.push(`${tt(P, 'ຂັ້ນ ຕໍ່າ')} ${fmt(c.minSpend)}`);
        if (c.cap && c.type === 'pct') meta.push(`${tt(P, 'ສູງ ສຸດ')} ${fmt(c.cap)}`);
        if (c.expiresAt) meta.push(`${tt(P, 'ໝົດ')} ${fmtDate(c.expiresAt)}`);
        meta.push(`${tt(P, 'ໃຊ້')} ${c.usedCount}${c.usageLimit ? `/${c.usageLimit}` : ''}`);
        return (
          <View key={c.id} style={[styles.row, !c.active && styles.rowOff]}>
            <View style={styles.rowHead}>
              <View style={{ flex: 1 }}>
                <View style={styles.codeLine}>
                  <Text style={styles.code}>{c.code}</Text>
                  <Text style={styles.badgeVal}>{val}</Text>
                  <Text style={[styles.badgeAud, c.audience === 'personal' && styles.badgePers]}>{c.audience === 'personal' ? `👤 ${tt(P, 'ສ່ວນ ຕົວ')}` : `🌐 ${tt(P, 'ສາທາລະນະ')}`}</Text>
                  {isExpired(c) && <Text style={styles.badgeExp}>{tt(P, 'ໝົດ ອາຍຸ')}</Text>}
                  {isMock(c) && <MockBadge small />}
                </View>
                <Text style={styles.meta}>{meta.join(' · ')}{c.audience === 'personal' && c.assignedToPhone ? ` · ${c.assignedToPhone}` : ''}</Text>
              </View>
              <View style={styles.actions}>
                {canEdit && <Pressable style={[styles.mini, { backgroundColor: c.active ? '#16a34a' : '#64748b' }]} onPress={() => toggle(c)}><Text style={styles.miniText}>{c.active ? tt(P, 'ເປີດ') : tt(P, 'ປິດ')}</Text></Pressable>}
                {canDelete && <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => remove(c)}><Text style={styles.miniText}>{tt(P, 'ລົບ')}</Text></Pressable>}
              </View>
            </View>
            <Pressable onPress={() => setOpenRedeem(openRedeem === c.id ? null : c.id)}>
              <Text style={styles.who}>👤 {tt(P, 'ໃຜ ໃຊ້')} ({c.usedCount}) {openRedeem === c.id ? '▲' : '▼'}</Text>
            </Pressable>
            {openRedeem === c.id && <RedemptionList code={c.code} tt={tt} />}
          </View>
        );
      })}

      {mockEnabled && (
        <View style={styles.rowGap}>
          <Pressable style={styles.seedBtn} onPress={() => seedCouponsIfEmpty()}><Text style={styles.seedT}>🌱 {tt(P, 'ໃສ່ ຕົວຢ່າງ')}</Text></Pressable>
          <Pressable style={styles.seedBtn} onPress={() => clearMockCoupons()}><Text style={styles.seedT}>{tt(P, 'ລ້າງ ຕົວຢ່າງ')}</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function RedemptionList({ code, tt }: { code: string; tt: (p: string, s: string) => string }) {
  const [rows, setRows] = useState<CouponRedemption[]>([]);
  useEffect(() => watchCouponRedemptions(setRows, code), [code]);
  if (rows.length === 0) return <Text style={styles.redEmpty}>{tt('admCoupons', 'ຍັງ ບໍ່ ມີ ຄົນ ໃຊ້')}</Text>;
  return (
    <View style={styles.redBox}>
      {rows.map((r) => (
        <View key={r.id} style={styles.redRow}>
          <Text style={styles.redWho}>{r.userPhone || r.userId.slice(0, 8)}</Text>
          <Text style={styles.redMeta}>−{r.discount.toLocaleString('en-US')} · {new Date(r.ts).toLocaleDateString()}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  form: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 16 },
  label: { fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  rowGap: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  gen: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#f8fafc' },
  genT: { fontSize: 12, fontWeight: '700', color: '#475569' },
  seg: { flexDirection: 'row', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segT: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  segTOn: { color: '#0066CC' },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  err: { fontSize: 12, color: '#dc2626', marginTop: 8 },
  btn: { backgroundColor: '#0066CC', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 14 },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 18 },
  row: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 11, marginBottom: 8 },
  rowOff: { opacity: 0.55, backgroundColor: '#fafbfc' },
  rowHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  codeLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  code: { fontSize: 15, fontWeight: '900', color: '#004a97', letterSpacing: 0.5 },
  badgeVal: { fontSize: 12, fontWeight: '800', color: '#0066CC', backgroundColor: '#E4EEFB', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  badgeAud: { fontSize: 12, fontWeight: '700', color: '#475569', backgroundColor: '#eef2f7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  badgePers: { color: '#7c3aed', backgroundColor: '#f1e9ff' },
  badgeExp: { fontSize: 12, fontWeight: '800', color: '#dc2626', backgroundColor: '#fdecec', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  actions: { gap: 4 },
  mini: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  who: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 8 },
  redBox: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#eef0f3', paddingTop: 6, gap: 4 },
  redRow: { flexDirection: 'row', justifyContent: 'space-between' },
  redWho: { fontSize: 12, color: '#111', fontWeight: '600' },
  redMeta: { fontSize: 12, color: '#6b7280' },
  redEmpty: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  seedBtn: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, alignItems: 'center', backgroundColor: '#fff', marginTop: 12 },
  seedT: { fontSize: 12, fontWeight: '700', color: '#475569' },
});
