import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  Alert, TouchableOpacity, Modal, StatusBar, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

const POSITIONS = ['საწყობი', 'მაცივარი', 'თარო'] as const;
type Position = typeof POSITIONS[number];

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

interface VisitData {
  date: string;
  warehouse_rating: string;
  fridge_rating: string;
  shelf_rating: string;
  score_percent: number;
  category: string;
  notes: string | null;
  shops: { shop_number: string; name: string; location: string | null } | null;
  checker: { full_name: string } | null;
}

interface PhotoData {
  position: Position;
  signedUrl: string;
}

export default function AdminVisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [visit, setVisit] = useState<VisitData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('visits')
      .select('date, warehouse_rating, fridge_rating, shelf_rating, score_percent, category, notes, shops(shop_number, name, location), checker:checker_id(full_name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      Alert.alert('შეცდომა', 'ვიზიტი ვერ მოიძებნა');
      router.back();
      return;
    }

    setVisit(data as unknown as VisitData);

    const { data: photoRows } = await supabase
      .from('photos').select('position, storage_path').eq('visit_id', id);

    if (photoRows?.length) {
      const { data: signedUrls } = await supabase.storage
        .from('photos')
        .createSignedUrls(photoRows.map(r => r.storage_path), 3600);

      const urlMap = Object.fromEntries((signedUrls ?? []).map(s => [s.path, s.signedUrl]));
      setPhotos(photoRows.map(row => ({
        position: row.position as Position,
        signedUrl: urlMap[row.storage_path] ?? '',
      })));
    }
  }, [id]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  function openLightbox(uri: string, label: string) {
    setLightboxUri(uri);
    setLightboxLabel(label);
  }

  function closeLightbox() {
    setLightboxUri(null);
    setLightboxLabel('');
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!visit) return null;

  const ratings: Record<Position, string> = {
    'საწყობი': visit.warehouse_rating,
    'მაცივარი': visit.fridge_rating,
    'თარო': visit.shelf_rating,
  };

  const photoMap = Object.fromEntries(photos.map(p => [p.position, p.signedUrl]));

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header info */}
        <View style={styles.infoCard}>
          <Text style={styles.shopName}>
            #{visit.shops?.shop_number} — {visit.shops?.name}
          </Text>
          {visit.shops?.location && (
            <Text style={styles.shopLocation}>{visit.shops.location}</Text>
          )}
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>ჩეკერი</Text>
              <Text style={styles.metaValue}>{(visit.checker as any)?.full_name ?? '—'}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>თარიღი</Text>
              <Text style={styles.metaValue}>
                {new Date(visit.date).toLocaleDateString('ka-GE', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: CATEGORY_COLORS[visit.category] + '20' }]}>
              <Text style={[styles.scoreBadgeText, { color: CATEGORY_COLORS[visit.category] }]}>
                {visit.category}
              </Text>
              <Text style={[styles.scorePct, { color: CATEGORY_COLORS[visit.category] }]}>
                {visit.score_percent}%
              </Text>
            </View>
          </View>
        </View>

        {/* Positions */}
        <Text style={styles.sectionTitle}>შეფასება და ფოტოები</Text>
        {POSITIONS.map(pos => (
          <View key={pos} style={styles.positionCard}>
            <View style={styles.positionHeader}>
              <Text style={styles.positionLabel}>{pos}</Text>
              <View style={[
                styles.ratingBadge,
                { backgroundColor: ratings[pos] === 'A' ? '#dcfce7' : '#fee2e2' },
              ]}>
                <Text style={[
                  styles.ratingBadgeText,
                  { color: ratings[pos] === 'A' ? '#16a34a' : '#dc2626' },
                ]}>
                  {ratings[pos]}
                </Text>
              </View>
            </View>

            {photoMap[pos] ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => openLightbox(photoMap[pos], pos)}
              >
                <Image source={{ uri: photoMap[pos] }} style={styles.photo} resizeMode="cover" />
                <View style={styles.zoomHint}>
                  <Ionicons name="expand-outline" size={16} color="#fff" />
                  <Text style={styles.zoomHintText}>გასადიდებლად დააჭირეთ</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noPhoto}>
                <Text style={styles.noPhotoText}>ფოტო არ არის</Text>
              </View>
            )}
          </View>
        ))}

        {/* Notes */}
        {visit.notes && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>შენიშვნა</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{visit.notes}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Full-screen lightbox */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={closeLightbox}
        statusBarTranslucent
      >
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        <View style={styles.lightboxBg}>
          <SafeAreaView style={styles.lightboxSafe}>
            <View style={styles.lightboxHeader}>
              <Text style={styles.lightboxLabel}>{lightboxLabel}</Text>
              <TouchableOpacity onPress={closeLightbox} style={styles.lightboxClose}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <TouchableOpacity
            style={styles.lightboxImageArea}
            activeOpacity={1}
            onPress={closeLightbox}
          >
            {lightboxUri && (
              <Image
                source={{ uri: lightboxUri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
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

  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20 },
  shopName: { fontSize: 17, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  shopLocation: { fontSize: 13, color: '#888', marginBottom: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  metaLabel: { fontSize: 11, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  scoreBadge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  scoreBadgeText: { fontSize: 20, fontWeight: '800' },
  scorePct: { fontSize: 13, fontWeight: '600' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  positionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  positionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  positionLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  ratingBadge: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  ratingBadgeText: { fontSize: 20, fontWeight: '800' },

  photo: { width: '100%', height: 220, borderRadius: 8 },
  zoomHint: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  zoomHintText: { color: '#fff', fontSize: 11 },

  noPhoto: {
    height: 80, backgroundColor: '#f5f5f5', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  noPhotoText: { color: '#ccc', fontSize: 13 },

  notesCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  notesText: { fontSize: 14, color: '#444', lineHeight: 22 },

  // Lightbox
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
