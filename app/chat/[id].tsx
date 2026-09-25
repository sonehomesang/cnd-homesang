import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { uploadFile, uploadImage } from '@/lib/storage';
import {
  type Conversation,
  type Message,
  markConversationRead,
  sendFileMessage,
  sendImageMessage,
  sendMessage,
  sendQuoteCard,
  watchConversation,
  watchMessages,
} from '@/lib/chat';
import { type Job, watchJob } from '@/lib/jobs';
import { acceptBid, type Bid, createBid, declineCounter, reviseBidToTotal, sendCustomerCounter, watchBidsForJob } from '@/lib/bids';
import QuotationBuilder, { type QuoteDraft } from '@/components/QuotationBuilder';

const kip = (n: number) => (Number(n) || 0).toLocaleString('en-US');

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, loading } = useAuth();
  const tt = useTT();
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  // compose a brand-new quote from inside the chat (tech only)
  const [myBid, setMyBid] = useState<Bid | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!id) return;
    return watchConversation(id, setConvo);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchMessages(id, setMessages);
  }, [id]);

  // mark the thread read whenever it's open and new messages arrive
  useEffect(() => {
    if (id && fbUser && messages.length) markConversationRead(id, fbUser.uid);
  }, [id, fbUser, messages.length]);

  const jobId = convo?.jobId;
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    return watchJob(jobId, setJob);
  }, [jobId]);

  // watch the linked job's bids so we know whether THIS tech already quoted
  useEffect(() => {
    if (!jobId || !fbUser) { setMyBid(null); return; }
    return watchBidsForJob(jobId, (bs) => setMyBid(bs.find((b) => b.technicianId === fbUser.uid) ?? null));
  }, [jobId, fbUser]);

  const otherUid = convo?.participants.find((p) => p !== fbUser?.uid) ?? '';
  const otherName = convo?.names[otherUid] ?? tt('chat','ສົນທະນາ');

  // negotiation role: the job's owner is the customer, the other party the tech
  const isCustomer = !!job && fbUser?.uid === job.customerId;
  // a tech on an OPEN job who hasn't bid yet can compose a first quote right here
  const canQuote = !!(job && fbUser && job.status === 'open' && job.customerId !== fbUser.uid && !myBid);

  const sendQuote = async () => {
    if (!fbUser || !job || !draft) return;
    const items = (draft.items ?? []).filter((it) => it.desc.trim() !== '' || it.unitPrice > 0);
    if (items.length === 0 || draft.total <= 0) { setQuoteErr(tt('chat', 'ໃສ່ ລາຍການ ແລະ ລາຄາ ຢ່າງ ໜ້ອຍ 1 ລາຍການ')); return; }
    setSendingQuote(true); setQuoteErr('');
    try {
      const bidId = await createBid({
        jobId: job.id, technicianId: fbUser.uid, price: draft.total, items,
        subtotal: draft.subtotal, discount: draft.discount > 0 ? draft.discount : undefined,
        vatRate: draft.vatRate, vat: draft.vat, total: draft.total,
        surveyNote: draft.surveyNote, surveyPhotos: draft.surveyPhotos?.length ? draft.surveyPhotos : undefined,
        surveyChecklist: draft.surveyChecklist, workType: draft.workType,
        workContinuity: draft.workContinuity, workContinuityNote: draft.workContinuityNote,
        paymentPlan: draft.paymentPlan, validUntil: draft.validUntil,
      });
      await sendQuoteCard(id!, fbUser.uid, { bidId, jobId: job.id, version: 1, total: draft.total, itemCount: items.length, status: 'pending' });
      setQuoteOpen(false); setDraft(null);
    } catch (e: any) {
      setQuoteErr(e?.message ?? String(e));
    } finally {
      setSendingQuote(false);
    }
  };
  const lastMsg = messages[messages.length - 1];
  const otherReadAt = (otherUid ? convo?.lastReadAt?.[otherUid] : 0) ?? 0;
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterMode, setCounterMode] = useState<'customer' | 'tech'>('customer');
  const [counterAmt, setCounterAmt] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [negBusy, setNegBusy] = useState(false);

  const openCounter = (mode: 'customer' | 'tech', preset?: number) => {
    setCounterMode(mode);
    setCounterAmt(preset ? String(preset) : '');
    setCounterNote('');
    setCounterOpen(true);
  };

  const doAcceptQuote = async (bidId?: string) => {
    if (!bidId || !fbUser || negBusy) return;
    setNegBusy(true);
    try {
      await acceptBid(bidId, fbUser.uid);
      await sendMessage(id!, fbUser.uid, tt('chat', '✅ ຮັບ ໃບສະເໜີ ນີ້ ແລ້ວ'));
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setNegBusy(false); }
  };

  const doAcceptCounter = async (bidId?: string, amount?: number) => {
    if (!bidId || !amount || negBusy) return;
    setNegBusy(true);
    try { await reviseBidToTotal(bidId, amount); }
    catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setNegBusy(false); }
  };

  const doDecline = async (bidId?: string, amount?: number) => {
    if (!bidId || !amount || !fbUser || negBusy) return;
    setNegBusy(true);
    try { await declineCounter(bidId, fbUser.uid, amount); }
    catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setNegBusy(false); }
  };

  const submitCounter = async (bidId?: string) => {
    const amount = Number(String(counterAmt).replace(/[^\d]/g, ''));
    if (!bidId || !fbUser || !amount) return;
    setNegBusy(true);
    try {
      if (counterMode === 'customer') await sendCustomerCounter(bidId, amount, counterNote, fbUser.uid);
      else await reviseBidToTotal(bidId, amount); // tech's counter = a re-priced quote card
      setCounterOpen(false);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setNegBusy(false); }
  };

  const send = async () => {
    if (!fbUser || !id || text.trim() === '') return;
    const body = text;
    setText('');
    setSending(true);
    try {
      await sendMessage(id, fbUser.uid, body);
    } catch (e: any) {
      setText(body); // restore on failure
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };

  const pickAndSend = async () => {
    if (!fbUser || !id || uploading) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const filename = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
      const url = await uploadImage(result.assets[0].uri, `chat/${id}/${filename}`);
      await sendImageMessage(id, fbUser.uid, url);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setUploading(false);
    }
  };

  const pickAndSendFile = async () => {
    if (!fbUser || !id || uploading) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      alert(tt('chat', 'ແນບ ໄຟລ໌ ຮອງຮັບ ໃນ ເວັບ (ຮູບ ໃຊ້ ໄດ້ ທຸກ ບ່ອນ)'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setUploading(true);
      const objectUrl = URL.createObjectURL(f);
      try {
        const path = `chat/${id}/${Date.now()}-${f.name}`;
        const up = await uploadFile(objectUrl, path);
        await sendFileMessage(id, fbUser.uid, { url: up.url, name: f.name, size: up.size });
      } catch (e: any) {
        alert('Error: ' + (e?.message ?? String(e)));
      } finally {
        URL.revokeObjectURL(objectUrl);
        setUploading(false);
      }
    };
    input.click();
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text>{tt('chat','ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.headerBack}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{otherName}</Text>
          {!!convo?.jobTitle && (
            <Text style={styles.headerCtx} numberOfLines={1}>📋 {convo.jobTitle}</Text>
          )}
        </View>
      </View>

      {job && (
        <Pressable style={styles.ctxCard} onPress={() => router.push(`/jobs/${job.id}` as any)}>
          <Text style={styles.ctxIcon}>{job.surveyRequested ? '🔍' : '📋'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctxTitle} numberOfLines={1}>{job.title}</Text>
            <Text style={styles.ctxSub} numberOfLines={1}>
              {job.surveyRequested ? tt('chat','ລູກຄ້າຮ້ອງຂໍ ໃຫ້ສຳຫຼວດໜ້າງານ') : tt('chat','ງານທີ່ກ່ຽວຂ້ອງ')}
            </Text>
          </View>
          <Text style={styles.ctxLink}>{tt('chat','ເບິ່ງ ›')}</Text>
        </Pressable>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.msgs}
        contentContainerStyle={styles.msgsInner}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>{tt('chat','ເລີ່ມສົນທະນາ — ສົ່ງຂໍ້ຄວາມທຳອິດ')}</Text>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === fbUser.uid;
            const isLast = m.id === lastMsg?.id;

            // ---- interactive QUOTE CARD ----
            if (m.kind === 'quote') {
              const showActions = isLast && isCustomer && m.quoteStatus === 'pending';
              return (
                <View key={m.id} style={styles.qcRow}>
                  <View style={styles.qc}>
                    <View style={styles.qcHead}>
                      <Text style={styles.qcTitle}>🧾 {tt('chat','ໃບສະເໜີ ລາຄາ')}</Text>
                      <Text style={styles.qcV}>v{m.quoteVersion ?? 1}</Text>
                    </View>
                    <Text style={styles.qcTot}>{kip(m.quoteTotal ?? 0)} <Text style={styles.qcTotUnit}>{tt('chat','ກີບ')}</Text></Text>
                    <Text style={styles.qcMeta}>{m.quoteItemCount ?? 0} {tt('chat','ລາຍການ')}{m.quoteStatus === 'accepted' ? ` · ✅ ${tt('chat','ຮັບແລ້ວ')}` : ''}</Text>
                    {(m.quoteVersion ?? 1) > 1 && !!m.bidId && (
                      <Pressable onPress={() => router.push(`/quote-history/${m.bidId}` as any)}>
                        <Text style={styles.qcHist}>🕑 {tt('chat','ເບິ່ງ ປະຫວັດ ເວີຊັນ')}</Text>
                      </Pressable>
                    )}
                    {showActions && (
                      <View style={styles.qcActs}>
                        <Pressable style={[styles.qb, styles.qbO]} onPress={() => m.jobId && router.push(`/jobs/${m.jobId}` as any)}>
                          <Text style={styles.qbOtx}>{tt('chat','ເບິ່ງ ໃບເຕັມ')}</Text>
                        </Pressable>
                        <Pressable style={[styles.qb, styles.qbMut]} onPress={() => openCounter('customer', m.quoteTotal)}>
                          <Text style={styles.qbMuttx}>{tt('chat','ຕໍ່ລອງ')}</Text>
                        </Pressable>
                        <Pressable style={[styles.qb, styles.qbG]} disabled={negBusy} onPress={() => doAcceptQuote(m.bidId)}>
                          <Text style={styles.qbGtx}>✅ {tt('chat','ຮັບ')}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <Text style={styles.bTime}>{clock(m.createdAt)}</Text>
                </View>
              );
            }

            // ---- structured COUNTER-OFFER bubble ----
            if (m.kind === 'counter') {
              const fromCustomer = m.counterBy === 'customer';
              const showActions = isLast && !isCustomer && fromCustomer; // tech responds
              return (
                <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowThem]}>
                  <View style={[styles.co, mine ? styles.coMine : styles.coThem]}>
                    <Text style={styles.coLab}>💬 {tt('chat','ຂໍ ຕໍ່ ລາຄາ')}</Text>
                    <Text style={styles.coAmt}>{kip(m.counterAmount ?? 0)} {tt('chat','ກີບ')}</Text>
                    {!!m.counterNote && <Text style={styles.coNote}>{m.counterNote}</Text>}
                    {showActions && (
                      <View style={styles.qcActs}>
                        <Pressable style={[styles.qb, styles.qbG]} disabled={negBusy} onPress={() => doAcceptCounter(m.bidId, m.counterAmount)}>
                          <Text style={styles.qbGtx}>✅ {tt('chat','ຮັບ')}</Text>
                        </Pressable>
                        <Pressable style={[styles.qb, styles.qbO]} onPress={() => openCounter('tech', m.counterAmount)}>
                          <Text style={styles.qbOtx}>↩ {tt('chat','ສະເໜີ ໃໝ່')}</Text>
                        </Pressable>
                        <Pressable style={[styles.qb, styles.qbMut]} disabled={negBusy} onPress={() => doDecline(m.bidId, m.counterAmount)}>
                          <Text style={styles.qbMuttx}>✕</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  <Text style={styles.bTime}>{clock(m.createdAt)}</Text>
                </View>
              );
            }

            // ---- plain text / image / file ----
            return (
              <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowThem]}>
                {m.fileUrl ? (
                  <Pressable
                    style={[styles.fileChip, mine ? styles.fileChipMine : styles.fileChipThem]}
                    onPress={() => { if (typeof window !== 'undefined') window.open(m.fileUrl, '_blank'); }}>
                    <Text style={styles.fileIcon}>📎</Text>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[styles.fileName, mine && styles.bTextMe]} numberOfLines={1}>{m.fileName ?? tt('chat','ໄຟລ໌')}</Text>
                      {!!m.fileSize && <Text style={[styles.fileSize, mine && styles.fileSizeMine]}>{Math.max(1, Math.round(m.fileSize / 1024))} KB</Text>}
                    </View>
                  </Pressable>
                ) : m.imageUrl ? (
                  <Pressable
                    onPress={() => { if (typeof window !== 'undefined') window.open(m.imageUrl, '_blank'); }}>
                    <Image source={{ uri: m.imageUrl }} style={styles.bImage} />
                  </Pressable>
                ) : (
                  <View style={[styles.bubble, mine ? styles.me : styles.them]}>
                    <Text style={[styles.bText, mine && styles.bTextMe]}>{m.text}</Text>
                  </View>
                )}
                <Text style={styles.bTime}>{clock(m.createdAt)}</Text>
              </View>
            );
          })
        )}
        {!!lastMsg && lastMsg.senderId === fbUser.uid && (
          <Text style={styles.receipt}>
            {otherReadAt >= lastMsg.createdAt ? `✓✓ ${tt('chat','ອ່ານ ແລ້ວ')}` : `✓ ${tt('chat','ສົ່ງ ແລ້ວ')}`}
          </Text>
        )}
      </ScrollView>

      {counterOpen && (
        <View style={styles.coSheet}>
          <View style={styles.coSheetHead}>
            <Text style={styles.coSheetTitle}>
              {counterMode === 'customer' ? tt('chat','💬 ຂໍ ຕໍ່ ລາຄາ') : tt('chat','↩ ສະເໜີ ລາຄາ ໃໝ່')}
            </Text>
            <Pressable onPress={() => setCounterOpen(false)} hitSlop={8}><Text style={styles.coSheetX}>✕</Text></Pressable>
          </View>
          <TextInput
            value={counterAmt}
            onChangeText={(v) => setCounterAmt(v.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
            keyboardType="numeric"
            placeholder={tt('chat','ລາຄາ ລວມ (ກີບ)')}
            placeholderTextColor="#999"
            style={styles.coInput}
          />
          {counterMode === 'customer' && (
            <TextInput
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder={tt('chat','ໝາຍເຫດ (ບໍ່ບັງຄັບ)')}
              placeholderTextColor="#999"
              style={styles.coInput}
            />
          )}
          <Pressable
            style={[styles.coSubmit, (negBusy || !counterAmt) && styles.sendOff]}
            disabled={negBusy || !counterAmt}
            onPress={() => submitCounter(lastMsg?.bidId)}>
            <Text style={styles.coSubmitTx}>
              {counterMode === 'customer' ? tt('chat','ສົ່ງ ຄຳ ຕໍ່ລອງ') : tt('chat','ອອກ ໃບ ໃໝ່ ຕາມ ນີ້')}
            </Text>
          </Pressable>
        </View>
      )}

      {canQuote && !quoteOpen && (
        <Pressable style={styles.quoteCta} onPress={() => { setQuoteErr(''); setQuoteOpen(true); }}>
          <Text style={styles.quoteCtaTx}>🧾 {tt('chat', 'ສ້າງ ໃບ ສະເໜີ ໃຫ້ ລູກຄ້າ')}</Text>
        </Pressable>
      )}

      <Modal visible={quoteOpen} animationType="slide" onRequestClose={() => setQuoteOpen(false)}>
        <View style={styles.qmRoot}>
          <View style={styles.qmHead}>
            <Text style={styles.qmTitle}>🧾 {tt('chat', 'ໃບ ສະເໜີ ໃໝ່')}</Text>
            <Pressable onPress={() => setQuoteOpen(false)} hitSlop={8}><Text style={styles.coSheetX}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
            <QuotationBuilder
              pathPrefix={`bids/${fbUser?.uid ?? 'x'}`}
              category={job?.category}
              surveyRequested={job?.surveyRequested}
              ownerId={fbUser?.uid}
              onChange={setDraft}
            />
            {!!quoteErr && <Text style={styles.qmErr}>{quoteErr}</Text>}
          </ScrollView>
          <Pressable style={[styles.qmSend, (sendingQuote || !draft) && styles.sendOff]} disabled={sendingQuote || !draft} onPress={sendQuote}>
            <Text style={styles.qmSendTx}>{sendingQuote ? tt('chat', 'ກຳລັງ ສົ່ງ...') : tt('chat', 'ສົ່ງ ໃບ ສະເໜີ')}</Text>
          </Pressable>
        </View>
      </Modal>

      <View style={styles.bar}>
        <Pressable style={styles.attach} onPress={pickAndSend} disabled={uploading}>
          <Text style={styles.attachIcon}>{uploading ? '⏳' : '📷'}</Text>
        </Pressable>
        <Pressable style={styles.attach} onPress={pickAndSendFile} disabled={uploading}>
          <Text style={styles.attachIcon}>📎</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={tt('chat','ຂໍ້ຄວາມ...')}
          placeholderTextColor="#999"
          style={styles.input}
          multiline
          onSubmitEditing={send}
        />
        <Pressable
          style={[styles.send, (sending || text.trim() === '') && styles.sendOff]}
          onPress={send}
          disabled={sending || text.trim() === ''}>
          <Text style={styles.sendIcon}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  quoteCta: { marginHorizontal: 12, marginBottom: 6, backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  quoteCtaTx: { color: '#0066CC', fontWeight: '800', fontSize: 13 },
  qmRoot: { flex: 1, backgroundColor: '#F8FAFC' },
  qmHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  qmTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  qmErr: { color: '#dc2626', fontSize: 12.5, fontWeight: '700', marginTop: 10 },
  qmSend: { backgroundColor: '#0066CC', paddingVertical: 15, alignItems: 'center', margin: 12, borderRadius: 12 },
  qmSendTx: { color: '#fff', fontSize: 15, fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerBack: { fontSize: 15, color: '#0066CC', paddingHorizontal: 4 },
  headerName: { fontSize: 15, fontWeight: '700', color: '#111' },
  headerCtx: { fontSize: 12, color: '#1e40af' },
  ctxCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#EAF2FB', borderBottomWidth: 1, borderBottomColor: '#bcd6f5' },
  ctxIcon: { fontSize: 15 },
  ctxTitle: { fontSize: 12, fontWeight: '700', color: '#111' },
  ctxSub: { fontSize: 12, color: '#1e40af', marginTop: 1 },
  ctxLink: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  msgs: { flex: 1 },
  msgsInner: { padding: 14, gap: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 30 },
  bubbleRow: { maxWidth: '80%', marginVertical: 3 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  them: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#eef0f3' },
  me: { backgroundColor: '#0066CC', borderBottomRightRadius: 4 },
  bText: { fontSize: 14, color: '#111', lineHeight: 20 },
  bTextMe: { color: '#fff' },
  bImage: { width: 180, height: 180, borderRadius: 14, backgroundColor: '#eef0f3' },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, maxWidth: 240 },
  fileChipThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3' },
  fileChipMine: { backgroundColor: '#0066CC' },
  fileIcon: { fontSize: 15 },
  fileName: { fontSize: 13, fontWeight: '700', color: '#111' },
  fileSize: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  fileSizeMine: { color: '#cfe0f5' },
  bTime: { fontSize: 12, color: '#9ca3af', marginTop: 2, marginHorizontal: 4 },
  receipt: { fontSize: 12, color: '#0066CC', fontWeight: '700', alignSelf: 'flex-end', marginTop: 2, marginRight: 6 },
  // quote card
  qcRow: { alignSelf: 'stretch', alignItems: 'center', marginVertical: 5 },
  qc: { width: '92%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfe4fb', borderRadius: 14, overflow: 'hidden' },
  qcHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0f7ff', borderBottomWidth: 1, borderBottomColor: '#e0efff', paddingHorizontal: 12, paddingVertical: 8 },
  qcTitle: { fontSize: 13, fontWeight: '800', color: '#0c4a6e' },
  qcV: { fontSize: 12, fontWeight: '800', color: '#fff', backgroundColor: '#0066CC', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  qcTot: { fontSize: 15, fontWeight: '900', color: '#111', paddingHorizontal: 12, paddingTop: 10 },
  qcTotUnit: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  qcMeta: { fontSize: 12, color: '#6b7280', paddingHorizontal: 12, paddingTop: 2 },
  qcHist: { fontSize: 12, fontWeight: '700', color: '#0066CC', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 },
  qcActs: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingBottom: 12 },
  qb: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingVertical: 9 },
  qbO: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC' },
  qbOtx: { fontSize: 12, fontWeight: '800', color: '#0066CC' },
  qbG: { backgroundColor: '#16a34a' },
  qbGtx: { fontSize: 12, fontWeight: '800', color: '#fff' },
  qbMut: { backgroundColor: '#f1f5f9' },
  qbMuttx: { fontSize: 12, fontWeight: '800', color: '#475569' },
  // counter bubble
  co: { maxWidth: '82%', borderRadius: 14, padding: 10, borderWidth: 1, borderStyle: 'dashed' },
  coMine: { backgroundColor: '#eef6ff', borderColor: '#9dc7f5' },
  coThem: { backgroundColor: '#fff', borderColor: '#e2c9a0' },
  coLab: { fontSize: 12, fontWeight: '800', color: '#0c3d73', opacity: 0.8, marginBottom: 2 },
  coAmt: { fontSize: 15, fontWeight: '900', color: '#111' },
  coNote: { fontSize: 12, color: '#475569', marginTop: 2 },
  // counter composer sheet
  coSheet: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', padding: 12, gap: 8 },
  coSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coSheetTitle: { fontSize: 14, fontWeight: '800', color: '#0c4a6e' },
  coSheetX: { fontSize: 15, color: '#9ca3af', fontWeight: '800' },
  coInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111', fontWeight: '700' },
  coSubmit: { backgroundColor: '#0066CC', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  coSubmitTx: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bar: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  attach: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  attachIcon: { fontSize: 15 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9, fontSize: 14, color: '#111', maxHeight: 110 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#A8CAEE' },
  sendIcon: { color: '#fff', fontSize: 15 },
});
