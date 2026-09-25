import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ttStatic, useTT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';
import LocationMap from '@/components/LocationMap';
import JobTimeline from '@/components/JobTimeline';
import QuotationBuilder, { type QuoteDraft } from '@/components/QuotationBuilder';
import RatingModal from '@/components/RatingModal';
import TermsModal from '@/components/TermsModal';
import PhotoPicker from '@/components/PhotoPicker';
import { addJobUpdate, type JobUpdate, watchJobUpdates } from '@/lib/jobUpdates';
import { createReview } from '@/lib/reviews';
import { incrementSurveyUsage } from '@/lib/surveyTemplates';
import { getOrCreateConversation } from '@/lib/chat';
import {
  cancelJob,
  confirmInstallment,
  getProviderAbandonCount,
  confirmPaymentReceived,
  confirmWorkDone,
  type Job,
  JOB_STATUS_LABEL,
  markInstallmentPaid,
  markPaidByCustomer,
  type PaymentMethod,
  PAYMENT_METHOD_LABEL,
  confirmArrival,
  reassignJob,
  setJobProgress,
  setTermsAccepted,
  startJob,
  technicianMarkDone,
  watchJob,
} from '@/lib/jobs';
import {
  acceptBid,
  acceptLineCounter,
  type Bid,
  computeQuote,
  createBid,
  declineLineCounter,
  type LineCounterItem,
  openQuoteInChat,
  type QuoteItem,
  requestBidRevision,
  reviseBid,
  sendLineCounter,
  watchBidsForJob,
  withdrawBid,
} from '@/lib/bids';
import { createDispute, type Dispute, DISPUTE_STATUS_LABEL, watchDisputesForJob } from '@/lib/disputes';
import { distanceKm } from '@/lib/geo';
import { groupThousands } from '@/lib/format';
import { watchAsset, warrantyStatus, paramComparison, type Asset } from '@/lib/assets';
import { approveVariation, createVariation, type JobVariation, rejectVariation, watchVariationsForJob } from '@/lib/variations';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#d1fae5', fg: '#065f46' },
  assigned: { bg: '#fef3c7', fg: '#92400e' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  completed: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee', fg: '#991b1b' },
  pending_payment: { bg: '#ede9fe', fg: '#5b21b6' },
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const BID_STATUS_LABEL: Record<string, string> = {
  pending: ttStatic('jobDetail', 'ລໍຕອບ'),
  accepted: ttStatic('jobDetail', '✓ ຖືກເລືອກ'),
  rejected: ttStatic('jobDetail', 'ບໍ່ຖືກເລືອກ'),
  withdrawn: ttStatic('jobDetail', 'ຖອນແລ້ວ'),
};

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const { can } = usePermissions();
  const [job, setJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [bids, setBids] = useState<Bid[]>([]);
  const [abandonByTech, setAbandonByTech] = useState<Record<string, number>>({});
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  // progress updates (during the job)
  const [updates, setUpdates] = useState<JobUpdate[]>([]);
  const [updNote, setUpdNote] = useState('');
  const [updPhotos, setUpdPhotos] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  // mid-job variations / change-orders
  const [variations, setVariations] = useState<JobVariation[]>([]);
  const [varItems, setVarItems] = useState<QuoteItem[]>([{ desc: '', qty: 1, unit: 'ອັນ', unitPrice: 0 }]);
  const [varNote, setVarNote] = useState('');
  const [varOpen, setVarOpen] = useState(false);
  const [varSending, setVarSending] = useState(false);

  // quotation form (non-owner technician)
  const [quote, setQuote] = useState<QuoteDraft | null>(null);
  const [revising, setRevising] = useState(false); // tech editing their submitted quote
  const [revReqFor, setRevReqFor] = useState<string | null>(null); // owner: bid whose revision composer is open
  const [revReqNote, setRevReqNote] = useState('');
  const [revReqScope, setRevReqScope] = useState<'whole' | 'line'>('whole');
  const [revReqLineIdx, setRevReqLineIdx] = useState(0);
  const [revReqType, setRevReqType] = useState<'percent' | 'amount' | 'other'>('percent');
  const [revReqValue, setRevReqValue] = useState('');
  const [revReqSending, setRevReqSending] = useState(false);
  // line-level counter (owner builds a per-line counter-BOQ)
  const [lcFor, setLcFor] = useState<string | null>(null);
  const [lcLines, setLcLines] = useState<LineCounterItem[]>([]);
  const [lcNote, setLcNote] = useState('');
  const [lcBusy, setLcBusy] = useState(false);
  const [lcApplyFor, setLcApplyFor] = useState<string | null>(null); // tech: bid being accepted/declined
  const [termsForBid, setTermsForBid] = useState<Bid | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState('');
  // post-job review
  const [ratingFor, setRatingFor] = useState<null | 'tech' | 'customer'>(null);
  const tt = useTT();

  useEffect(() => {
    if (!id) return;
    setJobLoading(true);
    const unsub = watchJob(id, (j) => {
      setJob(j);
      setJobLoading(false);
    });
    return unsub;
  }, [id]);

  useEffect(() => {
    // bids are readable only by signed-in users; public browsers skip the subscription
    if (!id || !fbUser) {
      setBids([]);
      return;
    }
    const unsub = watchBidsForJob(id, setBids);
    return unsub;
  }, [id, fbUser]);

  useEffect(() => {
    if (!id || !fbUser) {
      setDisputes([]);
      return;
    }
    return watchDisputesForJob(id, setDisputes);
  }, [id, fbUser]);

  // owner-only: pull each bidding technician's mid-job drop-out count
  useEffect(() => {
    const owner = !!job && fbUser?.uid === job.customerId;
    if (!owner) return;
    const ids = Array.from(new Set(bids.filter((b) => b.status !== 'withdrawn').map((b) => b.technicianId)));
    ids.forEach((tid) => {
      if (abandonByTech[tid] !== undefined) return;
      getProviderAbandonCount(tid)
        .then((n) => setAbandonByTech((p) => ({ ...p, [tid]: n })))
        .catch(() => {});
    });
  }, [bids, job, fbUser]);

  useEffect(() => {
    if (!id || !fbUser) {
      setUpdates([]);
      return;
    }
    return watchJobUpdates(id, setUpdates);
  }, [id, fbUser]);

  useEffect(() => {
    if (!id || !fbUser) {
      setVariations([]);
      return;
    }
    return watchVariationsForJob(id, setVariations);
  }, [id, fbUser]);

  const handleCancel = async () => {
    if (!job) return;
    if (!confirm(tt('jobDetail', 'ຍົກເລີກງານ?'))) return;
    setCancelling(true);
    try {
      await cancelJob(job.id);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setCancelling(false);
    }
  };

  const handleAbandon = async () => {
    if (!job || !fbUser) return;
    if (!confirm(tt('jobDetail', 'ແຈ້ງ ວ່າ ຊ່າງ ບໍ່ ມາ / ກ່ຽງງານ? ລະບົບ ຈະ ເປີດ ງານ ໃໝ່ ໃຫ້ ຫາ ຊ່າງ ຄົນ ໃໝ່ ແລະ ສົ່ງ ເລື່ອງ ໃຫ້ ທີມ HomeSang ກວດ.'))) return;
    try {
      await createDispute({
        jobId: job.id,
        jobTitle: job.title,
        raisedBy: fbUser.uid,
        raiserName: profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('jobDetail', 'ລູກຄ້າ'),
        raiserRole: 'customer',
        counterpartyId: job.assignedProviderId ?? undefined,
        reason: tt('jobDetail', 'ຊ່າງ ບໍ່ ມາ ຕາມ ນັດ / ກ່ຽງງານ'),
      });
      await reassignJob(job.id, tt('jobDetail', 'ຊ່າງ ກ່ຽງງານ'));
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    }
  };

  // choosing a technician opens the job-specific terms first
  const handleAccept = (bidId: string) => {
    const b = bids.find((x) => x.id === bidId);
    if (!b) return;
    // an expired quote can't be accepted — ask the tech to refresh it first
    if (typeof b.validUntil === 'number' && b.validUntil < Date.now()) {
      alert(tt('jobDetail', 'ໃບ ສະເໜີ ນີ້ ໝົດ ອາຍຸ ແລ້ວ — ກະລຸນາ ຂໍ ໃຫ້ ຊ່າງ ອອກ ໃບ ສະເໜີ ໃໝ່ ກ່ອນ'));
      return;
    }
    setTermsForBid(b);
  };
  const confirmAccept = async () => {
    if (!fbUser || !job || !termsForBid) return;
    const b = termsForBid;
    setTermsForBid(null);
    const name = profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || tt('jobDetail', 'ລູກຄ້າ');
    try {
      await acceptBid(b.id, fbUser.uid);
      await setTermsAccepted(job.id, name);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    }
  };

  const messageCounterpart = async () => {
    if (!fbUser || !job) return;
    const other = isOwner ? job.assignedProviderId : job.customerId;
    if (!other) return;
    try {
      const cid = await getOrCreateConversation(fbUser.uid, other, {
        jobId: job.id,
        jobTitle: job.title,
      });
      router.push(`/chat/${cid}` as any);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    }
  };

  // owner opens the negotiation chat with a specific bidding technician
  const chatWithBidder = async (technicianId: string) => {
    if (!fbUser || !job) return;
    try {
      const cid = await getOrCreateConversation(fbUser.uid, technicianId, { jobId: job.id, jobTitle: job.title });
      router.push(`/chat/${cid}` as any);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    }
  };

  // owner opens the price negotiation: seeds this quote as a card in chat, where
  // they can counter-offer and the tech responds (accept / counter / decline)
  const negotiateInChat = async (bidId: string) => {
    if (!fbUser) return;
    try {
      const cid = await openQuoteInChat(bidId, fbUser.uid);
      router.push(`/chat/${cid}` as any);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    if (!fbUser || !job) return;
    const raterName =
      profile?.name ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      tt('jobDetail', 'ຜູ້ໃຊ້');
    if (ratingFor === 'tech' && job.assignedProviderId) {
      await createReview({
        jobId: job.id,
        raterId: fbUser.uid,
        raterName,
        raterImage: profile?.image,
        rateeId: job.assignedProviderId,
        role: 'technician',
        rating,
        comment: comment || undefined,
        jobFlagField: 'customerReviewed',
      });
    } else if (ratingFor === 'customer') {
      await createReview({
        jobId: job.id,
        raterId: fbUser.uid,
        raterName,
        raterImage: profile?.image,
        rateeId: job.customerId,
        role: 'customer',
        rating,
        comment: comment || undefined,
        jobFlagField: 'techReviewed',
      });
    }
  };

  const postUpdate = async () => {
    if (!fbUser || !job) return;
    if (!updNote.trim() && updPhotos.length === 0) return;
    const myName =
      profile?.name ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      undefined;
    setPosting(true);
    try {
      await addJobUpdate({
        jobId: job.id,
        by: fbUser.uid,
        byName: myName,
        byRole: fbUser.uid === job.customerId ? 'customer' : 'tech',
        note: updNote.trim(),
        photos: updPhotos,
      });
      setUpdNote('');
      setUpdPhotos([]);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setPosting(false);
    }
  };

  const submitBid = async () => {
    if (!fbUser || !job) return;
    const items = (quote?.items ?? []).filter(
      (it) => it.desc.trim() !== '' || it.unitPrice > 0,
    );
    if (!quote || items.length === 0 || quote.total <= 0) {
      setBidError(tt('jobDetail', 'ໃສ່ລາຍການ ແລະ ລາຄາ ຢ່າງໜ້ອຍ 1 ລາຍການ'));
      return;
    }
    setSubmitting(true);
    setBidError('');
    try {
      await createBid({
        jobId: job.id,
        technicianId: fbUser.uid,
        price: quote.total,
        items,
        subtotal: quote.subtotal,
        discount: quote.discount > 0 ? quote.discount : undefined,
        vatRate: quote.vatRate,
        vat: quote.vat,
        total: quote.total,
        surveyNote: quote.surveyNote,
        surveyPhotos: quote.surveyPhotos.length > 0 ? quote.surveyPhotos : undefined,
        surveyChecklist: quote.surveyChecklist,
        workType: quote.workType,
        workContinuity: quote.workContinuity,
        workContinuityNote: quote.workContinuityNote,
        paymentPlan: quote.paymentPlan,
        validUntil: quote.validUntil,
      });
      if (quote.surveyTemplateId) incrementSurveyUsage(quote.surveyTemplateId);
      setQuote(null);
    } catch (e: any) {
      console.error('submitBid:', e);
      setBidError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── revision / versioning ──
  const reviseSubmit = async () => {
    if (!fbUser || !myBid) return;
    const items = (quote?.items ?? []).filter((it) => it.desc.trim() !== '' || it.unitPrice > 0);
    if (!quote || items.length === 0 || quote.total <= 0) {
      setBidError(tt('jobDetail', 'ໃສ່ລາຍການ ແລະ ລາຄາ ຢ່າງໜ້ອຍ 1 ລາຍການ'));
      return;
    }
    setSubmitting(true);
    setBidError('');
    try {
      await reviseBid(myBid.id, {
        price: quote.total,
        items,
        subtotal: quote.subtotal,
        discount: quote.discount > 0 ? quote.discount : undefined,
        vatRate: quote.vatRate,
        vat: quote.vat,
        total: quote.total,
        surveyNote: quote.surveyNote,
        surveyPhotos: quote.surveyPhotos.length > 0 ? quote.surveyPhotos : undefined,
        surveyChecklist: quote.surveyChecklist,
        workType: quote.workType,
        workContinuity: quote.workContinuity,
        workContinuityNote: quote.workContinuityNote,
        paymentPlan: quote.paymentPlan,
        validUntil: quote.validUntil,
      });
      setRevising(false);
      setQuote(null);
    } catch (e: any) {
      setBidError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };
  // open the structured "ask for revision / discount" composer for a bid
  const openRevReq = (bidId: string) => {
    setRevReqFor(bidId);
    setRevReqScope('whole'); setRevReqLineIdx(0); setRevReqType('percent'); setRevReqValue(''); setRevReqNote('');
  };
  const submitRevisionRequest = async () => {
    if (!fbUser || !revReqFor) return;
    const b = bids.find((x) => x.id === revReqFor);
    const lineLabel = revReqScope === 'line' ? b?.items?.[revReqLineIdx]?.desc : undefined;
    const value = revReqType !== 'other' ? Number(revReqValue.replace(/[^0-9.]/g, '')) || 0 : undefined;
    setRevReqSending(true);
    try {
      await requestBidRevision(revReqFor, { scope: revReqScope, lineLabel, type: revReqType, value, note: revReqNote.trim() || undefined }, fbUser.uid);
      setRevReqFor(null);
      setRevReqNote(''); setRevReqValue('');
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setRevReqSending(false);
    }
  };
  // line-level counter — owner edits a per-line BOQ (keep/drop + proposed price)
  const openLineCounter = (b: Bid) => {
    setLcFor(b.id);
    setLcNote('');
    setLcLines((b.items ?? []).map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit, unitPrice: it.unitPrice, keep: true })));
  };
  const setLcLine = (idx: number, patch: Partial<LineCounterItem>) =>
    setLcLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const lcTotal = lcLines.filter((l) => l.keep).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const submitLineCounter = async () => {
    if (!fbUser || !lcFor) return;
    setLcBusy(true);
    try {
      await sendLineCounter(lcFor, lcLines, lcNote.trim() || undefined, fbUser.uid);
      setLcFor(null); setLcNote('');
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLcBusy(false);
    }
  };
  // tech accepts / declines a line-level counter on their own bid
  const applyLineCounter = async (bidId: string, accept: boolean) => {
    if (!fbUser) return;
    setLcApplyFor(bidId);
    try {
      if (accept) await acceptLineCounter(bidId, fbUser.uid); else await declineLineCounter(bidId, fbUser.uid);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLcApplyFor(null);
    }
  };

  // ---- mid-job variation / change-order (tech proposes, customer approves) ----
  const setVarItem = (i: number, patch: Partial<QuoteItem>) =>
    setVarItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addVarItem = () =>
    setVarItems((prev) => [...prev, { desc: '', qty: 1, unit: 'ອັນ', unitPrice: 0 }]);
  const removeVarItem = (i: number) =>
    setVarItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const varTotal = computeQuote(varItems, 0, 0).total;
  const submitVariation = async () => {
    if (!fbUser || !job) return;
    setVarSending(true);
    try {
      await createVariation({
        jobId: job.id,
        techId: fbUser.uid,
        techName: job.assignedProviderName ?? (profile as any)?.name,
        items: varItems,
        note: varNote,
      });
      setVarItems([{ desc: '', qty: 1, unit: 'ອັນ', unitPrice: 0 }]);
      setVarNote('');
      setVarOpen(false);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setVarSending(false);
    }
  };
  const decideVariation = async (vid: string, approve: boolean) => {
    if (!fbUser) return;
    try {
      if (approve) await approveVariation(vid, fbUser.uid);
      else await rejectVariation(vid, fbUser.uid);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  };

  if (jobLoading) {
    return (
      <View style={styles.center}>
        <Text>{tt('jobDetail', 'ກຳລັງໂຫຼດ...')}</Text>
      </View>
    );
  }
  // full job details are signed-in only (they carry the poster's address/contact);
  // guests browse the coarse feed on Explore and sign in to see a job + bid
  if (!fbUser) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.center}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>🔒 {tt('jobDetail', 'ເຂົ້າ ສູ່ ລະບົບ ເພື່ອ ເບິ່ງ ລາຍລະອຽດ ວຽກ')}</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{tt('jobDetail', 'ເບິ່ງ ທີ່ຢູ່ · ຕິດຕໍ່ · ສະເໜີ ລາຄາ — ຕ້ອງ ມີ ບັນຊີ ກ່ອນ')}</Text>
          <Pressable style={styles.btn} onPress={() => router.push('/sign-in' as any)}>
            <Text style={styles.btnText}>{tt('jobDetail', 'ເຂົ້າ ສູ່ ລະບົບ')}</Text>
          </Pressable>
        </View>
        <AppFooter page="job-detail" />
      </View>
    );
  }
  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('jobDetail', 'ບໍ່ພົບງານ')}</Text>
        <BackButton label={tt('jobDetail', 'ກັບໜ້າຫຼັກ')} onPress={() => router.replace('/')} />
      </View>
    );
  }

  const cat = getCategory(job.category);
  const statusLabel = JOB_STATUS_LABEL[job.status];
  const statusColor = STATUS_COLORS[job.status] ?? STATUS_COLORS.completed;
  const isOwner = fbUser?.uid === job.customerId;
  const canCancel = isOwner && job.status === 'open';
  const isOpen = job.status === 'open';
  const myBid = bids.find((b) => b.technicianId === fbUser?.uid);
  const assignedToMe = !!fbUser && job.assignedProviderId === fbUser.uid;
  // distance from the technician (current user) to the job site — powers the
  // optional travel-fee line in the quote builder (quick-win 2)
  const travelKm =
    profile?.lat != null && profile?.lng != null && job.lat != null && job.lng != null
      ? distanceKm({ lat: profile.lat, lng: profile.lng }, { lat: job.lat, lng: job.lng })
      : undefined;
  // admin monitoring: read-only execution view when an admin opens a job that
  // is neither theirs to own nor assigned to them
  const adminView = isAnyAdmin(profile) && !isOwner && !assignedToMe;
  const inWorkflow =
    job.status !== 'open' && job.status !== 'cancelled' && !!job.assignedProviderId;
  const activeBids = bids.filter((b) => b.status !== 'withdrawn');
  const cheapestId = activeBids.length
    ? activeBids.reduce((a, b) => (b.price < a.price ? b : a)).id
    : null;
  const topRatedId = activeBids.length
    ? activeBids.reduce((a, b) => ((b.technicianRating ?? 0) > (a.technicianRating ?? 0) ? b : a)).id
    : null;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}><CategoryIcon icon={cat?.icon} size={16} color="#111" /> {job.title}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.fg }]}>
              {tt('jobStatus', statusLabel.lao)}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {cat?.lao ?? job.category}
          {'  ·  '}
          {new Date(job.createdAt).toLocaleDateString('lo-LA')}
        </Text>

        {job.photos && job.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
            {job.photos.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.jobPhoto} />
            ))}
          </ScrollView>
        )}

        <View style={styles.section}>
          <Text style={styles.sLabel}>{tt('jobDetail', 'ລາຍລະອຽດ')}</Text>
          <Text style={styles.sValue}>{job.description}</Text>
        </View>

        {job.assetId && <LinkedAssetCard assetId={job.assetId} siteId={job.siteId} />}

        {job.budget !== undefined && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ງົບປະມານ')}</Text>
            <Text style={styles.budgetBig}>
              {job.budget.toLocaleString()} <Text style={styles.budgetUnit}>LAK</Text>
            </Text>
          </View>
        )}

        {(job.address || job.lat !== undefined) && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ສະຖານທີ່')}</Text>
            {job.address && <Text style={styles.sValue}>{job.address}</Text>}
            {job.lat !== undefined && job.lng !== undefined && (
              <View style={{ marginTop: 8 }}>
                <LocationMap lat={job.lat} lng={job.lng} height={220} />
              </View>
            )}
          </View>
        )}

        {job.preferredDate && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ວັນທີຕ້ອງການ')}</Text>
            <Text style={styles.sValue}>
              {new Date(job.preferredDate).toLocaleDateString('lo-LA')}
            </Text>
          </View>
        )}

        {/* ============ WORKFLOW (assigned job) ============ */}
        {inWorkflow && (isOwner || assignedToMe || adminView) && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ຂັ້ນຕອນງານ')}</Text>
            <View style={styles.workflowCard}>
              {adminView && (
                <View style={styles.adminBanner}>
                  <Text style={styles.adminBannerText}>👁️ {tt('jobDetail', 'ມຸມມອງ ຜູ້ຄຸ້ມຄອງ — ຕິດຕາມ ຢ່າງດຽວ')}</Text>
                  <Text style={styles.adminBannerSub}>
                    {tt('jobDetail', 'ລູກຄ້າ:')} {job.customerName ?? job.customerId.slice(0, 6)}
                  </Text>
                </View>
              )}
              <View style={styles.between}>
                <Pressable
                  onPress={() =>
                    job.assignedProviderId &&
                    router.push(`/users/${job.assignedProviderId}` as any)
                  }>
                  <Text style={styles.wfTechLink}>👷 {job.assignedProviderName ?? tt('jobDetail', 'ຊ່າງ')} ›</Text>
                </Pressable>
                {job.finalPrice !== undefined && (
                  <Text style={styles.wfPrice}>{job.finalPrice.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>
                )}
              </View>
              <View style={{ marginTop: 14 }}>
                <JobTimeline job={job} />
              </View>

              {job.status === 'in_progress' && (
                <View style={styles.progWrap}>
                  <View style={styles.progBarBg}>
                    <View style={[styles.progBarFill, { width: `${job.progressPct ?? 0}%` }]} />
                  </View>
                  <Text style={styles.progText}>{job.progressPct ?? 0}%</Text>
                </View>
              )}
              {job.completionPhotos && job.completionPhotos.length > 0 && (
                <View style={styles.donePhotosWrap}>
                  <Text style={styles.donePhotosLabel}>📸 {tt('jobDetail', 'ຮູບ ຕອນ ສຳເລັດ')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {job.completionPhotos.map((p) => (
                      <Image key={p} source={{ uri: p }} style={styles.donePhoto} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {!adminView && <WorkflowActions job={job} isTech={assignedToMe} isOwner={isOwner} />}

              {!adminView && (
                <Pressable style={styles.msgBtn} onPress={messageCounterpart}>
                  <Text style={styles.msgBtnText}>
                    {tt('jobDetail', '💬 ຂໍ້ຄວາມ')} {isOwner ? tt('jobDetail', 'ຫາຊ່າງ') : tt('jobDetail', 'ຫາລູກຄ້າ')}
                  </Text>
                </Pressable>
              )}

              {job.finalPrice !== undefined && (
                <Pressable style={styles.msgBtn} onPress={() => router.push(`/invoice/${job.id}` as any)}>
                  <Text style={styles.msgBtnText}>
                    🧾 {job.status === 'completed' ? tt('jobDetail', 'ໃບຮັບເງິນ') : tt('jobDetail', 'ໃບສະເໜີ')}
                  </Text>
                </Pressable>
              )}

              {/* handover / acceptance doc — available once the work is flagged done */}
              {(job.techDoneAt || job.status === 'pending_payment' || job.status === 'completed') && (
                <Pressable
                  style={[styles.msgBtn, job.acceptedAt ? undefined : styles.handoverBtnHot]}
                  onPress={() => router.push(`/handover/${job.id}` as any)}>
                  <Text style={[styles.msgBtnText, job.acceptedAt ? undefined : styles.handoverBtnHotText]}>
                    📄 {tt('jobDetail', 'ໃບ ມອບຮັບ ວຽກ')}{job.acceptedAt ? ' ✓' : (isOwner ? ` — ${tt('jobDetail', 'ກົດ ຮັບ ມອບ')}` : '')}
                  </Text>
                </Pressable>
              )}

              {disputes.length > 0 && (
                <View style={styles.disputeStatus}>
                  <Text style={styles.disputeStatusText}>
                    {tt('jobDetail', '⚠️ ຂໍ້ຂັດແຍ່ງ:')} {tt('disputeStatus', DISPUTE_STATUS_LABEL[disputes[0].status])}
                  </Text>
                </View>
              )}
              <Pressable style={styles.disputeBtn} onPress={() => router.push(`/dispute/${job.id}` as any)}>
                <Text style={styles.disputeBtnText}>
                  {disputes.length > 0 ? tt('jobDetail', '⚠️ ເບິ່ງ / ແຈ້ງບັນຫາ') : tt('jobDetail', '⚠️ ແຈ້ງບັນຫາ')}
                </Text>
              </Pressable>

              {isOwner && job.status === 'assigned' && !!job.arrivalCode && !job.arrivedAt && (
                <View style={styles.arrCodeCard}>
                  <Text style={styles.arrCodeLbl}>{tt('jobDetail', 'ລະຫັດ ຂອງ ເຈົ້າ — ບອກ ຊ່າງ ຕອນ ມາ ເຖິງ')}</Text>
                  <Text style={styles.arrCodeNum}>{job.arrivalCode}</Text>
                  <Text style={styles.arrCodeHint}>{tt('jobDetail', 'ໃຫ້ ບອກ ສະເພາະ ຕອນ ຊ່າງ ຮອດ ໜ້າ ງານ ຈິງ')}</Text>
                </View>
              )}
              {isOwner && job.status !== 'assigned' && !!job.arrivedAt && (
                <Text style={styles.arrDoneTag}>{tt('jobDetail', '📍 ຊ່າງ ຢືນຢັນ ມາ ເຖິງ ແລ້ວ')}</Text>
              )}

              {isOwner && (job.status === 'assigned' || job.status === 'in_progress') && (
                <Pressable style={styles.abandonBtn} onPress={handleAbandon}>
                  <Text style={styles.abandonBtnText}>{tt('jobDetail', '🚫 ຊ່າງ ບໍ່ ມາ / ກ່ຽງງານ — ຫາ ຊ່າງ ໃໝ່')}</Text>
                </Pressable>
              )}

              {/* post-completion ratings */}
              {job.status === 'completed' && isOwner && (
                job.customerReviewed ? (
                  <Text style={styles.reviewedTag}>{tt('jobDetail', '✓ ໃຫ້ຄະແນນຊ່າງແລ້ວ')}</Text>
                ) : (
                  <Pressable
                    style={[styles.btn, styles.rateBtn]}
                    onPress={() => setRatingFor('tech')}>
                    <Text style={styles.btnText}>{tt('jobDetail', '⭐ ໃຫ້ຄະແນນຊ່າງ')}</Text>
                  </Pressable>
                )
              )}
              {job.status === 'completed' && assignedToMe && (
                job.techReviewed ? (
                  <Text style={styles.reviewedTag}>{tt('jobDetail', '✓ ໃຫ້ຄະແນນລູກຄ້າແລ້ວ')}</Text>
                ) : (
                  <Pressable
                    style={[styles.btn, styles.rateBtn]}
                    onPress={() => setRatingFor('customer')}>
                    <Text style={styles.btnText}>{tt('jobDetail', '⭐ ໃຫ້ຄະແນນລູກຄ້າ')}</Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        )}

        {/* ============ PROGRESS UPDATES ============ */}
        {inWorkflow && (isOwner || assignedToMe || adminView) && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', '📝 ຄວາມຄືບໜ້າວຽກ')}</Text>

            {!adminView && (job.status === 'assigned' || job.status === 'in_progress') && (
              <View style={styles.updComposer}>
                <TextInput
                  value={updNote}
                  onChangeText={setUpdNote}
                  placeholder={tt('jobDetail', 'ບອກຄວາມຄືບໜ້າ... (ເຊັ່ນ: ຕິດຕັ້ງສາຍໄຟແລ້ວ 50%)')}
                  placeholderTextColor="#999"
                  style={styles.updInput}
                  multiline
                />
                <View style={{ marginTop: 8 }}>
                  <PhotoPicker
                    photos={updPhotos}
                    onChange={setUpdPhotos}
                    pathPrefix={`jobs/${job.id}`}
                    max={4}
                  />
                </View>
                <Pressable
                  style={[
                    styles.updSend,
                    (posting || (!updNote.trim() && updPhotos.length === 0)) && styles.btnDisabled,
                  ]}
                  onPress={postUpdate}
                  disabled={posting || (!updNote.trim() && updPhotos.length === 0)}>
                  <Text style={styles.updSendText}>{posting ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : tt('jobDetail', '📨 ສົ່ງອັບເດດ')}</Text>
                </Pressable>
              </View>
            )}

            {updates.length === 0 ? (
              <Text style={styles.updEmpty}>{tt('jobDetail', 'ຍັງບໍ່ມີອັບເດດ')}</Text>
            ) : (
              updates.map((u) => (
                <View key={u.id} style={styles.updItem}>
                  <View style={[styles.updAvatar, u.byRole === 'tech' ? styles.updAvTech : styles.updAvCust]}>
                    <Text style={styles.updAvIcon}>{u.byRole === 'tech' ? '🔧' : '🙋'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.updHead}>
                      <Text style={styles.updName} numberOfLines={1}>
                        {u.byName ?? (u.byRole === 'tech' ? tt('jobDetail', 'ຊ່າງ') : tt('jobDetail', 'ລູກຄ້າ'))}
                      </Text>
                      <View style={[styles.updRolePill, u.byRole === 'tech' ? styles.updRolePillTech : styles.updRolePillCust]}>
                        <Text style={[styles.updRoleText, u.byRole === 'tech' ? styles.updRoleTextTech : styles.updRoleTextCust]}>
                          {u.byRole === 'tech' ? tt('jobDetail', 'ຊ່າງ') : tt('jobDetail', 'ລູກຄ້າ')}
                        </Text>
                      </View>
                      <Text style={styles.updTime}>{fmtTime(u.createdAt)}</Text>
                    </View>
                    {!!u.note && <Text style={styles.updNoteText}>{u.note}</Text>}
                    {u.photos && u.photos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 6, marginTop: 6 }}>
                        {u.photos.map((p) => (
                          <Image key={p} source={{ uri: p }} style={styles.updPhoto} />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ============ VARIATIONS / CHANGE-ORDERS ============ */}
        {inWorkflow && (isOwner || assignedToMe || adminView) &&
          (variations.length > 0 || (assignedToMe && (job.status === 'assigned' || job.status === 'in_progress'))) && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>🧰 {tt('jobDetail', 'ວຽກເພີ່ມ / ປ່ຽນແປງ')}</Text>

            {variations.map((v) => {
              const badge =
                v.status === 'approved' ? { t: tt('jobDetail', '✅ ອະນຸມັດ ແລ້ວ'), s: styles.varApproved }
                : v.status === 'rejected' ? { t: tt('jobDetail', '✕ ບໍ່ ອະນຸມັດ'), s: styles.varRejected }
                : { t: tt('jobDetail', '⏳ ລໍ ອະນຸມັດ'), s: styles.varPendingTag };
              return (
                <View key={v.id} style={styles.varCard}>
                  <View style={styles.between}>
                    <Text style={badge.s}>{badge.t}</Text>
                    <Text style={styles.varTotal}>+{v.total.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>
                  </View>
                  {v.items.map((it, i) => (
                    <Text key={i} style={styles.varLine}>
                      • {it.desc} ×{it.qty} {it.unit} = {(it.qty * it.unitPrice).toLocaleString()}
                    </Text>
                  ))}
                  {!!v.note && <Text style={styles.varNoteText}>📝 {v.note}</Text>}
                  {v.status === 'pending' && isOwner && (
                    <View style={styles.bidActions}>
                      <Pressable style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }]} onPress={() => decideVariation(v.id, true)}>
                        <Text style={styles.btnText}>{tt('jobDetail', '✓ ອະນຸມັດ')} (+{v.total.toLocaleString()})</Text>
                      </Pressable>
                      <Pressable style={styles.reviseBtn} onPress={() => decideVariation(v.id, false)}>
                        <Text style={styles.reviseBtnText}>{tt('jobDetail', 'ປະຕິເສດ')}</Text>
                      </Pressable>
                    </View>
                  )}
                  {v.status === 'pending' && !isOwner && (
                    <Text style={styles.varWait}>{tt('jobDetail', 'ລໍ ລູກຄ້າ ອະນຸມັດ...')}</Text>
                  )}
                </View>
              );
            })}

            {/* technician: propose extra work */}
            {assignedToMe && (job.status === 'assigned' || job.status === 'in_progress') && (
              varOpen ? (
                <View style={styles.varComposer}>
                  <Text style={styles.varComposerTitle}>🧰 {tt('jobDetail', 'ສະເໜີ ວຽກເພີ່ມ')}</Text>
                  {varItems.map((it, i) => (
                    <View key={i} style={styles.varRow}>
                      <TextInput
                        value={it.desc}
                        onChangeText={(val) => setVarItem(i, { desc: val })}
                        placeholder={tt('jobDetail', 'ລາຍການ ວຽກເພີ່ມ')}
                        placeholderTextColor="#999"
                        style={[styles.varInput, { flex: 2 }]}
                      />
                      <TextInput
                        value={groupThousands(String(it.qty))}
                        onChangeText={(val) => setVarItem(i, { qty: Number(val.replace(/[^0-9.]/g, '')) || 0 })}
                        keyboardType="numeric"
                        placeholder={tt('jobDetail', 'ຈ.ນ')}
                        placeholderTextColor="#999"
                        style={[styles.varInput, { width: 44 }]}
                      />
                      <TextInput
                        value={it.unitPrice ? groupThousands(String(it.unitPrice)) : ''}
                        onChangeText={(val) => setVarItem(i, { unitPrice: Number(val.replace(/[^0-9]/g, '')) || 0 })}
                        keyboardType="numeric"
                        placeholder={tt('jobDetail', 'ລາຄາ')}
                        placeholderTextColor="#999"
                        style={[styles.varInput, { flex: 1 }]}
                      />
                      {varItems.length > 1 && (
                        <Pressable onPress={() => removeVarItem(i)} hitSlop={6}><Text style={styles.varRm}>✕</Text></Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable onPress={addVarItem}><Text style={styles.varAdd}>＋ {tt('jobDetail', 'ເພີ່ມ ລາຍການ')}</Text></Pressable>
                  <TextInput
                    value={varNote}
                    onChangeText={setVarNote}
                    placeholder={tt('jobDetail', 'ເຫດຜົນ (ເຊັ່ນ: ພົບ ສາຍໄຟ ເກົ່າ ຕ້ອງ ປ່ຽນ)')}
                    placeholderTextColor="#999"
                    style={[styles.varInput, styles.varNoteInput]}
                    multiline
                  />
                  <View style={styles.between}>
                    <Text style={styles.varComposerTotal}>{tt('jobDetail', 'ລວມ')}: {varTotal.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>
                  </View>
                  <View style={styles.bidActions}>
                    <Pressable style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }, (varSending || varTotal <= 0) && styles.btnDisabled]} onPress={submitVariation} disabled={varSending || varTotal <= 0}>
                      <Text style={styles.btnText}>{varSending ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : tt('jobDetail', '📨 ສົ່ງ ໃຫ້ ລູກຄ້າ ອະນຸມັດ')}</Text>
                    </Pressable>
                    <Pressable style={styles.reviseBtn} onPress={() => setVarOpen(false)}>
                      <Text style={styles.reviseBtnText}>{tt('jobDetail', 'ຍົກເລີກ')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.varOpenBtn} onPress={() => setVarOpen(true)}>
                  <Text style={styles.varOpenBtnText}>＋ {tt('jobDetail', 'ສະເໜີ ວຽກເພີ່ມ / ປ່ຽນແປງ')}</Text>
                </Pressable>
              )
            )}
          </View>
        )}

        {/* ============ OWNER (+ admin monitor): bids list ============ */}
        {(isOwner || adminView) && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>
              {tt('jobDetail', 'ຄຳສະເໜີ')} ({activeBids.length})
            </Text>

            {activeBids.length >= 2 && (
              <View style={styles.cmpWrap}>
                <Text style={styles.cmpHead}>{tt('jobDetail', '📊 ປຽບທຽບ — ເລື່ອນ →')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cmpRow}>
                  {activeBids.map((b) => {
                    const cheapest = b.id === cheapestId;
                    const top = b.id === topRatedId;
                    const checks = b.surveyChecklist?.length ?? 0;
                    return (
                      <View key={b.id} style={[styles.cmpCol, cheapest && styles.cmpColBest]}>
                        {cheapest ? (
                          <Text style={[styles.cmpBadge, styles.cmpBadgeBest]}>{tt('jobDetail', 'ຖືກສຸດ')}</Text>
                        ) : top ? (
                          <Text style={[styles.cmpBadge, styles.cmpBadgeTop]}>{tt('jobDetail', '⭐ ສູງສຸດ')}</Text>
                        ) : (
                          <Text style={[styles.cmpBadge, { opacity: 0 }]}>·</Text>
                        )}
                        <Text style={styles.cmpName} numberOfLines={1}>{b.technicianName ?? tt('jobDetail', 'ຊ່າງ')}</Text>
                        <Text style={styles.cmpRating}>
                          {b.technicianRating !== undefined ? `⭐ ${b.technicianRating.toFixed(1)} (${b.technicianReviewCount ?? 0})` : '⭐ —'}
                        </Text>
                        {(abandonByTech[b.technicianId] ?? 0) > 0 && (
                          <Text style={styles.cmpAbandon}>{tt('jobDetail', '⚠️ ກ່ຽງ')} {abandonByTech[b.technicianId]}×</Text>
                        )}
                        <Text style={styles.cmpPrice}>{b.price.toLocaleString()}</Text>
                        <Text style={styles.cmpUnit}>{tt('jobDetail', 'ກີບ')}</Text>
                        <View style={styles.cmpMeta}>
                          <Text style={styles.cmpMetaLine}>⏱️ {b.etaDays !== undefined ? `${b.etaDays} ${tt('time', 'ມື້')}` : '—'}</Text>
                          <Text style={[styles.cmpMetaLine, checks > 0 && styles.cmpMetaOk]}>
                            {checks > 0 ? `🔍 ${tt('jobDetail', 'ສຳຫຼວດ')} ${checks} ${tt('jobDetail', 'ຂໍ້')}` : tt('jobDetail', '🔍 ບໍ່ສຳຫຼວດ')}
                          </Text>
                          <Text style={styles.cmpMetaLine}>🧾 {b.items?.length ?? 0} {tt('jobDetail', 'ລາຍການ')}</Text>
                        </View>
                        {b.status === 'accepted' ? (
                          <Text style={styles.cmpAccepted}>{tt('jobDetail', '✓ ເລືອກແລ້ວ')}</Text>
                        ) : isOpen && !adminView ? (
                          <Pressable style={styles.cmpBtn} onPress={() => handleAccept(b.id)}>
                            <Text style={styles.cmpBtnText}>{tt('jobDetail', 'ເລືອກ')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {activeBids.length === 0 ? (
              <Text style={styles.emptyBids}>{tt('jobDetail', 'ຍັງບໍ່ມີຊ່າງສະເໜີ')}</Text>
            ) : (
              bids
                .filter((b) => b.status !== 'withdrawn')
                .map((b) => (
                  <View key={b.id} style={styles.bidCard}>
                    <View style={styles.bidTop}>
                      {b.technicianImage ? (
                        <Image source={{ uri: b.technicianImage }} style={styles.bidAvatar} />
                      ) : (
                        <View style={[styles.bidAvatar, styles.bidAvatarEmpty]}>
                          <Text style={{ fontSize: 18 }}>👷</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bidName}>{b.technicianName ?? tt('jobDetail', 'ຊ່າງ')}</Text>
                        {b.technicianRating !== undefined && (
                          <Text style={styles.bidRating}>
                            ⭐ {b.technicianRating.toFixed(1)} ({b.technicianReviewCount ?? 0})
                          </Text>
                        )}
                        {(abandonByTech[b.technicianId] ?? 0) > 0 && (
                          <Text style={styles.bidAbandon}>{tt('jobDetail', '⚠️ ກ່ຽງງານ ກາງຄັນ')} {abandonByTech[b.technicianId]} {tt('jobDetail', 'ຄັ້ງ')}</Text>
                        )}
                        {(b.version ?? 1) > 1 && (
                          <Text style={styles.verBadge}>📄 {tt('jobDetail', 'ສະບັບ')} v{b.version}</Text>
                        )}
                      </View>
                      <Text style={styles.bidPrice}>{b.price.toLocaleString()}</Text>
                    </View>
                    {b.surveyNote ? (
                      <Text style={styles.surveyNote}>🔍 {b.surveyNote}</Text>
                    ) : null}
                    {b.surveyChecklist && b.surveyChecklist.length > 0 && (
                      <View style={styles.checkBox}>
                        <Text style={styles.checkBoxTitle}>{tt('jobDetail', '📋 ຜົນສຳຫຼວດ')}</Text>
                        {b.surveyChecklist.map((c, idx) => (
                          <Text key={idx} style={styles.checkLine}>
                            {c.checked ? '✓' : '○'} {c.label}{c.note ? ` — ${c.note}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}
                    {b.items && b.items.length > 0 && (
                      <View style={styles.quoteBox}>
                        {b.items.map((it, idx) => (
                          <View key={idx}>
                            <View style={styles.between}>
                              <Text style={styles.quoteItem} numberOfLines={1}>
                                {it.desc} ×{it.qty} {it.unit}
                              </Text>
                              <Text style={styles.quoteItem}>
                                {(it.qty * it.unitPrice).toLocaleString()}
                              </Text>
                            </View>
                            {(it.photos?.length ?? 0) > 0 && (
                              <View style={styles.lineThumbRow}>
                                {it.photos!.map((u) => (
                                  <Image key={u} source={{ uri: u }} style={styles.lineThumb} />
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                        {b.vat ? (
                          <View style={styles.between}>
                            <Text style={styles.quoteMini}>VAT</Text>
                            <Text style={styles.quoteMini}>{b.vat.toLocaleString()}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                    {(b.note || b.etaDays !== undefined) && (
                      <Text style={styles.bidNote}>
                        {b.etaDays !== undefined ? `⏱️ ${b.etaDays} ${tt('time', 'ມື້')}  ` : ''}
                        {b.note ?? ''}
                      </Text>
                    )}
                    {(b.version ?? 1) > 1 && (
                      <Pressable onPress={() => router.push(`/quote-history/${b.id}` as any)}>
                        <Text style={styles.chatLink}>🕑 {tt('jobDetail', 'ປະຫວັດ ເວີຊັນ')} (v{b.version})</Text>
                      </Pressable>
                    )}
                    {typeof b.validUntil === 'number' && b.validUntil < Date.now() && b.status !== 'accepted' && (
                      <Text style={styles.expiredTag}>⚠️ {tt('jobDetail', 'ໃບ ສະເໜີ ໝົດ ອາຍຸ ແລ້ວ')}</Text>
                    )}
                    <Pressable onPress={() => router.push(`/quote-doc/${b.id}` as any)}>
                      <Text style={styles.chatLink}>📄 {tt('jobDetail', 'ໃບ ສະເໜີ (PDF / ແຊຣ໌)')}</Text>
                    </Pressable>
                    {b.status === 'accepted' ? (
                      <Text style={styles.acceptedTag}>{tt('jobDetail', '✓ ຖືກເລືອກແລ້ວ')}</Text>
                    ) : isOpen && !adminView ? (
                      <>
                        {b.revisionRequested && (
                          <View style={styles.revReqDone}>
                            <Text style={styles.revReq}>⏳ {tt('jobDetail', 'ຂໍ ໃຫ້ ແກ້ ແລ້ວ')}{b.revisionNote ? `: ${b.revisionNote}` : ''}</Text>
                            <Pressable onPress={() => chatWithBidder(b.technicianId)}><Text style={styles.chatLink}>💬 {tt('jobDetail', 'ຄຸຍ ຕໍ່')}</Text></Pressable>
                          </View>
                        )}
                        {revReqFor === b.id ? (
                          <View style={styles.revReqBox}>
                            <Text style={styles.revReqTitle}>✏️ {tt('jobDetail', 'ຂໍ ຫຼຸດ / ແກ້ ໃບສະເໜີ')}</Text>

                            <Text style={styles.revReqLbl}>{tt('jobDetail', 'ຂອບເຂດ')}</Text>
                            <View style={styles.segRow}>
                              <Pressable style={[styles.seg, revReqScope === 'whole' && styles.segOn]} onPress={() => setRevReqScope('whole')}><Text style={[styles.segText, revReqScope === 'whole' && styles.segTextOn]}>{tt('jobDetail', 'ທັງ ໃບ')}</Text></Pressable>
                              {b.items && b.items.length > 0 && (
                                <Pressable style={[styles.seg, revReqScope === 'line' && styles.segOn]} onPress={() => setRevReqScope('line')}><Text style={[styles.segText, revReqScope === 'line' && styles.segTextOn]}>{tt('jobDetail', 'ລາຍການ ໃດໜຶ່ງ')}</Text></Pressable>
                              )}
                            </View>
                            {revReqScope === 'line' && b.items && (
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
                                {b.items.map((it, idx) => (
                                  <Pressable key={idx} style={[styles.lineChip, revReqLineIdx === idx && styles.lineChipOn]} onPress={() => setRevReqLineIdx(idx)}>
                                    <Text style={[styles.lineChipText, revReqLineIdx === idx && styles.lineChipTextOn]} numberOfLines={1}>{it.desc || `#${idx + 1}`}</Text>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            )}

                            <Text style={styles.revReqLbl}>{tt('jobDetail', 'ຕ້ອງການ')}</Text>
                            <View style={styles.segRow}>
                              {(['percent', 'amount', 'other'] as const).map((t) => (
                                <Pressable key={t} style={[styles.seg, revReqType === t && styles.segOn]} onPress={() => setRevReqType(t)}>
                                  <Text style={[styles.segText, revReqType === t && styles.segTextOn]}>{t === 'percent' ? tt('jobDetail', 'ຫຼຸດ %') : t === 'amount' ? tt('jobDetail', 'ຫຼຸດ ກີບ') : tt('jobDetail', 'ອື່ນໆ')}</Text>
                                </Pressable>
                              ))}
                            </View>
                            {revReqType !== 'other' && (
                              <TextInput value={revReqType === 'amount' ? groupThousands(revReqValue) : revReqValue} onChangeText={(v) => setRevReqValue(v.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder={revReqType === 'percent' ? '%' : tt('jobDetail', 'ກີບ')} placeholderTextColor="#999" style={[styles.revReqInput, { minHeight: 0 }]} />
                            )}

                            <TextInput value={revReqNote} onChangeText={setRevReqNote} placeholder={tt('jobDetail', 'ໝາຍເຫດ (ບໍ່ບັງຄັບ)')} placeholderTextColor="#999" style={styles.revReqInput} multiline />

                            {(() => {
                              const total = b.total ?? b.price ?? 0;
                              const v = Number(revReqValue.replace(/[^0-9.]/g, '')) || 0;
                              if (v <= 0 || revReqScope !== 'whole' || revReqType === 'other') return null;
                              const nt = revReqType === 'percent' ? Math.round(total * (1 - v / 100)) : total - v;
                              return <Text style={styles.revReqPrev}>📋 {total.toLocaleString()} → ~{nt.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>;
                            })()}

                            <View style={styles.bidActions}>
                              <Pressable
                                style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }, revReqSending && styles.btnDisabled]}
                                onPress={submitRevisionRequest}
                                disabled={revReqSending}>
                                <Text style={styles.btnText}>{revReqSending ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : tt('jobDetail', '📨 ສົ່ງ ຄຳຂໍ (+ແຊັດ)')}</Text>
                              </Pressable>
                              <Pressable style={styles.reviseBtn} onPress={() => setRevReqFor(null)}>
                                <Text style={styles.reviseBtnText}>{tt('jobDetail', 'ຍົກເລີກ')}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : lcFor === b.id ? (
                          <View style={styles.revReqBox}>
                            <Text style={styles.revReqTitle}>🧾 {tt('jobDetail', 'ຕໍ່ ລອງ ຕໍ່ ລາຍການ')}</Text>
                            <Text style={styles.revReqLbl}>{tt('jobDetail', 'ຕິກ ເກັບ/ຕັດ + ສະເໜີ ລາຄາ ຕໍ່ ລາຍການ')}</Text>
                            {lcLines.map((l, idx) => (
                              <View key={idx} style={[styles.lcRow, !l.keep && styles.lcRowOff]}>
                                <Pressable onPress={() => setLcLine(idx, { keep: !l.keep })} hitSlop={6} style={styles.lcCheck}>
                                  <Text style={styles.lcCheckTx}>{l.keep ? '☑' : '☐'}</Text>
                                </Pressable>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.lcDesc, !l.keep && styles.lcStrike]} numberOfLines={1}>{l.desc || `#${idx + 1}`}</Text>
                                  <Text style={styles.lcQty}>{l.qty} {l.unit}</Text>
                                </View>
                                <TextInput
                                  value={groupThousands(String(l.unitPrice))}
                                  onChangeText={(v) => setLcLine(idx, { unitPrice: Number(v.replace(/[^\d]/g, '')) || 0 })}
                                  keyboardType="numeric"
                                  editable={l.keep}
                                  style={[styles.lcPrice, !l.keep && styles.lcPriceOff]}
                                />
                              </View>
                            ))}
                            <Text style={styles.revReqPrev}>📋 {tt('jobDetail', 'ລວມ ທີ່ ສະເໜີ:')} {lcTotal.toLocaleString()} {tt('jobDetail', 'ກີບ')} ({tt('jobDetail', 'ຈາກ')} {(b.total ?? b.price ?? 0).toLocaleString()})</Text>
                            <TextInput value={lcNote} onChangeText={setLcNote} placeholder={tt('jobDetail', 'ໝາຍເຫດ (ບໍ່ບັງຄັບ)')} placeholderTextColor="#999" style={styles.revReqInput} multiline />
                            <View style={styles.bidActions}>
                              <Pressable style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }, lcBusy && styles.btnDisabled]} onPress={submitLineCounter} disabled={lcBusy}>
                                <Text style={styles.btnText}>{lcBusy ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : tt('jobDetail', '📨 ສົ່ງ ຄຳ ຕໍ່ ລອງ')}</Text>
                              </Pressable>
                              <Pressable style={styles.reviseBtn} onPress={() => setLcFor(null)}>
                                <Text style={styles.reviseBtnText}>{tt('jobDetail', 'ຍົກເລີກ')}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.bidActions}>
                            <Pressable
                              style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }]}
                              onPress={() => handleAccept(b.id)}>
                              <Text style={styles.btnText}>{tt('jobDetail', '✓ ເລືອກຊ່າງນີ້')}</Text>
                            </Pressable>
                            <Pressable style={styles.reviseBtn} onPress={() => negotiateInChat(b.id)}>
                              <Text style={styles.reviseBtnText}>💬 {tt('jobDetail', 'ຕໍ່ລອງ ລາຄາ')}</Text>
                            </Pressable>
                            {!b.revisionRequested && (
                              <Pressable style={styles.reviseBtn} onPress={() => openRevReq(b.id)}>
                                <Text style={styles.reviseBtnText}>✏️ {tt('jobDetail', 'ຂໍ ຫຼຸດ/ແກ້')}</Text>
                              </Pressable>
                            )}
                            {!b.revisionRequested && (b.items?.length ?? 0) > 0 && (
                              <Pressable style={styles.reviseBtn} onPress={() => openLineCounter(b)}>
                                <Text style={styles.reviseBtnText}>🧾 {tt('jobDetail', 'ຕໍ່ ລອງ ຕໍ່ ລາຍການ')}</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.rejectedTag}>{tt('jobDetail', BID_STATUS_LABEL[b.status])}</Text>
                    )}
                  </View>
                ))
            )}
          </View>
        )}

        {/* ============ NON-OWNER (not assigned): status when job already taken ============ */}
        {!isOwner && inWorkflow && !assignedToMe && !adminView && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ສະຖານະ')}</Text>
            <Text style={styles.emptyBids}>
              {myBid
                ? `${tt('jobDetail', 'ໃບສະເໜີຂອງເຈົ້າ:')} ${tt('jobDetail', BID_STATUS_LABEL[myBid.status])}`
                : tt('jobDetail', 'ງານນີ້ມີຊ່າງຮັບແລ້ວ')}
            </Text>
          </View>
        )}

        {/* ============ NON-OWNER: build quotation ============ */}
        {!isOwner && !inWorkflow && !adminView && (
          <View style={styles.section}>
            <Text style={styles.sLabel}>{tt('jobDetail', 'ໃບສະເໜີລາຄາ')}</Text>
            {myBid ? (
              myBid.lineCounter && myBid.status === 'pending' ? (
                <View style={styles.lcCard}>
                  <Text style={styles.lcCardTitle}>🧾 {tt('jobDetail', 'ລູກຄ້າ ຕໍ່ ລອງ ຕໍ່ ລາຍການ')}</Text>
                  {myBid.lineCounter.items.map((l, idx) => (
                    <View key={idx} style={styles.lcvRow}>
                      <Text style={[styles.lcvDesc, !l.keep && styles.lcStrike]} numberOfLines={1}>{l.keep ? '✓' : '✗'} {l.desc || `#${idx + 1}`} · {l.qty} {l.unit}</Text>
                      <Text style={[styles.lcvPrice, !l.keep && styles.lcStrike]}>{l.keep ? (l.qty * l.unitPrice).toLocaleString() : '—'}</Text>
                    </View>
                  ))}
                  <Text style={styles.revReqPrev}>📋 {tt('jobDetail', 'ລວມ ທີ່ ລູກຄ້າ ສະເໜີ:')} {myBid.lineCounter.total.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>
                  {!!myBid.lineCounter.note && <Text style={styles.revNoteText}>📝 {myBid.lineCounter.note}</Text>}
                  <View style={styles.bidActions}>
                    <Pressable style={[styles.btn, styles.btnGreen, { flex: 1, marginTop: 0 }, lcApplyFor === myBid.id && styles.btnDisabled]} onPress={() => applyLineCounter(myBid!.id, true)} disabled={lcApplyFor === myBid.id}>
                      <Text style={styles.btnText}>{lcApplyFor === myBid.id ? tt('jobDetail', 'ກຳລັງ...') : tt('jobDetail', '✓ ຮັບ ຕາມ ນີ້ (ອອກ ໃບ ໃໝ່)')}</Text>
                    </Pressable>
                    <Pressable style={styles.reviseBtn} onPress={() => applyLineCounter(myBid!.id, false)} disabled={lcApplyFor === myBid.id}>
                      <Text style={styles.reviseBtnText}>{tt('jobDetail', 'ບໍ່ ຮັບ')}</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={messageCounterpart}><Text style={styles.chatLink}>💬 {tt('jobDetail', 'ຄຸຍ ຕໍ່')}</Text></Pressable>
                </View>
              ) : (revising || myBid.revisionRequested) && myBid.status === 'pending' ? (
                <View>
                  {myBid.revisionRequested && (
                    <View style={styles.revNoteBox}>
                      <View style={styles.revReqDone}>
                        <Text style={styles.revNoteTitle}>✏️ {tt('jobDetail', 'ລູກຄ້າ ຂໍ ໃຫ້ ແກ້:')}</Text>
                        <Pressable onPress={messageCounterpart}><Text style={styles.chatLink}>💬 {tt('jobDetail', 'ຄຸຍ ຕໍ່')}</Text></Pressable>
                      </View>
                      <Text style={styles.revNoteText}>{myBid.revisionNote || tt('jobDetail', '(ບໍ່ ໄດ້ ລະບຸ — ຕິດຕໍ່ ລູກຄ້າ)')}</Text>
                    </View>
                  )}
                  <QuotationBuilder
                    pathPrefix={`bids/${fbUser?.uid}`}
                    category={job.category}
                    surveyRequested={job.surveyRequested}
                    ownerId={fbUser?.uid}
                    travelKm={travelKm}
                    initial={{
                      items: myBid.items, discount: myBid.discount, vatRate: myBid.vatRate,
                      surveyNote: myBid.surveyNote, surveyPhotos: myBid.surveyPhotos, surveyChecklist: myBid.surveyChecklist,
                      workType: myBid.workType, workContinuity: myBid.workContinuity, workContinuityNote: myBid.workContinuityNote,
                      validUntil: myBid.validUntil, paymentPlan: myBid.paymentPlan,
                    }}
                    onChange={setQuote}
                  />
                  <Pressable style={[styles.btn, submitting && styles.btnDisabled, { marginTop: 14 }]} onPress={reviseSubmit} disabled={submitting}>
                    <Text style={styles.btnText}>{submitting ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : `🔁 ${tt('jobDetail', 'ສົ່ງ ໃບສະເໜີ ໃໝ່')} (v${(myBid.version ?? 1) + 1})`}</Text>
                  </Pressable>
                  {revising && !myBid.revisionRequested && (
                    <Pressable style={styles.withdrawBtn} onPress={() => { setRevising(false); setQuote(null); }}>
                      <Text style={styles.withdrawText}>{tt('jobDetail', 'ຍົກເລີກ ການ ແກ້')}</Text>
                    </Pressable>
                  )}
                  {bidError !== '' && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {bidError}</Text></View>}
                </View>
              ) : (
                <View style={styles.myBidBox}>
                  <Text style={styles.myBidPrice}>
                    {tt('jobDetail', 'ໃບສະເໜີຂອງເຈົ້າ:')} {myBid.price.toLocaleString()} {tt('jobDetail', 'ກີບ')}{(myBid.version ?? 1) > 1 ? ` · v${myBid.version}` : ''}
                  </Text>
                  {myBid.items && myBid.items.length > 0 && (
                    <Text style={styles.myBidStatus}>{myBid.items.length} {tt('jobDetail', 'ລາຍການ')}</Text>
                  )}
                  <Text style={styles.myBidStatus}>
                    {tt('jobDetail', 'ສະຖານະ:')} {tt('jobDetail', BID_STATUS_LABEL[myBid.status])}
                  </Text>
                  {(myBid.version ?? 1) > 1 && (
                    <Pressable onPress={() => router.push(`/quote-history/${myBid.id}` as any)}>
                      <Text style={styles.chatLink}>🕑 {tt('jobDetail', 'ປະຫວັດ ເວີຊັນ')}</Text>
                    </Pressable>
                  )}
                  {myBid.status === 'pending' && (
                    <View style={styles.bidActions}>
                      <Pressable style={[styles.reviseBtn, { flex: 1 }]} onPress={() => { setQuote(null); setBidError(''); setRevising(true); }}>
                        <Text style={styles.reviseBtnText}>✏️ {tt('jobDetail', 'ແກ້ໄຂ ໃບສະເໜີ')}</Text>
                      </Pressable>
                      <Pressable style={styles.withdrawBtn} onPress={() => withdrawBid(myBid.id)}>
                        <Text style={styles.withdrawText}>{tt('jobDetail', 'ຖອນ')}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )
            ) : !fbUser ? (
              <Pressable
                style={[styles.btn, { marginTop: 8 }]}
                onPress={() => router.push('/sign-in')}>
                <Text style={styles.btnText}>{tt('jobDetail', '🔒 ເຂົ້າສູ່ລະບົບເພື່ອສະເໜີລາຄາ')}</Text>
              </Pressable>
            ) : !can('bid') ? (
              <Text style={styles.emptyBids}>{tt('jobDetail', 'ບັນຊີຂອງເຈົ້າບໍ່ມີສິດສະເໜີລາຄາ (ສະເພາະ ຊ່າງ)')}</Text>
            ) : !isOpen ? (
              <Text style={styles.emptyBids}>{tt('jobDetail', 'ງານນີ້ປິດຮັບແລ້ວ')}</Text>
            ) : (
              <View>
                <QuotationBuilder
                  pathPrefix={`bids/${fbUser.uid}`}
                  category={job.category}
                  surveyRequested={job.surveyRequested}
                  ownerId={fbUser.uid}
                  onChange={setQuote}
                />
                <Pressable
                  style={[styles.btn, submitting && styles.btnDisabled, { marginTop: 14 }]}
                  onPress={submitBid}
                  disabled={submitting}>
                  <Text style={styles.btnText}>
                    {submitting ? tt('jobDetail', 'ກຳລັງສົ່ງ...') : tt('jobDetail', '📤 ສົ່ງໃບສະເໜີ')}
                  </Text>
                </Pressable>
                {bidError !== '' && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>❌ {bidError}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {canCancel && (
          <Pressable
            style={[styles.btn, styles.btnDanger, { marginTop: 16 }, cancelling && styles.btnDisabled]}
            onPress={handleCancel}
            disabled={cancelling}>
            <Text style={styles.btnText}>
              {cancelling ? tt('jobDetail', 'ກຳລັງຍົກເລີກ...') : tt('jobDetail', 'ຍົກເລີກງານ')}
            </Text>
          </Pressable>
        )}

        <BackButton />
      </View>
      <View style={styles.footerBleed}><AppFooter page="job-detail" /></View>
    </ScrollView>

    {ratingFor && (
      <RatingModal
        title={ratingFor === 'tech' ? tt('jobDetail', 'ໃຫ້ຄະແນນຊ່າງ') : tt('jobDetail', 'ໃຫ້ຄະແນນລູກຄ້າ')}
        subtitle={job.title}
        onSubmit={submitReview}
        onClose={() => setRatingFor(null)}
      />
    )}
    {termsForBid && (
      <TermsModal bid={termsForBid} job={job} onCancel={() => setTermsForBid(null)} onAccept={confirmAccept} />
    )}
    </View>
  );
}

function WorkflowActions({
  job,
  isTech,
  isOwner,
}: {
  job: Job;
  isTech: boolean;
  isOwner: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [slip, setSlip] = useState<string[]>([]);
  const [donePhotos, setDonePhotos] = useState<string[]>([]);
  const [arrivalInput, setArrivalInput] = useState('');
  const [arrivalErr, setArrivalErr] = useState(false);
  const tt = useTT();

  if (job.status === 'completed' && !(job.paymentInstallments?.length)) {
    return <Text style={styles.wfDone}>{tt('jobDetail', '✓ ງານສຳເລັດ ແລະ ຊຳລະແລ້ວ')}</Text>;
  }

  // ===== installment / deposit plan (overrides single-payment) =====
  if ((job.paymentInstallments?.length ?? 0) > 0 &&
      (job.status === 'pending_payment' || job.status === 'completed')) {
    const list = job.paymentInstallments!;
    const paidTotal = list.filter((it) => it.confirmedAt).reduce((s, it) => s + it.amount, 0);
    const grand = list.reduce((s, it) => s + it.amount, 0);
    const nextOwe = list.findIndex((it) => !it.paidByCustomerAt); // next unpaid (customer)
    return (
      <View style={styles.instWrap}>
        <View style={styles.instHead}>
          <Text style={styles.instTitle}>{tt('jobDetail', '💳 ແຜນຈ່າຍ —')} {list.length} {tt('jobDetail', 'ງວດ')}</Text>
          <Text style={styles.instProg}>{paidTotal.toLocaleString()} / {grand.toLocaleString()} {tt('jobDetail', 'ກີບ')}</Text>
        </View>
        {list.map((it, i) => {
          const state = it.confirmedAt ? 'done' : it.paidByCustomerAt ? 'await' : 'open';
          return (
            <View key={i} style={styles.instRow}>
              <Text style={styles.instIcon}>{state === 'done' ? '✅' : state === 'await' ? '⏳' : '⚪'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.instLabel}>{it.label}</Text>
                <Text style={styles.instSub}>
                  {it.amount.toLocaleString()} {tt('jobDetail', 'ກີບ')}
                  {state === 'done' ? tt('jobDetail', ' · ຮັບແລ້ວ') : state === 'await' ? tt('jobDetail', ' · ລໍຢືນຢັນ') : ''}
                </Text>
              </View>
              {/* customer pays the next open installment */}
              {isOwner && state === 'open' && i === nextOwe && (
                <Pressable
                  style={[styles.instBtn, busy && styles.btnDisabled]}
                  onPress={() => run(() => markInstallmentPaid(job.id, i, method, slip[0]), `${tt('jobDetail', 'ຢືນຢັນຈ່າຍ')} ${it.label}?`)}
                  disabled={busy}>
                  <Text style={styles.instBtnText}>{tt('jobDetail', 'ໝາຍຈ່າຍ')}</Text>
                </Pressable>
              )}
              {/* technician confirms a paid installment */}
              {isTech && state === 'await' && (
                <Pressable
                  style={[styles.instBtn, styles.instBtnGreen, busy && styles.btnDisabled]}
                  onPress={() => run(() => confirmInstallment(job.id, i), `${tt('jobDetail', 'ຢືນຢັນຮັບ')} ${it.label}?`)}
                  disabled={busy}>
                  <Text style={styles.instBtnText}>{tt('jobDetail', 'ຢືນຢັນຮັບ')}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {/* method picker for the customer's next payment */}
        {isOwner && nextOwe >= 0 && (
          <View style={styles.instMethods}>
            {(['cash', 'transfer', 'qr'] as PaymentMethod[]).map((m) => (
              <Pressable key={m} style={[styles.payChip, method === m && styles.payChipOn]} onPress={() => setMethod(m)}>
                <Text style={[styles.payChipText, method === m && styles.payChipTextOn]}>
                  {PAYMENT_METHOD_LABEL[m].icon} {tt('payment', PAYMENT_METHOD_LABEL[m].lao)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {list.every((it) => it.confirmedAt) && (
          <Text style={styles.wfDone}>{tt('jobDetail', '✓ ຊຳລະຄົບທຸກງວດ — ງານສຳເລັດ')}</Text>
        )}
      </View>
    );
  }

  if (job.status === 'completed') {
    return <Text style={styles.wfDone}>{tt('jobDetail', '✓ ງານສຳເລັດ ແລະ ຊຳລະແລ້ວ')}</Text>;
  }

  if (isTech) {
    if (job.status === 'assigned') {
      // arrival gate: confirm on-site with the customer's 4-digit code first
      if (!job.arrivedAt) {
        return (
          <View style={styles.arriveBox}>
            <Text style={styles.arriveLabel}>📍 {tt('jobDetail', 'ຮອດ ໜ້າ ງານ? ໃສ່ ລະຫັດ ທີ່ ລູກຄ້າ ບອກ')}</Text>
            <TextInput
              value={arrivalInput}
              onChangeText={(v) => { setArrivalInput(v.replace(/[^\d]/g, '').slice(0, 4)); setArrivalErr(false); }}
              keyboardType="numeric"
              placeholder="1234"
              placeholderTextColor="#9ca3af"
              maxLength={4}
              style={[styles.arriveInput, arrivalErr && styles.arriveInputErr]}
            />
            {arrivalErr && <Text style={styles.arriveErr}>{tt('jobDetail', '❌ ລະຫັດ ບໍ່ ຖືກ — ຖາມ ລູກຄ້າ ອີກ ຄັ້ງ')}</Text>}
            <Pressable
              style={[styles.btn, styles.wfBtn, (busy || arrivalInput.length < 4) && styles.btnDisabled]}
              disabled={busy || arrivalInput.length < 4}
              onPress={() => run(async () => {
                const ok = await confirmArrival(job.id, arrivalInput);
                if (!ok) setArrivalErr(true);
              })}>
              <Text style={styles.btnText}>{tt('jobDetail', '✓ ຢືນຢັນ ຕົວ ຕົນ')}</Text>
            </Pressable>
          </View>
        );
      }
      return (
        <Pressable
          style={[styles.btn, styles.wfBtn, busy && styles.btnDisabled]}
          onPress={() => run(() => startJob(job.id))}
          disabled={busy}>
          <Text style={styles.btnText}>{tt('jobDetail', '▶ ເລີ່ມງານ')}</Text>
        </Pressable>
      );
    }
    if (job.status === 'in_progress' && !job.techDoneAt) {
      return (
        <View style={styles.wfProgBox}>
          <Text style={styles.wfProgLabel}>{tt('jobDetail', 'ຄວາມຄືບໜ້າ')}: {job.progressPct ?? 0}%</Text>
          <View style={styles.pctRow}>
            {[25, 50, 75, 100].map((p) => (
              <Pressable
                key={p}
                style={[styles.pctChip, (job.progressPct ?? 0) === p && styles.pctChipOn]}
                onPress={() => run(() => setJobProgress(job.id, p))}
                disabled={busy}>
                <Text style={[styles.pctChipText, (job.progressPct ?? 0) === p && styles.pctChipTextOn]}>{p}%</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.wfProgHint}>📸 {tt('jobDetail', 'ຮູບ ຕອນ ສຳເລັດ (ບໍ່ບັງຄັບ)')}</Text>
          <PhotoPicker photos={donePhotos} onChange={setDonePhotos} pathPrefix={`jobs/${job.id}/done`} max={4} />
          <Pressable
            style={[styles.btn, styles.btnGreen, styles.wfBtn, busy && styles.btnDisabled, { marginTop: 10 }]}
            onPress={() => run(() => technicianMarkDone(job.id, donePhotos), tt('jobDetail', 'ແຈ້ງວ່າເຮັດສຳເລັດແລ້ວ?'))}
            disabled={busy}>
            <Text style={styles.btnText}>{tt('jobDetail', '✓ ແຈ້ງສຳເລັດ')}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'in_progress') {
      return <Text style={styles.wfWait}>{tt('jobDetail', '⏳ ລໍລູກຄ້າຢືນຢັນງານ')}</Text>;
    }
    // pending_payment — technician side
    if (job.status === 'pending_payment') {
      if (!job.paidByCustomerAt) {
        return <Text style={styles.wfWait}>{tt('jobDetail', '⏳ ລໍລູກຄ້າຊຳລະເງິນ')}</Text>;
      }
      return (
        <>
          <View style={styles.payInfo}>
            <Text style={styles.payInfoText}>
              {tt('jobDetail', '💸 ລູກຄ້າແຈ້ງຈ່າຍແລ້ວ')}
              {job.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[job.paymentMethod].icon} ${tt('payment', PAYMENT_METHOD_LABEL[job.paymentMethod].lao)}` : ''}
            </Text>
            {job.paymentSlip ? <Image source={{ uri: job.paymentSlip }} style={styles.slipImg} /> : null}
          </View>
          <Pressable
            style={[styles.btn, styles.btnGreen, styles.wfBtn, busy && styles.btnDisabled]}
            onPress={() => run(() => confirmPaymentReceived(job.id), tt('jobDetail', 'ຢືນຢັນວ່າ ໄດ້ຮັບເງິນແລ້ວ?'))}
            disabled={busy}>
            <Text style={styles.btnText}>{tt('jobDetail', '✓ ຢືນຢັນຮັບເງິນ — ປິດງານ')}</Text>
          </Pressable>
        </>
      );
    }
    return <Text style={styles.wfWait}>{tt('jobDetail', '⏳ ລໍລູກຄ້າຢືນຢັນ')}</Text>;
  }

  // ===== owner (customer) side =====
  if (isOwner && job.status === 'in_progress' && job.techDoneAt) {
    return (
      <Pressable
        style={[styles.btn, styles.btnGreen, styles.wfBtn, busy && styles.btnDisabled]}
        onPress={() => run(() => confirmWorkDone(job.id), tt('jobDetail', 'ຢືນຢັນວ່າ ງານຮຽບຮ້ອຍ ແລະ ໄປຂັ້ນຕອນຊຳລະ?'))}
        disabled={busy}>
        <Text style={styles.btnText}>{tt('jobDetail', '✓ ຢືນຢັນງານຮຽບຮ້ອຍ')}</Text>
      </Pressable>
    );
  }

  if (isOwner && job.status === 'pending_payment') {
    if (job.paidByCustomerAt) {
      return <Text style={styles.wfWait}>{tt('jobDetail', '⏳ ລໍຊ່າງຢືນຢັນຮັບເງິນ')}</Text>;
    }
    const METHODS: PaymentMethod[] = ['cash', 'transfer', 'qr'];
    return (
      <View style={styles.payPanel}>
        <Text style={styles.payTitle}>{tt('jobDetail', '💰 ເລືອກວິທີຊຳລະ')}</Text>
        <View style={styles.payMethods}>
          {METHODS.map((m) => (
            <Pressable
              key={m}
              style={[styles.payChip, method === m && styles.payChipOn]}
              onPress={() => setMethod(m)}>
              <Text style={[styles.payChipText, method === m && styles.payChipTextOn]}>
                {PAYMENT_METHOD_LABEL[m].icon} {tt('payment', PAYMENT_METHOD_LABEL[m].lao)}
              </Text>
            </Pressable>
          ))}
        </View>
        {method !== 'cash' && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.paySlipLabel}>{tt('jobDetail', 'ຮູບສະລິບ (ບໍ່ບັງຄັບ)')}</Text>
            <PhotoPicker photos={slip} onChange={setSlip} pathPrefix={`jobs/${job.id}`} max={1} />
          </View>
        )}
        <Pressable
          style={[styles.btn, styles.wfBtn, busy && styles.btnDisabled]}
          onPress={() =>
            run(
              () => markPaidByCustomer(job.id, method, slip[0]),
              tt('jobDetail', 'ຢືນຢັນວ່າ ໄດ້ຈ່າຍເງິນແລ້ວ?'),
            )
          }
          disabled={busy}>
          <Text style={styles.btnText}>{tt('jobDetail', '✓ ຂ້ອຍຈ່າຍແລ້ວ')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Text style={styles.wfWait}>
      {job.status === 'assigned' ? tt('jobDetail', '⏳ ລໍຊ່າງເລີ່ມງານ') : tt('jobDetail', '🛠️ ຊ່າງກຳລັງເຮັດ')}
    </Text>
  );
}

/** Building Registry: shows the linked asset's context on the job (Phase: job↔asset). */
function LinkedAssetCard({ assetId, siteId }: { assetId: string; siteId?: string }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const tt = useTT();
  useEffect(() => watchAsset(assetId, setAsset), [assetId]);
  if (!asset) return null;
  const name = [asset.brand, asset.model].filter(Boolean).join(' ') || tt('jobDetail', 'ຊັບສິນ');
  const w = warrantyStatus(asset);
  const rows = paramComparison(asset);
  const hCell = { flex: 1, fontSize: 12, fontWeight: '800' as const, color: '#475569', textAlign: 'center' as const };
  return (
    <View style={{ marginTop: 14, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#075985', marginBottom: 6 }}>🔩 {tt('jobDetail', 'ຊັບສິນ ທີ່ ກ່ຽວ')}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>{name}</Text>
      <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
        {asset.serial ? `SN ${asset.serial}` : ''}{w.state !== 'none' ? ` · 🛡️ ${w.state === 'active' ? tt('jobDetail', 'ຮັບປະກັນ') : tt('jobDetail', 'ໝົດ ຮັບປະກັນ')}` : ''} · 📜 {tt('jobDetail', 'ປະຫວັດ')} {asset.history.length}
      </Text>
      {rows.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 3 }}>
            <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '800', color: '#475569' }}>📐 {tt('jobDetail', 'ພາຣາມິເຕີ')}</Text>
            <Text style={hCell}>{tt('jobDetail', 'ໂຮງງານ')}</Text><Text style={hCell}>{tt('jobDetail', 'ຕິດຕັ້ງ')}</Text><Text style={hCell}>{tt('jobDetail', 'ຫຼ້າສຸດ')}</Text>
          </View>
          {rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', paddingVertical: 3 }}>
              <Text style={{ flex: 1.5, fontSize: 12, color: '#111', fontWeight: '600' }}>{r.label}{r.unit ? ` (${r.unit})` : ''}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{r.factory ?? '—'}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{r.install ?? '—'}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: r.latest ? '#1e3a8a' : '#6b7280', fontWeight: r.latest ? '800' : '400', textAlign: 'center' }}>{r.latest ?? '—'}</Text>
            </View>
          ))}
        </View>
      )}
      {siteId && (
        <Pressable onPress={() => router.push(`/site/${siteId}` as any)} style={{ marginTop: 10, backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>📖 {tt('jobDetail', 'ເບິ່ງ ໃນ Dossier (ຄູ່ມື · ອາໄລ່ · param)')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  footerBleed: { width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 10, width: '100%', maxWidth: 720 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111', flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  section: { marginTop: 18 },
  updComposer: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginTop: 8, marginBottom: 12 },
  updInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', minHeight: 44, textAlignVertical: 'top', backgroundColor: '#fff' },
  updSend: { backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  updSendText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  updEmpty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 8 },
  updItem: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  updAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  updAvTech: { backgroundColor: '#EAF2FB' },
  updAvCust: { backgroundColor: '#f1f5f9' },
  updAvIcon: { fontSize: 15 },
  updHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updName: { fontSize: 12, fontWeight: '700', color: '#111', flexShrink: 1 },
  updRolePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  updRolePillTech: { backgroundColor: '#EAF2FB' },
  updRolePillCust: { backgroundColor: '#f1f5f9' },
  updRoleText: { fontSize: 12, fontWeight: '700' },
  updRoleTextTech: { color: '#0066CC' },
  updRoleTextCust: { color: '#6b7280' },
  updTime: { fontSize: 12, color: '#9ca3af', marginLeft: 'auto' },
  updNoteText: { fontSize: 12, color: '#374151', marginTop: 3, lineHeight: 19 },
  updPhoto: { width: 64, height: 64, borderRadius: 8 },
  payPanel: { marginTop: 8, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#faf5ff', borderRadius: 10, padding: 12 },
  payTitle: { fontSize: 14, fontWeight: '700', color: '#5b21b6', marginBottom: 8 },
  payMethods: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  payChip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  payChipOn: { borderColor: '#7c3aed', backgroundColor: '#ede9fe' },
  payChipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  payChipTextOn: { color: '#5b21b6' },
  paySlipLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  payInfo: { marginTop: 4, marginBottom: 8, backgroundColor: '#faf5ff', borderRadius: 8, padding: 10 },
  payInfoText: { fontSize: 12, color: '#5b21b6', fontWeight: '600' },
  slipImg: { width: 90, height: 90, borderRadius: 8, marginTop: 8 },
  sLabel: { fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  sValue: { fontSize: 14, color: '#111', marginTop: 4 },
  budgetBig: { fontSize: 15, fontWeight: '700', color: '#0066CC', marginTop: 4 },
  budgetUnit: { fontSize: 14, color: '#6b7280', fontWeight: 'normal' },
  jobPhoto: { width: 140, height: 140, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  // bids
  emptyBids: { fontSize: 12, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' },
  bidCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, marginTop: 8 },
  bidTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bidAvatar: { width: 40, height: 40, borderRadius: 20 },
  bidAvatarEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  bidName: { fontSize: 14, fontWeight: '600', color: '#111' },
  bidRating: { fontSize: 12, color: '#f59e0b' },
  bidAbandon: { fontSize: 12, color: '#dc2626', fontWeight: '600', marginTop: 2 },
  cmpAbandon: { fontSize: 12, color: '#dc2626', fontWeight: '600', marginTop: 1 },
  bidPrice: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
  bidNote: { fontSize: 12, color: '#4b5563', marginTop: 8 },
  acceptedTag: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 10 },
  expiredTag: { fontSize: 12, color: '#b91c1c', fontWeight: '700', marginTop: 6 },
  rejectedTag: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workflowCard: { borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#f8fbff', borderRadius: 12, padding: 14, marginTop: 8 },
  adminBanner: { backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff', borderRadius: 8, padding: 8, marginBottom: 12 },
  adminBannerText: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  adminBannerSub: { fontSize: 12, color: '#6b21a8', marginTop: 2 },
  varCard: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 8 },
  varTotal: { fontSize: 14, fontWeight: '800', color: '#b45309' },
  varLine: { fontSize: 13, color: '#374151', marginTop: 4 },
  varNoteText: { fontSize: 12, color: '#78350f', marginTop: 6, fontStyle: 'italic' },
  varPendingTag: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  varApproved: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  varRejected: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  varWait: { fontSize: 12, color: '#92400e', marginTop: 8 },
  varOpenBtn: { borderWidth: 1, borderColor: '#f59e0b', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  varOpenBtnText: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  varComposer: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffdf6', borderRadius: 10, padding: 12 },
  varComposerTitle: { fontSize: 13, fontWeight: '800', color: '#b45309', marginBottom: 8 },
  varRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
  varInput: { borderWidth: 1, borderColor: '#e5d5b0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  varNoteInput: { minHeight: 44, textAlignVertical: 'top', marginTop: 4, marginBottom: 8 },
  varRm: { color: '#dc2626', fontSize: 15, fontWeight: '700', paddingHorizontal: 2 },
  varAdd: { color: '#b45309', fontSize: 12, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  varComposerTotal: { fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 8 },
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progBarBg: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  progBarFill: { height: 10, borderRadius: 5, backgroundColor: '#16a34a' },
  progText: { fontSize: 12, fontWeight: '800', color: '#16a34a', width: 40, textAlign: 'right' },
  donePhotosWrap: { marginTop: 12 },
  donePhotosLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 },
  donePhoto: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#e5e7eb' },
  wfProgBox: { marginTop: 12 },
  wfProgLabel: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 6 },
  pctRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  pctChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  pctChipOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  pctChipText: { fontSize: 13, color: '#4b5563', fontWeight: '700' },
  pctChipTextOn: { color: '#fff' },
  wfProgHint: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  wfTech: { fontSize: 14, fontWeight: '600', color: '#111' },
  wfTechLink: { fontSize: 14, fontWeight: '600', color: '#0066CC' },
  wfPrice: { fontSize: 14, fontWeight: '700', color: '#0066CC' },
  rateBtn: { backgroundColor: '#f59e0b', marginTop: 10 },
  reviewedTag: { fontSize: 12, color: '#16a34a', fontWeight: '600', textAlign: 'center', marginTop: 10 },
  msgBtn: { marginTop: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, padding: 11, alignItems: 'center' },
  msgBtnText: { color: '#0066CC', fontSize: 14, fontWeight: '600' },
  handoverBtnHot: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  handoverBtnHotText: { color: '#fff', fontWeight: '700' },
  disputeBtn: { marginTop: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#FF6B35', borderRadius: 8, padding: 11, alignItems: 'center' },
  disputeBtnText: { color: '#FF6B35', fontSize: 14, fontWeight: '600' },
  abandonBtn: { marginTop: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, padding: 11, alignItems: 'center' },
  abandonBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  disputeStatus: { marginTop: 10, backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, alignItems: 'center' },
  disputeStatusText: { color: '#c2410c', fontSize: 12, fontWeight: '600' },
  wfBtn: { marginTop: 4 },
  wfDone: { fontSize: 14, color: '#16a34a', fontWeight: '700', textAlign: 'center', marginTop: 10 },
  // arrival-code (quick-win 1)
  arriveBox: { backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#cfe4fb', borderRadius: 12, padding: 14, marginTop: 10 },
  arriveLabel: { fontSize: 13, fontWeight: '700', color: '#0c4a6e', marginBottom: 8 },
  arriveInput: { borderWidth: 2, borderColor: '#cfe0f5', borderRadius: 10, backgroundColor: '#fff', paddingVertical: 10, textAlign: 'center', fontSize: 24, fontWeight: '900', letterSpacing: 8, color: '#111' },
  arriveInputErr: { borderColor: '#dc2626' },
  arriveErr: { fontSize: 12, color: '#dc2626', marginTop: 6 },
  arrCodeCard: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center' },
  arrCodeLbl: { fontSize: 12, fontWeight: '700', color: '#9a3412' },
  arrCodeNum: { fontSize: 34, fontWeight: '900', letterSpacing: 10, color: '#7c2d12', marginVertical: 4 },
  arrCodeHint: { fontSize: 12, color: '#b45309' },
  arrDoneTag: { fontSize: 12, color: '#065f46', fontWeight: '700', textAlign: 'center', marginTop: 10 },
  wfWait: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 10 },
  surveyNote: { fontSize: 12, color: '#4b5563', marginTop: 8, fontStyle: 'italic' },
  instWrap: { borderWidth: 1, borderColor: '#ede9fe', backgroundColor: '#faf5ff', borderRadius: 10, padding: 12, marginTop: 4 },
  instHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  instTitle: { fontSize: 14, fontWeight: '700', color: '#5b21b6' },
  instProg: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#efe9fb' },
  instIcon: { fontSize: 15 },
  instLabel: { fontSize: 12, fontWeight: '600', color: '#111' },
  instSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  instBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  instBtnGreen: { backgroundColor: '#16a34a' },
  instBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  instMethods: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  checkBox: { backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10, marginTop: 8 },
  checkBoxTitle: { fontSize: 12, fontWeight: '700', color: '#0066CC', marginBottom: 4 },
  checkLine: { fontSize: 12, color: '#374151', marginTop: 2, lineHeight: 17 },
  cmpWrap: { marginBottom: 12 },
  cmpHead: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  cmpRow: { gap: 10, paddingBottom: 4 },
  cmpCol: { width: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 11 },
  cmpColBest: { borderWidth: 2, borderColor: '#16a34a' },
  cmpBadge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 6, overflow: 'hidden' },
  cmpBadgeBest: { color: '#065f46', backgroundColor: '#d1fae5' },
  cmpBadgeTop: { color: '#92400e', backgroundColor: '#fef3c7' },
  cmpName: { fontSize: 12, fontWeight: '600', color: '#111' },
  cmpRating: { fontSize: 12, color: '#F59E0B', marginTop: 1 },
  cmpPrice: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 8 },
  cmpUnit: { fontSize: 12, color: '#9ca3af' },
  cmpMeta: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 8, gap: 4 },
  cmpMetaLine: { fontSize: 12, color: '#6b7280' },
  cmpMetaOk: { color: '#16a34a', fontWeight: '600' },
  cmpBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 7, alignItems: 'center', marginTop: 10 },
  cmpBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cmpAccepted: { color: '#16a34a', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  quoteBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginTop: 8, gap: 3 },
  quoteItem: { fontSize: 12, color: '#374151', flexShrink: 1 },
  quoteMini: { fontSize: 12, color: '#9ca3af' },
  lineThumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4, marginBottom: 2 },
  lineThumb: { width: 46, height: 46, borderRadius: 6, backgroundColor: '#e5e7eb' },
  myBidBox: { backgroundColor: '#f0f9ff', borderRadius: 10, padding: 14, marginTop: 8 },
  myBidPrice: { fontSize: 14, fontWeight: '600', color: '#0066CC' },
  myBidStatus: { fontSize: 12, color: '#4b5563', marginTop: 4 },
  withdrawBtn: { marginTop: 10, paddingHorizontal: 12, justifyContent: 'center' },
  withdrawText: { color: '#dc2626', fontSize: 12 },
  verBadge: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginTop: 2 },
  revReq: { fontSize: 12, color: '#b45309', fontWeight: '700', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8, marginTop: 10 },
  revReqBox: { marginTop: 10 },
  // line-level counter — owner editor rows
  lcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  lcRowOff: { opacity: 0.55 },
  lcCheck: { paddingHorizontal: 2 },
  lcCheckTx: { fontSize: 20, color: '#0066CC' },
  lcDesc: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  lcStrike: { textDecorationLine: 'line-through', color: '#9ca3af' },
  lcQty: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  lcPrice: { width: 96, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 13, fontWeight: '800', color: '#0f172a', textAlign: 'right', backgroundColor: '#fff' },
  lcPriceOff: { backgroundColor: '#f1f5f9', color: '#9ca3af' },
  // line-level counter — tech accept/decline card
  lcCard: { borderWidth: 1, borderColor: '#bcd6f5', backgroundColor: '#f5f9ff', borderRadius: 12, padding: 12 },
  lcCardTitle: { fontSize: 14, fontWeight: '800', color: '#0066CC', marginBottom: 8 },
  lcvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 10 },
  lcvDesc: { flex: 1, fontSize: 13, color: '#374151' },
  lcvPrice: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  revReqTitle: { fontSize: 13, fontWeight: '700', color: '#b45309', marginBottom: 6 },
  revReqInput: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', minHeight: 60, textAlignVertical: 'top', marginBottom: 8 },
  revReqLbl: { fontSize: 12, color: '#92400e', fontWeight: '700', marginTop: 6, marginBottom: 4 },
  segRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  seg: { borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  segOn: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  segText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  segTextOn: { color: '#fff' },
  lineChip: { borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160 },
  lineChipOn: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  lineChipText: { fontSize: 12, color: '#92400e' },
  lineChipTextOn: { fontWeight: '700' },
  revReqPrev: { fontSize: 12, color: '#92400e', backgroundColor: '#fef9c3', borderRadius: 8, padding: 8, marginBottom: 8, fontWeight: '700' },
  revReqDone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  chatLink: { fontSize: 13, color: '#0066CC', fontWeight: '700' },
  bidActions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 },
  reviseBtn: { borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  reviseBtnText: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  revNoteBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 12, marginBottom: 10 },
  revNoteTitle: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  revNoteText: { fontSize: 13, color: '#78350f', marginTop: 3 },
  fLabel: { fontSize: 12, color: '#4b5563', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fff',
  },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  actions: { gap: 8, marginTop: 24 },
  btn: { backgroundColor: '#0066CC', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnGreen: { backgroundColor: '#16a34a' },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnDanger: { backgroundColor: '#dc2626' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  errorBox: { marginTop: 12, padding: 12, backgroundColor: '#fee', borderRadius: 8 },
  errorText: { color: '#c00', fontSize: 12 },
});
