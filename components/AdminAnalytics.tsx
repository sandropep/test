import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { supabase } from '../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

type DatePreset = 'today' | 'week' | 'month' | 'last_month';
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'დღეს' },
  { key: 'week', label: '7 დღე' },
  { key: 'month', label: 'ამ თვეში' },
  { key: 'last_month', label: 'წინა თვე' },
];

const fmtDate = (d: Date) => d.toISOString().split('T')[0];

function datesForPreset(p: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case 'today': return { from: today, to: now };
    case 'week': return { from: new Date(today.getTime() - 6 * 86400000), to: now };
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'last_month': return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0),
    };
  }
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

interface Checker { id: string; full_name: string }
interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface VisitRow { date: string; score_percent: number; category: string }
interface BarItem { value: number; label: string; frontColor: string }

function buildChartData(
  visits: VisitRow[], from: Date, to: Date,
  mode: 'perVisit' | 'perDay' | 'perWeek',
): BarItem[] {
  if (mode === 'perVisit') {
    return visits.map(v => {
      const d = new Date(v.date + 'T00:00:00');
      return {
        value: v.score_percent,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        frontColor: CATEGORY_COLORS[v.category] ?? '#2563eb',
      };
    });
  }

  if (mode === 'perDay') {
    const dayMap: Record<string, number> = {};
    const cur = new Date(from); cur.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(0, 0, 0, 0);
    while (cur <= end) { dayMap[fmtDate(cur)] = 0; cur.setDate(cur.getDate() + 1); }
    visits.forEach(v => { if (dayMap[v.date] !== undefined) dayMap[v.date]++; });
    return Object.entries(dayMap).map(([date, count]) => {
      const d = new Date(date + 'T00:00:00');
      return { value: count, label: `${d.getDate()}/${d.getMonth() + 1}`, frontColor: '#2563eb' };
    });
  }

  // perWeek
  const weekMap: Record<string, number> = {};
  const cur = new Date(getWeekStart(from));
  while (cur <= to) { weekMap[fmtDate(cur)] = 0; cur.setDate(cur.getDate() + 7); }
  visits.forEach(v => {
    const ws = fmtDate(getWeekStart(new Date(v.date + 'T00:00:00')));
    if (weekMap[ws] !== undefined) weekMap[ws]++;
  });
  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      const d = new Date(date + 'T00:00:00');
      return { value: count, label: `${d.getDate()}/${d.getMonth() + 1}`, frontColor: '#2563eb' };
    });
}

