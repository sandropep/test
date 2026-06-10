import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  Alert, TouchableOpacity, Modal, StatusBar, SafeAreaView, TextInput, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

const POSITIONS = ['საწყობი', 'მაცივარი', 'თარო'] as const;
type Position = typeof POSITIONS[number];

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#d97706', approved: '#16a34a', rejected: '#dc2626',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'მოლოდინში', approved: 'დადასტურებული', rejected: 'უარყოფილი',
};

interface VisitData {
  date: string;
  warehouse_rating: string;
  fridge_rating: string;
  shelf_rating: string;
  score_percent: number;
  category: string;
  notes: string | null;
  status: string;
  rejection_note: string | null;
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
  const [actionLoading, setActionLoading] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState('');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectNoteInput, setRejectNoteInput] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('visits')
      .select('*, shops(shop_number, name, location), checker:checker_id(full_name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      if (Platform.OS === 'web') window.alert('ვიზიტი ვერ მოიძებნა');
      else Alert.alert('შეცდომა', 'ვიზიტი ვერ მოიძებნა');
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

  async function handleApprove() {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('visits')
        .update({ status: 'approved', rejection_note: null })
        .eq('id', id);
      if (error) throw error;
      setVisit(prev => prev ? { ...prev, status: 'approved', rejection_note: null } : prev);
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectNoteInput.trim()) {
      Alert.alert('შეცდომა', 'შეიყვანეთ უარყოფის მიზეზი');
      return;
    }
    setActionLoading(true);
    setRejectModalVisible(false);
    try {
      const { error } = await supabase
        .from('visits')
        .update({ status: 'rejected', rejection_note: rejectNoteInput.trim() })
        .eq('id', id);
      if (error) throw error;
      setVisit(prev => prev ? { ...prev, status: 'rejected', rejection_note: rejectNoteInput.trim() } : prev);
      setRejectNoteInput('');
    } catch (err: any) {
      Alert.alert('შეცდომა', err.message);
    } finally {
      setActionLoading(false);
    }
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
  const statusColor = STATUS_COLORS[visit.status] ?? '#888';

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[visit.status] ?? visit.status}
          </Text>
          {visit.status === 'rejected' && visit.rejection_note && (
            <Text style={styles.statusNote}> — {visit.rejection_note}</Text>
          )}
        </View>

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

        {/* Action buttons */}
        {visit.status !== 'approved' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn, actionLoading && styles.actionBtnDisabled]}
            onPress={handleApprove}
            disabled={actionLoading}
          >
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>დადასტურება</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {visit.status !== 'rejected' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn, actionLoading && styles.actionBtnDisabled]}
            onPress={() => setRejectModalVisible(true)}
            disabled={actionLoading}
          >
            <Ionicons name="close-circle-outline" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>უარყოფა</Text>
          </TouchableOpacity>
        )}

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
                onPress={() => { setLightboxUri(photoMap[pos]); setLightboxLabel(pos); }}
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

        {visit.notes && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>შენიშვნა</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{visit.notes}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Reject modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>უარყოფის მიზეზი</Text>
            <TextInput
              style={styles.modalInput}
              value={rejectNoteInput}
              onChangeText={setRejectNoteInput}
              placeholder="შეიყვანეთ შენიშვნა ჩეკერისთვის..."
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setRejectModalVisible(false); setRejectNoteInput(''); }}
              >
                <Text style={styles.modalCancelText}>გაუქმება</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalRejectBtn} onPress={handleReject}>
                <Text style={styles.modalRejectText}>უარყოფა</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lightbox */}
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

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, marginBottom: 12, gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  statusNote: { fontSize: 13, color: '#555', flex: 1 },

  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12 },
  shopName: { fontSize: 17, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  shopLocation: { fontSize: 13, color: '#888', marginBottom: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  metaLabel: { fontSize: 11, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  scoreBadge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  scoreBadgeText: { fontSize: 20, fontWeight: '800' },
  scorePct: { fontSize: 13, fontWeight: '600' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 14, marginBottom: 8,
  },
  actionBtnDisabled: { opacity: 0.6 },
  approveBtn: { backgroundColor: '#16a34a' },
  rejectBtn: { backgroundColor: '#dc2626' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 8,
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

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 20, width: '100%', maxWidth: 400,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  modalInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1a1a2e',
    minHeight: 80, marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#666' },
  modalRejectBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#dc2626', alignItems: 'center',
  },
  modalRejectText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
