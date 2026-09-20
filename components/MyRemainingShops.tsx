import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { fetchVisitedShopIdsThisMonth } from '../lib/visitedThisMonth';

interface Shop { id: string; shop_number: string; name: string; location: string | null }

const PAGE_SIZE = 10;

interface Props {
  userId: string | null;
  reloadKey: number;
}

export function MyRemainingShops({ userId, reloadKey }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [chainTotals, setChainTotals] = useState<Record<string, number>>({});
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [chainFilter, setChainFilter] = useState<string | null>(null);

  const chainRemainingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    shops.forEach(s => { counts[s.name] = (counts[s.name] ?? 0) + 1; });
    return counts;
  }, [shops]);
  const chains = useMemo(
    () => Array.from(new Set(shops.map(s => s.name).filter(Boolean))).sort(),
    [shops]
  );
  const filteredShops = useMemo(
    () => chainFilter ? shops.filter(s => s.name === chainFilter) : shops,
    [shops, chainFilter]
  );

  const load = useCallback(async () => {
    if (!userId) { setShops([]); setChainTotals({}); setTotalAssigned(0); setLoading(false); return; }
    setLoading(true);

    const [assignedRes, visitedIds] = await Promise.all([
      supabase
        .from('shop_checkers')
        .select('shop_id, shops(id, shop_number, name, location)')
        .eq('checker_id', userId),
      fetchVisitedShopIdsThisMonth(),
    ]);

    const assignedShops = ((assignedRes.data ?? []) as any[])
      .map(r => r.shops)
      .filter(Boolean) as Shop[];

    const remaining = assignedShops.filter(s => !visitedIds.has(s.id));
    remaining.sort((a, b) => a.shop_number.localeCompare(b.shop_number, undefined, { numeric: true }));

    const totals: Record<string, number> = {};
    assignedShops.forEach(s => { totals[s.name] = (totals[s.name] ?? 0) + 1; });

    setShops(remaining);
    setChainTotals(totals);
    setTotalAssigned(assignedShops.length);
    setVisibleCount(PAGE_SIZE);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [chainFilter]);

  function handlePressShop(shop: Shop) {
    router.push({
      pathname: '/(checker)/new-visit',
      params: {
        shopId: shop.id,
        shopNumber: shop.shop_number,
        shopName: shop.name,
        shopLocation: shop.location ?? '',
      },
    });
  }

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  // No assignments at all yet — nothing useful to show.
  if (totalAssigned === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <Ionicons name="storefront-outline" size={20} color="#2563eb" />
        <Text style={styles.sectionTitle}>შენ დარჩენილი მაღაზიები</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {filteredShops.length}{chainFilter ? `/${shops.length}` : ''}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#71717a" style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {expanded && chains.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
                {chain} — {chainRemainingCounts[chain] ?? 0}/{chainTotals[chain] ?? 0}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {expanded && (
        filteredShops.length === 0 ? (
          <Text style={styles.emptyText}>
            {chainFilter ? 'ამ ქსელის ყველა თქვენი მაღაზია მონახულებულია ამ თვეს' : 'ამ თვეს ყველა თქვენი მაღაზია მონახულებულია'}
          </Text>
        ) : (
          <View style={styles.shopList}>
            {filteredShops.slice(0, visibleCount).map(shop => (
              <TouchableOpacity
                key={shop.id}
                style={styles.shopCard}
                onPress={() => handlePressShop(shop)}
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
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#2563eb12', borderColor: '#2563eb30',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1d4ed8' },
  countBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, minWidth: 26, alignItems: 'center', backgroundColor: '#2563eb' },
  countBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  emptyText: { fontSize: 12, color: '#bbb', paddingVertical: 12, paddingLeft: 4 },

  chainScroll: { marginTop: 10, width: '100%' },
  chainScrollContent: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  chainPill: {
    flexShrink: 0,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  chainPillActive: { backgroundColor: '#2563eb18', borderColor: '#2563eb' },
  chainPillText: { fontSize: 12, fontWeight: '600', color: '#888' },
  chainPillTextActive: { color: '#1d4ed8' },

  shopList: { gap: 10, marginTop: 10 },
  shopCard: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#eee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  shopCardAccent: { width: 5, backgroundColor: '#2563eb' },
  shopCardBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  shopName: { fontSize: 15, fontWeight: '800', color: '#1a1a2e' },
  shopAddress: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  shopFieldLabel: { fontWeight: '700', color: '#888' },

  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#2563eb40', marginTop: 2,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },
});
