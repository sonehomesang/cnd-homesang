import { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, type Gender } from '@/lib/auth-context';
import { updateUserLocation, updateUserProfile } from '@/lib/users';
import PhotoPicker from '@/components/PhotoPicker';
import ProfileRiderSection from '@/components/ProfileRiderSection';
import SavedAddresses from '@/components/SavedAddresses';
import { claimAdmin } from '@/lib/admin';
import { useTT } from '@/lib/i18n';
import { formatLaoPhone } from '@/lib/format';
import { isAnyAdmin } from '@/lib/adminTier';
import { useServiceCategories } from '@/lib/categories';
import { emojiOnly } from '@/components/CategoryIcon';
import AppFooter from '@/components/AppFooter';

type Status = 'idle' | 'saving' | 'saved' | 'error';
type Group = 'identity' | 'location' | 'bio' | 'business';

// Always yields a valid YYYY-MM-DD (what <input type="date"> requires) or ''.
// Accepts a number ts OR a legacy string; a garbage/out-of-range value returns
// '' so the picker shows blank (re-enterable) instead of an unusable string
// that the date input silently rejects (looked like DOB "disappeared").
function formatDate(ts: number | string | undefined): string {
  if (ts === undefined || ts === null || ts === '') return '';
  const n = typeof ts === 'number' ? ts : Date.parse(String(ts));
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  const y = d.getFullYear();
  if (y < 1900 || y > 2100) return ''; // reject corrupt values
  const p = (x: number) => String(x).padStart(2, '0');
  return `${y}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseDate(s: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

export default function ProfileScreen() {
  const { fbUser, profile, loading, signOut } = useAuth();
  const tt = useTT();

  // which group is currently unlocked for editing (null = all locked). The
  // menu itself now lives in the ProfileMenu drawer; this screen is the detail.
  const [editGroup, setEditGroup] = useState<Group | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [dob, setDob] = useState('');
  const [bio, setBio] = useState('');
  const [address, setAddress] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const specialtyOpts = useServiceCategories().map((c) => ({ value: c.value as string, label: `${emojiOnly(c.icon)} ${c.lao}`.trim() }));
  const [language, setLanguage] = useState('lo');
  const [adminSecret, setAdminSecret] = useState('');

  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locDetecting, setLocDetecting] = useState(false);
  const [locError, setLocError] = useState('');

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!loading && !fbUser) {
      router.replace('/sign-in');
    }
  }, [fbUser, loading]);

  // sync form state from the profile doc (also used by "cancel")
  const syncFromProfile = () => {
    if (!profile) return;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setEmail(profile.email ?? '');
    setGender((profile.gender as any) ?? '');
    setDob(formatDate(profile.dob));
    setBio(profile.bio ?? '');
    setAddress(profile.address ?? '');
    setCompanyName(profile.companyName ?? '');
    setRoleDescription(profile.roleDescription ?? '');
    setSpecialties(profile.specialties ?? []);
    setLanguage(profile.language ?? 'lo');
    setLat(profile.lat?.toString() ?? '');
    setLng(profile.lng?.toString() ?? '');
  };
  useEffect(() => { syncFromProfile(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile]);

  const toggleSpecialty = (val: string) => {
    setSpecialties((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val],
    );
  };

  const detectLocation = () => {
    setLocError('');
    setLocDetecting(true);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(6));
          setLng(pos.coords.longitude.toFixed(6));
          setLocDetecting(false);
        },
        (err) => {
          setLocError(err.message);
          setLocDetecting(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setLocError(tt('profileScreen','ຍັງບໍ່ຮອງຮັບ native — ຕ້ອງຕິດຕັ້ງ expo-location ກ່ອນ'));
      setLocDetecting(false);
    }
  };

  // save the whole profile; returns true on success. Called from a group's 💾.
  const save = async (): Promise<boolean> => {
    if (!fbUser) return false;
    setStatus('saving');
    setErrorMsg('');
    try {
      await updateUserProfile(fbUser.uid, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        gender: gender || undefined,
        dob: parseDate(dob),
        bio: bio || undefined,
        address: address || undefined,
        companyName: companyName || undefined,
        roleDescription: roleDescription || undefined,
        specialties: specialties.length > 0 ? specialties : undefined,
        language,
      });

      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        await updateUserLocation(fbUser.uid, latNum, lngNum);
      }

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
      return true;
    } catch (e: any) {
      console.error('save:', e);
      setStatus('error');
      setErrorMsg(e?.message ?? String(e));
      return false;
    }
  };

  const startEdit = (g: Group) => { setStatus('idle'); setEditGroup(g); };
  const cancelEdit = () => { syncFromProfile(); setEditGroup(null); };
  const saveGroup = async () => { const ok = await save(); if (ok) setEditGroup(null); };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>{tt('profileScreen','ກຳລັງໂຫຼດ...')}</Text>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={styles.center}>
        <Text>{tt('profileScreen','ບໍ່ມີ profile')}</Text>
        <Pressable style={styles.btn} onPress={() => router.replace('/profile-setup' as any)}>
          <Text style={styles.btnText}>{tt('profileScreen','ສ້າງ Profile')}</Text>
        </Pressable>
      </View>
    );
  }

  const roles = profile.roles ?? [];
  const phone8 = formatLaoPhone(profile.phone); // "+856 20 XXXX XXXX" — matches the sign-up input format
  const isTechnician = roles.includes('technician');
  const isAdminUser = isAnyAdmin(profile);
  const isShop = roles.includes('shop');
  const fullName = `${firstName} ${lastName}`.trim();
  const genderLabel = gender === 'male' ? tt('profileScreen','ຊາຍ') : gender === 'female' ? tt('profileScreen','ຍິງ') : '';
  const specialtyLabels = specialties.map((v) => specialtyOpts.find((o) => o.value === v)?.label ?? v).join(' · ');

  // ============ PROFILE DETAIL (locked; ✏️ per group) ============
  const editing = (g: Group) => editGroup === g;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ---- IDENTITY ---- */}
      <View style={styles.group}>
        <GroupHead icon="👤" title={tt('profileScreen','ຕົວຕົນ')} editing={editing('identity')} saving={status === 'saving'}
          labels={{ edit: tt('profileScreen','ແກ້ໄຂ'), save: tt('profileScreen','💾 ບັນທຶກ') }}
          onEdit={() => startEdit('identity')} onSave={saveGroup} onCancel={cancelEdit} />
        <View style={styles.idTop}>
          {editing('identity') && fbUser ? (
            <PhotoPicker mode="avatarCompact" photos={profile.image ? [profile.image] : []}
              onChange={async (urls) => { await updateUserProfile(fbUser.uid, { image: urls[0] }); }}
              pathPrefix={`users/${fbUser.uid}`} />
          ) : profile.image ? (
            <Image source={{ uri: profile.image }} style={styles.avatarMd} />
          ) : (
            <View style={[styles.avatarMd, styles.avatarPlaceholder]}><Text style={styles.avatarPlaceholderTx}>👤</Text></View>
          )}
          <View style={styles.idInfo}>
            {editing('identity') ? (
              <>
                <View style={styles.nameRow}>
                  <TextInput value={firstName} onChangeText={setFirstName} placeholder={tt('profileScreen','ຊື່')} placeholderTextColor="#999" style={[styles.cInput, styles.flexMin]} />
                  <TextInput value={lastName} onChangeText={setLastName} placeholder={tt('profileScreen','ນາມສະກຸນ')} placeholderTextColor="#999" style={[styles.cInput, styles.flexMin]} />
                </View>
                <View style={styles.chipRowSm}>
                  {[{ value: 'male', label: tt('profileScreen','ຊາຍ') }, { value: 'female', label: tt('profileScreen','ຍິງ') }].map((opt) => (
                    <Pressable key={opt.value} style={[styles.chipSm, gender === opt.value && styles.chipActive]} onPress={() => setGender(opt.value as any)}>
                      <Text style={[styles.chipTextSm, gender === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                  {Platform.OS === 'web' ? (
                    // @ts-ignore - web only HTML input
                    <input type="date" value={dob} onChange={(e: any) => setDob(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 6, fontSize: 12, color: '#111', backgroundColor: '#fff', fontFamily: 'inherit', width: 112 }} />
                  ) : (
                    <TextInput value={dob} onChangeText={setDob} placeholder={tt('profileScreen','ວວ/ດດ/ປປ')} placeholderTextColor="#999" style={[styles.cInput, { width: 112 }]} />
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.idName} numberOfLines={1}>{fullName || '—'}</Text>
                <Text style={styles.idSub}>{[genderLabel, dob].filter(Boolean).join(' · ') || '—'}</Text>
              </>
            )}
          </View>
        </View>
        {editing('identity') ? (
          <View style={styles.idMetaRow}>
            <Text style={styles.roLabel}>{tt('profileScreen','ອີເມລ:')}</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" style={[styles.cInput, styles.flexMin]} />
            {!!phone8 && <Text style={styles.idPhoneTxt}>📱 {phone8}</Text>}
          </View>
        ) : (
          <>
            <ReadRow label={tt('profileScreen','ອີເມລ:')} value={email} />
            <ReadRow label={tt('profileScreen','ເບີໂທ:')} value={phone8 ? `📱 ${phone8}` : ''} />
          </>
        )}
      </View>

      {/* ---- RIDER (opt-in capability, riders/{uid}) ---- */}
      {fbUser && <ProfileRiderSection uid={fbUser.uid} name={fullName || profile.firstName} />}

      {/* ---- ADDRESS & LOCATION ---- */}
      <View style={styles.group}>
        <GroupHead icon="📍" title={tt('profileScreen','ທີ່ຢູ່ & ຕຳແໜ່ງ')} editing={editing('location')} saving={status === 'saving'}
          labels={{ edit: tt('profileScreen','ແກ້ໄຂ'), save: tt('profileScreen','💾 ບັນທຶກ') }}
          onEdit={() => startEdit('location')} onSave={saveGroup} onCancel={cancelEdit} />
        {editing('location') ? (
          <>
            <TextInput value={address} onChangeText={setAddress} placeholder={tt('profileScreen','ບ້ານ ເມືອງ ແຂວງ')} placeholderTextColor="#999" style={styles.input} />
            <View style={styles.locRow}>
              <Pressable style={[styles.locDetectBtn, locDetecting && styles.btnDisabled]} onPress={detectLocation} disabled={locDetecting}>
                <Text style={styles.locDetectText} numberOfLines={1}>{locDetecting ? '...' : tt('profileScreen','📍 ຕຳແໜ່ງທີ່ຕັ້ງ')}</Text>
              </Pressable>
              <TextInput value={lat} onChangeText={setLat} placeholder="Lat 17.96" placeholderTextColor="#999" keyboardType="decimal-pad" style={[styles.input, styles.locInput]} />
              <TextInput value={lng} onChangeText={setLng} placeholder="Long 102.61" placeholderTextColor="#999" keyboardType="decimal-pad" style={[styles.input, styles.locInput]} />
            </View>
            {locError !== '' && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {locError}</Text></View>}
          </>
        ) : (
          <>
            <ReadRow label={tt('profileScreen','ທີ່ຢູ່:')} value={address} />
            <ReadRow label={tt('profileScreen','ຕຳແໜ່ງແຜນທີ່:')} value={lat && lng ? `${lat}, ${lng}` : ''} />
          </>
        )}
      </View>

      {/* ---- SAVED DELIVERY ADDRESSES ---- */}
      <SavedAddresses />

      {/* ---- BIO ---- */}
      <View style={styles.group}>
        <GroupHead icon="📝" title={tt('profileScreen','Bio (ສັ້ນໆ)')} editing={editing('bio')} saving={status === 'saving'}
          labels={{ edit: tt('profileScreen','ແກ້ໄຂ'), save: tt('profileScreen','💾 ບັນທຶກ') }}
          onEdit={() => startEdit('bio')} onSave={saveGroup} onCancel={cancelEdit} />
        {editing('bio') ? (
          <TextInput value={bio} onChangeText={setBio} placeholder={tt('profileScreen','ຂຽນສັ້ນໆ ກ່ຽວກັບຕົນເອງ')} placeholderTextColor="#999" style={[styles.input, styles.bioArea]} multiline numberOfLines={4} />
        ) : (
          <Text style={styles.roValueBlock}>{bio || '—'}</Text>
        )}
      </View>

      {/* ---- BUSINESS (tech / shop) ---- */}
      {(isTechnician || isShop) && (
        <View style={styles.group}>
          <GroupHead icon="🏬" title={tt('profileScreen','ຂໍ້ມູນທຸລະກິດ')} editing={editing('business')} saving={status === 'saving'}
            labels={{ edit: tt('profileScreen','ແກ້ໄຂ'), save: tt('profileScreen','💾 ບັນທຶກ') }}
            onEdit={() => startEdit('business')} onSave={saveGroup} onCancel={cancelEdit} />
          {editing('business') ? (
            <>
              {isShop && (
                <>
                  <Text style={styles.label}>{tt('profileScreen','ຊື່ຮ້ານ / ບໍລິສັດ')}</Text>
                  <TextInput value={companyName} onChangeText={setCompanyName} placeholder={tt('profileScreen','ຮ້ານ ABC ການຄ້າ')} placeholderTextColor="#999" style={styles.input} />
                </>
              )}
              <Text style={styles.label}>{tt('profileScreen','ລາຍລະອຽດ ບໍລິການ')}</Text>
              <TextInput value={roleDescription} onChangeText={setRoleDescription} placeholder={tt('profileScreen','ບໍລິການ / ສິນຄ້າ ທີ່ໃຫ້')} placeholderTextColor="#999" style={[styles.input, styles.textarea]} multiline numberOfLines={3} />
              {isTechnician && (
                <>
                  <Text style={styles.label}>{tt('profileScreen','ປະເພດງານທີ່ຮັບ')}</Text>
                  <View style={styles.chipRow}>
                    {specialtyOpts.map((opt) => (
                      <Pressable key={opt.value} style={[styles.chip, specialties.includes(opt.value) && styles.chipActive]} onPress={() => toggleSpecialty(opt.value)}>
                        <Text style={[styles.chipText, specialties.includes(opt.value) && styles.chipTextActive]}>{opt.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              {isShop && <ReadRow label={tt('profileScreen','ຊື່ຮ້ານ:')} value={companyName} />}
              <ReadRow label={tt('profileScreen','ລາຍລະອຽດ:')} value={roleDescription} />
              {isTechnician && <ReadRow label={tt('profileScreen','ປະເພດງານ:')} value={specialtyLabels} />}
            </>
          )}
        </View>
      )}

      {/* ---- admin bootstrap (non-admin only) ---- */}
      {!profile.isSuperAdmin && !roles.includes('admin') && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>🔑 Admin (bootstrap)</Text>
          <View style={styles.row}>
            <TextInput value={adminSecret} onChangeText={setAdminSecret} placeholder="secret code" placeholderTextColor="#999" secureTextEntry style={[styles.input, { flex: 1 }]} />
            <View style={{ width: 8 }} />
            <Pressable style={styles.adminClaimBtn} onPress={async () => {
              if (!fbUser) return;
              try { await claimAdmin(fbUser.uid, adminSecret); setAdminSecret(''); }
              catch (e: any) { setErrorMsg(e?.message ?? String(e)); setStatus('error'); }
            }}>
              <Text style={styles.btnText}>{tt('profileScreen','ຮັບສິດ')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {status === 'saved' && <View style={styles.successBox}><Text style={styles.successText}>{tt('profileScreen','✅ ບັນທຶກສຳເລັດ')}</Text></View>}
      {status === 'error' && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {errorMsg}</Text></View>}
      <View style={{ marginHorizontal: -8, marginTop: 16, marginBottom: -80 }}><AppFooter /></View>
    </ScrollView>
  );
}

// header of an editable group: title + ✏️  (or 💾 + ✕ while editing)
function GroupHead({ icon, title, editing, saving, labels, onEdit, onSave, onCancel }: {
  icon: string; title: string; editing: boolean; saving: boolean;
  labels: { edit: string; save: string };
  onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  return (
    <View style={styles.grpHead}>
      <Text style={styles.grpTitle}>{icon} {title}</Text>
      {editing ? (
        <View style={styles.grpActions}>
          <Pressable style={styles.grpCancel} onPress={onCancel}><Text style={styles.grpCancelTx}>✕</Text></Pressable>
          <Pressable style={[styles.grpSave, saving && styles.btnDisabled]} onPress={onSave} disabled={saving}><Text style={styles.grpSaveTx}>{saving ? '...' : labels.save}</Text></Pressable>
        </View>
      ) : (
        <Pressable style={styles.grpEdit} onPress={onEdit} accessibilityLabel={labels.edit}><Text style={styles.grpEditTx}>✏️</Text></Pressable>
      )}
    </View>
  );
}

// read-only "label: value" row shown while a group is locked
function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.roRow}>
      <Text style={styles.roLabel}>{label}</Text>
      <Text style={styles.roValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 8, gap: 8, paddingBottom: 80, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },

  // top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  topBack: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  topBackTx: { fontSize: 15, color: '#111' },
  topTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111', textAlign: 'center' },
  topSpace: { width: 36 },

  // identity summary (menu top)
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 4 },
  avatarSm: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb' },
  avatarMd: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e5e7eb' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholderTx: { fontSize: 24 },
  summaryName: { fontSize: 15, fontWeight: '700', color: '#111' },
  summaryPhone: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // menu rows
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 15 },
  menuIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  menuLabel: { flex: 1, fontSize: 14, color: '#111', fontWeight: '600' },
  menuChevron: { fontSize: 20, color: '#c0c4cc' },
  menuRowDanger: { borderColor: '#fecaca', marginTop: 6 },
  menuLabelDanger: { color: '#dc2626', fontWeight: '700' },

  // editable group card
  group: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, gap: 8 },
  grpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grpTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  grpActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grpEdit: { width: 34, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center' },
  grpEditTx: { fontSize: 15 },
  grpSave: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  grpSaveTx: { color: '#fff', fontSize: 12, fontWeight: '700' },
  grpCancel: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  grpCancelTx: { fontSize: 14, color: '#6b7280' },

  // read-only rows
  roRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  roLabel: { fontSize: 12, color: '#9ca3af', minWidth: 96 },
  roValue: { flex: 1, fontSize: 13, color: '#111', fontWeight: '500' },
  roValueBlock: { fontSize: 13, color: '#111', lineHeight: 20 },

  // identity edit bits (reused)
  idTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  idInfo: { flex: 1, gap: 8 },
  idName: { fontSize: 15, fontWeight: '700', color: '#111' },
  idSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  nameRow: { flexDirection: 'row', gap: 8 },
  cInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  flexMin: { flex: 1, minWidth: 0 },
  chipRowSm: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chipSm: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipTextSm: { color: '#374151', fontSize: 12 },
  idMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  idPhoneTxt: { fontSize: 12, color: '#111', fontWeight: '600', marginLeft: 'auto' },

  // generic fields
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  label: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  bioArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { color: '#374151', fontSize: 12 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  locRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  locDetectBtn: { flex: 1, borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  locDetectText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  locInput: { flex: 1, minWidth: 0 },

  btn: { backgroundColor: '#0066CC', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 18 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  adminClaimBtn: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  successBox: { padding: 12, backgroundColor: '#efe', borderRadius: 8 },
  successText: { color: '#080', fontSize: 14 },
  errorBox: { padding: 12, backgroundColor: '#fee', borderRadius: 8 },
  errorText: { color: '#c00', fontSize: 12 },
});
