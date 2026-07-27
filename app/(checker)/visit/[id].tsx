import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, ActivityIndicator, Platform,
  Modal, StatusBar, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { getSignedUrls } from '../../../lib/signedUrlCache';
import { ShopSelector } from '../../../components/ShopSelector';
import type { Shop } from '../../../components/ShopSelector';
import { PhotoSourceModal } from '../../../components/PhotoSourceModal';

async function readImageAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

const POSITIONS = ['საწყობი', 'მაცივარი', 'თარო'] as const;
type Position = typeof POSITIONS[number];
type Rating = 'A' | 'B';

const POSITION_PATH: Record<Position, string> = {
  'საწყობი': 'warehouse',
  'მაცივარი': 'fridge',
  'თარო': 'shelf',
};

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

const MAX_PHOTOS = 5;

function computeScore(r: Partial<Record<Position, Rating>>) {
  const aCount = POSITIONS.filter(p => r[p] === 'A').length;
  return {
    pct: [25, 50, 75, 100][aCount],
    cat: ['D', 'C', 'B', 'A'][aCount],
  };
}

interface PhotoEntry {
  id: string | null;
  storagePath: string | null;
  displayUri: string | null;
  localUri: string | null;
  markedForDelete: boolean;
}

export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [date, setDate] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [ratings, setRatings] = useState<Partial<Record<Position, Rating>>>({});
  const [photos, setPhotos] = useState<Partial<Record<Position, PhotoEntry[]>>>({});
  const [pickerTarget, setPickerTarget] = useState<{ position: Position; index: number | null } | null>(null);
  const [notes, setNotes] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [status, setStatus] = useState('pending');
  const [rejectionNote, setRejectionNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState('');

  const readOnly = status === 'approved';

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (user) {
      const { data: profile } = await supabase
        .from('users').select('full_name').eq('id', user.id).single();
      setCheckerName(profile?.full_name || user.email || 'checker');
    }

    const { data: visit, error } = await supabase
      .from('visits')
      .select('*, shops(id, shop_number, name, location)')
      .eq('id', id)
      .single();

    if (error || !visit) {
      if (Platform.OS === 'web') window.alert('ვიზიტი ვერ მოიძებნა');
      else Alert.alert('შეცდომა', 'ვიზიტი ვერ მოიძებნა');
      router.canGoBack() ? router.back() : router.replace('/(checker)');
      return;
    }

    const shop = visit.shops as any;
    setSelectedShop(shop ?? null);
    setDate(visit.date);
    setCreatedAt(visit.created_at);
    setNotes(visit.notes ?? '');
    setStatus(visit.status ?? 'pending');
    setRejectionNote(visit.rejection_note ?? null);
    setRatings({
      'საწყობი': visit.warehouse_rating,
      'მაცივარი': visit.fridge_rating,
      'თარო': visit.shelf_rating,
    });

    const { data: photoRows } = await supabase
      .from('photos').select('id, position, storage_path').eq('visit_id', id);

    if (photoRows && photoRows.length > 0) {
      const urlMap = await getSignedUrls(photoRows.map(r => r.storage_path));

      const state: Partial<Record<Position, PhotoEntry[]>> = {};
      photoRows.forEach(row => {
        const pos = row.position as Position;
        if (!state[pos]) state[pos] = [];
        state[pos]!.push({
          id: row.id,
          storagePath: row.storage_path,
          displayUri: urlMap[row.storage_path] ?? null,
          localUri: null,
          markedForDelete: false,
        });
      });
      setPhotos(state);
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function applyReplacedPhoto(position: Position, index: number, uri: string) {
    setPhotos(prev => {
      const arr = [...(prev[position] ?? [])];
      arr[index] = { ...arr[index], localUri: uri, displayUri: uri };
      return { ...prev, [position]: arr };
    });
  }

  function applyAddedPhoto(position: Position, uri: string) {
    setPhotos(prev => ({
      ...prev,
      [position]: [...(prev[position] ?? []), {
        id: null,
        storagePath: null,
        displayUri: uri,
        localUri: uri,
        markedForDelete: false,
      }],
    }));
  }

  async function replacePhoto(position: Position, index: number) {
    if (Platform.OS === 'web') {
      setPickerTarget({ position, index });
      return;
    }
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) applyReplacedPhoto(position, index, result.assets[0].uri);
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) applyReplacedPhoto(position, index, result.assets[0].uri);
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  function removePhotoEntry(position: Position, index: number) {
    setPhotos(prev => {
      const arr = [...(prev[position] ?? [])];
      const entry = arr[index];
      if (entry.id === null) {
        arr.splice(index, 1);
      } else {
        arr[index] = { ...entry, markedForDelete: true };
      }
      return { ...prev, [position]: arr };
    });
  }

  async function addPhoto(position: Position) {
    const activeCount = (photos[position] ?? []).filter(e => !e.markedForDelete).length;
    if (activeCount >= MAX_PHOTOS) return;

    if (Platform.OS === 'web') {
      setPickerTarget({ position, index: null });
      return;
    }
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) applyAddedPhoto(position, result.assets[0].uri);
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) applyAddedPhoto(position, result.assets[0].uri);
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  async function handleWebPickCamera() {
    const target = pickerTarget;
    setPickerTarget(null);
    if (!target) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
    if (result.canceled) return;
    if (target.index === null) applyAddedPhoto(target.position, result.assets[0].uri);
    else applyReplacedPhoto(target.position, target.index, result.assets[0].uri);
  }

  async function handleWebPickGallery() {
    const target = pickerTarget;
    setPickerTarget(null);
    if (!target) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
    if (result.canceled) return;
    if (target.index === null) applyAddedPhoto(target.position, result.assets[0].uri);
    else applyReplacedPhoto(target.position, target.index, result.assets[0].uri);
  }

  async function handleSave() {
    const err = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('შეცდომა', msg);
    };
    if (!selectedShop) { err('აირჩიეთ მაღაზია'); return; }
    for (const pos of POSITIONS) {
      if (!ratings[pos]) { err(`მონიშნეთ რეიტინგი: ${pos}`); return; }
      const active = (photos[pos] ?? []).filter(e => !e.markedForDelete);
      if (active.length === 0) { err(`${pos}: ერთი ფოტო მინიმუმ საჭიროა`); return; }
    }

    setSaving(true);
    try {
      const updatePayload: Record<string, any> = {
        shop_id: selectedShop.id,
        warehouse_rating: ratings['საწყობი'],
        fridge_rating: ratings['მაცივარი'],
        shelf_rating: ratings['თარო'],
        notes: notes.trim() || null,
      };
      if (status === 'rejected') {
        updatePayload.status = 'pending';
        updatePayload.rejection_note = null;
      }

      const { error: visitError } = await supabase
        .from('visits')
        .update(updatePayload)
        .eq('id', id);

      if (visitError) throw visitError;

      const timestamp = Date.now();
      const safeName = checkerName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'checker';
      let newPhotoIdx = 0;

      for (const pos of POSITIONS) {
        const entries = photos[pos] ?? [];

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];

          if (entry.markedForDelete && entry.id) {
            await supabase.from('photos').delete().eq('id', entry.id);
            if (entry.storagePath) {
              await supabase.storage.from('photos').remove([entry.storagePath]);
            }
            continue;
          }

          if (entry.id && entry.localUri) {
            // Replace existing photo
            const newPath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_${timestamp}_${entry.id}.jpg`;
            const base64 = await readImageAsBase64(entry.localUri);
            const { error: uploadError } = await supabase.storage
              .from('photos').upload(newPath, decode(base64), { contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const { error: photoError } = await supabase
              .from('photos').update({ storage_path: newPath }).eq('id', entry.id);
            if (photoError) throw photoError;
            if (entry.storagePath) {
              await supabase.storage.from('photos').remove([entry.storagePath]);
            }
            continue;
          }

          if (entry.id === null && entry.localUri) {
            // Add new photo
            const newPath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_new_${timestamp}_${newPhotoIdx}.jpg`;
            newPhotoIdx++;
            const base64 = await readImageAsBase64(entry.localUri);
            const { error: uploadError } = await supabase.storage
              .from('photos').upload(newPath, decode(base64), { contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const { error: insertError } = await supabase
              .from('photos').insert({ visit_id: id, position: pos, storage_path: newPath });
            if (insertError) throw insertError;
          }
        }
      }

      if (Platform.OS === 'web') {
        window.alert('ვიზიტი განახლდა');
        router.back();
      } else {
        Alert.alert('წარმატება', 'ვიზიტი განახლდა', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message ?? 'სცადეთ თავიდან');
      else Alert.alert('შეცდომა', err.message ?? 'სცადეთ თავიდან');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const { pct, cat } = computeScore(ratings);

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(checker)')}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={18} color="#1a1a2e" />
        <Text style={styles.backBtnText}>უკან</Text>
      </TouchableOpacity>

      {/* Status banners */}
      {status === 'rejected' && (
        <View style={styles.rejectionBanner}>
          <Ionicons name="alert-circle" size={18} color="#dc2626" />
          <View style={{ flex: 1 }}>
            <Text style={styles.rejectionTitle}>ვიზიტი უარყოფილია</Text>
            {rejectionNote && <Text style={styles.rejectionNote}>{rejectionNote}</Text>}
          </View>
        </View>
      )}
      {status === 'approved' && (
        <View style={styles.approvedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={styles.approvedTitle}>ვიზიტი დადასტურებულია</Text>
        </View>
      )}

      {/* Shop selector */}
      <Text style={styles.sectionTitle}>მაღაზია</Text>
      <ShopSelector
        selectedShop={selectedShop}
        onSelect={setSelectedShop}
        onClear={() => setSelectedShop(null)}
        readOnly={readOnly}
      />

      {/* Date & score row */}
      <View style={styles.metaRow}>
        <Text style={styles.date}>
          {new Date(date).toLocaleDateString('ka-GE', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
          {createdAt ? `, ${new Date(createdAt).getHours().toString().padStart(2, '0')}:${new Date(createdAt).getMinutes().toString().padStart(2, '0')}` : ''}
        </Text>
        <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[cat] + '20' }]}>
          <Text style={[styles.badgeText, { color: CATEGORY_COLORS[cat] }]}>
            {cat} — {pct}%
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>შეფასება და ფოტოები</Text>
      {POSITIONS.map(pos => {
        const posEntries = photos[pos] ?? [];
        const activeCount = posEntries.filter(e => !e.markedForDelete).length;
        return (
          <View key={pos} style={styles.positionCard}>
            <View style={styles.positionLabelRow}>
              <Text style={styles.positionLabel}>{pos}</Text>
              <Text style={styles.photoCount}>ფოტო {activeCount}/{MAX_PHOTOS}</Text>
            </View>

            <View style={styles.ratingRow}>
              {(['A', 'B'] as Rating[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.ratingBtn, ratings[pos] === r && styles.ratingBtnActive]}
                  onPress={() => !readOnly && setRatings(prev => ({ ...prev, [pos]: r }))}
                  activeOpacity={readOnly ? 1 : 0.7}
                >
                  <Text style={[styles.ratingBtnText, ratings[pos] === r && styles.ratingBtnTextActive]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photosRow}
              keyboardShouldPersistTaps="always"
            >
              {posEntries.map((entry, rawIdx) => {
                if (entry.markedForDelete) return null;
                const activeIdx = posEntries.slice(0, rawIdx + 1).filter(e => !e.markedForDelete).length;
                return (
                  <View key={rawIdx} style={styles.thumbWrapper}>
                    <TouchableOpacity
                      onPress={() => {
                        setLightboxUri(entry.displayUri);
                        setLightboxLabel(`${pos} ${activeIdx}/${activeCount}`);
                      }}
                      activeOpacity={0.75}
                    >
                      <Image source={{ uri: entry.displayUri! }} style={styles.thumb} />
                      {entry.localUri && !readOnly && (
                        <View style={styles.changedBadge}>
                          <Text style={styles.changedBadgeText}>შეცვლილი</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    {!readOnly && (
                      <>
                        <TouchableOpacity
                          style={styles.editPhotoBtn}
                          onPress={() => replacePhoto(pos, rawIdx)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Ionicons name="pencil" size={12} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removePhotoBtn}
                          onPress={() => removePhotoEntry(pos, rawIdx)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Ionicons name="close-circle" size={20} color="#dc2626" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })}
              {!readOnly && activeCount < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={() => addPhoto(pos)}>
                  <Ionicons name="camera-outline" size={24} color="#888" />
                  <Text style={styles.addPhotoText}>ფოტო</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>შენიშვნა</Text>
      <TextInput
        style={[styles.input, styles.notesInput, readOnly && styles.inputReadOnly]}
        value={notes}
        onChangeText={setNotes}
        placeholder="შენიშვნა..."
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        editable={!readOnly}
      />

      {!readOnly && (
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>შენახვა</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
    <PhotoSourceModal
      visible={pickerTarget !== null}
      onClose={() => setPickerTarget(null)}
      onPickCamera={handleWebPickCamera}
      onPickGallery={handleWebPickGallery}
    />
    <Modal
      visible={lightboxUri !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setLightboxUri(null)}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      <View style={styles.lightboxBg}>
        <SafeAreaView style={styles.lightboxSafe}>
          <View style={styles.lightboxHeader}>
            <Text style={styles.lightboxLabel}>{lightboxLabel}</Text>
            <TouchableOpacity onPress={() => setLightboxUri(null)} style={styles.lightboxClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        <TouchableOpacity style={styles.lightboxImageArea} activeOpacity={1} onPress={() => setLightboxUri(null)}>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 16,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },

  rejectionBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#dc262640', marginBottom: 16,
  },
  rejectionTitle: { fontSize: 13, fontWeight: '700', color: '#dc2626', marginBottom: 2 },
  rejectionNote: { fontSize: 13, color: '#555', lineHeight: 18 },
  approvedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#16a34a40', marginBottom: 16,
  },
  approvedTitle: { fontSize: 13, fontWeight: '700', color: '#16a34a' },

  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: '700' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  date: { color: '#888', fontSize: 13 },

  positionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  positionLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  positionLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  photoCount: { fontSize: 12, color: '#aaa', fontWeight: '600' },

  ratingRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  ratingBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 2, borderColor: '#e0e0e0', alignItems: 'center',
  },
  ratingBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  ratingBtnText: { fontSize: 20, fontWeight: '800', color: '#ccc' },
  ratingBtnTextActive: { color: '#2563eb' },

  photosRow: { gap: 8, paddingRight: 4 },
  thumbWrapper: { width: 80, height: 80, borderRadius: 8, overflow: 'visible', position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removePhotoBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#fff', borderRadius: 10,
  },
  editPhotoBtn: {
    position: 'absolute', bottom: -6, right: -6,
    backgroundColor: '#2563eb', borderRadius: 10,
    width: 20, height: 20, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  changedBadge: {
    position: 'absolute', bottom: 4, left: 4, right: 4,
    backgroundColor: '#2563eb', borderRadius: 3,
    paddingVertical: 1, alignItems: 'center',
  },
  changedBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: 8,
    backgroundColor: '#f8f9fa', borderWidth: 1.5,
    borderColor: '#e0e0e0', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11, color: '#aaa', fontWeight: '600' },

  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a2e',
  },
  notesInput: { height: 88 },
  inputReadOnly: { backgroundColor: '#f5f5f5', color: '#888' },

  saveBtn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 28,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  lightboxBg: { flex: 1, backgroundColor: '#000' },
  lightboxSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  lightboxHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  lightboxLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  lightboxClose: { padding: 4 },
  lightboxImageArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lightboxImage: { width: '100%', height: '100%' },
});
