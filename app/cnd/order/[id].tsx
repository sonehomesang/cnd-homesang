import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { cnd, kip } from '@/lib/cnd/theme';
import { isMock } from '@/lib/mock';
import {
  setCndOrderPaid, setCndOrderStatus, updateCndInstall, watchCndOrder,
  type CndOrder, type CndOrderStatus,
} from '@/lib/cnd/orders';
import { watchCndTechs, type CndTech } from '@/lib/cnd/techs';
import PhotoPicker from '@/components/PhotoPicker';
import OrderChat from '@/components/cnd/OrderChat';
import { useTT } from '@/lib/i18n';
import { pickBestTech, guessTrade, rankTechs, warrantyUntil, formatWarrantyDays } from '@/lib/ninesang';

const OSTAT: Record<CndOrderStatus, { lao: string; bg: string; fg: string }> = {
  new: { lao: 'ໃໝ່', bg: cnd.blueSoft, fg: cnd.blue },
  confirmed: { lao: 'ຢືນຢັນ', bg: cnd.yellowSoft, fg: '#8a6d00' },
  delivering: { lao: 'ກຳລັງ ສົ່ງ', bg: cnd.yellowSoft, fg: '#8a6d00' },
  done: { lao: 'ສຳ ເລັດ', bg: cnd.greenSoft, fg: cnd.green },
  cancelled: { lao: 'ຍົກເລີກ', bg: cnd.surface2, fg: cnd.ink3 },
};
const NEXT: Record<CndOrderStatus, CndOrderStatus | null> = { new: 'confirmed', confirmed: 'delivering', delivering: 'done', done: null, cancelled: null };