export function AdminAnalytics() {
  const [preset, setPreset] = useState<DatePreset>('month');
  const [from, setFrom] = useState(() => datesForPreset('month').from);
  const [to, setTo] = useState(() => datesForPreset('month').to);

  const [checkers, setCheckers] = useState<Checker[]>([]);
  const [selectedChecker, setSelectedChecker] = useState<string | null>(null);
  const [checkerModal, setCheckerModal] = useState(false);

  const [shopQuery, setShopQuery] = useState('');
  const [shopResults, setShopResults] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 96;

  useEffect(() => {
    supabase.from('users').select('id, full_name').eq('role', 'checker').order('full_name')
      .then(({ data }) => setCheckers((data ?? []) as Checker[]));
  }, []);

  useEffect(() => {
    if (shopQuery.length < 2) { setShopResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('shops').select('id, shop_number, name, location')
        .or(`shop_number.ilike.%${shopQuery}%,name.ilike.%${shopQuery}%`).limit(8);
      setShopResults((data ?? []) as Shop[]);
    }, 300);
    return () => clearTimeout(t);
  }, [shopQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('visits')
      .select('date, score_percent, category')
      .eq('status', 'approved')
      .gte('date', fmtDate(from))
      .lte('date', fmtDate(to))
      .order('date', { ascending: true });
    if (selectedChecker) q = (q as any).eq('checker_id', selectedChecker);
    if (selectedShop) q = (q as any).eq('shop_id', selectedShop.id);
    const { data } = await q;
    setVisits((data ?? []) as VisitRow[]);
    setLoading(false);
  }, [from, to, selectedChecker, selectedShop]);

  useEffect(() => { load(); }, [load]);

  const daySpan = Math.round((to.getTime() - from.getTime()) / 86400000);
  const mode = selectedShop ? 'perVisit' : daySpan <= 14 ? 'perDay' : 'perWeek';
  const barData = buildChartData(visits, from, to, mode);
  const maxValue = Math.max(...barData.map(b => b.value), 1);

  const totalVisits = visits.length;
  const avgScore = totalVisits > 0
    ? Math.round(visits.reduce((s, v) => s + v.score_percent, 0) / totalVisits)
    : null;

  const scoreColor = avgScore == null ? '#1a1a2e'
    : avgScore >= 90 ? '#16a34a' : avgScore >= 75 ? '#2563eb' : avgScore >= 60 ? '#d97706' : '#dc2626';

  const barCount = barData.length || 1;
  const itemWidth = Math.floor((chartWidth - 40) / barCount);
  const barWidth = Math.max(12, Math.min(36, itemWidth - 8));
  const spacing = Math.max(4, itemWidth - barWidth);

  const chartYMax = selectedShop ? 100 : Math.ceil(maxValue * 1.3) || 4;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>ანალიტიკა</Text>

      {/* Date presets */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.presetsScroll} contentContainerStyle={styles.presetsContent}
        keyboardShouldPersistTaps="always"
      >
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.preset, preset === p.key && styles.presetActive]}
            onPress={() => {
              setPreset(p.key);
              const { from: f, to: t } = datesForPreset(p.key);
              setFrom(f); setTo(t);
            }}
          >
            <Text style={[styles.presetText, preset === p.key && styles.presetTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Checker filter */}
      <TouchableOpacity style={styles.filterBtn} onPress={() => setCheckerModal(true)}>
        <Ionicons name="person-outline" size={14} color={selectedChecker ? '#2563eb' : '#888'} />
        <Text style={[styles.filterBtnText, selectedChecker && styles.filterBtnTextActive]} numberOfLines={1}>
          {selectedChecker ? (checkers.find(c => c.id === selectedChecker)?.full_name ?? '—') : 'ყველა ჩეკერი'}
        </Text>
        {selectedChecker
          ? <TouchableOpacity onPress={() => setSelectedChecker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#2563eb" />
            </TouchableOpacity>
          : <Ionicons name="chevron-down" size={14} color="#aaa" />}
      </TouchableOpacity>

      {/* Shop filter */}
      <View style={styles.shopWrapper}>
        {selectedShop ? (
          <View style={styles.shopSelected}>
            <Ionicons name="storefront-outline" size={14} color="#2563eb" />
            <Text style={styles.shopSelectedText} numberOfLines={1}>
              #{selectedShop.shop_number} — {selectedShop.name}
            </Text>
            <TouchableOpacity onPress={() => { setSelectedShop(null); setShopQuery(''); }}>
              <Ionicons name="close-circle" size={16} color="#2563eb" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.shopSearch}>
            <Ionicons name="storefront-outline" size={14} color="#888" />
            <TextInput
              style={styles.shopInput}
              value={shopQuery}
              onChangeText={setShopQuery}
              placeholder="მაღაზიის ძიება..."
              placeholderTextColor="#aaa"
              autoCorrect={false}
            />
            {shopQuery.length > 0 && (
              <TouchableOpacity onPress={() => setShopQuery('')}>
                <Ionicons name="close-circle" size={16} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.shopDropdownName}>{shop.name}</Text>
                  {shop.location && <Text style={styles.shopDropdownLoc} numberOfLines={1}>{shop.location}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalVisits}</Text>
          <Text style={styles.statLabel}>დადასტ. ვიზიტი</Text>
        </View>
        <View style={[styles.statCard, styles.statCardBorder]}>
          <Text style={[styles.statValue, { color: scoreColor }]}>
            {avgScore != null ? `${avgScore}%` : '—'}
          </Text>
          <Text style={styles.statLabel}>საშ. ქულა</Text>
        </View>
      </View>

      {/* Chart */}
      {loading ? (
        <View style={styles.chartPlaceholder}>
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : totalVisits === 0 ? (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.emptyText}>მონაცემი არ მოიძებნა</Text>
        </View>
      ) : (
        <View style={{ overflow: 'hidden' }}>
          <BarChart
            data={barData}
            width={chartWidth}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={12}
            roundedTop
            xAxisThickness={0}
            yAxisThickness={0}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            noOfSections={4}
            maxValue={chartYMax}
            hideRules={false}
            rulesColor="#f0f0f0"
            isAnimated
          />
        </View>
      )}

      {/* Checker picker modal */}
      <Modal visible={checkerModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setCheckerModal(false)}>
          <Pressable style={styles.modalSheet}>
            <Text style={styles.modalTitle}>ჩეკერის არჩევა</Text>
            <TouchableOpacity
              style={[styles.modalRow, !selectedChecker && styles.modalRowActive]}
              onPress={() => { setSelectedChecker(null); setCheckerModal(false); }}
            >
              <Text style={styles.modalRowText}>ყველა ჩეკერი</Text>
              {!selectedChecker && <Ionicons name="checkmark" size={18} color="#2563eb" />}
            </TouchableOpacity>
            {checkers.map(c => {
              const active = selectedChecker === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.modalRow, active && styles.modalRowActive]}
                  onPress={() => { setSelectedChecker(c.id); setCheckerModal(false); }}
                >
                  <Text style={styles.modalRowText}>{c.full_name || '—'}</Text>
                  {active && <Ionicons name="checkmark" size={18} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },

  presetsScroll: { marginBottom: 10 },
  presetsContent: { gap: 6 },
  preset: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  presetActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  presetText: { fontSize: 12, fontWeight: '600', color: '#888' },
  presetTextActive: { color: '#2563eb' },

  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0f2f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 8,
  },
  filterBtnText: { flex: 1, fontSize: 14, color: '#888', fontWeight: '500' },
  filterBtnTextActive: { color: '#2563eb', fontWeight: '600' },

  shopWrapper: { marginBottom: 14, zIndex: 10 },
  shopSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f0f2f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  shopInput: { flex: 1, fontSize: 14, color: '#1a1a2e' },
  shopSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#2563eb',
  },
  shopSelectedText: { flex: 1, fontSize: 14, color: '#2563eb', fontWeight: '600' },
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
  shopDropdownLoc: { color: '#aaa', fontSize: 11, marginTop: 1 },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#f8f9fa',
    borderRadius: 10, marginBottom: 16,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statCardBorder: { borderLeftWidth: 1, borderLeftColor: '#ebebeb' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1a1a2e', lineHeight: 26 },
  statLabel: {
    fontSize: 10, color: '#aaa', fontWeight: '600', marginTop: 3,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  chartPlaceholder: { height: 100, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#ccc', fontSize: 14 },
  axisText: { color: '#bbb', fontSize: 9 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: '#fff', borderRadius: 16, width: 300, paddingVertical: 8,
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  modalRowActive: { backgroundColor: '#eff6ff' },
  modalRowText: { fontSize: 15, color: '#1a1a2e', fontWeight: '500' },
});
