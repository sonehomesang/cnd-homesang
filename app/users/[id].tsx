import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getOrCreateConversation } from '@/lib/chat';
import { getProviderAbandonCount, watchAssignedJobs, type Job } from '@/lib/jobs';
import { watchTechCard, type TechCard } from '@/lib/users';
import { techTier, TIER_BADGE } from '@/lib/techTier';
import { currentPosition, distanceKm } from '@/lib/geo';
import { type Review, watchReviewsFor } from '@/lib/reviews';
import { SITE, shareItem } from '@/lib/share';
import { codeForUid, ensureMyCode } from '@/lib/referrals';
import FavoriteButton from '@/components/FavoriteButton';
import StoreReels from '@/components/StoreReels';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';
import { useTT, ttStatic } from '@/lib/i18n';

function stars(n: number): string {
  const full = Math.round(n);
  return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
}

function timeAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return ttStatic('time', 'ມື້ນີ້');
  if (days < 30) return `${days} ${ttStatic('time', 'ມື້ກ່ອນ')}`;
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function displayName(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || ttStatic('userProfile', 'ຜູ້ໃຊ້');
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile: myProfile } = useAuth();
  const [priv, setPriv] = useState<any>(null);   // users doc — signed-in only
  const [card, setCard] = useState<TechCard | null>(null); // public projection
  const [contact, setContact] = useState<any>(null); // techContact — full service address (signed-in)
  const [privDone, setPrivDone] = useState(false);
  const [cardDone, setCardDone] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [starting, setStarting] = useState(false);
  const [abandons, setAbandons] = useState(0);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const tt = useTT();

  // A logged-OUT visitor cannot read /users (rules require auth), so the page
  // falls back to the world-readable techCards projection — same public fields,
  // never phone/email. Signed-in viewers get the richer users doc.
  const user: any = priv ?? (card ? { ...card, id: card.uid, roles: ['technician'] } : null);
  const loading = !privDone || !cardDone;

  const messageUser = async () => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    setStarting(true);
    try {
      const cid = await getOrCreateConversation(fbUser.uid, id);
      router.push(`/chat/${cid}` as any);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setStarting(false);
    }
  };

  const doShare = async () => {
    const ref = fbUser ? codeForUid(fbUser.uid) : undefined;
    if (fbUser) ensureMyCode(fbUser.uid).catch(() => {});
    await shareItem({ url: `${SITE}/users/${id}${ref ? `?ref=${ref}` : ''}`, title: displayName(user), text: displayName(user) });
  };

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'users', id),
      (snap) => {
        setPriv(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setPrivDone(true);
      },
      () => { setPriv(null); setPrivDone(true); }, // denied when logged out — fall back to the card
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchTechCard(id, (c) => { setCard(c); setCardDone(true); });
  }, [id]);

  // techContact — a technician's FULL service address, readable by any signed-in
  // viewer (the private users doc is not). Lets a logged-in customer see where
  // the tech works even though `priv` (users) is now owner/admin-only.
  useEffect(() => {
    if (!id || !fbUser) { setContact(null); return; }
    const unsub = onSnapshot(
      doc(db, 'techContact', id),
      (s) => setContact(s.exists() ? s.data() : null),
      () => setContact(null),
    );
    return unsub;
  }, [id, fbUser]);

  // jobs are world-readable, so "currently working on" shows for guests too
  useEffect(() => {
    if (!id) return;
    return watchAssignedJobs(id, (js) =>
      setActiveJobs(js.filter((j) => j.status === 'assigned' || j.status === 'in_progress')));
  }, [id]);

  // distance: use the viewer's saved location when signed in, else let them ask
  useEffect(() => {
    const lat = (myProfile as any)?.lat;
    const lng = (myProfile as any)?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') setMyPos({ lat, lng });
  }, [myProfile]);

  useEffect(() => {
    if (!id) return;
    return watchReviewsFor(id, setReviews);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getProviderAbandonCount(id).then((n) => alive && setAbandons(n)).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return <View style={styles.center}><Text>{tt('userProfile', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('userProfile', 'ບໍ່ພົບຜູ້ໃຊ້')}</Text>
        <BackButton />
      </View>
    );
  }

  // Address visibility: the viewer's OWN doc (or admin) → full address from priv;
  // any OTHER signed-in viewer → the technician's full service address from the
  // techContact projection; a logged-out guest → coarse district/province only.
  const locationText: string = priv
    ? (priv.address || '')
    : (fbUser ? (contact?.address || card?.area || '') : (card?.area || ''));
  const rating = typeof user.rating === 'number' ? user.rating : 0;
  const count = user.reviewCount ?? 0;
  const specialties: string[] = Array.isArray(user.specialties) ? user.specialties : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <View style={styles.head}>
          {user.image ? (
            <Image source={{ uri: user.image }} style={styles.av} />
          ) : (
            <View style={[styles.av, styles.avEmpty]}><Text style={{ fontSize: 34 }}>👷</Text></View>
          )}
          <Text style={styles.name}>{displayName(user)}</Text>
          <View style={styles.badgeRow}>
            {(user as any).verified && (
              <View style={styles.verBadge}><Text style={styles.verText}>✔️ {tt('userProfile', 'ຢືນຢັນ ແລ້ວ')}</Text></View>
            )}
            {(() => {
              const t = techTier(user);
              const b = TIER_BADGE[t];
              return (
                <View style={[styles.tierBadge, { backgroundColor: b.bg }]}>
                  <Text style={[styles.tierText, { color: b.fg }]}>{b.emoji} {tt('userProfile', b.label)}</Text>
                </View>
              );
            })()}
          </View>
          {!!user.roleDescription && <Text style={styles.role}>{user.roleDescription}</Text>}
          {/* signed-in viewers get the full address; guests only the coarse area
              published on the public card (never the house/village detail) */}
          {!!locationText && <Text style={styles.role}>📍 {locationText}</Text>}
          <Text style={styles.big}>{rating.toFixed(1)}</Text>
          <Text style={styles.starsLine}>{stars(rating)} · {count} {tt('userProfile', 'ຣີວິວ')}</Text>
          {abandons > 0 && (
            <View style={styles.abandonChip}>
              <Text style={styles.abandonChipText}>{tt('userProfile', '⚠️ ຍົກເລີກ / ກ່ຽງງານ ກາງຄັນ')} {abandons} {tt('userProfile', 'ຄັ້ງ')}</Text>
            </View>
          )}
          {specialties.length > 0 && (
            <View style={styles.chips}>
              {specialties.map((s) => (
                <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
              ))}
            </View>
          )}
          {/* how far the technician is from the viewer */}
          {typeof user.lat === 'number' && typeof user.lng === 'number' && (
            myPos ? (
              <Text style={styles.distText}>
                📍 {tt('userProfile', 'ຫ່າງ ຈາກ ທ່ານ ປະມານ')} {distanceKm(myPos, { lat: user.lat, lng: user.lng }).toFixed(1)} km
              </Text>
            ) : (
              <Pressable
                style={styles.distBtn}
                onPress={() => currentPosition().then(setMyPos).catch(() => {})}>
                <Text style={styles.distBtnText}>📍 {tt('userProfile', 'ເບິ່ງ ໄລຍະ ຫ່າງ ຈາກ ຂ້ອຍ')}</Text>
              </Pressable>
            )
          )}

          {fbUser && fbUser.uid !== id && (
            <View style={styles.actionRow}>
              <Pressable style={[styles.msgBtn, starting && styles.msgBtnOff]} onPress={messageUser} disabled={starting}>
                <Text style={styles.msgBtnText}>{starting ? '...' : tt('userProfile', '💬 ສົ່ງຂໍ້ຄວາມ')}</Text>
              </Pressable>
              <FavoriteButton type="technician" targetId={id} meta={{ name: displayName(user), image: user.image }} size={24} />
            </View>
          )}
          {fbUser && fbUser.uid !== id && (user.roles ?? []).includes('technician') && (
            <Pressable style={styles.bookBtn} onPress={() => router.push(`/book/${id}` as any)}>
              <Text style={styles.bookBtnText}>{tt('userProfile', '⚡ ຈ້າງໂດຍກົງ')}</Text>
            </Pressable>
          )}
        </View>

        {/* logged-out visitors browse freely; contacting needs an account */}
        {!fbUser && (
          <Pressable style={styles.loginCard} onPress={() => router.push('/sign-in' as any)}>
            <Text style={styles.loginTitle}>🔒 {tt('userProfile', 'ເຂົ້າ ສູ່ ລະບົບ ເພື່ອ ເບິ່ງ ເພີ່ມ')}</Text>
            <Text style={styles.loginBody}>
              {tt('userProfile', 'ຕິດຕໍ່ ຊ່າງ · ຈ້າງ ໂດຍກົງ · ເບິ່ງ ຂໍ້ມູນ ຕິດຕໍ່ — ຕ້ອງ ມີ ບັນຊີ ກ່ອນ')}
            </Text>
          </Pressable>
        )}

        <Pressable style={styles.shareBtn} onPress={doShare}>
          <Text style={styles.shareBtnText}>↗ {tt('userProfile', 'ແຊຣ໌ ໜ້ານີ້')}</Text>
        </Pressable>

        {activeJobs.length > 0 && (
          <>
            <Text style={styles.section}>🔧 {tt('userProfile', 'ວຽກ ທີ່ ກຳລັງ ເຮັດ')} ({activeJobs.length})</Text>
            {activeJobs.map((j) => (
              <View key={j.id} style={styles.jobRow}>
                <Text style={styles.jobTitle} numberOfLines={1}>{j.title}</Text>
                <Text style={styles.jobState}>
                  {j.status === 'in_progress' ? tt('userProfile', 'ກຳລັງ ເຮັດ') : tt('userProfile', 'ຮັບ ງານ ແລ້ວ')}
                </Text>
              </View>
            ))}
          </>
        )}

        <StoreReels authorId={id} title={tt('userProfile', '🎬 ວິດີໂອ ຜົນງານ')} />

        {(() => {
          const portfolio: string[] = Array.isArray(user.portfolio) ? user.portfolio : [];
          if (portfolio.length === 0) return null;
          return (
            <>
              <Text style={styles.section}>{tt('userProfile', '🖼️ ຜົນງານ')} ({portfolio.length})</Text>
              <View style={styles.gallery}>
                {portfolio.map((url) => (
                  <Pressable
                    key={url}
                    style={styles.galleryItem}
                    onPress={() => {
                      if (typeof window !== 'undefined') window.open(url, '_blank');
                    }}>
                    <Image source={{ uri: url }} style={styles.galleryImg} />
                  </Pressable>
                ))}
              </View>
            </>
          );
        })()}

        {(() => {
          const ws = user.workSchedule as Record<string, { available: boolean; open: string; close: string }> | undefined;
          if (!ws) return null;
          const DL: Record<string, string> = { mon: tt('userProfile', 'ຈັນ'), tue: tt('userProfile', 'ອັງຄານ'), wed: tt('userProfile', 'ພຸດ'), thu: tt('userProfile', 'ພະຫັດ'), fri: tt('userProfile', 'ສຸກ'), sat: tt('userProfile', 'ເສົາ'), sun: tt('userProfile', 'ອາທິດ') };
          return (
            <>
              <Text style={styles.section}>{tt('userProfile', '🗓️ ຕາຕະລາງເຮັດວຽກ')}</Text>
              <View style={styles.schedCard}>
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k) => ws[k] ? (
                  <View key={k} style={styles.schedRow}>
                    <Text style={styles.schedDay}>{DL[k]}</Text>
                    <Text style={[styles.schedTime, !ws[k].available && styles.schedOff]}>
                      {ws[k].available ? `${ws[k].open} – ${ws[k].close}` : tt('userProfile', 'ປິດ')}
                    </Text>
                  </View>
                ) : null)}
              </View>
            </>
          );
        })()}

        <Text style={styles.section}>{tt('userProfile', 'ຣີວິວ')} ({reviews.length})</Text>
        {reviews.length === 0 ? (
          <Text style={styles.empty}>{tt('userProfile', 'ຍັງບໍ່ມີຣີວິວ')}</Text>
        ) : (
          reviews.map((r) => (
            <View key={r.id} style={styles.rev}>
              {r.raterImage ? (
                <Image source={{ uri: r.raterImage }} style={styles.rav} />
              ) : (
                <View style={[styles.rav, styles.avEmpty]}><Text style={{ fontSize: 16 }}>🙂</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.revTop}>
                  <Text style={styles.revName}>{r.raterName}</Text>
                  <Text style={styles.revStars}>{stars(r.rating)}</Text>
                </View>
                {!!r.comment && <Text style={styles.revText}>{r.comment}</Text>}
                <Text style={styles.revTime}>{timeAgo(r.createdAt)}</Text>
              </View>
            </View>
          ))
        )}

        <BackButton />
      </View>
      <View style={styles.footerBleed}><AppFooter page="tech-profile" /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  footerBleed: { width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  head: { backgroundColor: '#fff', borderRadius: 10, padding: 24, alignItems: 'center' },
  av: { width: 80, height: 80, borderRadius: 40 },
  avEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 10 },
  role: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, justifyContent: 'center', flexWrap: 'wrap' },
  verBadge: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2 },
  verText: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  tierBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2 },
  tierText: { fontSize: 12, fontWeight: '800' },
  big: { fontSize: 15, fontWeight: '800', color: '#f59e0b', marginTop: 10 },
  starsLine: { fontSize: 14, color: '#f59e0b' },
  abandonChip: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  abandonChipText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' },
  chip: { backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 12, color: '#3730a3' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  msgBtn: { backgroundColor: '#0066CC', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  msgBtnOff: { opacity: 0.6 },
  msgBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bookBtn: { marginTop: 12, backgroundColor: '#FF6B35', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  shareBtn: { backgroundColor: '#0066CC', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bookBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  distText: { fontSize: 12, color: '#0a7d33', fontWeight: '700', marginTop: 10 },
  distBtn: { marginTop: 10, borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  distBtnText: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  loginCard: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 14, marginTop: 12 },
  loginTitle: { fontSize: 14, fontWeight: '800', color: '#0066CC' },
  loginBody: { fontSize: 12, color: '#334155', marginTop: 4, lineHeight: 18 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 11, marginBottom: 6 },
  jobTitle: { flex: 1, fontSize: 13, color: '#111', fontWeight: '600' },
  jobState: { fontSize: 12, color: '#b45309', backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontWeight: '700' },
  section: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 20, marginBottom: 10 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryItem: { width: '31.5%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#eef0f3' },
  galleryImg: { width: '100%', height: '100%' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  schedCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12 },
  schedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  schedDay: { fontSize: 12, color: '#374151', fontWeight: '600' },
  schedTime: { fontSize: 12, color: '#0066CC' },
  schedOff: { color: '#9ca3af' },
  rev: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginBottom: 8 },
  rav: { width: 36, height: 36, borderRadius: 18 },
  revTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revName: { fontSize: 12, fontWeight: '600', color: '#111' },
  revStars: { fontSize: 12, color: '#f59e0b' },
  revText: { fontSize: 14, color: '#374151', marginTop: 3 },
  revTime: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
