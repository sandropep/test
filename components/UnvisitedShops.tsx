import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAllRows';
import { fetchVisitedShopIdsThisMonth } from '../lib/visitedThisMonth';

interface Shop { id: string; shop_number: string; name: string; location: string | null }

const PAGE_SIZE = 10;
const UNASSIGNED = '__unassigned__';

function showInfo(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}
const fmt = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function UnvisitedShops() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [chainTotals, setChainTotals] = useState<Record<string, number>>({});
  const [checkerTotals, setCheckerTotals] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [checkerFilter, setCheckerFilter] = useState<string | null>(null);
  const [checkerByShopId, setCheckerByShopId] = useState<Record<string, string>>({});

  const chainUnvisitedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    shops.forEach(s => { counts[s.name] = (counts[s.name] ?? 0) + 1; });
    return counts;
  }, [shops]);
  const chains = useMemo(
    () => Array.from(new Set(shops.map(s => s.name).filter(Boolean))).sort(),
    [shops]
  );

  const checkerKey = useCallback((s: Shop) => checkerByShopId[s.id] ?? UNASSIGNED, [checkerByShopId]);
  const checkerUnvisitedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    shops.forEach(s => { const k = checkerKey(s); counts[k] = (counts[k] ?? 0) + 1; });
    return counts;
  }, [shops, checkerKey]);
  const checkerNames = useMemo(
    () => Array.from(new Set(shops.map(s => checkerByShopId[s.id]).filter(Boolean))).sort() as string[],
    [shops, checkerByShopId]
  );
  const hasUnassigned = (checkerUnvisitedCounts[UNASSIGNED] ?? 0) > 0;

  const filteredShops = useMemo(() => {
    let list = shops;
    if (chainFilter) list = list.filter(s => s.name === chainFilter);
    if (checkerFilter) list = list.filter(s => checkerKey(s) === checkerFilter);
    return list;
  }, [shops, chainFilter, checkerFilter, checkerKey]);

  const load = useCallback(async () => {
    setLoading(true);

    const [allShops, visitedIds, assignments] = await Promise.all([
      // Paginated, since shop count can exceed Supabase's 1000-row default cap.
      fetchAllRows<Shop>(() =>
        supabase.from('shops').select('id, shop_number, name, location')
      ),
      fetchVisitedShopIdsThisMonth(),
      fetchAllRows<{ shop_id: string; checker: { full_name: string } | null }>(() =>
        supabase.from('shop_checkers').select('shop_id, checker:users!checker_id(full_name)')
      ),
    ]);

    const unvisited = allShops.filter(s => !visitedIds.has(s.id));
    unvisited.sort((a, b) => a.shop_number.localeCompare(b.shop_number, undefined, { numeric: true }));

    const totals: Record<string, number> = {};
    allShops.forEach(s => { totals[s.name] = (totals[s.name] ?? 0) + 1; });

    const checkerMap: Record<string, string> = {};
    assignments.forEach(a => { if (a.checker?.full_name) checkerMap[a.shop_id] = a.checker.full_name; });

    const checkerTotalsMap: Record<string, number> = {};
    allShops.forEach(s => {
      const k = checkerMap[s.id] ?? UNASSIGNED;
      checkerTotalsMap[k] = (checkerTotalsMap[k] ?? 0) + 1;
    });

    setShops(unvisited);
    setChainTotals(totals);
    setCheckerTotals(checkerTotalsMap);
    setCheckerByShopId(checkerMap);
    setVisibleCount(PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [chainFilter, checkerFilter]);

  function handleExport() {
    const headers = ['მაღაზია #', 'სახელი', 'მისამართი', 'ჩეკერი'];
    const rows = filteredShops.map(s => [s.shop_number, s.name, s.location ?? '', checkerByShopId[s.id] ?? '']);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'არ მოინახულეს');
    XLSX.writeFile(wb, `unvisited_shops_${fmt(new Date())}.xlsx`);
  }

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Ionicons name="alert-circle-outline" size={20} color="#71717a" />
        <Text style={styles.sectionTitle}>არ მოინახულეს ამ თვეს</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {filteredShops.length}{(chainFilter || checkerFilter) ? `/${shops.length}` : ''}
          </Text>
        </View>
        {filteredShops.length > 0 && (
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={(e: any) => { e.stopPropagation?.(); handleExport(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={14} color="#16a34a" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#71717a" style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {expanded && chains.length > 0 && (
        <>
          <Text style={styles.filterLabel}>ქსელი</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.chainScroll}
            contentContainerStyle={styles.chainScrollContent}
          >
            <TouchableOpacity
              style={[styles.chainPill, !chainFilter && styles.chainPillActive]}
              onPress={() => setChainFilter(null)}
            >
              <Text style={[styles.chainPillText, !chainFilter && styles.chainPillTextActive]}>ყველა</Text>
            </TouchableOpacity>
            {chains.map(chain => (
              <TouchableOpacity
                key={chain}
                style={[styles.chainPill, chainFilter === chain && styles.chainPillActive]}
                onPress={() => setChainFilter(prev => prev === chain ? null : chain)}
              >
                <Text
                  style={[styles.chainPillText, chainFilter === chain && styles.chainPillTextActive]}
                  numberOfLines={1}
                >
                  {chain} — {chainUnvisitedCounts[chain] ?? 0}/{chainTotals[chain] ?? 0}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {expanded && (checkerNames.length > 0 || hasUnassigned) && (
        <>
          <View style={styles.filterLabelRow}>
            <Text style={[styles.filterLabel, { marginTop: 0 }]}>ჩეკერი</Text>
            <TouchableOpacity
              onPress={() => showInfo(
                'ჩეკერის ფილტრი',
                'ფილტრი აჩვენებს კონკრეტული ჩეკერისთვის მიბმულ მაღაზიებს, რომლებიც ამ თვეს ჯერ არავის მოუნახულებია. თუ მაღაზია სხვა ჩეკერმა მოინახულა , ის მაინც აღარ გამოჩნდება სიაში — მიუხედავად იმისა, ვინ არის მასზე პასუხისმგებელი.'
              )}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="information-circle-outline" size={13} color="#bbb" />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.chainScroll}
            contentContainerStyle={styles.chainScrollContent}
          >
            <TouchableOpacity
              style={[styles.chainPill, !checkerFilter && styles.chainPillActive]}
              onPress={() => setCheckerFilter(null)}
            >
              <Text style={[styles.chainPillText, !checkerFilter && styles.chainPillTextActive]}>ყველა</Text>
            </TouchableOpacity>
            {checkerNames.map(checker => (
              <TouchableOpacity
                key={checker}
                style={[styles.chainPill, checkerFilter === checker && styles.chainPillActive]}
                onPress={() => setCheckerFilter(prev => prev === checker ? null : checker)}
              >
                <Text
                  style={[styles.chainPillText, checkerFilter === checker && styles.chainPillTextActive]}
                  numberOfLines={1}
                >
                  {checker} — {checkerUnvisitedCounts[checker] ?? 0}/{checkerTotals[checker] ?? 0}
                </Text>
              </TouchableOpacity>
            ))}
            {hasUnassigned && (
              <TouchableOpacity
                style={[styles.chainPill, checkerFilter === UNASSIGNED && styles.chainPillActive]}
                onPress={() => setCheckerFilter(prev => prev === UNASSIGNED ? null : UNASSIGNED)}
              >
                <Text
                  style={[styles.chainPillText, checkerFilter === UNASSIGNED && styles.chainPillTextActive]}
                  numberOfLines={1}
                >
                  ჩეკერის გარეშე — {checkerUnvisitedCounts[UNASSIGNED] ?? 0}/{checkerTotals[UNASSIGNED] ?? 0}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </>
      )}

      {expanded && (
        filteredShops.length === 0 ? (
          <Text style={styles.emptyText}>
            {(chainFilter || checkerFilter) ? 'ამ ფილტრით ყველა მაღაზია მონახულებულია ამ თვეს' : 'ყველა მაღაზია მონახულებულია ამ თვეს'}
          </Text>
        ) : (
          <View style={styles.shopList}>
            {filteredShops.slice(0, visibleCount).map(shop => (
              <TouchableOpacity
                key={shop.id}
                style={styles.shopCard}
                onPress={() => router.push(`/(admin)/shop/${shop.id}` as any)}
                activeOpacity={0.7}
              >
                <View style={styles.shopCardAccent} />
                <View style={styles.shopCardBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shopName} numberOfLines={1}>
                      #{shop.shop_number} — {shop.name}
                    </Text>
                    {shop.location ? (
                      <Text style={styles.shopAddress} numberOfLines={1}>
                        <Text style={styles.shopFieldLabel}>მისამართი: </Text>{shop.location}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#ccc" />
                </View>
              </TouchableOpacity>
            ))}
            {visibleCount < filteredShops.length && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setVisibleCount(v => v + PAGE_SIZE)}
                activeOpacity={0.7}
              >
                <Text style={styles.loadMoreText}>
                  მეტის ნახვა ({filteredShops.length - visibleCount})
                </Text>
                <Ionicons name="chevron-down" size={14} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#71717a12', borderColor: '#71717a30',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#52525b' },
  countBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, minWidth: 26, alignItems: 'center', backgroundColor: '#71717a' },
  countBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: '#16a34a40', backgroundColor: '#f0fdf4',
  },
  exportBtnText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  emptyText: { fontSize: 12, color: '#bbb', paddingVertical: 12, paddingLeft: 4 },

  filterLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 10, marginLeft: 2,
  },
  filterLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  chainScroll: { marginTop: 14, marginBottom: 6, width: '100%' },
  chainScrollContent: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  chainPill: {
    flexShrink: 0,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  chainPillActive: { backgroundColor: '#71717a18', borderColor: '#71717a' },
  chainPillText: { fontSize: 12, fontWeight: '600', color: '#888' },
  chainPillTextActive: { color: '#52525b' },

  shopList: { gap: 10, marginTop: 10 },
  shopCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  shopCardAccent: { width: 5, backgroundColor: '#71717a' },
  shopCardBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  shopName: { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  shopAddress: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  shopFieldLabel: { fontWeight: '700', color: '#888' },

  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#71717a40', marginTop: 2,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: '#71717a' },
});
