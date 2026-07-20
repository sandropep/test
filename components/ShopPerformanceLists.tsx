import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626',
};
const CATEGORY_RANK: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };

interface ShopInfo { shop_number: string; name: string; location: string | null }
interface VisitPoint { category: string; score_percent: number }
interface ShopTrendRow {
  shopId: string;
  shop: ShopInfo;
  visits: VisitPoint[]; // oldest → newest, up to last 3
  latestCategory: string;
}

type Bucket = 'low' | 'deteriorated' | 'improving';

const PAGE_SIZE = 10;

export function ShopPerformanceLists() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lowPerformers, setLowPerformers] = useState<ShopTrendRow[]>([]);
  const [deteriorated, setDeteriorated] = useState<ShopTrendRow[]>([]);
  const [improving, setImproving] = useState<ShopTrendRow[]>([]);
  const [expanded, setExpanded] = useState<Record<Bucket, boolean>>({ low: true, deteriorated: true, improving: true });
  const [visibleCount, setVisibleCount] = useState<Record<Bucket, number>>({ low: PAGE_SIZE, deteriorated: PAGE_SIZE, improving: PAGE_SIZE });

  const load = useCallback(async () => {
    setLoading(true);
    // Only shop_id/date/category/score_percent — no photos are touched here,
    // keeping this a cheap metadata query regardless of how many shops/visits exist.
    const { data } = await supabase
      .from('visits')
      .select('shop_id, date, category, score_percent, shops(shop_number, name, location)')
      .eq('status', 'approved')
      .order('date', { ascending: false });

    const rows = (data ?? []) as unknown as { shop_id: string; category: string; score_percent: number; shops: ShopInfo | null }[];

    const byShop: Record<string, { shop: ShopInfo; visits: VisitPoint[] }> = {};
    rows.forEach(r => {
      if (!r.shops) return;
      if (!byShop[r.shop_id]) byShop[r.shop_id] = { shop: r.shops, visits: [] };
      if (byShop[r.shop_id].visits.length < 3) {
        byShop[r.shop_id].visits.push({ category: r.category, score_percent: r.score_percent });
      }
    });

    const low: ShopTrendRow[] = [];
    const det: ShopTrendRow[] = [];
    const imp: ShopTrendRow[] = [];

    Object.entries(byShop).forEach(([shopId, { shop, visits }]) => {
      // visits were collected newest → oldest; reverse to oldest → newest for trend comparison
      const ordered = [...visits].reverse();
      const oldestRank = CATEGORY_RANK[ordered[0].category] ?? 0;
      const newestRank = CATEGORY_RANK[ordered[ordered.length - 1].category] ?? 0;
      const latestCategory = ordered[ordered.length - 1].category;
      const row: ShopTrendRow = { shopId, shop, visits: ordered, latestCategory };

      if (newestRank < oldestRank) {
        det.push(row);
      } else if (newestRank > oldestRank) {
        imp.push(row);
      } else if (newestRank > 0 && newestRank < 4) {
        low.push(row); // stable at B/C/D — chronic low performer
      }
      // stable at A is excluded entirely — nothing to flag
    });

    det.sort((a, b) => (CATEGORY_RANK[a.latestCategory] ?? 0) - (CATEGORY_RANK[b.latestCategory] ?? 0));
    imp.sort((a, b) => (CATEGORY_RANK[b.latestCategory] ?? 0) - (CATEGORY_RANK[a.latestCategory] ?? 0));
    low.sort((a, b) => (CATEGORY_RANK[a.latestCategory] ?? 0) - (CATEGORY_RANK[b.latestCategory] ?? 0));

    setLowPerformers(low);
    setDeteriorated(det);
    setImproving(imp);
    setVisibleCount({ low: PAGE_SIZE, deteriorated: PAGE_SIZE, improving: PAGE_SIZE });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function renderList(title: string, icon: keyof typeof Ionicons.glyphMap, color: string, data: ShopTrendRow[], bucket: Bucket) {
    const arrowIcon: keyof typeof Ionicons.glyphMap =
      bucket === 'deteriorated' ? 'arrow-down' : bucket === 'improving' ? 'arrow-up' : 'remove';

    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.sectionHeader, { backgroundColor: color + '12', borderColor: color + '30' }]}
          onPress={() => setExpanded(prev => ({ ...prev, [bucket]: !prev[bucket] }))}
          activeOpacity={0.7}
        >
          <Ionicons name={icon} size={20} color={color} />
          <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
          <View style={[styles.countBadge, { backgroundColor: color }]}>
            <Text style={styles.countBadgeText}>{data.length}</Text>
          </View>
          <Ionicons name={expanded[bucket] ? 'chevron-up' : 'chevron-down'} size={18} color={color} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {expanded[bucket] && (
          data.length === 0 ? (
            <Text style={styles.emptyText}>მაღაზია არ მოიძებნა</Text>
          ) : (
            <View style={styles.shopList}>
              {data.slice(0, visibleCount[bucket]).map(row => (
                <TouchableOpacity
                  key={row.shopId}
                  style={styles.shopCard}
                  onPress={() => router.push(`/(admin)/shop/${row.shopId}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.shopCardAccent, { backgroundColor: color }]} />
                  <View style={styles.shopCardBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shopName} numberOfLines={1}>
                        #{row.shop.shop_number} — {row.shop.name}
                      </Text>
                      {row.shop.location ? (
                        <Text style={styles.shopAddress} numberOfLines={1}>
                          <Text style={styles.shopFieldLabel}>მისამართი: </Text>{row.shop.location}
                        </Text>
                      ) : null}
                      <View style={styles.trailRow}>
                        {row.visits.map((v, i) => (
                          <View key={i} style={styles.trailItem}>
                            <Text style={[styles.trailCat, { color: CATEGORY_COLORS[v.category] }]}>{v.category}</Text>
                            {i < row.visits.length - 1 && (
                              <Ionicons name="arrow-forward" size={11} color="#ccc" style={{ marginHorizontal: 3 }} />
                            )}
                          </View>
                        ))}
                        <Ionicons name={arrowIcon} size={13} color={color} style={{ marginLeft: 8 }} />
                      </View>
                    </View>
                    <View style={[styles.catBadge, { backgroundColor: CATEGORY_COLORS[row.latestCategory] }]}>
                      <Text style={styles.catBadgeText}>{row.latestCategory}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </View>
                </TouchableOpacity>
              ))}
              {visibleCount[bucket] < data.length && (
                <TouchableOpacity
                  style={[styles.loadMoreBtn, { borderColor: color + '40' }]}
                  onPress={() => setVisibleCount(prev => ({ ...prev, [bucket]: prev[bucket] + PAGE_SIZE }))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.loadMoreText, { color }]}>
                    მეტის ნახვა ({data.length - visibleCount[bucket]})
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={color} />
                </TouchableOpacity>
              )}
            </View>
          )
        )}
      </View>
    );
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
      <Text style={styles.title}>მაღაზიების ტენდენციები</Text>
      {renderList('სუსტი მაღაზიები', 'trending-down-outline', '#dc2626', lowPerformers, 'low')}
      {renderList('გაუარესებული', 'arrow-down-circle-outline', '#d97706', deteriorated, 'deteriorated')}
      {renderList('გაუმჯობესებული', 'arrow-up-circle-outline', '#16a34a', improving, 'improving')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  title: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  countBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, minWidth: 26, alignItems: 'center' },
  countBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  emptyText: { fontSize: 12, color: '#bbb', paddingVertical: 8, paddingLeft: 4 },

  shopList: { gap: 10 },
  shopCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  shopCardAccent: { width: 5 },
  shopCardBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  shopName: { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  shopAddress: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  shopFieldLabel: { fontWeight: '700', color: '#888' },
  trailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  trailItem: { flexDirection: 'row', alignItems: 'center' },
  trailCat: { fontSize: 13, fontWeight: '800' },
  catBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minWidth: 36, alignItems: 'center' },
  catBadgeText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, marginTop: 2,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },
});
