import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import PhotoPicker from '@/components/PhotoPicker';
import BottomSheet from '@/components/BottomSheet';
import {
  confirmReceipt,
  getOrderWithItems,
  type Order,
  type OrderItem,
  ORDER_STATUS_LABEL,
  updateOrderStatus,
} from '@/lib/orders';
import {
  type Claim,
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  type ClaimType,
  canClaimOrder,
  claimPhotoRequired,
  createClaim,
  watchClaimsForOrder,
} from '@/lib/claims';
import { autoReleaseEligible, autoReleaseInfo, escrowMeta, escrowState, releaseCountdown } from '@/lib/escrow';
import { BNPL_MODE_LABEL, installmentDisplayStatus, payBnplInstallment, payoffBnpl } from '@/lib/bnpl';
import { watchAppSettings } from '@/lib/appSettings';
import { type DeliveryTask, DELIVERY_TASK_STATUS_LABEL, tipRider, watchDeliveryTask } from '@/lib/riders';
import { getOrCreateConversation } from '@/lib/chat';
import { createRiderReview, type Review, watchTaskReview } from '@/lib/reviews';
import RiderLiveMap from '@/components/RiderLiveMap';
import OrderTimeline from '@/components/OrderTimeline';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const ESC_TONE: Record<string, { bg: string; border: string; fg: string }> = {
  held: { bg: '#ecfdf5', border: '#a7f3d0', fg: '#065f46' },
  paid: { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' },
  done: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af' },
  disp: { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b' },
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  confirmed: { bg: '#dbeafe', fg: '#1e40af' },
  delivering: { bg: '#dbeafe', fg: '#1e40af' },
  delivered: { bg: '#d1fae5', fg: '#065f46' },
  completed: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#fee', fg: '#991b1b' },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [autoDays, setAutoDays] = useState(7);
  const [bnplGrace, setBnplGrace] = useState(3);
  const [payingSeq, setPayingSeq] = useState<number | null>(null); // seq being paid, -1 = payoff
  const [bnplErr, setBnplErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [autoReleased, setAutoReleased] = useState(false);
  const [task, setTask] = useState<DeliveryTask | null>(null);
  const [riderReview, setRiderReview] = useState<Review | null>(null);
  const [stars, setStars] = useState(5);
  const [rComment, setRComment] = useState('');
  const [rSaving, setRSaving] = useState(false);
  const [tip, setTip] = useState(0);

  // claim form
  const [claimOpen, setClaimOpen] = useState(false);
  const [cType, setCType] = useState<ClaimType>('defective');
  const [cReason, setCReason] = useState('');
  const [cPhotos, setCPhotos] = useState<string[]>([]);
  const [cSaving, setCSaving] = useState(false);
  const [cErr, setCErr] = useState('');

  const reloadOrder = () => getOrderWithItems(String(id)).then((r) => { if (r) { setOrder(r.order); setItems(r.items); } });
  useEffect(() => {
    if (!id) return;
    getOrderWithItems(id).then((r) => {
      if (r) { setOrder(r.order); setItems(r.items); }
      setLoading(false);
    });
  }, [id]);

  const payBnpl = async (seq: number) => {
    if (!order) return;
    setPayingSeq(seq); setBnplErr('');
    try {
      if (seq === -1) await payoffBnpl(order.id); else await payBnplInstallment(order.id, seq);
      await reloadOrder();
    } catch (e: any) {
      setBnplErr(e?.message ?? String(e));
    } finally {
      setPayingSeq(null);
    }
  };

  useEffect(() => {
    if (!id || !fbUser) return;
    return watchClaimsForOrder(id, fbUser.uid, setClaims);
  }, [id, fbUser]);

  useEffect(() => watchAppSettings((s) => { setAutoDays(s.escrowAutoReleaseDays ?? 7); setBnplGrace(s.bnpl?.graceDays ?? 3); }), []);

  // delivery traceability — the assigned HomeSang Express rider (id/name/plate)
  useEffect(() => {
    if (!order?.deliveryTaskId) { setTask(null); return; }
    return watchDeliveryTask(order.deliveryTaskId, setTask);
  }, [order?.deliveryTaskId]);

  useEffect(() => {
    if (!order?.deliveryTaskId) { setRiderReview(null); return; }
    return watchTaskReview(order.deliveryTaskId, setRiderReview);
  }, [order?.deliveryTaskId]);

  const submitRiderRating = async () => {
    if (!task?.id || !task.assignedRiderId || !fbUser) return;
    setRSaving(true);
    try {
      await createRiderReview({
        taskId: task.id,
        raterId: fbUser.uid,
        raterName: (profile as any)?.name || profile?.firstName || tt('orders', 'ຜູ້ໃຊ້'),
        raterImage: profile?.image,
        rateeId: task.assignedRiderId,
        rating: stars,
        comment: rComment.trim() || undefined,
      });
      if (tip > 0) await tipRider(task.id, tip);
      setRComment('');
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally { setRSaving(false); }
  };

  // tick the auto-release countdown while a delivered order is awaiting confirmation
  useEffect(() => {
    if (order?.status !== 'delivered') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [order?.status]);

  // client-assisted auto-release: when the buyer opens a delivered order whose
  // protection window has elapsed (and no claim is open), auto-confirm receipt.
  useEffect(() => {
    if (!order || autoReleased) return;
    if (order.customerId !== fbUser?.uid) return;
    if (autoReleaseEligible(order, claims, autoDays, Date.now())) {
      setAutoReleased(true);
      confirmReceipt(order.id)
        .then(() => setOrder((o) => (o ? { ...o, status: 'completed' } : o)))
        .catch(() => setAutoReleased(false));
    }
  }, [order, claims, autoDays, fbUser, autoReleased]);

  const submitClaim = async () => {
    if (!order || !fbUser) return;
    if (cReason.trim() === '') { setCErr(tt('orders', 'ໃສ່ເຫດຜົນ')); return; }
    if (claimPhotoRequired(cType) && cPhotos.length === 0) { setCErr(tt('orders', 'ການ ຂໍຄືນເງິນ ຕ້ອງ ແນບ ຮູບ ຢ່າງໜ້ອຍ 1 ຮູບ ເປັນ ຫຼັກຖານ')); return; }
    setCSaving(true);
    setCErr('');
    try {
      await createClaim({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: fbUser.uid,
        shopId: order.shopId,
        type: cType,
        reason: cReason.trim(),
        photos: cPhotos.length > 0 ? cPhotos : undefined,
      });
      setCReason(''); setCPhotos([]); setClaimOpen(false);
    } catch (e: any) {
      setCErr(e?.message ?? String(e));
    } finally {
      setCSaving(false);
    }
  };

  const cancelPending = async () => {
    if (!order) return;
    if (!confirm(tt('orders', 'ຍົກເລີກ ຄຳສັ່ງຊື້ ນີ້?'))) return;
    await updateOrderStatus(order.id, 'cancelled');
    setOrder({ ...order, status: 'cancelled' });
  };
  const openCancelRequest = () => {
    setCType('return');
    setCReason(tt('orders', 'ຂໍ ຍົກເລີກ ອໍເດີ ກ່ອນ ສົ່ງ'));
    setClaimOpen(true);
  };
  const doConfirmReceipt = async () => {
    if (!order) return;
    if (typeof confirm === 'function' && !confirm(tt('orders', 'ຢືນຢັນ ວ່າ ໄດ້ຮັບ ສິນຄ້າ ຄົບ ແລ້ວ? ອໍເດີ ຈະ ສຳເລັດ.'))) return;
    await confirmReceipt(order.id);
    setOrder({ ...order, status: 'completed' });
  };

  if (loading) return <View style={styles.center}><Text>{tt('orders', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('orders', 'ບໍ່ພົບການສັ່ງຊື້')}</Text>
        <BackButton onPress={() => router.replace('/orders' as any)} />
      </View>
    );
  }
  const c = STATUS_COLORS[order.status] ?? STATUS_COLORS.completed;
  const isOwner = order.customerId === fbUser?.uid;
  const claimCheck = canClaimOrder(order, claims);
  const canClaim = isOwner && claimCheck.ok;
  const esc = escrowMeta(escrowState(order, claims), order.paymentMethod === 'cod');
  const tone = ESC_TONE[esc.tone];
  const auto = autoReleaseInfo(order, autoDays, now);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Text style={styles.num}>#{order.orderNumber}</Text>
          <View style={[styles.pill, { backgroundColor: c.bg }]}>
            <Text style={[styles.pillText, { color: c.fg }]}>{tt('orderStatus', ORDER_STATUS_LABEL[order.status])}</Text>
          </View>
        </View>

        {/* escrow-lite protection banner */}
        <View style={[styles.escBanner, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Text style={[styles.escBTitle, { color: tone.fg }]}>{esc.emoji} {esc.title}</Text>
          <Text style={styles.escBBody}>{esc.body}</Text>
          {esc.state === 'held' && auto.active && !auto.overdue && (
            <View style={styles.escClock}>
              <Text style={styles.escClockText}>⏰ {tt('orders', 'ຢືນຢັນ ອັດຕະໂນມັດ ໃນ')} {releaseCountdown(auto.remainingMs)}</Text>
            </View>
          )}
        </View>
        {isOwner && esc.state === 'held' && (order.status === 'delivering' || order.status === 'delivered') && (
          <Pressable style={styles.confirmBtn} onPress={doConfirmReceipt}>
            <Text style={styles.confirmBtnText}>✓ {tt('orders', 'ຢືນຢັນ ຮັບ ຂອງ (ປ່ອຍ ເງິນ ໃຫ້ ຮ້ານ)')}</Text>
          </Pressable>
        )}

        <Text style={styles.section}>{tt('orders', 'ຕິດຕາມ ຄຳສັ່ງຊື້')}</Text>
        <OrderTimeline order={order} />

        <Text style={styles.section}>{tt('orders', 'ລາຍການ')}</Text>
        {items.map((it) => (
          <View key={it.id} style={styles.item}>
            <Image source={{ uri: it.imageUrl }} style={styles.img} />
            <View style={{ flex: 1 }}>
              <Text style={styles.iname} numberOfLines={2}>{it.productName}</Text>
              {!!it.variantLabel && <Text style={styles.imeta}>{it.variantLabel}</Text>}
              <Text style={styles.imeta}>{it.quantity} × {it.unitPrice.toLocaleString()} {it.unit}</Text>
            </View>
            <Text style={styles.itotal}>{it.total.toLocaleString()}</Text>
          </View>
        ))}

        <View style={styles.summary}>
          <Row label={tt('orders', 'ລວມຍ່ອຍ')} v={order.subtotal} />
          {!!order.memberDiscount && order.memberDiscount > 0 && (
            <View style={styles.srow}><Text style={styles.srowL}>{tt('orders', '👥 ສ່ວນຫຼຸດສະມາຊິກ')}</Text><Text style={styles.srowL}>−{order.memberDiscount.toLocaleString()} LAK</Text></View>
          )}
          <Row label={tt('orders', 'ຄ່າສົ່ງ')} v={order.deliveryFee} />
          <Row label={`VAT ${order.vatRate}%`} v={order.vat} />
          {!!order.pointsDiscount && order.pointsDiscount > 0 && (
            <View style={styles.srow}><Text style={styles.srowL}>{tt('orders', '💎 ຫຼຸດຈາກແຕ້ມ')}</Text><Text style={styles.srowL}>−{order.pointsDiscount.toLocaleString()} LAK</Text></View>
          )}
          <View style={styles.srow}><Text style={styles.totalL}>{tt('orders', 'ລວມທັງໝົດ')}</Text><Text style={styles.totalV}>{order.grandTotal.toLocaleString()} LAK</Text></View>
        </View>

        <View style={styles.info}>
          <Text style={styles.infoRow}>{tt('orders', 'ການຈ່າຍ:')} {order.paymentMethod === 'wallet' ? tt('orders', '👛 ກະເປົາ ເງິນ') : order.paymentMethod === 'bank_transfer' ? tt('orders', '🏦 ໂອນທະນາຄານ') : tt('orders', '💵 ເກັບປາຍທາງ')}</Text>
          <Text style={styles.infoRow}>{tt('orders', 'ສະຖານະຈ່າຍ:')} {order.paymentVerified ? tt('orders', '✅ ຢືນຢັນແລ້ວ') : tt('orders', '⏳ ລໍກວດ')}</Text>
          <Text style={styles.infoRow}>{tt('orders', 'ການຮັບ:')} {order.deliveryMethod === 'delivery' ? tt('orders', '🚚 ສົ່ງເຖິງບ້ານ') : tt('orders', '🏬 ມາຮັບ')}</Text>
          {order.logisticsProviderName ? <Text style={styles.infoRow}>🚚 {order.logisticsProviderName}</Text> : null}
          {order.trackingNumber ? <Text style={styles.infoRowB}>📦 {tt('orders', 'ເລກ tracking:')} {order.trackingNumber}</Text> : null}
          {order.deliveryAddress ? <Text style={styles.infoRow}>📍 {order.deliveryAddress}</Text> : null}
        </View>

        {/* ===== BNPL installment schedule + repayment ===== */}
        {order.isBnpl && order.bnpl && (() => {
          const b = order.bnpl!;
          const unpaid = b.installments.filter((x) => x.status !== 'paid');
          const paidCount = b.installments.length - unpaid.length;
          const dueOrOver = unpaid.filter((x) => installmentDisplayStatus(x, now, bnplGrace) !== 'upcoming');
          const nextUnpaid = unpaid.slice().sort((a, c) => a.dueAt - c.dueAt)[0];
          const done = b.status === 'completed';
          return (
            <View style={styles.bnplCard}>
              <View style={styles.bnplHead}>
                <Text style={styles.bnplTitle}>💳 {tt('orders', 'ການ ຜ່ອນ')} · {tt('orders', BNPL_MODE_LABEL[b.mode])}</Text>
                <Text style={[styles.bnplPill, done ? styles.bnplPillDone : b.status === 'overdue' ? styles.bnplPillOver : styles.bnplPillOn]}>
                  {done ? tt('orders', 'ຄົບ ແລ້ວ') : b.status === 'overdue' ? tt('orders', 'ຄ້າງ ຊຳລະ') : tt('orders', 'ກຳລັງ ຜ່ອນ')}
                </Text>
              </View>
              <View style={styles.bnplStrip}>
                <View style={styles.bnplStat}><Text style={styles.bnplStatV}>{paidCount}/{b.installments.length}</Text><Text style={styles.bnplStatK}>{tt('orders', 'ຈ່າຍ ແລ້ວ')}</Text></View>
                <View style={styles.bnplStat}><Text style={[styles.bnplStatV, dueOrOver.length > 0 && { color: '#ea580c' }]}>{dueOrOver.length}</Text><Text style={styles.bnplStatK}>{tt('orders', 'ຄົບ ກຳນົດ')}</Text></View>
                <View style={styles.bnplStat}><Text style={styles.bnplStatV}>{(order.bnplOutstanding ?? 0).toLocaleString()}</Text><Text style={styles.bnplStatK}>{tt('orders', 'ຍອດ ຄ້າງ')}</Text></View>
              </View>
              {b.down > 0 && (
                <View style={styles.instRow}>
                  <View style={[styles.instDot, styles.instPaid]}><Text style={styles.instDotT}>✓</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.instLabel}>{tt('orders', 'ດາວນ໌')}</Text></View>
                  <Text style={styles.instAmt}>{b.down.toLocaleString()}</Text>
                </View>
              )}
              {b.installments.map((x) => {
                const st = installmentDisplayStatus(x, now, bnplGrace);
                const dotStyle = st === 'paid' ? styles.instPaid : st === 'overdue' ? styles.instOver : st === 'due' ? styles.instDue : styles.instUp;
                const canPay = !done && st !== 'paid' && nextUnpaid?.seq === x.seq;
                return (
                  <View key={x.seq} style={styles.instRow}>
                    <View style={[styles.instDot, dotStyle]}><Text style={styles.instDotT}>{st === 'paid' ? '✓' : x.seq}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.instLabel}>{tt('orders', 'ງວດ')} {x.seq}/{b.installments.length}</Text>
                      <Text style={styles.instDate}>{new Date(x.dueAt).toLocaleDateString()}{x.lateFee ? ` · +${x.lateFee.toLocaleString()} ${tt('orders', 'ຄ່າ ປັບ')}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.instAmt}>{(x.amount + (x.lateFee || 0)).toLocaleString()}</Text>
                      {canPay ? (
                        <Pressable style={[styles.payBtn, payingSeq != null && styles.payBtnOff]} disabled={payingSeq != null} onPress={() => payBnpl(x.seq)}>
                          <Text style={styles.payBtnT}>{payingSeq === x.seq ? tt('orders', '...') : tt('orders', 'ຈ່າຍ')}</Text>
                        </Pressable>
                      ) : (
                        <Text style={[styles.instTag, st === 'paid' ? styles.tagPaid : st === 'overdue' ? styles.tagOver : st === 'due' ? styles.tagDue : styles.tagUp]}>
                          {st === 'paid' ? tt('orders', 'ຈ່າຍ ແລ້ວ') : st === 'overdue' ? tt('orders', 'ຄ້າງ') : st === 'due' ? tt('orders', 'ຄົບ ກຳນົດ') : tt('orders', 'ລໍ ຮອດ')}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {!!bnplErr && <Text style={styles.bnplErr}>{bnplErr}</Text>}
              {!done && unpaid.length > 1 && (
                <Pressable style={[styles.payoffBtn, payingSeq != null && styles.payBtnOff]} disabled={payingSeq != null} onPress={() => payBnpl(-1)}>
                  <Text style={styles.payoffBtnT}>{payingSeq === -1 ? tt('orders', 'ກຳລັງ ດຳເນີນ...') : `${tt('orders', 'ຈ່າຍ ໝົດ ກ່ອນ ກຳນົດ')} · ${(order.bnplOutstanding ?? 0).toLocaleString()} (${tt('orders', 'ຫຼຸດ ຄ່າ ບໍລິການ')})`}</Text>
                </Pressable>
              )}
            </View>
          );
        })()}

        {/* delivery traceability — who carried the goods (security / warranty) */}
        {task?.assignedRiderId && (
          <View style={styles.trace}>
            <Text style={styles.traceTitle}>🛵 {tt('orders', 'ຈັດສົ່ງ ໂດຍ (ຕິດຕາມ)')}</Text>
            <Text style={styles.traceRow}>{tt('orders', 'ຊື່')}: <Text style={styles.traceB}>{task.assignedRiderName ?? '—'}</Text></Text>
            {!!task.riderPlate && <Text style={styles.traceRow}>🚗 {tt('orders', 'ປ້າຍທະບຽນ')}: <Text style={styles.traceB}>{task.riderPlate}</Text></Text>}
            <Text style={styles.traceRow}>{tt('orders', 'ລະຫັດໄຣເດີ້')}: <Text style={styles.traceMono}>{task.assignedRiderId.slice(0, 8)}</Text> · {tt('deliveryTask', DELIVERY_TASK_STATUS_LABEL[task.status])}</Text>
            {!!task.riderPhone && (
              <View style={styles.traceActions}>
                <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${task.riderPhone}`)}>
                  <Text style={styles.callBtnText}>📞 {tt('orders', 'ໂທ ຫາ ໄຣເດີ້')}</Text>
                </Pressable>
                <Pressable style={styles.chatBtn} onPress={async () => {
                  if (!fbUser || !task.assignedRiderId) return;
                  try {
                    const cid = await getOrCreateConversation(fbUser.uid, task.assignedRiderId);
                    router.push(`/chat/${cid}` as any);
                  } catch (e: any) { alert(e?.message ?? String(e)); }
                }}>
                  <Text style={styles.chatBtnText}>💬 {tt('orders', 'ແຊັດ')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* live rider map while they share their position */}
        {isOwner && !!task && <RiderLiveMap task={task} />}

        {/* rate the rider once the delivery is done */}
        {isOwner && task?.status === 'delivered' && !!task.assignedRiderId && (
          <View style={styles.rateCard}>
            <Text style={styles.rateTitle}>⭐ {tt('orders', 'ໃຫ້ ຄະແນນ ການ ຈັດສົ່ງ')}</Text>
            {riderReview ? (
              <Text style={styles.rateDone}>{'⭐'.repeat(riderReview.rating)} · {tt('orders', 'ຂອບໃຈ ສຳລັບ ຄະແນນ')}</Text>
            ) : (
              <>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setStars(n)}>
                      <Text style={styles.star}>{n <= stars ? '⭐' : '☆'}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={rComment} onChangeText={setRComment} placeholder={tt('orders', 'ຄຳ ເຫັນ (ບໍ່ ບັງຄັບ)')} placeholderTextColor="#999" style={styles.rateInput} />

                {/* optional tip — paid to the rider in full */}
                <Text style={styles.tipLabel}>💝 {tt('orders', 'ເພີ່ມ ທິບ (ບໍ່ ບັງຄັບ)')}</Text>
                <View style={styles.tipRow}>
                  {[0, 5000, 10000, 20000].map((amt) => (
                    <Pressable key={amt} style={[styles.tipBtn, tip === amt && styles.tipBtnOn]} onPress={() => setTip(amt)}>
                      <Text style={[styles.tipBtnText, tip === amt && styles.tipBtnTextOn]}>{amt === 0 ? tt('orders', 'ບໍ່ໃຫ້') : amt.toLocaleString()}</Text>
                    </Pressable>
                  ))}
                </View>
                {tip > 0 && <Text style={styles.tipNote}>{tt('orders', 'ໄຣເດີ້ ໄດ້ ທິບ ເຕັມ')} {tip.toLocaleString()} ₭ ({tt('orders', 'ບໍ່ ຫັກ ທຳນຽມ')}) — {tt('orders', 'ທີມງານ ຈະ ຢືນຢັນ ກ່ອນ ຈ່າຍ ໃຫ້ ໄຣເດີ້')}</Text>}

                <Pressable style={[styles.rateBtn, rSaving && { opacity: 0.6 }]} onPress={submitRiderRating} disabled={rSaving}>
                  <Text style={styles.rateBtnText}>{rSaving ? '...' : tip > 0 ? tt('orders', 'ສົ່ງ ຄະແນນ + ທິບ') : tt('orders', 'ສົ່ງ ຄະແນນ')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* handover code — the buyer reads this out to the rider on delivery */}
        {isOwner && !!task?.handoverCode && task.status !== 'delivered' && task.status !== 'cancelled' && (
          <View style={styles.codeCard}>
            <Text style={styles.codeTitle}>🔑 {tt('orders', 'ລະຫັດ ຢືນຢັນ ຮັບ ເຄື່ອງ')}</Text>
            <Text style={styles.codeBig}>{task.handoverCode}</Text>
            <Text style={styles.codeHint}>{tt('orders', 'ບອກ ລະຫັດ ນີ້ ໃຫ້ ໄຣເດີ້ ຕອນ ຮັບ ເຄື່ອງ ເທົ່ານັ້ນ')}</Text>
          </View>
        )}

        {order.slipUrl ? (
          <>
            <Text style={styles.section}>{tt('orders', 'ສະລິບໂອນເງິນ')}</Text>
            <Image source={{ uri: order.slipUrl }} style={styles.slip} />
          </>
        ) : null}

        {isOwner && order.status === 'pending' && (
          <Pressable style={styles.cancelBtn} onPress={cancelPending}>
            <Text style={styles.cancelBtnText}>{tt('orders', '✕ ຍົກເລີກ ຄຳສັ່ງຊື້')}</Text>
          </Pressable>
        )}
        {isOwner && order.status === 'confirmed' && (
          <Pressable style={styles.cancelBtn} onPress={openCancelRequest}>
            <Text style={styles.cancelBtnText}>{tt('orders', '✕ ຂໍ ຍົກເລີກ ອໍເດີ (ກ່ອນ ສົ່ງ)')}</Text>
          </Pressable>
        )}
        {isOwner && (claims.length > 0 || canClaim) && (
          <>
            <Text style={styles.section}>{tt('orders', 'ການ ຮ້ອງຮຽນ / ສອບຖາມ / ຄືນເງິນ')}</Text>
            {claims.map((cl) => (
              <View key={cl.id} style={styles.claimCard}>
                <View style={styles.claimRow}>
                  <Text style={styles.claimType}>{tt('claim', CLAIM_TYPE_LABEL[cl.type])}</Text>
                  <Text style={styles.claimStatus}>{tt('claim', CLAIM_STATUS_LABEL[cl.status])}</Text>
                </View>
                <Text style={styles.claimReason}>{cl.reason}</Text>
                {cl.refundAmount ? <Text style={styles.claimRefund}>{tt('orders', '💰 ຄືນເງິນ')} {cl.refundAmount.toLocaleString()} {tt('orders', 'ກີບ')}</Text> : null}
                {cl.adminNote ? <Text style={styles.claimNote}>📝 {cl.adminNote}</Text> : null}
              </View>
            ))}
            {canClaim ? (
              <Pressable style={styles.claimBtn} onPress={() => setClaimOpen(true)}>
                <Text style={styles.claimBtnText}>{tt('orders', '⚠️ ແຈ້ງບັນຫາ / ສອບຖາມ / ຂໍຄືນເງິນ')}</Text>
              </Pressable>
            ) : claims.length === 0 && claimCheck.reason ? (
              <Text style={styles.claimBlocked}>🔒 {claimCheck.reason}</Text>
            ) : null}
          </>
        )}

        <BackButton label={tt('orders', 'ການສັ່ງຊື້ທັງໝົດ')} onPress={() => router.replace('/orders' as any)} />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>

    <BottomSheet visible={claimOpen} onClose={() => setClaimOpen(false)}>
      <View>
        <Text style={styles.sheetTitle}>{tt('orders', '⚠️ ແຈ້ງບັນຫາ / ສອບຖາມ / ຂໍຄືນເງິນ')}</Text>
        <Text style={styles.cLabel}>{tt('orders', 'ປະເພດ')}</Text>
        <View style={styles.cTypes}>
          {(Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]).map((t) => (
            <Pressable key={t} style={[styles.cChip, cType === t && styles.cChipOn]} onPress={() => setCType(t)}>
              <Text style={[styles.cChipText, cType === t && styles.cChipTextOn]}>{tt('claim', CLAIM_TYPE_LABEL[t])}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.cLabel}>{tt('orders', 'ເຫດຜົນ')}</Text>
        <TextInput value={cReason} onChangeText={setCReason} placeholder={tt('orders', 'ບອກລາຍລະອຽດບັນຫາ')} placeholderTextColor="#999" style={[styles.cInput, { minHeight: 70, textAlignVertical: 'top' }]} multiline />
        <Text style={styles.cLabel}>{tt('orders', 'ຮູບ')} {claimPhotoRequired(cType) ? tt('orders', '(ບັງຄັບ ຢ່າງໜ້ອຍ 1 ຮູບ)') : tt('orders', '(ບໍ່ບັງຄັບ)')}</Text>
        <PhotoPicker photos={cPhotos} onChange={setCPhotos} pathPrefix={`claims/${fbUser?.uid ?? 'anon'}`} max={3} />
        {cErr !== '' && <Text style={styles.cErr}>❌ {cErr}</Text>}
        <Pressable style={[styles.claimBtn, cSaving && { opacity: 0.6 }]} onPress={submitClaim} disabled={cSaving}>
          <Text style={styles.claimBtnText}>{cSaving ? tt('orders', 'ກຳລັງສົ່ງ...') : tt('orders', '↩️ ສົ່ງຄຳຮ້ອງ')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
    </View>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (<View style={styles.srow}><Text style={styles.srowL}>{label}</Text><Text style={styles.srowL}>{v.toLocaleString()} LAK</Text></View>);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, alignItems: 'center', paddingBottom: 60 },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  section: { fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  img: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f3f4f6' },
  iname: { fontSize: 14, fontWeight: '600', color: '#111' },
  imeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  itotal: { fontSize: 14, fontWeight: '700', color: '#0066CC' },
  summary: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginTop: 10, backgroundColor: '#fff' },
  srow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  srowL: { fontSize: 14, color: '#4b5563' },
  totalL: { fontSize: 15, fontWeight: '700', color: '#111' },
  totalV: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
  info: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginTop: 10, backgroundColor: '#fff', gap: 4 },
  infoRow: { fontSize: 12, color: '#374151' },
  // BNPL schedule card
  bnplCard: { borderWidth: 1, borderColor: '#fed7aa', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10 },
  bnplHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bnplTitle: { fontSize: 14, fontWeight: '800', color: '#9a3412' },
  bnplPill: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  bnplPillOn: { color: '#c2410c', backgroundColor: '#ffedd5' },
  bnplPillOver: { color: '#b91c1c', backgroundColor: '#fee2e2' },
  bnplPillDone: { color: '#15803d', backgroundColor: '#dcfce7' },
  bnplStrip: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  bnplStat: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  bnplStatV: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  bnplStatK: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  instDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  instDotT: { fontSize: 12, fontWeight: '900', color: '#fff' },
  instPaid: { backgroundColor: '#22c55e' },
  instDue: { backgroundColor: '#f97316' },
  instOver: { backgroundColor: '#dc2626' },
  instUp: { backgroundColor: '#cbd5e1' },
  instLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  instDate: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  instAmt: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  instTag: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7, marginTop: 3, overflow: 'hidden' },
  tagPaid: { color: '#15803d', backgroundColor: '#dcfce7' },
  tagDue: { color: '#c2410c', backgroundColor: '#ffedd5' },
  tagOver: { color: '#b91c1c', backgroundColor: '#fee2e2' },
  tagUp: { color: '#64748b', backgroundColor: '#f1f5f9' },
  payBtn: { backgroundColor: '#f97316', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14, marginTop: 3 },
  payBtnOff: { opacity: 0.5 },
  payBtnT: { color: '#fff', fontSize: 12, fontWeight: '900' },
  payoffBtn: { borderWidth: 1.5, borderColor: '#0066CC', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  payoffBtnT: { color: '#0066CC', fontSize: 13, fontWeight: '800' },
  bnplErr: { color: '#dc2626', fontSize: 12, fontWeight: '700', marginTop: 8 },
  infoRowB: { fontSize: 12, color: '#5b21b6', fontWeight: '700' },
  trace: { borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 10, padding: 14, marginTop: 10, gap: 4 },
  traceTitle: { fontSize: 13, fontWeight: '800', color: '#3730a3', marginBottom: 2 },
  traceRow: { fontSize: 12, color: '#374151' },
  traceB: { fontWeight: '700', color: '#111' },
  traceMono: { fontFamily: 'monospace', fontWeight: '700', color: '#111' },
  traceActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  callBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  callBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chatBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC', borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  chatBtnText: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
  codeCard: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center' },
  codeTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  codeBig: { fontSize: 32, fontWeight: '900', color: '#92400e', letterSpacing: 8, marginVertical: 6 },
  codeHint: { fontSize: 12, color: '#92400e', textAlign: 'center' },
  rateCard: { borderWidth: 1, borderColor: '#eef0f3', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10 },
  rateTitle: { fontSize: 13, fontWeight: '800', color: '#111' },
  rateDone: { fontSize: 14, color: '#16a34a', fontWeight: '700', marginTop: 8, textAlign: 'center' },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 10 },
  star: { fontSize: 28 },
  rateInput: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 13, color: '#111' },
  rateBtn: { backgroundColor: '#0066CC', borderRadius: 9, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  rateBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tipLabel: { fontSize: 12, color: '#6b7280', marginTop: 12, fontWeight: '600' },
  tipRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tipBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  tipBtnOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  tipBtnText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  tipBtnTextOn: { color: '#fff' },
  tipNote: { fontSize: 12, color: '#166534', marginTop: 6, fontWeight: '600' },
  escBanner: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  escBTitle: { fontSize: 14, fontWeight: '800' },
  escBBody: { fontSize: 12, color: '#374151', marginTop: 5, lineHeight: 18 },
  escClock: { backgroundColor: '#064e3b', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  escClockText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  confirmBtn: { backgroundColor: '#059669', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  slip: { width: '100%', height: 240, borderRadius: 10, backgroundColor: '#f3f4f6' },
  claimCard: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 8 },
  claimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  claimType: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  claimStatus: { fontSize: 12, fontWeight: '700', color: '#92400e', backgroundColor: '#fde68a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  claimReason: { fontSize: 12, color: '#374151', marginTop: 6 },
  claimRefund: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 4 },
  claimNote: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  claimBtn: { borderWidth: 1, borderColor: '#EA580C', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  claimBtnText: { color: '#EA580C', fontSize: 14, fontWeight: '700' },
  claimBlocked: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 8 },
  cancelBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 18 },
  cancelBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  shippedNote: { fontSize: 12, color: '#9a3412', backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, marginTop: 18 },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  cLabel: { fontSize: 12, color: '#6b7280', marginTop: 12, marginBottom: 4 },
  cTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  cChipOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  cChipText: { fontSize: 12, color: '#475569' },
  cChipTextOn: { color: '#0066CC', fontWeight: '700' },
  cInput: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  cErr: { color: '#c00', fontSize: 12, marginTop: 10 },
});
