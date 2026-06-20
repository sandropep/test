import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const ROW_HEIGHT = 64;

export interface Shop {
  id: string;
  shop_number: string;
  name: string;
  location: string | null;
}

interface Props {
  selectedShop: Shop | null;
  onSelect: (shop: Shop) => void;
  onClear: () => void;
  readOnly?: boolean;
}

export function ShopSelector({ selectedShop, onSelect, onClear, readOnly = false }: Props) {
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [chainFilter, setChainFilter] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('shops')
      .select('id, shop_number, name, location')
      .order('name')
      .then(({ data }) => {
        setAllShops(data ?? []);
        setLoading(false);
      });
  }, []);

  const chains = useMemo(
    () => Array.from(new Set(allShops.map(s => s.name).filter(Boolean))).sort(),
    [allShops]
  );

  const filtered = useMemo(() => {
    let list = allShops;
    if (chainFilter) list = list.filter(s => s.name === chainFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(s =>
      s.shop_number.toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q)
    );
    return list;
  }, [allShops, chainFilter, query]);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
    []
  );

  const renderRow = useCallback(({ item }: { item: Shop }) => {
    const isSelected = selectedShop?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          {item.location
            ? <Text style={styles.rowAddress} numberOfLines={1}>{item.location}</Text>
            : null}
        </View>
        <View style={styles.idBadge}>
          <Text style={styles.idBadgeText}>#{item.shop_number}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [selectedShop, onSelect]);

  // ── Selected state ──
  if (selectedShop) {
    return (
      <View>
        <TouchableOpacity
          style={styles.selectedCard}
          onPress={readOnly ? undefined : onClear}
          activeOpacity={readOnly ? 1 : 0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedName}>{selectedShop.name}</Text>
            {selectedShop.location
              ? <Text style={styles.selectedAddress} numberOfLines={1}>{selectedShop.location}</Text>
              : null}
          </View>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>#{selectedShop.shop_number}</Text>
          </View>
          {!readOnly && <Text style={styles.changeBtn}>შეცვლა</Text>}
        </TouchableOpacity>
        {!readOnly && (
          <View style={styles.confirmLine}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.confirmText}>
              {selectedShop.name} · {selectedShop.location ?? ''} · #{selectedShop.shop_number}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Picker state ──
  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={15} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ID ან მისამართი..."
          placeholderTextColor="#aaa"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Chain filter pills */}
      {loading ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContent}
          keyboardShouldPersistTaps="always"
        >
          <TouchableOpacity
            style={[styles.pill, !chainFilter && styles.pillActive]}
            onPress={() => setChainFilter(null)}
          >
            <Text style={[styles.pillText, !chainFilter && styles.pillTextActive]}>ყველა</Text>
          </TouchableOpacity>
          {chains.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.pill, chainFilter === c && styles.pillActive]}
              onPress={() => setChainFilter(prev => prev === c ? null : c)}
            >
              <Text style={[styles.pillText, chainFilter === c && styles.pillTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Results */}
      {loading ? (
        <ActivityIndicator color="#2563eb" style={{ marginVertical: 32 }} />
      ) : (
        <View style={styles.listWrapper}>
          <Text style={styles.resultCount}>{filtered.length} მაღაზია</Text>
          <FlatList
            data={filtered}
            keyExtractor={s => s.id}
            renderItem={renderRow}
            getItemLayout={getItemLayout}
            style={styles.list}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            windowSize={7}
            maxToRenderPerBatch={20}
            initialNumToRender={15}
            removeClippedSubviews
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>მაღაზია ვერ მოიძებნა</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5, borderColor: '#e0e0e0',
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a2e' },

  pillsScroll: { marginBottom: 8 },
  pillsContent: { gap: 6, paddingRight: 4 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f2f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  pillActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#888' },
  pillTextActive: { color: '#2563eb' },

  listWrapper: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0' },
  resultCount: {
    fontSize: 10, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#fafafa', borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  list: { height: ROW_HEIGHT * 5, backgroundColor: '#fff' },

  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
    gap: 10,
  },
  rowSelected: { backgroundColor: '#eff6ff' },
  rowName: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 2 },
  rowAddress: { fontSize: 12, color: '#aaa' },

  idBadge: {
    backgroundColor: '#f0f2f5', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  idBadgeText: { fontSize: 11, fontWeight: '700', color: '#555', fontVariant: ['tabular-nums'] },

  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 14 },

  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#2563eb',
  },
  selectedName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  selectedAddress: { fontSize: 12, color: '#888', marginTop: 2 },
  changeBtn: { fontSize: 13, fontWeight: '600', color: '#2563eb' },

  confirmLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, paddingHorizontal: 2,
  },
  confirmText: { fontSize: 11, color: '#16a34a', flex: 1 },
});
