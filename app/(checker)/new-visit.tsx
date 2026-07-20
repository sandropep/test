import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Image, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ShopSelector } from '../../components/ShopSelector';
import type { Shop } from '../../components/ShopSelector';
import { PhotoSourceModal } from '../../components/PhotoSourceModal';

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

const MAX_PHOTOS = 5;

export default function NewVisit() {
  const router = useRouter();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<Position, Rating>>>({});
  const [photos, setPhotos] = useState<Partial<Record<Position, string[]>>>({});
  const [pickerTarget, setPickerTarget] = useState<Position | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkerName, setCheckerName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const clearForm = useCallback(() => {
    setSelectedShop(null);
    setRatings({});
    setPhotos({});
    setNotes('');
  }, []);

  const handleReset = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('ყველა მონაცემი წაიშლება. დარწმუნებული ხართ?')) clearForm();
      return;
    }
    Alert.alert('გასუფთავება', 'ყველა მონაცემი წაიშლება. დარწმუნებული ხართ?', [
      { text: 'გაუქმება', style: 'cancel' },
      { text: 'გასუფთავება', style: 'destructive', onPress: clearForm },
    ]);
  }, [clearForm]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      supabase
        .from('users').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setCheckerName(data?.full_name || user.email || 'unknown'));
    });
  }, []);

  function addUri(position: Position, uri: string) {
    setPhotos(prev => ({
      ...prev,
      [position]: [...(prev[position] ?? []), uri],
    }));
  }

  async function pickPhoto(position: Position) {
    const current = photos[position] ?? [];
    if (current.length >= MAX_PHOTOS) return;

    if (Platform.OS === 'web') {
      setPickerTarget(position);
      return;
    }
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) { Alert.alert('შეცდომა', 'კამერაზე წვდომა საჭიროა'); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) addUri(position, result.assets[0].uri);
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) addUri(position, result.assets[0].uri);
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  async function handleWebPickCamera() {
    const position = pickerTarget;
    setPickerTarget(null);
    if (!position) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
    if (!result.canceled) addUri(position, result.assets[0].uri);
  }

  async function handleWebPickGallery() {
    const position = pickerTarget;
    setPickerTarget(null);
    if (!position) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
    if (!result.canceled) addUri(position, result.assets[0].uri);
  }

  function removePhoto(position: Position, index: number) {
    setPhotos(prev => ({
      ...prev,
      [position]: (prev[position] ?? []).filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit() {
    const err = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('შეცდომა', msg);
    };
    if (!selectedShop) { err('აირჩიეთ მაღაზია'); return; }
    for (const pos of POSITIONS) {
      if (!ratings[pos]) { err(`მონიშნეთ რეიტინგი: ${pos}`); return; }
      if (!(photos[pos]?.length)) { err(`გადაიღეთ ფოტო: ${pos}`); return; }
    }

    setSubmitting(true);
    const uploadedPaths: Array<{ pos: Position; path: string }> = [];
    try {
      if (!userId) throw new Error('Not authenticated');

      const timestamp = Date.now();
      const safeName = checkerName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'checker';

      // Step 1: upload all photos before touching the DB
      for (const pos of POSITIONS) {
        const uris = photos[pos] ?? [];
        for (let idx = 0; idx < uris.length; idx++) {
          const storagePath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_${idx}_${timestamp}.jpg`;
          const base64 = await readImageAsBase64(uris[idx]);
          const { error: uploadError } = await supabase.storage
            .from('photos').upload(storagePath, decode(base64), { contentType: 'image/jpeg' });
          if (uploadError) throw uploadError;
          uploadedPaths.push({ pos, path: storagePath });
        }
      }

      // Step 2: insert visit
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert({
          shop_id: selectedShop.id,
          checker_id: userId,
          warehouse_rating: ratings['საწყობი'],
          fridge_rating: ratings['მაცივარი'],
          shelf_rating: ratings['თარო'],
          notes: notes.trim() || null,
        })
        .select('id')
        .single();
      if (visitError) throw visitError;

      // Step 3: record all photos in one batch
      const { error: photosError } = await supabase.from('photos').insert(
        uploadedPaths.map(({ pos, path }) => ({
          visit_id: visit.id,
          position: pos,
          storage_path: path,
        }))
      );
      if (photosError) {
        await supabase.from('visits').delete().eq('id', visit.id);
        throw photosError;
      }

      clearForm();
      if (Platform.OS === 'web') window.alert('ვიზიტი შენახულია!');
      else Alert.alert('წარმატება', 'ვიზიტი შენახულია!');
    } catch (err: any) {
      if (uploadedPaths.length) {
        await supabase.storage.from('photos').remove(uploadedPaths.map(p => p.path));
      }
      if (Platform.OS === 'web') window.alert(err.message ?? 'სცადეთ თავიდან');
      else Alert.alert('შეცდომა', err.message ?? 'სცადეთ თავიდან');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
    >
      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(checker)')}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={18} color="#1a1a2e" />
        <Text style={styles.backBtnText}>უკან</Text>
      </TouchableOpacity>

      {/* Title row with reset button */}
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.75}>
          <Ionicons name="refresh-outline" size={16} color="#dc2626" />
          <Text style={styles.resetBtnText}>გასუფთავება</Text>
        </TouchableOpacity>
      </View>

      {/* Shop selector */}
      <Text style={styles.sectionTitle}>მაღაზია</Text>
      <ShopSelector
        selectedShop={selectedShop}
        onSelect={setSelectedShop}
        onClear={() => setSelectedShop(null)}
      />

      {/* Ratings + Photos per position */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>შეფასება და ფოტოები</Text>
      {POSITIONS.map(pos => {
        const posPhotos = photos[pos] ?? [];
        return (
          <View key={pos} style={styles.positionCard}>
            <View style={styles.positionLabelRow}>
              <Text style={styles.positionLabel}>{pos}</Text>
              <Text style={styles.photoCount}>ფოტო {posPhotos.length}/{MAX_PHOTOS}</Text>
            </View>

            <View style={styles.ratingRow}>
              {(['A', 'B'] as Rating[]).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.ratingBtn, ratings[pos] === r && styles.ratingBtnActive]}
                  onPress={() => setRatings(prev => ({ ...prev, [pos]: r }))}
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
              {posPhotos.map((uri, idx) => (
                <View key={idx} style={styles.thumbWrapper}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => removePhoto(pos, idx)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
              {posPhotos.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={() => pickPhoto(pos)}>
                  <Ionicons name="camera-outline" size={24} color="#888" />
                  <Text style={styles.addPhotoText}>ფოტო</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        );
      })}

      {/* Notes */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        შენიშვნა (არასავალდებულო)
      </Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="დაამატეთ შენიშვნა..."
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>შენახვა</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    <PhotoSourceModal
      visible={pickerTarget !== null}
      onClose={() => setPickerTarget(null)}
      onPickCamera={handleWebPickCamera}
      onPickGallery={handleWebPickGallery}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 48 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 16,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },

  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#dc2626', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff5f5',
  },
  resetBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a2e', marginBottom: 2,
  },
  notesInput: { height: 88 },

  positionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
  },
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
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: 8,
    backgroundColor: '#f8f9fa', borderWidth: 1.5,
    borderColor: '#e0e0e0', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11, color: '#aaa', fontWeight: '600' },

  submitBtn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
