import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';

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

interface Shop {
  id: string;
  shop_number: string;
  name: string;
  location: string | null;
}

interface PhotoState {
  id: string;
  storagePath: string;
  displayUri: string | null;
  localUri: string | null;
}

export default function VisitDetail() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const readOnly = mode === 'view';
  const router = useRouter();

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shopQuery, setShopQuery] = useState('');
  const [shopResults, setShopResults] = useState<Shop[]>([]);
  const [date, setDate] = useState('');
  const [ratings, setRatings] = useState<Partial<Record<Position, Rating>>>({});
  const [photos, setPhotos] = useState<Partial<Record<Position, PhotoState>>>({});
  const [notes, setNotes] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Debounced shop search
  useEffect(() => {
    if (shopQuery.length < 2) { setShopResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('shops')
        .select('id, shop_number, name, location')
        .or(`shop_number.ilike.%${shopQuery}%,name.ilike.%${shopQuery}%`)
        .limit(10);
      setShopResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [shopQuery]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
      Alert.alert('შეცდომა', 'ვიზიტი ვერ მოიძებნა');
      router.back();
      return;
    }

    const shop = visit.shops as any;
    setSelectedShop(shop ?? null);
    setDate(visit.date);
    setNotes(visit.notes ?? '');
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
    Alert.alert('ფოტო', 'აირჩიეთ წყარო', [
      {
        text: 'კამერა',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            setPhotos(prev => ({
              ...prev,
              [position]: { ...prev[position]!, localUri: uri, displayUri: uri },
            }));
          }
        },
      },
      {
        text: 'გალერეა',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.75 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            setPhotos(prev => ({
              ...prev,
              [position]: { ...prev[position]!, localUri: uri, displayUri: uri },
            }));
          }
        },
      },
      { text: 'გაუქმება', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!selectedShop) {
      Alert.alert('შეცდომა', 'აირჩიეთ მაღაზია');
      return;
    }
    for (const pos of POSITIONS) {
      if (!ratings[pos]) {
        Alert.alert('შეცდომა', `მონიშნეთ რეიტინგი: ${pos}`);
        return;
      }
    }

    setSaving(true);
    try {
      const { error: visitError } = await supabase
        .from('visits')
        .update({
          shop_id: selectedShop.id,
          warehouse_rating: ratings['საწყობი'],
          fridge_rating: ratings['მაცივარი'],
          shelf_rating: ratings['თარო'],
          notes: notes.trim() || null,
        })
        .eq('id', id);

      if (visitError) throw visitError;

      const timestamp = Date.now();
      const safeName = checkerName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'checker';

      for (const pos of POSITIONS) {
        const photo = photos[pos];
        if (!photo?.localUri) continue;

        const newPath = `${safeName}/${selectedShop.shop_number}/${POSITION_PATH[pos]}_${timestamp}.jpg`;
        const base64 = await FileSystem.readAsStringAsync(photo.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { error: uploadError } = await supabase.storage
          .from('photos').upload(newPath, decode(base64), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        await supabase.storage.from('photos').remove([photo.storagePath]);

        const { error: photoError } = await supabase
          .from('photos').update({ storage_path: newPath }).eq('id', photo.id);

        if (photoError) throw photoError;
      }

      Alert.alert('წარმატება', 'ვიზიტი განახლდა', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message ?? 'სცადეთ თავიდან');
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
      {/* Shop selector */}
      <Text style={styles.sectionTitle}>მაღაზია</Text>
      {selectedShop ? (
        <View style={styles.selectedShop}>
          <View>
            <Text style={styles.selectedShopPrimary}>
              #{selectedShop.shop_number} — {selectedShop.name}
            </Text>
            {selectedShop.location ? (
              <Text style={styles.selectedShopSub}>{selectedShop.location}</Text>
            ) : null}
          </View>
          {!readOnly && (
            <TouchableOpacity onPress={() => { setSelectedShop(null); setShopQuery(''); }}>
              <Text style={styles.changeBtn}>შეცვლა</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ marginBottom: 4 }}>
          <TextInput
            style={styles.input}
            value={shopQuery}
            onChangeText={setShopQuery}
            placeholder="ნომერი ან სახელი..."
            placeholderTextColor="#aaa"
          />
          {shopResults.map(shop => (
            <TouchableOpacity
              key={shop.id}
              style={styles.shopRow}
              onPress={() => { setSelectedShop(shop); setShopResults([]); setShopQuery(''); }}
            >
              <Text style={styles.shopRowNumber}>#{shop.shop_number}</Text>
              <Text style={styles.shopRowName}>{shop.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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

  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: '700' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  selectedShop: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#2563eb', marginBottom: 16,
  },
  selectedShopPrimary: { fontWeight: '700', color: '#1a1a2e', fontSize: 15 },
  selectedShopSub: { color: '#888', fontSize: 13, marginTop: 2 },
  changeBtn: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  shopRow: {
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  shopRowNumber: { fontWeight: '700', color: '#2563eb', fontSize: 13, minWidth: 48 },
  shopRowName: { color: '#333', fontSize: 14, flex: 1 },

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