function fmt(ms?: number): string { return ms ? new Date(ms).toLocaleString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
function Stars({ n }: { n?: number }) { const v = Math.max(0, Math.min(5, n ?? 0)); return <Text style={styles.stars}>{'★'.repeat(v)}<Text style={styles.starsOff}>{'★'.repeat(5 - v)}</Text></Text>; }

export default function CndOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, loading } = useAuth();
  const tt = useTT();
  const isAdmin = isAnyAdmin(profile);
  const [o, setO] = useState<CndOrder | null>(null);
  const [techs, setTechs] = useState<CndTech[]>([]);

  useEffect(() => { if (!loading && !isAdmin) router.replace('/cnd' as any); }, [loading, isAdmin]);
  useEffect(() => { if (id) return watchCndOrder(id, setO); }, [id]);
  useEffect(() => watchCndTechs(setTechs), []);

  if (!isAdmin) return <View style={styles.root} />;

  const st = o ? OSTAT[o.status] : null;
  const nx = o ? NEXT[o.status] : null;
  const inst = o?.install;
  const tech = inst?.techId ? techs.find((t) => t.id === inst.techId) : undefined;

  const markDone = () => {
    if (!o || !inst) return;
    const now = Date.now();
    updateCndInstall(o.id, { stage: 'done', completedAt: now, onTime: now <= (inst.scheduledAt ?? now) }).catch(() => {});
  };
  // ninesang auto-match: rank CND techs by trade+area for this install
  const wantTrade = o ? guessTrade(o.items.filter((i) => i.install).map((i) => i.name)) : '';
  const suggested = rankTechs(techs as any, { trade: wantTrade, area: o?.deliveryAddress || o?.address }).slice(0, 4);
  const assign = (id: string, name?: string) => { if (o) updateCndInstall(o.id, { techId: id, techName: name }).catch(() => {}); };
  const assignBest = () => { const b = pickBestTech(techs as any, { trade: wantTrade, area: o?.deliveryAddress || o?.address }); if (b) assign(b.id, b.name); };
  const setSchedule = (days: number) => { if (!o) return; const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); updateCndInstall(o.id, { scheduledAt: d.getTime(), stage: 'scheduled' }).catch(() => {}); };
  const handover = () => { if (!o || !inst) return; const now = Date.now(); updateCndInstall(o.id, { handoverAt: now, warrantyUntil: warrantyUntil(now, inst.warrantyDays) }).catch(() => {}); };

  return (
    <View style={styles.root}>
      <View style={styles.topAccent} />
      <View style={styles.top}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}><Text style={styles.iconTx}>‹</Text></Pressable>
        <Text style={styles.title} numberOfLines={1}>🧾 {o?.number ?? tt('cndOrder', 'ອໍເດີ')}</Text>
        {st && <Text style={[styles.ostat, { backgroundColor: st.bg, color: st.fg }]}>{tt('cndOrder', st.lao)}</Text>}
      </View>

      {!o ? (
        <Text style={styles.none}>{tt('cndOrder', 'ບໍ່ ພົບ ອໍເດີ')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* channel + date */}
          <View style={styles.metaRow}>
            <Text style={styles.metaTag}>{o.channel === 'pos' ? tt('cndOrder', '🏬 POS') : tt('cndOrder', '🛒 ອອນລາຍ')}</Text>
            <Text style={styles.metaMuted}>{fmt(o.createdAt)}</Text>
            {o.channel !== 'pos' && <Text style={[styles.metaTag, o.paymentStatus === 'paid' ? { color: cnd.green, backgroundColor: cnd.greenSoft } : { color: cnd.error, backgroundColor: '#fdecec' }]}>{(o.paymentMethod === 'qr' ? `📱 QR${o.paymentBank ? ' ' + o.paymentBank : ''}` : '💵 COD')} · {o.paymentStatus === 'paid' ? tt('cndOrder', 'ຈ່າຍ ແລ້ວ') : tt('cndOrder', 'ຄ້າງ ຈ່າຍ')}</Text>}
            {isMock(o) && <Text style={styles.mockPill}>{tt('cndOrder', '🧪 ຕົວຢ່າງ')}</Text>}
          </View>
          {o.channel !== 'pos' && o.paymentStatus !== 'paid' && (
            <Pressable style={styles.payBtn} onPress={() => setCndOrderPaid(o.id, true, profile?.firstName || profile?.name || profile?.phone).catch(() => {})}><Text style={styles.payBtnTx}>{tt('cndOrder', '💵 ຢືນຢັນ ຮັບ ເງິນ')} ({kip(o.total)} {tt('cndOrder', 'ກີບ')})</Text></Pressable>
          )}

          {/* customer */}
          <Text style={styles.secH}>{tt('cndOrder', '👤 ລູກຄ້າ')}</Text>
          <View style={styles.card}>
            {o.channel === 'pos' ? (
              <Text style={styles.big}>{tt('cndOrder', 'ຂາຍ ໜ້າ ຮ້ານ (POS)')}{o.cashier ? ` · ${tt('cndOrder', 'ແຄຊເຊຍ')} ${o.cashier}` : ''}</Text>
            ) : (
              <>
                <Row l={tt('cndOrder', 'ຊື່')} v={o.customerName || '—'} />
                <Row l={tt('cndOrder', 'ເບີ ໂທ')} v={o.phone || '—'} />
                {!!o.address && <Row l={tt('cndOrder', 'ທີ່ ຢູ່')} v={o.address} />}
                {!!o.deliveryAddress && <Row l={tt('cndOrder', '🚚 ບ່ອນ ສົ່ງ')} v={o.deliveryAddress} />}
                {!!o.note && <Row l={tt('cndOrder', '📝 ໝາຍ ເຫດ')} v={o.note} />}
              </>
            )}
          </View>

          {/* payment slip proof */}
          {!!o.paymentSlipUrl && (
            <>
              <Text style={styles.secH}>{tt('cndOrder', '📎 ຫຼັກຖານ ການ ໂອນ')}</Text>
              <View style={styles.card}>
                <Image source={{ uri: o.paymentSlipUrl }} style={styles.slipImg} resizeMode="contain" />
                {o.paymentStatus === 'paid' && <Text style={styles.slipPaid}>{tt('cndOrder', '✓ ຢືນຢັນ ແລ້ວ')}{o.paidBy ? ` ${tt('cndOrder', 'ໂດຍ')} ${o.paidBy}` : ''}{o.paidAt ? ` · ${fmt(o.paidAt)}` : ''}</Text>}
              </View>
            </>
          )}

          {/* items */}
          <Text style={styles.secH}>{tt('cndOrder', '📦 ລາຍການ ສິນຄ້າ')} ({o.items.length})</Text>
          <View style={styles.card}>
            {o.items.map((it, i) => (
              <View key={i} style={[styles.itemRow, i > 0 && styles.itemDivide]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={2}>{it.name}{it.install ? '  🔧' : ''}</Text>
                  <Text style={styles.itemMeta}>{it.qty} × {kip(it.price)} {tt('cndOrder', 'ກີບ')}{it.install && it.feeAmount ? ` · ${tt('cndOrder', 'ຄ່າ ຕິດຕັ້ງ')} +${kip(it.feeAmount)}` : ''}</Text>
                </View>
                <Text style={styles.itemSum}>{kip(it.price * it.qty)}</Text>
              </View>
            ))}
          </View>

          {/* totals */}
          <View style={styles.card}>
            <Row l={tt('cndOrder', 'ລວມ ສິນຄ້າ')} v={`${kip(o.subtotal)} ${tt('cndOrder', 'ກີບ')}`} />
            {o.installFeeTotal > 0 && <Row l={tt('cndOrder', 'ຄ່າ ຕິດຕັ້ງ')} v={`${kip(o.installFeeTotal)} ${tt('cndOrder', 'ກີບ')}`} />}
            {!!o.installTravelFee && <Row l={tt('cndOrder', '🔧 ຄ່າ ເດີນທາງ ຊ່າງ')} v={`${kip(o.installTravelFee)} ${tt('cndOrder', 'ກີບ')}`} />}
            {!!o.surveyFee && <Row l={tt('cndOrder', '📐 ຄ່າ ສຳຫຼວດ')} v={`${kip(o.surveyFee)} ${tt('cndOrder', 'ກີບ')}`} />}
            {!!o.urgentFee && <Row l={tt('cndOrder', '🚨 ຄ່າ ດ່ວນ')} v={`${kip(o.urgentFee)} ${tt('cndOrder', 'ກີບ')}`} />}
            {o.channel === 'booking' && !!o.install?.slot && <Row l={tt('cndOrder', '📅 ຄິວ ຈອງ')} v={o.install.slot} />}
            {o.channel === 'urgent' && !!o.install?.problemType && <Row l={tt('cndOrder', '🚨 ບັນຫາ')} v={o.install.problemType} />}
            {o.deliveryFee > 0 && <Row l={`${tt('cndOrder', 'ຄ່າ ສົ່ງ')}${o.deliveryZone ? ` (${o.deliveryZone})` : ''}`} v={`${kip(o.deliveryFee)} ${tt('cndOrder', 'ກີບ')}`} />}
            {!!o.discount && <Row l={tt('cndOrder', 'ສ່ວນ ຫຼຸດ')} v={`-${kip(o.discount)} ${tt('cndOrder', 'ກີບ')}`} />}
            {!!o.taxAmount && <Row l={`VAT ${o.taxPct ?? 0}%`} v={`${kip(o.taxAmount)} ${tt('cndOrder', 'ກີບ')}`} />}
            <View style={styles.totRow}><Text style={styles.totL}>{tt('cndOrder', 'ລວມ ທັງ ໝົດ')}</Text><Text style={styles.totV}>{kip(o.total)} {tt('cndOrder', 'ກີບ')}</Text></View>
          </View>

          {/* ── install intelligence ── */}
          <Text style={styles.secH}>{tt('cndOrder', '🔧 ບໍລິການ ຊ່າງ ຕິດຕັ້ງ')}</Text>
          {inst ? (
            <View style={[styles.card, styles.instCard]}>
              <View style={styles.instHead}>
                <Text style={styles.instYes}>{tt('cndOrder', '✓ ໃຊ້ ຊ່າງ CND')}</Text>
                <Text style={[styles.linkPill, inst.linkedToInvoice ? styles.linkOn : styles.linkOff]}>{inst.linkedToInvoice ? tt('cndOrder', '🔗 ຜູກ ໃບ ຊື້') : tt('cndOrder', 'ແຍກ ຈາກ ໃບ ຊື້')}</Text>
              </View>
              {!!inst.reason && <Row l={tt('cndOrder', 'ເຫດຜົນ ໃຊ້')} v={inst.reason} />}

              {/* ninesang auto-match: assign a CND tech when none picked yet */}
              {!inst.techId && (
                <View style={styles.assignBox}>
                  <Text style={styles.assignH}>🤝 {tt('cndOrder', 'ຈັດ ຊ່າງ CND-ໂຮມຊ່າງ')}{wantTrade ? ` · ${wantTrade}` : ''}</Text>
                  <Pressable style={styles.assignBest} onPress={assignBest}><Text style={styles.assignBestTx}>{tt('cndOrder', '⚡ ແນະນຳ ຊ່າງ ທີ່ ເໝາະ ສຸດ')}</Text></Pressable>
                  <View style={styles.assignWrap}>
                    {suggested.map((t) => (
                      <Pressable key={t.id} style={styles.assignChip} onPress={() => assign(t.id, t.name)}>
                        <Text style={styles.assignChipTx} numberOfLines={1}>{t.name} · {t.trade}{t.ratingAvg ? ` · ★${t.ratingAvg.toFixed(1)}` : ''}{t.verified ? ' ✅' : ''}</Text>
                      </Pressable>
                    ))}
                    {suggested.length === 0 && <Text style={styles.metaMuted}>{tt('cndOrder', 'ຍັງ ບໍ່ ມີ ຊ່າງ — ເພີ່ມ ໃນ ໜ້າ ຊ່າງ')}</Text>}
                  </View>
                </View>
              )}

              {/* who did it + org */}
              <View style={styles.techBox}>
                <Text style={styles.techName}>👷 {tech?.name ?? inst.techName ?? tt('cndOrder', 'CND ຈັດ ໃຫ້')}</Text>
                {(tech?.trade || tech?.area) && <Text style={styles.techMeta}>{[tech?.trade, tech?.area].filter(Boolean).join(' · ')}</Text>}
                <Row l={tt('cndOrder', 'ສັງກັດ / ບໍລິສັດ')} v={tech?.company || tt('cndOrder', 'CND (ໃນ ເຄືອ)')} />
                <Row l={tt('cndOrder', 'ຫົວໜ້າ / ຄຸມ ງານ')} v={tech?.supervisor || '—'} />
                {!!tech?.phone && <Row l={tt('cndOrder', 'ເບີ ຊ່າງ')} v={tech.phone} />}
              </View>

              {/* schedule + on-time */}
              <View style={styles.schedBox}>
                <Row l={tt('cndOrder', 'ນັດ ຕິດຕັ້ງ')} v={fmt(inst.scheduledAt)} />
                {inst.stage !== 'done' && (
                  <View style={styles.napRow}>
                    <Text style={styles.napL}>📅 {tt('cndOrder', 'ນັດ ໄວ')}:</Text>
                    {[[1, 'ມື້ອື່ນ'], [2, '+2 ມື້'], [3, '+3 ມື້'], [7, '+7 ມື້']].map(([d, l]) => (
                      <Pressable key={d as number} style={styles.napChip} onPress={() => setSchedule(d as number)}><Text style={styles.napTx}>{tt('cndOrder', l as string)}</Text></Pressable>
                    ))}
                  </View>
                )}
                <View style={styles.schedRow}>
                  <Text style={styles.rowL}>{tt('cndOrder', 'ສະຖານະ')}</Text>
                  {inst.stage === 'done'
                    ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Text style={styles.doneP}>{tt('cndOrder', '✅ ຕິດຕັ້ງ ແລ້ວ')}</Text>
                        <Text style={[styles.onTimeP, inst.onTime ? styles.onTimeOk : styles.onTimeLate]}>{inst.onTime ? tt('cndOrder', '⏱️ ທັນ ນັດ') : tt('cndOrder', '⚠️ ຊ້າ ກວ່າ ນັດ')}</Text>
                      </View>
                    : <Text style={styles.schedP}>{tt('cndOrder', '🗓️ ລໍ ຖ້າ ຕິດຕັ້ງ')}</Text>}
                </View>
                {inst.stage === 'done' && <Row l={tt('cndOrder', 'ຕິດຕັ້ງ ສຳ ເລັດ')} v={fmt(inst.completedAt)} />}
                {inst.stage !== 'done' && <Pressable style={styles.doneBtn} onPress={markDone}><Text style={styles.doneBtnTx}>{tt('cndOrder', '✓ ໝາຍ ຕິດຕັ້ງ ສຳ ເລັດ')}</Text></Pressable>}
                {/* ໃບ ຮັບ ງານ (sign-off) → starts the warranty */}
                {inst.stage === 'done' && !inst.handoverAt && (
                  <Pressable style={styles.handoverBtn} onPress={handover}>
                    <Text style={styles.handoverTx}>{tt('cndOrder', '✍️ ລູກຄ້າ ຮັບ ງານ')}{inst.warrantyDays ? ` · ${tt('cndOrder', 'ເລີ່ມ ຮັບປະກັນ')} ${formatWarrantyDays(inst.warrantyDays)}` : ''}</Text>
                  </Pressable>
                )}
                {!!inst.handoverAt && <Row l={tt('cndOrder', '✍️ ຮັບ ງານ ແລ້ວ')} v={fmt(inst.handoverAt)} />}
                {!!inst.warrantyUntil && <View style={styles.warBox}><Text style={styles.warBoxTx}>🛡️ {tt('cndOrder', 'ຮັບປະກັນ ຮອດ')} {fmt(inst.warrantyUntil)}</Text></View>}
              </View>

              {/* before / after — photo gallery (ninesang P4) */}
              <View style={styles.baRow}>
                <View style={styles.baCol}>
                  <Text style={styles.baH}>{tt('cndOrder', 'ຮູບ ກ່ອນ')}</Text>
                  <PhotoPicker photos={inst.beforePhoto ? [inst.beforePhoto] : []} onChange={(imgs) => updateCndInstall(o.id, { beforePhoto: imgs[0] || '' }).catch(() => {})} pathPrefix="cnd/works" max={1} aspect={[4, 3]} />
                  {!!inst.beforeNote && <Text style={styles.baTx}>{inst.beforeNote}</Text>}
                </View>
                <View style={styles.baCol}>
                  <Text style={styles.baH}>{tt('cndOrder', 'ຮູບ ຫຼັງ')}</Text>
                  <PhotoPicker photos={inst.afterPhoto ? [inst.afterPhoto] : []} onChange={(imgs) => updateCndInstall(o.id, { afterPhoto: imgs[0] || '' }).catch(() => {})} pathPrefix="cnd/works" max={1} aspect={[4, 3]} />
                  {!!inst.afterNote && <Text style={styles.baTx}>{inst.afterNote}</Text>}
                </View>
              </View>
              {!!inst.afterPhoto && inst.rating != null && (
                <Text style={styles.baHint}>{tt('cndOrder', '✓ ຮູບ ຫຼັງ + ຄະແນນ ຈະ ຂຶ້ນ ໜ້າ “ຜົນ ງານ ຊ່າງ” ຫຼັງ ອັບເດດ')}</Text>
              )}
              <View style={styles.fbBox}>
                {inst.ratingBefore != null && <View style={styles.fbRow}><Text style={styles.rowL}>{tt('cndOrder', 'ຄາດ ຫວັງ ກ່ອນ')}</Text><Stars n={inst.ratingBefore} /></View>}
                {inst.rating != null && <View style={styles.fbRow}><Text style={styles.rowL}>{tt('cndOrder', 'ພໍໃຈ ຫຼັງ')}</Text><Stars n={inst.rating} /></View>}
                {!!inst.review && <Text style={styles.review}>“{inst.review}”</Text>}
                {inst.rating == null && inst.stage !== 'done' && <Text style={styles.metaMuted}>{tt('cndOrder', 'ຟີດແບັກ ຈະ ມີ ຫຼັງ ຕິດຕັ້ງ ສຳ ເລັດ')}</Text>}
              </View>
            </View>
          ) : (
            <View style={[styles.card, styles.noInstCard]}>
              <Text style={styles.instNo}>{tt('cndOrder', '✕ ບໍ່ ໃຊ້ ຊ່າງ CND')}</Text>
              <Row l={tt('cndOrder', 'ເຫດຜົນ')} v={o.declineReason || tt('cndOrder', '— (ບໍ່ ໄດ້ ລະບຸ)')} />
            </View>
          )}

          {nx && (
            <Pressable style={styles.adv} onPress={() => setCndOrderStatus(o.id, nx).catch(() => {})}>
              <Text style={styles.advTx}>{tt('cndOrder', '→ ປ່ຽນ ສະຖານະ ເປັນ')} “{tt('cndOrder', OSTAT[nx].lao)}”</Text>
            </Pressable>
          )}

          {/* ninesang P4 — chat with the customer (shop side) */}
          {o.uid ? (
            <OrderChat orderId={o.id} as="shop" senderName="CND" title={tt('cndOrder', '💬 ແຊັດ ກັບ ລູກຄ້າ')} />
          ) : (
            <Text style={styles.chatNo}>{tt('cndOrder', '💬 ແຊັດ ໃຊ້ ໄດ້ ເມື່ອ ລູກຄ້າ ສັ່ງ ຕອນ ເຂົ້າ ສູ່ ລະບົບ (ອໍເດີ guest ບໍ່ ມີ ຫ້ອງ ແຊັດ)')}</Text>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return <View style={styles.row}><Text style={styles.rowL}>{l}</Text><Text style={styles.rowV}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  topAccent: { height: 3, backgroundColor: cnd.brand },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: cnd.steel },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: cnd.steel2, alignItems: 'center', justifyContent: 'center' },
  iconTx: { color: cnd.white, fontSize: 22, fontWeight: '900', marginTop: -2 },
  title: { flex: 1, color: cnd.white, fontWeight: '800', fontSize: 15 },
  ostat: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' },
  body: { padding: 12, gap: 9 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaTag: { fontSize: 12, fontWeight: '800', color: cnd.steel, backgroundColor: cnd.surface2, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden' },
  payBtn: { backgroundColor: cnd.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  payBtnTx: { color: cnd.white, fontWeight: '800', fontSize: 13.5 },
  slipImg: { width: '100%', height: 260, backgroundColor: cnd.surface2, borderRadius: 8 },
  slipPaid: { fontSize: 12.5, fontWeight: '800', color: cnd.green, marginTop: 6 },
  metaMuted: { fontSize: 12, color: cnd.ink3 },
  mockPill: { fontSize: 12, color: '#8a6d00', backgroundColor: cnd.yellowSoft, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6, overflow: 'hidden', fontWeight: '700' },
  secH: { fontSize: 14, fontWeight: '800', color: cnd.ink, marginTop: 6 },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 4 },
  big: { fontSize: 14, fontWeight: '700', color: cnd.ink },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 },
  rowL: { fontSize: 12.5, color: cnd.ink3, fontWeight: '600', width: 118 },
  rowV: { flex: 1, fontSize: 13, color: cnd.ink, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  itemDivide: { borderTopWidth: 1, borderTopColor: cnd.line },
  itemName: { fontSize: 13, fontWeight: '700', color: cnd.ink },
  itemMeta: { fontSize: 12, color: cnd.ink3, marginTop: 2 },
  itemSum: { fontSize: 13.5, fontWeight: '900', color: cnd.ink },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: cnd.line, marginTop: 4, paddingTop: 8 },
  totL: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  totV: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  instCard: { borderColor: cnd.brand, borderWidth: 1.5, backgroundColor: cnd.brandSoft },
  instHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  instYes: { fontSize: 14, fontWeight: '900', color: cnd.brandDark },
  linkPill: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden' },
  linkOn: { backgroundColor: cnd.greenSoft, color: cnd.green },
  linkOff: { backgroundColor: cnd.surface2, color: cnd.ink2 },
  techBox: { backgroundColor: cnd.surface, borderRadius: 10, padding: 10, gap: 3, marginTop: 6 },
  assignBox: { backgroundColor: cnd.blueSoft, borderRadius: 10, padding: 10, marginTop: 6, gap: 8 },
  assignH: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  assignBest: { backgroundColor: cnd.brand, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  assignBestTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  assignWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assignChip: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11, maxWidth: '100%' },
  assignChipTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  napRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  napL: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  napChip: { backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  napTx: { fontSize: 12, fontWeight: '700', color: cnd.brandDark },
  handoverBtn: { backgroundColor: cnd.green, borderRadius: 9, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  handoverTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  warBox: { backgroundColor: cnd.blueSoft, borderRadius: 9, padding: 9, marginTop: 6 },
  warBoxTx: { fontSize: 12.5, fontWeight: '800', color: cnd.blue, textAlign: 'center' },
  techName: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  techMeta: { fontSize: 12, color: cnd.ink3, marginBottom: 2 },
  schedBox: { backgroundColor: cnd.surface, borderRadius: 10, padding: 10, gap: 4, marginTop: 8 },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  doneP: { fontSize: 12, fontWeight: '800', color: cnd.green },
  schedP: { fontSize: 12, fontWeight: '800', color: '#8a6d00' },
  onTimeP: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  onTimeOk: { backgroundColor: cnd.greenSoft, color: cnd.green },
  onTimeLate: { backgroundColor: '#fdecec', color: cnd.error },
  doneBtn: { backgroundColor: cnd.green, borderRadius: 9, paddingVertical: 9, alignItems: 'center', marginTop: 4 },
  doneBtnTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  baRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  baCol: { flex: 1, backgroundColor: cnd.surface, borderRadius: 10, padding: 10 },
  baHint: { fontSize: 12, color: cnd.ink3, marginTop: 6 },
  chatNo: { fontSize: 12, color: cnd.ink3, marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
  baH: { fontSize: 12, fontWeight: '800', color: cnd.ink3, marginBottom: 3, textTransform: 'uppercase' },
  baTx: { fontSize: 12.5, color: cnd.ink, lineHeight: 17 },
  fbBox: { backgroundColor: cnd.surface, borderRadius: 10, padding: 10, gap: 5, marginTop: 8 },
  fbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { fontSize: 15, color: cnd.yellow, fontWeight: '900', letterSpacing: 1 },
  starsOff: { color: cnd.line2 },
  review: { fontSize: 13, fontStyle: 'italic', color: cnd.ink2, marginTop: 2 },
  noInstCard: { borderColor: cnd.line2, backgroundColor: cnd.surface2 },
  instNo: { fontSize: 14, fontWeight: '800', color: cnd.ink2, marginBottom: 2 },
  adv: { backgroundColor: cnd.steel, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  advTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  none: { fontSize: 14, color: cnd.ink3, textAlign: 'center', paddingVertical: 60 },
});
