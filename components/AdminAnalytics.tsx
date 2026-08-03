import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Dimensions, ScrollView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllRows';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

function showInfo(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

type DatePreset = 'today' | 'week' | 'month' | 'last_month';
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'დღეს' },
  { key: 'week', label: '7 დღე' },
  { key: 'month', label: 'ამ თვეში' },
  { key: 'last_month', label: 'წინა თვე' },
];

const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

interface Checker { id: string; full_name: string }
interface Shop { id: string; shop_number: string; name: string; location: string | null }
interface VisitRow { date: string; score_percent: number; category: string; shop_id: string }
interface BarItem {
  value: number; label: string; frontColor: string; spacing?: number;
  labelTextStyle?: object;
  topLabelComponent?: () => React.ReactNode;
}

const CATEGORY_ORDER = ['A', 'B', 'C', 'D'] as const;
const WITHIN_GROUP_SPACING = 2;
const GROUP_GAP_SPACING = 12;
const CHART_INITIAL_SPACING = 12;

function countLabel(count: number) {
  if (count === 0) return undefined;
  return () => (
    <Text style={{ fontSize: 9, fontWeight: '800', color: '#1a1a2e', marginBottom: 3 }}>
      {count}
    </Text>
  );
}

// One group of 4 side-by-side bars (A/B/C/D) per day, rather than stacked,
// so each category's count is independently readable at a glance.
function buildGroupedCategoryData(
  visits: VisitRow[], from: Date, to: Date,
): { items: BarItem[]; groupDates: string[] } {
  const buckets: Record<string, Record<string, number>> = {};

  const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (cur <= end) { buckets[fmtDate(cur)] = { A: 0, B: 0, C: 0, D: 0 }; cur.setDate(cur.getDate() + 1); }

  visits.forEach(v => {
    if (buckets[v.date] && buckets[v.date][v.category] !== undefined) buckets[v.date][v.category]++;
  });

  const items: BarItem[] = [];
  const groupDates: string[] = [];
  Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, counts]) => CATEGORY_ORDER.some(cat => counts[cat] > 0))
    .forEach(([date, counts]) => {
      const d = new Date(date + 'T00:00:00');
      groupDates.push(`${d.getDate()}/${d.getMonth() + 1}`);
      CATEGORY_ORDER.forEach((cat, i) => {
        items.push({
          value: counts[cat],
          label: cat,
          labelTextStyle: { color: CATEGORY_COLORS[cat], fontSize: 10, fontWeight: '800' },
          frontColor: counts[cat] > 0 ? CATEGORY_COLORS[cat] : '#e5e5e5',
          spacing: i === CATEGORY_ORDER.length - 1 ? GROUP_GAP_SPACING : WITHIN_GROUP_SPACING,
          topLabelComponent: countLabel(counts[cat]),
        });
      });
    });
  return { items, groupDates };
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
    const rows = await fetchAllRows<VisitRow>(() => {
      let q = supabase
        .from('visits')
        .select('date, score_percent, category, shop_id')
        .eq('status', 'approved')
        .gte('date', fmtDate(from))
        .lte('date', fmtDate(to))
        .order('date', { ascending: true });
      if (selectedChecker) q = (q as any).eq('checker_id', selectedChecker);
      if (selectedShop) q = (q as any).eq('shop_id', selectedShop.id);
      return q;
    });
    setVisits(rows);
    setLoading(false);
  }, [from, to, selectedChecker, selectedShop]);

  useEffect(() => { load(); }, [load]);

  const { items: barData, groupDates } = buildGroupedCategoryData(visits, from, to);
  const totalVisits = visits.length;
  const uniqueShops = new Set(visits.map(v => v.shop_id)).size;
  const avgScore = totalVisits > 0
    ? Math.round(visits.reduce((s, v) => s + v.score_percent, 0) / totalVisits)
    : null;

  const scoreColor = avgScore == null ? '#1a1a2e'
    : avgScore >= 90 ? '#16a34a' : avgScore >= 75 ? '#2563eb' : avgScore >= 60 ? '#d97706' : '#dc2626';

  const MIN_BAR_WIDTH = 6;
  const MAX_BAR_WIDTH = 60;
  const numGroups = Math.max(1, groupDates.length);
  const totalSpacing = numGroups * (WITHIN_GROUP_SPACING * (CATEGORY_ORDER.length - 1) + GROUP_GAP_SPACING);
  // Stretch bars to fill the full chart width when there's room (e.g. a 7-day view);
  // once a day-by-day month view no longer fits even at the minimum legible width,
  // keep that minimum and let the chart scroll horizontally instead of squishing further.
  const idealBarWidth = Math.floor((chartWidth - 24 - totalSpacing) / (barData.length || 1));
  const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, idealBarWidth));
  // The "core" span is just the 4 bars + the small gaps between them — the date label
  // centers over this. GROUP_GAP_SPACING is the separator *after* that, rendered as its
  // own spacer, so it doesn't get included in (and skew) the centering math.
  const coreGroupWidth = CATEGORY_ORDER.length * barWidth + (CATEGORY_ORDER.length - 1) * WITHIN_GROUP_SPACING;
  const groupWidth = coreGroupWidth + GROUP_GAP_SPACING;
  const chartContentWidth = Math.max(chartWidth, numGroups * groupWidth + CHART_INITIAL_SPACING + 24);
  const maxCount = Math.max(...barData.map(b => b.value), 1);
  const chartYMax = Math.max(1, Math.ceil(maxCount * 1.3));

  const checkerName = selectedChecker
    ? (checkers.find(c => c.id === selectedChecker)?.full_name ?? '—')
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>ანალიტიკა</Text>

      {/* Date presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.presetsScroll}
        contentContainerStyle={styles.presetsContent}
        keyboardShouldPersistTaps="always"
      >
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.preset, preset === p.key && styles.presetActive]}
            onPress={() => {
              setPreset(p.key);
              const dates = datesForPreset(p.key);
              setFrom(dates.from);
              setTo(dates.to);
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
        <Text style={[styles.filterBtnText, !!selectedChecker && styles.filterBtnTextActive]} numberOfLines={1}>
          {checkerName ?? 'ყველა ჩეკერი'}
        </Text>
        {selectedChecker ? (
          <TouchableOpacity
            onPress={() => setSelectedChecker(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color="#2563eb" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={14} color="#aaa" />
        )}
      </TouchableOpacity>

      {/* Shop filter — dropdown is absolutely positioned to overlay siblings */}
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
                  {shop.location && (
                    <Text style={styles.shopDropdownLoc} numberOfLines={1}>{shop.location}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalVisits}</Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>ვიზიტი</Text>
            <TouchableOpacity
              onPress={() => showInfo('ვიზიტი', 'დადასტურებული ვიზიტების რაოდენობა არჩეულ პერიოდსა და ფილტრებში (ჩეკერი/მაღაზია, თუ არჩეულია).')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.statCard, styles.statCardBorder]}>
          <Text style={styles.statValue}>{uniqueShops}</Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>მაღაზია</Text>
            <TouchableOpacity
              onPress={() => showInfo('მაღაზია', 'რამდენი განსხვავებული მაღაზია მოინახულეს არჩეულ პერიოდსა და ფილტრებში (დადასტურებული ვიზიტების მიხედვით).')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.statCard, styles.statCardBorder]}>
          <Text style={[styles.statValue, { color: scoreColor }]}>
            {avgScore != null ? `${avgScore}%` : '—'}
          </Text>
          <View style={styles.statLabelRow}>
            <Text style={styles.statLabel}>საშ. ქულა</Text>
            <TouchableOpacity
              onPress={() => showInfo('საშ. ქულა', 'არჩეული პერიოდის დადასტურებული ვიზიტების საშუალო ქულა (%).')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
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
          <View style={styles.chartCaptionRow}>
            <Text style={styles.chartCaption}>კატეგორიების განაწილება (დღეების მიხედვით)</Text>
            <View style={styles.legendRow}>
              {CATEGORY_ORDER.map(cat => (
                <View key={cat} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: CATEGORY_COLORS[cat] }]} />
                  <Text style={styles.legendText}>{cat}</Text>
                </View>
              ))}
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={chartContentWidth > chartWidth}>
            <View style={{ width: chartContentWidth }}>
              <BarChart
                data={barData}
                width={chartContentWidth}
                barWidth={barWidth}
                initialSpacing={CHART_INITIAL_SPACING}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                noOfSections={4}
                maxValue={chartYMax}
                hideRules={false}
                rulesColor="#f0f0f0"
                topLabelTextStyle={styles.topLabelText}
                isAnimated
              />
              <View style={[styles.dateRow, { paddingLeft: CHART_INITIAL_SPACING }]}>
                {groupDates.map((date, i) => (
                  <View key={i} style={styles.dateGroup}>
                    <Text style={[styles.dateRowText, { width: coreGroupWidth }]} numberOfLines={1}>
                      {date}
                    </Text>
                    {i < groupDates.length - 1 && (
                      <View style={[styles.dateDividerWrap, { width: GROUP_GAP_SPACING }]}>
                        <View style={styles.dateDivider} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
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

  shopWrapper: { marginBottom: 14, zIndex: 100, position: 'relative' },
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
    position: 'absolute', top: 46, left: 0, right: 0, zIndex: 200,
    backgroundColor: '#fff', borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0', elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12,
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
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  statLabel: {
    fontSize: 10, color: '#aaa', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  chartPlaceholder: { height: 100, justifyContent: 'center', alignItems: 'center' },
  chartCaptionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  chartCaption: {
    fontSize: 10, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1,
  },
  legendRow: { flexDirection: 'row', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '700', color: '#888' },
  topLabelText: { fontSize: 9, fontWeight: '800', color: '#1a1a2e' },
  dateRow: { flexDirection: 'row', marginTop: 6 },
  dateGroup: { flexDirection: 'row', alignItems: 'flex-start' },
  dateRowText: { fontSize: 10, fontWeight: '600', color: '#999', textAlign: 'center' },
  dateDividerWrap: { alignItems: 'center' },
  dateDivider: { width: 1, height: 10, backgroundColor: '#e5e5e5' },
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
