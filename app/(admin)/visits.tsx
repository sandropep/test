import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,
  Alert, ActivityIndicator, RefreshControl, TextInput, Modal, Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

interface Shop { id: string; shop_number: string; name: string }
interface Checker { id: string; full_name: string }
interface Visit {
  id: string;
  date: string;
  created_at: string;
  score_percent: number;
  category: string;
  checker_id: string;
  shops: { shop_number: string; name: string } | null;
}

const fmt = (d: Date) => d.toISOString().split('T')[0];
const today = () => new Date();
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function formatDisplay(d: Date) {
  return d.toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function VisitsList() {
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [checkerMap, setCheckerMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<Date>(startOfMonth());
  const [toDate, setToDate] = useState<Date>(today());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [selectedChecker, setSelectedChecker] = useState<string | null>(null);
  const [checkerModalVisible, setCheckerModalVisible] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shopQuery, setShopQuery] = useState('');
  const [shopResults, setShopResults] = useState<Shop[]>([]);

  useEffect(() => {
    supabase.from('users').select('id, full_name').eq('role', 'checker').then(({ data }) => {
      const list = data ?? [];
      setCheckers(list);
      setCheckerMap(Object.fromEntries(list.map(c => [c.id, c.full_name])));
    });
  }, []);

  useEffect(() => {
    if (shopQuery.length < 2) { setShopResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('shops').select('id, shop_number, name')
        .or(`shop_number.ilike.%${shopQuery}%,name.ilike.%${shopQuery}%`).limit(8);
      setShopResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [shopQuery]);

  const load = useCallback(async () => {
    let q = supabase
      .from('visits')
      .select('id, date, created_at, score_percent, category, checker_id, shops(shop_number, name)')
      .order('created_at', { ascending: false })
      .limit(150);
    q = q.gte('date', fmt(fromDate));
    q = q.lte('date', fmt(toDate));
    if (selectedChecker) q = q.eq('checker_id', selectedChecker);
    if (selectedShop) q = q.eq('shop_id', selectedShop.id);
    const { data } = await q;
    setVisits((data as unknown as Visit[]) ?? []);
  }, [fromDate, toDate, selectedChecker, selectedShop]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleDelete(visit: Visit) {
    Alert.alert(
      'ვიზიტის წაშლა',
      `#${visit.shops?.shop_number} — ${visit.shops?.name}\n${visit.date}`,
      [
        { text: 'გაუქმება', style: 'cancel' },
        {
          text: 'წაშლა', style: 'destructive',
          onPress: async () => {
            setDeleting(visit.id);
            try {
              const { data: photos } = await supabase
                .from('photos').select('storage_path').eq('visit_id', visit.id);
              if (photos?.length) {
                await supabase.storage.from('photos').remove(photos.map(p => p.storage_path));
              }
              const { error } = await supabase.from('visits').delete().eq('id', visit.id);
              if (error) throw error;
              setVisits(prev => prev.filter(v => v.id !== visit.id));
            } catch (err: any) {
              Alert.alert('შეცდომა', err.message ?? 'სცადეთ თავიდან');
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  }

  function formatDate(createdAt: string) {
    const d = new Date(createdAt);
    const month = d.toLocaleDateString('ka-GE', { month: 'short' });
    return `${d.getDate()} ${month} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  const hasActiveFilters = !!(selectedChecker || selectedShop);

  return (
    <View style={styles.container}>
      {/* ── Filter bar ── */}
      <View style={styles.filterBar}>

        {/* Date row */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>თარიღი</Text>
          <View style={styles.dateRangeRow}>
            {Platform.OS === 'web' ? (
              <>
                <TextInput
                  style={styles.dateInput}
                  value={fmt(fromDate)}
                  onChangeText={v => { if (v) setFromDate(new Date(v + 'T00:00:00')); }}
                  {...{ type: 'date' } as any}
                />
                <Text style={styles.dateSep}>—</Text>
                <TextInput
                  style={styles.dateInput}
                  value={fmt(toDate)}
                  onChangeText={v => { if (v) setToDate(new Date(v + 'T00:00:00')); }}
                  {...{ type: 'date' } as any}
                />
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.datePillBtn} onPress={() => setShowFromPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color="#2563eb" />
                  <Text style={styles.datePillText}>{formatDisplay(fromDate)}</Text>
                </TouchableOpacity>
                <Text style={styles.dateSep}>—</Text>
                <TouchableOpacity style={styles.datePillBtn} onPress={() => setShowToPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color="#2563eb" />
                  <Text style={styles.datePillText}>{formatDisplay(toDate)}</Text>
                </TouchableOpacity>
                {showFromPicker && (
                  <DateTimePicker value={fromDate} mode="date" maximumDate={toDate}
                    onChange={(_, d) => { setShowFromPicker(false); if (d) setFromDate(d); }} />
                )}
                {showToPicker && (
                  <DateTimePicker value={toDate} mode="date" minimumDate={fromDate} maximumDate={today()}
                    onChange={(_, d) => { setShowToPicker(false); if (d) setToDate(d); }} />
                )}
              </>
            )}
          </View>
        </View>

        {/* Checker row */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>ჩეკერი</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setCheckerModalVisible(true)}>
            {selectedChecker ? (
              <>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>
                    {(checkers.find(c => c.id === selectedChecker)?.full_name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.dropdownBtnText} numberOfLines={1}>
                  {checkers.find(c => c.id === selectedChecker)?.full_name || '—'}
                </Text>
              </>
            ) : (
              <Text style={styles.dropdownBtnText}>ყველა ჩეკერი</Text>
            )}
            <Ionicons name="chevron-down" size={16} color="#555" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Shop row */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>მაღაზია</Text>
          <View style={[styles.shopSearchWrapper, { flex: 1 }]}>
            {selectedShop ? (
              <View style={styles.shopSelected}>
                <Text style={styles.shopSelectedText} numberOfLines={1}>
                  #{selectedShop.shop_number} — {selectedShop.name}
                </Text>
                <TouchableOpacity onPress={() => { setSelectedShop(null); setShopQuery(''); }}>
                  <Ionicons name="close-circle" size={18} color="#888" />
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput
                style={styles.shopInput}
                value={shopQuery}
                onChangeText={setShopQuery}
                placeholder="მაღაზიის ძიება..."
                placeholderTextColor="#aaa"
              />
            )}
            {shopResults.length > 0 && (
              <View style={styles.shopDropdown}>
                {shopResults.map(shop => (
                  <TouchableOpacity
                    key={shop.id}
                    style={styles.shopDropdownRow}
                    onPress={() => { setSelectedShop(shop); setShopResults([]); setShopQuery(''); }}
                  >
                    <Text style={styles.shopDropdownNum}>#{shop.shop_number}</Text>
                    <Text style={styles.shopDropdownName}>{shop.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {hasActiveFilters && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setSelectedChecker(null); setSelectedShop(null); setShopQuery(''); }}
          >
            <Ionicons name="refresh-outline" size={14} color="#2563eb" />
            <Text style={styles.clearBtnText}>ფილტრის გასუფთავება</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Checker modal */}
      <Modal visible={checkerModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setCheckerModalVisible(false)}>
          <Pressable style={styles.modalSheet}>
            <Text style={styles.modalTitle}>ჩეკერის არჩევა</Text>
            <TouchableOpacity
              style={[styles.modalRow, !selectedChecker && styles.modalRowActive]}
              onPress={() => { setSelectedChecker(null); setCheckerModalVisible(false); }}
            >
              <View style={[styles.avatar, { backgroundColor: '#e0e0e0' }]}>
                <Ionicons name="people-outline" size={16} color="#888" />
              </View>
              <Text style={styles.modalRowText}>ყველა ჩეკერი</Text>
              {!selectedChecker && <Ionicons name="checkmark" size={18} color="#2563eb" />}
            </TouchableOpacity>
            {checkers.map(c => {
              const initials = (c.full_name || '?').slice(0, 2).toUpperCase();
              const isSelected = selectedChecker === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.modalRow, isSelected && styles.modalRowActive]}
                  onPress={() => { setSelectedChecker(c.id); setCheckerModalVisible(false); }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <Text style={styles.modalRowText}>{c.full_name || '(სახელი არ არის)'}</Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Visit list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={v => v.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Text style={styles.resultCount}>{visits.length} ვიზიტი</Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>ვიზიტი არ მოიძებნა</Text>
            </View>
          }
          renderItem={({ item: visit }) => (
            <TouchableOpacity
              style={styles.visitRow}
              onPress={() => router.push(`/(admin)/visit/${visit.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.visitMain}>
                <Text style={styles.visitShop}>
                  #{visit.shops?.shop_number} — {visit.shops?.name}
                </Text>
                <Text style={styles.visitMeta}>
                  {checkerMap[visit.checker_id] ?? '—'}  ·  {formatDate(visit.created_at)}
                </Text>
              </View>
              <View style={styles.visitRight}>
                <Text style={styles.visitScore}>{visit.score_percent}%</Text>
                <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[visit.category] + '20' }]}>
                  <Text style={[styles.badgeText, { color: CATEGORY_COLORS[visit.category] }]}>
                    {visit.category}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(visit)}
                disabled={deleting === visit.id}
              >
                {deleting === visit.id
                  ? <ActivityIndicator size="small" color="#dc2626" />
                  : <Ionicons name="trash-outline" size={20} color="#dc2626" />
                }
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  filterBar: {
    backgroundColor: '#fff', paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 1, borderColor: '#eee',
  },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  filterLabel: {
    fontSize: 12, fontWeight: '700', color: '#888',
    width: 72, paddingLeft: 12, flexShrink: 0,
  },

  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  dateSep: { fontSize: 14, color: '#aaa', fontWeight: '600' },
  dateInput: {
    backgroundColor: '#f0f2f5', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 6, fontSize: 13, color: '#1a1a2e',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  datePillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2563eb',
  },
  datePillText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },

  dropdownBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0f2f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e0e0e0', marginRight: 12,
  },
  dropdownBtnText: { fontSize: 14, color: '#1a1a2e', fontWeight: '500', flex: 1 },
  avatarSmall: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  shopSearchWrapper: { marginBottom: 4, zIndex: 10 },
  shopInput: {
    backgroundColor: '#f0f2f5', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, fontSize: 14, color: '#1a1a2e',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  shopSelected: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 8, borderWidth: 1, borderColor: '#2563eb',
  },
  shopSelectedText: { color: '#2563eb', fontWeight: '600', fontSize: 14, flex: 1, marginRight: 8 },
  shopDropdown: {
    backgroundColor: '#fff', borderRadius: 8, marginTop: 2,
    borderWidth: 1, borderColor: '#e0e0e0', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8,
  },
  shopDropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  shopDropdownNum: { fontWeight: '700', color: '#2563eb', fontSize: 13, minWidth: 44 },
  shopDropdownName: { color: '#333', fontSize: 14 },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 12, marginTop: 2,
  },
  clearBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: '#fff', borderRadius: 16,
    width: 320, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalTitle: {
    fontSize: 13, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  modalRowActive: { backgroundColor: '#eff6ff' },
  modalRowText: { flex: 1, fontSize: 15, color: '#1a1a2e', fontWeight: '500' },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  listContent: { padding: 12, paddingBottom: 40 },
  resultCount: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },

  visitRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
  },
  visitMain: { flex: 1 },
  visitShop: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  visitMeta: { fontSize: 12, color: '#888' },
  visitRight: { alignItems: 'flex-end', gap: 4, marginHorizontal: 10 },
  visitScore: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  deleteBtn: { padding: 6 },
});
