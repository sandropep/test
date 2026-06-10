import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, Modal, Pressable,
  RefreshControl, ActivityIndicator, TouchableOpacity, TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path, Circle, Rect, G, Text as SvgText, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};

interface Shop { id: string; shop_number: string; name: string }
interface Checker { id: string; full_name: string }
const fmt = (d: Date) => d.toISOString().split('T')[0];
const today = () => new Date();
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function formatDisplay(d: Date) {
  return d.toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildTrendData(visits: any[], from: Date, to: Date) {
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86400000);
  const getKey = (dateStr: string) => {
    if (diffDays <= 31) return dateStr;
    const d = new Date(dateStr);
    if (diffDays <= 90) {
      const day = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      return mon.toISOString().split('T')[0];
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const groups: Record<string, number[]> = {};
  visits.forEach(v => {
    const k = getKey(v.date);
    (groups[k] = groups[k] ?? []).push(v.score_percent);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, scores]) => {
      const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
      const color = avg >= 90 ? CATEGORY_COLORS.A : avg >= 75 ? CATEGORY_COLORS.B : avg >= 60 ? CATEGORY_COLORS.C : CATEGORY_COLORS.D;
      return { value: avg, label: key.slice(5), color };
    });
}

function arc(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({ data, total, size = 160 }: {
  data: { value: number; color: string; text: string }[];
  total: number; size?: number;
}) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 8, innerR = r * 0.56;
  let angle = -90;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {data.map((d, i) => {
          const sweep = (d.value / total) * 360;
          const s = arc(cx, cy, r, angle);
          const e = arc(cx, cy, r, angle + sweep - 0.5);
          const large = sweep > 180 ? 1 : 0;
          angle += sweep;
          return <Path key={i} d={`M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`} fill={d.color} />;
        })}
        <Circle cx={cx} cy={cy} r={innerR} fill="#fff" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#1a1a2e' }}>{total}</Text>
        <Text style={{ fontSize: 11, color: '#888' }}>სულ</Text>
      </View>
    </View>
  );
}

