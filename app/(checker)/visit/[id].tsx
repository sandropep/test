import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';
import { ShopSelector } from '../../../components/ShopSelector';
import type { Shop } from '../../../components/ShopSelector';

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

function computeScore(r: Partial<Record<Position, Rating>>) {
  const aCount = POSITIONS.filter(p => r[p] === 'A').length;
  return {
    pct: [25, 50, 75, 100][aCount],
    cat: ['D', 'C', 'B', 'A'][aCount],
  };
}

interface PhotoState {
  id: string;
  storagePath: string;
  displayUri: string | null;
  localUri: string | null;
}

export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [date, setDate] = useState('');
  const [ratings, setRatings] = useState<Partial<Record<Position, Rating>>>({});
  const [photos, setPhotos] = useState<Partial<Record<Position, PhotoState>>>({});
  const [notes, setNotes] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [status, setStatus] = useState('pending');
  const [rejectionNote, setRejectionNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const { data: signedUrls } = await supabase.storage
        .from('photos')
        .createSignedUrls(photoRows.map(r => r.storage_path), 3600);

      const urlMap = Object.fromEntries(
        (signedUrls ?? []).map(s => [s.path, s.signedUrl])
      );

      const state: Partial<Record<Position, PhotoState>> = {};
      photoRows.forEach(row => {
        state[row.position as Position] = {
          id: row.id,
          storagePath: row.storage_path,
          displayUri: urlMap[row.storage_path] ?? null,
          localUri: null,
        };
      });
      setPhotos(state);
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function replacePhoto(position: Position) {
    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
      if (!result.canceled) {
        const uri = result.assets[0].uri;
        setPhotos(prev => ({ ...prev, [position]: { ...prev[position]!, localUri: uri, displayUri: uri } }));
      }
      return;
    }
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            setPhotos(prev => ({ ...prev, [position]: { ...prev[position]!, localUri: uri, displayUri: uri } }));
          }
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            setPhotos(prev => ({ ...prev, [position]: { ...prev[position]!, localUri: uri, displayUri: uri } }));
          }
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    const err = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('შეცდომა', msg);
    };
    if (!selectedShop) { err('აირჩიეთ მაღაზია'); return; }
    for (const pos of POSITIONS) {
      if (!ratings[pos]) { err(`მონიშნეთ რეიტინგი: ${pos}`); return; }
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

      for (const pos of POSITIONS) {
        const photo = photos[pos];
        if (!photo?.localUri) continue;

        const newPath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_${timestamp}.jpg`;
        const base64 = await readImageAsBase64(photo.localUri);

        const { error: uploadError } = await supabase.storage
          .from('photos').upload(newPath, decode(base64), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        // Update DB before deleting old file — if DB fails, old file is still intact
        const { error: photoError } = await supabase
          .from('photos').update({ storage_path: newPath }).eq('id', photo.id);

        if (photoError) throw photoError;

        await supabase.storage.from('photos').remove([photo.storagePath]);
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

      {/* Rejection banner */}
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
        </Text>
        <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[cat] + '20' }]}>
          <Text style={[styles.badgeText, { color: CATEGORY_COLORS[cat] }]}>
            {cat} — {pct}%
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>შეფასება და ფოტოები</Text>
      {POSITIONS.map(pos => (
        <View key={pos} style={styles.positionCard}>
          <Text style={styles.positionLabel}>{pos}</Text>

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

          <TouchableOpacity
            style={styles.photoBox}
            onPress={() => !readOnly && replacePhoto(pos)}
            activeOpacity={readOnly ? 1 : 0.7}
          >
            {photos[pos]?.displayUri ? (
              <>
                <Image source={{ uri: photos[pos]!.displayUri! }} style={styles.photoPreview} />
                {photos[pos]?.localUri && (
                  <View style={styles.changedBadge}>
                    <Text style={styles.changedBadgeText}>შეცვლილი</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.photoBoxText}>📷  ფოტოს გადაღება</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

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
  positionLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },

  ratingRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  ratingBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 2, borderColor: '#e0e0e0', alignItems: 'center',
  },
  ratingBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  ratingBtnText: { fontSize: 20, fontWeight: '800', color: '#ccc' },
  ratingBtnTextActive: { color: '#2563eb' },

  photoBox: {
    backgroundColor: '#f8f9fa', borderRadius: 8, borderWidth: 1,
    borderColor: '#e0e0e0', borderStyle: 'dashed',
    height: 160, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoBoxText: { color: '#999', fontSize: 14 },
  changedBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#2563eb', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2,
  },
  changedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

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
});
