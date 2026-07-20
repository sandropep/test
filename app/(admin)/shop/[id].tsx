import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#d97706', approved: '#16a34a', rejected: '#dc2626',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'მოლოდინში', approved: 'დადასტურებული', rejected: 'უარყოფილი',
};

interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface Visit {
  id: string;
  date: string;
  created_at: string;
  score_percent: number;
  category: string;
  status: string;
  checker: { full_name: string } | null;
}

const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayDate = () => new Date();
function formatDisplay(d: Date) {
  return d.toLocaleDateString('ka-GE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(createdAt: string) {
  const d = new Date(createdAt);
  const month = d.toLocaleDateString('ka-GE', { month: 'short' });
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${month} ${h}:${m}`;
}

type DatePreset = 'week' | 'month' | '3months' | 'all' | 'custom';
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'week', label: '7 დღე' },
  { key: 'month', label: 'ამ თვეში' },
  { key: '3months', label: '3 თვე' },
  { key: 'all', label: 'ყველა' },
  { key: 'custom', label: 'სხვა...' },
];
function datesForPreset(preset: DatePreset): { from: Date; to: Date } {
  const now = todayDate();
  if (preset === 'week') return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
  if (preset === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (preset === '3months') return { from: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), to: now };
  if (preset === 'all') return { from: new Date(2000, 0, 1), to: now };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

export default function ShopDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  const [datePreset, setDatePreset] = useState<DatePreset>('3months');
  const [fromDate, setFromDate] = useState<Date>(() => datesForPreset('3months').from);
  const [toDate, setToDate] = useState<Date>(() => datesForPreset('3months').to);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const fromPickerEl = useRef<HTMLInputElement | null>(null);
  const toPickerEl = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const mkInput = (onChange: (v: string) => void) => {
      const el = document.createElement('input');
      el.type = 'date';
      el.style.cssText = 'position:fixed;left:0;top:0;opacity:0;width:1px;height:1px;pointer-events:none;';
      el.addEventListener('change', () => { if (el.value) onChange(el.value); });
      document.body.appendChild(el);
      return el;
    };
    fromPickerEl.current = mkInput(v => setFromDate(new Date(v + 'T00:00:00')));
    toPickerEl.current = mkInput(v => setToDate(new Date(v + 'T00:00:00')));
    return () => {
      fromPickerEl.current?.remove();
      toPickerEl.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (fromPickerEl.current) { fromPickerEl.current.value = fmt(fromDate); fromPickerEl.current.max = fmt(toDate); }
    if (toPickerEl.current) { toPickerEl.current.value = fmt(toDate); toPickerEl.current.min = fmt(fromDate); toPickerEl.current.max = fmt(todayDate()); }
  }, [fromDate, toDate]);

  function openFromPicker() {
    const el = fromPickerEl.current;
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.focus();
    try { (el as any).showPicker(); } catch { el.click(); }
    el.style.pointerEvents = 'none';
  }
  function openToPicker() {
    const el = toPickerEl.current;
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.focus();
    try { (el as any).showPicker(); } catch { el.click(); }
    el.style.pointerEvents = 'none';
  }

  const load = useCallback(async () => {
    if (!id) return;
    const [shopRes, visitsRes] = await Promise.all([
      supabase.from('shops').select('id, shop_number, name, location').eq('id', id).single(),
      supabase
        .from('visits')
        .select('id, date, created_at, score_percent, category, status, checker:checker_id(full_name)')
        .eq('shop_id', id)
        .gte('date', fmt(fromDate))
        .lte('date', fmt(toDate))
        .order('date', { ascending: false }),
    ]);
    setShop((shopRes.data as unknown as Shop) ?? null);
    setVisits((visitsRes.data as unknown as Visit[]) ?? []);
  }, [id, fromDate, toDate]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/(admin)/analytics')}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={18} color="#1a1a2e" />
        <Text style={styles.backBtnText}>უკან</Text>
      </TouchableOpacity>

      {shop && (
        <View style={styles.header}>
          <Text style={styles.shopName}>#{shop.shop_number} — {shop.name}</Text>
          {shop.location ? <Text style={styles.shopLocation}>{shop.location}</Text> : null}
        </View>
      )}

      <View style={styles.presetsRow}>
        {DATE_PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.dateChip, datePreset === p.key && styles.dateChipActive]}
            onPress={() => {
              setDatePreset(p.key);
              if (p.key !== 'custom') {
                const { from, to } = datesForPreset(p.key);
                setFromDate(from);
                setToDate(to);
              }
            }}
          >
            <Text style={[styles.dateChipText, datePreset === p.key && styles.dateChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {datePreset === 'custom' && (
        Platform.OS === 'web' ? (
          <View style={styles.customDateRow}>
            <TouchableOpacity style={styles.datePillBtn} onPress={openFromPicker}>
              <Ionicons name="calendar-outline" size={14} color="#2563eb" />
              <Text suppressHydrationWarning style={styles.datePillText}>{formatDisplay(fromDate)}</Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward-outline" size={14} color="#cbd5e1" />
            <TouchableOpacity style={styles.datePillBtn} onPress={openToPicker}>
              <Ionicons name="calendar-outline" size={14} color="#2563eb" />
              <Text suppressHydrationWarning style={styles.datePillText}>{formatDisplay(toDate)}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.customDateRow}>
            <TouchableOpacity style={styles.datePillBtn} onPress={() => setShowFromPicker(true)}>
              <Ionicons name="calendar-outline" size={14} color="#2563eb" />
              <Text style={styles.datePillText}>{formatDisplay(fromDate)}</Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward-outline" size={14} color="#cbd5e1" />
            <TouchableOpacity style={styles.datePillBtn} onPress={() => setShowToPicker(true)}>
              <Ionicons name="calendar-outline" size={14} color="#2563eb" />
              <Text style={styles.datePillText}>{formatDisplay(toDate)}</Text>
            </TouchableOpacity>
            {showFromPicker && (
              <DateTimePicker value={fromDate} mode="date" maximumDate={toDate}
                onChange={(_, d) => { setShowFromPicker(false); if (d) setFromDate(d); }} />
            )}
            {showToPicker && (
              <DateTimePicker value={toDate} mode="date" minimumDate={fromDate} maximumDate={todayDate()}
                onChange={(_, d) => { setShowToPicker(false); if (d) setToDate(d); }} />
            )}
          </View>
        )
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={v => v.id}
          contentContainerStyle={styles.listContent}
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
              style={[styles.visitRow, { borderLeftColor: STATUS_COLORS[visit.status] ?? '#e0e0e0' }]}
              onPress={() => router.push(`/(admin)/visit/${visit.id}?from=shop&shopId=${id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.visitMain}>
                <Text style={styles.visitMeta}>
                  {(visit.checker as any)?.full_name ?? '—'}  ·  {formatDateTime(visit.created_at)}
                </Text>
                <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[visit.status] ?? '#888') + '20', alignSelf: 'flex-start', marginTop: 4 }]}>
                  <Text style={[styles.badgeText, { color: STATUS_COLORS[visit.status] ?? '#888' }]}>
                    {STATUS_LABELS[visit.status] ?? visit.status}
                  </Text>
                </View>
              </View>
              <View style={styles.visitRight}>
                <Text style={[styles.visitScore, { color: CATEGORY_COLORS[visit.category] }]}>
                  {visit.score_percent}%
                </Text>
                <View style={[styles.badge, { backgroundColor: CATEGORY_COLORS[visit.category] + '20' }]}>
                  <Text style={[styles.badgeText, { color: CATEGORY_COLORS[visit.category] }]}>
                    {visit.category}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
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

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', margin: 16, marginBottom: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },

  header: { paddingHorizontal: 16, marginBottom: 12 },
  shopName: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  shopLocation: { fontSize: 13, color: '#888', marginTop: 2 },

  presetsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, marginBottom: 8,
  },
  dateChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e0e0e0',
  },
  dateChipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  dateChipText: { fontSize: 12, fontWeight: '600', color: '#888' },
  dateChipTextActive: { color: '#2563eb' },

  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginBottom: 10,
  },
  datePillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#dbeafe',
  },
  datePillText: { fontSize: 12, fontWeight: '700', color: '#1e40af' },

  listContent: { padding: 12, paddingBottom: 40 },
  resultCount: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 4, paddingBottom: 8,
  },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },

  visitRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  visitMain: { flex: 1 },
  visitMeta: { fontSize: 12, color: '#aaa' },
  visitRight: { alignItems: 'flex-end', gap: 4 },
  visitScore: { fontSize: 15, fontWeight: '800' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