function TrendBarChart({ data, width, height = 180 }: {
  data: { value: number; label: string; color: string }[];
  width: number; height: number;
}) {
  const PL = 28, PB = 24, PT = 20, PR = 8;
  const cw = width - PL - PR, ch = height - PT - PB;
  const slotW = cw / data.length;
  const barW = Math.max(10, Math.min(40, slotW * 0.65));
  return (
    <View>
      <Text style={{ fontSize: 11, color: '#aaa', marginBottom: 4, marginLeft: 4 }}>საშ. ქულა %</Text>
      <Svg width={width} height={height}>
        {[0, 25, 50, 75, 100].map(v => {
          const y = PT + ch - (v / 100) * ch;
          return (
            <G key={v}>
              <Line x1={PL} y1={y} x2={width - PR} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <SvgText x={PL - 4} y={y + 4} fontSize={9} textAnchor="end" fill="#bbb">{v}</SvgText>
            </G>
          );
        })}
        {data.map((d, i) => {
          const barH = Math.max(2, (d.value / 100) * ch);
          const x = PL + i * slotW + (slotW - barW) / 2;
          const y = PT + ch - barH;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barW} height={barH} fill={d.color} rx={3} />
              <SvgText x={x + barW / 2} y={y - 4} fontSize={10} fontWeight="700" textAnchor="middle" fill={d.color}>{d.value}%</SvgText>
              <SvgText x={x + barW / 2} y={height - 6} fontSize={9} textAnchor="middle" fill="#888">{d.label}</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export default function AdminDashboard() {
  const [checkers, setCheckers] = useState<Checker[]>([]);
const [totalShops, setTotalShops] = useState(0);
  const [currentVisits, setCurrentVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [fromDate, setFromDate] = useState<Date>(startOfMonth());
  const [toDate, setToDate] = useState<Date>(today());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [selectedChecker, setSelectedChecker] = useState<string | null>(null);
  const [checkerModalVisible, setCheckerModalVisible] = useState(false);
  const [chartTab, setChartTab] = useState<'pie' | 'trend'>('pie');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shopQuery, setShopQuery] = useState('');
  const [shopResults, setShopResults] = useState<Shop[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('users').select('id, full_name').eq('role', 'checker'),
      supabase.from('shops').select('id', { count: 'exact', head: true }),
    ]).then(([checkersRes, shopsRes]) => {
      setCheckers(checkersRes.data ?? []);
      setTotalShops(shopsRes.count ?? 0);
    });
  }, []);

  useEffect(() => {
    if (shopQuery.length < 2) { setShopResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('shops').select('id, shop_number, name')
        .or(`shop_number.ilike.%${shopQuery}%,name.ilike.%${shopQuery}%`)
        .limit(8);
      setShopResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [shopQuery]);

  const load = useCallback(async () => {
    let q = supabase
      .from('visits')
      .select('id, date, shop_id, checker_id, score_percent, category, shops(shop_number, name)')
      .order('date', { ascending: false })
      .limit(100);
    q = q.gte('date', fmt(fromDate));
    q = q.lte('date', fmt(toDate));
    if (selectedChecker) q = q.eq('checker_id', selectedChecker);
    if (selectedShop) q = q.eq('shop_id', selectedShop.id);

    const { data } = await q;
    setCurrentVisits(data ?? []);
  }, [fromDate, toDate, selectedChecker, selectedShop]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const hasFilters = selectedChecker || selectedShop;
  const [cardWidth, setCardWidth] = useState(0);

  const categoryBreakdown: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  currentVisits.forEach(v => {
    categoryBreakdown[v.category] = (categoryBreakdown[v.category] ?? 0) + 1;
  });
  const totalCat = currentVisits.length;

  const pieData = (['A', 'B', 'C', 'D'] as const)
    .map(cat => ({ value: categoryBreakdown[cat] ?? 0, color: CATEGORY_COLORS[cat], text: cat }))
    .filter(d => d.value > 0);

  const trendData = buildTrendData(currentVisits, fromDate, toDate);

const shopsVisited = new Set(currentVisits.map(v => v.shop_id)).size;
  const shopsNotVisited = totalShops - shopsVisited;

  return (
    <View style={styles.container}>
      {/* ── Filter bar ── */}
      <View style={styles.filterBar}>

        {/* Date range row */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>თარიღი</Text>
          <View style={styles.dateRangeRow}>
            {Platform.OS === 'web' ? (
              <>
                <DateTimePicker
                  value={fromDate}
                  mode="date"
                  display="default"
                  maximumDate={toDate}
                  onChange={(_, d) => d && setFromDate(d)}
                />
                <Text style={styles.dateSep}>—</Text>
                <DateTimePicker
                  value={toDate}
                  mode="date"
                  display="default"
                  minimumDate={fromDate}
                  maximumDate={today()}
                  onChange={(_, d) => d && setToDate(d)}
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
                  <DateTimePicker
                    value={fromDate}
                    mode="date"
                    maximumDate={toDate}
                    onChange={(_, d) => { setShowFromPicker(false); if (d) setFromDate(d); }}
                  />
                )}
                {showToPicker && (
                  <DateTimePicker
                    value={toDate}
                    mode="date"
                    minimumDate={fromDate}
                    maximumDate={today()}
                    onChange={(_, d) => { setShowToPicker(false); if (d) setToDate(d); }}
                  />
                )}
              </>
            )}
          </View>
        </View>

        {/* Checker filter row */}
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

        {/* Checker picker modal */}
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

        {/* Shop search row */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>მაღაზია</Text>
          <View style={[styles.shopSearchWrapper, { flex: 1 }]}>
            {selectedShop ? (
              <View style={styles.shopSelected}>
                <Text style={styles.shopSelectedText}>
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

        {hasFilters && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setSelectedChecker(null); setSelectedShop(null); setShopQuery(''); }}
          >
            <Ionicons name="refresh-outline" size={14} color="#2563eb" />
            <Text style={styles.clearBtnText}>ფილტრის გასუფთავება</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.sectionTitle}>შეჯამება</Text>
          <View style={styles.cardRow}>
            <View style={[styles.summaryCard, { flex: 1.5 }]}>
              <Text style={styles.summaryValue}>{currentVisits.length}</Text>
              <Text style={styles.summaryLabel}>ვიზიტი</Text>
            </View>
            {!selectedShop && (
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryValue, { color: shopsNotVisited > 0 ? '#d97706' : '#16a34a' }]}>
                  {shopsNotVisited}
                </Text>
                <Text style={styles.summaryLabel}>მოუვლელი</Text>
                <Text style={styles.summarySubLabel}>სულ {totalShops}</Text>
              </View>
            )}
          </View>

          {totalCat > 0 && (
            <View style={[styles.chartCard, { marginTop: 24 }]} onLayout={e => setCardWidth(e.nativeEvent.layout.width - 32)}>
              {/* Tab toggle */}
              <View style={styles.chartTabs}>
                <TouchableOpacity
                  style={[styles.chartTab, chartTab === 'pie' && styles.chartTabActive]}
                  onPress={() => setChartTab('pie')}
                >
                  <Text style={[styles.chartTabText, chartTab === 'pie' && styles.chartTabTextActive]}>
                    კატეგორიები
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chartTab, chartTab === 'trend' && styles.chartTabActive]}
                  onPress={() => setChartTab('trend')}
                >
                  <Text style={[styles.chartTabText, chartTab === 'trend' && styles.chartTabTextActive]}>
                    ტრენდი
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pie view */}
              {chartTab === 'pie' && (
                <View style={{ alignItems: 'center', paddingTop: 16 }}>
                  <DonutChart data={pieData} total={totalCat} size={160} />
                  <View style={styles.pieLegend}>
                    {pieData.map(d => (
                      <View key={d.text} style={styles.pieLegendItem}>
                        <View style={[styles.catDot, { backgroundColor: d.color }]} />
                        <Text style={styles.catLegendText}>{d.text}: {d.value}</Text>
                        <Text style={styles.piePct}>({Math.round(d.value / totalCat * 100)}%)</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Trend view */}
              {chartTab === 'trend' && (
                <View style={{ paddingTop: 16 }}>
                  {trendData.length > 0 ? (
                    cardWidth > 0 ? <TrendBarChart data={trendData} width={cardWidth} height={200} /> : null
                  ) : (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>საკმარისი მონაცემი არ არის</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}


        </ScrollView>
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
  filterRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 6,
  },
  filterLabel: {
    fontSize: 12, fontWeight: '700', color: '#888',
    width: 72, paddingLeft: 12, flexShrink: 0,
  },

  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  dateSep: { fontSize: 14, color: '#aaa', fontWeight: '600' },
  datePillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2563eb',
  },
  datePillText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },

  chipRow: { flex: 1, paddingRight: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', marginRight: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#2563eb', fontWeight: '700' },

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
  shopSelectedText: { color: '#2563eb', fontWeight: '600', fontSize: 14, flex: 1 },
  shopDropdown: {
    backgroundColor: '#fff', borderRadius: 8, marginTop: 2,
    borderWidth: 1, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  shopDropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  shopDropdownNum: { fontWeight: '700', color: '#2563eb', fontSize: 13, minWidth: 44 },
  shopDropdownName: { color: '#333', fontSize: 14 },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 2,
  },
  clearBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },

  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },

  cardRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  summaryValue: { fontSize: 36, fontWeight: '800', color: '#1a1a2e', marginBottom: 2 },
  summaryLabel: { fontSize: 13, color: '#555', marginBottom: 4 },
  summarySubLabel: { fontSize: 12, color: '#aaa' },

  chartCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  chartTabs: {
    flexDirection: 'row', backgroundColor: '#f0f2f5',
    borderRadius: 10, padding: 3,
  },
  chartTab: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
  },
  chartTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  chartTabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  chartTabTextActive: { color: '#1a1a2e', fontWeight: '700' },
  pieLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, justifyContent: 'center' },
  pieLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  piePct: { fontSize: 12, color: '#aaa' },
  catLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  catLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLegendText: { fontSize: 13, color: '#444', fontWeight: '600' },

  checkerRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
  },
  checkerLeft: { flex: 1 },
  checkerName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  checkerSub: { fontSize: 12, color: '#888' },
  checkerRight: { alignItems: 'center', marginHorizontal: 16 },
  checkerVisits: { fontSize: 24, fontWeight: '800' },
  checkerVisitsLabel: { fontSize: 11, color: '#aaa' },
  catBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  catBadgeText: { fontSize: 13, fontWeight: '700' },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 15 },

  visitRow: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
  },
  visitCatBar: { width: 5, alignSelf: 'stretch' },
  visitBody: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
  visitShop: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 3 },
  visitMeta: { fontSize: 12, color: '#888' },
  visitRight: { alignItems: 'flex-end', paddingHorizontal: 12, gap: 4 },
  visitScore: { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },

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
});
