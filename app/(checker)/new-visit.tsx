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

// ASCII-safe names for storage paths
const POSITION_PATH: Record<Position, string> = {
  'საწყობი': 'warehouse',
  'მაცივარი': 'fridge',
  'თარო': 'shelf',
};

export default function NewVisit() {
  const router = useRouter();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<Position, Rating>>>({});
  const [photos, setPhotos] = useState<Partial<Record<Position, string>>>({});
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
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setCheckerName(data?.full_name || user.email || 'unknown'));
    });
  }, []);

  async function pickPhoto(position: Position) {
    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
      if (!result.canceled) setPhotos(prev => ({ ...prev, [position]: result.assets[0].uri }));
      return;
    }
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) { Alert.alert('შეცდომა', 'კამერაზე წვდომა საჭიროა'); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) setPhotos(prev => ({ ...prev, [position]: result.assets[0].uri }));
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) setPhotos(prev => ({ ...prev, [position]: result.assets[0].uri }));
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    const err = (msg: string) => {
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('შეცდომა', msg);
    };
    if (!selectedShop) { err('აირჩიეთ მაღაზია'); return; }
    for (const pos of POSITIONS) {
      if (!ratings[pos]) { err(`მონიშნეთ რეიტინგი: ${pos}`); return; }
      if (!photos[pos]) { err(`გადაიღეთ ფოტო: ${pos}`); return; }
    }

    setSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      if (!userId) throw new Error('Not authenticated');

      // Step 1: upload all photos before touching the DB
      const timestamp = Date.now();
      const safeName = checkerName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'checker';
      for (const pos of POSITIONS) {
        const uri = photos[pos]!;
        const storagePath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_${timestamp}.jpg`;
        const base64 = await readImageAsBase64(uri);
        const { error: uploadError } = await supabase.storage
          .from('photos').upload(storagePath, decode(base64), { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
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
        POSITIONS.map((pos, i) => ({ visit_id: visit.id, position: pos, storage_path: uploadedPaths[i] }))
      );
      if (photosError) {
        await supabase.from('visits').delete().eq('id', visit.id);
        throw photosError;
      }

      clearForm();
      if (Platform.OS === 'web') window.alert('ვიზიტი შენახულია!');
      else Alert.alert('წარმატება', 'ვიზიტი შენახულია!');
    } catch (err: any) {
      // Clean up any files already uploaded if the operation failed
      if (uploadedPaths.length) {
        await supabase.storage.from('photos').remove(uploadedPaths);
      }
      if (Platform.OS === 'web') window.alert(err.message ?? 'სცადეთ თავიდან');
      else Alert.alert('შეცდომა', err.message ?? 'სცადეთ თავიდან');
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
      {POSITIONS.map(pos => (
        <View key={pos} style={styles.positionCard}>
          <Text style={styles.positionLabel}>{pos}</Text>

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

          <TouchableOpacity style={styles.photoBox} onPress={() => pickPhoto(pos)}>
            {photos[pos] ? (
              <Image source={{ uri: photos[pos] }} style={styles.photoPreview} />
            ) : (
              <Text style={styles.photoBoxText}>📷  ფოტოს გადაღება</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 16,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  content: { padding: 16, paddingBottom: 48 },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  screenTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a2e' },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff5f5',
  },
  resetBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 2,
  },
  notesInput: { height: 88 },

  shopRow: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shopRowNumber: { fontWeight: '700', color: '#2563eb', fontSize: 13, minWidth: 48 },
  shopRowName: { color: '#333', fontSize: 14 },
  shopRowLocation: { color: '#aaa', fontSize: 11, marginTop: 1 },

  selectedShop: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2563eb',
  },
  selectedShopPrimary: { fontWeight: '700', color: '#1a1a2e', fontSize: 15 },
  selectedShopSub: { color: '#888', fontSize: 13, marginTop: 2 },
  changeBtn: { color: '#2563eb', fontSize: 13, fontWeight: '600' },

  positionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  positionLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },

  ratingRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  ratingBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  ratingBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  ratingBtnText: { fontSize: 20, fontWeight: '800', color: '#ccc' },
  ratingBtnTextActive: { color: '#2563eb' },

  photoBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoBoxText: { color: '#999', fontSize: 14 },

  submitBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
